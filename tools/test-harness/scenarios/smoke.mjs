import { requireDev } from '../lib/accounts.mjs';
import { createHubClient, discoverApps } from '../lib/hub.mjs';

export async function runSmoke(ctx) {
  const { config, log, accounts } = ctx;
  const dev = requireDev(accounts);
  const hub = createHubClient(config, log);

  await hub.integrationDocs();

  const slugs =
    config.demo.apps.length > 0
      ? config.demo.apps
      : discoverApps().slice(0, 1).map((a) => a.slug);

  if (slugs.length === 0) {
    throw new Error('No apps to test. Add apps under apps/ or demo.apps in apphub.test.json');
  }

  const slug = slugs[0];
  const { res, body } = await hub.launch(dev, slug);
  if (!res.ok) throw new Error(`launch failed for ${slug}`);

  const data = body.data || body;
  const entryUrl = data.entry_url || data.runtime_url;
  const lt = data.launch_token;

  await hub.checkRuntimeAsset(entryUrl, lt, 'index.html');

  log.record({
    actor: 'dev',
    action: 'smoke.complete',
    ok: true,
    detail: `Launched ${slug} → ${entryUrl}`,
  });
}
