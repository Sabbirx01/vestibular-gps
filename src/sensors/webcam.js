/* ═══════════════════════════════════════════════════════════
   CameraProvider — head-motion tracking from the front camera.

   WHY THIS SHAPE AND NOT MEDIAPIPE
   The roadmap's §2.5 wants webcam head/eye tracking. The obvious route is
   MediaPipe Face Mesh, but that pulls a ~3 MB model plus WASM from a CDN —
   which breaks the offline guarantee the whole project is built on, and
   fails on a hackathon network.

   So this is a self-contained estimator instead. It does real measurement,
   not decoration:

     • block-match the previous frame against the current one over a small
       search window to recover the GLOBAL MOTION VECTOR of the head
     • motion energy = mean absolute frame difference, i.e. how much moved
     • residual jitter = the part of the motion that is not global
       translation (oscillation rather than travel)
     • face-region centroid, from a coarse luminance weighting, giving a
       slow lateral/vertical drift signal

    HONEST SCOPE — this is stated in the UI as well:
      This measures HEAD MOTION. It does not measure gaze, and it cannot
      compute VOR gain, because VOR gain needs eye landmarks. A landmark
      model is a documented upgrade path (see docs/SENSOR_API.md); when one
      is present the same provider interface accepts it unchanged.

    FACE SCAN — what it does, and what it deliberately does not
      The provider also locates the FACE REGION in each analysed frame and
      reports a coarse head pose from that region's geometry.

      It is NOT a skin-colour blob finder. The first version was, and it locked
      onto a wall the first time it met a real camera: that video carries a
      purple cast, so the FACE sat entirely outside the classic YCbCr bounds
      (Cb ~149 against an upper bound of 127) while the beige WALL sat inside
      them. Colour cannot carry this job. What does, measured on that frame:

        region   aspect   dark-frac   mean gradient   luminance variance
        face      0.73      0.28          4.95              54.8
        wall      1.20      0.02          1.49              22.9

      So the detector searches face-shaped windows over the 64x48 buffer and
      scores each one on four channels — graded skin colour after a grey-world
      white balance, local structure (gradient), dark features, and frame-differ-
      ence motion — multiplied by shape, position, brightness and size priors.
      All statistics come from summed-area tables, so ~1500 windows cost one
      pass over the buffer plus a few adds each.

      The winner is a SEED. The published region is fitted to the evidence
      inside it (skin OR structure), by image moments, which is what gives a
      centre and a spread that actually move when the head turns.

      It uses NO facial landmarks. So:
        • it cannot measure gaze, eye position, or VOR gain, and `eyeHead`
          stays null. The UI keeps saying so, in those words.
        • every pose number is an ESTIMATE with a few degrees of uncertainty,
          not a goniometer reading. Published values carry `estimated: true`,
          a `basis` field naming the channel holding the lock, and a method
          string, so no consumer can mistake them for a measurement.
        • baseline: pose is published ONLY once calibrate() has recorded a
          neutral region, because "how far have I turned" is meaningless
          without the subject's own reference — the same reason this project
          scores against a personal baseline and not population norms.

   CALIBRATION — why it exists and what it actually removes.
     Every webcam has a different sensor-noise floor: exposure, gain,
     compression artefacts, and ambient flicker all produce a small amount
     of pixel-difference "motion" even when the subject sits perfectly
     still. Before calibration, that noise floor gets reported as head
     motion indistinguishably from a real small movement, which is exactly
     what made the raw numbers unconvincing.

     calibrate() asks the subject to hold still for CAL_MS milliseconds,
     samples the estimator's own outputs during that window, and stores the
     95th-percentile of motionEnergy/jitter/travel as this camera's noise
     floor. Every live sample after that has the floor subtracted (and
     clamped at zero) before it is published, so what reaches the OSI
     engine is motion ABOVE the device's own noise, not the device's own
     noise reported as if it were the subject. Uncalibrated operation still
     works — it just reports the same conservative built-in floor everyone
     starts with, and the UI states plainly whether that run is calibrated.

   Everything runs locally. No frame is ever uploaded.
   ═══════════════════════════════════════════════════════════ */

import { SensorProvider } from './providers.js';
import { bus, set, state, toast } from '../core/store.js';
import { Rolling, clamp } from '../core/util.js';

const PROC_W = 64;          // processing width  (px)
const PROC_H = 48;          // processing height (px)
const SEARCH = 6;           // global-motion search radius (px)
const TARGET_HZ = 18;       // analysis rate — deliberately below the frame rate
const CAL_MS = 2200;        // hold-still window for calibrate()
const CAL_MAX_MS = 6000;    // ...extended to here while the face is not visible enough

/** 95th percentile of a numeric array — robust to one motion spike during calibration. */
function p95(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))];
}

/** Median — the neutral face region uses this so one outlier frame cannot move the baseline. */
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Wrap a roll difference into (-90, 90]: a head tilt has no "beyond vertical". */
function wrapTilt(deg) {
  let d = deg % 180;
  if (d > 90) d -= 180;
  if (d <= -90) d += 180;
  return d;
}

/* ── Face-scan geometry ──────────────────────────────────
   A searched, face-shaped window scored on several channels rather than a
   single skin-tone blob. The first version segmented skin and kept the largest
   blob, which failed on the first real camera it met: that camera's video
   carries a strong purple cast, so the FACE sat outside every classic skin
   bound (Cb ~149 against an upper bound of 127) while the beige WALL sat
   inside it, and the scanner locked the wall.

   What separates a face from a wall, measured on that frame:

     region   aspect  dark-frac  mean gradient  luminance variance
     face      0.73     0.28         4.95             54.8
     wall      1.20     0.02         1.49             22.9

   Structure and dark features separate them by 3x; colour separates nothing.
   So colour is now one channel of several, and the score is:

     (w_skin*skin + w_struct*structure + w_dark*dark + w_motion*motion)
       * aspect prior * centre prior * brightness prior * size prior

   with every box statistic read from summed-area tables, so a search over
   ~1500 windows costs one pass over the buffer plus a few adds per window.

   The pose gains are empirical, not calibrated optics, and that is why every
   published value is marked `estimated`. */
const FACE_ASPECT = 0.78;                  // preferred window width : height
const FACE_ASPECT_SIGMA = 0.30;            // tolerance around that preference
const FACE_SEARCH_STEP = 2;                // px between window positions
const FACE_SEARCH_HEIGHTS = [18, 22, 26, 30, 34, 38, 42, 46];
const FACE_MIN_COVERAGE = 0.02;            // window must cover >= 2% of the frame
const FACE_MAX_COVERAGE = 0.70;            // and no more than 70%
const FACE_MIN_SCORE = 0.15;               // below this nothing face-shaped is present
const W_SKIN = 1.0;                        // channel weights
const W_STRUCT = 1.2;
const W_DARK = 0.5;
const W_MOTION = 0.5;
const SIZE_PRIOR_FULL = 0.35;              // coverage at which the size prior saturates
const SIZE_PRIOR_FLOOR = 0.35;             // and its floor, so small faces still score
const BRIGHT_DARK_FLOOR = 0.62;            // "dark feature" threshold, x frame median
const BRIGHT_PRIOR_MID = 0.5;              // brightness prior: nothing below half the
const BRIGHT_PRIOR_FLOOR = 0.2;            // frame median scores above this
const EVID_SKIN = 0.20;                    // evidence mask thresholds, for the moments
const EVID_STRUCT = 0.25;
const EVID_BRIGHT = 0.55;
const FACE_LOST_MS = 900;                  // no detection for this long -> LOST
const YAW_PER_SHRINK = 150;                // deg per unit of horizontal narrowing
const PITCH_PER_SHRINK = 120;              // deg per unit of vertical shortening
const YAW_PER_SHIFT = 40;                  // deg per face-width of lateral centroid travel
const PITCH_PER_SHIFT = 55;                // deg per face-height of vertical centroid travel
/* Direction dead zone, in face widths. The sign of the turn is taken from the
   centroid displacement, and a sub-pixel wobble in that displacement must not
   be allowed to decide it: without this, a perfectly symmetrical narrowing
   swings between 0 deg and the full narrowing term as the centroid jitters
   across the neutral. */
