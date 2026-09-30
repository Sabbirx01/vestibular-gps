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
  'sec-hero':       { focus: 'wide',     dist: 12.5, height: 1.0, look: 1.0, offset: [0.0, 0.0], env: 1.0,
                      /* The hero is the one framing that places the solar body by
                         SCREEN fraction instead of leaving it at SOLAR_POS: the
                         screen position of a fixed world point moves with the
                         viewport aspect, and at 1500x600 the Earth was cropped by
                         the bottom-right corner. solarScale enlarges it in the
                         hero only — at ~150 px it was too small to read as Earth
                         at all. See _placeSolar. */
                      /* The Earth hangs off the astronaut's HEAD — level with
                         the helmet and just to its right, so the figure stands
                         in front of the planet and hides its inner edge. The
                         offset is measured from the live head position: a fixed
                         screen fraction cannot do this, because the astronaut's
                         own screen position moves with the viewport aspect.
                         `solarHeadOffset` is [right, up] in screen fractions. */
                      solarAnchor: 'head',
                      solarHeadOffset: [0.058, -0.02], solarScale: 1.15,
                      solarHeadOffsetShort: [0.042, -0.02], solarScaleShort: 0.9,
                      shortAspect: 2.05 },
  /* offset shifts the look-at target so the subject lands in the open right-hand
     column instead of centred behind the panel grid */
  'sec-body':       { focus: 'subject',  dist: 4.6,  height: 1.55, look: 1.15, offset: [-1.75, 0.15], env: 0.42 },
  'sec-ear':        { focus: 'wide',     dist: 12.0, height: 1.2,  look: 1.2,  env: 0.3  },
  'sec-brain':      { focus: 'wide',     dist: 12.0, height: 1.4,  look: 1.3,  env: 0.3  },
  'sec-vor':        { focus: 'astronaut',dist: 5.0,  height: 1.7, look: 1.6,  env: 0.42 },
  'sec-sensors':    { focus: 'astronaut',dist: 4.4,  height: 1.7, look: 1.6,  env: 0.5 },
  /* The Space section is the only framing with an `anchor`: the reference body
     has to sit in a specific gap between DOM elements, and that gap is laid out
     in percent of the window while the camera's vertical FOV is a constant 46
     degrees. So this section's aim is SOLVED in screen space every frame — see
     _anchorBody. There are two targets because the gap changes shape: `anchor` is
     the free column right of the heading on the wide two-column shell, and
     `anchorNarrow` is the band the stylesheet reserves above the heading once
     that shell collapses to a single column (sections.css, same breakpoint, and
     see _spaceAnchor). `look`/`offset` below are only the solve's seed and the
     fallback for the case the solve reports as unreachable. */
  'sec-space':      { focus: 'planet',   dist: 5.8,  height: 0.15, look: -1.0, offset: [0.0, -0.35], env: 0.72, anchor: [0.68, 0.35], anchorNarrow: [0.5, 0.30] },
  'sec-lab':        { focus: 'astronaut',dist: 5.8,  height: 1.6, look: 1.4,  env: 0.4 },
  /* Dense instrument panels: pulled far back and dimmed so nothing drifts
     behind a readout. */
  'sec-console':    { focus: 'wide',     dist: 13.5, height: 0.8, look: 0.6,  env: 0.2  },
  'sec-integration':{ focus: 'wide',     dist: 14.0, height: 0.9, look: 0.7,  env: 0.2  },
  'sec-research':   { focus: 'wide',     dist: 14.0, height: 1.2, look: 1.2,  env: 0.5 },
  'sec-final':      { focus: 'astronaut',dist: 7.4,  height: 1.8, look: 1.5,  env: 0.5 },
};

