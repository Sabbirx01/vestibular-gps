# Final readiness — VESTIBULAR GPS / MindStaller

**Release review:** 2026-10-07 · **Public site:** https://sabbirx01.github.io/vestibular-gps/

**Video handoff:** the current external master and its evidence-insert timing are recorded in [`VIDEO-RELEASE-2026-10-07.md`](VIDEO-RELEASE-2026-10-07.md). The full film is 3:58.707; only the segment beginning at 58.710s ("After six months in microgravity") is 3:00. The repository's older 176s captions are stale for this export and must be regenerated before submission.

## Release status

| Area | Status | Evidence |
|---|---|---|
| Live application | ready | GitHub Pages critical-file check: all requested assets return HTTP 200 |
| Core metric | ready as a prototype | `node tests/osi.test.mjs`: 93 passed, 0 failed |
| Syntax / assets | ready | `tools/check-syntax.ps1`: 27 modules, 0 failures; both GLBs validate |
| Scientific framing | ready | NASA/NIH sources are mapped in `docs/SOURCES.md`; all model, simulation and limitation boundaries are stated |
| Open-source licence | ready | project Apache-2.0; third-party notices in `NOTICE` |
| Third-party decoder | ready | Google Draco decoder recorded as Apache-2.0 in `NOTICE` |
| AI/media disclosure | ready | `docs/AI_USE.md`: Accio AI, Google Flow/Veo, ElevenLabs and team-created ffmpeg music declared |
| Camera/eye feature | honest prototype | on-device landmark visualization only; no clinical gaze, vHIT or VOR gain claim |

## Judge-safe description

VESTIBULAR GPS is an offline-first, browser-based educational and monitoring
prototype. It demonstrates how available signals can be compared with a crew
member's own baseline, made transparent with uncertainty, and connected to a
recheck/countermeasure workflow. It is **not** a medical device, diagnosis,
validated clinical VOR/vHIT test, NASA metric, or NASA-endorsed product.

## Release rules

1. Keep `LICENSE` and `NOTICE` with every published copy.
2. Cite the original NASA/NIH source beside scientific claims; never cite an AI
   summary as the scientific authority.
3. Keep `SIMULATION`, `REPLAY`, `LIVE SENSOR`, and `UNAVAILABLE` labels visible.
4. Mark AI visuals `DRAMATIZATION` and declare synthetic narration.
5. Do not use NASA insignia/logotype or say NASA approved/official/endorsed.
6. Before the final upload, rerun the three checks below against the exact commit
   being submitted.

```powershell
node tests/osi.test.mjs
powershell -ExecutionPolicy Bypass -File tools/check-syntax.ps1
powershell -ExecutionPolicy Bypass -File tools/check-live.ps1
```

## Competition record

Registration, exact team roster, selected challenge and organizer decisions are
account/organizer records rather than repository facts. Keep their final
screenshots or messages with the submission archive. Existing-work provenance is
preserved in `docs/competition-compliance/PRIOR-WORK-INVENTORY.md`; do not alter
Git history or make an event-time claim that the record cannot support.
