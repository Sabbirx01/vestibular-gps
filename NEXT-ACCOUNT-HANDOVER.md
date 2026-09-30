# VESTIBULAR GPS — NEXT ACCOUNT HANDOVER

**Purpose:** এই ফাইলটি এমনভাবে লেখা যে নতুন account/agent শুধু এটি পড়ে আগের কাজ না হারিয়ে বাকি কাজ শুরু করতে পারে। প্রথমে এই ফাইল পড়বে, তারপর `README.md` ও প্রয়োজনীয় `docs/` পড়বে। পুরোনো root-level `F:\Nasa Project\HANDOVER-README.md`-এর কিছু Git baseline পুরোনো; এই ফাইলের বর্তমান Git state-টাই অনুসরণ করবে।

---

## 1. Project identity

- **Project:** VESTIBULAR GPS — NASA Space Apps 2026 educational/interactive prototype
- **Repository:** `https://github.com/Sabbirx01/vestibular-gps`
- **Live site:** `https://sabbirx01.github.io/vestibular-gps/`
- **Local repository:** `F:\Nasa Project\VESTIBULAR GPS Webpage\`
- **Run locally:**

```powershell
cd "F:\Nasa Project\VESTIBULAR GPS Webpage"
python serve.py
# open http://127.0.0.1:8322/
```

- **Tests:**

```powershell
node tests/osi.test.mjs
Get-Content tests/osi.test.result.txt
```

Expected result: **93 passed / 0 failed**.

The site is a zero-build native ES-module app. Do not add npm/bundler/CDN requirements unless there is a clear reason and the user explicitly asks for it.

---

## 2. Exact current Git state

The last pushed commit before the current Earth upgrade is:

```text
ce3e0a4 fix(earth,cursor,licence): stop the Earth blowing out, make the exhaust read as smoke, add a proprietary licence
```

**Update — 30 September 2026.** The staged Earth work listed below has since been verified, committed and pushed as `54edda2` (`feat(earth): use a locally bundled NASA Blue Marble surface map`). The live page and the live asset both return HTTP 200. Full evidence: `reports/fix-reports/EARTH-BLUE-MARBLE-VERIFICATION-2026-09-30-BN.md`.

At handover creation the branch was `main`, `origin/main` was synchronized with the local HEAD, and the working tree held **intentional uncommitted Earth-upgrade work**:

```text
 M LICENSE
 M src/three/SolarSystem.js
 M src/three/planetTextures.js
 M tests/osi.test.result.txt
?? assets/earth-blue-marble-1280.jpg
?? NEXT-ACCOUNT-HANDOVER.md
```

The Earth upgrade is now **live**: verified, committed as `54edda2`, pushed, and the live asset checked. Do not re-stage it.

The local QA server may be running in a background process, but the environment may stop it after roughly 15 minutes. If `127.0.0.1:8322` refuses the connection, start `python serve.py` again. The GitHub Pages site does not depend on the local server.

---

## 3. What has already been completed and pushed

### Space planet placement

- Moon/Earth/Mars/Microgravity are anchored in screen space in `src/three/SceneManager.js`.
- Wide layout: planet appears in the empty column to the right of the heading and above the glass panel.
- Narrow layout: below 1280px, `#sec-space` reserves a band above the heading and the planet is anchored there.
- The fix covers desktop, laptop, tablet and phone layouts.

### Floating planet name chips

- The floating 3D labels `EARTH`, `MOON`, `MARS`, and `FREE FLOAT` were removed from `src/three/SolarSystem.js`.
- The topbar mode chip `● EARTH` / `● MARS` was also removed from `index.html` and its dead hooks were removed from `main.js` and `src/ui/chrome.js`.
- The Space gravity row still switches all four environments and updates the readout/toast.

### HUD overlap

- At widths `<= 1875px`, the fixed right HUD is hidden so it cannot cover hero cards.
- At 1920px it remains visible and has measured clearance.

### Cursor exhaust plume

- `src/ui/chrome.js` contains the current plume work:
  - 18 segments rather than the old long row of small puffs.
  - Large tail ramp, per-segment jitter and generated 64x64 noise alpha stamp.
  - CSS mask with per-segment crop/position.
  - Long-axis stretch to cover the sampled movement gap.
  - Perpendicular, time-varying drift and lift so the smoke billows rather than following a ruler-straight line.
  - Parked cursor fades the plume to zero opacity.
- Current browser QA reported no console errors. If the new account changes this code, re-run a focused frontmost-tab mouse sweep; background/minimized browser tabs throttle `requestAnimationFrame` and produce false plume measurements.

### Licence

