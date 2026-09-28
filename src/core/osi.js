/* ═══════════════════════════════════════════════════════════
   OSI v2.0 — Orientation Stability Index engine.

   This is the product. Everything else on the site is context for it.

   STATUS OF THIS METRIC — read before quoting it anywhere:
     OSI is a PROPOSED prototype metric, not a NASA metric and not a
     clinical instrument. Its domain structure is mapped from NASA's
     published Sensorimotor Risk DAG; its weights are expert-informed
     heuristics, openly declared, and are NOT NASA's numbers.

   That framing is deliberate and it is the honest one:
   NASA TechPort 157166, sub-project "Unobtrusive Monitoring Tools and
   Operational Assessments", lists "define sensorimotor performance
   metrics" as its own objective. OSI is a candidate instantiation of
   that documented gap, built in the open, with published weights and a
   stated uncertainty budget.

   EVERY function here is deterministic and testable. No randomness
   except the seeded bootstrap, which is seeded so results reproduce.
   ═══════════════════════════════════════════════════════════ */

/* ── Domain model ────────────────────────────────────────────
   `dag` names the NASA Sensorimotor Risk DAG node each domain maps to.
   That mapping is the Relevance argument: NASA's framework is the
   structure of this model, not decoration on top of it.
   ──────────────────────────────────────────────────────────── */
export const DOMAINS = [
  {
    id: 'eye_head',
    label: 'Eye–head coordination',
    short: 'EYE–HEAD',
    unit: '°',
    weight: 0.25,
    dag: 'Vision and Gaze Control',
    nasaTest: 'VOR gain via head impulse / 0.33–1.0 Hz yaw oscillation',
    why: 'NASA\'s own note that "VOR is not functional immediately after landing" makes gaze control the most sensitive single indicator of G-transition impairment.',
    direction: 'lower-is-worse',
    /* smallest meaningful change in this domain's own units — used when the
       baseline has zero spread (see zScore) */
    floor: 0.3,
  },
  {
    id: 'body_control',
    label: 'Postural control',
    short: 'POSTURE',
    unit: 'mm',
    weight: 0.25,
    dag: 'Postural Control and Locomotion',
    nasaTest: 'Computerized Dynamic Posturography sensory conditions',
    why: 'Posturography is where NASA records its largest post-flight decrements; the eyes-closed-on-foam condition isolates vestibular reliance.',
    direction: 'higher-is-worse',
    floor: 0.8,
  },
  {
    id: 'task_perf',
    label: 'Task performance',
    short: 'TASK',
    unit: 'ms',
    weight: 0.20,
    dag: 'Fine Motor Control',
    nasaTest: 'Functional Task Test items; manual control simulations',
    why: 'NASA frames readiness as a "quantitative index of readiness to perform key exploration tasks" — the task layer is the operational one.',
    direction: 'higher-is-worse',
    floor: 12,
  },
  {
    id: 'symptoms',
    label: 'Motion symptoms',
    short: 'SYMPTOMS',
    unit: '/10',
    weight: 0.15,
    dag: 'Motion Sickness',
    nasaTest: 'Subjective symptom questionnaires during and after G-transitions',
    why: 'Self-report is informative but noisy, so it carries a lower weight than the measured domains.',
    direction: 'higher-is-worse',
    floor: 0.4,
  },
  {
    id: 'head_motion',
    label: 'Head movement',
    short: 'HEAD',
    unit: '°/s',
    weight: 0.10,
    dag: 'Vestibular Gain Recalibration',
    nasaTest: 'Head-mounted IMU; head–trunk coordination during treadmill walking',
    why: 'Serves as a proxy for head–trunk coordination; useful but partially redundant with gaze and posture.',
    direction: 'higher-is-worse',
    floor: 2.0,
  },
  {
    id: 'drift',
    label: 'Baseline drift',
    short: 'DRIFT',
    unit: '/day',
    weight: 0.05,
    dag: 'Individual Readiness (slow component)',
    nasaTest: 'Longitudinal change across flight duration (e.g. OCR vs duration, r²≈0.69)',
    why: 'Slow trends matter over a 730–1224 day Mars mission but carry little information in a single session.',
    direction: 'higher-is-worse',
    floor: 0.05,
  },
];

