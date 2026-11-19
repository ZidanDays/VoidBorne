let QSRC = 'default';
{
  const m = location.hash.match(/seed=(\d+)/);
  if (m) CFG.SEED = parseInt(m[1]) | 0;
  const q = location.hash.match(/q=(low|medium|high|ultra)/);
  if (q) CFG.QUALITY = q[1];
  else if (SETTINGS.quality && /^(low|medium|high|ultra)$/.test(SETTINGS.quality)) CFG.QUALITY = SETTINGS.quality;
  else if (isTouch) CFG.QUALITY = CFG.MOBILE_QUALITY;
  // where the starting preset came from (Phase 6B): 'url' (#q=) > 'auto' / 'user' / 'saved' / 'pending' (remembered) > 'mobile' >
  // 'default'. Only 'default' (desktop, nothing saved, no #q=) and 'pending' (a first run that ended before the measurement
  // finished) let the first-run auto-quality probe run (render/quality.js).
  QSRC = q ? 'url' : SETTINGS.quality ? SETTINGS.qSrc || 'saved' : isTouch ? 'mobile' : 'default';
}
$('#seedline').textContent = t('start.seed', { seed: CFG.SEED });
const canvas = $('#c');
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
});
if (!gl) {
  showErr(t('err.webgl'));
  throw new Error('no webgl2');
}
// Context loss: keep the page alive, rebuild every GL object on restore (see rebuildGL in the render module)
let glLost = false;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  glLost = true;
  $('#banner').textContent = t('banner.lost');
  $('#banner').style.display = 'block';
});
canvas.addEventListener('webglcontextrestored', () => {
  try {
    rebuildGL();
    glLost = false;
    $('#banner').style.display = 'none';
  } catch (e) {
    showErr('Rebuild after context restore failed: ' + (e.stack || e));
  }
});
