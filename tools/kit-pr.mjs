import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  ROOT,
  fail,
  githubApi,
  loadReportLog,
  log,
  saveReportLog,
} from './github-shared.mjs';

const KIT_PR_DIR = join(ROOT, 'docs', 'upstream-kit-pr');
const FORK_REMOTE = 'kit-pr-fork';
const DEFAULT_TITLE = 'feat: automatic upstream issue filing for AI agents';

function git(args) {
  return spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGitState() {
  const branchResult = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchResult.status !== 0) fail('Not a git repository.');
  const branch = branchResult.stdout.trim();
  const dirty = git(['status', '--porcelain']).stdout.trim();
  return { branch, dirty };
}

function loadKitPrTemplate(config) {
  const metaPath = join(KIT_PR_DIR, 'meta.json');
  const bodyPath = join(KIT_PR_DIR, 'body.md');

  const upstreamRepo =
    config.upstream?.kit_repo || 'kennofizet/apphub-apps-ai-builder';

  let meta = { title: DEFAULT_TITLE, base: 'main', upstream_repo: upstreamRepo };
  if (existsSync(metaPath)) {
    meta = { ...meta, ...JSON.parse(readFileSync(metaPath, 'utf8')) };
  }

  const repo = meta.upstream_repo || upstreamRepo;
  if (!meta.title) fail('docs/upstream-kit-pr/meta.json needs "title".');
  const prBranch = meta.pr_branch || null;

  let body = '';
  if (existsSync(bodyPath)) {
    body = readFileSync(bodyPath, 'utf8').trim();
  }

  if (!body) {
    body = [
      '## Summary',
      '',
      'Publisher kit improvements: upstream issue tooling for AI agents.',
      '',
      'See fork commit history for file list.',
      '',
      '## Test plan',
      '',
      '- [ ] `npm install`',
      '- [ ] `npm run upstream-report -- issue --list`',
      '- [ ] `npm run upstream-report -- kit-pr --dry-run`',
    ].join('\n');
  }

  return {
    title: meta.title,
    base: meta.base || 'main',
    upstreamRepo: repo,
    prBranch,
    body,
  };
}

async function ensureUpstreamFork(token, upstreamRepo, dryRun) {
  const [upstreamOwner, repoName] = upstreamRepo.split('/');
  const user = await githubApi(token, 'GET', '/user');
  const forkFull = `${user.login}/${repoName}`;

  try {
    const existing = await githubApi(token, 'GET', `/repos/${forkFull}`);
    if (existing.fork && existing.parent?.full_name === upstreamRepo) {
      return { owner: user.login, name: repoName, cloneUrl: existing.clone_url };
    }
  } catch (err) {
    if (err.status !== 404) throw err;
  }

  if (dryRun) {
    log(`[dry-run] Would create or use fork: ${forkFull}`);
    return {
      owner: user.login,
      name: repoName,
      cloneUrl: `https://github.com/${forkFull}.git`,
    };
  }

  log(`Ensuring fork ${forkFull}…`);
  try {
    await githubApi(token, 'POST', `/repos/${upstreamOwner}/${repoName}/forks`);
  } catch (err) {
    if (err.status !== 422 && err.status !== 404) throw err;
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const fork = await githubApi(token, 'GET', `/repos/${forkFull}`);
      if (fork.fork && fork.parent?.full_name === upstreamRepo) {
        return { owner: user.login, name: repoName, cloneUrl: fork.clone_url };
      }
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    await sleep(2000);
  }

  fail(`Fork ${forkFull} not ready. Wait a minute and retry.`);
}

function ensureForkRemote(cloneUrl) {
  const remotes = git(['remote']).stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!remotes.includes(FORK_REMOTE)) {
    const add = git(['remote', 'add', FORK_REMOTE, cloneUrl]);
    if (add.status !== 0) {
      fail(`git remote add failed:\n${add.stderr || add.stdout}`);
    }
  } else {
    git(['remote', 'set-url', FORK_REMOTE, cloneUrl]);
  }
}

function resolvePrBranch(localBranch, templateBranch) {
  if (templateBranch) return templateBranch;
  if (localBranch !== 'main') return localBranch;
  return 'kit-contribution/publisher-update';
}

