/* ═══════════════════════════════════════════════════════════
   integration — how this actually connects to real hardware.

   The honest answer to "how do we hook it up to the astronaut's sensors"
   is: a documented ingestion contract, three supported transport paths,
   and a mapping table from each domain to the instrument NASA or its
   analogs actually use for it.

   Everything on this panel is functional, not a picture:
     • the JSON contract can be edited and ingested here, live
     • a sample payload can be downloaded to hand to an engineer
     • the camera pipeline can be started, and states plainly what it
       measures and what it does not
   ═══════════════════════════════════════════════════════════ */

import { $, el, on, clamp, download } from '../core/util.js';
import { state, bus, toast, set } from '../core/store.js';
import { DOMAINS, buildBaseline, computeOSI } from '../core/osi.js';

/* ── The ingestion contract ──────────────────────────────── */

export const SAMPLE_PAYLOAD = {
  schema: 'vestibular-gps/ingest/v1',
  subject_id: 'AST-07',
  session: {
    kind: 'baseline',
    gravity: 1.0,
    mission_phase: 'pre_flight',
    captured_at: '2026-10-02T09:14:00Z',
    duration_s: 142,
  },
  channels: {
    eye_head: { value: 4.1, unit: 'deg', source: 'vhit_goggles', quality: 0.94 },
    body_control: { value: 8.8, unit: 'mm', source: 'force_plate', quality: 0.97 },
    task_perf: { value: 418, unit: 'ms', source: 'ftt_pegboard', quality: 0.9 },
    symptoms: { value: 1, unit: '/10', source: 'self_report', quality: 1 },
    head_motion: { value: 27.4, unit: 'deg_s', source: 'imu_chest', quality: 0.92 },
    drift: { value: 0.01, unit: 'per_day', source: 'derived', quality: 0.8 },
  },
  provenance: {
    device_clock_synced: true,
    operator: 'crew_self_administered',
    notes: 'Protocol PA-1, seated, 5 min rest before capture.',
  },
};

/* ── Real instruments, and the transport for each ────────── */

const HARDWARE = [
  {
    domain: 'eye_head',
    instrument: 'Video head-impulse goggles (vHIT)',
    detail: 'A high-frame-rate camera in goggles measures eye movement against imposed head impulses and returns VOR gain per canal. NASA runs exactly this in the CIPHER Neuro-Vestibular Examination during and after flight.',
    transport: 'Native SDK export → CSV/JSON on the tablet → ingested over the contract below.',
    domain_unit: 'deg (gaze error proxy)',
  },
  {
    domain: 'body_control',
    instrument: 'Force plate / computerized dynamic posturography',
    detail: 'Centre-of-pressure time series across the six sensory conditions. This is where NASA records its largest post-flight decrements.',
    transport: 'Serial or USB at 100 Hz → local bridge process → WebSocket → browser.',
    domain_unit: 'mm RMS sway',
  },
  {
    domain: 'task_perf',
    instrument: 'Functional Task Test battery',
    detail: 'Timed pegboard, force modulation, bimanual coordination and a course walk. NASA\'s FTT is the operational-readiness layer.',
    transport: 'Tablet app timings, or manual entry, over the same contract.',
    domain_unit: 'ms',
  },
  {
    domain: 'symptoms',
    instrument: 'Motion-sickness questionnaire',
    detail: 'The subjective instrument NASA uses alongside the measured domains, during and after G-transitions.',
    transport: 'In-app form. Always available — this one needs no hardware.',
    domain_unit: '/10',
  },
  {
    domain: 'head_motion',
    instrument: 'Body-worn IMU (chest / head)',
    detail: 'Angular rate and linear acceleration. NASA uses body-worn inertial sensors and a head-mounted motion sensor for dynamic head-tilt assessment.',
    transport: 'Bluetooth LE → Web Bluetooth, or a bridge process over WebSocket.',
    domain_unit: 'deg/s',
  },
  {
    domain: 'drift',
    instrument: '(derived)',
    detail: 'Not an instrument — the change in a subject\'s baseline centre over the mission. On a 730–1224 day Mars mission this slow component is what actually matters.',
    transport: 'Computed in-app from captured sessions.',
    domain_unit: 'per day',
  },
];

/* ── Transport paths ─────────────────────────────────────── */

