/* ═══════════════════════════════════════════════════════════
   sensors — provider abstraction
   One interface, five implementations. Hardware is never
   assumed: the SimulationProvider always exists so the app is
   fully testable and demonstrable without a single sensor.
   ═══════════════════════════════════════════════════════════ */

import { state, bus, set, ingest, toast } from '../core/store.js';
import { clamp, rad, TAU, mulberry32 } from '../core/util.js';

/* ── Base ───────────────────────────────────────────────── */
export class SensorProvider {
  constructor(id, label) { this.id = id; this.label = label; this.status = 'idle'; this.error = null; }
  get available() { return true; }
  async start() { this.status = 'running'; }
  stop() { this.status = 'idle'; }
  dispose() { this.stop(); }
  _set(status, error = null) {
    this.status = status; this.error = error;
    bus.emit('provider-status', { id: this.id, status, error });
  }
}

/* ── 1. DeviceOrientation ───────────────────────────────── */
export class DeviceOrientationProvider extends SensorProvider {
  constructor() { super('orientation', 'Device Orientation'); this.handler = null; }
  get available() {
    return typeof DeviceOrientationEvent !== 'undefined' || 'ondeviceorientationabsolute' in window;
  }
  get needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
           typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  /** Must be called from a user gesture. Returns the resulting permission string. */
  async requestPermission() {
    if (!this.needsPermission) { set({ perms: { ...state.perms, orientation: 'granted' } }, ['perms']); return 'granted'; }
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      set({ perms: { ...state.perms, orientation: res } }, ['perms']);
      return res;
    } catch (e) {
      set({ perms: { ...state.perms, orientation: 'denied' } }, ['perms']);
      return 'denied';
    }
  }

  async start() {
    if (!this.available) { this._set('unavailable', 'DeviceOrientationEvent is not implemented in this browser'); return false; }
    if (this.needsPermission && state.perms.orientation !== 'granted') {
      this._set('denied', 'Permission has not been granted yet — press "Allow orientation" first.');
      return false;
    }
    this.handler = (e) => {
      if (e.alpha == null && e.beta == null) return;
      this._set('running');
      ingest('orientation', {
        alpha: e.absolute ? e.alpha : (e.webkitCompassHeading != null ? 360 - e.webkitCompassHeading : e.alpha),
        beta: e.beta, gamma: e.gamma,
      });
    };
    window.addEventListener('deviceorientationabsolute', this.handler, true);
    window.addEventListener('deviceorientation', this.handler, true);
    this._set('running');
    return true;
  }
  stop() {
    if (this.handler) {
      window.removeEventListener('deviceorientationabsolute', this.handler, true);
      window.removeEventListener('deviceorientation', this.handler, true);
      this.handler = null;
    }
    this._set('stopped');
  }
}

/* ── 2. DeviceMotion ────────────────────────────────────── */
export class DeviceMotionProvider extends SensorProvider {
  constructor() { super('motion', 'Device Motion'); this.handler = null; }
  get available() { return typeof DeviceMotionEvent !== 'undefined'; }
  get needsPermission() {
    return typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';
  }
  async requestPermission() {
    if (!this.needsPermission) { set({ perms: { ...state.perms, motion: 'granted' } }, ['perms']); return 'granted'; }
    try {
      const res = await DeviceMotionEvent.requestPermission();
      set({ perms: { ...state.perms, motion: res } }, ['perms']);
      return res;
    } catch {
      set({ perms: { ...state.perms, motion: 'denied' } }, ['perms']);
      return 'denied';
    }
  }
  async start() {
    if (!this.available) { this._set('unavailable', 'DeviceMotionEvent is not implemented in this browser'); return false; }
    if (this.needsPermission && state.perms.motion !== 'granted') {
      this._set('denied', 'Permission has not been granted yet — press "Allow motion" first.');
      return false;
    }
    this.handler = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a) return;
      const ag = e.acceleration || { x: 0, y: 0, z: 0 };
      const rr = e.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
      this._set('running');
      ingest('motion', {
        accel: { x: a.x || 0, y: a.y || 0, z: a.z || 0 },
        accelNoG: { x: ag.x || 0, y: ag.y || 0, z: ag.z || 0 },
        gyro: { x: rr.beta || 0, y: rr.gamma || 0, z: rr.alpha || 0 },
        gravity: { x: 0, y: 0, z: 1 },
        interval: e.interval || 16,
      });
    };
    window.addEventListener('devicemotion', this.handler, true);
    this._set('running');
    return true;
  }
  stop() {
    if (this.handler) { window.removeEventListener('devicemotion', this.handler, true); this.handler = null; }
    this._set('stopped');
  }
}

