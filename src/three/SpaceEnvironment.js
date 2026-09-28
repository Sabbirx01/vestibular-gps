/* ═══════════════════════════════════════════════════════════
   SpaceEnvironment — the living universe behind everything.
   Stars, nebula, dust, orbital rings, and the mouse-parallax
   depth stack. Fully procedural: no external textures at all.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { starMaterial, nebulaMaterial, fresnelMaterial, PAL } from './materials.js';
import { TAU } from '../core/util.js';

export class SpaceEnvironment {
  constructor({ quality, reducedMotion }) {
    this.group = new THREE.Group();
    this.group.name = 'space';
    this.q = quality;
    this.reduced = reducedMotion;
    this.layers = [];
    this.time = 0;
    this.build();
  }

  build() {
    const q = this.q;

    /* ── Stars: two shells for parallax depth ── */
    this.starsFar = this._starShell(300, 240, q.stars);
    this.starsNear = this._starShell(120, 60, Math.floor(q.stars * 0.22));
    this.group.add(this.starsFar, this.starsNear);

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

    /* ── Central atmospheric glow so the scene has a light source origin ── */
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 32, 24),
      fresnelMaterial(PAL.cyan, { power: 2.0, intensity: 1.4, side: THREE.BackSide }),
    );
    this.group.add(this.core);

    this.layers = [
      { obj: this.starsFar, depth: 0.006 },
      { obj: this.starsNear, depth: 0.026 },
      { obj: this.dust, depth: 0.05 },
      { obj: this.orbits, depth: 0.014 },
    ];
    if (this.nebulae) this.layers.push({ obj: this.nebulae, depth: 0.01 });
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
      scale[i] = 0.28 + Math.pow(Math.random(), 3.2) * 1.5;
      phase[i] = Math.random();
      tint[i] = Math.random();
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

  /** Pointer parallax: each depth layer shifts by its own fraction. */
  applyPointer(nx, ny) {
    if (this.reduced) return;
    for (const l of this.layers) {
      l.obj.position.x = -nx * 100 * l.depth;
      l.obj.position.y = -ny * 70 * l.depth;
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;

    const sm = this.starsFar.material.uniforms;
    sm.uTime.value = t;
    this.starsNear.material.uniforms.uTime.value = t * 1.24;
    this.dust.material.uniforms.uTime.value = t * 0.7;

    if (this.nebulae) {
      this.nebulae.children.forEach((m, i) => { m.material.uniforms.uTime.value = t * (0.6 + i * 0.2); });
    }
    this.core.material.uniforms.uTime.value = t;

    if (!this.reduced) {
      this.orbits.rotation.y += dt * 0.014;
      this.orbits.rotation.x = Math.sin(t * 0.05) * 0.05;
      this.dust.rotation.z += dt * 0.004;
      this.starsNear.rotation.y += dt * 0.006;
    }
  }

  setQuality(q) {
    /* Full rebuild is the honest cheap path — these are all generated buffers. */
    this.q = q;
    this.dispose();
    this.group.clear();
    this.build();
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
