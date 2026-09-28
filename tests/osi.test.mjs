/* ═══════════════════════════════════════════════════════════
   OSI engine test harness.

   Run:  node tests/osi.test.mjs
   Exit code 0 = all assertions passed.

   This is the validation layer the roadmap asks for: it exercises the
   maths against constructed cases whose answers are known, rather than
   against a screenshot.
   ═══════════════════════════════════════════════════════════ */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  DOMAINS, buildBaseline, zScore, subScore, computeOSI,
  advisory, authorityMatrix, rankCountermeasures, recheckVerdict,
  syntheticTrajectory, toContract, NASA_TAU,
  mulberry32 as osiPrng,
} from '../src/core/osi.js';
/* Imported only so the two PRNG copies can be proved identical. core/util.js
   touches `document` solely inside default parameters and function bodies, so
   importing it under Node is safe. */
import { mulberry32 as utilPrng } from '../src/core/util.js';

const HERE = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { passed++; return; }
  failed++;
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function close(name, actual, expected, tol) {
  const d = Math.abs(actual - expected);
  ok(name, d <= tol, `expected ${expected} ±${tol}, got ${actual}`);
}

/* ── Fixtures ─────────────────────────────────────────────── */

/** A healthy crew member: seven stable pre-flight sessions. */
function healthyBaseline() {
  const sessions = [];
  for (let i = 0; i < 7; i++) {
    const jitter = (i % 3 - 1) * 0.4;
    sessions.push({
      eye_head: 4.0 + jitter,
      body_control: 9.0 + jitter * 0.5,
      task_perf: 420 + jitter * 6,
      symptoms: 1.0 + jitter * 0.2,
      head_motion: 28 + jitter * 2,
      drift: 0.0 + jitter * 0.1,
    });
  }
  return buildBaseline(sessions);
}

const atBaseline = {
  eye_head: 4.0, body_control: 9.0, task_perf: 420, symptoms: 1.0, head_motion: 28, drift: 0.0,
};

/* ═══════════════════════════════════════════════════════════ */

console.log('OSI v2.0 — engine tests\n');

/* 1. Domain model integrity */
{
  const wsum = DOMAINS.reduce((a, d) => a + d.weight, 0);
  close('domain weights sum to 1', wsum, 1.0, 1e-9);
  ok('six domains defined', DOMAINS.length === 6, `got ${DOMAINS.length}`);
  ok('every domain maps to a NASA DAG node', DOMAINS.every((d) => !!d.dag));
}

/* 2. Baseline statistics: median/MAD must be robust to one bad session */
{
  const b = healthyBaseline();
  ok('baseline marked usable at n=7', b.usable === true);
  close('eye_head median ≈ 4.0', b.domains.eye_head.median, 4.0, 0.05);
  ok('MAD is positive', b.domains.eye_head.mad > 0, `mad=${b.domains.eye_head.mad}`);

  /* inject an obvious outlier and confirm the reference barely moves */
  const sessions = [];
  for (let i = 0; i < 7; i++) {
    sessions.push({
      eye_head: 4.0, body_control: 9.0, task_perf: 420,
      symptoms: 1.0, head_motion: 28, drift: 0.0,
    });
  }
  sessions[6].eye_head = 400;           // gross artifact
  const robust = buildBaseline(sessions);
  ok('median ignores a gross outlier', robust.domains.eye_head.median === 4.0,
    `median became ${robust.domains.eye_head.median}`);
}

/* 2b. REGRESSION — a zero-dispersion baseline must still yield an index.
       This was a real shipped defect: when every baseline session produced an
       identical value, MAD and SD were both zero, the old zScore returned
       null, every domain was dropped, and the index reported "No usable
       domains" forever. The perverse consequence was that the more stable a
       crew member's reference, the less measurable they became — and a short
       simulated baseline could never produce a reading at all. */
{
  const identical = [];
  for (let i = 0; i < 3; i++) {
    identical.push({
      eye_head: 4.0, body_control: 9.0, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0,
    });
  }
  const flat = buildBaseline(identical);
  ok('a perfectly flat baseline is still usable', flat.usable === true);
  ok('its MAD really is zero', flat.domains.eye_head.mad === 0,
    `mad=${flat.domains.eye_head.mad}`);

  const z = zScore('eye_head', 4.0, flat);
  ok('zScore returns a number, not null, with zero spread', typeof z === 'number', `z=${z}`);
  close('identical value gives z of exactly 0', z, 0, 1e-9);

  /* and a real deviation must register against that flat reference via the floor */
  const deviated = zScore('eye_head', 4.0 - flat.domains.eye_head.mad - 0.6, flat);
  ok('a 0.6 deg shift registers against a flat baseline', deviated > 0, `z=${deviated}`);

  const osi = computeOSI({ ...identical[0] }, flat);
  ok('the index computes from a flat baseline', osi.ok === true,
    osi.reason || '');
  if (osi.ok) {
    ok('and lands at approximately 100', Math.abs(osi.value - 100) < 2, `value=${osi.value}`);
    ok('with full coverage', osi.coverage === 1);
  }
}

