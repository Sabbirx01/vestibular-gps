# Sensor API and the ingestion contract

How this application connects to real hardware, what each path can and cannot
do, and the exact shape of the data it accepts.

## The provider interface

Every sensor source implements the same five members. Adding a new one means
implementing those and registering it on the hub — nothing else in the app
changes.

```js
class SensorProvider {
  constructor(id, label)
  get available()            // can this run on this device?
  async start()              // request permission, begin streaming
  stop()                     // release the device
  _set(status, error)        // emit provider-status
}
```

Samples are published on the shared event bus:

```js
bus.emit('sample', {
  source: 'camera' | 'orientation' | 'motion' | 'simulation' | 'replay',
  t: performance.now(),
  ...channelValues,
  rateHz: number,
  quality: number,           // 0..1
  raw: { ... }
});
```

## The three transport paths

### Path A — browser-native sensors

`DeviceOrientation` and `DeviceMotion`, after an explicit permission prompt.

- Works on phones and tablets with no extra hardware.
- **iOS 13+ requires `DeviceOrientationEvent.requestPermission()` from a user
  gesture.** The providers call it inside the click handler, not on load.
- Chrome requires a tap before the first `deviceorientation` event.
- **Limits:** relative orientation only; accuracy varies wildly by device; it is
  not a substitute for an IMU.

### Path B — local bridge over WebSocket

For a force plate, an IMU, vHIT goggles or any lab instrument:

```
instrument ──(serial / USB / BLE / vendor SDK)──▶ bridge process
                                                       │
                                          ws://localhost/vgps/ingest
                                                       │
                                                       ▼
                                                  the page
```

The bridge is deliberately **not included**. Every instrument speaks a different
dialect and a generic bridge would be fiction. What *is* fixed and documented is
the contract it must emit.

### Path C — file or manual ingestion

The LIVE INGEST panel in section 10 accepts a JSON payload directly. This is the
same contract Path B emits, which is what makes the path testable without the
hardware.

## The contract — `vestibular-gps/ingest/v1`

```jsonc
{
  "schema": "vestibular-gps/ingest/v1",
  "subject_id": "AST-07",
  "session": {
    "kind": "baseline" | "sample",
    "gravity": 1.0,
    "mission_phase": "pre_flight",
    "captured_at": "2026-10-02T09:14:00Z",
    "duration_s": 142
  },
  "channels": {
    "eye_head":     { "value": 4.1,  "unit": "deg",     "source": "vhit_goggles", "quality": 0.94 },
    "body_control": { "value": 8.8,  "unit": "mm",      "source": "force_plate",  "quality": 0.97 },
    "task_perf":    { "value": 418,  "unit": "ms",      "source": "ftt_pegboard", "quality": 0.90 },
    "symptoms":     { "value": 1,    "unit": "/10",     "source": "self_report",  "quality": 1.00 },
    "head_motion":  { "value": 27.4, "unit": "deg_s",   "source": "imu_chest",    "quality": 0.92 },
    "drift":        { "value": 0.01, "unit": "per_day", "source": "derived",      "quality": 0.80 }
  },
  "provenance": {
    "device_clock_synced": true,
    "operator": "crew_self_administered",
    "notes": "Protocol PA-1, seated, 5 min rest before capture."
  }
}
```

### Validation rules

The ingest path is strict on purpose. An ingest that silently accepts a
malformed payload is worse than one that rejects it, because the failure then
surfaces as a wrong health number instead of an error.

| Rule | Behaviour |
|---|---|
| Payload is not valid JSON | Rejected with the parser message and offset |
| `schema` present but not `vestibular-gps/ingest/v1` | Rejected |
| `channels` missing or not an object | Rejected |
| A channel value is not a finite number | Rejected with the offending domain |
| A channel's `quality` < 0.4 | That channel is discarded, the rest are kept |
| A channel absent entirely | Not an error — the index renormalises without it and reports reduced coverage |

## Domain → instrument mapping

| Domain | Unit | Real instrument | Transport |
|---|---|---|---|
| `eye_head` | deg (gaze-error proxy) | Video head-impulse goggles (vHIT) | SDK export → JSON |
| `body_control` | mm RMS sway | Force plate / CDP | Serial at 100 Hz → bridge |
| `task_perf` | ms | Functional Task Test battery | Tablet timings or manual |
| `symptoms` | /10 | Motion-sickness questionnaire | In-app form |
| `head_motion` | deg/s | Body-worn IMU | BLE → Web Bluetooth, or bridge |
| `drift` | per day | *(derived)* | Computed in-app |

## The camera pipeline

`src/sensors/webcam.js` measures **head motion** from the front camera, and runs
a **face scan** on the same frames.

**What it does (motion):**
- draws the video into a 64×48 offscreen buffer at ~18 Hz
- recovers the global motion vector by exhaustive block matching (±6 px) over
  the central band, where a head occupies the frame
- computes motion energy as mean absolute frame difference
- separates residual jitter — motion left after removing the global translation,
  i.e. oscillation rather than travel
