# Kit PR template

Tracked template for `npm run upstream-report -- kit-pr` (opens a PR to the official publisher kit).

```
docs/upstream-kit-pr/
  meta.json    title, base branch, upstream_repo (optional override)
  body.md      PR description (Markdown)
```

## Defaults

- **Upstream repo:** `apphub.publisher.json` → `upstream.kit_repo` (default `kennofizet/apphub-apps-ai-builder`)
- **Head:** your GitHub fork of `upstream.kit_repo` + current branch (tool creates fork if needed, remote `kit-pr-fork`)
- **Dedup:** `.upstream-report-log.json` + open PR search on GitHub

## Commands

```bash
npm run upstream-report -- kit-pr --dry-run   # plan only
npm run upstream-report -- kit-pr             # git push + open PR
npm run upstream-report -- all                # file all issues + kit PR
```

Requires a committed branch and GitHub token with pull request access.
