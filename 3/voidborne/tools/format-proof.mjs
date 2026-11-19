#!/usr/bin/env node
// Formats the sources with Prettier and PROVES that only formatting changed.
//
//   node tools/format-proof.mjs            format every source file in place (npm run format)
//   node tools/format-proof.mjs --check    only report files that are not formatted; exit 1 if any (npm run format:check)
//
// The proof, per file: the JavaScript is parsed with acorn before and after formatting, and the two syntax trees are
// compared with every position, comment and literal spelling removed ('a' vs "a", 1.50 vs 1.5 — the values must still
// match). Template literals (all GLSL lives in them) must stay byte-identical. A file whose tree changes is NOT
// written and the run fails. JSON files are compared with a deep equality of the parsed values.
// The same comparison is then run on every build STAGE (the modules of a stage joined exactly as build.mjs joins
// them), which also catches problems at module boundaries (for example a module ending in a // comment without a
// newline). A summary is written to tests/out/format-proof.json.
//
// Prettier and acorn are devDependencies (npm install). Formatting never changes the game's behaviour; the seed
// test digests (npm run test:seeds -- --compare old.json) are the runtime cross-check.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
let prettier, acorn;
try {
  prettier = await import('prettier');
  acorn = await import('acorn');
} catch (e) {
  console.error('Prettier/acorn are not installed. Run: npm install');
  process.exit(2);
}

// ---- which files ----
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (['node_modules', 'out', 'baseline', 'current', 'dist'].includes(n)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const files = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'tools')),
  ...walk(join(ROOT, 'tests')),
  join(ROOT, 'build.mjs'),
  join(ROOT, 'package.json'),
  join(ROOT, '.prettierrc.json'),
].filter((f) => ['.js', '.mjs', '.json'].includes(extname(f)));

// ---- syntax tree fingerprint ----
const DROP = new Set(['start', 'end', 'loc', 'range', 'raw']);
function astHash(code, file) {
  const sourceType = file.endsWith('.mjs') ? 'module' : 'script';
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType, allowHashBang: true });
  const json = JSON.stringify(ast, function (k, v) {
    if (DROP.has(k) && !(this && this.type === undefined && 'cooked' in this)) return undefined; // keep TemplateElement.value.raw
    if (v instanceof RegExp) return String(v);
    if (typeof v === 'bigint') return v.toString() + 'n';
    return v;
  });
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}
const jsonHash = (code) =>
  createHash('sha256')
    .update(JSON.stringify(JSON.parse(code)))
    .digest('hex')
    .slice(0, 16);
const fingerprint = (code, file) => (file.endsWith('.json') ? jsonHash(code) : astHash(code, file));

// ---- format ----
const config = (await prettier.resolveConfig(join(ROOT, 'build.mjs'))) || {};
const before = new Map(),
  after = new Map(),
  report = [];
let changed = 0,
  failed = 0,
  unformatted = 0;
for (const f of files) {
  const rel = relative(ROOT, f).split('\\').join('/');
  const src = readFileSync(f, 'utf8');
  before.set(rel, src);
  let out;
  try {
    out = await prettier.format(src, { ...config, filepath: f });
  } catch (e) {
    console.error(`prettier failed on ${rel}: ${e.message.split('\n')[0]}`);
    failed++;
    after.set(rel, src);
    continue;
  }
  const fa = fingerprint(src, f),
    fb = fingerprint(out, f);
  const same = fa === fb;
  const differs = out !== src;
  report.push({
    file: rel,
    bytesBefore: src.length,
    bytesAfter: out.length,
    formatted: !differs,
    treeBefore: fa,
    treeAfter: fb,
    identical: same,
  });
  if (!same) {
    console.error(`SYNTAX TREE CHANGED: ${rel} (${fa} -> ${fb}) — not written`);
    failed++;
    after.set(rel, src);
    continue;
  }
  if (differs) {
    if (check) {
      unformatted++;
      console.log(`not formatted: ${rel}`);
    } else {
      writeFileSync(f, out);
      changed++;
    }
  }
  after.set(rel, check ? src : out);
}

// ---- stage-level proof (modules joined exactly like build.mjs) ----
const manifest = JSON.parse(after.get('src/manifest.json'));
const stages = [...manifest.stages, ...(manifest.debugStages || [])];
const stageReport = [];
for (const st of stages) {
  const join2 = (m) => st.modules.map((x) => m.get('src/' + x) ?? '').join('');
  const a = astHash(join2(before), 'stage.js'),
    b = astHash(join2(after), 'stage.js');
  stageReport.push({ stage: st.name, before: a, after: b, identical: a === b });
  if (a !== b) {
    console.error(`STAGE SYNTAX TREE CHANGED: ${st.name}`);
    failed++;
  }
}
const total = (k) =>
  createHash('sha256')
    .update(stageReport.map((s) => s[k]).join('|'))
    .digest('hex')
    .slice(0, 16);
const summary = {
  date: new Date().toISOString(),
  prettier: prettier.version,
  mode: check ? 'check' : 'write',
  files: report.length,
  rewritten: changed,
  unformatted,
  failed,
  programBefore: total('before'),
  programAfter: total('after'),
  stages: stageReport,
  report,
};
mkdirSync(join(ROOT, 'tests', 'out'), { recursive: true });
writeFileSync(join(ROOT, 'tests', 'out', 'format-proof.json'), JSON.stringify(summary, null, 1));
const ok = report.filter((r) => r.identical).length;
console.log(
  `prettier ${prettier.version} · ${report.length} files · ${check ? `${unformatted} not formatted` : `${changed} rewritten`} · syntax trees identical: ${ok}/${report.length} files, ${stageReport.filter((s) => s.identical).length}/${stageReport.length} stages`,
);
console.log(
  `program fingerprint (all stages) before ${summary.programBefore} · after ${summary.programAfter} · details: tests/out/format-proof.json`,
);
process.exit(failed || unformatted ? 1 : 0);
