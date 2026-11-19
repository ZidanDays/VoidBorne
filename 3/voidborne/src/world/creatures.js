/* ---- creatures ---- */
const MINN = { n: CFG.MINNOW_SCHOOLS * CFG.MINNOWS_PER_SCHOOL, schools: [], pos: null, vel: null, inst: null, mesh: null, found: false };
{
  const cols = [
    [0.3, 0.9, 1.0],
    [1.0, 0.35, 0.8],
    [0.5, 1.0, 0.4],
    [1.0, 0.75, 0.3],
    [0.7, 0.8, 1.0],
    [0.7, 0.4, 1.0],
  ];
  const beh = ['shy', 'curious', 'calm'];
  MINN.pos = new Float32Array(MINN.n * 3);
  MINN.vel = new Float32Array(MINN.n * 3);
  MINN.inst = new Float32Array(MINN.n * INST);
  for (let s = 0; s < CFG.MINNOW_SCHOOLS; s++) {
    const home = freeSpot(700, 4200, 300);
    const sc = {
      home,
      c: cols[s % cols.length],
      beh: beh[s % 3],
      n: CFG.MINNOWS_PER_SCHOOL,
      start: s * CFG.MINNOWS_PER_SCHOOL,
      wander: rdir(),
      wt: 0,
    };
    MINN.schools.push(sc);
    for (let i = 0; i < sc.n; i++) {
      const k = sc.start + i;
      const p = add(home, scl(rdir(), rr(0, 40)));
      const v = scl(rdir(), 10);
      MINN.pos.set(p, k * 3);
      MINN.vel.set(v, k * 3);
      instQ(MINN.inst, k, p, qid(), rr(1.2, 2.2), sc.c, rnd() * 10);
    }
  }
  MINN.mesh = makeMesh(minnowMesh(), MINN.inst, 'q', true);
}
// point-sprite VAO that reads head positions/colours straight out of the minnow instance buffer
function buildGlowVAO() {
  MINN.glowVAO = gl.createVertexArray();
  gl.bindVertexArray(MINN.glowVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, MINN.mesh.ivbo);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, INST * 4, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, INST * 4, 12);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, INST * 4, 32);
  gl.bindVertexArray(null);
}
buildGlowVAO();
const whales = [];
const whaleMB = whaleMesh();
for (let i = 0; i < CFG.WHALE_COUNT; i++) {
  const c = freeSpot(900, 3800, 500);
  const r1 = rr(500, 900);
  whales.push({
    name: 'a void leviathan',
    c,
    r1,
    r2: r1 * 0.35,
    w: 11 / r1,
    ph: rnd() * TAU,
    ph2: rnd() * TAU,
    tilt: qaxis(rdir(), rr(0, 1)),
    pos: [0, 0, 0],
    q: qid(),
    scale: rr(90, 130),
    mesh: makeMesh(whaleMB, single(c, qid(), 100, [1, 1, 1], rnd() * 10), 'q', true),
    found: false,
    callT: rr(5, 20),
  });
}
// keep every whale's figure-eight path well clear of the star (found by tools/seed-test.mjs: on some seeds a path crossed the star);
// only the path radius is shrunk after generation, so the world RNG and every other object stay exactly the same
for (const w of whales) {
  const lim = len(w.c) - STAR.r * 1.6 - w.scale;
  if (w.r1 > lim) {
    const k = Math.max(150, lim) / w.r1;
    w.r1 *= k;
    w.r2 *= k;
    w.w = 11 / w.r1;
  }
}
const medusae = { list: [], inst: null, mesh: null, found: false };
{
  const cols = [
    [0.8, 0.5, 1.0],
    [0.5, 0.7, 1.0],
    [1.0, 0.6, 0.8],
  ];
  const centers = [freeSpot(800, 3500, 400), add(station.pos, scl(rdir(), station.rad * 1.6))];
  medusae.inst = new Float32Array(CFG.MEDUSA_COUNT * INST);
  for (let i = 0; i < CFG.MEDUSA_COUNT; i++) {
    const c = centers[i % 2];
    const p = add(c, scl(rdir(), rr(10, 160)));
    const m = { p, home: c, c: pick(cols), s: rr(5, 13), ph: rnd() * 10, q: qaxis(rdir(), rr(0, 0.6)), glow: 0 };
    medusae.list.push(m);
    instQ(medusae.inst, i, p, m.q, m.s, m.c, m.ph);
  }
  medusae.mesh = makeMesh(medusaMesh(), medusae.inst, 'q', true);
}
