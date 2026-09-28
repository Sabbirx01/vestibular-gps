/* ═══════════════════════════════════════════════════════════
   store — the single source of truth.
   Every number rendered anywhere in the UI is read from here.
   Nothing in this app renders a hard-coded moving value.
   ═══════════════════════════════════════════════════════════ */

import { clamp, damp, angDiff, Rolling, fmt } from './util.js';

/* ── Event bus ──────────────────────────────────────────── */
class Bus {
  constructor() { this.map = new Map(); }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) { this.map.get(evt)?.delete(fn); }
  emit(evt, data) {
    this.map.get(evt)?.forEach((fn) => { try { fn(data); } catch (e) { console.error(`[bus:${evt}]`, e); } });
    this.map.get('*')?.forEach((fn) => { try { fn({ evt, data }); } catch (e) { console.error(e); } });
  }
}
export const bus = new Bus();

/* ── Quality tiers ──────────────────────────────────────── */
export const QUALITY_PRESETS = {
  ULTRA:  { dpr: 2,    stars: 9000, nebula: true,  dust: 1600, bloom: true,  shadow: true,  astronautDetail: 'high', particles: 2200 },
  HIGH:   { dpr: 1.75, stars: 6000, nebula: true,  dust: 1000, bloom: true,  shadow: false, astronautDetail: 'high', particles: 1400 },
  MEDIUM: { dpr: 1.5,  stars: 3600, nebula: true,  dust: 520,  bloom: false, shadow: false, astronautDetail: 'mid',  particles: 800 },
  LOW:    { dpr: 1,    stars: 1800, nebula: false, dust: 200,  bloom: false, shadow: false, astronautDetail: 'low',  particles: 320 },
  MOBILE: { dpr: 1,    stars: 1200, nebula: false, dust: 120,  bloom: false, shadow: false, astronautDetail: 'low',  particles: 200 },
};
const TIER_ORDER = ['MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

/* ── Initial state ────────────────────────────────────────
   `quality` here is only the value before initEnvironment() runs; the real
   tier comes from detectQuality() below, which probes the WebGL renderer, the
   core count, memory and the user agent, and respects a stored choice.
   A second, simpler picker briefly existed here and was removed: a browser
   check showed it returning MOBILE correctly at phone width while
   initEnvironment() overwrote it back to HIGH, so the site had two answers to
   one question. One path is enough, and the thorough one is the one that was
   already wired in. */
export const state = {
  booted: false,
  introDone: false,
  started: false,

  /* environment */
  mode: 'EARTH',              // EARTH | MOON | MARS | MICROGRAVITY
  source: 'SIMULATION',       // SIMULATION | LIVE_SENSOR | REPLAY
  quality: 'HIGH',            // replaced at boot by detectQuality()
  qualityLocked: false,
  reducedMotion: false,
  sound: false,
  debug: false,

  /* sensor permissions */
  perms: { orientation: 'idle', motion: 'idle', geo: 'idle' },

  /* raw stream */
  raw: {
    alpha: 0, beta: 0, gamma: 0,           // device orientation, degrees
    accel: { x: 0, y: 0, z: 0 },           // m/s^2, gravity included
    accelNoG: { x: 0, y: 0, z: 0 },
    gyro: { x: 0, y: 0, z: 0 },            // deg/s
    gravity: { x: 0, y: 0, z: 1 },
    interval: 0,
  },

  /* smoothed / derived — what the 3D scene and HUD actually consume */
  sample: { yaw: 0, pitch: 0, roll: 0, yawRate: 0, pitchRate: 0, rollRate: 0, jerk: 0, accelMag: 1, sway: 0 },
  attitude: { yaw: 0, pitch: 0, roll: 0 },

  /* link quality */
  link: { hz: 0, latencyMs: 0, strength: 0, samples: 0, lastAt: 0, stale: true },

  /* camera pipeline telemetry — updated by CameraProvider at analysis rate.
     `face` is the face-scan channel: region lock status plus a coarse head pose
     in degrees, null until calibrate() stores a neutral. It is labelled an
     estimate everywhere it is shown — see the FACE SCAN note in
     src/sensors/webcam.js for what it can and cannot measure. */
  camera: {
    running: false, calibrated: false, samples: 0, rateHz: 0,
    headMotion: 0, eyeHead: 0, motionEnergy: 0, jitter: 0,
    dx: 0, dy: 0, quality: 0, lastAt: 0,
    face: null,
  },

  geo: null,

  /* focus / interaction */
  focus: null,                 // id of the focused 3D object
  activeSection: 'sec-hero',

  /* recorder */
  recorder: { recording: false, playing: false, samples: [], durationMs: 0, sizeKb: 0 },

  /* engine telemetry */
  engine: { ready: false, mode: '—', fps: 60, calls: 0, tris: 0, objects: 0, failed: null },

  /* lab */
  lab: { active: null, running: false, results: null },

  time: { started: 0, elapsed: 0, utc: '' },
};

/* ── Subscriptions ──────────────────────────────────────── */
const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notify(changed) {
  for (const fn of subs) { try { fn(state, changed); } catch (e) { console.error('[sub]', e); } }
}

/** Patch state and notify. `changed` lets subscribers skip cheaply. */
export function set(patch, changed = Object.keys(patch)) {
  Object.assign(state, patch);
  notify(changed);
}

/* ── UI-level events that are not app state ─────────────── */
export function toast(title, msg, kind = 'info', ms = 5200) {
  bus.emit('toast', { title, msg, kind, ms });
}
export function showError(code, msg) {
  set({ engine: { ...state.engine, failed: code } });
  toast(code, msg, 'err', 8000);
  bus.emit('error-ui', { code, msg });
}

/* ── Device capability detection ────────────────────────── */
export function detectQuality() {
  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer:coarse)').matches);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 0;
  const dpr = window.devicePixelRatio || 1;
  const small = Math.min(innerWidth, innerHeight) < 700;

  let gl = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2') || c.getContext('webgl');
  } catch { /* handled below */ }
  if (!gl) return { tier: 'LOW', reason: 'No WebGL context available' };

  let renderer = 'unknown', maxTex = 0;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || renderer;
    maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
  } catch { /* ignore */ }

  const soft = /SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(renderer);
  const weak = cores <= 4 && small;
  let tier = 'HIGH';
  if (soft) tier = 'LOW';
  else if (isMobile) tier = small ? 'MOBILE' : 'MEDIUM';
  else if (weak && (mem && mem <= 4)) tier = 'MEDIUM';
  else if (cores >= 12 && dpr >= 1.5 && !small) tier = 'ULTRA';

  const reason = `renderer="${renderer}" cores=${cores} mem=${mem || '?'}GB dpr=${dpr} mobile=${isMobile} maxTex=${maxTex}`;
  const webgpu = !!navigator.gpu;
  return { tier, reason, renderer, webgpu, isMobile, maxTex };
}

