/* ---- asteroid ---- */
function asteroidMesh(seed) {
  const s = seed * 17.3;
  return icoMesh(
    2,
    (d) => 0.75 + 0.5 * fbm3(d[0] * 2.2 + s, d[1] * 2.2, d[2] * 2.2, 3) + 0.15 * (vn3(d[0] * 6 + s, d[1] * 6, d[2] * 6) - 0.5),
    (d) => {
      const k = 0.8 + 0.4 * vn3(d[0] * 4 + s, d[1] * 4, d[2] * 4);
      return [0.5 * k, 0.47 * k, 0.44 * k];
    },
  );
}
/* ---- derelict ship generator ---- */
const HULLCOLS = [
  [0.58, 0.6, 0.63],
  [0.62, 0.52, 0.46],
  [0.47, 0.53, 0.58],
  [0.66, 0.64, 0.58],
  [0.5, 0.5, 0.55],
];
function genShip(big) {
  const hull = new MB(),
    panels = new MB(),
    lights = new MB();
  const col = pick(HULLCOLS);
  const L = big ? 130 : rr(45, 95),
    R = big ? 14 : rr(3.5, 9);
  const n = 9;
  const prof = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = R * (0.25 + 0.75 * Math.pow(Math.sin(PI * Math.pow(t, 0.8)), 0.5)) * (big ? 1 : rr(0.8, 1.15));
    if (i === 0) r = R * 0.08;
    if (i === n) r = R * 0.55;
    prof.push([(t - 0.5) * L, r]);
  }
  const breaches = [];
  const nb = big ? 1 : 1 + ((rnd() * 2) | 0);
  for (let k = 0; k < nb; k++)
    breaches.push(big ? { u: 0.115, v: 0.4, du: 0.065, dv: 0.1 } : { u: rnd(), v: rr(0.2, 0.8), du: rr(0.03, 0.07), dv: rr(0.04, 0.1) });
  hull.lathe(prof, big ? 48 : 28, col, {
    sub: 3,
    skip: (u, v) => {
      for (const b of breaches) {
        const duu = Math.min(Math.abs(u - b.u), 1 - Math.abs(u - b.u));
        if (duu < b.du * (0.8 + 0.5 * hash3(u * 40, v * 40, 1)) && Math.abs(v - b.v) < b.dv * (0.8 + 0.5 * hash3(v * 50, u * 30, 2)))
          return true;
      }
      return hash3(u * 97, v * 61, 3) > (big ? 0.992 : 0.94);
    },
  });
  // ribs
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const rad = prof[k][1] * 0.92;
    hull.torus(rad, Math.max(0.12, R * 0.03), [0.3, 0.3, 0.32], xfq(qaxis([0, 0, 1], PI / 2), [(t - 0.5) * L, 0, 0]), big ? 40 : 20, 6);
  }
  // fins
  const nf = 2 + ((rnd() * 3) | 0);
  for (let k = 0; k < nf; k++) {
    const a = (k / nf) * TAU + rr(0, 0.3);
    const fl = R * rr(1.5, 3),
      broken = rnd() < 0.35;
    const q = qaxis([1, 0, 0], a);
    hull.box(
      L * 0.18,
      fl * (broken ? 0.45 : 1),
      R * 0.08,
      col,
      xfq(q, qrot(q, [-L * 0.36, prof[1][1] * 0.8 + fl * (broken ? 0.22 : 0.5), 0])),
    );
  }
  // antennas
  const na = 2 + ((rnd() * 4) | 0);
  for (let k = 0; k < na; k++) {
    const t = rr(0.15, 0.85),
      a = rnd() * TAU,
      al = R * rr(0.8, 2.5);
    const rad = prof[Math.round(t * n)][1];
    const dir = [0, Math.cos(a), Math.sin(a)];
    hull.cyl(R * 0.03, R * 0.015, al, 6, [0.35, 0.35, 0.38], xfq(qlookY(dir), [(t - 0.5) * L, dir[1] * rad * 0.95, dir[2] * rad * 0.95]));
    hull.sphere(R * 0.05, [0.4, 0.4, 0.42], xfq(Q0, [(t - 0.5) * L, dir[1] * (rad + al), dir[2] * (rad + al)]), 1, 5);
  }
  // engines
  const ne = 1 + ((rnd() * 3) | 0);
  for (let k = 0; k < ne; k++) {
    const a = (k / ne) * TAU,
      off = ne > 1 ? R * 0.45 : 0;
    hull.cyl(
      R * 0.25,
      R * 0.42,
      R * 0.9,
      12,
      [0.25, 0.25, 0.27],
      xfq(qaxis([0, 0, 1], PI / 2), [-L * 0.5, Math.cos(a) * off, Math.sin(a) * off]),
    );
  }
  // solar wings
  const wl = big ? L * 0.35 : L * rr(0.3, 0.6),
    ww = big ? R * 1.6 : R * rr(1.2, 2.0);
  const t0 = big ? 0.3 : rr(0.35, 0.6);
  const rad0 = prof[Math.round(t0 * n)][1];
  for (const s of [1, -1]) {
    const broken = rnd() < 0.4;
    const wl2 = broken ? wl * 0.5 : wl;
    const q = qaxis([1, 0, 0], rr(-0.2, 0.2) + (s < 0 ? PI : 0));
    panels.box(ww, 0.12, wl2, [1, 1, 1], xfq(q, qrot(q, [(t0 - 0.5) * L, 0, rad0 + R * 0.3 + wl2 / 2])));
    hull.box(ww * 0.15, R * 0.2, R * 0.6, [0.3, 0.3, 0.32], xfq(q, qrot(q, [(t0 - 0.5) * L, 0, rad0 + R * 0.15])));
  }
  // navigation lights (dead, some flicker)
  for (let k = 0; k < (big ? 10 : 4); k++) {
    const t = rr(0.1, 0.9),
      a = rnd() * TAU;
    const rad = prof[Math.round(t * n)][1] * 1.01;
    lights.box(
      R * 0.06,
      R * 0.06,
      R * 0.06,
      pick([
        [1, 0.2, 0.1],
        [0.2, 1, 0.3],
        [1, 0.8, 0.3],
      ]),
      xfq(Q0, [(t - 0.5) * L, Math.cos(a) * rad, Math.sin(a) * rad]),
    );
  }
  const interior = new MB(),
    lightList = [],
    crates = [];
  let artifact = null;
  if (big) {
    const c7 = [0.35, 0.36, 0.4];
    interior.box(L * 0.7, 0.6, R * 1.1, c7, xfq(Q0, [0, -R * 0.5, 0]));
    for (let k = 0; k < 12; k++)
      interior.cyl(
        0.35,
        0.35,
        L * 0.6,
        6,
        [0.3, 0.3, 0.33],
        xfq(qaxis([0, 0, 1], -PI / 2), [-L * 0.3, R * 0.72 + Math.sin(k) * 1.2, (k - 5.5) * 1.2]),
      );
    // crates: identical rnd() call order as before (keeps every seed's world unchanged); x is nudged out of bulkheads/corridor (Phase 5A)
    for (let k = 0; k < 22; k++) {
      const s = rr(1.5, 3.2);
      const d = s * rr(1, 1.6);
      const ang = rnd() * TAU;
      let x = rr(-L * 0.3, L * 0.3);
      const y = -R * 0.5 + s / 2 + 0.3;
      const z = rr(-R * 0.45, R * 0.45);
      x = crateClear(x, s, d, z);
      interior.box(s, s, d, c7, xfq(qaxis([0, 1, 0], ang), [x, y, z]));
      crates.push({ p: [x, y, z], h: [s / 2, s / 2, d / 2], ang });
    }
    for (let k = 0; k < 8; k++) {
      const x = (k / 7 - 0.5) * L * 0.6,
        side = k % 2 ? 1 : -1;
      const p = [x, R * 0.45, side * R * 0.65];
      const c = pick([
        [1, 0.25, 0.12],
        [1, 0.6, 0.2],
        [0.4, 0.8, 1],
      ]);
      lights.sphere(0.45, c, xfq(Q0, p), 1, 6);
      lightList.push({ p, c, ph: rnd() * 10 });
    }
    artifact = { p: [L * 0.4, -R * 0.1, 0], mb: icoMesh(1, (d) => 1 + 0.15 * vn3(d[0] * 3, d[1] * 3, d[2] * 3), [0.3, 0.9, 1.0]) };
  }
  // Breach marker (wreck 0): a ring of green lamps on the hull rim around the hole + one lamp at its centre.
  let marker = null;
  if (big) {
    const b = breaches[0];
    marker = new MB();
    const pr = (v) => {
      const n = prof.length - 1;
      const t = clamp(v, 0, 1) * n,
        k = Math.min(n - 1, Math.floor(t));
      return lerp(prof[k][1], prof[k + 1][1], t - k);
    };
    const place = (u, v, r, size) => {
      const a = u * TAU,
        rad = pr(v) * 1.03;
      marker.sphere(size, [0.35, 1.0, 0.45], xfq(Q0, [(v - 0.5) * L, rad * Math.cos(a), rad * Math.sin(a)]), 1, 6);
    };
    place(b.u, b.v, 0, 0.9);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      place(b.u + Math.cos(a) * b.du * 1.15, b.v + Math.sin(a) * b.dv * 1.15, 0, 0.45);
    }
  }
  return {
    hull,
    panels,
    lights,
    interior,
    lightList,
    crates,
    artifact,
    marker,
    L,
    R,
    prof,
    breach: breaches[0],
    rad: Math.hypot(L / 2, R * 2.5 + wl),
  };
}
// wreck 0 interior layout (hull-local x, metres): bulkhead stations and the service corridor. Shared by genShip (crate placement) and the interior module.
const BULKHEADS = [-30, 3, 20, 26, 38],
  CORRIDOR = [20, 26];
function crateClear(x, s, d, z) {
  const m = Math.max(s, d) * 0.75 + 1.6 + (Math.abs(z) < 4.5 ? 3 : 0); // keep doorways (|z|<3) clearif(x>CORRIDOR[0]-m&&x<CORRIDOR[1]+m)return x<(CORRIDOR[0]+CORRIDOR[1])/2?CORRIDOR[0]-m:CORRIDOR[1]+m;
  for (const b of BULKHEADS) if (Math.abs(x - b) < m) return x < b ? b - m : b + m;
  return x;
}
function qlookY(dir) {
  const d = norm(dir);
  const a = Math.acos(clamp(d[1], -1, 1));
  const ax = cross([0, 1, 0], d);
  return len(ax) < 1e-5 ? (d[1] > 0 ? qid() : qaxis([1, 0, 0], PI)) : qaxis(ax, a);
}
