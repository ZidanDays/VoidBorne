/* ---- creature lighting: the nearest bioluminescent sources become point lights for hulls, debris and asteroids ---- */
const lightCand = [];
function gatherLights() {
  const n = Math.min(CFG.CREATURE_LIGHTS, quality.cl, 8);
  numLights = 8;
  if (n <= 0) return;
  lightCand.length = 0;
  const pp = player.pos;
  for (const m of medusae.list) {
    const d = len(sub(m.p, pp));
    if (d < 420) lightCand.push({ d, p: m.p, c: m.c, i: ((2.2 + 3.5 * m.glow) * m.s) / 8, k: 0.006 });
  }
  for (const w of whales) {
    const d = len(sub(w.pos, pp));
    if (d < 700) lightCand.push({ d, p: w.pos, c: [0.25, 0.9, 1.0], i: 6, k: 0.002 });
  }
  if (MONO.awake) {
    const d = len(sub(secrets[1].pos, pp));
    if (d < 600)
      lightCand.push({ d, p: add(secrets[1].pos, [0, 16, 0]), c: [0.25, 0.85, 1.0], i: 8 * (0.7 + 0.3 * Math.sin(time * 1.3)), k: 0.002 });
  }
  for (const sec of SECT.loaded.values())
    if (sec.ready && sec.med) {
      const d = len(sub(sec.med.c, pp));
      if (d < 500) lightCand.push({ d, p: sec.med.c, c: sec.med.col, i: 6, k: 0.003 });
    }
  for (const sc of MINN.schools) {
    if (!sc.center) continue;
    const d = len(sub(sc.center, pp));
    if (d < 350) lightCand.push({ d, p: sc.center, c: sc.c, i: 3.5, k: 0.004 });
  }
  lightCand.sort((a, b) => a.d - b.d);
  const m = Math.min(n, lightCand.length);
  for (let i = 0; i < m; i++) {
    const l = lightCand[i];
    lightPos.set([l.p[0], l.p[1], l.p[2], l.k], (8 + i) * 4);
    lightCol.set([l.c[0], l.c[1], l.c[2], l.i], (8 + i) * 4);
  }
  numLights = 8 + m;
}
let discovered = 0,
  entryShown = false;
// HUD hint for first-time players: tells them where the explorable wreck's entrance is
function updateHints() {
  const w = wrecks[0];
  const d = len(sub(w.pos, player.pos));
  const show = CFG.BREACH_MARKER && d < w.rad + 260 && !player.inside;
  if (show !== entryShown) {
    entryShown = show;
    const el = $('#entry');
    if (show) el.textContent = t('hud.entry', { name: w.name.toUpperCase() });
    el.style.opacity = show ? 1 : 0;
  }
}
function updateDiscovery() {
  updateHints();
  discoverCheck();
}
