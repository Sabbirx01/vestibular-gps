# Video release handoff — 2026-10-07

## Current master

The current working master is stored outside this Git repository, in:

```text
F:\Nasa Project\Video v2\New edite\New folder\VESTIBULAR-GPS-FINAL-WITH-EVIDENCE.mp4
```

Do not add the large MP4 to this repository unless the submission workflow explicitly requires Git-hosted media. Keep the export in the video-production folder and attach it separately to the submission package.

| Property | Verified value |
|---|---:|
| Container | MP4 |
| Picture | 1920 × 1080, 30 fps, H.264 |
| Audio | AAC, 44.1 kHz, stereo, 192 kbps |
| Total duration | 238.707 s (3:58.707) |
| "After six months" marker | 58.710 s |
| From that marker to end | 179.997 s (3:00 target; 3 ms mux/timestamp tolerance) |
| Evidence insert | 10.763 s, inside the last-part timeline |
| Evidence source | `F:\Nasa Project\Video v2\Edited.mp4`, source-card Research footage, 4K source scaled to 1080p |
| Evidence insert audio | `F:\Nasa Project\Video v2\New edite\New folder\EVIDENCE-INSERT-VO-10s76.wav` |
| Black-frame check | No sustained black frame detected at `d=0.4`, `pix_th=0.02` |
| Audio level | −17.80 LUFS, −1.60 dBTP |

## Edit decisions

- The first hook and team brief remain untouched.
- The new insert begins at a frame-safe quiet point around `188.633 s` in the assembled film, after the existing source-verification narration.
- The insert shows the NASA/NIH source-card Research footage from `Edited.mp4`; it is not a fabricated scientific figure.
- The insert narration is synthetic `en-US-AriaNeural` speech. If the team replaces it with the ElevenLabs voice, preserve the slot length at **10.763 s** and recheck the final mux.
- No silence block was appended to fill three minutes. The added slot is filled by narration and video.
- The edited film is a project presentation asset, not the application's scientific data source. Site claims remain governed by `docs/SOURCES.md`, `docs/SCIENCE.md`, `docs/HRP-RISK-MAPPING.md`, and `NOTICE`.

## Submission and caption warning

The repository's `captions/VGPS-FILM-3MIN-EN.srt` and `.vtt` describe an older 176.000-second film. They are **stale for this 238.707-second master** and must not be submitted with it. Rebuild captions from the final audio/picture before submission; do not hand-edit the old track or rename it.

The 3-minute statement applies only to the segment beginning at the spoken line **"After six months in microgravity"**, not to the full film. The full current master is just under four minutes.

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

1. Verify the final export with `ffprobe`.
2. Confirm the first minute is unchanged.
3. Confirm the spoken marker starts at `58.710 s`.
4. Confirm the last-part duration is 180 seconds within the mux tolerance.
5. Rebuild captions against the exact final export.
6. Preserve `LICENSE`, `NOTICE`, AI disclosure, and source/licence records with the submission package.
