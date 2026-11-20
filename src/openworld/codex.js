/* =====================================================================
   PERSISTENCE, DISCOVERY, CODEX
   ===================================================================== */
const PKEY = 'voidborne:progress:' + CFG.SEED;
const PROG = Object.assign({ found: [], known: [], codex: [], visited: [] }, STORE.get(PKEY, {}) || {});
const foundSet = new Set(PROG.found),
  knownSet = new Set(PROG.known);
let dirty = false,
  saveT = 0;
function saveSoon() {
  dirty = true;
}
function saveTick(dt) {
  saveT -= dt;
  if (!dirty || saveT > 0) return;
  saveT = 1;
  dirty = false;
  PROG.found = [...foundSet];
  PROG.known = [...knownSet];
  STORE.set(PKEY, PROG);
}
function saveSettings() {
  Object.assign(SETTINGS, { vol: AUD.vol, quality: $('#qual').value, muted: AUD.muted });
  STORE.set('voidborne:settings', SETTINGS);
} // merged, so other settings (visor, language) survive
DISCOVERABLE.forEach((d, i) => {
  d.id = 'h' + i;
  knownSet.add(d.id);
  if (foundSet.has(d.id)) d.ref.found = true;
});
function updateCount() {
  $('#dcount').textContent = tl('hud.disc', { n: foundSet.size, m: knownSet.size });
}
function codexAdd(e) {
  if (PROG.codex.some((c) => c.id === e.id)) return false;
  PROG.codex.push(e);
  saveSoon();
  if (CODEX.open) renderCodex();
  return true;
}
function markFound(d, silent) {
  d.ref.found = true;
  if (foundSet.has(d.id)) return;
  foundSet.add(d.id);
  const p = d.pos();
  const s = sectorOf(p);
  codexAdd({ id: d.id, name: d.name, kind: 'discovery', sector: s, pos: p.map((v) => Math.round(v)), t: Date.now() });
  if (!silent) toast(tl('toast.disc', { name: d.name.toUpperCase() }));
  updateCount();
  saveSoon();
  monolithCheck();
}
function discoverCheck() {
  for (const d of DISCOVERABLE) {
    if (d.ref.found && foundSet.has(d.id)) continue;
    const p = d.pos();
    if (len(sub(p, player.pos)) < d.rad()) markFound(d);
  }
}
const CODEX = { open: false };
function toggleCodex(v) {
  CODEX.open = v === undefined ? !CODEX.open : v;
  $('#codex').style.display = CODEX.open ? 'flex' : 'none';
  if (CODEX.open) {
    try {
      document.exitPointerLock();
    } catch (e) {}
    renderCodex();
  } else relock();
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
function renderCodex() {
  const list = [...PROG.codex].sort((a, b) => b.t - a.t);
  const logs = list.filter((e) => e.kind === 'log').length,
    scans = list.filter((e) => e.kind === 'scan').length;
  $('#codexsum').textContent =
    tl('codex.sum', { d: foundSet.size, l: logs, s: scans, seed: CFG.SEED }) + (CFG.SAVE ? '' : tl('codex.nosave'));
  $('#codexlist').innerHTML = list.length
    ? list
        .map(
          (e) =>
            '<div><b>' +
            esc(codexTitle(e).toUpperCase()) +
            '</b> <small>· ' +
            esc(tl('codex.kind.' + e.kind)) +
            ' · ' +
            esc(tl('map.sector')) +
            ' ' +
            e.sector.join(',') +
            ' · ' +
            e.pos.join(', ') +
            ' m</small>' +
            (codexText(e) ? '<br>' + codexText(e).map(esc).join('<br>') : '') +
            '</div>',
        )
        .join('')
    : '<div>' + esc(tl('codex.empty')) + '</div>';
}
$('#codexclose').onclick = () => toggleCodex(false);
/* ---- ship logs ---- */
const LOGUI = { t: 0, typing: null };
function showLog(log, id, name, pos, src) {
  const lines = renderLog(log);
  const box = $('#logbox');
  const text = lines.join('\n');
  /* log: structured ship log or an array of lines */ let i = 0;
  box.textContent = '';
  box.style.opacity = 1;
  clearInterval(LOGUI.typing);
  LOGUI.typing = setInterval(() => {
    i += 3;
    box.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(LOGUI.typing);
  }, 30);
  LOGUI.t = 16;
  if (
    codexAdd(
      Object.assign(
        {
          id,
          name: tl('codex.logName', { name }),
          lname: name,
          kind: 'log',
          sector: sectorOf(pos),
          pos: pos.map((v) => Math.round(v)),
          t: Date.now(),
          text: lines,
        },
        Array.isArray(log) ? {} : { slog: log },
        src || {},
      ),
    )
  )
    toast(tl('log.recovered', { name: name.toUpperCase() }));
  if (AUD.ctx) sfxDataBlip();
}
wrecks.forEach((w, i) => {
  w.log = withSeed(hash32(CFG.SEED, 7, i, 99), () => genLog(w.name));
  w.id = 'h:w' + i;
});
// a terminal inside the explorable wreck holds its log; the others give theirs up when you fly close (flight recorder)
const TERM_LOCAL = [-W0.ship.L * 0.15, -W0.ship.R * 0.5 + 1.6, W0.ship.R * 0.35];
{
  const tm = new MB();
  tm.box(1.4, 1.0, 0.25, [0.3, 1.0, 0.5], xfq(Q0, TERM_LOCAL));
  tm.box(0.3, 1.2, 0.3, [0.2, 0.2, 0.22], xfq(Q0, add(TERM_LOCAL, [0, -1.0, 0])));
  W0.items.push({ mesh: makeMesh(tm, single(W0.pos, qid(), 1, [1, 1, 1], 4), 'q', true), mat: 8 });
}
function logCheck(dt) {
  if (LOGUI.t > 0) {
    LOGUI.t -= dt;
    if (LOGUI.t <= 0) $('#logbox').style.opacity = 0;
  }
  const near = (w, d) => len(sub(w.pos, player.pos)) < d;
  // wreck 0's main terminal is read with the interact key since Phase 5A (see the interior module)
  for (let i = 1; i < wrecks.length; i++) {
    const w = wrecks[i];
    if (!w.logRead && near(w, w.ship.rad * 0.6 + 40)) {
      w.logRead = true;
      showLog(w.log, 'log:' + w.id, w.name, w.pos);
    }
  }
  for (const s of readySectors())
    for (const w of s.wrecks)
      if (!w.logRead && (w.big ? player.insideW === w : near(w, w.ship.rad * 0.6 + 40))) {
        // Phase 6E: an enterable graveyard hull gives up its log only from inside
        w.logRead = true;
        showLog(w.log, 'log:' + w.id, w.name, w.pos);
      }
}
