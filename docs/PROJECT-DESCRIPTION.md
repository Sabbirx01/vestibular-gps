# Project description — VESTIBULAR GPS

**কোথায় ব্যবহার করবেন:** Space Apps project page, Devpost-style submission form, jury deck, video description, social post — প্রতিটা জায়গার আলাদা length লাগে, তাই নিচে কয়েকটা রেডি করা ভার্সন আছে।

**নিয়ম:** এই লেখাগুলো repo-র `docs/SCIENCE.md`, `docs/HRP-RISK-MAPPING.md`, `docs/SOURCES.md`, `README.md` থেকে নেওয়া। কোনো জায়গায় OSI-কে "NASA metric", "validated", "clinical" বলা হয়নি — কারণ repo-র নিজের boundary statement সেটা নিষিদ্ধ করে।

---

## 0. Metadata block

| Field | Value |
|---|---|
| Project name | **VESTIBULAR GPS** |
| Tagline | *Navigate the space between motion, balance and the brain.* |
| Team | MindStaller |
| Challenge | **NASA Space Apps — "Create Health Monitoring Software for Astronauts on Space Missions"** |
| Category | Astronaut health monitoring · sensorimotor readiness |
| Product type | Offline-first, browser-based educational visualization and health-monitoring software prototype |
| Core product | Mission Console (`#sec-console`) driven by the OSI engine |
| Licence | Apache-2.0 (third-party assets under their own licences, see `NOTICE`) |
| Live site | https://sabbirx01.github.io/vestibular-gps/ |
| Repository | https://github.com/Sabbirx01/vestibular-gps |
| Languages | English + Bengali (`/bn/`) |
| Video | `Final Uploadable.mp4` — 3:49.274, 2560×1440, 30 fps |

---

## 1. One-liner

> VESTIBULAR GPS is an offline, browser-based vestibular readiness lab that helps astronaut crews see balance and orientation changes after gravity transitions.

*(19 words)*

## 2. Short description

> VESTIBULAR GPS turns the vestibular — balance — system into an interactive 3D laboratory, from the inner ear to the brain, and shows what changed after six months of microgravity. A browser-only Mission Console compares an astronaut against their own pre-flight baseline, explains its own uncertainty, and gives a recheck advisory. It runs with no server, no cloud and no API key, and it does not claim to be a medical device.

*(~70 words — project-page teaser, jury one-screen summary)*

## 3. Standard description — the recommended one

> **VESTIBULAR GPS — a neuro-vestibular readiness lab for astronauts.**
>
> When gravity returns after a long mission, the vestibular system has to re-adapt, and NASA records its largest sensorimotor impairment numbers during and soon after a gravity transition — exactly when manual landing, immediate egress and early EVA happen. VESTIBULAR GPS treats that recovery as a decision loop: gather what is measurable, compare it against the crew member's own baseline, state the uncertainty honestly, and recommend a recheck rather than a verdict.
>
> The site is a single-page laboratory. You walk from the sensory inputs, into the inner ear (canals, utricle, saccule, otoconia), through the brainstem/cerebellum/thalamus vestibular pathway, into the vestibulo-ocular reflex, then space, then six interactive lab tests, and finally the Mission Console. The Console computes **OSI — Orientation Stability Index**, a *proposed prototype* metric with six weighted domains, each mapped to a node in NASA's published Sensorimotor Risk DAG. Because microgravity shifts almost every population baseline, OSI is self-referenced: it compares a person to their own pre-flight history, carries a bootstrap 95% interval, and refuses to call a change real until it exceeds **MDC95 = 1.96·√2·SEM**.
>
> It is offline by design: no build step, no backend, no API key, no upload. Real NASA and NIH assets ship with it (NASA ACES suit model, an NIH 3D brain mesh, NASA Blue Marble / Moon / Mars surface maps), each credited and licensed. The OSI engine is pure, deterministic and separately tested — 93 assertions pass.
>
> **What it is not:** not a medical device, not a diagnostic system, not NASA's metric, and not affiliated with or endorsed by NASA. OSI is a transparent prototype, and the interface says so everywhere it appears.

*(~280 words — submission form, Devpost "About the project", jury handout)*

## 4. Video description (for the YouTube/Drive upload field)

> VESTIBULAR GPS opens on Mars: an astronaut stands up, and gravity disagrees with the body they were given. From there the film walks the actual product — the inner-ear model, the vestibular pathway into the brain, the vestibulo-ocular reflex, the microgravity transition timeline, six lab tests and the Mission Console that turns them into one readiness number with a stated uncertainty. It pauses on the evidence: NASA's sensorimotor risk framework and crew testing schedule, NIH anatomy and definitions, peer-reviewed pathway teaching, all named and linked on screen. It closes on what the prototype cannot do yet — no eye-tracking VOR gain, no clinical validation, no invented data — and on the line that governs the whole build: *mark what is unavailable, never invent the rest.*
>
> Runtime 3:49 · Built for the NASA Space Apps Challenge 2026 challenge, "Create Health Monitoring Software for Astronauts on Space Missions," by Team MindStaller.

## 5. Ultra-short versions

**For a slide title / thumbnail (≤12 words):**
> An offline readiness lab for astronaut balance and orientation.

**For a social post:**
> After six months in microgravity, gravity comes back in one second. VESTIBULAR GPS is an offline browser lab that turns that re-adaptation into a measurable, self-referenced readiness loop — and says plainly what it cannot measure. #SpaceApps #NASA #MindStaller

---

## 6. Language notes

- ভাষা: এই description-গুলো **ইংরেজিতে** — কারণ submission form, jury ও project page ইংরেজিতে।
- "proposed prototype metric", "not a medical device", "no NASA endorsement" — এই তিনটা phrase বাদ দেবেন না। repo-র `docs/SCIENCE.md` §8 এবং `README.md` §1 এগুলো বাধ্যতামূলক রেখেছে।
- OSI-এর ছয়টা domain এবং weight: eye–head coordination 0.25 · postural control 0.25 · task performance 0.20 · motion symptoms 0.15 · head movement 0.10 · baseline drift 0.05।
- ভিডিওর runtime লিখতে হবে **3:49.274** — "3 minutes" লিখবেন না। ৩ মিনিটের দাবিটা শুধু *"After six months in microgravity"* লাইন থেকে পরের অংশের জন্য প্রযোজ্য, পুরো ফিল্মের জন্য নয়।
- পুরোনো caption track (176s) এই ফিল্মের সঙ্গে মেলে না — video upload-এর সময় caption ব্যবহার করবেন না, নতুন করে বানাতে হবে।