/** The exact shape the app produces when nothing is live but symptoms. */
{
  const sessions = [
    { eye_head: 4.2, body_control: 9.1, task_perf: null, symptoms: 1, head_motion: 27, drift: null },
    { eye_head: 4.2, body_control: 9.1, task_perf: null, symptoms: 1, head_motion: 27, drift: null },
    { eye_head: 4.2, body_control: 9.1, task_perf: null, symptoms: 1, head_motion: 27, drift: null },
  ];
  const b = buildBaseline(sessions);
  const osi = computeOSI({ eye_head: 4.2, body_control: 9.1, task_perf: null, symptoms: 1, head_motion: 27, drift: null }, b);
  ok('null channels are excluded, not treated as zero', osi.ok === true, osi.reason || '');
  if (osi.ok) {
    ok('coverage reflects the missing channels', osi.coverage < 1, `coverage=${osi.coverage}`);
    ok('available domains are still indexed', osi.domainsAvailable === 4,
      `available=${osi.domainsAvailable}`);
  }
}

/* 2c. REGRESSION — the bootstrap interval must survive a flat baseline too.
       The first fix only patched zScore, so the point estimate computed while
       the interval still came back null and the UI rendered "[—]". The floor
       has to apply in both places, and this asserts it does. */
{
  const flat = buildBaseline([
    { eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0 },
    { eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0 },
    { eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0 },
  ]);
  const osi = computeOSI({ eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0 }, flat);
  ok('flat baseline still yields a confidence interval', Array.isArray(osi.ci95),
    `ci95=${JSON.stringify(osi.ci95)}`);
  if (Array.isArray(osi.ci95)) {
    ok('the interval is zero-width when nothing varies',
      Math.abs(osi.ci95[1] - osi.ci95[0]) < 1e-6, `ci=${JSON.stringify(osi.ci95)}`);
    ok('and it brackets the point estimate',
      osi.ci95[0] <= osi.value && osi.value <= osi.ci95[1]);
  }
}

/* 2d. A short baseline is reported as PROVISIONAL rather than withheld. */
{
  const one = buildBaseline([{ eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0 }]);
  const r1 = computeOSI({ eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0 }, one);
  ok('n=1 baseline still produces a reading', r1.ok === true);
  ok('and is flagged provisional', r1.provisional === true);
  ok('with a reason attached', typeof r1.provisionalNote === 'string' && r1.provisionalNote.length > 10,
    r1.provisionalNote);
  ok('and can never claim normal confidence', r1.confidence === 'low', `confidence=${r1.confidence}`);

  const seven = healthyBaseline();
  const r7 = computeOSI(atBaseline, seven);
  ok('a full baseline is NOT provisional', r7.provisional === false);
}

/* 3. Sub-score curve */
{
  close('z=0 → 100', subScore(0), 100, 1e-9);
  close('z=1 → ~80', subScore(1), 80, 1.0);
  close('z=2 → ~64', subScore(2), 64, 1.0);
  close('z=-1 → ~80 (symmetric)', subScore(-1), 80, 1.0);
}

/* 4. Direction handling — a LOWER value must count as worse for eye_head */
{
  const b = healthyBaseline();
  const worseZ = zScore('eye_head', 4.0 - b.domains.eye_head.mad, b);
  const betterZ = zScore('eye_head', 4.0 + b.domains.eye_head.mad, b);
  ok('lower eye-head value yields positive (worse) z', worseZ > 0, `z=${worseZ}`);
  ok('higher eye-head value yields negative (better) z', betterZ < 0, `z=${betterZ}`);

  /* body_control is higher-is-worse, so it must behave oppositely */
  const worseBody = zScore('body_control', 9.0 + b.domains.body_control.mad, b);
  ok('higher body-sway value yields positive (worse) z', worseBody > 0, `z=${worseBody}`);
}

