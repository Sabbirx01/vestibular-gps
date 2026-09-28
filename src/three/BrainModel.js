/* ═══════════════════════════════════════════════════════════
   BrainModel — stylized central vestibular pathway.
   Two hemispheres, cerebellum, brainstem, thalamic nuclei and
   a cortical target, linked by travelling signal pulses. Stage
   highlighting maps 1:1 onto BRAIN_STAGES in science/content.js.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
/* tissueMaterial() builds the translucent tissue shells (cortex, cerebellum)
   and IS used below — do not drop it from this list. energyMaterial is not
   used here and was removed. */
import { PAL, tissueMaterial, glowLine, labelSprite, disposeTree } from './materials.js';
import { loadModel, dressTissue, normalizeModel, trianglesOf } from './ModelLibrary.js';
import { clamp, damp, TAU } from '../core/util.js';

export class BrainModel {
  constructor({ quality = 'HIGH', onSelect = () => {}, reducedMotion = false } = {}) {
    this.onSelect = onSelect;
    this.reduced = reducedMotion;
    this.quality = quality;

    this.root = new THREE.Group();
    this.root.name = 'brain';
    this.pickables = [];
    this.nodes = {};
    this.labels = [];
    this.paths = [];
    this.pulses = [];
    this.t = 0;
    this.activeStage = null;
    this.pulseEnergy = 0;

    this.build();
  }

