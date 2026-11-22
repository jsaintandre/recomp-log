// Smoke tests for the Recomp training log. They load the real index.html in
// Chromium and check the things that would cost data if an update broke them:
// the app loads, a logged set survives a reload, a backup restores cleanly,
// the app opens offline, and the comeback ramp and body check-ins work.
//
// Run with: npm test   (needs Chromium: npx playwright install chromium)

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://localhost:' + server.address().port + '/';
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
});

// A fresh phone-sized context with its own storage. Web fonts are stubbed so the
// tests never depend on the network.
async function open(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'America/Denver', locale: 'en-US' });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (opts.time) await page.clock.install({ time: opts.time });
  await page.goto(base);
  await page.locator('.wordmark').waitFor();
  return { context, page, errors };
}

async function sheetButton(page, label) {
  await page.locator('#sheetActions .btn', { hasText: label }).click();
}

async function logOneSet(page) {
  await page.locator('[data-act="tab"][data-tab="A"]').click();
  const set = page.locator('[data-act="set-toggle"][data-ex="a1"][data-i="0"]');
  await set.click();
  assert.equal(await set.getAttribute('aria-pressed'), 'true');
  await page.locator('#btnFinish').click();
  await sheetButton(page, 'Save to log and reset');
}

test('loads, logs a set, and keeps it after a reload', async () => {
  const { context, page, errors } = await open();
  await logOneSet(page);
  await page.reload();
  await page.locator('#navLog').click();
  const sessions = page.locator('.sess');
  assert.equal(await sessions.count(), 1);
  assert.match(await sessions.first().innerText(), /Day A/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a backup restores the log and check-ins after erasing everything', async () => {
  const { context, page, errors } = await open();
  await logOneSet(page);

  await page.locator('#navLog').click();
  await page.locator('.sec-head [data-act="body-add"]').click();
  await page.fill('#ckBw', '185.4');
  await page.fill('#ckWaist', '36');
  await sheetButton(page, 'Save check-in');
  assert.match(await page.locator('.body-sec').innerText(), /185\.4/);

  await page.locator('#navSet').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.data-acts [data-act="backup"]').click()]);
  const file = await download.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.app, 'recomp-log');
  assert.equal(data.sessions.length, 1);
  assert.equal(data.measures.length, 1);
  assert.equal(data.measures[0].bw, 185.4);

  await page.locator('[data-act="erase"]').click();
  await sheetButton(page, 'Erase everything');
  await page.locator('#navLog').click();
  assert.equal(await page.locator('.sess').count(), 0);
  assert.equal(await page.locator('.ck-row').count(), 0);

  await page.locator('#restoreInput').setInputFiles(file);
  assert.match(await page.locator('#sheetBody').innerText(), /1 logged workout and 1 check-in/);
  await sheetButton(page, 'Restore');
  assert.equal(await page.locator('.sess').count(), 1);
  assert.match(await page.locator('.ck-list').innerText(), /185\.4 lb · 36 in waist/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('opens with no connection after the first visit', async () => {
  const { context, page, errors } = await open();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await page.locator('.wordmark').waitFor();
  assert.ok(await page.locator('[data-act="set-toggle"]').count() > 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('the comeback ramp starts light and steps back up each week', async () => {
  const start = new Date('2026-11-23T09:00:00-07:00');
  const { context, page, errors } = await open({ time: start });
  const squat = page.locator('#wt-a1');
  assert.equal(await squat.inputValue(), '205');

  await page.locator('.banner [data-act="ramp-open"]').click();
  assert.match(await page.locator('#rampPrev').innerText(), /205 → 145 lb/);
  await sheetButton(page, 'Start the ramp today');
  assert.equal(await squat.inputValue(), '145');
  assert.match(await page.locator('.phase').innerText(), /Comeback week 1 of 3: 70%/);
  await page.locator('[data-act="tab"][data-tab="B"]').click();
  assert.equal(await page.locator('#wt-b1').inputValue(), '170');
  await page.locator('[data-act="tab"][data-tab="A"]').click();

  const atDay = async (n) => { await page.clock.setSystemTime(new Date(start.getTime() + n * 864e5)); await page.reload(); await page.locator('.wordmark').waitFor(); };

  await atDay(7);
  const bump = page.locator('#cue-a1 [data-act="apply-ramp"]');
  assert.equal(await bump.innerText(), 'Go to 165 lb');
  await bump.click();
  assert.equal(await squat.inputValue(), '165');

  await atDay(21);
  assert.equal(await bump.innerText(), 'Go to 205 lb');
  assert.match(await page.locator('#cue-a1').innerText(), /ramp done/);

  await atDay(28);
  assert.equal(await page.locator('#cue-a1 [data-act="apply-ramp"]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
