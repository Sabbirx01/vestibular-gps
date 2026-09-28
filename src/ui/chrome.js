/* ═══════════════════════════════════════════════════════════
   chrome — the persistent interface layer.
   Intro, custom cursor, navigation, journey rail, HUD, toasts,
   debug overlay, scroll reveal, and the microgravity float field.
   ═══════════════════════════════════════════════════════════ */

import { $, $$, el, clamp, damp, lerp, on, TAU, mulberry32 } from '../core/util.js';
import { state, set, subscribe, bus, toast, setQuality, QUALITY_PRESETS, startRecording, stopRecording } from '../core/store.js';

/* ═══════════ 1. CINEMATIC INTRO ═══════════ */
export function mountIntro({ onEnter }) {
  const root = $('#intro');
  if (!root) return { done: true };

  const steps = [
    [200,  () => root.classList.add('is-stars')],
    [700,  () => { $$('[data-intro="0"]', root).forEach((n) => { n.style.transition = 'opacity 900ms ease'; n.style.opacity = '1'; }); }],
    [1500, () => { $$('[data-intro="1"]', root).forEach((n) => { n.style.transition = 'opacity 800ms ease, letter-spacing 1400ms cubic-bezier(.22,1,.36,1)'; n.style.opacity = '1'; n.style.letterSpacing = '.5em'; }); }],
    [2250, () => {
      root.classList.add('is-typing');
      $$('.intro-brand .ch', root).forEach((ch, i) => { ch.style.animationDelay = `${i * 62}ms`; });
    }],
    [4300, () => { const s = $('.intro-sub', root); s.style.transition = 'opacity 1000ms ease, transform 1000ms cubic-bezier(.22,1,.36,1)'; s.style.opacity = '1'; s.style.transform = 'none'; }],
    [4800, () => { const b = $('.intro-bar', root); b.style.opacity = '1'; root.classList.add('is-scanning'); }],
    [5600, () => root.classList.add('is-ready')],
  ];

  const timers = [];
  const reduce = state.reducedMotion;
  let skipped = false;

  function run() {
    if (reduce) { finish(true); return; }
    for (const [ms, fn] of steps) timers.push(setTimeout(() => { if (!skipped) try { fn(); } catch (e) { console.error(e); } }, ms));
  }

  function finish(instant = false) {
    if (!instant) skipped = true;
    timers.forEach(clearTimeout);
    document.body.classList.remove('vg-intro');
    root.classList.add('is-out');
    setTimeout(() => { root.style.display = 'none'; }, instant ? 0 : 950);
    set({ introDone: true }, ['introDone']);
    try { sessionStorage.setItem('vgps.intro', '1'); } catch { /* private mode */ }
    onEnter?.();
  }

  on($('#introSkip'), 'click', () => finish());
  on($('#introEnter'), 'click', () => finish());
  on(root, 'keydown', (e) => { if (e.key === 'Escape') finish(); });

  let alreadySeen = false;
  try { alreadySeen = sessionStorage.getItem('vgps.intro') === '1'; } catch { /* ignore */ }
  if (alreadySeen) { finish(true); return { done: true }; }

  document.body.classList.add('vg-intro');
  run();
  return { finish };
}

/* ═══════════ 2. CUSTOM CURSOR ═══════════ */
export function mountCursor() {
  const cursor = $('#cursor');
  const label = $('#cursorLabel');
  if (!cursor) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  const isTouch = matchMedia('(pointer: coarse)').matches;
  if (isTouch) return;

  document.body.classList.add('vg-custom-cursor');
  cursor.classList.add('is-on');

  const pos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  let down = false;

  on(window, 'pointermove', (e) => { pos.tx = e.clientX; pos.ty = e.clientY; }, { passive: true });
  on(window, 'pointerdown', () => { down = true; cursor.classList.add('is-click'); });
  on(window, 'pointerup', () => { down = false; cursor.classList.remove('is-click'); });

  on(document, 'pointerover', (e) => {
    const t = e.target.closest('a, button, [data-cursor], input, summary');
    const target = e.target.closest('[data-cursor-target]');
    cursor.classList.toggle('is-hover', !!t);
    cursor.classList.toggle('is-target', !!target);
    label.textContent = target?.dataset.cursorTarget || (t?.dataset.cursor || '');
  });

  const tick = () => {
    requestAnimationFrame(tick);
    pos.x = damp(pos.x, pos.tx, 15, 1 / 60);
    pos.y = damp(pos.y, pos.ty, 15, 1 / 60);
    cursor.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
  };
  tick();
}

