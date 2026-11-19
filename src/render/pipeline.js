/* =====================================================================
   RENDER PIPELINE (camera-relative / floating origin)
   Every position sent to the GPU is (world - ORIGIN), computed in float64 on the CPU, with ORIGIN = the
   camera position of this frame. Meshes store instances relative to a float64 anchor (uOff = anchor - ORIGIN),
   so precision no longer depends on how far the player is from the universe origin.
   scene (MSAA) -> resolve colour+depth -> volumetrics -> TAA -> bloom / god rays -> composite
   ===================================================================== */
const fb = { w: 0, h: 0 };
let taaValid = false,
  taaIdx = 0,
  prevVPu = null,
  prevOrigin = [0, 0, 0],
  frameIdx = 0;
function createFB() {
  Object.assign(fb, {
    w: 0,
    h: 0,
    vdiv: 0,
    ms: gl.createFramebuffer(),
    tex: gl.createFramebuffer(),
    cRB: gl.createRenderbuffer(),
    dRB: gl.createRenderbuffer(),
    scene: gl.createTexture(),
    depth: gl.createTexture(),
    bw: 0,
    bh: 0,
    b1: gl.createFramebuffer(),
    b2: gl.createFramebuffer(),
    bt1: gl.createTexture(),
    bt2: gl.createTexture(),
    rm: gl.createFramebuffer(),
    r1: gl.createFramebuffer(),
    r2: gl.createFramebuffer(),
    rmt: gl.createTexture(),
    rt1: gl.createTexture(),
    rt2: gl.createTexture(),
    vol: gl.createFramebuffer(),
    volt: gl.createTexture(),
    vw: 1,
    vh: 1,
    taa: [gl.createFramebuffer(), gl.createFramebuffer()],
    taat: [gl.createTexture(), gl.createTexture()],
  });
  taaValid = false;
}
createFB();
const SAMPLES = Math.min(isTouch ? CFG.MOBILE_MSAA : 4, gl.getParameter(gl.MAX_SAMPLES));
const HALTON = [
  [0.5, 0.333],
  [0.25, 0.667],
  [0.75, 0.111],
  [0.125, 0.444],
  [0.625, 0.778],
  [0.375, 0.222],
  [0.875, 0.556],
  [0.0625, 0.889],
];
function tex2d(t, w, h) {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
// Phase 6B: while an HD capture tries a size (FB_QUIET), an incomplete target is recorded in fb.bad instead of reported
let FB_QUIET = false;
function fbFail(msg) {
  if (FB_QUIET) fb.bad = true;
  else showErr(msg);
}
function attach(fbo, tex) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fbFail('framebuffer incomplete');
}
function resizeFB(w, h) {
  const vdiv = quality.vol ? quality.vol.div : 2;
  if (fb.w === w && fb.h === h && fb.vdiv === vdiv) return;
  fb.w = w;
  fb.h = h;
  fb.vdiv = vdiv;
  fb.bad = false;
  taaValid = false;
  gl.bindRenderbuffer(gl.RENDERBUFFER, fb.cRB);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.RGBA8, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, fb.dRB);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.DEPTH_COMPONENT24, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, fb.cRB);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fb.dRB);
  if (FB_QUIET && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fb.bad = true;
  tex2d(fb.scene, w, h);
  gl.bindTexture(gl.TEXTURE_2D, fb.depth);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.tex);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fb.scene, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, fb.depth, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fbFail('resolve framebuffer incomplete');
  fb.bw = Math.max(1, w >> 2);
  fb.bh = Math.max(1, h >> 2);
  for (const [f, t] of [
    [fb.b1, fb.bt1],
    [fb.b2, fb.bt2],
    [fb.rm, fb.rmt],
    [fb.r1, fb.rt1],
    [fb.r2, fb.rt2],
  ]) {
    tex2d(t, fb.bw, fb.bh);
    attach(f, t);
  }
  fb.vw = Math.max(1, Math.floor(w / vdiv));
  fb.vh = Math.max(1, Math.floor(h / vdiv));
  tex2d(fb.volt, fb.vw, fb.vh);
  attach(fb.vol, fb.volt);
  for (let i = 0; i < 2; i++) {
    tex2d(fb.taat[i], w, h);
    attach(fb.taa[i], fb.taat[i]);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
let renderScale = quality.scale,
  frameEMA = 16;
// engine trail: float64 world positions, re-written camera-relative every frame
const trailPts = makePoints(48, () => [0, 0, 0], true);
const trail = trailPts.a;
const trailW = [];
let trailHead = 0;
for (let i = 0; i < 48; i++) {
  trail[i * 10 + 6] = 0;
  trailW.push([0, 0, 0]);
}
function updateTrail() {
  for (let i = 0; i < 48; i++) trail[i * 10 + 6] *= 0.93;
  if (player.boost && player.accel > 0) {
    const b = basis();
    trailW[trailHead] = add(player.pos, scl(b.f, -3));
    trail.set([0, 0, 0, 0, 0, 0, 1, 1, 0.75, 0.4], trailHead * 10);
    trailHead = (trailHead + 1) % 48;
  }
  for (let i = 0; i < 48; i++) {
    const r = sub(trailW[i], player.pos);
    trail[i * 10] = r[0];
    trail[i * 10 + 1] = r[1];
    trail[i * 10 + 2] = r[2];
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, trailPts.vbo);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, trail);
}
/* ---- per-zone colour grading (cool/dark in open space, warm near a star, green inside wrecks) ---- */
const grade = { tint: [1, 1, 1], sat: 1, lift: 0, wStar: 0, wIn: 0 };
const WARM = [1.12, 1.02, 0.88];
// Phase 6C: a classed star's light relative to the old sun colour (1 = unchanged), brightest channel = 1
function starRatio(st) {
  const r = [st.col[0] / BASE_SUNCOL[0], st.col[1] / BASE_SUNCOL[1], st.col[2] / BASE_SUNCOL[2]];
  const m = Math.max(r[0], r[1], r[2], 1e-3);
  return [r[0] / m, r[1] / m, r[2] / m];
}
function starWarm(st) {
  const r = starRatio(st);
  return [WARM[0] * (0.5 + 0.5 * r[0]), WARM[1] * (0.5 + 0.5 * r[1]), WARM[2] * (0.5 + 0.5 * r[2])];
}
function updateGrade(dt) {
  const k = 1 - Math.exp(-2.5 * dt);
  const st = activeStar();
  const dStar = len(sub(st.pos, player.pos));
  grade.wStar = lerp(grade.wStar, smooth(2600, 900, dStar), k);
  grade.wIn = lerp(grade.wIn, player.inside ? 1 : 0, k);
  const wOpen = Math.max(0, 1 - grade.wStar - grade.wIn),
    g = CFG.GRADE_STRENGTH;
  const sw = st.cls ? starWarm(st) : WARM; // Phase 6C: the warm grade near a star takes the colour of its class
  const tint = [
    0.9 * wOpen + sw[0] * grade.wStar + 0.78 * grade.wIn,
    0.96 * wOpen + sw[1] * grade.wStar + 1.12 * grade.wIn,
    1.08 * wOpen + sw[2] * grade.wStar + 0.84 * grade.wIn,
  ];
  for (let i = 0; i < 3; i++) grade.tint[i] = lerp(1, tint[i], g);
  grade.sat = lerp(1, 0.92 * wOpen + 1.05 * grade.wStar + 0.8 * grade.wIn, g);
  grade.lift = lerp(0, 0.03 * wOpen + 0.0 * grade.wStar + 0.045 * grade.wIn, g);
}
const R = (p) => [p[0] - ORIGIN[0], p[1] - ORIGIN[1], p[2] - ORIGIN[2]];
const ZERO = [0, 0, 0];
const relLights = new Float32Array(64);
// Phase 6C: the second light of a system ({ s: star, k: strength } or null); w = 0 makes the shaders skip it entirely
function setLight2(pr, l2) {
  if (!pr.u.uStar2) return;
  if (l2 && l2.k > 0) {
    const p = R(l2.s.pos),
      c = l2.s.col;
    gl.uniform4f(pr.u.uStar2, p[0], p[1], p[2], 1);
    if (pr.u.uSunCol2) gl.uniform3f(pr.u.uSunCol2, c[0] * l2.k, c[1] * l2.k, c[2] * l2.k);
  } else gl.uniform4f(pr.u.uStar2, 0, 0, 0, 0);
}
function setMeshCommon(pr, VP, b, star, l2) {
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, VP);
  gl.uniform1f(pr.u.uTime, time);
  gl.uniform3fv(pr.u.uCam, ZERO);
  gl.uniform3fv(pr.u.uFwd, b.f);
  gl.uniform3fv(pr.u.uStar, R(star.pos));
  gl.uniform3fv(pr.u.uSunCol, star.col);
  gl.uniform1f(pr.u.uLamp, player.lamp ? 1 : 0);
  gl.uniform4fv(pr.u.uLightPos, relLights);
  gl.uniform4fv(pr.u.uLightCol, lightCol);
  gl.uniform1i(pr.u.uNumLights, numLights);
  if (pr.u.uCalm) gl.uniform1f(pr.u.uCalm, RM ? 1 : 0);
  setLight2(pr, l2);
}
function drawItem(pr, it, anim) {
  RST.items++;
  RST.inst += it.mesh.count;
  gl.uniform1i(pr.u.uMat, it.mat);
  if (pr.u.uAnim) gl.uniform1i(pr.u.uAnim, anim !== undefined ? anim : it.anim || 0);
  if (pr.u.uOff) gl.uniform3fv(pr.u.uOff, R(it.mesh.anchor));
  const ux = pr.ultra ? ultraMeshOf(it.mesh, it, anim) : null; // Phase 6B 'ultra': tessellated geometry once it exists
  gl.bindVertexArray(ux ? ux.vao : it.mesh.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, ux ? ux.n : it.mesh.n, gl.UNSIGNED_INT, 0, it.mesh.count);
}
// b.f/tan build the view rays of a full-screen pass; b.a (Phase 6B, tiles) is the true forward axis for depth when b.f is shifted
function setCam(pr, b, tanX, tanY) {
  gl.uniform3fv(pr.u.uRight, b.r);
  gl.uniform3fv(pr.u.uUp, b.u);
  gl.uniform3fv(pr.u.uFwd, b.f);
  gl.uniform2f(pr.u.uTan, tanX, tanY);
  if (pr.u.uCam) gl.uniform3fv(pr.u.uCam, ZERO);
  if (pr.u.uAxis) gl.uniform3fv(pr.u.uAxis, b.a || b.f);
}
// LOD by apparent size; the dense mesh (sphUltra) only for the nearest planet when it fills the view; displacement only on the two dense levels.
// Phase 6B 'ultra' (PLOD = 1): any planet, moon or star steps up earlier, and an ico-7 sphere is used when it fills the view.
let PLOD = 0;
// Phase 6D: one shared buffer of plume particles (seeds from a fixed hash, never the world RNG)
const PLUME_N = 256;
let PLUME_PTS = null;
function plumePoints() {
  if (PLUME_PTS) return PLUME_PTS;
  const a = new Float32Array(PLUME_N * 10);
  const g = mkRng(0x9e3779b9);
  for (let i = 0; i < PLUME_N; i++) a.set([0, 0, 0, g(), g(), g(), g(), 1, 1, 1], i * 10);
  PLUME_PTS = { a, n: PLUME_N, dynamic: false, vao: null, vbo: null };
  uploadPoints(PLUME_PTS);
  GLR.points.push(PLUME_PTS);
  return PLUME_PTS;
}
// Phase 6D: the PEXT build of the planet shader (new-type features), linked on first need (in parallel where the driver can)
const PLX = { base: null, ultra: null };
function planetProgX(U) {
  const k = U ? 'ultra' : 'base';
  let pr = PLX[k];
  if (!pr) {
    const s = (x) => pextSrc(U ? ultraSrc(x) : x);
    try {
      pr = PLX[k] = ultraLinkStart(s(PLANET_VS), s(PLANET_FS), U ? 'planet-x-ultra' : 'planet-x');
    } catch (e) {
      PLX[k] = { failed: true };
    }
  }
  if (!pr || pr.failed) return null;
  if (pr._p)
    try {
      if (!ultraLinkDone(pr)) return null;
    } catch (e) {
      console.warn('VOIDBORNE: ' + e.message);
      PLX[k] = { failed: true };
      return null;
    }
  return pr;
}
// Phase 6D: pp = the body's surface parameter set (world/planet-types.js); none = zeros (stars, atmosphere shells)
const RING_GAP0 = [0.42, 0.7, 0.02, 0.015],
  RING_COL0 = [0.75, 0.68, 0.58];