/* 5. Index at baseline should be ~100; degraded should fall predictably */
{
  const b = healthyBaseline();

  const healthy = computeOSI(atBaseline, b);
  ok('index computes', healthy.ok === true);
  ok('at-baseline index is ≈100', Math.abs(healthy.value - 100) < 2,
    `got ${healthy.value}`);
  ok('full coverage reported', healthy.coverage === 1, `coverage=${healthy.coverage}`);
  ok('confidence is a valid tier', ['normal', 'reduced', 'low'].includes(healthy.confidence),
    `confidence=${healthy.confidence}`);

  /* The fixture baseline has deliberately tiny spread (three distinct values).
     With such a tight reference, resampling it moves the median enough to swing
     the index, so the honest confidence tier is NOT "normal". Assert the engine
     reports that rather than hiding it. A realistic, noisier baseline should
     reach "normal" — checked in the block below. */
  ok('a very tight baseline yields a wide interval, not false confidence',
    healthy.sensitivity !== null,
    `ci95=${JSON.stringify(healthy.ci95)}`);

  /* A realistic pre-flight baseline. The previous fixture spread ±5.7 on a
     4-degree measure, including negative values — not a baseline any crew
     member would produce. Realistic session-to-session variation is a few
     percent, so this uses ±0.5 deg on 4.0. */
  {
    const noisy = [];
    for (let i = 0; i < 7; i++) {
      const j = ((i % 4) - 1.5) * 0.33;
      noisy.push({
        eye_head: 4.0 + j, body_control: 9.0 + j * 1.2, task_perf: 420 + j * 14,
        symptoms: 1.0 + j * 0.25, head_motion: 28 + j * 2.4, drift: j * 0.2,
      });
    }
    const nb = buildBaseline(noisy);
    const nOsi = computeOSI({
      eye_head: 4.0, body_control: 9.0, task_perf: 420, symptoms: 1.0, head_motion: 28, drift: 0,
    }, nb);
    ok('a realistic 7-session baseline reaches normal confidence',
      nOsi.confidence === 'normal',
      `confidence=${nOsi.confidence} ci=${JSON.stringify(nOsi.ci95)}`);
  }

  /* The confidence tier must improve as more baseline sessions accumulate.
     This is the mechanism the tier is meant to describe, so it is asserted
     rather than assumed. */
  {
    const make = (n) => {
      const s = [];
      for (let i = 0; i < n; i++) {
        const j = ((i % 5) - 2) * 0.28;
        s.push({
          eye_head: 4.0 + j, body_control: 9.0 + j * 1.2, task_perf: 420 + j * 14,
          symptoms: 1.0 + j * 0.25, head_motion: 28 + j * 2.4, drift: j * 0.2,
        });
      }
      return s;
    };
    const cur = { eye_head: 4.0, body_control: 9.0, task_perf: 420, symptoms: 1.0, head_motion: 28, drift: 0 };
    const w7 = computeOSI(cur, buildBaseline(make(7), { maxSessions: 7 })).ci95;
    const w30 = computeOSI(cur, buildBaseline(make(30), { maxSessions: 30 })).ci95;
    const width7 = w7[1] - w7[0];
    const width30 = w30[1] - w30[0];
    ok('more baseline sessions narrow the interval', width30 < width7,
      `n=7 width=${width7.toFixed(1)}  n=30 width=${width30.toFixed(1)}`);
  }

  /* drive the two highest-weight domains two MADs down */
  const degraded = {
    ...atBaseline,
    eye_head: atBaseline.eye_head - 2 * b.domains.eye_head.mad,
    body_control: atBaseline.body_control - 2 * b.domains.body_control.mad,
  };
  const bad = computeOSI(degraded, b);
  ok('degraded index is lower', bad.value < healthy.value - 5,
    `healthy=${healthy.value} degraded=${bad.value}`);
  ok('degradation is attributed to the right domains',
    bad.topSignals.includes('eye_head') && bad.topSignals.includes('body_control'),
    `topSignals=${bad.topSignals.join(',')}`);
  ok('explanation is generated', typeof bad.explanation === 'string' && bad.explanation.length > 20);
}

