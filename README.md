# VESTIBULAR GPS — AI Handoff README

> **এই README-টি পরের AI/Agent-এর জন্য canonical project handoff document।** নতুন কাজ শুরু করার আগে এটি, `docs/ARCHITECTURE.md`, `docs/SENSOR_API.md`, `docs/SOURCES.md`, `docs/TESTING.md`, এবং root-level `PLAN-A-Full-Roadmap-BN.md` পড়বে। অনুমান করে কোনো feature, sensor বা NASA claim যোগ করবে না।

**Last verified:** 28 September 2026, Asia/Dhaka  
**Code baseline verified before this README update:** `4cc0120`  
**Live site:** <https://sabbirx01.github.io/vestibular-gps/>  
**Repository:** <https://github.com/Sabbirx01/vestibular-gps>  
**Project folder:** `F:\Nasa Project\VESTIBULAR GPS Webpage\`

---

## 1. Project identity

- **Name:** VESTIBULAR GPS
- **Tagline:** Navigate the space between motion, balance and the brain.
- **Team:** MindStellar (check the official Space Apps team page for the exact registered spelling before submission; older planning files contain a spelling mismatch).
- **Challenge:** NASA Space Apps — “Create Health Monitoring Software for Astronauts on Space Missions.”
- **Product type:** Offline-first, browser-based educational visualization and health-monitoring software prototype for astronaut sensorimotor readiness.
- **Core product:** **Mission Console, section 09 (`#sec-console`)**, powered by the OSI v2.0 metric engine.
- **Important disclaimer:** This is not a medical device, clinical instrument, diagnostic system, or NASA-affiliated/endorsed product. OSI is a **proposed prototype metric**, not a NASA metric. Its domain structure is mapped to NASA's published sensorimotor risk framework; its weights are expert-informed heuristics, not NASA's numbers.

### Product thesis

Long-duration missions and gravity transitions can affect vestibular/sensorimotor function, postural control, gaze stability, motion symptoms, and task performance. VESTIBULAR GPS gathers available health indicators, compares them with the astronaut's own personal baseline, explains uncertainty, gives a readiness advisory, and suggests a recheck/countermeasure path. It is designed for on-device operation, limited connectivity, graceful sensor degradation, and crew authority during communication delay.

Do not describe the product as a validated clinical monitor. Describe it as a **transparent, proposed, offline prototype** that demonstrates how NASA-relevant measurements could become an astronaut-facing decision loop.

---

## 2. Current verified status

### Verified and working

- Static site loads from GitHub Pages: HTTP 200.
- Local server returns HTTP 200: `python serve.py` → `http://127.0.0.1:8322`.
- No npm, bundler, backend, API key, CDN, or build step is required.
- 23 application JavaScript modules pass `node --check`.
- OSI test harness: **93 passed, 0 failed**.
- `serve.py` compiles successfully.
- NASA ACES suit GLB is committed and loaded through the local GLTF/Draco path.
- NIH brain GLB is committed and loaded through the local GLTF/Draco path.
- Camera permission path requests a high-resolution user-facing preview (ideal 1280×720, minimum 640×360, up to 30 fps), while analysis remains deliberately low-resolution (64×48 at about 18 Hz).
- Camera stream is reattached after Integration panel rerenders.
- Camera telemetry is stored in `state.camera`; Integration displays live head-motion, signal quality, motion energy and jitter.
- Camera does **not** measure gaze and therefore does **not** produce VOR gain. The UI must say `UNAVAILABLE — CAMERA HAS NO EYE LANDMARKS`; do not invent eye/VOR values.
- The Mission Console can score the reaction-time `task_perf` domain after the lab API fix (`getReactionMs`).
- `serve.py` blocks directory listings, dotfiles/underscore scratch paths, and `tests/` when exposed on a LAN; it adds `no-store` and `nosniff` headers.

### Current visual behavior

- Hero astronaut uses the real NASA ACES suit asset, with procedural material detail and suit decoration.
- Hero astronaut is intentionally larger and positioned in the right side of the hero.
- The astronaut should initially face the viewer, ease into view, then float subtly. Autonomous spin is intended only for **MICROGRAVITY** mode; Earth/Moon/Mars should preserve a viewer-facing entrance pose. Mouse/pointer steering remains available.
- Earth/Moon/Mars are **distant background reference bodies**, not foreground globes. Do not move them in front of or underneath the astronaut without explicit user instruction.
- The site is a single-page experience by design. Navigation changes camera framing/layers without a visible page redirect, so animation continuity is preserved.
- Brain/ear/VOR/planet visuals are explanatory illustrations/3D assets, not physiological measurements.

