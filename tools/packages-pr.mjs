#!/usr/bin/env node
/**
 * Open PR to kennofizet/apphub-packages with integration-docs.json updates.
 * Usage: node tools/packages-pr.mjs [--dry-run]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ROOT,
  fail,
  githubApi,
  loadGithubToken,
  loadPublisherConfig,
  log,
} from './github-shared.mjs';

const PATCHED = join(ROOT, '_integration-docs-patched.json');
const TARGET =
  'packages/backend/src/Modules/Bridge/Resources/integration-docs.json';
const PACKAGES_PR_DIR = join(ROOT, 'docs', 'upstream-packages-pr');
const BRANCH = 'publisher/integration-docs-hosted-i18n-export';
const dryRun = process.argv.includes('--dry-run');

function loadPackagesPrTemplate(config) {
  const upstreamRepo =
    config.upstream?.packages_repo || 'kennofizet/apphub-packages';
  const metaPath = join(PACKAGES_PR_DIR, 'meta.json');
  const bodyPath = join(PACKAGES_PR_DIR, 'body.md');

  let meta = {
    title:
      'docs(integration): hosted i18n, file export, and contract-only publisher guide',
    base: 'main',
    upstream_repo: upstreamRepo,
    pr_branch: BRANCH,
  };
  if (existsSync(metaPath)) {
    meta = { ...meta, ...JSON.parse(readFileSync(metaPath, 'utf8')) };
  }

  const repo = meta.upstream_repo || upstreamRepo;
  if (!existsSync(bodyPath)) {
    fail('Missing docs/upstream-packages-pr/body.md');
  }

  return {
    title: meta.title,
    base: meta.base || 'main',
    upstreamRepo: repo,
    prBranch: meta.pr_branch || BRANCH,
    body: readFileSync(bodyPath, 'utf8').trim(),
  };
}

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
}

async function ensureFork(token, upstreamRepo) {
  const [owner, name] = upstreamRepo.split('/');
  const user = await githubApi(token, 'GET', '/user');
  const forkFull = `${user.login}/${name}`;
  try {
    const fork = await githubApi(token, 'GET', `/repos/${forkFull}`);
    if (fork.fork && fork.parent?.full_name === upstreamRepo) {
      return { owner: user.login, name, cloneUrl: fork.clone_url };
    }
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  if (dryRun) return { owner: user.login, name, cloneUrl: `https://github.com/${forkFull}.git` };
  log(`Forking ${upstreamRepo}…`);
  try {
    await githubApi(token, 'POST', `/repos/${owner}/${name}/forks`);
  } catch (err) {
    if (err.status !== 422) throw err;
  }
  for (let i = 0; i < 30; i++) {
    try {
      const fork = await githubApi(token, 'GET', `/repos/${forkFull}`);
      if (fork.fork) return { owner: user.login, name, cloneUrl: fork.clone_url };
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail('Fork not ready');
}

async function syncPackagesPrDescription(token, upstreamRepo, pr, template) {
  const [owner, repo] = upstreamRepo.split('/');
  const needsUpdate = pr.title !== template.title || pr.body !== template.body;
  if (!needsUpdate) {
    log('PR title and body already match docs/upstream-packages-pr/.');
    return pr;
  }
  log(`Syncing PR #${pr.number} description from docs/upstream-packages-pr/`);
  return githubApi(token, 'PATCH', `/repos/${owner}/${repo}/pulls/${pr.number}`, {
    title: template.title,
    body: template.body,
  });
}

async function main() {
  const config = loadPublisherConfig();
  const template = loadPackagesPrTemplate(config);
  const UPSTREAM = template.upstreamRepo;
  const token = loadGithubToken(config);
  if (!token) fail('GitHub token required (git credential or .github-token.local)');

  if (!readFileSync(PATCHED, 'utf8')) fail('Run: node tools/patch-integration-docs.mjs first');

  const fork = await ensureFork(token, UPSTREAM);
  const head = `${fork.owner}:${template.prBranch}`;

  if (!dryRun) {
    const [owner, repo] = UPSTREAM.split('/');
    const existing = await githubApi(
      token,
      'GET',
      `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}`
    );
    if (existing[0]) {
      const synced = await syncPackagesPrDescription(
        token,
        UPSTREAM,
        existing[0],
        template
      );
      log(`Existing PR: ${synced.html_url}`);
    }
  }

  const workDir = join(ROOT, '.packages-pr-worktree');
  const cloneUrl = fork.cloneUrl;

  if (!dryRun) {
    const probe = git(['rev-parse', '--is-inside-work-tree'], workDir);
    if (probe.status !== 0) {
      spawnSync('cmd', ['/c', 'if exist .packages-pr-worktree rmdir /s /q .packages-pr-worktree'], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      const clone = git(['clone', '--depth', '1', cloneUrl, '.packages-pr-worktree'], ROOT);
      if (clone.status !== 0) fail(clone.stderr || clone.stdout);
    } else {
      git(['fetch', 'origin', 'main'], workDir);
      git(['checkout', 'main'], workDir);
      git(['pull', 'origin', 'main'], workDir);
    }

    git(['checkout', '-B', template.prBranch], workDir);
    const dest = join(workDir, TARGET);
    const { copyFileSync } = await import('node:fs');
    copyFileSync(PATCHED, dest);

    const status = git(['status', '--porcelain'], workDir);
    if (!status.stdout.trim()) {
      log('Branch already matches patched integration-docs — description sync only.');
      return;
    }

    git(['add', TARGET], workDir);
    const commit = git(
      [
        'commit',
        '-m',
        'docs(integration): hosted i18n, file export, contract-only guide (schema 1.13.0)',
      ],
      workDir
    );
    if (commit.status !== 0) fail(commit.stderr || commit.stdout);

    const push = git(['push', '-u', 'origin', template.prBranch, '--force'], workDir);
    if (push.status !== 0) fail(push.stderr || push.stdout);
  }

  if (dryRun) {
    log(`[dry-run] Would open or update PR ${UPSTREAM} ← ${head}`);
    return;
  }

  const [owner, repo] = UPSTREAM.split('/');
  const existing = await githubApi(
    token,
    'GET',
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}`
  );
  if (existing[0]) return;

  const pr = await githubApi(token, 'POST', `/repos/${owner}/${repo}/pulls`, {
    title: template.title,
    body: template.body,
    head,
    base: template.base,
  });
  log(`Opened packages PR: ${pr.html_url}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
