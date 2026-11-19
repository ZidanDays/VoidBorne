#!/usr/bin/env node
// VOIDBORNE seed test: loads the built page for many seeds in a headless browser and checks each world.
//
//   npm install && npx playwright install chromium        (once)
//   node tools/seed-test.mjs                         the 20 default seeds (incl. 1, 77, 9999), dist/voidborne.html
//   node tools/seed-test.mjs --seeds 1337,7,42       explicit seeds
//   node tools/seed-test.mjs --count 50 --start 100  seeds 100..149
//   node tools/seed-test.mjs --swiftshader           software WebGL (CI machines without a GPU; slow but works)
//   node tools/seed-test.mjs --browser firefox       also: webkit (WebGL2 support varies)
//   node tools/seed-test.mjs --chrome /path/to/chrome --headed --quality medium
//   node tools/seed-test.mjs --json out.json         machine-readable results (also holds the digests)
//   node tools/seed-test.mjs --compare out.json      FAIL any seed whose world/sector digest differs from that report
//   node tools/seed-test.mjs --html report.html      HTML report (default tests/out/seed-report.html; --no-html to skip)
//   node tools/seed-test.mjs --retries 0             do not re-run a seed whose browser tab crashed (default: 1 retry,
//                                                    reported as "retried" — software rendering can run out of memory)
//
// Per seed it checks:
//   errors   no page errors and no console errors while loading, rendering a few frames and running the checks
//   breach   wreck 0 has a hull breach, and flying in through it puts the player inside the hull
//   chain    the interior goal chain completes with real collision: power panel -> sealed door -> artifact
//            (the vault must refuse to open before power is restored)
//   overlap  no two planets (incl. atmosphere margin) overlap and no moon sits inside another planet
//   star     nothing spawns inside the star: planets, moons, wrecks, station, anomalies, landmarks, creature ranges
//   rings    (warning only) a planetary ring passes through another planet
//   worker   the sector worker started (GEN.mode is 'worker'), and for every existing neighbour sector of the home
//            system the worker output is bit-identical to the main-thread fallback output
//   sectors  neighbour sectors: no NaN, caps (planets <= 5, moons <= 2 per planet, wrecks <= 2), no planet overlap,
//            nothing inside the sector star or inside a planet (moon orbits crossing a planet: warning only)
//   digest   hash of the home world and of the neighbour sectors (numbers rounded to 3 decimals). Informational,
//            unless --compare is given. Use it to prove that a refactor (e.g. formatting) changed nothing.
// Exit code 1 if any seed fails. Rendering is paused (window.glLost) while the simulation-based checks run,
// so the result does not depend on the frame rate.
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { abs, cli, esc, launch, loadPlaywright, writeFile, IGNORED_CONSOLE, REPORT_CSS } from '../tests/lib/harness.mjs';

const { opt, flag } = cli();
const DEFAULT_SEEDS = [1, 2, 3, 5, 7, 11, 13, 42, 77, 100, 256, 512, 1000, 1337, 2024, 3141, 4096, 7777, 9001, 9999];
const file = abs(opt('--file', 'dist/voidborne.html'));
if (!existsSync(file)) {
  console.error(`not found: ${file} (run "npm run build" first)`);
  process.exit(2);
}
const seeds = opt('--seeds')
  ? opt('--seeds')
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter(Number.isFinite)
  : opt('--count') || opt('--start')
    ? Array.from({ length: +opt('--count', 20) }, (_, i) => +opt('--start', 1) + i)
    : DEFAULT_SEEDS;
const browserName = opt('--browser', 'chromium');
const quality = opt('--quality', 'low');
const timeout = +opt('--timeout', 180000);
const compare = opt('--compare') ? JSON.parse(readFileSync(abs(opt('--compare')), 'utf8')) : null;
const htmlOut = flag('--no-html') ? null : abs(opt('--html', 'tests/out/seed-report.html'));
const retries = Math.max(0, +opt('--retries', 1));

