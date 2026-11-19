// Shared helpers for the Node test runners (tools/seed-test.mjs, tests/shots.mjs, tests/bench.mjs).
// Nothing here is part of the game: the game is the single HTML file in dist/.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// tiny argv parser: opt('--name', default) reads "--name value", flag('--name') is true when present
export function cli(argv = process.argv.slice(2)) {
  const opt = (n, d) => {
    const i = argv.indexOf(n);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
  };
  const flag = (n) => argv.includes(n);
  return { opt, flag, argv };
}

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (e) {
    console.error('Playwright is not installed. Run: npm install && npx playwright install chromium');
    process.exit(2);
  }
}

// Flags that make headless Chrome render WebGL2 in software (SwiftShader). Slow, but works without a GPU
// and gives the same pixels on every machine, which is what screenshot baselines need.
export const SWIFTSHADER_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function launch(
  pw,
  { browser = 'chromium', headed = false, swiftshader = false, chrome = null, channel = null, args = [] } = {},
) {
  const launchArgs = ['--autoplay-policy=no-user-gesture-required', ...args];
  if (swiftshader) launchArgs.push(...SWIFTSHADER_ARGS);
  const o = { headless: !headed, args: browser === 'chromium' ? launchArgs : [] };
  if (chrome) o.executablePath = chrome;
  else if (channel) o.channel = channel;
  return pw[browser].launch(o);
}

// short, file-name-safe name for the WebGL renderer, so screenshot baselines are kept per renderer
export function rendererSlug(renderer) {
  const r = String(renderer || 'unknown').toLowerCase();
  if (r.includes('swiftshader')) return 'swiftshader';
  return (
    r
      .replace(/angle \(|\)|direct3d.*|vs_.*|ps_.*|opengl.*/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'unknown'
  );
}

export function writeFile(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return path;
}

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const abs = (p) => resolve(ROOT, p);

// page console errors that come from the browser/driver, not from the game
export const IGNORED_CONSOLE = /GPU stall|GL Driver Message|Automatic fallback to software WebGL/;

export const REPORT_CSS = `body{font:14px/1.45 system-ui,sans-serif;margin:24px;background:#0b0d12;color:#d8dde8}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.meta{color:#8a93a6;margin-bottom:16px}
table{border-collapse:collapse;width:100%;margin:8px 0 16px}th,td{border-bottom:1px solid #222838;padding:6px 8px;text-align:left;vertical-align:top}
th{color:#8a93a6;font-weight:600}.ok{color:#6fdc8c}.fail{color:#ff6b6b;font-weight:600}.warn{color:#ffc857}.new{color:#7cc4ff}
code{font:12px ui-monospace,monospace;color:#b9c3d6}.small{font-size:12px;color:#8a93a6}img{max-width:100%;image-rendering:pixelated;border:1px solid #222838}`;
