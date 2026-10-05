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
  /* near-white outer shell — the target look is a clean white EVA suit,
     not the source asset's warm room-show palette. */
  { key: 'lambert4S', tint: 0xf0f1ee, roughness: 0.36, metalness: 0.05, env: 1.15, surface: 'metal', repeat: 2, normalScale: 0.10 },
  /* dark interior / dark fittings — rubberised */
  { key: 'lambert6S', tint: 0x101722, roughness: 0.72, metalness: 0.05, env: 0.9, surface: 'rubber', repeat: 4, normalScale: 0.5 },
  /* grey metal hardware — brushed */
  { key: 'blinn1SG', tint: 0x44515f, roughness: 0.3, metalness: 0.85, env: 1.6, surface: 'metal', repeat: 3, normalScale: 0.35 },
  { key: 'blinn2SG', tint: 0xe4e9ef, roughness: 0.34, metalness: 0.14, env: 1.3, surface: 'metal', repeat: 3, normalScale: 0.18 },
  /* Main fabric body — the source GLB labels this material blinn3SG and
     ships it orange. Recolour it to the white pressure-garment fabric while
     preserving geometry, seams and generated weave detail. */
  { key: 'anisotrop', tint: 0xdedfdc, roughness: 0.82, metalness: 0.0, env: 0.72, aniso: 0.45, surface: 'fabric', repeat: 2.4, normalScale: 0.72 },
  { key: 'blinn3SG', tint: 0xe7e6e1, roughness: 0.77, metalness: 0.01, env: 0.78, surface: 'fabric', repeat: 2.2, normalScale: 0.68 },
  /* orange safety bands and high-visibility hardware */
  { key: 'lambert3S', tint: 0xf27a22, roughness: 0.72, metalness: 0.02, env: 0.85, surface: 'fabric', repeat: 2.2, normalScale: 1.25 },
  { key: 'lambert8S', tint: 0xf27a22, roughness: 0.7, metalness: 0.03, env: 0.85, surface: 'fabric', repeat: 5, normalScale: 0.5 },
  /* navy mission patches and wrist/neck restraint panels */
  { key: 'lambert5S', tint: 0x173b61, roughness: 0.7, metalness: 0.03, env: 0.85, surface: 'fabric', repeat: 5, normalScale: 0.5 },
  /* boots — white upper with coarse dark sole response */
  { key: 'shoe_lamb.004', tint: 0x17212e, roughness: 0.82, metalness: 0.06, env: 0.8, surface: 'rubber', repeat: 5, normalScale: 0.7 },
  { key: 'shoe_lamb.005', tint: 0xdce3eb, roughness: 0.6, metalness: 0.08, env: 1.0, surface: 'rubber', repeat: 5, normalScale: 0.45 },
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

  /* The NASA asset's geometry is valuable, but its room-show export uses an
     orange suit palette. A rule may retint only the base colour; maps and
     geometry remain untouched, so the result stays physically detailed. */
  if (rule.tint !== undefined && m.color) m.color.set(rule.tint);

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

/* ═══════════════════════════════════════════════════════════
   Suit decoration.

   The NASA asset is a single mesh with 14 material groups — there is no
   separate "helmet" object to select. So the iconic elements are added as
   new geometry, placed by measuring the material groups the asset already
   has rather than by guessing coordinates.

   The gold visor in particular is the single most recognisable thing about
   a spacesuit, and the asset's own visor material renders as a dark recess.
   A mirrored lens over it is what makes the figure read as an astronaut at
   a glance instead of as a white domed mannequin.
   ═══════════════════════════════════════════════════════════ */

/**
 * Bounds of the geometry a given material covers, expressed in `space`'s
 * local frame.
 *
 * Geometry positions are in the mesh's own local space, but everything else
 * here is measured in the carrier's frame. If the glTF node carries any
 * transform at all, comparing the two without mapping would silently place
 * the visor in the wrong spot, so every point is transformed explicitly.
 */
function groupBounds(mesh, pattern, space) {
  const geo = mesh.geometry;
  const pos = geo?.attributes?.position;
  if (!pos) return null;

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const groups = geo.groups && geo.groups.length
    ? geo.groups
    : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];

  mesh.updateWorldMatrix(true, false);
  space.updateWorldMatrix(true, false);
  const toSpace = new THREE.Matrix4()
    .copy(space.matrixWorld)
    .invert()
    .multiply(mesh.matrixWorld);

  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let hit = false;

  for (const g of groups) {
    const m = mats[g.materialIndex];
    if (!m || !pattern.test(m.name || '')) continue;
    for (let i = g.start; i < g.start + g.count; i++) {
      const idx = geo.index ? geo.index.getX(i) : i;
      v.fromBufferAttribute(pos, idx).applyMatrix4(toSpace);
      box.expandByPoint(v);
      hit = true;
    }
  }
  return hit ? box : null;
}

