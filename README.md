# VOIDBORNE

A procedural universe in **one self-contained HTML file**: raw WebGL2 and hand-written shaders, Web Audio
synthesis, no images, models, audio files, fonts or libraries, and no network requests. Everything is
generated from a seed when the page opens.

**To play, open `dist/voidborne.html`.** It works offline straight from disk in current Chrome, Firefox and Edge.

- `#seed=1234` in the address gives you another universe.
- `#q=low` helps weaker laptops and phones; `#q=ultra` is for strong GPUs (supersampling and extra detail).
  On the first run on a desktop the game measures a few seconds of the opening sequence and picks low, medium or
  high itself (the pause menu always overrides it, and so does `#q=`).
- Press ESC for the pause menu, which holds settings, languages (English / Bahasa Indonesia), controls and the share options.

---

## Project layout

The game is maintained as small modules in `src/`. `build.mjs` joins them into the single HTML file.

```
build.mjs              Node build: src/ -> dist/voidborne.html  (no dependencies); --debug -> dist/voidborne.debug.html
package.json           npm scripts (format, build, build:debug, test:seeds, test:shots, bench)
.prettierrc.json       Prettier settings (npm run format)
tools/seed-test.mjs    headless multi-seed test (Playwright) with an HTML report
tools/format-proof.mjs Prettier + proof that only formatting changed (syntax-tree comparison)
tests/shots.mjs        screenshot test: camera bookmarks (tests/bookmarks.json) vs baselines, HTML report
tests/bench.html       benchmark page (open it in a browser); tests/bench.mjs runs it in Chrome and saves the JSON
tests/lib/             shared helpers for the Node test runners
tests/baseline/        screenshot baselines, one folder per renderer (npm run test:shots:baseline) — commit these
tests/current/         the latest screenshots, diffs and report.html (safe to delete)
tests/out/             other reports and test output (safe to delete)
dist/voidborne.html    the deliverable
dist/voidborne.debug.html  the same game plus the test API and benchmark (never ship this one)
src/
  index.html           page shell: HTML + CSS; <!--@STAGES--> is where the code goes
  loader.js            runs the stages one by one and drives the loading bar
  manifest.json        stage order, module order, loading-bar weights
  core/                config (CFG – every tunable lives here), test modes (?det=1 …), platform/storage,
                       boot (WebGL2 context, #seed / #q parsing), seeded RNG, vector/quaternion/matrix math, CPU noise
  i18n/                the text table (TXT, English + Indonesian) and t(id, vars)
  input/               key bindings (BIND / act / isAct), invert-Y and sensitivity settings
  shaders/             GLSL sources as JS template strings (sky, meshes, points, planets, atmosphere,
                       rings, volumetrics, TAA, god rays, composite)
  gl/                  GL helpers and the context-loss registry (GLR)
  geometry/            mesh builders: asteroids, derelict ships, station, creatures, ambient occlusion bake
  world/               the scene: sky bake, star, planets, belt, wrecks, station, secrets, landmarks,
                       creature setup, points of interest, planet / moon types as shader parameter sets
  player/              mouse/touch input, flight model, collision
  creatures/           boids, whale hunting, medusae, creature lights, structure animation
  audio/               audio engine, AudioWorklet (whale song, hiss), zone mood music, star and planet voices
  openworld/           star classes and multiple stars, sector metadata, ship logs, sector generator (Web Worker),
                       streaming, codex and saves, signals/events, warp and autopilot, star map
  tools/               gamepad, photo mode, clip recording, fullscreen, wake lock
  interior/            the explorable wreck: rooms, doors, power panel, sealed vault, datapads
  suit/                scanner, helmet visor, opening sequence, debug overlay
  ui/                  sound captions, language switch and pause-menu settings, key remapping, display and comfort
  options/             gravity, survival, boost debris, Doppler/occlusion, sharing and the daily seed
  render/              HUD and radar, render pipeline, 'ultra' resources, quality presets + first-run auto
                       quality, HD photo capture, main loop
  debug/               debug build only: the test API (window.__VB) and the scripted benchmark
```

## Building

```
node build.mjs            # writes dist/voidborne.html
node build.mjs --check    # also syntax-checks all code together (catches duplicate top-level names)
node build.mjs --watch    # rebuilds whenever something in src/ changes
node build.mjs --debug    # writes dist/voidborne.debug.html (adds src/debug/: test API + benchmark)
npm run build             # same as --check
npm run build:debug       # same as --check --debug
```

Node 18 or newer. The build has no dependencies. The release build fails if the debug API (`__VB`) ends up in
`dist/voidborne.html`: debug-only code goes into `debugStages` in `manifest.json`, never into a normal stage.

### How the output works

- **Stages:** each stage in `manifest.json` is the concatenation of its modules, written as an inert
  `<script type="text/x-vb">` block.
- **Loading:** `loader.js` executes the stages in order as normal global scripts and yields to the browser between them.
  This keeps the page responsive and moves the loading bar. The bar only appears if loading takes more than 0.25 s.
- **Shared names:** every top-level `const`, `let` and `function` is shared by all modules, just like in one big script.

### Rules when editing

- **Adding a module:** create the file under `src/` and add it to a stage in `manifest.json`.
  Order matters: a module can only use names defined earlier at load time.
- **Function hoisting stops at the stage boundary.** Top-level code (code that runs while the page loads)
  can only call functions defined in its own stage or an earlier one. Calls made later, from event handlers
  or the main loop, can reach any module.
- **Never write `</script` inside a module.** It would end the inline script; the build refuses it.
- **World generation must only use the world RNG** (`rnd()`, `rr()`, `pick()`), and must use it at load time only.
  Runtime effects use `ernd()` / `Math.random()`. Otherwise `#seed=` links stop being reproducible.
  The seed test prints a digest of every world; `--compare` against an earlier `--json` report confirms a change didn't move anything.
- **New settings:** new tunables go into `CFG` in `src/core/config.js`, with a comment. Every UI string goes into the text table in
  `src/i18n/` in both languages. Procedural names stay language-neutral.
- **Expensive features** need a quality switch (`QUAL` in `world/scene-setup.js`): `low` disables them or uses a cheap variant.
- **Formatting:** run `npm run format` before committing. It refuses to write a file whose syntax tree would change.

## Quality presets, `ultra`, photos and comfort (Phase 6B)