const pw = await loadPlaywright();
const browser = await launch(pw, {
  browser: browserName,
  headed: flag('--headed'),
  swiftshader: flag('--swiftshader'),
  chrome: opt('--chrome'),
});

// ---- in-page checks (run with page.evaluate; they use the game's own globals) ----
const WORLD_CHECK = () => {
  const out = { overlaps: [], rings: [], inStar: [], breach: false };
  const S = STAR.pos,
    SR = STAR.r,
    P = planets;
  for (let i = 0; i < P.length; i++)
    for (let j = i + 1; j < P.length; j++) {
      const d = len(sub(P[i].pos, P[j].pos));
      if (d < (P[i].r + P[j].r) * 1.1) out.overlaps.push(`${P[i].name} / ${P[j].name} (${d.toFixed(0)} m apart)`);
    }
  for (const p of P)
    for (const m of p.moons)
      for (const q of P) if (q !== p && len(sub(m.pos, q.pos)) < q.r + m.r) out.overlaps.push(`moon ${m.name} inside ${q.name}`);
  for (const p of P)
    if (p.ring)
      for (const q of P) {
        if (q === p) continue;
        const lp = qrot(qconj(p.ring.q), sub(q.pos, p.pos));
        const rad = Math.hypot(lp[0], lp[2]);
        if (Math.abs(lp[1]) < q.r && rad > p.ring.in - q.r && rad < p.ring.out + q.r) out.rings.push(`${p.name} ring / ${q.name}`);
      }
  const chk = (name, pos, r) => {
    const d = len(sub(pos, S));
    if (d < SR * 1.05 + r) out.inStar.push(`${name} (${(d - SR - r).toFixed(0)} m)`);
  };
  for (const p of P) {
    chk(p.name, p.pos, p.r);
    for (const m of p.moons) chk(m.name, m.pos, m.r);
  }
  for (const w of wrecks) chk(w.name, w.pos, w.rad);
  chk(station.name, station.pos, station.rad);
  for (const s of secrets) if (!s.inside) chk(s.name, s.pos, s.rad || 20);
  for (const l of landmarks) chk(l.name, l.pos, l.kind === 'blackhole' ? l.Rs * 3 : 60);
  whales.forEach((w, i) => chk(`whale ${i} path`, w.c, w.r1 + w.scale));
  MINN.schools.forEach((s, i) => chk(`minnow school ${i}`, s.home, 150));
  medusae.list.forEach((m, i) => chk(`medusa ${i}`, m.p, m.s));
  if (BELT.R0 < SR * 1.5) out.inStar.push('asteroid belt inner edge');
  const br = W0.ship && W0.ship.breach;
  out.breach = !!(W0.big && br && br.du > 0 && br.dv > 0);
  return out;
};