const POSE_DIR_DEADZONE = 0.06;

export class CameraProvider extends SensorProvider {
  constructor() {
    super('camera', 'Front camera (head motion)');
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.prev = null;
    this.timer = null;
    this.hz = new Rolling(30);
    this.lastT = 0;

    /* outputs */
    this.motionEnergy = 0;   // 0..1
    this.jitter = 0;         // 0..1  oscillatory component
    this.dx = 0;             // px, global motion this sample
    this.dy = 0;
    this.centroidX = 0.5;    // 0..1 face-region centroid
    this.centroidY = 0.5;
    this.samples = 0;
    this.reason = '';

    /* calibration state — conservative built-in floor until calibrate() runs */
    this.calibrated = false;
    this.calibrating = false;
    this.calProgress = 0;      // 0..1, for the UI
    this.noiseFloor = { energy: 0.03, jitter: 0.02, travel: 0.4 };
    this._starting = false;    // start() in flight — see the re-entry note there

    /* Optional local eye-landmark provider. MediaPipe Face Landmarker is
       bundled under vendor/ and assets/models/, so this never sends a camera
       frame to a server. It provides eye/iris points for an EXPERIMENTAL
       gaze-relative-to-face readout. This is intentionally NOT used as VOR
       gain: a clinical head-impulse test needs calibrated high-speed eye and
       head-velocity instrumentation, which a normal webcam is not. */
    this.eye = {
      status: 'not loaded', available: false, gazeX: null, gazeY: null,
      neutralX: null, neutralY: null, confidence: 0, points: null,
      stableFrames: 0, lastAt: 0,
      method: 'local MediaPipe Face Landmarker; experimental, not clinical VOR',
    };
    this._eyeLandmarker = null;
    this._eyeLoading = null;
    this._lastEyeAt = 0;
    this._lastEyeSignal = null;
    this._eyeSmoothPoints = null;

    /* ── Face-scan state ──
       `status` drives both the readout row and the overlay: 'searching' = no
       face found yet, 'locked' = found in the current frame, 'lost' = had one
       and just lost it. yaw/pitch/roll stay null until calibrate() has stored
       a neutral region — a pose without a reference would be an invented
       number, which is exactly what this project refuses to publish. */
    this.face = {
      found: false,
      status: 'searching',
      x: 0, y: 0, w: 0, h: 0,      // normalised 0..1 fitted region box
      cx: 0.5, cy: 0.5,            // region centre of mass
      sigX: 0.2, sigY: 0.3,        // region spread, the pose's scale reference
      coverage: 0,                 // fraction of the frame the box covers
      fill: 0,                     // fraction of the BOX that is face evidence
      rollRaw: 0,                  // region tilt in the analysis frame
      yaw: null, pitch: null, roll: null,
      poseNote: 'calibrate to set the neutral',   // why the pose is blank
      confidence: 0,
      basis: '—',                  // which channel carried the detection
      score: 0,
      estimated: true,
      method: 'face-shaped window on structure, dark features, motion and colour — no landmarks',
    };
    this.neutral = null;           // { cx, cy, sigX, sigY, roll }, set by calibrate()
    this.neutralNote = '';         // why a neutral could not be captured, for the UI
    this.faceSeenAt = 0;           // last frame a region was found
    /* The last UN-smoothed detection. The neutral is measured from these, never
       from the smoothed box: an EMA that has not converged yet reports a box
       that is still too tall, and a neutral built from it makes every later
       reading carry a phantom turn. */
    this.faceRaw = null;

    /* ── Preallocated detector buffers ──
       The detector runs at TARGET_HZ forever, so none of this may be allocated
       per frame: at 18 Hz, fresh typed arrays would churn megabytes a minute
       for no reason. `lum` is the white-balanced luminance the detector scores
       (the motion estimator keeps the raw `prev.grey`), and the six summed-area
       tables are rebuilt in place each frame. */
    const n = PROC_W * PROC_H;
    this._lum = new Float32Array(n);
    this._prevLum = new Float32Array(n);
    this._skin = new Float32Array(n);
    this._struct = new Float32Array(n);
    this._dark = new Float32Array(n);
    this._motion = new Float32Array(n);
    this._one = new Float32Array(n).fill(1);
    this._iw = PROC_W + 1;
    this._iiOne = new Float32Array(this._iw * (PROC_H + 1));
    this._iiY = new Float32Array(this._iw * (PROC_H + 1));
    this._iiSkin = new Float32Array(this._iw * (PROC_H + 1));
    this._iiStruct = new Float32Array(this._iw * (PROC_H + 1));
    this._iiDark = new Float32Array(this._iw * (PROC_H + 1));
    this._iiMotion = new Float32Array(this._iw * (PROC_H + 1));
    this._sampY = new Float32Array(n >> 2);
    this._sampG = new Float32Array(n >> 2);
  }

