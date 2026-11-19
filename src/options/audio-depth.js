/* ---------------- audio depth: Doppler and occlusion ---------------- */
// Doppler ratio for a source at pos moving with vel, heard by the moving player (classic formula with a feel-value 'speed of sound', capped)
function dopRatio(pos, vel) {
  const d = sub(player.pos, pos);
  const dist = len(d);
  if (dist < 1) return 1;
  const n = scl(d, 1 / dist);
  const c = CFG.DOPPLER_C;
  const vs = dot(vel || ZERO3, n),
    vl = -dot(player.vel, n);
  const lim = Math.pow(2, CFG.DOPPLER_MAX / 12);
  return clamp((c + vl) / Math.max(c * 0.25, c - vs), 1 / lim, lim);
}
const dopCents = (pos, vel) => (OPT('doppler') && AUD.ctx ? 1200 * Math.log2(dopRatio(pos, vel)) : 0);
// segment (listener → source) against spheres and capsules; the source's own body is skipped; 0 = clear, 1 = fully occluded
function segSphere(A, B, C, r) {
  const ia = len(sub(A, C)) < r,
    ib = len(sub(B, C)) < r;
  if (ia && ib) return 0;
  if (ia !== ib) return 1;
  const AB = sub(B, A),
    l2 = dot(AB, AB) || 1;
  const tt = clamp(dot(sub(C, A), AB) / l2, 0, 1);
  const d = len(sub(add(A, scl(AB, tt)), C));
  return 1 - smooth(r * 0.8, r * 1.02, d);
}
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1),
    d2 = sub(q2, p2),
    r = sub(p1, p2);
  const a = dot(d1, d1),
    e = dot(d2, d2),
    f = dot(d2, r);
  let s, tt; // closest distance between two segments
  if (a < 1e-9 && e < 1e-9) return len(r);
  if (a < 1e-9) {
    s = 0;
    tt = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e < 1e-9) {
      tt = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2),
        den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      tt = (b * s + f) / e;
      if (tt < 0) {
        tt = 0;
        s = clamp(-c / a, 0, 1);
      } else if (tt > 1) {
        tt = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  return len(sub(add(p1, scl(d1, s)), add(p2, scl(d2, tt))));
}
const ptSeg = (P, a, b) => {
  const ab = sub(b, a);
  const tt = clamp(dot(sub(P, a), ab) / (dot(ab, ab) || 1), 0, 1);
  return len(sub(add(a, scl(ab, tt)), P));
};
function segCapsule(A, B, a, b, r) {
  const ia = ptSeg(A, a, b) < r,
    ib = ptSeg(B, a, b) < r;
  if (ia && ib) return 0;
  if (ia !== ib) return 1;
  return 1 - smooth(r * 0.8, r * 1.02, segSeg(A, B, a, b));
}
function occlusion(src, owner) {
  const A = player.pos;
  let k = 0;
  for (const b of allBodies()) {
    if (b === owner) continue;
    k = Math.max(k, segSphere(A, src, b.pos, b.r));
    if (k >= 1) return 1;
  }
  const caps = (w) => {
    if (w === owner) return;
    const ax = qrot(w.q, [w.ship.L * 0.5, 0, 0]);
    k = Math.max(k, segCapsule(A, src, sub(w.pos, ax), add(w.pos, ax), w.ship.R * 0.9));
  };
  for (const w of wrecks) caps(w);
  for (const s of readySectors()) for (const w of s.wrecks) caps(w);
  if (owner !== station) k = Math.max(k, segSphere(A, src, station.pos, 95));
  return Math.min(1, k);
}
function applyOcc(p, k) {
  if (!p || !p._occ || !AUD.ctx) return;
  const t0 = AUD.ctx.currentTime;
  setParam(p._occ.f.frequency, 20000 * Math.pow(CFG.OCC_CUTOFF / 20000, k), t0, 0.12);
  setParam(p._occ.g.gain, 1 - k * (1 - CFG.OCC_GAIN), t0, 0.12);
}
const ADEPTH = { frame: 0, reg: null, prevW: [], whaleVel: [] };
function audioDepthReg() {
  const R = [];
  whales.forEach((w, i) => R.push({ p: AUD.whaleP[i], pos: () => w.pos, owner: w }));
  R.push({ p: AUD.stationP, pos: () => station.pos, owner: station });
  wrecks.forEach((w, i) => R.push({ p: AUD.wreckP[i], pos: () => w.pos, owner: w }));
  R.push({ p: AUD.beaconP, pos: () => AUD.beaconPos || secrets[0].pos, owner: null });
  R.push({ p: AUD.monoP, pos: () => secrets[1].pos, owner: null });
  return R;
}
function audioDepthTick(dt) {
  if (!AUD.ctx) return;
  if (!ADEPTH.reg) ADEPTH.reg = audioDepthReg();
  ADEPTH.frame++;
  // whale velocities from their motion (for Doppler)
  whales.forEach((w, i) => {
    const pv = ADEPTH.prevW[i];
    ADEPTH.whaleVel[i] = pv && dt > 0 ? scl(sub(w.pos, pv), 1 / dt) : [0, 0, 0];
    ADEPTH.prevW[i] = w.pos.slice();
  });
  const every = quality === QUAL.low ? 15 : CFG.OCC_EVERY;
  if (ADEPTH.frame % every === 0) {
    const on = OPT('occlusion');
    const extra = AUD.engHum ? [{ p: AUD.engHum.p, pos: () => add(W0.pos, qrot(W0.q, [11, 0, 6.6])), owner: W0 }] : [];
    for (const s of ADEPTH.reg.concat(extra)) applyOcc(s.p, on ? occlusion(s.pos(), s.owner) : 0);
  }
  if (ADEPTH.frame % 3 === 0) {
    const t0 = AUD.ctx.currentTime;
    const on = OPT('doppler');
    whales.forEach((w, i) => {
      const r = on ? dopRatio(w.pos, ADEPTH.whaleVel[i]) : 1;
      const n = AUD.whaleNodes && AUD.whaleNodes[i];
      if (n && n.parameters && n.parameters.get('pitch')) setParam(n.parameters.get('pitch'), r, t0, 0.1);
      const c = AUD.wcall && AUD.wcall[i];
      if (c && c.end > t0) for (const o of c.os) setParam(o.detune, 1200 * Math.log2(r), t0, 0.1);
    });
    const st = on ? 1200 * Math.log2(dopRatio(station.pos, null)) : 0;
    if (AUD.stationOsc) for (const o of AUD.stationOsc) setParam(o.detune, st, t0, 0.1);
    const mo = on ? 1200 * Math.log2(dopRatio(secrets[1].pos, null)) : 0;
    if (AUD.monoOsc) for (const o of AUD.monoOsc) setParam(o.detune, mo, t0, 0.1);
  }
}
function tempOcc(p, pos) {
  if (OPT('occlusion') && pos) applyOcc(p, occlusion(pos, null));
} // one-shot sounds: tested once when they start
