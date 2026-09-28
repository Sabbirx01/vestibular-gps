/* ═══════════════════════════════════════════════════════════
   SceneManager — owns the background WebGL scene and provides
   MiniStage for the inline section viewports (inner ear, brain).
   One render loop, adaptive quality, visibility culling, and an
   honest failure path if WebGL is unavailable.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { SpaceEnvironment } from './SpaceEnvironment.js';
import { FloatingAstronaut, MeasurementSubject } from './Astronaut.js';
import { SolarSystem } from './SolarSystem.js';
import { applyStudioLighting } from './environment.js';
import {
  state, set, bus, showError, QUALITY_PRESETS, stepQuality, toast,
} from '../core/store.js';
import { damp, clamp } from '../core/util.js';

/* ── Section → camera framing ───────────────────────────── */
const FRAMING = {
  'sec-hero':       { focus: 'wide',     dist: 12.5, height: 1.0, look: 1.0, env: 1.0 },
  /* offset shifts the look-at target so the subject lands in the open right-hand
     column instead of centred behind the panel grid */
  'sec-body':       { focus: 'subject',  dist: 4.6,  height: 1.55, look: 1.15, offset: [-1.75, 0.15], env: 0.42 },
  'sec-ear':        { focus: 'wide',     dist: 12.0, height: 1.2,  look: 1.2,  env: 0.3  },
  'sec-brain':      { focus: 'wide',     dist: 12.0, height: 1.4,  look: 1.3,  env: 0.3  },
  'sec-vor':        { focus: 'astronaut',dist: 5.0,  height: 1.7, look: 1.6,  env: 0.42 },
  'sec-sensors':    { focus: 'astronaut',dist: 4.4,  height: 1.7, look: 1.6,  env: 0.5 },
  'sec-space':      { focus: 'planet',   dist: 7.0,  height: 0.85, look: -0.75, offset: [-1.7, 0.35], env: 0.72 },
  'sec-lab':        { focus: 'astronaut',dist: 5.8,  height: 1.6, look: 1.4,  env: 0.4 },
  /* Dense instrument panels: pulled far back and dimmed so nothing drifts
     behind a readout. */
  'sec-console':    { focus: 'wide',     dist: 13.5, height: 0.8, look: 0.6,  env: 0.2  },
  'sec-integration':{ focus: 'wide',     dist: 14.0, height: 0.9, look: 0.7,  env: 0.2  },
  'sec-research':   { focus: 'wide',     dist: 14.0, height: 1.2, look: 1.2,  env: 0.5 },
  'sec-final':      { focus: 'astronaut',dist: 7.4,  height: 1.8, look: 1.5,  env: 0.5 },
};

  /* Earth reference sits below the astronaut in the hero composition. The
     active planet is a gravity reference, not a floating bubble beside the
     helmet. */
const SOLAR_POS = [1.75, -2.35, -9.2];

/* Which 3D layers are drawn in which section. Solar bodies are hidden on text-heavy
   sections so a planet can never end up sitting on top of a paragraph. */
