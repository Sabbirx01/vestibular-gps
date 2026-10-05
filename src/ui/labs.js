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
  SOURCES, findSource, sourcesOf, CANAL_AXIS_MAP,
  HRP_RISK, HRP_CHAIN, HRP_DOMAIN_ROLE,
} from '../science/content.js';
import { DOMAINS } from '../core/osi.js';
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
    /* The NASA ACES asset is a standing suit with the arms at the sides, so
       the badge must say that rather than claiming an extended-arm pose. */
    if (state.reducedMotion) { setBadge('NASA ACES SUIT · STATIC (REDUCED MOTION)'); return; }
    const yaw = stage.current?.body?.rotation?.y ?? 0;
    const now = performance.now();
    if (lastYaw === null || Math.abs(yaw - lastYaw) > 0.004) lastMove = now;
    lastYaw = yaw;
    setBadge(now - lastMove > 1200
      ? 'NASA ACES SUIT · PAUSED (TAB NOT VISIBLE)'
      : 'NASA ACES SUIT · ROTATING IN THE MEASUREMENT FRAME');
  });

  window.addEventListener('resize', () => stage.resize());
  return stage;
}

/* ═══════════════════════════════════════════════════════════
   INNER EAR EXPLORER
   ═══════════════════════════════════════════════════════════ */
