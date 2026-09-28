/* ═══════════════════════════════════════════════════════════
   BlackHole — an inclined accretion disk in the far background.

   Procedural and additive, like every other backdrop element: no
   textures, no hotlinks, no licences, so it survives the offline
   claim and never 404s.

   The visual signature has three parts, and all three matter:
     1. a pitch-black event horizon that actually OCCLUDES the
        starfield behind it (a dark disc that does not occlude
        reads as a grey smudge, not a hole),
     2. a thin photon ring hugging the horizon,
     3. a differentially rotating disk — the inner edge laps the
        outer edge, which is what distinguishes a disk from a
        spinning plate.

   Placement is the caller's business; SpaceEnvironment parks it
   far behind the astronaut so it never competes with the subject.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { PAL } from './materials.js';

/* Polar coordinates are computed from the local vertex position rather than
   from uv. RingGeometry's uvs are planar (a square projection), not polar, so
   a uv-based shader would smear the streaks across the ring instead of
   winding them around it. atan2 + length is exact and costs nothing. */
const RING_VERT = /* glsl */`
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* Shared fbm so the disk and the halo are broken up by the same kind of
   structure; a perfectly smooth ring reads as a decal. */
const NOISE_GLSL = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

const DISK_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3  uHot;
  uniform vec3  uCool;
  varying vec2 vLocal;
  ${NOISE_GLSL}

  void main() {
    float r = length(vLocal);
    /* 0 at the inner edge, 1 at the outer edge */
    float t = clamp((r - uInner) / max(uOuter - uInner, 0.001), 0.0, 1.0);
    float ang = atan(vLocal.y, vLocal.x);

    /* Keplerian shear. The inner material completes more turns than the outer
       material, so the angle offset is divided by a t-dependent period. Sampling
       noise on (cos, sin) of that angle keeps the seam at +/-pi invisible. */
    float twist = uTime * (2.1 / (0.34 + t * 0.92));
    float a2 = ang + twist;
    vec2 q = vec2(cos(a2), sin(a2)) * (2.4 + t * 2.6);
    float streaks = fbm(q) * 0.66 + fbm(q * 2.6 + 13.0) * 0.34;

    /* Radial temperature: steep falloff, hottest right at the inner edge. */
    float radial = pow(1.0 - t, 1.7);
    /* Feather both edges so the ring has no hard rim. */
    float band = smoothstep(0.0, 0.13, t) * smoothstep(1.0, 0.68, t);

    /* Doppler beaming: the limb rotating toward the viewer is brighter. */
    float beam = 0.64 + 0.36 * cos(ang);

    vec3 col = mix(uCool, uHot, radial);
    float density = band * (0.30 + streaks * 1.20) * (0.40 + radial * 1.10) * beam;

    float a = clamp(density * uIntensity, 0.0, 0.92);
    gl_FragColor = vec4(col * (0.85 + density * 1.05), a);
  }
`;

const HALO_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uIntensity;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3  uColour;
  varying vec2 vLocal;

  void main() {
    float r = length(vLocal);
    float mid = (uInner + uOuter) * 0.5;
    /* NOT "half" — that is a reserved word in GLSL, and naming it so made the
       whole fragment shader fail to compile, which silently killed both the
       photon ring and the outer bloom. */
    float halfSpan = max((uOuter - uInner) * 0.5, 0.001);
    /* A tight band with soft shoulders: this is the photon ring. */
    float band = exp(-pow((r - mid) / halfSpan, 2.0) * 2.4);
    float flicker = 0.94 + 0.06 * sin(uTime * 1.7);
    float a = clamp(band * uIntensity * flicker, 0.0, 1.0);
    gl_FragColor = vec4(uColour * (0.9 + band * 0.8), a);
  }
