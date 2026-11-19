/* =====================================================================
   'ULTRA' PRESET RESOURCES (Phase 6B)
   With the 'ultra' preset the pieces below are prepared a little per frame (CFG.ULTRA_BUDGET_MS of main-thread time and
   at most one GPU-heavy bake strip per frame; everything at once when the URL has a test flag, so screenshots and the
   benchmark see the finished preset) and render() switches to them once they
   are ready. Until then 'ultra' looks like 'high' at the higher render scale. low / medium / high never touch any of
   this: their programs, meshes and textures are exactly the ones they always used.
     programs  '#define ULTRA' variants of the sky, mesh, planet and point shaders (KHR_parallel_shader_compile if present)
     textures  hull panel atlas + planet detail noise (tileable, mipmapped, anisotropic) and a bigger mipmapped sky cubemap
     meshes    one Phong-tessellation level for hulls, the station, whales and medusae (collision keeps its own data)
     planets   an ico-7 sphere (4x the triangles of the old densest LOD) for a planet or moon that fills the view
   Per-item switches: CFG.ULTRA_STARS, ULTRA_HULLS, ULTRA_CREATURES, ULTRA_PLANETS, ULTRA_TEXTURES, ULTRA_SKY, ULTRA_ANISO.
   ===================================================================== */