function drawPlanetBody(pr, p, pos, r, q, type, pal, seed, ultraOK, pp) {
  const rp = R(pos);
  const d = len(rp);
  const app = r / Math.max(d, 1);
  const mesh = PLOD
    ? app > 0.45 && ULTRA.sph7
      ? ULTRA.sph7
      : app > 0.15
        ? sphUltra
        : app > 0.05
          ? sphHi
          : app > 0.008
            ? sphMid
            : sphLo
    : ultraOK && app > 0.3
      ? sphUltra
      : app > 0.09
        ? sphHi
        : app > 0.012
          ? sphMid
          : sphLo;
  const disp =
    CFG.PLANET_DISPLACEMENT && (mesh === sphUltra || mesh === sphHi || mesh === ULTRA.sph7) && (type < 6 || (type >= 8 && type < 99))
      ? 1
      : 0;
  gl.uniformMatrix3fv(pr.u.uRot, false, q2m3(q));
  gl.uniform3fv(pr.u.uPos, rp);
  gl.uniform1f(pr.u.uRadius, r);
  gl.uniform1f(pr.u.uSeed, seed);
  gl.uniform1i(pr.u.uType, type);
  if (pr.u.uDisp) gl.uniform1f(pr.u.uDisp, disp);
  if (pr.u.uPP) gl.uniform4fv(pr.u.uPP, pp || PP_ZERO);
  if (pr.u.uCol1) {
    gl.uniform3fv(pr.u.uCol1, pal.c1);
    gl.uniform3fv(pr.u.uCol2, pal.c2);
    gl.uniform3fv(pr.u.uCol3, pal.c3);
  }
  if (pr.u.uAtmo) {
    gl.uniform3fv(pr.u.uAtmo, pal.atmo);
    gl.uniform1f(pr.u.uAtmoK, pal.ak);
  }
  if (pr.u.uRing) {
    const rg = p && p.ring;
    gl.uniform4f(pr.u.uRing, rg ? rg.in : 0, rg ? rg.out : 0, rg ? rg.seed : 0, rg ? 1 : 0);
    if (rg) gl.uniform3fv(pr.u.uRingN, qrot(rg.q, [0, 1, 0]));
    if (rg && pr.u.uRingGap) gl.uniform4fv(pr.u.uRingGap, rg.gap || RING_GAP0);
  }
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_INT, 0);
}
function rayBlocked(eye, dir, L) {
  for (const p of allBodies()) {
    if (p.star) continue;
    const rel = sub(p.pos, eye);
    const t = dot(rel, dir);
    if (t < 0 || t > L) continue;
    if (len(sub(rel, scl(dir, t))) < p.r) return true;
  }
  for (const w of wrecks) {
    const rel = sub(w.pos, eye);
    const t = dot(rel, dir);
    if (t < 0 || t > L) continue;
    if (len(sub(rel, scl(dir, t))) < w.ship.R * 1.5) return true;
  }
  return false;
}
// fraction of the active star's disc hidden behind planets/wrecks (9 sample rays)
function sunOccFrac(eye, b, st) {
  const d = sub(st.pos, eye);
  const L = len(d) - st.r;
  const dir = norm(d);
  const ang = (st.r * 0.8) / len(d);
  const r = norm(cross(dir, b.u)),
    u = cross(r, dir);
  let hit = 0,
    n = 0;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++) {
      const dd = norm(add(dir, add(scl(r, i * ang), scl(u, j * ang))));
      if (rayBlocked(eye, dd, L)) hit++;
      n++;
    }
  return hit / n;
}
function m4translate(m, t) {
  const T = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t[0], t[1], t[2], 1]);
  return m4mul(m, T);
}
const ONE3 = [1, 1, 1];
const volData = new Float32Array(12),
  volCol = new Float32Array(12);
