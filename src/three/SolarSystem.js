/* ═══════════════════════════════════════════════════════════
   SolarSystem — photographic-grade procedural bodies.
   Albedo, roughness, city lights and a separate cloud deck are
   generated at build time (see planetTextures.js). No image files,
   no hotlinks, no licences: the bodies are computed, so they work
   offline and always render.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { PAL, fresnelMaterial, labelSprite, disposeTree } from './materials.js';
import { damp, TAU, clamp } from '../core/util.js';
import { GRAVITIES } from '../science/content.js';
import { BODIES, buildPlanetTextures } from './planetTextures.js';

export class SolarSystem {
  constructor({ quality = 'HIGH', reducedMotion = false, textureSize = 512 } = {}) {
    this.reduced = reducedMotion;
    this.quality = quality;
    this.textureSize = textureSize;
    this.root = new THREE.Group();
    this.root.name = 'solar-system';
    this.bodies = {};
    this.labels = [];
    this.t = 0;
    this.activeId = 'EARTH';
    this.build();
  }

  _createBody(id) {
    const spec = BODIES[id] || BODIES.EARTH;
    const grp = new THREE.Group();
    grp.name = `body-${id}`;

    /* Shared geometry detail scales with the quality tier */
    const seg = this.quality.astronautDetail === 'low' ? 48 : this.quality.astronautDetail === 'mid' ? 64 : 96;

    const maps = buildPlanetTextures(id, this.textureSize);

    const mat = new THREE.MeshStandardMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      roughness: 0.92,
      metalness: 0.02,
    });
    if (maps.emissiveMap) {
      mat.emissiveMap = maps.emissiveMap;
      mat.emissive = new THREE.Color(0xffffff);
      mat.emissiveIntensity = 0.42;
    }
    const surface = new THREE.Mesh(new THREE.SphereGeometry(spec.radius, seg, seg / 2), mat);
    surface.rotation.z = spec.tilt;
    grp.add(surface);

    /* Cloud deck: its own sphere so it can drift independently */
    let clouds = null;
    if (maps.cloudMap) {
      const cloudMat = new THREE.MeshStandardMaterial({
        map: maps.cloudMap,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        alphaMap: maps.cloudMap,
        color: 0xffffff,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(spec.radius * 1.012, seg, seg / 2), cloudMat);
      clouds.rotation.z = spec.tilt;
      clouds.rotation.y = 0.4;
      grp.add(clouds);
    }

    /* Atmosphere: fresnel rim shell */
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius * 1.10, 48, 32),
      fresnelMaterial(spec.atmo, { power: spec.atmoPower, intensity: spec.atmoIntensity, side: THREE.BackSide }),
    );
    grp.add(atmo);

    /* A thin forward-scatter shell for the sunlit limb */
    const limb = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius * 1.055, 48, 32),
      fresnelMaterial(0xffffff, { power: 5.5, intensity: 0.5, side: THREE.FrontSide }),
    );
    grp.add(limb);

    /* Label */
    const label = labelSprite(id === 'MICROGRAVITY' ? 'FREE FLOAT' : id, { size: 38, scale: 0.5, color: '#bfe6ff' });
    label.position.set(0, spec.radius + 0.42, 0);
    label.userData.target = id;
    grp.add(label);
    this.labels.push(label);

    /* Key light from the direction of the sun */
    const key = new THREE.DirectionalLight(0xfff6e8, 3.6);
    key.position.set(spec.radius * 4.2, spec.radius * 1.8, spec.radius * 4.2);
    grp.add(key);

    /* Cool fill from the opposite side so the dark limb is not pure black */
    const fill = new THREE.DirectionalLight(0x6f9fe0, 1.15);
    fill.position.set(-spec.radius * 4, -spec.radius, -spec.radius * 2);
    grp.add(fill);

    /* Touch of bounce from below — keeps the terminator readable */
    const bounce = new THREE.DirectionalLight(0x3f6d9c, 0.5);
    bounce.position.set(0, -spec.radius * 4, spec.radius * 1.5);
    grp.add(bounce);

    grp.userData = { surface, clouds, atmo, limb, spec, radius: spec.radius, opacity: 1 };
    this.root.add(grp);
    this.bodies[id] = grp;
    return grp;
  }

  build() {
    this.root.add(new THREE.AmbientLight(0x46618c, 1.35));

    for (const g of GRAVITIES) this._createBody(g.id);

    /* Orbital guide rings */
    this.paths = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const r = 3.1 + i * 1.35;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.014, 220),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(i % 2 ? PAL.blue : PAL.cyan),
          transparent: true, opacity: 0.09, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.set(-Math.PI / 2 + 0.12 * i, 0, 0.34 * i);
      this.paths.add(ring);
    }
    this.root.add(this.paths);

    this.setActive('EARTH', true);
  }

  setActive(id, instant = false) {
    if (!this.bodies[id]) id = 'EARTH';
    this.activeId = id;
    for (const [k, b] of Object.entries(this.bodies)) {
      const on = k === id;
      if (on) b.visible = true;
      b.userData.opacity = instant ? (on ? 1 : 0) : (b.userData.opacity ?? (on ? 1 : 0));
      if (instant && !on) b.visible = false;
    }
    const g = GRAVITIES.find((x) => x.id === id) || GRAVITIES[0];
    this.floatAmount = g.float;
    this.otolithLoad = g.otolith;
  }

  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const q = state.reducedMotion || this.reduced ? 0 : 1;

    for (const [k, b] of Object.entries(this.bodies)) {
      const on = k === this.activeId;
      const target = on ? 1 : 0;
      b.userData.opacity = damp(b.userData.opacity ?? target, target, 2.6, dt);
      b.visible = b.userData.opacity > 0.012;
      if (!b.visible) continue;

      const spec = b.userData.spec;
      const o = b.userData.opacity;

      b.userData.surface.rotation.y += dt * spec.spin * q;
      if (b.userData.clouds) b.userData.clouds.rotation.y += dt * (spec.spin * 1.35) * q;
      b.position.y = Math.sin(t * 0.24 + k.length) * 0.13 * q;

      b.scale.setScalar(0.82 + o * 0.18);
      /* fresnelMaterial exposes uIntensity / uTime — there is no uOpacity.
         Guarded so a future uniform rename can never kill the render loop. */
      const au = b.userData.atmo.material.uniforms;
      const lu = b.userData.limb.material.uniforms;
      if (au.uIntensity) au.uIntensity.value = o * clamp(spec.atmoIntensity, 0, 1);
      if (au.uTime) au.uTime.value = t;
      if (lu.uIntensity) lu.uIntensity.value = o * 0.5;
      if (lu.uTime) lu.uTime.value = t;

      /* city lights intensify as the terminator crosses */
      if (b.userData.surface.material.emissiveIntensity !== undefined) {
        b.userData.surface.material.emissiveIntensity = 0.30 + o * 0.25 + (state.mode === 'MICROGRAVITY' ? 0 : 0);
      }
    }

    this.paths.rotation.y += dt * 0.01 * q;
    this.paths.children.forEach((p, i) => {
      p.material.opacity = 0.045 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.35 + i * 1.1));
    });

    this.labels.forEach((l) => {
      const on = l.userData.target === this.activeId;
      l.material.opacity = damp(l.material.opacity, on ? 0.92 : 0, 4, dt);
    });
  }

  dispose() { disposeTree(this.root); }
}