// Hashes and checks the home world and the existing neighbour sectors. Generates every neighbour sector twice:
// in a fresh worker built from workerSource() and with the main-thread fallback (genMain), and compares them bit for bit.
const SECTOR_CHECK = async () => {
  const fnv = (h, s) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const hex = (h) => (h >>> 0).toString(16).padStart(8, '0');
  // exact: every number at full precision, typed arrays by their bytes
  const exact = (o) => {
    let h = 2166136261;
    const walk = (v) => {
      if (ArrayBuffer.isView(v)) {
        const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
        for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619);
        h = fnv(h, '|' + v.length);
      } else if (Array.isArray(v)) {
        h = fnv(h, '[');
        v.forEach(walk);
        h = fnv(h, ']');
      } else if (v && typeof v === 'object') {
        for (const k of Object.keys(v).sort()) {
          h = fnv(h, k + ':');
          walk(v[k]);
        }
      } else h = fnv(h, String(v) + ',');
    };
    walk(o);
    return hex(h);
  };
  // rounded: numbers to 3 decimals (stable across JS engines that differ in the last bits of Math.sin etc.)
  const rounded = (o) => {
    let h = 2166136261;
    const num = (x) => (Number.isFinite(x) ? String(Math.round(x * 1000) / 1000) : String(x));
    const walk = (v) => {
      if (ArrayBuffer.isView(v)) {
        h = fnv(h, '<' + v.length + '>');
        for (let i = 0; i < v.length; i++) h = fnv(h, num(v[i]) + ',');
      } else if (Array.isArray(v)) {
        h = fnv(h, '[');
        v.forEach(walk);
        h = fnv(h, ']');
      } else if (v && typeof v === 'object') {
        for (const k of Object.keys(v).sort()) {
          h = fnv(h, k + ':');
          walk(v[k]);
        }
      } else h = fnv(h, (typeof v === 'number' ? num(v) : String(v)) + ',');
    };
    walk(o);
    return hex(h);
  };
  const out = {
    mode: GEN.mode,
    workerExpected: !!(CFG.USE_WORKER && typeof Worker !== 'undefined'),
    sectors: 0,
    mismatch: [],
    fails: [],
    warns: [],
    world: '',
    sector: '',
    workerError: null,
  };
  // home world: only fields fixed at generation time (moving things are described by their path/centre)
  const home = {
    star: [STAR.pos, STAR.r, STAR.name],
    planets: planets.map((p) => ({
      t: p.type,
      pos: p.pos,
      r: p.r,
      name: p.name,
      seed: p.seed,
      pal: p.pal,
      ring: p.ring && [p.ring.in, p.ring.out, p.ring.q],
      moons: p.moons.map((m) => [m.r, m.dist, m.ang, m.name, m.seed]),
    })),
    wrecks: wrecks.map((w) => [w.name, w.pos, w.rad, !!w.big]),
    station: [station.pos, station.rad, station.name],
    secrets: secrets.map((s) => [s.name, s.inside ? 'inside' : s.pos]), // secrets inside a wreck turn with it
    landmarks: landmarks.map((l) => [l.kind, l.name, l.pos]),
    belt: [BELT.R0, BELT.R1, BELT.q, BELT.ySpread],
    whales: whales.map((w) => [w.c, w.r1, w.r2, w.scale]),
    schools: MINN.schools.map((s) => [s.home, s.c, s.beh]),
    medusae: medusae.list.map((m) => [m.home, m.s, m.c]),
  };
  out.world = rounded(home);
  const metas = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const m = sectorMeta(x, y, z);
        if (m.exists) metas.push(m);
      }
  out.sectors = metas.length;
  const mains = metas.map((m) => genMain(m));
  let workerOuts = null;
  try {
    const w = new Worker(URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' })));
    workerOuts = await new Promise((res, rej) => {
      const got = new Map();
      const t = setTimeout(() => rej(new Error('worker timeout')), 120000);
      w.onmessage = (e) => {
        const d = e.data;
        if (d.error) {
          clearTimeout(t);
          rej(new Error(d.error.split('\n')[0]));
          return;
        }
        got.set(d.id, d.out);
        if (got.size === metas.length) {
          clearTimeout(t);
          res(metas.map((m) => got.get(m.key)));
        }
      };
      w.onerror = (e) => {
        clearTimeout(t);
        rej(new Error(e.message || 'worker error'));
      };
      for (const m of metas) w.postMessage({ id: m.key, meta: { key: m.key, star: m.star, seed: m.seed }, ao: CFG.BAKE_AO });
      if (!metas.length) res([]);
    });
    w.terminate();
  } catch (e) {
    out.workerError = String(e.message || e);
  }
  if (workerOuts) metas.forEach((m, i) => exact(mains[i]) !== exact(workerOuts[i]) && out.mismatch.push(m.key));
  out.sector = rounded(mains);
  // sanity checks per sector
  const bad = (v) => {
    if (typeof v === 'number') return !Number.isFinite(v);
    if (ArrayBuffer.isView(v)) {
      for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return true;
      return false;
    }
    if (Array.isArray(v)) return v.some(bad);
    if (v && typeof v === 'object') return Object.keys(v).some((k) => bad(v[k]));
    return false;
  };
  metas.forEach((m, i) => {
    const o = mains[i],
      C = m.star,
      SR = m.r,
      tag = `sector ${m.key}`;
    if (bad(o)) out.fails.push(`${tag}: NaN/Infinity in generated data`);
    if (o.planets.length > 5) out.fails.push(`${tag}: ${o.planets.length} planets (cap 5)`);
    if (o.wrecks.length > 2) out.fails.push(`${tag}: ${o.wrecks.length} wrecks (cap 2)`);
    const P = o.planets;
    for (const p of P) if (p.moons.length > 2) out.fails.push(`${tag}: ${p.name} has ${p.moons.length} moons (cap 2)`);
    for (let a = 0; a < P.length; a++)
      for (let b = a + 1; b < P.length; b++) {
        const d = len(sub(P[a].pos, P[b].pos));
        if (d < (P[a].r + P[b].r) * 1.1) out.fails.push(`${tag}: planets ${P[a].name} / ${P[b].name} overlap (${d.toFixed(0)} m apart)`);
      }
    const inStar = (name, pos, r) => {
      const d = len(sub(pos, C));
      if (d < SR * 1.05 + r) out.fails.push(`${tag}: ${name} inside the star (${(d - SR - r).toFixed(0)} m)`);
    };
    const inPlanet = (name, pos, r) => {
      for (const p of P) if (len(sub(pos, p.pos)) < p.r * 1.05 + r) out.fails.push(`${tag}: ${name} inside planet ${p.name}`);
    };
    for (const p of P) {
      inStar(p.name, p.pos, p.r);
      for (const mo of p.moons) {
        if (len(sub(p.pos, C)) - mo.dist - mo.r < SR * 1.05) out.warns.push(`${tag}: orbit of moon ${mo.name} reaches the star`);
        for (const q of P)
          if (q !== p && len(sub(p.pos, q.pos)) < mo.dist + mo.r + q.r)
            out.warns.push(`${tag}: orbit of moon ${mo.name} crosses ${q.name}`);
      }
      if (p.ring)
        for (const q of P) {
          if (q === p) continue;
          const lp = qrot(qconj(p.ring.q), sub(q.pos, p.pos));
          const rad = Math.hypot(lp[0], lp[2]);
          if (Math.abs(lp[1]) < q.r && rad > p.ring.in - q.r && rad < p.ring.out + q.r)
            out.warns.push(`${tag}: ${p.name} ring / ${q.name}`);
        }
    }
    for (const w of o.wrecks) {
      inStar(`wreck ${w.name}`, w.pos, w.rad);
      inPlanet(`wreck ${w.name}`, w.pos, w.rad);
    }
    if (o.beacon) {
      inStar('beacon', o.beacon.pos, 10);
      inPlanet('beacon', o.beacon.pos, 10);
    }
    if (o.med) {
      inStar('medusa swarm', o.med.c, 150);
      inPlanet('medusa swarm', o.med.c, 150);
    }
  });
  return out;
};

