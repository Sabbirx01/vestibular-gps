# VESTIBULAR GPS — Project Description

Submission-ready text for the NASA Space Apps Challenge 2026. Each section is self-contained: copy the version that fits the field, nothing else is needed.

---

## Form fields

| Field | Value |
|---|---|
| Project title | **VESTIBULAR GPS** |
| Tagline | *Navigate the space between motion, balance and the brain.* |
| Team | MindStaller |
| Challenge | NASA Space Apps Challenge 2026 — "Create Health Monitoring Software for Astronauts on Space Missions" |
| Category | Astronaut health monitoring · sensorimotor readiness |
| Product type | Offline-first, browser-based health-monitoring software prototype and educational visualization |
| Licence | Apache-2.0 (third-party assets under their own licences — see `NOTICE`) |
| Project website | https://sabbirx01.github.io/vestibular-gps/ |
| Source code | https://github.com/Sabbirx01/vestibular-gps |
| Languages | English and Bengali (`/bn/`) |
| Demo video | `Final Uploadable.mp4` — 3:49.274, 2560 × 1440, 30 fps |

---

## 1. One-liner

VESTIBULAR GPS is an offline, browser-based vestibular readiness lab that helps astronaut crews see balance and orientation changes after gravity transitions.

---

## 2. Short description

VESTIBULAR GPS turns the vestibular — balance — system into an interactive 3D laboratory, from the inner ear to the brain, and shows what changed after six months of microgravity. A browser-only Mission Console compares an astronaut against their own pre-flight baseline, explains its own uncertainty, and gives a recheck advisory. It runs with no server, no cloud and no API key, and it does not claim to be a medical device.

---

## 3. Standard description (recommended)

**VESTIBULAR GPS — a neuro-vestibular readiness lab for astronauts.**

When gravity returns after a long mission, the vestibular system has to re-adapt, and NASA records its largest sensorimotor impairment numbers during and soon after a gravity transition — exactly when manual landing, immediate egress and early EVA happen. VESTIBULAR GPS treats that recovery as a decision loop: gather what is measurable, compare it against the crew member's own baseline, state the uncertainty honestly, and recommend a recheck rather than a verdict.

The site is a single-page laboratory. The visitor moves from the sensory inputs, into the inner ear (canals, utricle, saccule, otoconia), through the brainstem, cerebellum and thalamus vestibular pathway, into the vestibulo-ocular reflex, then into space, then through six interactive lab tests, and finally into the Mission Console. The Console computes **OSI — Orientation Stability Index**, a proposed prototype metric built from six weighted domains, each mapped to a node in NASA's published Sensorimotor Risk DAG. Because microgravity shifts almost every population baseline, OSI is self-referenced: it compares a person with their own pre-flight history, carries a bootstrap 95% interval, and refuses to call a change real until it exceeds **MDC95 = 1.96·√2·SEM**.

It is offline by design — no build step, no backend, no API key streaming, nothing uploaded. Real NASA and NIH assets ship inside the project: the NASA ACES suit model, an NIH 3D anatomical brain mesh, and NASA Blue Marble, Moon and Mars surface maps, each credited and licensed. The metric engine is pure, deterministic and separately tested; 93 assertions pass.

**What it is not:** it is not a medical device, not a diagnostic system, and not a NASA metric. OSI is a transparent prototype, its weights are declared heuristics rather than NASA's numbers, and the project has no affiliation with, approval by, or endorsement from NASA. The interface states this wherever the numbers appear.

---

## 4. Video description

VESTIBULAR GPS opens on Mars: an astronaut stands up, and gravity disagrees with the body they were given. From there the film walks the actual product — the inner-ear model, the vestibular pathway into the brain, the vestibulo-ocular reflex, the microgravity adaptation timeline, six lab tests, and the Mission Console that turns them into one readiness number with a stated uncertainty. It pauses on the evidence behind the model: NASA's sensorimotor risk framework and crew testing schedule, NIH anatomy and definitions, and peer-reviewed pathway teaching, all named and linked on screen. It closes on what the prototype cannot do yet — no eye-tracking VOR gain, no clinical validation, no invented data — and on the line that governs the whole build: mark what is unavailable, never invent the rest.

Runtime 3:49. Submitted to the NASA Space Apps Challenge 2026 challenge "Create Health Monitoring Software for Astronauts on Space Missions" by Team MindStaller.

---

## 5. Social post

After six months in microgravity, gravity comes back in one second. VESTIBULAR GPS is an offline browser lab that turns that re-adaptation into a measurable, self-referenced readiness loop — and says plainly what it cannot measure. #SpaceApps #NASA #MindStaller

---

## 6. Short project summary

VESTIBULAR GPS is a browser-based neuro-vestibular readiness laboratory built for long-duration spaceflight. It visualises the vestibular system from the inner ear to the cortex, models what microgravity changes, and converts six measurable domains into a single readiness index — compared against the astronaut's own pre-flight baseline, with its uncertainty computed rather than asserted. It runs entirely on the device, ships with real NASA and NIH assets, and is open source under Apache-2.0.
