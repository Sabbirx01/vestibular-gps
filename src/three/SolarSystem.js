/* ═══════════════════════════════════════════════════════════
   SolarSystem — photographic-grade procedural bodies.
   Albedo, roughness, city lights and a separate cloud deck are
   generated at build time (see planetTextures.js). No image files,
   no hotlinks, no licences: the bodies are computed, so they work
   offline and always render.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.js';
import { PAL, fresnelMaterial, atmosphereMaterial, limbDarkeningMaterial, disposeTree } from './materials.js';
import { damp, TAU, clamp } from '../core/util.js';
import { GRAVITIES } from '../science/content.js';
import { BODIES, buildPlanetTextures } from './planetTextures.js';

/* ── Bundled surface maps ───────────────────────────────────
   The procedural recipes in planetTextures.js stay as the offline fallback and
   are on screen first; a decoded local asset replaces them when it arrives, so
   the section never waits on a file. Every map below is public-domain NASA data
   copied into assets/ — nothing is hotlinked, so GitHub Pages and an offline
   localhost behave identically.

   EARTH / MICROGRAVITY : NASA Blue Marble / MODIS land-ocean composite
                          (Visible Earth image 57730), Wikimedia derivative.
   MOON                 : NASA SVS "CGI Moon Kit" — LROC WAC colour mosaic,
                          built from LRO Camera data (ASU) by the SVS.
   MOON (bump)          : the same kit's LDEM, from LRO's laser altimeter
                          (LOLA). Used as a bump map so the maria basins and
                          crater rims carry real relief instead of flat paint.
   MARS                 : the USGS/NASA Viking MDIM 2.1 colourised global
                          mosaic (MDIM21 ClrMosaic, 1 km), the standard
                          photographic map of the planet.
   ─────────────────────────────────────────────────────────── */
const SURFACE_ASSETS = {
  EARTH: 'assets/earth-blue-marble-1280.jpg',
  MICROGRAVITY: 'assets/earth-blue-marble-1280.jpg',
  MOON: 'assets/moon-lroc-color-2048.jpg',
  MARS: 'assets/mars-viking-mdim-2048.jpg',
};

const BUMP_ASSETS = {
  MOON: 'assets/moon-ldem-1024.jpg',
};

/* Scratch vector for hit-testing; module scope so a pointer event never
   allocates inside the render loop. */
const _hitPos = new THREE.Vector3();

/* ── Night-side city lights ─────────────────────────────────
   A MODEL, not measured city-light data: the app has no night-lights dataset
   and must not imply one. What it does have is the bundled surface map, so the
   emissive layer is generated from that map's own pixels — which is the whole
   point. A procedural light layer painted onto photographic continents puts
   glow over open ocean, because the two textures are unrelated; reading the
   map's land colours means the lights can only land on land that is actually
   drawn underneath them.

   Ocean in this composite is distinctly blue (blue above green) and ice is
   bright and near-neutral, so land is everything that is neither. Lights are
   placed as small clusters rather than uniform speckle, because cities clump.
   ─────────────────────────────────────────────────────────── */