const TRANSPORTS = [
  {
    id: 'A',
    name: 'Browser-native sensors',
    status: 'implemented',
    statusColour: 'ok',
    who: 'Any crew tablet or phone',
    how: 'DeviceOrientation and DeviceMotion after an explicit permission prompt. Works today, no extra hardware.',
    limits: 'Relative orientation only, and Chrome requires a tap before the first event. Not a substitute for an IMU.',
  },
  {
    id: 'B',
    name: 'Local bridge over WebSocket',
    status: 'contract documented',
    statusColour: 'warn',
    who: 'Force plate, IMU, vHIT goggles, any lab instrument',
    how: 'A small process on the tablet reads the instrument (serial / USB / BLE / vendor SDK), maps it into the ingest contract, and pushes it over ws://localhost. The page subscribes and the index updates.',
    limits: 'Needs the bridge running. The bridge is deliberately not included, because every instrument speaks a different dialect.',
  },
  {
    id: 'C',
    name: 'File or manual ingestion',
    status: 'implemented',
    statusColour: 'ok',
    who: 'Stored sessions, ground analysis, rehearsal',
    how: 'Paste a JSON payload below, or capture from the live channels. This is the same contract the bridge would emit.',
    limits: 'Not real time by definition.',
  },
];

/* ═══════════════════════════════════════════════════════════ */

