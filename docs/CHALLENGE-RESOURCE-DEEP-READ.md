# Deep read: the 2026 challenge resource pack

**Read on 14 Nov 2026.** Seven pages opened and read end to end. Every quotation
below is the publisher's own wording, copied verbatim. Nothing is strengthened.

Challenge page:
<https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources>

---

## 1. Page by page — what is actually on each one

### 1.1 5 Hazards of Human Spaceflight
<https://www.nasa.gov/hrp/hazards/>

Names the five: **space radiation · isolation and confinement · distance from
Earth · gravity (and the lack of it) · closed or hostile environments.** Each
links to its own detail page. This is the frame judges will recognise.

> On Mars, astronauts would need to live and work in three-eighths of Earth's
> gravitational pull for up to two years.

### 1.2 Hazard: Gravity Fields — **the most important page for us**
<https://www.nasa.gov/hrp/hazard-gravity-fields/>

Three paragraphs do all the work:

> Astronauts will encounter three different gravity fields on a Mars mission. On
> the six-month trek between the planets, crews will be weightless. While living
> and working on Mars, crews will be in approximately one-third of Earth's
> gravity. Finally, upon returning home, crews will have to readapt to Earth's
> gravity.

> Switching from one gravity field to another is trickier than it sounds. The
> transition affects **spatial orientation, head-eye and hand-eye coordination,
> balance, and locomotion**, with some crew members experiencing **space motion
> sickness**.

> When shifting from weightlessness to gravity, astronauts may even experience
> lightheadedness and fainting.

That middle sentence is NASA naming five effects. We measure five things. The
product is not an analogy — it is a direct instrumentation of that sentence.

The page also states what we do **not** measure:

> weight-bearing bones lose on average 1% to 1.5% of mineral density per month

### 1.3 Hazard: Distance from Earth
<https://www.nasa.gov/hrp/hazard-distance-from-earth/>

Establishes the communication gap and the loss of ground support. Paired with
CSA's line (below), this is the justification for the Crew Authority Matrix.

### 1.4 Hazard: Isolation and Confinement
<https://www.nasa.gov/hrp/hazard-isolation-and-confinement/>

Behavioural responses in isolated groups over long periods. Relevant to the
symptom domain as a *cause*, not as something we measure.

### 1.5 Hazard: Space Radiation
<https://www.nasa.gov/hrp/hazard-space-radiation/>

Dose, biological damage, shielding. Nothing vestibular. Our site must say so
plainly rather than implying coverage.

### 1.6 Hazard: Hostile/Closed Environments
<https://www.nasa.gov/hrp/hazard-hostile-closed-environments/>

Habitat ecosystem — temperature, pressure, lighting, noise, microbial
communities, immune response:

> Stress hormone levels can elevate and the immune system can alter, which could
> lead to increased susceptibility to allergies or other illnesses.

Also not vestibular. Declare it as out of scope.

### 1.7 Ongoing HRP Research in Space
<https://www.nasa.gov/hrp/ongoing-hrp-research/>

Current investigations: **ARCHeR** (Artemis II well-being, activity, sleep),
**Immune Biomarkers**, and **Artemis II Standard Measures** —

> Crews supplied a consistent set of health information to a data bank so that
> future researchers can learn more about astronaut health.

"Standard Measures" is the institutional precedent for what we built: a
consistent, comparable set of measurements per crew member. Use it to justify the
fixed six-domain battery rather than an open-ended questionnaire.

### 1.8 Risk of Altered Sensorimotor and Vestibular Function
<https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/>

> Altered gravity and shifts between different types of gravity may trigger
> motion sickness and affect astronauts' ability to orient themselves. Those
> issues are particularly concerning because ill crew members may have trouble
> with mission tasks, vehicle controls, or leaving the spacecraft to perform
> spacewalks.

> The sickness you experience traveling in cars, boats, and planes on Earth does
> not predict how motion sick you may get during space travel. **The majority of
> astronauts experience motion sickness during spaceflight.**

The first half of that second quote is the single best argument for a
**self-referenced** baseline that exists in the public literature: if past
terrestrial experience does not predict in-flight response, a population norm is
useless. Our whole design says exactly that.

### 1.9 CSA — Monitoring radiation for astronaut health
<https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp>

CANS neutron spectrometer, $5.5 M contract, neutron radiation ≈ 30% of ISS total.
Design pattern worth borrowing:

