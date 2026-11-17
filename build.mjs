#!/usr/bin/env node
// VOIDBORNE build: assembles the single self-contained HTML file from the source modules in src/.
//
//   node build.mjs                 -> dist/voidborne.html
//   node build.mjs --check         -> also syntax-checks the joined JavaScript with `node --check`
//   node build.mjs --watch         -> rebuild whenever a file in src/ changes
//   node build.mjs --out file.html -> custom output path
//
// How the output is put together (see src/manifest.json):
//  * src/index.html is the page shell (HTML + CSS). The marker <!--@STAGES--> is replaced by the code.
//  * The code is grouped into STAGES. Each stage is the concatenation of its modules, in manifest order,
//    emitted as an inert <script type="text/x-vb"> block.
//  * src/loader.js runs the stages one after another as classic global scripts (so every top-level
//    name stays shared between modules), yielding to the browser between stages. That keeps the page
//    responsive and drives the loading bar. A stage is executed as a whole, so function declarations
//    are hoisted inside a stage but NOT across stages: top-level code may only call functions defined
//    in its own stage or an earlier one (calls made later at run time can go anywhere).
//  * Nothing is fetched at run time: the output is one HTML file with no external requests.
import { readFileSync, writeFileSync, mkdirSync, watch, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

export function build({ out, check = false, quiet = false } = {}) {
  const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
  const template = readFileSync(join(SRC, manifest.template), 'utf8');
  const loader = readFileSync(join(SRC, manifest.loader), 'utf8');
  if (!template.includes('<!--@STAGES-->')) throw new Error('index.html has no <!--@STAGES--> marker');
  const seen = new Set();
  const stages = manifest.stages.map((st) => {
    let code = '';
    for (const m of st.modules) {
      if (seen.has(m)) throw new Error(`module listed twice: ${m}`);
      seen.add(m);
      const f = join(SRC, m);
      if (!existsSync(f)) throw new Error(`missing module ${m} (stage ${st.name})`);
      code += readFileSync(f, 'utf8');
    }
    if (/<\/script/i.test(code)) throw new Error(`stage ${st.name} contains "</script" (would end the inline script early)`);
    if (!code.trimStart().startsWith("'use strict'")) code = "'use strict';\n" + code;
    return { ...st, code };
  });
  const blocks = stages.map((s) => `<script type="text/x-vb" data-name="${s.name}" data-w="${s.weight || 1}">\n${s.code}\n</script>\n`).join('');
  const html = template.replace('<!--@STAGES-->', blocks + `<script>\n${loader}</script>\n`);
  const target = resolve(ROOT, out || manifest.output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  if (check) {
    // one file with every stage: catches syntax errors and duplicate top-level declarations between modules
    const joined = stages.map((s, i) => (i ? s.code.replace("'use strict';\n", '') : s.code)).join('\n');
    const tmp = join(tmpdir(), `voidborne-check-${process.pid}.js`);
    writeFileSync(tmp, joined);
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    if (r.status !== 0) { process.stderr.write(r.stderr || r.stdout); throw new Error('syntax check failed'); }
  }
  if (/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')))
    console.warn('warning: the output contains an http(s) URL — the deliverable must not make network requests');
  if (!quiet) {
    console.log(`built ${target} · ${(html.length / 1024).toFixed(1)} KB · ${stages.length} stages · ${seen.size} modules${check ? ' · syntax OK' : ''}`);
    for (const s of stages) console.log(`  ${s.name.padEnd(13)} ${String(s.modules.length).padStart(2)} modules ${(s.code.length / 1024).toFixed(1).padStart(6)} KB`);
  }
  return html;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = opt('--out');
  const check = args.includes('--check');
  try { build({ out, check }); } catch (e) { console.error('build failed:', e.message); process.exit(1); }
  if (args.includes('--watch')) {
    console.log('watching src/ …');
    let timer = null;
    watch(SRC, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { build({ out, check, quiet: true }); console.log(new Date().toLocaleTimeString(), 'rebuilt'); } catch (e) { console.error(e.message); } }, 150);
    });
  }
}
