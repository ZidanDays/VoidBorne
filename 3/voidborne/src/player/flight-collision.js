/* =====================================================================
   SIMULATION
   ===================================================================== */
let time = 0;
const tmpA = [0, 0, 0];
function profR(ship, v) {
  const n = ship.prof.length - 1;
  const t = clamp(v, 0, 1) * n,
    k = Math.min(n - 1, Math.floor(t)),
    f = t - k;
  return lerp(ship.prof[k][1], ship.prof[k + 1][1], f);
}
function updatePlayer(dt) {
  const b = basis();
  let f = 0,
    s = 0,
    u = 0,
    roll = 0;
  if (started && !paused && !uiBlocking()) {
    if (act('fwd')) f += 1;
    if (act('back')) f -= 1;
    if (act('right')) s += 1;
    if (act('left')) s -= 1;
    if (act('up')) u += 1;
    if (act('down')) u -= 1;
    if (act('rollL')) roll += 1;
    if (act('rollR')) roll -= 1;
    f += tIn.y + GP.f;
    s += tIn.x + GP.s;
    u += tIn.up + GP.u;
    roll += GP.roll;
    player.boost = !!(act('boost') || tIn.boost || GP.boost);
    if (survOn() && !SURV.canBoost) player.boost = false;
  } /* survival: no boost without energy */
  if (WARP.on) {
    warpStep(dt);
    return;
  }
  if (AP.on && (f || s || u || roll)) apOff(t('ap.manual'));
  if (AP.on) {
    autopilotStep(dt);
    player.pos = add(player.pos, scl(player.vel, dt));
    player.fov = lerp(player.fov, player.boost ? (RM ? 1.2 : 1.32) : 1.15, 1 - Math.exp(-4 * dt));
    player._dt = dt;
    {
      const v0 = player.vel.slice();
      collide();
      impactCheck(v0);
    }
    deepSpaceCue();
    return;
  }
  if (roll) player.q = qnorm(qmul(player.q, qaxis([0, 0, 1], roll * 1.6 * dt)));
  const mult = player.boost ? CFG.BOOST_MULT : 1;
  const th = add(add(scl(b.f, f), scl(b.r, s)), scl(b.u, u));
  const mag = len(th);
  player.accel = mag * mult;
  if (mag > 0) {
    const a = scl(scl(th, 1 / mag), CFG.THRUST * mult * dt);
    player.vel = add(player.vel, a);
  }
  if (gravActive()) {
    const ga = gravAccel(player.pos);
    player.vel = add(player.vel, scl(ga, dt));
  } /* optional gravity (Phase 5D) */
  const dr = Math.exp(-flightDrag() * dt * (mag > 0 ? 0.5 : 1));
  player.vel = scl(player.vel, dr);
  const vmax = CFG.MAX_SPEED * (player.boost ? CFG.BOOST_MULT : 1.2);
  const sp = len(player.vel);
  if (sp > vmax) player.vel = scl(player.vel, vmax / sp);
  player.pos = add(player.pos, scl(player.vel, dt));
  // Phase 3: the hard boundary is gone (open world); a soft cue tells the player when they enter deep space
  deepSpaceCue();
  player.fov = lerp(player.fov, player.boost && mag > 0 ? (RM ? 1.2 : 1.32) : 1.15, 1 - Math.exp(-4 * dt)); // reduced motion: a much smaller FOV kick
  player._dt = dt;
  {
    const v0 = player.vel.slice();
    collide();
    impactCheck(v0);
  }
}
function bounce(n, pen) {
  player.pos = add(player.pos, scl(n, pen));
  const vn = dot(player.vel, n);
  if (vn < 0) player.vel = sub(player.vel, scl(n, vn * 1.45));
}
function sphereHit(c, r) {
  const d = sub(player.pos, c);
  const l = len(d);
  if (l < r + 1.5 && l > 1e-6) bounce(scl(d, 1 / l), r + 1.5 - l);
}
function collide() {
  sphereHit(STAR.pos, STAR.r + 6);
  sectorCollide();
  for (const p of planets) {
    sphereHit(p.pos, p.r * 1.03);
    for (const m of p.moons) sphereHit(m.pos, m.r * 1.03);
    if (p.ring) {
      const d = len(sub(player.pos, p.pos));
      if (d < p.ring.out + 40 && d > p.ring.in - 40) {
        const M = q2m3(p.ring.q);
        for (const it of ringItems) asteroidHits(it, M, p.pos);
      }
    }
  }
  // belt
  {
    const lp = qrot(qconj(BELT.q), player.pos);
    const rad = Math.hypot(lp[0], lp[2]);
    if (rad > BELT.R0 - 30 && rad < BELT.R1 + 30 && Math.abs(lp[1]) < BELT.ySpread + 30) {
      const M = q2m3(BELT.q);
      for (const it of beltItems) asteroidHits(it, M, [0, 0, 0]);
    }
  }
  // wrecks
  player.inside = false;
  for (const w of wrecks) {
    const rel = sub(player.pos, w.pos);
    if (len(rel) > w.rad + 10) continue;
    const lp = qrot(qconj(w.q), rel);
    const L = w.ship.L,
      R = w.ship.R;
    if (!w.big) {
      const x = clamp(lp[0], -L / 2, L / 2);
      const d = [lp[0] - x, lp[1], lp[2]];
      const l = len(d);
      const rr2 = profR(w.ship, x / L + 0.5) * 1.05 + 1.5;
      if (l < rr2 && l > 1e-6) bounce(qrot(w.q, scl(d, 1 / l)), rr2 - l);
      continue;
    }
    const ax = lp[0],
      rad = Math.hypot(lp[1], lp[2]);
    const v = ax / L + 0.5;
    const Rv = profR(w.ship, v);
    let u = Math.atan2(lp[2], lp[1]) / TAU;
    if (u < 0) u += 1;
    const br = w.ship.breach;
    const du = Math.min(Math.abs(u - br.u), 1 - Math.abs(u - br.u));
    const inBreach = du < br.du * 0.8 && Math.abs(v - br.v) < br.dv * 0.8;
    const radial = rad > 1e-6 ? [0, lp[1] / rad, lp[2] / rad] : [0, 1, 0];
    if (Math.abs(ax) < L / 2) {
      if (rad < Rv) {
        player.inside = true;
        if (rad > Rv - 2.2 && !inBreach) bounce(qrot(w.q, scl(radial, -1)), rad - (Rv - 2.2));
        if (ax > L / 2 - 4) bounce(qrot(w.q, [-1, 0, 0]), ax - (L / 2 - 4));
        if (ax < -L / 2 + 4) bounce(qrot(w.q, [1, 0, 0]), -L / 2 + 4 - ax);
        if (lp[1] < -R * 0.5 + 1.8 && Math.abs(ax) < L * 0.35) bounce(qrot(w.q, [0, 1, 0]), -R * 0.5 + 1.8 - lp[1]);
      } else if (rad < Rv + 2.0 && !inBreach) bounce(qrot(w.q, radial), Rv + 2.0 - rad);
    } else {
      const x = clamp(ax, -L / 2, L / 2);
      const d = [ax - x, lp[1], lp[2]];
      const l = len(d);
      const rr2 = profR(w.ship, x / L + 0.5) * 0.6 + 2;
      if (l < rr2 && l > 1e-6) bounce(qrot(w.q, scl(d, 1 / l)), rr2 - l);
    }
  }
  if (player.inside && wrecks[0].big) interiorCollide(); // Phase 5A: bulkheads, doors, furniture, crates
  // station
  {
    const rel = sub(player.pos, station.pos);
    if (len(rel) < station.rad + 20) {
      const lp = qrot(qconj(station.q), rel);
      const rho = Math.hypot(lp[0], lp[2]);
      const tc = [(lp[0] / Math.max(rho, 1e-6)) * station.R, 0, (lp[2] / Math.max(rho, 1e-6)) * station.R];
      const d = sub(lp, tc);
      const l = len(d);
      if (l < station.r + 2 && l > 1e-6) bounce(qrot(station.q, scl(d, 1 / l)), station.r + 2 - l);
      if (Math.abs(lp[1]) < 112 && rho < 82) {
        if (rho > 60) {
          bounce(qrot(station.q, [lp[0] / rho, 0, lp[2] / rho]), 82 - rho);
        } else bounce(qrot(station.q, [0, Math.sign(lp[1]) || 1, 0]), 112 - Math.abs(lp[1]));
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const dx = Math.cos(a),
          dz = Math.sin(a);
        const t = clamp(lp[0] * dx + lp[2] * dz, 70, station.R);
        const d = [lp[0] - dx * t, lp[1], lp[2] - dz * t];
        const l = len(d);
        if (l < 13 && l > 1e-6) bounce(qrot(station.q, scl(d, 1 / l)), 13 - l);
      }
    }
  }
  for (const s of secrets) if (!s.inside) sphereHit(s.pos, s.kind === 'monolith' ? 14 : 4);
  for (const l of landmarks) {
    if (l.kind === 'blackhole') {
      const d = sub(l.pos, player.pos);
      const dist = len(d);
      if (dist < 2200 && CFG.BH_GRAVITY > 0) {
        const a = Math.min(CFG.BH_GRAVITY / (dist * dist), 40);
        player.vel = add(player.vel, scl(d, (a * player._dt) / dist));
      }
      sphereHit(l.pos, l.Rs * 3.2);
    } else sphereHit(l.pos, 40);
  }
  for (const wh of whales) {
    const lp = qrot(qconj(wh.q), sub(player.pos, wh.pos));
    const x = clamp(lp[0], -0.5 * wh.scale, 0.42 * wh.scale);
    const d = [lp[0] - x, lp[1], lp[2]];
    const l = len(d);
    const rr2 = wh.scale * 0.08;
    if (l < rr2 && l > 1e-6) bounce(qrot(wh.q, scl(d, 1 / l)), rr2 - l);
  }
}
function asteroidHits(it, M, center) {
  const a = it.inst;
  const n = it.count;
  for (let i = 0; i < n; i++) {
    const o = i * INSTA;
    const ang = a[o + 1] + time * a[o + 2];
    const ox = Math.cos(ang) * a[o],
      oy = a[o + 3],
      oz = Math.sin(ang) * a[o];
    const px = M[0] * ox + M[3] * oy + M[6] * oz + center[0],
      py = M[1] * ox + M[4] * oy + M[7] * oz + center[1],
      pz = M[2] * ox + M[5] * oy + M[8] * oz + center[2];
    const r = a[o + 8] * 1.05 + 1.5;
    const dx = player.pos[0] - px,
      dy = player.pos[1] - py,
      dz = player.pos[2] - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < r * r && d2 > 1e-6) {
      const l = Math.sqrt(d2);
      bounce([dx / l, dy / l, dz / l], r - l);
    }
  }
}
