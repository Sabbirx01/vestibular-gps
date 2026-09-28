# VESTIBULAR GPS

**Navigate the space between motion, balance and the brain.**

An interactive 3D laboratory for the human vestibular system — from the semicircular canals to the brainstem, from the vestibulo-ocular reflex to what happens when gravity changes.

This is an **educational visualization**. It is not a medical device, it does not assess anyone's vestibular function, and it is not affiliated with or endorsed by NASA or any agency.

---

## Run it

### Option A — just open it (simplest)

Double-click `index.html`. Everything is self-contained: there are no external requests, no CDN, no fonts to download, no build step.

### Option B — the bundled server (recommended while editing)

```bash
python serve.py                 # http://127.0.0.1:8322
python serve.py 9000            # custom port
python serve.py 9000 0.0.0.0    # bind all interfaces — open it on your phone
```

**Why a custom server instead of `python -m http.server`:** the standard module sends no cache headers, so Chrome applies heuristic caching to the ES modules. After you edit a file, a normal reload can keep running the *previous* version, producing module errors that survive reloads and look like code bugs. `serve.py` sends `Cache-Control: no-store` for everything.

### If you see "MODULE LOAD FAILED"

That is almost always a stale cached module. Hard-reload with **Ctrl+Shift+R** (Cmd+Shift+R on macOS), or use `serve.py`.

---

## Using the site

| Section | What it shows |
|---|---|
| Intro | Cinematic entry sequence |
| 01 Space | Hero — the universe, the floating astronaut, live HUD |
| 02 Body | Three balance inputs, the measurement figure, sensory-weighting model |
| 03 Ear | Interactive inner ear: three canals, cupula, otolith organs, nerve |
| 04 Brain | Central pathways: nerve → nuclei → cerebellum → thalamus → cortex |
| 05 VOR | Vestibulo-ocular reflex with live head/eye velocity traces |
| 06 Sensors | Real device sensor link, simulator, charts, recorder |
| 07 Microgravity | Gravity environments, otolith model, adaptation timeline |
| 08 Lab | Six demonstrations, each with WHAT / WHY / HOW / SOURCE |
| 09 Research | Full source registry with verification status |
| 10 Final | Closing scene |

**Keyboard:** `Q` cycles the graphics quality tier. Everything else is reachable by mouse, touch, drag, wheel and Tab.

**Sensors:** each permission is requested separately, with a plain-language reason, and only after you press the button. All processing happens on this device. Nothing is uploaded. If you decline, the whole site still works — it runs on a generated signal instead, and every screen states which source is active.

---

## Honesty rules the site follows

1. Every number on screen is read from live application state. Nothing is a decorative moving value.
2. Three source labels are used, and only one can apply at a time: **LIVE SENSOR**, **SIMULATION**, **REPLAY**.
3. Generated data is labelled as simulation everywhere it appears.
4. Every scientific statement is traceable to an entry in `src/science/content.js` and listed on the Research page.
5. No diagnosis, no screening claim, no implied agency affiliation anywhere.
6. Anatomical models are procedurally generated illustrations — anatomically informed, not patient-derived imaging.

---

## Project layout

```
index.html            single page, all sections
serve.py              development server (no-store)
vendor/               three.js r169, vendored for offline use
src/
  styles/             tokens · base · components · sections
  core/               util.js · store.js  (state, quality, errors)
  sensors/            provider abstraction + hub
  science/            content, structures, timelines, source registry
  three/              materials · planetTextures · SpaceEnvironment
                      SolarSystem · Astronaut · InnerEar · BrainModel
                      SceneManager (background scene + MiniStage)
  ui/                 chrome (intro, cursor, nav, HUD, float field)
                      panels (body, sensors, space)
                      labs   (subject, ear, brain, VOR, lab, research)
  main.js             boot sequence and wiring
docs/                 ARCHITECTURE · SCIENCE · SOURCES · SENSOR_API
                      TESTING · DEPLOYMENT · MASTER-PROMPT-BN
```

Everything in `src/three/` is procedural. There are no image files, no GLB models, no font downloads, and no third-party licences to track beyond three.js itself.

---

## Graphics quality

Detected automatically at boot from GPU renderer string, WebGL version, core count, device memory, pixel ratio and screen size, then assigned to `ULTRA` / `HIGH` / `MEDIUM` / `LOW` / `MOBILE`. Press **Q** to cycle manually — the choice is saved. The frame loop automatically steps *down* if the average frame rate falls below 34 fps; it never steps back up on its own.

Append `?debug=1` to the URL for a live overlay with FPS, draw calls, triangle count, active objects and sensor rate. Or use the `DEBUG` button in the footer.

---

## Deployment

The whole thing is static. Copy the folder to any static host — GitHub Pages, Netlify, Vercel, an S3 bucket, a USB stick.

```bash
# Netlify
npx netlify deploy --dir . --prod

# GitHub Pages: push, then enable Pages on the branch root
```

**One thing to know:** browser sensor APIs require a **secure context**. Over `https://` or `localhost` they work. Over plain `http://` on a LAN address they are blocked — the site detects this and says so explicitly instead of failing silently.

---

## Licence notes

- Code in this repository: add your own licence before publishing.
- `vendor/three.module.js` is three.js (MIT). Keep its licence header.
- All planet, star, nebula, anatomy and UI imagery is generated at runtime in the browser. No third-party imagery is bundled or hotlinked.
