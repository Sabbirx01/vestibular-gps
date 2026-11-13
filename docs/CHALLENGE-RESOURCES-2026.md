# Challenge resources (opened 14 Nov 2026) — what we use, where, and what we don't

**Why this file exists.** The 2026 challenge page now publishes its own resource
list. Judges check Relevance against exactly that list, so every item needs a
stated position on our site: *used*, *referenced*, or *deliberately not modelled*.
Silence reads as "didn't read the brief".

Source of the list:
<https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources>

**Ground rule for this document:** every quotation below is NASA's or CSA's own
wording, copied from the page named beside it. We do not upgrade it into a claim
they do not make.

---

## 1. What the challenge actually gave us

| # | Resource | Publisher | What it is |
|---|---|---|---|
| 1 | [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) | NASA HRP | The five hazard categories of a Mars mission |
| 2 | [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/) | NASA HRP | Risk register, incl. *Risk of Altered Sensorimotor and Vestibular Function* |
| 3 | [Ongoing HRP Research in Space](https://www.nasa.gov/hrp/ongoing-hrp-research/) | NASA HRP | Active research articles |
| 4 | [Monitoring Radiation for Astronaut Health](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp) | CSA | CANS neutron dosimeter, continuous autonomous monitoring |
| 5 | [Why do we conduct science experiments in space?](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp) | CSA | Deep-space risk list + Earth-benefit argument |

---

## 2. The five hazards, and our position on each

NASA HRP names them: **space radiation**, **isolation and confinement**,
**distance from Earth**, **gravity (and the lack of it)**, **closed or hostile
environments**.

| Hazard | Our position | Where it shows on the site |
|---|---|---|
| **Gravity / lack of it** | **Modelled.** This is the hazard our index exists for. | Hero, Space section, all six OSI domains |
| **Distance from Earth** | **Modelled as a constraint**, not as physiology: 0–22 min one-way light time drives the Crew Authority Matrix. | Mission Console → authority row; Advisory |
| **Isolation and confinement** | **Referenced only.** It shapes the *symptom* domain (self-report), not a measurement we take. | Symptoms domain footnote |
| **Space radiation** | **Not modelled — declared.** We say so on the page rather than implying coverage. | Research section, "what this does not cover" |
| **Closed / hostile environment** | **Referenced only** — context for why a crew cannot just walk to a clinic. | Problem framing |

### The two sentences that carry the whole project

Gravity hazard, verbatim:

> Astronauts' entire bodies – muscles, bones, inner ear, and organs – must adjust
> to the new gravities encountered on the space station or their spacecraft, as
> well as on the Moon, Mars, and Earth once they return home.

Distance from Earth, verbatim:

> On Mars, astronauts would need to live and work in three-eighths of Earth's
> gravitational pull for up to two years.

Note what these give us for free: **the inner ear is named by NASA as one of the
four systems that must re-adapt**, and **Mars surface gravity is stated as 3/8 g
for up to two years**. Both belong in the Research section, quoted, not paraphrased.

---

## 3. The risk page — our strongest citation

From [Risks of Human Spaceflight](https://www.nasa.gov/hrp/risks/), verbatim:

> Astronauts can experience motion sickness, issues with hand-eye or gait
> coordination, and dizziness during gravitational changes, making it difficult
> to walk or operate a vehicle.

Read the four impairments against our six domains — they are the same four:

| NASA's words | Our domain |
|---|---|
| motion sickness | Symptoms |
| hand-eye coordination | Eye–head coordination |
| gait coordination | Postural control |
| difficult to … operate a vehicle | Task performance |

That is the mapping to put on screen, because it is NASA's own list of
impairments, not our reinterpretation of it.

From the dedicated risk page
([Risk of Altered Sensorimotor and Vestibular Function](https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/)),
two more usable statements:

> Altered gravity and shifts between different types of gravity may trigger
> motion sickness and affect astronauts' ability to orient themselves. Those
> issues are particularly concerning because ill crew members may have trouble
> with mission tasks, vehicle controls, or leaving the spacecraft to perform
> spacewalks.

> The majority of astronauts experience motion sickness during spaceflight.

The second one is a population statement — quotable **only** with the attribution
visible, never as "most astronauts fail our test".

The formal risk description linked there —
*Risk of altered sensorimotor/vestibular function impacting critical mission
tasks, human health, and long-term health* — is the exact string to use in the
Traceability panel header, replacing the generic "NASA sensorimotor risk".

---

## 4. Distance from Earth — the number we already use, now sourced

CSA's "why science in space" page lists what changes for Mars missions, verbatim:

> - more time in weightlessness
> - more exposure to radiation
> - longer periods of isolation, very far from home
> - increased delays in communication with Earth
> - less ability to rely on Earth for food, materials, and emergency medical assistance

Our Crew Authority Matrix already runs 0 → 22 min one-way light time. That number
was sourced from NASA's Earth–Mars light-time note; CSA now independently states
the *consequence* in the challenge's own resource list — **"less ability to rely
on Earth for … emergency medical assistance."** Cite both. It converts a
nice-to-have feature into a requirement.

---

## 5. CSA radiation — reference the method, never the measurement

CSA, verbatim:

> Neutron radiation, which contributes to about 30% of total radiation on the ISS,
> is especially harmful because it can cause serious biological damage and
> require specialized protective measures.

> CANS improves upon previous radiation detection methods with the unique combined
> capabilities of working continuously and autonomously.

What we take from this: **the design pattern** — continuous, autonomous,
on-device monitoring that does not wait for a ground station. What we must not
take: any implication that we measure radiation. Our site must keep saying the
opposite, in the same breath, or the honesty we built the index around collapses.

Earth spin-off list on that page (cancer therapy, aircrew protection, nuclear
threat detection) is useful precedent for the Impact slide pattern: *space
instrument → terrestrial users*. Ours is balance disorders and vestibular rehab.

---

## 6. Earth benefit — the line that makes Impact land

CSA, verbatim:

> Their experiments have produced findings that can help people suffering from
> balance problems, such as seniors; osteoporosis; cardiovascular disorders; and
> Type-2 diabetes.

This is the exact shape of our impact claim: *same measurement, different
population.* Astronaut pre-EVA readiness and a vestibular-rehab patient doing a
daily check are the same task — compare today's signal to your own baseline,
decide if it cleared the noise floor.

---

## 7. Three edits to make on the site

### (a) Research section — add the hazard frame

```html
<p class="eyebrow">CHALLENGE RESOURCES · NASA HRP</p>
<p>NASA's Human Research Program names five hazards of a Mars mission:
space radiation, isolation and confinement, distance from Earth, gravity and the
lack of it, and closed or hostile environments. Vestibular GPS sits inside one of
them — gravity — and treats one more, distance from Earth, as a design constraint
rather than a measurement.</p>
<p class="cite">nasa.gov/hrp/hazards · nasa.gov/hrp/risks</p>
```

### (b) Traceability panel — use the formal risk title

Replace the header string with:

```
Risk of altered sensorimotor/vestibular function impacting critical mission tasks,
human health, and long-term health — NASA HRP
```

and add the four NASA impairments as a row directly above the domain table:
`motion sickness · hand-eye coordination · gait coordination · operating a vehicle`.

### (c) Coverage statement — declare the two unmodelled hazards

```html
<p class="eyebrow">WHAT THIS DOES NOT COVER</p>
<p>We do not measure radiation dose, and we do not model isolation and
confinement. Both are NASA HRP hazards; neither is a vestibular signal. The index
covers four documented impairments and says so on every screen that shows a score.</p>
```

---

## 8. Guardrails

- **No radiation claims.** We reference CANS as a design precedent only.
- **No "NASA says most astronauts fail".** NASA says most experience motion
  sickness in flight; that is a population statement about symptoms, not about
  our index.
- **No implied endorsement.** The footer disclaimer stays exactly as it is.
- **Quote, don't paraphrase, the risk title.** Judges can check the string.
- **Ongoing HRP Research** is used to justify the word *proposed* next to OSI:
  the risk is under active study, so a readiness metric cannot be presented as
  settled science.

---

## 9. One-line change for the 30-second video

Current line: *"Every domain maps to a NASA risk node."*

Stronger, and now literally true on screen:
**"Every domain maps to NASA's Sensorimotor Risk."**
