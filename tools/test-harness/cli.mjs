import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAccounts, requireDev } from './lib/accounts.mjs';
import { assertTestEnvironment, EXAMPLE, loadTestConfig } from './lib/config.mjs';
import { seedDemoApps } from './lib/demo-data.mjs';
import { createHubClient } from './lib/hub.mjs';
import { ActionLog, listSessions, tailLatestLog } from './lib/logger.mjs';
import { ROOT } from './lib/paths.mjs';
import {
  getStackPaths,
  isRealBackend,
  stackInstall,
  stackReset,
  stackUp,
  stackUpdate,
  writeStackEnv,
  writeTestConfigFromStack,
} from './lib/stack.mjs';
import { runDualAccount } from './scenarios/dual-account.mjs';
import { runLaunchAll } from './scenarios/launch-all.mjs';
import { runPortalSmoke } from './scenarios/portal-smoke.mjs';
import { runPreDeploy } from './scenarios/pre-deploy.mjs';
import { runPublisherFlow } from './scenarios/publisher-flow.mjs';
import { runSmoke } from './scenarios/smoke.mjs';
import { listAppCases, printAppCaseList, runAppTests } from './lib/app-tests.mjs';

const SCENARIOS = {
  smoke: runSmoke,
  'launch-all': runLaunchAll,
  'publisher-flow': runPublisherFlow,
  'dual-account': runDualAccount,
  'portal-smoke': runPortalSmoke,
  'pre-deploy': runPreDeploy,
};

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--slug' && argv[i + 1]) flags.slug = argv[++i];
    else if (a === '--case' && argv[i + 1]) flags.case = argv[++i];
    else if (a === '--tail' && argv[i + 1]) flags.tail = Number(argv[++i]);
    else if (!a.startsWith('-')) positionals.push(a);
  }
  return { command: positionals[0], sub: positionals[1], rest: positionals.slice(2), flags };
}

function usage() {
  console.log(`
App Hub test harness — isolated from production

  node tools/test-harness/cli.mjs init
  node tools/test-harness/cli.mjs check
  node tools/test-harness/cli.mjs seed
  node tools/test-harness/cli.mjs run <scenario> [--slug <slug>]
  node tools/test-harness/cli.mjs run app <slug> [--case <id>]
  node tools/test-harness/cli.mjs run pre-deploy --slug <slug>
  node tools/test-harness/cli.mjs list app <slug>
  node tools/test-harness/cli.mjs logs [--tail N]

  node tools/test-harness/cli.mjs stack install   # real frontend + Laravel backend (or mock)
  node tools/test-harness/cli.mjs stack update    # pull latest apphub-frontend + backend packages
  node tools/test-harness/cli.mjs stack up        # start backend + Hub frontend
  node tools/test-harness/cli.mjs stack reset     # reset DB / mock catalog

Scenarios: ${Object.keys(SCENARIOS).join(', ')}

  pre-deploy = full sandbox gate before register/deploy (publisher-flow + dual-account + app cases)
  app <slug> = run per-feature cases from apps/<slug>/tests/sandbox-apphub/cases/
`);
}

async function cmdInit() {
  const dest = join(ROOT, 'apphub.test.json');
  if (!existsSync(dest)) {
    copyFileSync(EXAMPLE, dest);
    console.log('Created apphub.test.json — edit hub_api_base and hub_portal_url (localhost only).');
  } else {
    console.log('apphub.test.json already exists.');
  }

  const devPath = join(ROOT, '.apphub-token.dev.local');
  const pubPath = join(ROOT, '.apphub-token.local');
  if (!existsSync(devPath) && existsSync(pubPath)) {
    copyFileSync(pubPath, devPath);
    console.log('Copied .apphub-token.local → .apphub-token.dev.local (dev account).');
  }

  const userPath = join(ROOT, '.apphub-token.user.local');
  if (!existsSync(userPath)) {
    console.log('Optional: add .apphub-token.user.local for dual-account tests (normal user token).');
  }
}

async function cmdCheck() {
  const config = loadTestConfig();
  const guard = assertTestEnvironment(config);
  const accounts = loadAccounts(config);
  console.log('\nTest harness check\n');
  console.log(`  Environment: ${guard.mode}`);
  console.log(`  API base:    ${config.hub_api_base}`);
  console.log(`  Portal:      ${config.hub_portal_url}`);
  console.log(`  Dev token:   ${accounts.dev.token ? 'ok' : 'MISSING'} (${accounts.dev.file})`);
  console.log(`  User token:  ${accounts.user.token ? 'ok' : 'optional'} (${accounts.user.file})`);
  console.log(`  Demo apps:   ${config.demo.apps.join(', ') || '(all discovered)'}`);
  if (guard.warning) console.log(`  Warning:     ${guard.warning}`);
  console.log('');

  const log = new ActionLog(config, 'check');
  const hub = createHubClient(config, log);
  await hub.integrationDocs();

  const dev = requireDev(accounts);
  const { res } = await hub.catalog(dev, 'publisher');
  if (!res.ok) {
    log.record({
      actor: 'dev',
      action: 'check.token',
      ok: false,
      error: 'Dev token rejected — copy Hub token to .apphub-token.dev.local',
    });
  } else {
    log.record({ actor: 'dev', action: 'check.token', ok: true, detail: 'publisher catalog OK' });
  }

  log.finish(res.ok ? 0 : 1);
  if (!res.ok) process.exit(1);
}

