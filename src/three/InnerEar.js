/* ═══════════════════════════════════════════════════════════
   InnerEar — interactive model of the vestibular apparatus.
   Three semicircular canals in three planes, each with an
   ampulla and cupula; the utricle and saccule with otoconia;
   the vestibular nerve. Anatomically informed procedural
   geometry — an illustration, not patient-derived imaging.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { PAL, glowLine, labelSprite, disposeTree } from './materials.js';
import { clamp, damp, TAU } from '../core/util.js';

export class InnerEar {
  constructor({ quality = 'HIGH', onSelect = () => {}, reducedMotion = false } = {}) {
    this.onSelect = onSelect;
    this.reduced = reducedMotion;
    this.quality = quality;

    this.root = new THREE.Group();
    this.root.name = 'inner-ear';
    /* Enlarged for the hero viewport: the canals should read as anatomy at a
       glance, not as tiny decorative rings floating in a dark canvas. */
    this.root.scale.setScalar(1.16);

    this.pickables = [];
    this.parts = {};
    this.labels = [];
    this.flow = [];
    this.t = 0;

    this.canalMix = { lateral: 0, anterior: 0, posterior: 0 };
    this.targetMix = { lateral: 0, anterior: 0, posterior: 0 };
    this.headTarget = { yaw: 0, pitch: 0, roll: 0 };
    this.head = { yaw: 0, pitch: 0, roll: 0 };
    this.otolithAxis = new THREE.Vector3(0, -1, 0);

    this.build();
  }

  /* ── helpers ── */
  _register(mesh, id) {
    mesh.userData.pickId = id;
    this.pickables.push(mesh);
    this.parts[id] = mesh;
    return mesh;
  }

  _canal({ radius, tube, axis, tilt, color, id }) {
    const grp = new THREE.Group();
    /* 270° arc so it reads as a canal rather than a full ring */
    /* Outer membranous duct + a smaller luminous endolymph lumen. The two
       shells give the canals depth under the glassy lighting instead of a
       single flat neon tube. */
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 18, 128, TAU * 0.72),
      new THREE.MeshPhysicalMaterial({
        color: 0xb9d9eb, roughness: 0.18, metalness: 0.03,
        transparent: true, opacity: 0.58, transmission: 0.48, thickness: 0.36, ior: 1.35,
        clearcoat: 0.95, clearcoatRoughness: 0.16,
      }),
    );
    arc.rotation.z = TAU * 0.1;
    this._register(arc, id);
    grp.add(arc);

    /* inner lumen so the canal reads as a duct */
    const lumen = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube * 0.56, 12, 112, TAU * 0.72),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.46, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    lumen.rotation.z = TAU * 0.1;
    grp.add(lumen);

    /* ampulla — the swelling that houses the cupula */
    const ampAngle = TAU * 0.1;
    const amp = new THREE.Mesh(
      new THREE.SphereGeometry(tube * 2.5, 16, 12),
      new THREE.MeshPhysicalMaterial({ color: 0xbde6ff, roughness: 0.2, metalness: 0.04, transparent: true, opacity: 0.6, transmission: 0.3, thickness: 0.3 }),
    );
    amp.position.set(Math.cos(ampAngle) * radius, Math.sin(ampAngle) * radius, 0);
    this._register(amp, `${id}.ampulla`);
    grp.add(amp);

    /* cupula — the gel sail inside the ampulla */
    const cupula = new THREE.Mesh(
      new THREE.CapsuleGeometry(tube * 0.9, tube * 3.0, 4, 10),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.violet), emissive: new THREE.Color(PAL.violet), emissiveIntensity: 0.85, transparent: true, opacity: 0.62, roughness: 0.4 }),
    );
    cupula.position.copy(amp.position);
    cupula.rotation.z = ampAngle + Math.PI / 2;
    this._register(cupula, 'cupula');
    cupula.userData.parentCanal = id;
    grp.add(cupula);

    /* endolymph flow markers around the arc */
    const curvePts = [];
    for (let i = 0; i <= 24; i++) {
      const a = TAU * 0.1 + (i / 24) * TAU * 0.72;
      curvePts.push(new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0));
    }
    const curve = new THREE.CatmullRomCurve3(curvePts);
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const pt = new THREE.Points(geo, new THREE.PointsMaterial({
        color: new THREE.Color(color), size: 0.026, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      pt.frustumCulled = false;
      pt.userData = { curve, offset: i / 7, canal: id };
      this.flow.push(pt);
      grp.add(pt);
    }

    grp.rotation.set(...tilt);
    grp.userData.axis = axis;
    return grp;
  }

  build() {
    const g = this.root;

    /* ── The three canals, one plane each ──
       Lateral sits roughly horizontal; anterior and posterior are
       vertical and rotated relative to each other. */
    this.canalGroups = {
      lateral:   this._canal({ radius: 0.42, tube: 0.028, axis: 'y', tilt: [Math.PI / 2, 0, 0], color: PAL.cyan,   id: 'lateral' }),
      anterior:  this._canal({ radius: 0.40, tube: 0.027, axis: 'z', tilt: [0, Math.PI / 2 * 0.72, Math.PI * 0.5], color: PAL.blue,   id: 'anterior' }),
      posterior: this._canal({ radius: 0.38, tube: 0.026, axis: 'x', tilt: [0, -Math.PI / 2 * 0.66, Math.PI * 0.72], color: PAL.violet, id: 'posterior' }),
    };
    Object.values(this.canalGroups).forEach((c) => g.add(c));

    /* ── Otolith organs: utricle and saccule ── */
    const otolith = new THREE.Group();
    otolith.position.set(0.02, -0.30, 0);

    const utricle = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 22, 16),
      new THREE.MeshPhysicalMaterial({ color: 0xbfe4ff, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.45, transmission: 0.4, thickness: 0.4, clearcoat: 0.7 }),
    );
    utricle.scale.set(1.35, 0.72, 0.85);
    this._register(utricle, 'utricle');
    otolith.add(utricle);

    const saccule = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 20, 14),
      new THREE.MeshPhysicalMaterial({ color: 0xcbe9ff, roughness: 0.24, metalness: 0.05, transparent: true, opacity: 0.45, transmission: 0.4, thickness: 0.4, clearcoat: 0.7 }),
    );
    saccule.scale.set(0.85, 1.05, 0.85);
    saccule.position.set(0.0, -0.16, 0.015);
    this._register(saccule, 'saccule');
    otolith.add(saccule);

    /* macula gel layers */
    const mkGel = (y, w, d, parent) => {
      const gel = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.018, d),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.violet), transparent: true, opacity: 0.4, emissive: new THREE.Color(PAL.violet), emissiveIntensity: 0.3, roughness: 0.5 }),
      );
      gel.position.y = y;
      parent.add(gel);
      return gel;
    };
    this.utricleGel = mkGel(0.062, 0.22, 0.13, utricle);
    this.sacculeGel = mkGel(0.072, 0.12, 0.12, saccule);

    /* otoconia — instanced grain field sitting on each macula */
    const count = this.quality.particles > 800 ? 150 : 70;
    const stoneGeo = new THREE.IcosahedronGeometry(0.0075, 0);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: new THREE.Color(PAL.cyan), emissiveIntensity: 0.75, roughness: 0.35, metalness: 0.1,
    });
    const buildStones = (n, w, d, yOff, parent) => {
      const inst = new THREE.InstancedMesh(stoneGeo, stoneMat, n);
      const base = [];
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const p = new THREE.Vector3((Math.random() - 0.5) * w, yOff, (Math.random() - 0.5) * d);
        base.push(p);
        m.makeTranslation(p.x, p.y, p.z);
        inst.setMatrixAt(i, m);
      }
      inst.userData.base = base;
      inst.frustumCulled = false;
      parent.add(inst);
      return inst;
    };
    this.utricleStones = buildStones(count, 0.20, 0.11, 0.078, utricle);
    this.sacculeStones = buildStones(Math.floor(count * 0.7), 0.10, 0.10, 0.088, saccule);

    g.add(otolith);
    this.otolithGroup = otolith;

    /* ── Vestibular nerve ── */
    const nerve = glowLine([
      new THREE.Vector3(-0.06, -0.30, 0),
      new THREE.Vector3(-0.34, -0.34, -0.06),
      new THREE.Vector3(-0.62, -0.30, -0.14),
      new THREE.Vector3(-0.86, -0.22, -0.2),
    ], PAL.violet, { radius: 0.022, opacity: 0.85 });
    this._register(nerve, 'nerve');
    g.add(nerve);
    this.nervePulse = (() => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const p = new THREE.Points(geo, new THREE.PointsMaterial({
        color: new THREE.Color(PAL.cyan), size: 0.06, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      p.frustumCulled = false;
      p.userData.curve = nerve.userData.curve;
      g.add(p);
      return p;
    })();

    /* ── Cochlea, dimmed, for anatomical context only ── */
    const cochlea = new THREE.Group();
    let ang = 0, r = 0.30;
    const cochPts = [];
    for (let i = 0; i < 90; i++) {
      ang += 0.30;
      r *= 0.965;
      cochPts.push(new THREE.Vector3(0.16 + Math.cos(ang) * r, -0.62 + Math.sin(ang) * r, 0.02));
    }
    const cochMesh = glowLine(cochPts, 0x5a7794, { radius: 0.016, opacity: 0.34 });
    cochlea.add(cochMesh);
    g.add(cochlea);
    this.cochlea = cochlea;

    /* ── Labels ── */
    const labelSpec = [
      ['lateral', 'LATERAL', new THREE.Vector3(0.0, 0.0, 0.62)],
      ['anterior', 'ANTERIOR', new THREE.Vector3(0.52, 0.42, 0.12)],
      ['posterior', 'POSTERIOR', new THREE.Vector3(-0.5, 0.44, -0.2)],
      ['utricle', 'UTRICLE', new THREE.Vector3(0.34, -0.32, 0.16)],
      ['saccule', 'SACCULE', new THREE.Vector3(-0.28, -0.50, 0.2)],
      ['nerve', 'VESTIBULAR NERVE', new THREE.Vector3(-0.98, -0.18, -0.24)],
    ];
    for (const [id, text, pos] of labelSpec) {
      const s = labelSprite(text, { size: 40, scale: 0.5 });
      s.position.copy(pos);
      s.userData.target = id;
      this.labels.push(s);
      g.add(s);
    }

    /* ── Base grid ring so the model sits in space ── */
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.15, 1.17, 128),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.cyan), transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.9;
    g.add(ring);

    /* Fine instrument rings behind the organ establish scale and make the
       model feel embedded in a calibrated vestibular scanner. */
    for (let i = 1; i <= 3; i++) {
      const guide = new THREE.Mesh(
        new THREE.RingGeometry(1.15 + i * 0.16, 1.15 + i * 0.16 + 0.002, 128),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 2 ? PAL.violet : PAL.blue), transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
      );
      guide.rotation.x = -Math.PI / 2;
      guide.position.y = -0.895 + i * 0.001;
      g.add(guide);
    }

    /* ── Lights local to the model ── */
    const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(2.4, 3, 2.6); g.add(key);
    const fill = new THREE.DirectionalLight(PAL.blue, 0.85); fill.position.set(-2.6, -1.2, 2); g.add(fill);
    const rim = new THREE.PointLight(PAL.violet, 2.2, 5, 2); rim.position.set(-1.2, 0.8, -1.6); g.add(rim);
    const amb = new THREE.AmbientLight(0x2a3d5c, 1.1); g.add(amb);

    this.setLabelsVisible(false);
  }

  setLabelsVisible(v) { this.labels.forEach((l) => { l.visible = v; }); this._labelsVisible = v; }

  /** Drive canal highlighting from a head-rotation input (degrees). */
  setHeadRotation(yaw, pitch, roll) {
    this.headTarget.yaw = yaw; this.headTarget.pitch = pitch; this.headTarget.roll = roll;
    const a = v => Math.abs(v);
    const total = a(yaw) + a(pitch) + a(roll) || 1;
    this.targetMix.lateral = clamp(a(yaw) / total * 1.4, 0, 1);
    this.targetMix.anterior = clamp(a(pitch) / total * 1.4, 0, 1);
    this.targetMix.posterior = clamp(a(roll) / total * 1.4, 0, 1);
  }

  /** Gravity vector in model space drives otoconia displacement. */
  setGravity(g) { this.otolithAxis.set(g.x, g.y, g.z).normalize(); }

  select(id) {
    const base = String(id).split('.')[0];
    this.selected = base;
    this.onSelect(base);
  }

  clearSelection() { this.selected = null; this.onSelect(null); }

  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const q = state.reducedMotion || this.reduced ? 0 : 1;

    /* canal emphasis follows the head-rotation input */
    for (const k of ['lateral', 'anterior', 'posterior']) {
      this.canalMix[k] = damp(this.canalMix[k], this.targetMix[k], 4, dt);
      const grp = this.canalGroups[k];
      const mix = this.canalMix[k];
      grp.children.forEach((c) => {
        if (c.isMesh && c.material.opacity !== undefined) {
          const isLumen = c.material.blending === THREE.AdditiveBlending;
          c.material.opacity = isLumen ? 0.18 + mix * 0.55 : 0.36 + mix * 0.5;
        }
      });
      if (grp.userData.axis) {
        /* gentle physical response: rotate the canal group slightly with the input */
        const amp = 0.06 * mix * q;
        if (k === 'lateral') grp.rotation.z = Math.PI / 2 + Math.sin(t * 1.4) * 0.01 * q;
        else grp.rotation.y += Math.sin(t * 0.9 + mix) * 0.0006 * q;
      }
    }

    /* head target smoothing (the model itself does not move; the highlight does) */
    this.head.yaw = damp(this.head.yaw, this.headTarget.yaw, 5, dt);
    this.head.pitch = damp(this.head.pitch, this.headTarget.pitch, 5, dt);
    this.head.roll = damp(this.head.roll, this.headTarget.roll, 5, dt);

    /* endolymph flow: speed scales with the canal's own activity */
    this.flow.forEach((pt) => {
      const speed = 0.05 + this.canalMix[pt.userData.canal] * 0.6;
      const u = (t * speed + pt.userData.offset) % 1;
      const p = pt.userData.curve.getPointAt(u);
      pt.geometry.attributes.position.setXYZ(0, p.x, p.y, p.z);
      pt.geometry.attributes.position.needsUpdate = true;
      pt.material.opacity = 0.25 + this.canalMix[pt.userData.canal] * 0.75;
    });

    /* cupula flex driven by the dominant canal */
    const cupula = this.parts['cupula'];
    if (cupula) {
      const drive = Math.max(this.canalMix.lateral, this.canalMix.anterior, this.canalMix.posterior);
      const parent = cupula.userData.parentCanal;
      const local = this.canalMix[parent] || 0;
      cupula.rotation.x = Math.sin(t * 3.1) * 0.20 * drive * q;
      cupula.scale.setScalar(1 + local * 0.16);
      cupula.material.emissiveIntensity = 0.5 + local * 1.7;
    }

    /* otoconia displaced by the gravity vector */
    const gv = this.otolithAxis;
    const disp = gv.clone().multiplyScalar(0.026);
    const m = new THREE.Matrix4();
    for (const [inst, parentMesh] of [[this.utricleStones, this.parts.utricle], [this.sacculeStones, this.parts.saccule]]) {
      if (!inst) continue;
      const base = inst.userData.base;
      const localDisp = disp.clone();
      /* Documented simplification: the otoconia offset is applied in world
         axes for both organs, so the utricle and saccule are not projected
         onto their own macula planes. They are separate meshes with separate
         base positions, but a tilt does not yet move them differently — only
         the shared gravity vector changes. */
      for (let i = 0; i < base.length; i++) {
        const p = base[i];
        const bulge = 0.0035 * Math.sin(t * 2 + p.x * 30 + p.z * 22) * q;
        m.makeTranslation(p.x + localDisp.x, p.y + localDisp.y + bulge, p.z + localDisp.z);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
    }

    /* the saccule macula is vertical — orient its gel plane accordingly */
    if (this.sacculeGel) this.sacculeGel.rotation.x = -Math.PI / 2 + 0.12;

    /* nerve pulse */
    const nerveDrive = clamp(
      (Math.abs(state.sample.yawRate) + Math.abs(state.sample.pitchRate) + Math.abs(state.sample.rollRate)) / 140, 0.08, 1,
    );
    const u = (t * (0.2 + nerveDrive * 0.7)) % 1;
    const np = this.nervePulse.userData.curve.getPointAt(u);
    this.nervePulse.geometry.attributes.position.setXYZ(0, np.x, np.y, np.z);
    this.nervePulse.geometry.attributes.position.needsUpdate = true;
    this.nervePulse.material.opacity = 0.3 + nerveDrive * 0.7;
    if (this.parts.nerve) this.parts.nerve.material.opacity = 0.4 + nerveDrive * 0.5;

    /* highlight the selected structure */
    Object.entries(this.parts).forEach(([id, mesh]) => {
      const on = this.selected && (id === this.selected || id.startsWith(this.selected + '.') || this.selected.startsWith(id + '.'));
      if (mesh.material && mesh.material.emissive && mesh.material.emissiveIntensity !== undefined) {
        const target = on ? 1.9 : (id === 'cupula' ? 0.85 : 0.2);
        mesh.material.emissiveIntensity = damp(mesh.material.emissiveIntensity, target, 6, dt);
      }
    });

    /* labels always face camera (sprites do this natively) — just dim the unselected */
    this.labels.forEach((l) => {
      const on = !this.selected || l.userData.target === this.selected;
      l.material.opacity = damp(l.material.opacity, on ? 0.95 : 0.22, 5, dt);
    });

    if (!state.reducedMotion && !this.reduced) {
      this.otolithGroup.rotation.y = Math.sin(t * 0.24) * 0.05;
    }
  }

  dispose() { disposeTree(this.root); }
}
