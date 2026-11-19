/* ---------------- sharing ---------------- */
function shareURL() {
  const base = location.href.split('#')[0];
  const q = location.hash.match(/q=(low|medium|high)/);
  const P = player.pos.map((v) => v.toFixed(1)).join(','),
    Q = player.q.map((v) => v.toFixed(4)).join(',');
  return base + '#seed=' + CFG.SEED + '&pos=' + P + '&rot=' + Q + (q ? '&q=' + q[1] : '');
}
function copyLink() {
  const url = shareURL();
  const box = $('#sharebox');
  box.textContent = t('share.manual') + ' ' + url;
  const ok = () => toast(t('share.copied', { seed: CFG.SEED }));
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const r = document.execCommand('copy');
      ta.remove();
      if (r) ok();
    } catch (e) {}
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok, fallback);
    else fallback();
  } catch (e) {
    fallback();
  }
}
// the same seed for everyone on the same UTC date
function dailySeed(d) {
  d = d || new Date();
  const s = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  return 100000 + (strHash('voidborne:' + s) % 900000);
}
function goDaily() {
  const q = location.hash.match(/q=(low|medium|high)/);
  try {
    dirty = true;
    saveT = 0;
    saveTick(0);
  } catch (e) {}
  location.hash = 'seed=' + dailySeed() + (q ? '&q=' + q[1] : '');
  location.reload();
}
$('#copylink').onclick = copyLink;
$('#dailyseed').onclick = goDaily;
$('#dailyseed2').onclick = goDaily;
// a position from the link is applied only if it is finite and not inside a body; otherwise it is moved out to a safe distance
const SHARE = { applied: false, moved: false };
{
  const m = location.hash.match(/pos=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
  if (m) {
    const p = [+m[1], +m[2], +m[3]];
    if (p.every(Number.isFinite) && len(p) < 5e7) {
      let moved = false;
      const out = (c, r, margin) => {
        const d = sub(p, c);
        const l = len(d);
        if (l < r + margin) {
          const n = l > 1e-6 ? scl(d, 1 / l) : [0, 1, 0];
          const np = add(c, scl(n, r + margin * 2));
          p[0] = np[0];
          p[1] = np[1];
          p[2] = np[2];
          moved = true;
        }
      };
      out(STAR.pos, STAR.r * 1.5, 60);
      for (const b of planets) {
        out(b.pos, b.r * 1.05, 20);
        for (const mo of b.moons) out(mo.pos, mo.r * 1.05, 10);
      }
      for (const w of wrecks) if (!w.big) out(w.pos, w.rad * 0.6, 10);
      out(station.pos, station.r + 2, 10);
      for (const l of landmarks) out(l.pos, l.kind === 'blackhole' ? l.Rs * 4 : 45, 20);
      for (const s of secrets) if (!s.inside) out(s.pos, 16, 5);
      player.pos = p;
      player.vel = [0, 0, 0];
      SHARE.applied = true;
      SHARE.moved = moved;
      const r = location.hash.match(/rot=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/);
      if (r) {
        const q = [+r[1], +r[2], +r[3], +r[4]];
        if (q.every(Number.isFinite) && Math.hypot(...q) > 0.1) player.q = qnorm(q);
      }
    }
  }
}
let shareToastDone = false;

/* ---------------- pause-menu switches ---------------- */
for (const [id, k] of [
  ['#gravbox', 'gravity'],
  ['#survbox', 'survival'],
  ['#debbox', 'debris'],
  ['#dopbox', 'doppler'],
  ['#occbox', 'occlusion'],
]) {
  const el = $(id);
  el.checked = OPT(k);
  el.addEventListener('change', () => {
    SETTINGS[k] = el.checked;
    saveSettings();
    if (k === 'survival' && el.checked) {
      SURV.o2 = 1;
      SURV.energy = 1;
      SURV.canBoost = true;
    }
  });
}
{
  const g = $('#gravk');
  g.value = Math.round(GRAV.k() * 100);
  g.addEventListener('input', () => {
    SETTINGS.gravityK = clamp(g.value / 100, 0.25, 3);
  });
  g.addEventListener('change', saveSettings);
}
function optionsTick(dt) {
  survTick(dt);
  debTick(dt);
  audioDepthTick(dt);
  if (SHARE.applied && !shareToastDone && started && !INTRO.on) {
    shareToastDone = true;
    toast(t(SHARE.moved ? 'share.unsafe' : 'share.arrived'));
  }
}
window.__opt = { GRAV, SURV, DEB, ADEPTH, SHARE, gravAccel, occlusion, dopRatio, dailySeed, shareURL, debrisField };
