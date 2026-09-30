# Sources

Every scientific statement on the site is keyed to an entry in
`src/science/content.js` and rendered on the Research page. Where something is
a model or a simplification, the page says so; where it is documented practice
or published research, the citation is here.

Machine-readable copy: [`docs/_source-check.txt`](_source-check.txt), produced by
`tools/check-sources.ps1`.

## Verification status

All 15 registry URLs were re-checked on **2026-09-28**. **14 resolved with
HTTP 200.** One did not at that time — see the note under NASA below. That one
was re-checked on **2026-10-01** and **now resolves**, so all 15 are confirmed
live. Dead links in a submission damage credibility more than missing ones, so
this list is checked rather than assumed.

---

## NASA

| # | Source | URL | Status |
|---|---|---|---|
| 1 | **Risk of Altered Sensorimotor/Vestibular Function Impacting Critical Mission Tasks, Human Health, and Long-Term Health** — NASA Human Research Program | `https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=88` | ✅ **resolved 2026-10-01** |
| 2 | **Sensorimotor Risk** — NASA OCHMO / Human Health and Performance | https://www.nasa.gov/directorates/esdmd/hhp/sensorimotor-risk/ | ✅ 200 |
| 3 | **Sensorimotor Risk — Directed Acyclic Graph narrative** — NASA HRP | https://www.nasa.gov/wp-content/uploads/2025/07/sensorimotor-dag-narrative.pdf | ✅ 200 |
| 4 | **Sensorimotor Countermeasures** — NASA TechPort 157166, Mars Campaign Office | https://techport.nasa.gov/projects/157166 | ✅ 200 |
| 5 | **Neuro-Vestibular Examination During and Following Spaceflight (Vestibular Health)** — CIPHER, JSC/NSL | https://ntrs.nasa.gov/citations/20230014013 | ✅ 200 |
| 6 | **Comparison of Active and Passive Head Impulse Testing (vHIT)** — CIPHER Vestibular Health | https://ntrs.nasa.gov/citations/20230014322 | ✅ 200 |
| 7 | **Neuro-Vestibular Examination During and Following Spaceflight** — HRP Investigators' Workshop 2025 | https://ntrs.nasa.gov/api/citations/20250000348/downloads/IWS25%20Neuro-Vestibular.pdf | ✅ 200 |
| 8 | **Evaluation of Motion Sickness Countermeasures (Inscop)** — HRP IWS 2025 | https://ntrs.nasa.gov/api/citations/20250000739/downloads/NSL_IWS25_Widhalm_Inscop_Poster.pdf | ✅ 200 |
| 9 | **Sensorimotor Countermeasures — technical report** — NTRS | https://ntrs.nasa.gov/citations/20240008210 | ✅ 200 |
| 10 | **About CIPHER** — NASA HRP | https://www.nasa.gov/reference/about-cipher/ | ✅ 200 |

> **On source 1.** The Human Research Roadmap risk page is the formal risk
> entry, and it is the source for the risk statement and the Design Reference
> Mission ratings. On **2026-09-28** it did not respond at all — a connection
> timeout, not a 403 or a 404 — and it was recorded here as unconfirmed rather
> than quietly dropped. Re-checked on **2026-10-01**, it resolves and serves
> the risk entry with its tasks and gaps. **All 15 sources are now confirmed
> live.** The failure was the host being intermittent, not the link being
> wrong.
>
> The site's own UI reads the risk statement from source 2 rather than source 1,
> because source 2 states the same risk verbatim and is on a host that has been
> reliable. See [`HRP-RISK-MAPPING.md`](HRP-RISK-MAPPING.md) for the mapping that
> uses both.

## Human vestibular science

| # | Source | URL | Status |
|---|---|---|---|
| 11 | **Balance Disorders** — NIH / NIDCD | https://www.nidcd.nih.gov/health/balance-disorders | ✅ 200 |
| 12 | **Vestibular System** (glossary) — NIH / NIDCD | https://www.nidcd.nih.gov/glossary/vestibular-system | ✅ 200 |
| 13 | **Neuroanatomy, Vestibular Pathways** — StatPearls / NCBI Bookshelf | https://www.ncbi.nlm.nih.gov/books/NBK557380/ | ✅ 200 |

## 3D assets

| # | Asset | Licence | Status |
|---|---|---|---|
| 14 | **Advanced Crew Escape Suit** — NASA 3D Resources | Public domain. The repository states its assets are "free and without copyright". Usage follows the [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media). | ✅ 200 |
| 15 | **Detailed Human Brain Model** — NIH 3D, entry 3DPX-021161, model by Johnson J | **CC-BY 4.0** — https://creativecommons.org/licenses/by/4.0/ | ✅ 200 |

> **Attribution for 15 is a legal obligation, not a courtesy.** It is rendered
> on the Research page directly from the registry (`licence` and `attribution`
> fields), so it cannot silently disappear from the UI. If you reuse this model
> elsewhere, carry the attribution with it.

---

## The numbers the simulation is calibrated to

The synthetic trajectory is not invented. Each domain relaxes with a time
constant taken from NASA's Sensorimotor Evidence Report, and the reference
values are published figures:

| Quantity | Value |
|---|---|
| Postural recovery, head erect | ≈ 19 h |
| Postural recovery, head moving | ≈ 111 h |
| Quiet stance (20 s) post-landing | majority of crew unable |
| Functional Mobility Test | +48% course time, 15 days to 95% recovery |
| Ocular counter-rolling vs flight duration | 11 studies, r² = 0.69 |
| cVEMP asymmetry | reverses at 2–3 days, pre-flight by ~1 week |
| T-38 touchdown force SD | 2,648 → 4,205 lbs |
| Driving simulation, % time in wrong lane | p = 0.00003 at R+0 |

These are also shown in the Mission Console's traceability table, so a reader
can see the provenance of the curves rather than being asked to trust them.

---

## What is *not* sourced, and is labelled as such

Honesty about the boundary matters more than the length of the list.

| Item | Status |
|---|---|
| **OSI — Orientation Stability Index** | A **proposed prototype metric**. Not a NASA metric, not clinical. Its *domain structure* is mapped from NASA's published DAG; its *weights* are expert-informed heuristics, openly declared, and are not NASA's numbers. |
| **The 6-domain weight set** | Heuristic. Stated in the UI and in the JSON record. Open to recalibration against NASA's open datasets. |
| **The sub-score curve constant (K = 4.48)** | A design choice, documented in `osi.js`, chosen so that one SD ≈ 80 and two SD ≈ 64. |
| **All visualisations labelled "illustration" or "conceptual"** | Simplifications, labelled in the UI at the point of display. |
| **Nothing at all** | No diagnosis, no screening claim, no clinical advice, no agency affiliation or endorsement. |

---

## Provenance of the model assets in this repository

Both GLBs are committed to the repository so the site works offline. They were
fetched by `tools/fetch-models.ps1`, which records the source URL for each.

The NIH 3D download endpoint returns an HTML landing page rather than the file;
the real asset URL lives on NIH's S3 media bucket and is not publicly readable
(HTTP 403). The working route is the NIH API output-file proxy, documented in
`tools/find-nih-glb.ps1`. If you need to re-fetch, use that script rather than
guessing a URL.
