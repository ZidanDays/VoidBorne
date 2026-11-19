#!/usr/bin/env node
// VOIDBORNE benchmark runner: opens tests/bench.html in a real (headed) Chrome window with the frame-rate limit off,
// runs every preset and saves the JSON to tests/out/bench-<date>.json. Uses your GPU — this is the number that counts.
//
//   npm run build:debug
//   node tests/bench.mjs                              low, medium, high · 30 s each · seed 1337 · 1280x720
//   node tests/bench.mjs --presets high --seconds 60 --size 1920x1080   (--presets accepts any preset name, e.g. a later ultra)
//   node tests/bench.mjs --channel chrome             use your installed Google Chrome instead of Playwright's Chromium
//   node tests/bench.mjs --vsync                      keep vsync / the frame-rate limit (numbers capped at the refresh rate)
//   node tests/bench.mjs --headless --swiftshader     plumbing check only (software rendering: the numbers mean nothing)
//   other: --seed <n>  --warmup <s>  --chrome <path>  --out <file.json>
// Keep the window visible and the machine otherwise idle while it runs; plug a laptop in.
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { abs, cli, launch, loadPlaywright, writeFile } from './lib/harness.mjs';

const { opt, flag } = cli();
if (!existsSync(abs('dist/voidborne.debug.html'))) {
  console.error('not found: dist/voidborne.debug.html (run "npm run build:debug" first)');
  process.exit(2);
}
const presets = opt('--presets', 'low,medium,high');
const seconds = +opt('--seconds', 30);
const warmup = +opt('--warmup', 3);
const seed = +opt('--seed', 1337);
const size = opt('--size', '1280x720');
const [w, h] = size.split('x').map(Number);
const args = flag('--vsync') ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'];
const pw = await loadPlaywright();
const browser = await launch(pw, {
  headed: !flag('--headless'),
  swiftshader: flag('--swiftshader'),
  chrome: opt('--chrome'),
  channel: opt('--channel'),
  args,
});
const ctx = await browser.newContext({ viewport: { width: w + 80, height: h + 520 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const url = `${pathToFileURL(abs('tests/bench.html')).href}?auto=1&presets=${presets}&seconds=${seconds}&warmup=${warmup}&seed=${seed}&size=${size}`;
console.log(
  `benchmark · ${presets} · ${seconds} s each (+${warmup} s warm-up) · seed ${seed} · ${size}${args.length ? ' · frame-rate limit off' : ' · vsync on'}`,
);
await page.goto(url);
const n = presets.split(',').length;
await page.waitForFunction(() => window.__benchDone === true, null, { timeout: n * (seconds + warmup + 240) * 1000, polling: 1000 });
const suite = await page.evaluate(() => window.__benchResult);
await browser.close();
suite.runner = { args, headed: !flag('--headless'), swiftshader: flag('--swiftshader'), pageErrors: errors };
const out = abs(opt('--out', `tests/out/bench-${suite.date.replace(/[:.]/g, '-')}.json`));
writeFile(out, JSON.stringify(suite, null, 1));
console.log('preset   canvas      scale  frames  avg ms   p95    p99    max     fps    >33ms   CPU ms  GPU ms  calls');
for (const r of suite.results) {
  if (r.error) {
    console.log(`${r.quality.padEnd(8)} ERROR ${r.error}`);
    continue;
  }
  const f = r.frame;
  console.log(
    [
      r.quality.padEnd(8),
      r.canvas.join('x').padEnd(11),
      String(r.renderScale).padEnd(6),
      String(f.frames).padStart(6),
      String(f.avgMs).padStart(7),
      String(f.p95Ms).padStart(6),
      String(f.p99Ms).padStart(6),
      String(f.maxMs).padStart(7),
      String(f.fps).padStart(7),
      (f.over33Pct + '%').padStart(7),
      String(r.cpuMainThread.avgMs).padStart(7),
      String(r.gpu.avgMs ?? 'n/a').padStart(7),
      String(r.drawCalls.avg).padStart(6),
    ].join(' '),
  );
}
const first = suite.results.find((r) => r.renderer);
console.log(`renderer: ${first?.renderer || '?'} · GPU timer: ${first?.gpuTimer || '?'}`);
console.log(`saved ${out}`);
process.exit(suite.results.some((r) => r.error) ? 1 : 0);
