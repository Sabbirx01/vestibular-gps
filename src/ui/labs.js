/* ═══════════════════════════════════════════════════════════
   labs — the interactive science layer.
   Inner-ear explorer · brain pathway · VOR · six lab tests ·
   research index. Interactive pieces use real input; modelled
   pieces are labelled as models in the UI itself.
   ═══════════════════════════════════════════════════════════ */

import { $, $$, el, on, clamp, damp, lerp, fitCanvas, cssVar, TAU, mulberry32, Rolling } from '../core/util.js';
import { state, set, subscribe, bus, toast } from '../core/store.js';
import { MiniStage } from '../three/SceneManager.js';
import { InnerEar } from '../three/InnerEar.js';
import { BrainModel } from '../three/BrainModel.js';
import { MeasurementSubject } from '../three/Astronaut.js';
import {
  EAR_STRUCTURES, BRAIN_STAGES, LAB_TESTS, SOURCE_LIST, RESEARCH_TOPICS,
  findSource, sourcesOf, CANAL_AXIS_MAP,
} from '../science/content.js';
import { PathChart, RollingChart } from './panels.js';

/* ═══════════════════════════════════════════════════════════
   SUBJECT — the standing measurement figure.
   Lives in its own inline viewport rather than behind the page so
   it can never be occluded by a panel.
   ═══════════════════════════════════════════════════════════ */
export function mountSubjectSection() {
  const canvas = $('#subjectCanvas');
  if (!canvas) return null;

  const stage = new MiniStage(canvas, {
    /* Tuned against pixel measurement across three iterations:
         3.9 -> figure ~42% of the card (too much dead space)
         3.0 -> ~90%, boots touching the bottom edge (over-zoomed)
         3.7 -> 76.1%, 27 px bottom gap (slightly large)
         4.0 -> target ~72%                                                    */
    distance: 4.0,
    minDist: 2.0,
    maxDist: 6,
    targetY: 1.0,
    minY: 0.5,
    build: () => new MeasurementSubject({
      quality: { astronautDetail: 'high' },
      reducedMotion: state.reducedMotion,
      bare: false,
    }),
  });
  stage.current = stage.content;

  /* Swap the procedural figure for the real NASA Advanced Crew Escape Suit
     asset once it has parsed. On failure the procedural figure simply stays. */
  stage.current?.loadReal?.().then((ok) => {
    if (ok && badge) badge.textContent = 'NASA ACES SUIT ASSET · MEASUREMENT FRAME';
  });

  on($('#subjectReset'), 'click', () => stage.reset());

  const axesBtn = $('#subjectToggleAxes');
  let vectorsOn = true;
  on(axesBtn, 'click', () => {
    vectorsOn = !vectorsOn;
    if (stage.current?.axes) stage.current.axes.visible = vectorsOn;
    axesBtn.classList.toggle('is-on', vectorsOn);
  });
  axesBtn?.classList.add('is-on');

  /* The badge reports what the figure is ACTUALLY doing. A static "ROTATING"
     label would keep claiming motion while a hidden tab has rAF paused. */
  const badge = $('#subjectPose');
  let lastYaw = null;
  let lastMove = performance.now();
  let badgeText = '';

  const setBadge = (text) => {
    if (!badge || text === badgeText) return;
    badgeText = text;
    badge.textContent = text;
  };

  bus.on('frame', () => {
    if (!badge) return;
    if (state.reducedMotion) { setBadge('ARMS EXTENDED · STATIC (REDUCED MOTION)'); return; }
    const yaw = stage.current?.body?.rotation?.y ?? 0;
    const now = performance.now();
    if (lastYaw === null || Math.abs(yaw - lastYaw) > 0.004) lastMove = now;
    lastYaw = yaw;
    setBadge(now - lastMove > 1200
      ? 'ARMS EXTENDED · PAUSED (TAB NOT VISIBLE)'
      : 'ARMS EXTENDED · ROTATING · MEASUREMENT FRAME ACTIVE');
  });

  window.addEventListener('resize', () => stage.resize());
  return stage;
}

/* ═══════════════════════════════════════════════════════════
   INNER EAR EXPLORER
   ═══════════════════════════════════════════════════════════ */
