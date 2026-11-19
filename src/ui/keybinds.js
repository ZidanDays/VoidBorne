/* ---------------- key remapping ---------------- */
const REBIND = { on: false, a: null };
function renderBinds() {
  const el = $('#bindlist');
  if (!el) return;
  el.innerHTML = ACTIONS.map(
    ([a]) =>
      '<span>' +
      esc(t('bind.' + a)) +
      '</span><button class="btn bkey' +
      (REBIND.a === a ? ' wait' : '') +
      '" data-a="' +
      a +
      '">' +
      esc(REBIND.a === a ? t('set.press') : BIND[a].map(keyLabel).join(' / ') || '—') +
      '</button>',
  ).join('');
  for (const b of el.querySelectorAll('.bkey'))
    b.onclick = (e) => {
      e.preventDefault();
      REBIND.on = true;
      REBIND.a = b.dataset.a;
      renderBinds();
    };
}
// the next key press after clicking an action becomes its only key; it is taken away from any other action (ESC cancels)
function rebindKey(e) {
  e.preventDefault();
  const a = REBIND.a;
  REBIND.on = false;
  REBIND.a = null;
  if (e.code && e.code !== 'Escape' && a) {
    for (const k in BIND) {
      const i = BIND[k].indexOf(e.code);
      if (i >= 0) BIND[k].splice(i, 1);
    }
    BIND[a] = [e.code];
    saveBinds();
  }
  applyLang();
}
function saveBinds() {
  const o = {};
  for (const [a] of ACTIONS) o[a] = BIND[a].slice();
  SETTINGS.binds = o;
  saveSettings();
}
$('#bindreset').onclick = () => {
  resetBinds();
  delete SETTINGS.binds;
  REBIND.on = false;
  REBIND.a = null;
  saveSettings();
  applyLang();
};
window.__a11y = { CAPS, caption, applyLang, setLang, REBIND, BIND, INPUT };
