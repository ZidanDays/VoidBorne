let LANG = (() => {
  const s = SETTINGS.lang || (CFG.LANG !== 'auto' ? CFG.LANG : (navigator.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en');
  return TXT[s] ? s : 'en';
})();
function t(k, v) {
  const tb = TXT[LANG] || TXT.en;
  const s = tb[k] !== undefined ? tb[k] : TXT.en[k];
  if (s === undefined) return k;
  if (!v || typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, n) => (v[n] !== undefined ? String(v[n]) : m));
}