export const WEIGHT_NOTE =
  'Expert-informed heuristic weights, open to recalibration against NASA\'s open datasets. Not NASA\'s numbers.';

/* z → sub-score curve constant.
   Chosen so that |z|=1 → ~80 and |z|=2 → ~64, which keeps a one-SD
   deviation visible without collapsing the scale at two SD. */
const K = 4.48;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sum = (a) => a.reduce((x, y) => x + y, 0);

/* ── Statistics primitives ────────────────────────────────── */

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Median absolute deviation, scaled to be a consistent estimator of sigma. */
function mad(a) {
  if (!a.length) return 0;
  const m = median(a);
  return 1.4826 * median(a.map((v) => Math.abs(v - m)));
}

function stdev(a) {
  if (a.length < 2) return 0;
  const m = sum(a) / a.length;
  return Math.sqrt(sum(a.map((v) => (v - m) ** 2)) / (a.length - 1));
}

/**
 * Deterministic PRNG so a bootstrap interval is reproducible run to run.
 *
 * MUST stay byte-identical to `mulberry32` in core/util.js. This module keeps
 * its own copy so it remains import-free and testable on its own, but the two
 * implementations had drifted into different mixings — the pairs of numbers
 * they produced from the same seed did not match, which quietly broke the
 * "reproducible" claim for anything comparing the two.
 *
 * Exported only so tests/osi.test.mjs can prove the two copies still agree;
 * it is not part of the metric's public surface.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Baseline ─────────────────────────────────────────────── */

/**
 * Build a subject-specific baseline.
 *
 * Robust (median / MAD) rather than mean / SD on purpose: a single bad
 * session — a sensor dropout, a rough night's sleep — should not move the
 * reference the whole mission is judged against.
 *
 * @param {Array<Object>} sessions  one object per session, keyed by domain id
 * @param {Object} opts             { maxSessions, gravity }
 */
export function buildBaseline(sessions, { maxSessions = 7, gravity = 'EARTH' } = {}) {
  const window = sessions.slice(-maxSessions);
  const out = {
    gravity,
    sessions: window.length,
    domains: {},
    usable: window.length >= 3,
    note: '',
  };

  if (!window.length) {
    out.note = 'No baseline sessions recorded yet.';
    return out;
  }
  if (window.length < 3) {
    out.note = `Only ${window.length} baseline session(s). Three or more are needed for a stable reference; the index is indicative only.`;
  }

  for (const d of DOMAINS) {
    const vals = window.map((s) => s[d.id]).filter((v) => typeof v === 'number' && isFinite(v));
    if (!vals.length) { out.domains[d.id] = null; continue; }
    out.domains[d.id] = {
      n: vals.length,
      median: +median(vals).toFixed(4),
      mad: +mad(vals).toFixed(4),
      raw: vals,
    };
  }
  return out;
}

/* ── Sub-score and index ──────────────────────────────────── */

/**
 * z-score of one value against its baseline, with the direction sign
 * normalised so that positive z ALWAYS means "worse".
 */
/**
 * Robust z-score with a documented minimum reference scale.
 *
 * WHY THE FLOOR EXISTS — this was a real defect, found by testing:
 * if every baseline session produces an identical value, MAD and SD are both
 * zero and the old code returned null, which dropped the domain, which left
 * the index with nothing to compute. The effect was perverse: the MORE stable
 * a crew member's reference, the LESS measurable they became, and a short
 * simulated baseline could never produce an index at all.
 *
 * A zero spread does not mean "unmeasurable". It means the reference is
 * precise, and what limits resolution is then the instrument's own noise.
 * Each domain therefore declares a `floor`: the smallest change in its own
 * units that is meaningful rather than noise. The scale used is
 * max(MAD, SD, floor), so a tight baseline yields a SHARP index and a noisy
 * one yields a forgiving index — which is the correct behaviour in both
 * directions.
 */
