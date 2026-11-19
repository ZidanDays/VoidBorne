/* ---------------- seeded random ---------------- */
let _s = CFG.SEED >>> 0 || 1;
function rnd() {
  _s |= 0;
  _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rnd() * (b - a);
const pick = (a) => a[(rnd() * a.length) | 0];
function rdir() {
  const z = rnd() * 2 - 1,
    a = rnd() * 6.283185,
    r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}
// Effects RNG: a second seeded stream for runtime effects (boid wander, sound choices) so the
// world-generation stream is consumed only at load and #seed stays reproducible.
let _e = (CFG.SEED ^ 0x9e3779b9) >>> 0 || 7;
function ernd() {
  _e |= 0;
  _e = (_e + 0x6d2b79f5) | 0;
  let t = Math.imul(_e ^ (_e >>> 15), 1 | _e);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const err = (a, b) => a + ernd() * (b - a);
const epick = (a) => a[(ernd() * a.length) | 0];
function erdir() {
  const z = ernd() * 2 - 1,
    a = ernd() * 6.283185,
    r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}