/* ── 3. Geolocation (separate optional layer) ───────────── */
export class GeolocationProvider extends SensorProvider {
  constructor() { super('geo', 'Geolocation'); this.watchId = null; }
  get available() { return 'geolocation' in navigator; }
  async requestPermission() {
    if (!this.available) { set({ perms: { ...state.perms, geo: 'unavailable' } }, ['perms']); return 'unavailable'; }
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => { set({ perms: { ...state.perms, geo: 'granted' } }, ['perms']); this._apply(p); resolve('granted'); },
        () => { set({ perms: { ...state.perms, geo: 'denied' } }, ['perms']); resolve('denied'); },
        { timeout: 9000, maximumAge: 60000 },
      );
    });
  }
  _apply(p) {
    state.geo = {
      lat: +p.coords.latitude.toFixed(4),
      lon: +p.coords.longitude.toFixed(4),
      acc: Math.round(p.coords.accuracy || 0),
      at: p.timestamp,
    };
    bus.emit('geo', state.geo);
  }
  async start() {
    if (!this.available) { this._set('unavailable'); return false; }
    if (state.perms.geo !== 'granted') { this._set('denied', 'Location permission not granted.'); return false; }
    this.watchId = navigator.geolocation.watchPosition((p) => this._apply(p), () => {}, { enableHighAccuracy: false, maximumAge: 30000 });
    this._set('running');
    return true;
  }
  stop() {
    if (this.watchId != null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
    this._set('stopped');
  }
}

/* ── 4. Simulation ──────────────────────────────────────── */
export class SimulationProvider extends SensorProvider {
  constructor() { super('simulation', 'Simulation'); this.raf = 0; this.manual = false; this.script = null; }
  get available() { return true; }

  /* Hand-driven mode: the sensor-simulator sliders write straight into this. */
  setManual(v) {
    this.manual = true;
    ingest('orientation', { alpha: v.yaw, beta: v.pitch, gamma: v.roll });
    ingest('motion', {
      accel: { x: v.acc * 9.80665, y: 0, z: 9.80665 },
      accelNoG: { x: v.acc * 9.80665, y: 0, z: 0 },
      gyro: { x: v.pitchRate || 0, y: v.rollRate || 0, z: v.yawRate || 0 },
      gravity: { x: 0, y: 0, z: 1 },
      interval: 16,
    });
  }

  /** Deterministic scripted motion — used by "Replay motion sequence". */
  playScript(seconds = 14) {
    this.manual = false;
    this.script = { t: 0, dur: seconds, rng: mulberry32(20260928) };
    if (this.status !== 'running') this.start();
    return this.script;
  }

  async start() {
    this._set('running');
    let last = performance.now();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (this.manual) return;

      let yaw, pitch, roll, accX;

      if (this.script) {
        this.script.t += dt;
        const u = clamp(this.script.t / this.script.dur, 0, 1);
        const env = Math.sin(Math.PI * u);                       // smooth fade in/out
        const r = this.script.rng;
        yaw   = 26 * env * Math.sin(TAU * 0.11 * this.script.t) + (r() - 0.5) * 0.6;
        pitch = 12 * env * Math.sin(TAU * 0.17 * this.script.t + 1.1) + (r() - 0.5) * 0.5;
        roll  = 18 * env * Math.sin(TAU * 0.23 * this.script.t + 2.4) + (r() - 0.5) * 0.5;
        accX  = 0.16 * env * Math.sin(TAU * 0.31 * this.script.t) + (r() - 0.5) * 0.02;
        if (u >= 1) { this.script = null; bus.emit('script-done'); }
      } else {
        const t = now / 1000;
        const r = Math.sin;
        yaw   = 9 * r(TAU * 0.055 * t) + 2.4 * r(TAU * 0.21 * t + 0.7);
        pitch = 4.5 * r(TAU * 0.073 * t + 1.3) + 1.2 * r(TAU * 0.27 * t);
        roll  = 6 * r(TAU * 0.067 * t + 2.1) + 1.6 * r(TAU * 0.19 * t + 0.4);
        accX  = 0.05 * r(TAU * 0.09 * t);
      }

      const prev = state.attitude;
      const dYaw = clamp((yaw - prev.yaw) / Math.max(dt, 0.008), -400, 400);
      ingest('orientation', { alpha: yaw, beta: pitch, gamma: roll });
      ingest('motion', {
        accel: { x: accX * 9.80665, y: 0, z: 9.80665 },
        accelNoG: { x: accX * 9.80665, y: 0, z: 0 },
        gyro: { x: 0, y: 0, z: dYaw },
        gravity: { x: 0, y: 0, z: 1 },
        interval: dt * 1000,
      });
    };
    this.raf = requestAnimationFrame(tick);
    return true;
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.script = null; this._set('stopped'); }
}

