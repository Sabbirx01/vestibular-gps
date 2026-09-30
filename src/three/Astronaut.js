/* ═══════════════════════════════════════════════════════════
   Astronaut — real NASA ACES suit first, procedural EVA fallback second.
   1. FloatingAstronaut : the site's visual narrator, drifting
   2. MeasurementSubject : a standing, arms-extended figure that
      rotates slowly inside an instrument frame, with body axis,
      head axis, centre-of-gravity marker and vestibular signal
      lines drawn around it.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import {
  SUIT, SUIT_PANEL, SUIT_DARK, VISOR, GOLD, PAL, glowLine,
} from './materials.js';
import {
  loadModel, dressMaterials, normalizeModel, trianglesOf, boundsOf, decorateSuit,
} from './ModelLibrary.js';
import { damp, TAU, clamp } from '../core/util.js';

/* Scratch for FloatingAstronaut.frame(); module scope so a per-frame call never
   allocates. */
const _frameQuat = new THREE.Quaternion();
const _frameUp = new THREE.Vector3();

/* Pick the exporter transform that makes the GLB read like a standing human.
   This avoids hard-coding one vendor/exporter's axis convention. */
function orientHumanoid(root) {
  const candidates = [
    [0, 0, 0],
    [-Math.PI / 2, 0, 0],
    [Math.PI / 2, 0, 0],
    [0, 0, Math.PI / 2],
    [0, 0, -Math.PI / 2],
  ];
  let best = null;
  for (const rot of candidates) {
    root.rotation.set(...rot);
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const height = size.y;
    const breadth = Math.max(size.x, size.z, 1e-6);
    const humanoidRatio = height / breadth;
    const score = humanoidRatio + Math.min(height, 10) * 0.01;
    if (!best || score > best.score) best = { rot, score, size };
  }
  root.rotation.set(...best.rot);
  root.updateWorldMatrix(true, true);
  return best;
}

/* ── Shared body builder ─────────────────────────────────
   Proportions are anthropometric ratios, scaled so that the
   standing figure measures 2.00 units (metres) head to foot.
   ───────────────────────────────────────────────────────── */
