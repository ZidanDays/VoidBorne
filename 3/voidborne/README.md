# VOIDBORNE

A procedural universe in **one self-contained HTML file**: raw WebGL2 and hand-written shaders, Web Audio
synthesis, no images, models, audio files, fonts or libraries, and no network requests. Everything is
generated from a seed when the page opens.

**To play, open `dist/voidborne.html`.** It works offline straight from disk in current Chrome, Firefox and Edge.

- `#seed=1234` in the address gives you another universe.
- `#q=low` helps weaker laptops and phones.
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
                       creature setup, points of interest
  player/              mouse/touch input, flight model, collision
  creatures/           boids, whale hunting, medusae, creature lights, structure animation
  audio/               audio engine, AudioWorklet (whale song, hiss), zone mood music
  openworld/           sector metadata, ship logs, sector generator (Web Worker), streaming, codex and
                       saves, signals/events, warp and autopilot, star map
  tools/               gamepad, photo mode, clip recording, fullscreen, wake lock
  interior/            the explorable wreck: rooms, doors, power panel, sealed vault, datapads
  suit/                scanner, helmet visor, opening sequence, debug overlay
  ui/                  sound captions, language switch and pause-menu settings, key remapping
  options/             gravity, survival, boost debris, Doppler/occlusion, sharing and the daily seed
  render/              HUD and radar, render pipeline, main loop
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

Example: `dist/voidborne.html?det=1#seed=1337&q=high`.

### Debug build: `window.__VB`

`dist/voidborne.debug.html` adds `window.__VB` (see `src/debug/vb-api.js`). The release build has none of it and
no hooks for it beyond the test-mode flags above.

| call | what it does |
|------|--------------|
| `getState()` | seed, quality, test flags, frame, time, pose (position, quaternion, velocity, inside a wreck), sector, render size and scale, renderer, worker mode, discoveries |
| `setPose(pos, quat)` / `lookAt(pos, target)` | put the camera somewhere (world coordinates, quaternion `[x, y, z, w]`) |
| `place(spec)` | camera placement by description, as used by `tests/bookmarks.json`: `spawn`, `open`, `nebula`, `star`, `flare`, `planet` (index or type), `moon`, `ringed`, `belt`, `school`, `whale`, `medusa`, `wreck`, `breach`, `interior`, `station`, `landmark` (black hole / pulsar), `sector`, `pos` |
| `setTime(t)` | set the simulation clock (s): planet spin, moon orbits, wreck tumble, whale paths, pulsar, shader animation. Integrated state (boids, velocities) is not rewound |
| `freeze()` / `unfreeze()` / `step(n)` | stop / restart the frame loop; run n frames synchronously (exactly `CFG.DET_DT` each with `?det=1`). `?manual=1` starts frozen |
| `settle()` | async: wait until streamed sectors are generated and uploaded |
| `setQuality(q)` | the pause-menu quality selector's code path; in test modes the fixed render scale follows the preset |
| `listObjects()` | planets, moons, stars, wrecks, station, anomalies, landmarks, creatures, nebulae, belt — kind, name, position, radius, sector, solid |
| `raycast(origin, dir)` | nearest hit against solids (spheres for bodies, station and landmarks, a capsule along each wreck hull) |
| `screenshot(scale)` | render at `scale ×` the canvas size and return `{ png, width, height, scale, clamped }`, clamped to the GPU's limits, or `{ error }` if it cannot allocate |
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
| sectors | the neighbour sectors: no NaN, caps (≤ 5 planets, ≤ 2 moons per planet, ≤ 2 wrecks), no planet overlap, nothing inside the sector star or a planet. Moon orbits crossing a planet are a warning only |
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

`tests/bookmarks.json` holds 29 camera bookmarks on four seeds (1337, 77, 7, 42): open space, nebulae, the star and
its corona, a stellar flare, every planet type (rocky, gas giant, ice, lava, living by day and by night), a moon, the
ringed planet, the belt, a minnow school, a whale, a medusa swarm, wreck 0 from outside, its breach and its interior,
the station, the black hole, the pulsar, whole-system views on `low` and `medium`, and a neighbouring sector.
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

### Per-system budget (fill in from your benchmark JSON)

No numbers are filled in yet: they have to come from real devices. Copy each value from the JSON field named in the
second column; "target" is the budget you decide on (16.7 ms per frame = 60 fps).

Device / browser / GPU: ______  ·  canvas size: ______  ·  date / build: ______

| system | JSON field | low | medium | high | target |
|--------|------------|-----|--------|------|--------|
| frame time (avg / p95) | `frame.avgMs` / `frame.p95Ms` | | | | |
| main thread total | `cpuMainThread.avgMs` | | | | |
| minnow schools (CPU) | `cpuSystems.updateMinnows` | | | | |
| whales + medusae (CPU) | `cpuSystems.updateWhales` + `updateMedusae` | | | | |
| player, interior, structures (CPU) | `updatePlayer` + `interiorTick` + `updateStructures` | | | | |
| streaming (CPU) | `streamTick` + `processUploads` + `sectorUpdate` | | | | |
| audio + HUD (CPU) | `audioTick` + `updateHUD` | | | | |
| render submission (CPU) | `cpuSystems.render` | | | | |
| GPU total | `gpu.avgMs` | | | | |
| scene pass (GPU) | `gpu.passes.scene` | | | | |
| volumetrics (GPU) | `gpu.passes.volumetrics` | | | | |
| TAA (GPU) | `gpu.passes.taa` | | | | |
| bloom (GPU) | `gpu.passes.bloom` | | | | |
| god rays (GPU) | `gpu.passes.godrays` | | | | |
| composite (GPU) | `gpu.passes.composite` | | | | |
| draw calls | `drawCalls.avg` | | | | |
| worst shot (avg ms, name) | `shots[]` | | | | |

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
