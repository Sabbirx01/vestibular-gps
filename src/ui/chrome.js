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

  /* Whether the cinematic cursor IS the cursor is decided here and re-checked
     when the pointer type changes — not by a CSS media query, which Chrome can
     flip mid-session on a hybrid or touchscreen laptop, handing the native
     cursor back while the overlay was still drawn. That was the reported bug:
     hold still or touch, and the PC cursor kept returning. See base.css. */
  const coarse = matchMedia('(pointer: coarse)');
  const setCursorMode = (custom) => {
    /* data-cursor-MODE, not data-cursor: this file also reads `data-cursor`
       and `data-cursor-target` off hovered elements to label the cursor, and
       `closest('[data-cursor]')` walks UP the tree — so putting data-cursor on
       <html> made every element's closest match <html>, which permanently
       switched the hover state on and printed the attribute's value next to
       the ship. Reported as a stray "custom" label on the cursor. */
    document.documentElement.dataset.cursorMode = custom ? 'custom' : 'native';
    document.body.classList.toggle('vg-custom-cursor', custom);
    cursor.classList.toggle('is-on', custom);
  };
  const sync = () => setCursorMode(!coarse.matches);
  /* Decided ONCE, at load, and deliberately not re-decided on a `change`
     event. Re-deciding meant that on a hybrid or touchscreen laptop a media
     flip could hand the native cursor back mid-session while the custom one
     was still on screen — the exact "two cursors" report. A phone reports
     coarse at load and keeps its native cursor; a machine that reports fine at
     load keeps the cinematic one for the session. Re-run this by hand
     (data-cursor-mode) if a device is ever genuinely both. */
  sync();

  const ship = cursor.querySelector('.cursor-ship');
  const ghosts = cursor.querySelectorAll('.cursor-trail i');

  /* ── smoke stamp ─────────────────────────────────────────
     One 64x64 alpha stamp, generated here and handed to the stylesheet as a
     CSS mask. Every segment used to be the same perfect ellipse in a different
     colour, evenly spaced — the owner's read of that was "it looks like
     bubbles", and the measurements agreed: 30 byte-identical gradients, a
     countable dark valley between each pair. A radial gradient alone cannot fix
     that, because a gradient is still a circle. So the shape is weathered by
     value noise instead, and each segment samples a different crop of it (the
     mask size and offset are per segment below), which breaks both the silhouette
     and the repetition. Generated rather than shipped as a file: the project has
     no image assets and this is 64x64. */
  function valueNoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const h = (a, b) => {
      let n = (a * 374761393 + b * 668265263) | 0;
      n = (n ^ (n >> 13)) * 1274126177;
      return (((n ^ (n >> 16)) >>> 0) % 1000) / 1000;
    };
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  function buildSmokeStamp() {
    const S = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = ((x + 0.5) / S) * 2 - 1;
        const dy = ((y + 0.5) / S) * 2 - 1;
        const d = Math.hypot(dx, dy);
        /* soft body, then two octaves of noise: one to break the rim into wisps,
           one to mottle the inside so it is not a flat disc of paint */
        let a = Math.pow(Math.max(0, 1 - d * d), 1.6);
        a *= 0.52 + 0.78 * valueNoise(dx * 2.6 + 11, dy * 2.6 - 7);
        a *= 1 - 0.34 * valueNoise(dx * 5.5, dy * 5.5);
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
  cursor.style.setProperty('--trail-mask', `url(${buildSmokeStamp()})`);
  const pos = { x: innerWidth / 2, y: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2 };
  /* Recent path as a ring buffer of numbers, so the trail costs no
     allocations. The ghosts are simply earlier positions: the ship itself
     never lags, because the trail is what makes it fly. */
  /* How far back in the ring buffer each segment samples, in frames. Two
     densities, because the plume is two things: across the first twelve segments
     it is flame and is sampled every frame, so it stays one continuous ribbon
     even in a hard flick; beyond that it is smoke, which has already spread, so
     every third frame is enough to place it. A single 2-frame step everywhere was
     the old shape, and it fails exactly when the plume is most visible: measured
     in a browser during a 700 px / 260 ms sweep, neighbouring segments sat ~88 px
     apart with 14-36 px bodies, which reads as a dotted line, not thrust. */
  const TRAIL_FIRST = 6;
  const TRAIL_DENSE = 6;
  /* 2, not 3: the smoke has to overlap to read as one body. At 3 the tail puffs
     sat a countable dark valley apart at speed, which is the other half of what
     made them look like beads. 2 costs 18 frames of reach — the plume still runs
     about 0.9 s behind the hull. */
  const TRAIL_SPARSE_STEP = 2;
  const TRAIL_N = Math.max(1, ghosts.length);
  const trailBack = new Int32Array(TRAIL_N);
  for (let i = 0; i < TRAIL_N; i++) {
    trailBack[i] = TRAIL_FIRST + (i < TRAIL_DENSE ? i : TRAIL_DENSE + (i - TRAIL_DENSE) * TRAIL_SPARSE_STEP);
  }
  /* the buffer has to reach past the oldest sample plus the wrap slack */
  const N = trailBack[TRAIL_N - 1] + TRAIL_FIRST + 6;
  const hx = new Float32Array(N);
  const hy = new Float32Array(N);
  let head = 0;
  let angle = -90;        // screen degrees; -90 is nose-up
  let lastTx = pos.tx;    // pointer position at the previous frame
  let lastTy = pos.ty;
  let runLevel = 0;       // 0 = parked, 1 = full thrust

  /* ── Exhaust plume ──────────────────────────────────────────
     Same idea as the old four dots — each segment is a linked earlier position
     of the ship — with three changes that make it read as thrust rather than as
     a row of beads:

     1. eighteen segments, reaching about 0.6 s of travel behind the hull
        (dense near the nozzle, sparse through the smoke — see trailBack), so
           a fast flick leaves a long plume rather than a stub, and the trailing
           third has room to be smoke rather than more flame;
       2. every segment is STRETCHED along its own local direction of travel, so
          the plume bends through a turn instead of staying a straight line;
       3. the colour ramps nozzle -> tail: hot white, cyan, amber, then grey
          smoke, which is what exhaust looks like against a dark sky and what
          keeps the plume tied to the site's amber/cyan palette while its tail
          stops pretending to be fire.

     All three are set ONCE, here. The frame loop below only ever writes
     transform, opacity and scale, so the plume stays compositor work. */
  const trailDir = new Float32Array(TRAIL_N);
  /* Sizes GROW toward the tail rather than shrinking: a nozzle flame is small and
     hot, and what leaves it is smoke, which spreads as it cools. The old ramp did
     the opposite — 10 px down to 3.8 px, then scaled to 0.38 — so the trailing
     half of the plume ended up 1-2 px across at ~11 % opacity: a thread, not
     smoke. Owner's read of it: "make the tail bigger with more smoke, so it feels
     like a real rocket going up." Sizes and colours are set here ONCE; the frame
     loop below only writes transform, opacity and scale.
     Glow blur is capped at 18 px because box-shadow is painted rather than
     composited and the plume is now 30 of them — that is the one number here with
     a real frame cost, so it is the number that stays modest. */
   /* Base long-axis width per segment, kept so the frame loop can stretch a
      segment to whichever gap it has to cover (see the scale below). */
  const trailW = new Float32Array(TRAIL_N);
  /* Per-segment size jitter. The ramp below is a smooth function of i, so without
     this the plume is a row of identical shapes — which is half of why it read as
     soap bubbles rather than smoke. Deterministic from the index, so the plume is
     stable frame to frame; irregular, which is the part that matters. */
  const trailJit = new Float32Array(TRAIL_N);
  /* and a second one for how much each puff contributes, so the plume has some
     density variation instead of an even fade */
  const trailJit2 = new Float32Array(TRAIL_N);
  ghosts.forEach((g, i) => {
    const k = TRAIL_N > 1 ? i / (TRAIL_N - 1) : 0;
    /* 20 -> 60 px rather than 14 -> 36. The decisive measurement: at a moderate
       pointer speed the samples land ~10-12 px apart while the CORE of a 14 px
       puff is only 6-8 px across, so there was dark sky between every pair and
       the row stayed countable however softly each puff was drawn. A body wider
       than the sampling pitch merges. */
    const w = 20 + k * 40;                  // long axis, aligned to travel
    const h = 13 + k * 26;
    trailW[i] = w;
    /* thicker spread than before: the jitter is what stops the row of puffs
       reading as a row of puffs */
    trailJit[i] = 0.74 + 0.46 * (((i * 37) % 13) / 12);
    trailJit2[i] = 0.80 + 0.40 * (((i * 23) % 11) / 10);
    /* a different crop and scale of the smoke stamp per segment, so no two
       silhouettes are the same shape */
    /* 66-145 % and 0-100 %, not the 112-133 % this started at: the stamp is
       64 px and the elements are 20-60 px, so a crop that only slides a few
       per cent of a 64 px stamp lands within a pixel of the last one and every
       silhouette stays identical. */
    g.style.setProperty('--trail-mask-size', `${66 + ((i * 29) % 80)}% ${66 + ((i * 53) % 80)}%`);
    g.style.setProperty('--trail-mask-pos', `${(i * 41) % 100}% ${(i * 17) % 100}%`);
    g.style.width = `${w.toFixed(1)}px`;
    g.style.height = `${h.toFixed(1)}px`;
    g.style.margin = `${(-h / 2).toFixed(1)}px 0 0 ${(-w / 2).toFixed(1)}px`;
    /* Colour goes through custom properties rather than inline background and
       box-shadow. Inline would win over the stylesheet, and the stylesheet is
       what turns the whole trail amber while the ship is over a target — that
       state has to keep working. White core, cyan flame, amber burn, then grey
       smoke at the tail. */
    /* RGB channels rather than a hex fill: the stylesheet draws each puff as a
       radial gradient that fades to nothing at the edge, and it needs the
       channels separately to do that. */
    g.style.setProperty('--trail-rgb', k < 0.10 ? '255,255,255' : k < 0.34 ? '169,236,255' : k < 0.62 ? '255,192,106' : '200,205,210');
    /* Glow survives only where there is still fire. The bright coat of box-shadow
       around every segment was the other half of the bubble read. */
    g.style.setProperty('--trail-glow', 'rgba(120,235,255,.55)');
    g.style.setProperty('--trail-glow-size', k < 0.34 ? `${(7 - k * 12).toFixed(0)}px` : '0px');
  });

  on(window, 'pointermove', (e) => {
    pos.tx = e.clientX;
    pos.ty = e.clientY;
    /* Re-show the overlay if it was hidden while the pointer was outside. */
    if (document.documentElement.dataset.cursorMode === 'custom') cursor.classList.add('is-on');
  }, { passive: true });

  /* A phone cannot expose or move the operating system mouse pointer.  It can,
     however, show the site's own pointer while a two-finger gesture is in
     progress.  The midpoint tracks the gesture without cancelling it, so the
     browser retains its normal two-finger scroll / zoom behaviour. */
  const moveTouchCursor = (touches) => {
    if (touches.length < 2) return;
    const a = touches[0], b = touches[1];
    pos.tx = (a.clientX + b.clientX) / 2;
    pos.ty = (a.clientY + b.clientY) / 2;
    document.documentElement.dataset.touchCursor = 'true';
    setCursorMode(true);
  };
  const stopTouchCursor = (touches) => {
    if (touches.length >= 2) return;
    delete document.documentElement.dataset.touchCursor;
    if (coarse.matches) setCursorMode(false);
  };
  on(window, 'touchstart', (e) => moveTouchCursor(e.touches), { passive: true });
  on(window, 'touchmove', (e) => moveTouchCursor(e.touches), { passive: true });
  on(window, 'touchend', (e) => stopTouchCursor(e.touches), { passive: true });
  on(window, 'touchcancel', (e) => stopTouchCursor(e.touches), { passive: true });

  /* Parked at the window edge with the pointer outside, the ship just sits
     there looking like a stuck cursor. Hide it instead. */
  on(document, 'pointerleave', () => cursor.classList.remove('is-on'));
  on(window, 'pointerdown', () => cursor.classList.add('is-click'));
  on(window, 'pointerup', () => cursor.classList.remove('is-click'));

  on(document, 'pointerover', (e) => {
    /* PointerEvent targets can be non-Element nodes in synthetic events. A
       failed `.closest()` here used to stop cursor state updates and made the
       native hit target feel offset/unreliable. */
    const node = e.target instanceof Element ? e.target : null;
    const t = node?.closest('a, button, [data-cursor], input, summary');
    const target = node?.closest('[data-cursor-target]');
    cursor.classList.toggle('is-hover', !!t);
    cursor.classList.toggle('is-target', !!target);
    /* Label only from data-cursor-TARGET. The old fallback printed whatever a
       hovered element carried in `data-cursor`, which is how the state
       attribute on <html> ended up rendered as the word "custom" next to the
       ship. One documented attribute, no surprises. */
    if (label) label.textContent = target?.dataset.cursorTarget || '';
  });

  const tick = () => {
    requestAnimationFrame(tick);
    /* A touch device owns the native cursor; nothing to draw or track then. */
    if (document.documentElement.dataset.cursorMode !== 'custom') return;
    /* How far the POINTER moved this frame — not how far the ship is behind it.
       The two are not the same, and the difference was a real bug: the ship
       tracks within a pixel or two and snaps outright once it is more than 48 px
       behind (below), so the ship-to-pointer gap is LARGEST at a slow drift and
       collapses to zero exactly when the ship is flying fastest. Both the plume
       and the nose were driven by that gap, so the harder you moved, the less
       exhaust there was, and a fast flick turned the ship not at all. Measuring
       the pointer itself gives the plume a length that grows with real speed and
       turns the nose on a flick. */
    const pdx = pos.tx - lastTx;
    const pdy = pos.ty - lastTy;
    const travel = Math.hypot(pdx, pdy);
    lastTx = pos.tx;
    lastTy = pos.ty;

    /* 45, not 15. At the old rate the ship sat tens of pixels behind the
       pointer, which is exactly why the native cursor had to stay visible and
       two cursors showed on screen at once. This tracks within a pixel or two
       at normal mouse speeds; the overlay is pointer-events:none and centred
       on the pointer either way. */
    pos.x = damp(pos.x, pos.tx, 45, 1 / 60);
    pos.y = damp(pos.y, pos.ty, 45, 1 / 60);
    /* Safety net: damp() is frame-rate independent only if it is called every
       frame, and a throttled tab (or a long pause) leaves the ship far behind
       the pointer. Since the native cursor is now hidden, being far off is not
       cosmetic — it is a wrong click point. Snap instead of drifting. */
    if (Math.abs(pos.tx - pos.x) + Math.abs(pos.ty - pos.y) > 48) {
      pos.x = pos.tx;
      pos.y = pos.ty;
    }
    cursor.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;

    /* 5.5 rather than 7: the nozzle flame lighting up is half of what makes the
       plume read as thrust, and at 7 it only lit during a deliberate flick. */
    cursor.classList.toggle('is-fast', travel > 5.5);

    if (ship) {
      if (travel > 0.6) {
        /* the nose leads the way */
        const want = Math.atan2(pdy, pdx) * 180 / Math.PI + 90;
        const d = ((want - angle + 180) % 360 + 360) % 360 - 180;   // shortest way round
        angle += d * 0.25;
      }
      /* No idle re-orientation. The ship used to drift back to nose-up after a
         moment of stillness, which reads as the cursor moving on its own while
         the mouse is parked. It now keeps the heading it last flew. */
      ship.style.rotate = `${angle.toFixed(2)}deg`;
    }

    /* The buffer holds the POINTER's path, not the ship's damped one. The ship
       is what has to stay exactly on the cursor; the trail should be the path
       the hand actually drew, and reading the pointer means a fast flick leaves
       the full sweep behind it instead of a snapped, empty gap. */
    hx[head] = pos.tx;
    hy[head] = pos.ty;
    head = (head + 1) % N;

    /* Thrust: parked, there is no exhaust at all; flying, it trails many times
       the length of the hull. Fast attack, slower release — a plume does not
       blink out the instant a hand pauses mid-flick. */
    const thrust = Math.min(1, travel / 13);
    runLevel = damp(runLevel, thrust, thrust > runLevel ? 26 : 5, 1 / 60);
    const run = runLevel;
    const now = performance.now();
    for (let i = 0; i < TRAIL_N; i++) {
      const at = (head - 1 - trailBack[i] + N * 2) % N;
      const g = ghosts[i];
      const k = TRAIL_N > 1 ? i / (TRAIL_N - 1) : 0;

      /* local heading, from the sample one frame newer than this one, so the
         plume curves through a turn instead of pointing at the last direction */
      const newer = (at + 1) % N;
      const ddx = hx[at] - hx[newer];
      const ddy = hy[at] - hy[newer];
      if (ddx || ddy) trailDir[i] = Math.atan2(ddy, ddx) * 180 / Math.PI;
      /* The distance from this sample to the next one along the path: the gap
         this segment has to cover for the plume to stay continuous. At speed it
         is far bigger than the puff's own body — during a 700 px / 260 ms sweep
         the pointer moves ~48 px per frame while the near-field bodies are
         13-24 px across, and the fixed-size version left a gap between every
         pair, which read as a dotted line rather than thrust. Stretching the long
         axis (already aligned to the direction of travel) to cover the gap is the
         motion-blur trick, and the body grows BACKWARD only (the translate below)
         so the leading edge stays on its recorded sample and the smear lands
         where the exhaust has been. Growing both ways charged double, which is
         why the first version still pinched on a machine whose frame commit ran
         slower and put more pixels between samples. Cap 5x: high enough to close
         the frame-rate spread, low enough that one stale ring slot cannot paint
         an enormous streak. */
      const gapPx = Math.hypot(ddx, ddy);
      const grow = (0.92 + k * 0.38) * trailJit[i];   // size ramp x per-segment jitter
      const stretch = Math.max(grow, Math.min(5, gapPx / (trailW[i] * 1.05)));

      /* The scale belongs INSIDE the transform list, after the translate.
         Written as the `scale` CSS property it is applied BEFORE `transform` in
         the individual-transform order, which multiplied the translate by the
         same factor — so the tail segments were pulled up to 62 per cent closer
         to the ship than their recorded positions, and the plume was far shorter
         than its own numbers said. Leftmost first: move, turn, then size.
         Two factors: the long axis is stretched to whatever gap this segment has
         to cover, the short axis only carries the nozzle-to-tail size ramp
         (0.92 → 1.30). It used to taper to 0.38 on both axes. */
      /* Lateral drift and lift, both growing with age: smoke billows and rises,
         while the recorded path of a straight pointer is a ruler. The scatter is
         noise on the segment index, so it is smooth between neighbours (no
         tearing) and identical every frame (no jitter). Measured criticism of the
         previous pass: "the centres run on a dead-straight line with zero lateral
         scatter, no curl, no widening". */
      /* Perpendicular to the direction of travel, never along it: an along-track
         offset changes the gap to the next sample, and measured on the first try
         it tore 5-8 pairs of the fast plume apart by up to 144 px. The noise's
         second axis is time, so the drift billows slowly instead of sitting there
         as a frozen kink, while staying smooth between neighbouring segments. */
      const scat = (valueNoise(i * 0.7, now * 0.0007 + 3.3) - 0.5) * 2 * (k * 11);
      const perpX = -ddy / (gapPx || 1);
      const perpY = ddx / (gapPx || 1);
      const lift = -k * 7 + (valueNoise(9.1, i * 0.6 + now * 0.0005) - 0.5) * 2 * (k * 4);
      g.style.transform =
        `translate3d(${(hx[at] - pos.x + scat * perpX).toFixed(1)}px, ${(hy[at] - pos.y + scat * perpY + lift).toFixed(1)}px, 0)` +
        ` rotate(${trailDir[i].toFixed(1)}deg)` +
        /* half of whatever the stretch added, pulled back along the local +x —
           which the rotate above has just aimed down the direction of travel —
           so all of the growth goes behind the sample instead of half in front */
        ` translateX(${(-(stretch - 1) * trailW[i] / 2).toFixed(1)}px)` +
        ` scale(${stretch.toFixed(3)}, ${grow.toFixed(3)})`;
      /* A slow flicker down the plume: fire that holds perfectly still reads as
         a drawn line, and this costs one sine per segment. */
      const flick = 0.86 + 0.14 * Math.sin(now * 0.018 + i * 1.9);
      /* 0.98 down to 0.18 — the tail has to stay visible now that it is smoke
         rather than a hairline; it used to fall to 0.11. */
      /* 0.80 rather than 0.98: the bodies are twice the size now, so the same
         alpha would stack into a solid bar instead of smoke */
      g.style.opacity = (0.80 * (1 - k * 0.80) * run * flick * trailJit2[i]).toFixed(3);
    }
  };
  tick();
}