/* ═══════════ 3. MICROGRAVITY FLOAT FIELD ═══════════
   Every element marked .float drifts as if there is no gravity:
   tiny orbital motion, damping, and pointer influence. Motion is
   deliberately capped so it never interferes with reading.
   ─────────────────────────────────────────────────── */
export function mountMicrogravityField() {
  const nodes = $$('.float');
  if (!nodes.length) return;

  const fields = new Map();
  const rng = mulberry32(90210);
  let pointer = { x: -9999, y: -9999 };
  let scrollY = 0;

  nodes.forEach((node, i) => {
    const amp = parseFloat(node.dataset.float || '0.5');
    fields.set(node, {
      amp,
      phase: rng() * TAU,
      speed: 0.14 + rng() * 0.16,
      vx: 0, vy: 0,
      x: 0, y: 0,
      rot: 0, vrot: 0,
      tilt: (rng() - 0.5) * 2,
      weight: 0.5 + amp,
      depth: rng() * 0.6 + 0.4,
    });
  });

  on(window, 'pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  on(window, 'pointerleave', () => { pointer.x = pointer.y = -9999; });
  on(window, 'scroll', () => { scrollY = window.scrollY; }, { passive: true });

  let t = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    const dt = 1 / 60;
    t += dt;

    const reduced = state.reducedMotion;
    const globalQ = reduced ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--q-float') || '1');

    for (const [node, f] of fields) {
      const r = node.getBoundingClientRect();
      /* cull anything far outside the viewport — saves work and prevents jank */
      if (r.bottom < -160 || r.top > innerHeight + 160) {
        if (f.x || f.y) { f.x = f.y = 0; f.vx = f.vy = 0; f.rot = 0; node.style.setProperty('--fx', '0px'); node.style.setProperty('--fy', '0px'); node.style.setProperty('--fr', '0deg'); }
        continue;
      }

      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      /* 1. slow orbital drift — the "no gravity" baseline */
      const driftX = Math.sin(t * f.speed + f.phase) * 5 * f.amp * globalQ;
      const driftY = Math.cos(t * f.speed * 0.83 + f.phase * 1.4) * 6.5 * f.amp * globalQ;
      const driftRot = Math.sin(t * f.speed * 0.6 + f.phase) * 0.32 * f.amp * globalQ;

      /* 2. pointer influence — gentle push, stronger when closer */
      let pushX = 0, pushY = 0;
      if (pointer.x > -9000) {
        const dx = cx - pointer.x;
        const dy = cy - pointer.y;
        const d2 = dx * dx + dy * dy;
        const radius = 340;
        if (d2 < radius * radius) {
          const d = Math.max(1, Math.sqrt(d2));
          const force = (1 - d / radius) ** 2 * 26 * f.depth * globalQ;
          pushX = (dx / d) * force;
          pushY = (dy / d) * force;
        }
      }

      /* 3. scroll inertia — elements lag behind the page slightly */
      const lag = clamp((scrollY - (node.dataset.sy || scrollY)) * 0.02, -8, 8) * f.amp * globalQ;
      node.dataset.sy = scrollY;

      const targetX = driftX + pushX;
      const targetY = driftY + pushY + lag;

      f.vx = damp(f.vx, (targetX - f.x) * 2.6, 6, dt);
      f.vy = damp(f.vy, (targetY - f.y) * 2.6, 6, dt);
      f.x = clamp(f.x + f.vx * dt, -26, 26);
      f.y = clamp(f.y + f.vy * dt, -30, 30);

      f.vrot = damp(f.vrot, (driftRot - f.rot) * 2.2, 5, dt);
      f.rot = clamp(f.rot + f.vrot * dt, -1.6, 1.6);

      node.style.setProperty('--fx', `${f.x.toFixed(2)}px`);
      node.style.setProperty('--fy', `${f.y.toFixed(2)}px`);
      node.style.setProperty('--fr', `${f.rot.toFixed(3)}deg`);
    }
  };
  tick();
}

