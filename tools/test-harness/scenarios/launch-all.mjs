import { requireDev } from '../lib/accounts.mjs';
import { createHubClient, discoverApps } from '../lib/hub.mjs';

export async function runLaunchAll(ctx) {
  const { config, log, accounts } = ctx;
  const dev = requireDev(accounts);
  const hub = createHubClient(config, log);
  const apps = discoverApps();

  if (apps.length === 0) throw new Error('No apps in apps/');

  for (const app of apps) {
    const { res, body } = await hub.launch(dev, app.slug);
    if (!res.ok) continue;
    const data = body.data || body;
    const entryUrl = data.entry_url || data.runtime_url;
    await hub.checkRuntimeAsset(entryUrl, data.launch_token, `${app.slug}/index.html`);
  }
}
