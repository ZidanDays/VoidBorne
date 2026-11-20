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
// Phase 6D: the faint light of a rogue planet: the nearest real star within two sectors, at CFG.ROGUE_STARLIGHT of its light
function rogueLight(meta) {
  let best = null,
    bd = 1e18;
  for (let dx = -2; dx <= 2; dx++)
    for (let dy = -2; dy <= 2; dy++)
      for (let dz = -2; dz <= 2; dz++) {
        const m = sectorMeta(meta.sx + dx, meta.sy + dy, meta.sz + dz);
        if (!m.exists) continue;
        const d = len(sub(m.star, meta.star));
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
  const k = CFG.ROGUE_STARLIGHT;
  return best
    ? { pos: best.star, r: 0, col: best.col.map((v) => v * k), tint: best.tint, name: best.name, light: k, rogueLight: true }
    : { pos: add(meta.star, [0, SS, 0]), r: 0, col: [0.02, 0.02, 0.025], tint: [1, 1, 1], name: '', light: 0, rogueLight: true };
}
function instantiateSector(meta, out) {
  // Phase 6C: every star of the system (meta.sys, see star-classes.js); without STAR_VARIETY the one old star
  const stars = meta.rogue
    ? []
    : out.landmark
      ? [landmarkStar(meta)] // Phase 6E: the neutron star of a remnant / the white dwarf of a planetary nebula
      : meta.sys
        ? meta.sys.stars
        : [{ pos: meta.star, r: meta.r, col: meta.col, tint: meta.tint, name: meta.name, light: 1 }];
  const l2 = CFG.STAR_LIGHTS >= 2 ? stars.find((s, i) => i > 0 && s.light > 0) : null;
  const sec = {
    meta,
    key: meta.key,
    star: meta.rogue ? rogueLight(meta) : stars[0], // Phase 6D: a rogue sector has no star; it is lit faintly by the nearest one
    center: meta.rogue ? meta.star : null, // the system centre where it is not a star (rogue planet)
    rogue: !!meta.rogue,
    comets: out.comets || [], // Phase 6E
    belt: null,
    graveyard: null,
    aring: null,
    landmark: out.landmark || null,
    ext:
      (out.comets && out.comets.length > 0) ||
      out.planets.some((p) => (p.pp && p.pp[PPK.auroraCol + 3]) || p.moons.some((m) => m.pp && m.pp[PPK.auroraCol + 3])), // needs the PEXT planet shader
    stars,
    sys: meta.sys || null,
    l2: l2 ? { s: l2, k: l2.light } : null, // the second light of this system (close partner, or a dimmed distant companion)
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
      ship: { L: w.L, R: w.R, prof: w.prof, rad: w.rad, breach: w.breach },
      rad: w.rad,
      log: w.log,
      found: false,
      id: meta.key + ':w' + i,
      big: !!w.big, // Phase 6E: an enterable graveyard hull (shell + breach + deck + crates, like wreck 0)
      crates: w.crates || null,
      gy: !!w.gy,
    };
    sec.wrecks.push(o);
    job(() => {
      for (const [mb, mat] of [[w.hull, 0], [w.panels, 1], [w.lights, 3], ...(w.interior ? [[w.interior, 7]] : [])]) {
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
  // Phase 6E: the outer belt (instanced rocks on GPU orbits around the system centre), the graveyard's loose debris, the ring
  if (out.belt) {
    const B = out.belt;
    sec.belt = { C: B.C, R0: B.R0, R1: B.R1, q: B.q, ySpread: B.ySpread, items: [], found: false, id: meta.key + ':kb' };
    job(() => {
      B.inst.forEach((a, k) => {
        const m = makeMesh(astMeshes[k], a, 'a');
        sec.meshes.push(m);
        sec.belt.items.push(m);
      });
    });
  }
  if (out.graveyard) {
    const G = out.graveyard;
    sec.graveyard = { c: G.c, R: G.R, name: G.name, items: [], found: false, id: meta.key + ':gy' };
    job(() => {
      G.debris.forEach((a, k) => {
        if (!a.length) return;
        a.anchor = G.c;
        const m = makeMesh(debrisMB[k], a, 'q');
        sec.meshes.push(m);
        sec.graveyard.items.push({ mesh: m, mat: 0, anim: 4, static: true });
      });
    });
  }
  if (out.aring) {
    const A = out.aring;
    sec.aring = Object.assign({}, A, { mesh: null, mono: null, glyph: null, items: [], found: false, id: meta.key + ':ar' });
    sec.radius = Math.max(sec.radius, out.radius);
    job(() => {
      for (const [mb, mat] of [
        [A.mesh, 0],
        [A.mono, 9],
        [A.glyph, 12],
      ]) {
        const m = makeMesh(mb, single(A.C, A.q, A.K, [1, 1, 1]), 'q', true); // the mesh is in units of A.K metres
        sec.meshes.push(m);
        sec.aring.items.push({ mesh: m, mat });
      }
    });
  }
  job(() => {
    sec.ready = true;
    registerSector(sec);
  });
}
// Phase 6E: the central star of a landmark sector (a stream of its own; neutron star for a remnant, white dwarf for a nebula)
function landmarkStar(meta) {
  const lm = meta.landmark;
  const st = mkStar(lm.kind === 'snr' ? 'N' : 'D', mkRng(lm.seed ^ 0x5a17));
  return Object.assign(st, { pos: meta.star.slice(), name: lm.name, light: 1, kind: 'single', mates: [] });
}
function registerSector(sec) {
  const k = sec.meta;
  const tag = 'sector ' + k.sx + ',' + k.sy + ',' + k.sz;
  const P = (o) => {
    POI.push(o);
    sec.poi.push(o);
  };
  const tg = () => tl('map.sector') + ' ' + k.sx + ',' + k.sy + ',' + k.sz;
  for (const st of sec.stars)
    P({
      name: st.name,
      get sub() {
        return st.cls ? tl('poi.starCls', { cls: tl('cls.star' + st.cls), tag: tg() }) : tl('poi.starIn', { tag: tg() });
      },
      pos: st.pos,
      r: st.r,
      kind: 'star',
      ref: st,
      sclass: st.cls || null,
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
          return tl(m.type ? 'cls.moon' + m.type : 'cls.moon'); // Phase 6D: special moons
        },
        get pos() {
          return m.pos;
        },
        r: m.r,
        kind: 'moon',
        mtype: m.type || 0,
        ref: m,
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
  // Phase 6E: comets, the outer belt, a graveyard, the ancient ring (and its monolith), a remnant / nebula
  for (const c of sec.comets)
    P({
      get name() {
        return tl('comet.name', { name: c.name });
      },
      get sub() {
        return tl('cls.comet');
      },
      get pos() {
        return c.pos || c.C;
      },
      r: c.r,
      kind: 'comet',
      ref: c,
    });
  if (sec.belt)
    P({
      get name() {
        return tl('kb.name', { name: sec.star.name });
      },
      get sub() {
        return tl('cls.kbelt');
      },
      get pos() {
        // the point of the belt nearest the player
        const B = sec.belt,
          lp = qrot(qconj(B.q), sub(player.pos, B.C));
        const a = Math.atan2(lp[2], lp[0]);
        return add(B.C, qrot(B.q, [Math.cos(a) * (B.R0 + B.R1) * 0.5, 0, Math.sin(a) * (B.R0 + B.R1) * 0.5]));
      },
      r: 400,
      kind: 'kbelt',
      ref: sec.belt,
    });
  if (sec.graveyard)
    P({
      get name() {
        return tl('gy.name', { name: sec.graveyard.name });
      },
      get sub() {
        return tl('cls.graveyard');
      },
      pos: sec.graveyard.c,
      r: sec.graveyard.R,
      kind: 'graveyard',
      ref: sec.graveyard,
    });
  if (sec.aring) {
    P({
      get name() {
        return tl('ar.name', { name: sec.aring.name });
      },
      get sub() {
        return tl('cls.aring');
      },
      get pos() {
        const A = sec.aring;
        return add(A.C, qrot(A.q, [Math.cos((A.a0 + A.a1) / 2) * A.Rr, 0, Math.sin((A.a0 + A.a1) / 2) * A.Rr]));
      },
      r: 600,
      kind: 'aring',
      ref: sec.aring,
    });
    P({ name: tl('ar.mono'), sub: '', pos: sec.aring.monoPos, r: 14, kind: 'aring', ref: sec.aring, mono: true });
  }
  if (sec.landmark)
    P({
      get name() {
        return tl(sec.landmark.kind === 'snr' ? 'snr.name' : 'pn.name', { name: sec.landmark.name });
      },
      get sub() {
        return tl('cls.' + sec.landmark.kind);
      },
      pos: sec.star.pos,
      r: sec.landmark.R,
      kind: 'lmark',
      ref: sec.landmark,
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
  const rp = sec.rogue ? sec.planets[0] : null; // Phase 6D: discovering a rogue planet counts like finding a system
  D({
    id: k.key + ':star',
    get name() {
      return rp ? tl('disc.rogue', { name: rp.name }) : tl('disc.system', { name: sec.star.name });
    },
    ref: sys,
    pos: () => (rp ? rp.pos : sec.star.pos),
    rad: () => (rp ? rp.r * 6 + 1500 : sec.star.r * 6 + 1500),
  });
  for (const w of sec.wrecks) D({ id: w.id, name: w.name, ref: w, pos: () => w.pos, rad: () => w.rad + 60 });
  // Phase 6E discoverables
  sec.comets.forEach((c, i) => {
    c.found = false;
    D({
      id: k.key + ':c' + i,
      get name() {
        return tl('comet.name', { name: c.name });
      },
      ref: c,
      pos: () => c.pos || c.C,
      rad: () => 300,
    });
  });
  if (sec.graveyard)
    D({
      id: sec.graveyard.id,
      get name() {
        return tl('gy.name', { name: sec.graveyard.name });
      },
      ref: sec.graveyard,
      pos: () => sec.graveyard.c,
      rad: () => sec.graveyard.R + 400,
    });
  if (sec.aring)
    D({
      id: sec.aring.id,
      get name() {
        return tl('ar.name', { name: sec.aring.name });
      },
      ref: sec.aring,
      pos: () => sec.aring.monoPos,
      rad: () => 1500,
    });
  if (sec.landmark) {
    const L = sec.landmark;
    L.found = false;
    D({
      id: k.key + ':lm',
      get name() {
        return tl(L.kind === 'snr' ? 'snr.name' : 'pn.name', { name: L.name });
      },
      ref: L,
      pos: () => sec.star.pos,
      rad: () => L.R * 1.1,
    });
  }
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
// Phase 6C: distance from p to the nearest star of a system (you can be next to a wide companion, far from the centre)
function sysDist(m, p) {
  let d = len(sub(m.star, p));
  if (m.sys) for (const st of m.sys.stars) d = Math.min(d, len(sub(st.pos, p)));
  return d;
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
        if (m.home || !(m.exists || m.rogue || m.landmark)) continue; // Phase 6D/6E: rogue planets and landmarks load too
        if (sysDist(m, player.pos) < CFG.SECTOR_LOAD) requestSector(m);
      }
  for (const sec of [...SECT.loaded.values()])
    if (sysDist(sec.meta, player.pos) > CFG.SECTOR_UNLOAD && !(WARP.on && WARP.meta && WARP.meta.key === sec.key)) unloadSector(sec);
  for (const [k, m] of [...GEN.pending])
    if (sysDist(m, player.pos) > CFG.SECTOR_UNLOAD && !(WARP.on && WARP.meta && WARP.meta.key === k)) GEN.pending.delete(k);
}
function readySectors() {
  const a = [];
  for (const s of SECT.loaded.values()) if (s.ready) a.push(s);
  return a;
}
function sectorUpdate() {
  for (const sec of readySectors()) {
    if (sec.sys && sec.sys.orbit) starOrbit(sec.sys, time); // Phase 6C: a close pair turns around its centre of mass
    for (const p of sec.planets) {
      p.q = qaxis(p.axis, time * p.spin);
      for (const m of p.moons) {
        const a = m.ang + time * m.w;
        m.pos = add(p.pos, qrot(m.q, [Math.cos(a) * m.dist, 0, Math.sin(a) * m.dist]));
      }
    }
    for (const c of sec.comets) {
      c.pos = cometPos(c, time); // Phase 6E: Kepler orbit
      c.q = qaxis(c.axis, time * c.spin);
    }
    const near = len(sub(sec.center || sec.star.pos, player.pos)) < sec.radius + 6000;
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
    for (const st of sec.stars) sphereHit(st.pos, st.r + 6); // every star, the distant companion of a wide pair included
    if (len(sub(sec.center || sec.star.pos, player.pos)) > sec.radius + 3000) continue;
    for (const p of sec.planets) {
      sphereHit(p.pos, p.r * 1.03);
      for (const m of p.moons) {
        // Phase 6D: an irregular moon is solid along its own shape (the lobes of its set, evaluated toward the player)
        if (m.irr && len(sub(player.pos, m.pos)) < m.r * m.irr * 1.05 + 10)
          sphereHit(m.pos, m.r * 1.03 * irregularR(m.pp, qrot(qconj(m.q), norm(sub(player.pos, m.pos)))));
        else sphereHit(m.pos, m.r * 1.03);
      }
    }
    for (const w of sec.wrecks) {
      const rel = sub(player.pos, w.pos);
      if (len(rel) > w.rad + 10) continue;
      const lp = qrot(qconj(w.q), rel);
      if (w.big) {
        bigHullCollide(w, lp); // Phase 6E: an enterable graveyard hull: the same shell, breach and deck rules as wreck 0
        continue;
      }
      const L = w.ship.L;
      const x = clamp(lp[0], -L / 2, L / 2);
      const d = [lp[0] - x, lp[1], lp[2]];
      const l = len(d);
      const r2 = profR(w.ship, x / L + 0.5) * 1.05 + 1.5;
      if (l < r2 && l > 1e-6) bounce(qrot(w.q, scl(d, 1 / l)), r2 - l);
    }
    // Phase 6E: comet nuclei (solid along their shape; tails are not), outer-belt rocks, the ancient ring
    for (const c of sec.comets)
      if (c.pos && len(sub(player.pos, c.pos)) < c.r * c.irr * 1.05 + 10)
        sphereHit(c.pos, c.r * 1.03 * irregularR(c.pp, qrot(qconj(c.q), norm(sub(player.pos, c.pos)))));
    if (sec.belt && sec.belt.items.length) {
      const B = sec.belt;
      const lp = qrot(qconj(B.q), sub(player.pos, B.C));
      const rad = Math.hypot(lp[0], lp[2]);
      if (rad > B.R0 - 40 && rad < B.R1 + 40 && Math.abs(lp[1]) < B.ySpread + 40) {
        const M = q2m3(B.q);
        for (const it of B.items) asteroidHits(it, M, B.C);
      }
    }
    if (sec.aring) aringCollide(sec.aring, player.pos, 1.5, (n, d) => bounce(n, d));
  }
}
// Phase 6E: a crate inside an enterable graveyard hull: the oriented-box push of interiorCollide (interior/state-collision.js)
function crateHit(w, lp, c) {
  let rx = lp[0] - c.p[0],
    ry = lp[1] - c.p[1],
    rz = lp[2] - c.p[2];
  if (Math.abs(rx) > c.h[0] + PLAYER_R + 3 || Math.abs(ry) > c.h[1] + PLAYER_R + 3 || Math.abs(rz) > c.h[2] + PLAYER_R + 3) return;
  const ca = Math.cos(c.ang),
    sa = Math.sin(c.ang);
  const x = ca * rx - sa * rz;
  rz = sa * rx + ca * rz;
  rx = x;
  const dx = rx - clamp(rx, -c.h[0], c.h[0]),
    dy = ry - clamp(ry, -c.h[1], c.h[1]),
    dz = rz - clamp(rz, -c.h[2], c.h[2]);
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist >= PLAYER_R) return;
  let n, pen;
  if (dist > 1e-6) {
    n = [dx / dist, dy / dist, dz / dist];
    pen = PLAYER_R - dist;
  } else {
    const ex = c.h[0] - Math.abs(rx),
      ey = c.h[1] - Math.abs(ry),
      ez = c.h[2] - Math.abs(rz);
    n = ex <= ey && ex <= ez ? [Math.sign(rx) || 1, 0, 0] : ey <= ez ? [0, Math.sign(ry) || 1, 0] : [0, 0, Math.sign(rz) || 1];
    pen = Math.min(ex, ey, ez) + PLAYER_R;
  }
  bounce(qrot(w.q, [ca * n[0] + sa * n[2], n[1], -sa * n[0] + ca * n[2]]), pen);
}
// Phase 6E: the hull rules of the explorable wreck (flight-collision.js) for an enterable graveyard hull, in hull-local lp
function bigHullCollide(w, lp) {
  const L = w.ship.L,
    R = w.ship.R;
  const ax = lp[0],
    rad = Math.hypot(lp[1], lp[2]);
  const v = ax / L + 0.5;
  const Rv = profR(w.ship, v);
  let u = Math.atan2(lp[2], lp[1]) / TAU;
  if (u < 0) u += 1;
  const br = w.ship.breach;
  const du = Math.min(Math.abs(u - br.u), 1 - Math.abs(u - br.u));
  const inBreach = du < br.du * 0.8 && Math.abs(v - br.v) < br.dv * 0.8;
  const radial = rad > 1e-6 ? [0, lp[1] / rad, lp[2] / rad] : [0, 1, 0];
  if (Math.abs(ax) < L / 2) {
    if (rad < Rv) {
      player.inside = true;
      player.insideW = w;
      if (rad > Rv - 2.2 && !inBreach) bounce(qrot(w.q, scl(radial, -1)), rad - (Rv - 2.2));
      if (ax > L / 2 - 4) bounce(qrot(w.q, [-1, 0, 0]), ax - (L / 2 - 4));
      if (ax < -L / 2 + 4) bounce(qrot(w.q, [1, 0, 0]), -L / 2 + 4 - ax);
      if (lp[1] < -R * 0.5 + 1.8 && Math.abs(ax) < L * 0.35) bounce(qrot(w.q, [0, 1, 0]), -R * 0.5 + 1.8 - lp[1]);
      if (w.crates) for (const c of w.crates) crateHit(w, lp, c);
    } else if (rad < Rv + 2.0 && !inBreach) bounce(qrot(w.q, radial), Rv + 2.0 - rad);
  } else {
    const x = clamp(ax, -L / 2, L / 2);
    const d = [ax - x, lp[1], lp[2]];
    const l = len(d);
    const rr2 = profR(w.ship, x / L + 0.5) * 0.6 + 2;
    if (l < rr2 && l > 1e-6) bounce(qrot(w.q, scl(d, 1 / l)), rr2 - l);
  }
}
/* all stars and bodies that matter for lighting/occlusion/avoidance */
function allStars() {
  const a = [homeStarObj()];
  for (const s of readySectors()) for (const st of s.stars) a.push(st); // Phase 6C: companions too
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
  for (const s of allStars()) a.push({ pos: s.pos, r: s.r, star: true, mass: s.mass }); // mass: Phase 6C class gravity factor
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
    if (len(sub(p, s.center || s.star.pos)) < s.radius)
      return { sec: s, name: s.rogue ? s.planets[0].name : s.star.name, radius: s.radius, center: s.center || s.star.pos };
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
        const cd = CFG.SKY_CLASS_DOTS; // Phase 6C: class colour and size (vr: compact stars still show), or the old dot
        const sz = clamp(7 - d / 40000, 1.6, 6) * (0.7 + (cd ? m.vr || m.r : m.r0 || m.r) / 400) * Math.min(devicePixelRatio || 1, 2);
        rows.push([sub(m.star, anchor), sz, cd ? m.tint : m.tint0 || m.tint]);
        if (m.sys && cd)
          for (const st of m.sys.stars)
            if (st.far) {
              // Phase 6C: a distant companion is a dot of its own
              const d2 = len(sub(st.pos, player.pos));
              rows.push([
                sub(st.pos, anchor),
                clamp(7 - d2 / 40000, 1.6, 6) * (0.7 + st.vr / 400) * Math.min(devicePixelRatio || 1, 2),
                st.tint,
              ]);
            }
      }
  if (starPts) freePoints(starPts);
  const a = new Float32Array(Math.max(1, rows.length) * 10);
  rows.forEach((r, i) => a.set([r[0][0], r[0][1], r[0][2], r[1], 0, 0, 0, r[2][0], r[2][1], r[2][2]], i * 10));
  starPts = { a, n: rows.length, dynamic: false, vao: null, vbo: null, anchor };
  uploadPoints(starPts);
  GLR.points.push(starPts);
}
