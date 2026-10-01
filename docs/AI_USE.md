# Use of AI — disclosure

**VESTIBULAR GPS** · team MindStaller · NASA Space Apps Challenge 2026
Challenge: *Create Health Monitoring Software for Astronauts on Space Missions*

This file exists to answer the mandatory **"Use of AI"** field on the project
page, and to be the reference if a judge asks a follow-up question. It states
where AI was used, where it was deliberately not used, and how the AI-made parts
are labelled on screen. Everything below is traceable to a file in this
repository.

**Status: verified against the repository on 2026-09-30. Two items are still
open — see §5.** Do not submit this as complete until those two are filled in.

---

## 1. The short answer (paste this into the "Use of AI" field)

> We used AI, and we say exactly where. AI assistants helped us write and
> document the software, and AI tools generated the cinematic footage in our
> pitch video and its synthetic narration. We did not use AI to produce a single
> scientific number, source, or claim: every figure on the site is a published
> value from NASA, the NIH or peer-reviewed literature, each one cited on the
> page; our automated checks and the source links were run and re-checked by us.
> Every AI-generated shot carries an on-screen `DRAMATIZATION` tag, the
> AI-generated city-lights layer on the Earth is labelled in `NOTICE` as
> generated rather than measured, and the narration is declared synthetic. Our
> metric, OSI, is stated openly as a prototype — not a NASA metric.

---

## 2. Item by item

| What | Where it lives | AI-made? | How it is labelled |
|---|---|---|---|
| Application code, 3D scene, scientific content model | `src/`, `index.html`, `vendor/` | **Yes** — built with **Accio AI**, directed and reviewed by the team. `docs/MASTER-PROMPT-BN.md` is the build brief that was handed to the assistant. | Declared here. Third-party library licence in `NOTICE`. |
| Documentation (`docs/*.md`, `README.md`) | `docs/` | **Yes**, same arrangement | Declared here |
| Automated test suite and its results | `tests/` | **Yes**, code; **no**, results — the tests were executed | `tests/osi.test.result.txt` |
| Night-side city lights on the Earth in the 3D hero | `src/three/SolarSystem.js` (`buildNightLights`) | **Yes** — synthesised from the land/ocean colours of the bundled Blue Marble map | `NOTICE` → *"GENERATED, NOT MEASURED … a visual model, not a city-lights dataset, and must not be described as measured or observed lighting."* |
| Cinematic reference stills `R01`–`R18` | `video-project/02-references/` | **Yes** | `02-references/INDEX.md`: *"সব 16:9 · 2K · AI-generated (DRAMATIZATION)"*; the `DRAMATIZATION` tag is carried into the video |
| Generated video shots | `video-project/veo/` | **Yes** — generated in **Google Labs / Google Flow** using the Veo 3.1 Frames-to-Video workflow documented in this project; the team also reports using **Gemini Flash** in the video workflow. | `veo/README.md`, `clips/PROMPTS-VEO3-ULTRA.md`; `DRAMATIZATION` on every such frame |
| Voice-over | `video-project/04-audio-vo/vo/VO-01…16.wav` | **Yes — fully synthetic speech generated with ElevenLabs.** All 16 lines, including the "we are six students from Bangladesh" lines | Declared here; `04-audio-vo/samples/README.md`: *"these are good neural voices, but they are still synthetic"* |
| Music bed | `video-project/04-audio-vo/samples/BED-ONLY.mp3` (14 s draft) | **No AI model.** Synthesised from scratch with ffmpeg, so there is nothing to license and nothing to credit | `04-audio-vo/samples/README.md` §3, `veo/ASSETS-AND-EDIT.md` §7 |
| Motion graphics (the OSI diagram, "what's next") | `video-project/06-generated-clips/` | **No** — built in the editor from our own data | screen text |
| Team portraits | `video-project/03-team-placeholders/processed/` | **Photographs are real; faces untouched.** Backgrounds were normalised, a photographer's watermark and store lettering were removed | `03-team-placeholders/README.md` §1 — faces, skin, hair, teeth, clothing and pose were deliberately not retouched, and earlier AI-generated placeholder faces were deleted |
| Third-party 3D models and maps | `assets/` | **No** — someone else's published assets, unmodified in substance | `NOTICE`, with the licence for each |
| Local eye-landmark engine | `vendor/mediapipe/`, `assets/models/face_landmarker.task` | **No** — third-party Apache-2.0 runtime/model, run locally in the browser | `NOTICE`, `docs/SOURCES.md`; it provides experimental face-relative gaze offset only, never clinical VOR/vHIT |
| Scientific figures and the source registry | `docs/SOURCES.md`, `src/science/content.js` | **No.** Values are published results; the registry URLs were opened and re-checked by hand on 2026-09-28 | `docs/SOURCES.md`, `docs/_source-check.txt` |