- `LICENSE` is proprietary/all-rights-reserved for the project’s own code, written content, visual design and architecture.
- Three.js in `vendor/three.module.js` retains its own MIT licence.
- The NASA-derived Earth image added in the current uncommitted work is public-domain/external and must not be claimed by the proprietary project licence. Keep its attribution explicit.
- A public GitHub repository cannot technically stop copying. The licence records the legal terms; making the repository private would be the technical access restriction, but that may conflict with public GitHub Pages or competition requirements.

---

## 4. Current unfinished task: make Earth genuinely realistic

The user’s exact intent is not merely “make Earth brighter.” They want it to look like a real Earth in space, similar to the supplied references: recognizable geography, blue oceans, green/brown land, cloud structure, a natural dark terminator, and an attractive blue atmospheric rim.

### Why the old Earth was insufficient

`src/three/planetTextures.js` generated Earth entirely from procedural noise. That can make plausible blobs but cannot make recognizable North America, South America, Africa, Europe or Asia. Increasing light/albedo made the disc brighter but also created a white/grey CGI ball. The user repeatedly reported a white layer and an unrealistic look.

### Current Earth upgrade already staged but not yet pushed

A NASA Blue Marble / MODIS-derived equirectangular surface map was downloaded locally:

```text
assets/earth-blue-marble-1280.jpg
```

Its source record is NASA Visible Earth image 57730 / Blue Marble. The local 1280px derivative came from the Wikimedia Commons file `Land shallow topo 2048.jpg`, credited to NASA/GSFC and the MODIS/USGS teams. Source links:

- NASA record: https://visibleearth.nasa.gov/images/57730/the-blue-marble-land-surface-ocean-color-and-sea-ice
- NASA Blue Marble collection: https://www.visibleearth.nasa.gov/collection/1484/blue-marble
- Wikimedia file page/source: https://sr.wikipedia.org/sr-el/%D0%94%D0%B0%D1%82%D0%BE%D1%82%D0%B5%D0%BA%D0%B0:Land_shallow_topo_2048.jpg

Current implementation in `src/three/SolarSystem.js`:

- Builds the procedural texture first as an offline fallback.
- Uses `THREE.TextureLoader()` to load `assets/earth-blue-marble-1280.jpg` locally.
- Replaces the Earth/Microgravity material map when the local image finishes decoding.
- Does not hotlink NASA/Wikimedia at runtime.
- Keeps the Earth texture’s sRGB color space and mipmap filtering.

Current implementation in `src/three/planetTextures.js`:

- Earth and Microgravity procedural cloud opacity was reduced to `0.22` because the photographic Blue Marble base already contains surface color and the procedural deck should only be a restrained weather veil.

### Required next steps for the Earth upgrade

1. Start the local server and open the site in a fresh browser tab.
2. Wait for the Earth asset to load; inspect the browser Network/console and confirm:
   - `assets/earth-blue-marble-1280.jpg` returns HTTP 200;
   - no `TextureLoader` or WebGL error appears;
   - the Earth map visibly shows recognizable continents and oceans.
3. Verify at minimum:
   - 1920x1080 Space/Earth;
   - 1440x900 Space/Earth;
   - 390x844 or another phone width;
   - Earth → Moon → Mars clicks still work.
4. Look for these visual faults:
   - the map is rotated/seamed incorrectly;
   - the Earth is too flat because the map is too bright;
   - the cloud deck creates another white sheet;
   - the atmosphere is a uniform neon ring instead of a sun-facing rim;
   - the night side is not naturally darker;
   - the map appears inside-out or upside down;
   - the local asset loads after the screenshot and the fallback is mistaken for the final result.
5. If the Earth is still not photographic enough, do **not** immediately increase light intensity. The renderer uses ACESFilmicToneMapping and exposure `1.28`; more light tends to compress highlights instead of revealing detail. Prefer, in this order:
   - tune the Blue Marble map color/roughness;
   - add a separate cloud mask or a second cloud texture with low opacity;
   - tune the key/fill ratio and atmosphere shell;
   - only then adjust albedo/exposure.
6. If the asset map is acceptable, run the test suite, review `git diff`, commit the Earth asset + code + attribution + this handover file, push `main`, and verify the live Pages URL.

Recommended commit message after verification:

```text
feat(earth): use a locally bundled NASA Blue Marble surface map
```

Do not claim “same to same” or “NASA official rendering.” The correct wording is: **NASA Blue Marble-derived public-domain surface map with a custom Three.js atmosphere, lighting and cloud treatment.**

---

## 5. Moon and Mars — next phase after Earth

Moon and Mars are still procedural in `src/three/planetTextures.js`:

