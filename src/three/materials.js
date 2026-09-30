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

/* ── Star field ──────────────────────────────────────────
   Upgraded from a two-colour mix to a real stellar temperature ramp, plus
   diffraction spikes on the brightest stars.

   Why it matters visually: a field of identical white dots reads as texture
   noise. Real skies read as a field because a handful of stars are obviously
   brighter and bluer or redder than the rest, and the brightest ones bloom
   into a four-point cross. That contrast is what makes the background look
   like space rather than like static.
   ────────────────────────────────────────────────────────── */
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
      uSpike: { value: 0.85 },
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
      varying float vBright;
      varying float vPointSize;
      void main() {
        vTint = aTint;
        /* aScale runs ~0.15..2.0; normalise it into a brightness weight */
        vBright = clamp((aScale - 0.15) / 1.85, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        /* brighter stars twinkle less, the way real bright stars do */
        float amp = mix(0.42, 0.10, vBright);
        float tw = (1.0 - amp) + amp * sin(uTime * 1.5 + aPhase * 6.2831);
        vTwinkle = tw;
        /* Distance attenuation with a POWER of 0.75, not a linear inverse.
           The star shells sit 150-300 units out, so a linear 26/ -z term was
           resolving every star to roughly two pixels. At two pixels none of
           the work in the fragment shader is visible at all — no temperature
           colour, no spikes, no core-versus-halo — which is exactly why the
           sky looked unchanged. A softer falloff keeps distant stars large
           enough to actually render as stars. */
        float atten = pow(60.0 / max(1.0, -mv.z), 0.75);
        gl_PointSize = uSize * aScale * uPixelRatio * atten;
        gl_PointSize = clamp(gl_PointSize, 1.2, 40.0);
        /* The fragment shader needs the sprite's real size in pixels to draw
           spikes at a constant width. exp2() inverts the perspective divide. */
        vPointSize = gl_PointSize;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      uniform float uSpike;
      varying float vTint;
      varying float vTwinkle;
      varying float vBright;
      varying float vPointSize;

      /* OBAFGKM-ish ramp: 0 = cool orange-red, 1 = hot blue-white.
         Deliberately more saturated than a physical blackbody table — on a
         dim, heavily tone-mapped sky a physically-correct ramp reads as
         uniform grey, which is what the previous version produced. */
      vec3 starColour(float t) {
        vec3 m = vec3(1.00, 0.42, 0.22);   // M
        vec3 k = vec3(1.00, 0.68, 0.38);   // K
        vec3 g = vec3(1.00, 0.93, 0.74);   // G
        vec3 a = vec3(0.93, 0.96, 1.00);   // A
        vec3 b = vec3(0.55, 0.74, 1.00);   // B
        vec3 o = vec3(0.40, 0.60, 1.00);   // O
        if (t < 0.20) return mix(m, k, t / 0.20);
        if (t < 0.42) return mix(k, g, (t - 0.20) / 0.22);
        if (t < 0.62) return mix(g, a, (t - 0.42) / 0.20);
        if (t < 0.84) return mix(a, b, (t - 0.62) / 0.22);
        return mix(b, o, (t - 0.84) / 0.16);
      }

      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;

        /* A TIGHTER halo than before. At power 3.2 the halo still had ~30% of
           its brightness at r=0.35, which filled the sprite and buried the
           spikes underneath it — the star measured as a clean round disc with
           dark diagonals. Power 5.0 confines the halo near the core so the
           arms have somewhere to show. */
        float core = smoothstep(0.16, 0.0, r);
        float halo = pow(smoothstep(0.5, 0.0, r), 5.0);

        /* Four-point diffraction spikes.
           The width is now expressed in PIXELS and converted into the
           sprite's normalised space, because a fraction of the sprite shrinks
           with it: at a 6 px point size the old fixed fraction worked out to
           0.17 px and could never be seen. */
        vec2 ad = abs(d);
        float px = max(vPointSize, 1.0);
        float spikeW = clamp(2.0 / px, 0.03, 0.20);   // ~2 px wide arms
        /* Arms now reach the full sprite instead of stopping at half of it,
           so they extend beyond the tightened halo. */
        float reach = mix(0.34, 1.02, vBright);
        float sh = smoothstep(spikeW, 0.0, ad.y) * smoothstep(reach, 0.0, ad.x);
        float sv = smoothstep(spikeW, 0.0, ad.x) * smoothstep(reach, 0.0, ad.y);
        float spikes = (sh + sv) * uSpike * pow(vBright, 0.9);

        vec3 col = starColour(vTint);

        /* The core used to be multiplied by 1.35 and blended 55% toward white
           with a brightness-dependent mix, so every bright star saturated to
           white and the temperature colour was lost. Both are dialled back so
           the colour survives the core. */
        vec3 hot = mix(col, vec3(1.0), 0.28 * vBright);
        /* Spikes weighted heavily: they are thin, so they need a high
           amplitude to survive next to a saturated core. */
        /* Bright cores used to hard-clip to white. Halo, core and spikes were
           summed and then clamped by the framebuffer, so the brightest stars
           flattened into white discs and lost their temperature colour — the
           complaint that the core clips. A soft shoulder, 1 - e^-x, compresses
           the top of the range instead of clipping it, so a hot O-type star
           stays blue at full brightness rather than turning into a white dot. */
        vec3 lit = col * halo * 1.15 + hot * core * 0.80 + col * spikes * 2.4;
        vec3 rgb = vec3(1.0) - exp(-lit * 1.15);

        float a = (halo * 0.85 + core * 0.92 + spikes * 1.0) * vTwinkle * uOpacity;
        gl_FragColor = vec4(rgb, clamp(a, 0.0, 1.0));
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

/* ── Atmosphere shell ────────────────────────────────────
   A plain fresnel rim glows equally all the way round, which makes a planet
   look like a glowing ball. A real atmosphere is brightest where the sun
   strikes it and fades to almost nothing on the night side, and that
   asymmetry is most of what sells a planet as lit rather than emissive.

   `uLightDir` is the world-space direction TO the sun. The rim term is
   modulated by how much the shell's outward normal faces it, so the glow
   peaks on the dayside limb and dies away across the terminator.
   ──────────────────────────────────────────────────────── */
export function atmosphereMaterial(color, {
  power = 3.0,
  intensity = 1.0,
  lightDir = new THREE.Vector3(1, 0.35, 0.9).normalize(),
  terminator = 0.85,
} = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
      uTime: { value: 0 },
      uLightDir: { value: lightDir.clone() },
      uTerminator: { value: terminator },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
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
      uniform vec3  uLightDir;
      uniform float uTerminator;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;

      void main() {
        vec3 n = normalize(vNormalW);

        /* On a BackSide shell the outward direction is the negated normal. */
        float rim = pow(1.0 - abs(dot(normalize(vViewDir), n)), uPower);

        /* Sun-facing weight. On the far side of the shell the normal points
           away from the camera, so flip it to get the outward hemisphere. */
        vec3 outN = normalize(vWorldPos - vec3(0.0));
        float sun = dot(outN, normalize(uLightDir));
        float lit = smoothstep(-uTerminator, uTerminator, sun);

        /* A thin brightening right at the limb where the atmosphere is
           optically thickest — without it the glow looks like fog. Kept
           modest: at 0.55 it combined with the additive blend to wash the
           entire dayside hemisphere of the disc to near-white, which hid the
           surface texture underneath it. */
        float limbBoost = 1.0 + 0.28 * pow(1.0 - abs(dot(normalize(vViewDir), n)), 6.0);

        float a = rim * lit * uIntensity * limbBoost;
        /* Colour is no longer brightened by the lit term — that was the second
           half of the washing-out problem. */
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
      }
    `,
  });
}

/* ── Fresnel shell: rim-lit membrane look ────────────────── */
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

/* ── Limb darkening shell ────────────────────────────────
   An airless body is brightest where you look straight down at it and falls off
   towards the silhouette — the regolith shows almost no light back at grazing
   angles. Without it a photographic lunar map renders as an evenly bright disc,
   which is what "flat and pale" actually was: the map was fine, the falloff was
   missing.

   Multiply blending, because this layer can only ever darken what is already
   drawn — additive shells (the atmosphere and the limb rim) physically cannot.
   The shell is only 1% larger than the body so the ring of starfield it also
   multiplies is about a pixel wide.
   ──────────────────────────────────────────────────────── */
export function limbDarkeningMaterial(strength = 0.4, power = 2.4) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.MultiplyBlending,
    side: THREE.FrontSide,
    uniforms: {
      uStrength: { value: strength },
      uPower: { value: power },
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
      uniform float uStrength;
      uniform float uPower;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float ndv = clamp(abs(dot(normalize(vNormalW), normalize(vViewDir))), 0.0, 1.0);
        float dark = pow(1.0 - ndv, uPower) * uStrength;
        gl_FragColor = vec4(vec3(1.0 - dark), 1.0);
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
