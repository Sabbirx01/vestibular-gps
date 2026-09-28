/* ═══════════════════════════════════════════════════════════
   main — boot sequence and wiring.
   Real steps, real progress: the boot screen reports what has
   actually finished, and never fakes a percentage.
   ═══════════════════════════════════════════════════════════ */

import { $, el, on, clamp, damp } from './core/util.js';
import {
  state, set, bus, subscribe, toast, showError,
  initEnvironment, startLinkWatchdog, startClock,
} from './core/store.js';
import { installTranslator, t } from './i18n/index.js';
import { SensorHub } from './sensors/providers.js';
import { SceneManager } from './three/SceneManager.js';
import {
  mountIntro, mountCursor, mountMicrogravityField, mountNav,
  mountJourney, mountHud, mountToasts, mountReveal, mountDebug, mountQualityControl,
} from './ui/chrome.js';
import { mountBodySection, mountSensorSection, mountSpaceSection } from './ui/panels.js';
import {
  mountSubjectSection, mountEarSection, mountBrainSection, mountVorSection,
  mountLabSection, mountResearchSection,
} from './ui/labs.js';
import { mountConsoleSection } from './ui/console.js';
import { mountIntegrationSection } from './ui/integration.js';
/* Registered onto the hub at runtime rather than inside providers.js: the
   camera provider needs SensorProvider from that module, and importing it
   back from there would make the dependency circular. */
import { CameraProvider } from './sensors/webcam.js';

/* ── Error boundary: nothing raw ever reaches the user ──── */
function installErrorBoundary() {
  window.addEventListener('error', (e) => {
    console.error('[uncaught]', e.error || e.message);
    if (e.message && /WebGL|context lost/i.test(String(e.message))) {
      showError('3D ENGINE ERROR', 'The graphics context was lost. Reloading the page usually restores it — every chart and lab demonstration keeps running regardless.');
    }
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled rejection]', e.reason);
  });
  window.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('3D ENGINE LOST', 'The GPU context dropped (this can happen on low-memory devices). The 3D background stopped; all data panels continue to work.');
  }, true);
}

/* ── Boot screen with genuinely real steps ──────────────── */
const BOOT_STEPS = [
  'DETECTING RENDER CAPABILITY',
  'INITIALISING VESTIBULAR SYSTEM',
  'LOADING SPACE ENVIRONMENT',
  'BUILDING ANATOMICAL MODELS',
  'CONNECTING VISUALIZATION',
  'CALIBRATING ORIENTATION',
  'READY',
];

function bootUI() {
  const host = $('#bootSteps');
  const bar = $('#bootBar');
  const nodes = BOOT_STEPS.map((label) => {
    const n = el('li', {}, el('span', { text: label }), el('span', { class: 'st', text: 'PENDING' }));
    host.append(n);
    return n;
  });
  let done = 0;
  return {
    async step(i, fn) {
      const n = nodes[i];
      n.classList.add('is-active');
      n.querySelector('.st').textContent = 'WORKING';
      /* Yield so the label paints before we block on real work.
         Race rAF against a timer: requestAnimationFrame never fires in a
         background or occluded tab, which would stall the whole boot. */
      await new Promise((r) => {
        let done = false;
        const fin = () => { if (!done) { done = true; r(); } };
        requestAnimationFrame(fin);
        setTimeout(fin, 60);
      });
      const t0 = performance.now();
      try { await fn(); } catch (e) { console.error(`[boot:${BOOT_STEPS[i]}]`, e); }
      const ms = Math.round(performance.now() - t0);
      n.classList.remove('is-active');
      n.classList.add('is-done');
      n.querySelector('.st').textContent = `${ms} ms`;
      done++;
      bar.style.width = `${(done / BOOT_STEPS.length) * 100}%`;
    },
    finish() {
      const b = $('#boot');
      if (!b) return;
      b.classList.add('is-done');
      setTimeout(() => { b.style.display = 'none'; }, 800);
      document.body.classList.remove('vg-boot');
      set({ booted: true }, ['booted']);
    },
  };
}