const CHAIN = () => {
  const W = W0,
    legs = [];
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      time += 1 / 60;
      updatePlayer(1 / 60);
      updateStructures();
      interiorTick(1 / 60);
    }
  };
  const flyTo = (lp, sp = 6) => {
    for (let i = 0; i < 4000; i++) {
      const d = sub(lp, localPlayer());
      if (len(d) < 1.0) {
        player.vel = [0, 0, 0];
        return true;
      }
      player.vel = qrot(W.q, scl(norm(d), Math.min(sp, len(d) * 3)));
      time += 1 / 60;
      updatePlayer(1 / 60);
      updateStructures();
      interiorTick(1 / 60);
    }
    return false;
  };
  const look = (lp) => {
    player.q = qlook(qrot(W.q, sub(lp, localPlayer())), qrot(W.q, [0, 1, 0]));
    pickInteract();
    return INT.target;
  };
  const use = (lp, kind) => {
    const tg = look(lp);
    if (!tg || tg.kind !== kind) return false;
    interact();
    step(90);
    return true;
  };
  const leg = (name, ok) => {
    legs.push([name, !!ok]);
    return !!ok;
  };
  const b = W.ship.breach,
    L = W.ship.L,
    a = b.u * TAU,
    x = (b.v - 0.5) * L,
    r = profR(W.ship, b.v);
  player.pos = add(W.pos, qrot(W.q, [x, (r + 14) * Math.cos(a), (r + 14) * Math.sin(a)]));
  player.vel = [0, 0, 0];
  leg('enter breach', flyTo([x, (r - 6) * Math.cos(a), (r - 6) * Math.sin(a)]));
  const inside = leg('inside hull', player.inside);
  leg('breach hold', flyTo([-13, -1, 0]));
  leg('to engineering door', flyTo([-3, -1, 0]));
  leg('open engineering door', use([2.3, -2.6, 0], 'door'));
  leg('engineering', flyTo([6, -1, 0]));
  leg('to corridor door', flyTo([15, -1, 0]));
  leg('open corridor door', use([19.3, -2.6, 0], 'door'));
  leg('corridor', flyTo([23, -1, 0]));
  leg('laboratory', flyTo([33, -1, 0]));
  use([37.3, -2.6, 0], 'door');
  const locked = leg('vault refuses without power', DOORS.vault.target === 0 && !INT.sealedOpen);
  const ad = DISCOVERABLE.find((d) => d.ref === secrets[3]);
  const hidden = leg('artifact hidden before seal', ad.rad() < 0);
  leg('back to engineering', flyTo([23, -1, 0]) && flyTo([12, -1, -3.5]));
  leg('power panel', use([10, DECK + 2.3, -6.9], 'panel') && INT.power);
  leg('return to lab', flyTo([23, -1, 0]) && flyTo([34, -1, 0]));
  leg('release seal', use([37.3, -2.6, 0], 'door') && INT.sealedOpen);
  step(80);
  leg('vault', flyTo([44, -1, 0]));
  leg('artifact', flyTo([49, -1.4, 0]));
  updateDiscovery();
  const found = leg('artifact discovered', secrets[3].found && foundSet.has(ad.id));
  return { legs, inside, locked, hidden, found, ok: legs.every((l) => l[1]) };
};