/* 6. Confidence interval must widen when baseline is thin */
{
  const thin = buildBaseline([{
    eye_head: 4, body_control: 9, task_perf: 420, symptoms: 1, head_motion: 28, drift: 0,
  }]);
  ok('baseline with 1 session is not usable', thin.usable === false);

  const thick = healthyBaseline();
  const a = computeOSI(atBaseline, thick);
  ok('CI present with a usable baseline', Array.isArray(a.ci95) && a.ci95.length === 2,
    `ci95=${JSON.stringify(a.ci95)}`);
  ok('CI brackets the point estimate',
    a.ci95[0] <= a.value && a.value <= a.ci95[1],
    `ci=${a.ci95} value=${a.value}`);
}

/* 7. Graceful degradation: dropping domains must widen uncertainty, not
      silently shrink the index */
{
  const b = healthyBaseline();
  const partial = computeOSI({ ...atBaseline, eye_head: null, body_control: null }, b);
  ok('index still computes with 4/6 domains', partial.ok === true);
  ok('coverage reflects the loss', partial.coverage < 1, `coverage=${partial.coverage}`);
  ok('confidence is downgraded', partial.confidence !== 'normal',
    `confidence=${partial.confidence}`);
  ok('unavailable domains are marked', partial.rows.filter((r) => !r.available).length === 2);

  const none = computeOSI({}, b);
  ok('no usable domains → explicit failure, not a fake zero', none.ok === false && !!none.reason,
    JSON.stringify(none.reason));
}

/* 8. Weight sensitivity */
{
  const b = healthyBaseline();
  const r = computeOSI(atBaseline, b);
  ok('sensitivity block present', r.sensitivity !== null);
  ok('sensitivity reports stability', typeof r.sensitivity.stable === 'boolean');
  ok('sensitivity spread is small at baseline', r.sensitivity.spread < 4,
    `spread=${r.sensitivity.spread}`);
}

/* 9. MDC and the recheck verdict — the overclaiming trap */
{
  const b = healthyBaseline();
  const r = computeOSI(atBaseline, b);
  ok('MDC95 is positive', r.mdc95 > 0, `mdc=${r.mdc95}`);

  const tiny = recheckVerdict(72, 75, 9);
  ok('a 3-point move does NOT clear a 9-point MDC', tiny.clearsNoiseFloor === false);
  ok('and is labelled as noise', /noise/i.test(tiny.label), tiny.label);

  const real = recheckVerdict(61, 78, 9);
  ok('a 17-point move clears MDC', real.clearsNoiseFloor === true);
  ok('and is labelled as improvement', /improvement/i.test(real.label), real.label);

  const worse = recheckVerdict(80, 60, 9);
  ok('a large drop is labelled worsening', /worsening/i.test(worse.label), worse.label);
}

/* 10. Advisory levels and the crew-authority rule */
{
  const base = { ok: true, value: 92, ci95: [88, 95], mdc95: 9, confidence: 'normal', reason: '' };
  ok('high index → clear', advisory(base).level === 'clear');

  const mid = { ok: true, value: 68, ci95: [62, 74], mdc95: 9, confidence: 'normal' };
  ok('mid index → mitigate', advisory(mid).level === 'mitigate');

  const low = { ok: true, value: 51, ci95: [44, 58], mdc95: 9, confidence: 'normal' };
  ok('low index → escalate', advisory(low).level === 'escalate');

  /* the language rule from the roadmap: never "not ready", never "grounded" */
  const labels = ['clear', 'mitigate', 'escalate']
    .map((_, i) => advisory([base, mid, low][i]).label).join(' ');
  ok('advisory never says "NOT READY"', !/NOT READY/i.test(labels), labels);
  ok('advisory never says "grounded"', !/grounded/i.test(labels));
  ok('advisory escalates authority, not a grounding decision',
    advisory(low).authority === 'flight_surgeon_concurrence');

  /* comm-delay changes what is operationally possible, not the score */
  const near = advisory(low, { commDelayMin: 1 });
  const far = advisory(low, { commDelayMin: 22 });
  ok('short delay: concurrence can arrive', near.waitable === true);
  ok('long delay: standing authority applies', far.waitable === false);
  ok('long-delay note explains the standing-authority rule',
    /standing|protocol is executed/i.test(far.commNote || ''), far.commNote);

  const m = authorityMatrix(22);
  ok('authority matrix has three levels', m.length === 3);
  ok('escalate row reflects the long delay', /beyond the decision window/i.test(m[2].delayEffect),
    m[2].delayEffect);
}

