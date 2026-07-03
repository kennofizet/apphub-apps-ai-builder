import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  backendDir,
  installRealBackend,
  resetRealBackend,
  syncSandboxTokens,
  updateRealBackend,
} from './install-real-backend.mjs';
import { HARNESS_ROOT, ROOT } from './paths.mjs';

const STACK_DIR = join(HARNESS_ROOT, 'stack');
const FRONTEND_DIR = join(STACK_DIR, 'hub-frontend');
const HOST_STARTER_REPO = 'https://github.com/kennofizet/apphub-host-starter.git';

export function isRealBackend(config) {
  return (config.stack?.backend ?? 'real') === 'real';
}

export function getStackPaths(config) {
  const backendPort = config.stack?.backend_port || 8790;
  const frontendPort = config.stack?.frontend_port || 5173;
  const apiPrefix = config.stack?.api_prefix || '/api/knf/apphub';
  const base = `http://127.0.0.1:${backendPort}`;
  return {
    stackDir: STACK_DIR,
    frontendDir: FRONTEND_DIR,
    backendDir: backendDir(),
    backendPort,
    frontendPort,
    apiPrefix,
    hubApiBase: `${base}${apiPrefix}`,
    backendBase: base,
    integrationDocsUrl: `${base}${apiPrefix}/integration-docs`,
    hubPortalUrl: `http://127.0.0.1:${frontendPort}`,
  };
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: opts.inherit ? 'inherit' : 'pipe',
      shell: process.platform === 'win32',
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
    });
    let out = '';
    if (!opts.inherit) {
      child.stdout?.on('data', (d) => {
        out += d;
      });
      child.stderr?.on('data', (d) => {
        out += d;
      });
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${out.slice(-500)}`));
    });
  });
}

async function waitForUrl(url, attempts = 60, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function stackInstall(config, log) {
  mkdirSync(STACK_DIR, { recursive: true });

  if (!existsSync(FRONTEND_DIR)) {
    await log.track('system', 'stack.git.clone', () =>
      run('git', ['clone', '--depth', '1', HOST_STARTER_REPO, FRONTEND_DIR], { inherit: true })
    );
  } else {
    log.record({ actor: 'system', action: 'stack.git.skip', ok: true, detail: FRONTEND_DIR });
  }

  await log.track('system', 'stack.npm.install', () =>
    run('npm', ['install', '@kennofizet/apphub-frontend@latest'], {
      cwd: FRONTEND_DIR,
      inherit: true,
    })
  );

  await log.track('system', 'stack.harness.deps', () =>
    run('npm', ['install'], { cwd: HARNESS_ROOT, inherit: true })
  );

  if (isRealBackend(config)) {
    await installRealBackend(log);
    await syncSandboxTokens(ROOT, { tryHttp: false });
  } else {
    writeSandboxTokens();
  }
}

export async function stackUpdate(config, log) {
  if (!existsSync(FRONTEND_DIR)) {
    throw new Error('Frontend not installed. Run: npm run test:harness -- stack install');
  }

  await log.track('system', 'stack.npm.update.frontend', () =>
    run('npm', ['install', '@kennofizet/apphub-frontend@latest'], {
      cwd: FRONTEND_DIR,
      inherit: true,
    })
  );

  if (isRealBackend(config)) {
    await updateRealBackend(log);
    await syncSandboxTokens(ROOT, { tryHttp: false });
  }

  log.record({ actor: 'system', action: 'stack.update', ok: true });
}

export function writeStackEnv(paths) {
  const envPath = join(FRONTEND_DIR, '.env');
  const lines = [
    `VITE_APPHUB_BACKEND_URL=${paths.hubApiBase}`,
    `VITE_APPHUB_CORE_URL=http://127.0.0.1:${paths.backendPort}/api/knf`,
    `VITE_APPHUB_DEV_LOGIN_URL=http://127.0.0.1:${paths.backendPort}/api/user/login?user_id=1`,
    'VITE_APPHUB_PARENT_ORIGINS=http://127.0.0.1:5173',
  ];
  writeFileSync(envPath, `${lines.join('\n')}\n`);
}

export function writeTestConfigFromStack(config, paths) {
  const testPath = join(ROOT, 'apphub.test.json');
  const next = {
    ...config,
    hub_api_base: paths.hubApiBase,
    hub_portal_url: paths.hubPortalUrl,
    stack: {
      ...(config.stack || {}),
      mode: 'sandbox',
      backend: config.stack?.backend ?? 'real',
      backend_port: paths.backendPort,
      frontend_port: paths.frontendPort,
      api_prefix: paths.apiPrefix,
    },
  };
  writeFileSync(testPath, `${JSON.stringify(next, null, 2)}\n`);
}

export function writeSandboxTokens() {
  writeFileSync(join(ROOT, '.apphub-token.dev.local'), 'sandbox-dev-token\n');
  writeFileSync(join(ROOT, '.apphub-token.user.local'), 'sandbox-user-token\n');
}

export function resetSandboxState() {
  const dataDir = join(STACK_DIR, 'data');
  const seed = join(STACK_DIR, 'sandbox-hub', 'fixtures', 'state.json');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'sandbox-state.json'), readFileSync(seed, 'utf8'));
}

export async function stackReset(config, log) {
  if (isRealBackend(config)) {
    await resetRealBackend(log);
    await syncSandboxTokens(ROOT, { tryHttp: false });
  } else {
    resetSandboxState();
    writeSandboxTokens();
    log.record({ actor: 'system', action: 'stack.reset', ok: true });
  }
}

export async function stackUp(config, paths, log) {
  let backend;

  if (isRealBackend(config)) {
    if (!existsSync(paths.backendDir)) {
      throw new Error('Laravel backend not installed. Run: npm run test:harness -- stack install');
    }
    backend = spawn(
      'php',
      ['artisan', 'serve', '--host=127.0.0.1', '--port', String(paths.backendPort)],
      {
        cwd: paths.backendDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
      }
    );
    await waitForUrl(paths.integrationDocsUrl);
    await syncSandboxTokens(ROOT, { baseUrl: paths.backendBase });
  } else {
    backend = spawn(process.execPath, [join(STACK_DIR, 'sandbox-hub', 'server.mjs')], {
      cwd: STACK_DIR,
      env: {
        ...process.env,
        SANDBOX_HUB_PORT: String(paths.backendPort),
        SANDBOX_API_PREFIX: paths.apiPrefix,
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
    });
    writeSandboxTokens();
  }

  const vite = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(paths.frontendPort)],
    {
      cwd: FRONTEND_DIR,
      stdio: 'inherit',
      shell: true,
      detached: process.platform !== 'win32',
    }
  );

  const backendLabel = isRealBackend(config) ? 'Laravel apphub-backend' : 'Node mock API';

  log.record({
    actor: 'system',
    action: 'stack.up',
    ok: true,
    detail: `${backendLabel} pid ${backend.pid}, frontend pid ${vite.pid}`,
  });

  console.log(`\nSandbox stack running (${isRealBackend(config) ? 'real packages' : 'mock API'}):`);
  console.log(`  API:    ${paths.hubApiBase}`);
  console.log(`  Portal: ${paths.hubPortalUrl}`);
  console.log(`  Tokens: .apphub-token.dev.local + .apphub-token.user.local (synced from backend)`);
  console.log(`\nPress Ctrl+C to stop.\n`);

  const stop = () => {
    backend.kill();
    vite.kill();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await new Promise(() => {});
}
