# Architecture

How VESTIBULAR GPS is put together, and why each decision was made.

## Shape of the project

A zero-build, native-ES-module browser application. No bundler, no
`node_modules`, no transpile step. `index.html` loads `src/main.js` as a module
and everything else follows from there.

That choice is deliberate. The site must run on a hackathon network, from a USB
stick, and offline on a tablet. A build step adds a failure mode that buys
nothing here.

```
index.html              single page, every section
serve.py                dev server that sends Cache-Control: no-store
vendor/                 three.js r169 + GLTFLoader + DRACOLoader + Draco decoder
assets/models/          the two real 3D assets (NASA suit, NIH brain)
src/
  styles/               tokens · base · components · sections · console
  core/                 util.js · store.js · osi.js
  sensors/              providers.js · webcam.js
  science/              content.js (structures, timelines, source registry)
  three/                materials · environment · planetTextures
                        SpaceEnvironment · SolarSystem · Astronaut
                        InnerEar · BrainModel · ModelLibrary
                        surfaceDetail · SceneManager
  ui/                   chrome · panels · labs · console · integration
  main.js               boot sequence and wiring
tests/                  osi.test.mjs — the engine validation harness
tools/                  PowerShell: fetch assets, check syntax, run tests, deploy
docs/                   this file and its siblings
```

## Layers

```
                 ┌──────────────────────────────────────────┐
   ui/           │ chrome  panels  labs  console integration│
                 └───────────────┬──────────────────────────┘
                                 │ reads state, never owns it
                 ┌───────────────▼──────────────────────────┐
   core/         │ store.js  (single source of truth)       │
                 │ osi.js    (the metric engine)            │
                 └───────────────┬──────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
   sensors/                 three/                   science/
   providers + webcam       WebGL scenes             content + sources
```

**The rule that keeps this honest:** nothing outside `core/store.js` holds
application state, and nothing anywhere renders a value that did not come from
the store or from a computation over it. There are no decorative moving numbers
in this project.

## The store

`src/core/store.js` exports a tiny pub/sub store plus environment detection:

- `state` — the live application state object
- `set(patch, changedKeys)` — merge and notify
- `subscribe(fn)` / `bus.on(event, fn)` — the two notification paths
- `detectQuality()` / `QUALITY_PRESETS` — GPU, core count, memory and viewport
  are read once and mapped to `ULTRA | HIGH | MEDIUM | LOW | MOBILE`
- `toast()` / `showError()` — the only user-facing error surface

The frame loop lives in `main.js` and emits a `frame` event. Modules that need
per-frame work subscribe to it rather than starting their own `requestAnimationFrame`,
so there is exactly one loop for the whole application.

## The 3D layer

`SceneManager` owns one background WebGL scene. `MiniStage` provides the inline
viewports used by the ear, brain and measurement-subject sections.

Three rules are enforced throughout:

1. **Every subsystem is isolated per frame.** If one layer throws, it is logged
   once and disabled after three faults; the rest of the scene keeps rendering.
   A partial universe beats a black screen.
2. **Layers are shown or hidden per section.** Text-heavy sections hide the
   planets and figures, so nothing can drift behind a paragraph.
3. **Nothing is loaded from a CDN.** three.js, the loaders, the Draco decoder
   and both models are vendored. The only network access is the page load.

### Lighting

`src/three/environment.js` generates an equirectangular studio environment in
code — a dark base with a cool key softbox, a cyan rim and a warm bounce — then
PMREM-filters it into a `scene.environment`.

This is not decoration. Without an environment map, `MeshStandardMaterial` and
`MeshPhysicalMaterial` have nothing to reflect, so metal, glass and tissue all
collapse to a single flat diffuse tone. That was the actual cause of the
"these look like cartoons" problem, before the materials themselves were
addressed.

### Materials and surface detail

The NASA suit GLB contains **zero textures** — no albedo detail, no normals, no
roughness maps. One perfectly smooth uniform colour per panel is the loudest
"this is computer-generated" cue there is.

`src/three/surfaceDetail.js` generates the missing structure procedurally:
tileable woven-fabric, brushed-metal and pebbled-rubber normal + roughness map
sets, cached and shared. `ModelLibrary.dressMaterials()` assigns them by
material name (`blinn3SG` is the orange suit body, `aceshelme.008` the visor,
`shoe_lamb.004` the boot sole) while leaving every authored albedo and the
helmet's `transmission`/`ior` glass intact.

## Sensors

`src/sensors/providers.js` defines one interface and five implementations:

```
SensorProvider (abstract)
├── DeviceOrientationProvider   hardware, needs permission
├── DeviceMotionProvider        hardware, needs permission
├── GeolocationProvider         separate optional layer
├── SimulationProvider          always available
└── ReplayProvider              recorded sessions
```

`SensorHub` owns which provider is active. `webcam.js` adds a sixth, the
`CameraProvider`, registered onto the hub at runtime by `main.js` — importing it
from `providers.js` would make the dependency circular, since it needs
`SensorProvider` from that same module.

### Graceful degradation

`store.js` runs a watchdog. If no sample arrives for 1.5 s the source is marked
**STALE** and the app drops back to simulation, rather than freezing on the last
value. Every screen states which source is active.

## The OSI engine

`src/core/osi.js` is the product. It is pure, deterministic and independently
testable — it imports nothing from the DOM, three.js or the UI.

Pipeline:

```
session values + baseline
   → robust z-score per domain   (median / MAD, with a documented floor)
   → sub-score 100·exp(−|z|/4.48)
   → weights renormalised over the domains actually available
   → OSI
   → bootstrap 95% interval over the baseline window
   → MDC95 = 1.96·√2·SEM
   → advisory + crew authority + comm-delay rule
   → ranked countermeasures
   → recheck verdict against the noise floor
   → JSON contract
```

Two failure modes are handled explicitly, because both were shipped bugs first:

- **Zero-dispersion baseline.** If every session is identical, MAD and SD are
  both zero. Returning `null` there made the index refuse to compute, which
  meant the *more stable* a crew member was, the *less* measurable they became.
  Each domain now declares a `floor` and the scale is `max(MAD, SD, floor)`.
- **Missing channels.** Stored as `null`, never as `0`. A fabricated zero in the
  reference would be judged against for the whole mission.

## Error handling

Three independent layers:

1. `installErrorBoundary()` catches uncaught errors and unhandled rejections and
   turns them into a toast.
2. A **classic (non-module) script** in `index.html` dismisses the boot curtain
   if the module graph never executes. This cannot live in `main.js`, because
   `main.js` is the module that would have failed.
3. `armBootFailsafe()` covers the case where modules load but startup stalls.

## Testing

`tests/osi.test.mjs` is the validation harness — 87 assertions covering the
statistics, the direction handling per domain, the interval behaviour, the
degradation paths, the advisory language rules and the output contract.

```bash
node tests/osi.test.mjs          # writes tests/osi.test.result.txt
# or
powershell -File tools/run-tests.ps1
```

`tools/check-syntax.ps1` parses every module and verifies both GLB assets.
`tools/check-serving.ps1` confirms every file a running server must deliver.
