/* =====================================================================
   ACCESSIBILITY, INPUT SETTINGS, LANGUAGES (Phase 5C)
   one text table (TXT, English + Indonesian) for every UI string · language switch on the start screen and in the pause menu
   reduce motion and flashing · sound captions · key remapping · invert Y · per-device sensitivity · settings remembered
   ===================================================================== */
Object.assign(TXT.en, { 'ap.arrived': 'ARRIVED · {name}' });
Object.assign(TXT.id, { 'ap.arrived': 'TIBA · {name}' });
const CAN_SAVE = (() => {
  if (!CFG.SAVE) return false;
  try {
    localStorage.setItem('voidborne:probe', '1');
    localStorage.removeItem('voidborne:probe');
    return true;
  } catch (e) {
    return false;
  }
})();

/* ---------------- sound captions ---------------- */
const CAPS = { el: $('#caps'), lines: new Map() };
const capsOn = () => (SETTINGS.captions != null ? !!SETTINGS.captions : CFG.CAPTIONS);
// caption(key, worldPos|null): one line per sound kind (a repeat refreshes it instead of stacking), with distance and a direction arrow
function caption(key, pos) {
  if (!capsOn() || !started) return;
  let tail = '';
  if (pos) {
    const rel = sub(pos, player.pos);
    const d = len(rel);
    const b = basis();
    const a = Math.atan2(dot(rel, b.r), dot(rel, b.f));
    const arrow = Math.abs(a) < 0.6 ? '↑' : Math.abs(a) > 2.5 ? '↓' : a > 0 ? '→' : '←';
    tail = ' · ' + (d < 150 ? t('cap.near') : d > 800 ? t('cap.far') : '') + (d < 150 || d > 800 ? ' ' : '') + arrow;
  }
  let ln = CAPS.lines.get(key);
  if (!ln) {
    ln = { el: document.createElement('div'), t: 0 };
    CAPS.el.appendChild(ln.el);
    CAPS.el.appendChild(document.createElement('br'));
    CAPS.lines.set(key, ln);
  }
  ln.el.textContent = '[ ' + t(key) + tail + ' ]';
  ln.el.style.opacity = 1;
  ln.t = CFG.CAPTION_TIME;
}
function captionTick(dt) {
  for (const [k, ln] of CAPS.lines) {
    ln.t -= dt;
    if (ln.t <= 0.6) ln.el.style.opacity = Math.max(0, ln.t / 0.6);
    if (ln.t <= 0) {
      const br = ln.el.nextSibling;
      ln.el.remove();
      if (br) br.remove();
      CAPS.lines.delete(k);
    }
  }
}
