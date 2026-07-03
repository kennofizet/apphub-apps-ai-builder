import { requireDev } from '../lib/accounts.mjs';
import { runAppTests } from '../lib/app-tests.mjs';
import { createHubClient } from '../lib/hub.mjs';
import { runDualAccount } from './dual-account.mjs';
import { runPublisherFlow } from './publisher-flow.mjs';

/**
 * Full local sandbox gate before register/deploy to production Hub.
 * Order: API health → register+launch → dual-account → per-app feature cases.
 */
export async function runPreDeploy(ctx) {
  const { config, log, accounts, flags } = ctx;
  const slug = flags.slug || config.demo.apps[0];
  if (!slug) {
    throw new Error('Pass --slug <slug> or set demo.apps in apphub.test.json');
  }

  const dev = requireDev(accounts);
  const hub = createHubClient(config, log);

  await hub.integrationDocs();
  const { res } = await hub.catalog(dev, 'publisher');
  if (!res.ok) throw new Error('Dev token rejected — run stack up and sync tokens');

  log.record({ actor: 'system', action: 'pre-deploy.check', ok: true, detail: slug });

  await runPublisherFlow({ ...ctx, flags: { ...flags, slug } });

  try {
    await runDualAccount(ctx);
  } catch (e) {
    log.record({
      actor: 'system',
      action: 'pre-deploy.dual-account',
      ok: false,
      error: e.message,
    });
    throw e;
  }

  await runAppTests({ ...ctx, flags: { ...flags, slug } });

  log.record({
    actor: 'system',
    action: 'pre-deploy.complete',
    ok: true,
    detail: `${slug} — all sandbox cases passed`,
  });
}
