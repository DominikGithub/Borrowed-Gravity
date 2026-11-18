// Screenshot tour + end-to-end smoke test.
// An autoplayer plays a level using only the Shift key, reading the same
// signals a player sees (preview end, kindle gauge, flare timing, focus),
// and saves screenshots of each mode along the way.
//
//   npm i --no-save puppeteer-core
//   CHROME=/path/to/chrome node tools/screenshot-tour.mjs <levelIndex> <outDir> [width height]
//   (TITLE=1 / MAP=1 also capture the title screen and sky map)
//
// Exits non-zero if the level isn't completed or the page logs errors.
// Run `npm run build` first; it plays dist/borrowed-gravity.html.
import fs from 'fs';
import path from 'path';
let puppeteer;
try { ({ default: puppeteer } = await import('puppeteer-core')); } catch {
  console.error('puppeteer-core is not installed: npm i --no-save puppeteer-core'); process.exit(2);
}
const CHROME = process.env.CHROME || ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
if (!CHROME) { console.error('Set CHROME=/path/to/chrome'); process.exit(2); }
const PAGE = 'file://' + path.resolve(new URL('../dist/borrowed-gravity.html', import.meta.url).pathname);
const [li, OUT, W = 1280, H = 720] = [+process.argv[2], process.argv[3], +(process.argv[4] || 1280), +(process.argv[5] || 720)];
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('borrowed-gravity-v1', JSON.stringify({ unlocked: 10, best: {}, photos: {} })));
await page.goto(PAGE);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = (fn, arg, timeout = 120000) => page.waitForFunction(fn, { timeout, polling: 40 }, arg);
let holding = false;
const down = async () => { if (!holding) { holding = true; await page.keyboard.down('Shift'); } };
const up = async () => { if (holding) { holding = false; await page.keyboard.up('Shift'); } };
const shots = new Set();
const shot = async (name) => { if (shots.has(name)) return; shots.add(name); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };

await until(() => window.game && window.game.frames > 3);
if (process.env.TITLE) { await sleep(1500); await shot('title'); }
await down(); await until(() => window.game.state === 'map'); await up();
await until(() => window.game.real > window.game.menuBlock);
// tap through the map to the wanted level (selection starts at the last unlocked)
for (let guard = 0; guard < 12; guard++) {
  const sel = await page.evaluate(() => window.game.sel);
  if (sel === li) break;
  await down(); await sleep(60); await up();
  await until((s) => window.game.sel !== s, sel);
}
await sleep(400);
if (process.env.MAP) await shot('map');
await down(); await until(() => window.game.state === 'play'); await up();

const t0 = Date.now();
while (Date.now() - t0 < 25 * 60 * 1000) {
  const g = await page.evaluate(() => {
    const g = window.game;
    if (g.state !== 'play') return { state: g.state };
    const o = { state: g.state, mode: g.mode, req: g.requireRelease, prev: g.previewEnd, tgt: g.ship.targetId, charge: g.ship.charge };
    if (g.mode === 'flight') o.straight = g.debugStraight();
    if (g.mode === 'kindle') { o.gauge = g.gauge; o.center = g.kb.band.center; o.wob = g.kb.band.wobble; o.draining = g.draining; }
    if (g.mode === 'shield') { o.soon = g.sh.flares.filter(f => !f.done).map(f => f.hit - g.sh.t); o.energy = g.sh.energy; o.up = g.sh.up; }
    if (g.mode === 'lens') { o.f = g.ln.f; o.sharp = g.ln.sharp; o.frame = g.ln.frame; o.target = g.zb.def.focus; o.active = g.active; }
    if (g.mode === 'sling') { o.slT = g.slT; o.spin = g.sling.spin; }
    if (g.mode.startsWith('to')) { o.armed = g.armed; o.ready = g.modeT > 0.7 && g.gapT >= g.gapDur; }
    o.lit = g.lit; o.light = g.light;
    return o;
  });
  if (g.state !== 'play') {
    await up();
    if (g.state === 'complete') { await sleep(1500); await shot('complete'); }
    console.log('end state', g.state);
    break;
  }
  const zones = ['kindle', 'sling', 'shield', 'lens'];
  switch (g.mode) {
    case 'flight':
      if (g.req) { await up(); break; }
      if (!holding) {
        if (!zones.includes(g.straight) && g.tgt >= 0) await down();
      } else {
        if (g.charge > 0.45) await shot('flight-charging');
        if (zones.includes(g.prev)) { await shot('flight-aimed'); await up(); }
        else if (g.tgt < 0 && g.charge < 0.05) await up();
      }
      break;
    case 'kindle':
      if (g.req) { await up(); break; }
      if (!holding && !g.draining && g.gauge === 0) await down();
      else if (holding) {
        if (g.gauge > 0.35) await shot('kindle-pump');
        if (g.gauge >= g.center - 0.015 - (g.wob || 0) * 0.3) await up();
      }
      break;
    case 'sling': {
      if (g.req) { await up(); break; }
      if (g.slT > 0.6) await shot('sling');
      if (g.prev === 'kindle') { await down(); await sleep(30); await up(); await shot('sling-launch'); }
      break;
    }
    case 'shield': {
      if (g.req) { await up(); break; }
      const imminent = g.soon.some(t => t < 0.32 && t > -0.05);
      if (g.soon.length) await shot('shield-warning');
      if (imminent && !holding) await down();
      if (!imminent && holding) await up();
      if (g.up) await shot('shield-up');
      break;
    }
    case 'lens':
      if (g.req) { await up(); break; }
      if (!holding && g.f === 0) await down();
      if (holding) {
        if (g.f > 0.25) await shot('lens-focusing');
        if (g.f >= g.target - 0.03 && g.frame > 0.55) { await up(); await sleep(250); await shot('lens-photo'); }
        else if (g.f > g.target + 0.12) await up();
      }
      break;
    default:
      // a hand-over: time holds until Shift is tapped. Wait for the card, then start.
      if (g.mode && g.mode.startsWith('to')) {
        if (holding) { await up(); break; }
        if (g.armed || !g.ready) break;
        await shot(`${g.mode.slice(2).toLowerCase()}-switch`);
        await down(); await sleep(60); await up();
      }
  }
  if (g.mode === 'outro') await shot('outro');
  await sleep(20);
}
console.log('errors:', errors.length ? errors.join('\n') : 'none');
const done = shots.has('complete');
await browser.close();
process.exit(done && !errors.length ? 0 : 1);
