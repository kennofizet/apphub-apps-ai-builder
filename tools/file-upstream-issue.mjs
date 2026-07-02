#!/usr/bin/env node
/** Backward-compatible alias — delegates to upstream-report issue */
import { loadGithubToken, loadPublisherConfig, printTokenHelp } from './github-shared.mjs';
import { runIssueCommand } from './upstream-issues.mjs';

const config = loadPublisherConfig();
const args = process.argv.slice(2);
const token = loadGithubToken(config);
const needsAuth = args.length > 0 && !args.includes('--list');

if (needsAuth && !token) {
  printTokenHelp(config, 'npm run upstream-issue -- <tag>');
}

runIssueCommand(args, token, config).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
