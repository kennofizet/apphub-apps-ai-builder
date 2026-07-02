import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  assertValidTag,
  fail,
  githubApi,
  loadReportLog,
  log,
  saveReportLog,
  validateIssueRepo,
} from './github-shared.mjs';

const ISSUES_DIR = join(ROOT, 'docs', 'upstream-issues');

async function findOpenIssueByTitle(token, repo, title) {
  const q = encodeURIComponent(`repo:${repo} is:issue is:open "${title}" in:title`);
  const result = await githubApi(token, 'GET', `/search/issues?q=${q}`);
  const hit = result.items?.find((item) => item.title === title);
  return hit ?? null;
}

export function listIssueTemplates() {
  if (!existsSync(ISSUES_DIR)) return [];
  return readdirSync(ISSUES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .filter((tag) => {
      const dir = join(ISSUES_DIR, tag);
      return existsSync(join(dir, 'meta.json')) && existsSync(join(dir, 'body.md'));
    })
    .sort();
}

export function loadIssueTemplate(tag, config = {}) {
  assertValidTag(tag);
  const dir = join(ISSUES_DIR, tag);
  const metaPath = join(dir, 'meta.json');
  const bodyPath = join(dir, 'body.md');
  if (!existsSync(metaPath)) {
    fail(
      `Unknown template "${tag}". Run: npm run upstream-report -- issue --list\n` +
        `Expected: docs/upstream-issues/${tag}/meta.json`
    );
  }
  if (!existsSync(bodyPath)) fail(`Missing: docs/upstream-issues/${tag}/body.md`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const body = readFileSync(bodyPath, 'utf8').trim();
  if (!meta.title || !meta.repo) fail(`Invalid meta for "${tag}": need title + repo.`);
  validateIssueRepo(meta.repo, config);
  return { tag, meta, body };
}

export async function fileIssueTemplate(token, tag, config, options = {}) {
  const { force = false } = options;
  const { meta, body } = loadIssueTemplate(tag, config);
  const logData = loadReportLog();
  const repo = meta.repo;
  const logKey = `issue:${repo}/${tag}`;

  if (logData[logKey]?.url && !force) {
    log(`Already filed: ${logData[logKey].url}`);
    log('Use --force to file again anyway.');
    return logData[logKey];
  }

  const existing = await findOpenIssueByTitle(token, repo, meta.title);
  if (existing) {
    log(`Open issue already exists: ${existing.html_url}`);
    logData[logKey] = {
      number: existing.number,
      url: existing.html_url,
      filed_at: new Date().toISOString(),
      deduped: true,
    };
    saveReportLog(logData);
    return logData[logKey];
  }

  const issue = await githubApi(token, 'POST', `/repos/${repo}/issues`, {
    title: meta.title,
    body,
    labels: meta.labels ?? [],
  });

  logData[logKey] = {
    number: issue.number,
    url: issue.html_url,
    filed_at: new Date().toISOString(),
  };
  saveReportLog(logData);
  log(`Filed issue: ${issue.html_url}`);
  return logData[logKey];
}

export async function fileAllIssues(token, config, options = {}) {
  const tags = listIssueTemplates();
  if (tags.length === 0) {
    log('No issue templates in docs/upstream-issues/<tag>/');
    return [];
  }
  const results = [];
  for (const tag of tags) {
    results.push(await fileIssueTemplate(token, tag, config, options));
  }
  return results;
}

export async function runIssueCommand(args, token, config) {
  if (args.includes('--list') || args.length === 0) {
    log('Upstream issue templates:\n');
    for (const tag of listIssueTemplates()) {
      const { meta } = loadIssueTemplate(tag, config);
      log(`  ${tag} → ${meta.repo}`);
    }
    log('\nUsage: npm run upstream-report -- issue <tag>');
    return;
  }

  if (!token) fail('GitHub token required. See: npm run upstream-report -- --help');

  const force = args.includes('--force');

  if (args.includes('--all')) {
    await fileAllIssues(token, config, { force });
    return;
  }

  const tag = args.find((a) => !a.startsWith('-'));
  if (!tag) fail('Provide a template tag. Use: issue --list');

  await fileIssueTemplate(token, tag, config, { force });
}
