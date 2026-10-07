# Video release handoff — 2026-10-07

## Current upload candidate — repair required

The latest requested upload candidate is stored outside this Git repository, in:

```text
F:\Nasa Project\Video v2\New edite\Final Uploadable.mp4
```

**Status: NOT READY TO UPLOAD.** The complete technical read is stored beside the video at [`F:\Nasa Project\Video v2\New edite\FINAL-UPLOADABLE-READ.md`](F:/Nasa%20Project/Video%20v2/New%20edite/FINAL-UPLOADABLE-READ.md). Do not add the large MP4 to this repository; keep the export in the video-production folder and attach it separately after repair.

| Property | Verified value |
|---|---:|
| Container | MP4 |
| Picture | 2560 × 1440, 30 fps, HEVC/H.265 |
| Audio | AAC, 44.1 kHz, stereo, ~197 kbps |
| Total duration | 229.274 s (3:49.274) |
| Video duration | 229.267 s |
| Black gap | **32.133–35.600 s (3.467 s)** |
| Black tail | **228.400–229.233 s (0.833 s)** |
| Input loudness | **−9.2 LUFS, +0.9 dBTP** |
| Caption status | Old tracked captions are for a 176 s film; stale for this file |
| Full read | `F:\Nasa Project\Video v2\New edite\FINAL-UPLOADABLE-READ.md` |

## Edit decisions

- The Mars hook and team-introduction sequence are present, but the first-minute black gap must be repaired before claiming the opening is upload-ready.
- The film includes the Vestibular GPS site walkthrough, NASA/NIH/NCBI evidence pages, limitations, unavailable-data warnings, hardware/measurement concept footage, and the MindStaller closing card.
- The NASA/NIH evidence visuals are screen/source material; they are not a NASA endorsement and do not turn the prototype into a clinical instrument.
- The complete visual and audio audit, including contact-sheet observations, is in `FINAL-UPLOADABLE-READ.md` beside the export.
- The edited film is a project presentation asset, not the application's scientific data source. Site claims remain governed by `docs/SOURCES.md`, `docs/SCIENCE.md`, `docs/HRP-RISK-MAPPING.md`, and `NOTICE`.
- This candidate must be repaired and re-read before captions or a final-upload label are applied.

## Submission and caption warning

The repository's `captions/VGPS-FILM-3MIN-EN.srt` and `.vtt` describe an older 176.000-second film. They are **stale for this 238.707-second master** and must not be submitted with it. Rebuild captions from the final audio/picture before submission; do not hand-edit the old track or rename it.

The previous 3-minute statement applied to an earlier assembled cut and must not be applied to this candidate without re-measuring. This file is 3:49.274 and its exact “After six months” segment timing is recorded in `FINAL-UPLOADABLE-READ.md` only after the repaired master is produced.

## AI/media disclosure

The current edit contains synthetic narration and AI-generated/dramatized footage already covered by `docs/AI_USE.md`. Keep the on-screen `DRAMATIZATION` label and the project's no-affiliation/no-endorsement disclaimer. The NASA/NIH source-card footage is evidence of the cited references and does not imply NASA endorsement.

## Reproduction notes

The build scripts and intermediate audio remain in the external video-production workspace:

```text
F:\Nasa Project\video-project\Full Website Video\build-evidence-video.py
F:\Nasa Project\video-project\Full Website Video\make-evidence-insert-vo.py
```

These scripts refer to local absolute paths and are not portable CI steps. Do not treat a successful local render as a substitute for web-app tests.

## Required checks before final upload

1. Repair the 3.467s black gap at `32.133–35.600 s`.
2. Remove or replace the 0.833s black tail at `228.400–229.233 s`.
3. Normalize/limit audio from `−9.2 LUFS / +0.9 dBTP` to the project target without cutting final words.
4. Verify the repaired export with `ffprobe`, `blackdetect`, and loudness measurement.
5. Confirm the first-minute narrative and the spoken “After six months” marker after repair.
6. Rebuild `.srt` and `.vtt` captions against the exact repaired export.
7. Update this handoff and `FINAL-UPLOADABLE-READ.md` with the repaired file’s measured values.
8. Preserve `LICENSE`, `NOTICE`, AI disclosure, and source/licence records with the submission package.