The one thing we want to be unambiguous about: **the narration is synthetic
speech, all 16 lines.** The project's own `VO-DECISION-AND-LINES.md` recommends
recording the three team lines in the team's own voices for authenticity, and
that has not been done yet. If a judge hears a machine voice on the line about
six students from Bangladesh, they should find it declared here rather than
discover it themselves.

---

## 3. What AI was not allowed to decide

These are rules we held to, and they are the reason several numbers on the site
are *missing* rather than filled in:

- **No invented sources, no invented numbers.** Every scientific value is a
  published figure with a URL. `docs/SOURCES.md` ends with a table of what is
  *not* sourced, and says so on the page.
- **OSI is declared as a prototype.** It is a proposed prototype metric, not a
  NASA metric and not clinical. Its domain structure is mapped from NASA's
  published sensorimotor DAG; its weights are expert-informed heuristics, openly
  declared. See the *What is not sourced* table in `docs/SOURCES.md`.
- **A gap is reported, not zeroed.** When the camera cannot see eye landmarks,
  the value is `UNAVAILABLE` and the uncertainty is widened — *"missing ≠ zero"*.
- **The communication delay is always "up to" 22 minutes.** Dropping "up to"
  would turn a true claim into a false one, so the script and the narration keep
  it every time it appears.
- **No medical claims.** No diagnosis, no screening claim, no clinical advice,
  no agency affiliation or endorsement — stated in `NOTICE` and on the site.
- **Ill-posed questions were left open.** Where a decision was ours rather than
  NASA's (for example the two over-running voice-over lines), it is recorded as
  a decision, not disguised as a finding.

---

## 4. Verification trail

| Claim | Evidence |
|---|---|
| The engine's automated checks pass | `tests/osi.test.result.txt` — `2026-09-30T16:02:49.650Z`, `passed : 93`, `failed : 0`, `ALL TESTS PASSED` |
| Sources are live, not assumed | `docs/SOURCES.md` — the registry was re-checked on **2026-10-01**; all 15 source URLs are recorded as resolved. The earlier 2026-09-28 timeout for source 1 remains documented there as a historical availability issue. |
| The licence is real and OSI-compatible | `LICENSE` — full Apache-2.0 text; `NOTICE` — attribution record |
| Attribution cannot silently disappear | The NIH brain model's CC-BY attribution is rendered on the Research page *from the registry*, so it cannot be dropped from the UI (`docs/SOURCES.md`) |
| Third-party licences | Three.js `r169`, MIT, vendored unmodified (`vendor/three.module.js`; `NOTICE`) · NASA ACES suit, public domain · NIH 3D `3DPX-021161` by Johnson J, **CC-BY 4.0** · NASA Blue Marble, LROC WAC/LOLA, Viking MDIM 2.1, all public domain · the city-lights layer is ours and generated |

---

## 5. Open items — do not submit until these are closed

1. **Record exact AI account evidence.** The team reports using Accio AI for code,
   Google Labs / Google Flow (Veo 3.1 workflow and Gemini Flash) for video, and
   ElevenLabs for synthetic voice. Before submission, save a screenshot or export
   of the relevant generation history/receipt, plus plan/version where shown. Do
   not guess a model version that the account does not display.
2. **Identify the generator for reference stills `R01`–`R18`.** The video workflow
   is now named, but the original still generator is not conclusively identified
   by the repository. Record its product/model if those stills appear in the final
   video; otherwise omit the stills from the final asset list.

Two more things worth deciding before you submit, because a judge may ask:

- Whether the three team lines in the video will be re-recorded in real voices
  (the plan recommends it; it changes §2 of this file if you do).
- Whether the music bed is final and licensed — the current planning document
  requires a licensed or royalty-free track, and that must not be an AI-generated
  track unless it is declared here too.

---

*Last verified against the repository: 2026-09-30, git `fb45fdc`.*
