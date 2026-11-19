/* ---- saving files: download link plus an on-screen preview (downloads can be blocked in sandboxed frames) ---- */
const stamp = () => {
  const d = new Date(),
    z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds());
};
let shotT = null;
function saveBlob(blob, name, kind) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {}
  const box = $('#shot');
  box.innerHTML =
    (kind === 'video' ? '<video src="' + url + '" controls muted></video>' : '<img src="' + url + '" alt="">') +
    esc(tl('shot.saved', { name })) +
    '<br><span style="opacity:.65">' +
    esc(tl('shot.help')) +
    '</span><br><button class="btn" id="shotclose">' +
    esc(tl('btn.close')) +
    '</button>';
  box.style.display = 'block';
  $('#shotclose').onclick = () => {
    box.style.display = 'none';
  };
  clearTimeout(shotT);
  if (kind !== 'video')
    shotT = setTimeout(() => {
      box.style.display = 'none';
    }, 7000);
}
/* ---- photo mode: UI hidden, time frozen, free camera, PNG capture ---- */
const PHOTO = { on: false, saved: null, capture: false };
function hint(msg, ms) {
  const h = $('#photohint');
  h.textContent = msg;
  h.style.opacity = 1;
  clearTimeout(hint.t);
  hint.t = setTimeout(() => (h.style.opacity = 0), ms || 4000);
}
function setUIHidden(hidden) {
  for (const el of document.querySelectorAll('.ui,#radar,#logbox')) el.style.visibility = hidden ? 'hidden' : 'visible';
}
function togglePhoto(v) {
  const on = v === undefined ? !PHOTO.on : v;
  if (on === PHOTO.on) return;
  if (on) {
    if (MAP.open || CODEX.open || WARP.on) return;
    apOff();
    PHOTO.saved = { pos: player.pos.slice(), q: player.q.slice(), vel: player.vel.slice(), boost: player.boost, fov: player.fov };
    player.vel = [0, 0, 0];
    player.fov = 1.15;
    PHOTO.on = true;
    setUIHidden(true);
    hint(
      tl('photo.hint', {
        move: ['fwd', 'left', 'back', 'right'].map(keyOf).join(''),
        up: keyOf('up'),
        down: keyOf('down'),
        roll: keyOf('rollL') + '/' + keyOf('rollR'),
        fast: keyOf('boost'),
        exit: keyOf('photo'),
      }),
      5000,
    );
  } else {
    const s = PHOTO.saved;
    if (s) {
      player.pos = s.pos;
      player.q = s.q;
      player.vel = s.vel;
      player.boost = s.boost;
      player.fov = s.fov;
    }
    PHOTO.on = false;
    setUIHidden(player.hideUI);
    taaValid = false;
    hint('', 1);
  }
}
function photoStep(dt) {
  const b = basis();
  let f = 0,
    s = 0,
    u = 0,
    roll = 0;
  if (act('fwd')) f++;
  if (act('back')) f--;
  if (act('right')) s++;
  if (act('left')) s--;
  if (act('up')) u++;
  if (act('down')) u--;
  if (act('rollL')) roll++;
  if (act('rollR')) roll--;
  f += tIn.y + GP.f;
  s += tIn.x + GP.s;
  u += tIn.up + GP.u;
  roll += GP.roll;
  if (roll) player.q = qnorm(qmul(player.q, qaxis([0, 0, 1], roll * 1.2 * dt)));
  const sp = CFG.PHOTO_SPEED * (act('boost') || GP.boost ? 6 : 1);
  player.pos = add(player.pos, scl(add(add(scl(b.f, f), scl(b.r, s)), scl(b.u, u)), sp * dt));
}
function capturePNG() {
  try {
    canvas.toBlob((blob) => {
      if (blob) saveBlob(blob, 'voidborne-' + stamp() + '.png', 'image');
      else toast(tl('toast.capFail'));
    }, 'image/png');
  } catch (e) {
    toast(tl('toast.capFail'));
  }
}
/* ---- clip recording: canvas.captureStream() + MediaRecorder -> WebM ---- */
const REC = { on: false, mr: null, chunks: [], t0: 0, stream: null };
function recSupported() {
  return !!(canvas.captureStream && typeof MediaRecorder !== 'undefined');
}
function toggleRecord() {
  if (REC.on) {
    try {
      REC.mr.stop();
    } catch (e) {}
    return;
  }
  if (!recSupported()) {
    toast(tl('toast.recUnsup'));
    return;
  }
  let stream;
  try {
    stream = canvas.captureStream(CFG.RECORD_FPS);
  } catch (e) {
    toast(tl('toast.recNA'));
    return;
  }
  if (CFG.RECORD_AUDIO && AUD.ctx && AUD.comp && AUD.ctx.createMediaStreamDestination) {
    try {
      if (!AUD.recDest) {
        AUD.recDest = AUD.ctx.createMediaStreamDestination();
        AUD.comp.connect(AUD.recDest);
      }
      for (const t of AUD.recDest.stream.getAudioTracks()) stream.addTrack(t);
    } catch (e) {}
  }
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  const mime =
    types.find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch (e) {
        return false;
      }
    }) || '';
  try {
    REC.mr = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: CFG.RECORD_BITRATE } : { videoBitsPerSecond: CFG.RECORD_BITRATE },
    );
  } catch (e) {
    toast(tl('toast.recFail'));
    return;
  }
  REC.chunks = [];
  REC.stream = stream;
  REC.mr.ondataavailable = (e) => {
    if (e.data && e.data.size) REC.chunks.push(e.data);
  };
  REC.mr.onstop = () => {
    REC.on = false;
    $('#rec').style.display = 'none';
    for (const t of stream.getVideoTracks()) t.stop();
    if (!REC.chunks.length) {
      toast(tl('toast.recEmpty'));
      return;
    }
    saveBlob(new Blob(REC.chunks, { type: (mime || 'video/webm').split(';')[0] }), 'voidborne-' + stamp() + '.webm', 'video');
  };
  REC.mr.onerror = () => {
    toast(tl('toast.recErr'));
  };
  try {
    REC.mr.start(1000);
  } catch (e) {
    toast(tl('toast.recFail'));
    return;
  }
  REC.on = true;
  REC.t0 = performance.now();
  $('#rec').style.display = 'block';
  recTick();
}
function recTick() {
  if (!REC.on) return;
  const s = Math.floor((performance.now() - REC.t0) / 1000);
  $('#rec').textContent = tl('rec.line', {
    t: String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'),
    key: keyOf('record'),
  });
}
