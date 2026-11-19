/* =====================================================================
   WARP, AUTOPILOT, STAR MAP, DEEP-SPACE CUE
   ===================================================================== */
const WARP = { on: false, t: 0, meta: null, jumped: false, k: 0, from: null, to: null };
function startWarp(meta) {
  if (WARP.on) return;
  const d = len(sub(meta.star, player.pos));
  if (d < 9000) {
    toast(tl('toast.tooClose', { key: keyOf('autopilot') }));
    return;
  }
  apOff();
  toggleMap(false);
  requestSector(meta);
  const dir = norm(sub(player.pos, meta.star));
  Object.assign(WARP, { on: true, t: 0, meta, jumped: false, k: 0, to: add(meta.star, scl(dir, meta.r * 6 + 2600)), look: meta.star });
  if (AUD.ctx) sfxWarp();
  toast(tl('toast.warping', { name: meta.name.toUpperCase() }));
}
function warpStep(dt) {
  const D = CFG.WARP_TIME;
  WARP.t += dt;
  const t = WARP.t;
  WARP.k = t < D * 0.5 ? smooth(0, D * 0.5, t) : 1 - smooth(D * 0.5, D, t);
  player.fov = 1.15 + (RM ? 0.15 : 0.55) * WARP.k;
  player.boost = true;
  player.accel = 200 * WARP.k;
  const look = sub(WARP.jumped ? WARP.look : WARP.look, player.pos);
  player.q = qslerpToward(player.q, qlook(look, basis().u), 1 - Math.exp(-3 * dt));
  player.vel = scl(basis().f, 40 * WARP.k);
  if (!WARP.jumped && t >= D * 0.5) {
    WARP.jumped = true;
    let p = WARP.to;
    const sec = SECT.loaded.get(WARP.meta.key);
    if (sec)
      for (const b of sec.planets) {
        const d = sub(p, b.pos);
        const l = len(d);
        if (l < b.r * 2.5) p = add(b.pos, scl(d, (b.r * 2.5) / Math.max(l, 1)));
      }
    player.pos = p;
    player.vel = [0, 0, 0];
    player.q = qlook(sub(WARP.look, p), [0, 1, 0]);
    taaValid = false;
    SECT.tick = 0;
  }
  if (t >= D) {
    WARP.on = false;
    WARP.k = 0;
    player.vel = [0, 0, 0];
    player.boost = false;
    toast(tl('toast.arrived', { name: WARP.meta.name.toUpperCase() }));
  }
}
const AP = { on: false, t: null };
function apOff(msg) {
  if (!AP.on) return;
  AP.on = false;
  AP.t = null;
  $('#apl').textContent = '';
  player.boost = false;
  if (msg) toast(tl('toast.apOff', { msg }));
}
function apTargetFromPOI(p) {
  const sec = readySectors().find((s) => s.poi.indexOf(p) >= 0) || null;
  return {
    name: p.name,
    kind: p.kind,
    get pos() {
      return p.pos;
    },
    r: p.r,
    sec,
  };
}
function toggleAutopilot() {
  if (AP.on) {
    apOff(tl('ap.disengaged'));
    return;
  }
  const poi = MAP.wp || lookPOI;
  if (!poi) {
    toast(tl('toast.apNone', { key: keyOf('map') }));
    return;
  }
  const t = apTargetFromPOI(poi);
  const stop = apStop(t);
  if (len(sub(t.pos, player.pos)) - stop < 5) {
    toast(tl('toast.apThere'));
    return;
  }
  AP.on = true;
  AP.t = t;
  MAP.wp = null;
  toast(tl('toast.apOn', { name: t.name.toUpperCase() }));
}
function apStop(t) {
  const body = t.kind === 'planet' || t.kind === 'moon' || t.kind === 'star';
  return (body ? t.r * 1.35 : t.r + 30) + CFG.AUTOPILOT_MARGIN;
}
function autopilotStep(dt) {
  const t = AP.t;
  const toT = sub(t.pos, player.pos);
  const dist = len(toT);
  const dir = scl(toT, 1 / Math.max(dist, 1e-3));
  const stop = apStop(t);
  let aim = dir;
  for (const b of allBodies()) {
    if (len(sub(b.pos, t.pos)) < 1) continue;
    const rel = sub(b.pos, player.pos);
    const s = dot(rel, dir);
    if (s <= 0 || s > dist) continue;
    const perp = sub(rel, scl(dir, s));
    const pd = len(perp);
    const clear = b.r * 1.4 + 50;
    if (pd < clear) {
      const away = pd > 1e-3 ? scl(perp, -1 / pd) : norm(cross(dir, [0, 1, 0]));
      aim = norm(add(dir, scl(away, (1.6 * (clear - pd)) / clear)));
      break;
    }
  }
  const rem = dist - stop;
  const vmax = CFG.MAX_SPEED * CFG.BOOST_MULT;
  const vd = Math.min(vmax, Math.sqrt(2 * CFG.THRUST * 0.45 * Math.max(rem, 0)));
  const k = 1 - Math.exp(-4 * dt); // braking curve uses 45% of thrust so the lag of the velocity filter cannot overshoot
  const tv = scl(aim, vd);
  player.vel = add(scl(player.vel, 1 - k), scl(tv, k));
  player.boost = vd > CFG.MAX_SPEED * 1.05;
  player.accel = vd > 1 ? CFG.THRUST : 0;
  player.q = qslerpToward(player.q, qlook(aim, basis().u), 1 - Math.exp(-2.5 * dt));
  $('#apl').textContent = tl('hud.apl', {
    name: t.name.toUpperCase(),
    d: rem < 1000 ? Math.max(0, rem).toFixed(0) + ' m' : (rem / 1000).toFixed(1) + ' km',
  });
  if (rem < 4 && len(player.vel) < 4) {
    player.vel = [0, 0, 0];
    apOff(tl('ap.arrived', { name: t.name.toUpperCase() }));
  }
}
let deepWarned = false;
function deepSpaceCue() {
  const sys = systemOf(player.pos);
  const out = !sys;
  const k = out ? 0.28 : 0;
  if (Math.abs(k - (player.edgeK || 0)) > 0.01) {
    player.edgeK = k;
    $('#edge').style.opacity = k;
  }
  if (out && !deepWarned) {
    deepWarned = true;
    toast(tl('toast.deep', { key: keyOf('map') }));
  } else if (!out) deepWarned = false;
}
