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
build.mjs              Node build: src/ -> dist/voidborne.html  (no dependencies)
package.json           npm scripts (build, watch, test:seeds)
tools/seed-test.mjs    headless multi-seed test (Playwright)
dist/voidborne.html    the deliverable
src/
  index.html           page shell: HTML + CSS; <!--@STAGES--> is where the code goes
  loader.js            runs the stages one by one and drives the loading bar
  manifest.json        stage order, module order, loading-bar weights
  core/                config (CFG – every tunable lives here), platform/storage, boot (WebGL2 context,
                       #seed / #q parsing), seeded RNG, vector/quaternion/matrix math, CPU noise
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
```

## Building

```
node build.mjs            # writes dist/voidborne.html
node build.mjs --check    # also syntax-checks all code together (catches duplicate top-level names)
node build.mjs --watch    # rebuilds whenever something in src/ changes
npm run build             # same as --check
```

Node 18 or newer. The build has no dependencies.

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
  `tools/seed-test.mjs` plus a quick digest of planet and wreck positions is a good way to confirm a change didn't move anything.
- **New settings:** new tunables go into `CFG` in `src/core/config.js`, with a comment. Every UI string goes into the text table in
  `src/i18n/` in both languages. Procedural names stay language-neutral.
- **Expensive features** need a quality switch (`QUAL` in `world/scene-setup.js`): `low` disables them or uses a cheap variant.

## Seed test

```
npm install --save-dev playwright
npx playwright install chromium
node build.mjs
node tools/seed-test.mjs                    # 20 seeds (1..20)
node tools/seed-test.mjs --seeds 1337,7,42  # specific seeds
node tools/seed-test.mjs --count 50 --start 100
node tools/seed-test.mjs --swiftshader      # machines without a GPU (CI); slower
node tools/seed-test.mjs --browser firefox  # also webkit (WebGL2 support varies)
node tools/seed-test.mjs --json report.json --quality medium --headed --chrome /path/to/chrome
```

For every seed it loads the page, renders a few frames and then checks:

| column  | what it checks |
|---------|----------------|
| errors  | no page errors or console errors while loading, rendering and testing |
| breach  | wreck 0 has a hull breach, and flying in through it really puts you inside the hull |
| chain   | the interior goal chain completes with real collision: engineering door → corridor → the vault refuses to open without power → power panel → seal released → artifact reached and discovered |
| overlap | no two planets overlap (with a 10 % atmosphere margin) and no moon sits inside another planet |
| star    | nothing spawns inside the star: planets, moons, wrecks, station, anomalies, landmarks, whale paths, minnow schools, medusae, the asteroid belt |
| rings   | warning only: a planetary ring passes through another planet |

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
- **Tested only with software rendering.** The included tests were run in headless Chrome with SwiftShader, so real-GPU visuals and frame rates have not been measured by them.
- **Per-feature switches.** All gameplay options (gravity, survival, boost debris, Doppler, occlusion) are off by default. They live in the pause menu and in `CFG`.
