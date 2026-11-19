/* ---- colony ring station ---- */
function genStation() {
  const hull = new MB(),
    lights = new MB();
  const col = [0.62, 0.64, 0.68];
  const R = 420,
    r = 42;
  hull.torus(R, r, col, xfq(Q0, [0, 0, 0]), 110, 22);
  hull.torus(R, r * 0.3, [0.3, 0.3, 0.34], xfq(Q0, [0, r * 0.9, 0]), 110, 8);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const q = qaxis([0, 1, 0], -a);
    hull.cyl(11, 11, R - 70, 10, [0.5, 0.52, 0.56], xfq(qmul(q, qaxis([0, 0, 1], -PI / 2)), [Math.cos(a) * 70, 0, Math.sin(a) * 70]));
  }
  hull.cyl(80, 80, 220, 36, col, xfq(Q0, [0, -110, 0]));
  hull.cyl(80, 0, 40, 36, [0.45, 0.47, 0.5], xfq(Q0, [0, 110, 0]));
  hull.cyl(80, 0, 40, 36, [0.45, 0.47, 0.5], xfq(qaxis([1, 0, 0], PI), [0, -110, 0]));
  hull.cyl(3, 1.5, 320, 6, [0.4, 0.4, 0.42], xfq(Q0, [0, 150, 0]));
  hull.sphere(8, [0.4, 0.4, 0.42], xfq(Q0, [0, 470, 0]), 1, 8);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    hull.box(90, 8, 14, [0.5, 0.5, 0.55], xfq(qaxis([0, 1, 0], -a), [Math.cos(a) * 120, -60 + k * 30, Math.sin(a) * 120]));
  }
  for (let k = 0; k < 160; k++) {
    const a = (k / 160) * TAU;
    const p = [Math.cos(a) * (R + r * 0.98), ((k % 3) - 1) * 9, Math.sin(a) * (R + r * 0.98)];
    lights.box(1.6, 1.6, 0.5, k % 5 ? [1, 0.2, 0.1] : [0.3, 0.7, 1], xfq(qaxis([0, 1, 0], -a), p));
  }
  for (let k = 0; k < 30; k++) {
    const a = rnd() * TAU;
    lights.box(2.2, 2.2, 0.6, [1, 0.75, 0.4], xfq(qaxis([0, 1, 0], -a), [Math.cos(a) * 81, rr(-90, 90), Math.sin(a) * 81]));
  }
  return { hull, lights, R, r };
}
/* ---- creatures ---- */
function whaleMesh() {
  const m = new MB();
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    prof.push([t - 0.55, 0.085 * Math.pow(Math.sin(PI * Math.pow(t, 0.75)), 0.65) * (0.35 + 0.65 * smooth(0, 0.3, t)) + 0.004]);
  }
  m.lathe(prof, 16, [1, 1, 1], { sub: 2 });
  const fc = [0.9, 0.9, 0.95];
  m.tri([-0.52, 0, 0], [-0.72, 0, 0.16], [-0.6, 0, 0], fc);
  m.tri([-0.52, 0, 0], [-0.6, 0, 0], [-0.72, 0, -0.16], fc);
  m.tri([0.1, -0.04, 0.05], [-0.1, -0.07, 0.22], [-0.05, -0.03, 0.1], fc);
  m.tri([0.1, -0.04, -0.05], [-0.05, -0.03, -0.1], [-0.1, -0.07, -0.22], fc);
  for (let k = 0; k < 6; k++) m.box(0.03, 0.025, 0.012, fc, xfq(Q0, [-0.1 - k * 0.06, 0.07 - k * 0.006, 0]));
  return m;
}
function medusaMesh() {
  const m = new MB();
  const bc = [0.7, 0.5, 1.0];
  m.param(
    24,
    10,
    (u, v) => {
      const a = u * TAU,
        ph = v * 1.85;
      const r = Math.sin(ph);
      return [r * Math.cos(a), Math.cos(ph) * 0.7, r * Math.sin(a)];
    },
    { color: bc },
  );
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU,
      r = 0.8 + rnd() * 0.12;
    m.param(
      1,
      8,
      (u, v) => [r * Math.cos(a) + (u - 0.5) * 0.05 + Math.sin(v * 7 + k) * 0.05, -0.1 - v * 2.0, r * Math.sin(a) + (u - 0.5) * 0.05],
      { color: [0.8, 0.6, 1.0] },
    );
  }
  for (let k = 0; k < 4; k++) {
    const q = qaxis([0, 1, 0], (k / 4) * TAU);
    m.param(
      2,
      10,
      (u, v) => [(u - 0.5) * 0.2 * (1 - v * 0.5) + Math.sin(v * 11 + k) * 0.06, -0.15 - v * 1.4, 0.12 + Math.cos(v * 9) * 0.05],
      { color: [0.75, 0.55, 1.0], xf: xfq(q, [0, 0, 0]) },
    );
  }
  return m;
}
function minnowMesh() {
  const m = new MB();
  m.lathe(
    [
      [-0.5, 0.01],
      [-0.2, 0.08],
      [0.15, 0.12],
      [0.4, 0.07],
      [0.5, 0.01],
    ],
    8,
    [1, 1, 1],
  );
  const fc = [1, 1, 1];
  m.tri([0.05, 0, 0.06], [-0.15, -0.02, 0.22], [-0.1, 0.02, 0.1], fc);
  m.tri([0.05, 0, -0.06], [-0.1, 0.02, -0.1], [-0.15, -0.02, -0.22], fc);
  m.tri([-0.45, 0, 0], [-0.6, 0.12, 0], [-0.6, -0.12, 0], fc);
  return m;
}
/* ---- secrets & debris ---- */
function probeMesh() {
  const m = new MB();
  const g = [0.85, 0.65, 0.3];
  m.box(2, 2, 2, g);
  m.param(
    16,
    6,
    (u, v) => {
      const a = u * TAU,
        r = v * 2.2;
      return [r * Math.cos(a), 1 + r * r * 0.12, r * Math.sin(a)];
    },
    { color: [0.8, 0.8, 0.85] },
  );
  m.cyl(0.1, 0.1, 2.6, 5, [0.8, 0.8, 0.85], xfq(Q0, [0, 1, 0]));
  m.cyl(0.08, 0.04, 4, 5, [0.8, 0.8, 0.85], xfq(qaxis([0, 0, 1], PI / 2), [1, 0, 0]));
  return m;
}
function probePanels() {
  const m = new MB();
  for (const s of [1, -1]) m.box(1.2, 0.08, 5, [1, 1, 1], xfq(Q0, [0, 0, s * 3.6]));
  return m;
}
function beaconMesh() {
  const m = new MB();
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    const d = norm([Math.cos(a) * 0.6, -1, Math.sin(a) * 0.6]);
    m.cyl(0.15, 0.1, 5, 5, [0.4, 0.4, 0.45], xfq(qlookY(d), [0, 0, 0]));
  }
  m.cyl(0.6, 0.6, 0.4, 8, [0.4, 0.4, 0.45], xfq(Q0, [0, -0.2, 0]));
  return m;
}
function debrisMeshes() {
  const panel = new MB();
  panel.box(3, 0.12, 2, [0.55, 0.57, 0.6]);
  const cable = new MB();
  cable.box(7, 0.1, 0.1, [0.2, 0.2, 0.22]);
  cable.box(0.35, 0.35, 0.35, [0.3, 0.3, 0.32], xfq(Q0, [3.5, 0, 0]));
  const cont = new MB();
  cont.box(2, 2, 3.2, [0.5, 0.45, 0.35]);
  cont.box(2.1, 0.15, 0.15, [0.3, 0.3, 0.3], xfq(Q0, [0, 1, 0]));
  return [panel, cable, cont];
}
