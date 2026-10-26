#!/usr/bin/env node
// Fails when user-facing text contains internal spec references:
//   "§", "docs/", spec codes like LD-01 / AK-05 / FN-03, question codes like Q-P7.
// Comments, <style> blocks, tests and import paths are ignored; only text that
// can reach the screen is checked (markup text and attribute values in .svelte,
// string literals in .ts / <script>).
// Usage: node scripts/check-ui-text.mjs   (exit 1 on findings)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const DIRS = ['apps/web/src', 'apps/field/src'];
// Package files whose strings reach the screen (dashboard definitions, errors, alerts).
const EXTRA_FILES = [
  'packages/api/src/dashboards.ts',
  'packages/api/src/rules.ts',
  'packages/api/src/reports.ts',
  'packages/api/src/performance.ts',
  'packages/api/src/trucks.ts',
  'packages/api/src/money.ts',
  'packages/api/src/amounts.ts', // amount sanity messages
  'packages/api/src/access.ts',
  'packages/api/src/static-data.ts',
  'packages/api/src/mock-client.ts',
  'packages/api/src/mock',
  'apps/api/src/domain', // server error messages shown to users
];

const RULES = [
  { name: 'section sign', re: /§/ },
  { name: 'docs/ reference', re: /\bdocs\// },
  { name: 'spec code', re: /\b[A-Z]{2}-\d{2}\b/ },
  { name: 'question code', re: /\bQ-[A-Z]\d+\b/ },
];

// Legitimate references removed before the rules run.
const ALLOW = [
  /\b[A-Z]{2,5}-[A-Z]{2,4}-[A-Z0-9-]+/g, // document refs: BTW-PO-0001, NUD-PO-…, ASIE-RX-…
  /\bSHP-[A-Z0-9-]+/g, // shipment refs
  /\b[A-Z]{3} ?\d{3}[A-Z]\b/g, // truck registrations: KCA 123X, RAD 812K
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates
  /\b(?:USD|UGX|KES|RWF|TZS|CDF|BIF|EUR)\b/g, // currency codes
];

const isTest = (p) => /\.(test|spec)\.ts$/.test(p) || p.split(sep).includes('test') || p.split(sep).includes('tests');

function walk(p, out) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const n of readdirSync(p)) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      walk(join(p, n), out);
    }
  } else if (/\.(svelte|ts)$/.test(p) && !p.endsWith('.d.ts') && !isTest(relative(root, p))) {
    out.push(p);
  }
  return out;
}

// ---------- JS/TS scanner: collects string literal contents, skips comments ----------
const REGEX_PREV = /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof|\bcase|\bin|\bof)\s*$/;

/**
 * Scan JS/TS code from index i. If `braced`, stop at the `}` that closes depth 0.
 * Pushes { text, line } for every string literal (template literal static parts included)
 * unless it is an import path. Returns the end index.
 */
function scanCode(src, i, braced, lineOf, out) {
  let depth = 0;
  let codeStart = i;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const e = src.indexOf('\n', i);
      i = e === -1 ? n : e;
      continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e === -1 ? n : e + 2;
      continue;
    }
    if (c === '/') {
      const before = src.slice(Math.max(codeStart, i - 40), i);
      if (REGEX_PREV.test(before)) {
        // regex literal: skip to unescaped closing slash (respecting classes)
        let j = i + 1;
        let inClass = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        i = j + 1;
        continue;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const before = src.slice(Math.max(0, start - 30), start);
      if (!/(?:\bfrom|\bimport\s*\(?|\brequire\s*\()\s*$/.test(before)) {
        out.push({ text: src.slice(start + 1, j), line: lineOf(start) });
      }
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let segStart = j;
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          out.push({ text: src.slice(segStart, j), line: lineOf(segStart) });
          j = scanCode(src, j + 2, true, lineOf, out) + 1;
          segStart = j;
          continue;
        }
        j++;
      }
      out.push({ text: src.slice(segStart, j), line: lineOf(segStart) });
      i = j + 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (braced && depth === 0) return i;
      depth--;
    }
    i++;
  }
  return i;
}

// ---------- Svelte scanner ----------
function scanSvelte(src, lineOf, out) {
  const n = src.length;
  let i = 0;
  let textStart = 0;
  const flush = (end) => {
    if (end > textStart) {
      // split into lines so findings report the right line
      let s = textStart;
      for (const part of src.slice(textStart, end).split('\n')) {
        if (part.trim()) out.push({ text: part, line: lineOf(s) });
        s += part.length + 1;
      }
    }
  };
  while (i < n) {
    if (src.startsWith('<!--', i)) {
      flush(i);
      const e = src.indexOf('-->', i + 4);
      i = e === -1 ? n : e + 3;
      textStart = i;
      continue;
    }
    const m = /^<(script|style)\b[^>]*>/.exec(src.slice(i, i + 200));
    if (m) {
      flush(i);
      const close = `</${m[1]}>`;
      const bodyStart = i + m[0].length;
      const e = src.indexOf(close, bodyStart);
      const bodyEnd = e === -1 ? n : e;
      if (m[1] === 'script') {
        const sub = src.slice(0, bodyEnd); // keep offsets for line numbers
        scanCode(sub, bodyStart, false, lineOf, out);
      }
      i = e === -1 ? n : e + close.length;
      textStart = i;
      continue;
    }
    if (src[i] === '{') {
      flush(i);
      if (src[i + 1] === '/') { // {/if}, {/each}, …
        const e = src.indexOf('}', i);
        i = e === -1 ? n : e + 1;
        textStart = i;
        continue;
      }
      i = scanCode(src, i + 1, true, lineOf, out) + 1;
      textStart = i;
      continue;
    }
    i++;
  }
  flush(n);
}

function lineIndex(src) {
  const starts = [0];
  for (let k = 0; k < src.length; k++) if (src[k] === '\n') starts.push(k + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

function check(text) {
  let t = text;
  for (const a of ALLOW) t = t.replace(a, ' ');
  return RULES.filter((r) => r.re.test(t)).map((r) => r.name);
}

const files = [];
const args = process.argv.slice(2); // optional: check only these files (e.g. a fixture)
if (args.length) files.push(...args.map((a) => resolve(a)));
else {
  for (const d of DIRS) walk(join(root, d), files);
  for (const f of EXTRA_FILES) {
    const p = join(root, f);
    try { walk(p, files); } catch { /* optional */ }
  }
}

const findings = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lineOf = lineIndex(src);
  const chunks = [];
  if (file.endsWith('.svelte')) scanSvelte(src, lineOf, chunks);
  else scanCode(src, 0, false, lineOf, chunks);
  for (const { text, line } of chunks) {
    const hits = check(text);
    if (hits.length) findings.push(`${relative(root, file)}:${line}  [${hits.join(', ')}]  ${text.trim().slice(0, 160)}`);
  }
}

if (findings.length) {
  console.error(`check-ui-text: ${findings.length} user-facing string(s) contain internal references:\n`);
  for (const f of findings) console.error('  ' + f);
  console.error('\nRemove spec codes / § / docs/ references from screen text (comments are fine).');
  process.exit(1);
}
console.log(`check-ui-text: ok (${files.length} files)`);