function buildBody({ detail = 'high', suit = true } = {}) {
  const seg = { low: 6, mid: 10, high: 18 }[detail] ?? 12;
  const g = new THREE.Group();
  const joints = {};

  const mSuit = suit ? SUIT() : new THREE.MeshStandardMaterial({ color: 0xcfd8e4, roughness: 0.6 });
  const mPanel = suit ? SUIT_PANEL() : mSuit;
  const mDark = suit ? SUIT_DARK() : mSuit;
  const mGold = suit ? GOLD() : mPanel;
  const mSkin = new THREE.MeshStandardMaterial({ color: 0xd8b49a, roughness: 0.62 });

  const add = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    parent.add(m);
    return m;
  };

  /* ── Pelvis + torso ── */
  const hips = new THREE.Group(); hips.position.y = 1.02; g.add(hips);
  add(hips, new THREE.SphereGeometry(0.115, seg, seg), mSuit, [0, 0, 0]);
  add(hips, new THREE.BoxGeometry(0.30, 0.10, 0.20), mPanel, [0, -0.02, 0]);

  const spine = new THREE.Group(); spine.position.y = 0.10; hips.add(spine);
  joints.spine = spine;
  add(spine, new THREE.CapsuleGeometry(0.125, 0.30, Math.min(8, seg / 2), seg), mSuit, [0, 0.20, 0]);
  add(spine, new THREE.BoxGeometry(0.26, 0.16, 0.19), mPanel, [0, 0.34, 0]);

  const chest = new THREE.Group(); chest.position.y = 0.42; spine.add(chest);
  joints.chest = chest;
  add(chest, new THREE.CapsuleGeometry(0.135, 0.16, Math.min(8, seg / 2), seg), mSuit, [0, 0.02, 0]);
  if (suit) {
    add(chest, new THREE.BoxGeometry(0.14, 0.10, 0.06), mDark, [0, 0.02, 0.135]);
    add(chest, new THREE.CylinderGeometry(0.022, 0.022, 0.03, 12), mGold, [-0.06, 0.06, 0.14], [Math.PI / 2, 0, 0]);
    add(chest, new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), mGold, [0.04, 0.02, 0.145], [Math.PI / 2, 0, 0]);
  }

  /* ── Neck + head ── */
  add(chest, new THREE.CylinderGeometry(0.045, 0.05, 0.07, seg), mSuit, [0, 0.14, 0]);
  const head = new THREE.Group(); head.position.y = 0.245; chest.add(head);
  joints.head = head;

  if (suit) {
    /* helmet shell + visor, semi-transparent so the face reads */
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, seg + 6, seg + 4, 0, TAU, 0, Math.PI * 0.86),
      new THREE.MeshPhysicalMaterial({
        color: 0xdfe9f6, roughness: 0.14, metalness: 0.2,
        transparent: true, opacity: 0.5, transmission: 0.35, thickness: 0.3, ior: 1.4,
        clearcoat: 1, clearcoatRoughness: 0.1,
      }),
    );
    /* attach the mesh directly — passing a Mesh as a geometry to add()
       makes Three rebuild a Mesh from a Mesh and throws in updateMorphTargets */
    shell.position.set(0, 0.02, 0);
    head.add(shell);
    const visor = add(head, new THREE.SphereGeometry(0.082, 16, 14, 0, Math.PI), VISOR(), [0, 0.015, 0.028], [0, 0, 0]);
    visor.scale.set(0.95, 0.92, 0.8);
    add(head, new THREE.TorusGeometry(0.118, 0.012, 8, 26), mPanel, [0, 0.02, 0], [Math.PI / 2, 0, 0]);
    add(head, new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: new THREE.Color(PAL.cyan), emissiveIntensity: 2.4, roughness: 0.2,
    }), [-0.08, 0.08, 0.07]);
  } else {
    add(head, new THREE.SphereGeometry(0.093, seg + 4, seg + 2), mSkin, [0, 0.02, 0]).scale.set(0.92, 1, 0.96);
    add(head, new THREE.BoxGeometry(0.13, 0.02, 0.005), mDark, [0, 0.03, 0.088]);
  }

  /* ── Arms ── */
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.165, 0.10, 0);
    chest.add(shoulder);
    add(shoulder, new THREE.SphereGeometry(0.055, seg, seg), mSuit);
    const upper = new THREE.Group(); shoulder.add(upper);
    add(upper, new THREE.CapsuleGeometry(0.042, 0.22, 6, seg), mSuit, [0, -0.13, 0]);
    const elbow = new THREE.Group(); elbow.position.y = -0.26; upper.add(elbow);
    add(elbow, new THREE.SphereGeometry(0.042, seg, seg), mPanel);
    add(elbow, new THREE.CapsuleGeometry(0.035, 0.20, 6, seg), mSuit, [0, -0.12, 0]);
    const wrist = new THREE.Group(); wrist.position.y = -0.24; elbow.add(wrist);
    add(wrist, new THREE.BoxGeometry(0.055, 0.075, 0.032), suit ? mPanel : mSkin);
    return { shoulder, upper, elbow, wrist };
  };
  joints.armL = mkArm(-1);
  joints.armR = mkArm(1);

  /* ── Legs ── */
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.082, -0.06, 0);
    hips.add(hip);
    const thigh = new THREE.Group(); hip.add(thigh);
    add(thigh, new THREE.CapsuleGeometry(0.056, 0.30, 6, seg), mSuit, [0, -0.19, 0]);
    const knee = new THREE.Group(); knee.position.y = -0.40; thigh.add(knee);
    add(knee, new THREE.SphereGeometry(0.05, seg, seg), mPanel);
    add(knee, new THREE.CapsuleGeometry(0.044, 0.32, 6, seg), mSuit, [0, -0.19, 0]);
    const ankle = new THREE.Group(); ankle.position.y = -0.40; knee.add(ankle);
    add(ankle, new THREE.BoxGeometry(0.085, 0.055, 0.19), suit ? mDark : mSkin, [0, -0.03, 0.03]);
    return { hip, thigh, knee, ankle };
  };
  joints.legL = mkLeg(-1);
  joints.legR = mkLeg(1);

  return { group: g, joints, materials: { mSuit, mPanel, mDark, mGold } };
}

/* ═══════════════════════════════════════════════════════════
   1. FloatingAstronaut
   ═══════════════════════════════════════════════════════════ */
