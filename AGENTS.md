# AI agent guide — App Hub publisher kit

This repository is a **publisher workspace**, not a pre-built app. Create apps under `apps/<slug>/` following the rules and the integration contract from the publisher's local config.

## Read first (in order)

1. **`apphub.publisher.json`** (repo root, **gitignored**) — the **only** place for `integration_docs_url` and `hub_portal_url`. If the file is missing, tell the user to run `cp apphub.publisher.example.json apphub.publisher.json` and fill it in.
2. **`.cursor/rules/apphub-publisher.mdc`** — mandatory rules (layout, bridge, i18n, themes, English-only code, PLAN.md per app).
3. **Integration docs** — `GET` the URL from `integration_docs_url` in `apphub.publisher.json`. If empty, **ask the user** — do not guess, invent hosts, or use URLs from chat unless the user pastes them into `apphub.publisher.json`.
4. **`docs/sdk-stub.js`** — bridge SDK for hosted apps.

### `apphub.publisher.json` (never commit)

| Key | If empty / missing | Agent action |
|-----|-------------------|--------------|
| `integration_docs_url` | yes | Ask user for integration docs URL; wait until set in their local file |
| `hub_portal_url` | yes | Ask user for portal URL when deploy or testing steps need it |
| `upstream.auto_file_issues` | not `true` | Do **not** run `upstream-report` unless the user asks or passes `--yes` |

**Never write real Hub URLs into tracked files** (README, rules, source, or git). URLs belong only in the gitignored `apphub.publisher.json`.

App Hub may populate this file when the publisher links their instance.

## Repo layout

```
apphub.publisher.example.json   Tracked template (empty URLs)
apphub.publisher.json           Local only — user's real URLs (gitignored)
apps/<slug>/                    Apps you create
tools/apphub.mjs                Release + test + register + launch CLI
tools/hub-client.mjs            Hub API helpers (token, publisher config)
tools/hub-commands.mjs          test / register / launch commands
tools/upstream-report.mjs       Optional — file issues + kit PR
docs/upstream-issues/<tag>/     Issue templates (gitignored)
docs/upstream-kit-pr/           Kit PR template (tracked)
docs/sdk-stub.js                Bridge SDK
```

## Per-app requirements (summary)

- `runtime_type`: `hosted` (zip on Hub) or `iframe` (publisher `entry_url`).
- **Hosted:** `await window.__APPHUB_STORAGE__?.ready`; zip `dist/` with `manifest.json` at root.
- **Bridge:** `apphub:bridge:ready`; `display_user` for UI only; server auth via `GET bridge/user`.
- **i18n:** `locales/en.json` + `locales/vi.json` — **bundle into JS for hosted** (do not `fetch('./locales/…')` at runtime).
- **Themes:** dark + light via CSS variables.
- **Export (hosted):** `desktop.download` in manifest + `bridge.saveFile` — see rules.
- **PLAN.md** per app, updated every session.

## Test and deploy (local Hub)

Requires `apphub.publisher.json` and `.apphub-token.local` (from Hub → Copy token for AI).

```bash
npm run apphub -- test <slug>       # launch, check JS/CSS, locale + download hints
npm run apphub -- register <slug>   # upload latest apps/<slug>/release/*.zip
npm run apphub -- launch <slug>     # smoke-test launch URL
```

## Release

```bash
node tools/apphub.mjs list
node tools/apphub.mjs release <slug> 1.0.0 -y
```

## Hosted build notes (schema 1.11.1+)

- Vite + `type="module"` and relative `./assets/*` is supported.
- Zip `dist/` only; `manifest.json` at zip root.
- `import outside a module` → often 401/404 on chunks; check Network.
- `frame-ancestors` → platform CSP; not fixable in the zip.

## Upstream reporting (optional)

When integration-docs or Hub runtime blocks you and the fix is **platform-side** (not your app zip):

1. Only auto-run when `upstream.auto_file_issues` is `true` in local config (Hub-injected), or the user explicitly asks.
2. Add `docs/upstream-issues/<tag>/meta.json` + `body.md`. `meta.repo` must match `upstream.packages_repo` or `upstream.kit_repo`.
3. Run `npm run upstream-report -- issue <tag>` (or `kit-pr` / `all`). Use `--yes` for a one-shot without enabling auto-file.
4. Reply with issue/PR URLs — **never** ask the user to paste into GitHub manually.

See `docs/upstream-issues/README.md` and `.cursor/rules/apphub-publisher.mdc`.

## New app checklist

1. User has filled `apphub.publisher.json` (or provide URLs when asked).
2. Create `apps/<slug>/PLAN.md`.
3. Scaffold per `apphub-publisher.mdc`.
4. Update `PLAN.md` before finishing.