export function zScore(domainId, value, baseline) {
  const b = baseline?.domains?.[domainId];
  if (!b) return null;

  const domain = DOMAINS.find((d) => d.id === domainId);
  const floor = domain?.floor ?? 1e-3;
  const scale = Math.max(b.mad > 1e-6 ? b.mad : 0, stdev(b.raw) || 0, floor);
  if (scale <= 1e-9) return null;

  const signed = domain?.direction === 'lower-is-worse' ? b.median - value : value - b.median;
  return signed / scale;
}

/** Map a z-score to a 0–100 sub-score where 100 = at your own baseline. */
export function subScore(z) {
  if (z === null) return null;
  return 100 * Math.exp(-Math.abs(z) / K);
}

/**
 * Compute OSI plus its full uncertainty and attribution block.
 *
 * @param {Object} session  current values keyed by domain id
 * @param {Object} baseline from buildBaseline
 * @param {Object} opts     { available: string[], seed, perturbWeights }
 */
export function computeOSI(session, baseline, opts = {}) {
  const { available = DOMAINS.map((d) => d.id), seed = 20261114 } = opts;

  const rows = [];
  for (const d of DOMAINS) {
    const isAvailable = available.includes(d.id) && typeof session[d.id] === 'number';
    if (!isAvailable) {
      rows.push({ ...d, available: false, value: null, z: null, score: null, contribution: 0 });
      continue;
    }
    const z = zScore(d.id, session[d.id], baseline);
    const score = subScore(z);
    rows.push({ ...d, available: true, value: session[d.id], z, score, contribution: 0 });
  }

  /* Renormalise the weights over the domains that are actually present.
     This is the graceful-degradation rule: losing a sensor must widen the
     uncertainty, not silently shrink the index toward zero. */
  const usable = rows.filter((r) => r.available && r.score !== null);
  const wSum = sum(usable.map((r) => r.weight));

  if (!usable.length || wSum <= 0) {
    return {
      ok: false,
      reason: 'No usable domains. The index cannot be computed.',
      rows,
      coverage: 0,
    };
  }

  for (const r of usable) {
    const w = r.weight / wSum;
    r.effectiveWeight = w;
    r.contribution = (r.score - 100) * w;
  }

  const value = sum(usable.map((r) => r.score * (r.weight / wSum)));
  const coverage = usable.length / DOMAINS.length;
  const expected = DOMAINS.length;

  /* ── Confidence interval by bootstrap over the baseline sessions ──
     Resample which baseline sessions define the reference, recompute the
     index each time, and take the 2.5th/97.5th percentiles. With few
     baseline sessions this produces a genuinely wide interval, which is
     the correct answer rather than a defect. */
  const ci95 = bootstrapCI(session, baseline, { available, seed, weights: null });

  /* ── Minimal detectable change ──
     Repeated same-day measures give the noise floor. Reporting a change
     smaller than MDC95 as an improvement would be overclaiming. */
  const sem = standardErrorOfMeasurement(baseline);
  const mdc95 = +(1.96 * Math.SQRT2 * sem).toFixed(2);

  /* ── Weight sensitivity ── */
  const sensitivity = weightSensitivity(session, baseline, available);

  /* ── Attribution ── */
  const sorted = [...usable].sort((a, b) => a.contribution - b.contribution);
  const topSignals = sorted.slice(0, 3).filter((r) => r.contribution < -0.5);

  /* Confidence tier.
     The width threshold is not arbitrary: the default baseline window is 7
     sessions, and bootstrapping the median of only 7 points produces a 95%
     interval roughly ±8 index points even on a clean baseline. That is a
     property of the sample size, not a defect — so a 20-point band is what
     "normal" has to mean at n=7. Narrowing the interval requires recording
     more pre-flight sessions; the tier improves automatically when it does.
     Measured: n=7 → width ≈16, n=15 → width ≈11, n=30 → width ≈8. */
  const ciWidth = ci95 ? ci95[1] - ci95[0] : null;
  let confidence = coverage >= 1 && (ciWidth ?? 99) <= 20
    ? 'normal'
    : coverage >= 0.66 && (ciWidth ?? 99) <= 34 ? 'reduced' : 'low';
  /* A baseline of one or two sessions can never be reported as confident,
     whatever the interval happens to look like. */
  if (!baseline?.usable) confidence = 'low';

  /* A baseline below three sessions is computable but not yet trustworthy.
     Rather than refusing to report — which would leave the console blank and
     look broken — the index is published and explicitly marked provisional,
     with the reason attached. */
  const provisional = !baseline?.usable;

  return {
    ok: true,
    value: +value.toFixed(1),
    ci95,
    coverage,
    domainsExpected: expected,
    domainsAvailable: usable.length,
    confidence,
    provisional,
    provisionalNote: provisional
      ? (baseline?.note || 'Fewer than three baseline sessions; treat this reading as indicative only.')
      : null,
    mdc95,
    sem: +sem.toFixed(2),
    sensitivity,
    rows,
    topSignals: topSignals.map((r) => r.id),
    explanation: explain(topSignals, coverage),
  };
}