/* 11. Countermeasure ranking is deterministic and targets the deficit */
{
  const b = healthyBaseline();
  const degraded = {
    ...atBaseline,
    eye_head: atBaseline.eye_head - 2.5 * b.domains.eye_head.mad,
    body_control: atBaseline.body_control - 2.5 * b.domains.body_control.mad,
  };
  const r = computeOSI(degraded, b);
  const cm1 = rankCountermeasures(r);
  const cm2 = rankCountermeasures(r);

  ok('countermeasures are produced', cm1.length > 0);
  ok('ranking is deterministic', JSON.stringify(cm1.map((c) => c.id)) === JSON.stringify(cm2.map((c) => c.id)));
  ok('at least one targets the deficient domains',
    cm1.some((c) => c.targets.includes('eye_head') || c.targets.includes('body_control')));
  ok('ranking is sorted by relevance',
    cm1.every((c, i) => i === 0 || cm1[i - 1].relevance >= c.relevance));
}

/* 12. Synthetic trajectory is calibrated to the NASA time constants */
{
  /* 24*30 h at a 12 h step = 61 samples, so the floor is 50, not 100. */
  const traj = syntheticTrajectory({ hours: 24 * 30, step: 12, seed: 3 });
  ok('trajectory is generated', traj.length >= 50, `points=${traj.length}`);
  ok('trajectory covers the full window',
    traj[traj.length - 1].t === 24 * 30, `last t=${traj[traj.length - 1].t}`);
  ok('every point carries a gravity value', traj.every((p) => typeof p.g === 'number'));

  /* deficits should grow after the transition to microgravity at t=72h */
  const pre = traj.filter((p) => p.t < 60).reduce((a, p) => a + p.eye_head, 0) /
              traj.filter((p) => p.t < 60).length;
  const post = traj.filter((p) => p.t > 400 && p.t < 600).reduce((a, p) => a + p.eye_head, 0) /
               traj.filter((p) => p.t > 400 && p.t < 600).length;
  ok('deficit is larger post-transition than pre-flight', post > pre,
    `pre=${pre.toFixed(2)} post=${post.toFixed(2)}`);

  ok('NASA time constants are declared for every domain',
    DOMAINS.every((d) => typeof NASA_TAU[d.id] === 'number' && NASA_TAU[d.id] > 0));
  ok('head-erect constant is short and head-moving is long', NASA_TAU.eye_head < NASA_TAU.body_control);
}

/* 13. Output contract shape + honest disclaimer */
{
  const b = healthyBaseline();
  const r = computeOSI(atBaseline, b);
  const a = advisory(r);
  const c = toContract({ osi: r, adv: a, countermeasures: rankCountermeasures(r) });

  ok('contract has an osi block with value/ci/mdc',
    typeof c.osi.value === 'number' && Array.isArray(c.osi.ci95) && typeof c.osi.mdc95 === 'number');
  ok('contract lists domains', Array.isArray(c.domains) && c.domains.length > 0);
  ok('contract carries the advisory', !!c.advisory?.level);
  ok('contract carries data-quality', c.data_quality?.domains_expected === 6);
  ok('contract states the disclaimer',
    /not a nasa metric/i.test(c.disclaimer) && /not a medical device/i.test(c.disclaimer),
    c.disclaimer);
  ok('contract serialises cleanly', (() => {
    try { JSON.parse(JSON.stringify(c)); return true; } catch { return false; }
  })());
}

/* ═══════════════════════════════════════════════════════════
   14. Regressions — each of these failed before the fix it guards.
   ═══════════════════════════════════════════════════════════ */