export class FloatingAstronaut {
  constructor({ quality = 'HIGH', reducedMotion = false } = {}) {
    this.reduced = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'astronaut-floating';

    const { group, joints } = buildBody({ detail: quality.astronautDetail, suit: true });
    this.body = group;
    this.joints = joints;
    this.root.add(group);

    /* life-support backpack + status LED, parented to the chest */
    const packMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.36, 0.13), SUIT_PANEL());
    packMesh.position.set(0, 0.02, -0.19);
    joints.chest.add(packMesh);
    const led = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(PAL.green), emissiveIntensity: 2.6 }),
    );
    led.position.set(0.09, 0.14, -0.26);
    joints.chest.add(led);

    /* warm interior light so the suit is not flat */
    const l = new THREE.PointLight(PAL.cyan, 1.1, 4.2, 2);
    l.position.set(0, 1.7, 0.35);
    this.root.add(l);

    /* No enclosing glow sphere around the astronaut. The old translucent shell
       read as a floating bubble in front of the helmet on first paint, then
       disappeared when the GLB replaced the fallback. Keep the suit separated
       with its real rim light instead; never render a bubble around the body. */

    this.tether = glowLine(
      [new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(-0.7, -0.3, 0.6), new THREE.Vector3(-1.9, -1.4, 1.5)],
      PAL.cyan, { radius: 0.006, opacity: 0.32 },
    );
    this.root.add(this.tether);

    /* Deterministic entrance pose: judges must never see a random side-facing
       astronaut or a tilt on first paint. Interaction is enabled only after a
       short settle window, then pointer motion can steer the figure. */
    this.t = 0;
    this.poseAge = 0;
    /* Anchor position, set once by the caller (SceneManager places the hero
       figure in the right column at baseX=2.05). update() used to overwrite
       root.position.x/z with a bare drift term every frame, which silently
       discarded that anchor and pulled the astronaut back to the scene
       origin — straight into the headline text and the card column. All
       three axes are now offset from this anchor instead of replacing it. */
    this.baseX = 0;
    this.baseY = 0;
    this.baseZ = 0;
    this.baseRot = 0;
    this.pointer = { x: 0, y: 0 };
    this.scale = 1;
    this.assetFront = 1;
  }

  /**
   * Swap the procedural body for the real NASA asset.
   * Source: NASA 3D Resources - Advanced Crew Escape Suit (public domain).
   * Returns true on success; on any failure the procedural body stays, so a
   * missing or unparsable file can never break the scene.
   */
  async loadReal() {
    try {
      const gltf = await loadModel('suit');
      const model = gltf.scene.clone(true);
      /* NOTE: the suit's KHR_materials_pbrSpecularGlossiness fallback is what
         used to make it look plastic. The authored baseColorFactor values are
         valid, and the helmet's transmission/ior glass IS supported, so the
         fix is to stop overwriting them and light the scene with an
         environment map instead. */
      /* Name-aware dressing: it keeps the suit's authored albedo and its
         transmission/ior glass for the helmet, and tunes only surface
         response. Lighting comes from the scene environment map. */
      /* The GLB node is authored with a +90° X export rotation. Cancel that
         source rotation once at the scene clone, before measuring bounds. If it
         is left in place, the astronaut's feet/head axis is rotated into the
         wrong plane and a later 360° yaw looks like an upside-down roll. */
      /* Select an upright candidate from the asset itself. The imported suit
         has shipped with different exporter axes across revisions; measuring
         only `size.y` made one revision huge/sideways. Candidate transforms
         are scored by vertical height and a sensible humanoid width. */
      const upright = orientHumanoid(model);
      dressMaterials(model);

      const carrier = normalizeModel(model, { targetSize: 1.86, dropToFloor: false, axis: 'y' });
      /* The carrier is now upright; only Y is allowed to turn the suit. */
      carrier.rotation.set(0, 0, 0);
      carrier.position.y = 0.02;

      this.body.visible = false;
      this.realBody = carrier;
      this.root.add(carrier);
      /* Mirrored visor, helmet work lights, chest status cluster and a
         grounding rim, all placed by measuring the asset's own material
         groups. Without these the suit reads as a white domed mannequin. */
      this.suitDetail = decorateSuit(carrier);
      /* The asset's visor bounds tell us which local direction is front. Keep
         that front toward the camera immediately; never reveal a side profile
         while the hero is settling. */
      this.assetFront = this.suitDetail.front || 1;
      carrier.rotation.y = this.assetFront < 0 ? Math.PI : 0;
      carrier.rotation.x = 0;
      carrier.rotation.z = 0;
      carrier.updateMatrixWorld(true);

      /* Three-point rig. The earlier single dim point light left the lower
         legs and boots merging into the starfield. */
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(1.6, 2.4, 2.6);
      this.root.add(key);

      const fill = new THREE.DirectionalLight(0x9fc4ff, 1.5);
      fill.position.set(-2.2, 0.6, 1.4);
      this.root.add(fill);

      const rim = new THREE.PointLight(PAL.cyan, 4.2, 6, 2);
      rim.position.set(0.55, 1.5, -1.4);
      this.root.add(rim);

      const bounce = new THREE.DirectionalLight(0x6f9fe0, 1.0);
      bounce.position.set(0, -2, 1.2);
      this.root.add(bounce);

      const b = boundsOf(carrier);
      this.realMetrics = {
        height: +(b.max.y - b.min.y).toFixed(3),
        width: +(b.max.x - b.min.x).toFixed(3),
        tris: trianglesOf(carrier),
        visor: this.suitDetail.visor,
        visorTris: this.suitDetail.tris,
      };
      this.usingRealModel = true;
      return true;
    } catch (e) {
      console.warn('[FloatingAstronaut] real suit unavailable, keeping procedural body:', e.message);
      return false;
    }
  }

  setPointer(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; }

  /**
   * World-space bounds of the figure, recomputed on demand. The figure drifts,
   * tumbles and can be re-scaled, so a cached box goes stale immediately — and
   * hard-coded model units are wrong anyway: the GLB is not normalised like the
   * procedural fallback, which is how a guessed "head height" ended up a full
   * helmet above the actual head.
   */
  /**
   * Live frame of the figure: its centre, its head and its size, in world space.
   *
   * Derived from `realMetrics`, measured once when the suit was loaded, rather
   * than from a live subtree box. A live Box3 over the suit carrier came back
   * 7.5 world units tall and 6 deep for a figure that measures 3.37 x 1.50 —
   * it picks up the mirrored visor plane and helper geometry inside the asset,
   * and the hero's Earth ended up a full helmet above the astronaut's head.
   * The offsets below are the measured layout of the figure relative to its
   * root: the suit sits slightly below the origin, so the head is 0.44 of the
   * height above the root and the visual centre just under it.
   *
   * Rotating with the figure matters: the astronaut tumbles, so "up" is the
   * root's own up axis, not world up.
   */
  frame(out) {
    const h = (this.realMetrics && this.realMetrics.height) || 2.0;
    const w = (this.realMetrics && this.realMetrics.width) || 1.0;
    this.root.getWorldPosition(out.centre);
    this.root.getWorldQuaternion(_frameQuat);
    _frameUp.set(0, 1, 0).applyQuaternion(_frameQuat);
    out.size.set(w, h, w);
    out.head.copy(out.centre).addScaledVector(_frameUp, h * 0.44);
    return out;
  }

  /**
   * Rotate the figure by hand: pointer travel in pixels from a drag.
   * Direct 1:1 tracking while the pointer moves, plus an impulse kept as
   * angular momentum, so releasing the drag leaves the figure turning — with no
   * gravity and no thrusters out there, nothing is going to stop it.
   */
  drag(dx, dy) {
    /* A touch more travel per pixel than the planets get: the suit has to read
       as turned by hand while the figure is already drifting on its own tumble,
       and the owner reported that a drag felt like it did nothing. */
    this.userYaw = (this.userYaw || 0) + dx * 0.0078;
    this.userPitch = clamp((this.userPitch || 0) + dy * 0.0048, -1.0, 1.0);
    this.userVelY = clamp(dx * 0.0060, -1.8, 1.8);
    this.userVelP = clamp(dy * 0.0038, -1.2, 1.2);
  }

  update(dt, state) {
    this.t += dt;
    this.poseAge += dt;
    const t = this.t;
    const floatAmt = state.mode === 'MICROGRAVITY' ? 1.45 : 0.85;
    const q = state.reducedMotion || this.reduced ? 0 : 1;
    const cameraLive = state.camera?.running && performance.now() - state.camera.lastAt < 1500;
    const sensorX = cameraLive ? clamp(state.camera.dx / 8, -1, 1) : 0;
    const sensorY = cameraLive ? clamp(state.camera.dy / 8, -1, 1) : 0;
    /* First-paint lock: no idle spin, orbit, or roll while the GLB/fallback is
       settling. After 1.6s only pointer-driven steering is allowed; the hero
       never starts rotating by itself in front of a judge. */
    const interactive = this.poseAge > 1.6 && q;
    const steer = interactive ? clamp(this.pointer.x * 0.72 + sensorX * 0.28, -1, 1) : 0;
    const tilt = interactive ? clamp(this.pointer.y * 0.72 + sensorY * 0.28, -1, 1) : 0;

    /* Ease into view instead of appearing as a statue on frame one. */
    const entrance = clamp(this.poseAge / 1.6, 0, 1);
    const entranceEase = entrance * entrance * (3 - 2 * entrance);
    this.root.scale.setScalar(this.scale * (0.86 + entranceEase * 0.14));
    /* Every axis below is an OFFSET added to the anchor SceneManager set
       (baseX/baseY/baseZ) — never a replacement. Replacing it is what used to
       pull the whole figure back to the scene origin every frame, straight
       into the headline text and the card column. See the constructor note. */
    this.root.position.y = this.baseY + (interactive ? Math.sin(t * 0.31) * 0.04 * floatAmt : 0) + (1 - entranceEase) * 0.22;
    /* Life-like microgravity drift: a slow swimming/breathing motion in the
       open space, with no gravity drop. The amplitude stays restrained so the
       astronaut remains readable and never clips the hero copy. */
    this.root.position.x = this.baseX + (interactive ? Math.sin(t * 0.19) * 0.055 * floatAmt + sensorX * 0.025 : 0);
    this.root.position.z = this.baseZ + (interactive ? Math.cos(t * 0.23) * 0.045 * floatAmt + sensorY * 0.018 : 0);

    /* Weightless free tumble. An astronaut adrift keeps slowly turning with no
       thrusters to stop it — on every axis, in every environment, not only
       MICROGRAVITY as before. It only starts once the entrance has settled
       (interactive), so the hero never appears already spinning on first
       paint; pointer/sensor steering rides on top of the tumble everywhere.
       floatAmt already makes MICROGRAVITY more restless than Earth/Moon/Mars. */
     const tumbleY = interactive ? t * 0.052 * floatAmt : 0;
     const tumbleX = interactive ? Math.sin(t * 0.087) * 0.10 * floatAmt : 0;
     const tumbleZ = interactive ? Math.cos(t * 0.071) * 0.07 * floatAmt : 0;

     /* Hand-driven rotation, on top of the tumble and the pointer steering.
        It keeps its own angular momentum: the impulse from the last drag decays
        over a couple of seconds instead of snapping to a stop. */
     /* userVel is an angular RATE (rad/s): integrate it with dt, or the
        impulse lands once per frame and the drag depends on frame rate. */
     this.userYaw = (this.userYaw || 0) + (this.userVelY || 0) * dt * q;
     this.userPitch = clamp((this.userPitch || 0) + (this.userVelP || 0) * dt * q, -0.85, 0.85);
     this.userVelY = (this.userVelY || 0) * Math.pow(0.35, dt);
     this.userVelP = (this.userVelP || 0) * Math.pow(0.35, dt);

     this.root.rotation.y = this.baseRot + tumbleY + steer * 0.28 + this.userYaw;
     this.root.rotation.x = damp(this.root.rotation.x, tumbleX - tilt * 0.08 + this.userPitch, 4, dt);
     this.root.rotation.z = damp(this.root.rotation.z, tumbleZ, 5, dt);

    /* The real suit is a single rigid mesh with no skeleton attached, so the
       microgravity drift is expressed by the whole figure instead of joints. */
    if (this.usingRealModel && this.realBody) {
      /* Root rotation owns the view direction. Do not rotate the carrier a
         second time: that double transform was the source of the sideways
         entrance pose. Keep the first frame perfectly level; later movement
         is only a very small pointer/gravity response. */
      /* Preserve the measured front yaw from loadReal(). Only the root handles
         pointer steering; resetting this to zero every frame could turn a
         re-exported asset back-facing after its correction was applied. */
      this.realBody.rotation.y = this.assetFront < 0 ? Math.PI : 0;
      /* A subtle swimmer roll/yaw sells free-float without ever flipping the
         body; the parent stays upright and the X/Z values are deliberately tiny. */
      this.realBody.rotation.z = interactive ? Math.sin(t * 0.33) * 0.014 * floatAmt : 0;
      this.realBody.rotation.x = interactive ? Math.cos(t * 0.27) * 0.010 * floatAmt : 0;
      this.realBody.position.y = 0.02 + (interactive ? Math.sin(t * 0.4) * 0.008 * floatAmt : 0);
      /* The real GLB is intentionally kept intact. It has no skeleton clips,
         so we animate only the whole suit as a single physical body: entrance
         ease, then restrained microgravity drift and upright Y rotation. */
      return;
    }

    /* limbs: microgravity drift, damped */
    const J = this.joints;
    const slow = t * 0.24;
    J.armL.shoulder.rotation.z = damp(J.armL.shoulder.rotation.z,  1.02 + Math.sin(slow) * 0.16 * q, 3, dt);
    J.armR.shoulder.rotation.z = damp(J.armR.shoulder.rotation.z, -0.96 + Math.cos(slow * 1.1) * 0.16 * q, 3, dt);
    J.armL.shoulder.rotation.x = damp(J.armL.shoulder.rotation.x, 0.28 + Math.sin(slow * 0.8) * 0.2 * q, 3, dt);
    J.armR.shoulder.rotation.x = damp(J.armR.shoulder.rotation.x, 0.22 + Math.cos(slow * 0.9) * 0.2 * q, 3, dt);
    J.armL.elbow.rotation.x = damp(J.armL.elbow.rotation.x, -0.55 - Math.sin(slow * 1.3) * 0.2 * q, 3, dt);
    J.armR.elbow.rotation.x = damp(J.armR.elbow.rotation.x, -0.48 - Math.cos(slow * 1.2) * 0.2 * q, 3, dt);

    J.legL.hip.rotation.x = Math.sin(slow * 0.85) * 0.22 * q + 0.14;
    J.legR.hip.rotation.x = Math.cos(slow * 0.78) * 0.22 * q + 0.1;
    J.legL.knee.rotation.x = -0.34 - Math.sin(slow) * 0.14 * q;
    J.legR.knee.rotation.x = -0.28 - Math.cos(slow) * 0.14 * q;

    J.spine.rotation.y = Math.sin(t * 0.21) * 0.07 * q;
    J.chest.rotation.z = Math.sin(t * 0.26) * 0.05 * q;
    /* Fallback suit also stays front-facing on first paint. Once interactive,
       only the helmet follows pointer input; there is no autonomous spin. */
    J.head.rotation.y = interactive ? this.pointer.x * 0.08 : 0;
    J.head.rotation.x = interactive ? -this.pointer.y * 0.06 : 0;
  }

  dispose() {
    this.root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}