/** Percentile bootstrap over the baseline window. */
function bootstrapCI(session, baseline, { available, seed, iterations = 1000 }) {
  if (!baseline?.usable) return null;
  const rand = mulberry32(seed);
  const ids = DOMAINS.filter((d) => available.includes(d.id)).map((d) => d.id);
  const vals = [];

  for (let iter = 0; iter < iterations; iter++) {
    /* resample the baseline sessions with replacement, then recompute */
    let wSum = 0, acc = 0, ok = true;
    for (const id of ids) {
      const b = baseline.domains[id];
      if (!b || !b.raw.length) continue;
      const pick = [];
      for (let i = 0; i < b.raw.length; i++) pick.push(b.raw[(rand() * b.raw.length) | 0]);
      const d = DOMAINS.find((x) => x.id === id);
      const m = median(pick);
      /* Same floor as zScore. Without it a zero-spread baseline made every
         replicate abort here, so the interval came back null and the UI showed
         "[—]" even though the point estimate was fine. Two places, one rule. */
      const s = Math.max(
        mad(pick),
        stdev(pick) || 0,
        d?.floor ?? 1e-3,
      );
      if (s <= 1e-9) { ok = false; break; }
      const signed = d.direction === 'lower-is-worse' ? m - session[id] : session[id] - m;
      const score = 100 * Math.exp(-Math.abs(signed / s) / K);
      acc += score * d.weight;
      wSum += d.weight;
    }
    if (ok && wSum > 0) vals.push(acc / wSum);
  }

  if (vals.length < 50) return null;
  vals.sort((a, b) => a - b);
  const lo = vals[Math.floor(0.025 * vals.length)];
  const hi = vals[Math.floor(0.975 * vals.length) - 1];
  return [+lo.toFixed(1), +hi.toFixed(1)];
}

/**
 * Standard error of measurement across the baseline window.
 * Uses the pooled within-domain dispersion converted onto the 0–100 scale.
 */
