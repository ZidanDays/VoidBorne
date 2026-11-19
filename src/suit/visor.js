/* ---------------- helmet visor ---------------- */
const CW = 512,
  CH = 288; // crack texture (16:9, stretched over the screen)
const VISOR = {
  on: SETTINGS.visor != null ? !!SETTINGS.visor : CFG.VISOR,
  fog: 0,
  idle: 0,
  bt: 0,
  crack: 0,
  lastImp: 0,
  cTex: null,
  rTex: null,
  cData: new Uint8Array(CW * CH),
  rcv: document.createElement('canvas'),
  rctx: null,
  rT: 0,
};
VISOR.rcv.width = 256;
VISOR.rcv.height = 128;
VISOR.rctx = VISOR.rcv.getContext('2d');
VISOR.rKey = '';
function r8tex(w, h, data) {
  const tx = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tx);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tx;
}
function fxGL() {
  VISOR.cTex = r8tex(CW, CH, VISOR.cData);
  VISOR.rTex = r8tex(256, 128, new Uint8Array(256 * 128));
  VISOR.rKey = '';
} // also called by rebuildGL() after a context loss
fxGL();
// procedural crack: radial fractures with jitter and short branches, plus two broken rings around the impact point
function genCrack(u, v, sev) {
  const D = VISOR.cData;
  if (VISOR.crack < 0.2) D.fill(0);
  const px = u * CW,
    py = v * CH;
  const rand = Math.random;
  const plot = (x, y, a) => {
    const ix = x | 0,
      iy = y | 0;
    if (ix < 0 || iy < 0 || ix >= CW || iy >= CH) return;
    const i = iy * CW + ix,
      val = a * 255;
    if (D[i] < val) D[i] = val;
  };
  const line = (x0, y0, x1, y1, a) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let k = 0; k <= n; k++) {
      const f = k / n,
        x = x0 + (x1 - x0) * f,
        y = y0 + (y1 - y0) * f;
      plot(x, y, a);
      plot(x + 0.7, y, a * 0.35);
      plot(x, y + 0.7, a * 0.35);
    }
  };
  const ray = (x, y, ang, L, a, depth) => {
    let l = 0;
    while (l < L) {
      const seg = 4 + rand() * 9;
      ang += (rand() - 0.5) * 0.5;
      const nx = x + Math.cos(ang) * seg,
        ny = y + Math.sin(ang) * seg;
      line(x, y, nx, ny, a * (1 - (0.6 * l) / L));
      if (depth < 2 && rand() < 0.1) ray(nx, ny, ang + (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.6), (L - l) * 0.4, a * 0.7, depth + 1);
      x = nx;
      y = ny;
      l += seg;
    }
  };
  const N = 6 + ((rand() * 5) | 0),
    scale = 0.6 + 0.8 * sev;
  for (let i = 0; i < N; i++) ray(px, py, (i / N) * TAU + rand() * 0.5, (40 + rand() * 140) * scale, 0.9, 0);
  for (const rr of [(10 + rand() * 8) * scale, (24 + rand() * 14) * scale]) {
    let prev = null;
    for (let k = 0; k <= N; k++) {
      const ang = (k / N) * TAU,
        j = 0.8 + rand() * 0.4;
      const p = [px + Math.cos(ang) * rr * j, py + Math.sin(ang) * rr * j];
      if (prev && rand() < 0.85) line(prev[0], prev[1], p[0], p[1], 0.5);
      prev = p;
    }
  }
  for (let k = 0; k < 12; k++) plot(px + (rand() - 0.5) * 3, py + (rand() - 0.5) * 3, 1);
  gl.bindTexture(gl.TEXTURE_2D, VISOR.cTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CW, CH, gl.RED, gl.UNSIGNED_BYTE, D);
}
// called after collide(): the velocity change of a bounce is 1.45 x the impact speed along the surface normal
function impactCheck(v0) {
  const dv = sub(player.vel, v0);
  const imp = len(dv) / 1.45;
  if (imp < CFG.VISOR_CRACK_SPEED) return;
  const now = performance.now();
  if (now - VISOR.lastImp < 600) return;
  VISOR.lastImp = now;
  if (!(CFG.VISOR && VISOR.on && CFG.VISOR_CRACKS) || RM) return;
  const b = basis();
  const d = scl(norm(dv), -1);
  const x = dot(d, b.r),
    y = dot(d, b.u),
    z = dot(d, b.f);
  const tanY = Math.tan((player.fov * FOVK) / 2), // Phase 6B: the field-of-view setting (FOVK, ui/comfort.js)
    asp = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  let u, v;
  if (z > 0.25) {
    u = 0.5 + (0.5 * (x / z)) / (tanY * asp);
    v = 0.5 + (0.5 * (y / z)) / tanY;
  } else {
    const l = Math.hypot(x, y) || 1;
    u = 0.5 + (0.4 * x) / l;
    v = 0.5 + (0.4 * y) / l;
  }
  genCrack(clamp(u, 0.12, 0.88), clamp(v, 0.15, 0.85), clamp((imp - CFG.VISOR_CRACK_SPEED) / 80, 0, 1));
  VISOR.crack = 1;
  sfxCrack();
}
function sfxCrack() {
  caption('cap.crack', null);
  if (!AUD.ctx) return;
  const AC = AUD.ctx,
    t0 = AC.currentTime;
  const n = AC.createBufferSource();
  n.buffer = noiseBuf(0.3, false);
  const hp = AC.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = AC.createGain();
  env(g, t0, 0.002, 0.25, 0.12);
  n.connect(hp);
  hp.connect(g);
  g.connect(AUD.master);
  n.start(t0);
  n.stop(t0 + 0.3);
  for (let i = 0; i < 3; i++) {
    const o = AC.createOscillator();
    o.type = 'sine';
    o.frequency.value = 2600 + i * 900 + Math.random() * 300;
    const og = AC.createGain();
    env(og, t0 + 0.02 + i * 0.05, 0.002, 0.04, 0.4);
    o.connect(og);
    og.connect(AUD.master);
    og.connect(AUD.rev);
    o.start(t0 + 0.02 + i * 0.05);
    o.stop(t0 + 0.6 + i * 0.05);
  }
}
// the HUD reflected in the glass: a mirrored copy of the main HUD readouts drawn into a small 256x128 canvas
// (twice a second, only when the text changed); linear magnification of the small texture gives the soft, out-of-focus look
const HUDEL = { spd: $('#spd'), near: $('#near'), dc: $('#dcount'), goal: $('#goal'), ih: $('#introhint') };
function reflTick(dt) {
  VISOR.rT -= dt;
  if (VISOR.rT > 0) return;
  VISOR.rT = 0.5;
  const g = HUDEL.goal.style.opacity !== '0' ? HUDEL.goal.textContent : '';
  const key = HUDEL.spd.textContent + '|' + HUDEL.near.textContent + '|' + HUDEL.dc.textContent + '|' + g;
  if (key === VISOR.rKey) return;
  VISOR.rKey = key;
  const c = VISOR.rctx,
    W = 256,
    H = 128;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  c.setTransform(-1, 0, 0, 1, W, 0);
  c.fillStyle = '#fff';
  c.strokeStyle = '#fff';
  c.font = '11px monospace';
  c.fillText(HUDEL.spd.textContent, 0.03 * W, 0.86 * H);
  c.font = '6px monospace';
  c.fillText(HUDEL.near.textContent, 0.03 * W, 0.92 * H);
  c.fillText(HUDEL.dc.textContent, 0.72 * W, 0.9 * H);
  if (g) c.fillText(g, 0.03 * W, 0.14 * H);
  c.lineWidth = 1.5;
  c.beginPath();
  c.arc(0.905 * W, 0.2 * H, 0.15 * H, 0, TAU);
  c.stroke();
  c.lineWidth = 0.75;
  c.beginPath();
  c.arc(0.905 * W, 0.2 * H, 0.08 * H, 0, TAU);
  c.stroke();
  c.setTransform(1, 0, 0, 1, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, VISOR.rTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, VISOR.rcv);
}
function visorTick(dt) {
  const moving = len(player.vel) > 0.8 || player.accel > 0;
  if (moving) VISOR.idle = 0;
  else VISOR.idle += dt;
  const want = VISOR.idle > CFG.VISOR_FOG_DELAY && !INTRO.on;
  VISOR.fog = want ? Math.min(1, VISOR.fog + dt / 5) : Math.max(0, VISOR.fog - dt / 0.8);
  VISOR.bt += dt;
  if (VISOR.crack > 0) VISOR.crack = Math.max(0, VISOR.crack - dt / Math.max(1, CFG.VISOR_CRACK_FADE));
  if (CFG.VISOR && VISOR.on && CFG.VISOR_REFLECT && fxQ() > 0) reflTick(dt);
}
$('#visorbox').checked = VISOR.on;
$('#visorbox').onchange = (e) => {
  VISOR.on = e.target.checked;
  SETTINGS.visor = VISOR.on;
  saveSettings();
};
