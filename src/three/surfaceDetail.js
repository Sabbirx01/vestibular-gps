/* ═══════════════════════════════════════════════════════════
   surfaceDetail — procedural material detail maps.

   WHY THIS EXISTS
   The NASA suit GLB contains ZERO textures: no albedo detail, no normal
   maps, no roughness maps (verified: `images: 0, textures: 0`). Every
   surface therefore renders as one perfectly smooth, uniform colour.
   That smoothness is the single loudest "this is CG" cue — real fabric
   has weave, seams, wear and varying sheen; real metal has brushed
   streaks and scratches.

   Adding an environment map fixed the lighting but cannot invent surface
   structure that is not in the file. This module generates that structure
   in code: tileable normal + roughness maps for woven fabric, brushed
   metal and rubber, so it still ships with no external image assets.

   Convention: normal maps are tangent-space, +Y up, and are kept near
   flat (small deviations) because a strong normal map on a clean mesh
   looks like noise rather than material.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';

/* ── small deterministic noise ───────────────────────────── */
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

function fbm2(x, y, seed, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

function makeTexture(data, W, H, { srgb = false, repeat = 1 } = {}) {
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ═══════════════════════════════════════════════════════════
   Weave height field — shared by fabric normal + roughness
   ═══════════════════════════════════════════════════════════ */
function weaveHeight(u, v, {
  threads = 96,        // threads across the tile
  threadProfile = 0.55, // how rounded each thread is
  crossing = 0.6,       // strength of the over/under alternation
  wear = 0.35,          // low-frequency scuffing
  seed = 7,
} = {}) {
  const tu = u * threads;
  const tv = v * threads;

  /* Each thread is a rounded ridge across its own axis */
  const fu = Math.abs(((tu % 1) + 1) % 1 - 0.5) * 2;   // 1 at thread edge, 0 at centre
  const fv = Math.abs(((tv % 1) + 1) % 1 - 0.5) * 2;

  /* Which axis is on top alternates cell by cell -> plain weave */
  const cellU = Math.floor(tu);
  const cellV = Math.floor(tv);
  const overU = ((cellU + cellV) % 2) === 0;

  const ridgeU = Math.pow(1 - fu, threadProfile);
  const ridgeV = Math.pow(1 - fv, threadProfile);

  let h = overU
    ? ridgeU * (1 - crossing * 0.5 * fv) + ridgeV * (1 - crossing) * 0.55
    : ridgeV * (1 - crossing * 0.5 * fu) + ridgeU * (1 - crossing) * 0.55;

  /* per-thread thickness variation so it does not look printed */
  const thick = 0.82 + 0.36 * valueNoise(cellU * 0.7, cellV * 0.7, seed);
  h *= thick;

  /* large-scale creasing and scuffing */
  const low = fbm2(u * 7, v * 7, seed + 101, 4);
  h += (low - 0.5) * wear;

  return h;
}

/* ═══════════════════════════════════════════════════════════
   Public generators
   ═══════════════════════════════════════════════════════════ */

/** Woven fabric: normal + roughness. */
export function makeFabricMaps({ size = 512, repeat = 1, threads = 96, strength = 1.0, baseRough = 0.72 } = {}) {
  const W = size, H = size;
  const nrm = new Uint8ClampedArray(W * H * 4);
  const rgh = new Uint8ClampedArray(W * H * 4);
  const h = (x, y) => weaveHeight(x / W, y / H, { threads });

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;

      /* central differences give the surface gradient */
      const hx = h(x + 1, y) - h(x - 1, y);
      const hy = h(x, y + 1) - h(x, y - 1);

      /* keep the slope small: a strong normal map on a clean mesh reads as noise */
      const nx = -hx * 2.2 * strength;
      const ny = -hy * 2.2 * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      nrm[i]     = ((nx / len) * 0.5 + 0.5) * 255;
      nrm[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nrm[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;

      /* highlights sit on the thread crowns, shadows in the interstices */
      const crown = Math.min(1, Math.max(0, h(x, y)));
      const wear = fbm2(x / W * 11, y / H * 11, 313, 3);
      const r = baseRough - crown * 0.24 + (wear - 0.5) * 0.18;
      const rv = Math.round(Math.min(1, Math.max(0.05, r)) * 255);
      rgh[i] = rv; rgh[i + 1] = rv; rgh[i + 2] = rv; rgh[i + 3] = 255;
    }
  }

  return {
    normalMap: makeTexture(nrm, W, H, { repeat }),
    roughnessMap: makeTexture(rgh, W, H, { repeat }),
  };
}

/** Brushed / anodised metal: subtle directional streaks. */
export function makeMetalMaps({ size = 512, repeat = 1, baseRough = 0.34, streak = 0.5 } = {}) {
  const W = size, H = size;
  const nrm = new Uint8ClampedArray(W * H * 4);
  const rgh = new Uint8ClampedArray(W * H * 4);

  const height = (x, y) => {
    /* long thin streaks along X plus fine grain */
    const s = fbm2(x / W * 3.0, y / H * 90, 55, 3);
    const g = fbm2(x / W * 60, y / H * 60, 77, 2);
    return s * streak + g * 0.18;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const hx = height(x + 1, y) - height(x - 1, y);
      const hy = height(x, y + 1) - height(x, y - 1);
      const nx = -hx * 1.1, ny = -hy * 1.1, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nrm[i]     = ((nx / len) * 0.5 + 0.5) * 255;
      nrm[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nrm[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;

      const v = height(x, y);
      const rv = Math.round(Math.min(1, Math.max(0.04, baseRough + (v - 0.35) * 0.55)) * 255);
      rgh[i] = rv; rgh[i + 1] = rv; rgh[i + 2] = rv; rgh[i + 3] = 255;
    }
  }

  return {
    normalMap: makeTexture(nrm, W, H, { repeat }),
    roughnessMap: makeTexture(rgh, W, H, { repeat }),
  };
}

/** Rubber / boot sole: coarse pebbled texture. */
export function makeRubberMaps({ size = 512, repeat = 1, baseRough = 0.82 } = {}) {
  const W = size, H = size;
  const nrm = new Uint8ClampedArray(W * H * 4);
  const rgh = new Uint8ClampedArray(W * H * 4);

  const height = (x, y) => {
    const n = fbm2(x / W * 34, y / H * 34, 211, 3);
    const t = fbm2(x / W * 8, y / H * 8, 401, 2);
    return n * 0.75 + t * 0.25;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const hx = height(x + 1, y) - height(x - 1, y);
      const hy = height(x, y + 1) - height(x, y - 1);
      const nx = -hx * 3.0, ny = -hy * 3.0, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nrm[i]     = ((nx / len) * 0.5 + 0.5) * 255;
      nrm[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nrm[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;

      const v = height(x, y);
      const rv = Math.round(Math.min(1, Math.max(0.1, baseRough + (v - 0.5) * 0.3)) * 255);
      rgh[i] = rv; rgh[i + 1] = rv; rgh[i + 2] = rv; rgh[i + 3] = 255;
    }
  }

  return {
    normalMap: makeTexture(nrm, W, H, { repeat }),
    roughnessMap: makeTexture(rgh, W, H, { repeat }),
  };
}

/* ── shared, lazily built, cached ────────────────────────── */
const cache = new Map();

/**
 * Get (and cache) a map set by kind.
 * Building these costs a few hundred ms each, so they are created once and
 * shared across every material that needs the same surface.
 */
export function getSurfaceMaps(kind, opts = {}) {
  const key = kind + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);

  let maps;
  if (kind === 'fabric') maps = makeFabricMaps(opts);
  else if (kind === 'metal') maps = makeMetalMaps(opts);
  else if (kind === 'rubber') maps = makeRubberMaps(opts);
  else maps = null;

  cache.set(key, maps);
  return maps;
}

/** Apply a generated map set to a material. */
export function applySurface(material, kind, { repeat = 1, normalScale = 0.55, roughnessMix = 1.0 } = {}) {
  const maps = getSurfaceMaps(kind, { repeat, ...(kind === 'fabric' ? { threads: Math.round(96 * repeat) } : {}) });
  if (!maps) return material;

  material.normalMap = maps.normalMap;
  material.normalScale = new THREE.Vector2(normalScale, normalScale);

  if (maps.roughnessMap && 'roughnessMap' in material) {
    material.roughnessMap = maps.roughnessMap;
    material.roughness = roughnessMix;
  }
  material.needsUpdate = true;
  return material;
}