export function mountEarSection() {
  const stage = new MiniStage($('#earCanvas'), {
    distance: 3.2,
    build: () => new InnerEar({
      quality: { particles: 900, astronautDetail: 'high' },
      onSelect: (id) => { if (id) showStructure(id); },
    }),
  });
  stage.current = stage.content;

  const list = $('#earList');
  const title = $('#earTitle');
  const blurb = $('#earBlurb');
  const kv = $('#earKv');
  const active = $('#earActive');

  /* structure pills — the canal entries map to the canal groups */
  const pills = new Map();
  list.innerHTML = '';
  EAR_STRUCTURES.forEach((s) => {
    const b = el('button', { type: 'button', text: s.name, dataset: { cursorTarget: s.name } });
    b.addEventListener('click', () => {
      pills.forEach((p, k) => p.classList.toggle('is-on', k === s.id));
      showStructure(s.id);
      stage.current?.select?.(s.id);
    });
    list.append(b);
    pills.set(s.id, b);
  });

  function showStructure(id) {
    const s = EAR_STRUCTURES.find((x) => x.id === id);
    if (!s) return;
    pills.forEach((p, k) => p.classList.toggle('is-on', k === s.id));
    title.textContent = s.name;
    blurb.textContent = s.short;
    if (active) active.textContent = s.name.toUpperCase();

    kv.innerHTML = '';
    const rows = [
      ['SENSES', s.senses],
      ['MECHANISM', s.mech],
    ];
    rows.forEach(([k, v]) => kv.append(el('div', {}, el('dt', { text: k }), el('dd', { text: v, style: 'text-align:left;max-width:62%;' }))));
    kv.append(el('p', { text: s.detail, style: 'color:var(--text-2);font-size:var(--fs-xs);margin-top:6px;' }));

    const src = sourcesOf(s.sources);
    if (src.length) {
      const ul = el('div', { style: 'margin-top:12px;display:grid;gap:6px;' });
      src.forEach((x) => ul.append(el('a', {
        href: x.url, target: '_blank', rel: 'noopener noreferrer',
        style: 'font-size:var(--fs-2xs);color:var(--cyan);text-decoration:underline;text-underline-offset:2px;',
        text: `${x.org} — ${x.title}`,
      })));
      kv.append(ul);
    }
  }
  showStructure('canals');

  /* head rotation input → canal highlighting */
  const sliders = [
    ['#earYaw', '#earYawV', 'yaw'],
    ['#earPitch', '#earPitchV', 'pitch'],
    ['#earRoll', '#earRollV', 'roll'],
  ];
  const hr = { yaw: 0, pitch: 0, roll: 0 };
  sliders.forEach(([sel, valSel, key]) => {
    const i = $(sel), v = $(valSel);
    if (!i) return;
    on(i, 'input', () => {
      hr[key] = +i.value;
      v.textContent = `${i.value}°`;
      stage.current?.setHeadRotation?.(hr.yaw, hr.pitch, hr.roll);
    });
  });

  /* canal activity meters, updated from the model's own mix */
  const metersHost = $('#earCanals');
  const meters = {};
  if (metersHost) {
    CANAL_AXIS_MAP.forEach((c) => {
      const fill = el('i');
      const row = el('div', { style: 'display:grid;gap:5px;margin-bottom:9px;' },
        el('span', { style: 'display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:var(--fs-2xs);letter-spacing:.1em;color:var(--muted);' },
          document.createTextNode(c.label), el('b', { text: '0%', style: 'color:var(--cyan)' })),
        el('div', { style: 'height:3px;background:var(--line);border-radius:3px;overflow:hidden;' }, fill),
      );
      metersHost.append(row);
      meters[c.id] = { fill, label: row.querySelector('b') };
    });
  }

  on($('#earReset'), 'click', () => { stage.reset(); showStructure('canals'); stage.current?.select?.('canals'); });
  const lblBtn = $('#earToggleLabels');
  let labelsOn = false;
  on(lblBtn, 'click', () => {
    labelsOn = !labelsOn;
    stage.current?.setLabelsVisible?.(labelsOn);
    lblBtn.classList.toggle('is-on', labelsOn);
  });

  /* gravity vector follows the active environment */
  bus.on('mode', () => applyGravity());
  function applyGravity() {
    const map = { EARTH: [0, -1, 0], MOON: [0, -0.17, 0], MARS: [0, -0.38, 0], MICROGRAVITY: [0, 0, 0] };
    const g = map[state.mode] || map.EARTH;
    stage.current?.setGravity?.({ x: g[0], y: g[1], z: g[2] });
  }
  applyGravity();

  bus.on('frame', () => {
    const m = stage.current?.canalMix;
    if (!m) return;
    CANAL_AXIS_MAP.forEach((c) => {
      const o = meters[c.id];
      if (!o) return;
      const v = clamp(m[c.id] || 0, 0, 1);
      o.fill.style.width = `${(v * 100).toFixed(0)}%`;
      o.fill.style.background = v > 0.6 ? 'var(--cyan)' : v > 0.25 ? 'var(--blue)' : 'var(--line-strong)';
      o.label.textContent = `${(v * 100).toFixed(0)}%`;
    });
  });

  window.addEventListener('resize', () => stage.resize());
  return stage;
}

/* ═══════════════════════════════════════════════════════════
   BRAIN EXPLORER
   ═══════════════════════════════════════════════════════════ */
export function mountBrainSection() {
  const stage = new MiniStage($('#brainCanvas'), {
    distance: 2.5,
    build: () => new BrainModel({
      quality: { astronautDetail: 'high' },
      onSelect: (id) => { if (id) showStage(id); },
    }),
  });
  stage.current = stage.content;

  /* Replace the stylised hemispheres with the real NIH 3D brain mesh. */
  stage.current?.loadReal?.().then((ok) => {
    if (ok && badge) badge.textContent = 'NIH 3D BRAIN ASSET · SELECT A PATHWAY';
  });

  const list = $('#brainList');
  const kv = $('#brainKv');
  const conf = $('#brainConfidence');
  const badge = $('#brainActive');
  const pills = new Map();

  list.innerHTML = '';
  BRAIN_STAGES.forEach((s, i) => {
    const b = el('button', { type: 'button', text: `${String(i + 1).padStart(2, '0')} ${s.name}` });
    b.addEventListener('click', () => { stage.current?.setStage?.(s.id); showStage(s.id); });
    list.append(b);
    pills.set(s.id, b);
  });

  function showStage(id) {
    const s = BRAIN_STAGES.find((x) => x.id === id);
    if (!s) return;
    pills.forEach((p, k) => p.classList.toggle('is-on', k === s.id));
    if (badge) badge.textContent = s.name.toUpperCase();
    kv.innerHTML = '';
    [['ROLE', s.role], ['TIMING', s.latency], ['CONFIDENCE', s.confidence]]
      .forEach(([k, v]) => kv.append(el('div', {}, el('dt', { text: k }), el('dd', { text: v, style: 'text-align:left;max-width:62%;' }))));
    kv.append(el('p', { text: s.detail, style: 'color:var(--text-2);font-size:var(--fs-xs);margin-top:8px;' }));

    if (conf) {
      conf.innerHTML = '';
      conf.textContent = s.confidence.includes('not fully settled') || s.confidence.includes('Active research')
        ? 'Note: cortical vestibular maps are an active research area. This stage is drawn schematically and deliberately simplified.'
        : '';
    }

    const src = sourcesOf(s.sources);
    if (src.length) {
      const ul = el('div', { style: 'margin-top:12px;display:grid;gap:6px;' });
      src.forEach((x) => ul.append(el('a', {
        href: x.url, target: '_blank', rel: 'noopener noreferrer',
        style: 'font-size:var(--fs-2xs);color:var(--cyan);text-decoration:underline;text-underline-offset:2px;',
        text: `${x.org} — ${x.title}`,
      })));
      kv.append(ul);
    }
  }
  showStage('nuclei');

  on($('#brainReset'), 'click', () => { stage.reset(); stage.current?.setStage?.('nuclei'); showStage('nuclei'); });
  on($('#brainPulse'), 'click', () => {
    stage.current?.pulseSignal?.();
    toast('SIGNAL SWEEP', 'Firing a pulse along the whole pathway: nerve → nuclei → cerebellum → thalamus → cortex.', 'info', 3600);
  });

  window.addEventListener('resize', () => stage.resize());
  return stage;
}

