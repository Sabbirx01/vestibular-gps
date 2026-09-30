# Subtitles — English

The subtitle tracks for the VESTIBULAR GPS pitch video. The text is the
**voice-over script verbatim** — no line is shortened, reworded or tidied.

| File | What it is |
|---|---|
| `VGPS-PITCH-4MIN-EN.srt` | the full **240-second** film — 39 cues |
| `VGPS-PITCH-4MIN-EN.vtt` | the same track as WebVTT, for browser players |
| `VGPS-PITCH-30S-EN.srt` / `.vtt` | the **30-second** cut — **draft**, 5 cues |

## Why these are the real timings, not estimates

Each line is placed where the *recorded* voice-over actually begins. The
durations were read out of the finished audio files
(`video-project/04-audio-vo/vo/VO-01.wav … VO-16.wav`), not calculated from a
word count — a word-count estimate had already been wrong once on this project.

Speech totals **158.50 s of the 240 s**, leaving about 81 s for the visuals to
breathe.

Two lines are longer than their 15-second slot:

- **clip 09 — 16.82 s** (1.82 s over)
- **clip 15 — 19.63 s** (4.63 s over)

The plan already decided these lines run past the cut rather than losing words
(`video-project/veo/README.md` §5.3). The subtitles follow that: the next line
starts late instead of overlapping. Overlapping cues are invalid SRT and some
players drop them.

## Accessibility rule

`video-project/05-captions/ONSCREEN-TEXT.md` requires **no more than two lines
per cue, no more than 42 characters per line**. Every cue in these files passes
both, and no cue overlaps another, starts past 240 s, or leaves a one-word
orphan line.

## Regenerating

The pipeline lives outside this repository, in the project's `video-project`
folder:

```
video-project/05-captions/build-subtitles.py    # the generator
video-project/05-captions/SUBTITLE-NOTES.md     # timing table, decisions, caveats
```

Run `python build-subtitles.py` from that folder to rebuild all four files, then
copy them here. The generator prints a validation report; if its last line is not
`OK`, the files should not ship.

## One caveat, stated plainly

These are timed against the **picture plan** (16 clips × 15 s). The voice-over
files were not necessarily laid on the timeline at exactly the slot boundaries,
so once the edit is locked these must be re-checked against the finished cut —
subtitle timing follows the picture, and the audio follows the edit.

If the film is rebuilt on the newer 24 × 10 s clip grid, these files are
superseded and must be regenerated from the script.
