/* ═══════════════════════════════════════════════════════════
   i18n — a translation layer that does not touch the renderers.

   WHY THIS SHAPE
   The site's copy is written inline, in the markup and in every panel
   renderer. Threading a `t()` call through all of them would mean editing a
   hundred call sites and re-editing them for every new language, and a missed
   one shows up as a stray English sentence in the middle of a Bengali page.

   So instead: one dictionary (src/i18n/bn.js) keyed by the exact English
   string, and a pass that rewrites matching text nodes in the live DOM, plus a
   MutationObserver so panels that render later are translated too. Nothing in
   the renderers needs to know a language exists.

   The consequence to be honest about: translation coverage is measured, not
   assumed. Anything not in the dictionary stays in English on a Bengali page.
   `node tools/extract-strings.mjs` lists exactly what is missing, grouped by
   source file, and that number is the coverage figure.

   Matching is EXACT on the trimmed, whitespace-collapsed text of a node. No
   substring replacement — "0 Hz" must not turn into a Bengali fragment inside
   a longer sentence.

   ASCII only in this file (the dictionary holds the non-ASCII).
   ═══════════════════════════════════════════════════════════ */

import { BN } from './bn.js';

export const LANGS = ['en', 'bn'];

/**
 * Which language this page is. Taken from the URL so the same HTML file can
 * serve both: `/bn/` (or `/bn`) is Bengali, everything else is English, and
 * `?lang=bn` overrides for testing. `bn/index.html` is a generated copy of
 * index.html with a `<base href="../">` tag — see tools/sync-lang-pages.ps1.
 */
export function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS.includes(q)) return q;
    if (/(^|\/)bn(\/|$|\?)/.test(location.pathname)) return 'bn';
  } catch (e) { /* no location (tests) */ }
  return 'en';
}

export const lang = detectLang();
export const isBn = lang === 'bn';

/** Dictionary lookup for code that builds its own strings. */
export function t(s) {
  if (!isBn || typeof s !== 'string') return s;
  return BN[s.trim().replace(/\s+/g, ' ')] || s;
}

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

/**
 * Translate a subtree in place. Returns the number of nodes it changed, so a
 * caller (or a test) can tell how much of what it rendered was covered.
 */
export function translateTree(node, dict = BN) {
  let hits = 0;
  const walk = (n) => {
    if (n.nodeType === 3) {
      const raw = n.nodeValue;
      const key = raw.trim().replace(/\s+/g, ' ');
      if (!key) return;
      const hit = dict[key];
      if (hit && hit !== key) {
        /* keep the surrounding whitespace the renderer wrote */
        n.nodeValue = raw.replace(key, hit);
        hits++;
      }
      return;
    }
    if (n.nodeType !== 1) return;
    for (const a of ATTRS) {
      const v = n.getAttribute && n.getAttribute(a);
      if (v && dict[v] && dict[v] !== v) { n.setAttribute(a, dict[v]); hits++; }
    }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  };
  walk(node);
  return hits;
}

/**
 * Install the layer on a live document and keep it applied.
 * The observer reacts to characterData as well, because the HUD and the camera
 * rows rewrite their numbers every frame — a value that goes back to English
 * when it updates would look broken.
 */
export function installTranslator({ root = document.body, dict = BN } = {}) {
  if (!isBn) return { installed: false, hits: 0, observer: null };

  const hits = translateTree(root, dict);
  let nodes = 0;

  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') { nodes += translateTree(m.target, dict); continue; }
      for (const n of m.addedNodes) nodes += translateTree(n, dict);
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });

  /* Static head copy is not inside <body>. */
  if (document.title && dict[document.title]) document.title = dict[document.title];
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    const v = desc.getAttribute('content');
    if (v && dict[v]) desc.setAttribute('content', dict[v]);
  }

  document.documentElement.setAttribute('lang', 'bn');
  document.documentElement.setAttribute('data-lang', 'bn');
  return { installed: true, hits, observer, count: () => nodes };
}
