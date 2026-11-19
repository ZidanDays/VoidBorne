/* ---------------- boost debris ---------------- */
// particles appear ahead of the player in debris fields (wreck debris, asteroid belt, planetary rings) when flying fast;
// near the suit they are swept into the wake, and the closest ones flash into sparks. Drawn with point mode 5.
const DEB = { N: 240, pts: null, p: [], v: [], life: [], max: [], kind: [], n: 0, acc: 0, tickT: 0 };
DEB.pts = { a: new Float32Array(DEB.N * 10), n: DEB.N, dynamic: true, vao: null, vbo: null };
uploadPoints(DEB.pts);
GLR.points.push(DEB.pts);
const debrisOn = () => OPT('debris') && quality !== QUAL.low;
function debrisField() {
  const P = player.pos;
  let k = 0;
  const wk = (w) => {
    const d = len(sub(w.pos, P));
    const R = w.rad * 3 + 150;
    if (d < R) k = Math.max(k, 1 - smooth(w.rad * 0.8, R, d));
  }; /* full strength inside the debris cloud, fading out around it */
  for (const w of wrecks) wk(w);
  for (const s of readySectors()) for (const w of s.wrecks) wk(w);
  if (inBelt(P)) k = Math.max(k, 0.7);
  if (ringedP && ringedP.ring) {
    const lp = qrot(qconj(ringedP.ring.q), sub(P, ringedP.pos));
    const rad = Math.hypot(lp[0], lp[2]);
    if (rad > ringedP.ring.in - 40 && rad < ringedP.ring.out + 40 && Math.abs(lp[1]) < 60) k = Math.max(k, 0.8);
  }
  return k;
}
function debTick(dt) {
  const cap = quality === QUAL.medium ? 120 : DEB.N;
  const on = debrisOn() && started && !PHOTO.on;
  const sp = len(player.vel);
  if (on && sp > CFG.DEBRIS_SPEED && !player.inside) {
    const f = debrisField();
    if (f > 0) {
      DEB.acc += dt * f * Math.min(1, (sp - CFG.DEBRIS_SPEED) / 80) * 220;
      const vd = scl(player.vel, 1 / sp);
      let ax = cross(vd, [0, 1, 0]);
      if (len(ax) < 1e-3) ax = [1, 0, 0];
      ax = norm(ax);
      const ay = cross(ax, vd);
      while (DEB.acc >= 1 && DEB.n < cap) {
        DEB.acc -= 1;
        const i = DEB.n++;
        const ang = Math.random() * TAU,
          rr = Math.random() * 9;
        const ahead = 25 + Math.random() * sp * 0.5;
        DEB.p[i] = add(add(player.pos, scl(vd, ahead)), add(scl(ax, Math.cos(ang) * rr), scl(ay, Math.sin(ang) * rr)));
        DEB.v[i] = [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2];
        DEB.life[i] = DEB.max[i] = 2.5 + Math.random() * 2;
        DEB.kind[i] = 0;
      }
      if (DEB.acc > 4) DEB.acc = 4;
    }
  }
  const a = DEB.pts.a;
  let w = 0,
    ping = 0;
  const pv = player.vel;
  for (let i = 0; i < DEB.n; i++) {
    let L = DEB.life[i] - dt;
    const p = DEB.p[i],
      v = DEB.v[i];
    const rel = sub(p, player.pos);
    const d = len(rel);
    if (DEB.kind[i] === 0) {
      if (d < 7) {
        const k = Math.min(1, dt * 7);
        v[0] += (pv[0] * 1.05 - v[0]) * k;
        v[1] += (pv[1] * 1.05 - v[1]) * k;
        v[2] += (pv[2] * 1.05 - v[2]) * k;
      } // swept into the wake
      if (d < 2.4) {
        DEB.kind[i] = 1;
        L = DEB.max[i] = 0.25 + Math.random() * 0.25;
        for (let c = 0; c < 3; c++) v[c] = pv[c] * 0.9 + (Math.random() - 0.5) * 30;
        ping++;
      }
    }
    if (L <= 0 || d > 160) continue;
    p[0] += v[0] * dt;
    p[1] += v[1] * dt;
    p[2] += v[2] * dt;
    DEB.p[w] = p;
    DEB.v[w] = v;
    DEB.life[w] = L;
    DEB.max[w] = DEB.max[i];
    DEB.kind[w] = DEB.kind[i];
    const f = L / DEB.max[w];
    const o = w * 10,
      r = sub(p, player.pos);
    if (DEB.kind[w] === 1) a.set([r[0], r[1], r[2], 0.12, 0, 0, Math.min(1, f * 2) * 1.6, 1.0, 0.75, 0.45], o);
    else a.set([r[0], r[1], r[2], 0.26 + 0.16 * (i % 3), 0, 0, Math.min(1, f * 1.5, (4.5 - L) * 2) * 0.8, 0.66, 0.7, 0.76], o);
    w++;
  }
  DEB.n = w;
  if (w) {
    gl.bindBuffer(gl.ARRAY_BUFFER, DEB.pts.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a, 0, w * 10);
  }
  if (ping && AUD.ctx && Math.random() < 0.5) debrisPing();
}
let pingT = 0;
function debrisPing() {
  const now = performance.now();
  if (now - pingT < 90) return;
  pingT = now;
  const AC = AUD.ctx,
    t0 = AC.currentTime;
  const o = AC.createOscillator();
  o.type = 'sine';
  o.frequency.value = 2400 + Math.random() * 2400;
  const g = AC.createGain();
  env(g, t0, 0.002, 0.025, 0.08);
  const pn = AC.createStereoPanner();
  pn.pan.value = Math.random() * 1.6 - 0.8;
  o.connect(g);
  g.connect(pn);
  pn.connect(AUD.master);
  o.start(t0);
  o.stop(t0 + 0.12);
  if (Math.random() < 0.15) caption('cap.debris', null);
}
