## Summary

- Add `tools/upstream-report.mjs` — unified CLI for platform issues + kit PR (no `gh` CLI)
- Add `tools/file-upstream-issue.mjs` / `upstream-issues` — file GitHub issues via REST API
- Add `docs/upstream-issues/README.md` — per-tag templates (`<tag>/meta.json` + `body.md`); tag folders gitignored
- Add `docs/upstream-kit-pr/` — tracked PR template for contributing back to this kit
- Add `docs/hub-frontend-ai-prompt-addon.md` — snippet for Hub operators
- Extend `apphub.publisher.example.json` with optional `upstream` block
- Update `AGENTS.md` and `.cursor/rules/apphub-publisher.mdc` — agents auto-report platform gaps

**Auth:** `GITHUB_TOKEN` env → `.github-token.local` → git credential (same as `git push`).

**Dedup:** `.upstream-report-log.json` (gitignored) + GitHub open-issue/PR search.

## Motivation

When publishers hit platform/contract gaps, AI agents should file upstream issues and kit PRs automatically — not ask the user to open github.com manually.

## Test plan

- [ ] `npm install` at repo root
- [ ] Create `docs/upstream-issues/<tag>/meta.json` + `body.md` locally (gitignored)
- [ ] `npm run upstream-report -- issue --list`
- [ ] `npm run upstream-report -- issue <tag>`
- [ ] `npm run upstream-report -- kit-pr --dry-run`
- [ ] `npm run upstream-report -- kit-pr` (after commit + push)
- [ ] Confirm secrets and issue drafts are not tracked
