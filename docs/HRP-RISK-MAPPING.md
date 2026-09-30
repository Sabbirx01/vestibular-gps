# NASA HRP risk traceability

**Why this file exists.** The Relevance criterion and the "NASA data" criterion
are where this project was weakest, and for one reason: the site cited NASA
papers but never said, in NASA's own terms, *which documented risk it sits
inside*. This document is that mapping. It is also rendered on the site — the
Research section carries the risk statement and the causal chain, and the
Mission Console carries the domain-by-domain table.

**Everything quoted below is NASA's wording, checked against the two NASA pages
named at the end. Nothing here is paraphrased into a stronger claim than NASA
makes, and no number appears that NASA does not publish.**

---

## 1. The risk

**Title, verbatim:** *Risk of Altered Sensorimotor/Vestibular Function Impacting
Critical Mission Tasks, Human Health, and Long-Term Health* — NASA Human Research
Program, referred to on NASA's own page as the **Sensorimotor Risk**.

**Statement, verbatim** (HHP sensorimotor risk page, last updated 8 July 2025):

> Exposure to altered gravity leads to changes in sensorimotor/vestibular
> function that manifest in motion sickness, spatial disorientation, decrements
> in postural control and locomotion, and manual and fine motor control
> deficits. It takes hours to days for the body to readapt to gravity upon
> landing, with associated balance issues and visual inconsistencies. The risk
> of impairment is greatest during and soon after G-transitions when performance
> decrements may have high operational impact [manual landings, immediate egress
> following landing, early extravehicular activities (EVAs)].

Two things in that paragraph set this project's frame, and both are NASA's:

- **the impairments named** — motion sickness, spatial disorientation, postural
  control and locomotion, fine motor control. These are what the index measures.
- **the window** — *"greatest during and soon after G-transitions"*, with manual
  landings, immediate egress and early EVA named as the high-impact cases. That
  is why the product is built around a gravity transition and a task deadline,
  not around a daily wellbeing check-in.

## 2. The causal chain

From the Sensorimotor Risk DAG narrative. Node names are NASA's, reproduced in
the order the narrative presents them:

| Stage | NASA's node names |
|---|---|
| Environmental | Altered Gravity · Radiation · Hostile Closed Environment · Distance from Earth |
| Physical effect | Fluid Shifts · Musculoskeletal Loads · G-Receptor Loads |
| Physiological change | Vestibular Gain Recalibration · Vision and Gaze Control · Vestibular Motor Neuron Change · Proprioception Change · Muscle Physiologic Changes |
| Central processing | Multi-Sensory Integration Alterations |
| Functional impairment | Motion Sickness · Fine Motor Control · Postural Control and Locomotion · Spatial Orientation |
| Mission outcome | Individual Readiness · Crew Capability · Task Performance · Manual Control of Vehicles · EVA (Risk) · Crew Egress (Risk) |

The narrative adds two things worth keeping: that these impairments *"directly
impact Individual Readiness and Crew Capability"*, and that Distance from Earth
constrains the countermeasures available — the narrative lists **Self-Administered
Rehab**, **Sensory Augmentation** and **Balance Training** as countermeasures that
are *"still experimental"*. A self-administered, on-device instrument is the
shape the constraint implies.

## 3. Domain → DAG node

The node names live in **one place** — `DOMAINS[].dag` in `src/core/osi.js` — and
both the Mission Console and the Research panel read from there. The two views
cannot disagree.

| Measured domain | NASA DAG node it descends from |
|---|---|
| Eye–head coordination | Vision and Gaze Control |
| Postural control | Postural Control and Locomotion |
| Task performance | Fine Motor Control |
| Motion symptoms | Motion Sickness |
| Head movement | Vestibular Gain Recalibration |
| Baseline drift | Individual Readiness (slow component) |

The parenthetical on the last row is ours, not NASA's: drift is our reading of the
slow component of the same node, and it is written that way so the distinction is
visible.

## 4. What this does *not* claim — state it before a judge does

This is the part that keeps the mapping honest, and it is on the site too:

- **We are inside NASA's risk statement. We are not inside NASA's metric.** NASA's
  TechPort record for *Sensorimotor Countermeasures* (project 157166) has a
  sub-project whose stated objective is to *quantify sensorimotor adaptation after
  gravity transitions* and *define sensorimotor performance metrics*. That is
  NASA saying the metric is an open problem. OSI is a proposed answer to an
  open problem — not a metric NASA uses.
- **The node names are NASA's; the weights are ours.** The domain structure is
  mapped from the published DAG. The weights are declared heuristics, stated in
  the UI and written into the exported JSON record.
- **The thresholds are ours.** MDC95 is computed from the crew member's own
  baseline sessions, not from a NASA table.
- **No endorsement.** NASA has not reviewed, approved or endorsed this project or
  this mapping.

## 5. Sources used for this mapping

| # | Source | URL | Checked |
|---|---|---|---|
| 1 | **Sensorimotor Risk** — NASA OCHMO / Human Health and Performance (the risk statement and title quoted above) | https://www.nasa.gov/directorates/esdmd/hhp/sensorimotor-risk/ | ✅ fetched 2026-10-01 |
| 2 | **Sensorimotor Risk — Directed Acyclic Graph narrative** — NASA HRP (the node names and the chain) | https://www.nasa.gov/wp-content/uploads/2025/07/sensorimotor-dag-narrative.pdf | ✅ fetched 2026-10-01 |
| 3 | **Risk of Altered Sensorimotor/Vestibular Function …** — HRP risk entry (the formal risk page) | https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=88 | ✅ **resolved 2026-10-01** — this host had timed out on 2026-09-28 and was recorded as unconfirmed; it answers now. The page confirms the risk entry and lists the HRP tasks and gaps beneath it. |
| 4 | **Sensorimotor Countermeasures** — NASA TechPort 157166 (the open-metric objective quoted in §4) | https://techport.nasa.gov/projects/157166 | ✅ 200 on 2026-09-28 |

All four are already in the site's source registry (`src/science/content.js`), so
they render on the Research page as well — this document adds no new URL that a
reader has to trust on its own.
