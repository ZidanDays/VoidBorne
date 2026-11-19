#!/usr/bin/env node
// VOIDBORNE screenshot test: renders the camera bookmarks in tests/bookmarks.json with the deterministic mode of the
// debug build and compares each image with a stored baseline. Writes an HTML report with baseline / current / diff.
//
//   npm run build:debug                         (once per code change: the test uses dist/voidborne.debug.html)
//   node tests/shots.mjs                        compare tests/current/ with tests/baseline/<renderer>/
//                                               (a missing baseline is created and reported as NEW, not as a pass)
//   node tests/shots.mjs --update               capture baselines: overwrite them with the current images
//                                               (npm run test:shots:baseline; see "Re-baselining" in the README)
//   node tests/shots.mjs --only star-corona-1337-high,belt-1337-high
//   node tests/shots.mjs --repeat 2             render every bookmark twice (two page loads) and require identical
//                                               images: proves that ?det=1 is deterministic on this machine
//   node tests/shots.mjs --gpu                  use the browser's normal renderer instead of SwiftShader (add --headed
//                                               for a real GPU). Baselines are kept per renderer, so the two never mix.
//   node tests/shots.mjs --cfg STAR_VARIETY:false   CFG overrides for every bookmark (?cfg=, Phase 6C): with this one the
//                                               old stars come back, so the 6B baselines must match exactly
//   other: --file <html>  --bookmarks <json>  --out <dir>  --chrome <path>  --channel chrome  --timeout <ms>
//
// Baselines live in tests/baseline/<renderer>/<name>.png, current images, diffs and report.html in tests/current/.
// Limits: a baseline is only comparable with images from the same renderer type, browser version and machine class.
// The default renderer is SwiftShader (software WebGL): slow, and the same pixels wherever the same Chromium build
// runs; a Playwright/Chromium upgrade can change them (re-baseline then). A real GPU needs its own baselines. These
// images check what the game draws; they say nothing about real performance (use the benchmark on real devices).
// A shot fails when more than tolerance.pixels (fraction) of its pixels differ by more than tolerance.channel (0-255) in
// any colour channel, or when the page reports an error or a WebGL error. Exit code 1 on any failure.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { abs, cli, esc, launch, loadPlaywright, rendererSlug, writeFile, IGNORED_CONSOLE, REPORT_CSS } from './lib/harness.mjs';

const { opt, flag } = cli();
const file = abs(opt('--file', 'dist/voidborne.debug.html'));
if (!existsSync(file)) {
  console.error(`not found: ${file} (run "npm run build:debug" first)`);
  process.exit(2);
}
const book = JSON.parse(readFileSync(abs(opt('--bookmarks', 'tests/bookmarks.json')), 'utf8'));
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const list = book.bookmarks.filter((b) => !only || only.has(b.name));
const outDir = abs(opt('--out', 'tests/current'));
const repeat = Math.max(1, +opt('--repeat', 1));
const timeout = +opt('--timeout', 240000);
const cfg = opt('--cfg', ''); // Phase 6C: CFG overrides for every bookmark (?cfg=, see core/det.js), e.g. --cfg STAR_VARIETY:false
const tol = { channel: 3, pixels: 0.002, ...(book.tolerance || {}) };
const [W, H] = book.size || [640, 360];
mkdirSync(outDir, { recursive: true });

const pw = await loadPlaywright();
const browser = await launch(pw, {
  headed: flag('--headed'),
  swiftshader: !flag('--gpu'),
  chrome: opt('--chrome'),
  channel: opt('--channel'),
});
const fromDataURL = (u) => Buffer.from(u.split(',')[1], 'base64');

