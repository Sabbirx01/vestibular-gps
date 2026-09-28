/* ═══════════════════════════════════════════════════════════
   console — the Mission Console.

   This is where the OSI engine becomes a product the crew can use:
     baseline capture -> live index with uncertainty -> advisory ->
     authority + comm delay -> ranked countermeasures -> recheck with a
     noise-aware verdict -> the JSON record a flight surgeon would receive.

   The live channel mapping is stated honestly in the UI. A domain fed by a
   real sensor says MEASURED; one the crew types in says REPORTED; one with
   nothing behind it says UNAVAILABLE and the index degrades accordingly
   rather than substituting a made-up number.
   ═══════════════════════════════════════════════════════════ */

import { $, $$, el, on, clamp, fmt, download, cssVar } from '../core/util.js';
import { state, set, subscribe, bus, toast } from '../core/store.js';
import {
  DOMAINS, WEIGHT_NOTE, buildBaseline, computeOSI, advisory, authorityMatrix,
  rankCountermeasures, recheckVerdict, toContract, NASA_NUMBERS, NASA_TAU,
} from '../core/osi.js';

const STORE_KEY = 'vgps.console.v1';

/**
 * How each *runtime* provenance string is presented.
 *
 * This used to be a static map keyed by channel id, with every measured-looking
 * channel hard-coded to `kind: 'measured'`. Because the rendered "via" text fell
 * back to that map instead of the live value, a channel fed by the simulator
 * still displayed MEASURED directly underneath a HUD chip reading SIMULATION —
 * the runtime provenance string was computed and then thrown away. Presentation
 * is now driven by what is actually feeding the channel.
 */
const PROV_KIND = {
  simulation: { kind: 'simulated', text: 'Simulator stream — generated on this device, not a measurement' },
  'motion-sensor': { kind: 'measured', text: 'DeviceMotion stream (live sensor)' },
  orientation: { kind: 'measured', text: 'DeviceOrientation stream (live sensor)' },
  lab: { kind: 'measured', text: 'Lab test 04 reaction time, measured this session' },
  reported: { kind: 'reported', text: 'Crew self-report, entered here' },
  derived: { kind: 'derived', text: 'Change in baseline centre over days' },
  'camera (calibrated)': { kind: 'measured', text: 'CameraProvider head-motion estimator, noise floor calibrated' },
  'camera (uncalibrated)': { kind: 'measured', text: 'CameraProvider head-motion estimator, noise floor not yet measured' },
};

/** Resolve a runtime provenance string into a label, a kind and honest copy. */
function channelPresentation(prov) {
  if (!prov) {
    return {
      kind: 'unavailable', label: 'UNAVAILABLE',
      text: 'no live channel — the index renormalises without it',
    };
  }
  const hit = PROV_KIND[prov];
  if (hit) return { kind: hit.kind, label: hit.kind.toUpperCase(), text: hit.text };
  /* Anything unrecognised is an explicit unavailability reason written by
     readChannels(). Show the reason rather than inventing a flattering one. */
  return { kind: 'unavailable', label: 'UNAVAILABLE', text: prov };
}

