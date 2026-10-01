# Hackathon-day rebuild plan

This is a plan for a **new, event-time build**, subject to the organizer's written
ruling on prior work. It is not a plan to disguise or replay the existing
repository as new work.

## Before the official start — permitted preparation only

- Confirm registration, team, challenge, event schedule, and the organizer's
  ruling on this project.
- Read rules, learn the domain, assign roles, and prepare a blank repository or
  organizer-approved workspace.
- Create a source bookmark list and this checklist. Do not pre-build the solution,
  copy the existing implementation, or pre-render a submission demo unless the
  local lead explicitly allows it.

## Event-time plan

| Time | Owner | Build evidence / output |
|---|---|---|
| Hour 0–2 | whole team | choose official challenge; write problem statement; make first dated event commit |
| Hour 2–5 | research + UX | source-backed user flow, claims/limitations, low-fidelity screens |
| Hour 5–12 | builder | smallest working prototype: one input, one understandable output, clear provenance |
| Hour 12–18 | builder + QA | graceful missing-data behaviour; label demo data; source/licence register |
| Hour 18–26 | UX + video | runnable demo, short narrated walkthrough, captions, screenshots |
| Hour 26–34 | research + QA | verify citations, test claims, fix confusing/unsafe language |
| Hour 34–40 | whole team | judge rehearsal: problem → demo → NASA relevance → limitations → next step |
| Final hours | submission owner | final release tag/commit, README, sources, licence, disclosures, submit |

## Minimal safe scope

Build only what can be demonstrated honestly:

1. A prototype that accepts one clearly labelled input source (manual demo data or
   browser sensor after permission).
2. A personal-baseline comparison with a plain-language uncertainty/limitation.
3. A recommendation to recheck/seek the appropriate mission protocol—never a
   medical diagnosis or clearance decision.
4. A source and licence panel with the NASA/NIH citations used.

Avoid unverified eye/VOR claims, synthetic “live” astronaut data, and unnecessary
3D or video polish until the core flow works.

## Evidence to retain during the event

- Timestamped Git commits in the new event repository.
- Notes of source access dates and licence checks.
- Test outputs, screenshots, and final demo recording.
- AI-use log: tool, purpose, human review, and final asset source.
- Organizer messages, especially the prior-work ruling.

## Rebuild acceptance gate

The team may call the event build ready only when a reviewer who did not write the
feature can answer: What is measured? What is simulated? Which NASA source supports
the problem? What is the limitation? Where is every third-party licence? If any
answer is unclear, reduce the claim or add the evidence before submission.