  _node(id, pos, radius, color, labelText, { emissive = 0.35 } = {}) {
    const grp = new THREE.Group();
    grp.position.set(...pos);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 16),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color), emissive: new THREE.Color(color),
        emissiveIntensity: emissive, roughness: 0.34, metalness: 0.05,
        transparent: true, opacity: 0.95,
      }),
    );
    core.userData.pickId = id;
    this.pickables.push(core);
    grp.add(core);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.65, 16, 12),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    grp.add(halo);

    /* pulsing ring so each node reads as active */
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 1.9, 0.0045, 6, 40),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    grp.add(ring);

    if (labelText) {
      const s = labelSprite(labelText, { size: 38, scale: 0.46 });
      s.position.set(0, radius + 0.12, 0);
      s.userData.target = id;
      grp.add(s);
      this.labels.push(s);
    }

    this.root.add(grp);
    this.nodes[id] = { grp, core, halo, ring };
    return grp;
  }

  build() {
    const g = this.root;
    g.rotation.x = -0.12;

    /* ── Cerebral hemispheres: two deformed spheres ── */
    const hemi = new THREE.Group();
    const brainMat = new THREE.MeshPhysicalMaterial({
      color: 0xc3d8f2, roughness: 0.5, metalness: 0.04,
      transparent: true, opacity: 0.52, transmission: 0.22, thickness: 0.9,
      clearcoat: 0.7, clearcoatRoughness: 0.28,
      emissive: new THREE.Color(PAL.blue), emissiveIntensity: 0.34,
      side: THREE.DoubleSide,
    });
    for (const s of [-1, 1]) {
      const geo = new THREE.IcosahedronGeometry(0.52, this.quality.astronautDetail === 'low' ? 2 : 3);
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        /* fold-like displacement so it reads as gyrencephalic, not a ball */
        const fold = 0.055 * Math.sin(v.x * 11 + s * 2) * Math.cos(v.y * 9) * Math.sin(v.z * 8 + 1.3);
        v.multiplyScalar(1 + fold);
        v.x *= 0.78; v.y *= 0.86; v.z *= 1.02;
        v.x += s * 0.028;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, brainMat);
      m.position.set(s * 0.235, 0.42, 0);
      m.userData.pickId = 'cortex';
      this.pickables.push(m);
      hemi.add(m);
    }
    g.add(hemi);
    this.hemi = hemi;
    this.parts = { cortex: hemi.children[0] };

    /* corpus callosum bridge */
    const bridge = glowLine([
      new THREE.Vector3(-0.26, 0.44, 0), new THREE.Vector3(0, 0.50, 0), new THREE.Vector3(0.26, 0.44, 0),
    ], PAL.blue, { radius: 0.012, opacity: 0.4 });
    g.add(bridge);

    /* ── Cerebellum: ridged lobes at the back-bottom ── */
    const cb = new THREE.Group();
    cb.position.set(0, 0.02, -0.16);
    for (let i = 0; i < 5; i++) {
      const lobe = new THREE.Mesh(
        new THREE.TorusGeometry(0.10 + i * 0.028, 0.018, 6, 26, Math.PI * 0.9),
        tissueMaterial(PAL.violet, { opacity: 0.72, emissive: PAL.violet }),
      );
      lobe.rotation.x = Math.PI / 2;
      lobe.rotation.z = -0.4 + i * 0.16;
      cb.add(lobe);
    }
    cb.userData.pickId = 'cerebellum';
    cb.traverse((o) => { if (o.isMesh) { o.userData.pickId = 'cerebellum'; this.pickables.push(o); } });
    g.add(cb);
    this.cb = cb;
    this.parts.cerebellum = cb.children[0];

    /* ── Brainstem column ── */
    const stem = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.055, 0.34, 8, 16),
      tissueMaterial(0xbfd3e8, { opacity: 0.72, emissive: PAL.cyan }),
    );
    stem.position.set(0, -0.16, -0.02);
    stem.userData.pickId = 'nuclei';
    this.pickables.push(stem);
    g.add(stem);
    this.parts.nuclei = stem;

    /* ── Nodes ── */
    this._node('nerve',    [-0.72, -0.30, 0.10], 0.038, PAL.blue,   'VESTIBULAR NERVE');
    this._node('nuclei',   [0, -0.20, 0.02],      0.052, PAL.cyan,   'VESTIBULAR NUCLEI');
    this._node('cerebellum',[0, -0.02, -0.30],    0.058, PAL.violet, 'CEREBELLUM');
    this._node('thalamus', [0, 0.24, 0.02],       0.046, PAL.green,  'THALAMUS');
    this._node('cortex',   [0, 0.72, 0.04],       0.055, PAL.amber,  'CORTICAL NETWORKS');

    /* ── Pathways: nerve → nuclei → cerebellum → thalamus → cortex ── */
    const mkPath = (from, to, color, bendY = 0.06) => {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const mid = a.clone().lerp(b, 0.5);
      mid.y += bendY; mid.x += (b.x - a.x) * 0.15;
      const line = glowLine([a, mid, b], color, { radius: 0.0075, opacity: 0.6 });
      /* merge rather than replace — glowLine stores the curve on userData */
      Object.assign(line.userData, { from, to, color });
      g.add(line);
      this.paths.push(line);

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
      const pulse = new THREE.Points(geo, new THREE.PointsMaterial({
        color: new THREE.Color(color), size: 0.055, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      }));
      pulse.frustumCulled = false;
      pulse.userData = { curve: line.userData.curve, offset: Math.random() };
      this.pulses.push(pulse);
      g.add(pulse);
      return line;
    };

    /* NOTE: mkPath must be called after glowLine has attached .curve */
    mkPath([-0.72, -0.30, 0.10], [0, -0.20, 0.02], PAL.blue, 0.02);
    mkPath([0, -0.20, 0.02], [0, -0.02, -0.30], PAL.cyan, -0.05);
    mkPath([0, -0.02, -0.30], [0, 0.24, 0.02], PAL.violet, 0.10);
    mkPath([0, -0.20, 0.02], [0, 0.24, 0.02], PAL.green, 0.05);
    mkPath([0, 0.24, 0.02], [0, 0.72, 0.04], PAL.amber, 0.06);
    /* cerebellar feedback loop back to the nuclei */
    mkPath([0, -0.02, -0.30], [0, -0.20, 0.02], PAL.violet, -0.14);

    /* ── Lights ── */
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 2.6, 3); g.add(key);
    const fill = new THREE.DirectionalLight(PAL.violet, 1.5); fill.position.set(-2.6, 0.4, 1.4); g.add(fill);
    const back = new THREE.PointLight(PAL.cyan, 3.0, 6, 2); back.position.set(0, 0.3, -2.2); g.add(back);
    const front = new THREE.PointLight(0xdfefff, 1.6, 5, 2); front.position.set(0, 0.4, 2.4); g.add(front);
    /* dedicated tissue key — the scene environment is deliberately dark, which
       left the real anatomy without enough illumination to read its form */
    const tissueKey = new THREE.DirectionalLight(0xfff0e6, 2.6); tissueKey.position.set(1.4, 1.8, 2.6); g.add(tissueKey);
    const tissueWarm = new THREE.PointLight(0xffbfa8, 1.2, 4, 2); tissueWarm.position.set(-1.2, 0.2, 1.6); g.add(tissueWarm);
    g.add(new THREE.AmbientLight(0x46618c, 1.9));

    this.setLabelsVisible(false);
    this.setStage(null);
  }

  /**
   * Replace the stylised hemispheres with the real anatomical mesh.
   * Source: NIH 3D — "Detailed Human Brain Model", entry 3DPX-021161,
   * by Johnson J, licensed CC-BY 4.0. Attribution is shown on the Research
   * page and in docs/SOURCES.md. The pathway nodes, connecting curves and
   * travelling pulses are kept, so the science layer is unchanged.
   *
   * On any failure the stylised model stays — never a blank viewport.
   */
  async loadReal() {
    try {
      const gltf = await loadModel('brain');
      const model = gltf.scene.clone(true);
      /* The NIH mesh ships a single untextured material. Tinting it flat blue
         made it read as a plastic blob, so it gets a real tissue response
         instead: matte-warm, faintly translucent, no fake self-glow. */
      dressTissue(model, { tone: 0xd8b6ad });

      model.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.pickId = 'cortex';
        this.pickables.push(o);
      });

      /* The NIH mesh is authored head-up; scale so the whole brain spans
         about 1.15 units, which matches the pathway node spacing. */
      const carrier = normalizeModel(model, { targetSize: 1.15, dropToFloor: false });
      carrier.position.set(0, 0.30, 0);
      carrier.rotation.set(-0.12, Math.PI * 0.5, 0);

      /* Hide the placeholder hemispheres but keep everything else. */
      if (this.hemi) this.hemi.visible = false;
      this.realBrain = carrier;
      this.root.add(carrier);
      this.usingRealModel = true;
      this.realMetrics = { tris: trianglesOf(carrier) };
      return true;
    } catch (e) {
      console.warn('[BrainModel] real brain mesh unavailable, keeping stylised model:', e.message);
      return false;
    }
  }

  setLabelsVisible(v) { this.labels.forEach((l) => { l.visible = v; }); }
  setGravityTint() { /* reserved for future microgravity colour shift */ }

  setStage(id) {
    this.activeStage = id;
    this.onSelect(id);
  }

  /** Fire a visible sweep of signal along the whole pathway. */
  pulseSignal() { this.pulseEnergy = 1; }

  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const q = state.reducedMotion || this.reduced ? 0 : 1;

    this.pulseEnergy = Math.max(0, this.pulseEnergy - dt * 0.45);

    /* live drive from the orientation stream */
    const drive = clamp(
      (Math.abs(state.sample.yawRate) + Math.abs(state.sample.pitchRate) + Math.abs(state.sample.rollRate)) / 150, 0.1, 1,
    );
    const energy = clamp(drive + this.pulseEnergy * 0.9, 0, 1.6);

    /* travelling pulses */
    this.pulses.forEach((p, i) => {
      if (!p.userData.curve) return;
      const speed = 0.14 + energy * 0.55;
      const u = (t * speed + p.userData.offset + i * 0.14) % 1;
      const pt = p.userData.curve.getPointAt(u);
      p.geometry.attributes.position.setXYZ(0, pt.x, pt.y, pt.z);
      p.geometry.attributes.position.needsUpdate = true;
      p.material.opacity = (0.18 + energy * 0.7) * (1 - this.pulseEnergy * 0.2);
      p.material.size = 0.045 + energy * 0.045;
    });

    this.paths.forEach((line) => { line.material.opacity = 0.28 + energy * 0.42; });

    /* node breathing + halo response */
    Object.entries(this.nodes).forEach(([id, n], i) => {
      const on = this.activeStage === id;
      const base = 0.3 + energy * 0.3;
      n.core.material.emissiveIntensity = damp(n.core.material.emissiveIntensity, (on ? 2.2 : base) * (1 + this.pulseEnergy * 0.5), 6, dt);
      n.halo.scale.setScalar(1 + Math.sin(t * 1.5 + i) * 0.06 * q + (on ? 0.22 : 0));
      n.halo.material.opacity = damp(n.halo.material.opacity, on ? 0.34 : 0.1 + energy * 0.08, 5, dt);
      n.ring.rotation.z += dt * (0.4 + i * 0.08) * q;
      n.ring.material.opacity = damp(n.ring.material.opacity, on ? 0.85 : 0.22, 5, dt);
    });

    /* cerebellum ridged lobes shimmer */
    this.cb.children.forEach((l, i) => {
      l.material.emissiveIntensity = 0.25 + Math.sin(t * 2 + i * 0.7) * 0.18 * q + (this.activeStage === 'cerebellum' ? 0.9 : 0);
    });

    /* gentle whole-model drift */
    if (!state.reducedMotion && !this.reduced) {
      this.root.rotation.y = Math.sin(t * 0.16) * 0.16;
      this.root.position.y = Math.sin(t * 0.42) * 0.012;
    }

    this.labels.forEach((l) => {
      const on = !this.activeStage || l.userData.target === this.activeStage;
      l.material.opacity = damp(l.material.opacity, on ? 0.95 : 0.18, 5, dt);
    });
  }

  dispose() { disposeTree(this.root); }
}
