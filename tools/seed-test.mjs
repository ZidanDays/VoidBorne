#!/usr/bin/env node
// VOIDBORNE seed test: loads the built page for many seeds in a headless browser and checks each world.
//
//   npm install --save-dev playwright && npx playwright install chromium     (once)
//   node tools/seed-test.mjs                         20 seeds (1..20), dist/voidborne.html, chromium
//   node tools/seed-test.mjs --seeds 1337,7,42       explicit seeds
//   node tools/seed-test.mjs --count 50 --start 100  seeds 100..149
//   node tools/seed-test.mjs --swiftshader           software WebGL (CI machines without a GPU; slow but works)
//   node tools/seed-test.mjs --browser firefox       also: webkit (WebGL2 support varies)
//   node tools/seed-test.mjs --chrome /path/to/chrome --headed --json report.json --quality medium
//
// Per seed it checks:
//   errors   no page errors and no console errors while loading, rendering a few frames and running the checks
//   breach   wreck 0 has a hull breach, and flying in through it puts the player inside the hull
//   chain    the interior goal chain completes with real collision: power panel -> sealed door -> artifact
//            (the vault must refuse to open before power is restored)
//   overlap  no two planets (incl. atmosphere margin) overlap and no moon sits inside another planet
//   star     nothing spawns inside the star: planets, moons, wrecks, station, anomalies, landmarks, creature ranges
//   rings    (warning only) a planetary ring passes through another planet
// Exit code 1 if any seed fails. Rendering is paused (window.glLost) while the simulation-based checks run,
// so the result does not depend on the frame rate.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const file = resolve(ROOT, opt('--file', 'dist/voidborne.html'));
if (!existsSync(file)) { console.error(`not found: ${file} (run "node build.mjs" first)`); process.exit(2); }
const seeds = opt('--seeds') ? opt('--seeds').split(',').map((s) => parseInt(s, 10)).filter(Number.isFinite)
  : Array.from({ length: +opt('--count', 20) }, (_, i) => +opt('--start', 1) + i);
const browserName = opt('--browser', 'chromium');
const quality = opt('--quality', 'low');
const timeout = +opt('--timeout', 180000);

let pw;
try { pw = await import('playwright'); } catch (e) {
  console.error('Playwright is not installed. Run: npm install --save-dev playwright && npx playwright install chromium'); process.exit(2);
}
const launchArgs = ['--autoplay-policy=no-user-gesture-required'];
if (flag('--swiftshader')) launchArgs.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist');
const browser = await pw[browserName].launch({ headless: !flag('--headed'), args: browserName === 'chromium' ? launchArgs : [],
  ...(opt('--chrome') ? { executablePath: opt('--chrome') } : {}) });

// ---- in-page checks (run with page.evaluate; they use the game's own globals) ----
const WORLD_CHECK = () => {
  const out = { overlaps: [], rings: [], inStar: [], breach: false };
  const S = STAR.pos, SR = STAR.r, P = planets;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const d = len(sub(P[i].pos, P[j].pos)); if (d < (P[i].r + P[j].r) * 1.1) out.overlaps.push(`${P[i].name} / ${P[j].name} (${d.toFixed(0)} m apart)`); }
  for (const p of P) for (const m of p.moons) for (const q of P) if (q !== p && len(sub(m.pos, q.pos)) < q.r + m.r) out.overlaps.push(`moon ${m.name} inside ${q.name}`);
  for (const p of P) if (p.ring) for (const q of P) { if (q === p) continue; const lp = qrot(qconj(p.ring.q), sub(q.pos, p.pos)); const rad = Math.hypot(lp[0], lp[2]);
    if (Math.abs(lp[1]) < q.r && rad > p.ring.in - q.r && rad < p.ring.out + q.r) out.rings.push(`${p.name} ring / ${q.name}`); }
  const chk = (name, pos, r) => { const d = len(sub(pos, S)); if (d < SR * 1.05 + r) out.inStar.push(`${name} (${(d - SR - r).toFixed(0)} m)`); };
  for (const p of P) { chk(p.name, p.pos, p.r); for (const m of p.moons) chk(m.name, m.pos, m.r); }
  for (const w of wrecks) chk(w.name, w.pos, w.rad); chk(station.name, station.pos, station.rad);
  for (const s of secrets) if (!s.inside) chk(s.name, s.pos, s.rad || 20);
  for (const l of landmarks) chk(l.name, l.pos, l.kind === 'blackhole' ? l.Rs * 3 : 60);
  whales.forEach((w, i) => chk(`whale ${i} path`, w.c, w.r1 + w.scale));
  MINN.schools.forEach((s, i) => chk(`minnow school ${i}`, s.home, 150));
  medusae.list.forEach((m, i) => chk(`medusa ${i}`, m.p, m.s));
  if (BELT.R0 < SR * 1.5) out.inStar.push('asteroid belt inner edge');
  const br = W0.ship && W0.ship.breach; out.breach = !!(W0.big && br && br.du > 0 && br.dv > 0);
  return out;
};
const CHAIN = () => {
  const W = W0, legs = [];
  const step = (n) => { for (let i = 0; i < n; i++) { time += 1 / 60; updatePlayer(1 / 60); updateStructures(); interiorTick(1 / 60); } };
  const flyTo = (lp, sp = 6) => { for (let i = 0; i < 4000; i++) { const d = sub(lp, localPlayer()); if (len(d) < 1.0) { player.vel = [0, 0, 0]; return true; }
    player.vel = qrot(W.q, scl(norm(d), Math.min(sp, len(d) * 3))); time += 1 / 60; updatePlayer(1 / 60); updateStructures(); interiorTick(1 / 60); } return false; };
  const look = (lp) => { player.q = qlook(qrot(W.q, sub(lp, localPlayer())), qrot(W.q, [0, 1, 0])); pickInteract(); return INT.target; };
  const use = (lp, kind) => { const tg = look(lp); if (!tg || tg.kind !== kind) return false; interact(); step(90); return true; };
  const leg = (name, ok) => { legs.push([name, !!ok]); return !!ok; };
  const b = W.ship.breach, L = W.ship.L, a = b.u * TAU, x = (b.v - 0.5) * L, r = profR(W.ship, b.v);
  player.pos = add(W.pos, qrot(W.q, [x, (r + 14) * Math.cos(a), (r + 14) * Math.sin(a)])); player.vel = [0, 0, 0];
  leg('enter breach', flyTo([x, (r - 6) * Math.cos(a), (r - 6) * Math.sin(a)])); const inside = leg('inside hull', player.inside);
  leg('breach hold', flyTo([-13, -1, 0])); leg('to engineering door', flyTo([-3, -1, 0])); leg('open engineering door', use([2.3, -2.6, 0], 'door'));
  leg('engineering', flyTo([6, -1, 0])); leg('to corridor door', flyTo([15, -1, 0])); leg('open corridor door', use([19.3, -2.6, 0], 'door'));
  leg('corridor', flyTo([23, -1, 0])); leg('laboratory', flyTo([33, -1, 0]));
  use([37.3, -2.6, 0], 'door'); const locked = leg('vault refuses without power', DOORS.vault.target === 0 && !INT.sealedOpen);
  const ad = DISCOVERABLE.find((d) => d.ref === secrets[3]); const hidden = leg('artifact hidden before seal', ad.rad() < 0);
  leg('back to engineering', flyTo([23, -1, 0]) && flyTo([12, -1, -3.5])); leg('power panel', use([10, DECK + 2.3, -6.9], 'panel') && INT.power);
  leg('return to lab', flyTo([23, -1, 0]) && flyTo([34, -1, 0])); leg('release seal', use([37.3, -2.6, 0], 'door') && INT.sealedOpen);
  step(80); leg('vault', flyTo([44, -1, 0])); leg('artifact', flyTo([49, -1.4, 0])); updateDiscovery();
  const found = leg('artifact discovered', secrets[3].found && foundSet.has(ad.id));
  return { legs, inside, locked, hidden, found, ok: legs.every((l) => l[1]) };
};

