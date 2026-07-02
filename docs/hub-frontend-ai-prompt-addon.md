# App Hub frontend — AI prompt add-on (for Hub operators)

Append this block to the **Publisher AI prompt** your Hub frontend sends when a user connects a publisher workspace (alongside App Hub token + integration docs URL).

Hub should **write local files automatically** — publishers must not copy-paste issue bodies or run `gh` CLI.

---

## Inject into publisher workspace (on connect)

| File | Purpose |
|------|---------|
| `.apphub-token.local` | Hub API token (`X-Knf-Token`) — already required |
| `.github-token.local` | GitHub PAT, one line, scope `public_repo` — for filing upstream issues |
| `apphub.publisher.json` | URLs + `upstream.auto_file_issues: true` |

Example `apphub.publisher.json` fragment:

```json
{
  "integration_docs_url": "<operator integration-docs URL>",
  "hub_portal_url": "<hub portal URL>",
  "upstream": {
    "auto_file_issues": true,
    "github_token_file": ".github-token.local",
    "packages_repo": "kennofizet/apphub-packages",
    "kit_repo": "kennofizet/apphub-apps-ai-builder"
  }
}
```

## UI buttons (Publisher portal)

1. **Copy token for AI** → writes `.apphub-token.local`
2. **Copy GitHub token for AI** → writes `.github-token.local` (fine-grained PAT: Issues read/write on `kennofizet/apphub-packages`)

## Agent behavior (must be in prompt)

When the publisher agent finds a **platform gap** (app is correct; contract or Hub behavior is not):

1. Apply in-app workarounds if possible.
2. Add `docs/upstream-issues/<tag>/meta.json` + `body.md` describing the gap vs `integration-docs`.
3. **Automatically** run upstream-report **only when** `upstream.auto_file_issues` is `true` (Hub injects this on connect):
   - `npm run upstream-report -- issue <tag>` (or `issue --all`)
   - `npm run upstream-report -- kit-pr` for kit improvements
   - `npm run upstream-report -- all` for both
4. Reply with GitHub issue/PR URLs — **never** ask the user to open github.com manually.
5. If `.github-token.local` is missing: ask user to click **Copy GitHub token for AI** once.

## No terminal gh CLI

`tools/upstream-report.mjs` → GitHub REST API only (issues + kit PR). No `gh` install required.

**Auth order:** `GITHUB_TOKEN` env → `.github-token.local` → **`git credential fill`** (same login as `git push` on Windows Credential Manager).

## Upstream repos

| Repo | Use |
|------|-----|
| `kennofizet/apphub-packages` | Backend, frontend, integration-docs |
| `kennofizet/apphub-apps-ai-builder` | Publisher kit templates |

Issue templates: `docs/upstream-issues/<tag>/meta.json` + `body.md` (gitignored per tag).

Kit PR template: `docs/upstream-kit-pr/meta.json` + `body.md` (tracked).
