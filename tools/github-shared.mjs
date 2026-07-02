import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT_LOG_PATH = join(ROOT, '.upstream-report-log.json');

/** @deprecated same file; kept for migration */
const LEGACY_LOG_PATH = join(ROOT, '.upstream-issues-log.json');

export function log(msg) {
  console.log(msg);
}

export function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

export function loadPublisherConfig() {
  const path = join(ROOT, 'apphub.publisher.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function loadGithubTokenFromGitCredential() {
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    cwd: ROOT,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 || !result.stdout) return null;

  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('password=')) {
      const token = line.slice('password='.length).trim();
      return token || null;
    }
  }
  return null;
}

export function loadGithubToken(config) {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv?.trim()) return fromEnv.trim();

  const fileName = config.upstream?.github_token_file || '.github-token.local';
  const tokenPath = join(ROOT, fileName);
  if (existsSync(tokenPath)) {
    const token = readFileSync(tokenPath, 'utf8').trim();
    if (token) return token;
  }

  return loadGithubTokenFromGitCredential() || null;
}

export function printTokenHelp(config, commandHint = 'npm run upstream-report') {
  const fileName = config.upstream?.github_token_file || '.github-token.local';
  fail(
    `GitHub token missing. Options:\n` +
      `  1) Log in to GitHub via Git (Credential Manager) — same as git push\n` +
      `  2) Create ${fileName} with a PAT (scope: public_repo or repo + pull_requests)\n` +
      `  3) Set GITHUB_TOKEN env var\n` +
      `Then run: ${commandHint}`
  );
}

export async function githubApi(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'apphub-publisher-kit',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text };
  }

  if (!res.ok) {
    const msg = json?.message || res.statusText;
    const details = json?.errors?.length
      ? `\n  ${json.errors.map((e) => e.message || JSON.stringify(e)).join('\n  ')}`
      : '';
    const err = new Error(`GitHub API ${res.status}: ${msg}${details}`);
    err.status = res.status;
    err.json = json;
    throw err;
  }

  return json;
}

export function loadReportLog() {
  for (const path of [REPORT_LOG_PATH, LEGACY_LOG_PATH]) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

export function saveReportLog(data) {
  writeFileSync(REPORT_LOG_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

export function assertValidTag(tag) {
  if (!TAG_PATTERN.test(tag)) {
    fail(`Invalid tag "${tag}". Use letters, numbers, hyphens, underscores.`);
  }
}

const REPO_FORMAT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function getAllowedUpstreamRepos(config) {
  const upstream = config.upstream || {};
  const repos = new Set();
  if (upstream.packages_repo) repos.add(upstream.packages_repo);
  if (upstream.kit_repo) repos.add(upstream.kit_repo);
  return repos;
}

export function validateIssueRepo(repo, config) {
  if (!REPO_FORMAT.test(repo)) {
    fail(`Invalid repo "${repo}". Use owner/name format.`);
  }
  const allowed = getAllowedUpstreamRepos(config);
  if (allowed.size === 0) {
    fail(
      'No upstream repo allowlist in apphub.publisher.json. Set upstream.packages_repo and/or upstream.kit_repo.'
    );
  }
  if (!allowed.has(repo)) {
    fail(`Repo "${repo}" is not allowed. Allowed: ${[...allowed].join(', ')}`);
  }
}

export function isAutoFileEnabled(config) {
  return config.upstream?.auto_file_issues === true;
}

export function assertAutoFileAllowed(config, argv) {
  if (argv.includes('--yes') || argv.includes('-y')) return;
  if (isAutoFileEnabled(config)) return;
  fail(
    'Upstream auto-filing is disabled (upstream.auto_file_issues is not true).\n' +
      '  Enable it in apphub.publisher.json, or pass --yes for this run only.'
  );
}