function buildNightLights(image, { width = 1024, clusters = 620 } = {}) {
  if (!image || !image.width) return null;
  const w = width;
  const h = Math.max(1, Math.round(width * (image.height / image.width)));

  const src = document.createElement('canvas');
  src.width = w; src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(image, 0, 0, w, h);

  let data;
  try { data = sctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }

  const isLand = (x, y) => {
    /* Polar bands are excluded outright. The Antarctica coastline is neutral
       enough in this composite to pass the ice test, and it was drawing a line
       of "cities" along the bottom of the map; nothing is lost by cutting both
       caps, because the top band is above 82°N and the bottom one is inside
       Antarctica — neither holds a settlement this layer is trying to suggest. */
    if (y < h * 0.045 || y > h * 0.88) return false;
    const p = (y * w + x) * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const lum = (r + g + b) / 3;
    if (lum < 20) return false;                       // deep shadow / space
    if (lum > 190 && Math.abs(r - b) < 32) return false; // ice sheet
    return !(b > g + 6);                              // ocean is blue-dominant
  };

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d');
  octx.fillStyle = '#000';
  octx.fillRect(0, 0, w, h);
  octx.globalCompositeOperation = 'lighter';

  let placed = 0;
  for (let c = 0; c < clusters; c++) {
    let cx = 0, cy = 0, found = false;
    for (let attempt = 0; attempt < 24 && !found; attempt++) {
      cx = (Math.random() * w) | 0;
      cy = (Math.random() * h) | 0;
      found = isLand(cx, cy);
    }
    if (!found) continue;
    placed++;
    const citySize = 1 + Math.random() * Math.random() * 6;
    const dots = 3 + ((Math.random() * 12) | 0);
    for (let k = 0; k < dots; k++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.pow(Math.random(), 0.6) * citySize;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      const alpha = 0.18 + Math.random() * 0.72;
      const g2 = 168 + ((Math.random() * 70) | 0);
      const b2 = 92 + ((Math.random() * 80) | 0);
      octx.fillStyle = `rgba(255, ${g2}, ${b2}, ${alpha})`;
      octx.beginPath();
      octx.arc(x, y, 0.45 + Math.random() * 1.15, 0, Math.PI * 2);
      octx.fill();
    }
  }
  if (!placed) return null;

  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class SolarSystem {
  /* 768 rather than 512. Below roughly 700 the noise octaves that give
     coastlines and maria their shape start collapsing into visible blobs once
     the camera moves in, which is exactly what the space section does. */
  constructor({ quality = 'HIGH', reducedMotion = false, textureSize = 768 } = {}) {
    this.reduced = reducedMotion;
    this.quality = quality;
    this.textureSize = textureSize;
    this.root = new THREE.Group();
    this.root.name = 'solar-system';
    this.bodies = {};
    this.t = 0;
    this.activeId = 'EARTH';
    this.transitionSpeed = 10.5;
    this.build();
  }

  _createBody(id) {
    const spec = BODIES[id] || BODIES.EARTH;
    const grp = new THREE.Group();
    grp.name = `body-${id}`;

    /* Shared geometry detail scales with the quality tier */
    const seg = this.quality.astronautDetail === 'low' ? 48 : this.quality.astronautDetail === 'mid' ? 64 : 96;

    const maps = buildPlanetTextures(id, this.textureSize);

    const mat = new THREE.MeshStandardMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      /* Matte everywhere, including the Earth. At roughness 0.78 the showcase
         body carried a broad specular sheen which, combined with the white limb
         shell on top, made it read as a glass marble rather than a planet — the
         owner's read, twice. A real Earth from orbit has almost no specular
         response off land; letting the albedo (ocean, land, cloud) do the
         talking is what makes it recognisable. */
      roughness: 0.92,
      metalness: 0,
    });

    /* Albedo scale, where a body needs it. The lunar mosaic is tuned for
       aesthetics rather than photometry — it is far brighter than the Moon's
       ~0.12 albedo — and on the ACES tone curve that brightness lands on the
       shoulder, where more light buys no contrast at all (the same trap the
       Earth's albedo ladder hit, see the notes in planetTextures.js). Scaling
       the albedo DOWN moves the surface off the shoulder, which is what lets the
       maria separate and the terminator read. The map file is untouched. */
    if (spec.albedoScale) mat.color.multiplyScalar(spec.albedoScale);

    /* The procedural recipes cannot produce recognisable geography: the Earth
       one makes plausible continents rather than Africa and Asia, the Moon one a
       soft grey ball rather than maria and a cratered highland. Where a bundled
       map exists it is swapped in over the procedural base. Both maps are
       equirectangular, so they drop straight onto SphereGeometry's UVs. The load
       is deliberately non-blocking — the procedural body is on screen
       immediately and the photographic one replaces it once the local asset has
       decoded — and a failed load just keeps the fallback. */
    const textureLoader = new THREE.TextureLoader();
    const surfacePath = SURFACE_ASSETS[id];
    if (surfacePath) {
      textureLoader.load(
        surfacePath,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = 8;
          texture.needsUpdate = true;
          mat.map = texture;
          if (spec.nightGlow) {
            /* The procedural night layer was painted for the procedural
               continents, so it is replaced rather than laid over the
               photographic map: keeping it would put city glow in the wrong
               hemisphere, over open ocean. */
            const lights = buildNightLights(texture.image);
            if (lights) {
              mat.emissiveMap = lights;
              mat.emissive = new THREE.Color(0xffd2a1);
            }
          }
          mat.needsUpdate = true;
        },
        undefined,
        () => { /* keep the deterministic procedural fallback if the asset is unavailable */ },
      );
    }

    const bumpPath = BUMP_ASSETS[id];
    if (bumpPath) {
      textureLoader.load(
        bumpPath,
        (texture) => {
          /* Elevation is data, not colour — it stays in linear space. */
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = 8;
          texture.needsUpdate = true;
          mat.bumpMap = texture;
          mat.bumpScale = spec.bumpScale ?? 0.03;
          mat.needsUpdate = true;
        },
        undefined,
        () => { /* no relief if the DEM is missing; the colour map still reads */ },
      );
    }
    if (maps.emissiveMap) {
      mat.emissiveMap = maps.emissiveMap;
      mat.emissive = new THREE.Color(0xffffff);
      /* Raised from 0.42, then to 0.7: with the stronger terminator above, the
         night side is darker, and the city lights are what make it read as a
         living planet rather than an unlit half. */
      mat.emissiveIntensity = 0.7;
    }
    /* Size of the showcase body. It used to be 1.16x smaller, to keep the
       planet from competing with the astronaut — but the fix for "it looks
       like a decal on the suit" is POSITION (it now sits clear of the figure,
       see SOLAR_POS in SceneManager.js), not being small. At 0.95 it reads as
       a sphere with a readable terminator instead of a blue smudge: about
       120 px across at the hero framing distance. */
     /* 0.88 rather than 0.95. The reference body sits in the band below the
        spec-card panel, and on a 1366x768 laptop that band is only about 120 px
        tall — at 0.95 the globe measured 119 px and the bottom edge clipped it.
        Five per cent smaller buys the margin without changing how it reads. */
     const showcaseRadius = spec.radius * 0.88;
    const surface = new THREE.Mesh(new THREE.SphereGeometry(showcaseRadius, seg, seg / 2), mat);
    surface.rotation.z = spec.tilt;
    grp.add(surface);

    /* Cloud deck: its own sphere so it can drift independently */
    let clouds = null;
    if (maps.cloudMap) {
      const cloudMat = new THREE.MeshStandardMaterial({
        map: maps.cloudMap,
        transparent: true,
        /* Now read from the body recipe. This was hardcoded 0.95 while the
           recipe's `cloudOpacity` sat there as dead config, so the two had
           already drifted apart. At 0.95 over a ~120 px disc the deck veiled the
           planet into a pale grey-white ball — the owner's read was "the Earth
           is hard to see". 0.82 keeps the swirls but lets the ocean and the
           coastlines read through from underneath. */
        opacity: spec.cloudOpacity ?? 0.9,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        alphaMap: maps.cloudMap,
        color: 0xffffff,
      });
      clouds = new THREE.Mesh(new THREE.SphereGeometry(showcaseRadius * 1.012, seg, seg / 2), cloudMat);
      clouds.rotation.z = spec.tilt;
      clouds.rotation.y = 0.4;
      grp.add(clouds);
    }

    /* Atmosphere: sun-facing rim shell.
       The light direction matches the key light defined below, so the glow
       peaks on the dayside limb and fades across the terminator instead of
       ringing the whole planet evenly. */
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(showcaseRadius * 1.10, 56, 36),
      atmosphereMaterial(spec.atmo, {
        power: spec.atmoPower,
        intensity: spec.atmoIntensity,
        lightDir: new THREE.Vector3(4.2, 1.8, 4.2).normalize(),
        /* a wider, softer terminator so the nightside fade is gradual */
        terminator: 0.95,
      }),
    );
    grp.add(atmo);

    /* A thin forward-scatter shell for the sunlit limb.
       Raised from 0.5: the blue rim is the single most recognisable cue that a
       sphere is a planet with air on it, and at ~120 px the old value thinned it
       to a hard cut-out edge. */
    const limb = new THREE.Mesh(
      new THREE.SphereGeometry(showcaseRadius * 1.055, 56, 36),
      fresnelMaterial(0xffffff, { power: 5.5, intensity: spec.limbIntensity ?? 0.62, side: THREE.FrontSide }),
    );
    grp.add(limb);

    /* Limb darkening — airless bodies only (see limbDarkeningMaterial). Shelters
       just outside the surface so it multiplies the disc, not the starfield. */
    const darkness = spec.limbDarkening
      ? new THREE.Mesh(
          new THREE.SphereGeometry(showcaseRadius * 1.012, 56, 36),
          limbDarkeningMaterial(spec.limbDarkening),
        )
      : null;
    if (darkness) grp.add(darkness);

    /* No name label above the body any more.
       It was a floating chip reading EARTH / MOON / MARS / FREE FLOAT parked at
       showcaseRadius + 0.52, and in the Space section — where the camera sits
       close and the disc is large — it landed across the planet's upper limb as
       a white-outlined box, which is the one thing that section is not supposed
       to look like. It was also redundant: the topbar's mode chip names the
       active body, the SENSORS readout repeats it, and the gravity row
       highlights the button the visitor just pressed. Removed rather than
       dimmed, so nothing is left hovering at the top of the frame. */

    /* Key light from the direction of the sun.
       Raised from 3.6 and the fill dropped from 1.15 so the sphere carries a
       real day/night terminator. At the old ratio the fill flattened the
       planet into an evenly lit disc, which is one of the things that made it
       read as a sticker instead of a lit world. */
    /* 6.4: raised from 4.4 in the visibility pass, then again after the crop
       analysis showed the visible hemisphere was mostly ambient-lit (the sun
       direction here is up-and-right, so the camera-facing face gets little of
       the key). */
    const key = new THREE.DirectionalLight(0xfff6e8, 6.4);
    key.position.set(spec.radius * 4.2, spec.radius * 1.8, spec.radius * 4.2);
    grp.add(key);

    /* Cool fill from the opposite side so the dark limb is not pure black.
       Trimmed from 0.85 to 0.72 in the same pass that raised the key, because
       brightening alone only turned the disc up and left it flat: what makes a
       planet read as a photograph rather than a sticker is the RATIO between
       the lit hemisphere and the limb, not the absolute exposure. */
    const fill = new THREE.DirectionalLight(0x6f9fe0, 0.72 * (spec.fillScale ?? 1));
    fill.position.set(-spec.radius * 4, -spec.radius, -spec.radius * 2);
    grp.add(fill);

    /* Touch of bounce from below — keeps the terminator readable.
       Both this and the fill are scaled per body (`bounceScale` / `fillScale`):
       around an airless body there is no atmosphere to scatter or bounce light
       back, so on the Moon the fill is the main thing lifting the shadowed limb
       off true black and flattening the disc. Cutting it is a lighting fix, not
       an exposure one. */
    const bounce = new THREE.DirectionalLight(0x3f6d9c, 0.30 * (spec.bounceScale ?? 1));
    bounce.position.set(0, -spec.radius * 4, spec.radius * 1.5);
    grp.add(bounce);

    grp.userData = {
      surface, clouds, atmo, limb, darkness, spec, radius: showcaseRadius, opacity: 1,
      /* Hand-driven rotation, kept separate from the idle spin so a drag does
         not have to fight (or reset) the automatic motion. */
      userRot: { x: 0, y: 0 },
      /* Angular momentum carried out of a drag, decaying on its own. */
      dragSpin: { x: 0, y: 0 },
    };
    this.root.add(grp);
    this.bodies[id] = grp;
    return grp;
  }

  build() {
    /* 1.75, and the reason is a measurement rather than taste. The first pass
       cut this from 1.65 to 1.45 to buy contrast, but a luminance analysis of
       the hero crop then came back with the disc at median 74 and MAX 109 out of
       255 — dim and matte, which is precisely the complaint ("the Earth is hard
       to see"). Contrast is now bought in the ALBEDO and in the cloud deck,
       where it costs no brightness, so the ambient sits above where it started.

       VERIFIED, and the answer was NOT what that paragraph assumed. Three
       lighting configurations were measured on the rendered hero — body key
       4.4 / 5.6 / 6.4 against ambient 1.65 / 1.45 / 1.75 — and all three came
       back median 74, max 109. The hero renderer runs ACESFilmicToneMapping at
       exposure 1.28, and ACES compresses hard, so once the planet is on the
       shoulder, more light buys nothing. Treat the ambient and key values in
       this file as approximately cosmetic for the showcase body; the control
       that actually moves the planet's brightness is its ALBEDO (see the ocean
       and land ladders in planetTextures.js). Kept here anyway, because they do
       shape the terminator and the other bodies (Moon, Mars) which are darker. */
    this.root.add(new THREE.AmbientLight(0x46618c, 1.75));
    /* A controlled key/fill pair makes the foreground planet readable against
       the starfield on both desktop and mobile, without flattening the texture. */
    const key = new THREE.DirectionalLight(0xfff1d2, 3.4);
    key.position.set(6, 5, 8);
    this.root.add(key);
    const fill = new THREE.DirectionalLight(0x73b8ff, 0.8);
    fill.position.set(-5, 1, 4);
    this.root.add(fill);

    for (const g of GRAVITIES) this._createBody(g.id);

    /* Orbital guide rings */
    this.paths = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const r = 3.1 + i * 1.35;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.014, 220),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(i % 2 ? PAL.blue : PAL.cyan),
          transparent: true, opacity: 0.09, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      );
      ring.rotation.set(-Math.PI / 2 + 0.12 * i, 0, 0.34 * i);
      this.paths.add(ring);
    }
    this.root.add(this.paths);

    this.setActive('EARTH', true);
  }

  setActive(id, instant = false) {
    if (!this.bodies[id]) id = 'EARTH';
    this.activeId = id;
    for (const [k, b] of Object.entries(this.bodies)) {
      const on = k === id;
      if (on) b.visible = true;
      b.userData.opacity = instant ? (on ? 1 : 0) : (b.userData.opacity ?? (on ? 1 : 0));
      if (instant && !on) b.visible = false;
    }
    /* Prebuilt planets crossfade quickly; no texture generation happens on a
       click. The previous 2.6 damp factor made Moon/Mars appear to lag for a
       full second, which felt like a stuck interaction. */
    this.transitionSpeed = instant ? 20 : 10.5;
    const g = GRAVITIES.find((x) => x.id === id) || GRAVITIES[0];
    this.floatAmount = g.float;
    this.otolithLoad = g.otolith;
  }

  /**
   * Rotate the active body by hand: pointer travel in pixels from a drag.
   * The impulse is kept as angular momentum (dragSpin) and decays slowly, so
   * releasing a drag leaves the planet turning — which is what a body does
   * when nothing is there to stop it. Idle spin is paused for a moment after
   * a drag so the hand-off does not fight the user.
   */
  drag(dx, dy) {
    const b = this.bodies[this.activeId];
    if (!b) return;
    const ur = b.userData.userRot;
    ur.y += dx * 0.0062;
    ur.x = clamp(ur.x + dy * 0.0048, -1.35, 1.35);
    b.userData.dragSpin.y = clamp(dx * 0.0042, -1.4, 1.4);
    b.userData.dragSpin.x = clamp(dy * 0.0032, -1.1, 1.1);
    this.userSpinUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 2600;
  }

  /**
   * Is the pointer over the active body's disc? Used to decide whether a drag
   * turns the planet or the astronaut. Generous margin (1.4x) because the
   * target is small and hit-testing should not feel fussy.
   */
  hitTest(ndcX, ndcY, camera) {
    const b = this.bodies[this.activeId];
    if (!b || !b.visible || !b.userData.opacity) return false;
    b.getWorldPosition(_hitPos);
    const proj = _hitPos.clone().project(camera);
    const depth = _hitPos.distanceTo(camera.position);
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const rY = (b.userData.radius / Math.max(0.001, depth)) / tanV;
    const dx = (ndcX - proj.x) * camera.aspect;
    const dy = ndcY - proj.y;
    return dx * dx + dy * dy <= (rY * 1.4) * (rY * 1.4);
  }

  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const q = state.reducedMotion || this.reduced ? 0 : 1;

    for (const [k, b] of Object.entries(this.bodies)) {
      const on = k === this.activeId;
      const target = on ? 1 : 0;
      b.userData.opacity = damp(b.userData.opacity ?? target, target, this.transitionSpeed, dt);
      b.visible = b.userData.opacity > 0.012;
      if (!b.visible) continue;

      const spec = b.userData.spec;
      const o = b.userData.opacity;

      /* ── Rotation ──────────────────────────────────────────
         Three contributions that add rather than replace each other:
           idle spin    — a body in vacuum keeps turning; there is no gravity
                          and nothing to slow it down, so this is the baseline.
                          It pauses briefly while the pointer owns the body and
                          resumes on its own.
           hand rotation— the drag offset (userRot), which the pointer owns.
           momentum     — the impulse carried out of the last drag (dragSpin),
                          decaying like angular momentum instead of snapping.
         Only the surface and cloud deck turn. The group is left alone on
         purpose: it carries the body's lights, and rotating it would swing the
         sun with the planet, which is the one thing a body in space cannot do.
         The axial tilt is re-applied every frame (rotation.z is now owned by
         this block), with a very slow wobble so the body reads as floating free
         rather than mounted on an axis. */
      const ur = b.userData.userRot;
      const ds = b.userData.dragSpin;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const idle = now > (this.userSpinUntil || 0) ? 1 : 0;
      const phase = k.length * 0.7;

      /* dragSpin is an angular RATE (rad/s), so it must be integrated with dt.
         Without it the impulse was applied once per frame regardless of frame
         length, which made a drag turn the body several times too far — and
         made the result depend on frame rate rather than on the hand. */
      ur.y += ds.y * dt * q;
      ur.x = clamp(ur.x + ds.x * dt * q, -1.35, 1.35);
      ds.y *= Math.pow(0.30, dt);
      ds.x *= Math.pow(0.30, dt);

      b.userData.spinY = (b.userData.spinY ?? 0) + dt * spec.spin * q * idle;
      const tumbleX = Math.sin(t * 0.073 + phase) * 0.055 * q;
      const tumbleZ = Math.cos(t * 0.061 + phase) * 0.04 * q;
      b.userData.surface.rotation.y = b.userData.spinY + ur.y;
      b.userData.surface.rotation.x = ur.x + tumbleX;
      b.userData.surface.rotation.z = spec.tilt + tumbleZ;
      if (b.userData.clouds) {
        /* Deck drifts a little faster than the ground, as it always has. */
        b.userData.clouds.rotation.y = b.userData.spinY * 1.35 + ur.y;
        b.userData.clouds.rotation.x = ur.x + tumbleX * 1.25;
        b.userData.clouds.rotation.z = spec.tilt * 0.6 + tumbleZ;
      }

      /* Slow orbital drift, so the bodies visibly travel rather than only
         spinning in place. The amplitude is deliberately small: this section's
         framing aims at the fixed SOLAR_POS, not at the body, so a wide
         revolution would walk the planet straight out of frame. At 0.46 units
         on a 5.8-unit framing distance it is unmistakable motion that never
         leaves the composition. */
      b.position.x = Math.sin(t * 0.055 + phase) * 0.46 * q;
      b.position.z = Math.cos(t * 0.055 + phase) * 0.24 * q;
      b.position.y = Math.sin(t * 0.24 + k.length) * 0.13 * q;

      /* Scale in with the same fast crossfade so the new planet feels like a
         deliberate animated mode transition rather than a delayed pop. */
      b.scale.setScalar(0.96 + o * 0.04);
      /* fresnelMaterial exposes uIntensity / uTime — there is no uOpacity.
         Guarded so a future uniform rename can never kill the render loop. */
      const au = b.userData.atmo.material.uniforms;
      const lu = b.userData.limb.material.uniforms;
      const limI = b.userData.spec.limbIntensity ?? 0.62;
      if (au.uIntensity) au.uIntensity.value = o * clamp(spec.atmoIntensity, 0, 1);
      if (au.uTime) au.uTime.value = t;
      /* Per body: the Moon has no atmosphere, so it gets almost no rim glow —
         a bright rim on an airless body is the fastest way to make it read as a
         glowing ball rather than a lit rock. */
      if (lu.uIntensity) lu.uIntensity.value = o * limI;
      if (lu.uTime) lu.uTime.value = t;
      const dk = b.userData.darkness && b.userData.darkness.material.uniforms;
      if (dk && dk.uStrength) dk.uStrength.value = o * (spec.limbDarkening ?? 0);

      /* Night side: the city-light layer brightens as the body fades in, and is
         driven by the body's own nightGlow factor (0 for airless bodies). */
      if (b.userData.surface.material.emissiveIntensity !== undefined) {
        b.userData.surface.material.emissiveIntensity = 0.10 + o * (spec.nightGlow ?? 0.25);
      }
    }

    this.paths.rotation.y += dt * 0.01 * q;
    this.paths.children.forEach((p, i) => {
      p.material.opacity = 0.045 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.35 + i * 1.1));
    });

  }

  dispose() { disposeTree(this.root); }
}
