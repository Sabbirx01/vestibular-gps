/* ═══════════════════════════════════════════════════════════
   panels — the data-driven sections.
   Body (sensory weighting) · Sensors (permissions, simulator,
   charts, recorder) · Space (gravity, otolith, timeline).
   Every figure on screen is read from the store; nothing is a
   decorative moving number.
   ═══════════════════════════════════════════════════════════ */

import { $, $$, el, on, clamp, damp, lerp, fitCanvas, download, cssVar, fmt, TAU } from '../core/util.js';
import {
  state, set, subscribe, bus, toast, startRecording, stopRecording,
} from '../core/store.js';
import { GRAVITIES, TIMELINE, SENSORY_INPUTS, sourcesOf } from '../science/content.js';

/* ═══════════════════════════════════════════════════════════
   RollingChart — a small, allocation-light 2D line chart.
   ═══════════════════════════════════════════════════════════ */
export class RollingChart {
  constructor(canvas, { series = [], window: win = 240, yRange = null, grid = true } = {}) {
    this.canvas = canvas;
    this.series = series;             // [{ key, color, label }]
    this.window = win;
    this.yRange = yRange;
    this.grid = grid;
    this.buffers = new Map(series.map((s) => [s.key, []]));
    this.autoScale = !yRange;
    this.peak = 1;
    this.drawn = 0;
  }

  push(values) {
    for (const s of this.series) {
      const b = this.buffers.get(s.key);
      const v = values[s.key];
      b.push(Number.isFinite(v) ? v : 0);
      if (b.length > this.window) b.shift();
    }
    if (this.autoScale) {
      let p = 1;
      for (const b of this.buffers.values()) for (const v of b) p = Math.max(p, Math.abs(v));
      this.peak = damp(this.peak, p, 0.6, 1 / 60);
    }
  }

  clear() { for (const b of this.buffers.values()) b.length = 0; this.peak = 1; }

  draw() {
    const c = this.canvas;
    if (!c || !c.isConnected || c.offsetParent === null) return;
    const { ctx, w, h } = fitCanvas(c, { maxDpr: 2 });
    ctx.clearRect(0, 0, w, h);

    const muted = cssVar('--muted') || '#8ba0c0';
    const line = cssVar('--line') || 'rgba(122,170,220,.14)';

    const padL = 34, padR = 8, padT = 10, padB = 16;
    const iw = Math.max(1, w - padL - padR);
    const ih = Math.max(1, h - padT - padB);

    const range = this.yRange || [-this.peak * 1.15, this.peak * 1.15];
    const [y0, y1] = range;
    const toY = (v) => padT + ih - ((v - y0) / (y1 - y0)) * ih;

    /* grid */
    if (this.grid) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (ih * i) / 4;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
      }
      /* zero line emphasised */
      const zy = toY(0);
      ctx.strokeStyle = 'rgba(122,170,220,.32)';
      ctx.beginPath(); ctx.moveTo(padL, zy); ctx.lineTo(padL + iw, zy); ctx.stroke();

