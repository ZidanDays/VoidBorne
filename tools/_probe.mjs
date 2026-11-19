import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { abs, launch, loadPlaywright } from '../tests/lib/harness.mjs';
const pw = await loadPlaywright();
const b = await launch(pw, { swiftshader: true });
const page = await (await b.newContext({ viewport: { width: 400, height: 225 } })).newPage();
await page.goto(pathToFileURL(abs('dist/voidborne.debug.html')).href + '?det=1&manual=1#seed=1337&q=medium');
await page.waitForFunction(() => window.__vbReady === true, null, { timeout: 180000 });
const variants = {
  breachA: { at: 'breach', dist: 30, side: 0 },
  breachB: { at: 'breach', dist: 12, side: 0 },
  whaleA: { at: 'whale', index: 0, dist: 1.0 },
  moonInfo: null,
};
const info = await page.evaluate(() => {
  __VB.freeze();
  __VB.start();
  const p = planets.find((x) => x.moons.length);
  const m = p.moons[0];
  return { planet: p.name, pr: p.r, mr: m.r, mdist: m.dist, d: len(sub(m.pos, p.pos)), br: W0.ship.breach, R: W0.ship.R, L: W0.ship.L };
});
console.log(JSON.stringify(info));
for (const [n, v] of Object.entries(variants)) {
  if (!v) continue;
  const png = await page.evaluate((v) => {
    __VB.place(v);
    __VB.step(2);
    return __VB.screenshot(1).png;
  }, v);
  writeFileSync('/tmp/p-' + n + '.png', Buffer.from(png.split(',')[1], 'base64'));
}
await b.close();