const ULTRA = {
  ready: false, // every enabled item is prepared (render() uses the variants only then)
  failed: false, // a variant did not compile: stay on the 'high' look
  q: null, // preparation steps still to run
  pr: null, // { sky, mesh, planet, pt } (null entries: that item is switched off)
  panel: null,
  detail: null,
  texS: 0,
  cube: null,
  cubeS: 0,
  sph7: null,
  fbo: null,
  tessQ: [], // meshes waiting for their tessellated VAO
  tessSet: new Set(), // meshes that own one (so a context loss or freeMesh can drop it)
  mbCache: new Map(), // MB -> { vbo, ibo, n, refs }: tessellated geometry shared by meshes built from the same MB
  ext: null, // { par, aniso, anisoMax }
  announced: false,
  t0: 0,
};
const ultraSrc = (src) => src.replace('#version 300 es\n', '#version 300 es\n#define ULTRA 1\n');
// render() asks this every frame
function ultraOn() {
  return !!(quality.ultraFx && ULTRA.ready && !ULTRA.failed);
}
function ultraExt() {
  if (!ULTRA.ext) {
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    ULTRA.ext = {
      par: gl.getExtension('KHR_parallel_shader_compile'),
      aniso: an,
      anisoMax: an ? gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0,
    };
  }
  return ULTRA.ext;
}
function ultraAniso(target) {
  const e = ultraExt();
  if (e.aniso && CFG.ULTRA_ANISO > 0) gl.texParameterf(target, e.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(CFG.ULTRA_ANISO, e.anisoMax));
}
const pot = (n) => 2 ** Math.floor(Math.log2(Math.max(1, n)));
/* ---- program variants: link in the background, finish when the driver reports completion ---- */
function ultraLinkStart(vs, fs, name) {
  const pr = { vs, fs, name, p: null, u: {}, _p: gl.createProgram(), _sh: [] };
  for (const [t, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const sh = gl.createShader(t);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(pr._p, sh);
    pr._sh.push(sh);
  }
  gl.linkProgram(pr._p);
  return pr;
}
function ultraLinkDone(pr) {
  const par = ultraExt().par;
  if (par && !gl.getProgramParameter(pr._p, par.COMPLETION_STATUS_KHR)) return false;
  if (!gl.getProgramParameter(pr._p, gl.LINK_STATUS)) {
    let log = gl.getProgramInfoLog(pr._p) || '';
    for (const sh of pr._sh) if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) log += '\n' + gl.getShaderInfoLog(sh);
    throw new Error(pr.name + ': ' + log);
  }
  pr.p = pr._p;
  pr.u = progUniforms(pr.p);
  delete pr._p;
  delete pr._sh;
  GLR.progs.push(pr); // relinked by rebuildGL() after a context loss, like every other program
  return true;
}
/* ---- baking: one scissored strip per call into a 2D texture or a cube face ---- */
function ultraStrip(pr, target, tex, S, y0, rows, setU) {
  if (!ULTRA.fbo) ULTRA.fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, ULTRA.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, tex, 0);
  gl.viewport(0, 0, S, S);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, y0, S, rows);
  gl.useProgram(pr.p);
  setU(pr);
  gl.bindVertexArray(emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function ultraTex2D(S) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, Math.log2(S) + 1, gl.RGBA8, S, S);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
}
function ultraMip2D(t) {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  ultraAniso(gl.TEXTURE_2D);
}
/* ---- the step list: every entry returns true when finished; gpu: true = at most one of those per frame ---- */
function ultraSteps() {
  const steps = [];
  const wantTex = CFG.ULTRA_TEXTURES && (CFG.ULTRA_HULLS || CFG.ULTRA_PLANETS);
  if (!ULTRA.pr) {
    let started = null;
    steps.push({
      run() {
        if (!started) {
          const mk = (on, vs, fs, name) => (on ? ultraLinkStart(ultraSrc(vs), ultraSrc(fs), name) : null);
          started = {
            sky: mk(CFG.ULTRA_STARS, FS_VS, SKY_FS, 'sky-ultra'),
            mesh: mk(CFG.ULTRA_HULLS || CFG.ULTRA_CREATURES, MESH_VS, MESH_FS(true), 'mesh-ultra'),
            planet: mk(CFG.ULTRA_PLANETS, PLANET_VS, PLANET_FS, 'planet-ultra'),
            pt: mk(CFG.ULTRA_STARS, PT_VS, PT_FS, 'points-ultra'),
            panelBake: wantTex && CFG.ULTRA_HULLS ? ultraLinkStart(FS_VS, PANEL_BAKE_FS, 'panel-bake') : null,
            detailBake: wantTex && CFG.ULTRA_PLANETS ? ultraLinkStart(FS_VS, DETAIL_BAKE_FS, 'detail-bake') : null,
          };
          return false;
        }
        for (const k in started) if (started[k] && started[k]._p && !ultraLinkDone(started[k])) return false;
        if (started.mesh) started.mesh.ultra = true; // drawItem(): use the tessellated geometry with this program
        ULTRA.pr = started;
        return true;
      },
    });
  }
  if (wantTex) {
    const S = pot(Math.min(CFG.ULTRA_TEX_SIZE, gl.getParameter(gl.MAX_TEXTURE_SIZE)));
    const rows = Math.max(16, Math.min(S, 256));
    for (const [key, prk] of [
      ['panel', 'panelBake'],
      ['detail', 'detailBake'],
    ]) {
      if (ULTRA[key] || (key === 'panel' && !CFG.ULTRA_HULLS) || (key === 'detail' && !CFG.ULTRA_PLANETS)) continue;
      let tex = null,
        y = 0;
      steps.push({
        gpu: true,
        run() {
          const pr = ULTRA.pr[prk];
          if (!tex) tex = ultraTex2D(S);
          ultraStrip(pr, gl.TEXTURE_2D, tex, S, y, rows, (p) => gl.uniform1f(p.u.uTexel, 1 / S));
          y += rows;
          if (y < S) return false;
          ultraMip2D(tex);
          ULTRA[key] = tex;
          ULTRA.texS = S;
          return true;
        },
      });
    }
  }
  if (CFG.ULTRA_SKY > 0 && !ULTRA.cube) {
    const S = pot(Math.min(CFG.ULTRA_SKY, gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE)));
    if (S > QUAL.ultra.sky) {
      const rows = Math.max(256, S >> 2);
      let tex = null,
        face = 0,
        y = 0;
      steps.push({
        gpu: true,
        run() {
          if (!tex) {
            tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
            gl.texStorage2D(gl.TEXTURE_CUBE_MAP, Math.log2(S) + 1, gl.RGBA8, S, S);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          }
          ultraStrip(prBake, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, tex, S, y, rows, (p) => {
            gl.uniform3fv(p.u.uSeed, skySeed);
            gl.uniform3fv(p.u.uBand, bandN);
            gl.uniform1f(p.u.uNeb, CFG.NEBULA_INTENSITY);
            gl.uniform3fv(p.u.uGal, galDirs);
            gl.uniform1fv(p.u.uGalSize, galSizes);
            gl.uniform1i(p.u.uFace, face);
          });
          y += rows;
          if (y >= S) {
            y = 0;
            face++;
          }
          if (face < 6) return false;
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
          gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
          gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          ultraAniso(gl.TEXTURE_CUBE_MAP);
          ULTRA.cube = tex;
          ULTRA.cubeS = S;
          return true;
        },
      });
    }
  }
  if (CFG.ULTRA_PLANETS && !ULTRA.sph7) {
    // ico-7 from the ico-6 LOD: split every triangle in four, new vertices pushed out onto the unit sphere (a few chunks per frame)
    let st = null;
    steps.push({
      run() {
        if (!st) st = { pos: Array.from(sphUltra.pos), idx: [], edge: new Map(), t: 0 };
        const src = sphUltra.idx,
          P = st.pos,
          nv0 = sphUltra.pos.length / 3;
        const mid = (a, b) => {
          const k = a < b ? a * nv0 * 4 + b : b * nv0 * 4 + a;
          let m = st.edge.get(k);
          if (m === undefined) {
            let x = P[a * 3] + P[b * 3],
              y = P[a * 3 + 1] + P[b * 3 + 1],
              z = P[a * 3 + 2] + P[b * 3 + 2];
            const l = Math.hypot(x, y, z) || 1;
            m = P.length / 3;
            P.push(x / l, y / l, z / l);
            st.edge.set(k, m);
          }
          return m;
        };
        const end = Math.min(src.length, st.t + 3 * 12000);
        for (; st.t < end; st.t += 3) {
          const a = src[st.t],
            b = src[st.t + 1],
            c = src[st.t + 2];
          const ab = mid(a, b),
            bc = mid(b, c),
            ca = mid(c, a);
          st.idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
        }
        if (st.t < src.length) return false;
        ULTRA.sph7 = makeSimple(st.pos, st.idx);
        st = null;
        return true;
      },
    });
  }
  return steps;
}
/* ---- tessellation: one Phong-tessellation level (Boubekeur & Alexa 2008). A new vertex on every edge, pulled towards the
   tangent planes of the two end vertices, so curved hull sections get rounder silhouettes while flat faces (which have
   their own unshared vertices) stay exactly flat. Shared edges give shared vertices: no cracks. ---- */
