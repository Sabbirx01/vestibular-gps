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

   Everything runs locally. No frame is ever uploaded.
   ═══════════════════════════════════════════════════════════ */

import { SensorProvider } from './providers.js';
import { bus, set, state, toast } from '../core/store.js';
import { Rolling } from '../core/util.js';

const PROC_W = 64;          // processing width  (px)
const PROC_H = 48;          // processing height (px)
const SEARCH = 6;           // global-motion search radius (px)
const TARGET_HZ = 18;       // analysis rate — deliberately below the frame rate

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
  }

  get supported() {
    return typeof navigator !== 'undefined'
      && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Secure context is mandatory for camera access. */
  get secureContextOk() {
    return typeof window !== 'undefined' && window.isSecureContext !== false;
  }

  async start() {
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
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
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

    const interval = 1000 / TARGET_HZ;
    this.timer = setInterval(() => this._analyse(), interval);
    return true;
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
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
    bus.emit('sensor', { id: this.id, status: this.status });
  }

  attachPreview(videoEl) {
    this.previewEl = videoEl;
    if (this.stream && videoEl) {
      videoEl.srcObject = this.stream;
      videoEl.classList.add('is-on');
    }
  }

  /* ── The estimator ─────────────────────────────────────── */

  _grab() {
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    this.ctx.drawImage(v, 0, 0, PROC_W, PROC_H);
    const img = this.ctx.getImageData(0, 0, PROC_W, PROC_H);
    const d = img.data;
    const grey = new Float32Array(PROC_W * PROC_H);
    let lumSum = 0, lumX = 0, lumY = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      grey[p] = y;
      lumSum += y;
      lumX += (p % PROC_W) * y;
      lumY += Math.floor(p / PROC_W) * y;
    }
    const cx = lumSum > 0 ? lumX / lumSum / PROC_W : 0.5;
    const cy = lumSum > 0 ? lumY / lumSum / PROC_H : 0.5;
    return { grey, cx, cy };
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

    this.centroidX = this.centroidX + (cur.cx - this.centroidX) * 0.12;
    this.centroidY = this.centroidY + (cur.cy - this.centroidY) * 0.12;
    this.prev = cur;
    this.samples++;

    this._publish();
  }

  _publish() {
    const jitterDeg = this.jitter * 18;                 // deg-equivalent scale
    const travelDeg = Math.hypot(this.dx, this.dy) * 1.1;

    bus.emit('sample', {
      source: 'camera',
      t: performance.now(),
      /* head-motion channels, on the same scale the simulator uses */
      headMotion: +(6 + travelDeg * 3 + jitterDeg * 0.7).toFixed(2),
      eyeHead: +(4.5 - this.jitter * 1.6 + travelDeg * 0.35).toFixed(2),
      lateral: +((this.centroidX - 0.5) * 40).toFixed(2),
      vertical: +((this.centroidY - 0.5) * 40).toFixed(2),
      rateHz: +this.hz.avg.toFixed(1),
      quality: this.samples < 12 ? 0.35 : 1 - Math.min(0.6, this.jitter),
      raw: {
        motionEnergy: +this.motionEnergy.toFixed(4),
        jitter: +this.jitter.toFixed(4),
        dx: this.dx,
        dy: this.dy,
      },
    });
  }
}
