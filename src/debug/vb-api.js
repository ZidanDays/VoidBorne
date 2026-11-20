/* =====================================================================
   DEBUG API (Phase 6A) — debug build only (node build.mjs --debug -> dist/voidborne.debug.html).
   window.__VB lets the test runners drive the game (tests/shots.mjs, tests/bench.html):
     getState()           seed, quality, test flags, frame, time, pose, sector, render size, renderer, worker mode, …
     setPose(pos, quat)   put the player/camera at a world position with an orientation quaternion [x, y, z, w]
     lookAt(pos, target)  same, oriented towards a point
     place(spec)          camera placement by description (see tests/bookmarks.json and vbPlace below)
     setTime(t)           set the simulation clock (s). Drives everything animated from time: planet spin, moon orbits,
                          whale paths, pulsar, shader animation. Integrated state (boids, player speed) is not rewound.
     freeze() / unfreeze() stop / restart the requestAnimationFrame loop; step(n) then runs n frames synchronously
                          (each exactly CFG.DET_DT with ?det=1). Load with ?manual=1 to be frozen from the first frame.
     settle(maxMs)        async: wait until no sector is pending and every streamed upload is done
     setQuality(q)        'low' | 'medium' | 'high' | 'ultra' — the same code path as the pause-menu selector (saved unless
                          ?nostore=1); with ?noscale=1 / ?det=1 the fixed render scale follows the new preset
     listObjects()        every object the game knows: kind, name, position, radius, sector, solid
     raycast(origin, dir) nearest hit along a ray against solids: stars, planets, moons, wrecks (capsule), station,
                          landmarks (bounding shapes, see vbRaycast)
     screenshot(scale)    scale 1: render one frame and read the canvas back. Other scales (Phase 6B): the release
                          build's offscreen HD capture (render/capture.js: one pass, or tiles if needed; TAA frames
                          accumulated) at scale × the canvas size. Returns { png, width, height, scale, tiles, … } or
                          { error } (the GPU could not allocate even the smallest tiles).
     ultra()              (Phase 6B) state of the 'ultra' preparation: ready, failed, time to ready, textures, queue
     place({ at: 'starclass', cls: 'M', kind: 'close' })   (Phase 6C) the nearest generated system of that star class / kind
     place({ at: 'sysplanet', kind: 'close', index: 0 })    (Phase 6C) a planet of such a system, terminator side
     place({ at: 'ptype', type: 8 }) / place({ at: 'ptype', moon: 16 })    (Phase 6D) nearest planet / moon of a new type
     place({ at: 'e6', what: 'comet' })   (Phase 6E) comet | belt | graveyard | ghull | ring | mono | snr | pn (inside: true)
     glErrors()           drain and name every pending WebGL error (empty array = none)
     start()              leave the start screen without the intro, audio or pointer lock
     digest()             short hash of the home world (numbers rounded), to confirm which world a run used
   Older names stay as aliases: info() = getState(), manual(on), pose(), shot() = screenshot(1).png.
   The release build contains none of this: build.mjs refuses to write dist/voidborne.html if "__VB" appears in it.
   ===================================================================== */