export function initEnvironment() {
  const det = detectQuality();
  const stored = localStorage.getItem('vgps.quality');
  const tier = stored && QUALITY_PRESETS[stored] ? stored : det.tier;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.dataset.quality = tier;
  document.documentElement.dataset.reducedMotion = String(reduced);
  document.documentElement.style.setProperty('--q-glow', String(QUALITY_PRESETS[tier].bloom ? 1 : 0.45));

  set({
    quality: tier,
    qualityLocked: !!stored,
    reducedMotion: reduced,
    engine: { ...state.engine, mode: det.webgpu ? 'WEBGPU CAPABLE / WEBGL' : 'WEBGL' },
  }, ['quality', 'reducedMotion', 'engine']);

  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    document.documentElement.dataset.reducedMotion = String(e.matches);
    set({ reducedMotion: e.matches }, ['reducedMotion']);
  });

  return det;
}

export function setQuality(tier, persist = true) {
  if (!QUALITY_PRESETS[tier]) return;
  document.documentElement.dataset.quality = tier;
  document.documentElement.style.setProperty('--q-glow', String(QUALITY_PRESETS[tier].bloom ? 1 : 0.45));
  if (persist) localStorage.setItem('vgps.quality', tier);
  set({ quality: tier }, ['quality']);
  bus.emit('quality', tier);
}

