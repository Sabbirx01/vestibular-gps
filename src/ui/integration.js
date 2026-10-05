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
        el('p', { text: 'Runs entirely on this device. No frame is uploaded, ever. The eye panel only draws when real local face/iris landmarks are detected. If detection is weak or unavailable, it shows UNAVAILABLE — never a simulated eye result. It never reports clinical VOR or vHIT from a normal webcam.' }),
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
    const eyeMap = el('canvas', { class: 'cam-eye-map', width: '640', height: '480', 'aria-label': 'Real eye landmark analysis map' });
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
    const draw = () => {
      requestAnimationFrame(draw);
      if (!c || !c.running) return;
      const pw = cv.width;
      const ph = cv.height;
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

      /* The tracked region, with corner brackets so it reads as an instrument
         lock rather than a decorative rectangle. */
      if (f?.found) {
        const x = mapX(f.x), y = mapY(f.y), w = f.w * kx * pw, h = f.h * ky * ph;
        const locked = f.status === 'locked';
        g.strokeStyle = locked ? 'rgba(95,227,255,0.95)' : 'rgba(255,189,87,0.9)';
        g.lineWidth = 1.5;
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, w, h, Math.min(16, w * 0.1, h * 0.1));
        else g.rect(x, y, w, h);
        g.stroke();
        const arm = Math.max(8, Math.min(18, w * 0.22, h * 0.22));
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, y + arm); g.lineTo(x, y); g.lineTo(x + arm, y);
        g.moveTo(x + w - arm, y); g.lineTo(x + w, y); g.lineTo(x + w, y + arm);
        g.moveTo(x + w, y + h - arm); g.lineTo(x + w, y + h); g.lineTo(x + w - arm, y + h);
        g.moveTo(x + arm, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - arm);
        g.stroke();
        g.beginPath();
        g.arc(mapX(f.cx), mapY(f.cy), 3.5, 0, Math.PI * 2);
        g.fillStyle = locked ? '#5fe3ff' : '#ffbd57';
        g.fill();
      }
      g.restore();

      /* Real local landmark view — no decorative face mesh. It only appears
         after the bundled model has produced stable face/iris landmarks. The
         point field is the model's own landmarks, one pixel each, lit by its
         own depth — it is a reading, not a fixed graphic. */
      const eye = state.camera?.eye;
      if (eye?.available && Array.isArray(eye.points) && eye.points.length >= 478) {
        g.save();
        g.translate(pw, 0); g.scale(-1, 1);
        const pts = eye.points;

        /* the whole face, as a field of small pixels */
        for (let i = 0; i < 468; i += 2) {
          const pt = pts[i];
          const dep = Math.max(0, Math.min(1, (pt.z || 0) * 2.4 + 0.5));
          g.fillStyle = `rgba(140,232,255,${0.14 + (1 - dep) * 0.26})`;
          g.fillRect(mapX(pt.x) - 0.9, mapY(pt.y) - 0.9, 1.8, 1.8);
        }

        /* eyelid contours, lit */
        const ring = (ids, colour, blur, width) => {
          g.save();
          g.strokeStyle = colour; g.lineWidth = width;
          g.shadowColor = colour; g.shadowBlur = blur;
          g.beginPath();
          ids.forEach((id, n) => {
            const pt = pts[id];
            n ? g.lineTo(mapX(pt.x), mapY(pt.y)) : g.moveTo(mapX(pt.x), mapY(pt.y));
          });
          g.closePath(); g.stroke();
          g.restore();
        };
        ring([33, 160, 158, 133, 153, 144], 'rgba(135,255,206,0.98)', 9, 1.6);
        ring([362, 385, 387, 263, 373, 380], 'rgba(135,255,206,0.98)', 9, 1.6);

        /* irises: amber disc, bright rim, pupil and a specular dot */
        [468, 473].forEach((id) => {
          const cx = mapX(pts[id].x), cy = mapY(pts[id].y);
          g.save();
          g.shadowColor = 'rgba(255,190,92,0.95)'; g.shadowBlur = 12;
          g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,190,92,0.22)'; g.fill();
          g.strokeStyle = 'rgba(255,205,130,0.98)'; g.lineWidth = 1.6; g.stroke();
          g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2);
          g.strokeStyle = 'rgba(255,228,180,0.7)'; g.lineWidth = 1; g.stroke();
          g.restore();
          g.beginPath(); g.arc(cx, cy, 1.4, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,247,232,0.98)'; g.fill();
        });
        g.restore();
        g.fillStyle = 'rgba(135,255,206,0.95)';
        g.font = '600 12px ui-monospace, monospace';
        g.fillText('EYE SCANNING · REAL LOCAL LANDMARKS', 14, 48);
      } else {
        g.fillStyle = 'rgba(255,189,87,0.92)';
        g.font = '600 12px ui-monospace, monospace';
        g.fillText(c?.running ? 'EYE SCANNING · AWAITING REAL LANDMARKS' : 'EYE SCAN · UNAVAILABLE', 14, 48);
      }

      /* The adjacent analysis window is driven by the exact same verified
         points. It intentionally stays blank when no landmark signal exists,
         so it cannot be mistaken for an animated face substitute. */
      const mw = eyeMap.width, mh = eyeMap.height;
      eg.clearRect(0, 0, mw, mh);

      /* deep-scope background: a radial wash, so the panel reads as a lit
         instrument rather than a black rectangle */
      const bg = eg.createRadialGradient(mw / 2, mh * 0.46, mh * 0.06, mw / 2, mh * 0.5, mh * 0.8);
      bg.addColorStop(0, '#0a1c33');
      bg.addColorStop(1, '#03070f');
      eg.fillStyle = bg; eg.fillRect(0, 0, mw, mh);

      /* Instrument-only motion: this background is deliberately independent
         of face detection. It makes the analysis surface feel alive without
         ever inventing a face, landmark or eye reading. The status label below
         remains the authority for whether real landmarks exist. */
      const scanT = performance.now() / 1000;
      const gridStep = 32;
      const gridOffset = (scanT * 12) % gridStep;
      eg.save();
      eg.strokeStyle = 'rgba(95,227,255,0.075)'; eg.lineWidth = 1;
      for (let x = -gridStep + gridOffset; x < mw + gridStep; x += gridStep) {
        eg.beginPath(); eg.moveTo(x, 0); eg.lineTo(x, mh); eg.stroke();
      }
      for (let y = -gridStep + gridOffset; y < mh + gridStep; y += gridStep) {
        eg.beginPath(); eg.moveTo(0, y); eg.lineTo(mw, y); eg.stroke();
      }
      const radarX = mw * 0.5, radarY = mh * 0.52;
      const radarR = mh * (0.22 + ((Math.sin(scanT * 2.1) + 1) * 0.04));
      eg.strokeStyle = 'rgba(95,227,255,0.16)'; eg.lineWidth = 1;
      eg.beginPath(); eg.arc(radarX, radarY, radarR, 0, Math.PI * 2); eg.stroke();
      const angle = scanT * 1.7;
      const ray = eg.createLinearGradient(radarX, radarY, radarX + Math.cos(angle) * radarR, radarY + Math.sin(angle) * radarR);
      ray.addColorStop(0, 'rgba(95,227,255,0.34)'); ray.addColorStop(1, 'rgba(95,227,255,0)');
      eg.strokeStyle = ray; eg.beginPath(); eg.moveTo(radarX, radarY); eg.lineTo(radarX + Math.cos(angle) * radarR, radarY + Math.sin(angle) * radarR); eg.stroke();
      eg.restore();

      const mapEye = state.camera?.eye;
      if (mapEye?.available && Array.isArray(mapEye.points) && mapEye.points.length >= 478) {
        const pts = mapEye.points;
        const px = (pt) => pt.x * mw;
        const py = (pt) => pt.y * mh;

        /* glow behind the face, centred on the real landmark centroid */
        let fx = 0, fy = 0;
        for (let i = 0; i < 468; i++) { fx += px(pts[i]); fy += py(pts[i]); }
        fx /= 468; fy /= 468;
        const halo = eg.createRadialGradient(fx, fy, mh * 0.03, fx, fy, mh * 0.62);
        halo.addColorStop(0, 'rgba(52,161,255,0.28)');
        halo.addColorStop(0.6, 'rgba(52,161,255,0.10)');
        halo.addColorStop(1, 'rgba(52,161,255,0)');
        eg.fillStyle = halo; eg.fillRect(0, 0, mw, mh);

        /* Soft eye sockets add depth under the brows. These are shaded around
           the live eye-landmark centroids—not a painted replacement face. */
        const socket = (ids) => {
          const cx = ids.reduce((sum, id) => sum + px(pts[id]), 0) / ids.length;
          const cy = ids.reduce((sum, id) => sum + py(pts[id]), 0) / ids.length;
          const rx = Math.max(12, Math.abs(px(pts[ids[0]]) - px(pts[ids[3]])) * .95);
          eg.save(); eg.translate(cx, cy); eg.scale(rx, rx * .52);
          const shade = eg.createRadialGradient(0, .15, .04, 0, 0, 1);
          shade.addColorStop(0, 'rgba(1,7,18,.52)');
          shade.addColorStop(.58, 'rgba(4,21,41,.24)');
          shade.addColorStop(1, 'rgba(4,12,25,0)');
          eg.fillStyle = shade; eg.fillRect(-1.15, -1.15, 2.3, 2.3);
          eg.restore();
        };
        socket([33, 160, 158, 133, 153, 144]);
        socket([362, 385, 387, 263, 373, 380]);

        /* the model: every landmark as a pixel, coloured and sized by its own
           measured depth (violet far, cyan near) so the face reads as a form */
        let z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < 468; i++) {
          const z = pts[i].z || 0;
          if (z < z0) z0 = z;
          if (z > z1) z1 = z;
        }
        const zspan = Math.max(z1 - z0, 1e-6);
        for (let i = 0; i < 468; i++) {
          const pt = pts[i];
          const t = ((pt.z || 0) - z0) / zspan;          // 0 far, 1 near
          const r = 1.5 + (1 - t) * 1.6;
          const cr = Math.round(150 - 55 * t);
          const cg = Math.round(130 + 97 * t);
          eg.fillStyle = `rgba(${cr},${cg},255,${0.30 + t * 0.55})`;
          eg.fillRect(px(pt) - r / 2, py(pt) - r / 2, r, r);
        }

        /* A faint contour joins only real measured landmark positions. It
           reads as a biometric silhouette, rather than a photograph, and is
           never drawn in the UNAVAILABLE state. */
        const contour = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10];
        eg.save();
        eg.strokeStyle = 'rgba(112,224,255,0.42)'; eg.lineWidth = 1.1;
        eg.shadowColor = 'rgba(95,227,255,0.55)'; eg.shadowBlur = 10;
        eg.beginPath();
        contour.forEach((id, n) => n ? eg.lineTo(px(pts[id]), py(pts[id])) : eg.moveTo(px(pts[id]), py(pts[id])));
        eg.stroke(); eg.restore();

        /* MediaPipe measures the face, not hair or the neck. For a complete
           mission-console silhouette we grow a clearly labelled visual
           envelope from that measured face oval. It is a display boundary,
           never an additional biometric reading. The facial features inside
           remain the actual on-device points above. */
        const faceOval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        faceOval.forEach((id) => { minX = Math.min(minX, px(pts[id])); maxX = Math.max(maxX, px(pts[id])); minY = Math.min(minY, py(pts[id])); maxY = Math.max(maxY, py(pts[id])); });
        const hcX = (minX + maxX) / 2;
        const hcY = minY + (maxY - minY) * 0.46;
        const headRX = (maxX - minX) * 0.72;
        const headRY = (maxY - minY) * 0.83;
        const headPoint = (theta) => ({ x: hcX + Math.cos(theta) * headRX, y: hcY + Math.sin(theta) * headRY });
        const wire = (colour, alpha, lineWidth = 0.8) => {
          eg.save(); eg.strokeStyle = colour; eg.globalAlpha = alpha; eg.lineWidth = lineWidth;
          eg.shadowColor = colour; eg.shadowBlur = 7;
          return () => eg.restore();
        };
        /* The cranium is only an upper-head arc. Keeping the display shell out
           of the cheeks and chin lets the actual landmark jaw shape win, so it
           reads as a human face rather than a round helmet. */
        let restore = wire('#74eaff', .62, 1.25);
        eg.beginPath();
        for (let i = 0; i <= 42; i++) {
          const p = headPoint(Math.PI + (Math.PI * i / 42));
          i ? eg.lineTo(p.x, p.y) : eg.moveTo(p.x, p.y);
        }
        eg.stroke(); restore();

        /* Horizontal and vertical wireframe curves make the outline read as a
           complete head volume, while keeping the live face landmarks clear. */
        restore = wire('rgba(103,221,255,.75)', .42, .65);
        [-.68, -.42, -.16, .10].forEach((lat) => {
          const yy = hcY + lat * headRY;
          const half = headRX * Math.sqrt(Math.max(0.06, 1 - lat * lat));
          eg.beginPath();
          for (let i = 0; i <= 22; i++) {
            const dx = -half + (2 * half * i / 22);
            const bow = (1 - Math.abs(dx / half)) * headRY * .065;
            i ? eg.lineTo(hcX + dx, yy - bow) : eg.moveTo(hcX + dx, yy - bow);
          }
          eg.stroke();
        });
        [-.72, -.42, -.14, .14, .42, .72].forEach((lon) => {
          const xx = hcX + lon * headRX;
          const top = hcY - headRY * Math.sqrt(Math.max(0.06, 1 - lon * lon));
          const bottom = Math.min(hcY + headRY * .30, hcY + headRY * Math.sqrt(Math.max(0.06, 1 - lon * lon)));
          eg.beginPath();
          for (let i = 0; i <= 20; i++) {
            const yy = top + (bottom - top) * i / 20;
            const bow = Math.sin(i / 20 * Math.PI) * lon * headRX * .1;
            i ? eg.lineTo(xx - bow, yy) : eg.moveTo(xx - bow, yy);
          }
          eg.stroke();
        });
        restore();

        /* Ears sit beside the real face oval so the existing mask-like point
           cloud reads as a complete head. These are a soft visual envelope
           (the front camera does not measure ear geometry), deliberately dimmer
           than the live eyes and face landmarks. */
        const drawEar = (side) => {
          const ex = hcX + side * headRX * 0.93;
          const ey = hcY + headRY * 0.06;
          const rx = headRX * 0.14;
          const ry = headRY * 0.24;
          const tilt = side * 0.10;
          const earWire = wire('rgba(118,228,255,.78)', .46, 1);
          eg.save(); eg.translate(ex, ey); eg.rotate(tilt);
          eg.beginPath(); eg.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); eg.stroke();
          eg.beginPath(); eg.ellipse(-side * rx * .12, 0, rx * .54, ry * .64, 0, Math.PI * .18, Math.PI * 1.82); eg.stroke();
          eg.beginPath();
          eg.moveTo(side * rx * .10, -ry * .45);
          eg.bezierCurveTo(-side * rx * .55, -ry * .12, -side * rx * .42, ry * .34, side * rx * .08, ry * .47);
          eg.stroke();
          eg.restore(); earWire();
        };
        drawEar(-1); drawEar(1);

        /* Estimated neck envelope visually connects the full head to the scan
           frame. Its opacity is lower than real landmark geometry on purpose. */
        const neckTopY = hcY + headRY * .67;
        const neckBottomY = Math.min(mh - 34, hcY + headRY * 1.46);
        const neckL = hcX - headRX * .42, neckR = hcX + headRX * .42;
        restore = wire('rgba(108,220,255,.7)', .38, .9);
        eg.beginPath();
        eg.moveTo(neckL, neckTopY); eg.bezierCurveTo(neckL - headRX * .13, neckBottomY - 25, neckL - headRX * .08, neckBottomY, hcX - headRX * .60, neckBottomY);
        eg.moveTo(neckR, neckTopY); eg.bezierCurveTo(neckR + headRX * .13, neckBottomY - 25, neckR + headRX * .08, neckBottomY, hcX + headRX * .60, neckBottomY);
        eg.stroke();
        for (let i = 0; i < 5; i++) {
          const y = neckTopY + (neckBottomY - neckTopY) * (i / 4);
          const spread = headRX * (.40 + .2 * (i / 4));
          eg.beginPath(); eg.moveTo(hcX - spread, y); eg.quadraticCurveTo(hcX, y + 9, hcX + spread, y); eg.stroke();
        }
        restore();

        const trace = (ids, colour, width, blur) => {
          eg.save();
          eg.strokeStyle = colour; eg.lineWidth = width;
          eg.shadowColor = colour; eg.shadowBlur = blur;
          eg.beginPath();
          ids.forEach((id, n) => n ? eg.lineTo(px(pts[id]), py(pts[id])) : eg.moveTo(px(pts[id]), py(pts[id])));
          eg.closePath(); eg.stroke();
          eg.restore();
        };

        /* Feature topology — all index paths are MediaPipe face landmarks.
           These clean anatomical contours turn the point cloud into a readable
           face structure: brows, nasal bridge, lips and cheek planes. */
        const openTrace = (ids, colour, width = 1, blur = 0, alpha = 1) => {
          eg.save();
          eg.strokeStyle = colour; eg.lineWidth = width; eg.globalAlpha = alpha;
          eg.shadowColor = colour; eg.shadowBlur = blur;
          eg.beginPath();
          ids.forEach((id, n) => n ? eg.lineTo(px(pts[id]), py(pts[id])) : eg.moveTo(px(pts[id]), py(pts[id])));
          eg.stroke(); eg.restore();
        };
        const brow = 'rgba(160,226,255,0.92)';
        openTrace([70, 63, 105, 66, 107], brow, 1.3, 6);
        openTrace([336, 296, 334, 293, 300], brow, 1.3, 6);
        openTrace([6, 197, 195, 5, 4], 'rgba(130,208,255,0.74)', 1.05, 5);
        openTrace([98, 97, 2, 326, 327], 'rgba(130,208,255,0.74)', 1.05, 5);
        trace([61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146], 'rgba(106,213,255,0.76)', 1.25, 7);
        trace([78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 42, 183], 'rgba(156,235,255,0.42)', .72, 4);
        openTrace([234, 93, 132, 58], 'rgba(100,213,255,0.45)', .8, 3);
        openTrace([454, 323, 361, 288], 'rgba(100,213,255,0.45)', .8, 3);
        /* Sparse real-point links imply a premium wire mesh, without filling
           the face with a fake solid mask. */
        [[10, 70], [10, 336], [70, 33], [336, 263], [33, 1], [263, 1], [1, 13], [13, 152], [234, 61], [454, 291], [58, 17], [288, 17]].forEach(([a, b]) => {
          openTrace([a, b], 'rgba(92,197,255,0.28)', .65, 2);
        });
        trace([33, 160, 158, 133, 153, 144], 'rgba(139,255,210,1)', 2.2, 14);
        trace([362, 385, 387, 263, 373, 380], 'rgba(139,255,210,1)', 2.2, 14);
        /* Iris landmarks form a small polygon, but the human pupil/iris is
           circular. Use their real centroid and measured radius to render a
           smooth circular ring rather than a diamond-shaped outline. */
        const irisRing = (ids) => {
          const cx = ids.reduce((sum, id) => sum + px(pts[id]), 0) / ids.length;
          const cy = ids.reduce((sum, id) => sum + py(pts[id]), 0) / ids.length;
          const measured = Math.max(...ids.map((id) => Math.hypot(px(pts[id]) - cx, py(pts[id]) - cy)));
          /* Iris points surround the visible iris, but drawing their full
             radius looked like oversized goggles. A smaller ring marks the
             pupil/iris centre at a natural scale while remaining tied to the
             measured landmark centroid. */
          const radius = Math.max(2.15, measured * .58);
          eg.save(); eg.shadowColor = 'rgba(255,194,92,.9)'; eg.shadowBlur = 9;
          eg.fillStyle = 'rgba(255,188,82,.10)'; eg.beginPath(); eg.arc(cx, cy, radius, 0, Math.PI * 2); eg.fill();
          eg.strokeStyle = 'rgba(255,214,145,.92)'; eg.lineWidth = 1.25; eg.stroke();
          eg.shadowBlur = 3; eg.beginPath(); eg.arc(cx, cy, radius * .38, 0, Math.PI * 2); eg.strokeStyle = 'rgba(255,242,215,.72)'; eg.lineWidth = .75; eg.stroke();
          eg.restore();
          eg.fillStyle = 'rgba(255,251,237,.98)'; eg.beginPath(); eg.arc(cx, cy, .9, 0, Math.PI * 2); eg.fill();
        };
        irisRing([468, 469, 470, 471, 472]);
        irisRing([473, 474, 475, 476, 477]);

        /* the sweep: a gradient tail plus a glowing core line */
        const sy = (performance.now() / 9) % mh;
        const band = eg.createLinearGradient(0, sy - 46, 0, sy + 46);
        band.addColorStop(0, 'rgba(95,227,255,0)');
        band.addColorStop(0.5, 'rgba(95,227,255,0.34)');
        band.addColorStop(1, 'rgba(95,227,255,0)');
        eg.fillStyle = band; eg.fillRect(0, sy - 46, mw, 92);
        eg.save();
        eg.shadowColor = 'rgba(170,245,255,0.95)'; eg.shadowBlur = 18;
        eg.fillStyle = 'rgba(198,249,255,0.95)';
        eg.fillRect(0, sy - 1, mw, 2);
        eg.restore();

        /* scope brackets */
        const A = 22;
        eg.strokeStyle = 'rgba(95,227,255,0.45)'; eg.lineWidth = 2;
        eg.beginPath();
        eg.moveTo(10, 10 + A); eg.lineTo(10, 10); eg.lineTo(10 + A, 10);
        eg.moveTo(mw - 10 - A, 10); eg.lineTo(mw - 10, 10); eg.lineTo(mw - 10, 10 + A);
        eg.moveTo(mw - 10, mh - 10 - A); eg.lineTo(mw - 10, mh - 10); eg.lineTo(mw - 10 - A, mh - 10);
        eg.moveTo(10 + A, mh - 10); eg.lineTo(10, mh - 10); eg.lineTo(10, mh - 10 - A);
        eg.stroke();

        eg.font = '600 16px ui-monospace, monospace'; eg.fillStyle = 'rgba(139,255,210,.98)';
        eg.fillText('EYE SCANNING', 18, 28);
        eg.font = '12px ui-monospace, monospace'; eg.fillStyle = 'rgba(220,245,255,.78)';
        eg.fillText(`REAL LANDMARKS · ${Math.round((mapEye.confidence || 0) * 100)}%`, 18, 48);
        eg.fillStyle = 'rgba(95,227,255,.68)';
        eg.fillText('LIVE FACE LANDMARKS · FULL-HEAD VISUAL ENVELOPE', 18, mh - 22);
      } else {
        eg.font = '600 16px ui-monospace, monospace'; eg.fillStyle = 'rgba(255,189,87,.9)';
        eg.fillText('EYE SCAN UNAVAILABLE', 18, 28);
        eg.font = '12px ui-monospace, monospace'; eg.fillStyle = 'rgba(220,245,255,.54)';
        eg.fillText(c?.running ? 'WAITING FOR REAL FACE / IRIS LANDMARKS' : 'CAMERA IS OFF', 18, 48);
        eg.fillStyle = 'rgba(95,227,255,.46)';
        eg.fillText('INSTRUMENT GRID ACTIVE · NO BIOMETRIC RESULT', 18, mh - 22);
      }

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
      g.font = '600 14px ui-monospace, monospace';
      const badge = verdict === 'VERIFIED';
      g.fillStyle = badge ? 'rgba(95,227,255,0.95)' : 'rgba(255,189,87,0.95)';
      g.fillText(badge ? `FACE VERIFIED · ${((now - heldSince) / 1000).toFixed(1)}s` : verdict, 14, 26);

      g.font = '11px ui-monospace, monospace';
      if (f) {
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.fillText(`${String(f.status).toUpperCase()}${f.basis && f.basis !== '—' ? ` VIA ${String(f.basis).toUpperCase()}` : ''} · CONF ${Math.round((f.confidence || 0) * 100)}%`, 14, ph - 30);
        const pose = (f.yaw === null || f.yaw === undefined)
          ? `POSE — ${String(f.poseNote || 'unavailable').toUpperCase()}`
          : `YAW ${f.yaw > 0 ? '+' : ''}${f.yaw.toFixed(1)}°  PITCH ${f.pitch > 0 ? '+' : ''}${f.pitch.toFixed(1)}°  ROLL ${f.roll > 0 ? '+' : ''}${f.roll.toFixed(1)}°`;
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

    const questionRail = (direction) => el('div', { class: 'mission-question-rail', 'aria-label': 'Common questions' },
      el('div', { class: `mission-question-track ${direction}` },
        /* Duplicate once so the CSS marquee can loop without a blank gap. The
           buttons are still real controls; each answer is computed locally at
           the instant it is clicked. */
        ...questions.concat(questions).map(([label, fn]) => ask(label, fn)),
      ),
    );

    return el('div', { class: 'glass panel mission-assistant' },
      el('div', { class: 'panel-head' },
        el('p', { class: 'eyebrow', text: 'LOCAL MISSION ASSISTANT' }),
        el('h3', { text: 'Ask the instrument, not the internet' }),
        el('p', { text: 'Tap a common question. The answer is generated locally from the current browser signals and the project’s own safety rules—no server, cloud AI, camera upload, or fabricated result.' }),
      ),
      el('div', { class: 'mission-chat' },
        answer,
        el('div', { class: 'mission-question-deck' },
          el('p', { class: 'mission-question-label', text: 'COMMON QUESTIONS · TAP TO ASK' }),
          questionRail('to-left'),
          questionRail('to-right'),
        ),
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
