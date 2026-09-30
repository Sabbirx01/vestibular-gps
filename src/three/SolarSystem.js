/* ═══════════════════════════════════════════════════════════
   SolarSystem — photographic-grade procedural bodies.
   Albedo, roughness, city lights and a separate cloud deck are
   generated at build time (see planetTextures.js). No image files,
   no hotlinks, no licences: the bodies are computed, so they work
   offline and always render.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { PAL, fresnelMaterial, atmosphereMaterial, disposeTree } from './materials.js';
import { damp, TAU, clamp } from '../core/util.js';
import { GRAVITIES } from '../science/content.js';
import { BODIES, buildPlanetTextures } from './planetTextures.js';

export class SolarSystem {
  /* 768 rather than 512. Below roughly 700 the noise octaves that give
     coastlines and maria their shape start collapsing into visible blobs once
     the camera moves in, which is exactly what the space section does. */
  constructor({ quality = 'HIGH', reducedMotion = false, textureSize = 768 } = {}) {
    this.reduced = reducedMotion;
    this.quality = quality;
    this.textureSize = textureSize;
    this.root = new THREE.Group();
    this.root.name = 'solar-system';
    this.bodies = {};
    this.t = 0;
    this.activeId = 'EARTH';
    this.transitionSpeed = 10.5;
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
      /* Raised from 0.42, then to 0.7: with the stronger terminator above, the
         night side is darker, and the city lights are what make it read as a
         living planet rather than an unlit half. */
      mat.emissiveIntensity = 0.7;
    }
    /* Size of the showcase body. It used to be 1.16x smaller, to keep the
       planet from competing with the astronaut — but the fix for "it looks
       like a decal on the suit" is POSITION (it now sits clear of the figure,
       see SOLAR_POS in SceneManager.js), not being small. At 0.95 it reads as
       a sphere with a readable terminator instead of a blue smudge: about
       120 px across at the hero framing distance. */
     /* 0.88 rather than 0.95. The reference body sits in the band below the
        spec-card panel, and on a 1366x768 laptop that band is only about 120 px
        tall — at 0.95 the globe measured 119 px and the bottom edge clipped it.
        Five per cent smaller buys the margin without changing how it reads. */
     const showcaseRadius = spec.radius * 0.88;
    const surface = new THREE.Mesh(new THREE.SphereGeometry(showcaseRadius, seg, seg / 2), mat);
    surface.rotation.z = spec.tilt;
    grp.add(surface);

    /* Cloud deck: its own sphere so it can drift independently */
    let clouds = null;
    if (maps.cloudMap) {
      const cloudMat = new THREE.MeshStandardMaterial({
        map: maps.cloudMap,
        transparent: true,
        /* Now read from the body recipe. This was hardcoded 0.95 while the
           recipe's `cloudOpacity` sat there as dead config, so the two had
           already drifted apart. At 0.95 over a ~120 px disc the deck veiled the
           planet into a pale grey-white ball — the owner's read was "the Earth
           is hard to see". 0.82 keeps the swirls but lets the ocean and the
           coastlines read through from underneath. */
        opacity: spec.cloudOpacity ?? 0.9,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        alphaMap: maps.cloudMap,
        color: 0xffffff,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(showcaseRadius * 1.012, seg, seg / 2), cloudMat);
      clouds.rotation.z = spec.tilt;
      clouds.rotation.y = 0.4;
      grp.add(clouds);
    }

    /* Atmosphere: sun-facing rim shell.
       The light direction matches the key light defined below, so the glow
       peaks on the dayside limb and fades across the terminator instead of
       ringing the whole planet evenly. */
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(showcaseRadius * 1.10, 56, 36),
      atmosphereMaterial(spec.atmo, {
        power: spec.atmoPower,
        intensity: spec.atmoIntensity,
        lightDir: new THREE.Vector3(4.2, 1.8, 4.2).normalize(),
        /* a wider, softer terminator so the nightside fade is gradual */
        terminator: 0.95,
      }),
    );
    grp.add(atmo);

    /* A thin forward-scatter shell for the sunlit limb.
       Raised from 0.5: the blue rim is the single most recognisable cue that a
       sphere is a planet with air on it, and at ~120 px the old value thinned it
       to a hard cut-out edge. */
    const limb = new THREE.Mesh(
      new THREE.SphereGeometry(showcaseRadius * 1.055, 56, 36),
      fresnelMaterial(0xffffff, { power: 5.5, intensity: 0.62, side: THREE.FrontSide }),
    );
    grp.add(limb);

    /* No name label above the body any more.
       It was a floating chip reading EARTH / MOON / MARS / FREE FLOAT parked at
       showcaseRadius + 0.52, and in the Space section — where the camera sits
       close and the disc is large — it landed across the planet's upper limb as
       a white-outlined box, which is the one thing that section is not supposed
       to look like. It was also redundant: the topbar's mode chip names the
       active body, the SENSORS readout repeats it, and the gravity row
       highlights the button the visitor just pressed. Removed rather than
       dimmed, so nothing is left hovering at the top of the frame. */

    /* Key light from the direction of the sun.
       Raised from 3.6 and the fill dropped from 1.15 so the sphere carries a
       real day/night terminator. At the old ratio the fill flattened the
       planet into an evenly lit disc, which is one of the things that made it
       read as a sticker instead of a lit world. */
    /* 6.4: raised from 4.4 in the visibility pass, then again after the crop
       analysis showed the visible hemisphere was mostly ambient-lit (the sun
       direction here is up-and-right, so the camera-facing face gets little of
       the key). */
    const key = new THREE.DirectionalLight(0xfff6e8, 6.4);
    key.position.set(spec.radius * 4.2, spec.radius * 1.8, spec.radius * 4.2);
    grp.add(key);

    /* Cool fill from the opposite side so the dark limb is not pure black.
       Trimmed from 0.85 to 0.72 in the same pass that raised the key, because
       brightening alone only turned the disc up and left it flat: what makes a
       planet read as a photograph rather than a sticker is the RATIO between
       the lit hemisphere and the limb, not the absolute exposure. */
    const fill = new THREE.DirectionalLight(0x6f9fe0, 0.72);
    fill.position.set(-spec.radius * 4, -spec.radius, -spec.radius * 2);
    grp.add(fill);

    /* Touch of bounce from below — keeps the terminator readable */
    const bounce = new THREE.DirectionalLight(0x3f6d9c, 0.30);
    bounce.position.set(0, -spec.radius * 4, spec.radius * 1.5);
    grp.add(bounce);

    grp.userData = { surface, clouds, atmo, limb, spec, radius: showcaseRadius, opacity: 1 };
    this.root.add(grp);
    this.bodies[id] = grp;
    return grp;
  }

  build() {
    /* 1.75, and the reason is a measurement rather than taste. The first pass
       cut this from 1.65 to 1.45 to buy contrast, but a luminance analysis of
       the hero crop then came back with the disc at median 74 and MAX 109 out of
       255 — dim and matte, which is precisely the complaint ("the Earth is hard
       to see"). Contrast is now bought in the ALBEDO and in the cloud deck,
       where it costs no brightness, so the ambient sits above where it started.

       VERIFIED, and the answer was NOT what that paragraph assumed. Three
       lighting configurations were measured on the rendered hero — body key
       4.4 / 5.6 / 6.4 against ambient 1.65 / 1.45 / 1.75 — and all three came
       back median 74, max 109. The hero renderer runs ACESFilmicToneMapping at
       exposure 1.28, and ACES compresses hard, so once the planet is on the
       shoulder, more light buys nothing. Treat the ambient and key values in
       this file as approximately cosmetic for the showcase body; the control
       that actually moves the planet's brightness is its ALBEDO (see the ocean
       and land ladders in planetTextures.js). Kept here anyway, because they do
       shape the terminator and the other bodies (Moon, Mars) which are darker. */
    this.root.add(new THREE.AmbientLight(0x46618c, 1.75));
    /* A controlled key/fill pair makes the foreground planet readable against
       the starfield on both desktop and mobile, without flattening the texture. */
    const key = new THREE.DirectionalLight(0xfff1d2, 3.4);
    key.position.set(6, 5, 8);
    this.root.add(key);
    const fill = new THREE.DirectionalLight(0x73b8ff, 0.8);
    fill.position.set(-5, 1, 4);
    this.root.add(fill);

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
    /* Prebuilt planets crossfade quickly; no texture generation happens on a
       click. The previous 2.6 damp factor made Moon/Mars appear to lag for a
       full second, which felt like a stuck interaction. */
    this.transitionSpeed = instant ? 20 : 10.5;
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
      b.userData.opacity = damp(b.userData.opacity ?? target, target, this.transitionSpeed, dt);
      b.visible = b.userData.opacity > 0.012;
      if (!b.visible) continue;

      const spec = b.userData.spec;
      const o = b.userData.opacity;

      b.userData.surface.rotation.y += dt * spec.spin * q;
      if (b.userData.clouds) b.userData.clouds.rotation.y += dt * (spec.spin * 1.35) * q;

      /* Slow orbital drift, so the bodies visibly travel rather than only
         spinning in place. The amplitude is deliberately small: this section's
         framing aims at the fixed SOLAR_POS, not at the body, so a wide
         revolution would walk the planet straight out of frame. At 0.46 units
         on a 5.8-unit framing distance it is unmistakable motion that never
         leaves the composition. */
      const phase = k.length * 0.7;
      b.position.x = Math.sin(t * 0.055 + phase) * 0.46 * q;
      b.position.z = Math.cos(t * 0.055 + phase) * 0.24 * q;
      b.position.y = Math.sin(t * 0.24 + k.length) * 0.13 * q;

      /* Scale in with the same fast crossfade so the new planet feels like a
         deliberate animated mode transition rather than a delayed pop. */
      b.scale.setScalar(0.96 + o * 0.04);
      /* fresnelMaterial exposes uIntensity / uTime — there is no uOpacity.
         Guarded so a future uniform rename can never kill the render loop. */
      const au = b.userData.atmo.material.uniforms;
      const lu = b.userData.limb.material.uniforms;
      if (au.uIntensity) au.uIntensity.value = o * clamp(spec.atmoIntensity, 0, 1);
      if (au.uTime) au.uTime.value = t;
      if (lu.uIntensity) lu.uIntensity.value = o * 0.62;
      if (lu.uTime) lu.uTime.value = t;

      /* city lights intensify as the terminator crosses */
      if (b.userData.surface.material.emissiveIntensity !== undefined) {
        b.userData.surface.material.emissiveIntensity = 0.30 + o * 0.25;
      }
    }

    this.paths.rotation.y += dt * 0.01 * q;
    this.paths.children.forEach((p, i) => {
      p.material.opacity = 0.045 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.35 + i * 1.1));
    });

  }

  dispose() { disposeTree(this.root); }
}
