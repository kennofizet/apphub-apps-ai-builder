import { requireDev } from '../lib/accounts.mjs';
import { seedDemoApps } from '../lib/demo-data.mjs';
import { createHubClient } from '../lib/hub.mjs';
import { runSmoke } from './smoke.mjs';

export async function runPublisherFlow(ctx) {
  const { config, log, accounts, flags } = ctx;
  const dev = requireDev(accounts);
  const hub = createHubClient(config, log);
  const slug = flags.slug || config.demo.apps[0];

  if (!slug) throw new Error('Pass --slug <slug> or set demo.apps in apphub.test.json');

  await seedDemoApps(config, hub, log, dev);

  ctx.flags = { ...flags, slug };
  await runSmoke(ctx);
}