### Not fully verified / must not be overclaimed

- Camera motion values are an estimator output, not clinically calibrated head displacement.
- No eye landmarks, gaze tracking, or true VOR gain in the current camera provider.
- No physical force plate, chest/head IMU, vHIT goggles, Web Bluetooth bridge, or lab instrument has been tested.
- No clinical or physiological validation of OSI exists.
- Chrome is the primary browser verification target; Firefox/Safari are not fully verified.
- Physical mobile sensor behavior is not fully verified; mobile layout is the tested target.
- WebSocket bridge is documented as a contract/transport path but not implemented.
- `eye_head` requires vHIT/eye-landmark data for a real measurement; do not fill it from head-motion proxy.
- The current `SAMPLE_PAYLOAD` contains example/manual-ingest values. It is a contract fixture, not live astronaut data; label it as example when discussing it.
- The current test result file contains an older timestamp but still records `93 passed / 0 failed`; running tests rewrites only the timestamp line.

---

## 3. Exact user-facing sections

The actual `index.html` has 12 sections:

| # | DOM id | Journey label | Purpose |
|---:|---|---|---|
| Intro | `#intro` | entry | Intro overlay and experience start |
| 01 | `#sec-hero` | SPACE | Hero scene, astronaut, HUD, key science cards |
| 02 | `#sec-body` | BODY | Vision/vestibular/proprioceptive inputs, subject canvas, sensory weighting |
| 03 | `#sec-ear` | EAR | Inner-ear anatomy: canals, otolith organs, nerve, gravity response |
| 04 | `#sec-brain` | BRAIN | NIH brain asset, vestibular pathway, brainstem/cerebellum/thalamus/cortex |
| 05 | `#sec-vor` | VOR | Educational VOR diagnostic canvas; current camera cannot measure gaze/VOR |
| 06 | `#sec-sensors` | SENSOR | Device sensors, simulator, replay, charts, recorder/export |
| 07 | `#sec-space` | MICROGRAVITY | Earth/Moon/Mars/microgravity model, otolith visualization, adaptation timeline |
| 08 | `#sec-lab` | LAB | Six interactive demonstrations and reaction-time task |
| 09 | `#sec-console` | CONSOLE | OSI, domains, baseline, CI, advisory, authority, countermeasures, recheck, JSON |
| 10 | `#sec-integration` | INTEGRATION | A-to-Z flow, provider statuses, camera pipeline, instruments, ingest contract |
| 11 | `#sec-research` | RESEARCH | Source registry, NASA/NIH attribution, conceptual labels |
| 12 | `#sec-final` | FINAL | Closing message and disclaimer |

Older README/docs said 10 sections and omitted Console/Integration; that was stale. Use this table.

---

## 4. Runtime architecture

```text
index.html (type=module)
        |
        v
src/main.js — boot, one requestAnimationFrame loop, wiring
        |
        +--> src/core/store.js — single source of truth, Bus, signal processing
        |       +--> state.sample / attitude / link / camera / source / mode
        |       +--> bus events and watchdog
        |
        +--> src/core/osi.js — pure deterministic OSI v2.0 engine
        |
        +--> src/sensors/providers.js — DeviceOrientation, DeviceMotion,
        |                                 Geolocation, Simulation, Replay, Hub
        +--> src/sensors/webcam.js — CameraProvider, local head-motion estimator
        |
        +--> src/three/SceneManager.js — one background WebGL scene,
        |                                  section framing, quality, MiniStage
        |       +--> Astronaut / SolarSystem / SpaceEnvironment
        |       +--> InnerEar / BrainModel / ModelLibrary / materials
        |
        +--> src/ui/chrome.js — intro, cursor, nav, HUD, reveal, debug, quality
        +--> src/ui/panels.js — body, sensors, space, charts
        +--> src/ui/labs.js — subject, ear, brain, VOR, lab, research
        +--> src/ui/console.js — Mission Console and OSI UI
        +--> src/ui/integration.js — camera, hardware mapping, ingest UI
        +--> src/science/content.js — source-keyed scientific content
```

### Non-negotiable architecture rules

