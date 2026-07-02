#!/usr/bin/env node
/**
 * App Hub publisher CLI — list apps, bump version, build, zip for upload.
 *
 * Usage:
 *   npm run apphub              interactive menu
 *   npm run apphub -- list      list apps in apps/
 *   node tools/apphub.mjs release <slug> 1.0.0 -y
 */

import archiver from 'archiver';
import { spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdLaunch, cmdRegister, cmdTest } from './hub-commands.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPS_DIR = join(ROOT, 'apps');

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
    } else if (arg === '--skip-build') {
      flags.skipBuild = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg.startsWith('--bump=')) {
      flags.bump = arg.slice('--bump='.length);
    } else if (arg === '--bump' && argv[i + 1]) {
      flags.bump = argv[++i];
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  const command = positionals[0];
  const slug = positionals[1];
  if (
    command === 'release' &&
    !flags.bump &&
    positionals[2] &&
    /^\d+\.\d+\.\d+$/.test(positionals[2])
  ) {
    flags.bump = positionals[2];
  }

  return { command, slug, flags };
}

function discoverApps() {
  if (!existsSync(APPS_DIR)) return [];

  return readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(APPS_DIR, d.name);
      const manifestPath = join(dir, 'manifest.json');
      const packagePath = join(dir, 'package.json');
      if (!existsSync(manifestPath) || !existsSync(packagePath)) return null;

      const manifest = readJson(manifestPath);
      const pkg = readJson(packagePath);
      return {
        slug: manifest.slug || d.name,
        dir,
        name: manifest.name || d.name,
        version: manifest.version || pkg.version || '0.0.0',
        runtimeType: manifest.runtime_type || 'unknown',
        manifestPath,
        packagePath,
        distDir: join(dir, 'dist'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function bumpSemver(version, type) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`Invalid semver "${version}". Use major.minor.patch.`);
  }
  const [major, minor, patch] = version.split('.').map(Number);
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  if (type === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  fail(`Unknown bump "${type}". Use patch, minor, major, or x.y.z.`);
}

function setAppVersion(app, nextVersion, dryRun) {
  const manifest = readJson(app.manifestPath);
  const pkg = readJson(app.packagePath);

  manifest.version = nextVersion;
  pkg.version = nextVersion;
  if (!manifest.slug) manifest.slug = basename(app.dir);

  if (dryRun) {
    log(`[dry-run] Would set ${app.slug} version → ${nextVersion}`);
    return;
  }

  writeJson(app.manifestPath, manifest);
  writeJson(app.packagePath, pkg);
  log(`Version updated: ${app.slug} → ${nextVersion}`);
}

async function zipDist(distDir, outPath) {
  if (!existsSync(distDir)) fail(`Build output not found: ${distDir}`);
  if (!existsSync(join(distDir, 'manifest.json'))) {
    fail(`dist/manifest.json missing in ${distDir}. Build may have failed.`);
  }
  if (!existsSync(join(distDir, 'index.html'))) {
    fail(`dist/index.html missing in ${distDir}.`);
  }

  await new Promise((resolvePromise, reject) => {
    const output = createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolvePromise);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
  });

  const sizeKb = Math.round(statSync(outPath).size / 1024);
  return { outPath, sizeKb };
}

async function ensureDeps(appDir) {
  if (!existsSync(join(appDir, 'node_modules'))) {
    log('Installing dependencies…');
    await run('npm', ['install'], appDir);
  }
}

async function buildApp(app) {
  await ensureDeps(app.dir);
  log(`Building ${app.slug}…`);
  await run('npm', ['run', 'build'], app.dir);
}

async function prompt(rl, question) {
  const answer = await rl.question(question);
  return answer.trim();
}

async function pickApp(apps, rl, slugArg) {
  if (slugArg) {
    const app = apps.find((a) => a.slug === slugArg);
    if (!app) fail(`App not found: ${slugArg}`);
    return app;
  }

  if (apps.length === 0) {
    fail('No apps in apps/. Create apps/<slug>/ first (see AGENTS.md).');
  }
  if (apps.length === 1) {
    log(`Only one app: ${apps[0].slug} (${apps[0].version})`);
    return apps[0];
  }

  log('\nSelect an app:\n');
  apps.forEach((app, i) => {
    log(`  ${i + 1}) ${app.slug} — ${app.name} [v${app.version}, ${app.runtimeType}]`);
  });
  log('');

  while (true) {
    const raw = await prompt(rl, 'Enter number or slug: ');
    const num = Number(raw);
    if (Number.isInteger(num) && num >= 1 && num <= apps.length) {
      return apps[num - 1];
    }
    const bySlug = apps.find((a) => a.slug === raw);
    if (bySlug) return bySlug;
    log('Invalid choice. Try again.');
  }
}

