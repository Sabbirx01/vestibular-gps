# Testing

What is actually verified, how, and what is not.

The distinction matters. This project shipped several defects that looked fine
on screen, so "it renders" is not treated as evidence anywhere below.

---

## 1. Engine validation — 93 assertions

```bash
node tests/osi.test.mjs
# or
powershell -ExecutionPolicy Bypass -File tools/run-tests.ps1
```

Writes `tests/osi.test.result.txt` and exits non-zero on failure.

The harness tests the metric against constructed cases whose answers are known,
rather than against a screenshot. Coverage:

| Area | What is asserted |
|---|---|
| Domain model | weights sum to 1.0; six domains; every domain maps to a DAG node |
| Baseline robustness | median/MAD ignore a gross outlier (a 400° artifact does not move the reference) |
| **Zero-dispersion baseline** | a perfectly flat baseline still yields a number, gives z = 0 for an identical value, and registers a real deviation through the floor |
| **Bootstrap interval** | survives a flat baseline; is zero-width when nothing varies; brackets the point estimate |
| **Provisional rule** | n=1 produces a reading, is flagged provisional with a reason, and can never claim normal confidence; n=7 is not provisional |
| **Null channels** | a channel stored as `null` is excluded rather than treated as zero; coverage falls; the rest still index |
| Direction handling | a *lower* eye–head value scores as worse; a *higher* sway value scores as worse |
| Sub-score curve | z=0→100, z=1→80, z=2→64, symmetric |
| Degradation | dropping domains widens uncertainty, downgrades confidence, and never silently shrinks the index toward zero; no usable domains gives an explicit failure, not a fake 0 |
| Weight sensitivity | present, stable at baseline, spread reported |
| No-overclaim | a 3-point move does **not** clear a 9-point MDC and is labelled noise; a 17-point move is labelled improvement |
| Advisory | level thresholds; language never says "NOT READY" or "grounded"; authority escalates to flight surgeon rather than grounding |
| Comm delay | 1 min → concurrence can arrive; 22 min → standing authority applies, with the rule stated |
| Countermeasures | deterministic ranking, sorted by relevance, targeted at the deficient domains |
| Trajectory | generated; deficit larger post-transition; NASA τ declared for every domain |
| Contract | has `osi` with value/CI/MDC, a `domains` array, a `data_quality` block, an explicit disclaimer, and serialises cleanly |

### Defects these tests caught

Both were real, both shipped, and both looked fine on screen:

1. **Zero-spread baselines produced no index at all.** Every domain dropped out
   and the panel read "No usable domains" forever. The perverse consequence: the
   more stable a crew member's reference, the less measurable they became.
2. **The interval stayed `null` after the first fix**, because the floor had been
   applied in `zScore` but not in `bootstrapCI`. The point estimate was correct
   while the UI showed `[—]`.

## 2. Static checks

```bash
powershell -File tools/check-syntax.ps1
```

- parses all 23 application modules with `node --check`
- parses the three vendored libraries
- verifies both GLB assets are present and start with the `glTF` magic, and that
  the declared length in the header matches the file size

## 3. Serving checks

```bash
powershell -File tools/check-serving.ps1           # local server
powershell -File tools/check-serving.ps1 -Port 8323
powershell -File tools/check-live.ps1              # the deployed site
```

Confirms every file the page needs returns 200 with a sensible MIME type —
including `model/gltf-binary` for the assets and `application/wasm` for the
Draco decoder — and that `Cache-Control: no-store` is present.

A missing or wrong MIME type on the `.wasm` file silently disables the
WebAssembly decoder and drops Draco decoding to the slower JS path.

## 4. Source checks

```bash
powershell -File tools/check-sources.ps1
```

Fetches every URL in the science registry and reports its status. Run before
publishing; dead links in a submission cost credibility. The last run is
recorded in `docs/_source-check.txt`.

## 5. Browser verification

Each major change has been verified in a real browser rather than assumed,
including: console cleanliness, the background 3D scene actually painting, both
real 3D models loading over HTTP, per-section layer visibility, layout overflow
at 1512 px and at 390 px, and the Mission Console end to end (capture, index,
interval, ingest, edited-value re-computation, malformed-JSON rejection).

### Defects browser verification caught

- **The 3D engine crashed on every frame** (`uniforms.uOpacity` did not exist on
  the fresnel material), leaving a black background. The page looked empty and
  was blamed on the design.
- **The NASA suit silently never loaded.** The GLB is Draco-compressed and no
  decoder was configured, so the fallback procedural figure was shown instead
  and looked like a placeholder. The failure was invisible because the fallback
  worked.
- **The site demoted its own render quality.** The auto-downgrade threshold was
  34 fps over a single sample window, so one heavy frame — loading the 13 MB
  brain mesh, or an environment-map shader compile — dropped the profile to
  MEDIUM on capable hardware.
- **The intro wordmark rendered invisible.** A parent `background-clip: text`
  combined with transformed child spans: a transformed child creates its own
  paint context, so the gradient never reached the letters.
- **The VOR diagram was anatomically wrong.** The interaural axis was drawn
  along the nose direction and mislabelled.

## 6. What is NOT verified

Stated plainly, because a false "verified" is worse than a gap.

| Item | Status |
|---|---|
| Real force-plate, IMU or vHIT hardware | **Not tested.** No physical instruments. Exercise the ingest contract with a payload instead. |
| Camera pipeline against a real head | **Partly verified.** The estimator runs and produces varying output; correspondence between its values and true head displacement is uncalibrated. |
| Firefox, Safari | **Not tested.** Chrome only. |
| Mobile devices | **Layout only.** Sensors on a physical phone are untested. |
| The 13 MB brain mesh on a slow connection | **Not measured.** |
| Physiological validity of OSI | **Not claimed.** No clinical validation exists or is asserted. |
| Drag-to-rotate on the measurement viewport | **Not verified.** The tooling used could not issue a trusted drag; the source logic is correct. |

## 7. Regression discipline

Every defect found in a browser or by a reviewer has been:

1. fixed,
2. given an assertion in `tests/osi.test.mjs` where it is testable, and
3. given a comment at the fix site explaining what went wrong and why.

That is why the engine tests include cases for flat baselines, null channels and
the MDC noise floor: each one is a bug that already happened once.
