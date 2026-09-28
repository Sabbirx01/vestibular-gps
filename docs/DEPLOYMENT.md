# Deployment

## The short version

The whole thing is static. Copy the folder to any static host.

```bash
cd "VESTIBULAR GPS Webpage"
python serve.py            # local: http://127.0.0.1:8322
```

Published site: **https://sabbirx01.github.io/vestibular-gps/**
Repository: https://github.com/Sabbirx01/vestibular-gps

---

## Why not just open index.html

You can — and everything except the 3D models will work. But `GLTFLoader`
fetches the two GLB assets over HTTP, and `file://` origins are blocked by CORS,
so the real NASA suit and NIH brain will not load and the page silently falls
back to its procedural figures.

**Run a server to see the real models.** `serve.py` is bundled.

## Why not `python -m http.server`

The stock module sends no cache headers, so Chrome applies heuristic caching to
the ES modules. After you edit a file, a normal reload can keep executing the
*previous* version, producing module errors that survive reloads and look like
code bugs — for example `does not provide an export named 'X'` for a function
you can see in the file.

`serve.py` sends `Cache-Control: no-store` for everything.

If you ever do see that error, hard-reload with **Ctrl+Shift+R**. The boot
guard in `index.html` detects the situation and says so on screen, because
otherwise the loading curtain would stay up with no explanation.

---

## Local

```bash
python serve.py                 # 127.0.0.1:8322
python serve.py 9000            # custom port
python serve.py 9000 0.0.0.0    # expose on the LAN, for phone testing
```

The server opens a browser window and prints the URLs. Stop with Ctrl+C.

`tools/start-server.ps1` clears a stale port and health-checks; it does not
launch the server itself (see the note in that file — a detached launch cannot
inherit the managed Python environment).

## Static hosts

Copy the folder. Nothing needs building.

```bash
# Netlify
npx netlify deploy --dir . --prod

# Vercel
npx vercel --prod

# GitHub Pages — already configured; push and it redeploys
git add -A && git commit -m "update" && git push
```

### GitHub Pages specifics

- `.nojekyll` is committed. Without it, Jekyll processing skips any path
  beginning with an underscore.
- Pages must be enabled on the `main` branch, root path.
- The first build takes 1–3 minutes. Check with:
  `gh api repos/<owner>/<repo>/pages/builds/latest`

---

## Headers

If your host lets you set headers, these are the ones that matter:

| Header | Value | Why |
|---|---|---|
| `Cache-Control` | `no-store` (during development) | prevents the stale-module trap |
| `Permissions-Policy` | `accelerometer=(self), gyroscope=(self), magnetometer=(self), geolocation=(self)` | sensor APIs are otherwise refused |
| `Content-Type` for `.wasm` | `application/wasm` | a wrong type silently disables the WebAssembly Draco decoder |
| `Content-Type` for `.glb` | `model/gltf-binary` | not strictly required by the loader, but correct |

GitHub Pages sets sensible defaults for all of these; the ones it does not set
are not needed there.

---

## HTTPS and sensors

**Sensor and camera APIs require a secure context** — `https://` or `localhost`.
Over plain `http://` on a LAN address the browser blocks them and the app
reports that directly rather than failing silently.

Consequences:

- `localhost` works for desktop testing of every feature.
- A deployed HTTPS site works on phones.
- `python serve.py 9000 0.0.0.0` serves fine over the LAN, but the sensors stay
  blocked until the origin is secure. Use a tunnel or deploy.

---

## Assets

Two real models ship inside the repository so the site works offline:

```
assets/models/nasa-aces-suit.glb    858 KB   NASA, public domain
assets/models/nih-brain.glb        13.2 MB   NIH 3D, CC-BY 4.0 — attribution required
```

To re-fetch them:

```bash
powershell -ExecutionPolicy Bypass -File tools/fetch-models.ps1
powershell -ExecutionPolicy Bypass -File tools/fetch-draco.ps1
```

`tools/fetch-models.ps1` records the URL and licence for each asset in its
comments. The NIH download endpoint returns an HTML landing page rather than the
file; the real object lives on NIH's S3 bucket and returns **403** to direct
requests. The working route is the NIH API output-file proxy, implemented in
`tools/find-nih-glb.ps1`. Do not guess a URL for that asset — use the script.

**The 13 MB brain mesh is the largest payload on the page.** On a slow
connection it is the thing that will be noticed first. Decimating it is the
obvious optimisation if deploy size matters more than detail.

---

## Pre-publish checklist

```bash
powershell -File tools/check-syntax.ps1      # modules parse, assets intact
powershell -File tools/run-tests.ps1         # 87 assertions
powershell -File tools/check-serving.ps1     # every file serves with the right MIME
powershell -File tools/check-live.ps1        # same, against the deployed URL
powershell -File tools/check-sources.ps1     # no dead citations
```

Then:

- [ ] hard-reload the deployed URL and confirm the console is clean
- [ ] confirm both real models appear (not the procedural fallbacks)
- [ ] confirm the OSI panel computes after three baseline captures
- [ ] confirm the NIH CC-BY attribution is visible on the Research page
- [ ] confirm no page claims affiliation with or endorsement by NASA

---

## Environment variables

**There are none.** No API keys, no analytics, no backend, no secrets. Nothing
is uploaded; every sensor read and every computation happens in the browser.

`.env.example` exists only to make that explicit — if you fork this and add a
service, put its key there and never in the client bundle.