1. `src/core/store.js` owns application state. UI and 3D modules read it; they should not create competing state stores.
2. `main.js` owns the single master frame loop. Do not add another global RAF loop.
3. Generated/simulated values must be labelled `SIMULATION` or `MODEL`; never present them as live astronaut measurements.
4. Camera raw frames stay on-device and are never uploaded.
5. Every sensor permission requires explicit user action.
6. Keep graceful degradation: if a sensor is stale or absent, the app should state the limitation and continue with available channels/simulation.
7. Do not add a CDN dependency casually; offline operation is a core project claim.

---

## 5. State, events, and data sources

### Important state fields

```js
state.mode       // EARTH | MOON | MARS | MICROGRAVITY
state.source     // SIMULATION | LIVE_SENSOR | REPLAY
state.quality    // ULTRA | HIGH | MEDIUM | LOW | MOBILE
state.perms      // orientation/motion/geo permission status
state.raw        // device raw orientation/motion values
state.sample     // smoothed yaw/pitch/roll/rates/jerk/accel/sway
state.attitude   // integrated/observed attitude
state.link       // rate, samples, stale flag
state.camera     // camera running/calibrated/headMotion/energy/jitter/dx/dy/quality
state.recorder   // recorded samples and replay state
state.engine     // WebGL readiness and telemetry
state.lab        // active lab and results
```

### Bus events used by the application

`frame`, `sample`, `camera-sample`, `provider-status`, `source-changed`, `source-request`, `sensor`, `mode`, `quality`, `script-done`, `replay-done`, `toast`, `section`, `geo`, `clock`, `error-ui`, `stage-pick`.

### Source truth

| Source | What it means |
|---|---|
| `SIMULATION` | Deterministic generated sensor stream; useful for demo/reproducible testing; never call it live data |
| `LIVE_SENSOR` | Browser DeviceOrientation/DeviceMotion source after permission and actual samples |
| `REPLAY` | Previously recorded on-device session |
| `camera` | Separate CameraProvider stream; currently head-motion only, not gaze |
| `ingest` | JSON contract input from a real bridge/file/manual payload; must preserve channel provenance |

### Camera pipeline truth

- User-facing video requests ideal 1280×720, minimum 640×360, max 30 fps.
- Estimator uses a hidden 64×48 buffer, approximately 18 Hz.
- It computes global frame displacement (`dx`, `dy`), motion energy, residual jitter, centroid drift, calibration noise floor, rate and quality.
- It measures **head motion only**.
- It cannot calculate eye-head coordination or VOR gain without eye landmarks.
- Calibration holds still for about 2.2 seconds and subtracts the device's p95 noise floor.
- If camera is stopped/denied/stale, the UI must show that state; it must not convert absence into a fake zero or fake healthy value.

---

## 6. OSI v2.0 metric

`src/core/osi.js` is pure and import-free. It exports the domain model and metric functions used by the Mission Console.

### Six domains

| Domain id | Meaning | Unit | Weight | Current real source status |
|---|---|---:|---:|---|
| `eye_head` | Eye–head coordination | ° | 0.25 | Requires eye landmarks/vHIT; current camera must leave unavailable |
| `body_control` | Postural control/sway | mm | 0.25 | Ingest/IMU/force plate contract; not physical-tested |
| `task_perf` | Timed task performance | ms | 0.20 | Lab reaction-time task works |
| `symptoms` | Motion symptoms self-report | /10 | 0.15 | In-app/manual path |
| `head_motion` | Head movement | °/s | 0.10 | IMU contract or camera head-motion proxy, with provenance |
| `drift` | Baseline drift | /day | 0.05 | Derived from sessions |

### Formula

```text
baseline: last 7 sessions (or fewer if explicitly provisional)
m_d      = median(values)
s_d      = robust MAD/SD/floor scale
z_d      = direction-aware deviation from personal baseline
score_d  = 100 * exp(-abs(z_d) / 4.48)
OSI      = weighted sum over available domains, weights renormalised
CI95     = seeded baseline bootstrap percentile interval
MDC95    = 1.96 * sqrt(2) * SEM
```

- `100` means “at this subject's own baseline,” not “healthy.”
- The weights are not NASA's weights.
- A missing channel is `null`, not zero.
- Low coverage should widen uncertainty and lower confidence.
- The UI must never turn a missing `eye_head` camera channel into a fabricated gaze value.
- Advisory language uses Clear/Mitigate/Escalate and crew authority; never use `NOT READY` or imply clinical clearance.

