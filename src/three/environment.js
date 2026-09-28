/* ═══════════════════════════════════════════════════════════
   environment — procedural image-based lighting.

   WHY THIS EXISTS
   The astronaut and brain meshes are real, but they were rendering
   flat and toy-like. The cause was not the geometry: MeshStandardMaterial
   and MeshPhysicalMaterial cannot show metal, gloss, glass or soft tissue
   response without an environment to reflect. With no env map, every
   material collapses to a single diffuse shade, which is exactly what
   "cartoon" looks like.

   This builds an equirectangular studio environment in code — a dark
   base with a cool key softbox, a cyan rim softbox and a warm bounce —
   then PMREM-filters it so roughness-aware reflections are available.
   No image file, no CDN, works offline.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';

/** Smooth falloff blob used for the softbox lights in the environment. */
function blob(u, v, cu, cv, radius, aspect) {
  let du = u - cu;
  if (du > 0.5) du -= 1;
  if (du < -0.5) du += 1;
  const dv = v - cv;
  const d = Math.sqrt((du * aspect) ** 2 + dv * dv) / radius;
  if (d >= 1) return 0;
  const t = 1 - d;
  return t * t * (3 - 2 * t);       // smoothstep falloff
}

/**
 * Build the equirectangular source image.
 *
 * The important detail is that the softboxes are SMALL and BRIGHT relative
 * to the dark base. A wide, dim gradient produces muddy, washed-out
 * reflections; tight bright sources are what create readable specular
 * highlights on the helmet and the suit panels.
 */
function buildEquirect(W = 1024, H = 512, opts = {}) {
  const {
    base = [0.012, 0.018, 0.034],
    zenith = [0.055, 0.085, 0.150],
    ground = [0.020, 0.016, 0.012],
  } = opts;

  const data = new Uint8ClampedArray(W * H * 4);

  /* softboxes: azimuth (0-1), elevation (0-1, 0 = top), radius, colour, strength */
  const sources = [
    { u: 0.62, v: 0.24, r: 0.155, c: [1.00, 0.97, 0.92], s: 7.50 },  // key, slightly warm
    { u: 0.16, v: 0.36, r: 0.130, c: [0.55, 0.78, 1.00], s: 3.20 },  // cool rim
    { u: 0.86, v: 0.62, r: 0.110, c: [0.45, 0.62, 0.95], s: 1.70 },  // low blue bounce
    { u: 0.38, v: 0.05, r: 0.090, c: [0.90, 0.94, 1.00], s: 2.30 },  // overhead fill
    { u: 0.03, v: 0.80, r: 0.140, c: [1.00, 0.72, 0.48], s: 0.85 },  // warm floor bounce
  ];

  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    /* sky gradient: zenith at the top, dark base at the horizon, ground below */
    const t = v < 0.5 ? v * 2 : 1;
    const g = v < 0.5 ? 0 : (v - 0.5) * 2;
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const i = (y * W + x) * 4;

      let r = base[0] + (zenith[0] - base[0]) * (1 - t) * (1 - t) + (ground[0] - base[0]) * g * g;
      let gg = base[1] + (zenith[1] - base[1]) * (1 - t) * (1 - t) + (ground[1] - base[1]) * g * g;
      let b = base[2] + (zenith[2] - base[2]) * (1 - t) * (1 - t) + (ground[2] - base[2]) * g * g;

      for (const s of sources) {
        const w = blob(u, v, s.u, s.v, s.r, 2.0) * s.s;
        if (w <= 0) continue;
        r += s.c[0] * w;
        gg += s.c[1] * w;
        b += s.c[2] * w;
      }

      /* tone down into display range without clipping the highlights flat */
      data[i]     = Math.min(255, Math.pow(r / (1 + r), 0.4545) * 255);
      data[i + 1] = Math.min(255, Math.pow(gg / (1 + gg), 0.4545) * 255);
      data[i + 2] = Math.min(255, Math.pow(b / (1 + b), 0.4545) * 255);
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let cachedEquirect = null;

/**
 * Returns a PMREM-filtered environment texture ready for `scene.environment`.
 * One shared instance is reused across every scene and MiniStage.
 */
export function getEnvironment(renderer, opts) {
  if (cachedEquirect && !opts) return cachedEquirect;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const equirect = buildEquirect(1024, 512, opts);
  const target = pmrem.fromEquirectangular(equirect);
  equirect.dispose();
  pmrem.dispose();

  const envMap = target.texture;
  envMap.name = 'VestibularGPSEnvironment';
  if (!opts) cachedEquirect = envMap;
  return envMap;
}

/**
 * Apply IBL plus a matching key/fill/rim light rig to a scene.
 * Called for the background scene and for every inline MiniStage so the
 * same lighting language applies everywhere.
 */
export function applyStudioLighting(scene, renderer, { intensity = 1.0, keyColour = 0xfff2e0 } = {}) {
  const env = getEnvironment(renderer);
  scene.environment = env;

  /* The env map supplies most of the illumination; these lights add the
     crisp directional highlights that a sphere-map alone softens away. */
  const key = new THREE.DirectionalLight(keyColour, 2.2 * intensity);
  key.position.set(3.4, 4.2, 3.0);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x7fb4ff, 1.5 * intensity);
  rim.position.set(-3.6, 1.2, -2.8);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0xa9c8ff, 0.7 * intensity);
  fill.position.set(-1.4, -2.4, 2.2);
  scene.add(fill);

  return { env, key, rim, fill };
}