- Moon: procedural maria, craters and ray systems.
- Mars: procedural red/orange terrain, dust variation and polar caps.

**BLOCKER — fix this before touching the Moon/Mars textures.** Clicking MOON changes the UI and both `state.mode` and `solar.activeId` become `MOON`, but the rendered disc stays the Blue Marble Earth. Verified live through the app's own debug surface (`window.VESTIBULAR_GPS` → `scene().solar`): all four bodies are built, but MOON and MARS sit roughly inside the EARTH sphere (centre separation ≈ 0.32 world units against an EARTH showcase radius of 0.924; the MOON's full extent is 0.71), the EARTH mesh is never hidden, and the sub-surface materials read `transparent: false, opacity: 1`, so the `userData.opacity` blend weight has no rendering effect. MARS is only partially visible for the same reason. Fix the body swap first — otherwise an improved lunar map can never be seen.

The user said Earth comes first, then Moon and Mars should also be improved. After the body swap is fixed:

1. Find suitable public-domain or clearly licensed local lunar and Mars surface maps.
2. Prefer NASA/USGS/ESA source records with explicit reuse status.
3. Bundle local assets under `assets/`; do not hotlink external images in the runtime.
4. Keep third-party attribution separate from the proprietary project licence.
5. Add the same non-blocking local-texture fallback pattern, or make the asset loading strategy consistent for all bodies.
6. Verify each button at desktop and mobile sizes before pushing.

The user’s visual target is attractive and realistic, but the app must remain a simulation/educational visualization. Do not present the planets as measurements or as a NASA endorsement.

---

## 6. Safe verification commands

```powershell
cd "F:\Nasa Project\VESTIBULAR GPS Webpage"

# Check current state first
git status --short
git log --oneline -6
git rev-list --left-right --count origin/main...main

# Start local server if needed
python serve.py

# Tests
node tests/osi.test.mjs
Get-Content tests/osi.test.result.txt

# Syntax checks for changed modules
Copy-Item src\three\SolarSystem.js "$env:TEMP\SolarSystem-check.mjs" -Force
Copy-Item src\three\planetTextures.js "$env:TEMP\planetTextures-check.mjs" -Force
node --check "$env:TEMP\SolarSystem-check.mjs"
node --check "$env:TEMP\planetTextures-check.mjs"

# Review before committing
git diff --stat
git diff -- LICENSE src/three/SolarSystem.js src/three/planetTextures.js

# Only after browser verification
git add LICENSE README.md NEXT-ACCOUNT-HANDOVER.md assets/earth-blue-marble-1280.jpg src/three/SolarSystem.js src/three/planetTextures.js tests/osi.test.result.txt
git commit -m "feat(earth): use a locally bundled NASA Blue Marble surface map"
git push origin main
```

Do not run `git add .` blindly: local QA folders and scratch files must stay out of the commit.

After push, verify both:

```text
https://sabbirx01.github.io/vestibular-gps/
https://sabbirx01.github.io/vestibular-gps/assets/earth-blue-marble-1280.jpg
```

GitHub Pages may take a short time to update. Do not report “live” until the pushed source and the live asset/page have been checked.

---

## 7. Non-negotiable project rules

- Keep tests at **93 passed / 0 failed**.
- No fabricated sensor values, medical claims, NASA endorsement, or clinical validation.
- Values that cannot be measured stay `UNAVAILABLE`, not zero.
- Do not rename or move files referenced by docs, deployment or language sync.
- Do not edit `bn/index.html` directly; it is generated from the main page.
- Do not hotlink textures or silently import copyrighted reference images.
- Keep NASA/Three.js/other third-party attribution separate from the proprietary project notice.
- Before any visual claim, capture at least one real browser screenshot at the relevant viewport.
- If a browser tab is backgrounded/minimized, treat pointer/rAF plume measurements as invalid and repeat with the tab frontmost.
- The user asked for Earth first. Do not spend time polishing Moon/Mars until the Earth map has been visibly verified and accepted.

---

## 8. Short instruction to the next agent

```text
Take over VESTIBULAR GPS. Read NEXT-ACCOUNT-HANDOVER.md first.

The current pushed baseline is 54edda2 (Earth Blue Marble, verified and live).

Your first job is the body swap, not new textures. Clicking MOON changes the UI and
state.mode but the rendered body stays Earth: all four bodies are built but MOON and
MARS sit inside the EARTH sphere's volume and the Earth mesh is never hidden, so the
Moon can never show. Fix that, verify it visually at desktop and mobile, keep the
93/0 tests green, and only then improve Moon and Mars with properly licensed local
texture maps. Report exactly what was verified.
```