### Tests

Current local test command:

```powershell
$node = "C:\Users\Sabbir Molla\AppData\Roaming\Accio\pre-install\bd5ff2c6816a\node\node.exe"
& $node tests/osi.test.mjs
```

Expected current result: **93 passed, 0 failed**. If Node is already on PATH, `node tests/osi.test.mjs` is enough. `tests/osi.test.result.txt` is a generated result file; only its timestamp changes when tests run.

---

## 7. Assets and realism

| Asset | File | Size | Purpose | Licence/attribution |
|---|---|---:|---|---|
| NASA ACES suit | `assets/models/nasa-aces-suit.glb` | 858,408 bytes | Hero and measurement astronaut | NASA public-domain usage basis; follow NASA media guidelines |
| NIH brain | `assets/models/nih-brain.glb` | 13,161,040 bytes | Brain section anatomical model | NIH 3D, CC-BY 4.0; attribution must remain visible |
| Three.js | `vendor/three.module.js` | vendored | WebGL engine | MIT; retain licence header |
| Draco | `vendor/draco/` | vendored | GLB decoding | Keep decoder files and correct WASM MIME on hosts |

Suit realism comes from `ModelLibrary.js`, `materials.js`, and `surfaceDetail.js`: generated woven fabric, brushed metal, rubber detail, visor/helmet decoration, environment lighting, and NASA suit geometry. Do not add floating geometry near the helmet or body unless it is deliberately attached and visually verified. The previous mistake was an extra greeting rig that appeared as a cylinder above the helmet; it was removed.

---

## 8. Development and deployment

### Local development

```powershell
cd "F:\Nasa Project\VESTIBULAR GPS Webpage"
python serve.py                 # http://127.0.0.1:8322
```

Use `serve.py`, not `file://`, because GLB fetches need a server and browser modules are vulnerable to stale caching. Use `Ctrl+F5`/`Ctrl+Shift+R` after updates.

### Validation before any change is reported complete

```powershell
$node = "C:\Users\Sabbir Molla\AppData\Roaming\Accio\pre-install\bd5ff2c6816a\node\node.exe"
Get-ChildItem src -Recurse -Filter *.js | ForEach-Object { & $node --check $_.FullName }
& $node tests/osi.test.mjs
python -m py_compile serve.py
powershell -ExecutionPolicy Bypass -File tools/check-live.ps1 -Base "https://sabbirx01.github.io/vestibular-gps/"
```

### GitHub Pages deployment