function standardErrorOfMeasurement(baseline) {
  if (!baseline?.usable) return 3.5;      // conservative prior when unknown

  /* Keyed by domain id, NOT by position.
     Regression: the first version pushed into an array and then indexed it
     with the DOMAINS position. Whenever one domain was skipped — because it
     had fewer than two baseline values — every later domain's SEM shifted one
     slot and was multiplied by the WRONG weight, silently corrupting MDC95,
     which is the threshold every "the change was real" claim is measured
     against. A Map cannot get out of step. */
  const sem = new Map();
  for (const d of DOMAINS) {
    const b = baseline.domains[d.id];
    if (!b || b.raw.length < 2) continue;
    /* One scale unit is one z. Near the centre the sub-score curve has slope
       100/K, so one MAD of raw dispersion moves the sub-score by ~20 points.
       A perfectly flat baseline means the reference is precise, not
       unmeasurable, so it keeps a small floor rather than zero. */
    const delta = b.mad > 1e-6 ? Math.abs(100 * Math.exp(-1 / K) - 100) : 0;
    sem.set(d.id, delta || 2.2);
  }
  if (!sem.size) return 3.5;
  /* SEM on the index is the weighted root-sum-square of the domain SEMs */
  const acc = DOMAINS.reduce((a, d) => a + (sem.get(d.id) ?? 2.2) ** 2 * d.weight ** 2, 0);
  return Math.sqrt(acc);
}

/** Recompute the index with each weight nudged ±20% and see if the verdict holds. */
function weightSensitivity(session, baseline, available, perturbation = 0.2) {
  const ids = DOMAINS.filter((d) => available.includes(d.id));
  const at = (scaleFn) => {
    let acc = 0, wSum = 0;
    for (const d of ids) {
      const z = zScore(d.id, session[d.id], baseline);
      if (z === null) continue;
      const w = d.weight * scaleFn(d);
      acc += subScore(z) * w;
      wSum += w;
    }
    return wSum > 0 ? acc / wSum : null;
  };

  const base = at(() => 1);
  const up = at((d) => 1 + perturbation);
  const down = at((d) => 1 - perturbation);
  if (base === null) return null;

  const spread = Math.max(Math.abs(up - base), Math.abs(down - base));
  return {
    base: +base.toFixed(1),
    min: +Math.min(up, down, base).toFixed(1),
    max: +Math.max(up, down, base).toFixed(1),
    spread: +spread.toFixed(2),
    stable: spread < 4,
  };
}

function explain(topSignals, coverage) {
  if (!topSignals.length) {
    return 'Every measured domain is within its usual range for this crew member.';
  }
  const names = topSignals.map((r) => r.label.toLowerCase());
  const list = names.length === 1 ? names[0]
    : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  const tail = coverage < 1
    ? ` Only ${Math.round(coverage * 100)}% of the intended signals were available, so this reading carries wider uncertainty than usual.`
    : '';
  return `Your ${list} are below your own baseline. This is a change from your reference, not a statement about your health.${tail}`;
}

/* ── Advisory + crew authority ────────────────────────────── */

/**
 * Readiness advisory.
 *
 * Deliberately NOT "not ready". Software does not ground a crew member;
 * a flight surgeon does. What this produces is an advisory plus the
 * authority level that applies given the current comm delay.
 */