export function mountConsoleSection(ctx = {}) {
  const root = $('#consoleBody');
  if (!root) return null;

  /* ── Local state ─────────────────────────────────────── */
  const S = {
    sessions: [],          // captured baseline sessions
    live: null,            // current computed session values
    osi: null,
    adv: null,
    cms: [],
    intervention: null,    // { id, startedAt, endsAt, before }
    recheck: null,
    commDelayMin: 0,
    symptoms: 1,
    upcomingTask: 'Mars surface EVA',
  };

  /* ── Persistence ─────────────────────────────────────── */
  const save = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        sessions: S.sessions.slice(-30),
        commDelayMin: S.commDelayMin,
        symptoms: S.symptoms,
        upcomingTask: S.upcomingTask,
      }));
    } catch { /* private mode */ }
  };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) Object.assign(S, JSON.parse(raw));
  } catch { /* ignore */ }

  /* ── Live channel sampling ───────────────────────────── */
  let lastSample = null;
  let lastLiveRenderAt = 0;
  const camRoll = [];
  bus.on('sample', (s) => {
    lastSample = s;
    if (s.source === 'camera') {
      camRoll.push(s);
      if (camRoll.length > 40) camRoll.shift();
      /* CameraProvider emits at ~18 Hz. Recompute the live OSI view at 4 Hz:
         fast enough to be visibly realtime, slow enough that replacing the
         large console DOM never competes with the camera estimator or WebGL. */
      const now = performance.now();
      if (now - lastLiveRenderAt >= 250) {
        lastLiveRenderAt = now;
        recompute();
      }
    }
  });

  /**
   * Build the current session's domain values from whatever is actually live.
   * Anything with no live source is returned as null, and the engine reports
   * the resulting coverage honestly instead of inventing a value.
   */
  function readChannels() {
    const out = {};
    const prov = {};

    const cam = camRoll.length >= 5;
    /* store.js keeps permissions under `perms`. Reading `state.sensors` here
       always produced undefined, so granted hardware was never detected and
       both channels silently fell through to the simulation branch. */
    const motion = state.perms?.motion === 'granted';
    const orientation = state.perms?.orientation === 'granted';
    const sim = state.source === 'SIMULATION';

    /* ── Real signal features ──────────────────────────────
       These read `state.sample`, the object store.js actually writes
       (store.js:267 `s.jerk = …`, where `s = state.sample`). The previous code
       read `state.jerk` — a field that exists nowhere in the codebase — so
       `|| 0` swallowed it and eye_head, body_control and head_motion each
       collapsed to their constant term (4.2 / 9 / 26) no matter what the crew
       did, while the table below still tagged them MEASURED. Those constants
       also gave the captured baseline zero spread, driving MAD to 0 and pinning
       the three sub-scores at exactly 100, which lifted the whole index. */
    const smp = state.sample || {};
    const asFinite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    /* Head movement is angular speed: the vector sum of the three damped rate
       channels, already in this domain's own unit (°/s) — no arbitrary factor. */
    const rateRms = Math.hypot(asFinite(smp.yawRate), asFinite(smp.pitchRate), asFinite(smp.rollRate));

    /* eye–head coordination (°) — REQUIRES eye landmarks.
       NASA derives this from eye AND head together (VOR gain). Neither the
       offline camera provider nor an IMU supplies the eye half, so outside the
       labelled simulator this channel stays unavailable rather than being
       back-filled from head motion. */
    if (sim) {
      out.eye_head = +clamp(4.2 + rateRms * 0.02, 1, 18).toFixed(2);
      prov.eye_head = 'simulation';
    } else if (cam) {
      out.eye_head = null;
      prov.eye_head = 'unavailable — camera measures head motion, not gaze';
    } else {
      out.eye_head = null;
      prov.eye_head = 'unavailable — needs eye-landmark or vHIT input';
    }

    /* postural control (mm) — an uncalibrated mobility proxy driven by the real
       rate signal, not a force-plate recording. The scale is heuristic and the
       channel table says so. */
    if (motion || orientation) {
      out.body_control = +clamp(9 + rateRms * 0.35, 2, 60).toFixed(2);
      prov.body_control = motion ? 'motion-sensor' : 'orientation';
    } else if (sim) {
      out.body_control = +clamp(9 + rateRms * 0.35, 2, 60).toFixed(2);
      prov.body_control = 'simulation';
    } else {
      out.body_control = null;
      prov.body_control = null;
    }

    /* task performance (ms) — from the lab if it has been run */
    const rt = ctx.getReactionMs?.();
    out.task_perf = typeof rt === 'number' && rt > 0 ? +rt.toFixed(0) : null;
    prov.task_perf = out.task_perf === null ? null : 'lab';

    /* symptoms — always available, it is the crew typing it in */
    out.symptoms = S.symptoms;
    prov.symptoms = 'reported';

    /* head movement (°/s) — angular speed, the domain's own unit */
    if (cam) {
      const avg = camRoll.reduce((a, s) => a + s.headMotion, 0) / camRoll.length;
      out.head_motion = +avg.toFixed(2);
      const calibrated = camRoll[camRoll.length - 1]?.calibrated;
      prov.head_motion = calibrated ? 'camera (calibrated)' : 'camera (uncalibrated)';
    } else if (motion || orientation) {
      out.head_motion = +clamp(rateRms, 0, 120).toFixed(2);
      prov.head_motion = motion ? 'motion-sensor' : 'orientation';
    } else if (sim) {
      out.head_motion = +clamp(rateRms, 0, 120).toFixed(2);
      prov.head_motion = 'simulation';
    } else {
      out.head_motion = null;
      prov.head_motion = null;
    }

    /* baseline drift (per day) — needs two captured sessions that BOTH carry the
       channel. Treating a missing endpoint as 0 fabricated a delta out of
       nothing, which is the one thing this file must never do. */
    if (S.sessions.length >= 2) {
      const a = S.sessions[0], b = S.sessions[S.sessions.length - 1];
      const days = Math.max(1, (b.at - a.at) / 86400000);
      const from = a.eye_head, to = b.eye_head;
      if (typeof from === 'number' && typeof to === 'number') {
        out.drift = +((to - from) / days).toFixed(3);
        prov.drift = 'derived';
      } else {
        out.drift = null;
        prov.drift = 'unavailable — first and last session must both carry this channel';
      }
    } else {
      out.drift = null;
      prov.drift = null;
    }

    return { values: out, provenance: prov };
  }

  function recompute() {
    const { values, provenance } = readChannels();
    const baseline = buildBaseline(S.sessions, { gravity: state.mode === 'MICROGRAVITY' ? 0 : 1 });

    S.live = values;
    S.provenance = provenance;
    S.baseline = baseline;
    S.osi = computeOSI(values, baseline);
    S.adv = advisory(S.osi, { commDelayMin: S.commDelayMin, upcomingTask: S.upcomingTask });
    S.cms = rankCountermeasures(S.osi);
    render();
    return S.osi;
  }

  /* ── Actions ─────────────────────────────────────────── */
  function captureSession() {
    const { values } = readChannels();
    const usable = Object.values(values).filter((v) => typeof v === 'number').length;
    if (usable < 2) {
      toast('NOT ENOUGH SIGNAL', 'At least two channels must be live before a session can be captured. Start the simulator or connect a sensor.', 'warn', 8000);
      return;
    }
    const filled = {};
    for (const d of DOMAINS) {
      /* Channels with no live source are stored as null, never as 0.
         Writing a zero would inject a fabricated measurement into the
         reference that the whole mission is then judged against. A null is
         filtered out by buildBaseline, so the domain simply stays unavailable
         and the index renormalises without it. */
      filled[d.id] = typeof values[d.id] === 'number' ? values[d.id] : null;
    }
    filled.at = Date.now();
    filled.provenance = { ...S.provenance };
    S.sessions.push(filled);
    if (S.sessions.length > 30) S.sessions.shift();
    save();
    toast('BASELINE SESSION CAPTURED', `Session ${S.sessions.length} recorded. ${S.sessions.length < 3 ? 'Three or more are needed before the index is stable.' : 'The reference is ready.'}`, 'ok', 6000);
    recompute();
  }

  function startIntervention(cm) {
    S.intervention = {
      id: cm.id,
      name: cm.name,
      before: S.osi?.ok ? S.osi.value : null,
      mdc95: S.osi?.mdc95 ?? 9,
      startedAt: Date.now(),
      endsAt: Date.now() + cm.durationMin * 60000,
      recheckAfterMin: cm.recheckAfterMin,
      protocol: cm.protocol,
    };
    S.recheck = null;
    toast('COUNTERMEASURE STARTED', `${cm.name} — ${cm.durationMin} min. Recheck due in ${cm.recheckAfterMin} min.`, 'ok', 7000);
    render();
  }

  function doRecheck() {
    const before = S.intervention?.before;
    const mdc = S.intervention?.mdc95 ?? 9;
    const { values } = readChannels();
    const after = computeOSI(values, S.baseline);
    S.recheck = recheckVerdict(before, after?.ok ? after.value : null, mdc);
    S.osi = after;
    render();
  }

  function exportContract() {
    const c = toContract({
      osi: S.osi,
      adv: S.adv,
      countermeasures: S.cms,
      gravity: state.mode === 'MICROGRAVITY' ? 0 : 1,
      missionPhase: state.mode === 'MICROGRAVITY' ? 'mars_transit' : 'pre_flight',
    });
    download('vestibular-gps-osi.json', JSON.stringify(c, null, 2));
    toast('RECORD EXPORTED', 'The JSON contract was written to your downloads folder.', 'ok', 6000);
  }

  /* ── Render ──────────────────────────────────────────── */
  function render() {
    root.replaceChildren(
      renderIndex(),
      renderDomains(),
      renderExplain(),
      renderAdvisory(),
      renderAuthority(),
      renderActions(),
      renderRecheck(),
      renderDag(),
      renderContract(),
    );
  }

  function renderIndex() {
    const o = S.osi;
    const wrap = el('div', { class: 'glass panel console-index' });

    if (!o?.ok) {
      wrap.append(
        el('div', { class: 'panel-head' },
          el('p', { class: 'eyebrow', text: 'ORIENTATION STABILITY INDEX' }),
          el('h3', { text: 'No index available yet' }),
          /* No index means no channel had a live source — not that the button
             is broken and not that the baseline is too short (a short
             baseline yields a provisional index, which is a different state).
             The old copy blamed the wrong cause. */
          el('p', { text: o?.reason || 'No channel has a live source yet. Start the sensor simulator in section 06 or the camera in section 10, then press CAPTURE BASELINE SESSION.' }),
        ),
        /* Explicit progress, because clicking capture and seeing nothing change
           is indistinguishable from a broken button. */
        el('div', { class: 'osi-meta' },
          el('span', { class: `tag tag-${S.sessions.length >= 3 ? 'ok' : 'warn'}`,
            text: `BASELINE SESSIONS CAPTURED: ${S.sessions.length} / 3` }),
          el('span', { class: 'tag', text: `LIVE CHANNELS: ${Object.values(S.provenance || {}).filter(Boolean).length} / ${DOMAINS.length}` }),
        ),
        el('div', { class: 'console-hint' },
          el('p', {}, el('b', { text: 'How to get a reading: ' }),
            document.createTextNode('run the sensor simulator from section 06, or connect the camera in section 10, then press CAPTURE BASELINE SESSION. Each click stores one session and the counter above moves.')),
          el('p', { class: 'caption', text: 'Channels with no live source are stored as null, never as zero, so the reference never contains a fabricated value.' }),
        ),
      );
      return wrap;
    }

    const ci = o.ci95;
    const conf = { normal: 'ok', reduced: 'warn', low: 'bad' }[o.confidence] || 'warn';

    const hero = el('div', { class: 'osi-hero' },
      el('div', { class: 'osi-value' },
        el('span', { class: 'osi-num', text: String(o.value) }),
        el('span', { class: 'osi-ci', text: ci ? `[${ci[0]} – ${ci[1]}]` : '[—]' }),
      ),
      el('div', { class: 'osi-meta' },
        o.provisional ? el('span', { class: 'tag tag-warn', text: 'PROVISIONAL' }) : null,
        el('span', { class: `tag tag-${conf}`, text: `CONFIDENCE: ${o.confidence.toUpperCase()}` }),
        el('span', { class: 'tag', text: `COVERAGE ${o.domainsAvailable}/${o.domainsExpected}` }),
        el('span', { class: 'tag', text: `MDC95 ${o.mdc95}` }),
        /* Always shown in the n/3 form so the progress toward a stable
           reference is legible at every stage, not only before the first one. */
        el('span', { class: `tag tag-${S.sessions.length >= 3 ? 'ok' : 'warn'}`,
          text: `BASELINE SESSIONS ${S.sessions.length} / 3` }),
      ),
      o.provisional && o.provisionalNote
        ? el('p', { class: 'osi-note provisional', text: o.provisionalNote })
        : null,
      el('p', { class: 'osi-note' },
        document.createTextNode('CI is a bootstrap interval over the baseline window. '),
        document.createTextNode(ci && (ci[1] - ci[0]) > 20
          ? 'It is wide because the baseline window is still thin — more sessions will narrow it.'
          : 'Changes smaller than MDC95 are not reported as real.'),
      ),
    );

    wrap.append(
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'ORIENTATION STABILITY INDEX · PROPOSED METRIC' }),
        el('h3', { text: 'Crew status, against this person\'s own reference' }),
        el('p', { text: 'Not a NASA metric and not a diagnosis. The domain structure is mapped from NASA\'s published Sensorimotor Risk DAG; the weights are declared heuristics.' }),
      ),
      hero,
    );
    return wrap;
  }

  function renderDomains() {
    const wrap = el('div', { class: 'glass panel' });
    wrap.append(el('div', { class: 'panel-head' },
      el('p', { class: 'eyebrow', text: 'DOMAIN BREAKDOWN' }),
      el('h3', { text: 'Where the number comes from' }),
      el('p', { text: 'Each bar is a sub-score where 100 means "at your own baseline". The z column is the deviation in robust standard deviations; the contribution column is how many index points that domain is adding or removing.' }),
    ));

    const list = el('div', { class: 'dom-list' });
    for (const r of S.osi.rows) {
      const prov = S.provenance?.[r.id];
      const chan = channelPresentation(prov);
      const tile = el('div', { class: `dom ${r.available ? '' : 'is-off'}` },
        el('div', { class: 'dom-top' },
          el('span', { class: 'dom-name', text: r.label }),
          el('span', { class: 'dom-weight', text: `w ${r.weight.toFixed(2)}` }),
        ),
        el('div', { class: 'dom-bar' },
          el('i', { style: `width:${r.available && r.score !== null ? clamp(r.score, 0, 100) : 0}%` }),
        ),
        el('div', { class: 'dom-nums' },
          el('span', { text: r.available && r.score !== null ? `score ${r.score.toFixed(0)}` : 'no signal' }),
          el('span', { text: r.z === null ? 'z —' : `z ${r.z >= 0 ? '+' : ''}${r.z.toFixed(2)}` }),
          el('span', { text: r.available ? `contrib ${r.contribution >= 0 ? '+' : ''}${r.contribution.toFixed(1)}` : '—' }),
        ),
        el('div', { class: 'dom-src' },
          el('span', { class: `tag tag-${chan.kind}`, text: chan.label }),
          el('span', { class: 'dom-via', text: chan.text }),
        ),
      );
      list.append(tile);
    }
    wrap.append(list);

    const sens = S.osi.sensitivity;
    wrap.append(el('div', { class: 'sens-strip' },
      el('span', { class: 'eyebrow', text: 'WEIGHT SENSITIVITY ±20%' }),
      el('span', { class: 'sens-band', text: sens ? `${sens.min} – ${sens.max}  (spread ${sens.spread})` : '—' }),
      el('span', { class: `tag tag-${sens?.stable ? 'ok' : 'warn'}`, text: sens?.stable ? 'CONCLUSION STABLE' : 'CONCLUSION SENSITIVE' }),
      el('p', { class: 'caption', text: WEIGHT_NOTE }),
    ));
    return wrap;
  }

  function renderExplain() {
    const wrap = el('div', { class: 'glass panel' });
    wrap.append(
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'WHY THIS?' }),
        el('h3', { text: 'The plain-language explanation' }),
      ),
      el('p', { class: 'explain-text', text: S.osi?.explanation || '—' }),
      el('div', { class: 'explain-list' },
        ...(S.osi?.topSignals || []).map((id) => {
          const r = S.osi.rows.find((x) => x.id === id);
          return el('div', { class: 'explain-row' },
            el('b', { text: r.label }),
            el('span', { text: `z ${r.z >= 0 ? '+' : ''}${r.z.toFixed(2)} · score ${r.score.toFixed(0)}` }),
            el('em', { text: r.why }),
          );
        }),
        ...(S.osi?.topSignals?.length ? [] : [el('div', { class: 'explain-row' }, el('span', { text: 'No domain is outside its usual range.' }))]),
      ),
    );
    return wrap;
  }

  function renderAdvisory() {
    const a = S.adv;
    const cls = { clear: 'ok', mitigate: 'warn', escalate: 'bad', unknown: 'info' }[a.level] || 'info';
    return el('div', { class: `glass panel advisory advisory-${cls}` },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: `READINESS ADVISORY · ${S.upcomingTask.toUpperCase()}` }),
        el('h3', { text: a.label }),
        el('p', { text: a.detail }),
      ),
      el('div', { class: 'advisory-row' },
        el('span', { class: 'tag', text: `AUTHORITY: ${a.authority.replace(/_/g, ' ').toUpperCase()}` }),
        a.preAuthorizedProtocol ? el('span', { class: 'tag tag-warn', text: `PROTOCOL ${a.preAuthorizedProtocol}` }) : null,
        el('span', { class: 'tag', text: `COMM DELAY ${a.commDelayMin} MIN ONE-WAY` }),
      ),
      a.commNote ? el('p', { class: 'advisory-comm', text: a.commNote }) : null,
      el('p', { class: 'caption', text: 'Software does not ground a crew member. This is an advisory and an escalation path; the flight surgeon holds the authority.' }),
    );
  }

  function renderAuthority() {
    const rows = authorityMatrix(S.commDelayMin);
    const wrap = el('div', { class: 'glass panel' });
    wrap.append(
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'CREW AUTHORITY MATRIX' }),
        el('h3', { text: 'Who decides, given the light-time delay' }),
        el('p', { text: 'Mars one-way light time runs from about 3 to 22 minutes. Beyond roughly 6 minutes round trip you cannot wait for an answer, so the crew acts under standing authority and the review happens afterwards.' }),
      ),
      el('div', { class: 'ctl-row' },
        el('label', { for: 'commDelay', text: 'ONE-WAY LIGHT TIME' }),
        el('input', {
          id: 'commDelay', type: 'range', min: '0', max: '22', step: '1',
          value: String(S.commDelayMin),
          oninput: (e) => { S.commDelayMin = +e.target.value; save(); recompute(); },
        }),
        el('output', { text: `${S.commDelayMin} min` }),
      ),
      el('table', { class: 'matrix' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'LEVEL' }), el('th', { text: 'WHO ACTS' }),
          el('th', { text: 'RULE' }), el('th', { text: 'EFFECT OF DELAY' }))),
        el('tbody', {}, ...rows.map((r) => el('tr', { class: `row-${r.colour}` },
          el('td', {}, el('span', { class: `tag tag-${r.colour}`, text: r.level })),
          el('td', { text: r.who }),
          el('td', { text: r.rule }),
          el('td', { text: r.delayEffect }),
        ))),
      ),
    );
    return wrap;
  }

  function renderActions() {
    const wrap = el('div', { class: 'glass panel' });
    wrap.append(
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'ACTION CENTER' }),
        el('h3', { text: 'What to do next' }),
        el('p', { text: 'Ranked against the domains that are actually out of range. Every countermeasure ends in a recheck, because an intervention without a verification step is just an activity.' }),
      ),
    );

    if (!S.cms.length) {
      wrap.append(el('p', { class: 'caption', text: 'Nothing triggered. No domain is far enough from baseline to warrant a countermeasure.' }));
      return wrap;
    }

    const list = el('div', { class: 'cm-list' });
    for (const cm of S.cms) {
      const running = S.intervention?.id === cm.id;
      list.append(el('div', { class: `cm ${running ? 'is-running' : ''}` },
        el('div', { class: 'cm-top' },
          el('span', { class: 'cm-id', text: cm.id }),
          el('b', { class: 'cm-name', text: cm.name }),
          cm.protocol ? el('span', { class: 'tag tag-warn', text: cm.protocol }) : null,
          el('span', { class: 'cm-rel', text: `relevance ${(cm.relevance * 100).toFixed(0)}%` }),
        ),
        el('p', { class: 'cm-desc', text: cm.description }),
        el('div', { class: 'cm-meta' },
          el('span', { text: `${cm.durationMin} min` }),
          el('span', { text: `expected ${cm.expected}` }),
          el('span', { text: `recheck in ${cm.recheckAfterMin} min` }),
        ),
        el('button', {
          type: 'button', class: `btn btn-sm ${running ? 'is-on' : ''}`,
          text: running ? 'RUNNING — RECHECK WHEN DONE' : 'START',
          onclick: () => startIntervention(cm),
        }),
      ));
    }
    wrap.append(list);
    return wrap;
  }

  function renderRecheck() {
    const wrap = el('div', { class: 'glass panel' });
    const iv = S.intervention;

    wrap.append(
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'RECHECK' }),
        el('h3', { text: 'Did it actually work?' }),
        el('p', { text: 'A change only counts if it clears the minimal detectable change. Anything smaller cannot be told apart from ordinary session-to-session variation, and reporting it as an improvement would be overclaiming.' }),
      ),
    );

    if (!iv) {
      wrap.append(el('p', { class: 'caption', text: 'Start a countermeasure and a recheck will appear here.' }));
      return wrap;
    }

    wrap.append(el('div', { class: 'recheck-head' },
      el('span', { class: 'tag', text: `LAST: ${iv.name}` }),
      el('span', { class: 'tag', text: `BEFORE ${iv.before ?? '—'}` }),
      el('span', { class: 'tag', text: `MDC95 ${iv.mdc95}` }),
    ));

    if (S.recheck) {
      const v = S.recheck;
      const cls = v.clearsNoiseFloor ? (v.delta > 0 ? 'ok' : 'bad') : 'info';
      wrap.append(
        el('div', { class: `recheck-verdict verdict-${cls}` },
          el('b', { text: v.label }),
          el('span', { text: `${v.before} → ${v.after}   (${v.delta >= 0 ? '+' : ''}${v.delta})` }),
          el('p', { text: v.note }),
        ),
      );
    }

    wrap.append(
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-primary', text: 'RUN RECHECK NOW', onclick: doRecheck }),
        el('button', { type: 'button', class: 'btn', text: 'CAPTURE AS BASELINE', onclick: captureSession }),
      ),
    );
    return wrap;
  }

  function renderDag() {
    const wrap = el('div', { class: 'glass panel' });
    wrap.append(
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'TRACEABILITY' }),
        el('h3', { text: 'Every domain maps to a NASA Sensorimotor Risk DAG node' }),
        el('p', { text: 'This is the Relevance argument in one table. The index is not a free-floating invention: its structure comes from the causal model NASA publishes, and each domain names the measurement it descends from.' }),
      ),
      el('table', { class: 'matrix' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'DOMAIN' }), el('th', { text: 'NASA DAG NODE' }),
          el('th', { text: 'NASA MEASUREMENT' }), el('th', { text: 'TIME CONSTANT' }))),
        el('tbody', {}, ...DOMAINS.map((d) => el('tr', {},
          el('td', {}, el('b', { text: d.label })),
          el('td', { text: d.dag }),
          el('td', { text: d.nasaTest }),
          el('td', { text: `${NASA_TAU[d.id]} h` }),
        ))),
      ),
      el('div', { class: 'num-grid' },
        ...NASA_NUMBERS.map((n) => el('div', { class: 'num-cell' },
          el('span', { class: 'num-k', text: n.k }),
          el('span', { class: 'num-v', text: n.v }),
        )),
      ),
      el('p', { class: 'caption', text: 'Time constants and measured values are from NASA\'s Sensorimotor Evidence Report. They drive the synthetic trajectory, which is why the simulation can be described as calibrated rather than invented.' }),
    );
    return wrap;
  }

  function renderContract() {
    const c = toContract({
      osi: S.osi, adv: S.adv, countermeasures: S.cms,
      gravity: state.mode === 'MICROGRAVITY' ? 0 : 1,
      missionPhase: state.mode === 'MICROGRAVITY' ? 'mars_transit' : 'pre_flight',
    });
    const burden = S.cms.reduce((a, x) => a + x.durationMin, 0) + (Object.values(S.provenance || {}).filter(Boolean).length * 0.4);

    return el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'RECORD + CREW BURDEN' }),
        el('h3', { text: 'The handoff packet a flight surgeon would receive' }),
        el('p', { text: 'Structured, bandwidth-cheap and delay-tolerant, because on a Mars transit you cannot stream video to a doctor and wait.' }),
      ),
      el('div', { class: 'btn-row' },
        el('button', { type: 'button', class: 'btn btn-primary', text: 'DOWNLOAD JSON', onclick: exportContract }),
        el('button', { type: 'button', class: 'btn', text: 'CAPTURE BASELINE SESSION', onclick: captureSession }),
        el('span', { class: 'tag', text: `CREW BURDEN ≈ ${burden.toFixed(1)} MIN TODAY` }),
      ),
      el('pre', { class: 'contract', text: JSON.stringify(c, null, 2).slice(0, 2200) }),
    );
  }

  /* ── Boot ────────────────────────────────────────────── */
  on($('#consoleCapture'), 'click', captureSession);
  on($('#consoleSymptoms'), 'input', (e) => {
    S.symptoms = +e.target.value;
    const out = $('#consoleSymptomsOut');
    if (out) out.textContent = `${S.symptoms}/10`;
    save();
  });
  on($('#consoleTask'), 'change', (e) => {
    S.upcomingTask = e.target.value;
    save();
    recompute();
  });

  subscribe((s, changed) => {
    if (changed.includes('source') || changed.includes('mode') || changed.includes('sensors')) recompute();
  });

  /* The index also has to move when the live channels move, not only when the
     store changes, so it is refreshed on a slow timer as well. */
  const timer = setInterval(recompute, 2000);

  recompute();
  return {
    recompute,
    captureSession,
    dispose() { clearInterval(timer); },
    get state() { return S; },
  };
}