`low`, `medium` and `high` look exactly as before (the 29 screenshot bookmarks from 6A pass with 0 differing pixels).
Everything new for them is off by default or a setting.

### Which preset the game starts with

1. `#q=low|medium|high|ultra` in the link always wins (it is not saved).
2. Otherwise the remembered setting: a choice in the pause menu, or the auto-detected preset.
3. Otherwise on touch devices `CFG.MOBILE_QUALITY` (unchanged).
4. Otherwise, on the very first desktop run, **auto quality** measures the opening sequence (after BEGIN): 1 s warm-up,
   then `CFG.AUTO_QUALITY_SECONDS` at `high` with the dynamic scaler held. Median frame time below
   `CFG.AUTO_QUALITY_MS[0]` (22 ms) gives `high`, below `[1]` (36 ms) `medium`, otherwise `low`. It never picks
   `ultra`; a machine that manages fewer than 3 frames in 20 s gets `low`. The result is remembered
   (`SETTINGS.qSrc = 'auto'`, `SETTINGS.qProbe` keeps the measured median) and the probe never runs again by itself
   (if the first run ends before the measurement does, the next run measures instead: `SETTINGS.qSrc = 'pending'`).
   **DETECT QUALITY AGAIN** in the pause menu repeats it (the game resumes to measure). Choosing a preset while it
   measures, or before it starts, cancels it for good. It does not run with any test flag in the URL.

The pause menu shows where the current preset came from ("set by: …"). `CFG.AUTO_QUALITY = false` turns the probe off.

### `ultra`

`ultra` = `high` plus the items below. They are prepared a little per frame (`CFG.ULTRA_BUDGET_MS` of main-thread
time, at most one GPU-heavy bake strip per frame; all at once when the URL has a test flag) and switch on together
once ready; until then `ultra` renders like `high` at the higher scale. The dynamic resolution scaler still lowers the
render scale (down to `CFG.MIN_RENDER_SCALE`, as before). Leaving `ultra` frees the big sky cubemap.

| item | CFG switch | what it does |
|------|------------|--------------|
| supersampling | `SS_MAX` (1.5), `ULTRA_MAX_PIXELS` | render scale ceiling above 1.0, capped at 8.3 Mpx internal and the GPU limits |
| DPR cap | `MAX_DPR` (3) | canvas resolution on displays above 2× (other presets keep 2 / `MOBILE_DPR`) |
| sky | `ULTRA_SKY` (2048) | mipmapped, anisotropic 2048² sky cubemap, baked a strip per frame (0 = keep the 1024 bake) |
| baked textures | `ULTRA_TEXTURES`, `ULTRA_TEX_SIZE` | tileable hull panel atlas + planet detail noise (height + gradient), mipmapped, ≤ `MAX_TEXTURE_SIZE` |
| anisotropic filtering | `ULTRA_ANISO` (8) | `EXT_texture_filter_anisotropic` on all baked textures (clamped to the GPU maximum) |
| planets | `ULTRA_PLANETS` | three more surface octaves faded by pixel footprint (`fwidth`), footprint-sized normal steps, triplanar detail, GGX ocean/ice glints, earlier LOD steps and an ico-7 sphere for a body that fills the view |
| hulls / station | `ULTRA_HULLS` | panel lines, rivets, greebles and grime from the atlas (bent normals), GGX-lobe specular with Fresnel, one Phong-tessellation level (smoother curves). Collision is unchanged |
| creatures | `ULTRA_CREATURES` | tessellated whales and medusae (smoother silhouettes), whale sparkle faded to its average where it would shimmer |
| stars and sprites | `ULTRA_STARS`, `ULTRA_POINT_MIN` | sky stars as point-spread blobs never narrower than ~1.8 px, sprites (dust, minnow glow, far stars) never smaller than that, both with the same total light: no sub-pixel flicker |
| volumetrics | `ULTRA_VOL_STEPS` (40) | ray-march steps of the nebula pockets (high: 28) |

Cost table: see "Phase 6B cost table" below.

### HD photos

Photo mode saves `CFG.PHOTO_SCALE` × the canvas size (pause menu PHOTO RESOLUTION 1×–4×, default 2×; 1× = the old
canvas capture). The frame is rendered offscreen at that size; with TAA on, `CFG.PHOTO_FRAMES` frames are accumulated
(the scene is frozen in photo mode). Up to `CFG.PHOTO_ONEPASS_PIXELS` it is one pass; above that, or when the GPU
cannot allocate it, it is rendered in tiles of up to `CFG.PHOTO_TILE` px with a 64 px guard band and stitched in a 2D
canvas. Tiled photos have no god rays (a tile does not see the whole sun mask); every other screen-space effect uses
whole-image coordinates. If even 512 px tiles fail, the normal canvas capture is saved and a message says so. The
longest side is capped at `CFG.PHOTO_MAX_SIDE` (8192). The debug build's `__VB.screenshot(scale)` uses the same path.

### Pause menu: DISPLAY AND COMFORT

| setting | CFG | notes |
|---------|-----|-------|
| temporal anti-aliasing | `TAA_MODE` | auto (the preset decides, as before) / on / off, independent of the preset (TAA can ghost on small bright stars and fast particles) |
| photo resolution | `PHOTO_SCALE` | 1×–4× |
| field of view | `FOV` | 50°–100° (default 66°); the boost and warp widening stay relative to it |
| interface scale | `UI_SCALE` | 75 %–150 % (CSS `zoom` on the HUD and menus) |
| horizon reference aid | `HORIZON_AID` | a thin line where the view meets the home system's reference plane (world XZ) and two fixed level ticks |
| edge vignette when rolling fast | `ROLL_VIGNETTE` | auto (only with REDUCE MOTION AND FLASHING) / on / off |

All are remembered. The start screen carries a photosensitivity notice. The vignette and the horizon aid are page
overlays: they never appear in screenshots or photos.

### `gl_FragDepth` scope

`CFG.FRAGDEPTH_SCOPE = 'large'` draws the small additive creatures (minnows, medusae, meteors) with a program that
does not write `gl_FragDepth` (vertex log depth only). Measured result and decision: see the cost table section.
The default stays `'all'` (no measurable gain, see below).

### Phase 6B cost table

