import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { startPreview } from './preview-server.mjs';

const { chromium, webkit } = await import(process.env.IMD_PLAYWRIGHT || 'playwright');
const require = createRequire(import.meta.url);
const axePath = process.env.IMD_AXE || require.resolve('axe-core/axe.min.js');
const scratch = resolve('test/scratch/browser-validation');
await mkdir(scratch, { recursive: true });
await mkdir('artifacts', { recursive: true });
const preview = await startPreview();
const url = preview.url;
const reports = [];
const limitations = [];
const check = (name, details = '') => { reports.push({ name, passed: true, details }); console.log(`PASS ${name}${details ? `: ${details}` : ''}`); };
const date = Date.parse('2026-11-04T12:00:00Z');
const endpoint = 'https://api.squeekchain.com/v1/status';

function status(now, { round = 'browser-fixture-round-1', distance = 100_000, epoch = 'browser-fixture-epoch', installation = 'browser-fixture-installation', freshness = 'online', age = 1_000, missing = false, historical = false } = {}) {
  if (missing) return { schemaVersion: 1 };
  return {
    schemaVersion: 1, installationId: installation, generatedAt: new Date(now).toISOString(),
    ...(round === null ? {} : historical ? { oracle: { latestClosure: { firstRound: round, lastRound: round } } } : { roundId: round }),
    measurement: { distanceMm: distance, counterEpoch: epoch, observedAt: new Date(now - age).toISOString(), freshness, staleAfterSeconds: 120, coreStatus: 'IDLE', provenance: 'hardware' },
  };
}

async function newPage(browser, width = 390, height = 844, fakeClock = true) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.url().startsWith(url.split('/preview/')[0]) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  if (fakeClock) await page.clock.install({ time: date });
  return { page, context, errors };
}