The repository is public and deployed from `main` root. The bundled deployment script handles credential verification, commit/push, Pages build polling and live checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\deploy-github-pages.ps1
```

Never put GitHub tokens, passwords, or credentials in README, source files, diary, or commit messages. After deploy verify:

1. `git log -1 --oneline`
2. GitHub Pages build state is `built`
3. live URL returns HTTP 200
4. critical JS/GLB/WASM paths return 200
5. hard-refresh the live page
6. if possible, perform a browser pass on hero, camera, Console, mobile layout and console errors

### Security/privacy

- No backend, API key, analytics, or cloud upload.
- Camera frames are local only.
- `serve.py` defaults to loopback and blocks sensitive paths when LAN-bound.
- Camera/sensors require HTTPS or localhost; plain HTTP LAN origins are normally blocked by browsers.
- Do not expose `.git`, tests, scratch files, or credentials through a development server.

---

## 9. Known issues and next update priorities

### P0 — do before judging/demo

1. **Perform a fresh browser visual pass on the current public commit.** Code checks do not prove that the astronaut is correctly framed on every viewport.
2. **Confirm hero composition:** astronaut large/right, viewer-facing on entry; Earth small and distant behind; no overlap with copy/cards; mobile still shows astronaut.
3. **Confirm the CameraProvider end-to-end after latest edits:** video is attached, analysis runs, live rows change, camera does not create a fake eye/VOR output.
4. **Confirm Mission Console semantics:** camera-only sessions should not claim all six domains; `eye_head` must remain unavailable without eye landmarks.
5. **Update stale sibling docs** (`docs/ARCHITECTURE.md`, `docs/TESTING.md`, root plans) where they still say 87 assertions, 10 sections, no GLB assets, or only procedural models. This README is the current source of truth.
6. **Run the actual 2026 Space Apps rule/resource recheck on the official challenge page** before submission. Do not rely on old 2025 guidance for demo length, judging criteria, or pre-hackathon work rules.

### P1 — high-value product work

1. Add a real eye-landmark provider if true VOR/eye-head measurement is required. Keep it offline or bundle the model; do not silently add a CDN.
2. Add a real WebSocket bridge only when a concrete instrument protocol is available. Until then keep the ingest contract documented and label it `contract documented`.
3. Add labeled validation cases/confusion matrix if claiming scientific/operational validity.
4. Make camera motion feed an explicitly named `head_motion` domain with calibration/provenance; do not map it into `eye_head`.
5. Add a compact live-source banner in Console: `LIVE CAMERA · HEAD MOTION ONLY`, `LIVE IMU`, `SIMULATION`, or `REPLAY`.
6. Test physical mobile sensors and at least one non-Chrome browser.

### P2 — polish/performance

1. Consider lazy-loading or decimating the 13 MB brain mesh for slow connections.
2. Add camera preview fallback messaging for no camera/permission denial.
3. Reduce hero/mobile WebGL load without hiding the astronaut or planet reference.
4. Keep the real suit's body animation restrained unless a genuine skeletal/animation asset is sourced; do not add floating fake anatomy.
5. Keep NASA/NIH attribution and conceptual/model labels visible.

---

## 10. Recommended next-agent workflow

When the user asks for another update:

1. Read this README and the relevant source/docs first.
2. Check `git status`, current commit, and whether local/live site match.
3. Identify the exact user-visible problem and reproduce it before editing.
4. Read the current file before every edit. If an edit fails with `old_string_not_found`, stop retrying blindly: reread the file and use the exact current text; after two failures switch to a safe write strategy.
5. Make the smallest targeted change. Do not redesign unrelated sections.
6. Run JS syntax checks, `93/93` OSI tests, `py_compile`, and relevant local server checks.
7. Perform browser verification for visual/interactive changes. If browser control is unavailable, state that limitation instead of claiming visual verification.
8. Check for fake/static values. Every live value needs source/provenance; unavailable measurements must say unavailable.
9. Deploy only after validation. Verify commit, Pages build, live HTTP and critical assets.
10. Update this README only when architecture, status, limitations, deployment, or next priorities materially change.

---

## 11. File map

```text
F:\Nasa Project\
├── PLAN-A-Full-Roadmap-BN.md                 master Bengali roadmap
├── PLAN-B-Team-Summary-BN.md                team-friendly plan
├── NASA-JUDGE-BRIEF-EN.md                   judge-facing draft and honesty gaps
├── PLAYBOOK-FOR-TEAM-BN.md                  team script/real-vs-sim explanation
├── research/                                 NASA evidence, prior art, competition notes
└── VESTIBULAR GPS Webpage/
    ├── README.md                             this canonical handoff
    ├── index.html                            12-section single page
    ├── serve.py                              no-store local server
    ├── assets/models/                        NASA suit + NIH brain GLBs
    ├── src/core/osi.js                       OSI metric engine
    ├── src/core/store.js                     state, bus, sensor processing
    ├── src/sensors/webcam.js                 local head-motion camera provider
    ├── src/sensors/providers.js              IMU/orientation/simulation/replay
    ├── src/three/SceneManager.js             background WebGL and MiniStage
    ├── src/three/Astronaut.js                real suit + fallback + motion
    ├── src/three/ModelLibrary.js             GLB loading/material dressing
    ├── src/three/InnerEar.js                 ear anatomy model
    ├── src/three/BrainModel.js               brain/pathway model
    ├── src/three/SolarSystem.js              Earth/Moon/Mars model
    ├── src/ui/console.js                     Mission Console / OSI UI
    ├── src/ui/integration.js                 hardware/camera/ingest UI
    ├── src/ui/panels.js                      body/sensors/space UI
    ├── src/ui/labs.js                        ear/brain/VOR/lab UI
    ├── tests/osi.test.mjs                    93 assertion engine harness
    ├── tools/deploy-github-pages.ps1         public deployment
    ├── tools/check-live.ps1                 live asset/status check
    └── docs/                                 architecture, sensor, science, test, deploy docs
```

## Bottom line

VESTIBULAR GPS is a strong offline-first science visualization and proposed readiness-monitoring prototype. The core engine is tested and the site is live. The main remaining work is not random visual expansion: it is honest real-sensor integration, eye-landmark/VOR support if required, labeled validation data, browser/mobile verification, stale-doc cleanup, and a clear submission package.