/* The Earth reference in the hero composition.
   It used to sit at [1.55, -1.35, -8.8] — roughly behind the astronaut, which
   is how the previous author wanted it ("never become a foreground globe
   competing with the hero subject"). That intent produced the opposite
   complaint: at 1920x1080 the planet landed on the astronaut's torso, and in a
   narrower window it sat squarely on the suit, so it read as a decal stuck to
   the figure rather than as a planet.
   It now sits clear to the RIGHT of the figure and below the spec-card grid:
     world x 5.0  -> screen x ~1258   (astronaut body ends near x 1140)
     world y -3.5 -> screen y ~815    (card grid bottom is y ~745)
   The clearance was measured with the pointer at rest and that was the whole
   problem: it is NOT clearance, it is clearance at one camera angle. The orbit
   is worth up to 0.34 rad and a point 8.8 units behind the focus moves with it,
   so at the left end of the pointer range the planet's screen x fell to ~1.8
   world units and it sat on the suit. Two things now hold it in place — the
   offset is rotated with the camera in updateCamera (so the orbit cannot move
   it) and x was raised from 5.0 to 7.4 to give the figure a real gap at rest.
     world x 7.4 -> screen x ~1402 at 1920 (astronaut ends ~1202), radius ~57 px
   The second half of the clearance problem was vertical, and it only shows up
   on a laptop. The spec-card grid is a DOM column, so its bottom edge sits at a
   different fraction of the viewport at every size.

   RE-MEASURED, and the previous numbers here were wrong. They were read off
   screenshots by eye and claimed 4 px of overlap at 1366x768; measured properly
   — DOM getBoundingClientRect for the panel, pixel analysis for the globe, at
   y -5.4, page as shipped, pointer parked, scrollY 0 — the truth is:
     1920x1080  panel bottom 746    globe y 867..994 (124 px)   121 px clear
     1440x900   panel bottom 655    globe y 693..790  (97 px)    38 px clear
     1366x768   panel bottom 647.5  globe y 608..692  (84 px)   -39 px: the
                globe's top third is BEHIND the CANAL ARRANGEMENT card
   So the short-viewport case was never fixed, and at 1366x768 it cannot be
   fixed by moving the body: the DOM band between the panel bottom (0.843 of
   height) and the viewport bottom is only 121 px while the globe needs 84 px
   plus its own margin, so the globe has to overlap that panel at this size.
   Recorded rather than claimed away.

   y raised from -5.4 to -5.0 at the owner's request ("the Earth is hard to
   see — move it slightly up"). Scale from the same measurement session is
   ~59.7 px per world unit at 1920x1080, so this is ~24 px at 1920 and ~17 px at
   768 — deliberately small. What it buys: a balanced band at 1920 (100 px clear
   above, 107 px below instead of 121/86) and a slightly tighter 20 px clear at
   1440. What it costs: the 1366x768 overlap deepens from 39 px to ~54 px. That
   case is already broken and is not worsened in kind, but if a fully clear
   globe on a 1366x768 laptop matters more than the higher placement, put this
   back to -5.4 (or lower) — the two cannot both hold at that size.
   On phones it still falls outside the frame, and the 'planet' focus used to
   compensate for that; that branch is currently disabled (mobilePlanet is
   hard-false in updateCamera), so on a portrait phone the reference body is
   simply off-frame. Recorded here rather than left as a comment claiming a
   behaviour the code no longer has.

   This y is the HERO's composition only. The Space section stopped reading it
   as its framing (see _anchorBody): that section solves its aim in screen
   space, so the reference body can be moved for the hero without moving it on
   screen in the Space section — which is exactly how the two sections drifted
   apart in the first place. */
const SOLAR_POS = [7.4, -5.0, -8.8];

/* Narrowest window that still has the two-column shell the Space section's side
   anchor needs. Below it the heading column reaches across the free space — at
   1024x768 the heading box already ends at x 698 and the 128 px disc centred at
   0.68 W would start at x 696 — so the section switches to the reserved band
   above the heading instead. Matching breakpoint in sections.css. */
const SIDE_COLUMN_MIN_W = 1280;

/* Scratch vectors for the Space section's screen-space anchor. Held at module
   scope so the render loop allocates nothing per frame. */
const _bodyPos = new THREE.Vector3();
const _bodyNdc = new THREE.Vector3();
/* Camera basis + scratch for the hero's screen-space placement. */
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _otherPos = new THREE.Vector3();
const _zeroVec = new THREE.Vector3();
const _astroCentre = new THREE.Vector3();
const _astroSize = new THREE.Vector3();
const _astroHead = new THREE.Vector3();

/* Which 3D layers are drawn in which section. Solar bodies are hidden on text-heavy
   sections so a planet can never end up sitting on top of a paragraph. */
