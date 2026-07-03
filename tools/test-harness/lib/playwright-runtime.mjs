import { requireDev } from './accounts.mjs';
import { createHubClient } from './hub.mjs';

/**
 * Open a hosted app runtime in Playwright (requires playwright.enabled in apphub.test.json).
 * @returns {{ browser, page, launch: object }}
 */
export async function openHostedRuntime(ctx) {
  const { config, log, accounts, slug } = ctx;

  if (!config.playwright?.enabled) {
    log.record({
      actor: 'system',
      action: 'playwright.skip',
      ok: true,
      detail: 'Set playwright.enabled: true in apphub.test.json',
    });
    return null;
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'Playwright not installed. Run: cd tools/test-harness && npm install && npx playwright install chromium'
    );
  }

  const dev = requireDev(accounts);
  const hub = createHubClient(config, log);
  const { res, body } = await hub.launch(dev, slug);
  if (!res.ok) throw new Error(`launch HTTP ${res.status}`);

  const data = body.data || body;
  const entryUrl = data.entry_url || data.runtime_url;
  const lt = data.launch_token;
  const sep = entryUrl.includes('?') ? '&' : '?';
  const url = `${entryUrl}${sep}launch_token=${encodeURIComponent(lt)}`;

  const launchOpts = { headless: config.playwright.headless !== false };
  let browser;
  try {
    browser = await chromium.launch(launchOpts);
  } catch (e) {
    if (launchOpts.headless && String(e.message).includes('headless-shell')) {
      log.record({
        actor: 'system',
        action: 'playwright.headless-fallback',
        ok: true,
        detail: 'Using headed Chromium (headless shell not installed)',
      });
      browser = await chromium.launch({ headless: false });
    } else {
      throw e;
    }
  }
  const page = await browser.newPage();
  page.setDefaultTimeout(config.playwright.timeout_ms || 30000);

  const start = Date.now();
  const nav = await page.goto(url, { waitUntil: 'domcontentloaded' });
  log.record({
    actor: 'dev',
    action: 'playwright.runtime.goto',
    status: nav?.status(),
    duration_ms: Date.now() - start,
    ok: nav?.ok(),
    detail: slug,
  });

  if (!nav?.ok()) throw new Error(`runtime page HTTP ${nav?.status()}`);

  return { browser, page, launch: data };
}

export async function waitForAppRoot(page, timeout = 30000) {
  await page.waitForSelector('#app, #ps-app', { state: 'attached', timeout });
}

export async function closePlaywright(session) {
  if (session?.browser) await session.browser.close();
}