// pixel comparison runs inside the browser (canvas), so no image library is needed
const COMPARE = async ({ a, b, ch }) => {
  const load = (src) =>
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('image decode failed'));
      i.src = src;
    });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
  const w = ia.width,
    h = ia.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(ia, 0, 0);
  const da = x.getImageData(0, 0, w, h).data;
  x.clearRect(0, 0, w, h);
  x.drawImage(ib, 0, 0);
  const db = x.getImageData(0, 0, w, h).data;
  const out = x.createImageData(w, h);
  let n = 0,
    maxd = 0,
    sum = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    sum += d;
    if (d > maxd) maxd = d;
    const g = ((db[i] + db[i + 1] + db[i + 2]) / 3) * 0.35;
    if (d > ch) {
      n++;
      out.data[i] = 255;
      out.data[i + 1] = 40;
      out.data[i + 2] = 40;
    } else out.data[i] = out.data[i + 1] = out.data[i + 2] = g;
    out.data[i + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  return { w, h, diffPixels: n, frac: n / (w * h), maxDiff: maxd, meanDiff: sum / (w * h), diff: c.toDataURL('image/png') };
};

async function render(b) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  const t0 = Date.now();
  let png = null,
    info = null;
  try {
    const c = [cfg, b.cfg].filter(Boolean).join(','); // --cfg plus the bookmark's own "cfg" (Phase 6C)
    await page.goto(
      `${pathToFileURL(file).href}?det=1&manual=1${c ? '&cfg=' + encodeURIComponent(c) : ''}#seed=${b.seed}&q=${b.quality || 'high'}`,
    );
    await page.waitForFunction(() => window.__vbReady === true && !!window.__VB, null, { timeout });
    const r = await page.evaluate(
      async ({ place, frames, time }) => {
        __VB.freeze();
        __VB.start();
        if (time !== undefined) __VB.setTime(time);
        __VB.place(place);
        __VB.step(1);
        const settled = await __VB.settle();
        if (frames > 2) __VB.step(frames - 2);
        const shot = __VB.screenshot(1);
        return { shot, settled, state: __VB.getState(), digest: __VB.digest(), glErrors: __VB.glErrors() };
      },
      { place: b.place, frames: b.frames || book.frames || 6, time: b.time },
    );
    if (r.shot.error) errors.push(`screenshot: ${r.shot.error}`);
    png = r.shot.png || null;
    info = { ...r.state, digest: r.digest, settled: r.settled };
    if (!r.settled) errors.push('streaming did not settle');
    if (r.state.errors) errors.push(`page error box: ${r.state.errors.slice(0, 200)}`);
    const glErr = [...(r.shot.glErrors || []), ...r.glErrors];
    if (glErr.length) errors.push(`WebGL errors: ${glErr.join(', ')}`);
  } catch (e) {
    errors.push(`harness: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
  return { png, info, errors, ms: Date.now() - t0 };
}

const cmpPage = await (await browser.newContext()).newPage();
const results = [];
let slug = null;
console.log(
  `screenshot test · ${list.length} bookmarks · ${W}x${H} · ${flag('--gpu') ? 'default renderer' : 'SwiftShader'} · ${file}${cfg ? ' · cfg ' + cfg : ''}`,
);
for (const b of list) {
  const r = {
    name: b.name,
    seed: b.seed,
    quality: b.quality,
    status: 'fail',
    errors: [],
    frac: null,
    maxDiff: null,
    ms: 0,
    repeatOk: null,
  };
  const first = await render(b);
  r.errors.push(...first.errors);
  r.ms = first.ms;
  r.info = first.info;
  if (first.png) {
    slug = slug || rendererSlug(first.info.renderer);
    const cur = join(outDir, `${b.name}.png`);
    writeFile(cur, fromDataURL(first.png));
    for (let k = 1; k < repeat; k++) {
      const again = await render(b);
      r.errors.push(...again.errors);
      if (again.png) {
        const c = await cmpPage.evaluate(COMPARE, { a: first.png, b: again.png, ch: 0 });
        r.repeatOk = !c.sizeMismatch && c.diffPixels === 0;
        if (!r.repeatOk) {
          r.errors.push(`not deterministic: run ${k + 1} differs in ${c.diffPixels} pixels (max ${c.maxDiff})`);
          writeFile(join(outDir, `${b.name}.repeat${k + 1}.png`), fromDataURL(again.png));
        }
      }
    }
    const basePath = abs(join('tests', 'baseline', slug, `${b.name}.png`));
    r.baseline = basePath;
    if (flag('--update') || !existsSync(basePath)) {
      const existed = existsSync(basePath);
      writeFile(basePath, fromDataURL(first.png));
      r.status = existed ? 'updated' : 'new';
    } else {
      const base = 'data:image/png;base64,' + readFileSync(basePath).toString('base64');
      const c = await cmpPage.evaluate(COMPARE, { a: base, b: first.png, ch: tol.channel });
      if (c.sizeMismatch) r.errors.push(`size differs from baseline: ${c.sizeMismatch}`);
      else {
        r.frac = c.frac;
        r.maxDiff = c.maxDiff;
        r.meanDiff = c.meanDiff;
        writeFile(join(outDir, `${b.name}.diff.png`), fromDataURL(c.diff));
        r.status = c.frac <= tol.pixels ? 'pass' : 'fail';
      }
    }
  }
  if (r.errors.length) r.status = 'fail';
  results.push(r);
  const pct = r.frac === null ? '-' : (r.frac * 100).toFixed(3) + '%';
  console.log(
    `${r.name.padEnd(26)} ${r.status.toUpperCase().padEnd(8)} diff ${pct.padStart(8)} max ${String(r.maxDiff ?? '-').padStart(3)}${r.repeatOk === null ? '' : r.repeatOk ? ' · repeat identical' : ' · REPEAT DIFFERS'} · ${(r.ms / 1000).toFixed(1)} s`,
  );
  for (const e of r.errors.slice(0, 4)) console.log(`    ${e}`);
}
await browser.close();

// ---- HTML report ----
const rel = (p) => relative(outDir, p).split('\\').join('/');
const rows = results
  .map((r) => {
    const cur = existsSync(join(outDir, `${r.name}.png`)) ? `<img src="${esc(r.name)}.png">` : '';
    const base = r.baseline && existsSync(r.baseline) ? `<img src="${esc(rel(r.baseline))}">` : '';
    const diff = existsSync(join(outDir, `${r.name}.diff.png`)) && r.frac !== null ? `<img src="${esc(r.name)}.diff.png">` : '';
    const cls = { pass: 'ok', new: 'new', updated: 'new', fail: 'fail' }[r.status];
    return `<h2 class="${cls}">${esc(r.name)} — ${r.status.toUpperCase()}</h2>
<div class="meta">seed ${r.seed} · ${esc(r.quality)} · ${r.frac === null ? '' : `${(r.frac * 100).toFixed(3)}% pixels differ (tolerance ${(tol.pixels * 100).toFixed(2)}% at >${tol.channel}/255) · max channel diff ${r.maxDiff} · `}${r.repeatOk === null ? '' : r.repeatOk ? 'repeat render identical · ' : '<span class="fail">repeat render differs</span> · '}${(r.ms / 1000).toFixed(1)} s${r.info ? ` · digest ${esc(r.info.digest)} · scale ${r.info.renderScale}` : ''}</div>
${r.errors.map((e) => `<div class="fail small">${esc(e)}</div>`).join('')}
<table><tr><th>baseline</th><th>current</th><th>diff (red = differs)</th></tr><tr><td>${base}</td><td>${cur}</td><td>${diff}</td></tr></table>`;
  })
  .join('\n');
const failed = results.filter((r) => r.status === 'fail');
const html = `<!doctype html><meta charset="utf-8"><title>VOIDBORNE screenshots</title><style>${REPORT_CSS}td{width:33%}</style>
<h1>VOIDBORNE screenshot test — ${results.length - failed.length}/${results.length} ok</h1>
<div class="meta">${esc(new Date().toISOString())} · renderer ${esc(slug || '?')} · ${W}x${H} · ${esc(file)}</div>
${rows}`;
const reportPath = writeFile(join(outDir, 'report.html'), html);
const fresh = results.filter((r) => r.status === 'new').length;
console.log(
  `${results.length - failed.length}/${results.length} ok${fresh ? ` (${fresh} NEW: baseline created, nothing compared)` : ''} · baselines: tests/baseline/${slug || '?'}/ · report: ${reportPath}`,
);
process.exit(failed.length ? 1 : 0);
