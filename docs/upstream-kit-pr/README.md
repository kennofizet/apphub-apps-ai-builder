# Upstream PR templates

Each template describes **only that upstream repo**. Do not cross-reference other repositories in PR bodies.

## Publisher kit PR

For `npm run upstream-report -- kit-pr` → `upstream.kit_repo` (default `kennofizet/apphub-apps-ai-builder`).

```
docs/upstream-kit-pr/
  meta.json    title, base branch, pr_branch, upstream_repo (optional)
  body.md      PR description — kit changes only
```

## App Hub packages PR

For `node tools/packages-pr.mjs` → `upstream.packages_repo` (default `kennofizet/apphub-packages`).

```
docs/upstream-packages-pr/
  meta.json    title, base branch, pr_branch, upstream_repo (optional)
  body.md      PR description — integration-docs.json changes only
```

Patch source: `tools/patch-integration-docs.mjs` → `_integration-docs-patched.json` (gitignored scratch).

## Publisher config

`apphub.publisher.json` (gitignored locally):

| Key | Purpose |
|-----|---------|
| `upstream.kit_repo` | Target for `kit-pr` |
| `upstream.packages_repo` | Target for `packages-pr.mjs` and `upstream-report issue` |

Example defaults in `apphub.publisher.example.json`.

## Commands

```bash
node tools/upstream-report.mjs kit-pr --yes    # kit repo PR
node tools/packages-pr.mjs                     # packages repo PR
```
