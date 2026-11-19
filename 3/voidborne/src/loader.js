'use strict';
/* stage loader: runs each <script type="text/x-vb"> block as a global script, yielding between them;
   the loading overlay only appears when generation takes longer than a quarter of a second */
(function () {
  const st = [...document.querySelectorAll('script[type="text/x-vb"]')];
  const total = st.reduce((a, s) => a + (+s.dataset.w || 1), 0);
  const ov = document.getElementById('loading'),
    bar = document.getElementById('ldbar'),
    t0 = performance.now();
  let i = 0,
    done = 0,
    failed = false;
  try {
    const s = JSON.parse(localStorage.getItem('voidborne:settings') || '{}');
    const l = s.lang || ((navigator.language || '').toLowerCase().startsWith('id') ? 'id' : 'en');
    document.getElementById('ldtxt').textContent = l === 'id' ? 'MEMBANGKITKAN ALAM SEMESTA…' : 'GENERATING THE UNIVERSE…';
  } catch (e) {}
  addEventListener('error', (e) => {
    if (window.__vbReady) return;
    failed = true;
    ov.style.display = 'none';
    const b = document.getElementById('err');
    b.style.display = 'block';
    b.textContent += (e.message || 'error') + (e.lineno ? ' (line ' + e.lineno + ')' : '') + '\n';
  });
  const next = () => {
    if (document.visibilityState === 'visible') requestAnimationFrame(() => setTimeout(step, 0));
    else setTimeout(step, 0);
  };
  function step() {
    if (failed) return;
    if (i >= st.length) {
      window.__vbLoadMs = Math.round(performance.now() - t0);
      window.__vbReady = true;
      ov.classList.remove('show');
      setTimeout(() => ov.remove(), 700);
      return;
    }
    const s = st[i++],
      el = document.createElement('script');
    el.textContent = s.textContent;
    const ts = performance.now();
    document.body.appendChild(el);
    (window.__vbStageMs = window.__vbStageMs || []).push([s.dataset.name, Math.round(performance.now() - ts)]);
    done += +s.dataset.w || 1;
    bar.style.width = ((done / total) * 100).toFixed(1) + '%';
    if (performance.now() - t0 > 250) ov.classList.add('show');
    next();
  }
  next();
})();
