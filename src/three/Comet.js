/* ═══════════════════════════════════════════════════════════
   Comet — a nucleus, a coma, and two tails, drifting through the
   far background on an eccentric loop.

   Two tails, because that is the part of a comet that is actually
   physics rather than decoration: the ion tail is narrow, blue and
   straight (it follows the solar wind), the dust tail is wider,
   warmer and curved (it lags behind the orbit). Both always point
   AWAY from the sun regardless of which way the comet is moving,
   which is the one detail that makes it read as a comet instead of
   a fireball.

   Procedural Points, additive, no textures — same rules as the rest
   of the backdrop.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { PAL } from './materials.js';

const TAIL_VERT = /* glsl */`
  attribute float aT;
  attribute float aSpread;
  attribute float aPhase;
  uniform float uTime;
  uniform float uLength;
  uniform float uSpread;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uFlow;
  varying float vAlpha;
  void main() {
    /* Particles drift outward along the tail and recycle, so the tail flows
       instead of sitting there as a static cone. */
    float t = fract(aT + uTime * uFlow);
    float ang = aPhase * 6.2831853;
    float lateral = uSpread * pow(t, 1.35) * aSpread;
    vec3 p = vec3(cos(ang) * lateral, t * uLength, sin(ang) * lateral);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    /* Same soft distance falloff the star shells use, so the tails keep a
       visible width at 200+ units out. */
    float atten = pow(60.0 / max(1.0, -mv.z), 0.75);
    gl_PointSize = clamp(uSize * (0.45 + t * 1.25) * uPixelRatio * atten, 1.0, 32.0);
    /* Bright at the nucleus, gone before the tail end. */
    vAlpha = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.30, 1.0, t));
  }
`;

const TAIL_FRAG = /* glsl */`
  uniform vec3 uColour;
  uniform float uOpacity;
  uniform float uSoft;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = length(d);
    if (r > 0.5) discard;
    float core = smoothstep(0.5, 0.0, r);
    float g = pow(core, uSoft);
    float a = g * vAlpha * uOpacity;
    gl_FragColor = vec4(uColour * (0.85 + g * 0.75), clamp(a, 0.0, 1.0));
  }
`;

export class Comet {
  constructor({ quality = {}, intensity = 1, reducedMotion = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'comet';
    this.intensity = intensity;
    this.reduced = reducedMotion;
    this.time = 0;

    /* Tail density follows the star budget: the comet is a background object,
       so it must never outspend the sky it lives in. */
    const budget = quality.stars ?? 3600;
    this.ionCount = Math.max(90, Math.round(budget * 0.035));
    this.dustCount = Math.max(70, Math.round(budget * 0.028));
    this.full = quality.nebula !== false;

    this._fadeable = [];
    this.build();
  }

  build() {
    /* ── Nucleus: a small, very bright body ─────────────────
       Sized against its orbit distance, not against the origin. The comet sits
       180–250 units out, where the first version's 0.42-unit nucleus worked out
       to roughly four pixels and simply never resolved — the tail was visible
       as a column with nothing at the head of it. */
    this.nucleus = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.1, 1),
      new THREE.MeshBasicMaterial({ color: 0xf2f8ff }),
    );
    this.group.add(this.nucleus);

    /* ── Coma: a soft additive shell around the nucleus ───── */
    const comaMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PAL.cyan), transparent: true, opacity: 0.20,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.BackSide,
    });
    this.coma = new THREE.Mesh(new THREE.SphereGeometry(5.4, 24, 18), comaMat);
    this.group.add(this.coma);
    this._fadeable.push({ mat: comaMat, base: 0.20, uniform: false });

    /* ── Ion tail: narrow, blue, straight ─────────────────── */
    this.ionTail = this._tail({
      count: this.ionCount, length: 54, spread: 2.8,
      colour: new THREE.Color(0x8fd4ff), opacity: 0.9, soft: 3.2,
      flow: 0.055, size: 8,
    });
    this.group.add(this.ionTail);

    /* ── Dust tail: wider, warmer, shorter (it lags the orbit) ── */
    if (this.full) {
      this.dustTail = this._tail({
        count: this.dustCount, length: 36, spread: 7.5,
        colour: new THREE.Color(PAL.amber), opacity: 0.46, soft: 1.7,
        flow: 0.032, size: 12,
      });
      /* Rotated off the ion tail so the two separate visibly */
      this.dustTail.rotation.z = 0.30;
      this.group.add(this.dustTail);
    }
  }

  _tail({ count, length, spread, colour, opacity, soft, flow, size }) {
    const geo = new THREE.BufferGeometry();
    const aT = new Float32Array(count);
    const aSpread = new Float32Array(count);
    const aPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      /* Biased toward the nucleus, so density falls off down the tail. */
      aT[i] = Math.pow(Math.random(), 1.7);
      aSpread[i] = 0.25 + Math.random() * 0.75;
      aPhase[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aSpread', new THREE.BufferAttribute(aSpread, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLength: { value: length },
        uSpread: { value: spread },
        uSize: { value: size },
        uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) },
        uFlow: { value: flow },
        uColour: { value: colour },
        uOpacity: { value: opacity },
        uSoft: { value: soft },
      },
      vertexShader: TAIL_VERT,
      fragmentShader: TAIL_FRAG,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this._fadeable.push({ mat, base: opacity, uniform: true });
    return pts;
  }

  setIntensity(v) {
    this.intensity = v;
    for (const f of this._fadeable) {
      if (f.uniform) f.mat.uniforms.uOpacity.value = f.base * v;
      else f.mat.opacity = f.base * v;
    }
  }

  update(dt) {
    this.time += dt;

    /* Eccentric background orbit. z never comes nearer than -150, so the comet
       stays behind the subject and behind the framing of every section. */
    const a = this.reduced ? 0 : this.time * 0.055;
    const x = Math.cos(a) * 190 - 30;
    const y = Math.sin(a) * 66 + 34;
    const z = -178 - Math.cos(a) * 46;
    this.group.position.set(x, y, z);

    /* The tail points away from the sun at the origin — the defining rule. */
    const away = this.group.position.clone().normalize();
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), away);

    for (const f of this._fadeable) {
      if (f.uniform) {
        f.mat.uniforms.uTime.value = this.time;
        f.mat.uniforms.uPixelRatio.value = Math.min(devicePixelRatio || 1, 2);
      }
    }
    /* The coma breathes a little; a comet's outgassing is not steady. */
    const puls = 1 + Math.sin(this.time * 1.9) * 0.06;
    this.coma.scale.setScalar(puls);
    this.nucleus.scale.setScalar(1 + Math.sin(this.time * 2.4) * 0.05);
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}
