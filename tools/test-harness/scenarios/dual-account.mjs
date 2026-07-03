import { loadAccounts, requireDev, requireUser } from '../lib/accounts.mjs';
import { createHubClient } from '../lib/hub.mjs';

export async function runDualAccount(ctx) {
  const { config, log, accounts } = ctx;
  const dev = requireDev(accounts);
  const user = requireUser(accounts);
  const hub = createHubClient(config, log);

  const { body: pubBody } = await hub.catalog(dev, 'publisher');
  const pubItems = pubBody?.data?.items || pubBody?.data || [];
  const pubSlugs = (Array.isArray(pubItems) ? pubItems : []).map((a) => a.slug);

  const { body: storeBody } = await hub.catalog(user, 'store');
  const storeItems = storeBody?.data?.items || storeBody?.data || [];
  const storeSlugs = (Array.isArray(storeItems) ? storeItems : []).map((a) => a.slug);

  log.record({
    actor: 'dev',
    action: 'dual-account.publisher',
    ok: true,
    detail: `${pubSlugs.length} apps: ${pubSlugs.join(', ') || '(none)'}`,
  });

  log.record({
    actor: 'user',
    action: 'dual-account.store',
    ok: true,
    detail: `${storeSlugs.length} apps: ${storeSlugs.join(', ') || '(none)'}`,
  });

  const onlyPublisher = pubSlugs.filter((s) => !storeSlugs.includes(s));
  if (onlyPublisher.length) {
    log.record({
      actor: 'system',
      action: 'dual-account.hint',
      ok: true,
      detail: `Draft/unapproved (publisher only): ${onlyPublisher.join(', ')}`,
    });
  }
}