function pushToFork(localBranch, remoteBranch, dryRun, forcePush = false) {
  if (dryRun) {
    log(
      `[dry-run] Would build branch on fork/main and push as ${FORK_REMOTE}/${remoteBranch}`
    );
    return;
  }

  const tracked = git(['ls-files'])
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (tracked.length === 0) fail('No tracked files to contribute.');

  const staging = `_kit_pr_${Date.now()}`;
  const baseRef = `${FORK_REMOTE}/main`;

  log(`Fetching ${baseRef}…`);
  const fetch = git(['fetch', FORK_REMOTE, 'main']);
  if (fetch.status !== 0) {
    fail(`git fetch failed:\n${fetch.stderr || fetch.stdout}`);
  }

  const createBranch = git(['branch', staging, baseRef]);
  if (createBranch.status !== 0) {
    fail(`git branch failed:\n${createBranch.stderr || createBranch.stdout}`);
  }

  const checkout = git(['checkout', staging]);
  if (checkout.status !== 0) {
    fail(`git checkout failed:\n${checkout.stderr || checkout.stdout}`);
  }

  const restore = git(['checkout', localBranch, '--', ...tracked]);
  if (restore.status !== 0) {
    git(['checkout', localBranch]);
    git(['branch', '-D', staging]);
    fail(`git checkout files failed:\n${restore.stderr || restore.stdout}`);
  }

  const dirty = git(['status', '--porcelain']).stdout.trim();
  if (!dirty) {
    git(['checkout', localBranch]);
    git(['branch', '-D', staging]);
    fail('No file changes vs upstream main — nothing to contribute.');
  }

  const commit = git([
    'commit',
    '-m',
    'Publisher kit contribution (upstream report tooling)',
  ]);
  if (commit.status !== 0) {
    git(['checkout', localBranch]);
    git(['branch', '-D', staging]);
    fail(`git commit failed:\n${commit.stderr || commit.stdout}`);
  }

  log(`Pushing ${FORK_REMOTE}/${remoteBranch}…`);
  const pushArgs = ['push', '-u', FORK_REMOTE, `${staging}:${remoteBranch}`];
  if (forcePush) pushArgs.splice(1, 0, '--force');
  const push = git(pushArgs);
  git(['checkout', localBranch]);
  git(['branch', '-D', staging]);

  if (push.status !== 0) {
    fail(`git push failed:\n${push.stderr || push.stdout}`);
  }
}

async function findOpenKitPr(token, upstreamRepo, head) {
  const [owner, repo] = upstreamRepo.split('/');
  const pulls = await githubApi(
    token,
    'GET',
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}`
  );
  return pulls[0] ?? null;
}

export async function fileKitPr(token, config, options = {}) {
  const { dryRun = false, force = false, allowDirty = false } = options;
  const template = loadKitPrTemplate(config);
  const { branch, dirty } = getGitState();
  const logKey = `kit-pr:${template.upstreamRepo}`;
  const logData = loadReportLog();

  const fork = await ensureUpstreamFork(token, template.upstreamRepo, dryRun);
  const remoteBranch = resolvePrBranch(branch, template.prBranch);
  const head = `${fork.owner}:${remoteBranch}`;

  log('\nKit PR plan:');
  log(`  Upstream: ${template.upstreamRepo}`);
  log(`  Fork:     ${fork.owner}/${fork.name}`);
  log(`  Head:     ${head} (local ${branch})`);
  log(`  Base:     ${template.base}`);
  log(`  Title:    ${template.title}`);
  log('');

  if (dirty && !allowDirty && !dryRun) {
    fail('Uncommitted changes. Commit first, or pass --allow-dirty.');
  }

  if (logData[logKey]?.url && !force && !dryRun) {
    log(`Already filed kit PR: ${logData[logKey].url}`);
    log('Use --force to open another PR anyway.');
    return logData[logKey];
  }

  const existing = dryRun ? null : await findOpenKitPr(token, template.upstreamRepo, head);
  if (existing) {
    log(`Open PR already exists: ${existing.html_url}`);
    logData[logKey] = {
      number: existing.number,
      url: existing.html_url,
      filed_at: new Date().toISOString(),
      deduped: true,
    };
    saveReportLog(logData);
    return logData[logKey];
  }

  if (!dryRun) ensureForkRemote(fork.cloneUrl);
  pushToFork(branch, remoteBranch, dryRun, force);

  if (dryRun) {
    log('[dry-run] Would create PR on GitHub.');
    return null;
  }

  const [owner, repo] = template.upstreamRepo.split('/');
  const pr = await githubApi(token, 'POST', `/repos/${owner}/${repo}/pulls`, {
    title: template.title,
    body: template.body,
    head,
    base: template.base,
  });

  logData[logKey] = {
    number: pr.number,
    url: pr.html_url,
    filed_at: new Date().toISOString(),
  };
  saveReportLog(logData);
  log(`Opened kit PR: ${pr.html_url}`);
  return logData[logKey];
}

export async function runKitPrCommand(args, token, config) {
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const allowDirty = args.includes('--allow-dirty');

  if (args.includes('--help')) {
    log(`
Kit PR — open PR to official publisher kit (no gh CLI)

Creates or uses your GitHub fork of upstream.kit_repo, pushes the current
branch to remote "${FORK_REMOTE}", then opens the PR.

Usage:
  npm run upstream-report -- kit-pr
  npm run upstream-report -- kit-pr --dry-run
  npm run upstream-report -- kit-pr --force

Template: docs/upstream-kit-pr/meta.json + body.md (tracked in kit)
Upstream repo: apphub.publisher.json → upstream.kit_repo
`);
    return;
  }

  await fileKitPr(token, config, { dryRun, force, allowDirty });
}
