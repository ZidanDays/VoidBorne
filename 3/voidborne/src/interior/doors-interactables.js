/* ---------------- doors ---------------- */
function makeDoor(bx, sealed) {
  const yc = (DOOR_TOP + DECK) / 2,
    h = DOOR_TOP - DECK,
    x = bx + DOOR_X;
  const pm = new MB(),
    sm = new MB();
  boxMesh(pm, [x, yc, 0], [0.5, h, DOOR_HW * 2 + 0.2], sealed ? [0.3, 0.27, 0.24] : [0.27, 0.28, 0.31]);
  for (let k = 0; k < (sealed ? 5 : 3); k++)
    boxMesh(pm, [x, DECK + 1 + (k * (h - 2)) / ((sealed ? 5 : 3) - 1), 0], [0.62, 0.18, DOOR_HW * 2 - 0.4], DARKC);
  for (const s of [-1, 1]) boxMesh(sm, [x + s * 0.28, DECK + h * 0.62, 0], [0.06, 0.22, DOOR_HW * 2 * 0.7], [1, 1, 1]);
  const col = sealed ? [0.9, 0.1, 0.05] : [0.7, 0.45, 0.1];
  const d = {
    bx,
    sealed,
    open: 0,
    target: 0,
    slide: DOOR_SLIDE,
    moving: false,
    panel: { mesh: makeMesh(pm, single(W0.pos, qid(), 1, [1, 1, 1]), 'q', true), mat: 7, door: true },
    strip: { mesh: makeMesh(sm, single(W0.pos, qid(), 1, col, 2), 'q', true), mat: 8, door: true },
  };
  d.col = box([x, yc, 0], [0.3, h / 2, DOOR_HW + 0.1], { door: d });
  W0.items.push(d.panel, d.strip);
  INT.doors.push(d);
  return d;
}
const DOORS = { aft: makeDoor(-30, false), eng: makeDoor(3, false), corr: makeDoor(20, false), vault: makeDoor(38, true) };
/* ---------------- interactables (hull-local positions, pick radius) ---------------- */
const keyName = () => keyOf('interact');
function doorAct(d) {
  if (d.sealed && !INT.power) {
    toast(t('toast.locked'));
    sfxDenied(doorWorld(d));
    return;
  }
  if (d.target > 0.5) {
    if (playerInDoorway(d)) {
      toast(t('toast.blocked'));
      return;
    }
    d.target = 0;
  } else d.target = 1;
  d.moving = true;
  sfxDoor(doorWorld(d), d.sealed);
  if (d.sealed && d.target === 1 && !INT.sealedOpen) {
    INT.sealedOpen = true;
    toast(t('toast.sealed'));
    saveInterior();
  }
}
for (const k in DOORS) {
  const d = DOORS[k];
  INT.items.push({
    kind: 'door',
    door: d,
    r: 3.4,
    pos: () => [d.bx + DOOR_X, (DOOR_TOP + DECK) / 2, 0],
    label: () =>
      d.sealed
        ? !INT.power
          ? t('act.sealed_locked')
          : d.target > 0.5
            ? t('act.door_close')
            : INT.sealedOpen
              ? t('act.door_open')
              : t('act.sealed')
        : d.target > 0.5
          ? t('act.door_close')
          : t('act.door_open'),
    act: () => doorAct(d),
  });
}
INT.items.push({
  kind: 'panel',
  r: 1.8,
  pos: () => [10, DECK + 2.3, -6.9],
  label: () => (INT.power ? t('act.panel_on') : t('act.panel')),
  act: () => {
    if (!INT.power) powerOn(false);
  },
});
// logs: the ship's main terminal (Phase 3) and four datapads generated from the seed
const crewNames = [nameWordR(), nameWordR(), nameWordR()];
function nameWordR() {
  let s = '';
  const n = 2 + ((irng() * 2) | 0);
  for (let i = 0; i < n; i++) s += SYL[(irng() * SYL.length) | 0];
  return cap(s);
}
PADS.forEach((pd, i) => {
  const pool = TXT.en[pd.pool];
  const used = [];
  const lines = [];
  const nl = 2 + (irng() < 0.5 ? 1 : 0);
  const vars = {
    d: 2 + ((irng() * 300) | 0),
    t: String((irng() * 24) | 0).padStart(2, '0') + ':' + String((irng() * 60) | 0).padStart(2, '0'),
    n: 100 + ((irng() * 900) | 0),
    name: ipick(crewNames),
  };
  for (let k = 0; k < nl; k++) {
    let j = (irng() * pool.length) | 0;
    for (let g = 0; g < 8 && used.indexOf(j) >= 0; g++) j = (irng() * pool.length) | 0;
    used.push(j);
    lines.push({ pool: pd.pool, i: j, v: Object.assign({}, vars, { d: vars.d + k * (1 + ((irng() * 6) | 0)) }) });
  }
  lines.push({ pool: 'ilog.end', i: (irng() * TXT.en['ilog.end'].length) | 0, v: vars });
  pd.lines = lines;
  pd.id = 'ilog:' + i;
  INT.items.push({ kind: 'log', pad: pd, r: 1.4, pos: () => pd.s, label: () => t('act.read'), act: () => readPad(pd) });
});
function renderPad(pd) {
  return [
    t('log.title', { room: t('room.' + pd.room) }),
    ...pd.lines.map((l) => t(l.pool, {})[l.i].replace(/\{(\w+)\}/g, (m, n) => (l.v[n] !== undefined ? String(l.v[n]) : m))),
  ];
}
function readPad(pd) {
  const w = add(W0.pos, qrot(W0.q, pd.s));
  const lines = renderPad(pd);
  showLog(lines, pd.id, lines[0], w, { pad: pd.id });
  INT.read[pd.id] = true;
  if (PROG.codex.length) {
    const e = PROG.codex.find((c) => c.id === pd.id);
    if (e) e.keys = pd.lines;
  }
  updatePadGlow();
  saveInterior();
}
INT.items.push({
  kind: 'log',
  r: 1.6,
  pos: () => TERM_LOCAL,
  label: () => t('act.read'),
  act: () => {
    W0.logRead = true;
    showLog(W0.log, 'log:' + W0.id, W0.name, W0.pos);
  },
});
function updatePadGlow() {
  const a = padItem.mesh.inst;
  const n = Object.keys(INT.read).length;
  const k = n >= PADS.length ? 0.45 : 1;
  a[8] = 0.18 * k;
  a[9] = 0.32 * k;
  a[10] = 0.2 * k;
}