/* ── Mobile desktop preview ────────────────────────────────
   The responsive page is the default.  On a phone this opt-in switch replaces
   only the viewport declaration, letting the browser render the genuine desktop
   layout at a fit-to-screen scale.  It is more reliable than CSS transforms:
   fixed canvases, sticky panels and 3D stages remain in their normal coordinate
   system, and returning to mobile restores the original declaration exactly. */
export function mountMobileDesktopView() {
  const button = $('#mobileDesktopToggle');
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!button || !viewport) return;

  const original = viewport.getAttribute('content') || 'width=device-width, initial-scale=1';
  const phone = matchMedia('(max-width: 620px)');
  const desktopWidth = 1280;
  let active = false;

  const render = () => {
    document.documentElement.dataset.mobileDesktop = active ? 'true' : 'false';
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'MOBILE VIEW' : 'DESKTOP VIEW';
    if (active) {
      /* CSS pixels, rather than hardware pixels: this remains correct on a
         high-density phone.  Clamp avoids an unusably tiny preview. */
      const scale = Math.max(.22, Math.min(.72, window.innerWidth / desktopWidth));
      viewport.setAttribute('content', `width=${desktopWidth}, initial-scale=${scale.toFixed(3)}, minimum-scale=0.2, maximum-scale=3, viewport-fit=cover`);
    } else {
      viewport.setAttribute('content', original);
    }
  };

  const leaveOnWideScreen = () => {
    if (!phone.matches && active) { active = false; render(); }
  };
  on(button, 'click', () => { active = !active; render(); });
  phone.addEventListener?.('change', leaveOnWideScreen);
  on(window, 'orientationchange', () => { if (active) render(); }, { passive: true });
  render();
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
export function mountNav({ hub, scene }) {
  const nav = $('#nav');
  const menuBtn = $('#menuToggle');
  const topbar = $('#topbar');
  let ambient = null;

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

  /* The topbar mode chip is gone. It read "● EARTH" / "● MARS" next to the ship
     in the header, and the owner read it as another floating label on top of the
     screen. What it did is still reachable: the Space section's gravity row
     switches between all four environments (EARTH · MOON · MARS · MICROGRAVITY)
     through the same setMode(), and it highlights the active one. For the state
     itself, the live HUD's MODE row carries it (that panel only exists at
     >= 1876 px wide), the LAB section's gravity-comparison test prints it, and
     every change raises a toast naming the new environment. The `#modeToggle` /
     `#modeLabel` hooks are gone from index.html, including the dead null-guarded
     writes in main.js, so nothing reads a missing node. */

  /* source chip cycles SIMULATION → LIVE SENSOR → REPLAY */
  const srcBtn = $('#sourceChip');
  on(srcBtn, 'click', async () => {
    const order = ['SIMULATION', 'LIVE_SENSOR', 'REPLAY'];
    const i = order.indexOf(state.source);
    const next = order[(i + 1) % order.length];
    await hub.switchTo(next);
  });

  /* Sound is intentionally procedural, local, and opt-in. The earlier control
     only changed a label/state flag, so it looked enabled while producing no
     sound. This tiny two-oscillator engine is created inside the user click,
     which satisfies browser autoplay policy and gives the button a real job. */
  const startAmbient = async () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio is not supported by this browser');
    if (!ambient) {
      const context = new Audio();
      const master = context.createGain();
      master.gain.value = 0.026;
      master.connect(context.destination);
      const low = context.createOscillator();
      low.type = 'sine'; low.frequency.value = 55;
      const high = context.createOscillator();
      high.type = 'sine'; high.frequency.value = 82.5;
      const highGain = context.createGain(); highGain.gain.value = 0.24;
      low.connect(master); high.connect(highGain); highGain.connect(master);
      low.start(); high.start();
      ambient = { context, master, low, high };
    }
    await ambient.context.resume();
  };
  const stopAmbient = async () => {
    if (!ambient) return;
    await ambient.context.suspend();
  };
  const soundBtn = $('#soundToggle');
  on(soundBtn, 'click', async () => {
    const next = !state.sound;
    try {
      if (next) await startAmbient();
      else await stopAmbient();
    } catch (error) {
      console.warn('[sound]', error);
      toast('SOUND UNAVAILABLE', 'This browser could not start its local audio engine.', 'warn', 5200);
      return;
    }
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
    /* e.target is not guaranteed to be an Element: a keydown delivered to
       window or document has no .matches(), and calling it threw a
       TypeError that aborted the handler before the Q shortcut ran. */
    const t = e.target;
    if (t && typeof t.matches === 'function' && t.matches('input, textarea')) return;
    if (e.key === 'q' || e.key === 'Q') {
      const order = ['MOBILE', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'];
      const i = order.indexOf(state.quality);
      const next = order[(i + 1) % order.length];
      setQuality(next);
      toast('GRAPHICS QUALITY', `Render profile set to ${next}. Saved for future visits.`, 'info', 3000);
    }
  });
}
