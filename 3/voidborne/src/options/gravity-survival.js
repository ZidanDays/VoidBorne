/* =====================================================================
   GAMEPLAY OPTIONS, AUDIO DEPTH, SHARING (Phase 5D) — every gameplay/audio option is OFF by default
   optional gravity (orbits, slingshots) · optional survival (oxygen, boost energy, gentle respawn) · boost debris
   Doppler shift and sound occlusion · copy-link with position · daily seed · safe shared positions
   ===================================================================== */
Object.assign(TXT.en, {
  'start.req':
    'Needs WebGL2 and a recent browser (Chrome, Firefox or Edge). Headphones recommended. On a weaker laptop or a phone, add #q=low to the address.',
  'btn.daily': 'DAILY SEED',
  'btn.copy': 'COPY LINK',
  'set.gameplay': 'GAMEPLAY',
  'set.gravity': 'GRAVITY (ORBITS AND SLINGSHOTS)',
  'set.gravK': 'GRAVITY STRENGTH',
  'set.survival': 'SURVIVAL (OXYGEN AND BOOST ENERGY)',
  'set.debris': 'BOOST DEBRIS',
  'set.audio': 'AUDIO',
  'set.doppler': 'DOPPLER SHIFT',
  'set.occlusion': 'SOUND OCCLUSION',
  'set.share': 'SHARE',
  'share.copied': 'LINK COPIED · SEED {seed}',
  'share.manual': 'copy this link:',
  'share.arrived': 'ARRIVED AT A SHARED POSITION',
  'share.unsafe': 'THE SHARED POSITION WAS INSIDE SOMETHING · MOVED TO SAFETY',
  'surv.o2': 'O₂',
  'surv.boost': 'BOOST',
  'surv.low': 'OXYGEN LOW · HEAD FOR THE STATION OR A POWERED SHIP',
  'surv.out': 'OXYGEN DEPLETED · THE SUIT BROUGHT YOU BACK',
  'surv.empty': 'BOOST ENERGY EMPTY',
  'cap.o2': 'suit alarm: low oxygen',
  'cap.refill': 'air hissing in',
  'cap.debris': 'debris pinging off the suit',
});
Object.assign(TXT.id, {
  'start.req':
    'Butuh WebGL2 dan browser terbaru (Chrome, Firefox, atau Edge). Disarankan memakai headphone. Di laptop yang lebih lemah atau ponsel, tambahkan #q=low di alamat.',
  'btn.daily': 'SEED HARIAN',
  'btn.copy': 'SALIN TAUTAN',
  'set.gameplay': 'PERMAINAN',
  'set.gravity': 'GRAVITASI (ORBIT DAN KETAPEL GRAVITASI)',
  'set.gravK': 'KEKUATAN GRAVITASI',
  'set.survival': 'BERTAHAN HIDUP (OKSIGEN DAN ENERGI PACU)',
  'set.debris': 'SERPIHAN SAAT MEMACU',
  'set.audio': 'AUDIO',
  'set.doppler': 'EFEK DOPPLER',
  'set.occlusion': 'SUARA TERHALANG BENDA',
  'set.share': 'BAGIKAN',
  'share.copied': 'TAUTAN DISALIN · SEED {seed}',
  'share.manual': 'salin tautan ini:',
  'share.arrived': 'TIBA DI POSISI YANG DIBAGIKAN',
  'share.unsafe': 'POSISI YANG DIBAGIKAN BERADA DI DALAM BENDA · DIPINDAHKAN KE TEMPAT AMAN',
  'surv.o2': 'O₂',
  'surv.boost': 'PACU',
  'surv.low': 'OKSIGEN MENIPIS · MENUJU STASIUN ATAU KAPAL YANG BERDAYA',
  'surv.out': 'OKSIGEN HABIS · PAKAIAN ANTARIKSAMU MEMBAWAMU KEMBALI',
  'surv.empty': 'ENERGI PACU HABIS',
  'cap.o2': 'alarm pakaian: oksigen menipis',
  'cap.refill': 'udara mendesis masuk',
  'cap.debris': 'serpihan berdenting di pakaian',
});
// option switches: the remembered pause-menu value wins over CFG
const OPT = (k) =>
  SETTINGS[k] != null
    ? !!SETTINGS[k]
    : !!CFG[{ gravity: 'GRAVITY', survival: 'SURVIVAL', debris: 'BOOST_DEBRIS', doppler: 'DOPPLER', occlusion: 'OCCLUSION' }[k]];
const ZERO3 = [0, 0, 0];

/* ---------------- optional gravity ---------------- */
// GM = GRAVITY_K * r³ (stars × STAR_MASS) → surface gravity GRAVITY_K * r; bodies further than 60 radii are ignored
const GRAV = {
  on: () => OPT('gravity'),
  k: () => {
    const v = +SETTINGS.gravityK;
    return clamp(isFinite(v) && v > 0 ? v : CFG.GRAVITY_STRENGTH, 0.1, 5);
  },
  last: [0, 0, 0],
};
// Planets here do not orbit their star, so summing every pull would let the star drag you out of any planetary orbit.
// Like patched conics, only the dominant body pulls: orbits around a planet stay stable, and crossing from one body's
// influence into another's bends your path (gravity assists / slingshots).
function gravAccel(p) {
  const K = CFG.GRAVITY_K * GRAV.k();
  let best = 0,
    a = [0, 0, 0];
  for (const b of allBodies()) {
    const rel = sub(b.pos, p);
    const d2 = dot(rel, rel);
    const r = b.r;
    if (d2 > 3600 * r * r) continue;
    const d = Math.sqrt(d2);
    const g = (K * r * r * r * (b.star ? CFG.STAR_MASS : 1)) / Math.max(d2, r * r);
    if (g > best) {
      best = g;
      a = [(rel[0] / d) * g, (rel[1] / d) * g, (rel[2] / d) * g];
      GRAV.body = b;
    }
  }
  GRAV.last = a;
  return a;
}
const gravActive = () => GRAV.on() && !player.inside && !AP.on && !WARP.on && !INTRO.on;
const flightDrag = () => (gravActive() ? CFG.GRAVITY_DRAG : CFG.DRAG);

