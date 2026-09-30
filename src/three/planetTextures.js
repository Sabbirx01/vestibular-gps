/* ═══════════════════════════════════════════════════════════
   planetTextures — procedural, deterministic, offline.
   Real 3D value noise with trilinear interpolation (not the
   rounded-sine shortcut, which produces visible blockiness).
   Each body gets albedo, and where useful an emissive map (city
   lights), a roughness map (oceans vs land) and a cloud alpha.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';

/* ── Deterministic hash-based 3D value noise ────────────── */
const P = new Uint8Array(512);
(function seedPermutation() {
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  /* Fisher–Yates with a fixed LCG so every load looks identical */
  let s = 1337;
  for (let i = 255; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) P[i] = base[i & 255];
})();

function hash3(x, y, z) {
  return P[(P[(P[x & 255] + y) & 255] + z) & 255] / 255;
}

function smooth(t) { return t * t * (3 - 2 * t); }

function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf), v = smooth(yf), w = smooth(zf);

  const c000 = hash3(xi, yi, zi);
  const c100 = hash3(xi + 1, yi, zi);
  const c010 = hash3(xi, yi + 1, zi);
  const c110 = hash3(xi + 1, yi + 1, zi);
  const c001 = hash3(xi, yi, zi + 1);
  const c101 = hash3(xi + 1, yi, zi + 1);
  const c011 = hash3(xi, yi + 1, zi + 1);
  const c111 = hash3(xi + 1, yi + 1, zi + 1);

  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;

  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

