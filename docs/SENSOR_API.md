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

`src/sensors/webcam.js` measures **head motion** from the front camera.

**What it does:**
- draws the video into a 64×48 offscreen buffer at ~18 Hz
- recovers the global motion vector by exhaustive block matching (±6 px) over
  the central band, where a head occupies the frame
- computes motion energy as mean absolute frame difference
- separates residual jitter — motion left after removing the global translation,
  i.e. oscillation rather than travel
- tracks a luminance-weighted centroid for slow lateral/vertical drift

**What it does not do:**
- it does not measure gaze
- therefore it **cannot compute VOR gain**, which requires eye landmarks

**Why not MediaPipe Face Mesh:** roughly 3 MB of model plus WASM from a CDN,
which would break the offline guarantee the project is built on and fail on a
hackathon network.

**Upgrade path:** a landmark model drops in as a `SensorProvider` with the same
interface. The `eye_head` channel would then carry a real gaze-error value
instead of a proxy, and VOR gain becomes computable. Nothing else in the
pipeline changes.

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
