/* ═══════════════════════════════════════════════════════════
   util — tiny math / DOM / format helpers shared everywhere.
   No dependencies. No side effects on import.
   ═══════════════════════════════════════════════════════════ */

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ── math ───────────────────────────────────────────────── */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const TAU = Math.PI * 2;

/** Frame-rate independent exponential smoothing. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Shortest signed angular difference, degrees, result in [-180,180). */
export function angDiff(a, b) {
  let d = (b - a) % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Deterministic PRNG so generated data is reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simple 1-pole low-pass filter for noisy sensor streams. */
export class LowPass {
  constructor(alpha = 0.2) { this.a = alpha; this.v = null; }
  push(x) { this.v = this.v == null ? x : this.v + this.a * (x - this.v); return this.v; }
  reset() { this.v = null; }
}

/** Rolling statistics over a fixed window — used for jerk/signal metrics. */
export class Rolling {
  constructor(n = 120) { this.n = n; this.buf = []; }
  push(v) { this.buf.push(v); if (this.buf.length > this.n) this.buf.shift(); return this; }
  get last() { return this.buf.length ? this.buf[this.buf.length - 1] : 0; }
  mean() { return this.buf.length ? this.buf.reduce((a, b) => a + b, 0) / this.buf.length : 0; }
  rms() { return this.buf.length ? Math.sqrt(this.buf.reduce((a, b) => a + b * b, 0) / this.buf.length) : 0; }
  maxAbs() { return this.buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0); }
  std() {
    if (this.buf.length < 2) return 0;
    const m = this.mean();
    return Math.sqrt(this.buf.reduce((a, b) => a + (b - m) ** 2, 0) / (this.buf.length - 1));
  }
  clear() { this.buf.length = 0; }
}

/* ── format ─────────────────────────────────────────────── */
export const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
export const fmtDeg = (v, d = 0) => `${Number.isFinite(v) ? v.toFixed(d) : '—'}°`;
export const pct = (v, d = 0) => `${(v * 100).toFixed(d)}%`;

export function timeAgo(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── DOM helpers ────────────────────────────────────────── */
export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

export function debounce(fn, ms = 140) {
  let t = 0;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function rafThrottle(fn) {
  let queued = false, lastArgs = null;
  return (...a) => {
    lastArgs = a;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(...lastArgs); });
  };
}

/* ── canvas helpers ─────────────────────────────────────── */
export function fitCanvas(canvas, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Read a CSS custom property from :root — keeps JS colours in sync with tokens.css. */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