export function stepQuality(down = true) {
  const i = TIER_ORDER.indexOf(state.quality);
  const next = TIER_ORDER[clamp(i + (down ? -1 : 1), 0, TIER_ORDER.length - 1)];
  if (next !== state.quality) {
    setQuality(next, false);
    toast('QUALITY ADAPTED', `Render profile reduced to ${next} to protect frame rate.`, 'warn');
  }
}

/* ── The signal processor ───────────────────────────────────
   Raw sensor values arrive noisy, asynchronous and in whatever
   units the browser feels like. This normalises them into the
   one smoothed `sample` object the rest of the app reads.
   ─────────────────────────────────────────────────────────── */
const R = {
  yawRate: new Rolling(90), pitchRate: new Rolling(90), rollRate: new Rolling(90),
  jerk: new Rolling(60), alpha: new Rolling(120), interval: new Rolling(60),
};

let prevAttitude = null;
let prevSampleAt = 0;
let lastSampleStamp = 0;
let hzWindow = [];

export function ingest(source, payload) {
  const now = performance.now();

  if (source === 'orientation') {
    state.raw.alpha = payload.alpha;
    state.raw.beta = payload.beta;
    state.raw.gamma = payload.gamma;
  } else if (source === 'motion') {
    state.raw.accel = payload.accel;
    state.raw.accelNoG = payload.accelNoG;
    state.raw.gyro = payload.gyro;
    state.raw.gravity = payload.gravity;
    state.raw.interval = payload.interval;
    R.interval.push(payload.interval);
  }

  /* derive attitude from orientation if present, else integrate gyro */
  let yaw = state.raw.alpha;
  let pitch = state.raw.beta;
  let roll = state.raw.gamma;

  if (source === 'motion' && !Number.isFinite(state.raw.alpha)) {
    const dt = Math.max(1, now - prevSampleAt) / 1000;
    state.attitude.yaw += state.raw.gyro.z * dt;
    state.attitude.pitch += state.raw.gyro.x * dt;
    state.attitude.roll += state.raw.gyro.y * dt;
    yaw = state.attitude.yaw; pitch = state.attitude.pitch; roll = state.attitude.roll;
  } else {
    state.attitude.yaw = yaw; state.attitude.pitch = pitch; state.attitude.roll = roll;
  }

  const dt = prevSampleAt ? Math.min(0.25, Math.max(0.004, (now - prevSampleAt) / 1000)) : 0.016;
  prevSampleAt = now;

  /* rates: prefer the gyroscope, fall back to finite difference of attitude */
  let yawRate, pitchRate, rollRate;
  if (source === 'motion' && (Math.abs(state.raw.gyro.z) + Math.abs(state.raw.gyro.x) + Math.abs(state.raw.gyro.y)) > 0.001) {
    yawRate = state.raw.gyro.z; pitchRate = state.raw.gyro.x; rollRate = state.raw.gyro.y;
  } else if (prevAttitude) {
    yawRate = angDiff(prevAttitude.yaw, yaw) / dt;
    pitchRate = angDiff(prevAttitude.pitch, pitch) / dt;
    rollRate = angDiff(prevAttitude.roll, roll) / dt;
  } else { yawRate = pitchRate = rollRate = 0; }
  prevAttitude = { yaw, pitch, roll };

  R.yawRate.push(yawRate); R.pitchRate.push(pitchRate); R.rollRate.push(rollRate);

  const s = state.sample;
  const prevJerk = s.jerk;
  s.yawRate = damp(s.yawRate, yawRate, 9, dt);
  s.pitchRate = damp(s.pitchRate, pitchRate, 9, dt);
  s.rollRate = damp(s.rollRate, rollRate, 9, dt);

  const angularMag = Math.hypot(s.yawRate, s.pitchRate, s.rollRate);
  s.jerk = damp(prevJerk, Math.abs(angularMag - (R.jerk.last || 0)) / Math.max(dt, 0.004), 6, dt);
  R.jerk.push(angularMag);

  const a = state.raw.accel;
  s.accelMag = damp(s.accelMag, Math.hypot(a.x, a.y, a.z) / 9.80665, 8, dt);
  s.sway = damp(s.sway, Math.abs(a.x) + Math.abs(a.y), 3, dt);

  s.yaw = yaw; s.pitch = pitch; s.roll = roll;

  /* link quality */
  hzWindow.push(now);
  while (hzWindow.length && now - hzWindow[0] > 1000) hzWindow.shift();
  state.link.hz = hzWindow.length;
  state.link.latencyMs = R.interval.mean();
  state.link.strength = clamp(1 - Math.abs(state.link.latencyMs - 16) / 120, 0, 1);
  state.link.samples++;
  state.link.lastAt = performance.now();
  state.link.stale = false;
  lastSampleStamp = now;

  if (state.recorder.recording) {
    state.recorder.samples.push({
      t: Math.round(now - state.time.started),
      yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2), roll: +roll.toFixed(2),
      gy: +yawRate.toFixed(2), gx: +pitchRate.toFixed(2), gz: +rollRate.toFixed(2),
      ax: +a.x.toFixed(3), ay: +a.y.toFixed(3), az: +a.z.toFixed(3),
      src: state.source,
    });
    if (state.recorder.samples.length > 20000) stopRecording('buffer full at 20,000 samples');
  }

  bus.emit('sample', state.sample);
}

