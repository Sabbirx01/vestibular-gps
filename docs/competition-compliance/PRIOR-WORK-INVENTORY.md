# Prior-work inventory and provenance declaration

**Status:** factual inventory, prepared 2026-10-01.
**Decision needed:** Bangladesh local lead / official Space Apps organizer must
confirm what is eligible for submission.

## Evidence observed

The Git repository `https://github.com/Sabbirx01/vestibular-gps` has an existing
`main` branch and remote. Its first visible commits are dated **2026-09-28** and
subsequent commits through **2026-10-01** include interactive 3D experience,
Bengali route, camera/console work, planetary surface maps, interaction, NASA risk
traceability, captions, and submission documentation.

Examples from the local Git log:

| Date | Commit / evidence | Category |
|---|---|---|
| 2026-09-28 | `d0df9ed` and related initial commits | interactive site implementation |
| 2026-09-29 | `fa225bd`, `ea5b49f` | Bengali route and camera/console work |
| 2026-09-30 | `54edda2`, `96e9f49`, `79227bd` | Earth/Moon/Mars assets and interaction |
| 2026-10-01 | `80ca154` | NASA HRP risk traceability |
| 2026-10-01 | uncommitted `src/ui/console.js` | source-status banner and immediate symptom recomputation |

This evidence predates the published 14–15 November 2026 event date. It must be
treated as pre-event work, not event-time work.

## Existing materials inventory

| Material | Location | Pre-event status | Submission-safe description |
|---|---|---|---|
| Browser prototype | `src/`, `index.html`, `assets/` | already implemented | learning/reference prototype; not an event-built claim |
| NASA/NIH research registry | `docs/SOURCES.md`, `src/science/content.js` | already curated | research notes; cite original sources again in a fresh build |
| OSI metric engine/tests | `src/core/osi.js`, `tests/` | already implemented | proposed, unvalidated prototype logic; never a NASA metric |
| Camera head-motion estimator | `src/sensors/webcam.js` | already implemented | local camera proxy; no clinical calibration, no gaze/VOR measurement |
| AI/video materials | `F:\Nasa Project\video-project\` | planned/generated before event | pre-event production materials; disclose tool/rights and seek ruling before reuse |
| Research/plan folders | `F:\Nasa Project\reports\`, `source-materials\` | pre-event notes | learning/research only unless organizer permits use |

## Required disclosure to the organizer

Send the local lead a concise, truthful note with these facts:

> We have an existing public educational prototype, VESTIBULAR GPS, with Git
> commits and related media/research dated 28 September–1 October 2026. We want to
> participate in the 14–15 November event without misrepresenting prior work. May
> we submit any part of it? If not, should we build a new solution from scratch
> during the event, and may we use only the topic-level learning/research?

Save the written response (email, official message, or organizer-approved channel)
with date, sender, and exact ruling in the team's private compliance folder. Do
not rely on an oral answer alone.

## Current repository findings that must be repaired or clarified

| Finding | Evidence | Required action before any submission |
|---|---|---|
| Stale licence statement | `LICENSE` and `NOTICE` say Apache-2.0; old `NEXT-ACCOUNT-HANDOVER.md` says proprietary | Treat Apache-2.0 as the actual licence; remove/correct the stale proprietary assertion in a future authorized maintenance change |
| Stale test count | `README.md` says 93 passed; `docs/TESTING.md` heading says 87 | Rerun tests during event and report the actual count; reconcile docs rather than choosing a convenient number |
| AI disclosure incomplete | `docs/AI_USE.md` says coding-assistant and image/video generator names are open items | Fill exact tool names, versions when known, and what each produced |
| Media provenance must be checked | video-project has generated footage/audio planning | Verify final asset source, licence/terms, watermark policy, and disclosure before use |
| Team spelling mismatch noted | `README.md` says older files may differ | Use the exact name shown on the official team registration |

## What the team must not do

- Do not delete/rebase/filter Git history to make the project appear new.
- Do not copy this application, its generated video, or its pre-event commits into
  an event submission unless the organizer explicitly allows it.
- Do not call simulation output live astronaut data or call camera head motion VOR.
- Do not say the solution is NASA-approved, clinically validated, or “built in 48
  hours” when it was not.