/* ═══════════ 4. NAVIGATION + TOPBAR ═══════════ */
export function mountNav({ onModeChange, hub, scene }) {
  const nav = $('#nav');
  const menuBtn = $('#menuToggle');
  const topbar = $('#topbar');

  on(menuBtn, 'click', () => {
    const open = nav.classList.toggle('is-open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  on(nav, 'click', (e) => {
    if (e.target.tagName === 'A') { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  });

  on(window, 'scroll', () => {
    topbar.classList.toggle('is-stuck', window.scrollY > 24);
  }, { passive: true });

  /* mode toggle: EARTH ↔ MICROGRAVITY, with MOON/MARS reachable from the space section */
  const modeBtn = $('#modeToggle');
  const modeLabel = $('#modeLabel');
  on(modeBtn, 'click', () => {
    const next = state.mode === 'EARTH' ? 'MICROGRAVITY' : 'EARTH';
    onModeChange(next);
  });

  /* source chip cycles SIMULATION → LIVE SENSOR → REPLAY */
  const srcBtn = $('#sourceChip');
  on(srcBtn, 'click', async () => {
    const order = ['SIMULATION', 'LIVE_SENSOR', 'REPLAY'];
    const i = order.indexOf(state.source);
    const next = order[(i + 1) % order.length];
    await hub.switchTo(next);
  });

  /* sound is off by default and only ever procedural — no autoplay, no files */
  const soundBtn = $('#soundToggle');
  on(soundBtn, 'click', () => {
    const next = !state.sound;
    set({ sound: next }, ['sound']);
    soundBtn.textContent = next ? 'SOUND ON' : 'SOUND OFF';
    soundBtn.setAttribute('aria-pressed', String(next));
    toast(next ? 'SOUND ENABLED' : 'SOUND MUTED',
      next ? 'Ambient tone generated in the browser. Off by default, and never autoplays on load.' : 'Sound muted.',
      'info', 3200);
  });

  /* active-section tracking drives nav highlight, journey rail and camera framing */
  const sections = $$('main section[id]');
  const linkMap = new Map($$('#nav a').map((a) => [a.getAttribute('href').slice(1), a]));
  let current = 'sec-hero';

  const setActive = (id) => {
    if (id === current) return;
    current = id;
    linkMap.forEach((a, k) => a.classList.toggle('is-active', k === id));
    set({ activeSection: id }, ['activeSection']);
    scene?.setSection(id);
    bus.emit('section', id);
  };

  if (typeof IntersectionObserver !== 'undefined') {
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.12, 0.4, 0.75] });
    sections.forEach((s) => io.observe(s));
  }

  /* smooth in-page navigation that also works with the browser back button */
  on(document, 'click', (e) => {
    const a = e.target.closest('a[href^="#"], [data-goto]');
    if (!a) return;
    const id = (a.getAttribute('href') || a.dataset.goto || '').slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  });

  /* deep-link on load */
  if (location.hash) {
    const t = document.getElementById(location.hash.slice(1));
    if (t) setTimeout(() => t.scrollIntoView({ block: 'start' }), 260);
  }

  /* hash changes from direct route entry */
  on(window, 'hashchange', () => {
    const t = document.getElementById(location.hash.slice(1));
    if (t) t.scrollIntoView({ behavior: state.reducedMotion ? 'auto' : 'smooth', block: 'start' });
  });

  return { setActive };
}

/* ═══════════ 5. JOURNEY RAIL ═══════════ */
export function mountJourney() {
  const list = $('#journeyList');
  const fill = $('#journeyFill');
  const items = $$('main section[data-journey]').map((s) => ({
    id: s.id,
    label: s.dataset.journey,
  }));

  list.innerHTML = '';
  items.forEach((it) => {
    const li = el('li', { dataset: { id: it.id }, text: it.label });
    const btn = el('button', { type: 'button', class: 'journey-btn', text: it.label, 'aria-label': `Go to ${it.label}` });
    btn.style.cssText = 'font:inherit;color:inherit;letter-spacing:inherit;text-align:left;padding:0;';
    btn.addEventListener('click', () => document.getElementById(it.id)?.scrollIntoView({ behavior: 'smooth' }));
    li.textContent = '';
    li.append(btn);
    list.append(li);
  });

  const nodes = Array.from(list.children);
  const rail = document.getElementById('journey');
  const total = () => document.documentElement.scrollHeight - innerHeight;

  const tick = () => {
    const p = clamp(window.scrollY / Math.max(1, total()), 0, 1);
    fill.style.height = `${p * 100}%`;
    const active = state.activeSection;
    nodes.forEach((n) => n.classList.toggle('is-on', n.dataset.id === active));
    /* reveal the rail only once the hero has scrolled away */
    if (rail) rail.classList.toggle('is-on', window.scrollY > Math.min(innerHeight * 0.62, 560));
  };
  tick();
  on(window, 'scroll', tick, { passive: true });
  subscribe((s, changed) => { if (changed.includes('activeSection')) tick(); });
}

