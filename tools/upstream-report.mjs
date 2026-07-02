#!/usr/bin/env node
/**
 * Unified upstream reporting — file platform issues + open kit PR (no gh CLI).
 *
 * Usage:
 *   npm run upstream-report -- issue <tag>
 *   npm run upstream-report -- issue --all
 *   npm run upstream-report -- issue --list
 *   npm run upstream-report -- kit-pr
 *   npm run upstream-report -- all
 */

import {
  loadGithubToken,
  loadPublisherConfig,
  log,
  fail,
  printTokenHelp,
  assertAutoFileAllowed,
} from './github-shared.mjs';
import { runIssueCommand } from './upstream-issues.mjs';
import { fileKitPr, runKitPrCommand } from './kit-pr.mjs';
import { fileAllIssues } from './upstream-issues.mjs';

function printHelp() {
  log(`
Upstream report — GitHub issues + kit PR (REST API, no gh CLI)

Commands:
  issue <tag>       File one platform issue from docs/upstream-issues/<tag>/
  issue --all       File all issue templates
  issue --list      List issue templates
  kit-pr            Push origin + open PR to upstream kit repo
  all               File all issues, then kit-pr

Options (issue / kit-pr / all):
  --force           Bypass local dedup log
  --yes, -y         Allow this run when auto_file_issues is false
  --dry-run         kit-pr only: show plan, no push/PR

kit-pr only:
  --allow-dirty     Allow uncommitted working tree

Auth: GITHUB_TOKEN → .github-token.local → git credential

Config: apphub.publisher.json → upstream.kit_repo, upstream.packages_repo
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const config = loadPublisherConfig();

  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const command = argv[0];
  const rest = argv.slice(1);

  if (!command) {
    printHelp();
    return;
  }

  const needsToken =
    command !== 'help' && !(command === 'kit-pr' && rest.includes('--dry-run'));
  let token = null;
  if (needsToken) {
    token = loadGithubToken(config);
    if (!token) printTokenHelp(config, `npm run upstream-report -- ${command}`);
  }

  if (command === 'issue') {
    const readOnly = rest.includes('--list') || rest.length === 0;
    if (!readOnly) assertAutoFileAllowed(config, rest);
    await runIssueCommand(rest, token, config);
    return;
  }

  if (command === 'kit-pr') {
    if (!rest.includes('--dry-run')) assertAutoFileAllowed(config, rest);
    await runKitPrCommand(rest, token, config);
    return;
  }

  if (command === 'all') {
    assertAutoFileAllowed(config, rest);
    const force = rest.includes('--force');
    const allowDirty = rest.includes('--allow-dirty');
    const dryRun = rest.includes('--dry-run');

    await fileAllIssues(token, config, { force });
    if (!dryRun) {
      await fileKitPr(token, config, { force, allowDirty, dryRun: false });
    } else {
      await fileKitPr(token, config, { force, allowDirty, dryRun: true });
    }
    return;
  }

  fail(`Unknown command "${command}". Run: npm run upstream-report -- --help`);
}

main().catch((err) => {
  console.error(`Error: ${err.message || err}`);
  process.exit(1);
});
