import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { HARNESS_ROOT } from './paths.mjs';

const STACK_DIR = join(HARNESS_ROOT, 'stack');
const BACKEND_DIR = join(STACK_DIR, 'hub-backend');
const OVERLAY_DIR = join(STACK_DIR, 'host-overlay');
const SANDBOX_DB = 'apphub_sandbox_test';

function runCmd(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: opts.inherit ? 'inherit' : 'pipe',
      shell: process.platform === 'win32',
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
      else reject(new Error(`${cmd} ${args.join(' ')} failed (${code}): ${out.slice(-800)}`));
    });
  });
}

export function backendDir() {
  return BACKEND_DIR;
}

export async function hasPhpStack() {
  try {
    await runCmd('php', ['-v'], { cwd: STACK_DIR });
    await runCmd('composer', ['--version'], { cwd: STACK_DIR });
    const mods = await runCmd('php', ['-m'], { cwd: STACK_DIR });
    if (!mods.toLowerCase().includes('pdo_mysql')) {
      throw new Error('pdo_mysql extension required (enable in php.ini)');
    }
    return true;
  } catch (e) {
    if (e.message?.includes('pdo_mysql')) throw e;
    return false;
  }
}

function backendNeedsRecreate() {
  if (!existsSync(BACKEND_DIR)) return true;
  const composerPath = join(BACKEND_DIR, 'composer.json');
  if (!existsSync(composerPath)) return true;
  const composer = JSON.parse(readFileSync(composerPath, 'utf8'));
  return !composer.require?.['kennofizet/apphub-backend'];
}

async function ensureMysqlDatabase() {
  try {
    await runCmd(
      'mysql',
      ['-u', 'root', '-e', `CREATE DATABASE IF NOT EXISTS \`${SANDBOX_DB}\``],
      { cwd: STACK_DIR }
    );
  } catch {
    console.warn(
      `Warning: could not auto-create MySQL database "${SANDBOX_DB}". Create it manually in Laragon/phpMyAdmin.`
    );
  }
}

function assertHostedRuntimeMediaCsp() {
  const file = join(
    BACKEND_DIR,
    'vendor/kennofizet/apphub-backend/src/Modules/Catalog/Services/AppRuntimeServeService.php'
  );
  if (!existsSync(file)) {
    throw new Error('apphub-backend vendor missing after composer install');
  }
  const src = readFileSync(file, 'utf8');
  if (!/media-src[^;]*blob:/.test(src)) {
    throw new Error(
      'kennofizet/apphub-backend is too old: hosted runtime CSP needs media-src blob:. Run: npm run test:harness -- stack update'
    );
  }
}

function applyOverlay() {
  cpSync(OVERLAY_DIR, BACKEND_DIR, {
    recursive: true,
    filter: (src) => !src.endsWith('.env.sandbox'),
  });
  const envSandbox = join(OVERLAY_DIR, '.env.sandbox');
  const envPath = join(BACKEND_DIR, '.env');
  if (existsSync(envSandbox)) {
    writeFileSync(envPath, `${readFileSync(envSandbox, 'utf8').trim()}\n`);
  }
}