function phongTess(vf, idx, alpha = 0.75) {
  const nv = vf.length / 9;
  const out = Array.from(vf);
  const I = [];
  const edge = new Map();
  const mid = (a, b) => {
    const k = a < b ? a * nv + b : b * nv + a;
    let m = edge.get(k);
    if (m !== undefined) return m;
    const A = a * 9,
      B = b * 9;
    const px = (vf[A] + vf[B]) * 0.5,
      py = (vf[A + 1] + vf[B + 1]) * 0.5,
      pz = (vf[A + 2] + vf[B + 2]) * 0.5;
    let qx = 0,
      qy = 0,
      qz = 0;
    for (const V of [A, B]) {
      const d = (px - vf[V]) * vf[V + 3] + (py - vf[V + 1]) * vf[V + 4] + (pz - vf[V + 2]) * vf[V + 5];
      qx += 0.5 * (px - d * vf[V + 3]);
      qy += 0.5 * (py - d * vf[V + 4]);
      qz += 0.5 * (pz - d * vf[V + 5]);
    }
    let nx = vf[A + 3] + vf[B + 3],
      ny = vf[A + 4] + vf[B + 4],
      nz = vf[A + 5] + vf[B + 5];
    const nl = Math.hypot(nx, ny, nz) || 1;
    m = out.length / 9;
    out.push(
      px + (qx - px) * alpha,
      py + (qy - py) * alpha,
      pz + (qz - pz) * alpha,
      nx / nl,
      ny / nl,
      nz / nl,
      (vf[A + 6] + vf[B + 6]) * 0.5,
      (vf[A + 7] + vf[B + 7]) * 0.5,
      (vf[A + 8] + vf[B + 8]) * 0.5,
    );
    edge.set(k, m);
    return m;
  };
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t],
      b = idx[t + 1],
      c = idx[t + 2];
    const ab = mid(a, b),
      bc = mid(b, c),
      ca = mid(c, a);
    I.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return { vf: new Float32Array(out), idx: new Uint32Array(I) };
}
// which draws get the tessellated geometry: hull material (not spinning debris), whales, medusae
function ultraTessWanted(it, anim) {
  const a = anim !== undefined ? anim : it.anim || 0;
  if (it.mat === 0) return CFG.ULTRA_HULLS && a !== 4;
  if (it.mat === 5 || it.mat === 6) return CFG.ULTRA_CREATURES;
  return false;
}
// drawItem() asks for the mesh to draw: the tessellated VAO when there is one (queued otherwise)
function ultraMeshOf(m, it, anim) {
  if (m.ux) return m.ux;
  if (!m.uxQ && ultraTessWanted(it, anim) && m.mb && m.mb.vf && m.mb.vf.length / 9 < 400000) {
    m.uxQ = true;
    ULTRA.tessQ.push(m);
  }
  return null;
}
function ultraTessOne(m) {
  m.uxQ = false;
  if (!m.vao || m.ux) return; // freed meanwhile, or done
  let c = ULTRA.mbCache.get(m.mb);
  if (!c) {
    const t = phongTess(m.mb.vf, m.mb.if);
    c = { vbo: gl.createBuffer(), ibo: gl.createBuffer(), n: t.idx.length, refs: 0 };
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, t.vf, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, t.idx, gl.STATIC_DRAW);
    ULTRA.mbCache.set(m.mb, c);
  }
  c.refs++;
  m.ux = { vao: meshVAO(m, c.vbo, c.ibo), n: c.n, c };
  ULTRA.tessSet.add(m);
}
// freeMesh() calls this for a mesh that owns a tessellated VAO
function ultraDropMesh(m) {
  const u = m.ux;
  m.ux = null;
  ULTRA.tessSet.delete(m);
  if (!u) return;
  try {
    gl.deleteVertexArray(u.vao);
    if (--u.c.refs <= 0) {
      gl.deleteBuffer(u.c.vbo);
      gl.deleteBuffer(u.c.ibo);
      ULTRA.mbCache.delete(m.mb);
    }
  } catch (e) {}
}
/* ---- per frame (main loop, before render) ---- */
function ultraTick() {
  if (!quality.ultraFx) {
    if (ULTRA.cube) {
      gl.deleteTexture(ULTRA.cube); // 2048 cube with mips = ~134 MB: give it back while another preset is active
      ULTRA.cube = null;
      ULTRA.ready = false;
      ULTRA.q = null;
    }
    ULTRA.tessQ.length = 0;
    return;
  }
  if (ULTRA.failed) return;
  const t0 = performance.now();
  const sync = DET.any; // test runs: everything in this frame
  const budget = sync ? Infinity : CFG.ULTRA_BUDGET_MS;
  try {
    if (!ULTRA.ready) {
      if (!ULTRA.q) {
        ULTRA.q = ultraSteps();
        ULTRA.t0 = t0;
        if (ULTRA.q.length && !DET.any) toast(tl('toast.ultraPrep'));
      }
      let gpuDone = false;
      while (ULTRA.q.length && performance.now() - t0 < budget) {
        const s = ULTRA.q[0];
        if (s.gpu && gpuDone && !sync) break;
        const fin = s.run();
        if (s.gpu) gpuDone = true;
        if (fin) ULTRA.q.shift();
        else if (!s.gpu && !sync) break; // waiting (parallel compile) or chunked CPU work: continue next frame
      }
      if (!ULTRA.q.length) {
        ULTRA.ready = true;
        ULTRA.q = null;
        ULTRA.readyMs = Math.round(performance.now() - ULTRA.t0);
        if (!DET.any && !ULTRA.announced) toast(tl('toast.ultraReady'));
        ULTRA.announced = true;
      }
    }
    while (ULTRA.ready && ULTRA.tessQ.length && performance.now() - t0 < budget) ultraTessOne(ULTRA.tessQ.shift());
  } catch (e) {
    ULTRA.failed = true;
    console.warn('ultra preset unavailable, keeping the high look: ' + (e.message || e));
    toast('ULTRA: ' + String(e.message || e).slice(0, 80));
  }
}
// render(): textures for the variants (unit 8 is not used by anything else)
function ultraBind(pr, which) {
  const tex = which === 'panel' ? ULTRA.panel : ULTRA.detail;
  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.activeTexture(gl.TEXTURE0);
  if (which === 'panel') {
    gl.uniform1i(pr.u.uPanel, 8);
    gl.uniform1f(pr.u.uPanelOn, CFG.ULTRA_HULLS && tex ? 1 : 0);
    gl.uniform1f(pr.u.uGGX, CFG.ULTRA_HULLS ? 1 : 0);
    gl.uniform1f(pr.u.uSparkleAA, CFG.ULTRA_CREATURES ? 1 : 0);
  } else {
    gl.uniform1i(pr.u.uDetail, 8);
    gl.uniform1f(pr.u.uDetOn, tex ? 1 : 0);
  }
}
// after a context loss: GPU objects are gone (programs and the ico-7 sphere are rebuilt by rebuildGL, the rest re-prepared)
function ultraReset() {
  for (const m of ULTRA.tessSet) m.ux = null;
  for (const m of ULTRA.tessQ) m.uxQ = false;
  ULTRA.tessSet.clear();
  ULTRA.tessQ.length = 0;
  ULTRA.mbCache.clear();
  ULTRA.panel = ULTRA.detail = ULTRA.cube = ULTRA.fbo = null;
  ULTRA.ext = null; // extensions have to be enabled again on the restored context
  if (ULTRA.pr) {
    ULTRA.pr.panelBake = ULTRA.pr.panelBake && ULTRA.pr.panelBake.p ? ULTRA.pr.panelBake : null;
    ULTRA.pr.detailBake = ULTRA.pr.detailBake && ULTRA.pr.detailBake.p ? ULTRA.pr.detailBake : null;
  }
  ULTRA.ready = false;
  ULTRA.q = null;
}
