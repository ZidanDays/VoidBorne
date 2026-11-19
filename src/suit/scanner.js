/* =====================================================================
   EXPLORATION TOOLS & SUIT FEEL (Phase 5B)
   scanner (hold V / touch SCAN / gamepad D-pad down) · helmet visor (curvature, HUD reflection, breath fog, cracks)
   opening sequence after BEGIN EXPLORATION · debug overlay (backtick key)
   Nothing here touches the world RNG: scan data comes from mkRng(hash(seed, object key)); visual noise uses Math.random.
   ===================================================================== */
const RST = { items: 0, inst: 0, planets: 0 }; // per-frame render statistics (reset in render(), shown in the debug overlay)
const fxQ = () => (quality === QUAL.low ? 0 : quality === QUAL.medium ? 1 : 2); // 0 = cheap variants (low), 1 = medium, 2 = high
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const nfmt = (x, d) => {
  try {
    return x.toLocaleString(LANG === 'id' ? 'id-ID' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  } catch (e) {
    return x.toFixed(d);
  }
};
let RM = A11Y.reduceMotion,
  rmT = 0; // reduced-motion flag, re-read every 2 s (Phase 5C adds the menu switch)

/* ---------------- scanner ---------------- */
const SCAN = { target: null, t: 0, done: false, linger: 0, infoT: 0, snd: null, touch: false, shown: '' };
const desig = (pre, key) => pre + '-' + (100 + (strHash(CFG.SEED + ':' + key) % 900)); // language-neutral catalogue names for creatures
// Everything that can be scanned: the POI list (planets, moons, stars, wrecks, station, anomalies, landmarks,
// including streamed sectors) plus creatures and, inside wreck 0, the artifact once the vault is open.
// mode 0 = opaque target (depth-based contour), 1 = glowing/transparent target (luminance contour).
function scanCandidates() {
  const out = [];
  const P = player.pos,
    near = CFG.SCAN_RANGE,
    far = CFG.SCAN_RANGE * 12;
  if (player.inside) {
    if (W0.big && INT.sealedOpen) {
      const s = secrets[3];
      out.push({ key: 'artifact', cls: 'artifact', name: s.name, pos: s.pos, r: 2.2, range: 60, mode: 0, ref: s });
    }
    return out;
  } // the hull hides everything else
  for (const p of POI) {
    let cls,
      key,
      mode = 0,
      range = near;
    const hid = !!(p.hidden && !(p.ref && p.ref.found));
    if (p.kind === 'planet') {
      cls = 'p' + (p.ptype | 0);
      key = 'planet:' + p.name;
      range = far;
    } else if (p.kind === 'moon') {
      cls = p.mtype ? 'moon' + p.mtype : 'moon'; // Phase 6D: moon16 volcanic, moon17 geysers, moon18 irregular
      key = 'moon:' + p.name;
      range = far;
    } else if (p.kind === 'star') {
      cls = p.sclass ? 'star' + p.sclass : 'star'; // Phase 6C: star class (the home star stays 'star' unless HOME_STAR_VARIETY)
      key = 'star:' + p.name;
      range = far * 2;
    } else if (p.kind === 'wreck') {
      cls = 'wreck';
      key = 'wreck:' + ((p.ref && p.ref.id) || p.name);
    } else if (p.kind === 'station') {
      cls = 'station';
      key = 'station';
    } else if (p.kind === 'secret') {
      const si = secrets.indexOf(p.ref);
      cls = si >= 0 ? p.ref.kind : 'signal';
      key = si >= 0 ? 'secret:' + si : 'signal:' + ((p.ref && p.ref.id) || p.name);
    } else if (p.kind === 'landmark') {
      cls = p.ref.kind;
      key = 'landmark:' + landmarks.indexOf(p.ref);
      range = near * 3;
      if (cls === 'blackhole') mode = 1;
    } else continue;
    out.push({
      key,
      cls: hid ? 'unknown' : cls,
      name: hid ? t('scan.unknown') : p.name,
      pos: p.pos,
      r: p.r,
      range,
      mode,
      ref: p.ref,
      hidden: hid,
    });
  }
  whales.forEach((w, i) =>
    out.push({
      key: 'whale:' + i,
      cls: 'whale',
      name: desig('LV', 'whale:' + i),
      pos: w.pos,
      r: w.scale * 0.5,
      range: near,
      mode: 0,
      ref: w,
    }),
  );
  MINN.schools.forEach((sc, i) => {
    if (sc.center)
      out.push({
        key: 'school:' + i,
        cls: 'school',
        name: desig('MS', 'school:' + i),
        pos: sc.center,
        r: 26,
        range: near,
        mode: 1,
        ref: sc,
      });
  });
  medusae.list.forEach((m, i) => {
    if (len(sub(m.p, P)) < 700)
      out.push({
        key: 'medusa:' + i,
        codex: 'medusa',
        cls: 'medusa',
        name: desig('AM', 'medusa:' + i),
        pos: m.p,
        r: m.s * 0.9,
        range: 700,
        mode: 1,
        ref: m,
      });
  });
  for (const s of readySectors())
    if (s.med && s.med.mesh)
      out.push({ key: 'bloom:' + s.key, cls: 'bloom', name: desig('BL', s.key), pos: s.med.c, r: 120, range: near, mode: 1, ref: s.med });
  return out;
}
// the object under the crosshair: ray against bounding spheres widened to a small cone, nearest entry wins
// (planets and wrecks in front therefore hide what is behind them); the current target gets a little hysteresis
function scanPick() {
  const b = basis(),
    eye = player.pos;
  let best = null,
    bt = 1e18;
  for (const c of scanCandidates()) {
    const rel = sub(c.pos, eye);
    const d = len(rel);
    if (d > c.range + c.r) continue;
    const al = dot(rel, b.f);
    if (al <= 0) continue;
    const keep = !!(SCAN.target && SCAN.target.key === c.key);
    const perp = len(sub(rel, scl(b.f, al)));
    const tol = Math.max(c.r * (keep ? 1.25 : 1), d * (keep ? 0.05 : 0.03));
    if (perp > tol) continue;
    const te = al - Math.sqrt(Math.max(0, tol * tol - perp * perp));
    if (te < bt) {
      bt = te;
      best = c;
    }
  }
  return best;
}
// composition table: [main material, min %, max %], [second], [possible third materials]
const COMPS = {
  p0: [
    ['silicate', 45, 65],
    ['iron', 15, 30],
    ['nickel', 'sulfur', 'ice'],
  ],
  p1: [
    ['hydrogen', 70, 86],
    ['helium', 10, 22],
    ['methane', 'ammonia'],
  ],
  p2: [
    ['ice', 40, 60],
    ['nitrogen', 10, 25],
    ['silicate', 'methane'],
  ],
  p3: [
    ['basalt', 35, 55],
    ['sulfur', 10, 25],
    ['iron', 'glass'],
  ],
  p4: [
    ['silicate', 30, 45],
    ['water', 25, 40],
    ['organic', 'iron'],
  ],
  moon: [
    ['silicate', 50, 70],
    ['iron', 10, 20],
    ['regolith', 'ice'],
  ],
  // Phase 6D planet types and special moons
  p8: [
    ['water', 60, 80],
    ['silicate', 10, 25],
    ['salts', 'organic'],
  ],
  p9: [
    ['silicate', 55, 75],
    ['iron', 8, 20],
    ['salts', 'glass'],
  ],
  p10: [
    ['sulfur', 30, 50],
    ['silicate', 20, 35],
    ['acid', 'basalt'],
  ],
  p11: [
    ['quartz', 40, 60],
    ['silicate', 15, 30],
    ['lattice', 'metals'],
  ],
  p12: [
    ['silicate', 35, 50],
    ['water', 15, 30],
    ['ice', 'organic'],
  ],
  p13: [
    ['hydrogen', 70, 84],
    ['helium', 12, 22],
    ['sodium', 'metals'],
  ],
  p14: [
    ['ice', 35, 55],
    ['silicate', 25, 40],
    ['nitrogen', 'methane'],
  ],
  p15: [
    ['basalt', 40, 60],
    ['ice', 10, 25],
    ['organic', 'metals'],
  ],
  moon16: [
    ['sulfur', 35, 55],
    ['silicate', 25, 40],
    ['basalt', 'iron'],
  ],
  moon17: [
    ['ice', 60, 80],
    ['water', 5, 15],
    ['salts', 'silicate'],
  ],
  moon18: [
    ['regolith', 40, 60],
    ['silicate', 20, 35],
    ['carbon', 'iron'],
  ],
  star: [['hydrogen', 70, 74], ['helium', 24, 27], ['metals']],
  // Phase 6C star classes
  starM: [['hydrogen', 72, 76], ['helium', 22, 26], ['metals']],
  starK: [['hydrogen', 71, 75], ['helium', 23, 27], ['metals']],
  starG: [['hydrogen', 70, 74], ['helium', 24, 27], ['metals']],
  starF: [['hydrogen', 69, 73], ['helium', 25, 28], ['metals']],
  starO: [['hydrogen', 64, 70], ['helium', 28, 34], ['metals']],
  starD: [['carbon', 40, 55], ['oxygen', 35, 50], ['helium']],
  starN: [['neutron', 100, 100]],
  wreck: [
    ['alloy', 55, 75],
    ['ceramic', 10, 20],
    ['polymer', 'coolant'],
  ],
  station: [
    ['alloy', 50, 65],
    ['polymer', 15, 25],
    ['ceramic', 'coolant'],
  ],
  whale: [['tissue', 55, 70], ['chitin', 15, 30], ['lattice']],
  medusa: [['water', 70, 85], ['luciferin', 8, 20], ['lattice']],
  bloom: [['water', 70, 85], ['luciferin', 8, 20], ['organic']],
  school: [['tissue', 60, 78], ['luciferin', 10, 25], ['organic']],
  beacon: [['alloy', 60, 80], ['isotope', 5, 15], ['polymer']],
  signal: [['alloy', 60, 80], ['isotope', 5, 15], ['polymer']],
  probe: [['alloy', 55, 75], ['polymer', 10, 20], ['isotope']],
  artifact: [['lattice', 55, 70], ['carbon', 15, 30], ['metals']],
  pulsar: [['neutron', 100, 100]],
};
function compStr(def, R) {
  if (!def) return t('mat.none');
  const a = def[0],
    v1 = Math.round(a[1] + R() * (a[2] - a[1]));
  if (def.length === 1) return t('mat.' + a[0]) + ' ' + v1 + '%';
  const b = def[1];
  const v2 = Math.min(Math.round(b[1] + R() * (b[2] - b[1])), 100 - v1);
  let rest = 100 - v1 - v2;
  const ex = def[2][Math.floor(R() * def[2].length)];
  const f = R();
  const v3 = rest > 2 ? Math.max(1, Math.round(rest * (0.35 + f * 0.5))) : 0;
  rest -= v3;
  let s = t('mat.' + a[0]) + ' ' + v1 + '% · ' + t('mat.' + b[0]) + ' ' + v2 + '%';
  if (v3) s += ' · ' + t('mat.' + ex) + ' ' + v3 + '%';
  if (rest > 0) s += ' · ' + t('scan.traces') + ' ' + rest + '%';
  return s;
}
// procedural scan data, seeded from (world seed, object key) so it is the same every visit; live fields read the creature/ship state
function scanInfo(c) {
  const R = mkRng(hash32(CFG.SEED, strHash(c.codex || c.key), 0x5ca, 3));
  const cls = c.cls;
  const pool = (k) => {
    const a = t(k);
    return Array.isArray(a) ? a[Math.floor(R() * a.length)] : a;
  };
  const gyr = (a, b) => t('age.gyr', { n: nfmt(a + R() * (b - a), 1) }),
    myr = (a, b) => t('age.myr', { n: nfmt(Math.round(a + R() * (b - a)), 0) }),
    yr = (a, b) => t('age.yr', { n: nfmt(Math.round(a + R() * (b - a)), 0) });
  const planet = /^p\d+$/.test(cls); // Phase 6D: p8..p15 as well
  const pt = planet ? +cls.slice(1) : -1;
  const smoon = /^moon\d+$/.test(cls); // Phase 6D special moons
  const sc = cls.length === 5 && cls.startsWith('star') ? STAR_CLS[cls[4]] : null; // Phase 6C: a classed star
  const age = sc
    ? sc.age[2] === 'g'
      ? gyr(sc.age[0], sc.age[1])
      : myr(sc.age[0], sc.age[1])
    : planet
      ? cls === 'p4' || pt === 8 || pt === 12
        ? gyr(3.5, 6)
        : pt === 13
          ? gyr(0.3, 3)
          : pt === 15
            ? gyr(4, 12)
            : gyr(0.6, 9.4)
      : cls === 'moon' || smoon
        ? gyr(0.5, 9)
        : cls === 'star'
          ? gyr(0.8, 11)
          : cls === 'wreck'
            ? t('age.adrift', { n: nfmt(Math.round(40 + R() * 860), 0) })
            : cls === 'station'
              ? yr(300, 900)
              : cls === 'whale'
                ? yr(400, 4000)
                : cls === 'medusa' || cls === 'bloom'
                  ? t('age.days', { n: nfmt(Math.round(3 + R() * 87), 0) })
                  : cls === 'school'
                    ? t('age.season', { n: nfmt(Math.round(20 + R() * 100), 0) })
                    : cls === 'beacon'
                      ? yr(50, 700)
                      : cls === 'signal'
                        ? yr(80, 1500)
                        : cls === 'probe'
                          ? yr(200, 3000)
                          : cls === 'monolith'
                            ? t('age.older')
                            : cls === 'blackhole'
                              ? myr(20, 900)
                              : cls === 'pulsar'
                                ? myr(1, 40)
                                : t('age.none');
  const comp = compStr(COMPS[cls] || null, R);
  let status = planet
    ? pool(cls === 'p4' ? 'st.living' : pt >= 8 ? 'st.' + cls : 'st.planet')
    : cls === 'moon' || cls === 'star' || sc || cls === 'wreck' || cls === 'station' || smoon
      ? pool('st.' + cls)
      : cls === 'artifact'
        ? t('st.artifact', { n: nfmt(30 + R() * 20, 1) })
        : cls === 'pulsar'
          ? t('st.pulsar', { n: nfmt(0.6 + R() * 1.8, 2) })
          : cls === 'monolith'
            ? t(MONO.awake ? 'st.monolith.awake' : 'st.monolith.sleep')
            : cls === 'whale' || cls === 'medusa' || cls === 'school'
              ? ''
              : t('st.' + cls);
  const lore = pool(
    planet ? (cls === 'p4' ? 'lore.living' : pt >= 8 ? 'lore.' + cls : 'lore.planet') : cls === 'bloom' ? 'lore.medusa' : 'lore.' + cls,
  );
  const r = c.ref; // live state
  if (cls === 'whale') status = t('st.whale.' + ((r && r.hunt && r.hunt.mode) || 'idle'));
  if (cls === 'medusa') status = t(r && r.wglow > 0.3 ? 'st.medusa.agit' : 'st.medusa.calm');
  if (cls === 'school') status = t(r && r.fleeT > 0 ? 'st.school.flee' : r && r.mergeT > 0 ? 'st.school.merge' : 'st.school.ok');
  if (cls === 'wreck' && r === W0) status = t(INT.sealedOpen ? 'st.w0open' : INT.power ? 'st.w0power' : 'st.w0dark');
  if ((cls === 'star' || sc) && (EV.flareK || 0) > 0.05 && c.name === activeStar().name) status = t('st.flare'); // the flaring star is the nearest one
  if (sc && r && r.mates && r.mates.length) status += ' · ' + t('st.mates', { names: r.mates.join(', ') }); // Phase 6C: its companions
  return { name: c.name, cls: t('cls.' + cls), age, comp, status, lore };
}
const scanLines = (i) => [i.cls + ' · ' + t('scan.age').toLowerCase() + ' ' + i.age, i.comp, i.status, i.lore];
// codex titles and texts are rebuilt in the current language where the source is known (Phase 5C)
function codexTitle(e) {
  if (e.scan && e.scan.generic) return t('cls.' + e.scan.cls);
  if (e.kind === 'log') {
    if (e.pad) {
      const pd = PADS.find((p) => p.id === e.pad);
      if (pd) return t('codex.logName', { name: renderPad(pd)[0] });
    }
    if (e.lname) return t('codex.logName', { name: e.lname });
  }
  if (e.kind === 'discovery') {
    const d = DISCOVERABLE.find((x) => x.id === e.id);
    if (d) return d.name;
  }
  return e.name;
}
function codexText(e) {
  try {
    if (e.scan) return scanLines(scanInfo({ key: e.scan.key, cls: e.scan.cls, name: e.scan.name, ref: null }));
    if (e.slog) return renderLog(e.slog);
    if (e.pad) {
      const pd = PADS.find((p) => p.id === e.pad);
      if (pd) return renderPad(pd);
    }
  } catch (err) {}
  return e.text;
}
function showScan(c) {
  const i = scanInfo(c);
  const row = (k, v) => '<br><span>' + esc(t(k)) + '</span>' + esc(v);
  const box = $('#scanbox');
  box.innerHTML =
    '<b>' +
    esc(i.name.toUpperCase()) +
    '</b>' +
    row('scan.class', i.cls) +
    row('scan.age', i.age) +
    row('scan.comp', i.comp) +
    row('scan.status', i.status) +
    '<i>' +
    esc(i.lore) +
    '</i>';
  box.style.opacity = 1;
  SCAN.infoT = 0.5;
  return i;
}
function scanComplete(c) {
  const i = showScan(c);
  if (c.hidden) return;
  const key = c.codex || c.key;
  if (
    codexAdd({
      id: 'scan:' + key,
      name: c.codex ? t('cls.' + c.cls) : c.name,
      kind: 'scan',
      scan: { key, cls: c.cls, name: c.codex ? t('cls.' + c.cls) : c.name, generic: !!c.codex },
      sector: sectorOf(c.pos),
      pos: c.pos.map((v) => Math.round(v)),
      t: Date.now(),
      text: scanLines(i),
    })
  )
    toast(t('scan.logged', { name: (c.codex ? t('cls.' + c.cls) : c.name).toUpperCase() }));
}
function scanHeld() {
  return !!(act('scan') || SCAN.touch || GP.scan);
}
function scanTick(dt) {
  const can = CFG.SCANNER && started && !paused && !INTRO.on && !PHOTO.on && !MAP.open && !CODEX.open && !WARP.on;
  const held = can && scanHeld();
  let st = '';
  if (held) {
    const c = scanPick();
    if (!c) {
      if (SCAN.target) {
        scanSound(false);
        SCAN.target = null;
        SCAN.t = 0;
        SCAN.done = false;
      }
      st = t('scan.none');
    } else {
      if (!SCAN.target || SCAN.target.key !== c.key) {
        SCAN.target = c;
        SCAN.t = 0;
        SCAN.done = false;
        scanSound(true);
        SCAN.linger = 0;
        $('#scanbox').style.opacity = 0;
      } else SCAN.target = c;
      SCAN.t += dt;
      if (!SCAN.done) {
        st = t('scan.busy', { p: Math.min(99, Math.floor((SCAN.t / CFG.SCAN_TIME) * 100)) });
        if (SCAN.t >= CFG.SCAN_TIME) {
          SCAN.done = true;
          st = '';
          scanSound(false);
          sfxScanDone();
          scanComplete(c);
        }
      } else {
        SCAN.infoT -= dt;
        if (SCAN.infoT <= 0) showScan(c);
      } // refresh the live status twice a second
      if (SCAN.done) SCAN.linger = CFG.SCAN_LINGER;
    }
  } else if (SCAN.target) {
    scanSound(false);
    SCAN.target = null;
    SCAN.t = 0;
    SCAN.done = false;
  }
  if (!(held && SCAN.target && SCAN.done) && SCAN.linger > 0) {
    SCAN.linger -= dt;
    if (SCAN.linger <= 0) $('#scanbox').style.opacity = 0;
  } // the data stays readable for SCAN_LINGER s
  if (st !== SCAN.shown) {
    SCAN.shown = st;
    const el = $('#scanst');
    if (st) el.textContent = st;
    el.style.opacity = st ? 0.9 : 0;
  }
}
// overlay parameters for the composite pass: target centre (uv), screen radius (uv-y), progress; view depth, radius, mode
function scanOverlay(VPu, b, tanY) {
  const c = SCAN.target;
  if (!c || !CFG.SCANNER) return null;
  const rel = R(c.pos);
  const cl = m4v(VPu, [rel[0], rel[1], rel[2], 1]);
  if (cl[3] <= 0) return null;
  const d = len(rel);
  const ang = Math.asin(Math.min(1, c.r / Math.max(d, 1e-3)));
  const Ry = Math.min(0.9, (0.5 * Math.tan(Math.min(ang, 1.4))) / tanY);
  return [
    [(cl[0] / cl[3]) * 0.5 + 0.5, (cl[1] / cl[3]) * 0.5 + 0.5, Math.max(Ry, 0.02), SCAN.done ? 1 : Math.min(0.999, SCAN.t / CFG.SCAN_TIME)],
    [dot(rel, b.f), c.r, c.mode, 1],
  ];
}
function scanSound(on) {
  if (!AUD.ctx) return;
  const AC = AUD.ctx,
    t0 = AC.currentTime;
  if (on) {
    if (SCAN.snd) scanSound(false);
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(420, t0);
    o.frequency.linearRampToValueAtTime(880, t0 + CFG.SCAN_TIME);
    const lfo = AC.createOscillator();
    lfo.frequency.value = 14;
    const lg = AC.createGain();
    lg.gain.value = 0.01;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.022, t0 + 0.12);
    lfo.connect(lg);
    lg.connect(g.gain);
    o.connect(g);
    g.connect(AUD.master);
    o.start(t0);
    lfo.start(t0);
    SCAN.snd = { o, lfo, g };
  } else if (SCAN.snd) {
    const s = SCAN.snd;
    SCAN.snd = null;
    s.g.gain.cancelScheduledValues(t0);
    s.g.gain.setTargetAtTime(0.0001, t0, 0.04);
    try {
      s.o.stop(t0 + 0.3);
      s.lfo.stop(t0 + 0.3);
    } catch (e) {}
  }
}
function sfxScanDone() {
  if (!AUD.ctx) return;
  const AC = AUD.ctx,
    t0 = AC.currentTime;
  [1320, 1760].forEach((f, i) => {
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = AC.createGain();
    env(g, t0 + i * 0.09, 0.005, 0.05, 0.25);
    o.connect(g);
    g.connect(AUD.master);
    g.connect(AUD.rev);
    o.start(t0 + i * 0.09);
    o.stop(t0 + i * 0.09 + 0.35);
  });
}
