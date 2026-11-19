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
function attach(fbo, tex) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) showErr('framebuffer incomplete');
}
function resizeFB(w, h) {
  const vdiv = quality.vol ? quality.vol.div : 2;
  if (fb.w === w && fb.h === h && fb.vdiv === vdiv) return;
  fb.w = w;
  fb.h = h;
  fb.vdiv = vdiv;
  taaValid = false;
  gl.bindRenderbuffer(gl.RENDERBUFFER, fb.cRB);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.RGBA8, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, fb.dRB);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, gl.DEPTH_COMPONENT24, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, fb.cRB);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fb.dRB);
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
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) showErr('resolve framebuffer incomplete');
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
function updateGrade(dt) {
  const k = 1 - Math.exp(-2.5 * dt);
  const st = activeStar();
  const dStar = len(sub(st.pos, player.pos));
  grade.wStar = lerp(grade.wStar, smooth(2600, 900, dStar), k);
  grade.wIn = lerp(grade.wIn, player.inside ? 1 : 0, k);
  const wOpen = Math.max(0, 1 - grade.wStar - grade.wIn),
    g = CFG.GRADE_STRENGTH;
  const tint = [
    0.9 * wOpen + 1.12 * grade.wStar + 0.78 * grade.wIn,
    0.96 * wOpen + 1.02 * grade.wStar + 1.12 * grade.wIn,
    1.08 * wOpen + 0.88 * grade.wStar + 0.84 * grade.wIn,
  ];
  for (let i = 0; i < 3; i++) grade.tint[i] = lerp(1, tint[i], g);
  grade.sat = lerp(1, 0.92 * wOpen + 1.05 * grade.wStar + 0.8 * grade.wIn, g);
  grade.lift = lerp(0, 0.03 * wOpen + 0.0 * grade.wStar + 0.045 * grade.wIn, g);
}
const R = (p) => [p[0] - ORIGIN[0], p[1] - ORIGIN[1], p[2] - ORIGIN[2]];
const ZERO = [0, 0, 0];
const relLights = new Float32Array(64);
function setMeshCommon(pr, VP, b, star) {
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
}
function drawItem(pr, it, anim) {
  RST.items++;
  RST.inst += it.mesh.count;
  gl.uniform1i(pr.u.uMat, it.mat);
  if (pr.u.uAnim) gl.uniform1i(pr.u.uAnim, anim !== undefined ? anim : it.anim || 0);
  if (pr.u.uOff) gl.uniform3fv(pr.u.uOff, R(it.mesh.anchor));
  gl.bindVertexArray(it.mesh.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, it.mesh.n, gl.UNSIGNED_INT, 0, it.mesh.count);
}
function setCam(pr, b, tanX, tanY) {
  gl.uniform3fv(pr.u.uRight, b.r);
  gl.uniform3fv(pr.u.uUp, b.u);
  gl.uniform3fv(pr.u.uFwd, b.f);
  gl.uniform2f(pr.u.uTan, tanX, tanY);
  if (pr.u.uCam) gl.uniform3fv(pr.u.uCam, ZERO);
}
// LOD by apparent size; the dense mesh (sphUltra) only for the nearest planet when it fills the view; displacement only on the two dense levels
function drawPlanetBody(pr, p, pos, r, q, type, pal, seed, ultraOK) {
  const rp = R(pos);
  const d = len(rp);
  const app = r / Math.max(d, 1);
  const mesh = ultraOK && app > 0.3 ? sphUltra : app > 0.09 ? sphHi : app > 0.012 ? sphMid : sphLo;
  const disp = CFG.PLANET_DISPLACEMENT && (mesh === sphUltra || mesh === sphHi) && type < 6 ? 1 : 0;
  gl.uniformMatrix3fv(pr.u.uRot, false, q2m3(q));
  gl.uniform3fv(pr.u.uPos, rp);
  gl.uniform1f(pr.u.uRadius, r);
  gl.uniform1f(pr.u.uSeed, seed);
  gl.uniform1i(pr.u.uType, type);
  if (pr.u.uDisp) gl.uniform1f(pr.u.uDisp, disp);
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
const volData = new Float32Array(12),
  volCol = new Float32Array(12);
function drawRing(VP, p, star) {
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
  gl.bindVertexArray(ringMesh.vao);
  gl.drawElements(gl.TRIANGLES, ringMesh.n, gl.UNSIGNED_INT, 0);
}
function drawCorona(VP, b, st) {
  gl.useProgram(prBill.p);
  gl.uniformMatrix4fv(prBill.u.uVP, false, VP);
  gl.uniform3fv(prBill.u.uCenter, R(st.pos));
  gl.uniform3fv(prBill.u.uRight, b.r);
  gl.uniform3fv(prBill.u.uUp, b.u);
  gl.uniform1f(prBill.u.uSize, st.r * 3.4);
  gl.uniform1f(prBill.u.uTime, time);
  gl.uniform3fv(prBill.u.uTint, st.tint || [1, 1, 1]);
  gl.bindVertexArray(billVAO.vao);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_INT, 0);
}
function render() {
  const dpr = Math.min(devicePixelRatio || 1, isTouch ? CFG.MOBILE_DPR : 2);
  const cw = Math.max(2, Math.floor(canvas.clientWidth * dpr)),
    ch = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const w = Math.max(2, Math.floor(cw * renderScale)),
    h = Math.max(2, Math.floor(ch * renderScale));
  resizeFB(w, h);
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
  const fov = player.fov;
  const tanY = Math.tan(fov / 2),
    tanX = (tanY * w) / h;
  const taaOn = !!(CFG.TAA && quality.taa);
  let jx = 0,
    jy = 0;
  if (taaOn) {
    const j = HALTON[frameIdx % 8];
    jx = ((j[0] - 0.5) * 2) / w;
    jy = ((j[1] - 0.5) * 2) / h;
  }
  frameIdx++;
  const P = persp(fov, w / h, 0.5, FAR);
  const V = viewFromBasis(b.r, b.u, b.f, ZERO);
  const VPu = m4mul(P, V);
  const Pj = new Float32Array(P);
  Pj[8] += jx;
  Pj[9] += jy;
  const VP = m4mul(Pj, V);
  const planes = frustumPlanes(VPu);
  const vis = (p, r) => sphereVisible(planes, R(p), r);
  const HS = { pos: STAR.pos, r: STAR.r, col: SUNCOL, tint: [1, 1, 1] };
  const secs = readySectors();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms);
  gl.viewport(0, 0, w, h);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  // sky
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prSky.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTex);
  gl.uniform1i(prSky.u.uCube, 0);
  setCam(prSky, b, tanX, tanY);
  gl.uniform2f(prSky.u.uJit, -jx, -jy);
  gl.uniform1f(prSky.u.uTime, time);
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
  // planets, moons, stars (home + streamed sectors, each lit by its own star)
  gl.useProgram(prPlanet.p);
  gl.uniformMatrix4fv(prPlanet.u.uVP, false, VP);
  gl.uniform3fv(prPlanet.u.uCam, ZERO);
  gl.uniform1f(prPlanet.u.uTime, time);
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
  const drawSystem = (list, st) => {
    gl.uniform3fv(prPlanet.u.uStar, R(st.pos));
    gl.uniform3fv(prPlanet.u.uSunCol, st.col);
    for (const p of list) {
      if (vis(p.pos, p.r * 1.1)) {
        visP.push([p, st]);
        drawPlanetBody(prPlanet, p, p.pos, p.r, p.q, p.type, p.pal, p.seed, quality.ultra && p === nearestP);
      }
      for (const m of p.moons) if (vis(m.pos, m.r)) drawPlanetBody(prPlanet, null, m.pos, m.r, m.q, 5, m.pal, m.seed, false);
    }
    if (vis(st.pos, st.r * 1.2))
      drawPlanetBody(
        prPlanet,
        null,
        st.pos,
        st.r,
        qid(),
        7,
        { c1: st.tint || [1, 1, 1], c2: [1, 1, 1], c3: [1, 1, 1], atmo: [0, 0, 0], ak: 0 },
        0,
        false,
      );
  };
  drawSystem(planets, HS);
  for (const s of secs) drawSystem(s.planets, s.star);
  RST.planets = visP.length;
  // opaque meshes (home system)
  setMeshCommon(prMesh, VP, b, HS);
  for (const wr of wrecks) {
    if (!vis(wr.pos, wr.rad)) continue;
    for (const it of wr.items) drawItem(prMesh, it);
    if (wr.big) drawItem(prMesh, { mesh: wr.artifact.mesh, mat: 8 });
  }
  if (vis(station.pos, station.rad)) for (const it of station.items) drawItem(prMesh, it);
  for (const it of debrisItems) drawItem(prMesh, it, 4);
  for (const s of secrets) if (s.items && vis(s.pos, 40)) for (const it of s.items) drawItem(prMesh, it);
  for (const l of landmarks) if (l.items && vis(l.pos, 80)) drawItem(prMesh, l.items[0]);
  for (const wh of whales) if (vis(wh.pos, wh.scale)) drawItem(prMesh, { mesh: wh.mesh, mat: 5 }, 2);
  // opaque meshes (streamed sectors)
  for (const s of secs) {
    setMeshCommon(prMesh, VP, b, s.star);
    for (const wr of s.wrecks) if (vis(wr.pos, wr.rad * 2.5)) for (const it of wr.items) drawItem(prMesh, it);
    if (s.beacon && s.beacon.items && vis(s.beacon.pos, 20)) for (const it of s.beacon.items) drawItem(prMesh, it);
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
  for (const [p, st] of visP) if (p.ring) drawRing(VP, p, st);
  gl.useProgram(prPlanet.p);
  for (const [p, st] of visP)
    if (p.type === 4) {
      gl.uniform3fv(prPlanet.u.uStar, R(st.pos));
      gl.uniform3fv(prPlanet.u.uSunCol, st.col);
      drawPlanetBody(prPlanet, null, p.pos, p.r * 1.02, p.q, 6, p.pal, p.seed, false);
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
    for (const [p, st] of visP)
      if (p.pal.ak > 0) {
        gl.uniform3fv(prAtmo.u.uStar, R(st.pos));
        gl.uniform3fv(prAtmo.u.uSunCol, st.col);
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
    for (const [p, st] of visP)
      if (p.pal.ak > 0) {
        gl.uniform3fv(prAtmoRim.u.uStar, R(st.pos));
        drawPlanetBody(prAtmoRim, null, p.pos, p.r * 1.07, p.q, 99, p.pal, p.seed, false);
      }
  }
  gl.disable(gl.CULL_FACE);
  for (const st of [HS, ...secs.map((s) => s.star)]) if (vis(st.pos, st.r * 3.5)) drawCorona(VP, b, st);
  setMeshCommon(prMesh, VP, b, HS);
  for (const l of landmarks) if (l.items && vis(l.pos, 2300)) drawItem(prMesh, l.items[1]);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  drawItem(prMesh, { mesh: MINN.mesh, mat: 4 }, 1);
  drawItem(prMesh, { mesh: medusae.mesh, mat: 6 }, 3);
  for (const s of secs) if (s.med && s.med.mesh && vis(s.med.c, 200)) drawItem(prMesh, { mesh: s.med.mesh, mat: 6 }, 3);
  if (METEOR.on) drawItem(prMesh, { mesh: METEOR.mesh, mat: 4 }, 0);
  gl.useProgram(prPt.p);
  gl.uniformMatrix4fv(prPt.u.uVP, false, VP);
  gl.uniform3fv(prPt.u.uCam, ZERO);
  gl.uniform1f(prPt.u.uTime, time);
  gl.uniform1f(prPt.u.uPR, h / (2 * tanY));
  const B = 90;
  gl.uniform3f(prPt.u.uCamMod, ((eyeW[0] % B) + B) % B, ((eyeW[1] % B) + B) % B, ((eyeW[2] % B) + B) % B);
  const pts = (mode, pt, anchor, n) => {
    gl.uniform1i(prPt.u.uMode, mode);
    gl.uniform3fv(prPt.u.uOff, anchor ? R(anchor) : ZERO);
    gl.bindVertexArray(pt.vao || pt);
    gl.drawArrays(gl.POINTS, 0, n);
  };
  pts(0, dust, null, dust.n);
  pts(1, sparks, [0, 0, 0], sparks.n);
  pts(2, MINN.glowVAO, [0, 0, 0], MINN.n);
  pts(3, trailPts, null, 48);
  if (DEB.n) pts(5, DEB.pts, null, DEB.n);
  if (starPts && starPts.n) pts(4, starPts, starPts.anchor, starPts.n);
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
      gl.useProgram(prVol.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fb.depth);
      gl.uniform1i(prVol.u.uDepth, 0);
      setCam(prVol, b, tanX, tanY);
      gl.uniform3fv(prVol.u.uStar, R(STAR.pos));
      gl.uniform1f(prVol.u.uTime, time);
      gl.uniform1i(prVol.u.uN, n);
      gl.uniform1i(prVol.u.uSteps, quality.vol.steps);
      gl.uniform4fv(prVol.u.uCloud, volData);
      gl.uniform4fv(prVol.u.uCloudCol, volCol);
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
    gl.useProgram(prTAA.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fb.scene);
    gl.uniform1i(prTAA.u.uCur, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fb.taat[1 - taaIdx]);
    gl.uniform1i(prTAA.u.uHist, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fb.depth);
    gl.uniform1i(prTAA.u.uDepth, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, fb.volt);
    gl.uniform1i(prTAA.u.uVol, 3);
    gl.uniformMatrix4fv(prTAA.u.uPrevVP, false, taaValid && prevVPu ? m4translate(prevVPu, dO) : VPu);
    setCam(prTAA, b, tanX, tanY);
    gl.uniform2f(prTAA.u.uRes, w, h);
    gl.uniform1f(prTAA.u.uBlend, taaValid ? quality.taaBlend : 0);
    gl.uniform1f(prTAA.u.uVolOn, volOn ? 1 : 0);
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
  const sc = m4v(VPu, [asr[0], asr[1], asr[2], 1]);
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
  if (CFG.GODRAYS && quality.rays && sv > 0) {
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
  // composite
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, cw, ch);
  gl.useProgram(prComp.p);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.uniform1i(prComp.u.uTex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, fb.bt1);
  gl.uniform1i(prComp.u.uBloom, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, rayTex);
  gl.uniform1i(prComp.u.uRays, 2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, fb.volt);
  gl.uniform1i(prComp.u.uVol, 3);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, fb.depth);
  gl.uniform1i(prComp.u.uDepth, 4);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTex);
  gl.uniform1i(prComp.u.uCube, 5);
  gl.uniform2fv(prComp.u.uSunUV, su);
  gl.uniform1f(prComp.u.uSunVis, sv);
  gl.uniform2f(prComp.u.uRes, cw, ch);
  gl.uniform1f(prComp.u.uAberr, player.boost && player.accel > 0 ? 1 : 0);
  gl.uniform1f(prComp.u.uTime, time);
  gl.uniform1f(prComp.u.uBloomK, bloomOn ? 0.9 : 0);
  gl.uniform1f(prComp.u.uRayK, rayK);
  gl.uniform1f(prComp.u.uVolOn, volOn && !taaOn ? 1 : 0);
  gl.uniform3fv(prComp.u.uTint, grade.tint);
  gl.uniform1f(prComp.u.uSat, grade.sat);
  gl.uniform1f(prComp.u.uLift, grade.lift);
  setCam(prComp, b, tanX, tanY);
  gl.uniformMatrix4fv(prComp.u.uVP, false, VPu);
  gl.uniform1f(prComp.u.uWarp, (WARP.k || 0) * (RM ? 0.45 : 1));
  gl.uniform1f(prComp.u.uFlare, (EV.flareK || 0) * 0.35 * (RM ? 0.3 : 1));
  gl.uniform1f(prComp.u.uCalm, RM ? 1 : 0); // reduce motion: softer warp, dimmer flare flash
  // black hole: screen position + lens radius for the composite shader
  let bhOn = 0;
  const BH = landmarks.find((l) => l.kind === 'blackhole');
  if (BH) {
    const rel = R(BH.pos);
    const d = len(rel);
    const c = m4v(VPu, [rel[0], rel[1], rel[2], 1]);
    if (c[3] > 0 && d < 9000) {
      const bu = [(c[0] / c[3]) * 0.5 + 0.5, (c[1] / c[3]) * 0.5 + 0.5];
      const z = Math.tan(Math.atan((14 * BH.Rs) / d)) / (2 * tanY);
      if (bu[0] > -z && bu[0] < 1 + z && bu[1] > -z && bu[1] < 1 + z) {
        bhOn = 1;
        gl.uniform4f(prComp.u.uBH, bu[0], bu[1], z, BH.seed);
        gl.uniform3fv(prComp.u.uBHpos, rel);
        gl.uniform3fv(prComp.u.uBHn, BH.n);
        gl.uniform3fv(prComp.u.uBHt, BH.t1);
        gl.uniform1f(prComp.u.uBHr, BH.Rs);
      }
    }
  }
  gl.uniform1f(prComp.u.uBHon, bhOn);
  gl.uniform1f(prComp.u.uBHq, quality.taa ? 1 : 0);
  fxUniforms(prComp, VPu, b, tanY); // Phase 5B: visor, scanner overlay, opening sequence
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.activeTexture(gl.TEXTURE0);
}