const VB_SPAWN = { pos: player.pos.slice(), q: player.q.slice() };
function vbRenderer() {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) {
    return 'unknown';
  }
}
function vbLook(pos, target, up = [0, 1, 0]) {
  const f = norm(sub(target, pos));
  player.pos = pos.slice();
  player.q = qlook(f, Math.abs(dot(f, up)) > 0.98 ? [1, 0, 0] : up);
  player.vel = [0, 0, 0];
}
// a point in wreck 0's local frame -> world. The wreck tumbles slowly and W0.q is only refreshed by a frame, so the
// orientation is computed here for the current time with the game's own formula (updateStructures)
const vbW0q = () => qaxis(W0.axis, time * W0.rate + W0.ph);
const vbW0 = (lp) => add(W0.pos, qrot(vbW0q(), lp));
// whale position on its path at the current time (without the hunting offset, no side effects)
function vbWhalePos(w) {
  const t = time * w.w;
  return add(w.c, qrot(w.tilt, [Math.cos(t + w.ph) * w.r1, Math.sin(2 * t + w.ph2) * w.r2 * 0.4, Math.sin(t + w.ph) * w.r1]));
}
// camera placement by description; every distance is in radii of the subject unless noted
//   spawn · open (dist m from the star along dir, looking outwards) · nebula (index, dist in cloud radii)
//   star · flare (star + a stellar flare at its peak) · planet (index or type) · moon (planet index/type, moon index)
//   ringed · belt (angle, height) · school (index, dist m) · whale (index, dist in whale sizes) · medusa (index, dist m)
//   wreck (index) · breach (dist m outside wreck 0's hull breach) · interior (inside wreck 0, local pos/look)
//   station · landmark (kind 'blackhole' | 'pulsar', dist m) · sector (first existing neighbour or cell [x,y,z]) · pos
function vbPlace(s = {}) {
  // dir: direction from the subject to the camera; "sun" = the lit side (towards the home star, a little above)
  const dirFor = (c) => (s.dir === 'sun' ? norm(add(norm(sub(STAR.pos, c)), [0, 0.35, 0])) : norm(s.dir || [0.45, 0.3, 0.84]));
  const orbit = (c, r, dist) => vbLook(add(c, scl(dirFor(c), r * dist)), c);
  const pickPlanet = () => (s.type !== undefined ? planets.find((x) => x.type === s.type) || planets[0] : planets[s.index || 0]);
  switch (s.at || 'spawn') {
    case 'spawn':
      player.pos = VB_SPAWN.pos.slice();
      player.q = VB_SPAWN.q.slice();
      player.vel = [0, 0, 0];
      break;
    case 'open': {
      const d = norm(s.dir || [0.2, 0.9, 0.3]);
      const p = add(STAR.pos, scl(d, s.dist || CFG.WORLD_RADIUS * 1.6));
      vbLook(p, add(p, d));
      break;
    }
    case 'nebula': {
      const c = clouds[s.index || 0];
      orbit(c.c, c.R, s.dist || 2.2);
      break;
    }
    case 'star':
      orbit(STAR.pos, STAR.r, s.dist || 3);
      break;
    case 'flare':
      orbit(STAR.pos, STAR.r, s.dist || 3);
      triggerEvent('flare');
      EV.flareT = s.flareT === undefined ? 3.5 : s.flareT; // 3.5 s = the brightest moment of the 7 s flare
      break;
    case 'planet': {
      const p = pickPlanet();
      orbit(p.pos, p.r, s.dist || 3);
      break;
    }
    case 'moon': {
      // camera on the far side of the moon from its planet (planet in the background); moon.pos is only refreshed by a
      // frame, so the position is computed here with the game's own orbit formula for the current time
      const p = s.type !== undefined || s.index !== undefined ? pickPlanet() : planets.find((x) => x.moons.length);
      const m = p.moons[s.moon || 0];
      if (!m) throw new Error('planet ' + p.name + ' has no moon ' + (s.moon || 0));
      const a = m.ang + time * m.w;
      const mp = add(p.pos, qrot(m.q, [Math.cos(a) * m.dist, 0, Math.sin(a) * m.dist]));
      const d = s.dir ? dirFor(mp) : norm(add(norm(sub(mp, p.pos)), [0, 0.4, 0]));
      vbLook(add(mp, scl(d, m.r * (s.dist || 4))), mp);
      break;
    }
    case 'ringed': {
      const p = planets.find((x) => x.ring) || planets.find((x) => x.type === 1) || planets[0];
      orbit(p.pos, p.r, s.dist || 3);
      break;
    }
    case 'belt': {
      // inside the asteroid belt, looking along it (angle in radians around the belt)
      const a = s.angle || 0,
        R = (BELT.R0 + BELT.R1) / 2;
      const at = (b) => add(STAR.pos, qrot(BELT.q, [Math.cos(b) * R, s.height || 0, Math.sin(b) * R]));
      vbLook(at(a), at(a + 0.08));
      break;
    }
    case 'school': {
      const sc = MINN.schools[s.index || 0];
      orbit(sc.home, 1, s.dist || 70); // dist in metres
      break;
    }
    case 'whale': {
      const w = whales[s.index || 0];
      orbit(vbWhalePos(w), w.scale, s.dist || 1);
      break;
    }
    case 'medusa': {
      const m = medusae.list[s.index || 0];
      orbit(m.home, 1, s.dist || 220); // dist in metres from the swarm centre
      break;
    }
    case 'wreck': {
      const w = wrecks[s.index || 0];
      orbit(w.pos, w.rad, s.dist || 3);
      break;
    }
    case 'breach': {
      // outside wreck 0's hull breach, looking at the opening (same geometry as the seed test's goal chain)
      const b = W0.ship.breach,
        a = b.u * TAU,
        x = (b.v - 0.5) * W0.ship.L,
        r = profR(W0.ship, b.v),
        d = s.dist || 12;
      vbLook(vbW0([x + (s.side || 0), (r + d) * Math.cos(a), (r + d) * Math.sin(a)]), vbW0([x, r * Math.cos(a), r * Math.sin(a)]));
      break;
    }
    case 'interior': {
      // inside wreck 0 (local coordinates of the hull: x along the ship, deck at y ≈ -2.6); default: the breach hold
      // looking towards the engineering door
      const lp = s.pos || [-13, -1, 0],
        lk = s.look || [2.3, -1.5, 0];
      vbLook(vbW0(lp), vbW0(lk), qrot(vbW0q(), [0, 1, 0]));
      break;
    }
    case 'station':
      orbit(station.pos, station.rad, s.dist || 3);
      break;
    case 'landmark': {
      const l = landmarks.find((x) => x.kind === (s.kind || 'blackhole'));
      if (!l) throw new Error('no ' + (s.kind || 'blackhole') + ' in this system (CFG switch off?)');
      orbit(l.pos, 1, s.dist || (l.kind === 'blackhole' ? 520 : 320)); // dist in metres
      break;
    }
    case 'sector': {
      // the first existing neighbour sector (or the one given by s.cell), seen from s.dist star radii
      let m = null;
      const cells = s.cell ? [s.cell] : [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) cells.push([x, y, z]);
      for (const c of cells) {
        const mm = sectorMeta(c[0], c[1], c[2]);
        if (mm.exists && !mm.home) {
          m = mm;
          break;
        }
      }
      if (!m) throw new Error('no neighbour sector exists for this seed');
      orbit(m.star, m.r, s.dist || 6);
      break;
    }
    case 'starclass': {
      // Phase 6C: the nearest generated system (by sector distance) whose primary has class s.cls and/or kind s.kind
      // ('single' | 'close' | 'wide' | 'triple'), searched up to s.range sectors out (default 6); seen from s.dist radii
      // (of the primary, or of the whole pair for a close pair)
      const m = vbFindSys(s);
      const r0 = m.sys.orbit ? m.sys.orbit.a + m.r : m.r;
      orbit(m.star, r0, s.dist || 6);
      break;
    }
    case 'sysplanet': {
      // Phase 6C: planet s.index of such a system (generated here exactly as the game will), seen from the side so the
      // terminator(s) show; s.dir overrides the direction
      const m = vbFindSys(s);
      const o = genMain(m);
      const p = o.planets[Math.min(s.index || 0, o.planets.length - 1)];
      const toS = norm(sub(m.star, p.pos));
      const side = norm(cross(toS, [0, 1, 0]));
      const d = s.dir ? norm(s.dir) : norm(add(add(scl(toS, 0.45), scl(side, 0.85)), [0, 0.25, 0]));
      vbLook(add(p.pos, scl(d, p.r * (s.dist || 2.4))), p.pos);
      break;
    }
    case 'ptype': {
      // Phase 6D: the nearest generated planet of type s.type (8..15; 15 = rogue planet), or moon of type s.moon (16..18),
      // seen from the lit side; s.dist in radii, s.dir overrides the direction
      const f = vbFindBody(s);
      let c = f.p.pos,
        r = f.p.r;
      if (f.moon) {
        const mo = f.moon,
          a = mo.ang + time * mo.w;
        c = add(f.p.pos, qrot(mo.q, [Math.cos(a) * mo.dist, 0, Math.sin(a) * mo.dist]));
        r = mo.r;
      }
      const toS = f.m.rogue ? [0.3, 0.4, 0.86] : norm(sub(f.m.star, c));
      const side = norm(cross(toS, [0, 1, 0]));
      let d = s.dir ? norm(s.dir) : norm(add(add(scl(toS, s.side === undefined ? 0.75 : 1 - s.side), scl(side, s.side === undefined ? 0.5 : s.side)), [0, 0.25, 0])); // prettier-ignore
      if (s.plume && f.moon && f.moon.plume) {
        // the plume seen side-on, from the lit half: perpendicular to the vent direction
        const up = qrot(f.moon.q, f.moon.plume.dir);
        const pd = sub(toS, scl(up, dot(toS, up)));
        d = norm(add(len(pd) > 1e-3 ? norm(pd) : norm(cross(up, [0, 1, 0])), scl(up, 0.35)));
        c = add(c, scl(up, r * 0.9)); // aim a little above the vent
      }
      vbLook(add(c, scl(d, r * (s.dist || 2.4))), c);
      VB_LAST.body = { sector: f.m.key, name: (f.moon || f.p).name, type: (f.moon || f.p).type };
      break;
    }
    case 'e6': {
      // Phase 6E: s.what = comet | belt | graveyard | ghull (inside an enterable hull) | ring | mono | snr | pn; nearest first
      const f = vbFindE6(s);
      const m = f.m,
        o = f.out,
        d = s.dist;
      VB_LAST.body = { sector: m.key, what: s.what };
      if (s.what === 'comet') {
        const c = o.comets[0],
          cp = cometPos(c, time),
          ad = norm(sub(cp, m.star));
        const side = norm(cross(ad, [0, 1, 0]));
        vbLook(add(cp, add(scl(side, d || 2200), scl(ad, 600))), add(cp, scl(ad, 700)));
        VB_LAST.body.name = c.name;
      } else if (s.what === 'belt') {
        const B = o.belt,
          rm = (B.R0 + B.R1) / 2;
        const p = add(B.C, qrot(B.q, [rm, 40, 0])),
          look = add(B.C, qrot(B.q, [rm * Math.cos(0.08), 0, rm * Math.sin(0.08)]));
        vbLook(p, look);
      } else if (s.what === 'graveyard') {
        const G = o.graveyard;
        vbLook(add(G.c, scl(norm([0.6, 0.35, 0.7]), G.R * (d || 1.7))), G.c);
      } else if (s.what === 'ghull') {
        const w = o.wrecks.find((x) => x.big);
        const q = qaxis(w.axis, time * w.rate + w.ph);
        vbLook(add(w.pos, qrot(q, [-w.L * 0.3, -w.R * 0.5 + 4, 0])), add(w.pos, qrot(q, [w.L * 0.2, -w.R * 0.3, 0])));
        VB_LAST.body.name = w.name;
      } else if (s.what === 'ring' || s.what === 'mono') {
        const A = o.aring,
          mid = (A.a0 + A.a1) / 2;
        const at = (phi, rad, y) => add(A.C, qrot(A.q, [Math.cos(phi) * rad, y, Math.sin(phi) * rad]));
        if (s.what === 'mono') vbLook(add(A.monoPos, scl(norm(sub(A.C, A.monoPos)), 45)), A.monoPos);
        else vbLook(at(A.a0 - 0.05, A.Rr - (d || 900), A.W * 1.2), at(mid, A.Rr, 0));
      } else {
        const L = m.landmark,
          dir = norm([0.5, 0.3, 0.8]);
        if (s.inside) vbLook(add(m.star, scl(dir, L.R * 0.55)), add(m.star, scl(dir, L.R * 2)));
        else vbLook(add(m.star, scl(dir, L.R * (d || 2.4))), m.star);
      }
      break;
    }
    case 'pos':
      vbLook(s.pos, s.look || add(s.pos, [0, 0, -1]));
      break;
    default:
      throw new Error('unknown place: ' + s.at);
  }
  return { pos: player.pos.slice(), q: player.q.slice() };
}
// Phase 6C: nearest generated system matching { cls, kind } within s.range sectors (default 6), by sector distance
// Phase 6E: nearest sector holding s.what (generated in full, then thrown away; the streamer generates it again when it loads)
function vbFindE6(s) {
  const R = s.range || 10,
    cand = [];
  for (let x = -R; x <= R; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -R; z <= R; z++) {
        const mm = sectorMeta(x, y, z);
        if (mm.home) continue;
        const w = s.what;
        if (
          w === 'snr' || w === 'pn'
            ? mm.landmark && mm.landmark.kind === w
            : w === 'ring' || w === 'mono'
              ? mm.landmark && mm.landmark.kind === 'ring'
              : w === 'graveyard' || w === 'ghull'
                ? mm.graveyard
                : mm.exists
        )
          cand.push([x * x + y * y + z * z, mm]);
      }
  cand.sort((a, b) => a[0] - b[0]);
  let skip = s.nth || 0;
  for (const [, mm] of cand) {
    const o = withSeed(mm.seed, () => genSector(sectorMsg(mm), false));
    const ok =
      s.what === 'comet'
        ? o.comets.length > 0
        : s.what === 'belt'
          ? !!o.belt
          : s.what === 'ring' || s.what === 'mono'
            ? !!o.aring
            : s.what === 'graveyard' || s.what === 'ghull'
              ? !!o.graveyard
              : true;
    if (ok && skip-- <= 0) return { m: mm, out: o };
  }
  throw new Error('no ' + s.what + ' within ' + R + ' sectors');
}
// Phase 6D: nearest sector (by grid distance) holding a planet of type s.type, a moon of type s.moon, or (s.ring) a ringed
// planet of a type that never had rings; s.nth skips that many matches
const VB_LAST = {};
function vbFindBody(s) {
  const R = s.range || 8,
    cand = [];
  for (let x = -R; x <= R; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -R; z <= R; z++) {
        const mm = sectorMeta(x, y, z);
        if (mm.home || !(mm.exists || mm.rogue)) continue;
        if (s.type === 15 && !s.moon ? !mm.rogue : mm.rogue) continue;
        cand.push([x * x + y * y + z * z, mm]);
      }
  cand.sort((a, b) => a[0] - b[0]);
  let skip = s.nth || 0;
  for (const [, mm] of cand) {
    const o = withSeed(mm.seed, () => genSector(sectorMsg(mm), false, true));
    for (const p of o.planets) {
      const moon = s.moon ? p.moons.find((m) => m.type === s.moon) : null;
      const ok = s.ring ? !!(p.ring && p.type !== 1 && p.type !== 13) : s.moon ? moon : p.type === s.type; // ring: a rare ring on a type that never had one
      if (ok) {
        if (skip-- > 0) continue;
        return { m: mm, p, moon };
      }
    }
  }
  throw new Error('no body of type ' + (s.moon || s.type) + ' within ' + R + ' sectors');
}
function vbFindSys(s) {
  let m = null,
    bd = 1e9;
  const R = s.range || 6;
  for (let x = -R; x <= R; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -R; z <= R; z++) {
        const mm = sectorMeta(x, y, z);
        if (!mm.exists || mm.home || !mm.sys) continue;
        if (s.cls && mm.cls !== s.cls) continue;
        if (s.kind && mm.sys.kind !== s.kind) continue;
        const d = x * x + y * y + z * z;
        if (d < bd) {
          bd = d;
          m = mm;
        }
      }
  if (!m) throw new Error('no system with ' + (s.cls || '') + ' ' + (s.kind || '') + ' within ' + R + ' sectors');
  return m;
}
function vbStep(n = 1) {
  for (let i = 0; i < n; i++) {
    const now = last + 1000 / 60;
    if (!runFrame(now)) throw new Error('frame failed: ' + errBox.textContent.slice(0, 300));
  }
  return DET.frame;
}
async function vbSettle(maxMs = 60000) {
  const t0 = performance.now();
  for (;;) {
    while (UPQ.length) UPQ.shift()();
    if (!GEN.pending.size) return true;
    if (performance.now() - t0 > maxMs) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
}
function vbDigest() {
  let h = 2166136261;
  const r3 = (x) => String(Math.round(x * 1000) / 1000);
  const add1 = (s) => {
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  };
  for (const p of planets) add1([p.type, ...p.pos.map(r3), r3(p.r), p.name].join(','));
  for (const w of wrecks) add1([w.name, ...w.pos.map(r3)].join(','));
  add1([...station.pos.map(r3), r3(STAR.r), STAR.name].join(','));
  return (h >>> 0).toString(16).padStart(8, '0');
}
function vbState() {
  return {
    build: 'debug',
    seed: CFG.SEED,
    quality: Object.keys(QUAL).find((k) => QUAL[k] === quality) || CFG.QUALITY,
    det: { on: DET.on, seeded: DET.seeded, noScale: DET.noScale, noStore: DET.noStore, manual: DET.manual },
    frame: DET.frame,
    time,
    started,
    paused,
    pose: { pos: player.pos.slice(), q: player.q.slice(), vel: player.vel.slice(), inside: !!player.inside },
    sector: SECT.cur,
    sectorsLoaded: SECT.loaded.size,
    pending: GEN.pending.size,
    uploads: UPQ.length,
    genMode: GEN.mode,
    renderScale,
    qualitySource: QSRC, // Phase 6B: url | auto | user | saved | mobile | default
    taaMode: CFG.TAA_MODE,
    fov: CFG.FOV,
    ultra: quality.ultraFx ? vbUltra() : null,
    canvas: [canvas.width, canvas.height],
    dpr: devicePixelRatio,
    msaa: SAMPLES,
    renderer: vbRenderer(),
    discoveries: typeof foundSet !== 'undefined' ? foundSet.size : null,
    loadMs: window.__vbLoadMs,
    errors: errBox.textContent,
  };
}
function vbSetQuality(q) {
  if (!QUAL[q]) throw new Error('unknown quality: ' + q + ' (use ' + Object.keys(QUAL).join(', ') + ')');
  const sel = $('#qual');
  sel.value = q;
  sel.dispatchEvent(new Event('change')); // exactly what the pause-menu selector does
  if (DET.noScale) renderScale = quality.scale; // the fixed scale follows the preset in test modes
  return vbState().quality;
}
function vbSetTime(t) {
  time = +t || 0;
  if (DET.on) DET.clock = time;
  return time;
}
// everything the game knows about, as plain data (positions are copies: safe to keep)
function vbList() {
  const out = [];
  const cp = (v) => (v ? [v[0], v[1], v[2]] : null);
  const secOf = new Map();
  for (const s of readySectors()) for (const o of s.poi) secOf.set(o, s.key);
  for (const p of POI) {
    const solid = !['secret', 'signal', 'beacon'].includes(p.kind);
    out.push({
      kind: p.kind,
      name: String(p.name),
      sub: String(p.sub || ''),
      pos: cp(p.pos),
      r: p.r,
      sector: secOf.get(p) || '0,0,0',
      solid,
      ...(p.kind === 'star' && p.sclass ? { cls: p.sclass, system: p.ref && p.ref.kind } : {}), // Phase 6C
    });
  }
  whales.forEach((w, i) => out.push({ kind: 'whale', name: 'whale ' + i, pos: cp(w.pos), r: w.scale, sector: '0,0,0', solid: false }));
  MINN.schools.forEach((sc, i) =>
    out.push({ kind: 'minnow-school', name: 'school ' + i, pos: cp(sc.home), r: 60, sector: '0,0,0', solid: false }),
  );
  const homes = [];
  for (const m of medusae.list) if (!homes.includes(m.home)) homes.push(m.home);
  homes.forEach((h, i) => out.push({ kind: 'medusa-swarm', name: 'swarm ' + i, pos: cp(h), r: 160, sector: '0,0,0', solid: false }));
  clouds.forEach((c, i) => out.push({ kind: 'nebula', name: 'nebula ' + i, pos: cp(c.c), r: c.R, sector: '0,0,0', solid: false }));
  out.push({ kind: 'belt', name: 'asteroid belt', pos: cp(STAR.pos), r: BELT.R1, r0: BELT.R0, sector: '0,0,0', solid: true });
  return out;
}
// ray against bounding shapes: spheres for stars/planets/moons/station/landmarks, a capsule along the hull for wrecks
// (the game's own collision uses the hull profile; the capsule is a close, slightly generous stand-in)
function vbRaycast(origin, dir, maxDist = 1e7) {
  const o = origin.slice(),
    d = norm(dir);
  let best = null;
  const hit = (t, kind, name) => {
    if (t >= 0 && t <= maxDist && (!best || t < best.dist)) best = { hit: true, kind, name, dist: t, point: add(o, scl(d, t)) };
  };
  const sphere = (c, r, kind, name) => {
    const oc = sub(o, c),
      b = dot(oc, d),
      cc = dot(oc, oc) - r * r,
      h = b * b - cc;
    if (h < 0) return;
    const sh = Math.sqrt(h),
      t = -b - sh;
    hit(t >= 0 ? t : -b + sh < 0 ? -1 : 0, kind, name); // inside the sphere: distance 0
  };
  const capsule = (w, kind) => {
    const ax = qrot(w.q, [w.ship.L * 0.5, 0, 0]),
      a = sub(w.pos, ax),
      b = add(w.pos, ax),
      R = w.ship.R;
    const oc = sub(o, w.pos),
      bb = dot(oc, d),
      h = bb * bb - (dot(oc, oc) - w.rad * w.rad);
    if (h < 0) return;
    let t = Math.max(0, -bb - Math.sqrt(h));
    const tEnd = -bb + Math.sqrt(h);
    for (let i = 0; i < 256 && t <= tEnd; i++) {
      const p = add(o, scl(d, t));
      const ab = sub(b, a);
      const k = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
      const sdf = len(sub(p, add(a, scl(ab, k)))) - R;
      if (sdf < 0.05) return hit(t, kind, w.name);
      t += Math.max(sdf, 0.05);
    }
  };
  for (const b of allBodies()) sphere(b.pos, b.r, b.star ? 'star' : b.moons ? 'planet' : 'moon', b.name || (b.star ? 'star' : ''));
  for (const w of wrecks) capsule(w, 'wreck');
  for (const s of readySectors()) for (const w of s.wrecks) capsule(w, 'wreck');
  sphere(station.pos, station.rad, 'station', station.name);
  for (const l of landmarks) sphere(l.pos, l.kind === 'blackhole' ? l.Rs : 22, l.kind, l.name);
  return best || { hit: false };
}
// Renders at scale × the canvas size by temporarily overriding the canvas's CSS size seen by render() (debug only;
// the release build has no such path). Clamped to what the GPU allows; reports allocation failures instead of throwing.
function vbUltra() {
  return {
    ready: ULTRA.ready,
    failed: ULTRA.failed,
    readyMs: ULTRA.readyMs,
    programs: ULTRA.pr ? Object.keys(ULTRA.pr).filter((k) => ULTRA.pr[k]) : [],
    texSize: ULTRA.texS,
    cubeSize: ULTRA.cubeS,
    sph7: !!ULTRA.sph7,
    tessellated: ULTRA.tessSet.size,
    tessQueued: ULTRA.tessQ.length,
    anisoMax: ULTRA.ext ? ULTRA.ext.anisoMax : null,
  };
}
function vbScreenshot(scale = 1, frames) {
  scale = Math.max(0.1, +scale || 1);
  if (Math.abs(scale - 1) > 1e-6) {
    // Phase 6B: the release HD capture path, run to completion synchronously
    vbGlErrors();
    const r = captureSync(scale, frames);
    const errs = vbGlErrors();
    if (!r || r.error) return { error: 'capture failed: ' + (r ? r.error : 'busy'), glErrors: errs };
    return { png: r.dataURL, width: r.width, height: r.height, scale, tiles: r.tiles, frames: r.frames, ms: r.ms, glErrors: errs };
  }
  let res;
  try {
    vbGlErrors(); // start clean, so an error below is ours
    vbStep(frames || 1);
    const errs = vbGlErrors();
    res = { png: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, scale: 1, tiles: 0, glErrors: errs };
  } catch (e) {
    res = { error: String(e.message || e) };
  }
  return res;
}
const VB_GLERR = {
  0x0500: 'INVALID_ENUM',
  0x0501: 'INVALID_VALUE',
  0x0502: 'INVALID_OPERATION',
  0x0505: 'OUT_OF_MEMORY',
  0x0506: 'INVALID_FRAMEBUFFER_OPERATION',
  0x9242: 'CONTEXT_LOST_WEBGL',
};
function vbGlErrors() {
  const out = [];
  for (let i = 0; i < 32; i++) {
    const e = gl.getError();
    if (!e) break;
    out.push(VB_GLERR[e] || '0x' + e.toString(16));
  }
  return out;
}
window.__VB = {
  version: 2,
  getState: vbState,
  setPose(pos, q) {
    player.pos = pos.slice();
    if (q) player.q = q.slice();
    player.vel = [0, 0, 0];
  },
  lookAt: (pos, target) => vbLook(pos, target),
  place: vbPlace,
  setTime: vbSetTime,
  freeze() {
    DET.manual = true;
    return true;
  },
  unfreeze() {
    DET.manual = false;
    return false;
  },
  step: vbStep,
  settle: vbSettle,
  setQuality: vbSetQuality,
  listObjects: vbList,
  raycast: vbRaycast,
  screenshot: vbScreenshot,
  ultra: vbUltra,
  glErrors: vbGlErrors,
  start() {
    CFG.INTRO = false;
    if (!started) {
      started = true;
      $('#start').style.display = 'none';
    }
    if (INTRO.on) introEnd();
    return true;
  },
  digest: vbDigest,
  // aliases kept from the first 6A version
  info: vbState,
  manual(on = true) {
    DET.manual = !!on;
    return DET.manual;
  },
  pose: () => ({ pos: player.pos.slice(), q: player.q.slice() }),
  shot: () => {
    const r = vbScreenshot(1);
    if (r.error) throw new Error(r.error);
    return r.png;
  },
  benchResult: null,
};
console.info('VOIDBORNE debug build: window.__VB is available');
