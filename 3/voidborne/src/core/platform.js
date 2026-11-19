const $ = (s) => document.querySelector(s);
const errBox = $('#err');
function showErr(m) {
  errBox.style.display = 'block';
  errBox.textContent += m + '\n';
  console.error(m);
}
const isTouch = matchMedia('(pointer:coarse)').matches;
/* ---------------- persistent storage (localStorage, every access guarded) ---------------- */
const STORE = {
  get(k, d) {
    if (DET.noStore) return d; // ?det=1 / ?nostore=1: start fresh, ignore saved settings and progress
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    if (!CFG.SAVE) return false;
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  },
};
const SETTINGS = STORE.get('voidborne:settings', {}) || {};
