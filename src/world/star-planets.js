/* ---- star ---- */
const STAR = { pos: [0, 0, 0], r: CFG.STAR_RADIUS, name: nameWord(2) + ' Prime' };
/* ---- planets ---- */
const PAL = {
  0: () => {
    const k = rr(0.8, 1.2);
    return { c1: [0.22 * k, 0.18 * k, 0.16], c2: [0.6 * k, 0.5, 0.4], c3: [0.4, 0.36 * k, 0.3], atmo: [0.6, 0.5, 0.4], ak: 0.25 };
  },
  1: () =>
    pick([
      { c1: [0.85, 0.6, 0.35], c2: [0.95, 0.85, 0.65], c3: [0.6, 0.35, 0.25], atmo: [0.95, 0.75, 0.5], ak: 1.0 },
      { c1: [0.35, 0.5, 0.8], c2: [0.8, 0.85, 0.95], c3: [0.25, 0.35, 0.7], atmo: [0.5, 0.7, 1.0], ak: 1.0 },
      { c1: [0.55, 0.45, 0.7], c2: [0.9, 0.8, 0.9], c3: [0.35, 0.25, 0.5], atmo: [0.8, 0.6, 1.0], ak: 1.0 },
    ]),
  2: () => ({ c1: [0.72, 0.82, 0.93], c2: [0.95, 0.97, 1.0], c3: [0.25, 0.45, 0.8], atmo: [0.5, 0.7, 1.0], ak: 0.6 }),
  3: () => ({ c1: [0.07, 0.05, 0.05], c2: [0.28, 0.2, 0.17], c3: [0.2, 0.1, 0.08], atmo: [0.9, 0.3, 0.1], ak: 0.55 }),
  4: () => ({ c1: [0.04, 0.14, 0.4], c2: [0.18, 0.4, 0.14], c3: [0.45, 0.4, 0.3], atmo: [0.4, 0.6, 1.0], ak: 1.0 }),
  5: () => ({ c1: [0.3, 0.3, 0.3], c2: [0.6, 0.6, 0.58], c3: [0.4, 0.4, 0.42], atmo: [0, 0, 0], ak: 0 }),
};
const TYPENAME = ['rocky world', 'gas giant', 'ice world', 'lava world', 'living world', 'moon'];
const planets = [];
{
  let types = [0, 1, 2, 3, 4, pick([0, 1, 2]), pick([1, 3]), 0];
  for (let i = types.length - 1; i > 0; i--) {
    const j = (rnd() * (i + 1)) | 0;
    [types[i], types[j]] = [types[j], types[i]];
  }
  types = types.slice(0, CFG.PLANET_COUNT);
  if (!types.includes(1)) types[1] = 1;
  const tilt = qaxis([1, 0, 0], rr(-0.15, 0.15));
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const orbit = 800 + i * 600 + rr(0, 150),
      a = rnd() * TAU;
    const pos = qrot(tilt, [Math.cos(a) * orbit, rr(-120, 120), Math.sin(a) * orbit]);
    const r = t === 1 ? rr(220, 320) : rr(75, 150);
    const pal = PAL[t]();
    const p = {
      type: t,
      pos,
      r,
      orbit,
      name: planetName(i),
      pal,
      seed: rr(0, 100),
      axis: norm([rr(-0.4, 0.4), 1, rr(-0.4, 0.4)]),
      spin: rr(0.01, 0.05) * (rnd() < 0.5 ? 1 : -1),
      moons: [],
      ring: null,
      q: qid(),
    };
    const nm = t === 1 ? 2 + ((rnd() * 3) | 0) : (rnd() * 3) | 0;
    for (let k = 0; k < nm; k++) {
      const mr = Math.max(12, r * rr(0.08, 0.2));
      p.moons.push({
        r: mr,
        dist: r * rr(2.6, 5.0) + mr,
        ang: rnd() * TAU,
        w: rr(0.02, 0.08) * (rnd() < 0.3 ? -1 : 1),
        q: qaxis(rdir(), rr(0, 0.6)),
        seed: rr(0, 100),
        pal: PAL[5](),
        pos: [0, 0, 0],
        name: p.name + ' ' + pick(['a', 'b', 'c', 'd']),
      });
    }
    planets.push(p);
  }
  const ringed = planets.find((p) => p.type === 1) || planets[1];
  ringed.ring = { in: ringed.r * 1.45, out: ringed.r * 2.7, q: qaxis(rdir(), rr(0.1, 0.5)), seed: rr(0, 100) };
}
// ring disk: x = 0 (inner edge) .. 1 (outer edge); actual radii come from uIn/uOut so every ringed planet shares the mesh
const ringMesh = (() => {
  const pos = [],
    idx = [];
  const N = 128;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    pos.push(0, a, 1, a);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return makeSimple(pos, idx, 2);
})();
