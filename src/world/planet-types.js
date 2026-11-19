/* ---- Phase 6D: planet and moon types are parameter sets for ONE planet shader (shaders/planet.js, uniform vec4 uPP[20]) ----
   A new type is a new entry in PSETS (plus a palette, texts and weights), never a new shader branch. The five old types and the
   moon are expressed exactly by their sets, so they render as before. Index layout of uPP (PPK below, 4 values per vec4):
    0 fbmF fbmA fb3F fb3A           height: fbm(d*fbmF)*fbmA + fbm3(d*fb3F)*fb3A
    1 crat1 crat2 voroF crackHW     + craters (two fixed scales) ; voronoi cracks cut into the height (voroF 0 = none)
    2 crackHD ridgeF ridgeA dispK   crack depth ; ridged dunes (ridgeA 0 = none) ; vertex displacement amplitude
    3 seaLo seaHi seaDisp iceCap    sea level band (seaLo < 0 = no sea), displacement floor, polar ice caps (0 = none)
    4 rampLo rampHi speckA speckB   colour ramp c1 -> c2 over the height ; speckle (speckB 0 = none)
    5 patchK crackCW crackColK detN large patches of c3 ; crack colour width / strength ; 'ultra' detail normals (0 / 1)
    6 spec gloss specLand glossLand specular (sea worlds: sea values, then land values)
    7 emisK crackEK poolLo poolHi   emission: glowing cracks and pools (emisK 0 = none; poolLo >= 1 = no pools)
    8 cloudLo cloudHi cityK waveK   cloud layer coverage (cloudLo >= 1 = no clouds) ; night lights ; animated waves
    9 band bandF hotNight detC      gas bands (band 0 = solid surface), band frequency ; hot night side ; 'ultra' colour detail
   10 eyeK facetK ventK glintK      tidally locked day/night zones ; crystal facets ; sulfur vents ; broad sun glint
   11 emisA.rgb auroraK             emission colour A ; polar aurora strength
   12 emisB.rgb hazeK               emission colour B ; glowing haze strength
   13 cloudCol.rgb cloudShadow      cloud colour ; cloud shadow on the ground
   14 hazeCol.rgb irrK              haze colour ; irregular shape sharpness (0 = a sphere)
   15 auroraCol.rgb ext             ext = 1: the type uses a Phase 6D feature (ppPack sets it; 0 = one test skips them all)
   16..19 lobe dir.xyz amp          irregular moons: 4 broad lobes / dents (also used on the CPU for collision: irregularR) */