`;

export class BlackHole {
  constructor({ quality = {}, intensity = 1, radius = 22 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'black-hole';
    this.intensity = intensity;
    this.radius = radius;
    this.time = 0;
    this._fadeable = [];
    /* MEDIUM and above also carry the outer bloom plane. The disk itself is
       built on every tier — see the note in build(). */
    this.bloom = quality.nebula !== false;
    this.build();
  }

  build() {
    const R = this.radius;
    const inner = R * 0.40;

    /* ── Event horizon ──────────────────────────────────────
       transparent:true keeps it in three's transparent pass so its renderOrder
       is honoured against the additive star layers. It DOES write depth, which
       is what makes it a genuine occluder: the far half of the disk behind it
       gets depth-rejected, giving the silhouette for free instead of needing a
       hand-authored mask. Nearer opaque objects (the astronaut) still win
       because their depth was written first. */
    this.horizon = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.335, 40, 28),
      new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 1,
        depthWrite: true, depthTest: true, side: THREE.FrontSide,
      }),
    );
    this.horizon.renderOrder = 5;
    this.group.add(this.horizon);

    /* A faint rim of light bending around the horizon. Drawn after the horizon
       so it survives on top of the black disc. */
    const rimMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uIntensity: { value: 1 },
        uInner: { value: R * 0.335 }, uOuter: { value: R * 0.46 },
        uColour: { value: new THREE.Color(0xdff2ff) },
      },
      vertexShader: RING_VERT,
      fragmentShader: HALO_FRAG,
      transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.photonRing = new THREE.Mesh(new THREE.RingGeometry(R * 0.335, R * 0.46, 160), rimMat);
    this.photonRing.renderOrder = 7;
    this.group.add(this.photonRing);
    this._fadeable.push({ mat: rimMat, base: 1 });

    /* The disk is built on EVERY tier, and that is a correction rather than a
       preference. It used to sit behind `quality.nebula`, so LOW and MOBILE got
       the horizon and a thin ring and nothing else — and a black disc on a dark
       sky is not a black hole, it is a hole in the sky. The object was present
       on those tiers the whole time and could not be seen, which is how it was
       reported: "the black hole does not show on my laptop or my phone". The
       tier gate now buys the outer bloom plane only, which is the genuinely
       expensive one. */
    {
      /* ── Accretion disk ───────────────────────────────── */
      const diskMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 }, uIntensity: { value: 1 },
          uInner: { value: inner }, uOuter: { value: R },
          uHot: { value: new THREE.Color(PAL.amber) },
          uCool: { value: new THREE.Color(PAL.violet) },
        },
        vertexShader: RING_VERT,
        fragmentShader: DISK_FRAG,
        transparent: true, depthWrite: false, depthTest: true,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      this.disk = new THREE.Mesh(new THREE.RingGeometry(inner, R, 220, 3), diskMat);
      this.disk.renderOrder = 6;
      this.group.add(this.disk);
      this._fadeable.push({ mat: diskMat, base: 1 });

      /* ── Outer bloom, so the disk does not end on a hard edge ──
         This is the plane the tier gate still buys: it is additive and covers
         several times the disk's area, so on a device that asked for the
         lighter sky it is left out and the disk keeps its own edge. */
      if (this.bloom) {
        const glowMat = new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 }, uIntensity: { value: 0.34 },
            uInner: { value: R * 0.98 }, uOuter: { value: R * 1.5 },
            uColour: { value: new THREE.Color(PAL.blue) },
          },
          vertexShader: RING_VERT,
          fragmentShader: HALO_FRAG,
          transparent: true, depthWrite: false, depthTest: true,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        this.glow = new THREE.Mesh(new THREE.RingGeometry(R * 0.98, R * 1.5, 128), glowMat);
        this.glow.renderOrder = 6;
        this.group.add(this.glow);
        this._fadeable.push({ mat: glowMat, base: 0.34 });
      }
    }

    /* Inclined the way the familiar images are: close to edge-on, tipped a
       little, and yawed off axis so it is never a perfect ellipse. */
    this.group.rotation.set(-0.96, 0.24, 0.20);
  }

  /** Section-level dimming, mirroring SpaceEnvironment.setIntensity. */
  setIntensity(v) {
    this.intensity = v;
    for (const f of this._fadeable) f.mat.uniforms.uIntensity.value = f.base * v;
  }

  update(dt) {
    this.time += dt;
    if (this.disk) this.disk.material.uniforms.uTime.value = this.time;
    this.photonRing.material.uniforms.uTime.value = this.time;
    if (this.glow) this.glow.material.uniforms.uTime.value = this.time;
  }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }
}
