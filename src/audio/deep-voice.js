/* =====================================================================
   DEEP-SPACE VOICES (Phase 6E)
   Synthesized signatures of the Phase 6E objects: a comet hisses as it outgasses, an outer belt ticks with ice grains, a ship
   graveyard groans, the broken ring resonates in low fifths, a supernova remnant crackles, a planetary nebula hums. One voice
   at a time (the nearest object in range), played from the point of that object nearest the player through the normal spatial
   chain, faded in and out, captioned. Star voices (6C) and planet voices (6D) keep playing their own; the home system has none
   of these objects, so it stays as it was. CFG.LANDMARK_VOICE switches them off.
   ===================================================================== */
// same recipe format as PLANET_VOX (audio/planet-voice.js): f tones (Hz) · type · cut low-pass (Hz) · noise / nf band-passed
// noise level and centre (Hz) · lfo swell (Hz) · tick on/off gating (Hz) · burst swells every ~burst s · gain at the reference
const DEEP_VOX = {
  comet: { f: [], type: 'sine', cut: 9000, noise: 0.5, nf: 2400, lfo: 0.3, tick: 0, gain: 0.18 },
  kbelt: { f: [], type: 'sine', cut: 9000, noise: 0.25, nf: 5200, lfo: 0, tick: 5.5, gain: 0.06 },
  graveyard: { f: [41.2, 43.7], type: 'sawtooth', cut: 160, noise: 0.3, nf: 300, lfo: 0.06, tick: 0, gain: 0.32, burst: 11 },
  aring: { f: [55, 82.4, 110], type: 'sine', cut: 700, noise: 0.05, nf: 200, lfo: 0.02, tick: 0, gain: 0.3 },
  snr: { f: [], type: 'sine', cut: 6000, noise: 0.5, nf: 1400, lfo: 0, tick: 7.3, gain: 0.16 },
  pn: { f: [130.8, 196, 261.6], type: 'triangle', cut: 1500, noise: 0, nf: 0, lfo: 0.05, tick: 0, gain: 0.08 },
};
const DVOX = { cur: null, ref: null, capT: 0, evT: 0, cool: 0 };
// one candidate per object in the ready sectors: { ref, key, pos: the point of the object nearest the player, d, range, r }
function deepSources(P) {
  const out = [];
  const near = (ref, key, pos, range, r) => out.push({ ref, key, pos, d: len(sub(pos, P)), range, r });
  for (const s of readySectors()) {
    for (const c of s.comets) if (c.pos) near(c, 'comet', add(c.pos, scl(norm(sub(P, c.pos)), c.r)), 2000, 60);
    if (s.belt) {
      // inside the belt the grains are all around: the nearest point is the player's own position
      const B = s.belt,
        lp = qrot(qconj(B.q), sub(P, B.C));
      const rad = Math.hypot(lp[0], lp[2]) || 1,
        rc = clamp(rad, B.R0, B.R1);
      const q = [(lp[0] / rad) * rc, clamp(lp[1], -B.ySpread, B.ySpread), (lp[2] / rad) * rc];
      near(B, 'kbelt', add(B.C, qrot(B.q, q)), 400, 40);
    }
    if (s.graveyard) {
      const G = s.graveyard,
        dc = len(sub(P, G.c));
      near(G, 'graveyard', dc > G.R ? add(G.c, scl(sub(P, G.c), G.R / dc)) : P, 1500, 200);
    }
    if (s.aring) {
      const A = s.aring,
        lp = qrot(qconj(A.q), sub(P, A.C));
      let phi = Math.atan2(lp[2], lp[0]);
      while (phi < A.a0) phi += TAU;
      while (phi > A.a0 + TAU) phi -= TAU;
      if (phi > A.a1) phi = phi - A.a1 < A.a0 + TAU - phi ? A.a1 : A.a0;
      const q = [Math.cos(phi) * A.Rr, clamp(lp[1], -A.W / 2, A.W / 2), Math.sin(phi) * A.Rr];
      near(A, 'aring', add(A.C, qrot(A.q, q)), 3000, 400);
    }
    if (s.landmark) {
      // loudest at the shell (filaments / lobes), heard from inside as well as outside
      const L = s.landmark,
        c = s.star.pos;
      near(L, L.kind, add(c, scl(norm(sub(P, c)), L.R * 0.9)), L.R * 0.6, L.R * 0.1);
    }
  }
  return out;
}
// main loop, after planetVoiceTick
function deepVoiceTick(dt) {
  if (!AUD.ctx || !started) return;
  const t = AUD.ctx.currentTime;
  let best = null;
  if (CFG.LANDMARK_VOICE && !(player.inside && !player.insideW)) {
    // the explorable wreck (wreck 0) keeps its own interior sound; a graveyard hull still hears its graveyard
    for (const s of deepSources(player.pos)) {
      if (s.d >= s.range) continue;
      const dd = s.ref === DVOX.ref ? s.d - 60 : s.d; // a little hysteresis so two close objects do not flap
      if (!best || dd < best.dd) best = Object.assign(s, { dd });
    }
  }
  DVOX.cool -= dt;
  if ((best ? best.ref : null) !== DVOX.ref && DVOX.cool <= 0) {
    // at most one new voice per second (a fast flight past several objects never piles up audio graphs)
    DVOX.cool = 1;
    if (DVOX.cur) starVoiceDrop(DVOX.cur, t);
    DVOX.cur = best ? planetVoiceBuild(best, best.key, DEEP_VOX) : null;
    DVOX.ref = best ? best.ref : null;
    DVOX.capT = 0;
    DVOX.evT = 3;
  }
  const vx = DVOX.cur;
  if (!vx) return;
  if (!best || best.ref !== DVOX.ref) {
    setParam(vx.out.gain, 0, t, 0.6); // waiting out the switch: the old voice fades
    return;
  }
  setPos(vx.p, best.pos);
  setParam(vx.out.gain, vx.gain * (1 - smooth(best.range * 0.6, best.range, best.d)), t, 0.6);
  if (vx.ev) {
    // the graveyard groans now and then (cosmetic timing, not the world RNG)
    DVOX.evT -= dt;
    if (DVOX.evT <= 0) {
      setParam(vx.ev.gain, vx.base * 4, t, 0.4);
      setParam(vx.ev.gain, vx.base, t + 3, 1.5);
      DVOX.evT = vx.burst * (0.6 + Math.random() * 0.8);
    }
  }
  DVOX.capT -= dt;
  if (DVOX.capT <= 0) {
    caption('cap.' + best.key, best.pos);
    DVOX.capT = 25;
  }
}
