export async function runPortalSmoke(ctx) {
  const { config, log } = ctx;

  if (!config.playwright.enabled) {
    log.record({
      actor: 'system',
      action: 'portal-smoke.skip',
      ok: true,
      detail: 'Set playwright.enabled: true in apphub.test.json',
    });
    return;
  }

  if (!config.hub_portal_url) {
    throw new Error('hub_portal_url empty in apphub.test.json');
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'Playwright not installed. Run: cd tools/test-harness && npm install && npx playwright install chromium'
    );
  }

  const browser = await chromium.launch({ headless: config.playwright.headless });
  const page = await browser.newPage();
  page.setDefaultTimeout(config.playwright.timeout_ms);

  const start = Date.now();
  try {
    const res = await page.goto(config.hub_portal_url, { waitUntil: 'domcontentloaded' });
    log.record({
      actor: 'system',
      action: 'portal.goto',
      status: res?.status(),
      duration_ms: Date.now() - start,
      ok: res?.ok(),
      detail: config.hub_portal_url,
    });
    const title = await page.title();
    log.record({
      actor: 'system',
      action: 'portal.title',
      ok: Boolean(title),
      detail: title,
    });
  } finally {
    await browser.close();
  }
}