const SECTION_LAYERS = {
  'sec-hero':     { solar: true,  astronaut: true,  subject: false },
  'sec-body':     { solar: false, astronaut: false, subject: false },
  /* ear and brain host their own dedicated 3D viewports, so the background
     subject and any planet are hidden to avoid ghosting through the panels */
  'sec-ear':      { solar: false, astronaut: false, subject: false },
  'sec-brain':    { solar: false, astronaut: false, subject: false },
  'sec-vor':      { solar: false, astronaut: true,  subject: false },
  'sec-sensors':  { solar: false, astronaut: true,  subject: false },
  'sec-space':    { solar: true,  astronaut: true,  subject: false },
  'sec-lab':      { solar: false, astronaut: true,  subject: false },
  /* The console and integration sections are dense instrument panels: no
     planets, no figures, nothing that could drift behind a readout. */
  'sec-console':  { solar: false, astronaut: false, subject: false },
  'sec-integration': { solar: false, astronaut: false, subject: false },
  'sec-research': { solar: true,  astronaut: false, subject: false },
  'sec-final':    { solar: false, astronaut: true,  subject: false },
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
      /* The aspect goes in because the black hole is parked far to the right of
         the sky, and how far right survives depends on how wide the frame is —
         see SpaceEnvironment.setAspect. The resize handlers re-apply it. */
      this.env = new SpaceEnvironment({
        quality: q,
        reducedMotion: state.reducedMotion,
        aspect: this.camera.aspect,
      });
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
       /* The figure now has its OWN column, between the copy and the card grid.
          Set as the anchor (baseX/baseY/baseZ), not root.position directly:
          update() offsets from that anchor every frame for the floating/tumble
          motion, so setting position here would just be overwritten next frame.
          The old anchor (baseX 2.05) put the projected figure at x=1086..1342
          on a 1920x1080 viewport while the 2x2 spec grid ran x=1143..1672, so
          the suit rendered through SEMICIRCULAR CANALS (200x145 px) and CANAL
          ARRANGEMENT (199x163 px). Moving this anchor alone could never fix
          that: the gap between the copy box (ends x=904) and the grid was only
          239 px, narrower than the figure itself. The real fix is one line of
          layout (sections.css: .hero-specs capped at 450 px and right-aligned,
          which moves the grid's left edge from x=1143 to x=1222) plus this
          anchor, which slides the figure into the column that opens up.
          Mapping for sec-hero at 1920x1080 (fov 46, camera z 12.5, look y 1.0):
            screen x = 960 + 119.45 * world x   (measured, verified twice)
          The figure's projected width varies about 15% as the zero-g tumble
          turns it, so it is placed by its CENTRE (world x 0.85 -> screen
          x ~1062) with clearance on both sides, never tuned flush to a single
          frame. Re-measure the projected box in a browser before changing
          either baseX or scale. */
       this.astronaut.baseX = 0.85;
      this.astronaut.baseY = -0.05;
      this.astronaut.baseZ = 1.85;
       this.astronaut.root.position.set(0.85, -0.05, 1.85);
       this.astronaut.scale = 2.10;
       this.astronaut.root.scale.setScalar(2.10);
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
      /* A drag that owns a body takes the pointer exclusively. Note what is NOT
         updated here: pointer.tx/ty, which drive the camera orbit. Turning the
         planet must not also swing the camera around it, and freezing the orbit
         input (rather than the orbit itself) means releasing the drag leaves the
         camera exactly where it was. */
      if (this.dragTarget) {
        const dx = e.clientX - this.dragLast.x;
        const dy = e.clientY - this.dragLast.y;
        if (dx || dy) {
          this.dragLast = { x: e.clientX, y: e.clientY };
          if (this.dragTarget === 'solar') this.solar?.drag(dx, dy);
          else if (this.dragTarget === 'astronaut') this.astronaut?.drag(dx, dy);
        }
        return;
      }

      this.pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.ty = (e.clientY / innerHeight) * 2 - 1;
      this.astronaut.setPointer(this.pointer.tx, this.pointer.ty);
      this.subject.setPointer(this.pointer.tx, this.pointer.ty);
    }, { passive: true });

    window.addEventListener('pointerdown', (e) => {
      this._pointerDown = true;
      /* What is under the pointer decides what a drag turns. The astronaut is
         tested first: it is the larger subject and it stands in front of the
         planet on the hero. Anywhere else, a drag does nothing — the page still
         scrolls — which keeps the interaction discoverable rather than global. */
      const ndcX = (e.clientX / innerWidth) * 2 - 1;
      const ndcY = -((e.clientY / innerHeight) * 2 - 1);
      this.dragTarget = null;
      if (this.astronaut && this.astronaut.root.visible && this._overAstronaut(ndcX, ndcY)) {
        this.dragTarget = 'astronaut';
      } else if (this.solar && this.solar.hitTest(ndcX, ndcY, this.camera)) {
        this.dragTarget = 'solar';
      }
      this.dragLast = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => {
      this._pointerDown = false;
      this.dragTarget = null;
    });

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
        /* A portrait window is a fraction of the width of a landscape one, and
           the black hole is parked near the right edge of the sky: without this
           it walks out of the frame when the window is resized. */
        this.env?.setAspect?.(this.camera.aspect);
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
    /* Drop the hero's screen-space correction: only framings that declare
       `solarAnchor` drive it, so a stale offset would displace the planet in
       every other section. */
    if (this._solarOffset) this._solarOffset.set(0, 0, 0);
    this._solarAnchorSmooth = null;
    /* Drop the screen-space anchor (Space section): it re-seeds from wherever
       the body is when its section next comes up, so re-entering glides the
       planet into the column from the previous section's pose rather than
       snapping it to a stale fraction. */
    this.camState.ax = undefined;
    this.camState.ay = undefined;
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
    const mobile = innerWidth <= 720;

    /* Backdrop dimming. Every FRAMING entry has declared an `env` strength
       since the beginning — 1.0 on the hero, 0.2 on the console and
       integration panels, with a comment saying the backdrop is dimmed so
       nothing drifts behind a readout — but nothing ever read the field, so
       the sky stayed at full strength on the densest sections. Applied on
       change only; it touches a dozen material values. */
    if (this.env && this._envApplied !== f.env) {
      this._envApplied = f.env;
      try { this.env.setIntensity(f.env ?? 1); } catch (e) { console.warn('[SceneManager] env intensity failed', e); }
    }
    /* Mobile keeps the same subject-first composition; it must not retarget
       the camera to the distant planet and push the astronaut off-screen. */
    const mobilePlanet = false;
    const k = this.framingInstant ? 40 : 2.0;
    this.framingInstant = false;

    /* Keep the astronaut upright relative to the viewport. The previous
       autonomous camera orbit made the suit appear to turn toward Earth even
       when the user had not interacted. Any intentional motion now comes from
       pointer/sensor input, not a hidden cinematic orbit. */
    const orbit = 0;
    const targetDist = mobilePlanet ? (this._section === 'sec-space' ? 4.2 : 7.2) : f.dist;
    const targetHeight = mobilePlanet ? (this._section === 'sec-space' ? -0.25 : 0.1) : f.height;

    this.camState.dist = damp(this.camState.dist, targetDist, k, dt);
    this.camState.height = damp(this.camState.height, targetHeight, k, dt);
    this.camState.look = damp(this.camState.look, f.look, k, dt);

    const az = orbit + this.pointer.x * 0.34;
    const el = this.pointer.y * 0.2;

    let cx = 0, cz = 0;
    if (f.focus === 'subject' && this.subject) { cx = this.subject.root.position.x; cz = this.subject.root.position.z; }
    else if (f.focus === 'astronaut' && this.astronaut) { cx = this.astronaut.root.position.x; cz = this.astronaut.root.position.z; }
    else if (f.focus === 'planet' || mobilePlanet) { cx = SOLAR_POS[0]; cz = SOLAR_POS[2]; }

    /* Composition offset: the camera sits relative to the subject but aims slightly
       off-axis, which pushes the subject into the open column beside the panels. */
    const oxT = f.offset ? f.offset[0] : 0;
    const oyT = f.offset ? f.offset[1] : 0;
    this.camState.ox = damp(this.camState.ox ?? oxT, oxT, k, dt);
    this.camState.oy = damp(this.camState.oy ?? oyT, oyT, k, dt);

    /* Seed the Space section's screen-space anchor (see _anchorBody) from where
       the body ACTUALLY is on screen, read off the pose the previous frame
       rendered — this has to happen before the camera is moved below, or the
       seed would be the framing's own aim instead. The anchor then eases from
       there, so entering the section glides the planet into its column instead
       of teleporting it across the window. */
    /* The astronaut's measured frame is cached for one frame only — it drifts. */
    this._astroFrame = null;

    const anchor = this._spaceAnchor(f);
    if (anchor && this.solar && this.camState.ax === undefined) {
      this.solar.root.getWorldPosition(_bodyPos);
      _bodyNdc.copy(_bodyPos).project(this.camera);
      this.camState.ax = (_bodyNdc.x + 1) / 2;
      this.camState.ay = (1 - _bodyNdc.y) / 2;
    }

    this.camera.position.set(
      cx + Math.sin(az) * this.camState.dist,
      this.camState.height + el * 2.2 + (f.focus === 'planet' || mobilePlanet ? 1.2 : 0),
      cz + Math.cos(az) * this.camState.dist,
    );
    const aimX = cx + this.camState.ox;
    const aimY = this.camState.look + this.camState.oy;
    this.camera.lookAt(aimX, aimY, cz);

    /* subtle FOV breathing on interaction — never enough to be nauseating */
    this.camera.fov = damp(this.camera.fov, 46 + (this._pointerDown ? -1.4 : 0), 4, dt);
    this.camera.updateProjectionMatrix();

    /* The Earth reference holds its column.
       It sits 8.8 units behind the hero focus, so in reality it would barely
       parallax — but the pointer orbit swings the camera by up to 0.34 rad and
       a point that far behind the focus moves with it, which slid the planet
       under the astronaut's feet. Reported as "when I move the mouse the Earth
       comes to the front". Rotating its offset from the focus by the same angle
       the camera turned keeps it exactly where the composition put it: the
       screen position of a point behind the focus is unchanged by that
       rotation, and the residual is the planet's own slow drift, which is
       motion the composition was built around. */
    if (this.solar) {
      const sdx = SOLAR_POS[0] - cx;
      const sdz = SOLAR_POS[2] - cz;
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      this.solar.root.position.set(
        cx + sdx * ca + sdz * sa,
        SOLAR_POS[1],
        cz - sdx * sa + sdz * ca,
      );
    }

    /* Framings that declare `solarAnchor` place the body by screen fraction.
       The offset accumulates in _solarOffset and is applied on top of the orbit
       compensation above, which re-sets the base position every frame. The
       camera is deliberately NOT re-aimed here — _anchorBody rotates it, and
       the hero's astronaut column and card grid are measured and must not move. */
    const solarTarget = this._solarTarget();
    if (solarTarget && this.solar) {
      this.solar.root.position.add(this._solarOffset || _zeroVec);
      /* Ease the target rather than snapping to it. The astronaut is close to
         the camera and the planet is far behind it, so a camera move must not
         carry the planet at the same rate as the figure: a distant body shifts
         less in frame. That lag is what lets the Earth slide out from behind the
         astronaut when the camera swings, and settle back behind the helmet when
         it stops — the behaviour of a ball behind a person, rather than a decal
         welded to the helmet. */
      if (!this._solarAnchorSmooth) this._solarAnchorSmooth = { x: solarTarget.anchor[0], y: solarTarget.anchor[1] };
      const ease = clamp(dt * 3.0, 0, 1);
      this._solarAnchorSmooth.x += (solarTarget.anchor[0] - this._solarAnchorSmooth.x) * ease;
      this._solarAnchorSmooth.y += (solarTarget.anchor[1] - this._solarAnchorSmooth.y) * ease;
      this._placeSolar([this._solarAnchorSmooth.x, this._solarAnchorSmooth.y], dt);
    }

    /* The Space section re-aims the camera at the body itself. It runs after
       the orbit compensation above, because it solves against the body's world
       position and the compensation is what finally decides that. */
    if (anchor && this.solar) {
      this._anchorBody(anchor, k, dt);
    }

    /* layer visibility per section so text stays readable */
    this._applyEnvOpacity(this._section || 'sec-hero', f.focus);

    /* Narrow layouts only: see _applyNarrowBodyFade. Must run before the render,
       and after _applyEnvOpacity so it owns the final visibility decision. */
    this._applyNarrowBodyFade();

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

  /**
   * Aim the camera so the active solar body lands on a declared screen
   * position. `anchor` is [x, y] as fractions of the render surface, 0,0 being
   * the top-left corner.
   *
   * Why this is solved instead of hand-set: the Space section is the one place
   * where the planet has to sit inside a specific DOM gap — the open column to
   * the right of the heading and above the glass panel. Every world-space value
   * that could express that gap (camera height, aim point, composition offset)
   * maps to a different screen position on every window shape, because the DOM
   * is laid out in percent while the camera's vertical FOV is a constant 46°.
   * Measured as shipped: the framing's aim point sat 3.65 world units ABOVE the
   * body, which put the disc at 0.99 of the viewport height — 1 px of clearance
   * above the bottom edge at 1920x1080, and either behind the glass panel or
   * below the fold at 1440x900 and 1366x768. Owner's read: "clicking Moon, Earth
   * or Mars, the planet should appear in the empty space beside the content, but
   * it shows far below — you cannot see it properly, it has moved under the
   * content."
   *
   * The solve is closed-form, one pass, no state. Take the body's elevation and
   * bearing as seen from the camera, then find the yaw and pitch that put it on
   * the anchor: yaw moves it horizontally, pitch vertically, and no roll is
   * introduced, so the horizon stays level. NDC offsets scale by tan(fov/2) *
   * aspect horizontally and tan(fov/2) vertically — the aspect term is the whole
   * reason a fixed world offset could not hold one screen position across window
   * shapes.
   *
   * The anchor targets the ROOT, not the body: each body drifts ±0.46 units
   * sideways and ±0.13 units vertically inside the root, so the planet keeps
   * moving — it just cannot leave its column (that is ±74 px / ±21 px of travel
   * at 1920x1080, still with a clear margin below). Pointer input moves the
   * camera position instead of the aim, and the solve absorbs that exactly: the
   * disc holds 0.68 / 0.35 for every pointer position, checked at the corners of
   * the pointer range.
   *
   * Verified clearances for the LARGEST body (Earth, r ≈ 142 px at 1920x1080;
   * Mars is ~100 px, the Moon ~60 px), DOM rects measured in the browser at the
   * section's resting scroll position:
   *   1920x1080  disc y 236..520   glass panel starts 566   ->  46 px clear
   *   1440x900   disc y 215..451   glass panel starts 551   -> 100 px clear
   *   1366x768   disc y 183..385   glass panel starts 540   -> 155 px clear
   * and horizontally the disc clears the heading column by 119-147 px and the
   * top-right HUD by 113-249 px.
   *
   * Caveat, recorded rather than claimed away: the body is anchored to the
   * VIEWPORT, so it holds that gap at the section's resting scroll position. A
   * further scroll brings the glass panel up across it, which nothing fixed to
   * the viewport can avoid.
   */
  /**
   * Which screen position the reference body is anchored to for this section, in
   * the window we are actually in — [x, y] as fractions of the render surface.
   *
   * The two targets exist because the gap between the section's DOM elements
   * changes shape with the layout, not because of taste: above
   * SIDE_COLUMN_MIN_W the section is a two-column shell and the body lives in the
   * open column right of the heading; below it the heading fills the width and
   * the only clean space left is the band the stylesheet reserves above the
   * heading for exactly this (sections.css, `#sec-space` padding-top, same
   * breakpoint). Without the second target the body had nowhere to go on a phone
   * or a tablet — the framing's world-space aim parked it below the fold, so the
   * planet simply was not there.
   */
  _spaceAnchor(f) {
    if (!f.anchor) return null;
    if (innerWidth >= SIDE_COLUMN_MIN_W) return f.anchor;
    /* Below the two-column breakpoint the copy is full width, and the only space
       the layout reserves for the body is the section's own padding-top band
       (sections.css, same breakpoint). A fixed fraction of the viewport ignores
       that: the band scrolls away while the aim stays put, so the body ends up
       parked on the readout copy further down the section. Track the band. */
    const band = this._spaceBand();
    const base = f.anchorNarrow || f.anchor;
    if (!band) return base;
    return [base[0], clamp(band.centre / Math.max(1, innerHeight), 0.14, 0.46)];
  }

  /* The Space section's reserved band, in viewport pixels, read from the DOM and
     the stylesheet every frame so the two cannot drift apart again. `presence`
     is 1 while the band is on screen and 0 once it has scrolled fully above the
     viewport — there is no reserved space left at that point, which is what
     _applyNarrowBodyFade acts on. */
  _spaceBand() {
    if (!this._spaceSection) this._spaceSection = document.getElementById('sec-space');
    const el = this._spaceSection;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const band = Math.max(1, parseFloat(getComputedStyle(el).paddingTop) || 0);
    return { top: rect.top, centre: rect.top + band / 2, presence: clamp((rect.top + band) / band, 0, 1) };
  }

  /* Narrow layouts: recede the reference body as its reserved band leaves the
     viewport, instead of letting it sit on top of the text. On a phone the copy
     is full width below the breakpoint, so unlike the desktop column there is
     nowhere for the body to go once the band has been scrolled past; scaling it
     out keeps the band as the only place it appears, which is what the
     stylesheet reserves and what the section was measured against. */
  _applyNarrowBodyFade() {
    const root = this.solar && this.solar.root;
    if (!root) return;
    let presence = 1;
    let scale = 1;
    if (innerWidth < SIDE_COLUMN_MIN_W && this._section === 'sec-space') {
      const band = this._spaceBand();
      if (band) presence = band.presence;
    } else if (innerWidth >= SIDE_COLUMN_MIN_W && this._solarTarget()) {
      /* Enlarged in the hero only, and only where the layout has room for it:
         at ~150 px on a dark starfield the Earth read as a blue marble, not as
         the Earth. The Space section keeps its measured size, and narrow layouts
         keep theirs. */
      scale = this._solarTarget().scale;
    }
    this._solarPresence = presence;
    root.scale.setScalar((0.001 + 0.999 * presence) * scale);
    const want = (SECTION_LAYERS[this._section] || SECTION_LAYERS['sec-hero']).solar;
    root.visible = want && presence > 0.02;
  }

  /* ── Hero: place the solar body by SCREEN fraction ────────
     A fixed world position projects to a different screen point at every
     viewport aspect, which is why the hero's Earth slid into the bottom-right
     corner and got cropped on a wide, short window. This solves a world-space
     correction that puts the disc where the framing asks for it, clamped so the
     whole disc stays inside the frame with a little air around it. It converges
     over a few frames (the offset changes the projection it is solving for), so
     it runs as a damped feedback loop rather than a one-shot calculation. */
  /* Which screen target and scale the current framing wants for the solar body.
     Split out because two call sites need the same answer (placement and scale)
     and the short-window case depends on the live aspect, not on the section. */
  _solarTarget() {
    const f = this.framing;
    if (!f || !f.solarAnchor) return null;
    const short = innerWidth / Math.max(1, innerHeight) > (f.shortAspect || 2.05);
    const scale = short && f.solarScaleShort ? f.solarScaleShort : (f.solarScale || 1);

    if (f.solarAnchor === 'head') {
      const head = this._astronautHead();
      if (!head) return null;
      const off = (short && f.solarHeadOffsetShort) ? f.solarHeadOffsetShort : (f.solarHeadOffset || [0.05, -0.012]);
      return { anchor: [head.x + off[0], head.y + off[1]], scale };
    }

    return {
      anchor: short && f.solarAnchorShort ? f.solarAnchorShort : f.solarAnchor,
      scale,
    };
  }

  _placeSolar([fx, fy], dt) {
    const root = this.solar && this.solar.root;
    if (!root || !root.visible) return;
    const body = this.solar.bodies[this.solar.activeId];
    if (!body) return;

    /* The camera was positioned and aimed earlier in this frame, but its world
       matrix is only rebuilt at render time — project against the current aim,
       not the previous frame's. */
    this.camera.updateMatrixWorld();

    root.getWorldPosition(_bodyPos);
    _bodyNdc.copy(_bodyPos).project(this.camera);

    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const depth = Math.max(0.001, _bodyPos.distanceTo(this.camera.position));
    const rNdcY = ((body.userData.radius * (root.scale.x || 1)) / depth) / tanV;
    const rNdcX = rNdcY / Math.max(0.2, this.camera.aspect);

    /* Margin = the disc plus its own drift. The body wanders ±0.46 world units
       inside its group, which at this depth is about 0.05 of the frame height —
       without allowance for it the disc would clip the edge on the far side of
       the drift. */
    const tx = clamp(fx, rNdcX + 0.03, 1 - rNdcX - 0.03);
    const ty = clamp(fy, rNdcY + 0.055, 1 - rNdcY - 0.055);

    const errX = tx * 2 - 1 - _bodyNdc.x;
    const errY = 1 - ty * 2 - _bodyNdc.y;

    if (!this._solarOffset) this._solarOffset = new THREE.Vector3();
    this.camera.matrixWorld.extractBasis(_camRight, _camUp, _otherPos);
    const step = clamp(dt * 4.5, 0, 1);
    this._solarOffset.addScaledVector(_camRight, errX * depth * tanV * this.camera.aspect * step);
    this._solarOffset.addScaledVector(_camUp, errY * depth * tanV * step);
    root.position.addScaledVector(_camRight, errX * depth * tanV * this.camera.aspect * step);
    root.position.addScaledVector(_camUp, errY * depth * tanV * step);
  }

  /* Is the pointer over the astronaut? Same projected-disc test the solar body
     uses, against the torso rather than the feet, with a generous margin — this
     decides whether a drag turns the figure or the planet behind it. */
  /* World-space centre and size of the astronaut, measured at most once per
     frame — both the head anchor and the hit test need it. Read from the
     figure's own bounds, not from assumed model units. */
  _astronautFrame() {
    const a = this.astronaut;
    if (!a || !a.root || !a.root.visible || typeof a.frame !== 'function') return null;
    if (this._astroFrame) return this._astroFrame;
    this._astroFrame = a.frame({ centre: _astroCentre, size: _astroSize, head: _astroHead });
    return this._astroFrame;
  }

  _overAstronaut(ndcX, ndcY) {
    const frame = this._astronautFrame();
    if (!frame) return false;
    /* An ELLIPSE the height of the figure, not a circle the size of its chest.
       The first version used a circle of 0.55 model units and the owner reported
       that dragging the astronaut did not work: on the head or the legs the
       pointer fell outside it. */
    const proj = _bodyNdc.copy(frame.centre).project(this.camera);
    const depth = Math.max(0.001, frame.centre.distanceTo(this.camera.position));
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const rNdcY = ((frame.size.y * 0.58) / depth) / tanV;
    const rNdcX = ((frame.size.x * 0.70) / depth) / (tanV * this.camera.aspect);
    const dx = ndcX - proj.x;
    const dy = ndcY - proj.y;
    return (dx * dx) / (rNdcX * rNdcX) + (dy * dy) / (rNdcY * rNdcY) <= 1.0;
  }

  /* Screen fraction of the astronaut's head. Used to hang the hero's planet off
     the figure: a fixed screen target cannot do this, because the astronaut's own
     screen position moves with the viewport aspect. */
  _astronautHead() {
    const frame = this._astronautFrame();
    if (!frame) return null;
    const proj = _bodyNdc.copy(frame.head).project(this.camera);
    return { x: (proj.x + 1) / 2, y: (1 - proj.y) / 2 };
  }

  _anchorBody([fx, fy], k, dt) {
    const root = this.solar && this.solar.root;
    if (!root) return;

    const eye = this.camera.position;
    root.getWorldPosition(_bodyPos);

    /* Ease toward the declared fraction. The seed is set before the camera
       moves (update()), so a fresh section starts the ease from the body's real
       position; once the section is settled this is a no-op every frame. */
    this.camState.ax = damp(this.camState.ax ?? fx, fx, k, dt);
    this.camState.ay = damp(this.camState.ay ?? fy, fy, k, dt);
    const gx = this.camState.ax;
    const gy = this.camState.ay;

    const dx = _bodyPos.x - eye.x;
    const dy = _bodyPos.y - eye.y;
    const dz = _bodyPos.z - eye.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len > 1e-3)) return;

    const elev = Math.asin(clamp(-dy / len, -1, 1));  /* body elevation, + = below */
    const bear = Math.atan2(-dx, -dz);                /* body bearing from the camera */
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const al = (gx * 2 - 1) * tanV * this.camera.aspect;
    const be = (1 - gy * 2) * tanV;
    const m2 = 1 + al * al + be * be;
    const cv = Math.cos(elev);
    const sv = Math.sin(elev);
    /* how much horizontal swing is left once the anchor's horizontal offset is
       taken out; ≤ 0 means the target cannot be reached without rolling the
       camera, so the framing's own aim is left in place */
    const a2 = cv * cv - (al * al) / m2;
    if (a2 <= 1e-6) return;

    const a = Math.sqrt(a2);
    const den = m2 * (a2 + sv * sv);
    const pitch = Math.atan2((sv + be * a) / den, (a - be * sv) / den);
    const yawOffset = Math.asin(clamp(-al / (Math.sqrt(m2) * cv), -1, 1));
    const yaw = bear - yawOffset;

    /* unit forward for that yaw/pitch — lookAt only needs a direction, and
       because it keeps the camera's up vector vertical this reproduces the
       pitch exactly with no roll */
    const cp = Math.cos(pitch);
    this.camera.lookAt(
      eye.x - Math.sin(yaw) * cp,
      eye.y - Math.sin(pitch),
      eye.z - Math.cos(yaw) * cp,
    );
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
    /* The ambient glow shell that used to be toggled here was removed from
       SpaceEnvironment: it read as a second planet beside the Earth rather than
       as light. See the removal note in SpaceEnvironment.js. */
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