- tracks a luminance-weighted centroid for slow lateral/vertical drift

**What it does (face scan):**
- white-balances the frame first (grey-world, one multiply per channel), because
  a colour cast moves every skin bound at once
- builds four per-pixel maps on the same 64×48 buffer: graded YCbCr skin
  (0..255, how far inside the rule a pixel sits), luminance gradient (structure),
  a dark-feature mask at 0.62 × the frame's median luminance, and frame-difference
  motion
- reduces each map to a summed-area table, then searches ~1500 face-shaped
  windows (8 heights, width = 0.78 × height, 2 px step) scoring each as
  `(skin + structure + dark + motion) × aspect × centre × brightness × size`
- takes the winning window as a SEED and fits the published region to the
  evidence inside it (skin OR structure) by image moments, giving centre and
  spread that move when the head turns
- publishes `status` (`searching` / `locked` / `lost`), the normalised box,
  centre, spreads, coverage, `basis`, `score`, and a coarse head pose
  `yaw` / `pitch` / `roll` in degrees

**Why not skin-tone blob tracking (v1, removed):** on the first real camera this
scanner met, the video's purple cast put the FACE outside every classic skin
bound while the beige WALL sat inside them, so the largest-skin-blob rule locked
the wall. Measured on that frame, structure and dark features separate face from
wall by roughly 3× while colour separates nothing. `basis` now reports which
channel is holding a lock, so a structure-held lock is never presented with the
same confidence as a colour-held one.
- verified against a still frame of that camera: lock `[0.31, 0.19, 0.73, 0.89]`
  (face) against v1's `[0.00, 0.49, 0.37, 0.90]` (wall)

**Pose contract:**
- pose is `null` until `calibrate()` has stored a neutral region; a pose without
  a subject-specific reference would be an invented number
- the neutral is the **median of raw detections** in the hold-still window
  (≥ 8 frames required), never of the smoothed box
- the direction of a turn comes from the centroid displacement past a dead zone
  of 0.06 face-widths; the magnitude also uses the change in the RATIO of the
  region's two spreads, which is scale-invariant, so leaning towards or away
  from the camera does not register as a turn
- signs are mirrored to match the selfie preview on screen; `pitch` is positive
  looking up
- the pose is published ONLY when the current lock carries COLOUR evidence and
  the stored baseline does too. A structure-only lock reports `poseNote` and a
  blank pose instead of an angle. Reason, from a live camera: with structure
  carrying the lock, the spread ratio swings with whichever features are
  visible, and a face looking straight at the lens read yaw −60.0° (the clamp),
  pitch +17.3°, roll +34.1°. A saturated angle is worse than no angle.
- `neutral.basis` and `neutral.colourFraction` record how much of the hold-still
  window had a colour lock, so a baseline that cannot support a pose is visible
  rather than silent
- `poseNote` carries the reason a pose is blank: "calibrate to set the neutral",
  "no colour lock — this lighting has silenced the skin channel", "baseline
  captured without a colour lock — re-calibrate", or "no face"
- the published region BOX is the searched face-shaped window, not the moment
  box: the moment box shrinks onto whichever features carry evidence and, with
  the colour channel silent, was reported covering only one side of the face.
  The moments still drive the pose and the neutral.
- `confidence` describes the LOCK (from the detector's score) and is published
  with or without a neutral; it is a relative score, not a probability
- every pose value is an **estimate** (`estimated: true`), not a goniometer
  reading; `eyeLandmarks` reports whether the optional local landmark model is
  presently supplying a visual-only eye signal

**What it does not do:**
- it does not measure clinical gaze
- therefore it **cannot compute VOR gain**. Local eye/iris landmarks are only
  an experimental face-relative visual signal; without a calibrated eye/head
  velocity protocol, `eyeHead` remains `null` and the UI says so
- it cannot separate a head **translation** from a head **rotation** — sliding
  sideways moves the region exactly like a yaw

**Local landmark layer:** MediaPipe Face Landmarker and its model/WASM are
bundled under Apache-2.0 and run on-device. They are not a clinical instrument,
do not upload frames, and do not convert this browser camera into vHIT.

**Upgrade path:** a validated eye/head instrument provider can use the same
interface. Only that provider may populate `eye_head` or compute VOR gain;
the browser landmark visual remains unavailable to the metric by design.

## Privacy

- All processing is on-device. No frame, sample or session is uploaded.
- Every permission is requested separately, from a user gesture, with a
  plain-language reason.
- Declining any permission degrades the index; it never breaks the page.
- `localStorage` holds baseline sessions and preferences only. Sensor raw data
  is never persisted without an explicit export.

## Secure-context requirement

Sensor and camera APIs require HTTPS or `localhost`. Over plain `http://` on a
LAN address they are blocked by the browser. The UI detects this and says so
directly rather than failing silently.

`serve.py` binds `127.0.0.1` by default. For on-phone testing over a LAN you
need HTTPS; `python serve.py 8322 0.0.0.0` will expose it, but the sensors will
stay blocked until the origin is secure.