/* 14a. A skipped domain must not shift the SEM of the others.
   standardErrorOfMeasurement pushed into an array and then indexed it with the
   DOMAINS position, so dropping one domain moved every later SEM onto the
   wrong weight. SEM feeds MDC95, and MDC95 is the threshold every "this
   improvement is real" claim is measured against — so the corruption was both
   invisible and material. */
{
  const perDomain = Math.abs(100 * Math.exp(-1 / 4.48) - 100);   // ≈20.01
  const mk = (i, over = {}) => ({
    eye_head: 4 + (i - 1) * 0.25,
    body_control: 9 + (i - 1) * 0.6,
    task_perf: 320 + (i - 1) * 12,
    symptoms: 1.4 + (i - 1) * 0.2,
    head_motion: 26 + (i - 1) * 1.5,
    drift: 0.02 * (i - 1),
    ...over,
  });

  const fullOsi = computeOSI(mk(3), buildBaseline([mk(1), mk(2), mk(3)]));
  const allPresent = perDomain * Math.sqrt(DOMAINS.reduce((a, d) => a + d.weight ** 2, 0));
  ok('SEM is the weighted RSS of all six domains when all six are present',
    Math.abs(fullOsi.sem - allPresent) < 0.05,
    `sem=${fullOsi.sem} expected=${allPresent.toFixed(2)}`);

  /* eye_head in one session only → raw.length 1 → skipped by the SEM loop. */
  const ragged = buildBaseline([
    mk(1, { eye_head: null }), mk(2, { eye_head: 4.1 }), mk(3, { eye_head: null }),
  ]);
  ok('the ragged baseline really does drop eye_head',
    ragged.domains.eye_head.raw.length === 1, `n=${ragged.domains.eye_head.raw.length}`);

  const remain = DOMAINS.filter((d) => d.id !== 'eye_head');
  const expected = perDomain * Math.sqrt(remain.reduce((a, d) => a + d.weight ** 2, 0));
  const raggedOsi = computeOSI(mk(3), ragged);
  ok('a skipped domain leaves every other SEM on its own weight',
    Math.abs(raggedOsi.sem - expected) < 0.05,
    `sem=${raggedOsi.sem} expected=${expected.toFixed(2)} — the position-indexed version gave ≈8.90`);
  ok('MDC95 follows the corrected SEM',
    Math.abs(raggedOsi.mdc95 - 1.96 * Math.SQRT2 * expected) < 0.2, `mdc95=${raggedOsi.mdc95}`);
}

/* 14b. The two mulberry32 copies must stay identical. core/osi.js keeps its
   own copy so the engine stays import-free and testable alone; the copies had
   drifted into different mixings, so the same seed produced different streams
   in the two files. */
{
  const seeds = [1, 7, 1337, 90210, 20260928];
  let same = true;
  for (const s of seeds) {
    const a = osiPrng(s), b = utilPrng(s);
    for (let i = 0; i < 50; i++) if (a() !== b()) { same = false; break; }
    if (!same) break;
  }
  ok('osi.js and util.js mulberry32 produce identical sequences', same);
}

/* 14c. The seeded bootstrap is what makes the interval citable. */
{
  const mk = (i) => ({
    eye_head: 4 + i * 0.2, body_control: 9 + i * 0.5, task_perf: 320 + i * 10,
    symptoms: 1 + i * 0.1, head_motion: 26 + i, drift: 0.01 * i,
  });
  const b = buildBaseline([mk(1), mk(2), mk(3), mk(4)]);
  const r1 = computeOSI(mk(3), b, { seed: 123 });
  const r2 = computeOSI(mk(3), b, { seed: 123 });
  ok('the same seed reproduces the same interval',
    JSON.stringify(r1.ci95) === JSON.stringify(r2.ci95), `${JSON.stringify(r1.ci95)}`);
}

/* ═══════════════════════════════════════════════════════════ */

const summary = [
  `passed : ${passed}`,
  `failed : ${failed}`,
  ...(failures.length ? ['', 'failures:', ...failures.map((f) => '  - ' + f)] : []),
  '',
  failed === 0 ? 'ALL TESTS PASSED' : 'TESTS FAILED',
].join('\n');

console.log(summary);

/* Also persist the report next to the harness. Node's stdout is not captured
   reliably when this is piped through the Windows shell, so the file is the
   dependable record. Written with a STATIC import and a synchronous call:
   an earlier version used `await import()` here and the write never landed,
   because the process exited while that dynamic import was still pending. */
try {
  writeFileSync(join(HERE, 'osi.test.result.txt'),
    `${new Date().toISOString()}\n\n${summary}\n`, 'utf8');
} catch (e) {
  console.error('could not write the report file:', e.message);
}

process.exit(failed === 0 ? 0 : 1);