const frames = (page, n) =>
  page.evaluate(
    (k) =>
      new Promise((res) => {
        let i = 0;
        const f = () => (++i >= k ? res() : requestAnimationFrame(f));
        requestAnimationFrame(f);
        setTimeout(res, 60000);
      }),
    n,
  );
const results = [];
const t0 = Date.now();
console.log(
  `seed test · ${seeds.length} seeds · ${browserName}${flag('--swiftshader') ? ' (SwiftShader)' : ''} · quality ${quality} · ${file}`,
);
console.log('seed     load ms  errors breach  chain   overlap  star   rings  worker sectors digest             result');
async function runSeed(seed) {
  const r = {
    seed,
    loadMs: null,
    errors: [],
    breach: false,
    chain: null,
    world: null,
    sect: null,
    digest: null,
    digestMatch: null,
    pass: false,
  };
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => r.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.test(m.text())) r.errors.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch (e) {}
  });
  try {
    await page.goto(`${pathToFileURL(file).href}#seed=${seed}&q=${quality}`);
    await page.waitForFunction(() => window.__vbReady === true, null, { timeout });
    r.loadMs = await page.evaluate(() => window.__vbLoadMs);
    await page.evaluate(() => {
      CFG.INTRO = false;
      document.getElementById('begin').click();
    });
    await frames(page, 3); // a few real frames: render path, HUD, audio start
    r.world = await page.evaluate(WORLD_CHECK);
    await page.evaluate(() => {
      glLost = true;
    }); // pause rendering for the simulation checks
    r.sect = await page.evaluate(SECTOR_CHECK);
    r.chain = await page.evaluate(CHAIN);
    await page.evaluate(() => {
      glLost = false;
    });
    await frames(page, 2);
  } catch (e) {
    r.errors.push(`harness: ${e.message.split('\n')[0]}`);
  }
  await ctx.close().catch(() => {});
  return r;
}
for (const seed of seeds) {
  let r = await runSeed(seed);
  let crashes = 0;
  while (r.errors.some((e) => /Target crashed|has been closed/.test(e)) && crashes < retries) {
    crashes++;
    console.log(`${String(seed).padEnd(8)} browser tab crashed (${r.errors[0]}); retrying`);
    r = await runSeed(seed);
  }
  r.retried = crashes;
  const s = r.sect;
  r.digest = s ? `${s.world}-${s.sector}` : null;
  if (compare) {
    const prev = compare.find((p) => p.seed === seed);
    r.digestMatch = prev ? prev.digest === r.digest : null;
  }
  r.workerOk = !!(s && !s.workerError && !s.mismatch.length && (!s.workerExpected || s.mode === 'worker'));
  r.sectorsOk = !!(s && !s.fails.length);
  r.breach = !!(r.world && r.world.breach && r.chain && r.chain.inside);
  r.pass =
    !r.errors.length &&
    r.breach &&
    !!(r.chain && r.chain.ok) &&
    !!r.world &&
    !r.world.overlaps.length &&
    !r.world.inStar.length &&
    r.workerOk &&
    r.sectorsOk &&
    r.digestMatch !== false;
  results.push(r);
  const w = r.world || { overlaps: ['?'], inStar: ['?'], rings: [] };
  console.log(
    [
      String(seed).padEnd(8),
      String(r.loadMs ?? '-').padStart(7),
      String(r.errors.length).padStart(7),
      (r.breach ? 'ok' : 'FAIL').padEnd(7),
      (r.chain && r.chain.ok ? 'ok' : 'FAIL').padEnd(7),
      (w.overlaps.length ? 'FAIL' : 'ok').padEnd(8),
      (w.inStar.length ? 'FAIL' : 'ok').padEnd(6),
      (w.rings.length ? 'warn' : 'ok').padEnd(6),
      (r.workerOk ? 'ok' : 'FAIL').padEnd(6),
      ((r.sectorsOk ? 'ok' : 'FAIL') + (s ? ` ${s.sectors}` : '') + (s && s.warns.length ? ' w' : '')).padEnd(7),
      ((r.digest || '-') + (r.digestMatch === false ? '≠' : r.digestMatch ? '=' : ' ')).padEnd(18),
      r.pass ? 'PASS' : 'FAIL',
    ].join(' '),
  );
  if (!r.pass) {
    for (const e of r.errors.slice(0, 5)) console.log(`         ${e}`);
    if (r.chain) for (const [n, ok] of r.chain.legs) if (!ok) console.log(`         chain step failed: ${n}`);
    for (const o of w.overlaps) console.log(`         overlap: ${o}`);
    for (const o of w.inStar) console.log(`         inside the star: ${o}`);
    if (s) {
      if (s.workerExpected && s.mode !== 'worker') console.log(`         sector worker did not start (mode ${s.mode})`);
      if (s.workerError) console.log(`         worker: ${s.workerError}`);
      for (const k of s.mismatch) console.log(`         worker output differs from main thread: sector ${k}`);
      for (const f of s.fails.slice(0, 8)) console.log(`         ${f}`);
    }
    if (r.digestMatch === false) console.log(`         digest differs from ${opt('--compare')}`);
  }
}
await browser.close();
const failed = results.filter((r) => !r.pass);
const mins = ((Date.now() - t0) / 60000).toFixed(1);
console.log(
  `${results.length - failed.length}/${results.length} seeds passed${failed.length ? ` · failed: ${failed.map((r) => r.seed).join(', ')}` : ''} · ${mins} min`,
);
const warn = results.filter((r) => r.world && r.world.rings.length);
if (warn.length) console.log(`ring warnings (not a failure): ${warn.map((r) => `${r.seed}: ${r.world.rings.join('; ')}`).join(' | ')}`);
const retried = results.filter((r) => r.retried);
if (retried.length) console.log(`re-run after a browser tab crash: ${retried.map((r) => r.seed).join(', ')}`);
const swarn = results.filter((r) => r.sect && r.sect.warns.length);
if (swarn.length)
  console.log(
    `sector warnings (not a failure): ${swarn.map((r) => `${r.seed}: ${r.sect.warns.length}`).join(', ')} (details in the HTML/JSON report)`,
  );