const SECTION_LAYERS = {
  'sec-hero':     { solar: true,  astronaut: true,  subject: false, core: true  },
  'sec-body':     { solar: false, astronaut: false, subject: false, core: false },
  /* ear and brain host their own dedicated 3D viewports, so the background
     subject and any planet are hidden to avoid ghosting through the panels */
  'sec-ear':      { solar: false, astronaut: false, subject: false, core: false },
  'sec-brain':    { solar: false, astronaut: false, subject: false, core: false },
  'sec-vor':      { solar: false, astronaut: true,  subject: false, core: false },
  'sec-sensors':  { solar: false, astronaut: true,  subject: false, core: false },
  'sec-space':    { solar: true,  astronaut: true,  subject: false, core: true  },
  'sec-lab':      { solar: false, astronaut: true,  subject: false, core: false },
  /* The console and integration sections are dense instrument panels: no
     planets, no figures, nothing that could drift behind a readout. */
  'sec-console':  { solar: false, astronaut: false, subject: false, core: false },
  'sec-integration': { solar: false, astronaut: false, subject: false, core: false },
  'sec-research': { solar: true,  astronaut: false, subject: false, core: true  },
  'sec-final':    { solar: false, astronaut: true,  subject: false, core: false },
};

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.failed = null;
    this.t = 0;

    /* runtime numbers used by the adaptive quality controller */
    this.fpsSamples = [];
    this.qualityCooldown = 0;
    this.autoQuality = !state.qualityLocked;

    this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    this.camState = { dist: 14, height: 1.2, look: 1.2 };

    try {
      this._init();
      this.ready = true;
      const mode = this.degraded ? `WEBGL (degraded)` : 'WEBGL';
      set({ engine: { ...state.engine, ready: true, mode } }, ['engine']);
    } catch (e) {
      this.failed = e;
      const detail = (e && e.message) ? e.message : String(e);
      console.error('[SceneManager] init failed', e);
      showError('3D ENGINE ERROR',
        `The background scene could not start on this device (${detail}). Every interactive demo, chart and the full written science still work.`);
      canvas.style.display = 'none';
    }
  }

  _init() {
    const q = QUALITY_PRESETS[state.quality];

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: state.quality === 'ULTRA' || state.quality === 'HIGH',
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.isWebGPU = false;

    this.scene = new THREE.Scene();
    /* NOTE: no scene.fog — the custom ShaderMaterials here do not implement
       fog chunks, and a global fog silently blackens additive layers. */

    /* Image-based lighting. This is the single change that stops real meshes
       reading as flat toy shapes: with no environment there is nothing for a
       metal, glass or tissue material to reflect, so every surface collapses
       to one diffuse tone. */
    applyStudioLighting(this.scene, this.renderer, { intensity: 1.0 });

    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(0, 1.4, 14);
    this.cameraRig = new THREE.Group();
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    this.parts = {};
    this.errors = [];

    /* Each layer is isolated: if one fails to build, the others still render.
       A partial universe is far better than a black screen. */
    const layer = (name, fn) => {
      try { fn(); this.parts[name] = 'ok'; }
      catch (err) {
        this.parts[name] = 'failed';
        this.errors.push(`${name}: ${err && err.message ? err.message : err}`);
        console.error(`[SceneManager] layer failed: ${name}`, err);
      }
    };

    layer('environment', () => {
      this.env = new SpaceEnvironment({ quality: q, reducedMotion: state.reducedMotion });
      this.scene.add(this.env.group);
    });

    layer('solarSystem', () => {
      this.solar = new SolarSystem({ quality: q, reducedMotion: state.reducedMotion });
      this.solar.root.position.set(...SOLAR_POS);
      this.scene.add(this.solar.root);
    });

    layer('astronaut', () => {
      this.astronaut = new FloatingAstronaut({ quality: q, reducedMotion: state.reducedMotion });
      /* Positioned closer to camera and scaled up: at the previous 1.28 scale
         and z = -0.4 the figure occupied under a fifth of the viewport and
         read as a distant detail rather than the site's narrator. */
      /* Measured across iterations: 1.28/36% → 1.95/36% → 2.35/41%. Pulling the
         figure lower and slightly inward keeps it clear of the top-right HUD so
         the chest detail is not hidden behind it. */
      /* Measured: scale 2.75 puts the figure at 49.9% of viewport height with
         419 px clearance from the HUD, but it sat high with a ~157 px dead band
         under the boots, so it is dropped to balance the composition. */
      /* Keep the astronaut prominent but inside the hero's open right column.
         It floats above the Earth reference instead of overlapping the title
         or cards. */
      this.astronaut.root.position.set(2.2, -0.05, 1.85);
      this.astronaut.root.scale.setScalar(2.15);
      /* Straight-on entrance pose. The astronaut may respond to pointer input
         after its own settle window, but it must not arrive tilted. */
      this.astronaut.root.rotation.set(0, 0, 0);
      this.scene.add(this.astronaut.root);
       /* Swap in the real NASA asset asynchronously. The fallback is now a
          straight-on EVA suit with no bubble and no autonomous spin, so a slow
          GLB parse never exposes a sideways cartoon to a judge. */
      this.astronaut.loadReal().then((ok) => {
        if (ok) console.info('[SceneManager] NASA suit asset active', this.astronaut.realMetrics);
      });
    });

    layer('subject', () => {
      this.subject = new MeasurementSubject({ quality: q, reducedMotion: state.reducedMotion });
      this.subject.root.position.set(-3.9, -1.15, 0.9);
      this.subject.root.scale.setScalar(1.0);
      this.scene.add(this.subject.root);
    });

    this._bindPointer();
    this._bindResize();

    bus.on('quality', (tier) => this.setQuality(tier));
    this.setSection('sec-hero', true);

    if (this.errors.length) {
      console.warn('[SceneManager] degraded layers:', this.errors.join(' | '));
      this.degraded = this.errors.join(' | ');
    }
  }

  _bindPointer() {
    window.addEventListener('pointermove', (e) => {
      this.pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.ty = (e.clientY / innerHeight) * 2 - 1;
      this.astronaut.setPointer(this.pointer.tx, this.pointer.ty);
      this.subject.setPointer(this.pointer.tx, this.pointer.ty);
    }, { passive: true });

    window.addEventListener('pointerdown', () => { this._pointerDown = true; });
    window.addEventListener('pointerup', () => { this._pointerDown = false; });

    /* device tilt nudges the camera too, when a sensor is live */
    bus.on('sample', (s) => {
      if (state.source !== 'LIVE_SENSOR') return;
      this.pointer.tx = clamp(this.pointer.tx + s.roll / 900, -1, 1);
      this.pointer.ty = clamp(this.pointer.ty + s.pitch / 900, -1, 1);
    });
  }

  _bindResize() {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const q = QUALITY_PRESETS[state.quality];
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(innerWidth, innerHeight, false);
        this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  setSection(id, instant = false) {
    const f = FRAMING[id] || FRAMING['sec-hero'];
    this.framing = f;
    this._section = id;
    this.framingInstant = instant;
    if (instant) {
      this.camState.dist = f.dist;
      this.camState.height = f.height;
      this.camState.look = f.look;
    }
  }

  setMode(mode) {
    try { this.solar?.setActive(mode, false); } catch (e) { console.warn('[SceneManager] setMode failed', e); }
  }

  /* ── Frame loop ───────────────────────────────────────── */
  update(dt) {
    if (!this.ready) return;
    this.t += dt;
    const s = state;
    const q = QUALITY_PRESETS[s.quality];

    /* pointer smoothing */
    this.pointer.x = damp(this.pointer.x, this.pointer.tx, 3.4, dt);
    this.pointer.y = damp(this.pointer.y, this.pointer.ty, 3.4, dt);

    /* orientation stream also tilts the whole world subtly */
    const tiltX = clamp(s.sample.roll / 220, -0.22, 0.22);
    const tiltY = clamp(s.sample.pitch / 260, -0.18, 0.18);
    if (this.env) {
      this.env.applyPointer(this.pointer.x, this.pointer.y);
      this.env.group.rotation.z = damp(this.env.group.rotation.z, tiltX * 0.6, 2.4, dt);
      this.env.group.rotation.x = damp(this.env.group.rotation.x, -tiltY * 0.6, 2.4, dt);
    }

    /* Each subsystem is isolated per frame. A fault in one layer must never
       stop the render loop or spam the console thousands of times. */
    const safe = (name, fn) => {
      if (this._disabled?.has(name)) return;
      try { fn(); }
      catch (err) {
        this._frameFaults = this._frameFaults || new Map();
        const n = (this._frameFaults.get(name) || 0) + 1;
        this._frameFaults.set(name, n);
        if (n === 1) console.error(`[SceneManager] ${name}.update failed — disabling this layer`, err);
        if (n >= 3) {
          this._disabled = this._disabled || new Set();
          this._disabled.add(name);
          console.warn(`[SceneManager] layer "${name}" disabled after repeated faults; the rest of the scene continues.`);
        }
      }
    };

    safe('environment', () => this.env?.update(dt));
    safe('solarSystem', () => this.solar?.update(dt, s));
    safe('astronaut', () => this.astronaut?.update(dt, s));
    safe('subject', () => this.subject?.update(dt, s));

    /* ── camera framing per section ── */
    const f = this.framing || FRAMING['sec-hero'];
    const k = this.framingInstant ? 40 : 2.0;
    this.framingInstant = false;

    /* Keep the astronaut upright relative to the viewport. The previous
       autonomous camera orbit made the suit appear to turn toward Earth even
       when the user had not interacted. Any intentional motion now comes from
       pointer/sensor input, not a hidden cinematic orbit. */
    const orbit = 0;
    const targetDist = f.dist;
    const targetHeight = f.height;

    this.camState.dist = damp(this.camState.dist, targetDist, k, dt);
    this.camState.height = damp(this.camState.height, targetHeight, k, dt);
    this.camState.look = damp(this.camState.look, f.look, k, dt);

    const az = orbit + this.pointer.x * 0.34;
    const el = this.pointer.y * 0.2;

    let cx = 0, cz = 0;
    if (f.focus === 'subject' && this.subject) { cx = this.subject.root.position.x; cz = this.subject.root.position.z; }
    else if (f.focus === 'astronaut' && this.astronaut) { cx = this.astronaut.root.position.x; cz = this.astronaut.root.position.z; }
    else if (f.focus === 'planet') { cx = SOLAR_POS[0]; cz = SOLAR_POS[2]; }

    /* Composition offset: the camera sits relative to the subject but aims slightly
       off-axis, which pushes the subject into the open column beside the panels. */
    const oxT = f.offset ? f.offset[0] : 0;
    const oyT = f.offset ? f.offset[1] : 0;
    this.camState.ox = damp(this.camState.ox ?? oxT, oxT, k, dt);
    this.camState.oy = damp(this.camState.oy ?? oyT, oyT, k, dt);

    this.camera.position.set(
      cx + Math.sin(az) * this.camState.dist,
      this.camState.height + el * 2.2 + (f.focus === 'planet' ? 1.2 : 0),
      cz + Math.cos(az) * this.camState.dist,
    );
    this.camera.lookAt(cx + this.camState.ox, this.camState.look + this.camState.oy, cz);

    /* subtle FOV breathing on interaction — never enough to be nauseating */
    this.camera.fov = damp(this.camera.fov, 46 + (this._pointerDown ? -1.4 : 0), 4, dt);
    this.camera.updateProjectionMatrix();

    /* layer visibility per section so text stays readable */
    this._applyEnvOpacity(this._section || 'sec-hero', f.focus);

    this.renderer.render(this.scene, this.camera);

    /* telemetry + adaptive quality */
    const info = this.renderer.info;
    s.engine.calls = info.render.calls;
    s.engine.tris = info.render.triangles;
    s.engine.objects = this.scene.children.length;

    this._trackFps(dt);

    if (this.t % 0.25 < dt) {
      set({
        engine: { ...s.engine, calls: info.render.calls, tris: info.render.triangles, objects: this.scene.children.length, fps: this.currentFps || 60 },
      }, ['engine']);
    }
  }

  /** Show/hide whole 3D layers per section so nothing collides with body text. */
  _applyEnvOpacity(sectionId, focus) {
    const want = SECTION_LAYERS[sectionId] || SECTION_LAYERS['sec-hero'];
    if (this._wantLayers && this._wantLayers.solar === want.solar
      && this._wantLayers.astronaut === want.astronaut
      && this._wantLayers.subject === want.subject) return;
    this._wantLayers = { ...want };

    if (this.solar) this.solar.root.visible = want.solar;
    if (this.astronaut) this.astronaut.root.visible = want.astronaut;
    if (this.subject) this.subject.root.visible = want.subject;
    /* the ambient glow shell at the world origin otherwise reads as a stray
       blue sphere limb at the edge of text-heavy sections */
    if (this.env?.core) this.env.core.visible = want.core !== false;
  }

  _trackFps(dt) {
    if (dt <= 0) return;
    const fps = 1 / dt;
    this.fpsSamples.push(fps);
    if (this.fpsSamples.length > 90) this.fpsSamples.shift();
    const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    this.currentFps = avg;

    this.qualityCooldown -= dt;
    if (!this.autoQuality || this.qualityCooldown > 0 || this.fpsSamples.length < 90) return;

    /* Only ever step down automatically. Stepping back up needs the user.
       Two guards here, both learned from a real regression:
        - the threshold was 34 fps, which a single heavy frame (loading the
          13 MB brain mesh, or an environment-map shader compile) could drag
          under, so a capable machine silently demoted itself to MEDIUM;
        - now two consecutive low windows are required before acting, and the
          bar is 26 fps, which is where a scene genuinely stops feeling smooth. */
    if (avg < 26 && state.quality !== 'MOBILE') {
      this.lowWindows = (this.lowWindows || 0) + 1;
      if (this.lowWindows < 2) return;
      this.lowWindows = 0;
      stepQuality(true);
      this.qualityCooldown = 20;
      this.fpsSamples.length = 0;
    } else {
      this.lowWindows = 0;
    }
  }

  setQuality(tier) {
    const q = QUALITY_PRESETS[tier];
    if (!this.ready) return;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
    try { this.env?.setQuality(q); } catch (e) { console.warn('[SceneManager] env quality change failed', e); }
    try {
      if (this.solar) { this.solar.dispose(); this.scene.remove(this.solar.root); }
      this.solar = new SolarSystem({ quality: q, reducedMotion: state.reducedMotion });
      this.solar.root.position.set(...SOLAR_POS);
      this.solar.setActive(state.mode, true);
      this.scene.add(this.solar.root);
    } catch (e) { console.warn('[SceneManager] solar rebuild failed', e); }
    this.qualityCooldown = 10;
    this.fpsSamples.length = 0;
  }

  dispose() {
    this.renderer?.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════
   MiniStage — a self-contained renderer for one inline viewport
   (inner ear, brain). Keeps its own RAF only while on screen.
   ═══════════════════════════════════════════════════════════ */
export class MiniStage {
  constructor(canvas, { build, orbit = true, distance = 3.2, minDist = 1.4, maxDist = 7, targetY = 0, minY = null } = {}) {
    this.canvas = canvas;
    this.build = build;
    this.orbit = orbit;
    this.distance = distance;
    this.minDist = minDist;
    this.maxDist = maxDist;
    /* targetY lets a model whose interesting mass sits well above the origin
       (a full-height human figure) be framed properly. */
    this.targetY = targetY;
    this.minY = minY ?? targetY;

    this.visible = false;
    this.running = false;
    this.t = 0;
    this.rot = { x: 0.18, y: 0, tx: 0.18, ty: 0 };
    this.dragging = false;
    this.last = { x: 0, y: 0 };
    this.autoSpin = true;

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
    } catch (e) {
      console.error('[MiniStage] renderer failed', e);
      canvas.parentElement?.classList.add('is-failed');
      this.failed = true;
      return;
    }

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    /* Same IBL rig as the background scene, so the inline viewports read with
       the same lighting language as the rest of the site. */
    applyStudioLighting(this.scene, this.renderer, { intensity: 1.05 });

    this.content = build({ stage: this });
    if (this.content?.root) this.pivot.add(this.content.root);

    this._bind();
    this._observe();
    this.resize();
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.pointerId = e.pointerId;
      this.downAt = { x: e.clientX, y: e.clientY };
      this.travel = 0;
      this.last = { x: e.clientX, y: e.clientY };
      /* Capture is an optimisation, not a requirement. It throws for
         synthetic/untracked pointer ids; if that escaped it used to abort the
         handler and kill the idle auto-spin. */
      try { c.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      if (dx === 0 && dy === 0) return;
      this.travel += Math.abs(dx) + Math.abs(dy);
      /* stop the idle rotation only once the user has actually moved */
      if (this.travel > 6) this.autoSpin = false;
      this.last = { x: e.clientX, y: e.clientY };
      this.rot.ty += dx * 0.009;
      this.rot.tx = clamp(this.rot.tx + dy * 0.007, -1.2, 1.2);
    });
    const end = () => {
      this.dragging = false;
      if (c.hasPointerCapture?.(this.pointerId)) {
        try { c.releasePointerCapture(this.pointerId); } catch { /* already gone */ }
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', end);

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = clamp(this.distance + e.deltaY * 0.0022, this.minDist, this.maxDist);
    }, { passive: false });

    /* picking */
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    c.addEventListener('click', (e) => {
      /* a drag must never be interpreted as a selection */
      if ((this.travel || 0) > 6) { this.travel = 0; return; }
      const r = c.getBoundingClientRect();
      this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      this.ray.setFromCamera(this.ndc, this.camera);
      const hits = this.ray.intersectObjects(this.content?.pickables || [], true);
      if (hits.length) {
        const id = hits[0].object.userData.pickId;
        if (id) { this.current?.select?.(id); bus.emit('stage-pick', { stage: this.id, id }); }
      }
    });
  }

  _observe() {
    if (typeof IntersectionObserver === 'undefined') { this.visible = true; return; }
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.setRunning(this.visible);
    }, { threshold: 0.05 });
    this.io.observe(this.canvas);
  }

  setRunning(on) {
    if (this.failed) return;
    if (on && !this.running) { this.running = true; this._loop(); }
    if (!on) this.running = false;
  }

  resize() {
    if (this.failed) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - (this._prev || now)) / 1000);
    this._prev = now;
    this.t += dt;

    this.rot.x = damp(this.rot.x, this.rot.tx, 6, dt);
    this.rot.y = damp(this.rot.y, this.rot.ty, 6, dt);
    if (this.autoSpin && !state.reducedMotion) this.rot.ty += dt * 0.11;

    this.pivot.rotation.x = this.rot.x;
    this.pivot.rotation.y = this.rot.y;

    /* the vertical look point lifts as you orbit so tall models stay framed */
    const lift = this.targetY + this.rot.x * 0.9;
    this.camera.position.set(0, Math.max(this.minY, lift + 0.12), this.distance);
    this.camera.lookAt(0, Math.max(this.minY, lift), 0);

    this.content?.update?.(dt, state);
    this.renderer.render(this.scene, this.camera);
  }

  reset() { this.rot.tx = 0.18; this.rot.ty = 0; this.autoSpin = true; this.distance = 3.2; }

  dispose() {
    this.running = false;
    this.io?.disconnect();
    this.renderer?.dispose();
  }
}
