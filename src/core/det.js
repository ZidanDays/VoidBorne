/* =====================================================================
   TEST MODES (Phase 6A). All of them are OFF unless the URL asks for them.
   ?det=1      deterministic run: every frame advances exactly CFG.DET_DT, Math.random is a seeded stream, Date.now is
               a fixed clock that advances with the frames, saved settings/progress are neither read nor written, the
               render scale stays at the preset's scale (no dynamic resolution), sectors are generated on the main
               thread and handed over at the start of a frame, and streamed GPU uploads are not time-budgeted.
               Same build + same URL + same renderer => the same frames (tests/shots.mjs relies on this).
   ?seeded=1   only the seeded Math.random (real time steps): used by the benchmark
   ?noscale=1  render scale fixed at the preset's scale (no dynamic resolution)
   ?nostore=1  ignore and do not write localStorage (fresh start every load)
   ?manual=1   no frame runs on its own: frames are advanced only by the debug build's test API, so a test controls the
               exact number of simulated frames from the very first one (in a release build the page stays frozen)
   ?cfg=K:v,…  (Phase 6B) overrides existing CFG values for A/B measurements, e.g. ?cfg=ULTRA_HULLS:false,SS_MAX:1.25
               (numbers, true/false or text; unknown keys and list values are ignored). Any of these flags also keeps the
               first-run auto-quality probe from running.
   The debug build (node build.mjs --debug) adds a test API on top of this; the release build has none.
   ===================================================================== */
const DET = (() => {
  let q;
  try {
    q = new URLSearchParams(location.search);
  } catch (e) {
    q = new URLSearchParams('');
  }
  const on = q.get('det') === '1';
  return {
    on,
    seeded: on || q.get('seeded') === '1',
    noScale: on || q.get('noscale') === '1',
    noStore: on || q.get('nostore') === '1',
    manual: q.get('manual') === '1', // true: the requestAnimationFrame loop idles and frames are advanced by the debug build's test API
    frame: 0, // frames simulated since load
    clock: 0, // s of simulated time (?det=1 clock for Date.now)
    cpuMs: 0, // main-thread time of the last frame (read by the benchmark)
    hooks: [], // functions (dt, now) run at the start of every frame (debug build: benchmark camera path)
    cfg: {}, // ?cfg= overrides that were applied (Phase 6B)
    any: on || ['seeded', 'noscale', 'nostore', 'manual', 'cfg', 'bench'].some((k) => q.has(k)), // any test flag in the URL
  };
})();
{
  let raw = null;
  try {
    raw = new URLSearchParams(location.search).get('cfg');
  } catch (e) {}
  if (raw)
    for (const kv of raw.split(',')) {
      const i = kv.indexOf(':');
      if (i < 1) continue;
      const k = kv.slice(0, i).trim(),
        v = kv.slice(i + 1).trim();
      if (!(k in CFG) || Array.isArray(CFG[k])) continue;
      CFG[k] = v === 'true' ? true : v === 'false' ? false : v !== '' && !isNaN(+v) ? +v : v;
      DET.cfg[k] = CFG[k];
    }
}
if (DET.on) {
  CFG.USE_WORKER = false; // worker results arrive at timing-dependent frames; the main-thread path is handed over at a fixed point
  CFG.UPLOAD_BUDGET_MS = Infinity; // all queued uploads in the frame they become available
}
if (DET.noStore) CFG.SAVE = false;
if (DET.seeded) {
  // Math.random is only used for cosmetic effects (see core/rng.js). Here it becomes a seeded stream as well. The seed is
  // taken at the first call, after #seed has been read.
  let s = null;
  Math.random = () => {
    if (s === null) s = (CFG.SEED ^ CFG.DET_RANDOM_SALT) >>> 0 || 1;
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
if (DET.on) Date.now = () => CFG.DET_EPOCH + Math.round(DET.clock * 1000);
// Called by the main loop at the start of every frame, before anything is simulated.
function detFrameStart(dt, now) {
  if (DET.on) {
    DET.clock += dt;
    // hand over every sector requested during the previous frame (generated here, synchronously, if its timer has not run yet)
    for (const m of [...GEN.pending.values()]) {
      let out;
      try {
        out = genMain(m);
      } catch (e) {
        showErr('Sector generation failed: ' + (e.stack || e));
        GEN.pending.delete(m.key);
        continue;
      }
      onGenerated(m.key, out);
    }
  }
  for (const h of DET.hooks) h(dt, now);
  DET.frame++;
}
