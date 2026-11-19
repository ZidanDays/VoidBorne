/* =====================================================================
   QUALITY SYSTEM (Phase 6B)
   setQuality(name, src) is the one place a preset changes (pause menu, auto-detect, the debug test API).
   Auto quality: on the very first desktop run (no #q= in the link, no saved preset, no test flags in the URL), the frames
   of the opening sequence are measured at 'high' with the dynamic scaler held (1 s warm-up, then CFG.AUTO_QUALITY_SECONDS)
   and low / medium / high is chosen from the median frame time (CFG.AUTO_QUALITY_MS) and remembered (SETTINGS.qSrc =
   'auto'). It never picks 'ultra'. #q= and the pause-menu selector always win: a choice made while it measures cancels it,
   and it never runs again unless the player presses DETECT QUALITY AGAIN. Touch devices keep CFG.MOBILE_QUALITY.
   ===================================================================== */
const PROBE = { on: false, wait: false, t: 0, ms: [], manual: false };
function setQuality(name, src) {
  if (!QUAL[name]) return;
  if (src === 'user') PROBE.on = PROBE.wait = false; // the player's choice wins over a running or armed measurement
  const prev = quality;
  quality = QUAL[name];
  CFG.QUALITY = name;
  const sel = $('#qual');
  if (sel.value !== name) sel.value = name;
  if (prev !== quality) {
    bakeSky();
    renderScale = quality.scale; // start at the new preset's scale (before 6B a lower preset kept the old, higher scale)
    taaValid = false;
    if (AUD.ctx) applyPanning();
  }
  if (src) {
    QSRC = src;
    SETTINGS.quality = name;
    SETTINGS.qSrc = src;
    saveSettings();
  }
  qsrcLine();
}
function qsrcLine() {
  const el = $('#qsrc');
  if (!el) return;
  const s =
    PROBE.on || PROBE.wait
      ? t('qsrc.probing')
      : QSRC === 'auto'
        ? t('qsrc.auto', { ms: SETTINGS.qProbe ? SETTINGS.qProbe.ms || '>1000' : '?' }) // null: fewer than 3 frames in 20 s
        : t('qsrc.' + (QSRC === 'pending' ? 'default' : QSRC));
  el.textContent = t('set.qsrc', { s });
}
// first run: armed now, measured during the opening sequence (the start screen's blurred overlay would skew it)
// 'pending' (remembered): a first run that ended before the measurement did, e.g. after a volume change saved the settings
function probeArm() {
  if (CFG.AUTO_QUALITY && (QSRC === 'default' || QSRC === 'pending') && !isTouch && !DET.any && SETTINGS.qProbe === undefined) {
    PROBE.wait = true;
    SETTINGS.qSrc = 'pending';
  }
}
function probeStart(manual) {
  PROBE.wait = false;
  PROBE.on = true;
  PROBE.manual = manual;
  PROBE.t = 0;
  PROBE.ms = [];
  if (quality !== QUAL.high) setQuality('high');
  renderScale = quality.scale;
  if (manual) toast(tl('toast.autoqRun'));
  qsrcLine();
}
// main loop, every frame: returns true while measuring (the dynamic scaler is held meanwhile)
function probeTick(raw) {
  if (PROBE.wait && started && !paused) probeStart(PROBE.manual);
  if (!PROBE.on) return false;
  if (document.hidden || paused || PHOTO.on) return true;
  PROBE.t += Math.min(raw, 10000) / 1000;
  if (PROBE.t > 1 && raw < 10000) PROBE.ms.push(raw); // after the warm-up (shaders, uploads); a 10 s gap is a pause, not a frame
  // the window ends after AUTO_QUALITY_SECONDS with at least 8 frames, or after 20 s on a very slow machine (3 frames are enough then)
  if ((PROBE.t >= 1 + CFG.AUTO_QUALITY_SECONDS && PROBE.ms.length >= 8) || PROBE.t >= 20) probeFinish();
  return true;
}
addEventListener('visibilitychange', () => {
  if (document.hidden && PROBE.on) PROBE.t = Math.min(PROBE.t, 1); // hidden mid-measurement: warm up again when it comes back
});
function probeFinish() {
  PROBE.on = false;
  const a = PROBE.ms.slice().sort((x, y) => x - y);
  // the window only ends early with 8+ frames; fewer than 3 usable frames means 20 s of running produced almost none
  // (a hidden tab restarts the warm-up instead), so the machine is clearly too slow for 'high'
  const med = a.length >= 3 ? a[a.length >> 1] : Infinity;
  const [t1, t2] = CFG.AUTO_QUALITY_MS;
  const pick = med < t1 ? 'high' : med < t2 ? 'medium' : 'low';
  SETTINGS.qProbe = { ms: isFinite(med) ? Math.round(med * 10) / 10 : null, frames: a.length, pick };
  setQuality(pick, 'auto');
  toast(tl(PROBE.manual ? 'toast.autoqKeep' : 'toast.autoq', { q: t('q.' + pick).toUpperCase() }));
}
$('#autoq').addEventListener('click', () => {
  PROBE.manual = true;
  PROBE.wait = true; // starts as soon as the game runs (resume closes the pause menu)
  qsrcLine();
  if (paused) setPaused(false);
});
probeArm();
