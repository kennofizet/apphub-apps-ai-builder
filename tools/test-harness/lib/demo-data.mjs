import { spawn } from 'node:child_process';
import { discoverApps, latestReleaseZip } from './hub.mjs';
import { ROOT } from './paths.mjs';

function runKit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`node ${args.join(' ')} exited ${code}`));
    });
  });
}

export async function seedDemoApps(config, hub, log, dev) {
  const slugs = config.demo.apps.length ? config.demo.apps : discoverApps().map((a) => a.slug);
  const results = [];

  for (const slug of slugs) {
    const app = discoverApps().find((a) => a.slug === slug);
    if (!app) {
      log.record({
        actor: 'dev',
        action: 'seed.skip',
        ok: false,
        error: `App not found: ${slug}`,
      });
      continue;
    }

    if (config.demo.auto_build_release) {
      await log.track('dev', 'seed.build', () =>
        runKit(['tools/apphub.mjs', 'release', slug, '-y', '--skip-build'])
      );
    }

    const zipPath = latestReleaseZip(app);
    if (!zipPath) {
      log.record({
        actor: 'dev',
        action: 'seed.register',
        ok: false,
        error: `No release zip for ${slug}. Run: node tools/apphub.mjs release ${slug} -y`,
      });
      continue;
    }

    if (!config.demo.auto_register) {
      log.record({
        actor: 'dev',
        action: 'seed.skip',
        ok: true,
        detail: `auto_register off — would use ${zipPath}`,
      });
      continue;
    }

    const { res, body } = await hub.register(dev, zipPath, { allowVersionConflict: true });
    const data = body?.data || body;
    const versionMsg = body?.message || '';
    if (!res.ok && res.status === 422 && versionMsg.includes('Version must be greater')) {
      log.record({
        actor: 'dev',
        action: 'seed.register',
        ok: true,
        detail: `skip — ${versionMsg}`,
      });
      results.push({ slug, ok: true, skipped: true });
      continue;
    }
    results.push({ slug, ok: res.ok, version: data?.version, status: data?.status });
  }

  return results;
}