if (opt('--json')) writeFile(abs(opt('--json')), JSON.stringify(results, null, 1));

if (htmlOut) {
  const cell = (ok, txt) => `<td class="${ok === null ? '' : ok ? 'ok' : 'fail'}">${esc(txt)}</td>`;
  const rows = results
    .map((r) => {
      const w = r.world,
        s = r.sect;
      const det = [
        ...r.errors,
        ...(r.chain ? r.chain.legs.filter((l) => !l[1]).map((l) => `chain step failed: ${l[0]}`) : []),
        ...(w ? [...w.overlaps.map((o) => `overlap: ${o}`), ...w.inStar.map((o) => `inside the star: ${o}`)] : []),
        ...(s
          ? [...(s.workerError ? [`worker: ${s.workerError}`] : []), ...s.mismatch.map((k) => `worker ≠ main: sector ${k}`), ...s.fails]
          : []),
      ];
      const warns = [...(w ? w.rings.map((x) => `ring: ${x}`) : []), ...(s ? s.warns : [])];
      return `<tr>${cell(null, r.seed)}${cell(null, r.loadMs ?? '-')}${cell(!r.errors.length, r.errors.length)}${cell(r.breach, r.breach ? 'ok' : 'FAIL')}${cell(!!(r.chain && r.chain.ok), r.chain && r.chain.ok ? 'ok' : 'FAIL')}${cell(!!(w && !w.overlaps.length), w && !w.overlaps.length ? 'ok' : 'FAIL')}${cell(!!(w && !w.inStar.length), w && !w.inStar.length ? 'ok' : 'FAIL')}<td class="${w && w.rings.length ? 'warn' : 'ok'}">${w && w.rings.length ? 'warn' : 'ok'}</td>${cell(r.workerOk, r.workerOk ? `ok (${s ? s.mode : '?'})` : 'FAIL')}${cell(r.sectorsOk, `${r.sectorsOk ? 'ok' : 'FAIL'} · ${s ? s.sectors : 0}`)}<td><code>${esc(r.digest || '-')}</code>${r.digestMatch === null ? '' : r.digestMatch ? ' <span class="ok">=</span>' : ' <span class="fail">≠</span>'}</td>${cell(r.pass, r.pass ? 'PASS' : 'FAIL')}<td class="small">${r.retried ? `<div class="warn">browser tab crashed ${r.retried}× — result is from the re-run</div>` : ''}${det.map((d) => `<div class="fail">${esc(d)}</div>`).join('')}${warns.map((d) => `<div class="warn">${esc(d)}</div>`).join('')}</td></tr>`;
    })
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>VOIDBORNE seed test</title><style>${REPORT_CSS}</style>
<h1>VOIDBORNE seed test — ${results.length - failed.length}/${results.length} passed</h1>
<div class="meta">${esc(new Date().toISOString())} · ${esc(browserName)}${flag('--swiftshader') ? ' (SwiftShader)' : ''} · quality ${esc(quality)} · ${esc(file)} · ${mins} min${compare ? ` · digests compared with ${esc(opt('--compare'))}` : ''}</div>
<table><tr><th>seed</th><th>load ms</th><th>errors</th><th>breach</th><th>chain</th><th>overlap</th><th>star</th><th>rings</th><th>worker</th><th>sectors</th><th>digest (world-sectors)</th><th>result</th><th>details</th></tr>
${rows}</table>
<p class="small">Digest = FNV hash of the home world and of the existing neighbour sectors, numbers rounded to 3 decimals. Same seed + same code ⇒ same digest.</p>`;
  writeFile(htmlOut, html);
  console.log(`report: ${htmlOut}`);
}
process.exit(failed.length ? 1 : 0);