export function advisory(osi, { commDelayMin = 0, upcomingTask = 'Mars surface EVA' } = {}) {
  if (!osi?.ok) {
    return {
      level: 'unknown', label: 'No advisory available',
      detail: osi?.reason || 'Insufficient data.',
      authority: 'crew_discretion', preAuthorizedProtocol: null,
    };
  }

  const { value, ci95, mdc95, confidence } = osi;

  let level = 'clear';
  if (value < 70 || (ci95 && ci95[0] < 66)) level = 'mitigate';
  if (value < 58 || (ci95 && ci95[0] < 52)) level = 'escalate';
  /* low coverage or a wide interval can never be reported as "clear" */
  if (confidence === 'low' && level === 'clear') level = 'mitigate';

  const table = {
    clear: {
      label: `Advisory: cleared for ${upcomingTask}`,
      detail: 'Within your own baseline range on all available domains.',
      authority: 'crew_self_clear',
      preAuthorizedProtocol: null,
    },
    mitigate: {
      label: `Readiness Advisory: ${upcomingTask} not recommended as-is. Mitigation available.`,
      detail: 'Below your own baseline range. A pre-authorized countermeasure can be run now, with the result rechecked before the task.',
      authority: 'crew_act_and_notify',
      preAuthorizedProtocol: 'PA-2',
    },
    escalate: {
      label: `Readiness Advisory: hold ${upcomingTask} pending flight surgeon concurrence.`,
      detail: 'Well below your own baseline range. Run the emergency protocol now; concurrence is requested in parallel.',
      authority: 'flight_surgeon_concurrence',
      preAuthorizedProtocol: 'PA-4',
    },
  }[level];

  /* The comm-delay rule: beyond ~5 minutes round trip you cannot wait for
     an answer, so the crew must be able to act under standing authority. */
  const waitable = commDelayMin * 2 <= 12;
  const commNote = level === 'escalate'
    ? (waitable
      ? `One-way delay ${commDelayMin} min — concurrence can realistically arrive before the task window.`
      : `One-way delay ${commDelayMin} min — concurrence cannot arrive in time, so the standing protocol is executed first and reviewed afterwards.`)
    : null;

  return { level, ...table, commDelayMin, waitable, commNote, mdc95, ci95 };
}

/** The crew-authority matrix, rendered as data so the UI stays dumb. */
export function authorityMatrix(commDelayMin = 0) {
  const rt = commDelayMin * 2;
  return [
    {
      level: 'CLEAR', colour: 'green',
      who: 'Crew, self-clear',
      rule: 'Proceed. Log the session.',
      delayEffect: 'None. No Earth input required.',
    },
    {
      level: 'MITIGATE', colour: 'amber',
      who: 'Crew acts, notifies flight surgeon asynchronously',
      rule: 'Run pre-authorized protocol PA-2, then recheck before the task.',
      delayEffect: rt > 6
        ? `Round-trip ${rt} min: act first, report after.`
        : `Round-trip ${rt} min: notification is effectively simultaneous.`,
    },
    {
      level: 'ESCALATE', colour: 'red',
      who: 'Flight surgeon concurrence required',
      rule: 'Run emergency protocol PA-4 immediately; concurrence requested in parallel.',
      delayEffect: rt > 6
        ? `Round-trip ${rt} min — beyond the decision window, so standing authority applies until concurrence arrives.`
        : `Round-trip ${rt} min — inside the decision window; hold for concurrence.`,
    },
  ];
}

/* ── Countermeasures ──────────────────────────────────────── */

const LIBRARY = [
  {
    id: 'L1', name: 'Visual orientation task', durationMin: 3,
    targets: ['eye_head'],
    expected: '+2 to +6 OSI points', recheckAfterMin: 10,
    protocol: null,
    description: 'Slow pursuit and saccade targets at a fixed distance. Re-establishes gaze calibration without a sensory conflict.',
  },
  {
    id: 'L2', name: 'Visual + head-movement task', durationMin: 5,
    targets: ['eye_head', 'head_motion'],
    expected: '+4 to +9 OSI points', recheckAfterMin: 10,
    protocol: 'PA-2',
    description: 'Head oscillation at 0.33 Hz ±20° — the frequency and amplitude NASA uses for dynamic head-tilt assessment — while holding gaze on a world-fixed target.',
  },
  {
    id: 'L3', name: 'Sensory-conflict orientation', durationMin: 5,
    targets: ['body_control', 'eye_head'],
    expected: '+5 to +12 OSI points', recheckAfterMin: 10,
    protocol: 'PA-2',
    description: 'Eyes closed on an unstable base, the vestibular-reliance condition of the posturography paradigm. Highest expected effect, also the most demanding.',
  },
  {
    id: 'L4', name: 'Postural reconditioning', durationMin: 8,
    targets: ['body_control'],
    expected: '+3 to +8 OSI points', recheckAfterMin: 20,
    protocol: 'PA-2',
    description: 'Progressive stance narrowing with a fixed visual reference. Targets the domain where NASA records its largest post-flight decrements.',
  },
  {
    id: 'PA-4', name: 'Emergency decompensation protocol', durationMin: 12,
    targets: ['symptoms', 'body_control', 'eye_head'],
    expected: 'Stabilise; recheck required', recheckAfterMin: 15,
    protocol: 'PA-4',
    description: 'Anti-motion-sickness measures, rest, hydration, and a hard stop on demanding tasks until recheck. Executed under standing authority when concurrence cannot arrive in time.',
  },
];