/* ═══════════════════════════════════════════════════════════
   VOR — vestibulo-ocular reflex
   head(t) = A sin(2π f t)
   eye(t)  = −gain · A sin(2π f t)
   retinal slip ∝ |1 − gain|
   ═══════════════════════════════════════════════════════════ */
export function mountVorSection() {
  const canvas = $('#vorCanvas');
  const chartC = $('#vorChart');
  const kv = $('#vorKv');
  const badge = $('#vorGainBadge');
  if (!canvas) return;

  const ctl = { freq: 0.5, amp: 20, gain: 1, playing: true };
  const bind = (sel, valSel, key, fmt) => {
    const i = $(sel), v = $(valSel);
    if (!i) return;
    on(i, 'input', () => { ctl[key] = +i.value; v.textContent = fmt(ctl[key]); });
  };
  bind('#vorFreq', '#vorFreqV', 'freq', (n) => `${n.toFixed(2)} Hz`);
  bind('#vorAmp', '#vorAmpV', 'amp', (n) => `${n}°`);
  bind('#vorGain', '#vorGainV', 'gain', (n) => n.toFixed(2));
  on($('#vorPlay'), 'click', () => {
    ctl.playing = !ctl.playing;
    $('#vorPlay').textContent = ctl.playing ? 'PAUSE' : 'RESUME';
  });

  const path = new PathChart(chartC);
  const hist = { head: [], eye: [] };
  let t = 0;
  let lastDraw = 0;

  function tick(dt) {
    if (ctl.playing) t += dt;
    const w = TAU * ctl.freq;
    const headAngle = ctl.amp * Math.sin(w * t);
    const headVel = ctl.amp * w * Math.cos(w * t);
    const eyeVel = -ctl.gain * headVel;
    const gazeError = headAngle * (1 - ctl.gain);
    const slip = Math.abs(1 - ctl.gain);

    if (ctl.playing) {
      hist.head.push({ x: t, y: headVel });
      hist.eye.push({ x: t, y: eyeVel });
      const N = 260;
      if (hist.head.length > N) { hist.head.shift(); hist.eye.shift(); }
    }

    /* redraw the reflex diagram */
    const { ctx, w: cw, h: ch } = fitCanvas(canvas, { maxDpr: 2 });
    ctx.clearRect(0, 0, cw, ch);
    const cx = cw * 0.34, cy = ch * 0.52, R = Math.min(cw, ch) * 0.19;
    const reduced = state.reducedMotion;

    /* target crosshair — fixed in the world */
    const tx = cw * 0.78, ty = ch * 0.34;
    ctx.strokeStyle = cssVar('--faint') || '#647a99';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(tx, ty, 13, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - 19, ty); ctx.lineTo(tx - 6, ty); ctx.moveTo(tx + 6, ty); ctx.lineTo(tx + 19, ty); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, ty - 19); ctx.lineTo(tx, ty - 6); ctx.moveTo(tx, ty + 6); ctx.lineTo(tx, ty + 19); ctx.stroke();
    ctx.fillStyle = cssVar('--green') || '#4ade80';
    ctx.beginPath(); ctx.arc(tx, ty, 3, 0, TAU); ctx.fill();

    /* the head, seen from above, rotating in the transverse plane */
    const hair = (headAngle * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(reduced ? 0 : hair * 0.42);

    ctx.fillStyle = 'rgba(120,150,190,0.13)';
    ctx.strokeStyle = cssVar('--line-strong') || 'rgba(122,170,220,.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.12, R, 0, 0, TAU); ctx.fill(); ctx.stroke();

    /* nose marker so rotation is legible */
    ctx.fillStyle = cssVar('--muted') || '#8ba0c0';
    ctx.beginPath();
    ctx.moveTo(R * 1.02, 0); ctx.lineTo(R * 1.24, -5); ctx.lineTo(R * 1.24, 5);
    ctx.closePath(); ctx.fill();

    /* eyes counter-rotate inside the head */
    const eyeOffset = reduced ? 0 : -hair * 0.42 * ctl.gain;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(0, s * R * 0.44);
      ctx.fillStyle = 'rgba(233,242,255,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.save();
      ctx.rotate(eyeOffset);
      ctx.fillStyle = '#05080f';
      ctx.beginPath(); ctx.arc(5, 0, 4.2, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.restore();
    }
    /* gaze direction line out to the target */
    ctx.strokeStyle = `rgba(95,227,255,${clamp(0.9 - slip, 0.15, 0.9)})`;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tx - cx, ty - cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* labels */
    ctx.fillStyle = cssVar('--faint') || '#647a99';
    ctx.font = '9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('HEAD + EYES (PLAN VIEW)', 12, 16);
    ctx.textAlign = 'right';
    ctx.fillText('FIXED WORLD TARGET', cw - 12, 16);

    /* slip warning */
    if (slip > 0.35) {
      ctx.fillStyle = `rgba(255,95,109,${clamp(slip, 0, 0.9)})`;
      ctx.textAlign = 'center';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('RETINAL SLIP — IMAGE WOULD SMEAR', cx, ch - 14);
    }

    /* metrics */
    if (badge) badge.textContent = `GAIN ${ctl.gain.toFixed(2)}`;
    if (kv && performance.now() - lastDraw > 120) {
      lastDraw = performance.now();
      kv.innerHTML = '';
      const rows = [
        ['HEAD ANGLE', `${headAngle.toFixed(1)}°`],
        ['HEAD VELOCITY', `${headVel.toFixed(1)} deg/s`],
        ['EYE VELOCITY', `${eyeVel.toFixed(1)} deg/s`],
        ['GAZE ERROR', `${gazeError.toFixed(2)}°`],
        ['RETINAL SLIP', `${(slip * 100).toFixed(0)}%`],
        ['STATUS', slip < 0.15 ? 'COMPENSATED' : slip < 0.4 ? 'DEGRADED' : 'NOT COMPENSATED'],
      ];
      rows.forEach(([k, v]) => kv.append(el('div', {}, el('dt', { text: k }), el('dd', { text: v }))));
    }
  }

  function drawChart() {
    if (!chartC) return;
    const N = 260;
    const span = N / 60 / ctl.freq;
    path.setSeries([
      { color: cssVar('--cyan') || '#5fe3ff', width: 1.7, points: hist.head.slice() },
      { color: cssVar('--violet') || '#a877ff', width: 1.7, points: hist.eye.slice(), dashed: false },
      { color: cssVar('--red') || '#ff5f6d', width: 1, points: [{ x: 0, y: 0 }, { x: span, y: 0 }], dashed: true },
    ]);
    const peak = Math.max(2, ctl.amp * TAU * ctl.freq * 1.2);
    path.draw({
      xLabel: 'TIME (s)',
      yLabel: 'VELOCITY (deg/s)',
      xRange: [t > span ? t - span : 0, t > span ? t : span],
      yRange: [-peak, peak],
    });
  }

  let acc = 0;
  bus.on('frame', (dt) => {
    tick(dt);
    acc += dt;
    if (acc < 1 / 30) return;
    acc = 0;
    drawChart();
  });

  window.addEventListener('resize', drawChart);
}

