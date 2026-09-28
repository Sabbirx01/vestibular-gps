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
import { applySurface } from './surfaceDetail.js';

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

/* ═══════════════════════════════════════════════════════════
   Material dressing.

   LESSON BAKED IN HERE: an earlier version of this function blanket-set
   roughness/metalness, replaced near-black albedo with grey, and added an
   emissive floor. That destroyed what the asset actually specifies. The NASA
   suit carries KHR_materials_transmission, KHR_materials_ior and
   KHR_materials_specular on its helmet parts — real glass and a real dark
   visor — and the flat overwrite is precisely why the model looked like a
   cartoon toy.

   So now: match materials BY NAME, keep every authored albedo, and only tune
   surface response. Illumination comes from the scene environment map
   (see environment.js), not from faked emissive.
   ═══════════════════════════════════════════════════════════ */

/**
 * Real NASA ACES suit material names, e.g.
 *   acesjustforroomshow:ACES_INTERIOR_OBJ_ACES8_sized_<KEY>.<n>
 * The prefix is stable but ugly; matching on the key is enough and survives
 * the exporter's naming churn.
 */
/* `surface` names a procedural detail set from surfaceDetail.js.
   The GLB has NO textures at all, so without this every panel is one smooth
   uniform colour — the loudest CG tell. Glass and mirror parts get no
   surface detail on purpose: they should stay perfectly smooth. */
const SUIT_RULES = [
  /* helmet visor — the black mirrored pane. Glossy, opaque, strongly reflective */
  { key: 'aceshelme.008', roughness: 0.04, metalness: 0.72, env: 3.2 },
  /* helmet glass — transmission/ior already authored; reinforce as real glass */
  { key: 'aceshelme.009', roughness: 0.02, metalness: 0.06, env: 2.4, glass: true },
  /* helmet shell — the white outer dome, glossy composite, faint tooling marks */
  { key: 'aceshelme.007', roughness: 0.22, metalness: 0.06, env: 1.5, clearcoat: 0.65, surface: 'metal', repeat: 2, normalScale: 0.14 },
  /* near-white outer shell */
  { key: 'lambert4S', roughness: 0.3, metalness: 0.08, env: 1.3, surface: 'metal', repeat: 2, normalScale: 0.12 },
  /* dark interior / dark fittings — rubberised */
  { key: 'lambert6S', roughness: 0.72, metalness: 0.05, env: 0.9, surface: 'rubber', repeat: 4, normalScale: 0.5 },
  /* grey metal hardware — brushed */
  { key: 'blinn1SG', roughness: 0.3, metalness: 0.85, env: 1.6, surface: 'metal', repeat: 3, normalScale: 0.35 },
  { key: 'blinn2SG', roughness: 0.34, metalness: 0.14, env: 1.3, surface: 'metal', repeat: 3, normalScale: 0.18 },
  /* fabric body of the suit — the orange one is blinn3SG (0.69, 0.25, 0.11) */
  /* Repeat is deliberately LOW. At repeat 5 the 512 px weave tile was tiled so
     finely on a 2 m figure that it became sub-pixel dither and vanished at
     normal viewing distance — the suit read as perfectly smooth plastic. ~2.2
     puts the weave at a scale the eye can actually resolve. */
  { key: 'anisotrop', roughness: 0.86, metalness: 0.0, env: 0.8, aniso: 0.7, surface: 'fabric', repeat: 2.4, normalScale: 1.35 },
  { key: 'blinn3SG', roughness: 0.72, metalness: 0.02, env: 0.85, surface: 'fabric', repeat: 2.2, normalScale: 1.25 },
  { key: 'lambert3S', roughness: 0.72, metalness: 0.02, env: 0.85, surface: 'fabric', repeat: 2.2, normalScale: 1.25 },
  /* red and blue accent patches — same woven shell fabric */
  { key: 'lambert8S', roughness: 0.7, metalness: 0.03, env: 0.85, surface: 'fabric', repeat: 5, normalScale: 0.5 },
  { key: 'lambert5S', roughness: 0.7, metalness: 0.03, env: 0.85, surface: 'fabric', repeat: 5, normalScale: 0.5 },
  /* boots — coarse rubber */
  { key: 'shoe_lamb.004', roughness: 0.82, metalness: 0.06, env: 0.8, surface: 'rubber', repeat: 5, normalScale: 0.7 },
  { key: 'shoe_lamb.005', roughness: 0.6, metalness: 0.08, env: 1.0, surface: 'rubber', repeat: 5, normalScale: 0.45 },
];