/**
 * Add restrained optical detail on top of the source suit mesh. The default
 * is a smoked visor only, so the public-domain suit reads as a photographed
 * pressure garment rather than a science-fiction game prop. Optional
 * instrument overlays remain available for non-hero scenes.
 *
 * @returns {{visor:boolean, front:number, tris:number}}
 */
export function decorateSuit(carrier, {
   visorColour = 0x101820,
   visorTint = 0x05080d,
   lampColour = 0xbfe9ff,
   accentColour = 0x5fe3ff,
   instrumentOverlay = false,
 } = {}) {
  const meshes = [];
  carrier.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) return { visor: false, front: 1, tris: 0 };

  /* The whole figure, measured in the carrier's own frame. */
  carrier.updateWorldMatrix(true, true);
  const toCarrier = new THREE.Matrix4().copy(carrier.matrixWorld).invert();
  const bodyBox = new THREE.Box3();
  const corner = new THREE.Vector3();
  for (const m of meshes) {
    const bb = new THREE.Box3().setFromObject(m);
    for (const sx of [bb.min.x, bb.max.x]) {
      for (const sy of [bb.min.y, bb.max.y]) {
        for (const sz of [bb.min.z, bb.max.z]) {
          corner.set(sx, sy, sz).applyMatrix4(toCarrier);
          bodyBox.expandByPoint(corner);
        }
      }
    }
  }
  const bodySize = new THREE.Vector3();
  const bodyCentre = new THREE.Vector3();
  bodyBox.getSize(bodySize);
  bodyBox.getCenter(bodyCentre);

  /* Find the helmet groups. `.007` is the white shell, `.008`/`.009` the dark
     visor recess and its glass. Comparing their centres tells us which way the
     figure faces — no hard-coded axis, so this survives a re-exported asset
     with a different up or forward. */
  let shellBox = null;
  let visorBox = null;
  for (const m of meshes) {
    if (!shellBox) shellBox = groupBounds(m, /aceshelme\.007/i, carrier);
    if (!visorBox) visorBox = groupBounds(m, /aceshelme\.00[89]/i, carrier);
  }

  const centre = new THREE.Vector3();
  let front = 1;

  if (shellBox && visorBox) {
    const s = shellBox.getCenter(new THREE.Vector3());
    const v = visorBox.getCenter(new THREE.Vector3());
    /* the visor sits on the front of the head, so this offset IS "forward" */
    front = Math.sign(v.z - s.z) || 1;
  }

  const detail = new THREE.Group();
  detail.name = 'suit-detail';
  carrier.add(detail);

  /* ── Mirrored visor ───────────────────────────────────── */
  let visorAdded = false;
  if (visorBox) {
    const vs = new THREE.Vector3();
    visorBox.getSize(vs);
    visorBox.getCenter(centre);

    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(vs.x, vs.y) * 0.62, 40, 28),
      new THREE.MeshPhysicalMaterial({
        /* Smoked polycarbonate: dark enough to conceal the interior in the
           hero, but still reflective like the reference ACES visor rather than
           a gold game prop. */
        color: new THREE.Color(visorColour),
        metalness: 0.35,
        roughness: 0.105,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        envMapIntensity: 2.5,
      }),
    );
    /* flatten into a lens and push it just proud of the recess */
    lens.scale.set(0.92, 0.78, 0.45);
    lens.position.copy(centre);
    lens.position.z += front * vs.z * 0.42;
    lens.renderOrder = 2;
    detail.add(lens);
    visorAdded = true;
  }

  /* ── Helmet work lights ───────────────────────────────── */
  if (instrumentOverlay && shellBox) {
    const ss = new THREE.Vector3();
    shellBox.getSize(ss);
    shellBox.getCenter(centre);
    /* Emissive-only material with a near-black base. A white base plus white
       emissive produced two neutral dots that read as specular highlights on
       the white shell — the lamps were rendering, but they were invisible as
       lamps. A saturated colour on a dark base is unambiguous. */
    /* WHY THE INTENSITY IS LOW AND THE COLOUR IS EXTREME
       At emissiveIntensity 14 the output is roughly (10.5, 12.7, 14) before
       tone mapping. ACES compresses all three channels toward 1, so the result
       desaturates to pure white — measured as (255,255,255) across the whole
       lamp. Keeping the RED channel at zero and the intensity near 4 means
       red stays at zero through the tone map and the lamp renders as a vivid
       cyan that cannot wash out. */
    const lampMat = new THREE.MeshStandardMaterial({
       color: 0x04121c,
       emissive: new THREE.Color(lampColour),
       emissiveIntensity: 4.2,
       roughness: 0.2, metalness: 0.0,
     });
    const shellR = Math.max(ss.x, ss.y, ss.z) * 0.5;
    for (const sx of [-1, 1]) {
      /* Placed up and out, so they silhouette against open space rather than
         sitting on top of the bright shell where they cannot be read. */
      const dir = new THREE.Vector3(sx * 0.66, 0.66, front * 0.36).normalize();
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(shellR * 0.21, 16, 12), lampMat);
      lamp.position.set(
        centre.x + dir.x * shellR * 1.10,
        centre.y + dir.y * shellR * 1.10,
        centre.z + dir.z * shellR * 1.10,
      );
      detail.add(lamp);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(shellR * 0.46, 14, 10),
        new THREE.MeshBasicMaterial({
          /* same reasoning as the lamp: a fully saturated colour at modest
             opacity survives additive blending, white does not */
          color: new THREE.Color(0x0088dd), transparent: true, opacity: 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      halo.position.copy(lamp.position);
      detail.add(halo);
    }
  }

  /* ── Chest status cluster ─────────────────────────────── */
  if (instrumentOverlay) {
    const unit = bodySize.y;
    const chestY = bodyBox.min.y + bodySize.y * 0.66;

    /* Find the CHEST PLANE, not the whole-body front extent.
       bodyBox.max.z is the boot toe or visor tip, not the chest, so anchoring
       to it left the cluster hanging in front of the torso with a visible gap.
       Sampling only the vertices inside a thin horizontal slice at chest
       height gives the surface the pack actually sits against. */
    const band = bodySize.y * 0.045;
    const sliceBox = new THREE.Box3();
    const sv = new THREE.Vector3();
    for (const m of meshes) {
      const pos = m.geometry?.attributes?.position;
      if (!pos) continue;
      m.updateWorldMatrix(true, false);
      const toC = new THREE.Matrix4().copy(carrier.matrixWorld).invert().multiply(m.matrixWorld);
      for (let i = 0; i < pos.count; i += 3) {      // stride: enough for a bbox
        sv.fromBufferAttribute(pos, i).applyMatrix4(toC);
        if (sv.y < chestY - band || sv.y > chestY + band) continue;
        sliceBox.expandByPoint(sv);
      }
    }
    const chestFrontZ = sliceBox.isEmpty()
      ? (front > 0 ? bodyBox.max.z : bodyBox.min.z)
      : (front > 0 ? sliceBox.max.z : sliceBox.min.z);
    const chestZ = chestFrontZ + front * unit * 0.010;

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(unit * 0.058, unit * 0.012, unit * 0.006),
      new THREE.MeshStandardMaterial({
        color: 0x0a1420, emissive: new THREE.Color(accentColour), emissiveIntensity: 3.4,
        roughness: 0.35, metalness: 0.2,
      }),
    );
    bar.position.set(bodyCentre.x, chestY, chestZ);
    detail.add(bar);

    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(unit * 0.009, 10, 8),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(i === 1 ? 0x4ade80 : accentColour),
          emissiveIntensity: 5.0, roughness: 0.3, metalness: 0.1,
        }),
      );
      dot.position.set(
        bodyCentre.x + (i - 1) * unit * 0.026,
        chestY + unit * 0.030,
        chestZ,
      );
      detail.add(dot);
    }
  }

  /* ── Grounding rim ────────────────────────────────────── */
  if (instrumentOverlay) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(bodySize.x * 0.34, bodySize.x * 0.34, bodySize.y * 0.004, 40, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(accentColour), transparent: true, opacity: 0.20,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    rim.position.set(bodyCentre.x, bodyBox.min.y + bodySize.y * 0.012, bodyCentre.z);
    detail.add(rim);
  }

  return { visor: visorAdded, front, tris: trianglesOf(detail) };
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
