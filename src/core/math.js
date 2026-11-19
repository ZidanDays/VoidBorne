/* ---------------- math: vec3 / quat / mat4 ---------------- */
const PI = Math.PI,
  TAU = PI * 2;
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => {
  x = clamp((x - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
// quaternion [x,y,z,w]
const qid = () => [0, 0, 0, 1];
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qaxis(ax, ang) {
  const s = Math.sin(ang / 2),
    n = norm(ax);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)];
}
function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
function qrot(q, v) {
  const qv = [q[0], q[1], q[2]];
  const t = scl(cross(qv, v), 2);
  return add(add(v, scl(t, q[3])), cross(qv, t));
}
function qconj(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}
function qlook(fwd, up) {
  const f = norm(fwd);
  let r = cross(f, up);
  if (len(r) < 1e-6) r = cross(f, [1, 0, 0]);
  if (len(r) < 1e-6) r = cross(f, [0, 0, 1]);
  r = norm(r);
  const u = cross(r, f);
  return qfromBasis(r, u, scl(f, -1));
}
function qfromBasis(r, u, b) {
  const m00 = r[0],
    m01 = u[0],
    m02 = b[0],
    m10 = r[1],
    m11 = u[1],
    m12 = b[1],
    m20 = r[2],
    m21 = u[2],
    m22 = b[2];
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return qnorm(q);
}
function qslerpToward(q, target, t) {
  let d = q[0] * target[0] + q[1] * target[1] + q[2] * target[2] + q[3] * target[3];
  if (d < 0) {
    target = [-target[0], -target[1], -target[2], -target[3]];
  }
  return qnorm([lerp(q[0], target[0], t), lerp(q[1], target[1], t), lerp(q[2], target[2], t), lerp(q[3], target[3], t)]);
}
function persp(fov, asp, n, f) {
  const t = 1 / Math.tan(fov / 2);
  const o = new Float32Array(16);
  o[0] = t / asp;
  o[5] = t;
  o[10] = (f + n) / (n - f);
  o[11] = -1;
  o[14] = (2 * f * n) / (n - f);
  return o;
}
function m4mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function m4v(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}
function viewFromBasis(r, u, f, e) {
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1]);
}
function frustumPlanes(m) {
  const p = [];
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0),
    r1 = row(1),
    r2 = row(2),
    r3 = row(3);
  for (const [s, r] of [
    [1, r0],
    [-1, r0],
    [1, r1],
    [-1, r1],
    [1, r2],
    [-1, r2],
  ]) {
    const pl = [r3[0] + s * r[0], r3[1] + s * r[1], r3[2] + s * r[2], r3[3] + s * r[3]];
    const l = Math.hypot(pl[0], pl[1], pl[2]);
    p.push([pl[0] / l, pl[1] / l, pl[2] / l, pl[3] / l]);
  }
  return p;
}
function sphereVisible(pl, c, r) {
  for (const p of pl) if (p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] < -r) return false;
  return true;
}
