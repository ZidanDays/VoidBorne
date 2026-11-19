/* =====================================================================
   GL HELPERS
   ===================================================================== */
// Every GL object is created through these helpers and registered in GLR, so rebuildGL() can recreate
// all of them in place after a context loss. The returned objects are mutated, never replaced, so
// references held by the scene stay valid.
const GLR = { progs: [], meshes: [], simples: [], points: [] };
function linkProgram(pr) {
  const p = gl.createProgram();
  for (const [t, src] of [
    [gl.VERTEX_SHADER, pr.vs],
    [gl.FRAGMENT_SHADER, pr.fs],
  ]) {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) showErr(pr.name + ' shader: ' + gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) showErr(pr.name + ' link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const inf = gl.getActiveUniform(p, i);
    u[inf.name.replace('[0]', '')] = gl.getUniformLocation(p, inf.name);
  }
  pr.p = p;
  pr.u = u;
  return pr;
}
function compile(vs, fs, name) {
  const pr = { vs, fs, name, p: null, u: {} };
  linkProgram(pr);
  GLR.progs.push(pr);
  return pr;
}
const INST = 12,
  INSTA = 10;
function uploadMesh(m) {
  const mb = m.mb;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, mb.vf, gl.STATIC_DRAW);
  for (let k = 0; k < 3; k++) {
    gl.enableVertexAttribArray(k);
    gl.vertexAttribPointer(k, 3, gl.FLOAT, false, 36, k * 12);
  }
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mb.if, gl.STATIC_DRAW);
  const ivbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, ivbo);
  gl.bufferData(gl.ARRAY_BUFFER, m.inst, m.dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  const lay =
    m.layout === 'q'
      ? [
          [3, 3, 0],
          [4, 4, 12],
          [5, 1, 28],
          [6, 3, 32],
          [7, 1, 44],
        ]
      : [
          [3, 4, 0],
          [4, 4, 16],
          [5, 2, 32],
        ];
  const stride = (m.layout === 'q' ? INST : INSTA) * 4;
  for (const [loc, sz, off] of lay) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, sz, gl.FLOAT, false, stride, off);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);
  m.vao = vao;
  m.ivbo = ivbo;
  m.vbo = vbo;
  m.ibo = ibo;
}
function makeMesh(mb, inst, layout = 'q', dynamic = false) {
  if (!mb.vf) {
    mb.vf = new Float32Array(mb.v);
    mb.if = new Uint32Array(mb.i);
    mb.v = null;
    mb.i = null;
  }
  // anchor: float64 world position the instance positions are relative to (floating origin; see render)
  const m = {
    mb,
    inst,
    layout,
    dynamic,
    vao: null,
    ivbo: null,
    n: mb.if.length,
    count: inst.length / (layout === 'q' ? INST : INSTA),
    r: mb.r || 1,
    anchor: inst.anchor || [0, 0, 0],
  };
  uploadMesh(m);
  GLR.meshes.push(m);
  return m;
}
function freeMesh(m) {
  if (!m) return;
  try {
    gl.deleteVertexArray(m.vao);
    gl.deleteBuffer(m.vbo);
    gl.deleteBuffer(m.ibo);
    gl.deleteBuffer(m.ivbo);
  } catch (e) {}
  const i = GLR.meshes.indexOf(m);
  if (i >= 0) GLR.meshes.splice(i, 1);
  m.vao = null;
}
function uploadSimple(sm) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, sm.pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, sm.comps, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sm.idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  sm.vao = vao;
}
function makeSimple(pos, idx, comps = 3) {
  const sm = { pos: new Float32Array(pos), idx: new Uint32Array(idx), comps, vao: null, n: idx.length };
  uploadSimple(sm);
  GLR.simples.push(sm);
  return sm;
}
function instQ(arr, k, p, q, s, c, ph) {
  const o = k * INST;
  arr[o] = p[0];
  arr[o + 1] = p[1];
  arr[o + 2] = p[2];
  arr[o + 3] = q[0];
  arr[o + 4] = q[1];
  arr[o + 5] = q[2];
  arr[o + 6] = q[3];
  arr[o + 7] = s;
  arr[o + 8] = c[0];
  arr[o + 9] = c[1];
  arr[o + 10] = c[2];
  arr[o + 11] = ph;
}
// single instance: the float64 position becomes the mesh anchor; the instance itself sits at the anchor (0,0,0)
function single(p, q, s, c, ph = 0) {
  const a = new Float32Array(INST);
  instQ(a, 0, [0, 0, 0], q, s, c, ph);
  a.anchor = [p[0], p[1], p[2]];
  return a;
}