async function pickBump(rl, current, bumpArg) {
  if (bumpArg) return bumpSemver(current, bumpArg);

  log(`\nCurrent version: ${current}`);
  log('Bump: 1) patch  2) minor  3) major  4) custom  5) keep\n');

  while (true) {
    const raw = await prompt(rl, 'Choice [1]: ');
    const choice = raw || '1';
    if (choice === '1' || choice === 'patch') return bumpSemver(current, 'patch');
    if (choice === '2' || choice === 'minor') return bumpSemver(current, 'minor');
    if (choice === '3' || choice === 'major') return bumpSemver(current, 'major');
    if (choice === '5' || choice === 'keep') return current;
    if (choice === '4' || choice === 'custom') {
      const v = await prompt(rl, 'Enter version (x.y.z): ');
      if (/^\d+\.\d+\.\d+$/.test(v)) return v;
      log('Invalid semver.');
      continue;
    }
    log('Invalid choice.');
  }
}

async function cmdList() {
  const apps = discoverApps();
  if (apps.length === 0) {
    log('No apps in apps/ yet. Create apps/<slug>/ per AGENTS.md and apphub-publisher rules.');
    return;
  }

  log('\nApps:\n');
  for (const app of apps) {
    const built = existsSync(join(app.distDir, 'manifest.json')) ? 'built' : 'not built';
    log(`  ${app.slug.padEnd(20)} v${app.version.padEnd(8)} ${app.runtimeType.padEnd(8)} ${built}`);
  }
  log('');
}

async function cmdRelease(slugArg, flags) {
  const apps = discoverApps();
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const app = await pickApp(apps, rl, slugArg);
    const nextVersion = await pickBump(rl, app.version, flags.bump);

    const releaseDir = join(app.dir, 'release');
    const zipName = `${app.slug}-${nextVersion}.zip`;
    const zipPath = join(releaseDir, zipName);

    log('\nRelease plan:');
    log(`  App:     ${app.slug} (${app.name})`);
    log(`  Version: ${app.version} → ${nextVersion}`);
    log(`  Build:   ${flags.skipBuild ? 'skip' : 'yes'}`);
    log(`  Zip:     ${zipPath}`);
    log('');

    if (!flags.dryRun && !flags.yes) {
      const confirm = await prompt(rl, 'Continue? [Y/n]: ');
      if (confirm.toLowerCase() === 'n') {
        log('Cancelled.');
        return;
      }
    }

    if (nextVersion !== app.version) {
      setAppVersion(app, nextVersion, flags.dryRun);
      app.version = nextVersion;
    }

    if (!flags.dryRun && !flags.skipBuild) {
      await buildApp(app);
    }

    if (flags.dryRun) {
      log('[dry-run] Would create zip at ' + zipPath);
      return;
    }

    mkdirSync(releaseDir, { recursive: true });
    const { outPath, sizeKb } = await zipDist(app.distDir, zipPath);
    log(`\nDone. Upload this bundle to App Hub:\n  ${outPath} (${sizeKb} KB)\n`);
  } finally {
    rl.close();
  }
}

async function interactiveMenu() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    log('\nApp Hub — Publisher CLI\n');
    log('  1) List apps');
    log('  2) Release (bump version + build + zip)');
    log('  3) Help');
    log('  4) Exit\n');

    const choice = await prompt(rl, 'Choice [1]: ');
    const pick = choice || '1';

    if (pick === '1') await cmdList();
    else if (pick === '2') await cmdRelease(undefined, {});
    else if (pick === '3') printHelp();
    else if (pick === '4' || pick.toLowerCase() === 'q') return;
    else fail('Invalid menu choice.');
  } finally {
    rl.close();
  }
}

function printHelp() {
  log(`
App Hub publisher CLI

Usage:
  npm run apphub                         Interactive menu
  npm run apphub -- list                 List apps in apps/
  npm run apphub -- test <slug>          Test launch + runtime assets (needs .apphub-token.local)
  npm run apphub -- launch <slug>         Mint launch URL (smoke test)
  npm run apphub -- register <slug>      Upload latest release zip to Hub
  node tools/apphub.mjs release <slug>     Bump version, build, zip

Release examples:
  node tools/apphub.mjs release <slug> 1.0.0 -y
  node tools/apphub.mjs release <slug> --bump=patch -y
  node tools/apphub.mjs release <slug> --skip-build -y

Options:
  --bump=<patch|minor|major|x.y.z>   Version bump (default: interactive)
  --skip-build                       Zip existing dist/ without rebuilding
  --dry-run                          Show plan only
  -y, --yes                          Skip confirmation prompt
  -h, --help                         Show this help

Zip output: apps/<slug>/release/<slug>-<version>.zip
Upload via POST /apps/register (hosted runtime).

Apps are created under apps/<slug>/ per AGENTS.md — this CLI does not scaffold apps.
`);
}

async function main() {
  const { command, slug, flags } = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return;
  }

  if (!command) {
    await interactiveMenu();
    return;
  }

  if (command === 'list') {
    await cmdList();
    return;
  }

  if (command === 'release') {
    await cmdRelease(slug, flags);
    return;
  }

  if (command === 'test') {
    await cmdTest(slug);
    return;
  }

  if (command === 'launch') {
    await cmdLaunch(slug);
    return;
  }

  if (command === 'register') {
    await cmdRegister(slug, flags);
    return;
  }

  fail(`Unknown command "${command}". Run with --help.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
