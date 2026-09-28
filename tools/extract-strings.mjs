/* ═══════════════════════════════════════════════════════════
   extract-strings.mjs — list every user-visible English string.

   Purpose: the /bn route needs a translation for each visible string, and
   guessing which strings those are from a terminal is how strings get missed.
   This walks index.html's markup and the src tree's string literals, applies
   a few filters that drop code-looking text, and writes the result to
   tests/_strings.json together with a count.

   Why a file and not stdout: node's stdout is not captured reliably in this
   environment, so every tool here reports through a file.

   Usage:
     node tools/extract-strings.mjs
     (then read tests/_strings.json)

   ASCII only.
   ═══════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'tests', '_strings.json');

/* ── what counts as user-visible copy ────────────────────── */
function looksLikeCopy(s) {
  if (s.length < 4 || s.length > 400) return false;
  if (!/[A-Za-z]/.test(s)) return false;             // must contain letters
  if (/^[A-Z0-9_\-./]+$/.test(s)) return false;      // SCREAMING_CONSTANTS, paths
  if (/[{}<>]|=>|\|\||&&|\$\{|\\n|\\t/.test(s)) return false;  // code
  if (/^https?:|^\.\.?\/|^data:|@/.test(s)) return false;      // urls, imports
  if (/\b(px|vh|vw|rem|rgba?|hsl|rgb)\b/.test(s)) return false; // css values
  if (/^[\d\s.,%+-]+$/.test(s)) return false;        // numbers only
  if (/^[a-z]+[A-Z]/.test(s) && !/\s/.test(s)) return false;   // camelCase
  if (/\.(js|css|html|json|mjs|png|jpg|glb|svg)$/.test(s)) return false;
  /* Short label-like strings are copy too ("BODY", "Head motion"), so length
     is not a filter on its own; two or more words, or 12+ chars, is. */
  const words = s.trim().split(/\s+/).length;
  return words >= 2 || s.length >= 12;
}

const found = new Map();   // string -> Set of sources

function add(s, src) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (!looksLikeCopy(t)) return;
  if (!found.has(t)) found.set(t, new Set());
  found.get(t).add(src);
}

/* ── index.html: strip tags and scripts, keep text ───────── */
function scanHtml(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  /* text between tags */
  for (const m of body.matchAll(/>([^<]+)</g)) add(m[1], 'index.html');
  /* copy-carrying attributes */
  for (const m of body.matchAll(/(?:placeholder|title|aria-label|alt|content)="([^"]+)"/g)) {
    add(m[1], 'index.html@attr');
  }
}

/* ── src/**.js: single-quoted and backtick literals ──────── */
function scanJs(src, file) {
  for (const m of src.matchAll(/'([^'\\\n]{4,400})'/g)) add(m[1], file);
  for (const m of src.matchAll(/"([^"\\\n]{4,400})"/g)) add(m[1], file);
  /* template literals are usually built from variables, so only take the
     ones with no interpolation */
  for (const m of src.matchAll(/`([^`$\\]{4,400})`/g)) add(m[1], file);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'assets') walk(p, out); }
    else if (extname(e.name) === '.js') out.push(p);
  }
  return out;
}

scanHtml(readFileSync(join(ROOT, 'index.html'), 'utf8'));

const jsFiles = walk(join(ROOT, 'src'));
for (const f of jsFiles) scanJs(readFileSync(f, 'utf8'), f.replace(ROOT + '\\', '').replace(ROOT + '/', ''));

/* ── dictionary coverage, if one exists ─────────────────── */
let dict = {};
try {
  const d = readFileSync(join(ROOT, 'src', 'i18n', 'bn.js'), 'utf8');
  for (const m of d.matchAll(/^\s*'((?:[^'\\]|\\.)+)'\s*:\s*'/gm)) dict[m[1]] = true;
} catch { dict = {}; }

const all = [...found.keys()].sort((a, b) => a.localeCompare(b));
const missing = all.filter((s) => !dict[s]);
const report = {
  generatedAt: new Date().toISOString(),
  jsFilesScanned: jsFiles.length,
  totalStrings: all.length,
  translated: all.length - missing.length,
  missing: missing.length,
  /* The missing ones, grouped by source file, are what a translator works
     from. Sorted so two runs can be diffed. */
  missingBySource: (() => {
    const bySrc = {};
    for (const s of missing) {
      const srcs = [...found.get(s)];
      for (const src of srcs) (bySrc[src] ||= []).push(s);
    }
    for (const k of Object.keys(bySrc)) bySrc[k].sort();
    return bySrc;
  })(),
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