/* ═══════════ 6. LIVE HUD ═══════════ */
export function mountHud() {
  const hud = $('#hud');
  const e = {
    mode: $('#hudMode'), source: $('#hudSource'), orient: $('#hudOrient'),
    jerk: $('#hudJerk'), rate: $('#hudRate'), engine: $('#hudEngine'), fps: $('#hudFpsFill'),
  };
  const footerEngine = $('#footerEngine');
  const footerQuality = $('#footerQuality');

  let visible = false;
  let acc = 0;
  const tick = (dt) => {
    acc += dt;
    if (acc < 0.1) return;
    acc = 0;

    if (!visible && state.introDone) { hud.classList.add('is-in'); visible = true; }

    e.mode.textContent = state.mode;
    e.mode.className = state.mode === 'EARTH' ? '' : 'is-sim';
    const srcClass = state.source === 'LIVE_SENSOR' ? 'is-live' : state.source === 'REPLAY' ? 'is-sim' : 'is-sim';
    e.source.textContent = state.source;
    e.source.className = srcClass;
    e.orient.textContent = state.link.stale ? 'IDLE' : 'ACTIVE';
    e.orient.className = state.link.stale ? '' : 'is-live';
    e.jerk.textContent = `${state.sample.jerk.toFixed(1)} deg/s²`;
    e.rate.textContent = `${state.link.hz} Hz`;
    e.engine.textContent = state.engine.ready ? state.engine.mode : 'OFFLINE';
    e.fps.style.width = `${clamp((state.engine.fps / 60) * 100, 4, 100)}%`;
    e.fps.style.background = state.engine.fps > 48 ? 'var(--green)' : state.engine.fps > 32 ? 'var(--amber)' : 'var(--red)';

    if (footerEngine) footerEngine.textContent = `3D: ${state.engine.ready ? state.engine.mode : 'OFFLINE'}`;
    if (footerQuality) footerQuality.textContent = `QUALITY: ${state.quality}`;
  };
  bus.on('frame', tick);
}

/* ═══════════ 7. TOASTS ═══════════ */
export function mountToasts() {
  const host = $('#toasts');
  bus.on('toast', ({ title, msg, kind, ms }) => {
    const t = el('div', { class: `toast ${kind || ''}` }, el('b', { text: title }), document.createTextNode(msg));
    host.append(t);
    setTimeout(() => {
      t.style.transition = 'opacity 400ms ease, transform 400ms ease';
      t.style.opacity = '0'; t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 420);
    }, ms || 5200);
  });
}

/* ═══════════ 8. SCROLL REVEAL ═══════════ */
export function mountReveal() {
  const nodes = $$('.reveal');
  if (!nodes.length || typeof IntersectionObserver === 'undefined') {
    nodes.forEach((n) => n.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  nodes.forEach((n, i) => { n.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`; io.observe(n); });
}

/* ═══════════ 9. DEBUG OVERLAY ═══════════ */
export function mountDebug({ hub }) {
  const box = $('#debug');
  const btn = $('#debugToggle');
  const f = {
    fps: $('#dbgFps'), calls: $('#dbgCalls'), tris: $('#dbgTris'), gpu: $('#dbgGpu'),
    objs: $('#dbgObjs'), sensor: $('#dbgSensor'), assets: $('#dbgAssets'),
  };

  const enabled = new URLSearchParams(location.search).get('debug') === '1';
  const apply = (on) => {
    box.hidden = !on;
    set({ debug: on }, ['debug']);
  };
  apply(enabled);
  on(btn, 'click', () => apply(box.hidden));

  let acc = 0;
  bus.on('frame', (dt) => {
    if (box.hidden) return;
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    f.fps.textContent = state.engine.fps.toFixed(0);
    f.calls.textContent = String(state.engine.calls);
    f.tris.textContent = (state.engine.tris / 1000).toFixed(1) + 'k';
    f.gpu.textContent = state.engine.mode;
    f.objs.textContent = String(state.engine.objects);
    f.sensor.textContent = `${hub.activeId} · ${state.link.hz}Hz`;
    f.assets.textContent = state.engine.failed ? `FAIL(${state.engine.failed})` : 'none external';
  });
}

/* ═══════════ 10. QUALITY CONTROL UI ═══════════ */
export function mountQualityControl() {
  /* Keyboard escape hatch for constrained devices: Q cycles quality. */
  on(window, 'keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'q' || e.key === 'Q') {
      const order = ['MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
      const i = order.indexOf(state.quality);
      const next = order[(i + 1) % order.length];
      setQuality(next);
      toast('GRAPHICS QUALITY', `Render profile set to ${next}. Saved for future visits.`, 'info', 3000);
    }
  });
}
