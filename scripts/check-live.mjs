import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { startPreview } from './preview-server.mjs';

// Optional real-network smoke: never used by the deterministic regression suite.
const { chromium } = await import(process.env.IMD_PLAYWRIGHT || 'playwright');
const preview = await startPreview();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const failures = [];
let statusRequests = 0;
try {
  page.on('pageerror', (error) => { if (!errors.includes(error.message)) errors.push(error.message); });
  page.on('request', (request) => {
    if (request.url() === 'https://api.squeekchain.com/v1/status') statusRequests++;
  });
  page.on('requestfailed', (request) => { failures.push({ url: request.url(), error: request.failure()?.errorText }); });
  await page.goto(preview.url);
  await page.locator('#roll').click();
  await page.waitForFunction(() => document.querySelector('#roll').getAttribute('aria-busy') === 'false');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
  await page.waitForFunction(() => document.body.dataset.phase === 'finished', null, { timeout: 35_000 });
  const saved = await page.evaluate(() => {
    const key = localStorage.getItem('spoke-sprint:live:v1:last');
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  assert.equal(statusRequests, 2);
  assert.equal(saved?.steps, 5);
  assert.deepEqual(errors, []);
  if (saved?.valid) {
    assert.equal(saved.gainMm, saved.end.distanceMm - saved.start.distanceMm);
    assert.equal(saved.start.installationId, saved.end.installationId);
    assert.equal(saved.start.counterEpoch, saved.end.counterEpoch);
  } else {
    assert.equal(saved?.gainMm, null); assert.equal(saved?.winner, null); assert.ok(saved?.reason);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/live-smoke.json', JSON.stringify({
    kind: 'Unmocked network smoke against the public status endpoint',
    checkedAt: new Date().toISOString(), statusRequests,
    result: await page.locator('#result-heading').textContent(), attempt: saved, networkFailures: failures, scriptErrors: errors,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ statusRequests, valid: saved?.valid, steps: saved?.steps, openingMm: saved?.start?.distanceMm, closingMm: saved?.end?.distanceMm, gainMm: saved?.gainMm, reason: saved?.reason }));
} catch (error) {
  const diagnostic = await page.evaluate(() => ({ phase: document.body.dataset.phase, notice: document.querySelector('#game-notice')?.textContent, timer: document.querySelector('#timer')?.textContent, steps: document.querySelector('#step-count')?.textContent }));
  console.error(JSON.stringify({ statusRequests, errors, failures, diagnostic, error: error.message }));
  await mkdir('test/scratch/browser-validation', { recursive: true });
  await page.screenshot({ path: 'test/scratch/browser-validation/live-failure.png', fullPage: true });
  process.exitCode = 1;
} finally { await browser.close(); await preview.close(); }
