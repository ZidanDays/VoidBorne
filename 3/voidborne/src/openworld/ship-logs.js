/* ---- procedural ship logs ---- */
// Phase 5C: logs are generated as indices + numbers (the RNG is consumed exactly as before, so every seed is unchanged)
// and rendered through the text table (slog.t / slog.end) in the current language by renderLog().
const LOG_N = 16,
  LOG_EN = 5;
function genLog(name) {
  const day = 2 + ((rnd() * 400) | 0),
    crew = 3 + ((rnd() * 20) | 0);
  const L = { name, lines: [], end: 0 };
  const n = 3 + ((rnd() * 2) | 0);
  const used = [];
  for (let i = 0; i < n; i++) {
    let ti = (rnd() * LOG_N) | 0;
    for (let k = 0; k < 8 && used.indexOf(ti) >= 0; k++) ti = (rnd() * LOG_N) | 0;
    used.push(ti);
    const dd = day + i * (1 + ((rnd() * 9) | 0)),
      vd = 2 + ((rnd() * 90) | 0),
      vp = cap(pick(SYL) + pick(SYL));
    L.lines.push([ti, dd, crew - i, crew - i + 1, vd, vp]);
  }
  L.end = (rnd() * LOG_EN) | 0;
  return L;
}
const fillVars = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m));
function renderLog(L) {
  if (Array.isArray(L)) return L;
  const T = tl('slog.t'),
    E = tl('slog.end');
  return [
    tl('slog.head', { name: L.name.toUpperCase() }),
    ...L.lines.map(([ti, dd, vn, vm, vd, vp]) => tl('slog.day', { d: dd, line: fillVars(T[ti], { n: vn, m: vm, d: vd, p: vp }) })),
    E[L.end],
  ];
}