function drawRing(VP, p, star, l2) {
  gl.useProgram(prRing.p);
  gl.uniformMatrix4fv(prRing.u.uVP, false, VP);
  gl.uniformMatrix3fv(prRing.u.uPlane, false, q2m3(p.ring.q));
  gl.uniform3fv(prRing.u.uCenter, R(p.pos));
  gl.uniform3fv(prRing.u.uStar, R(star.pos));
  gl.uniform3fv(prRing.u.uSunCol, star.col);
  gl.uniform3fv(prRing.u.uPNormal, qrot(p.ring.q, [0, 1, 0]));
  gl.uniform1f(prRing.u.uPR, p.r);
  gl.uniform1f(prRing.u.uSeed, p.ring.seed);
  gl.uniform1f(prRing.u.uIn, p.ring.in);
  gl.uniform1f(prRing.u.uOut, p.ring.out);
  gl.uniform4fv(prRing.u.uRingGap, p.ring.gap || RING_GAP0); // Phase 6D ring variety (none = the old ring)
  gl.uniform3fv(prRing.u.uRingCol, p.ring.col || RING_COL0);
  setLight2(prRing, l2);
  gl.bindVertexArray(ringMesh.vao);
  gl.drawElements(gl.TRIANGLES, ringMesh.n, gl.UNSIGNED_INT, 0);
}
function drawCorona(VP, b, st) {
  gl.useProgram(prBill.p);
  gl.uniformMatrix4fv(prBill.u.uVP, false, VP);
  gl.uniform3fv(prBill.u.uCenter, R(st.pos));
  gl.uniform3fv(prBill.u.uRight, b.r);
  gl.uniform3fv(prBill.u.uUp, b.u);
  const cr = st.cor; // Phase 6C: star-class corona (size, colours, brightness, flicker); none = the old corona
  gl.uniform1f(prBill.u.uSize, st.r * (cr ? cr.k : 3.4));
  gl.uniform1f(prBill.u.uTime, time);
  gl.uniform3fv(prBill.u.uTint, cr ? [cr.i, cr.i, cr.i] : st.tint || [1, 1, 1]);
  gl.uniform3fv(prBill.u.uCorA, cr ? cr.a : ONE3);
  gl.uniform3fv(prBill.u.uCorB, cr ? cr.b : ONE3);
  gl.uniform1f(prBill.u.uFlick, cr && !RM ? cr.f : 0);
  gl.bindVertexArray(billVAO.vao);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
}
const GLMAX = Math.min(
  gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
  gl.getParameter(gl.MAX_TEXTURE_SIZE),
  ...gl.getParameter(gl.MAX_VIEWPORT_DIMS),
);
// crop a projection to the NDC rectangle centred at (cx, cy) with half-size (sx, sy): one tile of a bigger image
function tileCrop(P, cx, cy, sx, sy) {
  const T = new Float32Array(P);
  for (let i = 0; i < 4; i++) {
    T[i * 4] = (P[i * 4] - cx * P[i * 4 + 3]) / sx;
    T[i * 4 + 1] = (P[i * 4 + 1] - cy * P[i * 4 + 3]) / sy;
  }
  return T;
}
// TAA: the preset decides unless the pause-menu switch forces it (Phase 6B, CFG.TAA_MODE)
const taaWanted = () => CFG.TAA && (CFG.TAA_MODE === 'on' || (CFG.TAA_MODE !== 'off' && quality.taa));
// rt (Phase 6B, HD capture): undefined = a normal frame to the canvas. Otherwise one offscreen target of a bigger image:
// { W, H: whole image in px; x, y, w, h: this target's rectangle in it (GL convention, y up); fbo: where the composite goes }.
// Returns false when the offscreen targets could not be allocated.
function render(rt) {
  const U = ultraOn();
  PLOD = U && CFG.ULTRA_PLANETS ? 1 : 0;
  let cw, ch, w, h, W, H;
  if (rt) {
    cw = w = rt.w;
    ch = h = rt.h;
    W = rt.W;
    H = rt.H;
  } else {
    const dpr = Math.min(devicePixelRatio || 1, quality.ultraFx ? CFG.MAX_DPR : isTouch ? CFG.MOBILE_DPR : 2);
    cw = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    ch = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    let s = renderScale;
    // supersampling ('ultra' only: the other presets never go above 1): bounded by a pixel budget and the GPU limits, never below 1
    if (s > 1) s = Math.max(1, Math.min(s, Math.sqrt(CFG.ULTRA_MAX_PIXELS / (cw * ch)), (GLMAX - 1) / Math.max(cw, ch)));
    w = Math.max(2, Math.floor(cw * s));
    h = Math.max(2, Math.floor(ch * s));
    W = cw;
    H = ch;
  }
  resizeFB(w, h);
  if (rt && fb.bad) return false;
  ORIGIN = player.pos.slice();
  RST.items = 0;
  RST.inst = 0;
  for (let i = 0; i < 16; i++) {
    relLights[i * 4] = lightPos[i * 4] - ORIGIN[0];
    relLights[i * 4 + 1] = lightPos[i * 4 + 1] - ORIGIN[1];
    relLights[i * 4 + 2] = lightPos[i * 4 + 2] - ORIGIN[2];
    relLights[i * 4 + 3] = lightPos[i * 4 + 3];
  }
  const b = basis(),
    eyeW = player.pos;
  const fov = player.fov * FOVK; // Phase 6B: comfort FOV setting (FOVK = 1 by default; the boost widening stays relative)
  const asp = rt ? W / H : w / h;
  const tanY = Math.tan(fov / 2),
    tanX = rt ? tanY * asp : (tanY * w) / h;
  // a tile sees a part of the whole image: rays of the full-screen passes and the projection are shifted and narrowed
  let tXe = tanX,
    tYe = tanY,
    camT = b,
    cx = 0,
    cy = 0,
    sxT = 1,
    syT = 1;
  if (rt) {
    sxT = rt.w / W;
    syT = rt.h / H;
    cx = ((rt.x + rt.w / 2) / W) * 2 - 1;
    cy = ((rt.y + rt.h / 2) / H) * 2 - 1;
    tXe = tanX * sxT;
    tYe = tanY * syT;
    camT = { r: b.r, u: b.u, f: add(add(b.f, scl(b.r, cx * tanX)), scl(b.u, cy * tanY)), a: b.f };
  }
  const taaOn = taaWanted();
  const tiled = !!rt && (rt.w < W || rt.h < H); // one tile of a tiled photo: the full-screen passes use their TILES variants
  const pVol = tiled ? tileProg('vol') : prVol,
    pTAA = tiled ? tileProg('taa') : prTAA;
  let jx = 0,
    jy = 0;
  if (taaOn) {
    const j = HALTON[frameIdx % 8];
    jx = ((j[0] - 0.5) * 2) / w;
    jy = ((j[1] - 0.5) * 2) / h;
  }
  frameIdx++;
  const P0 = persp(fov, asp, 0.5, FAR);
  const P = rt ? tileCrop(P0, cx, cy, sxT, syT) : P0;
  const V = viewFromBasis(b.r, b.u, b.f, ZERO);
  const VPu = m4mul(P, V);
  const VPs = rt ? m4mul(P0, V) : VPu; // whole-image projection for the screen-space effects of the composite
  const Pj = new Float32Array(P);
  Pj[8] += jx;
  Pj[9] += jy;
  const VP = m4mul(Pj, V);
  const planes = frustumPlanes(VPu);
  const vis = (p, r) => sphereVisible(planes, R(p), r);
  const HS = homeStarObj(); // Phase 6C: the same values as before unless CFG.HOME_STAR_VARIETY
  const secs = readySectors();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  // sky
  gl.disable(gl.DEPTH_TEST);
  const pSky = (U && ULTRA.pr.sky) || prSky,
    sky = U && ULTRA.cube ? ULTRA.cube : cubeTex;
  gl.useProgram(pSky.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, sky);
  gl.uniform1i(pSky.u.uCube, 0);
  setCam(pSky, camT, tXe, tYe);
  gl.uniform2f(pSky.u.uJit, -jx, -jy);
  gl.uniform1f(pSky.u.uTime, time);
  if (pSky !== prSky) gl.uniform1f(pSky.u.uPx, ((CFG.ULTRA_POINT_MIN / 2.355) * 2 * tanY) / H); // star sigma floor in radians
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
  // planets, moons, stars (home + streamed sectors, each lit by its own star)
  const pPlanet = (U && ULTRA.pr.planet) || prPlanet;
  gl.useProgram(pPlanet.p);
  gl.uniformMatrix4fv(pPlanet.u.uVP, false, VP);
  gl.uniform3fv(pPlanet.u.uCam, ZERO);
  gl.uniform1f(pPlanet.u.uTime, time);
  if (pPlanet !== prPlanet) ultraBind(pPlanet, 'detail');
  let nearestP = null,
    nd = 1e18;
  const consider = (p) => {
    const dd = len(sub(p.pos, eyeW)) / p.r;
    if (dd < nd) {
      nd = dd;
      nearestP = p;
    }
  };
  planets.forEach(consider);
  secs.forEach((s) => s.planets.forEach(consider));
  const visP = [];
  // Phase 6D: bodies whose set uses a new-type feature (ext) are drawn with the PEXT build of the planet shader; bindP switches
  // programs and re-sends the per-program state only when needed. Until PEXT is linked they use the classic build.
  const pX = secs.some((s) => s.ext) ? planetProgX(!!(U && ULTRA.pr.planet)) : null; // only once a sector with such bodies is loaded
  let curP = pPlanet,
    curS = null,
    curL = null;
  const bindP = (pr, st, l2) => {
    if (pr !== curP) {
      gl.useProgram(pr.p);
      gl.uniformMatrix4fv(pr.u.uVP, false, VP);
      gl.uniform3fv(pr.u.uCam, ZERO);
      gl.uniform1f(pr.u.uTime, time);
      if (pr.u.uDetail) ultraBind(pr, 'detail');
      curP = pr;
      curS = null;
    }
    if (st !== curS || l2 !== curL) {
      gl.uniform3fv(pr.u.uStar, R(st.pos));
      gl.uniform3fv(pr.u.uSunCol, st.col);
      setLight2(pr, l2);
      curS = st;
      curL = l2;
    }
    return pr;
  };
  const body = (o, t, st, l2, ultraOK, p) => {
    const pp = ppOf(o, t);
    const pr = bindP(pp[PPK.auroraCol + 3] && pX ? pX : pPlanet, st, l2);
    drawPlanetBody(pr, p, o.pos, o.r, o.q, t, o.pal, o.seed, ultraOK, pp);
  };
  // Phase 6C: lit by the system's primary (st) and, when it has one, a second star (l2); every star of it is drawn
  const drawSystem = (list, st, l2, stars) => {
    bindP(pPlanet, st, l2);
    for (const p of list) {
      if (vis(p.pos, p.r * 1.1)) {
        visP.push([p, st, l2]);
        body(p, p.type, st, l2, quality.ultra && p === nearestP, p);
      }
      for (const m of p.moons) if (vis(m.pos, m.r * (m.irr || 1))) body(m, m.type || 5, st, l2, false, null);
    }
    bindP(pPlanet, st, l2);
    for (const sb of stars)
      if (vis(sb.pos, sb.r * 1.2))
        drawPlanetBody(
          pPlanet,
          null,
          sb.pos,
          sb.r,
          qid(),
          7,
          sb.pal
            ? { c1: sb.pal.c1, c2: sb.pal.c2, c3: sb.pal.c3, atmo: [0, 0, 0], ak: RM ? 0 : sb.pal.ak }
            : { c1: sb.tint || [1, 1, 1], c2: [1, 1, 1], c3: [1, 1, 1], atmo: [0, 0, 0], ak: 0 },
          0,
          false,
        );
  };
  drawSystem(planets, HS, null, [HS]);
  for (const s of secs) drawSystem(s.planets, s.star, s.l2, s.stars);
  RST.planets = visP.length;
  // opaque meshes (home system)
  const pMesh = (U && ULTRA.pr.mesh) || prMesh;
  const meshCommon = (pr, st, l2) => {
    setMeshCommon(pr, VP, b, st, l2);
    if (pr.ultra) ultraBind(pr, 'panel');
  };
  meshCommon(pMesh, HS);
  for (const wr of wrecks) {
    if (!vis(wr.pos, wr.rad)) continue;
    for (const it of wr.items) drawItem(pMesh, it);
    if (wr.big) drawItem(pMesh, { mesh: wr.artifact.mesh, mat: 8 });
  }
  if (vis(station.pos, station.rad)) for (const it of station.items) drawItem(pMesh, it);
  for (const it of debrisItems) drawItem(pMesh, it, 4);
  for (const s of secrets) if (s.items && vis(s.pos, 40)) for (const it of s.items) drawItem(pMesh, it);
  for (const l of landmarks) if (l.items && vis(l.pos, 80)) drawItem(pMesh, l.items[0]);
  for (const wh of whales) if (vis(wh.pos, wh.scale)) drawItem(pMesh, { mesh: wh.mesh, mat: 5 }, 2);
  // opaque meshes (streamed sectors)
  for (const s of secs) {
    meshCommon(pMesh, s.star, s.l2);
    for (const wr of s.wrecks) if (vis(wr.pos, wr.rad * 2.5)) for (const it of wr.items) drawItem(pMesh, it);
    if (s.beacon && s.beacon.items && vis(s.beacon.pos, 20)) for (const it of s.beacon.items) drawItem(pMesh, it);
  }
  // asteroids (GPU orbits; uCenter is camera-relative)
  gl.useProgram(prAst.p);
  gl.uniformMatrix4fv(prAst.u.uVP, false, VP);
  gl.uniform1f(prAst.u.uTime, time);
  gl.uniform3fv(prAst.u.uCam, ZERO);
  gl.uniform3fv(prAst.u.uFwd, b.f);
  gl.uniform3fv(prAst.u.uStar, R(STAR.pos));
  gl.uniform3fv(prAst.u.uSunCol, SUNCOL);
  gl.uniform1f(prAst.u.uLamp, player.lamp ? 1 : 0);
  gl.uniform4fv(prAst.u.uLightPos, relLights);
  gl.uniform4fv(prAst.u.uLightCol, lightCol);
  gl.uniform1i(prAst.u.uNumLights, numLights);
  gl.uniform1i(prAst.u.uMat, 2);
  if (len(eyeW) < BELT.R1 + 20000) {
    gl.uniformMatrix3fv(prAst.u.uPlane, false, q2m3(BELT.q));
    gl.uniform3fv(prAst.u.uCenter, R([0, 0, 0]));
    for (const it of beltItems) {
      gl.bindVertexArray(it.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, it.n, gl.UNSIGNED_INT, 0, it.count);
    }
  }
  const ringVis = vis(ringedP.pos, ringedP.ring.out);
  if (ringVis) {
    gl.uniformMatrix3fv(prAst.u.uPlane, false, q2m3(ringedP.ring.q));
    gl.uniform3fv(prAst.u.uCenter, R(ringedP.pos));
    for (const it of ringItems) {
      gl.bindVertexArray(it.vao);
      gl.drawElementsInstanced(gl.TRIANGLES, it.n, gl.UNSIGNED_INT, 0, it.count);
    }
  }
  // transparents
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const [p, st, l2] of visP) if (p.ring) drawRing(VP, p, st, l2);
  gl.useProgram(pPlanet.p);
  for (const [p, st, l2] of visP)
    if (ppOf(p, p.type)[PPK.cloudLo] < 1) {
      gl.uniform3fv(pPlanet.u.uStar, R(st.pos));
      gl.uniform3fv(pPlanet.u.uSunCol, st.col);
      setLight2(pPlanet, l2);
      drawPlanetBody(pPlanet, null, p.pos, p.r * 1.02, p.q, 6, p.pal, p.seed, false, ppOf(p, p.type)); // Phase 6D: any type with a cloud cover
    }
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.CULL_FACE);
  if (CFG.ATMO_SCATTER && quality.scatter) {
    gl.cullFace(gl.FRONT);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(prAtmo.p);
    gl.uniformMatrix4fv(prAtmo.u.uVP, false, VP);
    gl.uniform3fv(prAtmo.u.uCam, ZERO);
    gl.uniform1f(prAtmo.u.uTime, time);
    for (const [p, st, l2] of visP)
      if (p.pal.ak > 0) {
        gl.uniform3fv(prAtmo.u.uStar, R(st.pos));
        gl.uniform3fv(prAtmo.u.uSunCol, st.col);
        setLight2(prAtmo, l2);
        gl.uniform1f(prAtmo.u.uRp, p.r);
        drawPlanetBody(prAtmo, null, p.pos, p.r * 1.1, p.q, 99, p.pal, p.seed, false);
      }
    gl.enable(gl.DEPTH_TEST);
  } else {
    gl.cullFace(gl.BACK);
    gl.useProgram(prAtmoRim.p);
    gl.uniformMatrix4fv(prAtmoRim.u.uVP, false, VP);
    gl.uniform3fv(prAtmoRim.u.uCam, ZERO);
    gl.uniform1f(prAtmoRim.u.uTime, time);
    for (const [p, st, l2] of visP)
      if (p.pal.ak > 0) {
        gl.uniform3fv(prAtmoRim.u.uStar, R(st.pos));
        setLight2(prAtmoRim, l2);
        drawPlanetBody(prAtmoRim, null, p.pos, p.r * 1.07, p.q, 99, p.pal, p.seed, false);
      }
  }
  gl.disable(gl.CULL_FACE);
  for (const st of [HS, ...secs.flatMap((s) => s.stars)]) if (vis(st.pos, st.r * (st.cor ? st.cor.k * 1.03 : 3.5))) drawCorona(VP, b, st);
  meshCommon(pMesh, HS);
  for (const l of landmarks) if (l.items && vis(l.pos, 2300)) drawItem(pMesh, l.items[1]);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  // CFG.FRAGDEPTH_SCOPE 'large' (Phase 6B): these small additive creatures use the vertex log depth (no gl_FragDepth write)
  const pSmall = CFG.FRAGDEPTH_SCOPE === 'large' && !pMesh.ultra ? prMeshVD() : pMesh;
  if (pSmall !== pMesh) meshCommon(pSmall, HS);
  drawItem(pSmall, { mesh: MINN.mesh, mat: 4 }, 1);
  drawItem(pSmall, { mesh: medusae.mesh, mat: 6 }, 3);
  for (const s of secs) if (s.med && s.med.mesh && vis(s.med.c, 200)) drawItem(pSmall, { mesh: s.med.mesh, mat: 6 }, 3);
  if (METEOR.on) drawItem(pSmall, { mesh: METEOR.mesh, mat: 4 }, 0);
  const pPt = (U && ULTRA.pr.pt) || prPt;
  gl.useProgram(pPt.p);
  gl.uniformMatrix4fv(pPt.u.uVP, false, VP);
  gl.uniform3fv(pPt.u.uCam, ZERO);
  gl.uniform1f(pPt.u.uTime, time);
  gl.uniform1f(pPt.u.uPR, h / (2 * tYe));
  if (pPt !== prPt) gl.uniform1f(pPt.u.uPtMin, (CFG.ULTRA_POINT_MIN * h) / (H * syT));
  const B = 90;
  gl.uniform3f(pPt.u.uCamMod, ((eyeW[0] % B) + B) % B, ((eyeW[1] % B) + B) % B, ((eyeW[2] % B) + B) % B);
  const pts = (mode, pt, anchor, n) => {
    gl.uniform1i(pPt.u.uMode, mode);
    gl.uniform3fv(pPt.u.uOff, anchor ? R(anchor) : ZERO);
    gl.bindVertexArray(pt.vao || pt);
    gl.drawArrays(gl.POINTS, 0, n);
  };
  pts(0, dust, null, dust.n);
  pts(1, sparks, [0, 0, 0], sparks.n);
  pts(2, MINN.glowVAO, [0, 0, 0], MINN.n);
  pts(3, trailPts, null, 48);
  if (DEB.n) pts(5, DEB.pts, null, DEB.n);
  if (starPts && starPts.n) pts(4, starPts, starPts.anchor, starPts.n);
  // Phase 6D: plumes of volcanic and geyser moons (one draw each, CFG.PLUME_PARTICLES per quality, none beyond PLUME_RANGE)
  const npl = CFG.PLUME_PARTICLES[CFG.QUALITY] || 0;
  if (npl > 0)
    for (const s of secs)
      for (const p of s.planets)
        for (const m of p.moons) {
          const pl = m.plume;
          if (!pl || len(sub(m.pos, eyeW)) > CFG.PLUME_RANGE + pl.h || !vis(m.pos, m.r + pl.h)) continue;
          const up = qrot(m.q, pl.dir);
          const vent = add(m.pos, scl(up, m.r * 0.98));
          const st = s.star,
            toS = norm(sub(st.pos, m.pos));
          const lk = pl.kind ? 0.5 + 0.7 * Math.max(0, dot(up, toS) * 0.5 + 0.5) : 1; // geysers shine in sunlight, lava glows anyway
          gl.uniform4f(pPt.u.uPl, up[0], up[1], up[2], pl.h);
          gl.uniform4f(pPt.u.uPl2, pl.kind, m.r * (pl.kind ? 0.16 : 0.15), pl.kind ? 0.9 : 0.8, pl.rate);
          gl.uniform3f(pPt.u.uPlC, pl.col[0] * lk, pl.col[1] * lk, pl.col[2] * lk);
          pts(6, plumePoints(), vent, Math.min(npl, PLUME_N));
        }
  gl.bindVertexArray(null);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  // resolve colour and depth
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.ms);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.tex);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.bindVertexArray(emptyVAO);
  // volumetric nebula pockets
  let volOn = false;
  if (CFG.VOLUMETRICS && quality.vol) {
    let n = 0;
    for (const c of clouds) {
      if (n < 3 && vis(c.c, c.R)) {
        const rc = R(c.c);
        volData.set([rc[0], rc[1], rc[2], c.R], n * 4);
        volCol.set([c.col[0], c.col[1], c.col[2], c.seed], n * 4);
        n++;
      }
    }
    if (n > 0) {
      volOn = true;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.vol);
      gl.viewport(0, 0, fb.vw, fb.vh);
      gl.useProgram(pVol.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fb.depth);
      gl.uniform1i(pVol.u.uDepth, 0);
      setCam(pVol, camT, tXe, tYe);
      gl.uniform3fv(pVol.u.uStar, R(STAR.pos));
      gl.uniform1f(pVol.u.uTime, time);
      gl.uniform1i(pVol.u.uN, n);
      gl.uniform1i(pVol.u.uSteps, quality.vol.steps);
      gl.uniform4fv(pVol.u.uCloud, volData);
      gl.uniform4fv(pVol.u.uCloudCol, volCol);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  // temporal AA (history re-projected across the origin shift)
  let src = fb.scene;
  const dO = sub(ORIGIN, prevOrigin);
  if (len(dO) > 2000) taaValid = false;
  if (taaOn) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.taa[taaIdx]);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pTAA.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fb.scene);
    gl.uniform1i(pTAA.u.uCur, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fb.taat[1 - taaIdx]);
    gl.uniform1i(pTAA.u.uHist, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fb.depth);
    gl.uniform1i(pTAA.u.uDepth, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, fb.volt);
    gl.uniform1i(pTAA.u.uVol, 3);
    gl.uniformMatrix4fv(pTAA.u.uPrevVP, false, taaValid && prevVPu ? m4translate(prevVPu, dO) : VPu);
    setCam(pTAA, camT, tXe, tYe);
    gl.uniform2f(pTAA.u.uRes, w, h);
    gl.uniform1f(pTAA.u.uBlend, taaValid ? quality.taaBlend || 0.85 : 0); // 0.85: TAA forced on with a preset that has none
    gl.uniform1f(pTAA.u.uVolOn, volOn ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    src = fb.taat[taaIdx];
    taaIdx = 1 - taaIdx;
    taaValid = true;
  }
  prevVPu = VPu;
  prevOrigin = ORIGIN.slice();
  // active (nearest) star: screen position, visibility, occlusion fraction
  const AS = activeStar();
  const asr = R(AS.pos);
  const sc = m4v(VPs, [asr[0], asr[1], asr[2], 1]); // whole-image position (= VPu except for tiles)
  let su = [0.5, 0.5],
    sv = 0,
    occ = 0;
  if (sc[3] > 0) {
    su = [(sc[0] / sc[3]) * 0.5 + 0.5, (sc[1] / sc[3]) * 0.5 + 0.5];
    const m = Math.max(Math.abs(su[0] - 0.5), Math.abs(su[1] - 0.5));
    const onscreen = (1 - smooth(0.55, 0.8, m)) * smooth(60000, 15000, len(asr));
    if (onscreen > 0) {
      occ = sunOccFrac(eyeW, b, AS);
      sv = onscreen * (occ > 0.99 ? 0 : 1);
    }
  }
  // bloom
  const bloomOn = CFG.BLOOM && quality.bloom;
  gl.viewport(0, 0, fb.bw, fb.bh);
  gl.activeTexture(gl.TEXTURE0);
  if (bloomOn) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.b1);
    gl.useProgram(prBright.p);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(prBright.u.uTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(prBlur.p);
    gl.uniform1i(prBlur.u.uTex, 0);
    for (let k = 0; k < 2; k++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.b2);
      gl.bindTexture(gl.TEXTURE_2D, fb.bt1);
      gl.uniform2f(prBlur.u.uDir, 1 / fb.bw, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.b1);
      gl.bindTexture(gl.TEXTURE_2D, fb.bt2);
      gl.uniform2f(prBlur.u.uDir, 0, 1 / fb.bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  // god rays: mask around the star, then radial blur (stronger when the disc is partly hidden)
  let rayK = 0,
    rayTex = fb.rt1;
  if (CFG.GODRAYS && quality.rays && sv > 0 && !tiled) {
    // (a tile does not see the whole sun mask, so tiled photos have no god rays)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.rm);
    gl.useProgram(prMask.p);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(prMask.u.uTex, 0);
    gl.uniform2fv(prMask.u.uSunUV, su);
    gl.uniform2f(prMask.u.uRes, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(prRays.p);
    gl.uniform1i(prRays.u.uTex, 0);
    gl.uniform2fv(prRays.u.uSunUV, su);
    gl.uniform1i(prRays.u.uN, quality.rays.n);
    gl.uniform1f(prRays.u.uDecay, 0.955);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.r1);
    gl.bindTexture(gl.TEXTURE_2D, fb.rmt);
    gl.uniform1f(prRays.u.uDensity, 0.9);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (quality.rays.passes > 1) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.r2);
      gl.bindTexture(gl.TEXTURE_2D, fb.rt1);
      gl.uniform1f(prRays.u.uDensity, 0.45);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      rayTex = fb.rt2;
    }
    rayK = sv * (0.35 + 0.65 * occ) * 0.9;
  }
  // composite (a tile of a tiled photo uses the TILES variant, which maps whole-image to tile coordinates)
  const pComp = tiled ? tileProg('comp') : prComp;
  gl.bindFramebuffer(gl.FRAMEBUFFER, rt ? rt.fbo : null);
  gl.viewport(0, 0, cw, ch);
  gl.useProgram(pComp.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.uniform1i(pComp.u.uTex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fb.bt1);
  gl.uniform1i(pComp.u.uBloom, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, rayTex);
  gl.uniform1i(pComp.u.uRays, 2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, fb.volt);
  gl.uniform1i(pComp.u.uVol, 3);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, fb.depth);
  gl.uniform1i(pComp.u.uDepth, 4);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTex);
  gl.uniform1i(pComp.u.uCube, 5);
  gl.uniform2fv(pComp.u.uSunUV, su);
  gl.uniform1f(pComp.u.uSunVis, sv);
  gl.uniform2f(pComp.u.uRes, W, H);
  if (pComp !== prComp) {
    gl.uniform4f(pComp.u.uTile, rt.x / W, rt.y / H, rt.w / W, rt.h / H);
    gl.uniform2f(pComp.u.uTileI, W / rt.w, H / rt.h);
  }
  gl.uniform1f(pComp.u.uAberr, player.boost && player.accel > 0 ? 1 : 0);
  gl.uniform1f(pComp.u.uTime, time);
  gl.uniform1f(pComp.u.uBloomK, bloomOn ? 0.9 : 0);
  gl.uniform1f(pComp.u.uRayK, rayK);
  gl.uniform1f(pComp.u.uVolOn, volOn && !taaOn ? 1 : 0);
  gl.uniform3fv(pComp.u.uTint, grade.tint);
  gl.uniform1f(pComp.u.uSat, grade.sat);
  gl.uniform1f(pComp.u.uLift, grade.lift);
  setCam(pComp, b, tanX, tanY);
  gl.uniformMatrix4fv(pComp.u.uVP, false, VPs);
  gl.uniform1f(pComp.u.uWarp, (WARP.k || 0) * (RM ? 0.45 : 1));
  gl.uniform1f(pComp.u.uFlare, (EV.flareK || 0) * 0.35 * (RM ? 0.3 : 1));
  // Phase 6C: lens flare and flare flash in the colour of the nearest star when it has a class (exactly 1 otherwise)
  const AF = AS.cls ? AS.flare : null;
  gl.uniform3fv(pComp.u.uSunTint, AS.cls ? AS.col.map((v, i) => Math.min(1.6, v / BASE_SUNCOL[i])) : ONE3);
  gl.uniform3fv(pComp.u.uFlareCol, AF ? [AF[0], AF[1] / 0.85, AF[2] / 0.6] : ONE3);
  gl.uniform1f(pComp.u.uCalm, RM ? 1 : 0); // reduce motion: softer warp, dimmer flare flash
  // black hole: screen position + lens radius for the composite shader
  let bhOn = 0;
  const BH = landmarks.find((l) => l.kind === 'blackhole');
  if (BH) {
    const rel = R(BH.pos);
    const d = len(rel);
    const c = m4v(VPs, [rel[0], rel[1], rel[2], 1]);
    if (c[3] > 0 && d < 9000) {
      const bu = [(c[0] / c[3]) * 0.5 + 0.5, (c[1] / c[3]) * 0.5 + 0.5];
      const z = Math.tan(Math.atan((14 * BH.Rs) / d)) / (2 * tanY);
      if (bu[0] > -z && bu[0] < 1 + z && bu[1] > -z && bu[1] < 1 + z) {
        bhOn = 1;
        gl.uniform4f(pComp.u.uBH, bu[0], bu[1], z, BH.seed);
        gl.uniform3fv(pComp.u.uBHpos, rel);
        gl.uniform3fv(pComp.u.uBHn, BH.n);
        gl.uniform3fv(pComp.u.uBHt, BH.t1);
        gl.uniform1f(pComp.u.uBHr, BH.Rs);
      }
    }
  }
  gl.uniform1f(pComp.u.uBHon, bhOn);
  gl.uniform1f(pComp.u.uBHq, quality.taa ? 1 : 0);
  fxUniforms(pComp, VPs, b, tanY); // Phase 5B: visor, scanner overlay, opening sequence
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.activeTexture(gl.TEXTURE0);
  return true;
}
// tiled photos: '#define TILES' variants of the volumetrics, TAA and composite programs, compiled on first use only
const TILEP = {};
function tileProg(k) {
  if (!TILEP[k]) {
    const fs = { vol: VOL_FS, taa: TAA_FS, comp: COMP_FS }[k];
    TILEP[k] = compile(FS_VS, fs.replace('#version 300 es\n', '#version 300 es\n#define TILES 1\n'), k + '-tiles');
  }
  return TILEP[k];
}
// CFG.FRAGDEPTH_SCOPE 'large': mesh program without the gl_FragDepth write, compiled on first use only
let prMeshVDp = null;
function prMeshVD() {
  if (!prMeshVDp) prMeshVDp = compile(MESH_VS, MESH_FS(false), 'mesh-vdepth');
  return prMeshVDp;
}
