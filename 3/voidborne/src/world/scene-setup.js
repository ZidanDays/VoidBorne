/* =====================================================================
   SCENE
   ===================================================================== */
const SUNCOL = [1.0, 0.93, 0.8];
const prSky = compile(FS_VS, SKY_FS, 'sky'),
  prBake = compile(FS_VS, SKYBAKE_FS, 'skybake'),
  prMesh = compile(MESH_VS, MESH_FS(true), 'mesh'),
  prAst = compile(AST_VS, MESH_FS(false), 'asteroid'),
  prPlanet = compile(PLANET_VS, PLANET_FS, 'planet'),
  prAtmo = compile(PLANET_VS, ATMO_FS, 'atmo'),
  prAtmoRim = compile(PLANET_VS, ATMO_RIM_FS, 'atmo-rim'),
  prVol = compile(FS_VS, VOL_FS, 'volumetrics'),
  prTAA = compile(FS_VS, TAA_FS, 'taa'),
  prMask = compile(FS_VS, MASK_FS, 'raymask'),
  prRays = compile(FS_VS, RAYS_FS, 'godrays'),
  prRing = compile(RING_VS, RING_FS, 'ring'),
  prBill = compile(BILL_VS, CORONA_FS, 'corona'),
  prPt = compile(PT_VS, PT_FS, 'points'),
  prBright = compile(FS_VS, BRIGHT_FS, 'bright'),
  prBlur = compile(FS_VS, BLUR_FS, 'blur'),
  prComp = compile(FS_VS, COMP_FS, 'comp');
let emptyVAO = gl.createVertexArray();
function q2m3(q) {
  const x = q[0],
    y = q[1],
    z = q[2],
    w = q[3];
  return new Float32Array([
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
  ]);
}
// per-quality switches for the Phase 2 features: vol = {steps, resolution divisor} or null, rays = {n samples, passes},
// taa = temporal AA on/off (+ history blend), scatter = raymarched atmosphere, ultra = dense mesh for the nearest planet, cl = creature lights
const QUAL = {
  low: {
    scale: 0.7,
    sky: 512,
    bloom: false,
    vol: null,
    rays: null,
    taa: false,
    taaBlend: 0,
    scatter: false,
    ultra: false,
    cl: 4,
    hrtf: false,
  },
  medium: {
    scale: 0.85,
    sky: 768,
    bloom: true,
    vol: { steps: 16, div: 3 },
    rays: { n: 16, passes: 1 },
    taa: true,
    taaBlend: 0.85,
    scatter: true,
    ultra: false,
    cl: 8,
    hrtf: true,
  },
  high: {
    scale: 1.0,
    sky: 1024,
    bloom: true,
    vol: { steps: 28, div: 2 },
    rays: { n: 32, passes: 2 },
    taa: true,
    taaBlend: 0.9,
    scatter: true,
    ultra: true,
    cl: 8,
    hrtf: true,
  },
};
let quality = QUAL[CFG.QUALITY] || QUAL.high;
/* ---- sky bake ---- */
const skySeed = [rr(0, 50), rr(0, 50), rr(0, 50)],
  bandN = rdir();
const galDirs = [],
  galSizes = [];
for (let i = 0; i < 6; i++) {
  galDirs.push(...rdir());
  galSizes.push(rr(0.012, 0.03));
}
let cubeTex = null;
function bakeSky() {
  const S = quality.sky;
  if (!cubeTex) cubeTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubeTex);
  for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA8, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, S, S);
  gl.disable(gl.DEPTH_TEST);
  gl.useProgram(prBake.p);
  gl.uniform3fv(prBake.u.uSeed, skySeed);
  gl.uniform3fv(prBake.u.uBand, bandN);
  gl.uniform1f(prBake.u.uNeb, CFG.NEBULA_INTENSITY);
  gl.uniform3fv(prBake.u.uGal, galDirs);
  gl.uniform1fv(prBake.u.uGalSize, galSizes);
  gl.bindVertexArray(emptyVAO);
  for (let i = 0; i < 6; i++) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cubeTex, 0);
    gl.uniform1i(prBake.u.uFace, i);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);
}
bakeSky();
/* ---- sphere LODs ---- */
const sphUltra = (() => {
    const s = icoPositions(6);
    return makeSimple(s.pos, s.idx);
  })(),
  sphHi = (() => {
    const s = icoPositions(5);
    return makeSimple(s.pos, s.idx);
  })(),
  sphMid = (() => {
    const s = icoPositions(3);
    return makeSimple(s.pos, s.idx);
  })(),
  sphLo = (() => {
    const s = icoPositions(2);
    return makeSimple(s.pos, s.idx);
  })();
const billVAO = makeSimple([-1, -1, 1, -1, 1, 1, -1, 1], [0, 1, 2, 0, 2, 3], 2);
