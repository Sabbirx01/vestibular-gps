# Subtitles — English

The subtitle tracks for the VESTIBULAR GPS pitch videos. The text is the
**narration verbatim** — no line is shortened, reworded or tidied.

**English subtitles are a hard requirement of Video 1**, so the file that
matters right now is the first one.

| File | Which video | Length | Cues |
|---|---|---|---|
| `VGPS-FILM-3MIN-EN.srt` / `.vtt` | **the finished film — `VESTIBULAR-GPS-3MIN-FINAL.mp4`** | 176.000 s | 30 |
| `VGPS-PITCH-4MIN-EN.srt` / `.vtt` | the 240-second cut, **not shot yet** (Video 2) | 240 s | 39 |

## The finished film

`VESTIBULAR-GPS-3MIN-FINAL.mp4` — 1920 × 1080, 30 fps, 176.000 s. Its edit
decision list is `video-project/Full Website Video/film.json` (22 beats), and
its narration is `VO-FILM-3MIN.mp3`.

Which narration master is really inside that MP4 was **measured, not assumed**.
The picture differs between the candidate cuts, so the voice was used to
identify it: the 100 ms loudness envelope of the film's own audio was correlated
against every candidate master. `VO-FILM-3MIN.mp3` matched at **r = +1.000**;
the next best scored +0.097.

Each cue starts when its line starts on screen — the beat's own start time from
`film.json` — and ends when the line stops being spoken, read from that line's
own audio file. The narration fits its beats closely; the longest push needed
was 0.15 s, and the last cue ends at 173.738 s inside a 176 s film.

## Why these are real timings, not estimates

A word-count estimate had already been wrong once on this project, so no timing
here comes from arithmetic. Beat starts come from the edit decision list; each
line's length comes from its own audio file.

## Accessibility rule

`video-project/05-captions/ONSCREEN-TEXT.md` requires **no more than two lines
per cue, no more than 42 characters per line**. Every cue in every file passes
both. No cue overlaps another, none runs past its film, none starts with a dash,
and none leaves a one-word orphan line. Each file's text was diffed word by word
against its script and matches exactly.

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

Subtitles follow the finished picture. If the film is re-cut — and Video 1 may
be re-cut right up to the hackathon — these must be rebuilt from the new edit
decision list, not patched by hand.
