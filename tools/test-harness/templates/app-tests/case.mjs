/**
 * Per-feature sandbox test case template.
 *
 * Copy to apps/<slug>/tests/sandbox-apphub/cases/NN-<id>.mjs
 * and register in tests/sandbox-apphub/manifest.json.
 *
 * ctx provides: config, log, accounts, slug, requireDev, createHubClient,
 *               openHostedRuntime, closePlaywright
 */
export async function run(ctx) {
  const { requireDev, createHubClient, config, log, accounts, slug } = ctx;
  const dev = requireDev(accounts);
  const hub = createHubClient(config, log);

  const { res } = await hub.launch(dev, slug);
  if (!res.ok) throw new Error('launch failed');

  // Playwright UI example (skips when playwright.enabled is false):
  // const session = await openHostedRuntime(ctx);
  // if (!session) return;
  // try { ... } finally { await closePlaywright(session); }
}
