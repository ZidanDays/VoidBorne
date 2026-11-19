/* =====================================================================
   HUD, RADAR, LABELS
   ===================================================================== */
const radar = $('#radar'),
  rctx = radar.getContext('2d');
function drawRadar() {
  const b = basis();
  rctx.clearRect(0, 0, 170, 170);
  rctx.strokeStyle = 'rgba(140,200,240,0.25)';
  for (const r of [28, 56, 84]) {
    rctx.beginPath();
    rctx.arc(85, 85, r, 0, TAU);
    rctx.stroke();
  }
  const proj = (p, r, col, shape) => {
    const rel = sub(p, player.pos);
    const x = dot(rel, b.r),
      y = dot(rel, b.f);
    const d = Math.hypot(x, y);
    if (d < 1e-3) return;
    const rr2 = (84 * Math.log(1 + d / 150)) / Math.log(1 + 6000 / 150);
    if (rr2 > 84) return;
    const sx = 85 + (x / d) * rr2,
      sy = 85 - (y / d) * rr2;
    const up = dot(rel, b.u);
    rctx.fillStyle = col;
    rctx.globalAlpha = 0.5 + 0.5 * (1 - Math.min(1, Math.abs(up) / d));
    if (shape === 'sq') {
      rctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);
    } else {
      rctx.beginPath();
      rctx.arc(sx, sy, r, 0, TAU);
      rctx.fill();
    }
    rctx.globalAlpha = 1;
  };
  for (const p of POI) {
    if (p.hidden && !(p.ref && p.ref.found)) continue;
    const col =
      p.kind === 'planet'
        ? '#8fd3ff'
        : p.kind === 'moon'
          ? '#9fb5c8'
          : p.kind === 'star'
            ? '#ffd27a'
            : p.kind === 'wreck'
              ? '#ff8a5a'
              : p.kind === 'station'
                ? '#ffb3f0'
                : '#c8ff9a';
    proj(p.pos, p.kind === 'star' ? 5 : p.kind === 'planet' ? 3.5 : 2, col, p.kind === 'wreck' || p.kind === 'station' ? 'sq' : 'o');
  }
  for (const s of MINN.schools) if (s.center) proj(s.center, 1.5, '#7df2ff', 'o');
  for (const w of whales) proj(w.pos, 2.5, '#7dffb0', 'o');
  if (medusae.nearest) proj(medusae.nearest, 1.5, '#d8a6ff', 'o');
  for (const s of readySectors()) if (s.med) proj(s.med.c, 1.5, '#d8a6ff', 'o');
  rctx.fillStyle = '#fff';
  rctx.beginPath();
  rctx.moveTo(85, 79);
  rctx.lineTo(89, 88);
  rctx.lineTo(81, 88);
  rctx.fill();
}
let hudT = 0,
  labelName = '';
function updateHUD(dt, fps) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.1;
  const b = basis();
  $('#spd').textContent =
    len(player.vel).toFixed(1) + ' m/s' + (player.boost ? ' · ' + t('hud.boost') : '') + (player.inside ? ' · ' + t('hud.inside') : '');
  let best = 1e9,
    bn = '';
  for (const p of POI) {
    if (p.hidden && !(p.ref && p.ref.found)) continue;
    const d = len(sub(p.pos, player.pos)) - p.r;
    if (d < best) {
      best = d;
      bn = p.name;
    }
  }
  $('#near').textContent = bn
    ? bn.toUpperCase() + ' · ' + (best < 1000 ? Math.max(0, best).toFixed(0) + ' m' : (best / 1000).toFixed(1) + ' km')
    : '';
  $('#fps').textContent = fps + ' fps · ' + Math.round(renderScale * 100) + '%';
  let lb = null,
    la = 0.06;
  for (const p of POI) {
    if (p.hidden && !(p.ref && p.ref.found)) continue;
    const rel = sub(p.pos, player.pos);
    const d = len(rel);
    const ang = Math.acos(clamp(dot(rel, b.f) / d, -1, 1));
    const app = Math.atan2(p.r, d);
    if (ang < app + 0.035 && ang - app < la) {
      la = ang - app;
      lb = p;
    }
  }
  lookPOI = lb;
  const lbl = $('#label');
  if (lb) {
    if (labelName !== lb.name) {
      labelName = lb.name;
      lbl.innerHTML = lb.name.toUpperCase() + '<small>' + lb.sub.toUpperCase() + '</small>';
    }
    lbl.style.opacity = 1;
  } else {
    lbl.style.opacity = 0;
    labelName = '';
  }
  drawRadar();
}
