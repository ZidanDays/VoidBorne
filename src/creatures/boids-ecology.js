/* ---- boids ---- */
const UPV = [0, 1, 0];
// orientation helper: local +x (the head of every creature mesh) along d, local +y as close to `up` as possible
function qdirX(d, up) {
  const f = norm(d);
  let u = sub(up, scl(f, dot(up, f)));
  if (len(u) < 1e-4) ((u = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), (u = sub(u, scl(f, dot(u, f)))));
  u = norm(u);
  return qfromBasis(f, u, cross(f, u));
}
/* ---- ecology (Phase 5A): whales hunt minnow schools slowly; schools split into sub-groups, swirl away and re-merge;
   medusae brighten and pulse faster when a whale passes. Visual only: nothing is eaten and world generation is untouched. ---- */
let ecoFrame = 0;
function ecoEvery() {
  return quality === QUAL.low ? CFG.ECO_LOW_EVERY : 1;
}
function schoolFlee(sc, w) {
  if (sc.fleeT > 0 || sc.mergeT > 0 || (sc.cool || 0) > 0) return;
  for (const h of whales)
    if (h.hunt && h.hunt.sc === sc && h.hunt.mode === 'hunt') {
      h.hunt.mode = 'rest';
      h.hunt.t = 0;
    }
  /* the prey escaped: the hunter gives up and rests */ const away = norm(sub(sc.center, w.pos));
  let ax = cross(away, [0, 1, 0]);
  if (len(ax) < 1e-3) ax = [1, 0, 0];
  ax = norm(ax);
  const k = 2 + (ernd() < 0.5 ? 0 : 1);
  sc.groups = k;
  sc.fleeDirs = [];
  for (let g = 0; g < k; g++) {
    const ang = (g - (k - 1) / 2) * 1.05;
    sc.fleeDirs.push(qrot(qaxis(ax, ang), away));
  }
  sc.fleeAxis = norm(cross(away, ax));
  sc.fleeFrom = w.pos.slice();
  sc.fleeT = CFG.FLEE_TIME;
  sc.mergeT = 0;
  sc.fleeCount = (sc.fleeCount || 0) + 1;
}
function updateMinnows(dt) {
  const P = MINN.pos,
    V = MINN.vel;
  let nearestD = 1e9;
  const eco = CFG.ECOLOGY;
  for (const sc of MINN.schools) {
    sc.wt -= dt;
    if (sc.wt < 0) {
      sc.wander = erdir();
      sc.wt = err(2, 5);
    }
    const cx = [0, 0, 0],
      cv = [0, 0, 0];
    const splitNow = sc.fleeT > 0 || sc.mergeT > 0,
      SG = sc.groups || 3,
      gs = splitNow
        ? [
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [0, 0, 0, 0],
          ]
        : null;
    for (let i = 0; i < sc.n; i++) {
      const k = (sc.start + i) * 3;
      cx[0] += P[k];
      cx[1] += P[k + 1];
      cx[2] += P[k + 2];
      cv[0] += V[k];
      cv[1] += V[k + 1];
      cv[2] += V[k + 2];
      if (gs) {
        const g = gs[i % SG];
        g[0] += P[k];
        g[1] += P[k + 1];
        g[2] += P[k + 2];
        g[3]++;
      }
    }
    sc.center = scl(cx, 1 / sc.n);
    sc.vavg = scl(cv, 1 / sc.n);
    if (gs) {
      let m = 0;
      const c = gs.slice(0, SG).map((g) => [g[0] / g[3], g[1] / g[3], g[2] / g[3]]);
      for (let a = 0; a < SG; a++) for (let b = a + 1; b < SG; b++) m = Math.max(m, len(sub(c[a], c[b])));
      sc.spread = m;
    }
    const dPl = len(sub(sc.center, player.pos));
    if (dPl < nearestD) {
      nearestD = dPl;
      MINN.nearest = sc.center;
    }
    // flee trigger: a hunting whale gets within FLEE_RADIUS of the school centre
    if (eco && ecoFrame % ecoEvery() === 0)
      for (const w of whales) {
        if (w.hunt && w.hunt.mode === 'hunt' && len(sub(w.pos, sc.center)) < CFG.FLEE_RADIUS + w.scale * 0.4) schoolFlee(sc, w);
      } /* only a hunting whale scatters a school */
    const fleeing = sc.fleeT > 0,
      merging = !fleeing && sc.mergeT > 0;
    if (fleeing) {
      sc.fleeT -= dt;
      if (sc.fleeT <= 0) {
        sc.fleeT = 0;
        sc.mergeT = CFG.MERGE_TIME;
      }
    } else if (merging) {
      sc.mergeT -= dt;
      if (sc.mergeT <= 0) {
        if (sc.spread > 10 && (sc.mergeX || 0) < CFG.MERGE_TIME * 2) {
          sc.mergeT = 0.5;
          sc.mergeX = (sc.mergeX || 0) + 0.5;
        } else {
          sc.mergeT = 0;
          sc.mergeX = 0;
          sc.cool = CFG.FLEE_COOLDOWN;
        }
      }
    } /* keep merging until the sub-groups have actually mixed (max 3x MERGE_TIME) */ else if (sc.cool > 0) sc.cool -= dt;
    // mk: how much fish of other sub-groups count for cohesion/alignment (0 while split, ramps back to 1 while re-merging)
    const split = fleeing || merging;
    const G = sc.groups || 3;
    const mk = fleeing ? 0 : merging ? 1 - sc.mergeT / CFG.MERGE_TIME : 1;
    const fk = fleeing ? smooth(0, 1.2, sc.fleeT) * smooth(CFG.FLEE_TIME, CFG.FLEE_TIME - 0.6, sc.fleeT) : 0;
    const leash = split ? 0.15 + 0.85 * (merging ? mk : 0) : 1;
    const far = dPl > 900;
    const step = far ? 3 : 1;
    sc.tick = (sc.tick || 0) + 1;
    if (far && sc.tick % 3) continue;
    const ddt = dt * step; // distant schools keep the cheap 1-in-3 update even while split
    for (let i = 0; i < sc.n; i++) {
      const k = (sc.start + i) * 3;
      const px = P[k],
        py = P[k + 1],
        pz = P[k + 2];
      const gi = i % G;
      let cohx = 0,
        cohy = 0,
        cohz = 0,
        alx = 0,
        aly = 0,
        alz = 0,
        sx = 0,
        sy = 0,
        sz = 0,
        cnt = 0;
      for (let j = 0; j < sc.n; j++) {
        if (j === i) continue;
        const m = (sc.start + j) * 3;
        const dx = P[m] - px,
          dy = P[m + 1] - py,
          dz = P[m + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 256) continue;
        if (d2 < 30) {
          const w = 1 / (d2 + 0.1);
          sx -= dx * w;
          sy -= dy * w;
          sz -= dz * w;
        }
        const wgt = !split || j % G === gi ? 1 : mk;
        if (wgt <= 0) continue;
        cnt += wgt;
        cohx += P[m] * wgt;
        cohy += P[m + 1] * wgt;
        cohz += P[m + 2] * wgt;
        alx += V[m] * wgt;
        aly += V[m + 1] * wgt;
        alz += V[m + 2] * wgt;
      }
      let ax = 0,
        ay = 0,
        az = 0;
      if (cnt > 0) {
        ax += (cohx / cnt - px) * 0.5 + (alx / cnt - V[k]) * 0.8;
        ay += (cohy / cnt - py) * 0.5 + (aly / cnt - V[k + 1]) * 0.8;
        az += (cohz / cnt - pz) * 0.5 + (alz / cnt - V[k + 2]) * 0.8;
      }
      ax += sx * 10;
      ay += sy * 10;
      az += sz * 10;
      const hx = sc.home[0] - px,
        hy = sc.home[1] - py,
        hz = sc.home[2] - pz;
      const hd = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (hd > 140) {
        const w = (6 * leash * (hd - 140)) / 100 / hd;
        ax += hx * w;
        ay += hy * w;
        az += hz * w;
      }
      ax += sc.wander[0] * 2.5;
      ay += sc.wander[1] * 2.5;
      az += sc.wander[2] * 2.5;
      let vmax = 28;
      if (merging) {
        const mx = sc.center[0] - px,
          my = sc.center[1] - py,
          mz = sc.center[2] - pz;
        const ml = Math.sqrt(mx * mx + my * my + mz * mz) + 1e-3;
        const g = 0.5 * Math.min(1, 60 / ml),
          va = sc.vavg; /* re-merge: damped steering toward the school centre (no overshoot) */
        ax += (mx * g + va[0] - V[k]) * 2.2;
        ay += (my * g + va[1] - V[k + 1]) * 2.2;
        az += (mz * g + va[2] - V[k + 2]) * 2.2;
        vmax = 40;
      }
      if (fk > 0) {
        const fd = sc.fleeDirs[gi % sc.fleeDirs.length],
          fa = sc.fleeAxis;
        const rx = px - sc.fleeFrom[0],
          ry = py - sc.fleeFrom[1],
          rz = pz - sc.fleeFrom[2];
        const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) + 1e-3;
        const S = CFG.FLEE_STRENGTH * fk;
        const tx = fa[1] * rz - fa[2] * ry,
          ty = fa[2] * rx - fa[0] * rz,
          tz = fa[0] * ry - fa[1] * rx; // swirl: tangent around the whale
        ax += fd[0] * S + (tx / rl) * S * 0.45;
        ay += fd[1] * S + (ty / rl) * S * 0.45;
        az += fd[2] * S + (tz / rl) * S * 0.45;
        vmax = 36;
      }
      const ddx = px - player.pos[0],
        ddy = py - player.pos[1],
        ddz = pz - player.pos[2];
      const dd = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) + 1e-4;
      if (sc.beh === 'shy') {
        if (dd < 80) {
          const w = (60 * (1 - dd / 80)) / dd;
          ax += ddx * w;
          ay += ddy * w;
          az += ddz * w;
          vmax = 60;
        }
      } else if (sc.beh === 'curious') {
        if (dd < 260 && dd > 24) {
          const w = -5 / dd;
          ax += ddx * w;
          ay += ddy * w;
          az += ddz * w;
        } else if (dd <= 24) {
          const w = 35 / dd;
          ax += ddx * w;
          ay += ddy * w;
          az += ddz * w;
        }
      } else {
        if (dd < 18) {
          const w = 30 / dd;
          ax += ddx * w;
          ay += ddy * w;
          az += ddz * w;
        }
      }
      V[k] += ax * ddt;
      V[k + 1] += ay * ddt;
      V[k + 2] += az * ddt;
      const sp = Math.sqrt(V[k] * V[k] + V[k + 1] * V[k + 1] + V[k + 2] * V[k + 2]);
      if (sp > vmax) {
        const r = vmax / sp;
        V[k] *= r;
        V[k + 1] *= r;
        V[k + 2] *= r;
      } else if (sp < 6 && sp > 1e-4) {
        const r = 6 / sp;
        V[k] *= r;
        V[k + 1] *= r;
        V[k + 2] *= r;
      }
      P[k] += V[k] * ddt;
      P[k + 1] += V[k + 1] * ddt;
      P[k + 2] += V[k + 2] * ddt;
      const o = (sc.start + i) * INST;
      MINN.inst[o] = P[k];
      MINN.inst[o + 1] = P[k + 1];
      MINN.inst[o + 2] = P[k + 2];
      const q = qdirX([V[k], V[k + 1], V[k + 2]], UPV);
      MINN.inst[o + 3] = q[0];
      MINN.inst[o + 4] = q[1];
      MINN.inst[o + 5] = q[2];
      MINN.inst[o + 6] = q[3];
      MINN.inst[o + 11] = sp * 0.03 + Math.sin(time + i) * 0.1;
    }
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, MINN.mesh.ivbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, MINN.inst);
}
// whales: the original figure-eight path is the baseline; hunting adds a slow offset toward a school (capped at HUNT_SPEED)
function updateWhales(dt) {
  dt = dt || 1 / 60;
  ecoFrame++;
  const chk = CFG.ECOLOGY && ecoFrame % ecoEvery() === 0;
  for (const w of whales) {
    const t = time * w.w;
    const f = (tt) => qrot(w.tilt, [Math.cos(tt + w.ph) * w.r1, Math.sin(2 * tt + w.ph2) * w.r2 * 0.4, Math.sin(tt + w.ph) * w.r1]);
    const base = add(w.c, f(t));
    w.off = w.off || [0, 0, 0];
    w.hunt = w.hunt || { mode: 'idle', t: 0, sc: null };
    const H = w.hunt;
    if (!CFG.ECOLOGY) {
      H.mode = 'idle';
      H.sc = null;
    } else if (chk) {
      if (H.mode === 'idle') {
        let best = null,
          bd = CFG.HUNT_RANGE;
        for (const sc of MINN.schools) {
          if (!sc.center) continue;
          const d = len(sub(sc.center, base));
          if (d < bd) {
            bd = d;
            best = sc;
          }
        }
        if (best) {
          H.mode = 'hunt';
          H.t = 0;
          H.sc = best;
        }
      } else if (H.mode === 'hunt' && (H.t > CFG.HUNT_TIME || len(sub(H.sc.center, base)) > CFG.HUNT_RANGE * 1.4)) {
        H.mode = 'rest';
        H.t = 0;
      } else if (H.mode === 'rest' && H.t > CFG.HUNT_REST) {
        H.mode = 'idle';
        H.t = 0;
      }
    }
    H.t += dt;
    let want = [0, 0, 0];
    if (H.mode === 'hunt' && H.sc) {
      want = sub(H.sc.center, base);
      const l = len(want);
      if (l > CFG.HUNT_RANGE) want = scl(want, CFG.HUNT_RANGE / l);
    }
    const delta = sub(want, w.off);
    const dl = len(delta);
    const maxStep = CFG.HUNT_SPEED * (H.mode === 'hunt' ? 1 : 0.6) * dt;
    if (dl > 1e-6) w.off = add(w.off, scl(delta, Math.min(1, maxStep / dl)));
    const p = add(base, w.off);
    const prev = w.pos && len(w.pos) ? w.pos : p;
    let v = sub(p, prev);
    if (len(v) < 1e-5) v = sub(add(w.c, f(t + 0.01)), base);
    w.dir = w.dir ? norm(add(scl(w.dir, 0.9), scl(norm(v), 0.1))) : norm(v);
    w.pos = p;
    w.q = qdirX(w.dir, qrot(w.tilt, [0, 1, 0]));
    w.mesh.anchor = p;
    const a = w.mesh.inst;
    instQ(a, 0, [0, 0, 0], w.q, w.scale, [1, 1, 1], w.ph);
    gl.bindBuffer(gl.ARRAY_BUFFER, w.mesh.ivbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
  }
}
// medusae: the bell phase is integrated on the CPU (anim 7 / mat 13) so the pulse can speed up smoothly near a whale
function updateMedusae(dt) {
  let nd = 1e9;
  const a = medusae.inst;
  const chk = CFG.ECOLOGY && ecoFrame % ecoEvery() === 0;
  const R = CFG.MEDUSA_WHALE_RANGE;
  medusae.list.forEach((m, i) => {
    const dr = [Math.sin(time * 0.11 + m.ph) * 0.8, Math.cos(time * 0.13 + m.ph * 1.3) * 0.6, Math.sin(time * 0.09 + m.ph * 0.7) * 0.8];
    m.p = add(m.p, scl(dr, dt));
    const home = sub(m.home, m.p);
    const hd = len(home);
    if (hd > 200) m.p = add(m.p, scl(home, dt * 0.2));
    const dp = sub(m.p, player.pos);
    const d = len(dp);
    if (d < nd) {
      nd = d;
      medusae.nearest = m.p;
    }
    const near = smooth(70, 15, d);
    m.glow = lerp(m.glow, near, 1 - Math.exp(-2 * dt));
    if (d < 70 && d > 1e-3) m.p = add(m.p, scl(dp, (8 * (1 - d / 70) * dt) / d));
    if (chk) {
      let wt = 0;
      for (const w of whales) {
        const dw = len(sub(w.pos, m.p)) - w.scale * 0.3;
        wt = Math.max(wt, smooth(R, R * 0.35, dw));
      }
      m.wTarget = wt;
    }
    m.wglow = lerp(m.wglow || 0, CFG.ECOLOGY ? m.wTarget || 0 : 0, 1 - Math.exp(-(m.wTarget > (m.wglow || 0) ? 1.5 : 0.35) * dt));
    m.pulse = (m.pulse === undefined ? m.ph : m.pulse) + dt * (1.2 + m.ph * 0.1) * (1 + 1.8 * m.wglow);
    const g = Math.max(m.glow, m.wglow);
    const q = qmul(m.q, qaxis([1, 0, 0], 0.12 * Math.sin(time * 0.35 + m.ph)));
    const c = scl(m.c, 1 + g * 1.6);
    instQ(a, i, m.p, q, m.s * (1 + 0.15 * m.glow), c, m.pulse);
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, medusae.mesh.ivbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
}
const lightPos = new Float32Array(64),
  lightCol = new Float32Array(64);
let numLights = 8;
function updateStructures() {
  for (const w of wrecks) {
    w.q = qaxis(w.axis, time * w.rate + w.ph);
    for (const it of w.items) {
      const a = it.mesh.inst;
      a[3] = w.q[0];
      a[4] = w.q[1];
      a[5] = w.q[2];
      a[6] = w.q[3];
      gl.bindBuffer(gl.ARRAY_BUFFER, it.mesh.ivbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
    }
    if (w.big) {
      const wp = add(w.pos, qrot(w.q, w.artifact.local));
      secrets[3].pos = wp;
      const a = w.artifact.mesh.inst;
      instQ(a, 0, qrot(w.q, w.artifact.local), qaxis([0.3, 1, 0.2], time * 0.8), 1.8, [0.3, 0.9, 1.0], 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, w.artifact.mesh.ivbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
      w.ship.lightList.forEach((l, i) => {
        const p = add(w.pos, qrot(w.q, l.p));
        lightPos.set([p[0], p[1], p[2], 0.06], i * 4);
        if (INT.power && l.p[0] > 3 && l.p[0] < 38) {
          lightPos[i * 4 + 3] = 0.03;
          lightCol.set([0.88, 0.93, 1, 3], i * 4);
          return;
        }
        /* powered section: steady light */ const on = RM
          ? 0.45 + 0.1 * Math.sin(time * 0.5 + l.ph)
          : Math.sin(time * (1.1 + (l.ph % 1) * 2.5) + l.ph * 3) > 0.15
            ? 1
            : 0.08;
        const fl = !RM && Math.random() < 0.04 ? 0.3 : 1;
        /* reduced motion: steady, dim emergency light */ lightCol.set([l.c[0], l.c[1], l.c[2], on * fl * 9], i * 4);
      });
    }
  }
  station.q = qmul(station.base, qaxis([0, 1, 0], time * 0.02));
  for (const it of station.items) {
    const a = it.mesh.inst;
    a[3] = station.q[0];
    a[4] = station.q[1];
    a[5] = station.q[2];
    a[6] = station.q[3];
    gl.bindBuffer(gl.ARRAY_BUFFER, it.mesh.ivbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
  }
  for (const s of secrets) {
    if (!s.spin) continue;
    const q = s.kind === 'monolith' ? qaxis([0, 1, 0], time * 0.05) : qaxis([0.5, 1, 0.3], time * 0.3);
    for (const it of s.items) {
      const a = it.mesh.inst;
      a[3] = q[0];
      a[4] = q[1];
      a[5] = q[2];
      a[6] = q[3];
      gl.bindBuffer(gl.ARRAY_BUFFER, it.mesh.ivbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, a);
    }
  }
  for (const l of landmarks) {
    if (l.kind !== 'pulsar') continue;
    const q = qmul(qaxis(l.axis, (time * TAU) / l.period + l.ph), l.tilt);
    const beam = qrot(q, [0, 1, 0]);
    const toCam = norm(sub(player.pos, l.pos));
    const hit = Math.max(Math.abs(dot(beam, toCam)), 0.0);
    l.pulse = lerp(l.pulse, smooth(0.985, 0.999, hit), 0.5);
    const core = l.items[0].mesh.inst;
    instQ(
      core,
      0,
      [0, 0, 0],
      qid(),
      22 * (1 + 0.4 * l.pulse),
      [0.8, 0.9, 1.0].map((c) => c * (1 + 3 * l.pulse)),
      5,
    );
    const bm = l.items[1].mesh.inst;
    instQ(bm, 0, [0, 0, 0], q, 1, [1, 1, 1], 0);
    for (const it of l.items) {
      gl.bindBuffer(gl.ARRAY_BUFFER, it.mesh.ivbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, it.mesh.inst);
    }
  }
  for (const p of planets) {
    p.q = qaxis(p.axis, time * p.spin);
    for (const m of p.moons) {
      const a = m.ang + time * m.w;
      m.pos = add(p.pos, qrot(m.q, [Math.cos(a) * m.dist, 0, Math.sin(a) * m.dist]));
    }
  }
}
