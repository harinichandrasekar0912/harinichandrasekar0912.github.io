// tools/minify.mjs: writes a smaller copy of every script in scripts/ (and scripts/play/) to scripts/min/, which is what index.html loads.
//
//   node tools/minify.mjs           rebuild scripts/min/ (run it from anywhere after editing anything in scripts/, and commit both)
//   node tools/minify.mjs --check   exit 1 if any copy in scripts/min/ is missing or older than its source (nothing is written)
//
// It only removes comments, indentation and blank lines. Strings, template literals and regular expressions are copied as they are, and
// every line break is kept (a comment that spans lines becomes a line break), so automatic semicolon insertion works exactly as before.
// The readable files in scripts/ stay the source: never edit scripts/min/ by hand. No dependencies, no build step: GitHub Pages serves
// the committed files. Each copy starts with the source's hash, which is how --check knows it is up to date.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const OUT = path.join(ROOT, 'min');
const KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

export function minify(src) {
  const out = []; let i = 0; const n = src.length;
  let last = ''; // the last significant character written (decides whether a '/' starts a regular expression or is a division)
  let lastWord = '';
  const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);
  const fail = (msg) => { const line = src.slice(0, i).split('\n').length; throw new Error(msg + ' at line ' + line); };
  // template literal: copied verbatim, including ${ ... } expressions (which may hold strings, nested templates and braces)
  function template(j) {
    j++; // past the opening backtick
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') return j + 1;
      if (c === '$' && src[j + 1] === '{') { j = expression(j + 2); continue; }
      j++;
    }
    fail('unterminated template');
  }
  function quoted(j) { const q = src[j]; j++; while (j < n && src[j] !== q) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '\n') fail('newline in string'); j++; } return j + 1; }
  function expression(j) { // inside ${ }: skip to the matching }
    let depth = 0;
    while (j < n) {
      const c = src[j];
      if (c === '"' || c === "'") { j = quoted(j); continue; }
      if (c === '`') { j = template(j); continue; }
      if (c === '{') depth++;
      if (c === '}') { if (depth === 0) return j + 1; depth--; }
      j++;
    }
    fail('unterminated ${');
  }
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { const j = quoted(i); out.push(src.slice(i, j)); last = c; lastWord = ''; i = j; continue; }
    if (c === '`') { const j = template(i); out.push(src.slice(i, j)); last = c; lastWord = ''; i = j; continue; }
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2); if (j < 0) fail('unterminated comment');
      out.push(src.slice(i, j).includes('\n') ? '\n' : ' '); i = j + 2; continue;
    }
    if (c === '/') {
      const regex = last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last) || (isIdent(last) && KEYWORDS.has(lastWord));
      if (regex) {
        let j = i + 1, cls = false;
        while (true) {
          const ch = src[j];
          if (j >= n || ch === '\n') fail('unterminated regular expression');
          if (ch === '\\') { j += 2; continue; }
          if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break;
          j++;
        }
        j++; while (j < n && /[a-z]/i.test(src[j])) j++;
        out.push(src.slice(i, j)); last = ')'; lastWord = ''; i = j; continue; // a regex literal behaves like a value: a following '/' divides
      }
    }
    out.push(c);
    if (isIdent(c)) { lastWord = i > 0 && isIdent(src[i - 1]) && isIdent(last) ? lastWord + c : c; last = c; }
    else if (!/\s/.test(c)) { last = c; lastWord = ''; }
    i++;
  }
  return out.join('').split('\n').map((l) => l.trim()).filter(Boolean).join('\n') + '\n';
}

const hash = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const header = (rel, h) => `/* scripts/${rel} (source ${h}), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */\n`;

function sources() {
  const list = [];
  for (const dir of ['', 'play']) for (const f of fs.readdirSync(path.join(ROOT, dir)).sort()) if (f.endsWith('.js')) list.push(path.posix.join(dir, f));
  return list;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check'); let stale = 0;
  for (const rel of sources()) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'), h = hash(src), dst = path.join(OUT, rel); // line endings do not count (a checkout may use CRLF)
    if (check) {
      const ok = fs.existsSync(dst) && fs.readFileSync(dst, 'utf8').split(/\r?\n/)[0] === header(rel, h).trimEnd();
      if (!ok) { stale++; console.log('stale: scripts/min/' + rel); }
      continue;
    }
    const min = header(rel, h) + minify(src);
    new vm.Script(min, { filename: rel }); // throws if the smaller copy is not valid JavaScript
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, min);
    console.log(rel.padEnd(30) + String(src.length).padStart(9) + ' -> ' + String(min.length).padStart(8) + ' bytes');
  }
  if (check) { console.log(stale ? stale + ' stale: run node tools/minify.mjs' : 'scripts/min/ is up to date'); process.exit(stale ? 1 : 0); }
}