function fbm(x, y, z, octaves = 5, lacunarity = 2.07, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise3(x * f, y * f, z * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/* Ridged variant — gives continents coastal detail rather than blobs */
function ridged(x, y, z, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise3(x * f, y * f, z * f) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

/* ═══════════════════════════════════════════════════════════
   Body recipes
   ═══════════════════════════════════════════════════════════ */
export const BODIES = {
  EARTH: {
    radius: 1.05, tilt: 0.41, spin: 0.055, bump: 0.02,
    /* The blue limb is the single most recognisable thing about the planet from
       orbit, so the atmosphere shell carries real weight here: a wider falloff
       (2.7) at a brighter intensity (1.75) than the original 3.1/1.15, which
       left the edge of the disc looking cut out. */
    atmo: 0x6fb7ff, atmoPower: 3.2, atmoIntensity: 2.0,
    /* 0.70, and this number is a measurement of the finished frame rather than a
       guess. At 0.92 the sub-solar third of the disc came back a FLAT near-white
       plateau: sampling the rendered Space-view capture, the inner 0-0.2 r ring
       had 98.3 % of its pixels at luma >= 220 with a mean RGB of (227,229,232),
       and 75 % of everything above 220 was neutral (max-min <= 12) — cloud, not
       ocean. That is the "white layer" the owner kept reporting on Earth. The
       albedo ladder had been lifted to get the disc off the ACES floor and it
       worked, but the opaque deck then sat on the tone curve's shoulder, where
       more brightness buys no structure at all. The deck is what gets dialled
       back, not the surface: the deck is the layer doing the veiling. */
    clouds: true, cloudOpacity: 0.70, nightLights: true,
  },
  MOON: {
    radius: 0.44, tilt: 0.10, spin: 0.085, bump: 0.055,
    atmo: 0xb9c6d8, atmoPower: 4.2, atmoIntensity: 0.32,
    clouds: false, nightLights: false, craters: 46,
  },
  MARS: {
    radius: 0.74, tilt: 0.44, spin: 0.07, bump: 0.03,
    atmo: 0xe2a06a, atmoPower: 3.6, atmoIntensity: 0.6,
    clouds: false, nightLights: false, ice: 0.55,
  },
  MICROGRAVITY: {
    radius: 1.05, tilt: 0.41, spin: 0.055, bump: 0.02,
    /* MICROGRAVITY reuses the Earth look — keep the two in step, including the
       0.70 deck opacity measured on the Earth render above. */
    atmo: 0x6fb7ff, atmoPower: 3.2, atmoIntensity: 2.0,
    clouds: true, cloudOpacity: 0.70, nightLights: true,
  },
};

/* ═══════════════════════════════════════════════════════════
   Texture generation
   ═══════════════════════════════════════════════════════════ */
/* Earth and the free-float state share a recipe, so generate once. */
const CACHE = new Map();

export function buildPlanetTextures(id, W = 512) {
  const spec = BODIES[id] || BODIES.EARTH;
  /* MICROGRAVITY reuses the Earth recipe verbatim */
  const recipe = id === 'MICROGRAVITY' ? 'EARTH' : id;
  const key = `${recipe}@${W}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const H = W / 2;

  const albedo = new Uint8ClampedArray(W * H * 4);
  const rough = new Uint8ClampedArray(W * H * 4);
  const emis = spec.nightLights ? new Uint8ClampedArray(W * H * 4) : null;
  const clouds = spec.clouds ? new Uint8ClampedArray(W * H * 4) : null;

  /* crater anchors for the Moon, indexed per scan-row so the inner loop
     only touches pixels that can actually be inside a crater rim. */
  const craters = [];
  let craterRows = null;
  if (spec.craters) {
    let s = 7717;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < spec.craters; i++) {
      const r = 0.006 + rnd() * 0.055;
      const cx = rnd();
      const cy = 0.06 + rnd() * 0.88;
      craters.push({ x: cx, y: cy, r, depth: 0.4 + rnd() * 0.6 });
    }
    craterRows = Array.from({ length: H }, () => []);
    craters.forEach((c, idx) => {
      const y0 = Math.max(0, Math.floor((c.y - c.r * 0.9) * H));
      const y1 = Math.min(H - 1, Math.ceil((c.y + c.r * 0.9) * H));
      for (let yy = y0; yy <= y1; yy++) craterRows[yy].push(idx);
    });
  }

  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const theta = v * Math.PI;          // 0 at north pole
    const sinT = Math.sin(theta), cosT = Math.cos(theta);

    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const phi = u * Math.PI * 2;

      /* unit sphere direction */
      const nx = sinT * Math.cos(phi);
      const ny = cosT;
      const nz = sinT * Math.sin(phi);

      const i = (y * W + x) * 4;

      let r = 0, g = 0, b = 0, roughV = 0.85, eR = 0, eG = 0, eB = 0;

      if (id === 'EARTH' || id === 'MICROGRAVITY') {
        /* continents: fbm modulated by ridged detail for coastlines */
        const cont = fbm(nx * 1.5, ny * 1.5, nz * 1.5, 6, 2.1, 0.52);
        const coast = ridged(nx * 4.2, ny * 4.2, nz * 4.2, 4);
        const elev = cont * 0.76 + coast * 0.24;
        const sea = 0.485;

        const latIce = Math.abs(ny);
        const ice = clamp01((latIce - 0.80) / 0.16) * 0.96;

        if (elev < sea) {
          /* Ocean, depth tinted. Brightened from (28,86,140)/(6,26,78): at hero
             framing the whole globe is about 120 px across, and at that size a
             physically plausible deep-sea albedo reads as a grey smudge rather
             than as water. These values keep the deep/shallow contrast but land
             the mid-ocean where a person recognises "Earth" — clear blue, with
             the sun-glint on top of it. */
          const d = clamp01((sea - elev) / 0.22);
          /* Lifted a third time, and this is the one that actually shows up on
             screen. The hero renderer runs ACESFilmicToneMapping at exposure
             1.28, and ACES rolls highlights off hard: three lighting setups
             spanning body key 4.4 -> 6.4 and ambient 1.45 -> 1.75 all measured
             the same median 74 / max 109. Lighting is therefore the wrong dial
             for this planet and the ALBEDO is the right one, because albedo
             moves the input up the curve instead of pushing it deeper into the
             shoulder. Measured median 74 is roughly ACES(0.30) — the old water
             and land simply sat that low. */
          /* Bright, but the brightness is spent on BLUE only. The previous
             ladder lifted R, G and B together, which raised the median 74 -> 83
             while saturated blue FELL 3.4 % -> 2.2 %: the disc got lighter and
             whiter rather than bluer, and "bright grey ball" is not what anyone
             means by "make it realistic". So R and G come down and B stays. */
          r = mix(52, 8, d); g = mix(148, 52, d); b = mix(232, 164, d);
          /* 0.07 rather than 0.12: a low-roughness ocean catches a specular
             highlight from the key light, and that glint is what makes a disc
             read as WATER rather than as a blue-grey material. */
          roughV = 0.07 + d * 0.05;
          /* Continental shelf: water close to a coast is shallow and reads
             distinctly lighter than open ocean. At 120 px this is the cheapest
             and most legible "that is a real planet" cue there is, because it
             turns the coastline into a bright hairline instead of a hard edge
             where blue meets green. */
          const shelf = clamp01(1 - d / 0.28);
          r = mix(r, 96, shelf * 0.42);
          g = mix(g, 188, shelf * 0.42);
          b = mix(b, 226, shelf * 0.42);
          /* sun-glint noise on the surface */
          const glint = fbm(nx * 9, ny * 9, nz * 9, 3);
          r += glint * 16; g += glint * 22; b += glint * 28;
        } else {
          /* land — biome by elevation and latitude */
          const e = clamp01((elev - sea) / 0.30);
          const arid = fbm(nx * 3.1 + 11, ny * 3.1, nz * 3.1, 4);
          const jungle = clamp01((0.52 - latIce) * 2.2);
          const desert = clamp01((arid - 0.52) * 3);

          /* land, likewise lifted twice so the biomes separate instead of
             merging into one dark green mass at hero scale */
          /* Slightly less yellow than the previous ladder: pushed back toward
             green/ochre so the land separates from the white deck by HUE and not
             only by brightness. */
          r = mix(96, 168, e); g = mix(158, 188, e); b = mix(84, 124, e);
          /* deserts push toward ochre, poles and mountains toward rock/ice */
          /* Biome weights raised (desert 0.75->0.85, jungle 0.35->0.5) after a
             crop review: the visible landmass came out one flat olive-khaki tone
             with no biome separation at all, which is a large part of why the
             ball read as CGI rather than as a planet. */
          r = mix(r, 186, desert * 0.85); g = mix(g, 156, desert * 0.82); b = mix(b, 104, desert * 0.8);
          r = mix(r, 44, jungle * 0.5); g = mix(g, 96, jungle * 0.5); b = mix(b, 44, jungle * 0.5);
          const snow = clamp01((e - 0.62) / 0.3) * 0.8;
          r = mix(r, 238, snow); g = mix(g, 244, snow); b = mix(b, 250, snow);
          roughV = 0.86 - e * 0.16;

          /* city lights on the night side of Earth */
          if (emis) {
            const pop = clamp01((arid - 0.30) * 1.5) * clamp01((0.86 - latIce) * 2.4) * clamp01((0.30 - e) * 2.4);
            const cluster = fbm(nx * 26, ny * 26, nz * 26, 3);
            const lit = clamp01((cluster - 0.60) * 6) * pop;
            eR = Math.round(lit * 255); eG = Math.round(lit * 208); eB = Math.round(lit * 132);
          }
        }
        /* ice caps override everything */
        r = mix(r, 244, ice); g = mix(g, 250, ice); b = mix(b, 255, ice);
        roughV = mix(roughV, 0.42, ice);
      }

      else if (id === 'MOON') {
        const base = fbm(nx * 2.2, ny * 2.2, nz * 2.2, 5, 2.05, 0.5);
        const mare = clamp01((fbm(nx * 0.9 + 4, ny * 0.9, nz * 0.9, 3) - 0.46) * 3.4);
        let shade = mix(0.62, 1.0, base);
        shade = mix(shade, shade * 0.62, mare);           // dark maria
        let v2 = shade * 214 + 26;

        /* craters: bright rim, dark floor — only the rows that can contain them */
        const rowList = craterRows ? craterRows[y] : null;
        if (rowList && rowList.length) {
          for (let n = 0; n < rowList.length; n++) {
            const c = craters[rowList[n]];
            const dx = u - c.x;
            const dxa = dx < 0 ? -dx : dx;
            if (dxa > c.r * 1.6) continue;
            const dy = (v - c.y) * 2;
            const d = Math.sqrt(dxa * dxa + dy * dy);
            if (d < c.r * 1.6) {
              const t = d / (c.r * 1.6);
              /* A softer, wider rim ring... */
              const wave = (t - 1.0) * 3.4;
              const rim = Math.exp(-(wave * wave)) * 0.44 * c.depth;
              /* ...and a smooth bowl instead of a thresholded disc. The old
                 `t < 0.82 ? -x : 0` cut off abruptly, which painted flat oval
                 patches that read as decals stuck onto the surface. */
              const bowl = -0.34 * c.depth * Math.pow(Math.max(0, 1 - t), 1.8);
              v2 += (rim + bowl) * 118;
            }
          }
        }
        v2 = clamp01(v2 / 255) * 235 + 12;
        r = g = b = v2;
        /* very slight warm/cool variation so it is not pure greyscale */
        r *= 1.02; b *= 0.98;
        roughV = 0.94;
      }

      else if (id === 'MARS') {
        const land = fbm(nx * 2.0, ny * 2.0, nz * 2.0, 6, 2.08, 0.5);
        const dark = clamp01((fbm(nx * 1.1 + 9, ny * 1.1, nz * 1.1, 4) - 0.48) * 3);
        const dust = fbm(nx * 6.5, ny * 6.5, nz * 6.5, 4);

        r = mix(140, 208, land); g = mix(74, 128, land); b = mix(48, 84, land);
        r = mix(r, 104, dark * 0.5); g = mix(g, 52, dark * 0.5); b = mix(b, 36, dark * 0.5);
        const bright = clamp01((dust - 0.55) * 2.2);
        r = mix(r, 226, bright * 0.35); g = mix(g, 176, bright * 0.35); b = mix(b, 132, bright * 0.35);

        /* polar caps */
        const ice = clamp01((Math.abs(ny) - (0.90 - (spec.ice || 0.5) * 0.12)) / 0.09);
        r = mix(r, 246, ice); g = mix(g, 244, ice); b = mix(b, 250, ice);
        roughV = 0.9 - ice * 0.3;
      }

      albedo[i] = r; albedo[i + 1] = g; albedo[i + 2] = b; albedo[i + 3] = 255;

      const rv = Math.round(roughV * 255);
      rough[i] = rv; rough[i + 1] = rv; rough[i + 2] = rv; rough[i + 3] = 255;

      if (emis) { emis[i] = eR; emis[i + 1] = eG; emis[i + 2] = eB; emis[i + 3] = 255; }

      if (clouds) {
        /* banded cloud field — more cover at the equator and mid-latitudes */
        const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 5.2 + 1.1);
        /* 4.4 rather than 3.4. Measured after the previous pass: the deck no
           longer veiled the whole disc, but 3793 of 3897 lit pixels belonged to
           ONE connected blob — a single cloud sheet crossed by thin blue
           channels, which still reads as haze. The field has to be higher
           frequency for the cover to break into separate systems. */
        const n = fbm(nx * 4.4, ny * 4.4, nz * 4.4, 5, 2.2, 0.55);
        /* Fourth pass, and this one is a different KIND of change, not another
           nudge of the same dial. The old 0.72/0.28/0.485/3.0 deck gave almost
           every pixel a small non-zero alpha, so at 0.82 deck opacity the planet
           wore a uniform milky film: no gaps, therefore no blue ocean and no
           coastline to read against it. That is what "it does not look
           realistic" actually was. Weights moved onto the noise (0.86 vs 0.14
           band) and the ramp steepened (4.2), so coverage still reaches ~70 % but
           in DISTINCT masses with clear water between them — weather instead of
           haze. */
        /* Sparse but OPAQUE, which is the combination the four measured passes
           pointed at and none of them tried. Everything before this varied the
           deck's level (opacity up/down) while coverage stayed broad, and the
           result was always the same object: a uniform low-contrast film, either
           greyer (low opacity) or whiter (high opacity). What the crop lacked was
           TONAL STRUCTURE — cloud tops at 180-220 luma sitting over blue water.
           That needs the alpha to reach 1.0 in the cloud cores while the coverage
           stays low, so the ramp is steepened (5.0 -> 6.5) as the threshold goes
           up. Fewer clouds, but the ones present are actually white. */
        const cover = clamp01((n * 0.90 + band * 0.10 - 0.60) * 6.5);
        const a = Math.round(cover * 255);
        /* 240/244/250 rather than pure white. At 255 the cloud cores were the
           brightest thing the renderer had, and once the albedo ladder lifted the
           whole disc they became a flat white plateau — sampled, the lit cores sat
           at 227 and the ACES shoulder had nothing left to give back. Slightly off
           white keeps them reading as cloud and leaves the highlight room. */
        clouds[i] = 240; clouds[i + 1] = 244; clouds[i + 2] = 250; clouds[i + 3] = a;
      }
    }
  }

  /* ── Lunar ray systems ────────────────────────────────────
     Bright ejecta streaks thrown far beyond the rim of the youngest craters.
     Tycho is the famous example, and it is what makes the Moon recognisable
     rather than merely grey and pitted. Implemented as a bounded post-pass so
     it costs nothing on the other bodies. */
  if (id === 'MOON') {
    let s = 20261;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    for (let r = 0; r < 5; r++) {
      const cx0 = 0.15 + rnd() * 0.7;
      const cy0 = 0.15 + rnd() * 0.7;
      const reach = 0.06 + rnd() * 0.14;          // ray length in u
      const spokes = 9 + Math.floor(rnd() * 8);
      const strengths = Array.from({ length: spokes }, () => 0.25 + rnd() * 0.75);

      const y0 = Math.max(0, Math.floor((cy0 - reach) * H));
      const y1 = Math.min(H - 1, Math.ceil((cy0 + reach) * H));

      for (let y = y0; y <= y1; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W;
          const dx = u - cx0;
          const dy = (v - cy0) * 0.5;             // aspect correct
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > reach || d < 0.004) continue;

          /* A gentle angular wobble and a width that narrows with distance.
             Perfectly straight, constant-width spokes are what made the
             previous pass read as an airbrushed starburst rather than as
             ejecta. */
          const wobble = Math.sin(d * 46 + r * 2.1) * 0.09;
          let ang = Math.atan2(dy, dx) / (Math.PI * 2) + wobble;
          if (ang < 0) ang += 1;
          const spoke = ang * spokes;
          const frac = spoke - Math.floor(spoke);
          const si = Math.floor(spoke) % spokes;
          /* A gentle exponent. Raising it toward 4.6 made each wedge so narrow
             that almost no pixel cleared the threshold and the rays vanished
             entirely — the previous pass had visible spokes and this one had
             none, which is a regression, not a refinement. */
          const sharp = 1.5 + (1 - d / reach) * 0.9;
          const wedge = Math.pow(1 - Math.abs(frac - 0.5) * 2, sharp);

          const falloff = Math.pow(1 - d / reach, 1.5);
          const amp = wedge * falloff * strengths[si] * 0.78;

          const i = (y * W + x) * 4;
          albedo[i]     = Math.min(255, albedo[i] + amp * 190);
          albedo[i + 1] = Math.min(255, albedo[i + 1] + amp * 186);
          albedo[i + 2] = Math.min(255, albedo[i + 2] + amp * 178);
        }
      }
    }
  }

  const mk = (data) => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  };

  const out = {
    map: mk(albedo),
    roughnessMap: mk(rough),
  };
  if (emis) { out.emissiveMap = mk(emis); out.emissiveMap.colorSpace = THREE.SRGBColorSpace; }
  if (clouds) out.cloudMap = mk(clouds);
  CACHE.set(key, out);
  return out;
}
