/* =====================================================================
   HIGH-RESOLUTION CAPTURE (Phase 6B)
   Photo mode (CFG.PHOTO_SCALE, pause-menu PHOTO RESOLUTION) and the debug build's screenshot(scale) render the frame
   offscreen at scale x the canvas size instead of reading the canvas back:
     one pass  when the size fits the GPU limits and CFG.PHOTO_ONEPASS_PIXELS: the whole pipeline at that size
     tiles     otherwise: tiles of up to CFG.PHOTO_TILE px with a 64 px guard band (bloom reaches across tile edges),
               each rendered with a cropped projection and stitched in a 2D canvas. The composite's screen-space effects
               (vignette, lens flare, aberration, visor) use whole-image coordinates, so they line up; god rays need the
               whole sun mask and are left out of tiled photos.
   With TAA on, CFG.PHOTO_FRAMES frames are accumulated per pass / tile (the scene is frozen in photo mode, so nothing
   ghosts). If the GPU cannot allocate a size (incomplete framebuffer or OUT_OF_MEMORY), the next smaller plan is tried:
   tiles, then smaller tiles, and finally the normal canvas capture, with a message saying what was saved.
   ===================================================================== */
const CAP = { job: null, fallback: false };
const CAP_GUARD = 64;
function capPlan(scale, tile) {
  const bw = canvas.width,
    bh = canvas.height;
  let W = Math.round(bw * scale),
    H = Math.round(bh * scale);
  const k = Math.min(1, CFG.PHOTO_MAX_SIDE / Math.max(W, H));
  W = Math.max(2, Math.floor(W * k));
  H = Math.max(2, Math.floor(H * k));
  const T = Math.min(tile || CFG.PHOTO_TILE, GLMAX);
  const one = !tile && W <= GLMAX && H <= GLMAX && W * H <= CFG.PHOTO_ONEPASS_PIXELS;
  const tiles = [];
  if (one) tiles.push({ x: 0, y: 0, w: W, h: H, cx: 0, cy: 0, cw: W, ch: H });
  else {
    const core = T - 2 * CAP_GUARD;
    for (let y = 0; y < H; y += core)
      for (let x = 0; x < W; x += core) {
        const cw = Math.min(core, W - x),
          ch = Math.min(core, H - y);
        tiles.push({ x: x - CAP_GUARD, y: y - CAP_GUARD, w: cw + 2 * CAP_GUARD, h: ch + 2 * CAP_GUARD, cx: x, cy: y, cw, ch });
      }
  }
  return { W, H, T, one, tiles, scale };
}
// start a capture; done(result) gets { blob | dataURL, width, height, tiles, fallback } or { error }
function captureStart(scale, done, opt = {}) {
  if (CAP.job) return false;
  const job = {
    plan: capPlan(scale),
    scale,
    done,
    dataURL: !!opt.dataURL,
    frames: Math.max(1, opt.frames || (taaWanted() ? CFG.PHOTO_FRAMES : 1)),
    ti: 0,
    f: 0,
    out: null,
    ctx: null,
    fbo: null,
    tex: null,
    texW: 0,
    texH: 0,
    tries: 0,
    t0: performance.now(),
    fi0: 0, // every pass / tile replays the same TAA jitter sequence from its start: tiles accumulate exactly like one pass
    fiSave: frameIdx, // the game's frame counter, restored when the capture ends
  };
  CAP.job = job;
  return true;
}
function capTarget(job, w, h) {
  if (job.texW === w && job.texH === h) return true;
  if (!job.fbo) {
    job.fbo = gl.createFramebuffer();
    job.tex = gl.createTexture();
  }
  tex2d(job.tex, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, job.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, job.tex, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  job.texW = w;
  job.texH = h;
  return ok;
}
function capFree(job) {
  if (job.fbo) {
    gl.deleteFramebuffer(job.fbo);
    gl.deleteTexture(job.tex);
  }
  job.fbo = job.tex = null;
  job.texW = job.texH = 0;
}
// the plan failed at this size: tiles, then smaller tiles, then give up (normal canvas capture)
function capShrink(job) {
  const p = job.plan;
  job.tries++;
  const nextT = p.one ? Math.min(CFG.PHOTO_TILE, GLMAX) : Math.floor(p.T / 2);
  if (nextT < 512 || job.tries > 4) return false;
  job.plan = capPlan(job.scale, nextT);
  job.ti = 0;
  job.f = 0;
  job.out = null;
  job.ctx = null;
  capFree(job);
  return true;
}
// one capture frame (the main loop calls this instead of render() while a capture runs). Returns true when it rendered.
function captureStep() {
  const job = CAP.job;
  if (!job) return false;
  const p = job.plan;
  const tl0 = p.tiles[job.ti];
  FB_QUIET = true;
  let ok = true;
  try {
    while (gl.getError() !== gl.NO_ERROR); // start clean, so an allocation failure below is ours
    if (job.f === 0) {
      taaValid = false; // every pass / tile starts its own history
      frameIdx = job.fi0;
    }
    ok = capTarget(job, tl0.w, tl0.h) && render({ W: p.W, H: p.H, x: tl0.x, y: tl0.y, w: tl0.w, h: tl0.h, fbo: job.fbo });
    if (ok && gl.getError() === gl.OUT_OF_MEMORY) ok = false;
  } catch (e) {
    ok = false;
  }
  FB_QUIET = false;
  if (!ok) {
    if (!capShrink(job)) capFinish(job, { error: 'alloc' });
    return true;
  }
  if (++job.f < job.frames) return true;
  // read this pass / tile back (core part only) into the stitched image
  if (!job.out) {
    job.out = document.createElement('canvas');
    job.out.width = p.W;
    job.out.height = p.H;
    job.ctx = job.out.getContext('2d');
    if (!job.ctx) {
      capFinish(job, { error: 'canvas' });
      return true;
    }
  }
  const px = new Uint8Array(tl0.cw * tl0.ch * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, job.fbo);
  gl.readPixels(tl0.cx - tl0.x, tl0.cy - tl0.y, tl0.cw, tl0.ch, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const img = job.ctx.createImageData(tl0.cw, tl0.ch);
  const row = tl0.cw * 4;
  for (let y = 0; y < tl0.ch; y++) img.data.set(px.subarray((tl0.ch - 1 - y) * row, (tl0.ch - y) * row), y * row); // GL rows are bottom-up
  job.ctx.putImageData(img, tl0.cx, p.H - tl0.cy - tl0.ch);
  job.f = 0;
  if (++job.ti < p.tiles.length) return true;
  capFinish(job, null);
  return true;
}
function capFinish(job, err) {
  CAP.job = null;
  capFree(job);
  taaValid = false;
  frameIdx = job.fiSave;
  const p = job.plan;
  const res = {
    width: p.W,
    height: p.H,
    tiles: p.one ? 1 : p.tiles.length,
    frames: job.frames,
    ms: Math.round(performance.now() - job.t0),
  };
  if (err) {
    job.done(Object.assign(res, { error: err.error }));
    return;
  }
  if (job.dataURL) job.done(Object.assign(res, { dataURL: job.out.toDataURL('image/png') }));
  else
    job.out.toBlob((blob) => {
      job.done(Object.assign(res, blob ? { blob } : { error: 'encode' }));
    }, 'image/png');
}
// debug build / tests: the whole capture at once (blocks until done)
function captureSync(scale, frames) {
  let result = null;
  if (!captureStart(scale, (r) => (result = r), { dataURL: true, frames })) return { error: 'busy' };
  let guard = 0;
  while (CAP.job && guard++ < 100000) captureStep();
  return result;
}
// photo mode: HD capture, or the old canvas capture at scale 1 (and as the last fallback)
function capturePhoto() {
  const scale = CFG.PHOTO_SCALE;
  if (!(scale > 1)) return capturePNG();
  if (CAP.job) {
    toast(tl('toast.capBusy'));
    return;
  }
  const p = capPlan(scale);
  hint(tl('photo.capturing', { w: p.W, h: p.H }), 60000);
  captureStart(scale, (r) => {
    hint('', 1);
    if (r.error) {
      toast(tl('toast.capSmaller', { w: p.W, h: p.H, w2: canvas.width, h2: canvas.height }));
      CAP.fallback = true; // the old canvas capture on the next frame
      PHOTO.capture = true;
      return;
    }
    if (r.tiles > 1) toast(tl('toast.capTiled', { w: r.width, h: r.height, n: r.tiles }));
    saveBlob(r.blob, 'voidborne-' + stamp() + '-' + r.width + 'x' + r.height + '.png', 'image');
  });
}
