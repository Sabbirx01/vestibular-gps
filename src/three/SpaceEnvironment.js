/* ═══════════════════════════════════════════════════════════
   SpaceEnvironment — the living universe behind everything.
   Stars, nebula, dust, orbital rings, and the mouse-parallax
   depth stack. Fully procedural: no external textures at all.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
/* fresnelMaterial is not imported: its only use here was the removed origin
   glow shell. Do not add it back for a rim-lit sphere at short range — that is
   what read as a second planet. */
import { starMaterial, nebulaMaterial, PAL } from './materials.js';
import { BlackHole } from './BlackHole.js';
import { Comet } from './Comet.js';
import { TAU, clamp } from '../core/util.js';

/* Where the black hole lives: 420 units out, in the same backdrop the star
   shells occupy, so it is part of the universe and drifts with the pointer
   exactly as they do — the whole sky moves as one piece when the camera
   orbits. At 420 units it also stops being a neighbour of the astronaut: near
   the suit it read as an object in the room rather than as something far away,
   which is what was reported.

   The horizontal component is scaled by the aspect ratio in setAspect() rather
   than used raw. A portrait viewport is about 35 degrees wide against 46 of
   height, so a fixed world x of 58 sat outside the frustum entirely on a phone
   and drifted off the right edge of a narrow laptop window. */
const BH_POS = [60, 80, -420];
const BH_ASPECT = 1.78;

export class SpaceEnvironment {
  constructor({ quality, reducedMotion, aspect = BH_ASPECT }) {
    this.group = new THREE.Group();
    this.group.name = 'space';
    this.q = quality;
    this.reduced = reducedMotion;
    this.aspect = aspect;
    this.layers = [];
    this.time = 0;
    this.build();
  }

