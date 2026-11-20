/* =====================================================================
   STAR CLASSES AND MULTIPLE-STAR SYSTEMS (Phase 6C)
   A generated sector's stars come from a stream of their own (hash of seed + cell, mixed with a salt), never from the
   stream the old sector summary used, so existence, position and name of every system stay as before and the
   sector's world RNG (genSector) is untouched. CFG.STAR_VARIETY = false gives back the old stars exactly.
     single  one star at the system centre (about 4 systems in 5): planets, wrecks, beacon, medusae exactly as before
     close   two stars circling their centre of mass; the planets orbit beyond CFG.BINARY_CLEAR pair separations
     wide    a distant companion (CFG.WIDE_DIST); the planets keep orbiting the primary, well inside 0.28 x that distance
     triple  a close pair plus a distant third star (rare)
   Two lights per object at most (CFG.STAR_LIGHTS): the primary and the close partner (or, dimmed, the distant
   companion). The distant third star of a triple shines in the sky but lights nothing.
   The home star keeps its look unless CFG.HOME_STAR_VARIETY is on; then it gets a class (never a companion), after
   the home world has been generated, so planets, belt, wrecks and creatures stay where they are.
   ===================================================================== */
// shader constants the class colours are expressed against (planet.js type 7, billboard-points.js corona)
const SURF_COOL = [1.0, 0.35, 0.05],
  SURF_HOT = [1.0, 0.9, 0.6],
  COR_OUT = [1.0, 0.45, 0.1],
  COR_IN = [1.0, 0.85, 0.6],
  BASE_SUNCOL = [1.0, 0.93, 0.8]; // the home star's light as it has always been (SUNCOL before any HOME_STAR_VARIETY change)
