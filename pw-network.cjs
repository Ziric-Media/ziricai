const { chromium } = require('playwright');
(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('page:' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  await page.goto('http://localhost:3456/auth-test.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const failed = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.transferSize === 0 && r.name.includes('node_modules')).map(r => r.name));
  console.log(JSON.stringify({ errors, failedResources: failed.slice(0,10) }, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