export async function installRealBackend(log) {
  const ok = await hasPhpStack();
  if (!ok) {
    throw new Error(
      'PHP + Composer required for real backend. Install PHP 8.2+ and Composer, or set stack.backend to "mock".'
    );
  }

  mkdirSync(STACK_DIR, { recursive: true });
  await ensureMysqlDatabase();

  if (backendNeedsRecreate() && existsSync(BACKEND_DIR)) {
    rmSync(BACKEND_DIR, { recursive: true, force: true });
  }

  if (!existsSync(BACKEND_DIR)) {
    await log.track('system', 'stack.laravel.create', () =>
      runCmd('composer', ['create-project', 'laravel/laravel:^12.0', BACKEND_DIR, '--no-interaction'], {
        inherit: true,
      })
    );
  }

  await log.track('system', 'stack.composer.require', () =>
    runCmd(
      'composer',
      [
        'require',
        'kennofizet/packages-core-backend:dev-main',
        'kennofizet/apphub-backend:dev-main',
        '--no-interaction',
      ],
      { cwd: BACKEND_DIR, inherit: true }
    )
  );

  await log.track('system', 'stack.verify.runtime-csp', async () => {
    assertHostedRuntimeMediaCsp();
  });

  applyOverlay();

  await log.track('system', 'stack.artisan.key', () =>
    runCmd('php', ['artisan', 'key:generate', '--force'], { cwd: BACKEND_DIR, inherit: true })
  );

  for (const tag of [
    'packages-core-config',
    'packages-core-migrations',
    'apphub-config',
    'apphub-migrations',
  ]) {
    await log.track('system', `stack.artisan.publish.${tag}`, () =>
      runCmd('php', ['artisan', 'vendor:publish', '--tag', tag, '--force'], {
        cwd: BACKEND_DIR,
        inherit: true,
      })
    );
  }

  await log.track('system', 'stack.artisan.migrate', () =>
    runCmd('php', ['artisan', 'migrate:fresh', '--seed', '--force'], {
      cwd: BACKEND_DIR,
      inherit: true,
    })
  );
}

export async function updateRealBackend(log) {
  if (!existsSync(BACKEND_DIR)) {
    throw new Error('Backend not installed. Run: npm run test:harness -- stack install');
  }
  await log.track('system', 'stack.composer.update', () =>
    runCmd(
      'composer',
      [
        'update',
        'kennofizet/packages-core-backend',
        'kennofizet/apphub-backend',
        '--no-interaction',
      ],
      { cwd: BACKEND_DIR, inherit: true }
    )
  );
  await log.track('system', 'stack.verify.runtime-csp', async () => {
    assertHostedRuntimeMediaCsp();
  });
  await log.track('system', 'stack.artisan.migrate', () =>
    runCmd('php', ['artisan', 'migrate', '--force'], { cwd: BACKEND_DIR, inherit: true })
  );
}

export async function resetRealBackend(log) {
  if (!existsSync(BACKEND_DIR)) return;
  await log.track('system', 'stack.artisan.fresh', () =>
    runCmd('php', ['artisan', 'migrate:fresh', '--seed', '--force'], {
      cwd: BACKEND_DIR,
      inherit: true,
    })
  );
}

function writeTokenFiles(root, tokens) {
  writeFileSync(join(root, '.apphub-token.dev.local'), `${tokens.dev}\n`);
  writeFileSync(join(root, '.apphub-token.user.local'), `${tokens.user}\n`);
}

export async function extractTokensFromBackend(baseUrl, root) {
  const tokens = {};
  for (const [role, userId] of [
    ['dev', 1],
    ['user', 2],
  ]) {
    const res = await fetch(`${baseUrl}/api/user/login?user_id=${userId}`);
    const body = await res.json();
    if (!res.ok || !body.rewardplay_token) {
      throw new Error(`Failed to fetch ${role} token from sandbox login`);
    }
    tokens[role] = body.rewardplay_token;
  }
  writeTokenFiles(root, tokens);
  return tokens;
}

export async function extractTokensViaScript(root) {
  const out = await runCmd('php', ['scripts/export-sandbox-tokens.php'], { cwd: BACKEND_DIR });
  const tokens = JSON.parse(out.trim());
  writeTokenFiles(root, tokens);
  return tokens;
}

/** Prefer HTTP login when the stack is up; fall back to artisan script after install/reset. */
export async function syncSandboxTokens(root, opts = {}) {
  const baseUrl = opts.baseUrl || 'http://127.0.0.1:8790';
  if (opts.tryHttp !== false) {
    try {
      return await extractTokensFromBackend(baseUrl, root);
    } catch {
      /* server not running yet */
    }
  }
  return extractTokensViaScript(root);
}