/* ---------------- optional survival ---------------- */
const SURV = {
  o2: 1,
  energy: 1,
  canBoost: true,
  fading: false,
  ft: 0,
  vis: 1,
  safe: player.pos.slice(),
  spawn: player.pos.slice(),
  spawnQ: player.q.slice(),
  lowWarned: false,
  beepT: 0,
  uiT: 0,
  refilling: false,
};
const survOn = () => OPT('survival');
function inPoweredSection() {
  if (!player.inside || !INT.power || !W0.big) return false;
  const lp = qrot(qconj(W0.q), sub(player.pos, W0.pos));
  return lp[0] > 3 && lp[0] < 38;
}
function survTick(dt) {
  const on = survOn() && started;
  const el = $('#surv');
  const show = on && !PHOTO.on && !INTRO.on;
  if (el.dataset.on !== String(show)) {
    el.dataset.on = String(show);
    el.style.display = show ? 'block' : 'none';
  }
  if (!on || INTRO.on) {
    SURV.vis = 1;
    SURV.fading = false;
    return;
  }
  if (SURV.fading) {
    SURV.ft += dt;
    const T = SURV.ft;
    player.vel = scl(player.vel, Math.exp(-2 * dt));
    if (T < 2.5) SURV.vis = 1 - smooth(0, 2.5, T);
    else {
      if (!SURV.moved) {
        SURV.moved = true;
        player.pos = SURV.safe.slice();
        player.vel = [0, 0, 0];
        if (SURV.safe === SURV.spawn || len(sub(SURV.safe, SURV.spawn)) < 1) player.q = SURV.spawnQ.slice();
        SURV.o2 = 1;
        SURV.energy = 1;
        SURV.canBoost = true;
        taaValid = false;
        SURV.lowWarned = false;
      }
      SURV.vis = smooth(2.9, 4.6, T);
      if (T >= 4.6) {
        SURV.fading = false;
        SURV.vis = 1;
        toast(t('surv.out'));
      }
    }
    survBars();
    return;
  }
  const nearStation = len(sub(station.pos, player.pos)) < station.rad + 250;
  const refill = nearStation || inPoweredSection();
  if (refill) {
    if (!SURV.refilling && SURV.o2 < 0.97) caption('cap.refill', null);
    SURV.refilling = true;
    SURV.o2 = Math.min(1, SURV.o2 + dt / CFG.O2_REFILL);
    SURV.safe = player.pos.slice();
    SURV.lowWarned = false;
  } else {
    SURV.refilling = false;
    SURV.o2 = Math.max(0, SURV.o2 - dt / CFG.O2_TIME);
  }
  if (player.boost && player.accel > 0) SURV.energy = Math.max(0, SURV.energy - dt / CFG.BOOST_ENERGY);
  else SURV.energy = Math.min(1, SURV.energy + dt / CFG.BOOST_REGEN);
  if (SURV.energy <= 0 && SURV.canBoost) {
    SURV.canBoost = false;
    toast(t('surv.empty'));
  } else if (SURV.energy > 0.15) SURV.canBoost = true;
  if (SURV.o2 < 0.2 && !SURV.lowWarned) {
    SURV.lowWarned = true;
    toast(t('surv.low'));
    caption('cap.o2', null);
    survBeep();
  }
  if (SURV.o2 < 0.12) {
    SURV.beepT -= dt;
    if (SURV.beepT <= 0) {
      SURV.beepT = 6;
      survBeep();
      caption('cap.o2', null);
    }
  }
  if (SURV.o2 <= 0) {
    SURV.fading = true;
    SURV.ft = 0;
    SURV.moved = false;
    apOff();
  }
  SURV.uiT -= dt;
  if (SURV.uiT <= 0) {
    SURV.uiT = 0.1;
    survBars();
  }
}
function survBars() {
  $('#svO2').style.width = (SURV.o2 * 100).toFixed(1) + '%';
  $('#svB').style.width = (SURV.energy * 100).toFixed(1) + '%';
  $('#svO2r').className = 'sv' + (SURV.o2 < 0.2 ? ' low' : '');
  $('#svBr').className = 'sv' + (!SURV.canBoost ? ' empty' : SURV.energy < 0.2 ? ' low' : '');
}
function survBeep() {
  if (!AUD.ctx) return;
  const AC = AUD.ctx,
    t0 = AC.currentTime;
  for (let i = 0; i < 2; i++) {
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.value = 880;
    const g = AC.createGain();
    env(g, t0 + i * 0.18, 0.01, 0.05, 0.12);
    o.connect(g);
    g.connect(AUD.master);
    o.start(t0 + i * 0.18);
    o.stop(t0 + i * 0.18 + 0.2);
  }
}