  build() {
    const q = this.q;

    /* ── Stars: shells for parallax depth ── */
    this.starsFar = this._starShell(300, 240, q.stars);
    this.starsNear = this._starShell(120, 60, Math.floor(q.stars * 0.22));
    this.group.add(this.starsFar, this.starsNear);

    /* A third shell filling 120–300 units on the higher tiers. With only the
       two originals the sky is dense out past 240 and dense again under 120,
       with a thin band between; that band is what reads as banding once the
       camera pushes toward the subject. */
    this.starsMid = null;
    if (q.stars > 4000) {
      this.starsMid = this._starShell(180, 120, Math.floor(q.stars * 0.35));
      this.group.add(this.starsMid);
    }

    /* ── Nebula: only on higher tiers (large additive fill cost) ── */
    if (q.nebula) {
      this.nebulae = new THREE.Group();
      const specs = [
        { pos: [-70, 34, -140], size: 190, color: PAL.violet, op: 0.42, rot: 0.3 },
        { pos: [96, -30, -180], size: 230, color: PAL.blue, op: 0.34, rot: -0.6 },
        { pos: [12, 62, -230], size: 300, color: PAL.cyan, op: 0.2, rot: 1.2 },
      ];
      for (const s of specs) {
        const m = nebulaMaterial(s.color, s.op);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.size, s.size), m);
        mesh.position.set(...s.pos);
        mesh.rotation.z = s.rot;
        mesh.renderOrder = -10;
        this.nebulae.add(mesh);
      }
      this.group.add(this.nebulae);
    }

    /* ── Galaxy band: structure in the far sky ──
       Placed behind everything else so it reads as the backdrop rather than
       as a ring around the scene. */
    this.galaxyBand = this._galaxyBand(q.stars > 4000 ? 14000 : 6000);
    this.galaxyBand.renderOrder = -20;
    this.group.add(this.galaxyBand);

    /* ── Dust: slow drift field close to camera ── */
    this.dust = this._dust(q.dust);
    this.group.add(this.dust);

    /* ── Orbital rings: thin elliptical arcs suggesting motion ── */
    this.orbits = new THREE.Group();
    const ringSpecs = [
      { r: 26, tilt: 0.42, color: PAL.cyan, op: 0.16 },
      { r: 40, tilt: -0.28, color: PAL.blue, op: 0.12 },
      { r: 58, tilt: 0.66, color: PAL.violet, op: 0.09 },
    ];
    for (const s of ringSpecs) {
      const geo = new THREE.RingGeometry(s.r, s.r + 0.055, 220);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(s.color), transparent: true, opacity: s.op,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2 + s.tilt;
      ring.rotation.z = s.tilt * 1.7;
      this.orbits.add(ring);
    }
    this.group.add(this.orbits);

    /* REMOVED — a 0.55-radius fresnel sphere parked at the world origin, added
       as "a light source origin" for the scene.
       Why it had to go: at the hero framing distance that sphere projects to
       roughly 112 px across, while the Earth behind it projects to 98 px, and
       the two sit about 90 px apart. A rim-lit sphere cannot read as ambient
       light at that scale — it reads as a second, slightly larger planet
       hanging beside the real one, which is exactly how it was reported: a pale
       bubble floating loose next to the Earth in the hero. The scene's actual
       light comes from the DirectionalLights plus the nebula and starfield
       layers, none of which needed this shell. */

    /* ── Black hole ──────────────────────────────────────────
       It belongs to the universe, not to the frame. Wrapped in a pivot for the
       same reason the comet is: the pointer parallax writes to the position of
       every object in `layers`, so the far offset has to live one level down or
       the object would snap to the origin on the first mouse move. The pivot
       carries the drift, the inner group carries BH_POS. */
    this.blackHole = new BlackHole({ quality: q, radius: q.stars > 4000 ? 26 : 21 });
    this.blackHolePivot = new THREE.Group();
    this.blackHolePivot.name = 'black-hole-pivot';
    this.blackHolePivot.add(this.blackHole.group);
    this.group.add(this.blackHolePivot);
    this.setAspect();

    /* ── Comet ───────────────────────────────────────────────
       Two Points clouds plus its own draw calls is real budget for pure
       backdrop, so it is skipped on the lowest tiers. Same pivot treatment:
       its group's position is driven by its own orbit, not by pointer parallax.
        */
    this.comet = null;
    this.cometPivot = null;
    if (q.nebula) {
      this.comet = new Comet({ quality: q, reducedMotion: this.reduced });
      this.cometPivot = new THREE.Group();
      this.cometPivot.name = 'comet-pivot';
      this.cometPivot.add(this.comet.group);
      this.group.add(this.cometPivot);
    }

    /* The black hole takes the smallest drift on the stack, because it is the
       furthest thing on it: 0.002 of the pointer travel, against 0.006 for the
       far star shell. The bulk of its movement comes from the camera orbit,
       shared with every other backdrop layer — that is what makes it read as
       part of the universe rather than as a decal. */
    this.layers = [
      { obj: this.galaxyBand, depth: 0.003 },
      { obj: this.blackHolePivot, depth: 0.002 },
      { obj: this.starsFar, depth: 0.006 },
      { obj: this.starsNear, depth: 0.026 },
      { obj: this.dust, depth: 0.05 },
      { obj: this.orbits, depth: 0.014 },
    ];
    if (this.starsMid) this.layers.push({ obj: this.starsMid, depth: 0.011 });
    if (this.nebulae) this.layers.push({ obj: this.nebulae, depth: 0.01 });
    if (this.cometPivot) this.layers.push({ obj: this.cometPivot, depth: 0.004 });

    /* Baseline opacities captured once, so setIntensity() restores an exact
       value instead of compounding a multiplier every section change. */
    this._dim = [
      { mat: this.starsFar.material, key: 'uOpacity', base: this.starsFar.material.uniforms.uOpacity.value },
      { mat: this.starsNear.material, key: 'uOpacity', base: this.starsNear.material.uniforms.uOpacity.value },
      { mat: this.galaxyBand.material, key: 'uOpacity', base: this.galaxyBand.material.uniforms.uOpacity.value },
      { mat: this.dust.material, key: 'uOpacity', base: this.dust.material.uniforms.uOpacity.value },
    ];
    if (this.starsMid) {
      this._dim.push({ mat: this.starsMid.material, key: 'uOpacity', base: this.starsMid.material.uniforms.uOpacity.value });
    }
    if (this.nebulae) {
      for (const m of this.nebulae.children) {
        this._dim.push({ mat: m.material, key: 'uOpacity', base: m.material.uniforms.uOpacity?.value ?? 0.4 });
      }
    }
    for (const r of this.orbits.children) {
      this._dim.push({ mat: r.material, key: 'opacity', base: r.material.opacity, literal: true });
    }
    this.intensity = 1;
  }

  _starShell(inner, outer, count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const phase = new Float32Array(count);
    const tint = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      /* uniform-ish spherical shell */
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * TAU;
      const s = Math.sqrt(1 - u * u);
      const r = inner + Math.random() * (outer - inner);
      pos[i * 3] = s * Math.cos(phi) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(phi) * r;
      /* Long tail on brightness: a few unmistakable stars, a great many faint
         ones. A uniform distribution reads as flat noise. */
      scale[i] = 0.24 + Math.pow(Math.random(), 3.6) * 1.85;
      phase[i] = Math.random();
      /* Stellar temperature, biased the way a real sky is: M and K dwarfs
         dominate and hot blue stars are rare. pow() with an exponent above 1
         produces exactly that skew, and the rare high values are what the
         diffraction spikes in the star shader key off. */
      tint[i] = Math.pow(Math.random(), 1.85);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));

    const mat = starMaterial();
    mat.uniforms.uPixelRatio.value = Math.min(devicePixelRatio || 1, 2);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  _dust(count) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const phase = new Float32Array(count);
    const tint = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 34;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 2] = 6 + Math.random() * 46;
      scale[i] = 0.2 + Math.random() * 0.55;
      phase[i] = Math.random();
      tint[i] = 0.4 + Math.random() * 0.6;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
    const mat = starMaterial();
    mat.uniforms.uSize.value = 5;
    mat.uniforms.uOpacity.value = 0.5;
    mat.uniforms.uPixelRatio.value = Math.min(devicePixelRatio || 1, 2);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  /**
   * Galaxy band — a dense river of faint stars laid along a tilted great
   * circle, with the glow coming from their density rather than from a picture.
   *
   * This is the cheapest single change that stops a star field looking like
   * scattered dots. Real skies have structure: a bright milky sweep with a
   * dark lane through it. Generating it from points rather than a texture keeps
   * it procedural and lets the parallax still work.
   */
  _galaxyBand(count = 14000) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const phase = new Float32Array(count);
    const tint = new Float32Array(count);

    const tiltX = 0.52;
    const tiltZ = -0.34;

    for (let i = 0; i < count; i++) {
      /* A great circle: full sweep in longitude, tightly clustered in
         latitude. The spread was 0.30 rad over a 245-unit radius, which
         spread the points so thinly across that annulus that no band was
         perceptible at all. 0.15 rad concentrates them into an actual lane. */
      const lon = Math.random() * TAU;
      const lat = (Math.random() + Math.random() + Math.random() - 1.5) * 0.15;
      const r = 150 + Math.random() * 150;

      const x0 = Math.cos(lat) * Math.cos(lon) * r;
      const y0 = Math.sin(lat) * r;
      const z0 = Math.cos(lat) * Math.sin(lon) * r;

      const cy = Math.cos(tiltX), sy = Math.sin(tiltX);
      const y1 = y0 * cy - z0 * sy;
      const z1 = y0 * sy + z0 * cy;
      const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);

      pos[i * 3] = x0 * cz - y1 * sz;
      pos[i * 3 + 1] = x0 * sz + y1 * cz;
      pos[i * 3 + 2] = z1;

      /* A wider brightness tail than before so the band has some grain
         instead of reading as uniform dust. */
      scale[i] = 0.20 + Math.pow(Math.random(), 2.0) * 1.05;
      phase[i] = Math.random();
      tint[i] = Math.pow(Math.random(), 1.9) * 0.9 + 0.03;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));

    const mat = starMaterial();
    /* These sit further out than the main shells, so they need a larger base
       size to survive the distance attenuation and read as a band at all. */
    mat.uniforms.uSize.value = 20;
    mat.uniforms.uOpacity.value = 0.85;
    mat.uniforms.uSpike.value = 0.3;
    mat.uniforms.uPixelRatio.value = Math.min(devicePixelRatio || 1, 2);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.name = 'galaxy-band';
    return pts;
  }

  /**
   * Section-level backdrop dimming.
   *
   * FRAMING in SceneManager.js has carried an `env` value per section since the
   * beginning — 1.0 on the hero, 0.2 on the console and integration panels —
   * with a comment saying the background is dimmed so nothing drifts behind a
   * readout. Nothing ever read it, so the backdrop stayed at full strength on
   * the densest sections. Now it is wired, which also keeps the new black hole
   * from shining through instrument panels.
   */
  setIntensity(v = 1) {
    this.intensity = v;
    for (const d of this._dim ?? []) {
      if (d.literal) d.mat[d.key] = d.base * v;
      else if (d.mat.uniforms?.[d.key]) d.mat.uniforms[d.key].value = d.base * v;
    }
    this.blackHole?.setIntensity(v);
    this.comet?.setIntensity(v);
  }

  /** Pointer parallax: each depth layer shifts by its own fraction. */
  applyPointer(nx, ny) {
    if (this.reduced) return;
    for (const l of this.layers) {
      l.obj.position.x = -nx * 100 * l.depth;
      l.obj.position.y = -ny * 70 * l.depth;
    }
  }

  /**
   * Scale the backdrop's horizontal placement with the frame's proportions.
   *
   * Called from build() and from SceneManager on every resize. The black hole
   * sits far to the right of the sky at 16:9; on a portrait phone the same
   * world x is outside the frustum, because a portrait viewport is about 35
   * degrees wide against 46 degrees of height. Pulling x in with the aspect
   * keeps it inside the picture everywhere, and the size follows so it does not
   * swell to fill a narrow screen.
   */
  setAspect(aspect) {
    if (typeof aspect === 'number' && aspect > 0) this.aspect = aspect;
    const k = clamp(this.aspect / BH_ASPECT, 0.22, 1);
    const bh = this.blackHole;
    if (!bh) return;
    bh.group.position.set(BH_POS[0] * k, BH_POS[1], BH_POS[2]);
    /* The floor is 0.85, not 0.6. At 0.6 a phone got a disc about 40 px across
       with no bloom on that tier, which is a dark smudge on a dark sky — the
       object was on screen and still invisible, reported again after the first
       fix. Moving it out to 420 units had already cost 40 per cent of its
       apparent size, so the narrow-screen shrink has to be gentle. */
    bh.group.scale.setScalar(clamp(this.aspect / BH_ASPECT, 0.85, 1));
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    const sm = this.starsFar.material.uniforms;
    sm.uTime.value = t;
    this.starsNear.material.uniforms.uTime.value = t * 1.24;
    this.dust.material.uniforms.uTime.value = t * 0.7;
    if (this.starsMid) this.starsMid.material.uniforms.uTime.value = t * 1.1;

    if (this.nebulae) {
      this.nebulae.children.forEach((m, i) => { m.material.uniforms.uTime.value = t * (0.6 + i * 0.2); });
    }

    /* These two calls were missing entirely — the black hole and comet were
       built and added to the scene, but nothing ever advanced their clocks or
       (for the comet) moved them off their construction-time default position.
       A THREE.Group with no position set defaults to the scene origin, so the
       comet sat permanently at (0,0,0) — 12.5 units from the hero camera,
       directly behind the headline — instead of drifting through the far
       background at z -132..-224 as its own update() computes. This is the
       cause of the "giant pale sphere in the hero" regression. */
    this.blackHole?.update(dt);
    this.comet?.update(dt);

    if (!this.reduced) {
      this.orbits.rotation.y += dt * 0.014;
      this.orbits.rotation.x = Math.sin(t * 0.05) * 0.05;
      this.dust.rotation.z += dt * 0.004;
      this.starsNear.rotation.y += dt * 0.006;
    }
  }

  setQuality(q) {
    /* Full rebuild is the honest cheap path — these are all generated buffers. */
    const keep = this.intensity ?? 1;
    this.q = q;
    this.dispose();
    this.group.clear();
    this.build();
    /* build() resets the backdrop to full strength; restore the current
       section's dimming so an adaptive quality step mid-scroll does not
       brighten the backdrop behind the instrument panels. */
    this.setIntensity(keep);
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
      else m?.dispose?.();
    });
  }
}
