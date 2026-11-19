/* =====================================================================
   PLANET VOICES (Phase 6D)
   The new planet types, rogue planets and plume moons get a quiet synthesized signature, played from the near side of the
   body within CFG.PLANET_VOICE_RANGE of its surface: surf for an ocean world, a dry hiss for a desert, bubbling for a sulfur
   world, high chimes for a crystal world, a deep roar for a hot gas giant, a slow groan for a rogue planet. Plume moons add
   eruption bursts (rumble for a volcano, hiss for a geyser). One voice at a time (the nearest), faded in and out, through the
   normal spatial chain, captioned. The old planet types and everything in the home system stay silent, as before.
   ===================================================================== */
// f: tones (Hz) · type · cut: low-pass (Hz) · noise / nf: band-passed noise level and centre (Hz) · lfo: swell (Hz)
// tick: on/off gating (Hz) · burst: eruptions every ~burst s · gain: level at the reference distance
const PLANET_VOX = {
  p8: { f: [], type: 'sine', cut: 900, noise: 0.7, nf: 380, lfo: 0.11, tick: 0, gain: 0.32 },
  p9: { f: [], type: 'sine', cut: 4000, noise: 0.5, nf: 1800, lfo: 0.07, tick: 0, gain: 0.2 },
  p10: { f: [70], type: 'triangle', cut: 500, noise: 0.45, nf: 320, lfo: 0, tick: 3.1, gain: 0.26 },
  p11: { f: [1318.5, 1975.5, 2637], type: 'sine', cut: 6000, noise: 0, nf: 0, lfo: 0, tick: 0.45, gain: 0.05 },
  p12: { f: [49], type: 'sine', cut: 1200, noise: 0.4, nf: 900, lfo: 0.05, tick: 0, gain: 0.26 },
  p13: { f: [36.7, 55], type: 'sawtooth', cut: 200, noise: 0.35, nf: 250, lfo: 0.04, tick: 0, gain: 0.5 },
  p14: { f: [], type: 'sine', cut: 6000, noise: 0.3, nf: 2600, lfo: 0, tick: 0.7, gain: 0.08 },
  p15: { f: [27.5, 27.8, 41.2], type: 'sawtooth', cut: 120, noise: 0.1, nf: 200, lfo: 0.03, tick: 0, gain: 0.45 },
  moon16: { f: [30.9], type: 'sawtooth', cut: 90, noise: 0.3, nf: 160, lfo: 0, tick: 0, gain: 0.4, burst: 9 },
  moon17: { f: [], type: 'sine', cut: 8000, noise: 0.25, nf: 3500, lfo: 0, tick: 0, gain: 0.22, burst: 7 },
};
const PVOX = { cur: null, body: null, capT: 0, evT: 0 };
function planetVoiceBuild(b, key) {
  const AC = AUD.ctx,
    v = PLANET_VOX[key];
  const p = makePanner(b.pos, Math.max(60, b.r * 2));
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
  for (const f of v.f) {
    const o = AC.createOscillator();
    o.type = v.type;
    o.frequency.value = f;
    const g = AC.createGain();
    g.gain.value = 0.22;
    o.connect(g);
    g.connect(lp);
    o.start();
    srcs.push(o);
  }
  let ev = null;
  if (v.noise > 0 || v.burst) {
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
    if (v.burst) ev = g; // eruptions swell this noise
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
  return { p, out, srcs, gain: v.gain, key, ev, base: v.noise, burst: v.burst || 0 };
}
// main loop, after starVoiceTick; voices only for bodies in loaded sectors (the home system has none)
function planetVoiceTick(dt) {
  if (!AUD.ctx || !started) return;
  const t = AUD.ctx.currentTime;
  let best = null,
    bk = null,
    bd = CFG.PLANET_VOICE_RANGE;
  if (CFG.PLANET_VOICE && !player.inside)
    for (const s of readySectors())
      for (const p of s.planets) {
        const cand = [];
        if (p.type >= 8) cand.push([p, 'p' + p.type]);
        for (const m of p.moons) if (m.plume) cand.push([m, 'moon' + m.type]);
        for (const [b, k] of cand) {
          if (!PLANET_VOX[k]) continue;
          const d = len(sub(b.pos, player.pos)) - b.r;
          if (d < bd) {
            bd = d;
            best = b;
            bk = k;
          }
        }
      }
  if (best !== PVOX.body) {
    if (PVOX.cur) starVoiceDrop(PVOX.cur, t);
    PVOX.cur = best ? planetVoiceBuild(best, bk) : null;
    PVOX.body = best;
    PVOX.capT = 0;
    PVOX.evT = 2;
  }
  const vx = PVOX.cur;
  if (!vx) return;
  const src = add(best.pos, scl(norm(sub(player.pos, best.pos)), best.r * 1.06));
  setPos(vx.p, src); // moons move
  if (OPT('occlusion') && (ADEPTH.frame | 0) % 15 === 0) applyOcc(vx.p, occlusion(src, null));
  setParam(vx.out.gain, vx.gain * (1 - smooth(CFG.PLANET_VOICE_RANGE * 0.6, CFG.PLANET_VOICE_RANGE, bd)), t, 0.5);
  if (vx.ev) {
    // an eruption: the noise swells for a few seconds, then settles (cosmetic timing, not the world RNG)
    PVOX.evT -= dt;
    if (PVOX.evT <= 0) {
      setParam(vx.ev.gain, vx.base * 4, t, 0.3);
      setParam(vx.ev.gain, vx.base, t + 2.5, 1.2);
      PVOX.evT = vx.burst * (0.6 + Math.random() * 0.8);
      caption('cap.' + vx.key, best.pos);
      PVOX.capT = 25;
    }
  }
  PVOX.capT -= dt;
  if (PVOX.capT <= 0) {
    caption('cap.' + vx.key, best.pos);
    PVOX.capT = 25;
  }
}