/* ── 5. Replay (from the recorder buffer) ───────────────── */
export class ReplayProvider extends SensorProvider {
  constructor() { super('replay', 'Replay'); this.raf = 0; this.i = 0; this.t0 = 0; this.speed = 1; }
  get available() { return state.recorder.samples.length > 2; }
  async start() {
    const s = state.recorder.samples;
    if (s.length < 2) { this._set('unavailable', 'Nothing recorded yet — record a session first.'); return false; }
    this.i = 0; this.t0 = performance.now();
    this._set('running');
    const tick = () => {
      const now = performance.now();
      const elapsed = (now - this.t0) * this.speed;
      while (this.i < s.length - 1 && s[this.i + 1].t <= elapsed) this.i++;
      if (this.i >= s.length - 1) { this._set('finished'); bus.emit('replay-done'); return; }
      const a = s[this.i], b = s[this.i + 1] || a;
      const u = b.t === a.t ? 0 : (elapsed - a.t) / (b.t - a.t);
      const mix = (p, q) => p + (q - p) * u;
      ingest('orientation', { alpha: mix(a.yaw, b.yaw), beta: mix(a.pitch, b.pitch), gamma: mix(a.roll, b.roll) });
      ingest('motion', {
        accel: { x: mix(a.ax, b.ax), y: mix(a.ay, b.ay), z: mix(a.az, b.az) },
        accelNoG: { x: mix(a.ax, b.ax), y: 0, z: 0 },
        gyro: { x: mix(a.gx, b.gx), y: mix(a.gz, b.gz), z: mix(a.gy, b.gy) },
        gravity: { x: 0, y: 0, z: 1 },
        interval: 1000 / 60,
      });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    return true;
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this._set('stopped'); }
}

/* ── Hub ────────────────────────────────────────────────── */
export class SensorHub {
  constructor() {
    this.providers = {
      orientation: new DeviceOrientationProvider(),
      motion: new DeviceMotionProvider(),
      geo: new GeolocationProvider(),
      simulation: new SimulationProvider(),
      replay: new ReplayProvider(),
    };
    this.activeId = 'simulation';
    this.providers.simulation.start();
  }

  get active() { return this.providers[this.activeId]; }
  get(id) { return this.providers[id]; }

  async switchTo(id, { silent = false } = {}) {
    const p = this.providers[id];
    if (!p) return false;
    if (id === 'LIVE_SENSOR') {
      const okO = await this.providers.orientation.start();
      const okM = await this.providers.motion.start();
      if (!okO && !okM) {
        if (!silent) toast('NO LIVE SENSOR', 'This browser or device is not reporting orientation/motion. Staying in SIMULATION — everything still works.', 'warn');
        return false;
      }
      this._activate('orientation_merged', [this.providers.orientation, this.providers.motion], 'LIVE_SENSOR');
      return true;
    }
    if (id === 'REPLAY') {
      const ok = await p.start();
      if (!ok) { if (!silent) toast('NOTHING TO REPLAY', 'Record a session first — the buffer is empty.', 'warn'); return false; }
      this._activate('replay', [p], 'REPLAY');
      return true;
    }
    /* simulation */
    const sim = this.providers.simulation;
    Object.values(this.providers).forEach((x) => { if (x !== sim) x.stop(); });
    if (sim.status !== 'running') sim.start();
    this._activate('simulation', [sim], 'SIMULATION');
    return true;
  }

  _activate(activeId, list, sourceLabel) {
    this.activeId = activeId;
    this.activeList = list;
    set({ source: sourceLabel }, ['source']);
    bus.emit('source-changed', sourceLabel);
  }

  stopAll() {
    Object.values(this.providers).forEach((p) => p.stop());
    this.providers.simulation.start();
    this._activate('simulation', [this.providers.simulation], 'SIMULATION');
  }
}
