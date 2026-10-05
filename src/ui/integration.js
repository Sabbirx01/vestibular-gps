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
  let assistantShell = null;

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
      { id: 'camera', label: 'Front camera — face scan + head motion', state: S.camera?.status || 'idle', kind: 'vision' },
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
    const fc = c?.face || state.camera?.face || null;
    const wrap = el('div', { class: 'glass panel' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'CAMERA PIPELINE' }),
        el('h3', { text: 'Face + eye scan — real local landmarks from the front camera' }),
        el('p', { text: 'Runs entirely on this device. No frame is uploaded, ever. The eye LANDMARK layer only draws when real local face/iris landmarks are detected; when detection is weak or unavailable it says so — never a simulated eye result. The analysis window additionally shows the live 64×48 buffer the estimator itself works on, labelled on screen as not a landmark scan, so the panel stays live even when the landmark model cannot start. It never reports clinical VOR or vHIT from a normal webcam.' }),
      ),
    );

    /* ONE view, not two. This panel used to show the mirrored preview beside a
       separate analysis-buffer canvas; side by side they read as two camera
       feeds, which is exactly how they were reported. The scan overlay is now
       drawn ON the preview, so the box, the pose and the picture are the same
       image. The overlay canvas is flipped with the video (the analysis buffer
       is un-mirrored, the preview is not), so the box lands on the cheek the
       subject actually sees. */
    const cv = el('canvas', { class: 'cam-overlay', width: '640', height: '480', 'aria-label': 'Face scan overlay' });
    const video = el('video', { class: 'cam-video', autoplay: true, muted: true, playsinline: true, 'aria-label': 'Live camera preview' });
    const eyeMap = el('canvas', { class: 'cam-eye-map', width: '640', height: '480', 'aria-label': 'Live face analysis map' });
    const verifyBox = el('div', { class: 'cam-verify' });

    const calState = !c ? 'NOT STARTED' : c.calibrating ? `CALIBRATING ${Math.round((c.calProgress || 0) * 100)}%` : c.calibrated ? 'CALIBRATED' : 'NOT CALIBRATED — HOLD-STILL FLOOR NOT MEASURED';
    const calColour = !c ? 'info' : c.calibrating ? 'warn' : c.calibrated ? 'ok' : 'warn';
    const liveRows = {
      status: row('STATUS', c ? String(c.status).toUpperCase() : 'NOT STARTED'),
      secure: row('SECURE CONTEXT', window.isSecureContext ? 'YES' : 'NO — CAMERA BLOCKED'),
      samples: row('SAMPLES', c ? String(c.samples) : '0'),
      /* Gated on `running`, not on the presence of the provider object: the
         provider exists in an IDLE state before START, so truthiness alone let
         a stopped estimator report its smoothed mean as "0.0 Hz". */
      rate: row('ANALYSIS RATE', c?.running ? `${c.hz?.mean ? c.hz.mean().toFixed(1) : '—'} Hz` : '—'),
      /* These two rows read `state.camera`, which is always a zeroed object —
         so before the camera ever started they reported "0.00 deg/s" and "0%",
         i.e. a healthy reading for a sensor that was off. Every other row in
         this table is gated on the live provider handle `c`; these now match. */
      head: row('LIVE HEAD MOTION', c?.running ? `${state.camera.headMotion.toFixed(2)} deg/s` : '—'),
      vor: row('CLINICAL VOR / vHIT', 'UNAVAILABLE — WEBCAM IS NOT A CLINICAL vHIT'),
      eyes: row('EYE LANDMARKS', c?.running ? eyeText(state.camera.eye) : '—'),
      eyemodel: row('EYE MODEL', eyeModelText(c?.running ? state.camera.eye : null)),
      gaze: row('GAZE OFFSET · EXPERIMENTAL', c?.running ? gazeText(state.camera.eye) : '—'),
      quality: row('SIGNAL QUALITY', c?.running ? `${Math.round(state.camera.quality * 100)}%` : '—'),
      energy: row('MOTION ENERGY (ABOVE FLOOR)', c ? Math.max(0, c.motionEnergy - (c.noiseFloor?.energy ?? 0)).toFixed(4) : '—'),
      jitter: row('JITTER (ABOVE FLOOR)', c ? Math.max(0, c.jitter - (c.noiseFloor?.jitter ?? 0)).toFixed(4) : '—'),
      /* Face-scan rows. The pose stays a dash until CALIBRATE has stored a
         neutral: "how far have I turned" means nothing without the subject's
         own reference, which is the same reason this project scores against a
         personal baseline and not against population norms. */
      lock: row('FACE LOCK', lockText(fc)),
      yaw: row('HEAD YAW · COARSE ESTIMATE', poseText(fc?.yaw, fc)),
      pitch: row('HEAD PITCH · COARSE ESTIMATE', poseText(fc?.pitch, fc)),
      roll: row('HEAD ROLL · COARSE ESTIMATE', poseText(fc?.roll, fc)),
      /* Two different numbers, labelled so they cannot be confused: how much of
         the FRAME the box covers, and how much of the BOX is actually face
         evidence. Reporting only the first made a constant of the search scale
         (a live camera showed it holding at 37.1% while the face moved) look
         like a measurement. */
      facecov: row('FACE EVIDENCE IN BOX', fc?.fill ? `${(fc.fill * 100).toFixed(0)}%` : '—'),
      boxarea: row('BOX AREA OF FRAME', fc?.coverage ? `${(fc.coverage * 100).toFixed(1)}%` : '—'),
      evidence: row('LOCK HELD BY', fc?.basis && fc.basis !== '—' ? String(fc.basis).toUpperCase() : '—'),
    };

    /* ── Readout formatters ──
       A dash here is an answer, not a placeholder: it is what the scan reports
       before it has anything honest to report. */
    function lockText(f) {
      /* Gate on the live RUN state first: after STOP the provider keeps its last
         face object, so reading the status alone reported "SEARCHING" for a
         camera that is off (caught in browser verification). */
      if (!c?.running) return 'NOT STARTED';
      if (!f) return 'SCANNING…';
      const word = { locked: 'LOCKED', searching: 'SEARCHING', lost: 'LOST' }[f.status] || String(f.status).toUpperCase();
      if (f.status !== 'locked') return word;
      const via = f.basis && f.basis !== '—' ? ` · VIA ${String(f.basis).toUpperCase()}` : '';
      return `${word} · CONFIDENCE ${Math.round(f.confidence * 100)}%${via}`;
    }

    function poseText(v, f) {
      if (v === null || v === undefined) {
        if (!f || !f.found) return 'NO FACE';
        /* The provider sends the REASON with the blank (not calibrated yet, no
           colour lock in this light, baseline needs re-calibrating). Printing
           the reason is the difference between "not set up yet" and "not
           measurable here", and the subject needs to know which one it is. */
        return String(f.poseNote || 'UNAVAILABLE').toUpperCase();
      }
      return `${v > 0 ? '+' : ''}${v.toFixed(1)}°`;
    }

    function eyeText(eye) {
      if (!eye) return 'LOADING LOCAL MODEL…';
      if (!eye.available) return String(eye.status || 'UNAVAILABLE').toUpperCase();
      return `TRACKING LOCALLY · ${Math.round((eye.confidence || 0) * 100)}%`;
    }

    /* Why the local landmark model is not running. A bare "UNAVAILABLE" cannot
       distinguish a model that failed to START from a face that was not
       detected, and those need completely different fixes — so the error the
       provider captured is surfaced here instead of being swallowed. */
    function eyeModelText(eye) {
      if (!eye) return '—';
      const base = String(eye.status || 'UNAVAILABLE').toUpperCase();
      return eye.error ? `${base} — ${String(eye.error)}` : base;
    }

    function gazeText(eye) {
      if (!eye?.available) return 'UNAVAILABLE';
      if (eye.offset === null || eye.offset === undefined) return 'CALIBRATE TO SET NEUTRAL';
      return `${eye.offset.toFixed(3)} FACE-RELATIVE UNITS`;
    }

    wrap.append(
      el('div', { class: 'cam-stage cam-stage-dual' },
        el('div', { class: 'cam-stage-single' }, video, cv),
        eyeMap,
      ),
      verifyBox,
      el('div', { class: 'cam-rows cam-readout-grid' }, ...Object.values(liveRows)),
      el('div', { class: 'cam-rows' },
        el('div', { class: 'cam-row' }, el('span', { text: 'CALIBRATION' }),
          el('span', { class: `tag tag-${calColour}`, text: calState })),
      ),
      el('div', { class: 'btn-row' },
        el('button', {
          type: 'button', class: 'btn btn-primary',
          /* Reflect the running state instead of always offering START: the
             panel is rebuilt after every render, so an unconditioned button
             came back live mid-stream and invited a second start. */
          text: c?.running ? 'CAMERA RUNNING' : 'START CAMERA SCAN',
          disabled: !!c?.running,
          onclick: async (e) => {
            e.target.disabled = true;
            e.target.textContent = 'REQUESTING PERMISSION…';
            const ok = await S.camera?.start();
            e.target.disabled = false;
            e.target.textContent = ok ? 'CAMERA RUNNING' : 'RETRY CAMERA SCAN';
            if (ok) S.camera.attachPreview(video);
            render();
            /* render() creates the current video element; attach once more after
               the DOM replacement rather than retaining the discarded node. */
            queueMicrotask(() => S.camera?.attachPreview(root.querySelector('.cam-video')));
          },
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'CALIBRATE (HOLD STILL 2s)',
          disabled: !c?.running,
          onclick: async (e) => {
            if (!S.camera?.running) { toast('START THE CAMERA FIRST', 'Calibration measures this device\'s own noise floor and your neutral head pose while the camera is running.', 'warn', 6000); return; }
            e.target.disabled = true;
            toast('CALIBRATING', 'Hold your head still and face the camera for about two seconds. This measures the noise floor AND your neutral head pose.', 'info', 5000);
            await S.camera.calibrate();
            e.target.disabled = false;
            /* The neutral is part of the same window now, so say whether it was
               actually captured — "calibrated" alone would imply the pose
               numbers are anchored when they may not be. */
            const neutral = S.camera.neutral;
            const solid = neutral && neutral.basis === 'colour';
            toast(
              'CALIBRATED',
              !neutral
                ? `Noise floor measured and subtracted, but no neutral pose was captured (${S.camera.neutralNote || 'no face seen'}). Pose stays blank until a calibration with your face in frame.`
                : solid
                  ? 'Noise floor measured and subtracted, and your neutral head pose is stored — the pose readout is now relative to you, not to a population.'
                  : `Noise floor subtracted and a neutral WAS stored, but only ${Math.round((neutral.colourFraction || 0) * 100)}% of the hold-still frames had a colour lock (${S.camera.neutralNote || 'lock held by structure'}). The pose stays blank rather than reporting an angle this lighting cannot support — improve the light and calibrate again.`,
              solid ? 'ok' : 'warn',
              9000,
            );
            render();
            queueMicrotask(() => S.camera?.attachPreview(root.querySelector('.cam-video')));
          },
        }),
        el('button', {
          type: 'button', class: 'btn', text: 'STOP',
          onclick: () => { S.camera?.stop(); render(); },
        }),
      el('span', { class: 'tag tag-info', text: 'HEAD MOTION + EXPERIMENTAL EYE LANDMARKS · NOT CLINICAL VOR' }),
      ),
      el('p', { class: 'caption', text: 'How the face scan works: each frame is searched for face-shaped windows on four channels — skin colour after a white balance, local contrast (structure), dark features such as eyes, brows and beard, and frame-to-frame motion — weighted by shape, position, brightness and size. A bundled local landmark model then draws the eye grid only when it sees real face/iris landmarks. Nothing is uploaded or fetched from a CDN.' }),
      el('p', { class: 'caption', text: 'Why not just skin colour: the first real camera this scanner met had a purple cast strong enough to put the FACE outside every classic skin bound while the beige WALL sat inside them — it locked the wall. On that frame structure and dark features separate face from wall by about 3x while colour separates nothing, so colour is one channel of four and the LOCK HELD BY row above says which one is carrying the lock. A structure-held lock is far less certain than a colour-held one.' }),
      el('p', { class: 'caption', text: 'What the pose and eye data are not: head pose is a coarse estimate with a few degrees of uncertainty, not a goniometer. A head that slides sideways without turning moves the region exactly like a yaw does, so the scan cannot tell those apart. The optional local iris signal is only a face-relative gaze offset. It does not turn this webcam into a calibrated VOR or vHIT instrument; that row stays unavailable by design.' }),
      el('p', { class: 'caption', text: 'What VERIFIED means here: a lock, a stored neutral, real evidence, and a region that has held still for 1.2 s — nothing more. It is not a biometric identity check and it does not certify that the pose is accurate; it says the scan is currently tracking a stable face. The dashed box on the preview is the neutral captured at calibration.' }),
      el('p', { class: 'caption', text: 'Why calibration matters for the motion half: every webcam has its own sensor noise (exposure, gain, compression), which reads as a small amount of "motion" even when perfectly still. CALIBRATE measures that noise floor for this specific camera and subtracts it from every subsequent reading, so a genuinely still head reports as still — not as a few degrees per second of phantom motion.' }),
      el('p', { class: 'caption', text: 'Landmark implementation: the MediaPipe runtime, WASM files, and Face Landmarker model are bundled inside this site under Apache-2.0 rather than loaded from a CDN. This preserves offline operation but adds download size; if the model cannot load, the existing local head-motion tracker continues to work and the eye rows say unavailable.' }),
      el('p', { class: 'caption', text: 'Experimental eye-landmark upgrade: this build bundles a local MediaPipe Face Landmarker model, so eye/iris landmarks are processed on this device and no camera frame is uploaded. The GAZE OFFSET is only the iris position relative to the subject’s own calibrated face-neutral. It is useful for a functional demo and data-quality check, but it is not VOR gain, a clinical vHIT result, a diagnosis, or a NASA measurement.' }),
    );

    /* Re-rendering this panel must not detach a live stream from the new video
       element. The old implementation attached once, then replaceChildren()
       discarded that element; the following render showed an empty/poor view. */
    if (c?.stream) {
      c.attachPreview(video);
      video.play?.().catch(() => {});
    }

    /* Draw the live processing view so the pipeline is visible, not asserted.
       The scan box is drawn in the ANALYSIS frame, which is NOT mirrored,
       while the video beside it is flipped like a selfie — the caption below
       says so, because a box that appears to be on the wrong cheek otherwise
       looks like a bug. */
    /* ── Face verification ──
       A LOCK is not a VERIFICATION, and saying "verified" the moment a box
       appears would be the kind of claim this project refuses to make. So
       verification is a separate, stricter state that requires four things at
       once: a lock, a stored neutral (or the pose has no reference), real
       evidence (not a "weak" colour-only match), and a lock that has stayed
       still for HOLD_MS. It then prints the live numbers it verified. */
    const HOLD_MS = 1200;
    const STABLE_SPREAD = 0.02;    // fraction of the frame the centre may wander
    const hist = [];
    let heldSince = 0;
    let verdict = 'NO FACE';
    let lastChecks = null;

    const g = cv.getContext('2d');
    const eg = eyeMap.getContext('2d');

    /* ── Cosmetic scan-effect layer ────────────────────────────
       Everything the drawing code below adds is PRESENTATION: a sweep, a glow,
       a reticle, a survey grid. None of it is a measurement, and none of it can
       invent geometry. The only real content is the landmark/region data the
       provider actually returned — with no points, nothing is drawn (see the
       guards below). Under reduced motion the animated parts are frozen rather
       than faked into motion. */
    const scanT0 = performance.now();
    /* Real FaceMesh contour topology. It is applied ONLY to the points the
       bundled local model returned, so it traces an actual detected face; it is
       not a stored mesh that would draw a face when none is present. */
    const MESH_OUTLINE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
      234, 127, 162, 21, 54, 103, 67, 109];
    const MESH_DETAIL = [
      [70, 63, 105, 66, 107], [336, 296, 334, 293, 300],
      [168, 6, 197, 195, 5, 4, 1], [98, 97, 2, 326, 327],
      [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185],
    ];
    const LID_L = [33, 160, 158, 133, 153, 144];
    const LID_R = [362, 385, 387, 263, 373, 380];
    const IRIS_L = [468, 469, 470, 471, 472];
    const IRIS_R = [473, 474, 475, 476, 477];

    /* Trace a contour of REAL landmark ids through a projector.
       `px`/`py` take a COORDINATE (a number), not a point — both call sites
       follow that contract. A projector that expects a point instead returns
       NaN for every vertex, the path collapses and the contour disappears with
       no error, which is exactly how the analysis panel once lost its face
       outline and eye rings. So a non-finite projection is reported once. */
    const traceContour = (ctx, pts, ids, px, py, closed = true) => {
      ctx.beginPath();
      let started = false;
      ids.forEach((id) => {
        const pt = pts[id];
        if (!pt) return;
        const X = px(pt.x), Y = py(pt.y);
        if (!Number.isFinite(X) || !Number.isFinite(Y)) {
          if (!traceContour.warned) {
            traceContour.warned = true;
            console.warn('[cam] face/eye contour projector returned a non-finite coordinate — px/py must take a number, not a point.');
          }
          return;
        }
        if (started) ctx.lineTo(X, Y);
        else { ctx.moveTo(X, Y); started = true; }
      });
      if (closed) ctx.closePath();
      ctx.stroke();
    };

    /* Corner brackets — the instrument-lock motif, reused in three places. */
    const brackets = (ctx, x, y, w, h, arm, colour, width) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
      ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm);
      ctx.moveTo(x + w, y + h - arm); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - arm, y + h);
      ctx.moveTo(x + arm, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - arm);
      ctx.stroke();
    };

    /* The analysis field is drawn through a 64x48 offscreen canvas: the
       estimator's buffers are already that size, so the upscale is an exact 10x
       with smoothing off — cheap, and the chunky-pixel look the panel wants.
       The ImageData is allocated once and rewritten in place every frame. */
    const FIELD_W = 64, FIELD_H = 48;
    const fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = FIELD_W; fieldCanvas.height = FIELD_H;
    const fieldCtx = fieldCanvas.getContext('2d');
    const fieldImg = fieldCtx.createImageData(FIELD_W, FIELD_H);

    /* Camera off: put the analysis window into a readable STANDBY state instead
       of leaving a blank rectangle. It is scope furniture and a prompt, not a
       measurement — nothing is drawn that could be mistaken for a live signal. */
    const drawIdleScope = () => {
      const mw0 = eyeMap.width, mh0 = eyeMap.height;
      eg.clearRect(0, 0, mw0, mh0);
      const bg0 = eg.createRadialGradient(mw0 / 2, mh0 * 0.46, mh0 * 0.1, mw0 / 2, mh0 * 0.5, mh0 * 0.78);
      bg0.addColorStop(0, '#08182c');
      bg0.addColorStop(1, '#03070f');
      eg.fillStyle = bg0; eg.fillRect(0, 0, mw0, mh0);
      eg.save();
      eg.globalAlpha = 0.5;
      eg.strokeStyle = 'rgba(95,227,255,0.09)';
      eg.lineWidth = 1;
      eg.beginPath();
      for (let gx = 0; gx <= mw0; gx += 40) { eg.moveTo(gx + 0.5, 0); eg.lineTo(gx + 0.5, mh0); }
      for (let gy = 0; gy <= mh0; gy += 40) { eg.moveTo(0, gy + 0.5); eg.lineTo(mw0, gy + 0.5); }
      eg.stroke();
      eg.restore();
      brackets(eg, 10, 10, mw0 - 20, mh0 - 20, 22, 'rgba(95,227,255,0.30)', 2);
      eg.font = '600 16px ui-monospace, monospace';
      eg.fillStyle = 'rgba(148,180,220,.85)';
      eg.fillText('EYE SCAN · STANDBY', 18, 30);
      eg.font = '12px ui-monospace, monospace';
      eg.fillStyle = 'rgba(220,245,255,.5)';
      eg.fillText('START CAMERA SCAN TO ACQUIRE LANDMARKS', 18, 50);
    };

    const draw = () => {
      requestAnimationFrame(draw);
      if (!c || !c.running) {
        g.clearRect(0, 0, cv.width, cv.height);
        drawIdleScope();
        return;
      }
      const pw = cv.width;
      const ph = cv.height;
      /* Cosmetic clock, shared by every animated flourish in this loop. */
      const anim = (performance.now() - scanT0) / 1000;
      const motionOn = !state.reducedMotion;
      g.clearRect(0, 0, pw, ph);
      const f = c.face;

      /* The preview is mirrored by CSS (scaleX(-1)) but the canvas is not part
         of that element, so the overlay is drawn mirrored here to stay on the
         face the subject sees. */
      g.save();
      g.translate(pw, 0);
      g.scale(-1, 1);

      /* ASPECT MAPPING. The stage is 4:3, but webcams commonly send 16:9 and
         `object-fit: cover` crops the sides to fill the stage. The provider's
         buffer is the WHOLE frame (drawImage stretches it into 64x48), so a box
         in buffer coordinates must be pushed through the same crop or it lands
         off the face — measured on a real 1280x720 camera as a box drawn about
         20 px to the left of the cheek in a 4:3 stage. kx/ky are those crop
         factors; the visible stream range is [(1-1/k)/2, 1-(1-1/k)/2]. */
      const streamAspect = (c.video && c.video.videoWidth && c.video.videoHeight)
        ? c.video.videoWidth / c.video.videoHeight
        : 4 / 3;
      const stageAspect = pw / ph;
      const kx = streamAspect > stageAspect ? streamAspect / stageAspect : 1;
      const ky = streamAspect < stageAspect ? stageAspect / streamAspect : 1;
      const xOff = (1 - 1 / kx) / 2;
      const yOff = (1 - 1 / ky) / 2;
      const mapX = (nx) => (nx - xOff) * kx * pw;
      const mapY = (ny) => (ny - yOff) * ky * ph;

      /* The calibrated neutral, so the subject can see what "straight ahead"
         was actually measured as. Without it the pose numbers have no anchor. */
      if (c.neutral) {
        const n = c.neutral;
        g.save();
        g.setLineDash([5, 5]);
        g.strokeStyle = 'rgba(159,196,255,0.5)';
        g.lineWidth = 1;
        g.strokeRect(mapX(n.cx - 1.4 * n.sigX), mapY(n.cy - 1.4 * n.sigY),
          2.8 * n.sigX * kx * pw, 2.8 * n.sigY * ky * ph);
        g.restore();
      }

      /* The tracked region. It reads as a live instrument lock rather than a
         decorative rectangle: a soft bloom, a chase of light around the
         perimeter, corner brackets that breathe, a scanning bar and a centre
         reticle. The box itself is still the provider's fitted region — only
         its presentation changed. */
      if (f?.found) {
        const x = mapX(f.x), y = mapY(f.y), w = f.w * kx * pw, h = f.h * ky * ph;
        const locked = f.status === 'locked';
        const accent = locked ? '95,227,255' : '255,189,87';
        const rad = Math.min(16, w * 0.1, h * 0.1);
        const pulse = motionOn ? 0.55 + 0.45 * Math.sin(anim * 2.6) : 1;

        const box = () => {
          g.beginPath();
          if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h);
        };

        /* soft outer bloom */
        g.save();
        g.shadowColor = `rgba(${accent},0.85)`;
        g.shadowBlur = 18;
        g.strokeStyle = `rgba(${accent},0.30)`;
        g.lineWidth = 1;
        box(); g.stroke();
        g.restore();

        /* perimeter, brighter at the diagonal it runs along */
        const per = g.createLinearGradient(x, y, x + w, y + h);
        per.addColorStop(0, `rgba(${accent},0.95)`);
        per.addColorStop(.5, `rgba(${accent},0.28)`);
        per.addColorStop(1, `rgba(${accent},0.95)`);
        g.strokeStyle = per;
        g.lineWidth = 1.5;
        box(); g.stroke();

        /* scanning bar inside the box: a thin bright line with a gradient tail */
        if (motionOn) {
          const sweepY = y + ((anim * 0.42) % 1) * h;
          const tailH = Math.max(10, h * 0.16);
          const tail = g.createLinearGradient(0, sweepY - tailH, 0, sweepY);
          tail.addColorStop(0, `rgba(${accent},0)`);
          tail.addColorStop(.7, `rgba(${accent},0.10)`);
          tail.addColorStop(1, `rgba(${accent},0.28)`);
          g.fillStyle = tail;
          g.fillRect(x, sweepY - tailH, w, tailH);
          g.fillStyle = `rgba(${accent},0.85)`;
          g.fillRect(x, sweepY - 0.75, w, 1.5);
        }

        /* breathing corner brackets */
        const arm = Math.max(10, Math.min(22, w * 0.24, h * 0.24));
        g.save();
        g.shadowColor = `rgba(${accent},0.9)`;
        g.shadowBlur = 8 + 8 * pulse;
        brackets(g, x, y, w, h, arm, `rgba(${accent},${0.72 + 0.28 * pulse})`, 3);
        g.restore();

        /* mid-edge viewfinder ticks */
        const tick = Math.min(9, w * 0.07, h * 0.07);
        g.strokeStyle = `rgba(${accent},0.7)`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x + w / 2, y - tick); g.lineTo(x + w / 2, y - 1);
        g.moveTo(x + w / 2, y + h + 1); g.lineTo(x + w / 2, y + h + tick);
        g.moveTo(x - tick, y + h / 2); g.lineTo(x - 1, y + h / 2);
        g.moveTo(x + w + 1, y + h / 2); g.lineTo(x + w + tick, y + h / 2);
        g.stroke();

        /* centre reticle: a dot inside a breathing ring */
        const ccx = mapX(f.cx), ccy = mapY(f.cy);
        g.beginPath();
        g.arc(ccx, ccy, 4 + 5 * pulse, 0, Math.PI * 2);
        g.strokeStyle = `rgba(${accent},${0.5 - 0.3 * pulse})`;
        g.lineWidth = 1.4;
        g.stroke();
        g.beginPath();
        g.arc(ccx, ccy, 3.5, 0, Math.PI * 2);
        g.fillStyle = `rgb(${accent})`;
        g.fill();

        /* lock plate riding the top edge. The digits are the provider's own
           confidence, not decoration. */
        g.font = '600 10px ui-monospace, monospace';
        const tag = `${locked ? 'LOCK' : String(f.status || '').toUpperCase()} · ${Math.round((f.confidence || 0) * 100)}%`;
        const tw = g.measureText(tag).width;
        g.fillStyle = 'rgba(4,8,18,0.72)';
        g.fillRect(x, y - 16, tw + 12, 14);
        g.fillStyle = `rgba(${accent},0.98)`;
        g.fillText(tag, x + 6, y - 6);
      }
      g.restore();

      /* Real local landmark view. The contours are the landmark TOPOLOGY traced
         through the points the bundled model actually returned — real geometry,
         not a stored face: with no points nothing here draws. The glow and the
         rotating reticle are presentation; the dots are the measurement. */
      const eye = state.camera?.eye;
      if (eye?.available && Array.isArray(eye.points) && eye.points.length >= 478) {
        g.save();
        g.translate(pw, 0); g.scale(-1, 1);
        const pts = eye.points;
        const px = (n) => mapX(n), py = (n) => mapY(n);

        /* faint solved mesh: face outline, brows, nose, lips */
        g.save();
        g.globalAlpha = 0.22;
        g.strokeStyle = 'rgba(95,227,255,0.9)';
        g.lineWidth = 1;
        traceContour(g, pts, MESH_OUTLINE, px, py);
        MESH_DETAIL.forEach((ids) => traceContour(g, pts, ids, px, py, false));
        g.restore();

        /* The landmark cloud: every point, as a small pixel, so the whole face
           is covered over the video too. Kept smaller and fainter than the
           analysis panel's cloud so the real face underneath still reads. */
        for (let i = 0; i < 468; i++) {
          const pt = pts[i];
          const depth = Math.max(0, Math.min(1, (pt.z || 0) * 2.4 + 0.5));
          const r = 1 + (1 - depth) * 1.1;
          g.fillStyle = `rgba(130,230,255,${0.10 + (1 - depth) * 0.22})`;
          g.fillRect(px(pt.x) - r / 2, py(pt.y) - r / 2, r, r);
        }

        /* eyelids: a lit contour around each eye */
        g.save();
        g.shadowColor = 'rgba(135,255,206,0.95)';
        g.shadowBlur = 8;
        g.strokeStyle = 'rgba(135,255,206,0.98)';
        g.lineWidth = 1.6;
        traceContour(g, pts, LID_L, px, py);
        traceContour(g, pts, LID_R, px, py);
        g.restore();

        /* irises: outer ring, inner ring, pupil dot and a slow rotating
           reticle. The rings are drawn on the real iris landmarks; the reticle
           is pure ornament that marks which pupil is being tracked. */
        const iris = (ids, tilt) => {
          const cxN = ids.reduce((a, id) => a + pts[id].x, 0) / ids.length;
          const cyN = ids.reduce((a, id) => a + pts[id].y, 0) / ids.length;
          const X = px(cxN), Y = py(cyN);
          g.save();
          g.shadowColor = 'rgba(255,190,92,0.95)';
          g.shadowBlur = 10;
          g.strokeStyle = 'rgba(255,190,92,0.98)';
          g.lineWidth = 1.6;
          traceContour(g, pts, ids, px, py);
          g.beginPath(); g.arc(X, Y, 7, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.arc(X, Y, 3.2, 0, Math.PI * 2); g.stroke();
          g.restore();
          g.beginPath(); g.arc(X, Y, 1.4, 0, Math.PI * 2);
          g.fillStyle = '#ffd79a'; g.fill();
          g.save();
          g.translate(X, Y); g.rotate(tilt);
          g.strokeStyle = 'rgba(255,190,92,0.75)'; g.lineWidth = 1.2;
          g.beginPath();
          for (let k = 0; k < 4; k++) {
            g.rotate(Math.PI / 2);
            g.moveTo(10, 0); g.lineTo(14, 0);
          }
          g.stroke();
          g.restore();
        };
        iris(IRIS_L, motionOn ? anim * 0.8 : 0);
        iris(IRIS_R, motionOn ? -anim * 0.8 : 0);
        g.restore();

        g.fillStyle = 'rgba(135,255,206,0.95)';
        g.font = '600 12px ui-monospace, monospace';
        g.fillText('EYE TRACKING · REAL LOCAL LANDMARKS', 14, 48);
      } else {
        g.fillStyle = 'rgba(255,189,87,0.92)';
        g.font = '600 12px ui-monospace, monospace';
        g.fillText(c?.running ? 'EYE SCANNING · AWAITING REAL LANDMARKS' : 'EYE SCAN · UNAVAILABLE', 14, 48);
      }

      /* The analysis window carries two layers. The bottom one is the live raw
         64x48 analysis buffer, drawn from the estimator's own arrays and
         labelled on screen as NOT a landmark scan, so the panel stays live even
         when the landmark model cannot start. The landmark layer on top draws
         only when the bundled model actually returned points — it never invents
         a substitute face when detection fails. */
      const mw = eyeMap.width, mh = eyeMap.height;
      eg.clearRect(0, 0, mw, mh);

      /* Deep-scope background: a radial wash, a survey grid with a centre
         crosshair, and an edge tick ruler. Cosmetic furniture only — the only
         real content is the landmark field drawn on top of it. */
      const bg = eg.createRadialGradient(mw * 0.5, mh * 0.46, mh * 0.1, mw * 0.5, mh * 0.5, mh * 0.78);
      bg.addColorStop(0, '#08182c');
      bg.addColorStop(1, '#03070f');
      eg.fillStyle = bg; eg.fillRect(0, 0, mw, mh);

      eg.save();
      eg.strokeStyle = 'rgba(95,227,255,0.07)';
      eg.lineWidth = 1;
      eg.beginPath();
      for (let gx = 0; gx <= mw; gx += 40) { eg.moveTo(gx + 0.5, 0); eg.lineTo(gx + 0.5, mh); }
      for (let gy = 0; gy <= mh; gy += 40) { eg.moveTo(0, gy + 0.5); eg.lineTo(mw, gy + 0.5); }
      eg.stroke();
      eg.strokeStyle = 'rgba(95,227,255,0.16)';
      eg.beginPath();
      eg.moveTo(mw / 2, 0); eg.lineTo(mw / 2, mh);
      eg.moveTo(0, mh / 2); eg.lineTo(mw, mh / 2);
      eg.stroke();
      eg.strokeStyle = 'rgba(140,200,255,0.22)';
      eg.beginPath();
      for (let gx = 0; gx <= mw; gx += 40) {
        const len = (gx / 40) % 5 === 0 ? 9 : 5;
        eg.moveTo(gx + 0.5, 0); eg.lineTo(gx + 0.5, len);
        eg.moveTo(gx + 0.5, mh); eg.lineTo(gx + 0.5, mh - len);
      }
      for (let gy = 0; gy <= mh; gy += 40) {
        const len = (gy / 40) % 5 === 0 ? 9 : 5;
        eg.moveTo(0, gy + 0.5); eg.lineTo(len, gy + 0.5);
        eg.moveTo(mw, gy + 0.5); eg.lineTo(mw - len, gy + 0.5);
      }
      eg.stroke();
      eg.restore();

      /* ── Live analysis field ───────────────────────────────────
         The estimator already downsamples every frame to its own 64x48 working
         buffer. Drawing that buffer shows the REAL signal the pipeline is
         scoring, so this panel is live even when the landmark model is not
         available. It is the raw downsampled frame — not a landmark scan, not
         a 3D model and not a measurement — and the label along the bottom says
         so. The locked face region is drawn bright and the rest of the frame
         dim, so it still reads as a face scan rather than a camera thumbnail. */
      const field = c.analysisField?.();
      if (field?.lum) {
        const L = field.lum, S = field.struct, M = field.motion;
        const d = fieldImg.data;
        for (let i = 0, o = 0; i < FIELD_W * FIELD_H; i++, o += 4) {
          const v = Math.min(1, Math.max(0, (L[i] || 0) / 255));
          const s = Math.min(1, Math.max(0, S[i] || 0));
          const m = Math.min(1, Math.max(0, M[i] || 0));
          d[o] = (10 + v * 46 + m * 190) | 0;
          d[o + 1] = (28 + v * 132 + s * 70 + m * 120) | 0;
          d[o + 2] = (52 + v * 176 + s * 40 + m * 96) | 0;
          d[o + 3] = 255;
        }
        fieldCtx.putImageData(fieldImg, 0, 0);
        eg.imageSmoothingEnabled = false;
        eg.globalAlpha = 0.26;
        eg.drawImage(fieldCanvas, 0, 0, mw, mh);
        eg.globalAlpha = 1;
        if (c.face?.found) {
          eg.save();
          eg.beginPath();
          const bx = c.face.x * mw, by = c.face.y * mh;
          const bw = c.face.w * mw, bh = c.face.h * mh;
          if (eg.roundRect) eg.roundRect(bx, by, bw, bh, Math.min(18, bw * 0.12, bh * 0.12));
          else eg.rect(bx, by, bw, bh);
          eg.clip();
          eg.drawImage(fieldCanvas, 0, 0, mw, mh);
          eg.restore();
        }
      }

      const mapEye = state.camera?.eye;
      if (mapEye?.available && Array.isArray(mapEye.points) && mapEye.points.length >= 478) {
        const pts = mapEye.points;
        /* These take a COORDINATE, matching traceContour's contract and the
           overlay's projectors. They used to take a point (`(pt) => pt.x * mw`)
           while the shared tracer passed `px(pt.x)`, so every contour resolved
           to NaN and the mesh, eyelids and iris rings silently vanished from
           this panel. Use `px(pt.x)`, never `px(pt)`. */
        /* The camera's face crop may occupy a tiny part of the 640×480 input.
           This right-hand panel is an instrument visualization, so fit the
           real facial geometry into its own stable scan viewport. Without this
           transform the head sat low and very small whenever the user was far
           from the camera. Features remain live; only their display scale and
           position change. */
        const fitIds = MESH_OUTLINE;
        let nx0 = Infinity, nx1 = -Infinity, ny0 = Infinity, ny1 = -Infinity;
        fitIds.forEach((id) => {
          nx0 = Math.min(nx0, pts[id].x); nx1 = Math.max(nx1, pts[id].x);
          ny0 = Math.min(ny0, pts[id].y); ny1 = Math.max(ny1, pts[id].y);
        });
        const faceW = Math.max(nx1 - nx0, 1e-4);
        const faceH = Math.max(ny1 - ny0, 1e-4);
        const scanFaceW = mw * 0.47;
        const scanFaceH = mh * 0.55;
        const sxFace = scanFaceW / faceW;
        const syFace = scanFaceH / faceH;
        const scanFaceX = (mw - scanFaceW) / 2;
        const scanFaceY = mh * 0.255;
        const px = (v) => scanFaceX + (v - nx0) * sxFace;
        const py = (v) => scanFaceY + (v - ny0) * syFace;
        const faceLeft = scanFaceX;
        const faceRight = scanFaceX + scanFaceW;
        const faceTop = scanFaceY;
        const faceBottom = scanFaceY + scanFaceH;
        const faceCX = (faceLeft + faceRight) / 2;

        /* Soft halo behind the face, centred on the real landmark centroid, so
           the pixel scan sits in light instead of floating on black. Drawn
           before the mesh so the mesh stays crisp over it. */
        let fxs = 0, fys = 0;
        for (let i = 0; i < 468; i++) { fxs += px(pts[i].x); fys += py(pts[i].y); }
        const fcx = fxs / 468, fcy = fys / 468;
        const halo = eg.createRadialGradient(fcx, fcy, mh * 0.04, fcx, fcy, mh * 0.62);
        halo.addColorStop(0, 'rgba(52,161,255,0.22)');
        halo.addColorStop(0.55, 'rgba(52,161,255,0.08)');
        halo.addColorStop(1, 'rgba(52,161,255,0)');
        eg.fillStyle = halo; eg.fillRect(0, 0, mw, mh);

        /* Full-head visual envelope. Face landmarks are the measured geometry;
           cranium, ears and neck are a lower-opacity display shell grown from
           that geometry. This gives the full human head requested in the UI
           without pretending a front webcam detects hair or the back of a
           skull. */
        const skullTop = mh * 0.115;
        const skullBottom = faceBottom + mh * 0.025;
        const skullRX = scanFaceW * 0.68;
        const skullRY = (skullBottom - skullTop) * 0.52;
        const skullCY = skullTop + skullRY;
        const skullPoint = (a) => ({ x: faceCX + Math.cos(a) * skullRX, y: skullCY + Math.sin(a) * skullRY });
        eg.save();
        eg.strokeStyle = 'rgba(112,224,255,.46)'; eg.lineWidth = 1.15;
        eg.shadowColor = 'rgba(95,227,255,.62)'; eg.shadowBlur = 10;
        eg.beginPath();
        for (let i = 0; i <= 64; i++) {
          const p = skullPoint(Math.PI * 1.02 + (Math.PI * 1.96 * i / 64));
          i ? eg.lineTo(p.x, p.y) : eg.moveTo(p.x, p.y);
        }
        eg.stroke();
        /* Cranial latitude/longitude lines provide the cinematic wireframe
           volume, deliberately lighter than the live feature mesh. */
        eg.strokeStyle = 'rgba(109,204,255,.26)'; eg.lineWidth = .7;
        [-.62, -.33, 0, .33, .62].forEach((lat) => {
          const yy = skullCY + lat * skullRY;
          const rx = skullRX * Math.sqrt(Math.max(.1, 1 - lat * lat));
          eg.beginPath();
          for (let i = 0; i <= 24; i++) {
            const dx = -rx + 2 * rx * i / 24;
            const bow = (1 - Math.abs(dx / rx)) * skullRY * .06;
            i ? eg.lineTo(faceCX + dx, yy - bow) : eg.moveTo(faceCX + dx, yy - bow);
          }
          eg.stroke();
        });
        [-.72, -.45, -.18, .18, .45, .72].forEach((lon) => {
          const xx = faceCX + lon * skullRX;
          const ry = skullRY * Math.sqrt(Math.max(.1, 1 - lon * lon));
          eg.beginPath();
          for (let i = 0; i <= 20; i++) {
            const yy = skullCY - ry + 2 * ry * i / 20;
            const curve = Math.sin(i / 20 * Math.PI) * lon * skullRX * .08;
            i ? eg.lineTo(xx - curve, yy) : eg.moveTo(xx - curve, yy);
          }
          eg.stroke();
        });
        eg.restore();

        /* Ear outlines: positioned from the fitted live face boundary. */
        const ear = (side) => {
          const ex = side < 0 ? faceLeft - scanFaceW * .055 : faceRight + scanFaceW * .055;
          const ey = faceTop + scanFaceH * .49;
          const erx = scanFaceW * .085, ery = scanFaceH * .145;
          eg.save(); eg.strokeStyle = 'rgba(104,230,255,.55)'; eg.lineWidth = 1.05;
          eg.shadowColor = 'rgba(95,227,255,.55)'; eg.shadowBlur = 8;
          eg.beginPath(); eg.ellipse(ex, ey, erx, ery, 0, 0, Math.PI * 2); eg.stroke();
          eg.beginPath(); eg.ellipse(ex - side * erx * .08, ey, erx * .52, ery * .60, 0, Math.PI * .18, Math.PI * 1.82); eg.stroke();
          eg.restore();
        };
        ear(-1); ear(1);

        /* Neck and shoulders: display envelope only, lower brightness so live
           lips, eyes, nose and jaw remain the visual focus. */
        const neckY = Math.min(mh - 35, faceBottom + mh * .27);
        eg.save(); eg.strokeStyle = 'rgba(99,217,255,.35)'; eg.lineWidth = 1;
        eg.shadowColor = 'rgba(95,227,255,.4)'; eg.shadowBlur = 6;
        eg.beginPath();
        eg.moveTo(faceLeft + scanFaceW * .26, faceBottom - 6);
        eg.bezierCurveTo(faceLeft + scanFaceW * .20, neckY - 26, faceLeft + scanFaceW * .13, neckY - 6, faceLeft - scanFaceW * .12, neckY);
        eg.moveTo(faceRight - scanFaceW * .26, faceBottom - 6);
        eg.bezierCurveTo(faceRight - scanFaceW * .20, neckY - 26, faceRight - scanFaceW * .13, neckY - 6, faceRight + scanFaceW * .12, neckY);
        eg.stroke();
        for (let i = 0; i < 5; i++) {
          const y = faceBottom + (neckY - faceBottom) * i / 4;
          const spread = scanFaceW * (.23 + i * .06);
          eg.beginPath(); eg.moveTo(faceCX - spread, y); eg.quadraticCurveTo(faceCX, y + 7, faceCX + spread, y); eg.stroke();
        }
        eg.restore();

        /* The solved mesh over the whole face — outline, brows, nose and mouth.
           Real topology traced through real points; it is what turns the pixel
           field into a readable face rather than a scatter. */
        eg.save();
        eg.globalAlpha = 0.26;
        eg.strokeStyle = 'rgba(95,200,255,0.9)';
        eg.lineWidth = 1;
        traceContour(eg, pts, MESH_OUTLINE, px, py);
        MESH_DETAIL.forEach((ids) => traceContour(eg, pts, ids, px, py, false));
        eg.restore();

        /* FULL-FACE PIXEL SCAN. Every landmark the model returned becomes a
           small pixel, so the whole face is covered instead of every other
           point — nothing is interpolated or invented; it is the mesh's own
           density that makes the face legible. Size and brightness still come
           from each point's real depth, and the sweep line brightens the
           pixels it crosses, so the panel reads as an acquisition pass rather
           than a static scatter. */
        const sweepY0 = motionOn ? ((anim * 0.28) % 1) * mh : -9999;
        for (let i = 0; i < 468; i++) {
          const pt = pts[i];
          const depth = Math.max(0, Math.min(1, (pt.z || 0) * 2.4 + 0.5));
          const near = motionOn ? Math.max(0, 1 - Math.abs(py(pt.y) - sweepY0) / 44) : 0;
          const r = 1.2 + (1 - depth) * 1.5 + near * 1.1;
          const a = Math.min(0.95, 0.12 + (1 - depth) * 0.26 + near * 0.55);
          const X = px(pt.x), Y = py(pt.y);
          eg.fillStyle = near > 0.3
            ? `rgba(186,247,255,${a})`
            : `rgba(89,220,255,${a})`;
          eg.fillRect(X - r / 2, Y - r / 2, r, r);
        }

        /* lit contours: eyelids and irises */
        const trace = (ids, colour, width = 1.5) => {
          eg.save();
          eg.shadowColor = colour; eg.shadowBlur = 9;
          eg.strokeStyle = colour; eg.lineWidth = width;
          traceContour(eg, pts, ids, px, py);
          eg.restore();
        };
        trace(LID_L, 'rgba(139,255,210,.98)', 2);
        trace(LID_R, 'rgba(139,255,210,.98)', 2);
        trace(IRIS_L, 'rgba(255,190,92,.98)', 1.8);
        trace(IRIS_R, 'rgba(255,190,92,.98)', 1.8);

        /* expanding acquisition ring from the real iris centroid */
        let sumX = 0, sumY = 0, n = 0;
        IRIS_L.concat(IRIS_R).forEach((id) => { sumX += px(pts[id].x); sumY += py(pts[id].y); n += 1; });
        const ix = sumX / n, iy = sumY / n;
        if (motionOn) {
          const pr = (anim * 0.9) % 1;
          eg.beginPath();
          eg.arc(ix, iy, 12 + pr * 90, 0, Math.PI * 2);
          eg.strokeStyle = `rgba(95,227,255,${0.28 * (1 - pr)})`;
          eg.lineWidth = 1.5;
          eg.stroke();
        }

        /* twin sweep: a slow horizontal scan bar and a faster vertical one.
           The horizontal bar is the same `sweepY0` the pixel cloud brightens
           against, so the light and the pixels are one pass, not two. */
        if (motionOn) {
          const sy = sweepY0;
          const band = eg.createLinearGradient(0, sy - 34, 0, sy + 34);
          band.addColorStop(0, 'rgba(95,227,255,0)');
          band.addColorStop(.5, 'rgba(95,227,255,.22)');
          band.addColorStop(1, 'rgba(95,227,255,0)');
          eg.fillStyle = band; eg.fillRect(0, sy - 34, mw, 68);
          eg.fillStyle = 'rgba(170,245,255,0.60)'; eg.fillRect(0, sy - 0.5, mw, 1);

          const sx = ((anim * 0.19 + 0.5) % 1) * mw;
          const bandV = eg.createLinearGradient(sx - 30, 0, sx + 30, 0);
          bandV.addColorStop(0, 'rgba(139,255,210,0)');
          bandV.addColorStop(.5, 'rgba(139,255,210,.14)');
          bandV.addColorStop(1, 'rgba(139,255,210,0)');
          eg.fillStyle = bandV; eg.fillRect(sx - 30, 0, 60, mh);
        }

        /* vignette, so the frame edges fall away */
        const vg = eg.createRadialGradient(mw / 2, mh / 2, mh * 0.35, mw / 2, mh / 2, mh * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.5)');
        eg.fillStyle = vg; eg.fillRect(0, 0, mw, mh);

        /* HUD: restrained status only, leaving the scan volume uncluttered. */
        eg.font = '600 16px ui-monospace, monospace';
        eg.fillStyle = 'rgba(139,255,210,.98)';
        eg.fillText('EYE SCANNING', 18, 30);
        eg.font = '12px ui-monospace, monospace';
        eg.fillStyle = 'rgba(220,245,255,.78)';
        eg.fillText(`LIVE FEATURES · ${Math.round((mapEye.confidence || 0) * 100)}%`, 18, 50);
        const conf = Math.max(0, Math.min(1, mapEye.confidence || 0));
        eg.fillStyle = 'rgba(95,227,255,0.18)';
        eg.fillRect(mw - 168, 22, 150, 6);
        eg.fillStyle = 'rgba(139,255,210,0.95)';
        eg.fillRect(mw - 168, 22, 150 * conf, 6);

        /* scope corner brackets framing the whole window */
        brackets(eg, 10, 10, mw - 20, mh - 20, 22, 'rgba(95,227,255,0.45)', 2);
      } else {
        /* Still show the scope furniture, so the panel reads as an instrument
           waiting for a signal rather than a broken black box. */
        eg.font = '600 16px ui-monospace, monospace'; eg.fillStyle = 'rgba(255,189,87,.9)';
        eg.fillText('EYE SCAN UNAVAILABLE', 18, 30);
        eg.font = '12px ui-monospace, monospace'; eg.fillStyle = 'rgba(220,245,255,.54)';
        eg.fillText(c?.running ? 'WAITING FOR REAL FACE / IRIS LANDMARKS' : 'CAMERA IS OFF', 18, 50);
        brackets(eg, 10, 10, mw - 20, mh - 20, 22, 'rgba(95,227,255,0.30)', 2);
      }

      /* One label that is true in every state: the underlying field is the
         live analysis buffer, while the large wireframe is a visualization. */
      eg.font = '11px ui-monospace, monospace';
      eg.fillStyle = 'rgba(150,210,255,.6)';
      eg.fillText(mapEye?.available
        ? 'LIVE FACE LANDMARKS · FULL-HEAD VISUAL ENVELOPE'
        : 'LIVE ANALYSIS BUFFER 64×48 · NO BIOMETRIC RESULT', 18, mh - 12);

      /* global motion vector, unchanged from the motion estimator */
      g.strokeStyle = 'rgba(95,227,255,0.7)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pw / 2, ph / 2);
      g.lineTo(pw / 2 - c.dx * 8, ph / 2 + c.dy * 8);
      g.stroke();

      /* ── Verification state, recomputed every frame ── */
      const now = performance.now();
      if (f?.found) {
        hist.push({ t: now, cx: f.cx, cy: f.cy });
        while (hist.length && now - hist[0].t > HOLD_MS) hist.shift();
      } else hist.length = 0;

      let spread = 0;
      if (hist.length > 4) {
        let mx = 0, my = 0;
        for (const h2 of hist) { mx += h2.cx; my += h2.cy; }
        mx /= hist.length; my /= hist.length;
        for (const h2 of hist) spread = Math.max(spread, Math.hypot(h2.cx - mx, h2.cy - my));
      }
      const stable = hist.length > 4 && spread < STABLE_SPREAD;
      const anchored = !!c.neutral;
      const evidenceOk = !!f?.basis && f.basis !== 'weak' && f.basis !== '—';
      const lockedOk = f?.status === 'locked';

      const allOk = lockedOk && anchored && evidenceOk && stable;
      if (allOk && !heldSince) heldSince = now;
      if (!allOk) heldSince = 0;

      verdict = !f?.found ? 'NO FACE'
        : allOk ? 'VERIFIED'
          : !lockedOk ? 'SCANNING'
            : !stable ? 'HOLD STILL'
              : !anchored ? 'CALIBRATE'
                : 'EVIDENCE WEAK';
      lastChecks = { stable, anchored, evidenceOk, lockedOk, spread };

      /* Verification readout: the verdict plus the four checks it is made of,
         each with the live number behind it. */
      const tick = (ok) => (ok ? 'PASS' : '—');
      const rows2 = [
        ['VERDICT', verdict],
        ['LOCK', `${tick(lockedOk)} ${f?.status ? String(f.status).toUpperCase() : 'NO FACE'}`],
        ['NEUTRAL', `${tick(anchored)} ${anchored ? 'STORED AT CALIBRATION' : 'NOT MEASURED'}`],
        ['EVIDENCE', `${tick(evidenceOk)} ${f?.basis ? String(f.basis).toUpperCase() : '—'}`],
        ['STABILITY', `${tick(stable)} ${(spread * 100).toFixed(1)}% OF FRAME, LAST ${(HOLD_MS / 1000).toFixed(1)}s`],
        ['POSE', (f && f.yaw !== null && f.yaw !== undefined)
          ? `YAW ${f.yaw > 0 ? '+' : ''}${f.yaw.toFixed(1)}°  PITCH ${f.pitch > 0 ? '+' : ''}${f.pitch.toFixed(1)}°  ROLL ${f.roll > 0 ? '+' : ''}${f.roll.toFixed(1)}°`
          : String(f?.poseNote || 'UNAVAILABLE').toUpperCase().slice(0, 46)],
        ['VERIFIED FOR', allOk ? `${((now - heldSince) / 1000).toFixed(1)}s` : '—'],
      ];
      if (verifyBox.dataset.sig !== verdict) {
        verifyBox.dataset.sig = verdict;
        verifyBox.replaceChildren(
          el('div', { class: 'cam-row cam-verify-head' },
            el('span', { text: 'FACE VERIFICATION' }),
            el('span', { class: `tag tag-${verdict === 'VERIFIED' ? 'ok' : verdict === 'NO FACE' ? 'warn' : 'info'}`, text: verdict })),
          ...rows2.map(([k, v]) => el('div', { class: 'cam-row' }, el('span', { text: k }), el('b', { text: v }))),
        );
      } else {
        const bs = verifyBox.querySelectorAll('.cam-row');
        /* rows2 has one extra leading row (the head), so index +1 */
        for (let i = 0; i < rows2.length; i++) {
          const b = bs[i + 1]?.querySelector('b');
          if (b && b.textContent !== rows2[i][1]) b.textContent = rows2[i][1];
        }
      }

      /* On-image banner: the same verdict, where the subject is already looking.
         Drawn OUTSIDE the mirror transform — text under a flip renders
         back-to-front, which is why the box is mirrored and the type is not. */
      const badge = verdict === 'VERIFIED';
      const accent = badge ? '95,227,255' : '255,189,87';
      const banner = badge ? `FACE VERIFIED · ${((now - heldSince) / 1000).toFixed(1)}s` : verdict;
      g.font = '600 14px ui-monospace, monospace';
      const bwidth = g.measureText(banner).width + 30;
      g.fillStyle = 'rgba(4,8,18,0.66)';
      if (g.roundRect) { g.beginPath(); g.roundRect(10, 12, bwidth, 26, 13); g.fill(); }
      else g.fillRect(10, 12, bwidth, 26);
      g.save();
      g.shadowColor = `rgba(${accent},0.9)`; g.shadowBlur = 10;
      g.strokeStyle = `rgba(${accent},0.72)`; g.lineWidth = 1;
      if (g.roundRect) { g.beginPath(); g.roundRect(10, 12, bwidth, 26, 13); g.stroke(); }
      g.restore();
      /* status lamp: a steady dot, breathing only while a verdict is held */
      const lampR = 3.4 + (badge && motionOn ? Math.sin(anim * 4) * 0.8 : 0);
      g.beginPath();
      g.arc(23, 25, lampR, 0, Math.PI * 2);
      g.fillStyle = `rgb(${accent})`;
      g.fill();
      g.fillStyle = `rgba(${accent},0.98)`;
      g.fillText(banner, 33, 30);

      /* scope corners on the preview, so the feed reads as a live sensor view */
      g.save();
      g.globalAlpha = 0.55;
      brackets(g, 8, 8, pw - 16, ph - 16, 26, `rgba(${accent},0.85)`, 2);
      g.restore();

      g.font = '11px ui-monospace, monospace';
      if (f) {
        const line1 = `${String(f.status).toUpperCase()}${f.basis && f.basis !== '—' ? ` VIA ${String(f.basis).toUpperCase()}` : ''} · CONF ${Math.round((f.confidence || 0) * 100)}%`;
        const pose = (f.yaw === null || f.yaw === undefined)
          ? `POSE — ${String(f.poseNote || 'unavailable').toUpperCase()}`
          : `YAW ${f.yaw > 0 ? '+' : ''}${f.yaw.toFixed(1)}°  PITCH ${f.pitch > 0 ? '+' : ''}${f.pitch.toFixed(1)}°  ROLL ${f.roll > 0 ? '+' : ''}${f.roll.toFixed(1)}°`;
        const plate = Math.max(g.measureText(line1).width, g.measureText(pose.slice(0, 74)).width) + 18;
        g.fillStyle = 'rgba(4,8,18,0.58)';
        if (g.roundRect) { g.beginPath(); g.roundRect(10, ph - 46, plate, 40, 8); g.fill(); }
        else g.fillRect(10, ph - 46, plate, 40);
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.fillText(line1, 14, ph - 30);
        g.fillStyle = 'rgba(150,210,255,0.88)';
        g.fillText(pose.slice(0, 74), 14, ph - 14);
      }
    };
    draw();

    /* Bind only text nodes to the shared camera telemetry. Rebuilding the whole
       integration section at 18 Hz would cause jank; these seven small updates
       keep the displayed output genuinely realtime without touching the video. */
    const updateLiveRows = () => {
      const live = state.camera;
      const hz = c?.hz?.mean ? c.hz.mean().toFixed(1) : '—';
      liveRows.samples.querySelector('b').textContent = c ? String(c.samples) : '0';
      liveRows.rate.querySelector('b').textContent = `${hz} Hz`;
      liveRows.head.querySelector('b').textContent = live?.running ? `${live.headMotion.toFixed(2)} deg/s` : '—';
      liveRows.eyes.querySelector('b').textContent = live?.running ? eyeText(live.eye) : '—';
      const emEl = liveRows.eyemodel.querySelector('b');
      emEl.textContent = live?.running ? eyeModelText(live.eye) : '—';
      /* The row clips to one line, so carry the untruncated reason on the
         element itself where it can still be read. */
      emEl.title = live?.eye?.error || '';
      liveRows.gaze.querySelector('b').textContent = live?.running ? gazeText(live.eye) : '—';
      liveRows.quality.querySelector('b').textContent = live?.running ? `${Math.round(live.quality * 100)}%` : '—';
      liveRows.energy.querySelector('b').textContent = c ? Math.max(0, c.motionEnergy - (c.noiseFloor?.energy ?? 0)).toFixed(4) : '—';
      liveRows.jitter.querySelector('b').textContent = c ? Math.max(0, c.jitter - (c.noiseFloor?.jitter ?? 0)).toFixed(4) : '—';
      /* Face scan: read from the provider handle rather than a snapshot, so the
         lock box, the pose and the overlay all describe the same frame. */
      const lf = c?.face || live?.face || null;
      liveRows.lock.querySelector('b').textContent = lockText(lf);
      liveRows.yaw.querySelector('b').textContent = poseText(lf?.yaw, lf);
      liveRows.pitch.querySelector('b').textContent = poseText(lf?.pitch, lf);
      liveRows.roll.querySelector('b').textContent = poseText(lf?.roll, lf);
      liveRows.facecov.querySelector('b').textContent = lf?.fill ? `${(lf.fill * 100).toFixed(0)}%` : '—';
      liveRows.boxarea.querySelector('b').textContent = lf?.coverage ? `${(lf.coverage * 100).toFixed(1)}%` : '—';
      liveRows.evidence.querySelector('b').textContent = lf?.basis && lf.basis !== '—' ? String(lf.basis).toUpperCase() : '—';
      if (c?.running) requestAnimationFrame(updateLiveRows);
    };
    if (c?.running) requestAnimationFrame(updateLiveRows);

    return wrap;

    function row(k, v) {
      return el('div', { class: 'cam-row' }, el('span', { text: k }), el('b', { text: v }));
    }
  }

  /* ── 6. Local, evidence-grounded mission assistant ────
     This is deliberately not an online LLM and it never invents a medical
     conclusion. A click evaluates the state that is actually available in
     this browser at that moment: camera telemetry, the captured baseline and
     the console's current advisory. It is a useful mission UI pattern for a
     comm-limited setting, and it stays honest when a channel is absent. */
  function renderMissionAssistant() {
    const answer = el('div', { class: 'mission-answer', role: 'status', 'aria-live': 'polite' },
      el('p', { class: 'mission-answer-title', text: 'SELECT A QUESTION' }),
      el('p', { text: 'This local assistant will check the signals currently available in this browser. It does not use an online AI service and does not make a diagnosis.' }),
    );

    const questions = [
      ['Is the camera ready?', () => {
        const c = state.camera;
        if (!c?.running) return report('CAMERA NOT RUNNING', 'No live camera signal is available. Start Camera Scan before relying on face, head-motion, or eye-landmark readouts.');
        const lock = c.face?.status === 'locked';
        return report(lock ? 'CAMERA SIGNAL ACTIVE' : 'CAMERA SIGNAL LIMITED', `Camera is running at ${Number(c.rateHz || 0).toFixed(1)} Hz. Face lock is ${lock ? 'currently held' : 'not currently held'}, and signal quality is ${Math.round((c.quality || 0) * 100)}%.`);
      }],
      ['Are eye landmarks available?', () => {
        const eye = state.camera?.eye;
        if (!state.camera?.running) return report('EYE SIGNAL UNAVAILABLE', 'The camera is off, so no eye landmarks can be checked.');
        if (!eye?.available) return report('EYE SIGNAL UNAVAILABLE', `No stable local face/iris landmarks are available right now (${String(eye?.status || 'waiting for a face')}). No gaze value is being inferred.`);
        return report('LOCAL EYE LANDMARKS ACTIVE', `The bundled on-device model has stable eye/iris landmarks with ${Math.round((eye.confidence || 0) * 100)}% confidence. This is an experimental face-relative signal, not VOR gain or clinical vHIT.`);
      }],
      ['Do I need calibration?', () => {
        const c = state.camera;
        if (!c?.running) return report('CALIBRATION UNAVAILABLE', 'Start the camera first. A calibration requires a live, still-camera interval.');
        if (!c.calibrated) return report('CALIBRATION NEEDED', 'Noise floor and your neutral reference have not been measured. Hold still and use CALIBRATE before interpreting motion or pose changes.');
        if (!c.neutral) return report('CALIBRATION PARTIAL', 'A noise floor was measured, but no reliable neutral face reference was captured. Improve lighting, face the camera, then calibrate again.');
        return report('CALIBRATION PRESENT', 'A personal noise floor and neutral reference are stored for this live camera session. Recalibrate if lighting, camera position, or the subject changes.');
      }],
      ['What is live right now?', () => {
        const c = state.camera;
        const pieces = [];
        if (c?.running) pieces.push(`camera head motion (${Number(c.headMotion || 0).toFixed(2)} deg/s)`);
        if (c?.eye?.available) pieces.push('local eye/iris landmarks');
        if (state.perms?.orientation === 'granted') pieces.push('device orientation');
        if (state.perms?.motion === 'granted') pieces.push('device motion');
        if (!pieces.length) return report('NO LIVE SIGNAL', 'No browser sensor channel is active. You can start the camera, grant a device sensor, or ingest a documented instrument payload.');
        return report('LIVE SIGNALS', `Available now: ${pieces.join(', ')}. Other mission domains remain unavailable until their real instrument data is connected or ingested.`);
      }],
      ['Can this measure VOR?', () => report('CLINICAL VOR UNAVAILABLE', 'No. A normal webcam cannot produce clinical VOR gain or a vHIT result. This project needs validated high-frame-rate eye/head instrumentation for that channel. The local eye display is only an experimental face-relative landmark check.')],
      ['Is the readiness index ready?', () => {
        const con = window.__VGPS_CONSOLE__?.state;
        const count = con?.sessions?.length || 0;
        if (count < 3) return report('REFERENCE NOT READY', `${count}/3 baseline sessions are captured. Capture at least three real sessions before treating the personal reference as stable.`);
        if (!con?.osi?.ok) return report('INDEX UNAVAILABLE', `A baseline exists (${count} sessions), but the current index cannot be reported: ${con?.osi?.reason || 'insufficient compatible live channels'}.`);
        return report('READINESS INDEX AVAILABLE', `Current OSI is ${con.osi.value} with ${con.osi.domainsAvailable}/${con.osi.domainsExpected} domains available. Read the confidence and advisory beside the index; it is an operational trend, not a diagnosis.`);
      }],
      ['What should I do next?', () => {
        const con = window.__VGPS_CONSOLE__?.state;
        const c = state.camera;
        if (!c?.running) return report('NEXT STEP', 'Start Camera Scan, keep your face in frame, then calibrate while still. This gives the browser its only currently supported local live signal.');
        if (!c.calibrated || !c.neutral) return report('NEXT STEP', 'Hold still and calibrate. The system needs this camera’s noise floor and your own neutral reference before comparing motion.');
        if ((con?.sessions?.length || 0) < 3) return report('NEXT STEP', `Capture baseline sessions after a valid setup. ${con?.sessions?.length || 0}/3 are stored; three or more establish the personal reference.`);
        return report('NEXT STEP', con?.adv?.detail || 'Review the current advisory and repeat the relevant real measurement if a change needs confirmation.');
      }],
    ];

    const ask = (label, getAnswer) => el('button', {
      type: 'button', class: 'mission-question', text: label,
      onclick: () => answer.replaceChildren(...getAnswer()),
    });

    return el('div', { class: 'glass panel mission-assistant' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'LOCAL MISSION ASSISTANT' }),
        el('h3', { text: 'Ask the instrument, not the internet' }),
        el('p', { text: 'Tap a common question. The answer is generated locally from the current browser signals and the project’s own safety rules—no server, cloud AI, camera upload, or fabricated result.' }),
      ),
      el('div', { class: 'mission-grid' },
        el('div', { class: 'mission-questions' }, ...questions.map(([label, fn]) => ask(label, fn))),
        answer,
      ),
      el('p', { class: 'caption', text: 'Scope: this assistant explains only the telemetry that is truly present in this session. It cannot diagnose, replace a flight surgeon, or turn webcam landmarks into a clinical vestibular test.' }),
    );

    function report(title, text) {
      const source = state.camera?.running ? 'LIVE BROWSER DATA' : 'NO LIVE CAMERA DATA';
      return [
        el('p', { class: 'mission-answer-title', text: title }),
        el('p', { text }),
        el('p', { class: 'mission-answer-meta', text: `${source} · checked ${new Date().toLocaleTimeString()}` }),
      ];
    }
  }

  function mountFloatingMissionAssistant() {
    /* The assistant belongs to the product shell, not to a long scrolled
       integration panel. Its answers still use exactly the same live state;
       only the presentation moves to a compact, on-demand chat window. */
    if (document.getElementById('missionAssistant')) return;
    const trigger = $('#assistantToggle');
    const close = el('button', { type: 'button', class: 'mission-close', text: '×', 'aria-label': 'Close mission assistant' });
    assistantShell = el('aside', {
      id: 'missionAssistant', class: 'mission-popover', role: 'dialog',
      'aria-label': 'Local Mission Assistant', 'aria-modal': 'false', hidden: true,
    },
    el('div', { class: 'mission-popover-top' },
      el('span', { text: '● LOCAL AI · LIVE DATA ONLY' }), close,
    ),
    renderMissionAssistant(),
    );
    document.body.append(assistantShell);

    const setOpen = (open) => {
      assistantShell.hidden = !open;
      assistantShell.classList.toggle('is-open', open);
      trigger?.setAttribute('aria-expanded', String(open));
      if (open) assistantShell.querySelector('.mission-question')?.focus();
    };
    on(trigger, 'click', () => setOpen(assistantShell.hidden));
    on(close, 'click', () => setOpen(false));
    on(document, 'keydown', (e) => { if (e.key === 'Escape' && !assistantShell.hidden) setOpen(false); });
  }

  /* ── 7. Live ingest ──────────────────────────────────── */
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
  mountFloatingMissionAssistant();
  return { render, get state() { return S; } };
}