export function mountEarSection() {
  const stage = new MiniStage($('#earCanvas'), {
    /* The previous 3.2 distance left the anatomy occupying only a small island
       in the canvas. This viewport is the explanatory hero: bring the organ
       forward while leaving enough air for labels and orbit. */
    distance: 2.55,
    minDist: 1.75,
    maxDist: 4.5,
    targetY: -0.08,
    minY: -0.35,
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

  /* PERFORMANCE: the NIH brain asset is a 12.8 MB GLB — by far the heaviest
     download on the whole site. Fetching it during boot (as the previous
     version did) meant every visitor paid that cost immediately, even if
     they never scrolled to the Brain section. Instead, load it only once
     the section is actually approaching the viewport: rootMargin gives it
     a head start so the swap is ready by the time it is fully visible,
     without blocking first paint or the boot sequence. On any failure the
     stylised procedural hemispheres simply stay — never a blank viewport. */
  let brainLoadStarted = false;
  const startBrainLoad = () => {
    if (brainLoadStarted) return;
    brainLoadStarted = true;
    stage.current?.loadReal?.().then((ok) => {
      if (ok && badge) badge.textContent = 'NIH 3D BRAIN ASSET · SELECT A PATHWAY';
    });
  };
  const brainSection = document.getElementById('sec-brain');
  if (brainSection && typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { startBrainLoad(); io.disconnect(); }
    }, { rootMargin: '600px 0px' });
    io.observe(brainSection);
  } else {
    /* No IntersectionObserver support — fall back to the old eager behaviour
       rather than never loading the real asset at all. */
    startBrainLoad();
  }

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

  /* Gain defaults below 1.0 on purpose. At exactly 1.0 the eye counter-rotation
     perfectly cancels the head movement, so gaze error and retinal slip sit
     pinned at zero and the demonstration looks dead. 0.82 shows the reflex
     working while leaving a visible residual. */
  const ctl = { freq: 0.5, amp: 20, gain: 0.82, playing: true };
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
    const cx = cw * 0.33, cy = ch * 0.53, R = Math.min(cw, ch) * 0.205;
    const reduced = state.reducedMotion;

    const accent = cssVar('--cyan') || '#5fe3ff';
    const faint = cssVar('--faint') || '#647a99';
    const muted = cssVar('--muted') || '#8ba0c0';
    const violet = cssVar('--violet') || '#a877ff';
    const green = cssVar('--green') || '#4ade80';
    const amber = cssVar('--amber') || '#ffb547';
    const hair = (headAngle * Math.PI) / 180;

    /* Instrument glass: layered vignette, scanline and a calibrated reticle
       establish depth before the anatomy is drawn. This keeps the canvas from
       looking like a flat illustration on an empty navy rectangle. */
    const bg = ctx.createRadialGradient(cw * 0.34, ch * 0.46, 0, cw * 0.34, ch * 0.46, Math.max(cw, ch) * 0.72);
    bg.addColorStop(0, 'rgba(33,67,111,0.30)');
    bg.addColorStop(0.48, 'rgba(9,22,44,0.16)');
    bg.addColorStop(1, 'rgba(2,6,15,0.88)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.strokeStyle = 'rgba(116,168,224,0.055)';
    ctx.lineWidth = 1;
    const gridStep = Math.max(26, Math.round(cw / 22));
    for (let x = 0; x <= cw; x += gridStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
    for (let y = 0; y <= ch; y += gridStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(95,227,255,0.028)';
    for (let y = 0; y < ch; y += 4) ctx.fillRect(0, y, cw, 1);
    ctx.restore();

    /* Scope frame and corner brackets. */
    ctx.save();
    ctx.strokeStyle = 'rgba(137,184,230,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 12, cw - 24, ch - 24);
    const bracket = 16;
    ctx.strokeStyle = 'rgba(95,227,255,0.65)';
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = sx < 0 ? 12 : cw - 12, y = sy < 0 ? 12 : ch - 12;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - sx * bracket, y); ctx.moveTo(x, y); ctx.lineTo(x, y - sy * bracket); ctx.stroke();
    }
    ctx.restore();
    const headYaw = reduced ? 0 : hair * 0.42;

    /* World-fixed target. Kept inside the field and on the gaze ray, clear of
       the right-hand panel — it previously sat in the corner, detached. */
    const ttx = cw * 0.66, tty = ch * 0.42;

    /* ── measurement grid: concentric rings + radial ticks, so the panel
          reads as an instrument field rather than empty space ── */
    ctx.save();
    ctx.strokeStyle = 'rgba(122,170,220,0.11)';
    ctx.lineWidth = 1;
    for (let r = R * 0.75; r <= R * 3.1; r += R * 0.58) {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const long = i % 6 === 0;
      const r0 = R * 3.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + (long ? 11 : 5)), cy + Math.sin(a) * (r0 + (long ? 11 : 5)));
      ctx.stroke();
    }
    /* Radial scale: a numbered ring at 0/90/180/270 plus tick labels every 30°
       so the field reads as a graduated instrument, not a bare circle. */
    ctx.fillStyle = faint;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let deg = 0; deg < 360; deg += 30) {
      const a = (deg * Math.PI) / 180;
      const rr = R * 3.1 + 24;
      const lx = cx + Math.cos(a) * rr;
      const ly = cy + Math.sin(a) * rr;
      ctx.globalAlpha = deg % 90 === 0 ? 1 : 0.55;
      ctx.fillText(`${deg}°`, lx, ly);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    ctx.restore();

    /* ── the head, seen from above, rotating in the transverse plane ── */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(headYaw);

    /* Soft volumetric cranial shadow: the layered edge and specular crescent
       make the skull read as a translucent anatomical subject, not a flat
       oval. */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.72)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 9;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.16, R, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    ctx.restore();

    /* cranium: slightly egg-shaped, wider at the back, tapering to the nose */
    const grad = ctx.createRadialGradient(-R * 0.28, -R * 0.34, R * 0.12, 0, 0, R * 1.35);
    grad.addColorStop(0, 'rgba(203,228,252,0.36)');
    grad.addColorStop(0.36, 'rgba(113,160,208,0.19)');
    grad.addColorStop(0.76, 'rgba(38,70,117,0.20)');
    grad.addColorStop(1, 'rgba(8,20,40,0.62)');
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(154,201,244,0.62)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.16, R, 0, 0, TAU); ctx.fill(); ctx.stroke();

    /* Specular cranial crescent and a second contour line. */
    ctx.beginPath(); ctx.ellipse(-R * 0.2, -R * 0.2, R * 0.87, R * 0.72, -0.35, Math.PI * 1.06, Math.PI * 1.75); ctx.strokeStyle = 'rgba(224,244,255,0.42)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.05, R * 0.9, 0, 0, TAU); ctx.strokeStyle = 'rgba(110,167,222,0.22)'; ctx.lineWidth = 1; ctx.stroke();

    /* posterior skull emphasis — a small occipital bulge */
    ctx.beginPath(); ctx.ellipse(-R * 0.72, 0, R * 0.42, R * 0.72, 0, 0, TAU); ctx.strokeStyle = 'rgba(129,180,229,0.44)'; ctx.lineWidth = 1; ctx.stroke();

    /* Mid-sagittal axis — runs front-to-back, straight through the nose. */
    ctx.strokeStyle = 'rgba(232,240,255,0.26)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(-R * 1.16, 0); ctx.lineTo(R * 1.16, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = muted;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MID-SAGITTAL AXIS', -R * 1.1, -R * 0.14);

    /* Interaural axis — this one runs LEFT-RIGHT, perpendicular to the nose.
       An earlier version drew it along the nose direction and mislabelled it,
       which made the plan view anatomically wrong. */
    ctx.strokeStyle = 'rgba(168,119,255,0.5)';
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(0, -R * 1.1); ctx.lineTo(0, R * 1.1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(168,119,255,0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('INTERAURAL', 0, -R * 1.18);
    ctx.fillText('AXIS', 0, -R * 1.18 + 9);

    /* nose: a tapered wedge, so rotation is unmistakable */
    ctx.fillStyle = 'rgba(190,212,240,0.55)';
    ctx.beginPath();
    ctx.moveTo(R * 0.98, 0);
    ctx.quadraticCurveTo(R * 1.28, -R * 0.16, R * 1.22, -R * 0.02);
    ctx.quadraticCurveTo(R * 1.28, R * 0.16, R * 0.98, 0);
    ctx.closePath(); ctx.fill();

    /* inner-ear markers, one per side */
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(-R * 0.30, s * R * 0.60, 4.4, 0, TAU);
      ctx.fillStyle = 'rgba(168,119,255,0.75)';
      ctx.fill();
    }

    /* ── eyes: sclera, iris, pupil, corneal catch-light, gaze vector ── */
    const eyeOffset = reduced ? 0 : -hair * 0.42 * ctl.gain;
    /* eye-line and gaze cone: a subtle field of view makes the eye/head
       relationship legible before the tiny iris details are inspected. */
    ctx.save();
    ctx.strokeStyle = `rgba(95,227,255,${clamp(0.10 + ctl.gain * 0.12, 0.1, 0.24)})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(R * 0.38, -R * 0.46); ctx.lineTo(ttx - cx, tty - cy - R * 0.12); ctx.moveTo(R * 0.38, R * 0.46); ctx.lineTo(ttx - cx, tty - cy + R * 0.12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(R * 0.42, s * R * 0.44);

      /* socket shadow */
      ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, TAU);
      ctx.fillStyle = 'rgba(8,14,26,0.65)'; ctx.fill();

      /* sclera with a soft gradient so it is not a flat disc */
      const sg = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(0.7, '#e7eef8');
      sg.addColorStop(1, '#b9c8dc');
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU);
      ctx.fillStyle = sg; ctx.fill();

      ctx.save();
      ctx.rotate(eyeOffset);
      /* iris */
      ctx.beginPath(); ctx.arc(5.4, 0, 5.0, 0, TAU);
      const ig = ctx.createRadialGradient(5.4, 0, 1, 5.4, 0, 5);
      ig.addColorStop(0, '#6fd4ff');
      ig.addColorStop(0.6, '#2b7fb8');
      ig.addColorStop(1, '#0d3050');
      ctx.fillStyle = ig; ctx.fill();
      /* pupil */
      ctx.beginPath(); ctx.arc(5.4, 0, 2.3, 0, TAU);
      ctx.fillStyle = '#04070d'; ctx.fill();
      /* corneal catch-light */
      ctx.beginPath(); ctx.arc(3.9, -1.9, 1.35, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
      /* gaze direction stub */
      ctx.strokeStyle = `rgba(95,227,255,${clamp(0.85 - slip * 0.5, 0.2, 0.85)})`;
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(17, 0); ctx.stroke();
      ctx.restore();

      /* eyelid rim */
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU);
      ctx.strokeStyle = 'rgba(150,178,210,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }

    /* vestibular signal lines: each labyrinth to the brainstem origin */
    ctx.strokeStyle = 'rgba(168,119,255,0.42)';
    ctx.lineWidth = 1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-R * 0.30, s * R * 0.60);
      ctx.quadraticCurveTo(-R * 0.06, s * R * 0.24, 0, 0);
      ctx.stroke();
    }

    /* head-yaw arc with an arrowhead, measured from the reference axis */
    if (Math.abs(headAngle) > 0.6 && !reduced) {
      const a0 = 0, a1 = headYaw;
      ctx.strokeStyle = 'rgba(255,181,71,0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.34, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      const tip = a1;
      const tx2 = Math.cos(tip) * R * 1.34, ty2 = Math.sin(tip) * R * 1.34;
      ctx.save();
      ctx.translate(tx2, ty2); ctx.rotate(tip + (a1 < a0 ? -Math.PI / 2 : Math.PI / 2));
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 0); ctx.lineTo(-4, 4); ctx.closePath();
      ctx.fillStyle = 'rgba(255,181,71,0.9)'; ctx.fill();
      ctx.restore();
    }

    /* ── gaze ray from the head centre out to the world-fixed target ── */
    ctx.strokeStyle = `rgba(95,227,255,${clamp(0.85 - slip, 0.15, 0.85)})`;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(R * 1.05, 0);
    ctx.lineTo(ttx - cx, tty - cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    /* ── world-fixed target: concentric reticle that reacts to slip ── */
    const ringPulse = 1 + Math.sin(t * 6) * 0.06;
    const targetGood = slip < 0.15;
    const targetCol = targetGood ? green : slip < 0.4 ? amber : '#ff5f6d';
    /* target glow */
    ctx.save();
    ctx.shadowColor = targetCol;
    ctx.shadowBlur = targetGood ? 18 : 10;
    ctx.strokeStyle = targetCol;
    ctx.globalAlpha = 0.26;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(ttx, tty, 17 * ringPulse, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = targetCol;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(ttx, tty, 17 * ringPulse, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(ttx, tty, 6.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(ttx, tty, 28, 0.2, 1.15); ctx.strokeStyle = 'rgba(154,201,244,0.55)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(ttx, tty, 28, Math.PI + 0.2, Math.PI + 1.15); ctx.stroke();

    ctx.strokeStyle = cssVar('--faint') || '#647a99';
    ctx.beginPath();
    ctx.moveTo(ttx - 22, tty); ctx.lineTo(ttx - 8, tty);
    ctx.moveTo(ttx + 8, tty); ctx.lineTo(ttx + 22, tty);
    ctx.moveTo(ttx, tty - 22); ctx.lineTo(ttx, tty - 8);
    ctx.moveTo(ttx, tty + 8); ctx.lineTo(ttx, tty + 22);
    ctx.stroke();
    /* four corner brackets, the way a tracking reticle is drawn */
    ctx.strokeStyle = 'rgba(74,222,128,0.5)';
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(ttx + sx * 20, tty + sy * 15);
      ctx.lineTo(ttx + sx * 20, tty + sy * 20);
      ctx.lineTo(ttx + sx * 15, tty + sy * 20);
      ctx.stroke();
    }
    ctx.fillStyle = cssVar('--green') || '#4ade80';
    ctx.beginPath(); ctx.arc(ttx, tty, 3, 0, TAU); ctx.fill();

    /* ── on-canvas readouts ── */
    ctx.fillStyle = faint;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('VESTIBULO-OCULAR REFLEX / LIVE TRACK', 28, 32);
    ctx.fillStyle = muted;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('SUPERIOR AXIAL VIEW  ·  CALIBRATED FIELD', 28, 48);
    ctx.fillStyle = accent;
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`HEAD YAW  ${headAngle.toFixed(1)}°`, 28, 68);
    ctx.fillStyle = targetCol;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(targetGood ? 'LOCK  /  STABLE' : slip < 0.4 ? 'LOCK  /  DEGRADED' : 'LOCK  /  LOST', ttx - 34, tty + 45);

    ctx.textAlign = 'right';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = faint;
    ctx.fillText('WORLD-FIXED TARGET', cw - 28, 32);
    ctx.fillStyle = muted;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('GAZE ERROR / RETINAL SLIP', cw - 28, 48);
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = slip > 0.4 ? 'rgba(255,95,109,0.95)' : accent;
    ctx.fillText(`${gazeError.toFixed(2)}°  /  ${(slip * 100).toFixed(0)}%`, cw - 28, 68);

    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = faint;
    ctx.textAlign = 'center';
    ctx.fillText('SUPERIOR VIEW · SCHEMATIC · NOT A MEASUREMENT OF ANY PERSON', cw / 2, ch - 10);

    /* slip warning */
    if (slip > 0.35) {
      ctx.fillStyle = `rgba(255,95,109,${clamp(slip, 0, 0.9)})`;
      ctx.textAlign = 'center';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText('RETINAL SLIP — IMAGE WOULD SMEAR', cx, ch - 18);
    }

    /* tiny calibration legend, kept separate from the anatomy */
    ctx.textAlign = 'left';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = accent; ctx.fillRect(28, ch - 42, 18, 2); ctx.fillText('HEAD VELOCITY', 54, ch - 38);
    ctx.fillStyle = violet; ctx.fillRect(166, ch - 42, 18, 2); ctx.fillText('EYE VELOCITY', 192, ch - 38);
    ctx.fillStyle = targetCol; ctx.fillRect(294, ch - 42, 18, 2); ctx.fillText('TARGET LOCK', 320, ch - 38);

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
  /* Reaction time from lab test 04, surfaced so the Mission Console can score
     its task-performance domain. Stays null until the test records a trial,
     and the console then reports the domain as unavailable rather than 0. */
  let lastReactionMs = null;
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
  /* getReactionMs is consumed by the Mission Console (see main.js) to score
     its task-performance domain. It was advertised but never exported, so
     that domain reported "no signal" on every run. */
  return { select, getReactionMs: () => lastReactionMs };

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

          ctx.fillStyle = C.muted; ctx.font = '11px ui-monospace, monospace';
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

          ctx.fillStyle = C.muted; ctx.font = '11px ui-monospace, monospace';
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
          ctx.fillStyle = C.muted; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
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
        /* Read the direction BEFORE clearing `current` — the toast used to
           test `current?.dir` after the assignment below, so it always fell
           back to the word "different" and never named the actual cue. */
        const cue = current.dir;
        const rt = performance.now() - startedAt;
        rts.push(rt);
        lastReactionMs = rt;
        trials.push({ dir: cue, said: keys[e.key], ok, rt });
        awaiting = false;
        current = null;
        toast(ok ? 'CORRECT' : 'INCORRECT', `${rt.toFixed(0)} ms response. ${ok ? '' : `The burst was ${cue}.`}`, ok ? 'ok' : 'warn', 1800);
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
          ctx.fillStyle = C.muted; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
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

          ctx.fillStyle = C.muted; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left';
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
        ctx.font = '11px ui-monospace, monospace';
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
        ctx.font = '11px ui-monospace, monospace';
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

  mountResearchEvidence();
  mountSpaceAppsLinks();

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

  renderHrp();
  render();

  function render() {
    btns.forEach((b, k) => b.classList.toggle('is-on', k === active));
    const list = SOURCE_LIST.filter((s) => active === 'all' || s.topics.includes(active));
    if (count) count.textContent = `${list.length} of ${SOURCE_LIST.length} sources/assets shown · NASA/NIH registry verified 2026-10-01`;
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
}

/* ── Official NASA visual evidence carousel ────────────────
   Each slide's image is a FULL-PAGE SCREENSHOT of the page it cites, taken with
   headless Chrome at 1440x900 and shipped at 1200px in assets/evidence/ — so the
   slide shows the page's own heading, lead visual and body text, and the
   carousel no longer breaks when NASA's CDN moves a file. Nothing here is
   artwork generated by this project, and no screenshot is faked or retouched
   beyond resizing. Each slide is paired with the exact claim it supports and an
   outbound source link. The carousel is deliberately a citation aid, never
   evidence of NASA endorsement. */
function mountResearchEvidence() {
  const root = $('#researchEvidence');
  if (!root) return;
  const slides = [
    {
      source: 'nasaTechPort157166',
      image: './assets/evidence/techport-countermeasures.jpg',
      kicker: 'NASA TECHPORT',
      connection: 'NASA documents a need for unobtrusive monitoring tools, operational assessments and sensorimotor performance metrics after gravity transitions.',
      finding: 'NASA TechPort: the Head/Body Assessments work aims to quantify sensorimotor adaptation following gravitational transitions and define performance metrics.',
    },
    {
      source: 'ntrsSensorimotorCountermeasures',
      image: './assets/evidence/ntrs-20240008210.jpg',
      kicker: 'NASA NTRS · 2024',
      connection: 'The public NASA technical record describes countermeasures and assessment tools for neurovestibular effects across gravity transitions.',
      finding: 'NTRS record: exploration missions include multiple gravity transitions that affect neurovestibular and sensorimotor capabilities.',
    },
    {
      source: 'nasaSensorimotorHub',
      image: './assets/evidence/sensorimotor-risk.jpg',
      kicker: 'NASA RISK',
      connection: 'Altered gravity can affect orientation, balance, locomotion and fine motor control—especially around gravity transitions.',
      finding: 'NASA risk statement: motion sickness, spatial disorientation, postural/locomotion and manual/fine-motor deficits can affect critical tasks.',
    },
    {
      source: 'nasaHumanPerformance',
      image: './assets/evidence/human-performance.jpg',
      kicker: 'NASA-STD-3001',
      connection: 'NASA human-performance requirements make operational readiness and explicit uncertainty more important than a cosmetic score.',
      finding: 'Operational interpretation: a prototype can communicate readiness context and uncertainty, but it cannot replace medical or flight-surgeon authority.',
    },
    {
      source: 'nasaCipherReference',
      image: './assets/evidence/cipher.jpg',
      kicker: 'NASA CIPHER',
      connection: 'CIPHER gathers repeated eye, sensorimotor and performance assessments before, during and after flight—the longitudinal idea behind this project.',
      finding: 'NASA CIPHER combines repeated human-health assessments across mission phases; this project uses the same longitudinal framing, not NASA data.',
    },
    {
      source: 'nasaCrew12AlteredGravity',
      image: './assets/evidence/crew12-altered-gravity.jpg',
      kicker: 'OPERATIONAL CONTEXT',
      connection: 'NASA is studying disorientation during altered-gravity transitions and its impact on manual landing and control tasks.',
      finding: 'Crew-12 research includes altered-gravity adaptation and manual-control task context—why gravity-transition readiness matters.',
    },
    {
      source: 'nasaFundamentalsHumanHealth',
      image: './assets/evidence/human-health.jpg',
      kicker: 'HUMAN HEALTH',
      connection: 'Human health and performance are mission systems: this project shows monitoring limits, not an autonomous medical conclusion.',
      finding: 'NASA’s human-health reference provides the broader exploration context; no clinical inference is made by this browser prototype.',
    },
    {
      source: 'cipherVestibularHealth',
      image: './assets/evidence/ntrs-20230014013.jpg',
      kicker: 'NASA NTRS · 2023',
      connection: 'NASA’s Neuro-Vestibular Examination records eye, head and body movement repeatedly across the mission—our camera view is experimental and not that clinical examination.',
      finding: 'NTRS describes recordings of eye, head and body movement plus motion-perception reports; it notes modern computer vision and iris-recognition methods.',
    },
  ].map((slide) => ({ ...slide, meta: SOURCES[slide.source] }));

  const cards = slides.map((slide, i) => {
    const img = el('img', { src: slide.image, alt: `Official NASA visual for ${slide.meta.title}`, loading: i ? 'lazy' : 'eager' });
    img.addEventListener('error', () => img.closest('.evidence-card')?.classList.add('image-unavailable'));
    return el('article', { class: 'evidence-card', 'data-slide': String(i) },
      el('div', { class: 'evidence-image' }, img, el('span', { class: 'evidence-kicker', text: slide.kicker })),
      el('div', { class: 'evidence-copy' },
        el('p', { class: 'eyebrow', text: slide.meta.org }),
        el('h3', { text: slide.meta.title }),
        el('p', { text: slide.connection }),
        el('blockquote', { class: 'evidence-finding', text: slide.finding }),
        el('div', { class: 'evidence-foot' },
          el('span', { text: 'OFFICIAL NASA PAGE VISUAL · SOURCE LINKED' }),
          el('a', { href: slide.meta.url, target: '_blank', rel: 'noopener noreferrer', text: 'OPEN NASA ↗' }),
        ),
      ),
    );
  });
  const track = el('div', { class: 'evidence-track' }, ...cards);
  const prev = el('button', { type: 'button', class: 'evidence-nav', text: '←', 'aria-label': 'Previous NASA evidence slide' });
  const next = el('button', { type: 'button', class: 'evidence-nav', text: '→', 'aria-label': 'Next NASA evidence slide' });
  const dots = slides.map((_, i) => el('button', { type: 'button', class: 'evidence-dot', 'aria-label': `Show NASA evidence slide ${i + 1}` }));
  root.replaceChildren(el('section', { class: 'glass panel research-evidence reveal is-in' },
    el('div', { class: 'panel-head' },
      el('p', { class: 'eyebrow', text: 'OFFICIAL NASA VISUAL EVIDENCE' }),
      el('h3', { text: 'The NASA context behind Vestibular GPS' }),
      el('p', { text: 'A rotating visual index of the exact public NASA resources that shaped the project. Images remain credited to NASA; this project is not NASA-endorsed.' }),
    ),
    el('div', { class: 'evidence-stage' }, track),
    el('div', { class: 'evidence-controls' }, prev, el('div', { class: 'evidence-dots' }, ...dots), next),
  ));

  let current = 0;
  let timer = null;
  let moving = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const panel = root.querySelector('.research-evidence');
  const stage = root.querySelector('.evidence-stage');
  const transitionMs = 900;

  /* Warm the next two source screenshots before they are needed. This removes
     the first-slide hitch caused by lazy decoding a large full-page capture at
     the exact moment the card starts moving. */
  const preload = (index) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = slides[(index + slides.length) % slides.length].image;
  };

  const render = () => {
    cards.forEach((card, i) => {
      const delta = ((i - current + slides.length + 1) % slides.length) - 1;
      card.dataset.position = String(delta);
      card.setAttribute('aria-hidden', String(i !== current));
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-on', i === current));
    preload(current + 1);
    preload(current - 1);
  };

  const move = (dir) => {
    if (moving) return;
    moving = true;
    current = (current + dir + slides.length) % slides.length;
    render();
    window.setTimeout(() => { moving = false; }, reduce ? 0 : transitionMs);
  };
  const restart = () => {
    clearInterval(timer);
    if (!reduce) timer = setInterval(() => move(1), 5100);
  };
  prev.addEventListener('click', () => { move(-1); restart(); });
  next.addEventListener('click', () => { move(1); restart(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => {
    if (moving || i === current) return;
    moving = true;
    current = i;
    render();
    window.setTimeout(() => { moving = false; }, reduce ? 0 : transitionMs);
    restart();
  }));

  /* Pointer swipe: one deliberate gesture = one slide, with no scroll-jitter
     while the gesture is in progress. */
  let pointerStart = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerStart = event.clientX;
    stage.classList.add('is-dragging');
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointerup', (event) => {
    if (pointerStart === null) return;
    const dx = event.clientX - pointerStart;
    pointerStart = null;
    stage.classList.remove('is-dragging');
    if (Math.abs(dx) > 44) { move(dx < 0 ? 1 : -1); restart(); }
  });
  stage.addEventListener('pointercancel', () => {
    pointerStart = null;
    stage.classList.remove('is-dragging');
  });
  panel.addEventListener('pointerenter', () => clearInterval(timer));
  panel.addEventListener('pointerleave', restart);
  render();
  restart();
}

/* ── NASA Space Apps participation links ─────────────────────
   These are deliberately separate from SOURCES: they are event, local
   registration and team-workflow resources, not scientific evidence for a
   vestibular claim.  Keeping that boundary visible makes the citation list
   more honest for judges. */
function mountSpaceAppsLinks() {
  const root = $('#spaceAppsLinks');
  if (!root) return;
  const links = [
    {
      label: 'OFFICIAL GLOBAL',
      title: 'NASA Space Apps Challenge 2026',
      detail: 'Account creation, event selection, team formation and final project submission.',
      url: 'https://www.spaceappschallenge.org/2026/',
      official: true,
    },
    {
      label: 'OFFICIAL TERMS',
      title: '2026 Participant Terms and Conditions',
      detail: 'Eligibility, submission and participation conditions for the global challenge.',
      url: 'https://www.spaceappschallenge.org/legal/',
      official: true,
    },
    {
      label: 'LOCAL REGISTRATION',
      title: 'NASA Space Apps Challenge Bangladesh',
      detail: 'Bangladesh local-event registration and organiser information.',
      url: 'https://www.nasaspaceappsbd.com/registration',
      official: false,
    },
    {
      label: 'PARTICIPANT GUIDE',
      title: '2026 Participant Guide',
      detail: 'Shared organiser/participant reference supplied by the team.',
      url: 'https://docs.google.com/document/d/1mSOxplyht5kii8GcCnFaGA-vMHIAVypjl4N6PobnaYQ/edit?usp=sharing',
      official: false,
    },
    {
      label: 'FAQ NOTEBOOK',
      title: 'Participant Guide FAQ',
      detail: 'NotebookLM companion resource supplied by the team; verify any rule against the official site.',
      url: 'https://notebook.google.com/notebook/44e5e9a3-5387-4191-8687-b44766aee09e',
      official: false,
    },
    {
      label: 'BUILD WORKFLOW',
      title: '2026 Space Apps Build Guide',
      detail: 'Team-supplied build-planning reference; not an official NASA rulebook.',
      url: 'https://claude.ai/artifact/PUnJNpKuEXRbvKafSgU6fA',
      official: false,
    },
    {
      label: 'COMMUNITY',
      title: 'Participants WhatsApp Group 1',
      detail: 'Community coordination link supplied by the team. Join only if you recognise the organiser.',
      url: 'https://chat.whatsapp.com/Hw5P1SXKyYB1BJ0zVN607M?mode=gi_t',
      official: false,
    },
    {
      label: 'COMMUNITY',
      title: 'Participants WhatsApp Group 2',
      detail: 'Community coordination link supplied by the team. Join only if you recognise the organiser.',
      url: 'https://chat.whatsapp.com/DF7VS6T3QTH4clY1zenCko',
      official: false,
    },
  ];
  const cards = links.map((item) => el('a', {
    class: `spaceapps-link ${item.official ? 'is-official' : ''}`,
    href: item.url,
    target: '_blank',
    rel: 'noopener noreferrer',
  },
  el('span', { class: 'spaceapps-kind', text: item.label }),
  el('h4', { text: item.title }),
  el('p', { text: item.detail }),
  el('span', { class: 'spaceapps-open', text: 'OPEN LINK ↗' })));
  root.replaceChildren(el('section', { class: 'glass panel spaceapps-links reveal is-in' },
    el('div', { class: 'panel-head' },
      el('p', { class: 'eyebrow', text: 'NASA SPACE APPS 2026 · PARTICIPATION RESOURCES' }),
      el('h3', { text: 'Build, register, and submit with the right references' }),
      el('p', { text: 'Official challenge links are marked separately. Community and team-supplied guides are useful navigation aids, but the official Global site and Terms control eligibility and submission rules.' }),
    ),
    el('div', { class: 'spaceapps-grid' }, ...cards),
  ));
}

/* ═══════════════════════════════════════════════════════════
   NASA HRP RISK TRACEABILITY
   Why this belongs on the Research page and not only in the console:
   the console table answers "which DAG node does this number come from",
   which is an engineering question. A reader deciding whether the project
   is relevant to the challenge asks a different one — "is this inside a
   real NASA problem, and did they get the problem right". So this panel
   carries the risk statement verbatim and the published causal chain, and
   the per-domain role sentences explain the jump from domain to node.

   The node names are NASA's, quoted; the mapping is ours and is labelled
   as a mapping. No paraphrase is written as if it were a NASA claim.
   ═══════════════════════════════════════════════════════════ */
function renderHrp() {
  const root = $('#hrpPanel');
  if (!root) return;

  const title = $('#hrpRiskTitle');
  if (title) {
    title.append(
      el('b', { text: `${HRP_RISK.title} (${HRP_RISK.short})` }),
      document.createTextNode(` — ${HRP_RISK.org}`),
    );
  }

  const quote = $('#hrpStatement');
  if (quote) quote.textContent = `"${HRP_RISK.statement}"`;

  const qsrc = $('#hrpStatementSource');
  if (qsrc) qsrc.textContent = HRP_RISK.statementSource;

  /* The chain reads left-to-right as NASA's own cause-to-outcome ordering.
     Each stage is one cell; the nodes inside it are NASA's node names. */
  const chain = $('#hrpChain');
  if (chain) {
    HRP_CHAIN.forEach((stage, i) => {
      const cell = el('div', { class: 'num-cell' },
        el('span', { class: 'num-k', text: `${i + 1}. ${stage.stage}` }),
        el('span', { class: 'num-v', text: stage.nodes.join(' · ') }));
      chain.append(cell);
    });
  }

  /* Domain -> DAG node. The node name is read from DOMAINS so this page and
     the Mission Console cannot drift apart; if osi.js changes the mapping,
     both change together. */
  const roles = $('#hrpRoles');
  if (roles) {
    DOMAINS.forEach((d) => {
      /* The role sentence is its own element, not appended to the node
         name, so the Bengali dictionary can match it on its own. d.dag is
         NASA's node name and stays in English on both pages — a quoted
         node name is not something we translate. */
      roles.append(el('p', { class: 'src-use' },
        el('b', { text: `${d.label} \u2192 ${d.dag} \u2014` }),
        el('span', { text: ` ${HRP_DOMAIN_ROLE[d.id] || ''}` })));
    });
  }

  const caveat = $('#hrpCaveat');
  if (caveat) caveat.textContent = HRP_RISK.caveat;

  const links = $('#hrpLinks');
  if (links) {
    const hub = findSource(HRP_RISK.sourceId);
    const risk = findSource(HRP_RISK.riskPageSourceId);
    const dag = findSource('nasaDagNarrative');
    [['HHP sensorimotor risk page', hub], ['HRP risk entry', risk],
     ['Sensorimotor Risk DAG narrative', dag]].forEach(([label, s], i) => {
      if (!s) return;
      if (i) links.append(document.createTextNode(' · '));
      links.append(el('a', {
        class: 'src-link', href: s.url, target: '_blank',
        rel: 'noopener noreferrer', text: `${label} ↗`,
      }));
    });
  }
}
