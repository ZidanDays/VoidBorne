/* ---- streaming: instantiate on arrival (GPU uploads spread over frames), release when far ---- */
const SECT = { loaded: new Map(), cur: '0,0,0', tick: 0 };
const UPQ = [];
function processUploads() {
  const t0 = performance.now();
  while (UPQ.length && performance.now() - t0 < CFG.UPLOAD_BUDGET_MS) UPQ.shift()();
}
function onGenerated(key, out) {
  const meta = GEN.pending.get(key);
  if (!meta) return;
  GEN.pending.delete(key);
  GEN.times.push(Math.round(performance.now() - meta.t0));
  instantiateSector(meta, out);
}
function instantiateSector(meta, out) {
  const sec = {
    meta,
    key: meta.key,
    star: { pos: meta.star, r: meta.r, col: meta.col, tint: meta.tint, name: meta.name },
    planets: out.planets,
    wrecks: [],
    beacon: out.beacon,
    med: null,
    radius: out.radius,
    ready: false,
    dead: false,
    meshes: [],
    poi: [],
    disc: [],
  };
  SECT.loaded.set(meta.key, sec);
  const job = (f) =>
    UPQ.push(() => {
      if (!sec.dead) f();
    });
  out.wrecks.forEach((w, i) => {
    const o = {
      name: w.name,
      pos: w.pos,
      axis: w.axis,
      rate: w.rate,
      ph: w.ph,
      q: qid(),
      items: [],
      ship: { L: w.L, R: w.R, prof: w.prof, rad: w.rad },
      rad: w.rad,
      log: w.log,
      found: false,
      id: meta.key + ':w' + i,
    };
    sec.wrecks.push(o);
    job(() => {
      for (const [mb, mat] of [
        [w.hull, 0],
        [w.panels, 1],
        [w.lights, 3],
      ]) {
        const m = makeMesh(mb, single(w.pos, qid(), 1, [1, 1, 1], mat === 3 ? i * 3.7 : 0), 'q', true);
        sec.meshes.push(m);
        o.items.push({ mesh: m, mat });
      }
    });
    job(() => {
      w.debris.forEach((a, k) => {
        if (!a.length) return;
        a.anchor = w.pos;
        const m = makeMesh(debrisMB[k], a, 'q');
        sec.meshes.push(m);
        o.items.push({ mesh: m, mat: 0, anim: 4, static: true });
      });
    });
  });
  if (out.beacon) {
    const b = out.beacon;
    b.found = false;
    b.id = meta.key + ':b';
    Object.defineProperty(b, 'name', {
      get() {
        return tl('sig.name', { adj: tl('sig.adj')[b.adj | 0] });
      },
      configurable: true,
    });
    job(() => {
      const m1 = makeMesh(beaconMesh(), single(b.pos, qid(), 1, [1, 1, 1]), 'q');
      const lm = new MB();
      lm.sphere(2, [1, 0.55, 0.2], xfq(Q0, [0, 1.5, 0]), 1, 8);
      const m2 = makeMesh(lm, single(b.pos, qid(), 1, [1, 1, 1]), 'q');
      sec.meshes.push(m1, m2);
      b.items = [
        { mesh: m1, mat: 0 },
        { mesh: m2, mat: 8 },
      ];
    });
  }
  if (out.med) {
    const md = out.med;
    md.inst.anchor = md.c;
    sec.med = { c: md.c, col: md.col, found: false, id: meta.key + ':m' };
    job(() => {
      const m = makeMesh(medusae.mesh.mb, md.inst, 'q');
      sec.meshes.push(m);
      sec.med.mesh = m;
    });
  }
  job(() => {
    sec.ready = true;
    registerSector(sec);
  });
}
function registerSector(sec) {
  const k = sec.meta;
  const tag = 'sector ' + k.sx + ',' + k.sy + ',' + k.sz;
  const P = (o) => {
    POI.push(o);
    sec.poi.push(o);
  };
  const tg = () => tl('map.sector') + ' ' + k.sx + ',' + k.sy + ',' + k.sz;
  P({
    name: sec.star.name,
    get sub() {
      return tl('poi.starIn', { tag: tg() });
    },
    pos: sec.star.pos,
    r: sec.star.r,
    kind: 'star',
  });
  for (const p of sec.planets) {
    P({
      name: p.name,
      get sub() {
        return tl('cls.p' + p.type);
      },
      ptype: p.type,
      pos: p.pos,
      r: p.r,
      kind: 'planet',
    });
    for (const m of p.moons)
      P({
        name: m.name,
        get sub() {
          return tl('cls.moon');
        },
        get pos() {
          return m.pos;
        },
        r: m.r,
        kind: 'moon',
      });
  }
  for (const w of sec.wrecks)
    P({
      name: w.name,
      get sub() {
        return tl('poi.wreckIn', { tag: tg() });
      },
      pos: w.pos,
      r: w.rad,
      kind: 'wreck',
      ref: w,
    });
  if (sec.beacon)
    P({
      get name() {
        return sec.beacon.name;
      },
      get sub() {
        return tl('cls.signal');
      },
      pos: sec.beacon.pos,
      r: 30,
      kind: 'secret',
      ref: sec.beacon,
      hidden: true,
    });
  const D = (d) => {
    DISCOVERABLE.push(d);
    sec.disc.push(d);
    knownSet.add(d.id);
    if (foundSet.has(d.id)) d.ref.found = true;
  };
  const sys = { found: false };
  D({
    id: k.key + ':star',
    get name() {
      return tl('disc.system', { name: sec.star.name });
    },
    ref: sys,
    pos: () => sec.star.pos,
    rad: () => sec.star.r * 6 + 1500,
  });
  for (const w of sec.wrecks) D({ id: w.id, name: w.name, ref: w, pos: () => w.pos, rad: () => w.rad + 60 });
  if (sec.beacon)
    D({
      id: sec.beacon.id,
      get name() {
        return sec.beacon.name;
      },
      ref: sec.beacon,
      pos: () => sec.beacon.pos,
      rad: () => 60,
    });
  if (sec.med)
    D({
      id: sec.med.id,
      get name() {
        return tl('disc.bloom');
      },
      ref: sec.med,
      pos: () => sec.med.c,
      rad: () => 130,
    });
  if (PROG.visited.indexOf(k.key) < 0) {
    PROG.visited.push(k.key);
    saveSoon();
  }
  updateCount();
  rebuildStarPoints();
}
function unloadSector(sec) {
  sec.dead = true;
  for (const m of sec.meshes) freeMesh(m);
  sec.meshes.length = 0;
  for (const o of sec.poi) {
    const i = POI.indexOf(o);
    if (i >= 0) POI.splice(i, 1);
  }
  for (const d of sec.disc) {
    const i = DISCOVERABLE.indexOf(d);
    if (i >= 0) DISCOVERABLE.splice(i, 1);
  }
  SECT.loaded.delete(sec.key);
  if (AP.on && AP.t && AP.t.sec === sec) apOff(tl('ap.range'));
  rebuildStarPoints();
}
function streamTick(dt) {
  SECT.tick -= dt;
  if (SECT.tick > 0) return;
  SECT.tick = 0.5;
  const cs = sectorOf(player.pos);
  const ck = cs.join(',');
  if (ck !== SECT.cur) {
    SECT.cur = ck;
    rebuildStarPoints();
  }
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        const m = sectorMeta(cs[0] + dx, cs[1] + dy, cs[2] + dz);
        if (!m.exists || m.home) continue;
        if (len(sub(m.star, player.pos)) < CFG.SECTOR_LOAD) requestSector(m);
      }
  for (const sec of [...SECT.loaded.values()])
    if (len(sub(sec.star.pos, player.pos)) > CFG.SECTOR_UNLOAD && !(WARP.on && WARP.meta && WARP.meta.key === sec.key)) unloadSector(sec);
  for (const [k, m] of [...GEN.pending])
    if (len(sub(m.star, player.pos)) > CFG.SECTOR_UNLOAD && !(WARP.on && WARP.meta && WARP.meta.key === k)) GEN.pending.delete(k);
}
function readySectors() {
  const a = [];
  for (const s of SECT.loaded.values()) if (s.ready) a.push(s);
  return a;
}
function sectorUpdate() {
  for (const sec of readySectors()) {
    for (const p of sec.planets) {
      p.q = qaxis(p.axis, time * p.spin);
      for (const m of p.moons) {
        const a = m.ang + time * m.w;
        m.pos = add(p.pos, qrot(m.q, [Math.cos(a) * m.dist, 0, Math.sin(a) * m.dist]));
      }
    }
    const near = len(sub(sec.star.pos, player.pos)) < sec.radius + 6000;
    for (const w of sec.wrecks) {
      w.q = qaxis(w.axis, time * w.rate + w.ph);
      if (!near) continue;
      for (const it of w.items) {
        if (it.static) continue;
        const a = it.mesh.inst;
        a[3] = w.q[0];
        a[4] = w.q[1];
        a[5] = w.q[2];
        a[6] = w.q[3];
        gl.bindBuffer(gl.ARRAY_BUFFER, it.mesh.ivbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
      }
    }
  }
}
function sectorCollide() {
  for (const sec of readySectors()) {
    if (len(sub(sec.star.pos, player.pos)) > sec.radius + 3000) continue;
    sphereHit(sec.star.pos, sec.star.r + 6);
    for (const p of sec.planets) {
      sphereHit(p.pos, p.r * 1.03);
      for (const m of p.moons) sphereHit(m.pos, m.r * 1.03);
    }
    for (const w of sec.wrecks) {
      const rel = sub(player.pos, w.pos);
      if (len(rel) > w.rad + 10) continue;
      const lp = qrot(qconj(w.q), rel);
      const L = w.ship.L;
      const x = clamp(lp[0], -L / 2, L / 2);
      const d = [lp[0] - x, lp[1], lp[2]];
      const l = len(d);
      const r2 = profR(w.ship, x / L + 0.5) * 1.05 + 1.5;
      if (l < r2 && l > 1e-6) bounce(qrot(w.q, scl(d, 1 / l)), r2 - l);
    }
  }
}
/* all stars and bodies that matter for lighting/occlusion/avoidance */
function allStars() {
  const a = [{ pos: STAR.pos, r: STAR.r, col: SUNCOL, tint: [1, 1, 1], name: STAR.name, home: true }];
  for (const s of readySectors()) a.push(s.star);
  return a;
}
function activeStar() {
  let best = null,
    bd = 1e18;
  for (const s of allStars()) {
    const d = len(sub(s.pos, player.pos));
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}
function allBodies() {
  const a = [];
  for (const s of allStars()) a.push({ pos: s.pos, r: s.r, star: true });
  for (const p of planets) {
    a.push(p);
    for (const m of p.moons) a.push(m);
  }
  for (const s of readySectors())
    for (const p of s.planets) {
      a.push(p);
      for (const m of p.moons) a.push(m);
    }
  return a;
}
function systemOf(p) {
  if (len(p) < CFG.WORLD_RADIUS) return { home: true, name: STAR.name, radius: CFG.WORLD_RADIUS, center: [0, 0, 0] };
  for (const s of readySectors())
    if (len(sub(p, s.star.pos)) < s.radius) return { sec: s, name: s.star.name, radius: s.radius, center: s.star.pos };
  return null;
}
/* ---- distant stars of other sectors, drawn as points ---- */
let starPts = null;
function rebuildStarPoints() {
  const cs = sectorOf(player.pos);
  const R = CFG.STAR_POINTS_RANGE;
  const rows = [];
  const anchor = [cs[0] * SS, cs[1] * SS, cs[2] * SS];
  for (let dx = -R; dx <= R; dx++)
    for (let dy = -R; dy <= R; dy++)
      for (let dz = -R; dz <= R; dz++) {
        const m = sectorMeta(cs[0] + dx, cs[1] + dy, cs[2] + dz);
        if (!m.exists || SECT.loaded.has(m.key)) continue;
        if (m.home && len(player.pos) < CFG.SECTOR_LOAD) continue;
        const d = len(sub(m.star, player.pos));
        const sz = clamp(7 - d / 40000, 1.6, 6) * (0.7 + m.r / 400) * Math.min(devicePixelRatio || 1, 2);
        rows.push([sub(m.star, anchor), sz, m.tint]);
      }
  if (starPts) freePoints(starPts);
  const a = new Float32Array(Math.max(1, rows.length) * 10);
  rows.forEach((r, i) => a.set([r[0][0], r[0][1], r[0][2], r[1], 0, 0, 0, r[2][0], r[2][1], r[2][2]], i * 10));
  starPts = { a, n: rows.length, dynamic: false, vao: null, vbo: null, anchor };
  uploadPoints(starPts);
  GLR.points.push(starPts);
}
