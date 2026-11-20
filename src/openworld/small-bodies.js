/* =====================================================================
   SMALL BODIES AND DEEP-SPACE LANDMARKS (Phase 6E)
   Pure generation (it runs in the sector worker too; every function here is in workerSource()'s fns list):
   comets on eccentric orbits, a sparse outer belt with dwarf planets at the edge of a system, ship graveyards (derelicts
   plus one or two enterable hulls with logs) and the broken ancient ring. Each part draws from a hash stream of its own
   (genSector6E is called after everything older, so no older content of a sector changes). The supernova remnant and the
   planetary nebula are placed by sectorMeta (sectors.js) and need no generation beyond their central star.
   ===================================================================== */
// Kepler: position of a comet at time t (seconds of game time); c.C = centre, a / e = ellipse, c.oq = orbit plane (c.q = its spin)
function cometPos(c, t) {
  const M = TAU * (t / c.P + c.ph);
  let E = M;
  for (let k = 0; k < 6; k++) E -= (E - c.e * Math.sin(E) - M) / (1 - c.e * Math.cos(E));
  const b = c.a * Math.sqrt(1 - c.e * c.e);
  return add(c.C, qrot(c.oq, [c.a * (Math.cos(E) - c.e), 0, b * Math.sin(E)]));
}
// direction of motion (for the curve of the dust tail)
function cometVel(c, t) {
  return norm(sub(cometPos(c, t + 1), cometPos(c, t - 1)));
}
// e6: settings packed by sectorMsg; hz = habitable distance; reach = what the perihelion stays outside of (primary, a pair's sweep)
function genComets(out, C, e6, R, hz, reach, radius, stars) {
  const avoid = out.planets.concat(stars.filter((st) => len(sub(st.pos, C)) >= 1).map((st) => ({ pos: st.pos, r: st.r, moons: [] })));
  let n = R() < e6.comets[0] ? 1 : 0;
  const two = R() < 0.25;
  if (n && two) n = 2;
  n = Math.min(n, e6.comets[1]);
  for (let i = 0; i < n; i++) {
    const q = Math.max(reach * 1.4 + 300, hz * (0.25 + R() * 0.45)); // perihelion: inside the habitable band, clear of the stars
    const Q = Math.max(q * 3, radius * (0.75 + R() * 0.5)); // aphelion: out near the edge of the system
    const syl = TYPE_SYL[14];
    let nm = '';
    for (let k = 0; k < 2; k++) nm += syl[(R() * syl.length) | 0];
    const c = {
      name: nm[0].toUpperCase() + nm.slice(1),
      C,
      a: (q + Q) / 2,
      e: (Q - q) / (Q + q),
      oq: qaxis(norm([R() - 0.5, R() - 0.5, R() - 0.5]), R() * Math.PI), // orbit plane: comets come in at any inclination
      q: qid(),
      P: 1500 + R() * 2500, // a game-time period (minutes, not years)
      ph: R(),
      r: 3 + R() * 5,
      seed: R() * 100,
      axis: norm([R() - 0.5, R() - 0.5, R() - 0.5]),
      spin: 0.05 + R() * 0.1,
    };
    // the path must stay clear of every planet and its moons (planets keep their places) and of a far companion star: tilt
    // the orbit until it does (at most 8 tries, else no comet)
    let ok = cometClear(c, avoid);
    for (let k = 0; k < 8 && !ok; k++) {
      c.oq = qaxis(norm([R() - 0.5, R() - 0.5, R() - 0.5]), R() * Math.PI);
      ok = cometClear(c, avoid);
    }
    c.pal = PALX[19](R);
    c.pp = planetParams(19, R);
    c.irr = irregularMax(c.pp);
    if (ok) out.comets.push(c);
  }
}
// true when the comet's whole orbit (sampled as 256 chords) passes every planet beyond 1.5 radii + its moons + 200 m
function cometClear(c, planets) {
  const N = 256;
  const pt = (i) => cometPos(c, (i / N - c.ph) * c.P);
  let a = pt(0);
  for (let i = 1; i <= N; i++) {
    const b = pt(i),
      ab = sub(b, a),
      l2 = Math.max(dot(ab, ab), 1e-6);
    for (const p of planets) {
      const clear = p.r * 1.5 + p.moons.reduce((m, mo) => Math.max(m, mo.dist + mo.r), 0) + 200;
      const t = clamp(dot(sub(p.pos, a), ab) / l2, 0, 1);
      if (len(sub(p.pos, add(a, scl(ab, t)))) < clear) return false;
    }
    a = b;
  }
  return true;
}
// orbital rock instances (the layout of orbitalInst in world/belt-wrecks-station.js), from a hash stream
function beltInst(n, R0, R1, ySpread, omegaK, sMin, sMax, R) {
  const a = new Float32Array(n * INSTA);
  for (let i = 0; i < n; i++) {
    const o = i * INSTA;
    const r = R0 + R() * (R1 - R0);
    a[o] = r;
    a[o + 1] = R() * TAU;
    a[o + 2] = omegaK * Math.pow(2000 / r, 1.5);
    a[o + 3] = (R() * 2 - 1) * ySpread;
    const ax = norm([R() - 0.5, R() - 0.5, R() - 0.5]);
    a[o + 4] = ax[0];
    a[o + 5] = ax[1];
    a[o + 6] = ax[2];
    a[o + 7] = (0.05 + R() * 0.4) * (R() < 0.5 ? 1 : -1);
    a[o + 8] = Math.pow(R(), 2) * (sMax - sMin) + sMin;
    a[o + 9] = R();
  }
  return a;
}
// a sparse Kuiper-like belt beyond the last planet, and up to EDGE_DWARFS_MAX dwarf planets inside it
function genOuterBelt(out, C, e6, R, orbit, stars) {
  if (!(R() < e6.belt[0])) return;
  const R0 = edgeOf(out, C, orbit) + 600 + R() * 800,
    R1 = R0 + 900 + R() * 900;
  const q = qaxis(norm([R() - 0.5, 0.001, R() - 0.5]), (R() - 0.5) * 0.3);
  // no belt where a distant companion star sits at the belt's distance
  if (stars.some((st) => Math.abs(len(sub(st.pos, C)) - (R0 + R1) / 2) < (R1 - R0) / 2 + st.r * 1.05 + 400)) return;
  const per = Math.floor(e6.belt[1] / 3); // three rock shapes; the total never exceeds OUTER_BELT_ROCKS
  out.belt = { C, R0, R1, q, ySpread: 160, inst: [0, 1, 2].map(() => beltInst(per, R0, R1, 160, 0.0015, 2, 22, R)) };
  const nd = Math.min(e6.belt[2], Math.floor(R() * 3));
  for (let i = 0; i < nd; i++) {
    const ang = R() * TAU,
      rad = R0 + (R1 - R0) * (0.2 + R() * 0.6);
    const pos = add(C, qrot(q, [Math.cos(ang) * rad, (R() - 0.5) * 80, Math.sin(ang) * rad]));
    const r = 25 + R() * 30;
    if (out.planets.some((p) => len(sub(p.pos, pos)) < p.r * 3 + r * 3 + 400)) continue;
    if (out.comets.some((c) => !cometClear(c, [{ pos, r, moons: [] }]))) continue; // clear of the comets' paths
    const p = {
      type: 14,
      pos,
      r,
      orbit: rad,
      name: typedName(14, '', R),
      pal: PALX[14](R),
      seed: R() * 100,
      axis: norm([R() - 0.5, 1, R() - 0.5]),
      spin: (0.01 + R() * 0.03) * (R() < 0.5 ? 1 : -1),
      moons: [],
      ring: null,
      q: qid(),
      edge: true, // a dwarf planet of the outer belt (it keeps its place: no orbit motion, like every planet here)
    };
    p.pp = planetParams(14, R);
    out.planets.push(p);
  }
  out.radius = Math.max(out.radius, R1 + 1500);
}
// the outer edge of a system: the farthest planet surface or moon orbit from the centre (at least the last orbit)
function edgeOf(out, C, orbit) {
  let e = orbit;
  for (const p of out.planets) e = Math.max(e, len(sub(p.pos, C)) + p.r * 1.05 + p.moons.reduce((a, m) => Math.max(a, m.dist + m.r), 0));
  return e;
}
// a field of derelicts in the outskirts: GRAVEYARD_WRECKS small hulls and GRAVEYARD_ENTER big, enterable ones (with logs)
function genGraveyard(out, C, e6, R, free, orbit, bakeAo) {
  const [nw, ne] = e6.gy;
  const c = free(orbit + 1800, orbit + 3200, 1800);
  const Rf = 700 + R() * 500;
  const placed = [];
  const spot = (rad) => {
    for (let k = 0; k < 40; k++) {
      const p = add(c, scl(norm([R() - 0.5, (R() - 0.5) * 0.5, R() - 0.5]), Rf * (0.15 + R() * 0.85)));
      if (placed.every((o) => len(sub(o[0], p)) > o[1] + rad + 30)) return p;
    }
    return null;
  };
  const mk = (big) => {
    const ship = genShip(big);
    const pos = spot(ship.rad);
    if (!pos) return;
    placed.push([pos, ship.rad]);
    if (bakeAo) bakeAO(ship.hull, big ? 32 : 20, 0.7);
    const name = shipName();
    const deb = [[], [], []];
    for (let k = 0; k < (big ? 36 : 16); k++) {
      const d = scl(norm([R() - 0.5, R() - 0.5, R() - 0.5]), ship.rad * (0.5 + R() * 1.8));
      const ax = norm([R() - 0.5, R() - 0.5, R() - 0.5]);
      deb[k % 3].push([d, [ax[0], ax[1], ax[2], 0.1 + R() * 0.7], 0.6 + R() * 1.4, [1, 1, 1], R()]);
    }
    const w = {
      name,
      pos,
      axis: norm([R() - 0.5, R() - 0.5, R() - 0.5]),
      rate: big ? 0.002 : 0.005 + R() * 0.02,
      ph: R() * TAU,
      L: ship.L,
      R: ship.R,
      prof: ship.prof,
      rad: ship.rad,
      hull: finMB(ship.hull),
      panels: finMB(ship.panels),
      lights: finMB(ship.lights),
      debris: deb.map((list) => {
        const a = new Float32Array(list.length * INST);
        list.forEach((e, j) => instQ(a, j, e[0], e[1], e[2], e[3], e[4]));
        return a;
      }),
      log: genLog(name),
      gy: true,
    };
    if (big) {
      w.big = true;
      w.interior = finMB(ship.interior);
      w.breach = ship.breach;
      w.crates = ship.crates; // solid inside, as in wreck 0 (oriented boxes, hull-local)
    }
    out.wrecks.push(w);
  };
  for (let i = 0; i < ne; i++) mk(true);
  for (let i = 0; i < nw; i++) mk(false);
  // a thicker cloud of loose debris across the whole field (the instanced debris meshes)
  const deb = [[], [], []];
  for (let k = 0; k < 120; k++) {
    const d = scl(norm([R() - 0.5, (R() - 0.5) * 0.6, R() - 0.5]), Rf * Math.pow(R(), 0.6));
    const ax = norm([R() - 0.5, R() - 0.5, R() - 0.5]);
    deb[k % 3].push([d, [ax[0], ax[1], ax[2], 0.1 + R() * 0.6], 0.8 + R() * 2.4, [1, 1, 1], R()]);
  }
  out.graveyard = {
    c,
    R: Rf,
    name: shipName().replace(/^the /i, ''),
    debris: deb.map((list) => {
      const a = new Float32Array(list.length * INST);
      list.forEach((e, j) => instQ(a, j, e[0], e[1], e[2], e[3], e[4]));
      return a;
    }),
  };
}
// the broken ancient ring: a curved band (inner face toward the star), rim walls, jagged broken ends, ruins and one monolith
function genAncientRing(out, C, lm, R, orbit, stars) {
  const Rr = Math.max(edgeOf(out, C, orbit) + 2600, 6000) + R() * 2000;
  const arc = 0.6 + R() * 0.4;
  let a0 = R() * TAU,
    a1 = a0 + arc;
  const W = 300 + R() * 200,
    Th = 26,
    Hw = 44,
    wallT = 14;
  const q = qaxis(norm([R() - 0.5, 0.001, R() - 0.5]), (R() - 0.5) * 0.5);
  // a distant companion star near the ring's distance: the fragment lies on the far side from it
  for (const st of stars) {
    const lp = qrot(qconj(q), sub(st.pos, C));
    if (Math.abs(Math.hypot(lp[0], lp[2]) - Rr) < st.r * 1.05 + 1500) {
      a0 = Math.atan2(lp[2], lp[0]) + Math.PI - arc / 2;
      a1 = a0 + arc;
    }
  }
  const at = (phi, rad, y) => [Math.cos(phi) * rad, y, Math.sin(phi) * rad];
  const K = 8; // the mesh is built in units of K metres and drawn at scale K (the materials' surface detail reads at a sensible size)
  const atK = (phi, rad, y) => [(Math.cos(phi) * rad) / K, y / K, (Math.sin(phi) * rad) / K];
  const jag = (u, side) => 0.012 * arc * Math.sin(u * 37 + side * 11) * Math.sin(u * 13.7 + side); // ragged ends
  const BRONZE = [0.32, 0.27, 0.2],
    DARK = [0.18, 0.16, 0.14];
  const mb = new MB();
  const NU = 140;
  // inner face (toward the star) and outer face of the band; the ends are ragged: each end's angle wobbles across the width
  const phiOf = (u, v) => a0 + jag(v, 0) + u * (arc - jag(v, 0) + jag(v, 1));
  mb.param(NU, 8, (u, v) => atK(phiOf(u, v), Rr, (v - 0.5) * W), { color: BRONZE });
  mb.param(NU, 8, (u, v) => atK(phiOf(1 - u, v), Rr + Th, (v - 0.5) * W), { color: DARK });
  // rim walls on both edges, standing toward the star: outer face, inner face and top of each wall
  for (const sd of [-1, 1]) {
    const ev = sd > 0 ? 1 : 0,
      yO = (sd * W) / 2,
      yI = sd * (W / 2 - wallT);
    for (const yy of [yO, yI])
      mb.param(NU, 2, (u, v) => atK(phiOf(u, ev), Rr + Th - v * (Th + Hw), yy), { color: yy === yO ? DARK : BRONZE });
    mb.param(NU, 1, (u, v) => atK(phiOf(u, ev), Rr - Hw, yI + v * (yO - yI)), { color: DARK });
  }
  // ragged end faces (thickness of the band)
  for (const e of [0, 1]) mb.param(8, 2, (u, v) => atK(e ? phiOf(1, u) : phiOf(0, 1 - u), Rr + v * Th, (u - 0.5) * W), { color: DARK });
  // ruins on the inner face: blocks and towers (ring-local: angle, height across the band, height toward the star)
  const ruins = [];
  const nr = 22 + ((R() * 14) | 0);
  for (let i = 0; i < nr; i++) {
    const phi = a0 + arc * (0.06 + R() * 0.88),
      y = (R() - 0.5) * (W - wallT * 4);
    const hx = 6 + R() * 26,
      hz = 6 + R() * 26,
      hh = 8 + Math.pow(R(), 2) * 70; // a few tall towers
    const ang = (R() - 0.5) * 0.6;
    ruins.push({ phi, y, h: [hh / 2, hx, hz], ang });
    const xf = xfq(qmul(qaxis([0, 1, 0], -phi), qaxis([1, 0, 0], ang)), atK(phi, Rr - hh / 2 + 1, y));
    mb.box(hh / K, (hx * 2) / K, (hz * 2) / K, R() < 0.5 ? BRONZE : DARK, xf);
  }
  // one monolith among the ruins (the same proportions as the home Monolith) and a few glowing glyph panels
  const mphi = a0 + arc * (0.3 + R() * 0.4),
    my = (R() - 0.5) * W * 0.4;
  const mono = new MB();
  mono.box(27 / K, 3 / K, 12 / K, [1, 1, 1], xfq(qaxis([0, 1, 0], -mphi), atK(mphi, Rr - 12.5, my)));
  const glyph = new MB();
  for (let i = 0; i < 5; i++) {
    const phi = a0 + arc * (0.1 + R() * 0.8),
      s = R() < 0.5 ? -1 : 1;
    glyph.box(30 / K, 1.2 / K, 18 / K, [1, 1, 1], xfq(qaxis([0, 1, 0], -phi), atK(phi, Rr - Hw * 0.55, s * (W / 2 - wallT - 0.7))));
  }
  ruins.push({ phi: mphi, y: my, h: [13.5, 1.5, 6], ang: 0, mono: true });
  out.aring = {
    C,
    q,
    Rr,
    a0,
    a1,
    W,
    Th,
    Hw,
    wallT,
    ruins,
    name: lm.name,
    K,
    mesh: finMB(mb),
    mono: finMB(mono),
    glyph: finMB(glyph),
    monoPos: add(C, qrot(q, at(mphi, Rr - 12.5, my))),
  };
  out.radius = Math.max(out.radius, Rr + Th + 1500);
}
// everything of Phase 6E for one system sector. Each part has a hash stream of its own; the ring and a graveyard are placed
// beyond the outer belt when there is one (so OUTER_BELT moves them), and a graveyard's hulls, names and logs use the
// sector's world stream after everything older (genShip, shipName, genLog, free), which keeps older content as it was
function genSector6E(out, meta, C, orbit, free, bakeAo) {
  const e6 = meta.e6;
  if (!e6) return;
  const S = meta.sys;
  const stars = ((S && S.clear) || []).map((c) => ({ pos: c.c, r: c.R })); // what the stars keep clear (a pair's sweep, a far companion)
  const hz = S ? S.hz : e6.hz;
  // a comet's perihelion stays outside 3 radii of the primary and outside the sphere a close pair sweeps (centred on C)
  const reach = Math.max(e6.starR * 3, ...stars.filter((st) => len(sub(st.pos, C)) < 1).map((st) => st.r));
  if (e6.comets) genComets(out, C, e6, mkRng(hash32(meta.seed, 0x6e, 1, 1)), hz, reach, out.radius, stars);
  if (e6.belt) genOuterBelt(out, C, e6, mkRng(hash32(meta.seed, 0x6e, 2, 1)), orbit, stars);
  if (e6.lm && e6.lm.kind === 'ring')
    genAncientRing(out, C, e6.lm, mkRng(hash32(meta.seed, 0x6e, 4, 1)), out.belt ? out.belt.R1 : orbit, stars);
  if (e6.gy) genGraveyard(out, C, e6, mkRng(hash32(meta.seed, 0x6e, 3, 1)), free, out.belt ? out.belt.R1 : orbit, bakeAo);
}
// collision with the ancient ring (ring-local: the band from Rr to Rr + Th, rim walls, ruins as boxes); player pos p
function aringCollide(A, p, pr, push) {
  const lp = qrot(qconj(A.q), sub(p, A.C));
  const rho = Math.hypot(lp[0], lp[2]);
  if (rho < A.Rr - A.Hw - 120 || rho > A.Rr + A.Th + pr + 20 || Math.abs(lp[1]) > A.W / 2 + pr + 20) return;
  let phi = Math.atan2(lp[2], lp[0]);
  while (phi < A.a0) phi += TAU;
  while (phi > A.a0 + TAU) phi -= TAU;
  if (phi > A.a1 + 0.02) return;
  const radial = [lp[0] / rho, 0, lp[2] / rho];
  const out = (n, d) => push(qrot(A.q, n), d);
  if (phi <= A.a1) {
    // the band
    if (Math.abs(lp[1]) < A.W / 2 && rho > A.Rr - pr && rho < A.Rr + A.Th + pr) {
      const din = rho - (A.Rr - pr),
        dout = A.Rr + A.Th + pr - rho;
      if (din < dout) out(scl(radial, -1), din);
      else out(radial, dout);
    }
    // rim walls
    for (const s of [-1, 1]) {
      const y0 = s * (A.W / 2 - A.wallT / 2);
      const dy = lp[1] - y0;
      if (Math.abs(dy) < A.wallT / 2 + pr && rho > A.Rr - A.Hw - pr && rho < A.Rr + 1) {
        const pin = A.wallT / 2 + pr - Math.abs(dy),
          ptop = rho - (A.Rr - A.Hw - pr);
        if (pin < ptop) out([0, Math.sign(dy) || 1, 0], pin);
        else out(scl(radial, -1), ptop);
      }
    }
    // ruins: boxes standing on the inner face
    for (const r of A.ruins) {
      const bq = qmul(qaxis([0, 1, 0], -r.phi), qaxis([1, 0, 0], r.ang));
      const c = [Math.cos(r.phi) * (A.Rr - r.h[0] + 1), r.y, Math.sin(r.phi) * (A.Rr - r.h[0] + 1)];
      const bl = qrot(qconj(bq), sub(lp, c));
      const ex = r.h[0] + pr - Math.abs(bl[0]),
        ey = r.h[1] + pr - Math.abs(bl[1]),
        ez = r.h[2] + pr - Math.abs(bl[2]);
      if (ex > 0 && ey > 0 && ez > 0) {
        const n =
          ex <= ey && ex <= ez ? [Math.sign(bl[0]) || 1, 0, 0] : ey <= ez ? [0, Math.sign(bl[1]) || 1, 0] : [0, 0, Math.sign(bl[2]) || 1];
        out(qrot(bq, n), Math.min(ex, ey, ez));
      }
    }
  }
}