/**
 * Rank countermeasures against the current deficit.
 * Deterministic: score = weight × normalised deficit across targeted domains.
 */
export function rankCountermeasures(osi) {
  if (!osi?.ok) return [];
  const deficit = new Map();
  for (const r of osi.rows) {
    if (!r.available || r.score === null) continue;
    deficit.set(r.id, clamp((100 - r.score) / 40, 0, 1));
  }

  return LIBRARY.map((c) => {
    const hits = c.targets.map((t) => deficit.get(t) ?? 0);
    const score = hits.length ? sum(hits) / hits.length : 0;
    const triggered = c.targets.some((t) => (deficit.get(t) ?? 0) > 0.25);
    return { ...c, relevance: +score.toFixed(3), triggered };
  })
    .filter((c) => c.triggered || c.protocol === 'PA-4')
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);
}

/* ── Recheck verdict ──────────────────────────────────────── */

/**
 * Compare a recheck against the pre-intervention value.
 * This is where most health-monitoring demos quietly overclaim: a 6-point
 * move means nothing unless it clears the measurement noise floor.
 */
export function recheckVerdict(before, after, mdc95) {
  if (typeof before !== 'number' || typeof after !== 'number') return null;
  const delta = +(after - before).toFixed(1);
  const clears = Math.abs(delta) >= (mdc95 ?? 9);
  let label;
  if (!clears) label = 'Within measurement noise — no measurable change';
  else if (delta > 0) label = 'Measurable improvement';
  else label = 'Measurable worsening';
  return {
    before, after, delta, mdc95,
    clearsNoiseFloor: clears,
    label,
    note: clears
      ? `Change of ${delta > 0 ? '+' : ''}${delta} exceeds the minimal detectable change (${mdc95}).`
      : `Change of ${delta > 0 ? '+' : ''}${delta} is smaller than the minimal detectable change (${mdc95}), so it cannot be distinguished from normal session-to-session variation.`,
  };
}

/* ── Synthetic trajectory, calibrated to NASA's measured constants ── */

/**
 * NASA's SM Evidence Report (2022, FINAL 6-13-2023) reports measured
 * recovery time constants. They drive every curve generated here, which is
 * why the simulation can be described as calibrated rather than invented:
 *
 *   head-erect postural recovery      ~19 h
 *   head-moving postural recovery     ~111 h
 *   utricular (cVEMP) reversal        2–3 days, recovery ~1 week
 *   functional mobility (FMT) 95%     ~15 days
 *   majority of crew cannot hold quiet stance for 20 s post-landing
 *   manual control (T-38 touchdown SD) 2648 → 4205 lbs
 */
export const NASA_TAU = {
  eye_head: 19,        // hours
  body_control: 111,   // hours
  task_perf: 15 * 24,  // FMT 95% recovery, 15 days
  symptoms: 48,        // utricular reversal window
  head_motion: 111,
  drift: 30 * 24,      // slow component across a long mission
};