**Estimated** = reasoning about the work added, for a desktop GPU; not measured. **Measured** = SwiftShader (software
rendering on 2 CPU cores), `?det=1`, 480×270 canvas, six fixed camera shots (spawn, ocean planet close, wreck,
station, whale, belt), median of 4 frames per shot, each frame timed with a `readPixels` sync, summed over the six
shots. Each switch was turned off on its own with `?cfg=` while everything else stayed `ultra`. Repeated runs of the
same build differ by about ±5 % (±800 ms on these sums), so smaller deltas are not measurable here. SwiftShader is
CPU-bound and has no early-Z, so these numbers say nothing reliable about frame rates on a real GPU.

| item | CFG switch | estimated (real GPU) | measured: sum with the item off (ultra, all on = 15 493 ms) |
|------|------------|----------------------|-------------------------------------------------------------|
| supersampling 1.5× | `SS_MAX` | every screen-sized pass × 2.25 pixels: roughly +70–120 % GPU time when fill-bound; MSAA targets × 2.25 (1080p: ~66 MB → ~150 MB) | 13 565 ms (−1 928, −12 %) |
| DPR cap 3 | `MAX_DPR` | only on displays above 2×: pixels × up to 2.25 | not measured (the test canvas is 1×) |
| sky 2048² mipmapped | `ULTRA_SKY` | ~0 per frame (one cube fetch, as before); ~134 MB VRAM instead of ~25 MB; 24 bake strips once | 16 367 ms (+874: noise) |
| panel + detail textures | `ULTRA_TEXTURES`, `ULTRA_TEX_SIZE` | ~11 MB VRAM; 8 bake strips once | (part of the two rows below) |
| anisotropic 8× | `ULTRA_ANISO` | a few % on textured surfaces | 15 833 ms (+340: noise) |
| planet detail | `ULTRA_PLANETS` | +9 value-noise evaluations and 6 texture fetches per planet pixel, ico-7 sphere (327 k triangles) for a body that fills the view: the planet pass +40–80 % when a planet fills the screen | 11 857 ms (−3 636, −23 %); the ocean-planet shot alone 5 318 → 2 115 ms |
| hull / station detail | `ULTRA_HULLS` | 3 texture fetches + GGX per hull pixel, 4× hull triangles: +5–15 % of the mesh pass | 15 136 ms (−357: noise); wreck shot 1 021 → 941, station 3 001 → 2 758 ms |
| creatures | `ULTRA_CREATURES` | 4× whale / medusa triangles: small | 14 699 ms (−794, −5 %); whale shot 708 → 406 ms |
| stars and sprites | `ULTRA_STARS` | one extra exp per star cell: negligible | 15 531 ms (+38: noise) |
| volumetric steps 40 | `ULTRA_VOL_STEPS` | the nebula pass +43 % while a pocket is on screen | 16 212 ms (+719: noise; no nebula in these shots) |
| all of `ultra` vs `high` | `#q=` | about 2–2.5× the GPU time of `high` when fill-bound (estimate) | `high` on the same shots: 9 573 ms; `ultra` 15 493 ms (1.6×) |

`low`, `medium`, `high` before (6A release) and after (6B) on the same six shots, several alternating runs each:

| preset | 6A (ms, runs) | 6B (ms, runs) | difference |
|--------|---------------|---------------|------------|
| low | 8 675, 8 934 | 8 850, 8 862 | +0.6 % (noise) |
| medium | 9 685, 9 698 | 9 881, 9 516 | +0.1 % (noise) |
| high | 10 228, 10 018, 10 312, 10 332, 10 780, 10 560 (mean 10 372) | 10 690, 10 562, 10 678, 10 801, 10 631, 10 579, 10 235, 9 573 (mean 10 469) | +0.9 % (noise) |