/* ═══════════════════════════════════════════════════════════
   LAB — six demonstrations
   ═══════════════════════════════════════════════════════════ */
export function mountLabSection() {
  const grid = $('#labGrid');
  const canvas = $('#labCanvas');
  const metrics = $('#labMetrics');
  const title = $('#labTitle');
  const sub = $('#labSub');
  const what = $('#labWhat'), why = $('#labWhy'), how = $('#labHow'), srcUl = $('#labSource');
  const runBtn = $('#labRun'), clearBtn = $('#labClear');
  if (!grid || !canvas) return;

  let active = null;
  let running = false;
  let test = null;
  const rng = mulberry32(1337);
  const ctx2d = () => fitCanvas(canvas, { maxDpr: 2 });

  const cards = new Map();
  grid.innerHTML = '';
  LAB_TESTS.forEach((t) => {
    const c = el('button', { type: 'button', class: 'lab-card', dataset: { cursorTarget: t.name } },
      el('span', { class: 'ln', text: t.n }),
      el('h4', { text: t.name }),
      el('p', { text: t.blurb }),
    );
    c.addEventListener('click', () => select(t.id));
    grid.append(c);
    cards.set(t.id, c);
  });

  function setMetrics(rows) {
    metrics.innerHTML = '';
    rows.forEach(([k, v]) => metrics.append(el('div', {}, el('span', { text: k }), el('b', { text: v }))));
  }

  function select(id) {
    active = id;
    cards.forEach((c, k) => c.classList.toggle('is-on', k === id));
    const t = LAB_TESTS.find((x) => x.id === id);
    title.textContent = `${t.n} — ${t.name}`;
    sub.textContent = t.blurb;
    what.textContent = t.what;
    why.textContent = t.why;
    how.textContent = t.how;
    srcUl.innerHTML = '';
    sourcesOf(t.sources).forEach((s) => srcUl.append(el('li', {},
      el('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: `${s.org} — ${s.title}` }))));
    const conceptualNote = el('li', { style: 'color:var(--amber);', text: 'This demonstration is a conceptual model built for this site — it is not a validated measurement instrument.' });
    if (t.conceptual) srcUl.append(conceptualNote);
    stopTest();
    test = makeTest(id);
    test?.reset?.();
    setMetrics(test?.idleMetrics?.() || []);
    drawIdle();
  }

  function drawIdle() {
    const { ctx, w, h } = ctx2d();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = cssVar('--faint') || '#647a99';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS RUN TO START THIS DEMONSTRATION', w / 2, h / 2);
  }

  function stopTest() { running = false; runBtn.textContent = 'RUN'; }

  on(runBtn, 'click', () => {
    if (!test) return;
    running = !running;
    runBtn.textContent = running ? 'PAUSE' : 'RESUME';
    if (running) test.start?.();
  });
  on(clearBtn, 'click', () => { test?.reset?.(); setMetrics(test?.idleMetrics?.() || []); drawIdle(); stopTest(); });

  let acc = 0;
  bus.on('frame', (dt) => {
    if (!test) return;
    if (running) test.update?.(dt);
    acc += dt;
    if (acc < 1 / 30) return;
    acc = 0;
    test.draw?.(ctx2d());
    if (running) setMetrics(test?.metrics?.() || []);
  });

  select('orientation');
  return { select };

  /* ── test factories ─────────────────────────────────── */
  function makeTest(id) {
    const C = {
      cyan: cssVar('--cyan') || '#5fe3ff',
      violet: cssVar('--violet') || '#a877ff',
      amber: cssVar('--amber') || '#ffb547',
      green: cssVar('--green') || '#4ade80',
      red: cssVar('--red') || '#ff5f6d',
      muted: cssVar('--muted') || '#8ba0c0',
      line: cssVar('--line') || 'rgba(122,170,220,.14)',
    };

    if (id === 'orientation') {
      /* LIVE: the moving target is tracked with real pointer or device input */
      let t = 0, target = { x: 0, y: 0 }, input = { x: 0, y: 0 }, errs = new Rolling(200), peak = 0, lag = 0;
      let lastInput = null;
      on(window, 'pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        input.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        input.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      });
      return {
        reset() { t = 0; errs.clear(); peak = 0; lag = 0; lastInput = null; },
        idleMetrics: () => [['INPUT', 'MOVE POINTER OVER THE PANEL'], ['SAMPLES', '0']],
        start() { /* nothing to warm up */ },
        update(dt) {
          t += dt;
          /* unpredictable target: two incommensurate frequencies plus a step */
          target.x = 0.62 * Math.sin(t * 0.9) + 0.22 * Math.sin(t * 2.31 + 1.1);
          target.y = 0.42 * Math.sin(t * 0.71 + 0.6) + 0.16 * Math.sin(t * 1.87);
          /* device tilt also contributes when a live sensor is connected */
          if (state.source !== 'SIMULATION') {
            input.x = clamp(input.x * 0.55 + clamp(state.attitude.yaw / 40, -1, 1) * 0.45, -1, 1);
            input.y = clamp(input.y * 0.55 + clamp(state.attitude.pitch / 40, -1, 1) * 0.45, -1, 1);
          }
          const e = Math.hypot(target.x - input.x, target.y - input.y);
          errs.push(e);
          peak = Math.max(peak, e);
          if (lastInput) lag = damp(lag, e * 1000, 4, dt);
          lastInput = { ...input };
        },
        metrics: () => [
          ['MEAN ERROR', errs.mean().toFixed(3)],
          ['PEAK ERROR', peak.toFixed(3)],
          ['ERROR SD', errs.std().toFixed(3)],
          ['SAMPLES', String(errs.buf.length)],
          ['INPUT', state.source === 'SIMULATION' ? 'POINTER' : 'DEVICE + POINTER'],
          ['STATUS', errs.mean() < 0.06 ? 'TIGHT' : errs.mean() < 0.15 ? 'MODERATE' : 'LOOSE'],
        ],
        draw({ ctx, w, h }) {
          ctx.clearRect(0, 0, w, h);
          const cx = w / 2, cy = h / 2, S = Math.min(w, h) * 0.4;
          ctx.strokeStyle = C.line; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(cx, cy, S, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - S, cy); ctx.lineTo(cx + S, cy); ctx.moveTo(cx, cy - S); ctx.lineTo(cx, cy + S); ctx.stroke();

          ctx.strokeStyle = C.amber; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx + target.x * S, cy + target.y * S, 11, 0, TAU); ctx.stroke();
          ctx.fillStyle = C.amber;
          ctx.beginPath(); ctx.arc(cx + target.x * S, cy + target.y * S, 3, 0, TAU); ctx.fill();

          ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(cx + input.x * S, cy + input.y * S, 8, 0, TAU); ctx.stroke();

          ctx.strokeStyle = `rgba(255,95,109,${clamp(errs.mean() * 4, 0.2, 0.9)})`;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(cx + target.x * S, cy + target.y * S);
          ctx.lineTo(cx + input.x * S, cy + input.y * S);
          ctx.stroke(); ctx.setLineDash([]);

          ctx.fillStyle = C.muted; ctx.font = '9px ui-monospace, monospace';
          ctx.textAlign = 'left'; ctx.fillText('TARGET', 12, 16);
          ctx.fillStyle = C.cyan; ctx.fillText('YOUR INPUT', 12, 30);
        },
      };
    }

    if (id === 'vor') {
      let t = 0, sweep = 0, rows = [];
      const freqs = [0.05, 0.1, 0.2, 0.5, 1, 2, 3.5, 5];
      return {
        reset() { t = 0; sweep = 0; rows = []; },
        idleMetrics: () => [['SWEEP', '0 / 8 FREQUENCIES']],
        update(dt) { sweep += dt * 1.6; if (sweep > freqs.length) sweep = 0; t += dt; },
        metrics: () => {
          const f = freqs[Math.min(freqs.length - 1, Math.floor(sweep))] || 1;
          /* first-order high-pass model of the reflex */
          const fc = 0.06;
          const gain = f / Math.sqrt(f * f + fc * fc);
          const phase = Math.atan2(fc, f) * (180 / Math.PI);
          return [
            ['CURRENT FREQUENCY', `${f.toFixed(2)} Hz`],
            ['MODELLED GAIN', gain.toFixed(3)],
            ['MODELLED PHASE LAG', `${phase.toFixed(1)}°`],
            ['EFFECTIVE BANDWIDTH', `${(fc * 1000).toFixed(0)} mHz corner`],
            ['STATUS', gain > 0.9 ? 'FULLY COMPENSATED' : gain > 0.6 ? 'PARTIAL' : 'INSUFFICIENT'],
          ];
        },
        draw({ ctx, w, h }) {
          ctx.clearRect(0, 0, w, h);
          const pad = 42;
          const x0 = Math.log10(0.03), x1 = Math.log10(8);
          const X = (f) => pad + ((Math.log10(f) - x0) / (x1 - x0)) * (w - pad - 14);
          const Y = (g) => h - 30 - g * (h - 48);

          ctx.strokeStyle = C.line; ctx.lineWidth = 1;
          for (let g = 0; g <= 1; g += 0.25) { ctx.beginPath(); ctx.moveTo(pad, Y(g)); ctx.lineTo(w - 14, Y(g)); ctx.stroke(); }
          for (const f of [0.05, 0.1, 0.5, 1, 2, 5]) { ctx.beginPath(); ctx.moveTo(X(f), 12); ctx.lineTo(X(f), h - 30); ctx.stroke(); }

          ctx.fillStyle = C.muted; ctx.font = '9px ui-monospace, monospace';
          ctx.textAlign = 'right';
          [0, 0.5, 1].forEach((g) => ctx.fillText(g.toFixed(1), pad - 6, Y(g) + 3));
          ctx.textAlign = 'center';
          [0.05, 0.5, 5].forEach((f) => ctx.fillText(String(f), X(f), h - 16));
          ctx.fillText('HEAD ROTATION FREQUENCY (Hz)', w / 2, h - 3);

          const fc = 0.06;
          ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 200; i++) {
            const f = 10 ** (x0 + (i / 200) * (x1 - x0));
            const g = f / Math.sqrt(f * f + fc * fc);
            const x = X(f), y = Y(g);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();

          ctx.strokeStyle = C.violet; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= 200; i++) {
            const f = 10 ** (x0 + (i / 200) * (x1 - x0));
            const ph = Math.atan2(fc, f) / Math.PI;
            const x = X(f), y = Y(ph);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();

          const cf = freqs[Math.min(freqs.length - 1, Math.floor(sweep))] || 1;
          const cg = cf / Math.sqrt(cf * cf + fc * fc);
          ctx.fillStyle = C.amber;
          ctx.beginPath(); ctx.arc(X(cf), Y(cg), 5, 0, TAU); ctx.fill();

          ctx.fillStyle = C.muted; ctx.textAlign = 'left';
          ctx.fillText('GAIN (CYAN) · PHASE / π (VIOLET) · SWEEP MARKER (AMBER)', pad, 12);
        },
      };
    }

    if (id === 'balance') {
      let pts = [], t = 0, baseWidth = 0.55, running = false;
      return {
        reset() { pts = []; t = 0; baseWidth = 0.55; },
        idleMetrics: () => [['SWAY PATH', '0.000'], ['SAMPLES', '0']],
        update(dt) {
          t += dt;
          baseWidth = 0.55 + 0.35 * Math.sin(t * 0.7);
          /* inverted-pendulum style random walk: narrower base → larger excursions */
          const last = pts[pts.length - 1] || { x: 0, y: 0 };
          const noise = 0.02 / Math.max(0.2, baseWidth);
          const nx = last.x + (rng() - 0.5) * noise - last.x * 0.06;
          const ny = last.y + (rng() - 0.5) * noise - last.y * 0.06;
          pts.push({ x: nx, y: ny });
          if (pts.length > 900) pts.shift();
        },
        metrics: () => {
          const path = pts.reduce((a, p, i) => i ? a + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);
          const rms = Math.sqrt(pts.reduce((a, p) => a + p.x * p.x + p.y * p.y, 0) / Math.max(1, pts.length));
          let mx = 0, my = 0;
          pts.forEach((p) => { mx = Math.max(mx, Math.abs(p.x)); my = Math.max(my, Math.abs(p.y)); });
          return [
            ['SWAY PATH (MODEL)', path.toFixed(3)],
            ['RMS AMPLITUDE', rms.toFixed(4)],
            ['95% ELLIPSE AREA', (Math.PI * mx * my * 5.99).toFixed(3)],
            ['BASE OF SUPPORT', `${(baseWidth * 100).toFixed(0)}%`],
            ['SAMPLES', String(pts.length)],
            ['STABILITY', rms < 0.02 ? 'MODELLED STABLE' : rms < 0.05 ? 'MODELLED MARGINAL' : 'MODELLED UNSTABLE'],
          ];
        },
        draw({ ctx, w, h }) {
          ctx.clearRect(0, 0, w, h);
          const cx = w / 2, cy = h / 2, S = Math.min(w, h) * 0.42;
          ctx.strokeStyle = C.line; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(cx, cy, S * baseWidth, S * baseWidth, 0, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, S, 0, TAU); ctx.stroke();

          ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.2;
          ctx.beginPath();
          pts.forEach((p, i) => {
            const x = cx + p.x * S * 12, y = cy + p.y * S * 12;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          ctx.stroke();

          const last = pts[pts.length - 1];
          if (last) {
            ctx.fillStyle = C.amber;
            ctx.beginPath(); ctx.arc(cx + last.x * S * 12, cy + last.y * S * 12, 4, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = C.muted; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'left';
          ctx.fillText('SIMULATED CENTRE OF PRESSURE — STOCHASTIC MODEL, NOT A FORCE-PLATE RECORDING', 12, 16);
        },
      };
    }

    if (id === 'motion') {
      let trials = [], current = null, rts = new Rolling(60);
      const dirs = ['LEFT', 'RIGHT', 'UP', 'DOWN'];
      const keys = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN' };
      let startedAt = 0, awaiting = false;

      on(window, 'keydown', (e) => {
        if (!awaiting || !keys[e.key]) return;
        e.preventDefault();
        const ok = keys[e.key] === current.dir;
        const rt = performance.now() - startedAt;
        rts.push(rt);
        trials.push({ dir: current.dir, said: keys[e.key], ok, rt });
        awaiting = false;
        current = null;
        toast(ok ? 'CORRECT' : 'INCORRECT', `${rt.toFixed(0)} ms response. ${ok ? '' : `The burst was ${dirs.includes(current?.dir) ? current.dir : 'different'}.`}`, ok ? 'ok' : 'warn', 1800);
      });

      const spawn = () => {
        current = { dir: dirs[Math.floor(Math.random() * 4)], x: 0.5, y: 0.5, t: 0 };
        startedAt = performance.now();
        awaiting = true;
      };

      return {
        reset() { trials = []; rts.clear(); current = null; awaiting = false; },
        idleMetrics: () => [['TRIALS', '0'], ['INPUT', 'PRESS ARROW KEYS']],
        update(dt) {
          if (!current) { if (trials.length < 40) spawn(); return; }
          current.t += dt;
          if (current.t > 2.2) { trials.push({ dir: current.dir, said: '-', ok: false, rt: NaN }); current = null; awaiting = false; }
        },
        metrics: () => {
          const done = trials.filter((x) => x.ok).length;
          const mean = rts.buf.length ? rts.mean() : NaN;
          return [
            ['TRIALS', String(trials.length)],
            ['CORRECT', `${done} / ${trials.length}`],
            ['ACCURACY', trials.length ? `${((done / trials.length) * 100).toFixed(0)}%` : '—'],
            ['MEDIAN RT', rts.buf.length ? `${[...rts.buf].sort((a, b) => a - b)[Math.floor(rts.buf.length / 2)].toFixed(0)} ms` : '—'],
            ['MEAN RT', rts.buf.length ? `${mean.toFixed(0)} ms` : '—'],
            ['RT SPREAD', rts.buf.length > 1 ? `${rts.std().toFixed(0)} ms` : '—'],
          ];
        },
        draw({ ctx, w, h }) {
          ctx.clearRect(0, 0, w, h);
          const cx = w / 2, cy = h / 2;
          if (current) {
            const a = { LEFT: Math.PI, RIGHT: 0, UP: -Math.PI / 2, DOWN: Math.PI / 2 }[current.dir];
            const len = 46 + current.t * 40;
            ctx.strokeStyle = C.cyan; ctx.lineWidth = 5; ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx - Math.cos(a) * len * 0.3, cy - Math.sin(a) * len * 0.3);
            ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
            ctx.stroke();
            ctx.fillStyle = C.cyan;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * len, cy + Math.sin(a) * len, 7, 0, TAU); ctx.fill();
            ctx.lineCap = 'butt';
          } else {
            ctx.fillStyle = C.muted;
            ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
            ctx.fillText(awaiting ? 'RESPOND' : 'WAITING FOR NEXT BURST…', cx, cy);
          }
          /* response histogram */
          const bins = [200, 300, 400, 500, 600, 700, 900, 1200];
          ctx.fillStyle = 'rgba(95,227,255,0.35)';
          bins.forEach((b, i) => {
            const n = trials.filter((t2) => t2.ok && t2.rt >= b && t2.rt < (bins[i + 1] || 9999)).length;
            const bw = (w - 80) / bins.length;
            ctx.fillRect(40 + i * bw, h - 30 - n * 4, bw - 6, n * 4);
          });
          ctx.fillStyle = C.muted; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'left';
          ctx.fillText('PRESS ← → ↑ ↓ TO MATCH THE BURST DIRECTION', 12, 16);
          ctx.fillText('CORRECT-RESPONSE LATENCY DISTRIBUTION', 40, h - 8);
        },
      };
    }

    if (id === 'conflict') {
      let t = 0, dose = 0, visual = 0, index = 0;
      return {
        reset() { t = 0; dose = 0; visual = 0; index = 0; },
        idleMetrics: () => [['CONFLICT INDEX', '0.00']],
        update(dt) {
          t += dt;
          visual = clamp(visual + dt * 0.14, 0, 1);
          /* conflict grows with visual drive and accumulates over time */
          index = clamp(visual * 0.72 + dose * 0.0004, 0, 1);
          dose += index * dt * 100;
        },
        metrics: () => [
          ['VISUAL DRIVE', visual.toFixed(3)],
          ['CONFLICT INDEX', index.toFixed(3)],
          ['CUMULATIVE DOSE', dose.toFixed(1)],
          ['MODELLED ONSET', index > 0.75 ? 'PASSED' : index > 0.4 ? `≈ ${Math.max(0, (0.75 - index) / 0.02).toFixed(0)} s` : 'far'],
          ['SEVERITY BAND', index < 0.2 ? 'NONE' : index < 0.45 ? 'MILD' : index < 0.72 ? 'MODERATE' : 'MARKED'],
        ],
        draw({ ctx, w, h }) {
          ctx.clearRect(0, 0, w, h);
          const pad = 40;
          const n = 120;
          ctx.strokeStyle = C.line; ctx.lineWidth = 1;
          for (let i = 0; i <= 4; i++) { const y = 16 + ((h - 46) * i) / 4; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - 12, y); ctx.stroke(); }

          /* two opposing sensory estimates */
          ctx.strokeStyle = C.cyan; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            const y = 16 + (h - 46) * (0.5 - 0.34 * Math.sin(u * TAU * 2 + t * 3) * visual);
            const x = pad + u * (w - pad - 12);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();

          ctx.strokeStyle = C.violet; ctx.lineWidth = 2;
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            const y = 16 + (h - 46) * (0.5 + 0.34 * Math.sin(u * TAU * 1.4 + t * 3.4) * visual);
            const x = pad + u * (w - pad - 12);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();

          /* conflict fill between them */
          ctx.fillStyle = `rgba(255,95,109,${clamp(index * 0.45, 0, 0.45)})`;
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const u = i / n;
            const y = 16 + (h - 46) * (0.5 - 0.34 * Math.sin(u * TAU * 2 + t * 3) * visual);
            const x = pad + u * (w - pad - 12);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          for (let i = n; i >= 0; i--) {
            const u = i / n;
            const y = 16 + (h - 46) * (0.5 + 0.34 * Math.sin(u * TAU * 1.4 + t * 3.4) * visual);
            const x = pad + u * (w - pad - 12);
            ctx.lineTo(x, y);
          }
          ctx.closePath(); ctx.fill();

          ctx.fillStyle = C.muted; ctx.font = '9px ui-monospace, monospace'; ctx.textAlign = 'left';
          ctx.fillText('VISUAL FLOW (CYAN) vs INERTIAL SIGNAL (VIOLET) — CONFLICT SHADED RED', pad, 12);
        },
      };
    }

    /* TEST 06 — gravity comparison, driven by the live mode state */
    return {
      reset() {},
      idleMetrics: () => [['MODE', state.mode]],
      update() {},
      metrics: () => {
        const eq = { EARTH: { g: 1, oto: 1 }, MOON: { g: 0.166, oto: 0.17 }, MARS: { g: 0.379, oto: 0.38 }, MICROGRAVITY: { g: 0, oto: 0 } }[state.mode] || { g: 1, oto: 1 };
        const reweight = 1 - eq.oto;
        return [
          ['ACTIVE MODE', state.mode],
          ['GRAVITATIONAL LOAD', `${eq.g.toFixed(3)} g`],
          ['OTOLITH LOAD (MODEL)', `${(eq.oto * 100).toFixed(0)}%`],
          ['CANAL SIGNAL', '100% (unaffected)'],
          ['MODELLED RE-WEIGHTING', `${(reweight * 100).toFixed(0)}% toward vision`],
          ['ROTATION RATE NOW', `${Math.hypot(state.sample.yawRate, state.sample.pitchRate, state.sample.rollRate).toFixed(1)} deg/s`],
        ];
      },
      draw({ ctx, w, h }) {
        ctx.clearRect(0, 0, w, h);
        const eq = { EARTH: 1, MOON: 0.166, MARS: 0.379, MICROGRAVITY: 0 }[state.mode] ?? 1;
        const cw2 = (w - 60) / 2;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1;

        /* 1 g reference */
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.rect(30, 30, cw2, h - 70); ctx.stroke();
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = C.green;
          ctx.beginPath(); ctx.arc(30 + 18 + (i % 6) * (cw2 / 6.6), 30 + 22 + Math.floor(i / 6) * 14, 3.2, 0, TAU); ctx.fill();
        }
        ctx.fillStyle = C.muted; ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center';
        ctx.fillText('EARTH · 1.000 g', 30 + cw2 / 2, 20);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillText('FULL OTOLITH LOAD', 30 + cw2 / 2, h - 28);

        /* active environment */
        ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.rect(30 + cw2 + 30, 30, cw2, h - 70); ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const spread = 6 + (1 - eq) * 22;
          ctx.fillStyle = eq > 0.05 ? C.cyan : C.amber;
          ctx.globalAlpha = 0.25 + eq * 0.75;
          ctx.beginPath();
          ctx.arc(30 + cw2 + 48 + (i % 6) * (cw2 / 6.6), 30 + 22 + Math.floor(i / 6) * (14 + (1 - eq) * 5), 3.2, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = C.cyan; ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`${state.mode} · ${eq.toFixed(3)} g`, 30 + cw2 + 30 + cw2 / 2, 20);
        ctx.font = '9px ui-monospace, monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText(eq > 0.6 ? 'OTOLITH LOADED' : eq > 0.1 ? 'REDUCED LOAD' : 'NO STEADY LOAD', 30 + cw2 + 30 + cw2 / 2, h - 28);

        /* live rotation strip underneath */
        const rate = Math.hypot(state.sample.yawRate, state.sample.pitchRate, state.sample.rollRate);
        ctx.fillStyle = C.muted; ctx.textAlign = 'left';
        ctx.fillText(`LIVE ROTATION INPUT — ${rate.toFixed(1)} deg/s · CANALS UNAFFECTED BY GRAVITY`, 30, h - 10);
      },
    };
  }
}

/* ═══════════════════════════════════════════════════════════
   RESEARCH INDEX
   ═══════════════════════════════════════════════════════════ */
export function mountResearchSection() {
  const filters = $('#researchFilters');
  const grid = $('#researchGrid');
  const count = $('#researchCount');
  if (!grid) return;

  const TIER_LABEL = {
    INSTITUTE: { text: 'NIH', cls: 'is-live' },
    AGENCY: { text: 'NASA', cls: 'is-live' },
    TEXTBOOK: { text: 'NCBI / PEER REVIEWED', cls: 'is-sim' },
    REVIEW: { text: 'REVIEWED', cls: 'is-sim' },
  };

  let active = 'all';
  const btns = new Map();

  filters.innerHTML = '';
  RESEARCH_TOPICS.forEach((t) => {
    const b = el('button', { type: 'button', class: 'btn btn-sm', text: t.label });
    b.addEventListener('click', () => { active = t.id; render(); });
    filters.append(b);
    btns.set(t.id, b);
  });

  function render() {
    btns.forEach((b, k) => b.classList.toggle('is-on', k === active));
    const list = SOURCE_LIST.filter((s) => active === 'all' || s.topics.includes(active));
    if (count) count.textContent = `${list.length} of ${SOURCE_LIST.length} sources shown · registry last verified ${'2026-09-28'}`;
    grid.innerHTML = '';
    list.forEach((s) => {
      const tier = TIER_LABEL[s.tier] || { text: s.tier, cls: '' };
      const card = el('article', { class: 'glass src-card reveal is-in' },
        el('div', { class: 'src-top' },
          el('span', { class: 'src-org', text: s.org }),
          el('span', { class: `badge ${tier.cls}`, text: tier.text })),
        el('h4', { text: s.title }),
        el('p', { text: s.summary }),
        el('p', { class: 'src-use' }, el('b', { text: 'USED FOR: ' }), document.createTextNode(s.supports)),
        s.pub ? el('p', { class: 'src-use' }, el('b', { text: 'DATE: ' }), document.createTextNode(s.pub)) : null,
        /* Licence and required attribution. The NIH brain mesh is CC-BY, so this
           line is a legal obligation, not decoration — keep it visible. */
        s.licence ? el('p', { class: 'src-use' }, el('b', { text: 'LICENCE: ' }), document.createTextNode(s.licence)) : null,
        s.attribution ? el('p', { class: 'src-use', style: 'color:var(--amber);' },
          el('b', { text: 'ATTRIBUTION: ' }), document.createTextNode(s.attribution)) : null,
        el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:4px;' },
          el('a', { class: 'src-link', href: s.url, target: '_blank', rel: 'noopener noreferrer', text: 'OPEN SOURCE ↗' }),
          s.pubmed ? el('a', { class: 'src-link', href: s.pubmed, target: '_blank', rel: 'noopener noreferrer', text: 'PUBMED ↗' }) : null,
          el('span', { class: 'tag', text: s.used.slice(0, 1)[0] || '' })),
      );
      grid.append(card);
    });
  }
  render();
}