/* CameraProvider publishes an already-derived measurement. Keep it as a live
   state channel without pretending it is a gyroscope sample: the camera has
   no yaw/pitch/roll radians, but it does have head-motion and eye-head proxy
   outputs that the Mission Console can consume in realtime. */
export function ingestCamera(payload) {
  if (!payload) return;
  set({ camera: { ...state.camera, ...payload, running: true, lastAt: performance.now() } }, ['camera']);
  bus.emit('camera-sample', { ...state.camera });
}

/** Watchdog: if a "live" stream stops arriving, say so rather than freezing silently. */
export function startLinkWatchdog() {
  setInterval(() => {
    if (!state.link.lastAt) return;
    const gap = performance.now() - state.link.lastAt;
    if (gap > 1500 && !state.link.stale) {
      state.link.stale = true;
      if (state.source === 'LIVE_SENSOR') {
        toast('SENSOR STALE', 'No samples for 1.5 s. Falling back to simulation so the scene keeps running.', 'warn');
        bus.emit('source-request', 'SIMULATION');
      }
      notify(['link']);
    }
  }, 700);
}

/** Clocks, UTC readout, elapsed session time. */
export function startClock() {
  const tick = () => {
    state.time.utc = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    state.time.elapsed = state.time.started ? (performance.now() - state.time.started) / 1000 : 0;
    bus.emit('clock', state.time);
  };
  tick();
  setInterval(tick, 1000);
}

/* ── Recorder controls ──────────────────────────────────── */
export function startRecording() {
  state.recorder.samples = [];
  state.recorder.recording = true;
  state.recorder.playing = false;
  state.recorder.durationMs = 0;
  state.recorder.sizeKb = 0;
  notify(['recorder']);
  toast('RECORDING', 'Capturing the orientation and motion stream locally. Nothing leaves this device.', 'ok', 3600);
}
export function stopRecording(reason) {
  if (!state.recorder.recording) return;
  state.recorder.recording = false;
  const s = state.recorder.samples;
  state.recorder.durationMs = s.length ? s[s.length - 1].t - s[0].t : 0;
  state.recorder.sizeKb = Math.round(JSON.stringify(s).length / 1024);
  notify(['recorder']);
  toast('RECORDING STOPPED', `${s.length} samples · ${(state.recorder.durationMs / 1000).toFixed(1)} s · ${state.recorder.sizeKb} KB${reason ? ` · ${reason}` : ''}`, 'ok');
}

export function debugNumber(v, d = 1) { return Number.isFinite(v) ? fmt(v, d) : '—'; }