      ctx.fillStyle = muted;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(y1.toFixed(0), padL - 6, padT + 2);
      ctx.fillText('0', padL - 6, zy);
      ctx.fillText(y0.toFixed(0), padL - 6, padT + ih - 2);
    }

    /* series */
    for (const s of this.series) {
      const b = this.buffers.get(s.key);
      if (b.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < b.length; i++) {
        const x = padL + (i / (this.window - 1)) * iw;
        const y = toY(clamp(b[i], y0, y1));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      /* soft glow for the leading point */
      const lx = padL + ((b.length - 1) / (this.window - 1)) * iw;
      const ly = toY(clamp(b[b.length - 1], y0, y1));
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.arc(lx, ly, 7, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    this.drawn++;
  }
}

/* Generic animated 2D path chart used by the lab and VOR sections */
export class PathChart {
  constructor(canvas) { this.canvas = canvas; this.series = []; }

  setSeries(series) { this.series = series; }   // [{ points:[{x,y}], color, width, dashed }]

  draw({ xLabel = '', yLabel = '', xRange = [0, 1], yRange = [-1, 1], grid = true } = {}) {
    const c = this.canvas;
    if (!c || !c.isConnected || c.offsetParent === null) return;
    const { ctx, w, h } = fitCanvas(c, { maxDpr: 2 });
    ctx.clearRect(0, 0, w, h);

    const muted = cssVar('--muted') || '#8ba0c0';
    const line = cssVar('--line') || 'rgba(122,170,220,.14)';
    const padL = 40, padR = 12, padT = 12, padB = 24;
    const iw = Math.max(1, w - padL - padR);
    const ih = Math.max(1, h - padT - padB);

    const [x0, x1] = xRange, [y0, y1] = yRange;
    const X = (v) => padL + ((v - x0) / (x1 - x0)) * iw;
    const Y = (v) => padT + ih - ((v - y0) / (y1 - y0)) * ih;

    if (grid) {
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padT + (ih * i) / 4;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + iw, y); ctx.stroke();
      }
      for (let i = 0; i <= 6; i++) {
        const x = padL + (iw * i) / 6;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ih); ctx.stroke();
      }
      const zy = Y(0);
      if (zy > padT && zy < padT + ih) {
        ctx.strokeStyle = 'rgba(122,170,220,.3)';
        ctx.beginPath(); ctx.moveTo(padL, zy); ctx.lineTo(padL + iw, zy); ctx.stroke();
      }
      ctx.fillStyle = muted;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(y1.toFixed(1), padL - 6, padT + 3);
      ctx.fillText(y0.toFixed(1), padL - 6, padT + ih - 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(xLabel, padL + iw / 2, padT + ih + 7);
      ctx.save();
      ctx.translate(10, padT + ih / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }

    for (const s of this.series) {
      if (!s.points?.length) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 1.7;
      ctx.setLineDash(s.dashed ? [5, 4] : []);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = X(p.x), y = Y(p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      if (s.dots) {
        ctx.fillStyle = s.color;
        s.points.forEach((p, i) => {
          if (i % Math.max(1, Math.floor(s.points.length / 40)) !== 0) return;
          ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 1.8, 0, TAU); ctx.fill();
        });
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   BODY — sensory weighting
   ═══════════════════════════════════════════════════════════ */
export function mountBodySection() {
  const host = $('#bodyWeights');
  const out = $('#bodyReadout');
  if (!host) return;
  const values = {};
  SENSORY_INPUTS.forEach((s) => { values[s.id] = s.def; });

  host.innerHTML = '';
  SENSORY_INPUTS.forEach((s) => {
    const b = el('b', { text: `${s.def}%` });
    const input = el('input', { type: 'range', min: s.min, max: s.max, value: s.def, step: 1, 'aria-label': s.label });
    input.addEventListener('input', () => {
      values[s.id] = +input.value;
      b.textContent = `${input.value}%`;
      render();
    });
    const label = el('span', {}, document.createTextNode(s.label), b);
    host.append(el('label', { class: 'range' }, label, input));
  });

  function render() {
    const total = Object.values(values).reduce((a, b) => a + b, 0) || 1;
    const rel = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v / total]));
    /* a simple arbitration model: the estimate is the weighted mean direction,
       and disagreement between the inputs produces the conflict term. */
    const conflict = 1 - (Math.max(...Object.values(rel)) || 0) / (1 / 3);
    const leaned = (rel.vision - rel.proprioception) * 14;
    const instability = clamp(conflict * rel.vestibular * 100 + Math.abs(rel.vision - rel.proprioception) * 60, 0, 100);

    out.innerHTML = '';
    const rows = [
      ['RELATIVE WEIGHT', `vision ${(rel.vision * 100).toFixed(0)}% · vestibular ${(rel.vestibular * 100).toFixed(0)}% · proprioception ${(rel.proprioception * 100).toFixed(0)}%`],
      ['DISAGREEMENT INDEX', `${(conflict * 100).toFixed(0)} / 100`],
      ['MODELLED LEAN', `${leaned >= 0 ? '+' : ''}${leaned.toFixed(1)}°`],
      ['CONFLICT LOAD (MODEL)', `${instability.toFixed(0)} / 100 — ${instability > 66 ? 'high' : instability > 33 ? 'moderate' : 'low'}`],
    ];
    rows.forEach(([k, v]) => out.append(el('div', {}, el('span', { text: k }), el('b', { text: v }))));
    out.style.display = 'grid';
    out.style.gap = '6px';
    out.style.fontFamily = 'var(--font-mono)';
    out.style.fontSize = 'var(--fs-xs)';
  }
  render();
}

/* ═══════════════════════════════════════════════════════════
   SENSORS — permissions, source, simulator, charts, recorder
   ═══════════════════════════════════════════════════════════ */
export function mountSensorSection({ hub }) {
  /* ── secure-context note, stated honestly ── */
  const secure = $('#secureNote');
  if (secure) {
    const ok = window.isSecureContext;
    secure.textContent = ok
      ? 'Page served over a secure context — sensor permission prompts are available.'
      : 'This page is NOT in a secure context, so browser sensor APIs are blocked. Simulation mode works fully. Serve over HTTPS or localhost to enable device sensors.';
    secure.style.color = ok ? '' : 'var(--amber)';
  }

  /* ── permission buttons ── */
  const permDefs = [
    ['orientation', '#permOrientation', '#permOrientationState', 'Device orientation: which way the device is pointing. Used to drive the 3D scene and the inner-ear model.'],
    ['motion', '#permMotion', '#permMotionState', 'Device motion: rotation rate and linear acceleration. Used for the angular-velocity stream and charts.'],
    ['geo', '#permGeo', '#permGeoState', 'Location: an entirely optional separate layer. Never combined with motion data, never uploaded.'],
  ];
  const badgeState = (elv, s) => {
    elv.textContent = s.toUpperCase();
    elv.className = 'badge ' + (s === 'granted' ? 'is-live' : s === 'denied' || s === 'unavailable' ? 'is-bad' : 'is-sim');
  };

  for (const [id, btnSel, stateSel, reason] of permDefs) {
    const btn = $(btnSel), st = $(stateSel);
    if (!btn || !st) continue;
    badgeState(st, state.perms[id] || 'idle');
    btn.title = reason;
    on(btn, 'click', async () => {
      const p = hub.get(id);
      /* One call for every provider — the old if/else had identical branches,
         so it read as though geolocation were handled differently when it is
         not. The difference is downstream, in which source is switched to. */
      const res = await p.requestPermission();
      badgeState(st, res);
      if (res === 'granted') {
        toast('PERMISSION GRANTED', reason, 'ok', 3600);
        await hub.switchTo(id === 'geo' ? state.source : 'LIVE_SENSOR', { silent: true });
        if (id !== 'geo') syncSourceButtons();
      } else {
        toast('PERMISSION NOT GRANTED', 'No problem — simulation mode continues to drive every demo on this page.', 'warn', 4200);
      }
    });
    bus.on('provider-status', ({ id: pid, status }) => { if (pid === id) badgeState(st, status); });
  }

  /* ── source buttons ── */
  const srcBtns = $$('[data-source]');
  const explain = $('#sourceExplain');
  const blurbs = {
    SIMULATION: 'No sensor connected. Values are mathematically generated and labelled as simulation everywhere they appear.',
    LIVE_SENSOR: 'Reading the device orientation and motion APIs directly. Nothing leaves this device.',
    REPLAY: 'Playing back a captured session from memory. Values are historical, not live.',
  };
  const syncSourceButtons = () => {
    srcBtns.forEach((b) => b.classList.toggle('is-on', b.dataset.source === state.source));
    if (explain) explain.textContent = blurbs[state.source] || '';
  };
  for (const b of srcBtns) {
    on(b, 'click', async () => {
      const ok = await hub.switchTo(b.dataset.source);
      syncSourceButtons();
      if (!ok) return;
    });
  }
  bus.on('source-request', async (id) => { await hub.switchTo(id, { silent: true }); syncSourceButtons(); });
  bus.on('source-changed', syncSourceButtons);
  syncSourceButtons();

  /* ── sensor simulator ── */
  const sim = { yaw: 0, pitch: 0, roll: 0, acc: 0 };
  const bindSim = (sel, valSel, key, fmtFn) => {
    const input = $(sel), v = $(valSel);
    if (!input) return;
    on(input, 'input', () => {
      sim[key] = +input.value;
      v.textContent = fmtFn(sim[key]);
      hub.get('simulation').setManual({ ...sim, yawRate: 0, pitchRate: 0, rollRate: 0 });
      if (state.source !== 'SIMULATION') hub.switchTo('SIMULATION', { silent: true }).then(syncSourceButtons);
    });
  };
  bindSim('#simYaw', '#simYawV', 'yaw', (n) => `${n}°`);
  bindSim('#simPitch', '#simPitchV', 'pitch', (n) => `${n}°`);
  bindSim('#simRoll', '#simRollV', 'roll', (n) => `${n}°`);
  bindSim('#simAcc', '#simAccV', 'acc', (n) => `${n.toFixed(2)} g`);

  on($('#simAuto'), 'click', () => {
    hub.switchTo('SIMULATION', { silent: true }).then(() => {
      hub.get('simulation').playScript(16);
      syncSourceButtons();
      toast('MOTION SEQUENCE', 'A deterministic 16-second motion script is now driving the scene. Watch the charts and the inner-ear model together.', 'info', 5200);
    });
  });
  bus.on('script-done', () => toast('SEQUENCE COMPLETE', 'Motion script finished. The scene continues with idle drift.', 'ok', 3200));

  /* ── charts ── */
  const chart = new RollingChart($('#sensorChart'), {
    series: [
      { key: 'yaw', color: cssVar('--cyan') || '#5fe3ff' },
      { key: 'pitch', color: cssVar('--violet') || '#a877ff' },
      { key: 'roll', color: cssVar('--amber') || '#ffb547' },
    ],
  });

  /* ── attitude indicators ── */
  const attHost = $('#attitude');
  const attrCanvases = {};
  if (attHost) {
    for (const [key, label] of [['roll', 'ROLL'], ['pitch', 'PITCH'], ['yaw', 'YAW']]) {
      const c = el('canvas');
      const wrap = el('div', { class: 'att' }, c, el('span', { text: label }), el('b', { text: '0°' }));
      attHost.append(wrap);
      attrCanvases[key] = { canvas: c, value: wrap.querySelector('b') };
    }
  }

  function drawAttitude() {
    for (const [key, o] of Object.entries(attrCanvases)) {
      const { ctx, w, h } = fitCanvas(o.canvas, { maxDpr: 2 });
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
      const mute = cssVar('--line') || 'rgba(122,170,220,.2)';

      ctx.strokeStyle = mute; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();

      const v = state.attitude[key] || 0;
      o.value.textContent = `${v.toFixed(0)}°`;
      const a = (v * Math.PI) / 180;

      if (key === 'roll') {
        ctx.strokeStyle = cssVar('--cyan') || '#5fe3ff';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(cx - R * 0.85, cy); ctx.lineTo(cx + R * 0.85, cy); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - Math.cos(a) * R, cy - Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.stroke();
      } else if (key === 'pitch') {
        const off = clamp(v / 90, -1, 1) * R;
        ctx.strokeStyle = cssVar('--violet') || '#a877ff';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(cx - R, cy + off); ctx.lineTo(cx + R, cy + off); ctx.stroke();
      } else {
        const a2 = (v * Math.PI) / 180;
        ctx.strokeStyle = cssVar('--amber') || '#ffb547';
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a2) * R, cy - Math.cos(a2) * R); ctx.stroke();
      }
    }
  }

  /* ── key/value readouts ── */
  const kv = $('#sensorKv');
  function renderKv() {
    if (!kv) return;
    const rows = [
      ['SOURCE', state.source],
      ['SAMPLE RATE', `${state.link.hz} Hz`],
      ['REPORT INTERVAL', state.link.latencyMs ? `${state.link.latencyMs.toFixed(0)} ms` : '—'],
      ['SAMPLES', String(state.link.samples)],
      ['ANGULAR MAG', `${Math.hypot(state.sample.yawRate, state.sample.pitchRate, state.sample.rollRate).toFixed(1)} deg/s`],
      ['JERK (MODEL)', `${state.sample.jerk.toFixed(1)} deg/s²`],
      ['ACCEL MAG', `${state.sample.accelMag.toFixed(3)} g`],
      ['SWAY (MODEL)', state.sample.sway.toFixed(3)],
      ['LINK', state.link.stale ? 'STALE' : 'ACTIVE'],
    ];
    kv.innerHTML = '';
    rows.forEach(([k, v]) => kv.append(el('div', {}, el('dt', { text: k }), el('dd', { text: v }))));
  }

  /* ── recorder ── */
  const recBtns = {
    start: $('#recStart'), stop: $('#recStop'), play: $('#recPlay'),
    json: $('#recExportJson'), csv: $('#recExportCsv'),
  };
  const recStatus = $('#recStatus');
  on(recBtns.start, 'click', () => { startRecording(); syncRec(); });
  on(recBtns.stop, 'click', () => { stopRecording(); syncRec(); });
  on(recBtns.play, 'click', async () => {
    await hub.switchTo('REPLAY', { silent: false });
    syncSourceButtons(); syncRec();
  });
  on(recBtns.json, 'click', () => {
    const s = state.recorder.samples;
    download(`vestibular-gps-session-${Date.now()}.json`, JSON.stringify({
      generated: new Date().toISOString(),
      source: 'device sensor capture',
      mode: state.mode,
      note: 'Captured locally in the browser. No clinical interpretation is implied.',
      samples: s,
    }, null, 2));
  });
  on(recBtns.csv, 'click', () => {
    const s = state.recorder.samples;
    const head = 't_ms,yaw_deg,pitch_deg,roll_deg,gyro_z_dps,gyro_x_dps,gyro_y_dps,accel_x,accel_y,accel_z,source';
    const rows = s.map((r) => [r.t, r.yaw, r.pitch, r.roll, r.gy, r.gx, r.gz, r.ax, r.ay, r.az, r.src].join(','));
    download(`vestibular-gps-session-${Date.now()}.csv`, [head, ...rows].join('\n'), 'text/csv');
  });
  bus.on('replay-done', () => { toast('REPLAY FINISHED', 'End of the recorded session.', 'ok', 3200); syncRec(); });

  function syncRec() {
    const r = state.recorder;
    recBtns.start.disabled = r.recording;
    recBtns.stop.disabled = !r.recording;
    recBtns.play.disabled = r.recording || r.samples.length < 3;
    recBtns.json.disabled = r.samples.length < 3;
    recBtns.csv.disabled = r.samples.length < 3;
    if (recStatus) {
      recStatus.textContent = r.recording
        ? `Recording… ${r.samples.length} samples buffered.`
        : r.samples.length
          ? `${r.samples.length} samples · ${(r.durationMs / 1000).toFixed(1)} s · ${r.sizeKb} KB · held in memory only.`
          : 'Idle. No samples captured.';
    }
  }
  syncRec();

  /* ── per-frame updates ── */
  let acc = 0;
  bus.on('frame', (dt) => {
    chart.push({ yaw: state.sample.yawRate, pitch: state.sample.pitchRate, roll: state.sample.rollRate });
    acc += dt;
    if (acc < 1 / 24) return;
    acc = 0;
    chart.draw();
    drawAttitude();
    renderKv();
    if (state.recorder.recording) syncRec();
  });

  window.addEventListener('resize', () => { chart.draw(); drawAttitude(); });
  return { syncSourceButtons };
}

