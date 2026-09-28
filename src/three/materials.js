/* ═══════════════════════════════════════════════════════════
   materials — shared shader + material factories.
   Every colour is derived from the token palette so the 3D layer
   and the CSS layer never drift apart.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';

export const PAL = {
  void:   0x04060f,
  deep:   0x0a1226,
  cyan:   0x5fe3ff,
  blue:   0x4a8bff,
  violet: 0xa877ff,
  green:  0x4ade80,
  amber:  0xffb547,
  red:    0xff5f6d,
  white:  0xe9f2ff,
  suit:   0xe6ecf5,
  visor:  0x0d1b2e,
};

/* ── Star field: additive points with size + twinkle ────── */
export function starMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uSize: { value: 9 },
      uOpacity: { value: 1 },
      uColorA: { value: new THREE.Color(PAL.white) },
      uColorB: { value: new THREE.Color(PAL.cyan) },
    },
    vertexShader: /* glsl */`
      attribute float aScale;
      attribute float aPhase;
      attribute float aTint;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uSize;
      varying float vTint;
      varying float vTwinkle;
      void main() {
        vTint = aTint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.62 + 0.38 * sin(uTime * 1.6 + aPhase * 6.2831);
        vTwinkle = tw;
        gl_PointSize = uSize * aScale * uPixelRatio * (26.0 / -mv.z);
        gl_PointSize = clamp(gl_PointSize, 0.6, 42.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uOpacity;
      varying float vTint;
      varying float vTwinkle;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        float glow = pow(core, 2.6);
        vec3 col = mix(uColorA, uColorB, vTint);
        gl_FragColor = vec4(col, glow * vTwinkle * uOpacity);
      }
    `,
  });
}

/* ── Nebula: large soft additive planes ─────────────────── */
export function nebulaMaterial(color, opacity = 0.5) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uSeed: { value: Math.random() * 10 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3  uColor;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }
      void main() {
        vec2 p = (vUv - 0.5) * 3.0 + uSeed;
        float n = fbm(p + vec2(uTime * 0.014, uTime * 0.009));
        float n2 = fbm(p * 2.1 - vec2(uTime * 0.008, 0.0));
        float density = smoothstep(0.28, 0.92, n * 0.72 + n2 * 0.42);
        float mask = smoothstep(0.5, 0.06, distance(vUv, vec2(0.5)));
        float a = density * mask * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

/* ── Fresnel shell: rim-lit atmosphere / membrane look ──── */
export function fresnelMaterial(color, { power = 2.6, intensity = 1.0, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uColor;
      uniform float uPower;
      uniform float uIntensity;
      uniform float uTime;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), uPower);
        float pulse = 0.92 + 0.08 * sin(uTime * 1.4);
        gl_FragColor = vec4(uColor, f * uIntensity * pulse);
      }
    `,
  });
}

/* ── Signal pulse used along neural pathways ────────────── */
export function signalMaterial(color, width = 0.55) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uProgress: { value: 0 },
      uWidth: { value: width },
      uIntensity: { value: 1 },
    },
    vertexShader: /* glsl */`
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uColor;
      uniform float uProgress;
      uniform float uWidth;
      uniform float uIntensity;
      varying float vT;
      void main() {
        float d = fract(vT - uProgress);
        float w = 1.0 - smoothstep(0.0, uWidth, d);
        float head = smoothstep(uWidth, 0.0, d) * 1.6;
        float a = clamp(w + head, 0.0, 1.6) * uIntensity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

/* ── Tissue-ish translucent body material ───────────────── */
export function tissueMaterial(color, { opacity = 0.35, roughness = 0.42, emissive = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness,
    metalness: 0.02,
    emissive: new THREE.Color(emissive || color),
    emissiveIntensity: emissive ? 0.4 : 0.06,
    depthWrite: opacity > 0.85,
    side: THREE.DoubleSide,
  });
}

/* ── Emissive "energy" material for highlighted structures ─ */
export function energyMaterial(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.94,
  });
}

/* ── Spacesuit materials ────────────────────────────────── */
export const SUIT = () => new THREE.MeshStandardMaterial({
  color: PAL.suit, roughness: 0.52, metalness: 0.16,
});
export const SUIT_PANEL = () => new THREE.MeshStandardMaterial({
  color: 0x9fb2c9, roughness: 0.62, metalness: 0.24,
});
export const SUIT_DARK = () => new THREE.MeshStandardMaterial({
  color: 0x2b3a52, roughness: 0.7, metalness: 0.3,
});
export const VISOR = () => new THREE.MeshPhysicalMaterial({
  color: 0x081726, roughness: 0.06, metalness: 0.1,
  transmission: 0.55, thickness: 0.6, ior: 1.45,
  clearcoat: 1, clearcoatRoughness: 0.06,
  emissive: new THREE.Color(PAL.cyan), emissiveIntensity: 0.12,
});
export const GOLD = () => new THREE.MeshStandardMaterial({
  color: 0xd9a441, roughness: 0.28, metalness: 0.92,
});
export const EYE = () => new THREE.MeshStandardMaterial({
  color: 0xf7fbff, roughness: 0.18, metalness: 0,
  emissive: new THREE.Color(PAL.cyan), emissiveIntensity: 0.25,
});
export const PUPIL = () => new THREE.MeshBasicMaterial({ color: 0x05080f });

/* ── Canvas-texture label sprite (crisp, no font files) ─── */
export function labelSprite(text, {
  color = '#5fe3ff', bg = 'rgba(6,10,20,0.78)', border = 'rgba(95,227,255,0.45)',
  size = 46, pad = 22, scale = 1,
} = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const font = `600 ${size}px ui-monospace, "SF Mono", Consolas, monospace`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = size + pad * 1.1;
  c.width = w; c.height = h;

  const g = c.getContext('2d');
  g.font = font;
  g.fillStyle = bg;
  roundRect(g, 1, 1, w - 2, h - 2, 12);
  g.fill();
  g.strokeStyle = border;
  g.lineWidth = 2;
  roundRect(g, 1, 1, w - 2, h - 2, 12);
  g.stroke();
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, pad, h / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const aspect = w / h;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 1,
  }));
  sprite.scale.set(0.9 * aspect * scale, 0.9 * scale, 1);
  sprite.renderOrder = 20;
  sprite.userData.labelText = text;
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ── Line: glow tube used for pathways and axes ─────────── */
export function glowLine(points, color, { radius = 0.012, opacity = 0.85 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, Math.min(240, points.length * 8), radius, 6, false);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.curve = curve;
  return mesh;
}

export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
    else if (m) { m.map?.dispose?.(); m.dispose?.(); }
  });
}