> the unique combined capabilities of working continuously and autonomously.

### 1.10 CSA — Why do we conduct science experiments in space?
<https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp>

Two lists we should quote:

> - increased delays in communication with Earth
> - less ability to rely on Earth for food, materials, and emergency medical assistance

> Their experiments have produced findings that can help people suffering from
> **balance problems, such as seniors**; osteoporosis; cardiovascular disorders;
> and Type-2 diabetes.

That second line is the Earth-benefit claim, in CSA's words, for our exact
measurement.

---

## 2. The mapping to put on the site

NASA's gravity-transition sentence, clause by clause:

| NASA's words (hazard-gravity-fields) | Our domain | Weight |
|---|---|---|
| space motion sickness | Symptoms | 0.15 |
| head-eye / hand-eye coordination | Eye–head coordination | 0.25 |
| balance | Postural control | 0.25 |
| spatial orientation | Task performance | 0.20 |
| locomotion | Head movement (plus drift vs baseline) | 0.10 / 0.05 |

Per the risk page's other phrasing — "trouble with mission tasks, vehicle
controls, or leaving the spacecraft to perform spacewalks" — Task performance is
the domain that carries *operate a vehicle / EVA*, which is what makes the index
operationally relevant rather than clinical.

---

## 3. The frame that fixes the pitch

Three gravity fields, one instrument:

```
1 g  ──6 months──▶  0 g  ──▶  ~1/3 g (Mars)  ──▶  1 g (Earth)
        baseline            transition            re-adaptation
```

This is why the product is a **transition instrument**, not a daily wellness app.
Every design decision we already made — self-referenced baseline, MDC floor,
recheck, crew authority — follows from that timeline. Put the timeline on the
Research page; it explains the product faster than any paragraph.

**Discrepancy to handle carefully:** the hazards page says *three-eighths* of
Earth's gravity; the gravity-fields page says *approximately one-third*. Both are
NASA. Quote **"approximately one-third"** (the hazard page judges will open) and
never do arithmetic on it.

---

## 4. What to do — in priority order

### P0 — before submission (30–60 min of edits)

1. **Research section:** add the five-hazard frame and our position —
   *inside gravity; constrained by distance; the other three named and excluded.*
2. **Traceability header:** use the formal risk title verbatim —
   *Risk of altered sensorimotor/vestibular function impacting critical mission
   tasks, human health, and long-term health.*
3. **Add NASA's four impairments as a row above the domain table** — motion
   sickness · hand-eye coordination · gait coordination · operating a vehicle.
4. **"What this does not cover" block** — radiation, isolation and confinement,
   hostile/closed environments. One sentence each.
5. **SOURCES.md:** add the six official links as a "Challenge-provided resources"
   block, with read date.
6. **Baseline note:** add CSA's line that terrestrial motion-sickness history does
   not predict in-flight response, next to "self-referenced, not a population norm."

### P1 — after submission

7. Hazard-map graphic (5 tiles, ours lit, two referenced, two excluded).
8. Three-gravity timeline graphic on Research.
9. A short "Judge Q&A" page: the five questions below, with sourced answers.

---

## 5. Five questions a judge may ask, and the sourced answer

| Question | Answer |
|---|---|
| Which hazard are you addressing? | Gravity fields. Distance from Earth is a design constraint. The other three are named and explicitly out of scope. |
| Why not use a population norm? | NASA: terrestrial motion-sickness history "does not predict" in-flight response, and most astronauts experience it in flight. A norm would be wrong for the individual. |
| Is this clinically validated? | No. It is a readiness screen with an MDC floor, not a diagnosis. No vHIT claim from a webcam. |
| Where does the index come from? | Six domains mapped to NASA's named transition effects; weights declared; uncertainty bootstrapped; localisation shown. |
| Could this help people on Earth? | Yes — CSA names balance problems in seniors as an Earth benefit of the same research line. |

---

## 6. What not to do

- **No radiation feature.** It is a different hazard with a different instrument.
- **No "NASA-validated"** anywhere. NASA publishes the risk; we instrument it.
- **No mixing 1/3 and 3/8.** Pick the quoted phrase and keep it.
- **No new statistic** that is not on one of these seven pages.
- **No claiming the majority-failure framing.** NASA says most astronauts get
  motion sick in flight — a statement about symptoms, not about our score.