const DEFAULT_RULE = { roughness: 0.55, metalness: 0.12, env: 1.0, surface: 'fabric', repeat: 4, normalScale: 0.35 };

function ruleFor(name) {
  if (!name) return DEFAULT_RULE;
  for (const r of SUIT_RULES) {
    if (name.includes(r.key)) return r;
  }
  return DEFAULT_RULE;
}

function applyRule(m, rule) {
  if (!m) return m;

  m.side = THREE.FrontSide;
  m.envMapIntensity = rule.env ?? 1.0;

  if ('roughness' in m && rule.roughness !== undefined) m.roughness = rule.roughness;
  if ('metalness' in m && rule.metalness !== undefined) m.metalness = rule.metalness;

  if (rule.clearcoat !== undefined && 'clearcoat' in m) {
    m.clearcoat = rule.clearcoat;
    m.clearcoatRoughness = 0.28;
  }
  if (rule.aniso !== undefined && 'anisotropy' in m) m.anisotropy = rule.aniso;

  if (rule.glass) {
    /* KHR_materials_transmission / ior are already on these materials; make
       sure they read as glass rather than being flattened into plastic. */
    m.transparent = true;
    if ('transmission' in m) m.transmission = Math.max(m.transmission ?? 0, 0.92);
    if ('ior' in m) m.ior = 1.48;
    if ('thickness' in m) m.thickness = 0.02;
    m.depthWrite = false;
  }

  /* Procedural surface detail. The asset carries no textures whatsoever, so
     without this every panel is a perfectly smooth uniform colour, which is
     the loudest "this is CG" cue. Glass and mirror parts are skipped. */
  if (rule.surface && !rule.glass) {
    applySurface(m, rule.surface, {
      repeat: rule.repeat ?? 4,
      normalScale: rule.normalScale ?? 0.4,
      roughnessMix: rule.roughness ?? 0.6,
    });
  }

  /* Never lift or replace an authored albedo, and never fake lighting with
     emissive — the environment map does that job properly. */
  if ('emissiveIntensity' in m && !m.emissiveMap) m.emissiveIntensity = 0;

  m.needsUpdate = true;
  return m;
}

/** Astronaut / hard-surface assets. */
export function dressMaterials(root) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      if (!m || seen.has(m.uuid)) return m;
      seen.add(m.uuid);
      return applyRule(m, ruleFor(m.name));
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.castShadow = false;
    o.receiveShadow = false;
    o.frustumCulled = true;
  });
  return root;
}

/**
 * Biological tissue — the brain mesh.
 *
 * The NIH mesh has a single material and no textures, so it needs a genuine
 * tissue response: matte-warm, very slightly translucent, with a soft
 * subsurface feel rather than a hard plastic shell.
 */
export function dressTissue(root, { tone = 0xe4c4ba } = {}) {
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map((m) => {
      if (!m || seen.has(m.uuid)) return m;
      seen.add(m.uuid);

      if (m.color) m.color.set(tone);

      /* Mesh conversions out of STL/Sketchfab often carry a near-black vertex
         colour layer. `material.color` is MULTIPLIED by it, so the tissue tone
         was rendering as graphite. Dropping the vertex layer lets the
         intended anatomical tone through. */
      if (m.vertexColors) m.vertexColors = false;

      if ('roughness' in m) m.roughness = 0.62;
      if ('metalness' in m) m.metalness = 0.0;
      m.envMapIntensity = 1.35;
      m.side = THREE.FrontSide;

      /* a touch of transmission gives the waxy read real cortex has, without
         turning the whole thing into jelly */
      if ('transmission' in m) m.transmission = 0.14;
      if ('thickness' in m) m.thickness = 0.35;
      if ('ior' in m) m.ior = 1.38;
      if ('sheen' in m) { m.sheen = 0.35; m.sheenColor = new THREE.Color(0xffd9cc); m.sheenRoughness = 0.6; }
      if ('emissiveIntensity' in m) m.emissiveIntensity = 0;

      m.transparent = false;
      m.depthWrite = true;
      m.needsUpdate = true;
      return m;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
    o.userData.pickId = 'cortex';
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