async function routeStatus(page, options = {}) {
  const requests = [];
  await page.route(endpoint, async (route) => {
    requests.push(route.request());
    const n = requests.length;
    if (options.fail === n) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    const now = await page.evaluate(() => Date.now());
    const body = status(now, {
      round: options.round === undefined ? 'browser-fixture-round-1' : options.round,
      distance: n === 1 ? 100_000 : options.endDistance ?? 104_000,
      ...(n === 2 ? options.end : {}), historical: options.historical,
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return requests;
}

async function finish(page) {
  await page.clock.fastForward(20_000);
  await page.waitForFunction(() => document.body.dataset.phase === 'finished');
}
async function readyForOpening(page) { await page.waitForFunction(() => document.querySelector('#roll').getAttribute('aria-busy') === 'false'); }
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  if (size.scroll > size.width) {
    const offenders = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1).map((node) => ({ element: node.tagName, id: node.id, className: String(node.className), right: node.getBoundingClientRect().right })).slice(0, 15));
    console.error('Overflow:', offenders);
    await page.screenshot({ path: 'test/scratch/browser-validation/overflow.png', fullPage: true });
  }
  assert.ok(size.scroll <= size.width, JSON.stringify(size));
}
async function audit(page, label) {
  await page.addScriptTag({ path: axePath });
  const audit = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
    return result.violations.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.map(({ target }) => target) }));
  });
  assert.deepEqual(audit, [], `${label} accessibility violations: ${JSON.stringify(audit)}`);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [320, 390, 704, 1440]) {
    const { page, context, errors } = await newPage(browser, width, width === 1440 ? 1000 : 844);
    await page.goto(url);
    await noOverflow(page);
    const box = await page.locator('#roll').boundingBox();
    assert.ok(box.y + box.height <= (width === 1440 ? 1000 : 844), `primary action below screen at ${width}`);
    assert.equal(await page.title(), 'Spoke Sprint | Race Squeektoshi’s wheel');
    if ([390, 1440].includes(width)) await page.screenshot({ path: `artifacts/spoke-sprint-${width}.png`, fullPage: true });
    if (width === 390) {
      await page.keyboard.press('Tab'); await page.locator('#roll').focus();
      await page.screenshot({ path: 'artifacts/spoke-sprint-focus.png', fullPage: false });
    }
    await audit(page, `${width} ready`);
    await page.locator('#how-to-play > summary').click(); await noOverflow(page);
    assert.deepEqual(errors, []);
    check(`${width}px layout, first-screen action, local assets and accessibility`);
    await context.close();
  }

  {
    const { page, context, errors } = await newPage(browser);
    const requests = await routeStatus(page);
    await page.goto(url); assert.equal(requests.length, 0);
    await page.locator('#roll').click(); await readyForOpening(page);
    assert.equal(requests.length, 1);
    await page.keyboard.press('Space');
    await page.locator('#scene-roll').click();
    await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
    assert.equal(await page.locator('#player-distance').textContent(), '4', 'button, Space, scene, held-key repeat');
    await page.locator('#roll').click();
    await finish(page);
    assert.equal(requests.length, 2);
    assert.equal(await page.locator('#result-heading').textContent(), 'You went farther.');
    assert.match(await page.locator('#receipt-gain').textContent(), /104000 − 100000 = 4000 mm/);
    assert.match(await page.locator('#receipt-steps').textContent(), /5 steps = 5000 mm/);
    assert.ok(await page.locator('#receipt').getAttribute('open') !== null);
    await noOverflow(page); await audit(page, 'live result');
    await page.screenshot({ path: 'artifacts/spoke-sprint-live-result.png', fullPage: true });
    await page.reload();
    assert.equal(await page.locator('#result-heading').textContent(), 'You went farther.');
    await page.locator('#roll').click();
    await page.waitForFunction(() => document.body.dataset.phase === 'locked');
    assert.match(await page.locator('#game-notice').textContent(), /already used/);
    assert.equal(requests.length, 3, 'round check takes one GET and refuses replay');
    const practiceKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('practice')));
    assert.deepEqual(practiceKeys, []);
    assert.deepEqual(errors, []);
    check('live: all three inputs, held Space suppression, exact two GETs, raw receipt, persistence and replay refusal');
    await context.close();
  }

  for (const [name, options, reason] of [
    ['counter reset', { endDistance: 0 }, /backwards/],
    ['changed epoch', { end: { epoch: 'browser-fixture-new-epoch' } }, /epoch changed/],
    ['changed installation', { end: { installation: 'browser-fixture-new-installation' } }, /installation changed/],
    ['stale reading', { end: { age: 121_000 } }, /stale/],
    ['offline telemetry', { end: { freshness: 'offline' } }, /offline/],
    ['missing schema', { end: { missing: true } }, /missing/],
    ['opening HTTP failure', { fail: 1 }, /Opening reading.*503/],
    ['closing HTTP failure', { fail: 2 }, /Closing reading.*503/],
  ]) {
    const { page, context } = await newPage(browser, 320);
    const requests = await routeStatus(page, options);
    await page.goto(url); await page.locator('#roll').click(); await readyForOpening(page); await finish(page);
    assert.equal(requests.length, 2);
    assert.equal(await page.locator('#result-heading').textContent(), 'Attempt void.');
    assert.match(await page.locator('#result-reason').textContent(), reason);
    assert.equal(await page.locator('#result-hamster').textContent(), 'Not comparable');
    await noOverflow(page);
    await page.locator('#practice-mode').click();
    assert.equal(await page.locator('#mode-label').textContent(), 'Practice — simulated, not live');
    check(`void: ${name}, no gain/winner, practice available, 320px receipt wraps`);
    await context.close();
  }

  for (const options of [{ round: null }, { historical: true }]) {
    const { page, context } = await newPage(browser);
    await routeStatus(page, options); await page.goto(url); await page.locator('#roll').click(); await readyForOpening(page);
    assert.match(await page.locator('#attempt-rule').textContent(), options.round === null ? /UTC hour/ : /Last closed round browser-fixture-round-1/);
    await finish(page);
    check(options.round === null ? 'UTC-hour fallback is visible and used for storage' : 'actual last-closed-round shape is labeled honestly');
    await context.close();
  }

  {
    const { page, context, errors } = await newPage(browser);
    let network = 0;
    await page.route(endpoint, (route) => { network++; return route.abort(); });
    await page.goto(url); await page.locator('#practice-mode').click();
    await context.setOffline(true);
    await page.keyboard.press('Space'); await page.locator('#scene-roll').click();
    assert.equal(await page.locator('#player-wheel').evaluate((node) => node.style.transform), 'rotate(0deg)');
    assert.equal(await page.locator('#hamster-wheel').evaluate((node) => node.style.transform), 'rotate(0deg)');
    await finish(page);
    assert.equal(network, 0);
    assert.equal(await page.locator('#result-mode').textContent(), 'Practice — simulated, not live');
    assert.equal(await page.locator('#result-hamster').textContent(), '60 game-meters');
    assert.equal(await page.locator('#live-receipt').isVisible(), false);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert.deepEqual(keys, ['spoke-sprint:practice:v1']);
    await audit(page, 'practice result'); await noOverflow(page);
    await page.locator('#roll').click();
    assert.equal(await page.locator('#player-distance').textContent(), '1');
    assert.deepEqual(errors, []);
    check('offline practice: fixed labeled gain, separate key, repeatable, no API requests');
    await context.close();
  }

  {
    const { page, context } = await newPage(browser);
    await page.goto(url); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    await page.keyboard.press('Enter');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
    // Explicitly focus each primary control and confirm the computed visible ring.
    for (const selector of ['#live-mode', '#practice-mode', '#scene-roll', '#roll']) {
      await page.locator(selector).focus();
      const style = await page.locator(selector).evaluate((node) => ({ width: getComputedStyle(node).outlineWidth, style: getComputedStyle(node).outlineStyle }));
      assert.equal(style.width, '2px'); assert.equal(style.style, 'solid');
    }
    await page.locator('#practice-mode').focus(); await page.keyboard.press('Enter');
    await page.locator('#roll').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#player-distance').textContent(), '1');
    await finish(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'result');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await noOverflow(page);
    await page.screenshot({ path: 'test/scratch/browser-validation/text-200.png', fullPage: true });
    check('keyboard path, 2px focus, result focus, 200% text reflow at 390px');
    await context.close();
  }

  {
    const { page, context, errors } = await newPage(browser, 390, 844, false);
    await page.goto(url);
    await page.locator('#practice-mode').click(); await page.locator('#roll').click();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.body.dataset.phase === 'finished', null, { timeout: 25_000 });
    assert.equal(await page.locator('#result-hamster').textContent(), '60 game-meters');
    assert.equal(await page.locator('#result-player').textContent(), '2 game-meters');
    assert.deepEqual(errors, []);
    check('native browser timers: a real 20-second practice run finishes without script errors');
    await context.close();
  }

  {
    const { page, context } = await newPage(browser);
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Storage denied', 'SecurityError'); };
    });
    await page.goto(url); await page.locator('#roll').click();
    await page.waitForFunction(() => document.body.dataset.phase === 'finished');
    assert.match(await page.locator('#result-reason').textContent(), /storage/);
    await page.locator('#practice-mode').click(); await page.locator('#roll').click(); await finish(page);
    assert.equal(await page.locator('#result-hamster').textContent(), '60 game-meters');
    check('storage denied: live fails closed and practice still completes');
    await context.close();
  }

  try {
    const safari = await webkit.launch({ headless: true });
    try {
      const { page, context } = await newPage(safari);
      await page.goto(url); await page.locator('#practice-mode').click(); await page.locator('#roll').click(); await page.keyboard.press('Space');
      await finish(page); await noOverflow(page);
      assert.equal(await page.locator('#result-hamster').textContent(), '60 game-meters');
      check('WebKit primary practice interaction'); await context.close();
    } finally { await safari.close(); }
  } catch (error) {
    const missingLibraries = String(error.message).includes('Host system is missing dependencies');
    limitations.push(missingLibraries
      ? 'WebKit could not launch because host libraries including GTK4 and GStreamer are missing. Native Safari/device verification not performed.'
      : 'WebKit could not launch in this environment. Native Safari/device verification not performed.');
    console.log('LIMITATION WebKit cannot launch with the available host libraries.');
  }
} catch (error) {
  reports.push({ name: 'browser validation', passed: false, details: String(error.stack || error) });
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await preview.close();
  const output = { checkedAt: new Date().toISOString(), export: 'dist/ served under /preview/', reports, limitations };
  await writeFile('artifacts/browser-validation.json', JSON.stringify(output, null, 2) + '\n');
}