/** Absolute safety net: the boot overlay must never trap the user.
    If startup stalls for any reason, dismiss it and say so. */
function armBootFailsafe() {
  setTimeout(() => {
    if (state.booted) return;
    const b = $('#boot');
    if (b && getComputedStyle(b).display !== 'none') {
      console.warn('[boot] failsafe fired — dismissing the boot overlay');
      b.classList.add('is-done');
      b.style.display = 'none';
      document.body.classList.remove('vg-boot');
      set({ booted: true }, ['booted']);
      toast('STARTUP DEGRADED', 'Some components did not finish initialising. The written science, charts and lab demonstrations remain available.', 'warn', 9000);
    }
  }, 12000);
}

/* ═══════════════════════════════════════════════════════════ */
async function main() {
  /* tell the classic-script guard in index.html that the module graph is alive */
  window.__VG_STARTED__ = true;
  window.__VG_BOOT_GUARD_CLEAR__?.();

  installErrorBoundary();
  armBootFailsafe();

  /* Language layer, installed before anything renders. The intro overlay is
     static markup, so it has to be translated here rather than after the
     sections mount; the MutationObserver inside picks up everything the panels
     render afterwards. On an English page this is a no-op and costs a path
     test. See src/i18n/index.js for why the copy is translated in the DOM
     instead of at every call site. */
  const i18n = installTranslator();
  if (i18n.installed) console.info('[i18n] Bengali page: %d strings translated on first pass', i18n.hits);

  const boot = bootUI();
  const ctx = {};

  await boot.step(0, async () => {
    ctx.detect = initEnvironment();
  });

  await boot.step(1, async () => {
    ctx.hub = new SensorHub();
    /* Constructed but never started without an explicit user action, so no
       permission prompt can appear unprompted. */
    ctx.hub.providers.camera = new CameraProvider();
    startClock();
    startLinkWatchdog();
  });

  await boot.step(2, async () => {
    ctx.scene = new SceneManager($('#gl'));
    if (!state.engine.ready && !ctx.scene.ready) {
      /* handled inside SceneManager; nothing else to do here */
    }
  });

  await boot.step(3, async () => {
    /* the anatomical models are built lazily by their MiniStages, but the
       heavy buffer generation happens here so the first scroll is smooth */
    ctx.subjectStage = mountSubjectSection();
    ctx.earStage = mountEarSection();
    ctx.brainStage = mountBrainSection();
  });

  await boot.step(4, async () => {
    ctx.charts = {};
    ctx.sensors = mountSensorSection({ hub: ctx.hub });
    ctx.space = mountSpaceSection({ scene: ctx.scene, onMode: (m) => setMode(ctx, m) });
    mountVorSection();
    ctx.lab = mountLabSection();

    /* The Mission Console is the product the roadmap specifies. It reads live
       channels and degrades honestly when a channel has no source. */
    ctx.console = mountConsoleSection({
      getReactionMs: () => (typeof ctx.lab?.getReactionMs === 'function' ? ctx.lab.getReactionMs() : undefined),
    });
    /* integration.js measures an ingested payload against the same reference
       the crew established, so it needs the console's captured sessions. */
    window.__VGPS_CONSOLE__ = ctx.console;

    ctx.integration = mountIntegrationSection({ camera: ctx.hub.providers.camera });

    mountResearchSection();
    mountBodySection();
  });

  await boot.step(5, async () => {
    mountNav({ onModeChange: (m) => setMode(ctx, m), hub: ctx.hub, scene: ctx.scene });
    mountJourney();
    mountMicrogravityField();
    mountCursor();
    mountHud();
    mountToasts();
    mountReveal();
    mountDebug({ hub: ctx.hub });
    mountQualityControl();

    /* reflect the detected environment in the UI */
    const srcState = $('#sourceLabel');
    if (srcState) srcState.textContent = state.source;
    const modeLabel = $('#modeLabel');
    if (modeLabel) modeLabel.textContent = state.mode;
  });

  await boot.step(6, async () => {
    /* hand control to the intro */
  });

  boot.finish();

  /* ── the intro owns the screen once boot is done ── */
  mountIntro({
    onEnter: () => {
      set({ started: true, time: { ...state.time, started: performance.now() } }, ['started']);
      document.body.classList.remove('vg-intro');
      /* nudge the camera so the first reveal feels deliberate */
      ctx.scene?.setSection('sec-hero', true);
    },
  });

  /* ── master frame loop ── */
  let prev = performance.now();
  let frameAcc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.0005, (now - prev) / 1000));
    prev = now;

    try { ctx.scene?.update(dt); } catch (e) { console.error('[frame:scene]', e); }
    bus.emit('frame', dt);

    frameAcc += dt;
    if (frameAcc > 1) {
      frameAcc = 0;
      const e = state.engine;
      const chip = $('#hudEngine');
      if (chip) chip.textContent = e.ready ? e.mode : 'OFFLINE';
    }
  }
  requestAnimationFrame(frame);

  /* ── mode switching ── */
  function setMode(c, mode) {
    if (state.mode === mode) return;
    set({ mode }, ['mode']);
    c.scene?.setMode(mode);
    const lbl = $('#modeLabel');
    if (lbl) lbl.textContent = mode;
    const btn = $('#modeToggle');
    if (btn) btn.dataset.mode = mode;
    bus.emit('mode', mode);

    const copy = {
      EARTH: 'Returned to the 1 g reference. Otolith organs are loaded continuously again.',
      MOON: 'Lunar gravity — about one sixth of Earth. Surface operations from Apollo showed measurable postural and gait effects in this environment.',
      MARS: 'Martian gravity — about 38% of Earth. Otolith loading is reduced but present.',
      MICROGRAVITY: 'Weightlessness. Rotation sensing is unchanged, but the constant gravitational reference is gone — the brain must re-weight toward vision.',
    };
    toast(`ENVIRONMENT · ${mode}`, copy[mode] || '', mode === 'MICROGRAVITY' ? 'warn' : 'ok', 5200);
  }

  /* ── housekeeping ── */
  document.addEventListener('visibilitychange', () => {
    /* pause the expensive scene while the tab is hidden */
    if (document.hidden) ctx.scene?.renderer?.setAnimationLoop?.(null);
  });

  /* keep the 3D canvas sized to the viewport even when the URL bar moves */
  const ro = new ResizeObserver(() => {
    ctx.scene?.camera?.updateProjectionMatrix?.();
  });
  ro.observe(document.documentElement);

  /* ── expose a small, documented debug surface ── */
  window.VESTIBULAR_GPS = {
    version: '1.0.0',
    state,
    bus,
    set,
    setMode: (m) => setMode(ctx, m),
    scene: () => ctx.scene,
    hub: () => ctx.hub,
    note: 'Debug surface. All values read from the live application state.',
  };

  /* First-visit courtesy note about what this is. */
  if (!state.reducedMotion) {
    setTimeout(() => {
      toast('EDUCATIONAL VISUALIZATION', 'This is an interactive illustration of vestibular science. It is not a medical device and does not assess your vestibular function.', 'info', 7000);
    }, 2600);
  }
}

main().catch((e) => {
  console.error('[fatal]', e);
  const b = $('#boot');
  if (b) {
    b.innerHTML = '';
    b.append(el('div', { class: 'boot-inner' },
      el('p', { class: 'boot-title', text: 'VESTIBULAR GPS' }),
      el('p', { style: 'color:var(--red);font-family:var(--font-mono);font-size:var(--fs-xs);', text: t('STARTUP FAILED') }),
      el('p', { class: 'caption', text: t('The application could not initialise in this browser. The written science remains available in docs/.') }),
    ));
  }
  document.body.classList.remove('vg-boot');
});
