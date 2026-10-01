# Source and licence register

**Use:** copy the relevant rows into the eventual project page and final README.
Do not remove an attribution merely because an asset is public domain. Re-check
links and terms immediately before publishing.

## Project code and dependencies

| Item | Repository location | Licence/status | Required action |
|---|---|---|---|
| VESTIBULAR GPS original code/content | repository root | [Apache-2.0](../../LICENSE) | retain licence and NOTICE; confirm every contributor agrees |
| Three.js | `vendor/three.module.js` | MIT, per [NOTICE](../../NOTICE) | retain upstream licence/header |
| Draco decoder files | `vendor/draco/` | third-party component; verify exact upstream notice before redistributing separately | preserve bundled notices; do not invent a licence |

## Models and visual maps

| Asset | Local file | Source / terms recorded in repository | Attribution needed |
|---|---|---|---|
| Advanced Crew Escape Suit | `assets/models/nasa-aces-suit.glb` | NASA public-domain usage basis; [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media) | NASA source credit; no NASA endorsement claim |
| Detailed Human Brain Model, Johnson J | `assets/models/nih-brain.glb` | NIH 3D 3DPX-021161, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | credit creator, NIH 3D, and CC BY 4.0 |
| Blue Marble Earth | `assets/earth-blue-marble-1280.jpg` | NASA Visible Earth / MODIS-derived public-domain image | NASA/GSFC, Reto Stöckli, Robert Simmon, MODIS/USGS support teams as recorded in NOTICE |
| Moon colour/elevation maps | `assets/moon-lroc-color-2048.jpg`, `assets/moon-ldem-1024.jpg` | NASA SVS CGI Moon Kit; LROC WAC and LOLA, public domain | NASA SVS, Ernie Wright, Noah Petro (USRA), source teams |
| Mars Viking mosaic | `assets/mars-viking-mdim-2048.jpg` | NASA/JPL/USGS Astrogeology MDIM 2.1, public domain | NASA/JPL/USGS Astrogeology credit |

Authoritative in-repository record: [NOTICE](../../NOTICE) and
[docs/SOURCES.md](../SOURCES.md). If a local file is replaced, update both records
and verify the new asset's terms first.

## Scientific source register

The existing site has a 15-link registry in [docs/SOURCES.md](../SOURCES.md).
For a competition submission, use original sources rather than a secondary blog:

| Claim area | Primary/source-of-record citation |
|---|---|
| NASA sensorimotor risk | [NASA Sensorimotor Risk](https://www.nasa.gov/directorates/esdmd/hhp/sensorimotor-risk/) |
| Formal HRP risk entry | [Human Research Roadmap risk 88](https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=88) |
| Causal chain / DAG | [NASA HRP Sensorimotor DAG narrative (PDF)](https://www.nasa.gov/wp-content/uploads/2025/07/sensorimotor-dag-narrative.pdf) |
| Vestibular-health research | [NASA CIPHER — vestibular health](https://www.nasa.gov/reference/cipher/) |
| Balance background | [NIH/NIDCD: Balance Disorders](https://www.nidcd.nih.gov/health/balance-disorders) |

## AI and media disclosure register

| Category | Known status | Must be completed before use |
|---|---|---|
| Code/docs | AI assistants were used, according to `docs/AI_USE.md` | name the tool/model if known; describe team review |
| Video/stills | AI-generated/dramatization is documented | name generator, verify platform terms, add on-screen disclosure if used |
| Narration | synthetic speech is documented | state tool/voice terms; label synthetic narration |
| Music | current draft says made from scratch with ffmpeg | verify final music's rights; replace if not clearly licensed |
| Team photos | real photos with edited backgrounds documented | obtain team consent and keep originals/permission evidence |

## Final source check

- Run `powershell -File tools/check-sources.ps1` only as a link-health check; it
  does not prove legal permission or scientific validity.
- Open every final citation, record access date, and ensure each citation supports
  the exact sentence next to it.
- Keep a screenshot/PDF or quoted bibliographic metadata for sources that may move.
- In the project page, separate **NASA research used** from **NASA partnership or
  endorsement**. The latter must never be implied.