Their programs, meshes, textures and draw calls are the same as before (the 29 screenshot bookmarks are pixel-identical;
the benchmark's draw-call averages match within the path variation). The release file grew from 411 935 to 475 887 bytes.

`gl_FragDepth` scope, `high`, three shots with minnow schools and medusae in view (same method): `'all'` 2 637 and
2 925 ms, `'large'` 2 903 and 2 612 ms. No measurable difference, so `FRAGDEPTH_SCOPE` stays `'all'` and the depth
of those creatures is exactly as before. On a real GPU, skipping `gl_FragDepth` can keep early depth testing for
those draws; measure it there with `npm run bench -- --presets high --cfg FRAGDEPTH_SCOPE:large`.

## Star classes and multiple stars (Phase 6C)

Generated systems get a star class and, sometimes, companions. **The home system is unchanged** (unless
`CFG.HOME_STAR_VARIETY` is on), and so is every system's existence, position and name: the class comes from a random
stream of its own (seed + cell + a salt), not from the one the old sector summary or the sector generator use.
`CFG.STAR_VARIETY = false` brings back the old stars exactly (`node tests/shots.mjs --cfg STAR_VARIETY:false` matches
the 6B screenshots pixel for pixel).

| class | weight | radius (m) | light | luminosity (habitable distance ∝ √L) | gravity ×* | notes |
|-------|--------|------------|-------|-----------------------------------|-----------|-------|
| M red dwarf | 30 | 75–120 | 0.74, deep orange | 0.12 | 1.4 | dark orange disc, red corona |
| K orange dwarf | 22 | 120–190 | 0.88, warm | 0.45 | 1.15 | |
| G yellow dwarf | 18 | 170–260 | 1.0 (the home star's light) | 1 | 1 | looks like the home star |
| F white star | 12 | 200–300 | 1.1, white | 2.2 | 0.9 | |
| O blue giant | 4 | 360–480 | 1.32, blue-white | 9 | 0.55 | large corona |
| D white dwarf | 7 | 28–45 | 0.92, cold white | 0.06 | 20 | tiny, corona 10× its radius |
| N neutron star | 1 | 14–20 | 0.68, violet-white | 0.02 | 300 | slow flicker (off with reduce motion), corona 18× |

\* on top of the old rule (pull ∝ radius³ × `STAR_MASS`): compact stars pull much harder than their size says; their
reach scales with the cube root of the factor. Gravity only acts with `CFG.GRAVITY` on; every star of a system pulls
(the dominant body wins, as before) and every star is solid (collision sphere, radius + 6 m).

Measured over 3,646 generated systems (seeds 1337, 42 and 7, up to 10 sectors around home): single 81 %, close pair
11.6 %, wide pair 5.4 %, triple 2.3 %; primaries M 29 %, K 23 %, G 20 %, F 15 %, D 6 %, O 5 %, N 1 %.

**Multiple stars** (`BINARY_CHANCE` 0.2, `TRINARY_SHARE` 0.12, `WIDE_SHARE` 0.3, cap `MAX_STARS` 3):

- *close pair*: the two stars circle their centre of mass (one turn in `BINARY_PERIOD` 600–1500 s); the planets orbit
  the pair beyond `BINARY_CLEAR` (3.2) separations, the stable circumbinary zone (Holman & Wiegert 1999: 2–4).
- *wide pair*: a companion 25–32 km out (`WIDE_DIST`); the planets keep orbiting the primary, all within 0.28 × that
  distance (stable S-type orbits); its light reaches them at `WIDE_LIGHT` (0.15) strength: a faint second shadow.
- *triple*: a close pair plus a distant third star. The third shines in the sky but lights nothing (two lights at most).

**Lighting.** Planets, moons, clouds, atmospheres (the raymarched one and the low-quality rim), rings, wrecks and the
sector beacon are lit by the system's primary in its class colour and intensity, and by a second star when there is
one (`STAR_LIGHTS` = 2): a second terminator, a second ring shadow on the planet, a second planet shadow on the ring,
night-side city lights only where neither star shines. The lens flare, the flare flash and the warm colour grade near a
star follow the nearest star's colour. Shader changes (all behind a uniform test, `uStar2.w > 0`, so a system with one
star runs exactly the old code — verified pixel for pixel): `PLANET_FS` (+ `ringShadow`, `specL`, star palette
`uCol2/uCol3` and flicker `uAtmoK` for type 7), `ATMO_FS` (the second star's scattering inside the same 8-step loop),
`ATMO_RIM_FS`, `RING_FS`, `MESH_FS` (`shade()`; the second light uses the Blinn-Phong lobe in every preset),
`CORONA_FS` (`uCorA/uCorB/uFlick`), `COMP_FS` (`uSunTint/uFlareCol`). No loops over lights.

**Light plausibility** (`PLAUSIBILITY` 0.75, `HZ_BASE` 2400 m): the habitable distance of a system is
`HZ_BASE × √(total luminosity)`. A living world closer than 0.6 × that becomes a lava world, farther than 1.7 × an ice
world; a lava world beyond 1.3 × becomes ice; an ice world inside 0.6 × becomes lava — each with probability 0.75 from
a hash of its own (soft: some odd worlds stay). Only those three types swap, because they draw the same random numbers:
the rest of the sector is generated exactly as before.
Measured with the main-thread generator (seeds 1337 and 42, 708 systems, 2,490 planets): ice worlds 24.7 % → 32.9 %,
lava worlds 12.3 % → 10.0 %, living worlds 12.6 % → 6.6 %; rocky worlds (27.1 %) and gas giants (23.3 %) unchanged.
Living worlds halve, mostly around the many dim red dwarfs, whose habitable band lies inside the first planet orbit.
`PLAUSIBILITY: 0` gives back the old distribution exactly.

**What changes for existing seeds.** In the home system: nothing — every home screenshot bookmark matches the 6B
baseline pixel for pixel. The distant dots of other systems keep their pre-6C colour and size by default:
`SKY_CLASS_DOTS: true` gives them their class colour and size and a dot per distant companion (views from home then
differ in those dots only: 0.06–0.21 % of the pixels of the home bookmarks, a few of them just over the 0.2 %
screenshot tolerance). In other systems: the star's look, size and light; one system in five gets companions; for close pairs every planet sits farther
out and the wrecks, beacon and medusae may move (their placement avoids the stars); ice / lava / living worlds may swap
as above. Positions, names and existence of all systems, and the number, sizes, names and order of their planets, stay
the same.

**Sound, scanner, codex.** Each class has a quiet synthesized signature from the star (`STAR_VOICE`, within
`STAR_VOICE_RANGE` 9 km): a rumble (M), a hum (K, G), a hiss (F), a roar of filtered noise (O), a thin beating whistle
(D), a slow tick (N); a close pair beats against its detuned twin. Captioned (`cap.star*`). The scanner gives every
class its own name, age range, composition (a white dwarf is carbon and oxygen), status and lore, and names the
companions; scanned stars go to the codex in the current language. The map shows the class and the companions.

**Cost** (`STAR_LIGHTS` 1 removes the second light; `STAR_VOICE` false removes the voice). Estimated: the second light
adds one lighting term per pixel of the objects of a multiple system (and 8 scattering samples to an atmosphere seen
there); nothing anywhere else. Measured in SwiftShader (480×270, `high`, median of 6 frames, two runs each): a planet
of a close pair filling the screen 1,039 ms with two lights, 975 ms with one (+6.5 %); the pair itself, a wide-pair
planet and the home spawn: no difference beyond the ±5 % noise.
6B → 6C on the six home shots used for the 6B numbers (sum of medians, two interleaved runs each, SwiftShader):
low 9,841 / 9,139 → 9,840 / 9,546 ms, medium 10,357 / 10,003 → 10,540 / 10,252 ms, high 11,239 / 9,945 → 11,109 /
11,145 ms — inside the run-to-run spread (up to 13 % in these runs), so no regression is measurable here.

## New planets and moons (Phase 6D)

**One planet shader, parameter sets.** The planet shader no longer has a branch per type: every body carries a set of
80 numbers (`uniform vec4 uPP[20]`, layout and every type's values in `src/world/planet-types.js`): height terms (fbm,
craters, voronoi cracks, ridged dunes), displacement, sea level band, ice caps, colour ramp, speckle and patches, crack
colour, specular (sea and land), emission (glowing cracks and pools, colours), cloud cover and colour, night lights,
waves, gas bands (strength, frequency), a hot night side, tidally locked day / night zones, crystal facets, sulfur
vents, sun glint, aurora, glowing haze and the lobes of irregular moons. A new type is a new entry in `PSETS` plus a
palette, texts and weights. The five old types and the moon are exact parameter sets: 46 of the 50 pre-6D bookmarks
(every home view and every old planet type, the `ultra` ones included) match their baselines pixel for pixel; the other
4 show generated sectors and match exactly with `--cfg PLANET_VARIETY:false`. The cloud layer and the rings take their colour, cover
and gaps from the set too (`uRingGap`, `uRingCol`; none = the old ring).

The new features are compiled only into a second build of the same source (`#define PEXT`, linked in the background
the first time a sector with such a body loads; until then those bodies use the classic build). SwiftShader runs both
sides of a branch, so one shader with every feature behind uniform tests cost 10–40 % more on the old planets there;
with the split the old planets cost what they cost in 6C (see Cost).

**New types** (generated sectors only; the home system is not generated by the sector generator and is unchanged):

| type | id | look | where it appears (soft) |
|------|----|------|-------------------------|
| ocean world | 8 | sea level high, a few islands, waves, sun glint, clouds, ice caps | living worlds (30 %), ice worlds in the habitable band |
| desert world | 9 | ridged, warped dunes, dusty atmosphere, sometimes small caps | rocky worlds, more inside 2 × the habitable distance |
| sulfur world | 10 | sulfur vents (pulsing yellow-green glow), acid clouds, yellow haze | rocky worlds close in, lava worlds |
| crystal world | 11 | faceted surface (a tilted plane per cell: sparkle), glowing veins (cyan, violet or green) | rare: rocky and ice worlds |
| tidally locked world | 12 | one face baked, one frozen, a habitable twilight ring (follows the real star direction) | living worlds; 35 % around red and orange dwarfs, 6 % elsewhere |
| hot gas giant | 13 | dark red bands, night side glowing | gas giants inside 1.1 × the habitable distance |
| dwarf planet | 14 | small (0.42 ×), heavily cratered, nitrogen frost | rocky worlds far out, ice worlds |
| rogue planet | 15 | no star: dark, lit by the nearest star at `ROGUE_STARLIGHT`; volcanic cracks, aurora or a glowing haze | starless sectors (`ROGUE_CHANCE`), never next to home |

Special moons: **volcanic** (16, sulfur-yellow, lava cracks, a plume: a glowing column and an umbrella of ballistic
arcs), **geyser** (17, white ice, jets near the south pole that shine in sunlight), **irregular** (18, four broad lobes
and dents: not round). Plumes are particles (`PLUME_PARTICLES` per quality: 32 / 96 / 160 / 256, one draw each, none
beyond `PLUME_RANGE`), at most `PLUME_MOONS_MAX` (2) per sector. Rings: every generated ring gets a colour, its own two
gaps and now and then a steep tilt; a thin ring appears rarely (`RING_EXTRA` 0.03) on a type that never had one.

**How it is chosen.** After the 6C plausibility swap each planet draws once from a stream of its own
(`hash32(sector seed, planet, 0x6d, 1)`, never the world RNG): `variantType` turns it into a new type with
probabilities that depend on its distance from the habitable band and on the primary's class (`NEW_TYPES_SCALE`
scales them all). Special moons and rings use streams of their own too. The world RNG draws exactly as before, so every
planet keeps its orbit, position and order, and old-type planets keep their size, palette and name; a planet that
becomes a new type gets that type's palette and a name from its own syllables (the roman numeral stays).
`PLANET_VARIETY: false` gives back the 6C sectors exactly.

Measured with the generator (seed 1337, 25 × 5 × 25 cells around home, 1,715 systems, 6,009 planets, 4,462 moons):

| | rocky | gas | ice | lava | living | ocean | desert | sulfur | crystal | locked | hot gas | dwarf |
|-|-------|-----|-----|------|--------|-------|--------|--------|---------|--------|---------|-------|
| 6C (`PLANET_VARIETY: false`) | 25.6 % | 24.5 % | 32.8 % | 9.7 % | 7.3 % | – | – | – | – | – | – | – |
| 6D | 18.6 % | 21.7 % | 28.9 % | 8.7 % | 4.0 % | 3.1 % | 2.9 % | 2.2 % | 1.5 % | 1.3 % | 2.8 % | 4.2 % |

New types: 18.0 % of the planets. Moons: 83.9 % ordinary, 2.2 % volcanic, 3.2 % geyser, 10.7 % irregular; 12.8 % of
the systems have a plume moon. Rings: 901 → 1,046 (145 on types that had none). Rogue planets: 44 of 3,125 cells
(1.4 %). With `STAR_VARIETY: false` (no star classes: habitable distance of a sun-like star everywhere) there are more
oceans and hot giants and fewer locked worlds.

**What changes for existing seeds.** Home system: nothing (every home bookmark matches its baseline pixel for pixel;
the world digest of the seed test is unchanged). Other systems: about one planet in six turns into a new type (its
palette, look and name change; its place and orbit do not); about one moon in six becomes special; rings get colours and
gaps; a few planets get a thin ring; dwarf planets are smaller and hot giants a little larger than the planet they
replace. A rare empty sector now holds a rogue planet (seen on the star map only within two sectors or once visited).

**Scanner, codex, sound.** Every new type and special moon has its own class name, age range, composition, status and
lore in English and Indonesian (`src/i18n/strings-6d.js`); scans go to the codex in the current language. The new
types, rogue planets and plume moons have a quiet synthesized voice (`PLANET_VOICE`, within `PLANET_VOICE_RANGE` 4 km
of the surface; `src/audio/planet-voice.js`): surf, dry wind, bubbling vents, crystal chimes, wind along the twilight,
a deep roar, ice creaking, a slow groan; plume moons add eruption bursts. Spatialized and captioned (`cap.p*`,
`cap.moon*`). The old types and the home system stay silent, as before.

**Gravity and collision.** Every new planet and moon pulls like the old ones when `CFG.GRAVITY` is on (∝ radius³, the
dominant body wins): a dwarf planet pulls weakly, the rogue planet like any planet. All are solid (collision sphere,
radius + 3 %); an irregular moon is solid along its own shape (`irregularR`, the same lobes as the shader). Plumes,
clouds, haze and aurora are not solid and exert no gravity.

**Cost.** Estimated first: the old planets run the classic build, so nothing should change for them; a new-type planet pays
only for its own features (a sea's waves, a cloud layer, vents) on the pixels it covers; a plume is one draw of up to
256 points; generation adds one small hash stream per planet. Measured in SwiftShader (480×270, `high`, median of 6
frames per shot, two interleaved runs):

- the six home shots used before (living, rocky, ice, lava, gas giant up close, spawn): 6C 12,232 / 11,629 ms →
  6D 11,858 / 11,253 ms (sum of medians): no regression measurable (the spread between runs is larger).
- new types filling the screen (ms per frame): ocean 1,641–1,724 (the same planet drawn with the classic build:
  1,308; the waves cost ~24 %), desert 1,421–1,585 and crystal 1,692–1,829 (rocky: 1,711–1,722), sulfur
  2,155–2,214 (clouds and vents), hot gas giant 1,077–1,090, dwarf 1,196–1,225, rogue 1,708–1,822; a volcanic moon
  with its plume 412–432 vs 405–417 with plumes off (`PLUME_RANGE` < 0): within the noise. (The tidally locked
  world's shot took 3.7 s, but switching its features off or drawing it with the classic build changed nothing: the
  cost is in that view's scene, not in the type.)
- sector generation on the main thread, 25 sectors: median 3.9–4.0 ms per sector (6C: 4.0–6.5 ms).
- linking the `PEXT` build: SwiftShader compiles lazily, so the link call itself took 15 ms there and the real compile
  happens at the first draw; not measured. Without `KHR_parallel_shader_compile` (SwiftShader has none) a real GPU may
  hitch once, when the first sector with a new type loads.

Switches: `PLANET_VARIETY` false (no new types, special moons or ring variety), `ROGUE_PLANETS` false,
`PLUME_PARTICLES` per quality (0 removes plumes), `PLANET_VOICE` false. Caps: ≤ 5 planets and ≤ 2 moons per planet as
before, ≤ `PLUME_MOONS_MAX` (2) plume moons per sector, one rogue planet per starless sector.

## Formatting

```
npm install                 # once: Prettier 3.8.1 (pinned, so every machine formats the same), acorn, Playwright
npm run format              # format src/, tools/, tests/, build.mjs and the JSON files, with proof
npm run format:check        # only list files that are not formatted (exit 1 if any)
```

`tools/format-proof.mjs` parses every file with acorn before and after Prettier and compares the syntax trees without
positions, comments and quote styles. Template strings (all GLSL) must stay byte-identical. It then does the same for
every build stage as `build.mjs` joins it. A file whose tree changes is not written. The summary goes to
`tests/out/format-proof.json`. HTML and Markdown are not formatted (see `.prettierignore`).

## Test modes

Query parameters (before the `#`). All are off unless the URL asks for them, in the release build as well:

| parameter   | effect |
|-------------|--------|
| `?det=1`    | deterministic run: every frame advances exactly `CFG.DET_DT`; `Math.random` is a seeded stream; `Date.now` is a fixed clock; saved settings and progress are neither read nor written; no dynamic resolution; sectors are generated on the main thread and handed over at the start of a frame; streamed uploads are not time-budgeted. Same build + same URL + same renderer ⇒ same frames |
| `?seeded=1` | only the seeded `Math.random` (real time steps). Used by the benchmark |
| `?noscale=1`| render scale fixed at the preset's scale |
| `?nostore=1`| ignore and do not write `localStorage` |
| `?manual=1` | no frame runs by itself: the debug build's test API steps every frame (a release build just stays frozen) |
| `?cfg=K:v,…`| (6B) override existing `CFG` values for A/B runs, e.g. `?cfg=ULTRA_HULLS:false,SS_MAX:1.25` (numbers, `true`/`false`, text; unknown keys and list values are ignored) |

Any of these flags also keeps the first-run auto-quality probe from running.

Example: `dist/voidborne.html?det=1#seed=1337&q=high`.

### Debug build: `window.__VB`

`dist/voidborne.debug.html` adds `window.__VB` (see `src/debug/vb-api.js`). The release build has none of it and
no hooks for it beyond the test-mode flags above.

| call | what it does |
|------|--------------|
| `getState()` | seed, quality, test flags, frame, time, pose (position, quaternion, velocity, inside a wreck), sector, render size and scale, renderer, worker mode, discoveries |
| `setPose(pos, quat)` / `lookAt(pos, target)` | put the camera somewhere (world coordinates, quaternion `[x, y, z, w]`) |
| `place(spec)` | camera placement by description, as used by `tests/bookmarks.json`: `spawn`, `open`, `nebula`, `star`, `flare`, `planet` (index or type), `moon`, `ringed`, `belt`, `school`, `whale`, `medusa`, `wreck`, `breach`, `interior`, `station`, `landmark` (black hole / pulsar), `sector`, `pos`. Phase 6C: `starclass` (`cls` M/K/G/F/O/D/N and/or `kind` single/close/wide/triple: the nearest such generated system) and `sysplanet` (planet `index` of such a system, seen from the side). Phase 6D: `ptype` (the nearest planet of `type` 8–15, moon of type `moon` 16–18, or with `ring: 1` a rare ring; `plume: 1` shows a plume side-on, `side` 0–1 turns toward the terminator, `nth` skips matches) |
| `setTime(t)` | set the simulation clock (s): planet spin, moon orbits, wreck tumble, whale paths, pulsar, shader animation. Integrated state (boids, velocities) is not rewound |
| `freeze()` / `unfreeze()` / `step(n)` | stop / restart the frame loop; run n frames synchronously (exactly `CFG.DET_DT` each with `?det=1`). `?manual=1` starts frozen |
| `settle()` | async: wait until streamed sectors are generated and uploaded |
| `setQuality(q)` | the pause-menu quality selector's code path (`low`, `medium`, `high`, `ultra`); in test modes the fixed render scale follows the preset |
| `listObjects()` | planets, moons, stars, wrecks, station, anomalies, landmarks, creatures, nebulae, belt — kind, name, position, radius, sector, solid |
| `raycast(origin, dir)` | nearest hit against solids (spheres for bodies, station and landmarks, a capsule along each wreck hull) |
| `screenshot(scale)` | scale 1: one frame, canvas read back. Any other scale: the release build's offscreen HD capture (one pass or tiles, TAA frames accumulated), returns `{ png, width, height, scale, tiles, frames, ms }` or `{ error }` |
| `ultra()` | state of the `ultra` preparation: ready, failed, time to ready, compiled variants, texture and cube sizes, tessellated meshes |
| `glErrors()` | drain and name pending WebGL errors |

With `?bench` the debug build also runs the scripted benchmark (`src/debug/bench.js`).

## Seed test

```
npm install
npx playwright install chromium
node build.mjs
node tools/seed-test.mjs                    # 20 default seeds, including 1, 77 and 9999
node tools/seed-test.mjs --seeds 1337,7,42  # specific seeds
node tools/seed-test.mjs --count 50 --start 100
node tools/seed-test.mjs --swiftshader      # machines without a GPU (CI); slower
node tools/seed-test.mjs --browser firefox  # also webkit (WebGL2 support varies)
node tools/seed-test.mjs --json report.json --quality medium --headed --chrome /path/to/chrome
node tools/seed-test.mjs --compare report.json   # fail any seed whose digest differs from that earlier report
```

The HTML report goes to `tests/out/seed-report.html` (`--html <file>` to change, `--no-html` to skip).

For every seed it loads the page, renders a few frames and then checks:

| column  | what it checks |
|---------|----------------|
| errors  | no page errors or console errors while loading, rendering and testing |
| breach  | wreck 0 has a hull breach, and flying in through it really puts you inside the hull |
| chain   | the interior goal chain completes with real collision: engineering door → corridor → the vault refuses to open without power → power panel → seal released → artifact reached and discovered |
| overlap | no two planets overlap (with a 10 % atmosphere margin) and no moon sits inside another planet |
| star    | nothing spawns inside the star: planets, moons, wrecks, station, anomalies, landmarks, whale paths, minnow schools, medusae, the asteroid belt |
| rings   | warning only: a planetary ring passes through another planet |
| worker  | the sector worker started, and for every existing neighbour sector of the home system the worker output is bit-identical to the main-thread fallback |
| sectors | the neighbour sectors: no NaN, caps (≤ 5 planets, ≤ 2 moons per planet, ≤ 2 wrecks), no planet overlap, nothing inside the sector star or a planet. Moon orbits crossing a planet are a warning only. Phase 6C: every star of the system (≤ `MAX_STARS`, a known class, no NaN), nothing inside any star or inside the sphere a close pair sweeps, planets of a close pair beyond `BINARY_CLEAR` separations and of a wide pair within 0.28 × the companion's distance; the classes and kinds found are summed up after the table. Phase 6D: every planet and moon of a known type, a full parameter set for the new types, rings outside their planet, at most `PLUME_MOONS_MAX` plume moons, irregular moons (shape factor 1–1.7) clear of their planet; rogue planets in 13 × 3 × 13 sectors around home, never next to it and alone in a starless sector (the two nearest are generated and compared worker vs main too); the planet / moon types found are summed up after the table |
| digest  | hash of the home world and the neighbour sectors (numbers rounded to 3 decimals). Informational unless `--compare` is given |

The simulation-based checks pause rendering, so the result does not depend on the frame rate.
The exit code is 1 if any seed fails, so it can gate CI:

```yaml
# .github/workflows/seeds.yml
on: [push]
jobs:
  seeds:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npx playwright install --with-deps chromium
      - run: node build.mjs --check
      - run: node tools/seed-test.mjs --swiftshader
```

## Screenshot test

```
npm run build:debug
npm run test:shots:baseline                 # capture baselines into tests/baseline/<renderer>/
npm run test:shots                          # compare tests/current/ with the baselines; report: tests/current/report.html
npm run test:shots -- --repeat 2            # also render each bookmark twice: proves ?det=1 is deterministic here
npm run test:shots -- --only star-corona-1337-high,belt-1337-high
```

`tests/bookmarks.json` holds 64 camera bookmarks on four seeds (1337, 77, 7, 42): open space, nebulae, the star and
its corona, a stellar flare, every planet type (rocky, gas giant, ice, lava, living by day and by night), a moon, the
ringed planet, the belt, a minnow school, a whale, a medusa swarm, wreck 0 from outside, its breach and its interior,
the station, the black hole, the pulsar, whole-system views on `low` and `medium`, and a neighbouring sector.
Phase 6B added 11 for `ultra`: seven `-ultra` repeats of existing views (open space, rocky / ice / living planet,
whale, wreck 0, station) and two high/ultra pairs up close (`hull-close`, `planet-close`), for side-by-side checks.
Phase 6C added 10 for star classes and multiple stars: a red dwarf, a blue giant, a white dwarf, a neutron star (seed
7), a close pair, a planet of a close pair on `high` and on `low`, a planet of a wide pair, a triple, and the home star
with `HOME_STAR_VARIETY` (a bookmark may carry its own `"cfg"`, added to the URL as `?cfg=`). `--cfg K:v,…` adds CFG
overrides to every bookmark: `node tests/shots.mjs --cfg STAR_VARIETY:false` must match the 6B baselines exactly (all
but the 10 6C bookmarks, which need star classes).
Phase 6D added 14 for the new planets and moons (seed 1337, the nearest of each): an ocean world, a desert world (also
on `low`), a sulfur world, a crystal world (also on `ultra`, the `PEXT` + `ULTRA` build), a tidally locked world from
the twilight side, a hot gas giant, a dwarf planet, a rogue planet, a volcanic moon and a geyser moon with their plumes
side-on, an irregular moon and a rare ring on a planet that never had rings. `--cfg PLANET_VARIETY:false` must match
the 6C baselines (all but those 14).
Each one loads the debug build with `?det=1&manual=1`, places the camera (`__VB.place`), runs a fixed number of frames
and captures the canvas. A shot fails on a pixel difference beyond the tolerance, a page error or a WebGL error. A
bookmark without a baseline gets one and is reported as NEW (nothing compared).

**Limits.** A baseline is only comparable with images from the same renderer type, browser build and machine class.
By default the test renders with SwiftShader (software WebGL): slow, the same pixels wherever the same Chromium build
runs, but a Playwright or Chromium upgrade can change them. `--gpu` (with `--headed`) uses the real GPU instead;
baselines are kept per renderer (`tests/baseline/swiftshader/`, `tests/baseline/<gpu-name>/`), so they never mix.
These images check what the game draws. They say nothing about real performance — that is what the benchmark is for.

**Re-baselining** (after an intended visual change, or after upgrading Playwright/Chromium):
1. `npm run build:debug`, then `npm run test:shots` and open `tests/current/report.html`.
2. Check that every red area in the diffs is a change you meant to make, and nothing else moved.
3. Accept: `npm run test:shots:baseline` (all bookmarks) or `npm run test:shots -- --only <names> --update`.
4. Commit `tests/baseline/` together with the code change, and say in the commit message why the images changed.

## Benchmark

```
npm run build:debug
npm run bench                               # Chrome window, frame-rate limit off: low, medium, high · 30 s each
npm run bench -- --presets high --seconds 60 --size 1920x1080 --channel chrome
npm run bench -- --presets ultra --cfg ULTRA_HULLS:false   # A/B: cost of one ultra item (see the cost table)
```

Or open `tests/bench.html` in a browser and press *Start* (there the frame rate is capped at the display's refresh
rate). Every preset runs the same scripted 8-shot path (wreck, station, inside the belt, ringed planet, a planet filling
the view, a minnow school, the star, the whole system) at its own render scale, after a 3 s warm-up. It is meant for
real devices; numbers from software rendering mean nothing.

The JSON (`npm run bench` saves it to `tests/out/bench-<date>.json`; the page has a download button) holds, per preset:

| field | content |
|-------|---------|
| `frame` | frame time from the browser's frame callbacks: average, p50, p95, p99, max, fps, share of frames over 33 ms |
| `cpuMainThread` | main-thread time per frame (simulation + render submission) |
| `cpuSystems` | main-thread ms per frame for each wrapped game function (`updateMinnows`, `render`, `audioTick`, …) |
| `gpu` | GPU ms per frame and per render pass (`scene`, `resolve`, `volumetrics`, `taa`, `bloom`, `godrays`, `composite`, `pre`, `other`) — only when the browser offers `EXT_disjoint_timer_query_webgl2`, otherwise `null` (`gpuTimer` says which) |
| `drawCalls` | draw calls per frame (average, max) |
| `shots` | the same numbers for each of the 8 shots |
| `perSecond` | the same numbers for every second of the run, with the render scale |
| `internalSize`, `taa`, `cfgOverrides`, `ultra` | (6B) the render size actually used, whether TAA ran, the `?cfg=` switches, the `ultra` preparation state |

### Per-system budget (fill in from your benchmark JSON)

No numbers are filled in yet: they have to come from real devices. Copy each value from the JSON field named in the
second column; "target" is the budget you decide on (16.7 ms per frame = 60 fps).

Device / browser / GPU: ______  ·  canvas size: ______  ·  date / build: ______

| system | JSON field | low | medium | high | ultra | target |
|--------|------------|-----|--------|------|-------|--------|
| frame time (avg / p95) | `frame.avgMs` / `frame.p95Ms` | | | | | |
| main thread total | `cpuMainThread.avgMs` | | | | | |
| minnow schools (CPU) | `cpuSystems.updateMinnows` | | | | | |
| whales + medusae (CPU) | `cpuSystems.updateWhales` + `updateMedusae` | | | | | |
| player, interior, structures (CPU) | `updatePlayer` + `interiorTick` + `updateStructures` | | | | | |
| streaming (CPU) | `streamTick` + `processUploads` + `sectorUpdate` | | | | | |
| audio + HUD (CPU) | `audioTick` + `updateHUD` | | | | | |
| render submission (CPU) | `cpuSystems.render` | | | | | |
| GPU total | `gpu.avgMs` | | | | | |
| scene pass (GPU) | `gpu.passes.scene` | | | | | |
| volumetrics (GPU) | `gpu.passes.volumetrics` | | | | | |
| TAA (GPU) | `gpu.passes.taa` | | | | | |
| bloom (GPU) | `gpu.passes.bloom` | | | | | |
| god rays (GPU) | `gpu.passes.godrays` | | | | | |
| composite (GPU) | `gpu.passes.composite` | | | | | |
| draw calls | `drawCalls.avg` | | | | | |
| worst shot (avg ms, name) | `shots[]` | | | | | |

## Hosting

The file needs no server-side code, so any static host works.

### GitHub Pages
1. Put `dist/voidborne.html` in the repository as `index.html`, either in the root or in `docs/`.
2. In *Settings → Pages*, choose that branch and folder.
3. Links like `https://<user>.github.io/<repo>/#seed=1234` work as usual. The fragment never reaches the server.

To build on every push, add a workflow that runs `node build.mjs` and deploys `dist/` with `actions/upload-pages-artifact` + `actions/deploy-pages`.

### itch.io
1. Zip a single `index.html` (a copy of `dist/voidborne.html`) and upload it as an **HTML** project, marked *This file will be played in the browser*.
2. Choose a 16:9 viewport such as 1280×720, and enable the *fullscreen button*. Enable *mobile friendly* if you want phones (they should use `#q=low`).
3. Things to check on the embedded page:
   - **Mouse lock:** the game runs inside an iframe. If the mouse does not lock, click-drag-to-look still works, and fullscreen or "open in new window" usually allows locking.
   - **Saves:** progress and settings are stored in the browser for the domain itch serves the game from, so they don't carry over from a copy opened from disk.
   - **Seeds:** `#seed=` links only reach the game if the embed passes the fragment through, so test that on your page.

### What changes when it is served over HTTPS
- **A real origin instead of a file.**
  - The AudioWorklet loads from its Blob URL on the first try; from disk some browsers refuse it, which is why there is a `data:` URL fallback.
  - `localStorage` is scoped to your site, not shared with other local files.
- **Secure-context APIs work reliably.**
  - Clipboard *Copy link*, the Screen Wake Lock and (in some browsers) the Gamepad API need a secure context.
  - When opened from disk, support for these varies by browser. When something is unavailable, the game falls back: *Copy link* shows the link to copy by hand, and the pause menu lists which features are active.
- **A service worker / PWA becomes possible.** Service workers only run on HTTPS (or `localhost`) and must be separate files, so they are deliberately *not* part of the single-file build.
  To make it installable and fully offline after the first visit, add next to `index.html`:
  - `manifest.webmanifest` with `"display": "fullscreen"`, `"orientation": "landscape"`, `"start_url": "./"`, and PNG icons at 192 and 512 px (they have to be real image files).
  - `sw.js` that caches `index.html` on install and answers fetches cache-first, for example:
    ```js
    const C = 'voidborne-v1';
    self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.add('./'))));
    self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
    ```
  - In `src/index.html`: `<link rel="manifest" href="manifest.webmanifest">`, and register the worker only when served over HTTPS:
    `if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');`
    Bump the cache name (`C`) when you publish a new build.
- **No cross-origin isolation headers are needed.** The game doesn't use SharedArrayBuffer.

## Notes
- **Tested only with software rendering.** The included tests were run in headless Chrome with SwiftShader, so real-GPU visuals and frame rates have not been measured by them. `npm run bench` on your machine is the way to get real numbers.
- **Per-feature switches.** All gameplay options (gravity, survival, boost debris, Doppler, occlusion) are off by default. They live in the pause menu and in `CFG`.