// w: weight · r: radius range (m) · I: light intensity · lum: luminosity vs 'G' (habitable distance ~ sqrt(lum)) ·
// mass: gravity multiplier on top of the r^3 rule (compact stars pull far harder than their size) · om: mass for the
// centre of mass of a pair · cs: corona size (x r) · cb / sb: corona / surface brightness · flick: flicker (0-1) ·
// vr: smallest size of its dot on the map and in the sky · age: [min, max, 'g' (billion years) | 'm' (million years)]
const STAR_CLS = {
  M: {
    w: 30,
    r: [75, 120],
    I: 0.74,
    lum: 0.12,
    mass: 1.4,
    om: 0.4,
    cs: 3.4,
    cb: 0.9,
    sb: 0.38,
    flick: 0,
    vr: 0,
    light: [1.0, 0.66, 0.46],
    sky: [1.0, 0.56, 0.4],
    cool: [0.72, 0.12, 0.03],
    hot: [1.0, 0.5, 0.22],
    corO: [1.0, 0.3, 0.08],
    corI: [1.0, 0.58, 0.36],
    flare: [1.0, 0.58, 0.42],
    age: [2, 13, 'g'],
  },
  K: {
    w: 22,
    r: [120, 190],
    I: 0.88,
    lum: 0.45,
    mass: 1.15,
    om: 0.75,
    cs: 3.4,
    cb: 1,
    sb: 0.62,
    flick: 0,
    vr: 0,
    light: [1.0, 0.82, 0.62],
    sky: [1.0, 0.76, 0.52],
    cool: [1.0, 0.3, 0.05],
    hot: [1.0, 0.8, 0.48],
    corO: [1.0, 0.4, 0.1],
    corI: [1.0, 0.78, 0.52],
    flare: [1.0, 0.78, 0.55],
    age: [1, 12, 'g'],
  },
  G: {
    w: 18,
    r: [170, 260],
    I: 1,
    lum: 1,
    mass: 1,
    om: 1,
    cs: 3.4,
    cb: 1,
    sb: 1,
    flick: 0,
    vr: 0,
    light: [1.0, 0.93, 0.8],
    sky: [1.0, 0.92, 0.78],
    cool: [1.0, 0.35, 0.05],
    hot: [1.0, 0.9, 0.6],
    corO: [1.0, 0.45, 0.1],
    corI: [1.0, 0.85, 0.6],
    flare: [1.0, 0.85, 0.6],
    age: [0.8, 10, 'g'],
  },
  F: {
    w: 12,
    r: [200, 300],
    I: 1.1,
    lum: 2.2,
    mass: 0.9,
    om: 1.35,
    cs: 3.6,
    cb: 1.05,
    sb: 0.95,
    flick: 0,
    vr: 0,
    light: [0.97, 0.97, 1.0],
    sky: [0.95, 0.96, 1.0],
    cool: [1.0, 0.7, 0.4],
    hot: [1.0, 0.97, 0.92],
    corO: [1.0, 0.72, 0.48],
    corI: [0.96, 0.96, 1.0],
    flare: [0.96, 0.96, 1.0],
    age: [0.5, 4, 'g'],
  },
  O: {
    w: 4,
    r: [360, 480],
    I: 1.32,
    lum: 9,
    mass: 0.55,
    om: 12,
    cs: 4.2,
    cb: 1.2,
    sb: 1,
    flick: 0,
    vr: 0,
    light: [0.74, 0.84, 1.0],
    sky: [0.66, 0.78, 1.0],
    cool: [0.35, 0.5, 1.0],
    hot: [0.86, 0.92, 1.0],
    corO: [0.38, 0.52, 1.0],
    corI: [0.82, 0.9, 1.0],
    flare: [0.72, 0.82, 1.0],
    age: [2, 40, 'm'],
  },
  D: {
    w: 7,
    r: [28, 45],
    I: 0.92,
    lum: 0.06,
    mass: 20,
    om: 0.6,
    cs: 10,
    cb: 0.9,
    sb: 1.2,
    flick: 0,
    vr: 120,
    light: [0.88, 0.92, 1.0],
    sky: [0.86, 0.9, 1.0],
    cool: [0.72, 0.8, 1.0],
    hot: [1.0, 1.0, 1.0],
    corO: [0.66, 0.76, 1.0],
    corI: [0.94, 0.96, 1.0],
    flare: [0.86, 0.9, 1.0],
    age: [1, 11, 'g'],
  },
  N: {
    w: 1,
    r: [14, 20],
    I: 0.68,
    lum: 0.02,
    mass: 300,
    om: 1.4,
    cs: 18,
    cb: 0.85,
    sb: 1.3,
    flick: 0.35,
    vr: 150,
    light: [0.76, 0.82, 1.0],
    sky: [0.72, 0.8, 1.0],
    cool: [0.5, 0.6, 1.0],
    hot: [0.92, 0.95, 1.0],
    corO: [0.52, 0.56, 1.0],
    corI: [0.86, 0.9, 1.0],
    flare: [0.64, 0.66, 1.0],
    age: [1, 120, 'm'],
  },
};
// brightest first: a companion that outshines the drawn primary takes its place
const STAR_RANK = ['O', 'F', 'G', 'K', 'M', 'D', 'N'];
const vdiv = (a, b) => [a[0] / b[0], a[1] / b[1], a[2] / b[2]];
function pickStarClass(x) {
  let tot = 0;
  for (const k of STAR_RANK) tot += STAR_CLS[k].w;
  let v = x * tot;
  for (const k of STAR_RANK) {
    v -= STAR_CLS[k].w;
    if (v < 0) return k;
  }
  return 'M';
}
// a star of class cls; g = its random stream (always 2 draws)
function mkStar(cls, g) {
  const c = STAR_CLS[cls];
  const r = c.r[0] + g() * (c.r[1] - c.r[0]);
  const j = 0.94 + g() * 0.12; // a little spread of brightness within the class
  return {
    cls,
    r,
    mass: c.mass,
    lum: c.lum,
    om: c.om,
    col: c.light.map((v) => v * c.I * j),
    tint: c.sky.slice(),
    pal: { c1: [c.sb, c.sb, c.sb], c2: vdiv(c.cool, SURF_COOL), c3: vdiv(c.hot, SURF_HOT), atmo: [0, 0, 0], ak: c.flick },
    cor: { a: vdiv(c.corO, COR_OUT), b: vdiv(c.corI, COR_IN), k: c.cs, i: c.cb, f: c.flick },
    flare: c.flare.slice(),
    vr: Math.max(r, c.vr),
  };
}
function gDir(g) {
  const z = g() * 2 - 1,
    a = g() * TAU,
    s = Math.sqrt(Math.max(0, 1 - z * z));
  return [s * Math.cos(a), z, s * Math.sin(a)];
}
// the stars of a generated sector (a fixed number of draws, whatever the outcome, so one switch never shifts the others)
function buildStarSystem(m) {
  const g = mkRng(hash32(CFG.SEED ^ 0x7a3b19e5, m.sx, m.sy, m.sz));
  const cls = [pickStarClass(g()), pickStarClass(g()), pickStarClass(g())];
  const u = [g(), g(), g()];
  const n = gDir(g),
    wdir = gDir(g);
  const per = g(),
    ph = g(),
    sepK = g(),
    wd = g(),
    spin = g() < 0.5 ? -1 : 1;
  const S = cls.map((c) => mkStar(c, g));
  const kind = u[0] < CFG.BINARY_CHANCE ? (u[1] < CFG.TRINARY_SHARE ? 'triple' : u[2] < CFG.WIDE_SHARE ? 'wide' : 'close') : 'single';
  const rank = (s) => STAR_RANK.indexOf(s.cls);
  let A = S[0],
    B = S[1];
  if (kind !== 'single' && rank(B) < rank(A)) [A, B] = [B, A]; // the brighter star is the primary
  const C = m.star;
  A.name = m.name;
  A.pos = C.slice();
  A.light = 1;
  const stars = [A];
  const sys = { kind, stars, center: C, lum: A.lum, clear: [], inner: 0, orbit: null, wr: 0 };
  if (kind === 'close' || kind === 'triple') {
    const a = (A.r + B.r) * (2.4 + 1.2 * sepK) + 150; // separation of the pair's centres
    const e = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])),
      f = cross(n, e);
    const dA = (a * B.om) / (A.om + B.om),
      dB = a - dA;
    sys.orbit = {
      e,
      f,
      dA,
      dB,
      w: (spin * TAU) / (CFG.BINARY_PERIOD[0] + per * (CFG.BINARY_PERIOD[1] - CFG.BINARY_PERIOD[0])),
      ph: ph * TAU,
      a,
    };
    B.name = m.name + ' B';
    B.pos = C.slice();
    B.light = 1;
    B.lead = A; // a close pair has one voice: the primary's (audio/star-voice.js)
    stars.push(B);
    sys.lum += B.lum;
    const reach = Math.max(dA + A.r, dB + B.r);
    sys.inner = CFG.BINARY_CLEAR * a;
    sys.clear.push({ c: C.slice(), R: reach });
    sys.wr = reach * 2.2;
    starOrbit(sys, 0);
  }
  if (kind === 'wide' || kind === 'triple') {
    const W = kind === 'wide' ? B : S[2];
    const D = CFG.WIDE_DIST[0] + wd * (CFG.WIDE_DIST[1] - CFG.WIDE_DIST[0]);
    W.name = m.name + (kind === 'wide' ? ' B' : ' C');
    W.pos = add(C, scl(wdir, D));
    W.light = kind === 'wide' ? CFG.WIDE_LIGHT : 0; // the third star of a triple lights nothing (two lights at most)
    W.far = true;
    stars.push(W);
    sys.clear.push({ c: W.pos.slice(), R: W.r });
  }
  for (const st of stars) {
    st.kind = kind;
    st.mates = stars.filter((o) => o !== st).map((o) => o.name); // shown by the scanner
  }
  sys.hz = CFG.HZ_BASE * Math.sqrt(sys.lum);
  return sys;
}
// close pair at time t: the stars' positions are updated in place (everything holds references to these arrays)
function starOrbit(sys, t) {
  const o = sys.orbit;
  if (!o) return;
  const th = o.ph + o.w * t,
    c = Math.cos(th),
    s = Math.sin(th);
  const d = [o.e[0] * c + o.f[0] * s, o.e[1] * c + o.f[1] * s, o.e[2] * c + o.f[2] * s];
  const [A, B] = sys.stars,
    C = sys.center;
  for (let i = 0; i < 3; i++) {
    A.pos[i] = C[i] + d[i] * o.dA;
    B.pos[i] = C[i] - d[i] * o.dB;
  }
}
// what the generator needs (plain data: it is posted to the worker)
function sectorMsg(meta) {
  const s = meta.sys;
  return {
    key: meta.key,
    star: meta.star,
    seed: meta.seed,
    sys:
      s && s.kind !== 'single'
        ? { kind: s.kind, inner: s.inner, clear: s.clear, hz: s.hz, plaus: CFG.PLAUSIBILITY }
        : s
          ? { kind: 'single', hz: s.hz, plaus: CFG.PLAUSIBILITY }
          : undefined,
    // Phase 6D: planet variety (habitable distance and primary class steer the new types) and the rogue planet of a starless sector
    pv: CFG.PLANET_VARIETY
      ? {
          hz: s ? s.hz : CFG.HZ_BASE,
          cls: s ? s.stars[0].cls : 'G',
          k: CFG.NEW_TYPES_SCALE,
          ring: CFG.RING_EXTRA,
          plume: CFG.PLUME_MOONS_MAX,
        }
      : null,
    rogue: meta.rogue || null,
    // Phase 6E: small bodies, outer belt, graveyard and landmark settings (the generator never reads CFG: it may run in the worker)
    e6: {
      comets: CFG.COMETS ? [CFG.COMET_CHANCE, CFG.COMETS_MAX] : null,
      belt: CFG.OUTER_BELT ? [CFG.OUTER_BELT_CHANCE, CFG.OUTER_BELT_ROCKS, CFG.EDGE_DWARFS_MAX] : null,
      gy: meta.graveyard ? [CFG.GRAVEYARD_WRECKS, Math.max(1, Math.min(2, CFG.GRAVEYARD_ENTER))] : null,
      lm: meta.landmark || null,
      hz: s ? s.hz : CFG.HZ_BASE,
      starR: meta.r,
    },
  };
}
// soft light plausibility (inside genSector, worker too): living worlds in the habitable band, lava worlds close, ice worlds far.
// Only ice (2), lava (3) and living (4) are swapped among each other: they draw the same random numbers, so the rest of the
// sector is generated exactly as before. A separate hash decides, never the world RNG.
function plausibleType(t, orbit, sys, seed, i) {
  if (!sys || !(sys.hz > 0) || !(sys.plaus > 0) || (t !== 2 && t !== 3 && t !== 4)) return t;
  const x = orbit / sys.hz;
  let want = t;
  if (t === 4) want = x < 0.6 ? 3 : x > 1.7 ? 2 : 4;
  else if (t === 3 && x > 1.3) want = 2;
  else if (t === 2 && x < 0.6) want = 3;
  if (want === t) return t;
  return hash32(seed, i, 0x6c, 4) / 4294967296 < sys.plaus ? want : t;
}
/* ---- the home star (HOME_STAR_VARIETY) ---- */
const HOME_STAR = { cls: null, tint: [1, 1, 1], pal: null, cor: null, flare: null, mass: 1, lum: 1 };
if (CFG.HOME_STAR_VARIETY) {
  const g = mkRng(hash32(CFG.SEED ^ 0x7a3b19e5, 0, 0, 0));
  const s = mkStar(pickStarClass(g()), g);
  // the home world was generated around a 230 m star; the inner planets start ~800 m out, so the radius stays below 420 m
  STAR.r = clamp(s.r, 14, 420);
  for (let i = 0; i < 3; i++) SUNCOL[i] = s.col[i];
  Object.assign(HOME_STAR, {
    cls: s.cls,
    tint: s.tint,
    pal: s.pal,
    cor: s.cor,
    flare: s.flare,
    mass: s.mass,
    lum: s.lum,
    vr: Math.max(STAR.r, STAR_CLS[s.cls].vr),
  });
  const hp = POI.find((p) => p.kind === 'star' && p.pos === STAR.pos); // the home star's scanner / HUD entry
  if (hp) {
    hp.r = STAR.r;
    hp.sclass = s.cls;
    Object.defineProperty(hp, 'sub', { get: () => t('cls.star' + s.cls), configurable: true });
  }
}
// the home star as a render / gravity / scanner object
function homeStarObj() {
  return {
    pos: STAR.pos,
    r: STAR.r,
    col: SUNCOL,
    tint: HOME_STAR.cls ? HOME_STAR.tint : [1, 1, 1],
    name: STAR.name,
    home: true,
    cls: HOME_STAR.cls,
    pal: HOME_STAR.pal,
    cor: HOME_STAR.cor,
    flare: HOME_STAR.flare,
    mass: HOME_STAR.cls ? HOME_STAR.mass : undefined,
    light: 1,
  };
}
// scanner / codex class of a star object ('star' = the old main-sequence entry)
const starScanCls = (s) => (s && s.cls ? 'star' + s.cls : 'star');