const PPK = {
  fbmF: 0, fbmA: 1, fb3F: 2, fb3A: 3, crat1: 4, crat2: 5, voroF: 6, crackHW: 7, crackHD: 8, ridgeF: 9, ridgeA: 10, dispK: 11,
  seaLo: 12, seaHi: 13, seaDisp: 14, iceCap: 15, rampLo: 16, rampHi: 17, speckA: 18, speckB: 19, patchK: 20, crackCW: 21,
  crackColK: 22, detN: 23, spec: 24, gloss: 25, specLand: 26, glossLand: 27, emisK: 28, crackEK: 29, poolLo: 30, poolHi: 31,
  cloudLo: 32, cloudHi: 33, cityK: 34, waveK: 35, band: 36, bandF: 37, hotNight: 38, detC: 39, eyeK: 40, facetK: 41, ventK: 42,
  glintK: 43, emisA: 44, auroraK: 47, emisB: 48, hazeK: 51, cloudCol: 52, cloudShadow: 55, hazeCol: 56, irrK: 59, auroraCol: 60,
  lobes: 64,
}; // prettier-ignore
const PP_N = 80;
// type ids: 0..5 are the old ones (5 = moon); 6 / 7 are the cloud layer and stars of the renderer
const PT = { ROCKY: 0, GAS: 1, ICE: 2, LAVA: 3, LIVING: 4, MOON: 5, OCEAN: 8, DESERT: 9, TOXIC: 10, CRYSTAL: 11, EYEBALL: 12, HOTGAS: 13, DWARF: 14, ROGUE: 15, MVOLC: 16, MICE: 17, MIRR: 18 }; // prettier-ignore
const PT_NEW = [8, 9, 10, 11, 12, 13, 14, 15]; // new planet types (scanner classes p8..p15)
const PT_MOONS = [16, 17, 18]; // special moons (scanner classes moon16..moon18)
// values not listed are the defaults of PP_DEF (no sea, no pools, no clouds, white clouds)
const PP_DEF = {
  seaLo: -1,
  rampLo: 0.3,
  rampHi: 0.7,
  speckA: 1,
  gloss: 0.3,
  poolLo: 1,
  poolHi: 1,
  cloudLo: 1,
  cloudHi: 1,
  cloudCol: [1, 1, 1],
};
const ROCKY_SET = { fbmF: 3, fbmA: 0.6, crat1: 0.35, crat2: 0.15, dispK: 0.07, rampLo: 0.2, rampHi: 0.75, speckA: 0.8, speckB: 0.4, patchK: 0.5, detN: 1, spec: 0.05, gloss: 0.3, detC: 1 }; // prettier-ignore
const PSETS = {
  // ---- the old types: these exact values reproduce the pre-6D shader branches ----
  0: ROCKY_SET,
  1: { band: 1, bandF: 9, spec: 0.15, gloss: 0.4 },
  2: { fb3F: 5, fb3A: 0.5, voroF: 6, crackHW: 0.12, crackHD: 0.4, dispK: 0.025, rampLo: 0.35, rampHi: 0.65, crackCW: 0.1, crackColK: 0.8, detN: 1, spec: 0.6, gloss: 0.7, detC: 2 }, // prettier-ignore
  3: { fb3F: 4, fb3A: 0.6, voroF: 5, crackHW: 0.1, crackHD: 0.5, dispK: 0.04, rampLo: 0.3, rampHi: 0.7, crackCW: 0.08, detN: 1, spec: 0.1, gloss: 0.3, emisK: 2.2, crackEK: 1, poolLo: 0.66, poolHi: 0.78, emisA: [1, 0.25, 0.02], emisB: [1, 0.75, 0.2] }, // prettier-ignore
  4: { fbmF: 3, fbmA: 1, dispK: 0.06, seaLo: 0.5, seaHi: 0.53, seaDisp: 0.52, iceCap: 1, rampLo: 0.55, rampHi: 0.75, spec: 0.9, gloss: 0.85, specLand: 0.1, glossLand: 0.3, cloudLo: 0.5, cloudHi: 0.72, cityK: 1, cloudShadow: 0.6 }, // prettier-ignore
  5: ROCKY_SET,
  // ---- Phase 6D types ----
  8: {
    fbmF: 3,
    fbmA: 1,
    dispK: 0.04,
    seaLo: 0.62,
    seaHi: 0.64,
    seaDisp: 0.64,
    iceCap: 0.8,
    rampLo: 0.62,
    rampHi: 0.85,
    spec: 0.85,
    gloss: 0.93,
    specLand: 0.12,
    glossLand: 0.3,
    cloudLo: 0.52,
    cloudHi: 0.76,
    cloudShadow: 0.5,
    waveK: 0.07,
    glintK: 0.12,
  }, // ocean // prettier-ignore
  9: {
    fbmF: 2.5,
    fbmA: 0.45,
    crat1: 0.12,
    ridgeF: 11,
    ridgeA: 0.42,
    dispK: 0.035,
    rampLo: 0.3,
    rampHi: 0.85,
    speckA: 0.92,
    speckB: 0.16,
    patchK: 0.35,
    detN: 1,
    spec: 0.04,
    gloss: 0.25,
    detC: 1,
  }, // desert // prettier-ignore
  10: {
    fbmF: 3,
    fbmA: 0.55,
    crat1: 0.1,
    voroF: 5,
    crackHW: 0.08,
    crackHD: 0.15,
    dispK: 0.035,
    rampLo: 0.25,
    rampHi: 0.75,
    speckA: 0.9,
    speckB: 0.2,
    crackCW: 0.06,
    crackColK: 0.35,
    detN: 1,
    spec: 0.2,
    gloss: 0.5,
    ventK: 1.6,
    emisB: [0.7, 1, 0.22],
    cloudLo: 0.46,
    cloudHi: 0.72,
    cloudShadow: 0.45,
    cloudCol: [0.46, 0.5, 0.2],
  }, // toxic / sulfur // prettier-ignore
  11: {
    fb3F: 4,
    fb3A: 0.55,
    voroF: 5,
    crackHW: 0.08,
    crackHD: 0.25,
    dispK: 0.05,
    rampLo: 0.3,
    rampHi: 0.7,
    crackCW: 0.05,
    crackColK: 0.5,
    facetK: 0.9,
    spec: 1.4,
    gloss: 0.97,
    emisK: 1.1,
    crackEK: 1,
    emisA: [0.3, 0.9, 1],
  }, // crystal // prettier-ignore
  12: {
    fbmF: 3,
    fbmA: 1,
    dispK: 0.05,
    seaLo: 0.5,
    seaHi: 0.53,
    seaDisp: 0.52,
    rampLo: 0.55,
    rampHi: 0.75,
    spec: 0.8,
    gloss: 0.85,
    specLand: 0.08,
    glossLand: 0.3,
    cloudLo: 0.6,
    cloudHi: 0.8,
    cloudShadow: 0.4,
    eyeK: 1,
  }, // eyeball (tidally locked) // prettier-ignore
  13: { band: 0.9, bandF: 9, spec: 0.1, gloss: 0.35, hotNight: 0.9, emisA: [1, 0.32, 0.07] }, // hot gas giant
  14: {
    fbmF: 3,
    fbmA: 0.5,
    crat1: 0.45,
    crat2: 0.25,
    dispK: 0.08,
    rampLo: 0.25,
    rampHi: 0.8,
    speckA: 0.85,
    speckB: 0.3,
    patchK: 0.6,
    iceCap: 0.5,
    detN: 1,
    spec: 0.15,
    gloss: 0.4,
    detC: 1,
  }, // dwarf planet // prettier-ignore
  15: {
    fb3F: 4,
    fb3A: 0.6,
    voroF: 5,
    crackHW: 0.08,
    crackHD: 0.3,
    dispK: 0.04,
    rampLo: 0.3,
    rampHi: 0.7,
    crackCW: 0.05,
    detN: 1,
    spec: 0.15,
    gloss: 0.5,
    emisK: 1,
    crackEK: 1,
    poolLo: 0.72,
    poolHi: 0.8,
    emisA: [1, 0.3, 0.05],
    emisB: [1, 0.6, 0.15],
    auroraCol: [0.3, 1, 0.6],
    hazeCol: [0.2, 0.6, 0.9],
  }, // rogue // prettier-ignore
  16: {
    fb3F: 4,
    fb3A: 0.6,
    voroF: 6,
    crackHW: 0.06,
    crackHD: 0.2,
    dispK: 0.04,
    rampLo: 0.3,
    rampHi: 0.75,
    speckA: 0.85,
    speckB: 0.3,
    crackCW: 0.06,
    detN: 1,
    spec: 0.1,
    emisK: 1.6,
    crackEK: 0.6,
    poolLo: 0.7,
    poolHi: 0.8,
    emisA: [1, 0.3, 0.05],
    emisB: [1, 0.7, 0.2],
  }, // volcanic moon // prettier-ignore
  17: {
    fb3F: 5,
    fb3A: 0.45,
    voroF: 6,
    crackHW: 0.1,
    crackHD: 0.3,
    dispK: 0.02,
    rampLo: 0.35,
    rampHi: 0.65,
    crackCW: 0.07,
    crackColK: 0.7,
    iceCap: 0,
    detN: 1,
    spec: 0.7,
    gloss: 0.75,
    detC: 2,
  }, // ice moon (geysers) // prettier-ignore
  18: Object.assign({}, ROCKY_SET, { irrK: 3 }), // irregular moon
};
// palettes of the new types: c1 / c2 / c3 / atmosphere colour / atmosphere strength; R = a hash stream (never the world RNG)
const PALX = {
  8: (R) => {
    const v = R();
    const sea = v < 0.5 ? [0.03, 0.12, 0.38] : v < 0.8 ? [0.02, 0.2, 0.3] : [0.06, 0.1, 0.25];
    return { c1: sea, c2: [0.3, 0.42, 0.18], c3: [0.62, 0.56, 0.42], atmo: [0.4, 0.62, 1], ak: 0.6 };
  },
  9: (R) => {
    const k = 0.85 + R() * 0.3;
    return { c1: [0.42 * k, 0.26 * k, 0.12], c2: [0.86, 0.7 * k, 0.46], c3: [0.6, 0.3, 0.16], atmo: [0.95, 0.68, 0.4], ak: 0.45 };
  },
  10: (R) => {
    const g = 0.9 + R() * 0.2;
    return { c1: [0.14, 0.15 * g, 0.05], c2: [0.36, 0.38 * g, 0.12], c3: [0.66, 0.58, 0.12], atmo: [0.5, 0.62, 0.2], ak: 0.6 };
  },
  11: (R) => {
    const v = R();
    return v < 0.5
      ? { c1: [0.12, 0.08, 0.2], c2: [0.62, 0.55, 0.85], c3: [0.2, 0.3, 0.7], atmo: [0.6, 0.7, 1], ak: 0.25 }
      : { c1: [0.06, 0.14, 0.16], c2: [0.55, 0.85, 0.86], c3: [0.5, 0.2, 0.6], atmo: [0.55, 0.9, 1], ak: 0.25 };
  },
  12: () => ({ c1: [0.03, 0.12, 0.32], c2: [0.2, 0.36, 0.14], c3: [0.72, 0.5, 0.3], atmo: [0.45, 0.62, 1], ak: 0.8 }),
  13: (R) => {
    const k = 0.9 + R() * 0.2;
    return { c1: [0.42 * k, 0.12, 0.05], c2: [0.86, 0.4 * k, 0.16], c3: [0.22, 0.05, 0.04], atmo: [1, 0.42, 0.16], ak: 0.5 };
  },
  14: (R) => {
    const k = 0.85 + R() * 0.3;
    return { c1: [0.34 * k, 0.3, 0.27], c2: [0.8, 0.74 * k, 0.68], c3: [0.62, 0.38, 0.3], atmo: [0, 0, 0], ak: 0 };
  },
  15: () => ({ c1: [0.05, 0.05, 0.06], c2: [0.15, 0.14, 0.16], c3: [0.1, 0.09, 0.1], atmo: [0.2, 0.3, 0.55], ak: 0.3 }),
  16: () => ({ c1: [0.5, 0.42, 0.12], c2: [0.86, 0.76, 0.36], c3: [0.5, 0.2, 0.08], atmo: [0, 0, 0], ak: 0 }),
  17: () => ({ c1: [0.82, 0.88, 0.94], c2: [0.97, 0.98, 1], c3: [0.42, 0.6, 0.86], atmo: [0, 0, 0], ak: 0 }),
  18: (R) => {
    const k = 0.8 + R() * 0.3;
    return { c1: [0.2 * k, 0.18 * k, 0.16], c2: [0.5 * k, 0.46 * k, 0.42], c3: [0.35, 0.32, 0.3], atmo: [0, 0, 0], ak: 0 };
  },
};
function ppPack(set) {
  const a = new Float32Array(PP_N);
  for (const src of [PP_DEF, set])
    for (const k in src) {
      const i = PPK[k],
        v = src[k];
      if (i === undefined) continue;
      if (Array.isArray(v)) for (let j = 0; j < v.length; j++) a[i + j] = v[j];
      else a[i] = v;
    }
  return ppExt(a);
}
// 'ext' (uPP[15].w) = 1 when the set uses any Phase 6D feature, so the old types skip all of them with one test in the shader
function ppExt(a) {
  const K = PPK;
  a[K.auroraCol + 3] =
    a[K.ridgeA] ||
    a[K.waveK] ||
    a[K.eyeK] ||
    a[K.facetK] ||
    a[K.ventK] ||
    a[K.glintK] ||
    a[K.hotNight] ||
    a[K.auroraK] ||
    a[K.hazeK] ||
    a[K.irrK]
      ? 1
      : 0;
  return a;
}
// the parameter set of one body. R (optional) = a hash stream for the variation of the new types; old types ignore it
function planetParams(t, R) {
  const a = ppPack(PSETS[t] || PSETS[0]);
  if (!R || t < 8) return a;
  const K = PPK,
    j = (i, lo, hi) => (a[i] = lo + R() * (hi - lo));
  if (t === 8) {
    j(K.seaLo, 0.58, 0.66);
    a[K.seaHi] = a[K.seaLo] + 0.025;
    a[K.seaDisp] = a[K.seaHi];
    a[K.rampLo] = a[K.seaHi];
    j(K.iceCap, 0.2, 1);
    j(K.cloudLo, 0.46, 0.58);
    a[K.cloudHi] = a[K.cloudLo] + 0.24;
  } else if (t === 9) {
    j(K.ridgeF, 8, 15);
    j(K.ridgeA, 0.3, 0.5);
    a[K.iceCap] = R() < 0.3 ? 0.35 : 0;
  } else if (t === 10) {
    j(K.ventK, 1.1, 2);
    j(K.cloudLo, 0.42, 0.54);
    a[K.cloudHi] = a[K.cloudLo] + 0.26;
  } else if (t === 11) {
    j(K.voroF, 4, 6.5);
    j(K.facetK, 0.7, 1.1);
    const v = R();
    const e = v < 0.4 ? [0.3, 0.9, 1] : v < 0.75 ? [0.9, 0.35, 1] : [0.4, 1, 0.55];
    a.set(e, K.emisA);
  } else if (t === 12) {
    j(K.seaLo, 0.46, 0.54);
    a[K.seaHi] = a[K.seaLo] + 0.03;
    a[K.seaDisp] = a[K.seaLo] + 0.02;
  } else if (t === 13) {
    j(K.band, 0.7, 1);
    j(K.bandF, 6.5, 11.5);
    j(K.hotNight, 0.6, 1.2);
  } else if (t === 14) {
    j(K.iceCap, 0, 0.9);
    j(K.crat1, 0.3, 0.55);
  } else if (t === 15) {
    // a rogue world glows in one of three ways: volcanic cracks, aurora, or a bioluminescent haze (one strong, the others faint)
    const v = R();
    a[K.emisK] = v < 0.4 ? 1.2 : 0.12;
    a[K.auroraK] = v >= 0.4 && v < 0.75 ? 0.7 : 0.1;
    a[K.hazeK] = v >= 0.75 ? 0.38 : 0.05;
    if (R() < 0.5) a.set([0.6, 0.4, 1], K.auroraCol);
  } else if (t === 16) {
    j(K.emisK, 1.2, 2);
  } else if (t === 18) {
    // two big lobes roughly opposite (an elongated body) and two dents: the CPU collision uses the same numbers
    j(K.irrK, 2.5, 4);
    const dir = () => {
      const z = R() * 2 - 1,
        t2 = R() * Math.PI * 2,
        s = Math.sqrt(1 - z * z);
      return [s * Math.cos(t2), z, s * Math.sin(t2)];
    };
    const d0 = dir();
    const lobes = [
      [d0, 0.18 + R() * 0.12],
      [[-d0[0] + (R() - 0.5) * 0.6, -d0[1] + (R() - 0.5) * 0.6, -d0[2] + (R() - 0.5) * 0.6], 0.12 + R() * 0.12],
      [dir(), -(0.08 + R() * 0.1)],
      [dir(), -(0.05 + R() * 0.08)],
    ];
    lobes.forEach((l, i) => {
      const v = l[0],
        n = Math.hypot(v[0], v[1], v[2]) || 1;
      a.set([v[0] / n, v[1] / n, v[2] / n, l[1]], K.lobes + i * 4);
    });
  }
  return ppExt(a);
}
// the radius factor of an irregular moon along a body-space direction (the same sum as lobes() in the shader)
function irregularR(pp, d) {
  const k = pp[PPK.irrK];
  if (!(k > 0)) return 1;
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const o = PPK.lobes + i * 4;
    s += pp[o + 3] * Math.exp((d[0] * pp[o] + d[1] * pp[o + 1] + d[2] * pp[o + 2] - 1) * k);
  }
  return 1 + s;
}
// largest radius factor (seed test, spacing): sum of the positive lobes
function irregularMax(pp) {
  if (!(pp[PPK.irrK] > 0)) return 1;
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.max(0, pp[PPK.lobes + i * 4 + 3]);
  return 1 + s;
}
const PP_ZERO = new Float32Array(PP_N);
const PP_CACHE = {};
// parameters of a body: generated ones carry .pp (from the generator); home bodies and old moons use the cached set of their type
function ppOf(o, t) {
  if (o && o.pp) return o.pp;
  return PP_CACHE[t] || (PP_CACHE[t] = planetParams(t, null));
}
/* ---- Phase 6D generation helpers (pure; they run in the sector worker too: see workerSource() in sector-generator.js) ---- */
const TYPE_SYL = {
  8: ['thal', 'mar', 'nai', 'pel', 'ond', 'ula', 'ris', 'aqu', 'sel', 'lir'],
  9: ['dun', 'sar', 'kesh', 'hal', 'zir', 'ash', 'tam', 'rak', 'ser', 'qad'],
  10: ['sulf', 'vex', 'gal', 'zor', 'mor', 'fen', 'pyr', 'ul', 'tox', 'bra'],
  11: ['lum', 'cry', 'vel', 'isa', 'qir', 'pri', 'sil', 'ae', 'zel', 'thi'],
  12: ['jan', 'umb', 'dis', 'vor', 'eki', 'hem', 'tor', 'nox', 'sol', 'ari'],
  13: ['ign', 'sur', 'bal', 'ro', 'khar', 'vul', 'pyra', 'sol', 'emb', 'tor'],
  14: ['pell', 'cer', 'ix', 'mak', 'hau', 'gon', 'sed', 'eri', 'ul', 'qua'],
  15: ['nul', 'vae', 'mor', 'dusk', 'umb', 'kel', 'noct', 'ash', 'vey', 'oru'],
};
// name generator entry of a new type: 2-3 syllables of its own set; keeps the roman numeral of the old name (" IV")
function typedName(t, old, R) {
  const syl = TYPE_SYL[t];
  const n = 2 + (R() < 0.35 ? 1 : 0);
  let s = '';
  for (let i = 0; i < 3; i++) {
    const w = syl[Math.floor(R() * syl.length)];
    if (i < n) s += w;
  }
  const m = / [IVX]+$/.exec(old || '');
  return s[0].toUpperCase() + s.slice(1) + (m ? m[0] : '');
}
// which planets become one of the new types: t = the type after the 6C plausibility swap, x = orbit / habitable distance,
// cls = the primary star's class, k = CFG.NEW_TYPES_SCALE. One draw of the planet's own stream, never the world RNG.
function variantType(t, x, cls, k, R) {
  const u = R();
  const red = cls === 'M' || cls === 'K';
  const pickOf = (list) => {
    let c = 0;
    for (const e of list) {
      c += e[1] * k;
      if (u < c) return e[0];
    }
    return t;
  };
  if (t === 1) return pickOf([[13, x < 1.1 ? 0.35 : 0.03]]); // hot gas giants close in
  if (t === 4)
    return pickOf([
      [12, red ? 0.35 : 0.06],
      [8, 0.3],
    ]); // tidally locked worlds mostly around red / orange stars; oceans
  if (t === 0) return pickOf([[9, x < 2 ? 0.16 : 0.05], [14, x > 2.5 ? 0.18 : 0.05], [10, x < 1.5 ? 0.07 : 0.015], [11, 0.025]]); // prettier-ignore
  if (t === 2)
    return pickOf([
      [14, 0.06],
      [11, 0.025],
      [8, x > 0.8 && x < 1.5 ? 0.15 : 0],
    ]);
  if (t === 3) return pickOf([[10, 0.12]]);
  return t;
}
// special moons: volcanic (plumes), icy with geysers, small irregular ones. pt = the parent's type, mr = moon radius
function moonVariant(pt, x, mr, k, R) {
  const u = R();
  const giant = pt === 1 || pt === 13;
  const list = [
    [16, (giant ? 0.06 : 0.01) * k],
    [17, ((giant || pt === 2 || pt === 8) && x > 1 ? 0.05 : 0.01) * k],
    [18, (mr < 18 ? 0.15 : 0.02) * k],
  ];
  let c = 0;
  for (const e of list) {
    c += e[1];
    if (u < c) return e[0];
  }
  return 5;
}
// the plume of a volcanic / geyser moon: a body-space direction, height (m), colour and kind (0 volcanic umbrella, 1 geyser jet)
function plumeOf(t, mr, R) {
  const z = t === 17 ? -0.75 - R() * 0.25 : R() * 2 - 1; // geysers near the south pole (like the real ones)
  const a = R() * Math.PI * 2,
    s = Math.sqrt(1 - z * z);
  return {
    dir: [s * Math.cos(a), z, s * Math.sin(a)],
    h: mr * (t === 17 ? 2.2 + R() * 1.5 : 1.4 + R()),
    col: t === 17 ? [0.75, 0.86, 1] : [1, 0.62, 0.3],
    kind: t === 17 ? 1 : 0,
    rate: 0.06 + R() * 0.05,
  };
}
// ring variety: colour, the two gaps, a steep tilt now and then; a rare thin ring on types that never had one
const RING_COLS = [[0.75, 0.68, 0.58], [0.85, 0.85, 0.88], [0.62, 0.5, 0.42], [0.6, 0.66, 0.78], [0.78, 0.6, 0.5]]; // prettier-ignore
function ringVariety(ring, R) {
  ring.col = RING_COLS[Math.floor(R() * RING_COLS.length)].map((v) => v * (0.9 + R() * 0.2));
  ring.gap = [0.3 + R() * 0.25, 0.62 + R() * 0.25, 0.012 + R() * 0.03, 0.008 + R() * 0.025];
  if (R() < 0.2)
    ring.q = qmul(
      qaxis(
        [R() - 0.5, 0, R() - 0.5].map((v, i, a) => v / (Math.hypot(a[0], a[2]) || 1)),
        0.6 + R() * 0.6,
      ),
      ring.q,
    );
  else (R(), R(), R());
  return ring;
}