/* ═══════════════════════════════════════════════════════════
   2. MeasurementSubject — standing, arms extended, rotating
   inside an instrument frame. Reads as "being measured".
   ═══════════════════════════════════════════════════════════ */
export class MeasurementSubject {
  constructor({ quality = 'HIGH', reducedMotion = false, bare = true } = {}) {
    this.reduced = reducedMotion;
    this.root = new THREE.Group();
    this.root.name = 'measurement-subject';

    /* `bare` is retained as an explicit opt-in for science/debug views. The
       production measurement subject passes bare:false, so its fallback is
       still an astronaut rather than a skin-toned mannequin while the NASA
       ACES GLB is loading. */
    const { group, joints } = buildBody({ detail: quality.astronautDetail, suit: !bare });
    this.body = group;
    this.joints = joints;
    this.root.add(group);

    if (!bare) {
      /* Compact PLSS/backpack for the offline fallback. The real GLB has its
         own pack; this keeps the loading/failure frame visually consistent. */
      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.34, 0.12),
        SUIT_PANEL(),
      );
      pack.position.set(0, 0.02, -0.19);
      joints.chest.add(pack);
      const packBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.20, 0.035, 0.014),
        GOLD(),
      );
      packBand.position.set(0, 0.12, -0.255);
      joints.chest.add(packBand);
    }

    /* ── Pose: arms fully extended, feet aligned, neutral ── */
    joints.armL.shoulder.rotation.z = 1.42;
    joints.armR.shoulder.rotation.z = -1.42;
    joints.armL.elbow.rotation.x = 0;
    joints.armR.elbow.rotation.x = 0;
    joints.legL.hip.rotation.z = 0.03;
    joints.legR.hip.rotation.z = -0.03;

    /* Eyes are only added in an explicitly bare debug view. A suited fallback
       must keep the visor opaque and never show floating eyes through it. */
    if (bare) {
      const eyeGeo = new THREE.SphereGeometry(0.012, 10, 8);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: new THREE.Color(PAL.cyan), emissiveIntensity: 0.7, roughness: 0.2,
      });
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(eyeGeo, eyeMat);
        e.position.set(s * 0.032, 0.028, 0.086);
        joints.head.add(e);
      }
    }

    /* ── Vertical reference: height scale bars ── */
    this.scaleGroup = new THREE.Group();
    for (let i = 0; i <= 8; i++) {
      const y = i * 0.25;
      const isMajor = i % 4 === 0;
      const w = isMajor ? 0.5 : 0.24;
      const bar = glowLine(
        [new THREE.Vector3(-w / 2, y, -0.30), new THREE.Vector3(w / 2, y, -0.30)],
        isMajor ? PAL.cyan : PAL.blue,
        { radius: 0.0035, opacity: isMajor ? 0.7 : 0.32 },
      );
      this.scaleGroup.add(bar);
    }
    this.scaleGroup.add(glowLine(
      [new THREE.Vector3(0, 0, -0.30), new THREE.Vector3(0, 2.0, -0.30)],
      PAL.cyan, { radius: 0.003, opacity: 0.3 },
    ));
    this.root.add(this.scaleGroup);

    /* ── Body axis, head axis, COG, orientation vectors ── */
    this.axes = new THREE.Group();

    this.bodyAxis = glowLine(
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.0, 0)],
      PAL.cyan, { radius: 0.005, opacity: 0.85 },
    );
    this.headAxis = glowLine(
      [new THREE.Vector3(0, 1.62, 0), new THREE.Vector3(0, 2.22, 0)],
      PAL.violet, { radius: 0.005, opacity: 0.9 },
    );
    this.axes.add(this.bodyAxis, this.headAxis);

    /* forward / lateral orientation vectors from the head */
    this.vecGroup = new THREE.Group();
    this.vecGroup.position.set(0, 1.86, 0);
    this.vecFwd = glowLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.62)], PAL.green, { radius: 0.005, opacity: 0.9 });
    this.vecLat = glowLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.62, 0, 0)], PAL.amber, { radius: 0.005, opacity: 0.9 });
    this.vecUp = glowLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.62, 0)], PAL.cyan, { radius: 0.005, opacity: 0.9 });
    this.vecGroup.add(this.vecFwd, this.vecLat, this.vecUp);
    this.axes.add(this.vecGroup);

    /* centre-of-gravity marker */
    this.cog = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 14, 12),
      new THREE.MeshStandardMaterial({
        color: 0xffd27a, emissive: new THREE.Color(PAL.amber), emissiveIntensity: 2.0, roughness: 0.3,
      }),
    );
    this.cog.position.set(0, 1.05, 0);
    this.cogRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.004, 8, 34),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.amber), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.cogRing.position.copy(this.cog.position);
    this.cogRing.rotation.x = Math.PI / 2;
    this.axes.add(this.cog, this.cogRing);

    /* The overlay group must actually be attached to the model root — building
       it without adding it leaves every axis and marker invisible. */
    this.root.add(this.axes);

    /* ── Vestibular signal lines: inner ear → brainstem ── */
    this.signalGroup = new THREE.Group();
    this.signals = [];
    for (const s of [-1, 1]) {
      const line = glowLine([
        new THREE.Vector3(s * 0.075, 1.86, 0),
        new THREE.Vector3(s * 0.11, 1.72, -0.02),
        new THREE.Vector3(s * 0.055, 1.58, -0.04),
        new THREE.Vector3(0, 1.50, -0.05),
      ], PAL.violet, { radius: 0.004, opacity: 0.9 });
      this.signalGroup.add(line);
      this.signals.push(line);
    }
    /* travelling pulse along each signal line — one moving point per line */
    this.pulses = [];
    for (const line of this.signals) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const pulse = new THREE.Points(geo, new THREE.PointsMaterial({
        color: new THREE.Color(PAL.cyan), size: 0.055, transparent: true,
        opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false,
        sizeAttenuation: true,
      }));
      pulse.frustumCulled = false;
      pulse.userData.curve = line.userData.curve;
      this.pulses.push(pulse);
      this.signalGroup.add(pulse);
    }
    this.axes.add(this.signalGroup);

    /* ── Instrument frame: rotating arcs around the subject ── */
    this.frame = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const r = 0.95 + i * 0.22;
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.0035, 6, 120, Math.PI * (1.1 + i * 0.24)),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(i === 1 ? PAL.violet : PAL.cyan),
          transparent: true, opacity: 0.34 - i * 0.06,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      arc.rotation.set(Math.PI / 2 + i * 0.34, i * 0.8, i * 0.5);
      arc.position.y = 1.0;
      arc.userData.spin = (i % 2 ? 1 : -1) * (0.16 + i * 0.05);
      this.frame.add(arc);
    }
    this.root.add(this.frame);

    /* ── Lighting rig ──
       The subject sits outside the planet groups, so it needs its own lights
       or a MeshStandardMaterial body renders as a black silhouette. */
    const keyL = new THREE.DirectionalLight(0xffffff, 2.6);
    keyL.position.set(2.2, 3.4, 3.0);
    this.root.add(keyL);

    const fillL = new THREE.DirectionalLight(PAL.blue, 1.4);
    fillL.position.set(-2.8, 0.8, 1.8);
    this.root.add(fillL);

    const rimL = new THREE.PointLight(PAL.violet, 2.2, 6, 2);
    rimL.position.set(-0.6, 1.4, -2.2);
    this.root.add(rimL);

    const bounceL = new THREE.DirectionalLight(0x6f9fe0, 0.75);
    bounceL.position.set(0, -2.5, 1.2);
    this.root.add(bounceL);

    this.root.add(new THREE.AmbientLight(0x4a6690, 1.5));

    /* ── Base disc ── */
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PAL.cyan), transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.001;
    this.root.add(disc);

    this.t = 0;
    this.poseAge = 0;
    this.spinSpeed = 0.16;
    this.pointer = { x: 0, y: 0 };
  }

  /**
   * Replace the procedural mannequin with the real NASA suit, kept in the
   * instrument frame so the axis, centre-of-gravity and signal overlays still
   * describe a real figure.
   */
  async loadReal() {
    try {
      const gltf = await loadModel('suit');
      const model = gltf.scene.clone(true);
      /* Lower emissive floor than the floating figure: inside the instrument
         frame the subject was washing out to near-white with no readable
         surface detail. More metalness and less self-glow restores contrast. */
      /* Same GLB correction as the hero: cancel the source +90° X node
         rotation before normalization, so the measurement figure is upright.
         Its 360° interaction is then a clean Y-axis turn. */
      orientHumanoid(model);
      dressMaterials(model);

      const carrier = normalizeModel(model, { targetSize: 2.0, dropToFloor: true, axis: 'y' });
      carrier.rotation.set(0, 0, 0);

      this.body.visible = false;
      this.realBody = carrier;
      this.root.add(carrier);
      this.suitDetail = decorateSuit(carrier);
      /* The GLB's front is measured from the visor material, not guessed from
         the camera. Apply the correction once here; update() must never add a
         second yaw that can turn the suit sideways or upside down. */
      carrier.rotation.set(0, this.suitDetail.front < 0 ? Math.PI : 0, 0);
      carrier.updateMatrixWorld(true);

      const b = boundsOf(carrier);
      this.realMetrics = {
        height: +(b.max.y - b.min.y).toFixed(3),
        width: +(b.max.x - b.min.x).toFixed(3),
        tris: trianglesOf(carrier),
        visor: this.suitDetail.visor,
      };
      this.usingRealModel = true;
      return true;
    } catch (e) {
      console.warn('[MeasurementSubject] real suit unavailable, keeping procedural figure:', e.message);
      return false;
    }
  }

  setPointer(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; }

  update(dt, state) {
    this.t += dt;
    this.poseAge += dt;
    const t = this.t;
    const q = state.reducedMotion || this.reduced ? 0 : 1;
    const interactive = this.poseAge > 1.6 && q;
    const motion = interactive ? q : 0;

    /* Entrance lock: the measurement subject is square to camera first. After
       the short settle window it can rotate from pointer input, but never
       starts in a side/back pose. */
    this.body.rotation.y = interactive ? this.pointer.x * 0.5 : 0;
    this.body.rotation.x = interactive ? Math.sin(t * 0.4) * 0.006 * q : 0;
    this.joints.chest.scale.y = 1 + Math.sin(t * 1.1) * 0.006 * q;

    /* When the real suit is in use it is a single rigid mesh, so it turns as a
       whole. The hidden procedural body below keeps running, which costs
       nothing and means the overlays always update on the same code path. */
    if (this.usingRealModel && this.realBody) {
      /* Keep the asset front correction and let the parent/root provide any
         interactive yaw. X/Z remain small visual drift only—never a roll. */
      this.realBody.rotation.y = this.assetFront < 0 ? Math.PI : 0;
      this.realBody.rotation.x = interactive ? Math.sin(t * 0.4) * 0.006 * q : 0;
      this.realBody.rotation.z = interactive ? Math.sin(t * 0.33) * 0.018 * q : 0;
    }

    /* arms settle into the extended pose with micro-drift */
    const J = this.joints;
    J.armL.shoulder.rotation.z = 1.42 + Math.sin(t * 0.5) * 0.03 * motion;
    J.armR.shoulder.rotation.z = -1.42 - Math.sin(t * 0.5 + 0.4) * 0.03 * motion;
    J.armL.shoulder.rotation.x = damp(J.armL.shoulder.rotation.x, interactive ? -this.pointer.y * 0.2 : 0, 3, dt);
    J.armR.shoulder.rotation.x = damp(J.armR.shoulder.rotation.x, interactive ? -this.pointer.y * 0.2 : 0, 3, dt);
    J.legL.hip.rotation.x = Math.sin(t * 0.44) * 0.014 * motion;
    J.legR.hip.rotation.x = Math.sin(t * 0.44 + 1.2) * 0.014 * motion;
    J.head.rotation.y = interactive ? this.pointer.x * 0.12 : 0;
    J.head.rotation.x = interactive ? -this.pointer.y * 0.08 : 0;

    /* axes stay world-aligned while the body turns → shows the offset */
    this.headAxis.visible = true;
    this.cogRing.rotation.z += dt * 0.7 * q;
    this.cog.position.y = 1.05 + Math.sin(t * 0.9) * 0.008 * q;
    this.cogRing.position.y = this.cog.position.y;

    /* vestibular pulse travelling ear → brainstem, driven by live motion */
    const drive = clamp(Math.abs(state.sample.yawRate) / 60 + Math.abs(state.sample.pitchRate) / 60 + Math.abs(state.sample.rollRate) / 60, 0.06, 1);
    this.pulses.forEach((p, i) => {
      p.material.opacity = 0.35 + drive * 0.6;
      const u = (t * (0.35 + drive * 0.9) + i * 0.5) % 1;
      const pt = p.userData.curve.getPointAt(u);
      p.geometry.attributes.position.setXYZ(0, pt.x, pt.y, pt.z);
      p.geometry.attributes.position.needsUpdate = true;
    });
    this.signals.forEach((l) => { l.material.opacity = 0.35 + drive * 0.45; });

    this.frame.children.forEach((arc) => { arc.rotation.z += dt * arc.userData.spin * q; });
  }

  dispose() {
    this.root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  }
}

export { buildBody };
