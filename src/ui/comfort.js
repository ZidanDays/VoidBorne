/* =====================================================================
   DISPLAY AND COMFORT SETTINGS (Phase 6B) — pause menu, all remembered in SETTINGS
     TAA mode (auto / on / off, independent of the preset), photo resolution, field of view (the boost widening stays
     relative to it), interface scale, an optional horizon reference aid and an edge vignette during fast roll / turns
     ('auto' = only with reduce motion). Defaults leave the game exactly as before.
   ===================================================================== */
const BASE_FOV = 1.15; // the FOV the flight code animates around (boost, warp and photo mode change player.fov relative to it)
let FOVK = 1; // render FOV = player.fov * FOVK
const COMFORT = { prev: null, vig: 0, horOn: false, rate: 0 };
const DEG = Math.PI / 180;
{
  if (/^(auto|on|off)$/.test(SETTINGS.taaMode || '')) CFG.TAA_MODE = SETTINGS.taaMode;
  if (SETTINGS.photoScale >= 1 && SETTINGS.photoScale <= 4) CFG.PHOTO_SCALE = SETTINGS.photoScale | 0;
  if (SETTINGS.fov > 0) CFG.FOV = clamp(+SETTINGS.fov, 50 * DEG, 100 * DEG);
  if (SETTINGS.uiScale > 0) CFG.UI_SCALE = clamp(+SETTINGS.uiScale, 0.75, 1.5);
  if (typeof SETTINGS.horizon === 'boolean') CFG.HORIZON_AID = SETTINGS.horizon;
  if (/^(auto|on|off)$/.test(SETTINGS.rollVig || '')) CFG.ROLL_VIGNETTE = SETTINGS.rollVig === 'auto' ? 'auto' : SETTINGS.rollVig === 'on';
  FOVK = CFG.FOV / BASE_FOV;
}
function applyUIScale() {
  if (CFG.UI_SCALE !== 1 || document.documentElement.style.getPropertyValue('--uiz'))
    document.documentElement.style.setProperty('--uiz', String(CFG.UI_SCALE));
  $('#uiscalev').textContent = Math.round(CFG.UI_SCALE * 100) + '%';
}
function comfortLang() {
  qsrcLine();
}
/* ---- pause-menu controls ---- */
{
  const taa = $('#taasel');
  taa.value = CFG.TAA_MODE;
  taa.addEventListener('change', () => {
    CFG.TAA_MODE = SETTINGS.taaMode = taa.value;
    taaValid = false;
    saveSettings();
  });
  const ph = $('#photosel');
  ph.value = String(CFG.PHOTO_SCALE);
  ph.addEventListener('change', () => {
    CFG.PHOTO_SCALE = SETTINGS.photoScale = +ph.value;
    saveSettings();
  });
  const fov = $('#fovr');
  const fovShow = () => ($('#fovv').textContent = Math.round(CFG.FOV / DEG) + '°');
  fov.value = Math.round(CFG.FOV / DEG);
  fovShow();
  fov.addEventListener('input', () => {
    CFG.FOV = SETTINGS.fov = +fov.value * DEG;
    FOVK = CFG.FOV / BASE_FOV;
    taaValid = false;
    fovShow();
  });
  fov.addEventListener('change', saveSettings);
  const ui = $('#uiscale');
  ui.value = Math.round(CFG.UI_SCALE * 100);
  applyUIScale();
  ui.addEventListener('input', () => {
    CFG.UI_SCALE = SETTINGS.uiScale = clamp(ui.value / 100, 0.75, 1.5);
    applyUIScale();
  });
  ui.addEventListener('change', saveSettings);
  bindCheck(
    '#horbox',
    () => CFG.HORIZON_AID,
    (v) => {
      CFG.HORIZON_AID = SETTINGS.horizon = v;
    },
  );
  const rv = $('#rvsel');
  rv.value = CFG.ROLL_VIGNETTE === 'auto' ? 'auto' : CFG.ROLL_VIGNETTE ? 'on' : 'off';
  rv.addEventListener('change', () => {
    SETTINGS.rollVig = rv.value;
    CFG.ROLL_VIGNETTE = rv.value === 'auto' ? 'auto' : rv.value === 'on';
    saveSettings();
  });
}
/* ---- per frame (after render): horizon aid and roll vignette (DOM overlays, never part of screenshots or photos) ---- */
function comfortTick(dt) {
  const live = started && !PHOTO.on && !MAP.open && !INTRO.on;
  const b = basis();
  // angular velocity from the change of the camera basis: w ~ 0.5 * sum(e_prev x e_now) / dt
  let roll = 0,
    turn = 0;
  if (COMFORT.prev && dt > 0) {
    const p = COMFORT.prev;
    const w = scl(add(add(cross(p.r, b.r), cross(p.u, b.u)), cross(p.f, b.f)), 0.5 / dt);
    roll = Math.abs(dot(w, b.f));
    turn = len(sub(w, scl(b.f, dot(w, b.f))));
  }
  COMFORT.prev = { r: b.r.slice(), u: b.u.slice(), f: b.f.slice() };
  const vigOn = CFG.ROLL_VIGNETTE === 'auto' ? RM : !!CFG.ROLL_VIGNETTE;
  const target = vigOn && live && !paused ? Math.min(0.8, smooth(1.0, 2.6, roll) * 0.8 + smooth(2.2, 4.5, turn) * 0.4) : 0;
  COMFORT.vig = lerp(COMFORT.vig, target, 1 - Math.exp(-(target > COMFORT.vig ? 10 : 3) * dt));
  const v = COMFORT.vig < 0.01 ? 0 : COMFORT.vig;
  const ve = $('#rollvig');
  if (ve.dataset.v !== v.toFixed(2)) {
    ve.dataset.v = v.toFixed(2);
    ve.style.opacity = v.toFixed(2);
  }
  const hc = $('#horizon');
  const hOn = CFG.HORIZON_AID && live && !player.hideUI;
  if (hOn !== COMFORT.horOn) {
    COMFORT.horOn = hOn;
    hc.style.display = hOn ? 'block' : 'none';
  }
  if (hOn) drawHorizon(hc, b);
}
// thin line where the view meets the home system's reference plane (world XZ), plus two fixed level ticks at the centre:
// when the ticks sit on the line you are level; the line tilting shows roll, moving up or down shows pitch
function drawHorizon(c, b) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = Math.max(2, Math.floor(c.clientWidth * dpr)),
    H = Math.max(2, Math.floor(c.clientHeight * dpr));
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
  }
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  const tanY = Math.tan((player.fov * FOVK) / 2),
    tanX = (tanY * W) / H;
  const up = [0, 1, 0];
  const A = dot(up, b.r) * tanX,
    B = dot(up, b.u) * tanY,
    C = dot(up, b.f); // horizon: A x + B y + C = 0 in NDC
  const toPx = (x, y) => [((x + 1) / 2) * W, ((1 - y) / 2) * H];
  g.lineWidth = Math.max(1, dpr);
  g.strokeStyle = 'rgba(170,215,240,0.4)';
  const pts = [];
  if (Math.abs(B) > 1e-6) for (const x of [-1.2, 1.2]) pts.push([x, -(A * x + C) / B]);
  else if (Math.abs(A) > 1e-6) for (const y of [-1.2, 1.2]) pts.push([-(B * y + C) / A, y]);
  if (pts.length === 2) {
    const [p0, p1] = pts.map((p) => toPx(p[0], p[1]));
    const mx = (p0[0] + p1[0]) / 2,
      my = (p0[1] + p1[1]) / 2,
      dx = p1[0] - p0[0],
      dy = p1[1] - p0[1],
      L = Math.hypot(dx, dy) || 1;
    const gap = Math.min(W, H) * 0.09; // keep the centre clear for the crosshair
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(mx - (dx / L) * gap, my - (dy / L) * gap);
    g.moveTo(mx + (dx / L) * gap, my + (dy / L) * gap);
    g.lineTo(p1[0], p1[1]);
    g.stroke();
  }
  const cx = W / 2,
    cy = H / 2,
    r0 = Math.min(W, H) * 0.11,
    r1 = r0 + 26 * dpr;
  g.strokeStyle = 'rgba(200,230,255,0.5)';
  g.beginPath();
  g.moveTo(cx - r1, cy);
  g.lineTo(cx - r0, cy);
  g.moveTo(cx + r0, cy);
  g.lineTo(cx + r1, cy);
  g.stroke();
}
