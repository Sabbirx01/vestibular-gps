# Science model

What the site claims, what it models, and where the boundary sits.

Read this alongside [`SOURCES.md`](SOURCES.md), which carries the citations.

---

## 1. The peripheral system

**Three semicircular canals** per ear, sitting at roughly right angles to one
another, so the three together resolve rotation in all three planes. Rotation
of the head moves fluid in the canal; the fluid deflects a gelatinous sail (the
**cupula**); hair cells beneath it bend; the bending becomes a nerve signal.

**Two otolith organs** per ear — the **utricle** and the **saccule** — respond
to linear acceleration and to the direction of gravity itself, because each
contains a membrane loaded with dense calcium-carbonate crystals
(**otoconia**). Tilt the head and gravity pulls the membrane sideways.

The functional division is the classic one and it is what the site visualises:

```
SEMICIRCULAR CANALS  →  angular acceleration  →  rotation
OTOLITH ORGANS       →  linear acceleration   →  translation + tilt
```

## 2. The central pathway

Signals leave via the **vestibular nerve** and reach the **vestibular nuclei**
in the brainstem. From there the information is distributed rather than merely
relayed:

- to the **cerebellum**, which calibrates the reflex over time
- to the **oculomotor nuclei**, which is what produces the vestibulo-ocular reflex
- up through the **thalamus** to cortical networks, producing the sense of orientation
- down the spinal cord, producing postural adjustments

**Confidence levels differ along that chain and the site says so.** Brainstem
relay and the three-neuron VOR arc are well established. Cerebellar
contributions to long-term calibration are well supported. The cortical
vestibular map is an area of active research, and the brain section labels it as
such rather than drawing it with the same certainty as the reflex arc.

## 3. The vestibulo-ocular reflex

Head turns left; the eyes rotate right by the same amount; the world stays
still. The loop is short enough to be effectively reflexive:

```
head rotates → canal detects → brainstem → eye muscles → gaze held
```

**Gain** is the ratio of eye velocity to head velocity. Near 1.0 the retina is
stable. Below 1.0 the image slips.

The VOR panel models this as a first-order high-pass system. At exactly gain 1.0
the eye counter-rotation perfectly cancels the head movement and both gaze error
and retinal slip sit pinned at zero — which looks like a dead instrument. The
demo therefore defaults to **0.82**, which shows the reflex working while
leaving a visible residual, and the gain is a live control.

## 4. What changes in microgravity

The vestibular system is a gravity instrument. Remove the constant reference and
the inputs stop agreeing with each other:

- otolith organs no longer report "down", so tilt and translation become ambiguous
- canal signals are unchanged, but the brain has been using gravity to interpret them
- the result is sensory conflict: motion sickness, spatial disorientation

When gravity returns, the system must re-adapt. **This is the part that matters
operationally and it is where NASA records its largest numbers** — the risk of
impairment is greatest during and soon after a G-transition, precisely when
manual landing, immediate egress and early EVA happen.

## 5. Recovery, and why the simulation is calibrated

| Domain | Time constant | Basis |
|---|---|---|
| Eye–head coordination | ≈ 19 h | head-erect postural recovery |
| Postural control | ≈ 111 h | head-moving postural recovery |
| Task performance | ≈ 15 days | Functional Mobility Test to 95% |
| Motion symptoms | ≈ 48 h | utricular (cVEMP) reversal window |
| Head movement | ≈ 111 h | as postural control |
| Baseline drift | ≈ 30 days | slow component across a long mission |

These constants drive `syntheticTrajectory()` in `src/core/osi.js`. That is what
allows the generated data to be described as **calibrated** rather than
invented — and it is stated that way in the UI.

**Note the scale.** Recovery is measured in hours to weeks. A fifteen-minute
recheck cannot show physiological recovery. The console therefore splits its
rechecks accordingly: an immediate task-readiness recheck is valid, a
physiological recovery claim is not.

## 6. The OSI metric

**OSI = Orientation Stability Index.** Proposed prototype metric.

Six domains, each carrying a weight, each mapped to a node in NASA's published
Sensorimotor Risk DAG:

| Domain | Weight | Unit | Direction |
|---|---|---|---|
| Eye–head coordination | 0.25 | deg | lower is worse |
| Postural control | 0.25 | mm | higher is worse |
| Task performance | 0.20 | ms | higher is worse |
| Motion symptoms | 0.15 | /10 | higher is worse |
| Head movement | 0.10 | deg/s | higher is worse |
| Baseline drift | 0.05 | per day | higher is worse |

```
z_d   = signed deviation / max(MAD_d, SD_d, floor_d)
s_d   = 100 · exp(−|z_d| / 4.48)
OSI   = Σ w_d · s_d  /  Σ w_d        (over available domains only)
```

**The floor matters.** If every baseline session is identical, MAD and SD are
both zero. Without a floor the z-score is undefined, the domain drops out, and —
absurdly — the *more stable* a crew member is, the *less* measurable they
become. Each domain therefore declares the smallest meaningful change in its own
units, and that becomes the scale when the baseline has no spread.

**Why it is self-referenced.** Population reference ranges are close to
meaningless here: microgravity shifts almost every baseline. The only defensible
comparison is a person against their own pre-flight history, which is what this
does.

## 7. Uncertainty, and the noise floor

Two things stop the numbers overclaiming:

- **A bootstrap 95% interval** over the baseline window. With few sessions it is
  wide, and the interface says so instead of hiding it.
- **MDC95 = 1.96·√2·SEM.** A change smaller than this cannot be distinguished
  from session-to-session variation. The recheck verdict refuses to call a
  3-point move an improvement, and prints the reason.

A wide interval is not a defect to be tuned away; it is the honest answer from a
short baseline. It narrows as sessions accumulate, and the confidence tier
tracks that.

## 8. Boundary of the claim

The site does **not** claim:

- that OSI is a NASA metric, a clinical instrument, or a validated score
- that its weights are scientifically established — they are declared heuristics
- that a camera measures gaze, or that it can compute VOR gain
- that any output is a diagnosis, a screening result or medical advice
- any affiliation with, approval by, or endorsement from NASA or any agency

The site **does** claim: that every domain maps to a documented NASA framework,
that every time constant comes from a published measurement, that the
uncertainty is computed rather than asserted, and that generated data is labelled
as generated everywhere it appears.