async function cmdSeed() {
  const config = loadTestConfig();
  assertTestEnvironment(config);
  const accounts = loadAccounts(config);
  const dev = requireDev(accounts);
  const log = new ActionLog(config, 'seed');
  const hub = createHubClient(config, log);

  try {
    await seedDemoApps(config, hub, log, dev);
    log.finish(0);
  } catch (e) {
    log.finish(1);
    throw e;
  }
}

async function cmdRunApp(slug, flags) {
  if (!slug) {
    console.error('Usage: npm run test:harness -- run app <slug> [--case <id>]\n');
    process.exit(1);
  }

  const config = loadTestConfig();
  assertTestEnvironment(config);
  const accounts = loadAccounts(config);
  const log = new ActionLog(config, `app-${slug}${flags.case ? `-${flags.case}` : ''}`);

  try {
    await runAppTests({ config, log, accounts, flags: { ...flags, slug } });
    log.finish(0);
  } catch (e) {
    log.record({ actor: 'system', action: 'scenario.error', ok: false, error: e.message });
    log.finish(1);
    console.error(`\nError: ${e.message}\n`);
    process.exit(1);
  }
}

async function cmdListApp(slug) {
  if (!slug) {
    console.error('Usage: npm run test:harness -- list app <slug>\n');
    process.exit(1);
  }
  console.log(`\nApp test cases: ${slug}\n`);
  printAppCaseList(slug);
  const cases = listAppCases(slug);
  if (cases.length === 0) process.exit(1);
  console.log(`\nRun all:  npm run test:harness -- run app ${slug}`);
  console.log(`Run one:  npm run test:harness -- run app ${slug} --case ${cases[0].id}\n`);
}

async function cmdRun(scenario, flags) {
  const fn = SCENARIOS[scenario];
  if (!fn) {
    console.error(`Unknown scenario: ${scenario}`);
    usage();
    process.exit(1);
  }

  const config = loadTestConfig();
  assertTestEnvironment(config);
  const accounts = loadAccounts(config);
  const log = new ActionLog(config, scenario);

  try {
    await fn({ config, log, accounts, flags });
    const summary = log.finish(0);
    if (summary.fail > 0) process.exit(1);
  } catch (e) {
    log.record({ actor: 'system', action: 'scenario.error', ok: false, error: e.message });
    log.finish(1);
    console.error(`\nError: ${e.message}\n`);
    process.exit(1);
  }
}

async function cmdStack(sub, flags) {
  const config = loadTestConfig();
  const paths = getStackPaths(config);
  const log = new ActionLog(config, `stack-${sub || 'help'}`);

  if (sub === 'install') {
    await stackInstall(config, log);
    writeStackEnv(paths);
    writeTestConfigFromStack(config, paths);
    log.finish(0);
    const mode = isRealBackend(config) ? 'Laravel apphub-backend' : 'Node mock API';
    console.log(`\nStack installed (${mode}). Run: npm run test:harness -- stack up\n`);
    return;
  }

  if (sub === 'update') {
    await stackUpdate(config, log);
    writeStackEnv(paths);
    log.finish(0);
    console.log('\nPackages updated. Restart stack if it is running.\n');
    return;
  }

  if (sub === 'reset') {
    await stackReset(config, log);
    log.finish(0);
    console.log('Sandbox state + tokens reset.\n');
    return;
  }

  if (sub === 'up') {
    if (!existsSync(join(paths.frontendDir))) {
      console.log('Frontend not installed. Run: npm run test:harness -- stack install\n');
      process.exit(1);
    }
    writeStackEnv(paths);
    await stackUp(config, paths, log);
    return;
  }

  console.log('Usage: stack install | update | up | reset\n');
  process.exit(1);
}

async function cmdLogs(flags) {
  const config = loadTestConfig();
  const sessions = listSessions(config);
  if (flags.tail != null) {
    tailLatestLog(config, flags.tail);
    return;
  }
  console.log('\nRecent sessions:\n');
  for (const s of sessions.slice(0, 10)) {
    console.log(`  ${s}`);
  }
  console.log('\nTail: npm run test:harness -- logs --tail 50\n');
}

async function main() {
  const { command, sub, rest, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  switch (command) {
    case 'init':
      await cmdInit();
      break;
    case 'check':
      await cmdCheck();
      break;
    case 'seed':
      await cmdSeed();
      break;
    case 'run':
      if (sub === 'app') {
        await cmdRunApp(rest[0], flags);
        break;
      }
      if (!sub) {
        usage();
        process.exit(1);
      }
      await cmdRun(sub, flags);
      break;
    case 'list':
      if (sub === 'app') await cmdListApp(rest[0]);
      else {
        usage();
        process.exit(1);
      }
      break;
    case 'logs':
      await cmdLogs(flags);
      break;
    case 'stack':
      await cmdStack(sub, flags);
      break;
    default:
      usage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
