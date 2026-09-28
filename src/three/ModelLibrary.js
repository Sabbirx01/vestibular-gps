/* ═══════════════════════════════════════════════════════════
   ModelLibrary — real, openly-licensed 3D assets.

   These are NOT generated placeholders. They are downloaded from
   the sources that publish them and shipped inside assets/models,
   so the site stays fully offline:

     nasa-aces-suit.glb  NASA 3D Resources — Advanced Crew Escape Suit
                         https://science.nasa.gov/3d-resources/
                         Public domain ("free and without copyright")

     nih-brain.glb       NIH 3D — Detailed Human Brain Model
                         https://3d.nih.gov/entries/3DPX-021161
                         CC-BY 4.0 — attribution shown on the Research page

   Every loader degrades gracefully: if a file is missing or fails to
   parse, the caller keeps its previous geometry instead of breaking.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { DRACOLoader } from '../../vendor/loaders/DRACOLoader.js';

const loader = new GLTFLoader();

/* The NASA suit GLB is Draco-compressed. Without a decoder GLTFLoader refuses
   to parse it and the astronaut silently falls back to procedural geometry —
   which is exactly what happened before this was wired up. The decoder files
   are vendored next to three.js so the site still works offline. */
const draco = new DRACOLoader();
draco.setDecoderPath('./vendor/libs/draco/gltf/');
/* Do NOT force `setDecoderConfig({ type: 'js' })` here. That pinned the decode
   to the slower JavaScript path even though draco_decoder.wasm is vendored and
   served with the correct application/wasm MIME type. Leaving the config at
   its default lets DRACOLoader prefer WebAssembly and fall back to JS only on
   browsers that cannot instantiate it. */
loader.setDRACOLoader(draco);

const cache = new Map();

export const MODEL_URLS = {
  suit: './assets/models/nasa-aces-suit.glb',
  brain: './assets/models/nih-brain.glb',
};

/** Load a GLB once; later callers share the same promise. */
export function loadModel(key) {
  const url = MODEL_URLS[key];
  if (!url) return Promise.reject(new Error(`unknown model key: ${key}`));
  if (cache.has(key)) return cache.get(key);

  const p = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => reject(new Error(`${key}: ${err?.message || 'load failed'}`)),
    );
  });
  cache.set(key, p);
  return p;
}

/** Everything the model contains, as a flat array of meshes. */
export function meshesOf(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) out.push(o); });
  return out;
}

/** World-space bounding box of a subtree. */
export function boundsOf(root) {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  box.setFromObject(root);
  return box;
}

/**
 * Uniformly scale a model so its largest dimension equals `targetSize`,
 * then centre it on the origin and drop its base to y = 0.
 * Returns the metrics that were applied so the caller can reason about them.
 */
export function normalizeModel(root, { targetSize = 2, dropToFloor = true, axis = 'y' } = {}) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const dominant = axis === 'y' ? size.y : Math.max(size.x, size.y, size.z);
  const scale = dominant > 0 ? targetSize / dominant : 1;

  /* Reparent into a carrier so the asset's own transform is untouched.
     The model is centred on the origin, then the carrier is lifted by half
     its scaled height, which puts its base exactly on y = 0. */
  const carrier = new THREE.Group();
  carrier.add(root);
  root.position.sub(center);
  carrier.scale.setScalar(scale);
  carrier.position.y = dropToFloor ? (size.y * scale) / 2 : 0;

  carrier.userData.metrics = {
    rawSize: size.clone(),
    rawCenter: center.clone(),
    appliedScale: scale,
    normalizedSize: size.clone().multiplyScalar(scale),
  };
  return carrier;
}

/**
 * Bring a loaded GLB into the project's lighting model.
 *
 * The NASA suit ships with 14 materials but no textures and no environment
 * map, so MeshStandardMaterial renders flat and very dark. Giving the parts
 * sensible roughness/metalness and a modest emissive floor makes the asset
 * read properly against a dark space background.
 */
export function dressMaterials(root, { roughness = 0.52, metalness = 0.22, emissiveFloor = 0.06 } = {}) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = Array.isArray(o.material) ? mats.map(up) : up(mats[0]);
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = true;

    function up(m) {
      if (!m) return m;
      if (seen.has(m.uuid)) return m;
      seen.add(m.uuid);

      m.side = THREE.FrontSide;
      if ('roughness' in m) m.roughness = roughness;
      if ('metalness' in m) m.metalness = metalness;
      if (m.color) {
        /* lift near-black albedo so shapes are readable on a dark background */
        if (m.color.r + m.color.g + m.color.b < 0.35) m.color.setRGB(0.62, 0.68, 0.78);
      }
      if ('emissive' in m) {
        m.emissive = new THREE.Color(m.color ? m.color.getHex() : 0x8899aa);
        m.emissiveIntensity = emissiveFloor;
      }
      m.needsUpdate = true;
      return m;
    }
  });
  return root;
}

/** Count triangles, for the debug overlay. */
export function trianglesOf(root) {
  let tris = 0;
  root.traverse((o) => {
    const g = o.geometry;
    if (!g) return;
    const count = g.index ? g.index.count : g.attributes.position?.count || 0;
    tris += count / 3;
  });
  return Math.round(tris);
}

/** Free GPU memory for a subtree. */
export function disposeModel(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
    else m?.dispose?.();
  });
}
