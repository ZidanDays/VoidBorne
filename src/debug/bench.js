/* =====================================================================
   BENCHMARK (Phase 6A) — debug build only. Active when the URL has ?bench (or ?bench=<seconds>).
   Flies a scripted camera path through the home system: 8 shots, each a slow move around one subject (wreck, station,
   inside the belt, ringed planet, a planet filling the view, a minnow school, the star, the whole system), so the
   heavy cases are all covered. Measures for CFG.BENCH_SECONDS after CFG.BENCH_WARMUP seconds on the first shot:
     frame time (browser frame callbacks), main-thread CPU per frame and per system (wrapped game functions),
     GPU time per frame and per render pass (EXT_disjoint_timer_query_webgl2, when the browser offers it; otherwise
     null), draw calls per frame, render scale — overall, per shot and per second.
   The result (JSON) goes to the parent page with postMessage (tests/bench.html), to the console ("VB_BENCH {...}")
   and to window.__VB.benchResult. ?bench&download=1 also downloads it. Rendering stops when it is done.
   Use with ?seeded=1&noscale=1&nostore=1 so every run sees the same world at the preset's own render scale.
   The instrumentation exists only in the debug build and only while ?bench is in the URL.
   ===================================================================== */
(() => {
  let q;
  try {
    q = new URLSearchParams(location.search);
  } catch (e) {
    return;
  }
  if (!q.has('bench')) return;
  const seconds = +q.get('bench') || CFG.BENCH_SECONDS;
  const warmup = q.has('warmup') ? +q.get('warmup') : CFG.BENCH_WARMUP;
  const post = (msg) => {
    try {
      if (window.parent !== window) window.parent.postMessage(msg, '*');
    } catch (e) {}
  };
  addEventListener('error', (e) => post({ type: 'vb-bench-error', message: String(e.message || e) }));
  const B = { shots: null, t0: null, last: 0, rec: [], done: false, measuring: false, frameNo: 0 };

  /* ---- draw calls ---- */
  let calls = 0;
  for (const n of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
    const f = gl[n].bind(gl);
    gl[n] = (a, b, c, d, e) => {
      calls++;
      return f(a, b, c, d, e);
    };
  }

  /* ---- CPU per system: wrap the game's global update functions (looked up by name; missing ones are skipped) ---- */
  const SYS = [
    'updatePlayer',
    'optionsTick',
    'streamTick',
    'processUploads',
    'updateStructures',
    'interiorTick',
    'sectorUpdate',
    'updateMinnows',
    'updateWhales',
    'updateMedusae',
    'eventsTick',
    'gatherLights',
    'updateDiscovery',
    'audioTick',
    'updateHUD',
    'render',
  ];
  const cpuAcc = {};
  for (const n of SYS) {
    const f = globalThis[n];
    if (typeof f !== 'function') continue;
    cpuAcc[n] = 0;
    globalThis[n] = function (...a) {
      const t = performance.now();
      try {
        return f.apply(this, a);
      } finally {
        cpuAcc[n] += performance.now() - t;
      }
    };
  }

  /* ---- GPU per pass: one TIME_ELAPSED query per framebuffer the frame draws into ---- */
  const G = { ext: null, ok: false, pool: [], segs: null, cur: false, pend: [] };
  try {
    G.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    G.ok = !!G.ext;
  } catch (e) {}
  const passOf = (f) => {
    if (f === null) return 'composite';
    if (f === fb.ms) return 'scene';
    if (f === fb.tex) return 'resolve';
    if (f === fb.vol) return 'volumetrics';
    if (fb.taa && fb.taa.includes(f)) return 'taa';
    if (f === fb.b1 || f === fb.b2) return 'bloom';
    if (f === fb.rm || f === fb.r1 || f === fb.r2) return 'godrays';
    return 'other';
  };
  const gBegin = (label) => {
    if (!G.ok || !G.segs) return;
    try {
      if (G.cur) gl.endQuery(G.ext.TIME_ELAPSED_EXT);
      const qq = G.pool.pop() || gl.createQuery();
      gl.beginQuery(G.ext.TIME_ELAPSED_EXT, qq);
      G.cur = true;
      G.segs.push([label, qq]);
    } catch (e) {
      G.ok = false; // any trouble: no GPU numbers, the benchmark itself goes on
    }
  };
  if (G.ok) {
    const bind = gl.bindFramebuffer.bind(gl);
    gl.bindFramebuffer = (target, f) => {
      bind(target, f);
      if (target !== gl.READ_FRAMEBUFFER) gBegin(passOf(f));
    };
    const render0 = globalThis.render; // already wrapped for CPU timing above
    globalThis.render = function (...a) {
      const use = G.ok && B.measuring && !(typeof DBG !== 'undefined' && DBG.on); // the debug overlay uses the same query type
      if (use) {
        G.segs = [];
        gBegin('pre');
      }
      try {
        return render0.apply(this, a);
      } finally {
        if (use && G.segs) {
          try {
            if (G.cur) gl.endQuery(G.ext.TIME_ELAPSED_EXT);
          } catch (e) {
            G.ok = false;
          }
          G.cur = false;
          G.pend.push({ rec: B.rec[B.rec.length - 1], segs: G.segs });
          G.segs = null;
        }
      }
    };
  }
  function gPoll() {
    while (G.ok && G.pend.length) {
      const f = G.pend[0];
      const lastQ = f.segs[f.segs.length - 1][1];
      if (!gl.getQueryParameter(lastQ, gl.QUERY_RESULT_AVAILABLE)) break;
      G.pend.shift();
      const disjoint = gl.getParameter(G.ext.GPU_DISJOINT_EXT);
      const pass = {};
      let total = 0;
      for (const [label, qq] of f.segs) {
        const ms = disjoint ? 0 : gl.getQueryParameter(qq, gl.QUERY_RESULT) / 1e6;
        pass[label] = (pass[label] || 0) + ms;
        total += ms;
        G.pool.push(qq);
      }
      if (!disjoint && f.rec) {
        f.rec.gpu = total;
        f.rec.pass = pass;
      }
    }
  }

  /* ---- camera path ---- */
  const arc = (c, r, d0, d1, look) => ({ c, r, d0: norm(d0), d1: norm(d1), look: look || c });
  function buildShots() {
    const ringed = planets.find((p) => p.ring) || planets.find((p) => p.type === 1) || planets[0];
    const solid = planets.find((p) => p.type === 4) || planets.find((p) => p.type === 0) || planets[0];
    const lit = (p, o) => add(norm(sub(STAR.pos, p.pos)), o); // a direction on the planet's day side
    const R = (BELT.R0 + BELT.R1) / 2;
    const beltAt = (b) => add(STAR.pos, qrot(BELT.q, [Math.cos(b) * R, 0, Math.sin(b) * R]));
    const w = W0,
      sc = MINN.schools[0];
    return [
      { name: 'wreck', ...arc(w.pos, w.rad * 3, [0.5, 0.3, 0.8], [-0.2, 0.35, 0.9]) },
      { name: 'station', ...arc(station.pos, station.rad * 3, [-0.6, 0.2, 0.75], [0.1, 0.3, 0.95]) },
      { name: 'belt', path: [beltAt(0.6), beltAt(0.75)], ahead: beltAt(0.85) },
      { name: 'ringed planet', ...arc(ringed.pos, ringed.r * 2.4, lit(ringed, [0.4, 0.5, 0]), lit(ringed, [-0.3, 0.6, 0])) },
      { name: 'planet close', ...arc(solid.pos, solid.r * 1.3, lit(solid, [0.25, 0.3, 0]), lit(solid, [-0.25, 0.35, 0])) },
      { name: 'minnow school', ...arc(sc.home, 80, [0.4, 0.2, 0.9], [-0.4, 0.3, 0.86]) },
      { name: 'star', ...arc(STAR.pos, STAR.r * 3.2, [0.5, 0.25, 0.83], [0.2, 0.3, 0.93]) },
      { name: 'system', ...arc(STAR.pos, BELT.R1 * 2.2, [0.2, 0.75, 0.62], [-0.1, 0.8, 0.58]) },
    ];
  }
  function pose(s, u) {
    const e = u * u * (3 - 2 * u);
    if (s.path) {
      const p = add(s.path[0], scl(sub(s.path[1], s.path[0]), e));
      vbLook(p, add(s.ahead, sub(p, s.path[0])));
    } else vbLook(add(s.c, scl(norm(add(scl(s.d0, 1 - e), scl(s.d1, e))), s.r)), s.look);
  }

  /* ---- statistics ---- */
  const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const stats = (a) => {
    if (!a.length) return { frames: 0 };
    const s = [...a].sort((x, y) => x - y);
    const pct = (p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; // nearest-rank percentile
    const avg = mean(a);
    return {
      frames: a.length,
      avgMs: r2(avg),
      p50Ms: r2(pct(0.5)),
      p95Ms: r2(pct(0.95)),
      p99Ms: r2(pct(0.99)),
      maxMs: r2(s[s.length - 1]),
      fps: r2(1000 / avg),
      over33Pct: r2((a.filter((x) => x > 33.4).length / a.length) * 100),
    };
  };
  const summary = (recs) => {
    const gpu = recs.filter((r) => r.gpu !== undefined).map((r) => r.gpu);
    return {
      ...stats(recs.map((r) => r.ms)),
      cpuMs: r2(mean(recs.map((r) => r.cpu))),
      gpuMs: gpu.length ? r2(mean(gpu)) : null,
      gpuFrames: gpu.length,
      drawCalls: r2(mean(recs.map((r) => r.calls))),
      renderScale: r2(mean(recs.map((r) => r.scale))),
    };
  };
  function finish() {
    B.done = true;
    B.measuring = false;
    for (let i = 0; i < 4; i++) gPoll(); // late GPU results; frames whose queries never completed simply have no GPU time
    const recs = B.rec.filter((r) => r.ms !== undefined); // the frame in progress has no interval yet
    const perSecond = [];
    for (let s = 0; s < Math.ceil(seconds); s++) {
      const rs = recs.filter((r) => r.t >= s && r.t < s + 1);
      if (rs.length) perSecond.push({ second: s + 1, ...summary(rs) });
    }
    const passes = {};
    const withPass = recs.filter((r) => r.pass);
    for (const r of withPass) for (const k in r.pass) passes[k] = (passes[k] || 0) + r.pass[k];
    for (const k in passes) passes[k] = r2(passes[k] / withPass.length);
    const cpuSystems = {};
    for (const k in cpuAcc) cpuSystems[k] = r2(cpuAcc[k] / Math.max(1, recs.length));
    const all = summary(recs);
    const result = {
      kind: 'voidborne-bench',
      version: 2,
      date: new Date().toISOString(),
      userAgent: navigator.userAgent,
      renderer: vbRenderer(),
      gpuTimer: G.ext ? (G.ok ? 'EXT_disjoint_timer_query_webgl2' : 'failed during the run') : 'unavailable',
      quality: vbState().quality,
      seed: CFG.SEED,
      seconds,
      warmup,
      canvas: [canvas.width, canvas.height],
      cssSize: [canvas.clientWidth, canvas.clientHeight],
      dpr: devicePixelRatio,
      renderScale,
      internalSize: [fb.w, fb.h], // Phase 6B: the render size actually used ('ultra' supersamples above the canvas)
      dynamicScale: !DET.noScale,
      msaa: SAMPLES,
      taa: taaWanted(),
      cfgOverrides: DET.cfg, // ?cfg= A/B switches (Phase 6B)
      ultra: quality.ultraFx ? vbUltra() : null,
      frame: stats(recs.map((r) => r.ms)),
      cpuMainThread: { avgMs: all.cpuMs, p95Ms: stats(recs.map((r) => r.cpu)).p95Ms, maxMs: stats(recs.map((r) => r.cpu)).maxMs },
      gpu: { avgMs: all.gpuMs, framesMeasured: all.gpuFrames, passes: withPass.length ? passes : null },
      drawCalls: { avg: all.drawCalls, max: recs.length ? Math.max(...recs.map((r) => r.calls)) : null },
      cpuSystems,
      shots: B.shots.map((s, i) => ({ name: s.name, ...summary(recs.filter((r) => r.shot === i)) })),
      perSecond,
      loadMs: window.__vbLoadMs,
      stageMs: window.__vbStageMs,
      genMode: GEN.mode,
      sectorsLoaded: SECT.loaded.size,
      glErrors: vbGlErrors(),
      errors: errBox.textContent || '',
    };
    window.__VB.benchResult = result;
    console.log('VB_BENCH ' + JSON.stringify(result));
    post({ type: 'vb-bench', result });
    if (q.get('download') === '1') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(result, null, 1)], { type: 'application/json' }));
      a.download = `voidborne-bench-${result.quality}-${result.date.replace(/[:.]/g, '-')}.json`;
      a.click();
    }
    DET.manual = true; // stop rendering
  }

  /* ---- per frame ---- */
  DET.hooks.push((dt, now) => {
    if (B.done || !window.__vbReady) return;
    gPoll();
    if (B.t0 === null) {
      window.__VB.start();
      B.shots = buildShots();
      B.t0 = now;
      B.last = now;
      pose(B.shots[0], 0);
      return;
    }
    const t = (now - B.t0) / 1000;
    const u = t < warmup ? 0 : (t - warmup) / seconds;
    if (u >= 1) {
      finish();
      return;
    }
    const n = B.shots.length,
      k = Math.min(n - 1, Math.floor(u * n));
    // the record of the PREVIOUS frame is complete now: its interval, CPU time and draw calls
    if (B.measuring && B.rec.length) {
      const r = B.rec[B.rec.length - 1];
      r.ms = now - B.last;
      r.cpu = DET.cpuMs;
      r.calls = calls;
    }
    const was = B.measuring;
    B.measuring = t >= warmup;
    if (B.measuring && !was) for (const k2 in cpuAcc) cpuAcc[k2] = 0; // CPU per system counts measured frames only
    calls = 0;
    if (B.measuring) B.rec.push({ t: t - warmup, shot: k, scale: renderScale });
    B.last = now;
    pose(B.shots[k], u * n - k);
  });
})();
