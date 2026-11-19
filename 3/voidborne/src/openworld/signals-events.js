/* ---- signals: the nearest beacon pings faster and louder as you close in ---- */
function nearestSignal() {
  let best = null,
    bd = 6000;
  const cand = [
    secrets[0],
    ...readySectors()
      .filter((s) => s.beacon)
      .map((s) => s.beacon),
  ];
  for (const b of cand) {
    const d = len(sub(b.pos, player.pos));
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best ? { pos: best.pos, d: bd, k: 1 - bd / 6000, name: best.name } : null;
}
let sigT = 0;
function signalHUD(dt) {
  sigT -= dt;
  if (sigT > 0) return;
  sigT = 0.2;
  const s = nearestSignal();
  const el = $('#signal');
  if (!s) {
    el.textContent = '';
    return;
  }
  const bars = Math.max(1, Math.round(s.k * 8));
  el.textContent =
    tl('hud.signal') +
    ' ' +
    '▮'.repeat(bars) +
    '▯'.repeat(8 - bars) +
    ' · ' +
    (s.d < 1000 ? s.d.toFixed(0) + ' m' : (s.d / 1000).toFixed(1) + ' km');
}
/* ---- monolith ---- */
const MONO = { awake: false, t: 0 };
function monolithCheck(silent) {
  if (MONO.awake || foundSet.size < CFG.MONOLITH_AWAKEN) return;
  MONO.awake = true;
  secrets[1].items[0].mat = 12;
  secrets[1].awake = true;
  if (!silent) {
    toast(tl('toast.monolith', { name: (planets.find((p) => p.type === 2) || planets[2]).name.toUpperCase() }));
    if (AUD.ctx) sfxMonolith();
  }
}
monolithCheck(true);
/* =====================================================================
   RANDOM EVENTS: meteor showers, leviathan migrations, stellar flares
   ===================================================================== */
const EV = { next: err(CFG.EVENT_MIN, CFG.EVENT_MAX), flare: 0, flareT: 0, mig: null };
const METEOR = { on: false, t: 0, dir: [1, 0, 0], list: [], mesh: null, anchor: [0, 0, 0] };
{
  const mb = new MB();
  mb.box(1, 0.025, 0.025, [1, 0.9, 0.75]);
  const a = new Float32Array(60 * INST);
  for (let i = 0; i < 60; i++) instQ(a, i, [0, 0, 0], qid(), 0, [1, 1, 1], 0);
  METEOR.mesh = makeMesh(mb, a, 'q', true);
}
whales.forEach((w) => {
  w.c0 = w.c.slice();
});
function triggerEvent(kind) {
  const st = activeStar();
  if (kind === 'flare' && len(sub(st.pos, player.pos)) > 8000) kind = 'meteor';
  if (kind === 'migration' && len(player.pos) > CFG.WORLD_RADIUS * 1.5) kind = 'meteor';
  if (kind === 'meteor') {
    METEOR.on = true;
    METEOR.t = 22;
    METEOR.dir = erdir();
    METEOR.list = [];
    for (let i = 0; i < 60; i++) METEOR.list.push(spawnMeteor(true));
    toast(tl('toast.meteor'));
  } else if (kind === 'migration') {
    const d = erdir();
    d[1] *= 0.3;
    EV.mig = { dir: norm(d), t: 60 };
    whales.forEach((w, i) => {
      if (AUD.timers) AUD.timers.whale[i] = err(0.5, 4);
    });
    toast(tl('toast.migration'));
  } else if (kind === 'flare') {
    EV.flare = 7;
    EV.flareT = 0;
    toast(tl('toast.flare', { name: st.name.toUpperCase() }));
    if (AUD.ctx) sfxFlare();
  }
  return kind;
}
function spawnMeteor(initial) {
  const d = METEOR.dir;
  const side = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])),
    up = cross(side, d);
  const off = add(scl(side, err(-700, 700)), scl(up, err(-450, 450)));
  return { p: add(player.pos, add(off, scl(d, -(initial ? err(200, 1600) : err(900, 1500))))), v: scl(d, err(260, 460)), s: err(25, 60) };
}
function eventsTick(dt) {
  EV.next -= dt;
  if (EV.next < 0) {
    EV.next = err(CFG.EVENT_MIN, CFG.EVENT_MAX);
    triggerEvent(epick(['meteor', 'meteor', 'migration', 'flare']));
  }
  if (METEOR.on) {
    METEOR.t -= dt;
    const a = METEOR.mesh.inst;
    METEOR.anchor = player.pos.slice();
    METEOR.mesh.anchor = METEOR.anchor;
    let alive = 0;
    const d = METEOR.dir;
    const side = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const q = qfromBasis(d, cross(side, d), side);
    METEOR.list.forEach((m, i) => {
      if (!m) {
        instQ(a, i, [0, 0, 0], q, 0, [1, 1, 1], 0);
        return;
      }
      m.p = add(m.p, scl(m.v, dt));
      const rel = sub(m.p, player.pos);
      if (dot(rel, d) > 1200) {
        METEOR.list[i] = METEOR.t > 0 ? spawnMeteor(false) : null;
        if (!METEOR.list[i]) {
          instQ(a, i, [0, 0, 0], q, 0, [1, 1, 1], 0);
          return;
        }
      }
      alive++;
      instQ(a, i, sub(m.p, METEOR.anchor), q, m.s, [1.4, 1.2, 0.9], i);
      if (AUD.ctx && !m.heard && len(rel) < 70) {
        m.heard = true;
        sfxWhoosh(clamp(dot(rel, basis().r) / 60, -1, 1));
      }
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, METEOR.mesh.ivbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
    if (!alive && METEOR.t <= 0) METEOR.on = false;
  }
  if (EV.mig) {
    EV.mig.t -= dt;
    for (const w of whales) w.c = add(w.c, scl(EV.mig.dir, 24 * dt));
    if (EV.mig.t <= 0) EV.mig = null;
  } else
    for (const w of whales) {
      const back = sub(w.c0, w.c);
      const l = len(back);
      if (l > 1) w.c = add(w.c, scl(back, Math.min(l, 10 * dt) / l));
    }
  if (EV.flare > 0) {
    EV.flareT += dt;
    const k = Math.sin(Math.PI * clamp(EV.flareT / 7, 0, 1));
    const st = activeStar();
    EV.flareK = k * k * smooth(9000, 1500, len(sub(st.pos, player.pos)));
    if (EV.flareT >= 7) {
      EV.flare = 0;
      EV.flareK = 0;
    }
  }
  if (AUD.ctx && AUD.flareWet) setParam(AUD.flareWet.gain, (EV.flareK || 0) * 0.7, AUD.ctx.currentTime, 0.1);
  if (MONO.awake && AUD.ctx) {
    MONO.t -= dt;
    if (MONO.t < 0) {
      MONO.t = err(22, 34);
      if (len(sub(secrets[1].pos, player.pos)) < 1800) sfxMonolith();
    }
  }
}
window.triggerEvent = triggerEvent;
/* ---- Phase 3 sounds (synthesized) ---- */
function sfxWarp() {
  caption('cap.warp', null);
  const AC = AUD.ctx,
    t = AC.currentTime,
    D = CFG.WARP_TIME;
  const n = AC.createBufferSource();
  n.buffer = noiseBuf(D + 0.5, false);
  const bp = AC.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(180, t);
  bp.frequency.exponentialRampToValueAtTime(4200, t + D * 0.5);
  bp.frequency.exponentialRampToValueAtTime(220, t + D);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + D * 0.48);
  g.gain.exponentialRampToValueAtTime(0.0001, t + D);
  n.connect(bp);
  bp.connect(g);
  g.connect(AUD.master);
  n.start(t);
  n.stop(t + D + 0.5);
  const o = AC.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(55, t);
  o.frequency.exponentialRampToValueAtTime(880, t + D * 0.5);
  o.frequency.exponentialRampToValueAtTime(40, t + D);
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const og = AC.createGain();
  env(og, t, D * 0.45, 0.18, D * 0.55);
  o.connect(lp);
  lp.connect(og);
  og.connect(AUD.master);
  og.connect(AUD.rev);
  o.start(t);
  o.stop(t + D + 0.3);
  const th = AC.createOscillator();
  th.type = 'sine';
  th.frequency.setValueAtTime(90, t + D * 0.5);
  th.frequency.exponentialRampToValueAtTime(30, t + D * 0.5 + 0.6);
  const tg = AC.createGain();
  env(tg, t + D * 0.5, 0.01, 0.8, 0.7);
  th.connect(tg);
  tg.connect(AUD.master);
  th.start(t + D * 0.5);
  th.stop(t + D * 0.5 + 1);
}
function sfxWhoosh(pan) {
  const AC = AUD.ctx,
    t = AC.currentTime;
  const n = AC.createBufferSource();
  n.buffer = noiseBuf(0.8, false);
  const bp = AC.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2400, t);
  bp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
  bp.Q.value = 1.5;
  const g = AC.createGain();
  env(g, t, 0.05, 0.25, 0.55);
  const p = AC.createStereoPanner();
  p.pan.value = pan;
  n.connect(bp);
  bp.connect(g);
  g.connect(p);
  p.connect(AUD.muffle);
  n.start(t);
  n.stop(t + 0.8);
}
function sfxMonolith() {
  caption('cap.monolith', secrets[1].pos);
  const AC = AUD.ctx,
    t = AC.currentTime;
  const g = AC.createGain();
  env(g, t, 3, 0.35, 5, 4);
  g.connect(AUD.monoP);
  g.connect(AUD.rev);
  for (const f of [110, 164.8, 247.2, 329.6]) {
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = err(-5, 5);
    o.connect(g);
    o.start(t);
    o.stop(t + 13);
  }
}
function sfxDataBlip() {
  const AC = AUD.ctx,
    t = AC.currentTime;
  for (let i = 0; i < 6; i++) {
    const o = AC.createOscillator();
    o.type = 'square';
    o.frequency.value = epick([1200, 1600, 2000, 2400]);
    const g = AC.createGain();
    env(g, t + i * 0.07, 0.005, 0.03, 0.05);
    o.connect(g);
    g.connect(AUD.master);
    o.start(t + i * 0.07);
    o.stop(t + i * 0.07 + 0.08);
  }
}
function sfxFlare() {
  caption('cap.flare', activeStar().pos);
  const AC = AUD.ctx;
  if (!AUD.flareWet) {
    const sh = AC.createWaveShaper();
    const N = 1024,
      c = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      c[i] = Math.tanh(x * 9) * 0.8;
    }
    sh.curve = c;
    AUD.flareWet = AC.createGain();
    AUD.flareWet.gain.value = 0;
    const pre = AC.createGain();
    pre.gain.value = 2.5;
    AUD.muffle.connect(pre);
    pre.connect(sh);
    sh.connect(AUD.flareWet);
    AUD.flareWet.connect(AUD.master);
  }
  const t = AC.currentTime;
  const n = AC.createBufferSource();
  n.buffer = noiseBuf(7, true);
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.linearRampToValueAtTime(1800, t + 3.5);
  lp.frequency.linearRampToValueAtTime(150, t + 7);
  const g = AC.createGain();
  env(g, t, 3, 0.6, 3.5);
  n.connect(lp);
  lp.connect(g);
  g.connect(AUD.master);
  n.start(t);
  n.stop(t + 7);
}
