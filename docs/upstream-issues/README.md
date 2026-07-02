# Upstream issue templates

One folder per issue **tag** (slug). Folders are **gitignored** — local drafts only; the kit ships this README + the CLI.

```
docs/upstream-issues/
  README.md                 ← tracked (kit)
  <tag>/                    ← gitignored
    meta.json
    body.md
```

## Add a template

1. Create folder `docs/upstream-issues/<tag>/`

2. `meta.json`:

```json
{
  "title": "Short issue title for GitHub",
  "labels": ["enhancement", "documentation"],
  "repo": "kennofizet/apphub-packages"
}
```

`repo` must match `upstream.packages_repo` or `upstream.kit_repo` in `apphub.publisher.json`.

3. `body.md` — issue body (Markdown).

4. File it:

```bash
npm run upstream-issue -- <tag>
```

Example tag: `icon-manifest`, `hosted-download`, `bridge-locale-theme`.

## Dedup

- Local log: `.upstream-report-log.json` at repo root (gitignored)
- GitHub: skips if an open issue with the same title already exists
- `--force` bypasses the local log only

## Auth

Git credential (same as `git push`), or `.github-token.local`, or `GITHUB_TOKEN` env.