  /**
   * Sample the estimator's own output while the subject holds still, and use
   * the 95th percentile as this device's noise floor. Resolves false if the
   * camera is not running yet.
   */
  async calibrate() {
    if (!this.running) return false;
    this.calibrating = true;
    this.calProgress = 0;
    bus.emit('sensor', { id: this.id, status: 'calibrating' });

    const energy = [], jitter = [], travel = [];
    /* The neutral head pose is captured inside the same hold-still window: it
       costs the subject nothing extra, and it is the one moment we know they
       are looking straight at the camera. */
    const nCx = [], nCy = [], nW = [], nH = [], nRoll = [];
    /* How much of the hold-still window had a COLOUR lock. Stored with the
       neutral because a baseline captured without one cannot support a pose
       later, and the subject needs to be told to re-calibrate rather than
       discovering it as a wrong angle. */
    let nColour = 0, nFace = 0;
    const t0 = performance.now();
    /* A timer, not requestAnimationFrame. rAF is suspended while the tab is in
       the background, so a subject who switches tabs during the hold-still
       window used to complete a "calibration" that had sampled almost nothing
       — caught in browser verification, where the window collected 1 frame and
       the neutral was refused. The estimator itself runs on setInterval and
       keeps producing samples either way, so sampling on the same kind of timer
       keeps the two in step. */
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const t = performance.now() - t0;
        this.calProgress = Math.min(1, t / CAL_MS);
        energy.push(this.motionEnergy);
        jitter.push(this.jitter);
        travel.push(Math.hypot(this.dx, this.dy));
        /* Sample the RAW detection, not the smoothed box. See the faceRaw note
           in the constructor: a not-yet-converged EMA would bake a phantom
           turn into the neutral for the whole session. */
        const raw = this.faceRaw;
        if (raw) {
          nCx.push(raw.cx); nCy.push(raw.cy);
          nW.push(raw.sigX); nH.push(raw.sigY);
          nRoll.push(raw.rollRaw);
          nFace++;
          if (String(raw.basis).indexOf('colour') >= 0) nColour++;
        }
        /* Keep sampling past the nominal window when almost no frame had a
           face. A live camera captured only 3 usable frames in 2.2 s with the
           subject sitting right there, which silently produced "calibrated but
           no neutral" and forced a second button press. CAL_MAX_MS bounds the
           wait; the reason is still reported if the face never appears. */
        if (t >= CAL_MS && (nFace >= 8 || t >= CAL_MAX_MS)) { clearInterval(timer); resolve(); }
      }, 30);
    });

    /* A small margin above the measured p95 keeps genuine micro-tremor from
       being reported as zero motion, which would look like a dead sensor. */
    this.noiseFloor = {
      energy: p95(energy) * 1.15,
      jitter: p95(jitter) * 1.15,
      travel: p95(travel) * 1.15,
    };

    /* The neutral region is the MEDIAN of the hold-still window, so one blink
       or one dropped frame cannot define the subject's baseline. It also needs
       a real sample count — a handful of frames is not a baseline, and saying
       "calibrated" while holding no neutral would make every later pose number
       meaningless. */
    if (nCx.length >= 8) {
      /* sigX/sigY are stored under the historical keys w/h to keep the shape of
         this object stable for anything already reading it; they are spreads,
         not box sides. */
      this.neutral = {
        cx: median(nCx),
        cy: median(nCy),
        sigX: Math.max(0.02, median(nW)),
        sigY: Math.max(0.02, median(nH)),
        roll: median(nRoll),
        /* 'colour' only when most of the window had one: anything less cannot
           support the pose, and _updatePose refuses to compute against it. */
        basis: nColour * 2 >= nFace ? 'colour' : 'structure',
        colourFraction: +(nColour / Math.max(1, nFace)).toFixed(3),
      };
      this.neutralNote = this.neutral.basis === 'colour'
        ? ''
        : 'baseline captured without a colour lock — the pose stays blank until a calibration with colour evidence';
    } else {
      this.neutral = null;
      this.neutralNote = nCx.length
        ? `only ${nCx.length} frames with a visible face — hold still facing the camera`
        : 'no face was visible during the hold-still window';
    }

    /* The same hold-still window is also the only honest reference for the
       optional gaze signal. It is a face-relative neutral, not a population
       target and not a VOR calibration. */
    if (this.eye.available) {
      this.eye.neutralX = this.eye.gazeX;
      this.eye.neutralY = this.eye.gazeY;
    }

    this.calibrated = true;
    this.calibrating = false;
    this.calProgress = 1;
    bus.emit('sensor', {
      id: this.id, status: this.status, calibrated: true,
      noiseFloor: this.noiseFloor, neutral: this.neutral, neutralNote: this.neutralNote,
    });
    return true;
  }

  get supported() {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Secure context is mandatory for camera access. */
  get secureContextOk() {
    return typeof window !== 'undefined' && window.isSecureContext !== false;
  }

  /**
   * Idempotent, and safe against RE-ENTRY as well as against a later call.
   * The integration panel is rebuilt on every render, so its START button comes
   * back live after a successful start; and a second start() issued while the
   * first is still awaiting permission used to install a second analysis timer
   * and leak the first MediaStream — which doubled the analysis rate and left
   * the camera light on after STOP. A gate that only checked `running` could
   * not see that case, because `running` is not set until the await returns.
   */
  async start() {
    if (this.running || this._starting) return true;
    this._starting = true;
    try {
      return await this._start();
    } finally {
      this._starting = false;
    }
  }

  async _start() {
    if (!this.supported) {
      this.reason = 'This browser does not expose getUserMedia.';
      this.status = 'unavailable';
      bus.emit('sensor', { id: this.id, status: this.status, reason: this.reason });
      return false;
    }
    if (!this.secureContextOk) {
      this.reason = 'Camera access requires a secure context (https:// or localhost).';
      this.status = 'unavailable';
      toast('CAMERA BLOCKED', this.reason, 'warn', 9000);
      bus.emit('sensor', { id: this.id, status: this.status, reason: this.reason });
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        /* Request a real preview resolution. The estimator still downsamples
           internally, but the user-facing preview must not be a 64x48 mosaic. */
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (err) {
      this.reason = err?.name === 'NotAllowedError'
        ? 'Camera permission was declined.'
        : `Camera unavailable: ${err?.message || err}`;
      this.status = 'denied';
      bus.emit('sensor', { id: this.id, status: this.status, reason: this.reason });
      return false;
    }

    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = this.stream;

    this.canvas = document.createElement('canvas');
    this.canvas.width = PROC_W;
    this.canvas.height = PROC_H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    try { await this.video.play(); } catch { /* autoplay guard */ }
    await new Promise((r) => {
      if (this.video.videoWidth) return r();
      this.video.onloadedmetadata = () => r();
      setTimeout(r, 2500);
    });

    if (this.previewEl) {
      this.previewEl.srcObject = this.stream;
      this.previewEl.classList.add('is-on');
    }

    this.status = 'granted';
    this.running = true;
    this.samples = 0;
    this.reason = '';
    bus.emit('sensor', { id: this.id, status: this.status });

    /* Deliberately non-blocking: basic local head motion begins immediately
       even on a slow device or if the optional landmark model cannot load. */
    this._startEyeLandmarker();

    const interval = 1000 / TARGET_HZ;
    this.timer = setInterval(() => this._analyse(), interval);
    return true;
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this._starting = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.previewEl) {
      this.previewEl.srcObject = null;
      this.previewEl.classList.remove('is-on');
    }
    this.running = false;
    this.status = 'idle';
    this.prev = null;
    /* A stopped-then-restarted stream may come from a different camera, a
       different room or a different person, so neither the noise floor nor the
       neutral head pose is trustworthy any more. Both are dropped, and the
       pose is blanked rather than left showing a stale angle. */
    this.calibrated = false;
    this.calProgress = 0;
    this.neutral = null;
    this.neutralNote = '';
    this.faceSeenAt = 0;
    this.face.found = false;
    this.face.status = 'searching';
    this.face.yaw = null;
    this.face.pitch = null;
    this.face.roll = null;
    this.face.confidence = 0;
    this.face.basis = '—';
    this.face.score = 0;
    this.face.poseNote = 'calibrate to set the neutral';
    this.faceRaw = null;
    this.eye.available = false;
    this.eye.status = 'not loaded';
    this.eye.gazeX = this.eye.gazeY = null;
    this.eye.neutralX = this.eye.neutralY = null;
    this.eye.points = null;
    this.eye.stableFrames = 0;
    this._lastEyeSignal = null;
    this._eyeSmoothPoints = null;
    /* The next stream is a different camera or room, so the previous frame is
       useless as a motion reference. */
    this._lumReady = false;
    bus.emit('sensor', { id: this.id, status: this.status });
  }

  attachPreview(videoEl) {
    this.previewEl = videoEl;
    if (this.stream && videoEl) {
      /* Re-rendering the integration panel replaces the old <video>. Always
         reattach the live stream, wait for metadata, then explicitly play so
         the preview cannot remain HAVE_NOTHING with a null srcObject. */
      if (videoEl.srcObject !== this.stream) videoEl.srcObject = this.stream;
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.classList.add('is-on');
      const play = () => videoEl.play?.().catch(() => {});
      if (videoEl.readyState >= 1) play();
      else videoEl.addEventListener('loadedmetadata', play, { once: true });
      queueMicrotask(play);
    }
  }

  async _startEyeLandmarker() {
    if (this._eyeLandmarker || this._eyeLoading) return this._eyeLoading;
    this.eye.status = 'loading local model';
    this._eyeLoading = (async () => {
      try {
        const { FilesetResolver, FaceLandmarker } = await import('../../vendor/mediapipe/vision_bundle.mjs');
        const vision = await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
        const options = (delegate) => ({
          baseOptions: { modelAssetPath: './assets/models/face_landmarker.task', delegate },
          runningMode: 'VIDEO', numFaces: 1,
          outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
        });
        /* GPU is quicker on most laptops, but a software-rendered browser or
           an older driver must not lose the feature. The exact same local model
           is retried on CPU, then the existing head-motion fallback remains. */
        try { this._eyeLandmarker = await FaceLandmarker.createFromOptions(vision, options('GPU')); }
        catch { this._eyeLandmarker = await FaceLandmarker.createFromOptions(vision, options('CPU')); }
        this.eye.status = 'ready';
      } catch (err) {
        this.eye.status = 'unavailable';
        this.eye.available = false;
        this.eye.error = String(err?.message || err).slice(0, 120);
        /* Drop the cached promise so STOP → START retries the load. Without
           this the failed attempt was cached for the rest of the session and a
           transient failure — a slow fetch, a GPU delegate that failed once —
           became permanent: every later start just returned the same dead
           promise and the panel never recovered. */
        this._eyeLoading = null;
      }
    })();
    return this._eyeLoading;
  }

  _trackEyes(now) {
    if (!this._eyeLandmarker || !this.video || now - this._lastEyeAt < 100) return;
    this._lastEyeAt = now;
    try {
      const result = this._eyeLandmarker.detectForVideo(this.video, now);
      const p = result.faceLandmarks?.[0];
      /* 468–472 / 473–477 are iris landmarks. Eye corners give a stable
         face-relative scale, so the reported offset survives the subject
         moving closer to the webcam. */
      if (!p || p.length < 478) throw new Error('iris landmarks unavailable');
      const mean = (ids) => ids.reduce((a, i) => ({ x: a.x + p[i].x, y: a.y + p[i].y }), { x: 0, y: 0 });
      const l = mean([468, 469, 470, 471, 472]); const r = mean([473, 474, 475, 476, 477]);
      l.x /= 5; l.y /= 5; r.x /= 5; r.y /= 5;
      const widthL = Math.max(0.001, Math.abs(p[33].x - p[133].x));
      const widthR = Math.max(0.001, Math.abs(p[362].x - p[263].x));
      const gazeX = (((l.x - (p[33].x + p[133].x) / 2) / widthL) + ((r.x - (p[362].x + p[263].x) / 2) / widthR)) / 2;
      const gazeY = (((l.y - (p[33].y + p[133].y) / 2) / widthL) + ((r.y - (p[362].y + p[263].y) / 2) / widthR)) / 2;
      const faceWidth = Math.abs(p[234].x - p[454].x);
      const leftOpen = Math.abs(p[159].y - p[145].y) / widthL;
      const rightOpen = Math.abs(p[386].y - p[374].y) / widthR;
      const eyeSymmetry = 1 - Math.min(1, Math.abs(widthL - widthR) / Math.max(widthL, widthR));
      const opening = Math.min(leftOpen, rightOpen);
      const geometryQuality = Math.max(0, Math.min(1,
        Math.min(faceWidth / 0.16, 1) * eyeSymmetry * Math.min(opening / 0.09, 1)));
      const valid = Number.isFinite(gazeX) && Number.isFinite(gazeY)
        && widthL > 0.012 && widthR > 0.012
        && faceWidth > 0.08 && opening > 0.035 && eyeSymmetry > 0.5
        && Math.abs(gazeX) < 1.5 && Math.abs(gazeY) < 1.5;
      if (!valid) throw new Error('invalid eye geometry');

      /* Require consecutive, physically consistent landmark frames. A single
         detection is shown as SCANNING, never as a health or gaze result. */
      const delta = this._lastEyeSignal
        ? Math.hypot(gazeX - this._lastEyeSignal.x, gazeY - this._lastEyeSignal.y)
        : 0;
      this.eye.stableFrames = (!this._lastEyeSignal || delta < 0.18)
        ? Math.min(12, this.eye.stableFrames + 1) : 0;
      this._lastEyeSignal = { x: gazeX, y: gazeY };
      this.eye.gazeX = gazeX;
      this.eye.gazeY = gazeY;
      /* Smooth only verified real points. This removes webcam jitter while
         keeping the overlay tied to the current physical face, not a preset
         mesh or animated placeholder. */
      const rawPoints = p.map(({ x, y, z }) => ({ x, y, z: z || 0 }));
      this._eyeSmoothPoints = this._eyeSmoothPoints?.length === rawPoints.length
        ? rawPoints.map((pt, i) => ({
          x: this._eyeSmoothPoints[i].x + (pt.x - this._eyeSmoothPoints[i].x) * 0.36,
          y: this._eyeSmoothPoints[i].y + (pt.y - this._eyeSmoothPoints[i].y) * 0.36,
          z: this._eyeSmoothPoints[i].z + (pt.z - this._eyeSmoothPoints[i].z) * 0.36,
        })) : rawPoints;
      this.eye.points = this._eyeSmoothPoints;
      this.eye.lastAt = now;
      this.eye.available = this.eye.stableFrames >= 4 && geometryQuality >= 0.55;
      this.eye.status = this.eye.available ? 'tracking locally' : 'scanning for stable landmarks';
      this.eye.confidence = this.eye.available
        ? Math.min(0.98, 0.45 + this.eye.stableFrames * 0.03 + geometryQuality * 0.2) : 0;
    } catch {
      this.eye.available = false;
      this.eye.status = 'no eye landmarks';
      this.eye.confidence = 0;
      this.eye.points = null;
      this.eye.stableFrames = 0;
      this._lastEyeSignal = null;
      this._eyeSmoothPoints = null;
    }
  }

  /* ── The estimator ─────────────────────────────────────── */

  /**
   * One frame, reduced twice over: a greyscale buffer for the motion estimator
   * and a binary skin mask for the face scan. Both come out of the same pixel
   * loop — the skin test is three multiply-adds on values already in hand — so
   * the face scan costs no second pass over the frame.
   */
  _grab() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    this.ctx.drawImage(v, 0, 0, PROC_W, PROC_H);
    const img = this.ctx.getImageData(0, 0, PROC_W, PROC_H);
    const d = img.data;
    const grey = new Float32Array(PROC_W * PROC_H);
    const lum = this._lum;
    const skin = this._skin;
    let lumSum = 0, lumX = 0, lumY = 0, rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      grey[p] = y;
      lumSum += y;
      lumX += (p % PROC_W) * y;
      lumY += Math.floor(p / PROC_W) * y;
      rSum += r;
      gSum += g;
      bSum += b;
    }

    /* White balance FIRST. A colour cast moves every skin bound at once, and on
       the first real camera this scanner met the purple cast put the FACE
       entirely outside the rule (Cb ~149 against an upper bound of 127) while
       the beige WALL sat comfortably inside it — so the scanner locked the wall
       and the face was never a candidate. Grey-world correction is one multiply
       per channel. It cannot rescue a monochrome scene, which is why colour is
       only one of the detector's channels. */
    const avg = (rSum + gSum + bSum) / 3;
    const gainR = avg / Math.max(1, rSum);
    const gainG = avg / Math.max(1, gSum);
    const gainB = avg / Math.max(1, bSum);

    let skinCount = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const r = d[i] * gainR, g = d[i + 1] * gainG, b = d[i + 2] * gainB;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lum[p] = y;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      /* GRADED, not binary: how far INSIDE the rule a pixel sits is what lets
         the score prefer real skin over a wall that merely grazes the bounds. */
      let s = 0;
      if (y > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
        const mb = 1 - Math.abs(cb - 102) / 30;
        const mr = 1 - Math.abs(cr - 153) / 25;
        s = Math.max(0, Math.min(mb, mr));
        if (s > 0) skinCount++;
      }
      skin[p] = s * 255;
    }

    const cx = lumSum > 0 ? lumX / lumSum / PROC_W : 0.5;
    const cy = lumSum > 0 ? lumY / lumSum / PROC_H : 0.5;
    return { grey, lum, skin, skinCount, cx, cy };
  }

  /**
   * Read-only view of the estimator's own working buffers, so the UI can show
   * what the pipeline is actually looking at instead of an empty panel.
   *
   * These arrays are LIVE: they are rewritten in place on every analysis frame.
   * Read them; never mutate them. This is the raw downsampled frame the
   * detector scores — it is NOT a landmark scan, NOT a 3D model and NOT a
   * measurement, and any UI that draws it must say so. Returns null until the
   * first frame has been grabbed.
   */
  analysisField() {
    if (!this._lumReady) return null;
    return {
      w: PROC_W, h: PROC_H,
      lum: this._lum, struct: this._struct,
      dark: this._dark, motion: this._motion, skin: this._skin,
    };
  }

  /** Build a summed-area table in place. `dst` is (PROC_W+1) x (PROC_H+1). */
  _integral(src, dst) {
    const iw = this._iw;
    for (let y = 0; y < PROC_H; y++) {
      let rowSum = 0;
      const srow = y * PROC_W;
      const drow = (y + 1) * iw;
      const prow = y * iw;
      for (let x = 0; x < PROC_W; x++) {
        rowSum += src[srow + x];
        dst[drow + x + 1] = dst[prow + x + 1] + rowSum;
      }
    }
  }

  /**
   * Locate the face region in the current frame.
   *
   * A searched, face-shaped window scored on four channels — not the largest
   * skin blob. The blob version failed the first time it met a real camera:
   * that video carries a purple cast, so the face sat outside every classic
   * skin bound while the beige wall sat inside them, and the scanner locked the
   * wall. Measured on that frame, structure and dark features separate face
   * from wall by 3x while colour separates nothing, so colour is now one
   * channel of four and the rest is shape, position, brightness and motion.
   *
   * Returns normalised (0..1) box, centre, spread, coverage and the tilt of the
   * evidence inside it, or { found: false } when nothing face-shaped is there.
   */
  _detectFace(cur) {
    const n = PROC_W * PROC_H;
    const lum = cur.lum;
    const skin = cur.skin;
    const struct = this._struct;
    const dark = this._dark;
    const motion = this._motion;
    const prev = this._prevLum;
    const hasPrev = this._lumReady;

    /* Structure map, plus two reference levels from a sampled quarter of the
       buffer. A full sort of 3072 values every frame would cost more than it is
       worth, and every fourth pixel is plenty for a reference level. */
    const sampY = this._sampY;
    const sampG = this._sampG;
    let k = 0;
    for (let y = 0; y < PROC_H; y++) {
      const row = y * PROC_W;
      for (let x = 0; x < PROC_W; x++) {
        const p = row + x;
        const gx = x < PROC_W - 1 ? Math.abs(lum[p + 1] - lum[p]) : 0;
        const gy = y < PROC_H - 1 ? Math.abs(lum[p + PROC_W] - lum[p]) : 0;
        struct[p] = gx + gy;
        if (((x + y) & 3) === 0) {
          sampY[k] = lum[p];
          sampG[k] = struct[p];
          k++;
        }
      }
    }
    sampY.sort();
    sampG.sort();
    const medY = sampY[k >> 1] || 1;
    /* 90th-percentile gradient, floored: a nearly flat frame must not turn its
       own compression noise into a full-scale structure signal. */
    const gRef = Math.max(6, sampG[Math.floor(k * 0.9)] || 6);

    const darkCut = BRIGHT_DARK_FLOOR * medY;
    for (let p = 0; p < n; p++) {
      dark[p] = lum[p] < darkCut ? 1 : 0;
      struct[p] = Math.min(1, struct[p] / gRef);
      /* Motion support: the face is the part of the frame that moves. Zero on
         the first frame, when there is nothing to difference against. */
      motion[p] = hasPrev ? Math.min(1, Math.abs(lum[p] - prev[p]) / 24) : 0;
    }
    prev.set(lum);
    this._lumReady = true;

    /* ── Search face-shaped windows, every statistic read from the tables ── */
    this._integral(lum, this._iiY);
    this._integral(skin, this._iiSkin);
    this._integral(struct, this._iiStruct);
    this._integral(dark, this._iiDark);
    this._integral(motion, this._iiMotion);

    const iw = this._iw;
    const tY = this._iiY, tSk = this._iiSkin, tSt = this._iiStruct;
    const tDk = this._iiDark, tMo = this._iiMotion;
    const box = (t, x0, y0, x1, y1) =>
      t[y1 * iw + x1] - t[y0 * iw + x1] - t[y1 * iw + x0] + t[y0 * iw + x0];

    let best = null;
    for (let hi = 0; hi < FACE_SEARCH_HEIGHTS.length; hi++) {
      const h = FACE_SEARCH_HEIGHTS[hi];
      const w = Math.max(6, Math.round(h * FACE_ASPECT));
      if (w > PROC_W || h > PROC_H) continue;
      for (let y0 = 0; y0 + h <= PROC_H; y0 += FACE_SEARCH_STEP) {
        for (let x0 = 0; x0 + w <= PROC_W; x0 += FACE_SEARCH_STEP) {
          const x1 = x0 + w, y1 = y0 + h;
          const area = w * h;
          const cov = area / n;
          if (cov < FACE_MIN_COVERAGE || cov > FACE_MAX_COVERAGE) continue;

          const skinM = box(tSk, x0, y0, x1, y1) / area / 255;
          const structM = box(tSt, x0, y0, x1, y1) / area;
          const darkM = box(tDk, x0, y0, x1, y1) / area;
          const motionM = box(tMo, x0, y0, x1, y1) / area;
          const meanY = box(tY, x0, y0, x1, y1) / area;

          const aspect = w / h;
          const aspectPrior = Math.exp(-(((aspect - FACE_ASPECT) / FACE_ASPECT_SIGMA) ** 2));
          const cxN = (x0 + x1) / 2 / PROC_W;
          const cyN = (y0 + y1) / 2 / PROC_H;
          const centrePrior = 0.6 + 0.4 * Math.max(0, 1 - Math.hypot(cxN - 0.5, cyN - 0.5) / 0.7);
          /* Brightness gate, relative to the frame's own median: hair, a shirt
             and a shadowed corner are dark AND highly textured, so without this
             the score simply picks the hair. Soft floor, so a dark-complexioned
             face in dim light is damped rather than banned. */
          const brightPrior = BRIGHT_PRIOR_FLOOR + (1 - BRIGHT_PRIOR_FLOOR) *
            Math.min(1, Math.max(0, (meanY / medY - BRIGHT_PRIOR_MID) / (1 - BRIGHT_PRIOR_MID)));
          /* Size prior with a floor: a mean-structure score otherwise always
             prefers the small window containing only the eye/beard texture,
             because averaging over a small high-contrast patch beats averaging
             over a whole face with smooth cheeks. Tuned against three frames
             (the real one, a clean synthetic ellipse and a blue-shifted copy). */
          const sizePrior = Math.min(1, Math.max(SIZE_PRIOR_FLOOR, cov / SIZE_PRIOR_FULL));

          const score = (W_SKIN * skinM + W_STRUCT * structM + W_DARK * darkM + W_MOTION * motionM)
            * aspectPrior * centrePrior * brightPrior * sizePrior;
          if (!best || score > best.score) {
            best = { score, x0, y0, x1, y1, skinM, structM, darkM, cov };
          }
        }
      }
    }
    if (!best || best.score < FACE_MIN_SCORE) return { found: false };

    /* ── Fit the region and its moments to the evidence inside the winner ──
       The searched window is grid-constrained and always the same aspect, so it
       is a seed, not a measurement. The moments of the evidence inside it give
       a centre and a spread that actually move when the head turns — and the
       spread is what the pose's turn term reads. Evidence is skin OR structure;
       under a cast the skin half goes quiet and the structure half carries it. */
    const padX = Math.max(2, Math.round((best.x1 - best.x0) * 0.15));
    const padY = Math.max(2, Math.round((best.y1 - best.y0) * 0.15));
    const wx0 = Math.max(0, best.x0 - padX), wx1 = Math.min(PROC_W, best.x1 + padX);
    const wy0 = Math.max(0, best.y0 - padY), wy1 = Math.min(PROC_H, best.y1 + padY);
    const brightCut = EVID_BRIGHT * medY;

    let cnt = 0, sx = 0, sy = 0;
    for (let y = wy0; y < wy1; y++) {
      const row = y * PROC_W;
      for (let x = wx0; x < wx1; x++) {
        const p = row + x;
        if (skin[p] <= EVID_SKIN * 255 && !(struct[p] >= EVID_STRUCT && lum[p] > brightCut)) continue;
        cnt++; sx += x; sy += y;
      }
    }
    if (cnt < 8) {
      /* Nothing to fit: fall back to the searched window itself, centre and
         spread from the window, so the caller still gets a usable lock. */
      const w = best.x1 - best.x0, h = best.y1 - best.y0;
      return {
        found: true,
        x: best.x0 / PROC_W, y: best.y0 / PROC_H, w: w / PROC_W, h: h / PROC_H,
        cx: (best.x0 + best.x1) / 2 / PROC_W, cy: (best.y0 + best.y1) / 2 / PROC_H,
        sigX: (w / 2) / PROC_W, sigY: (h / 2) / PROC_H,
        coverage: best.cov, fill: 0, rollRaw: 0,
        score: best.score, basis: this._basisOf(best),
      };
    }
    const mcx = sx / cnt, mcy = sy / cnt;

    let vxx = 0, vyy = 0, vxy = 0;
    for (let y = wy0; y < wy1; y++) {
      const row = y * PROC_W;
      for (let x = wx0; x < wx1; x++) {
        const p = row + x;
        if (skin[p] <= EVID_SKIN * 255 && !(struct[p] >= EVID_STRUCT && lum[p] > brightCut)) continue;
        const dx = x - mcx, dy = y - mcy;
        vxx += dx * dx;
        vyy += dy * dy;
        vxy += dx * dy;
      }
    }
    /* +0.5 keeps a degenerate spread from dividing by ~zero later. */
    const sigX = Math.sqrt(vxx / cnt) + 0.5;
    const sigY = Math.sqrt(vyy / cnt) + 0.5;

    /* Principal axis: a face is taller than wide, so the major axis points
       straight up when the head is upright and its deviation is the tilt that
       gets published as roll. */
    const theta = 0.5 * Math.atan2(2 * (vxy / cnt), (vxx / cnt) - (vyy / cnt));
    const rollRaw = wrapTilt((theta * 180) / Math.PI - 90);

    /* The PUBLISHED box keeps the searched window's SIZE but is centred on the
       evidence, not on the search position. Measured on a live camera: the
       search window sat about a tenth of the frame off the face, with one edge
       on the wall and the other cutting the cheek, while the evidence moments
       were on the face. Size stays the window's because that is the part the
       priors validated; the moments are not used for the size, because with the
       colour channel silent they can shrink onto whichever features are
       visible. Centring also keeps the drawn centre dot inside the drawn box. */
    const halfW = (best.x1 - best.x0) / 2;
    const halfH = (best.y1 - best.y0) / 2;
    const bx0 = Math.max(0, Math.min(PROC_W - 2 * halfW, Math.round(mcx - halfW)));
    const by0 = Math.max(0, Math.min(PROC_H - 2 * halfH, Math.round(mcy - halfH)));
    const bx1 = bx0 + 2 * halfW;
    const by1 = by0 + 2 * halfH;

    /* How much of the box is actually face evidence. Reported alongside the box
       area because the box area is a CONSTANT of the search scale — a live
       camera showed "FACE REGION OF FRAME 37.1%" holding perfectly still while
       the face moved, which made a fixed number look like a measurement. */
    let filled = 0, boxPixels = 0;
    for (let y = by0; y < Math.round(by1); y++) {
      const row = y * PROC_W;
      for (let x = bx0; x < Math.round(bx1); x++) {
        const p = row + x;
        boxPixels++;
        if (skin[p] > EVID_SKIN * 255 || (struct[p] >= EVID_STRUCT && lum[p] > brightCut)) filled++;
      }
    }

    return {
      found: true,
      x: bx0 / PROC_W, y: by0 / PROC_H,
      w: (bx1 - bx0) / PROC_W, h: (by1 - by0) / PROC_H,
      cx: mcx / PROC_W, cy: mcy / PROC_H,
      sigX: sigX / PROC_W, sigY: sigY / PROC_H,
      coverage: (bx1 - bx0) * (by1 - by0) / n,
      fill: boxPixels ? filled / boxPixels : 0,
      rollRaw,
      score: best.score,
      basis: this._basisOf(best),
    };
  }

  /** Which channel carried the detection — shown in the UI, because a lock held
   *  by structure alone is far less certain than one held by real skin colour. */
  _basisOf(b) {
    const colour = b.skinM >= 0.30;
    const structure = b.structM >= 0.35;
    if (colour && structure) return 'colour+structure';
    if (colour) return 'colour';
    if (structure) return 'structure';
    return 'weak';
  }

  /**
   * Track the face region across frames and derive the lock status.
   * A single dropped frame must not flicker the lock or blank a reading
   * mid-measurement, so the last box is held for FACE_LOST_MS.
   */
  _trackFace(cur) {
    const now = performance.now();
    const det = this._detectFace(cur);
    const f = this.face;

    if (det.found) {
      /* One-pole smoothing: the raw mask edge moves a pixel or two every frame
         and an unsmoothed box is unreadable. Acquisition snaps — easing in
         would make the box swim into place on first lock. */
      const a = f.found ? 0.35 : 1;
      f.x += (det.x - f.x) * a;
      f.y += (det.y - f.y) * a;
      f.w += (det.w - f.w) * a;
      f.h += (det.h - f.h) * a;
      f.cx += (det.cx - f.cx) * a;
      f.cy += (det.cy - f.cy) * a;
      f.sigX += (det.sigX - f.sigX) * a;
      f.sigY += (det.sigY - f.sigY) * a;
      f.rollRaw = f.found ? f.rollRaw + (det.rollRaw - f.rollRaw) * a : det.rollRaw;
      f.coverage = det.coverage;
      f.fill = det.fill;
      f.found = true;
      f.status = 'locked';
      f.score = det.score;
      f.basis = det.basis;
      /* Confidence belongs to the LOCK, not to the pose, so it is computed here
         and not in _updatePose — which returns early before a neutral exists.
         It used to be set there, so an uncalibrated session reported
         "LOCKED · CONFIDENCE 0%" for a perfectly good lock (caught in browser
         verification). */
      f.confidence = +clamp((det.score - FACE_MIN_SCORE) / (0.75 - FACE_MIN_SCORE), 0.05, 1).toFixed(3);
      this.faceRaw = {
        cx: det.cx, cy: det.cy, sigX: det.sigX, sigY: det.sigY,
        rollRaw: det.rollRaw, coverage: det.coverage, basis: det.basis,
      };
      this.faceSeenAt = now;
    } else if (now - this.faceSeenAt < FACE_LOST_MS) {
      /* Hold window — keep the last box and keep reporting it as locked. */
      f.status = this.faceSeenAt ? 'locked' : 'searching';
    } else {
      f.found = false;
      f.status = this.faceSeenAt ? 'lost' : 'searching';
      this.faceRaw = null;
      f.basis = '—';
      f.score = 0;
    }

    this._updatePose(f);
  }

  /**
   * Coarse head pose from the face region, relative to the calibrated neutral.
   *
   * Everything here is a documented PROXY, signed and scaled to read sensibly
   * beside the mirrored preview — not to be a goniometer. Two real confounds,
   * stated rather than hidden:
    *   - a lateral or vertical head TRANSLATION (sliding without turning) moves
    *     the centroid exactly like a yaw or pitch, so the shift terms cannot
    *     tell those apart;
    *   - the "narrowing" terms use the RATIO of the region's two spreads, not
    *     its size, so leaning towards or away from the camera does NOT fire
    *     them (both spreads scale together and the ratio does not move). Only a
    *     turn changes the ratio.
    * Values stay null until calibrate() has stored a neutral.
    */
  _updatePose(f) {
    const n = this.neutral;

    /* The pose can be unavailable for four different reasons, and they do not
       mean the same thing to the subject, so each carries its own note instead
       of one shared dash. */
    if (!f.found) {
      f.yaw = null; f.pitch = null; f.roll = null;
      f.poseNote = 'no face';
      return null;
    }
    if (!n) {
      f.yaw = null; f.pitch = null; f.roll = null;
      f.poseNote = 'calibrate to set the neutral';
      return null;
    }
    /* THE POSE NEEDS THE COLOUR CHANNEL. Its turn term reads the ratio of the
       region's two spreads, and when only structure carries the lock that ratio
       swings with which features happen to be visible. Reported from a live
       camera on a face looking straight at the lens: yaw -60.0 deg (the clamp),
       pitch +17.3, roll +34.1 — with the calibration baseline in a different
       place again. A saturated angle is worse than no angle, so a
       structure-only lock reports why instead of a number. */
    const colourNow = String(f.basis).indexOf('colour') >= 0;
    const colourBaseline = String(n.basis || '').indexOf('colour') >= 0;
    if (!colourNow) {
      f.yaw = null; f.pitch = null; f.roll = null;
      f.poseNote = 'no colour lock — this lighting has silenced the skin channel';
      return null;
    }
    if (!colourBaseline) {
      f.yaw = null; f.pitch = null; f.roll = null;
      f.poseNote = 'baseline captured without a colour lock — re-calibrate';
      return null;
    }

    const nAspect = n.sigX / Math.max(1e-6, n.sigY);
    const aspect = f.sigX / Math.max(1e-6, f.sigY);

    const shiftX = (f.cx - n.cx) / Math.max(0.02, n.sigX);
    const yawNarrow = Math.max(0, 1 - aspect / nAspect);
    const shiftY = (f.cy - n.cy) / Math.max(0.02, n.sigY);
    const pitchNarrow = Math.max(0, aspect / nAspect - 1);

    /* The narrowing terms carry no direction of their own — a head that simply
       turned away narrows the region symmetrically — so the direction comes
       from the centroid displacement, and only past the dead zone. Inside it
       the two terms would otherwise fight each other over noise. */
    const dirX = Math.abs(shiftX) < POSE_DIR_DEADZONE ? 0 : Math.sign(shiftX);
    const dirY = Math.abs(shiftY) < POSE_DIR_DEADZONE ? 0 : Math.sign(shiftY);

    /* Negated so the numbers agree with the mirrored selfie preview beside
       them: move your head and the box and the reading travel the same way on
       screen. PITCH is positive looking up. */
    f.yaw = +clamp(-(shiftX * YAW_PER_SHIFT + dirX * yawNarrow * YAW_PER_SHRINK), -60, 60).toFixed(1);
    f.pitch = +clamp(-(shiftY * PITCH_PER_SHIFT + dirY * pitchNarrow * PITCH_PER_SHRINK), -50, 50).toFixed(1);
    f.roll = +wrapTilt(-(f.rollRaw - n.roll)).toFixed(1);

    /* `confidence` is set by _trackFace, from the detector's score: it describes
       the LOCK, not the pose, so it must not depend on a neutral existing. */
    f.poseNote = '';
    return f;
  }

  /** Global motion by exhaustive block matching over a small window. */
  _globalMotion(a, b) {
    let best = { score: Infinity, dx: 0, dy: 0 };

    /* Only the central band is matched: the edges of a webcam frame usually
       contain background that does not move with the head. */
    const m = 6;
    const x0 = m, x1 = PROC_W - m, y0 = m, y1 = PROC_H - m;

    for (let dy = -SEARCH; dy <= SEARCH; dy += 2) {
      for (let dx = -SEARCH; dx <= SEARCH; dx += 2) {
        let s = 0, n = 0;
        for (let y = y0; y < y1; y += 3) {
          for (let x = x0; x < x1; x += 3) {
            const sx = x + dx, sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= PROC_W || sy >= PROC_H) continue;
            const i0 = y * PROC_W + x;
            const i1 = sy * PROC_W + sx;
            s += Math.abs(b[i0] - a[i1]);
            n++;
          }
        }
        if (!n) continue;
        const score = s / n;
        if (score < best.score) best = { score, dx, dy };
      }
    }
    best.score = best.score === Infinity ? 0 : best.score;
    return best;
  }

  _analyse() {
    if (!this.running) return;
    const cur = this._grab();
    if (!cur) return;

    const now = performance.now();
    if (this.lastT) this.hz.push(1000 / (now - this.lastT));
    this.lastT = now;

    if (this.prev) {
      const g = this._globalMotion(this.prev.grey, cur.grey);

      /* motion energy 0..1 — 40 grey levels of change reads as "full motion" */
      let diffSum = 0;
      const a = this.prev.grey, b = cur.grey;
      for (let i = 0; i < b.length; i += 2) diffSum += Math.abs(b[i] - a[i]);
      const energy = Math.min(1, (diffSum / (b.length / 2)) / 40);

      /* residual = motion left after removing the global translation.
         High residual with low translation = oscillation, not travel. */
      let resid = 0, rn = 0;
      const m = 6;
      for (let y = m; y < PROC_H - m; y += 3) {
        for (let x = m; x < PROC_W - m; x += 3) {
          const sx = x + g.dx, sy = y + g.dy;
          if (sx < 0 || sy < 0 || sx >= PROC_W || sy >= PROC_H) continue;
          resid += Math.abs(b[y * PROC_W + x] - a[sy * PROC_W + sx]);
          rn++;
        }
      }
      const residual = rn ? Math.min(1, (resid / rn) / 40) : 0;

      this.motionEnergy = energy;
      this.jitter = Math.max(0, residual - energy * 0.25);
      this.dx = g.dx;
      this.dy = g.dy;
    }

    /* Face scan runs on this same frame, so the box, the pose and the motion
       number all describe one instant rather than three neighbouring ones. */
    this._trackFace(cur);
    this._trackEyes(now);

    this.centroidX = this.centroidX + (cur.cx - this.centroidX) * 0.12;
    this.centroidY = this.centroidY + (cur.cy - this.centroidY) * 0.12;
    this.prev = cur;
    this.samples++;

    this._publish();
  }

  _publish() {
    /* Subtract this device's own measured noise floor before anything
       downstream sees the numbers. Without this, holding perfectly still
       still read as several degrees/second of "head motion" on a noisy
       webcam, which is what made the raw signal unconvincing as a
       measurement rather than a decoration. */
    const nf = this.noiseFloor;
    const energyClean = Math.max(0, this.motionEnergy - nf.energy);
    const jitterClean = Math.max(0, this.jitter - nf.jitter);
    const travelPx = Math.hypot(this.dx, this.dy);
    const travelClean = Math.max(0, travelPx - nf.travel);

    const jitterDeg = jitterClean * 18;                 // deg-equivalent scale
    const travelDeg = travelClean * 1.1;

    /* Face scan, published alongside the motion number. `eyeLandmarks: false`
       is part of the payload rather than a comment because it is the reason
       `eyeHead` below is null: a consumer should never have to guess why the
       eye half of eye-head coordination is missing. Pose values are null until
       calibrate() stores a neutral — see _updatePose(). */
    const f = this.face;
    const eye = {
      status: this.eye.status,
      /* The reason the local landmark model could not start, carried through to
         the UI. It used to be captured and then never shown anywhere, so a
         failed model load was indistinguishable from "no face in frame" — the
         panel just said UNAVAILABLE with no way to tell why. */
      error: this.eye.error || null,
      available: this.eye.available,
      gazeX: this.eye.gazeX,
      gazeY: this.eye.gazeY,
      neutralX: this.eye.neutralX,
      neutralY: this.eye.neutralY,
      confidence: this.eye.confidence,
      points: this.eye.available ? this.eye.points : null,
      stableFrames: this.eye.stableFrames,
      lastAt: this.eye.lastAt,
      method: this.eye.method,
      /* This is a face-relative visual offset, deliberately not degrees and
         deliberately not an eye-head/VOR score. */
      offset: this.eye.available && this.eye.neutralX !== null
        ? Math.hypot(this.eye.gazeX - this.eye.neutralX, this.eye.gazeY - this.eye.neutralY)
        : null,
    };
    const face = {
      status: f.status,
      found: f.found,
      x: +f.x.toFixed(4),
      y: +f.y.toFixed(4),
      w: +f.w.toFixed(4),
      h: +f.h.toFixed(4),
      cx: +f.cx.toFixed(4),
      cy: +f.cy.toFixed(4),
      sigX: +f.sigX.toFixed(4),
      sigY: +f.sigY.toFixed(4),
      coverage: +f.coverage.toFixed(4),
      fill: +f.fill.toFixed(4),
      yaw: f.yaw,
      pitch: f.pitch,
      roll: f.roll,
      /* Why the pose is blank, when it is: "calibrate to set the neutral",
         "no colour lock …", "baseline captured without a colour lock …",
         "no face". The UI prints the reason instead of a dash, so nobody has to
         guess whether a blank pose means "not set up yet" or "not measurable in
         this light". */
      poseNote: f.poseNote || '',
      confidence: f.confidence,
      /* Which channel is holding the lock. "structure" means the colour rule
         found nothing and the lock rests on contrast, shape and motion instead
         — far less certain, and the UI says so rather than showing the same
         confidence either way. */
      basis: f.basis,
      score: +f.score.toFixed(4),
      estimated: true,
      method: f.method,
      eyeLandmarks: this.eye.available,
      eye,
      neutral: !!this.neutral,
      neutralNote: this.neutralNote,
    };

    bus.emit('sample', {
      source: 'camera',
      t: performance.now(),
      calibrated: this.calibrated,
       /* Camera-only truth: this provider measures head motion, not gaze.
          There is no invented eye-head/VOR number in the live contract. */
       headMotion: +(travelDeg * 3 + jitterDeg * 0.7).toFixed(2),
       eyeHead: null,
       eye,
      lateral: +((this.centroidX - 0.5) * 40).toFixed(2),
      vertical: +((this.centroidY - 0.5) * 40).toFixed(2),
      rateHz: +this.hz.mean().toFixed(1),
      /* Quality reflects both sample maturity and calibration state: an
         uncalibrated stream is reporting against the conservative default
         floor, not this device's actual noise, so it is marked down. */
      quality: this.samples < 12 ? 0.35 : (this.calibrated ? 1 : 0.7) - Math.min(0.6, jitterClean),
      raw: {
        motionEnergy: +energyClean.toFixed(4),
        jitter: +jitterClean.toFixed(4),
        dx: this.dx,
        dy: this.dy,
      },
      face,
    });

    /* Persist the same realtime camera output in the shared store so HUD,
       Mission Console and integration UI can render the actual live stream,
       not only listen to a transient event. */
    set({ camera: {
      ...state.camera,
      running: this.running,
      calibrated: this.calibrated,
      samples: this.samples,
       rateHz: +this.hz.mean().toFixed(1),
       headMotion: +(travelDeg * 3 + jitterDeg * 0.7).toFixed(2),
       eyeHead: null,
       eye,
       motionEnergy: +energyClean.toFixed(4),
      jitter: +jitterClean.toFixed(4),
      dx: this.dx, dy: this.dy,
      quality: Math.max(0, Math.min(1, this.samples < 12 ? 0.35 : (this.calibrated ? 1 : 0.7) - Math.min(0.6, jitterClean))),
      face,
      lastAt: performance.now(),
    } }, ['camera']);
  }
}