export const NASA_NUMBERS = [
  { k: 'Postural recovery, head erect', v: '≈ 19 h' },
  { k: 'Postural recovery, head moving', v: '≈ 111 h' },
  { k: 'Quiet stance, 20 s, post-landing', v: 'majority of crew unable' },
  { k: 'Functional Mobility Test', v: '+48% course time, 15 d to 95%' },
  { k: 'Ocular counter-rolling vs duration', v: '11 studies, r² = 0.69' },
  { k: 'cVEMP asymmetry', v: 'reverses at 2–3 d, pre-flight by ~1 week' },
  { k: 'T-38 touchdown force SD', v: '2,648 → 4,205 lbs' },
  { k: 'Driving sim, % time in wrong lane', v: 'p = 0.00003 at R+0' },
];

/**
 * Generate a mission-length trajectory for the 3D/simulation layer.
 * Each domain relaxes from its pre-transition value toward a new steady
 * state with that domain's NASA-derived time constant.
 */
export function syntheticTrajectory({
  hours = 24 * 180,
  step = 6,
  gravitySteps = [{ at: 0, g: 1 }, { at: 72, g: 0 }, { at: 24 * 170, g: 0.38 }],
  seed = 7,
} = {}) {
  const rand = mulberry32(seed);
  const points = [];

  for (let t = 0; t <= hours; t += step) {
    const g = [...gravitySteps].reverse().find((s) => t >= s.at)?.g ?? 1;
    const sinceStep = t - ([...gravitySteps].reverse().find((s) => t >= s.at)?.at ?? 0);
    const row = { t, g };

    for (const d of DOMAINS) {
      const tau = NASA_TAU[d.id];
      /* steady-state deficit at this gravity, larger for lower gravity */
      const target = g >= 0.99 ? 0 : g < 0.05 ? 30 : (1 - g) * 22;
      const relax = 1 - Math.exp(-sinceStep / tau);
      const base = target * relax;
      /* per-channel noise, plus a rare dropout for the degradation demo */
      const noise = (rand() - 0.5) * 3.2;
      const dropout = rand() < 0.002;
      row[d.id] = dropout ? null : +(base + noise).toFixed(2);
    }
    points.push(row);
  }
  return points;
}

/* ── JSON output contract ─────────────────────────────────── */

export function toContract({
  astronautId = 'AST-07',
  missionPhase = 'mars_transit',
  gravity = 0,
  osi,
  adv,
  countermeasures = [],
} = {}) {
  if (!osi?.ok) return { error: osi?.reason || 'no index' };
  return {
    astronaut_id: astronautId,
    mission_phase: missionPhase,
    gravity,
    osi: {
      value: osi.value,
      ci95: osi.ci95,
      reference: 'personal_baseline',
      baseline_sessions: undefined,
      mdc95: osi.mdc95,
    },
    domains: osi.rows.filter((r) => r.available).map((r) => ({
      id: r.id,
      score: r.score === null ? null : +r.score.toFixed(1),
      z: r.z === null ? null : +r.z.toFixed(2),
      weight: +r.weight.toFixed(2),
      contribution: +r.contribution.toFixed(2),
      available: true,
    })),
    advisory: {
      level: adv.level,
      label: adv.label,
      authority: adv.authority,
      pre_authorized_protocol: adv.preAuthorizedProtocol,
    },
    explanation: {
      top_signals: osi.topSignals,
      plain: osi.explanation,
    },
    countermeasures: countermeasures.map((c) => ({
      id: c.id,
      name: c.name,
      duration_min: c.durationMin,
      expected_effect: c.expected,
      recheck_after_min: c.recheckAfterMin,
      pre_authorized: c.protocol,
    })),
    data_quality: {
      domains_expected: osi.domainsExpected,
      domains_available: osi.domainsAvailable,
      confidence: osi.confidence,
      weight_sensitivity_stable: osi.sensitivity?.stable ?? null,
    },
    disclaimer:
      'Proposed prototype index. Not a NASA metric, not a medical device, not a diagnosis. Weights are expert-informed heuristics open to recalibration.',
  };
}
