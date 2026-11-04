import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.IMD_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve('artwork/share.svg')).href);
  await page.screenshot({ path: 'public/share.png', type: 'png' });
  console.log('Rendered public/share.png (1200 × 630) from the local SVG source.');
} finally { await browser.close(); }
