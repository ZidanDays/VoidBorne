/* ---- baked vertex ambient occlusion: coarse voxel occupancy of the mesh + short hemisphere rays per vertex ---- */
function bakeAO(mb, res = 44, strength = 0.75) {
  const v = mb.v;
  const nv = v.length / 9;
  if (nv < 3) return;
  const mn = [1e9, 1e9, 1e9],
    mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++)
    for (let k = 0; k < 3; k++) {
      const x = v[i * 9 + k];
      if (x < mn[k]) mn[k] = x;
      if (x > mx[k]) mx[k] = x;
    }
  const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) + 1e-3;
  const cell = ext / res,
    inv = 1 / cell;
  const G = new Uint8Array(res * res * res);
  const idx = (x, y, z) => {
    const ix = Math.floor((x - mn[0]) * inv),
      iy = Math.floor((y - mn[1]) * inv),
      iz = Math.floor((z - mn[2]) * inv);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= res || iy >= res || iz >= res) return -1;
    return (ix * res + iy) * res + iz;
  };
  const tri = mb.i;
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] * 9,
      b = tri[t + 1] * 9,
      c = tri[t + 2] * 9;
    const ax = v[a],
      ay = v[a + 1],
      az = v[a + 2],
      bx = v[b],
      by = v[b + 1],
      bz = v[b + 2],
      cx = v[c],
      cy = v[c + 1],
      cz = v[c + 2];
    const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
    const n = Math.min(8, Math.max(1, Math.ceil(e * inv)));
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n - i; j++) {
        const u = i / n,
          w = j / n,
          s = 1 - u - w;
        const k = idx(ax * s + bx * u + cx * w, ay * s + by * u + cy * w, az * s + bz * u + cz * w);
        if (k >= 0) G[k] = 1;
      }
  }
  const dirs = [[0, 1, 0]];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    dirs.push([Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.8]);
  }
  for (let k = 0; k < 4; k++) {
    const a = ((k + 0.5) / 4) * TAU;
    dirs.push([Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.45]);
  }
  const steps = 12;
  for (let i = 0; i < nv; i++) {
    const o = i * 9;
    const px = v[o],
      py = v[o + 1],
      pz = v[o + 2],
      nx = v[o + 3],
      ny = v[o + 4],
      nz = v[o + 5];
    const t = Math.abs(ny) < 0.9 ? cross([nx, ny, nz], [0, 1, 0]) : cross([nx, ny, nz], [1, 0, 0]);
    const tl = Math.hypot(t[0], t[1], t[2]) || 1;
    const tx = t[0] / tl,
      ty = t[1] / tl,
      tz = t[2] / tl;
    const bx = ny * tz - nz * ty,
      by = nz * tx - nx * tz,
      bz = nx * ty - ny * tx;
    let occ = 0;
    for (const d of dirs) {
      const dx = tx * d[0] + nx * d[1] + bx * d[2],
        dy = ty * d[0] + ny * d[1] + by * d[2],
        dz = tz * d[0] + nz * d[1] + bz * d[2];
      for (let s = 2; s <= steps; s++) {
        const k = idx(px + dx * s * cell, py + dy * s * cell, pz + dz * s * cell);
        if (k < 0) break;
        if (G[k]) {
          occ += 1 - (s - 2) / steps;
          break;
        }
      }
    }
    const ao = 1 - (strength * occ) / dirs.length;
    v[o + 6] *= ao;
    v[o + 7] *= ao;
    v[o + 8] *= ao;
  }
}
/* ---- pulsar: bright core + two long additive beam cones (material 11) ---- */
function pulsarMeshes() {
  const core = new MB();
  core.sphere(1, [0.8, 0.9, 1.0], xfq(Q0, [0, 0, 0]), 1, 10);
  const beams = new MB();
  beams.cyl(3, 110, 2200, 14, [0.6, 0.8, 1.0], xfq(Q0, [0, 0, 0]));
  beams.cyl(3, 110, 2200, 14, [0.6, 0.8, 1.0], xfq(qaxis([1, 0, 0], PI), [0, 0, 0]));
  return { core, beams };
}