/* ═══════════════════════════════════════════════════════════
   SPACE — gravity environments, otolith model, timeline
   ═══════════════════════════════════════════════════════════ */
export function mountSpaceSection({ scene, onMode }) {
  const row = $('#gravityRow');
  const readout = $('#gravityReadout');
  const otolith = $('#otolithViz');
  const otCap = $('#otolithCaption');
  const tl = $('#timeline');
  const tlDetail = $('#timelineDetail');

  /* ── gravity buttons ── */
  const btns = new Map();
  if (row) {
    row.innerHTML = '';
    GRAVITIES.forEach((g) => {
      const b = el('button', {
        type: 'button', class: 'btn btn-sm',
        dataset: { cursorTarget: g.label },
        text: `${g.label} · ${g.short}`,
      });
      b.addEventListener('click', () => { onMode(g.id); paint(g.id); });
      row.append(b);
      btns.set(g.id, b);
    });
  }

  const G_TEXT = {
    EARTH: 'Constant 1 g load. Otoconia sit under a steady downward pull, giving the brain an unambiguous reference for “down”, and the canals report rotation as they always do.',
    MOON: 'Roughly one sixth of Earth’s gravitational acceleration. Otolith loading is much weaker, so the “down” cue is fainter — but still present.',
    MARS: 'About 38% of Earth’s gravitational acceleration. A clearly present but reduced load, between the lunar and terrestrial cases.',
    MICROGRAVITY: 'The steady gravitational load disappears. Rotation detection is unchanged — what is lost is the constant linear reference that told the brain where “down” was.',
  };

  function paint(id) {
    btns.forEach((b, k) => b.classList.toggle('is-on', k === id));
    const g = GRAVITIES.find((x) => x.id === id) || GRAVITIES[0];

    if (readout) {
      readout.innerHTML = '';
      const cells = [
        ['GRAVITATIONAL LOAD', g.short, G_TEXT[id]],
        ['OTOLITH LOAD (MODEL)', `${(g.otolith * 100).toFixed(0)}%`, 'Conceptual model relative to the 1 g reference — not a measurement.'],
        ['CANAL ROTATION SIGNAL', '100%', 'Angular motion detection is essentially unaffected by the gravitational environment.'],
        ['FREE-FLOAT INDEX', `${(g.float * 100).toFixed(0)}%`, 'How much the visual scene simulates unconstrained drifting.'],
      ];
      cells.forEach(([k, v, d]) => readout.append(
        el('div', { class: 'gr' }, el('span', { text: k }), el('b', { text: v }), el('p', { text: d })),
      ));
    }

    /* otolith model: stones displace by the gravity vector */
    if (otolith && !otolith.dataset.built) {
      otolith.dataset.built = '1';
      otolith.innerHTML = '';
      otolith.append(el('div', { class: 'ot-floor' }), el('div', { class: 'ot-gel' }));
      for (let i = 0; i < 13; i++) {
        otolith.append(el('div', { class: 'ot-stone', dataset: { i: String(i) } }));
      }
      for (let i = 0; i < 9; i++) {
        const h = el('div', { class: 'ot-hair' });
        h.style.left = `${18 + i * 7.6}%`;
        otolith.append(h);
      }
      otolith.append(el('div', { class: 'ot-vector' }));
      otolith.append(el('div', { class: 'ot-label', text: 'GRAVITY VECTOR', style: 'right:12px;top:12px;' }));
      otolith.append(el('div', { class: 'ot-label', text: 'OTOCONIA', style: 'left:12px;top:40%;' }));
      otolith.append(el('div', { class: 'ot-label', text: 'HAIR CELLS', style: 'left:12px;bottom:14px;' }));
    }

    if (otolith) {
      const load = g.otolith;
      $$('.ot-stone', otolith).forEach((s, i) => {
        const spread = 44 - load * 6;
        const x = 50 + (i - 6) * spread * 0.24;
        const y = 34 + (1 - load) * 2 + Math.sin(i * 1.7) * 6 * load;
        s.style.left = `${x}%`;
        s.style.bottom = `${y}%`;
        s.style.opacity = String(0.25 + load * 0.75);
      });
      $$('.ot-gel', otolith).forEach((g2) => { g2.style.opacity = String(0.25 + load * 0.75); });
      $$('.ot-hair', otolith).forEach((h) => { h.style.opacity = String(0.2 + load * 0.7); });
      $$('.ot-vector', otolith).forEach((v) => {
        v.style.transform = `rotate(${(1 - load) * 34}deg) scaleY(${0.35 + load * 0.65})`;
        v.style.opacity = String(0.2 + load * 0.8);
      });
      if (otCap) {
        otCap.textContent = load > 0.6
          ? 'Otoconia are held against the macula by a clear gravitational vector — the hair cells are tonically deflected, giving a continuous position signal.'
          : load > 0.15
            ? 'Reduced load: the vector is shorter and the otoconia rest closer to the gel. Position sensing still works, but with a weaker reference.'
            : 'No steady vector. The otoconia are effectively unloaded, so the continuous “which way is down” signal is absent — a modelled interpretation of the microgravity case, not a measured recording.';
      }
    }
  }

  bus.on('mode', paint);
  paint(state.mode);

  /* ── timeline ── */
  if (tl) {
    tl.innerHTML = '';
    TIMELINE.forEach((p) => {
      const b = el('button', { type: 'button', dataset: { id: p.id } },
        el('span', { class: 'tn', text: p.n }),
        el('span', { class: 'tt', text: p.label }),
        el('span', { class: `tk ${p.kind}`, text: p.kind === 'doc' ? 'DOCUMENTED' : 'MODEL' }),
      );
      b.addEventListener('click', () => selectPhase(p.id));
      tl.append(b);
    });
  }

  function selectPhase(id) {
    const p = TIMELINE.find((x) => x.id === id) || TIMELINE[0];
    $$('#timeline button').forEach((b) => b.classList.toggle('is-on', b.dataset.id === p.id));
    if (!tlDetail) return;
    tlDetail.innerHTML = '';
    tlDetail.append(
      el('h4', { text: p.title }),
      el('p', { text: p.body }),
    );
    const src = sourcesOf(p.sources);
    if (src.length) {
      const ul = el('ul', { style: 'margin-top:10px;display:grid;gap:6px;' });
      src.forEach((s) => ul.append(el('li', { style: 'font-size:var(--fs-2xs);color:var(--muted);' },
        el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--cyan);text-decoration:underline;text-underline-offset:2px;', text: `${s.org} — ${s.title}` }))));
      tlDetail.append(ul);
    } else if (p.conceptual) {
      tlDetail.append(el('p', { class: 'caption', style: 'margin-top:8px;', text: 'This step is our own framing, not a published finding.' }));
    }
  }
  selectPhase('earth');
}

/* mountFramePump() used to live here: a second requestAnimationFrame loop
   that also emitted `frame`. main.js already owns the one and only frame
   loop, and nothing ever imported this, so it was dead — and had it ever
   been imported it would have double-driven every frame subscriber. */
