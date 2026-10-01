# NASA research and citation plan

## Claim-safe problem statement

Use this short version only with citations beside it:

> NASA identifies altered-gravity sensorimotor/vestibular changes as a risk that
> can involve motion sickness, spatial disorientation, postural-control and
> locomotion decrements, and manual/fine-motor deficits—particularly around
> gravity transitions. Our concept is an educational, offline-first prototype for
> communicating available measurements, personal-baseline comparison, uncertainty,
> and a recheck/countermeasure path. It is not a medical device, a clinical
> diagnostic, a NASA metric, or NASA-endorsed.

Support the first sentence with [NASA's Sensorimotor Risk
page](https://www.nasa.gov/directorates/esdmd/hhp/sensorimotor-risk/) and the
formal [Human Research Roadmap risk entry](https://humanresearchroadmap.nasa.gov/Risks/risk.aspx?i=88).

## Citation map

| Slide/site claim | Cite | Do not claim |
|---|---|---|
| Altered gravity affects vestibular/sensorimotor function | NASA [Sensorimotor Risk](https://www.nasa.gov/directorates/esdmd/hhp/sensorimotor-risk/) | that every astronaut will have the same symptoms |
| Risk chain includes gaze, proprioception, motor control, spatial orientation | [NASA HRP DAG narrative](https://www.nasa.gov/wp-content/uploads/2025/07/sensorimotor-dag-narrative.pdf) | that the app reproduces NASA's own algorithm |
| Vestibular-health research includes head, eye, and body movement assessments | [NASA CIPHER](https://www.nasa.gov/reference/cipher/) | that a normal webcam is a validated vHIT/VOR test |
| Balance-system explanatory background | [NIH/NIDCD](https://www.nidcd.nih.gov/health/balance-disorders) | diagnosis, treatment, or medical advice |
| Prototype metric/domain mapping | [HRP risk mapping](../HRP-RISK-MAPPING.md) plus original NASA citations | OSI is NASA's metric, validated, or operationally deployed |

## Measurement truth table

| Feature | Permitted label |
|---|---|
| Built-in simulator | simulated/modelled demonstration data |
| Browser orientation/motion API | live device-sensor values after permission; consumer-device signal, not clinical instrument |
| Webcam head-motion estimator | experimental local head-motion proxy; calibration required |
| Eye/VOR | unavailable without validated eye landmarks + head-velocity measurement; do not infer it from head motion |
| Manual symptom input | self-report, not a diagnosis |
| OSI | proposed prototype index; heuristic weights; personal-baseline comparison |

## Citation format for the project page

For each source record: `Organisation. Title. URL. Accessed 2026-11-__.` Include
the original source URL, not only an AI summary, WhatsApp post, or a copied PDF.
Keep short quotations under the source's terms and prefer paraphrase.

## Research review before demo

1. One team member reads the cited page and checks every spoken/on-screen claim.
2. A second member checks that the citation actually supports it.
3. Replace unsupported numerical claims with a cited number or remove them.
4. Put a visible “prototype / not medical / no NASA endorsement” note in the demo
   and README.
5. Record the checker's name and date in the team evidence log.