export function mountIntegrationSection({ camera } = {}) {
  const root = $('#integrationBody');
  if (!root) return null;

  const S = { lastIngest: null, camera };

  function render() {
    root.replaceChildren(
      renderFlow(),
      renderProviders(),
      renderTransports(),
      renderHardware(),
      renderCamera(),
      renderIngest(),
    );
  }

  /* ── 1. Data flow ─────────────────────────────────────── */
  function renderFlow() {
    const steps = [
      ['SENSE', 'Instrument or device produces a signal'],
      ['INGEST', 'Mapped into the v1 contract, one value per domain'],
      ['BASELINE', 'Robust median / MAD reference from the subject\'s own history'],
      ['INDEX', 'OSI with a bootstrap interval and an MDC floor'],
      ['ADVISORY', 'Level, authority and the comm-delay rule applied'],
      ['ACT', 'Ranked countermeasure, pre-authorized where needed'],
      ['RECHECK', 'Delta against the noise floor — or it is not reported'],
    ];
    return el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'A-TO-Z DATA FLOW' }),
        el('h3', { text: 'From the instrument in the room to the decision in orbit' }),
        el('p', { text: 'Seven stages, no stage skipped. The loop closes at the recheck, which is what makes this a monitor rather than a dashboard.' }),
      ),
      el('div', { class: 'flow-steps' },
        ...steps.map(([k, v], i) => el('div', { class: 'flow-step' },
          el('span', { class: 'flow-i', text: String(i + 1).padStart(2, '0') }),
          el('b', { text: k }),
          el('span', { text: v }),
        )),
      ),
    );
  }

  /* ── 2. Providers available right now ─────────────────── */
  function renderProviders() {
    const rows = [
      /* Permissions live on state.perms (see core/store.js). The old
         state.sensors path never resolved, so this table reported every
         hardware provider as IDLE even while it was streaming. */
      { id: 'orientation', label: 'DeviceOrientation', state: state.perms?.orientation || 'idle', kind: 'hardware' },
      { id: 'motion', label: 'DeviceMotion', state: state.perms?.motion || 'idle', kind: 'hardware' },
      { id: 'geolocation', label: 'Geolocation (separate layer)', state: state.perms?.geo || 'idle', kind: 'hardware' },
      { id: 'camera', label: 'Front camera — head motion', state: S.camera?.status || 'idle', kind: 'vision' },
      { id: 'simulation', label: 'Simulation (always available)', state: 'available', kind: 'generated' },
      { id: 'replay', label: 'Replay (recorded session)', state: 'available', kind: 'stored' },
    ];
    const colour = (s) => (s === 'granted' || s === 'available' ? 'ok' : s === 'denied' ? 'bad' : 'info');

    return el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'SENSOR PROVIDERS' }),
        el('h3', { text: 'What is connected on this device, right now' }),
        el('p', { text: 'Read from live state, not from a table someone typed. Declining a permission degrades the index; it never breaks the page.' }),
      ),
      el('table', { class: 'matrix' },
        el('thead', {}, el('tr', {},
          el('th', { text: 'PROVIDER' }), el('th', { text: 'CLASS' }), el('th', { text: 'STATUS' }))),
        el('tbody', {}, ...rows.map((r) => el('tr', {},
          el('td', {}, el('b', { text: r.label })),
          el('td', { text: r.kind }),
          el('td', {}, el('span', { class: `tag tag-${colour(r.state)}`, text: String(r.state).toUpperCase() })),
        ))),
      ),
    );
  }

  /* ── 3. Transport paths ───────────────────────────────── */
  function renderTransports() {
    return el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'HOW TO CONNECT REAL EQUIPMENT' }),
        el('h3', { text: 'Three transport paths' }),
        el('p', { text: 'You cannot put a force plate on a Mars transit and you cannot put a browser in a lab rack. So the ingestion contract is the interface, and the transport is replaceable.' }),
      ),
      el('div', { class: 'path-list' },
        ...TRANSPORTS.map((t) => el('div', { class: 'path' },
          el('div', { class: 'path-top' },
            el('span', { class: 'cm-id', text: `PATH ${t.id}` }),
            el('b', { text: t.name }),
            el('span', { class: `tag tag-${t.statusColour}`, text: t.status.toUpperCase() }),
          ),
          el('p', { class: 'path-who', text: `For: ${t.who}` }),
          el('p', { text: t.how }),
          el('p', { class: 'caption', text: `Limits: ${t.limits}` }),
        )),
      ),
    );
  }

  /* ── 4. Instrument mapping ───────────────────────────── */
  function renderHardware() {
    return el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'INSTRUMENT MAPPING' }),
        el('h3', { text: 'Which real instrument feeds which domain' }),
        el('p', { text: 'Every domain names the measurement it descends from, and the transport that would carry it. Nothing here claims to be a clinical replacement for any of these instruments.' }),
      ),
      el('div', { class: 'hw-list' },
        ...HARDWARE.map((h) => el('div', { class: 'hw' },
          el('div', { class: 'hw-top' },
            el('b', { text: h.instrument }),
            el('span', { class: 'tag', text: h.domain_unit }),
          ),
          el('p', { text: h.detail }),
          el('p', { class: 'hw-transport' }, el('b', { text: 'Transport: ' }), document.createTextNode(h.transport)),
        )),
      ),
    );
  }

  /* ── 5. Camera pipeline, live ────────────────────────── */
  function renderCamera() {
    const c = S.camera;
    const wrap = el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'CAMERA PIPELINE' }),
        el('h3', { text: 'Head motion from the front camera' }),
        el('p', { text: 'Runs entirely on this device. No frame is uploaded, ever. It measures head motion by block-matching consecutive frames; it does not measure gaze.' }),
      ),
    );

    const cv = el('canvas', { class: 'cam-preview', width: '240', height: '180' });
    const video = el('video', { class: 'cam-video', autoplay: true, muted: true, playsinline: true });

    const calState = !c ? 'NOT STARTED' : c.calibrating ? `CALIBRATING ${Math.round((c.calProgress || 0) * 100)}%` : c.calibrated ? 'CALIBRATED' : 'NOT CALIBRATED — HOLD-STILL FLOOR NOT MEASURED';
    const calColour = !c ? 'info' : c.calibrating ? 'warn' : c.calibrated ? 'ok' : 'warn';

    wrap.append(
      el('div', { class: 'cam-stage' }, video, cv),
      el('div', { class: 'cam-rows' },
        row('STATUS', c ? String(c.status).toUpperCase() : 'NOT STARTED'),
        row('SECURE CONTEXT', window.isSecureContext ? 'YES' : 'NO — CAMERA BLOCKED'),
        row('SAMPLES', c ? String(c.samples) : '0'),
        row('ANALYSIS RATE', c ? `${c.hz?.avg ? c.hz.avg.toFixed(1) : '—'} Hz` : '—'),
        row('MOTION ENERGY (ABOVE FLOOR)', c ? Math.max(0, c.motionEnergy - (c.noiseFloor?.energy ?? 0)).toFixed(4) : '—'),
        row('JITTER (ABOVE FLOOR)', c ? Math.max(0, c.jitter - (c.noiseFloor?.jitter ?? 0)).toFixed(4) : '—'),
      ),
      el('div', { class: 'cam-rows' },
        el('div', { class: 'cam-row' }, el('span', { text: 'CALIBRATION' }),
          el('span', { class: `tag tag-${calColour}`, text: calState })),
      ),
      el('div', { class: 'btn-row' },
        el('button', {
          type: 'button', class: 'btn btn-primary', text: 'START CAMERA SCAN',
          onclick: async (e) => {
            e.target.disabled = true;
            e.target.textContent = 'REQUESTING PERMISSION…';
            const ok = await S.camera?.start();
            e.target.disabled = false;
            e.target.textContent = ok ? 'CAMERA RUNNING' : 'RETRY CAMERA SCAN';
            if (ok) S.camera.attachPreview(video);
            render();
          },
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'CALIBRATE (HOLD STILL 2s)',
          disabled: !c?.running,
          onclick: async (e) => {
            if (!S.camera?.running) { toast('START THE CAMERA FIRST', 'Calibration measures this device\'s own noise floor while the camera is running.', 'warn', 6000); return; }
            e.target.disabled = true;
            toast('CALIBRATING', 'Hold your head still for about two seconds.', 'info', 4000);
            await S.camera.calibrate();
            e.target.disabled = false;
            toast('CALIBRATED', 'This camera\'s idle noise floor is now subtracted from every reading, so what reaches the index is motion above the device\'s own noise.', 'ok', 6000);
            render();
          },
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'STOP',
          onclick: () => { S.camera?.stop(); render(); },
        }),
        el('span', { class: 'tag tag-info', text: 'MEASURES HEAD MOTION · NOT GAZE' }),
      ),
      el('p', { class: 'caption', text: 'Why calibration matters: every webcam has its own sensor noise (exposure, gain, compression), which reads as a small amount of "motion" even when perfectly still. CALIBRATE measures that noise floor for this specific camera and subtracts it from every subsequent reading, so a genuinely still head reports as still — not as a few degrees per second of phantom motion.' }),
      el('p', { class: 'caption', text: 'Why not a landmark model: MediaPipe Face Mesh is roughly 3 MB of model plus WASM from a CDN, which would break the offline guarantee this project is built on. A landmark model is a documented upgrade path — the provider interface accepts one unchanged.' }),
    );

    /* draw the live processing view so the pipeline is visible, not asserted */
    const g = cv.getContext('2d');
    const draw = () => {
      requestAnimationFrame(draw);
      if (!c || !c.running || !c.canvas) { return; }
      g.clearRect(0, 0, 240, 180);
      g.imageSmoothingEnabled = false;
      /* the actual 64x48 buffer the estimator works on, magnified */
      g.drawImage(c.canvas, 0, 0, 240, 180);
      g.strokeStyle = 'rgba(95,227,255,0.85)';
      g.lineWidth = 1;
      const vx = 120 + c.dx * 6, vy = 90 + c.dy * 6;
      g.beginPath(); g.moveTo(120, 90); g.lineTo(vx, vy); g.stroke();
      g.beginPath(); g.arc(120, 90, 3, 0, Math.PI * 2); g.fillStyle = '#5fe3ff'; g.fill();
      g.fillStyle = 'rgba(95,227,255,0.9)';
      g.font = '10px ui-monospace, monospace';
      g.fillText(`dx ${c.dx}  dy ${c.dy}`, 8, 172);
    };
    draw();

    return wrap;

    function row(k, v) {
      return el('div', { class: 'cam-row' }, el('span', { text: k }), el('b', { text: v }));
    }
  }

  /* ── 6. Live ingest ──────────────────────────────────── */
  function renderIngest() {
    const ta = el('textarea', {
      class: 'ingest-box', spellcheck: 'false', rows: '12',
      text: S.lastIngest ?? JSON.stringify(SAMPLE_PAYLOAD, null, 2),
    });

    const result = el('div', { class: 'ingest-result' });
    if (S.lastIngestResult) result.append(...S.lastIngestResult);

    return el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'LIVE INGEST' }),
        el('h3', { text: 'Paste a payload and the index recomputes' }),
        el('p', { text: 'This is the same contract a bridge process would emit. Editing the numbers below and ingesting them proves the path works end to end rather than describing it.' }),
      ),
      el('pre', { class: 'schema', text: `POST  ws://localhost/vgps/ingest\nContent-Type: application/json\n\n{\n  "$schema": "vestibular-gps/ingest/v1",\n  "subject_id": string,\n  "session": { "kind": "baseline"|"sample", "gravity": number,\n               "mission_phase": string, "captured_at": ISO8601 },\n  "channels": {\n    "eye_head"     : { value, unit:"deg",    source, quality },\n    "body_control" : { value, unit:"mm",     source, quality },\n    "task_perf"    : { value, unit:"ms",     source, quality },\n    "symptoms"     : { value, unit:"/10",    source, quality },\n    "head_motion"  : { value, unit:"deg_s",  source, quality },\n    "drift"        : { value, unit:"per_day",source, quality }\n  }\n}` }),
      ta,
      el('div', { class: 'btn-row' },
        el('button', {
          type: 'button', class: 'btn btn-primary', text: 'INGEST PAYLOAD',
          onclick: () => ingest(ta.value, result),
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'DOWNLOAD SAMPLE',
          onclick: () => download('vestibular-gps-ingest-sample.json', JSON.stringify(SAMPLE_PAYLOAD, null, 2)),
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'RESET',
          onclick: () => { S.lastIngest = null; S.lastIngestResult = null; render(); },
        }),
      ),
      result,
    );
  }

  /**
   * Validate and ingest a payload.
   *
   * Validation is deliberately strict: an ingest path that silently accepts a
   * malformed payload is worse than one that rejects it, because the failure
   * then surfaces as a wrong health number instead of an error.
   */
  function ingest(text, resultEl) {
    const lines = [];
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      lines.push(el('p', { class: 'ingest-bad', text: `Rejected: the payload is not valid JSON (${e.message}).` }));
      resultEl.replaceChildren(...lines);
      return;
    }

    const errors = [];
    if (!payload?.channels || typeof payload.channels !== 'object') errors.push('missing "channels" object');
    if (payload?.schema && !/^vestibular-gps\/ingest\/v1$/.test(payload.schema)) errors.push(`unknown schema "${payload.schema}"`);

    const values = {};
    const accepted = [];
    const rejected = [];

    for (const d of DOMAINS) {
      const ch = payload?.channels?.[d.id];
      if (!ch) { rejected.push(`${d.id}: not present, index will renormalise without it`); continue; }
      const v = typeof ch === 'object' ? ch.value : ch;
      if (typeof v !== 'number' || !isFinite(v)) {
        errors.push(`${d.id}: value must be a finite number`);
        continue;
      }
      if (typeof ch.quality === 'number' && ch.quality < 0.4) {
        rejected.push(`${d.id}: quality ${ch.quality} below the 0.4 floor, discarded`);
        continue;
      }
      values[d.id] = v;
      accepted.push(`${d.id} = ${v} ${ch.unit || ''} from ${ch.source || 'unspecified'}`.trim());
    }

    if (errors.length) {
      lines.push(el('p', { class: 'ingest-bad', text: 'Rejected:' }));
      lines.push(el('ul', { class: 'ingest-ul' }, ...errors.map((e) => el('li', { text: e }))));
      resultEl.replaceChildren(...lines);
      return;
    }

    /* Feed the console's own baseline so the ingested sample is measured
       against the reference the crew actually established — not a fresh one. */
    const baseline = buildBaseline(window.__VGPS_CONSOLE__?.state?.sessions || []);
    const osi = computeOSI(values, baseline);

    S.lastIngest = text;
    lines.push(el('p', { class: 'ingest-ok', text: `Accepted ${accepted.length} of ${DOMAINS.length} channels.` }));
    if (accepted.length) lines.push(el('ul', { class: 'ingest-ul' }, ...accepted.map((a) => el('li', { text: a }))));
    if (rejected.length) lines.push(el('ul', { class: 'ingest-ul ingest-warn' }, ...rejected.map((a) => el('li', { text: a }))));

    lines.push(el('div', { class: 'ingest-summary' },
      osi.ok
        ? el('b', { text: `Index would read ${osi.value}  ${osi.ci95 ? `[${osi.ci95[0]}–${osi.ci95[1]}]` : ''}  with coverage ${osi.domainsAvailable}/${osi.domainsExpected}` })
        : el('b', { text: `No index: ${osi.reason}` }),
    ));
    if (osi.ok) {
      lines.push(el('p', { class: 'caption', text: `${osi.explanation} Confidence: ${osi.confidence}. MDC95: ${osi.mdc95}.` }));
    }

    S.lastIngestResult = lines;
    resultEl.replaceChildren(...lines);
    toast('PAYLOAD INGESTED', `${accepted.length}/${DOMAINS.length} channels accepted.`, 'ok', 5000);
  }

  /* ── Boot ────────────────────────────────────────────── */
  bus.on('sensor', () => render());
  render();
  return { render, get state() { return S; } };
}