const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); setTimeout(res, 60000); }), n);
const results = [];
console.log(`seed test · ${seeds.length} seeds · ${browserName}${flag('--swiftshader') ? ' (SwiftShader)' : ''} · quality ${quality} · ${file}`);
const HEADER = 'seed     load ms  errors breach  chain   overlap  star   rings  result';
console.log(HEADER);
for (const seed of seeds) {
  const r = { seed, loadMs: null, errors: [], breach: false, chain: null, world: null, pass: false };
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => r.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|GL Driver Message/.test(m.text())) r.errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  try {
    await page.goto(`${pathToFileURL(file).href}#seed=${seed}&q=${quality}`);
    await page.waitForFunction(() => window.__vbReady === true, null, { timeout });
    r.loadMs = await page.evaluate(() => window.__vbLoadMs);
    await page.evaluate(() => { CFG.INTRO = false; document.getElementById('begin').click(); });
    await frames(page, 3);                                    // a few real frames: render path, HUD, audio start
    r.world = await page.evaluate(WORLD_CHECK);
    await page.evaluate(() => { glLost = true; });            // pause rendering for the simulation checks
    r.chain = await page.evaluate(CHAIN);
    await page.evaluate(() => { glLost = false; });
    await frames(page, 2);
  } catch (e) { r.errors.push(`harness: ${e.message.split('\n')[0]}`); }
  await ctx.close();
  r.breach = !!(r.world && r.world.breach && r.chain && r.chain.inside);
  r.pass = !r.errors.length && r.breach && !!(r.chain && r.chain.ok) && !!r.world && !r.world.overlaps.length && !r.world.inStar.length;
  results.push(r);
  const w = r.world || { overlaps: ['?'], inStar: ['?'], rings: [] };
  console.log([String(seed).padEnd(8), String(r.loadMs ?? '-').padStart(7), String(r.errors.length).padStart(7),
    (r.breach ? 'ok' : 'FAIL').padEnd(7), (r.chain && r.chain.ok ? 'ok' : 'FAIL').padEnd(7), (w.overlaps.length ? 'FAIL' : 'ok').padEnd(8),
    (w.inStar.length ? 'FAIL' : 'ok').padEnd(6), (w.rings.length ? 'warn' : 'ok').padEnd(6), r.pass ? 'PASS' : 'FAIL'].join(' '));
  if (!r.pass) {
    for (const e of r.errors.slice(0, 5)) console.log(`         ${e}`);
    if (r.chain) for (const [n, ok] of r.chain.legs) if (!ok) console.log(`         chain step failed: ${n}`);
    for (const o of w.overlaps) console.log(`         overlap: ${o}`);
    for (const o of w.inStar) console.log(`         inside the star: ${o}`);
  }
}
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} seeds passed${failed.length ? ` · failed: ${failed.map((r) => r.seed).join(', ')}` : ''}`);
const warn = results.filter((r) => r.world && r.world.rings.length);
if (warn.length) console.log(`ring warnings (not a failure): ${warn.map((r) => `${r.seed}: ${r.world.rings.join('; ')}`).join(' | ')}`);
if (opt('--json')) writeFileSync(resolve(opt('--json')), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
