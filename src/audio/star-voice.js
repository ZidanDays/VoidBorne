/* =====================================================================
   STAR VOICES (Phase 6C)
   Near a star that has a class (generated sectors; the home star only with CFG.HOME_STAR_VARIETY) a quiet synthesized
   signature plays from the star's position: a low rumble for a red dwarf, a roar of filtered noise for a blue giant, a
   thin beating whistle for a white dwarf, a slow tick for a neutron star; a close pair adds a detuned twin, so the two
   tones beat against each other. One voice at a time (the nearest classed star within CFG.STAR_VOICE_RANGE), faded in
   and out, through the normal spatial chain (HRTF / occlusion muffling as for every other source) and captioned.
   ===================================================================== */
// f: tone frequencies (Hz) · type: oscillator wave · cut: low-pass (Hz) · noise / nf: filtered-noise level and band (Hz)
// lfo: slow swell (Hz) · tick: on/off gating (Hz) · gain: level at the reference distance
const STAR_VOX = {
  M: { f: [41, 61.7], type: 'sawtooth', cut: 150, noise: 0.25, nf: 700, lfo: 0.13, tick: 0, gain: 0.5 },
  K: { f: [55, 82.4], type: 'triangle', cut: 260, noise: 0.08, nf: 900, lfo: 0.09, tick: 0, gain: 0.45 },
  G: { f: [65.4, 98.1], type: 'sine', cut: 420, noise: 0.06, nf: 1200, lfo: 0.07, tick: 0, gain: 0.45 },
  F: { f: [130.8, 196.2], type: 'triangle', cut: 900, noise: 0.1, nf: 3000, lfo: 0.11, tick: 0, gain: 0.3 },
  O: { f: [43.7, 87.3], type: 'sawtooth', cut: 500, noise: 0.5, nf: 380, lfo: 0.05, tick: 0, gain: 0.6 },
  D: { f: [1760, 1765.5], type: 'sine', cut: 5000, noise: 0, nf: 0, lfo: 0.3, tick: 0, gain: 0.06 },
  N: { f: [92.5, 185], type: 'square', cut: 1400, noise: 0.15, nf: 2500, lfo: 0, tick: 1.6, gain: 0.3 },
};
const SVOX = { cur: null, star: null, capT: 0 };
function starVoiceBuild(st) {
  const AC = AUD.ctx,
    v = STAR_VOX[st.cls];
  const p = makePanner(st.pos, Math.max(60, st.r * 2));
  const out = AC.createGain();
  out.gain.value = 0;
  out.connect(p);
  const amp = AC.createGain();
  amp.gain.value = v.tick ? 0.5 : 0.8;
  amp.connect(out);
  const lp = AC.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = v.cut;
  lp.connect(amp);
  const srcs = [];
  const tone = (f) => {
    const o = AC.createOscillator();
    o.type = v.type;
    o.frequency.value = f;
    const g = AC.createGain();
    g.gain.value = 0.22;
    o.connect(g);
    g.connect(lp);
    o.start();
    srcs.push(o);
  };
  for (const f of v.f) tone(f);
  if (st.kind === 'close' || st.kind === 'triple') for (const f of v.f) tone(f * 1.009); // the partner: slow beating
  if (v.noise > 0) {
    const n = AC.createBufferSource();
    n.buffer = noiseBuf(4, true);
    n.loop = true;
    const bp = AC.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = v.nf;
    bp.Q.value = 0.8;
    const g = AC.createGain();
    g.gain.value = v.noise;
    n.connect(bp);
    bp.connect(g);
    g.connect(amp);
    n.start();
    srcs.push(n);
  }
  if (v.lfo > 0 || v.tick > 0) {
    const l = AC.createOscillator();
    l.type = v.tick ? 'square' : 'sine';
    l.frequency.value = v.tick || v.lfo;
    const lg = AC.createGain();
    lg.gain.value = v.tick ? 0.5 : 0.3;
    l.connect(lg);
    lg.connect(amp.gain);
    l.start();
    srcs.push(l);
  }
  return { p, out, srcs, gain: v.gain, cls: st.cls };
}
function starVoiceDrop(vx, t) {
  setParam(vx.out.gain, 0, t, 0.6);
  setTimeout(() => {
    for (const s of vx.srcs)
      try {
        s.stop();
      } catch (e) {}
    try {
      vx.p.disconnect();
    } catch (e) {}
    const i = AUD.panners ? AUD.panners.indexOf(vx.p) : -1;
    if (i >= 0) AUD.panners.splice(i, 1);
  }, 3000);
}
// main loop, after audioTick
function starVoiceTick(dt) {
  if (!AUD.ctx || !started) return;
  const t = AUD.ctx.currentTime;
  let best = null,
    bd = CFG.STAR_VOICE_RANGE;
  if (CFG.STAR_VOICE && !player.inside)
    for (const s of allStars()) {
      if (!s.cls || !STAR_VOX[s.cls]) continue;
      const d = len(sub(s.pos, player.pos)) - s.r;
      if (d < bd) {
        bd = d;
        best = s.lead || s; // the two stars of a close pair share one voice (no flip-flopping between them)
      }
    }
  if (best !== SVOX.star) {
    if (SVOX.cur) starVoiceDrop(SVOX.cur, t);
    SVOX.cur = best ? starVoiceBuild(best) : null;
    SVOX.star = best;
    SVOX.capT = 0;
  }
  const vx = SVOX.cur;
  if (!vx) return;
  // the sound comes from the near side of the star (a point inside it would count the star itself as an obstacle)
  const src = add(best.pos, scl(norm(sub(player.pos, best.pos)), best.r * 1.06));
  setPos(vx.p, src); // a close pair moves
  if (OPT('occlusion') && (ADEPTH.frame | 0) % 15 === 0) applyOcc(vx.p, occlusion(src, null));
  setParam(vx.out.gain, vx.gain * (1 - smooth(CFG.STAR_VOICE_RANGE * 0.6, CFG.STAR_VOICE_RANGE, bd)), t, 0.5);
  SVOX.capT -= dt;
  if (SVOX.capT <= 0) {
    caption(best.kind === 'close' || best.kind === 'triple' ? 'cap.starPair' : 'cap.star' + best.cls, best.pos);
    SVOX.capT = 25;
  }
}
