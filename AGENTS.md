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
tools/test-harness/             E2E harness — dev/user accounts, demo seed, JSONL logs
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
- **`apps/<slug>/tests/sandbox-apphub/`** — one `.mjs` case per feature; **required before deploy** (see rules). **Gitignored** — copy `tools/test-harness/templates/app-tests/`. Other files under `apps/<slug>/tests/` (unit tests, etc.) may be committed if you track the app.

## Test and deploy (local Hub)

Requires `apphub.publisher.json` and `.apphub-token.local` (from Hub → Copy token for AI).

**Quick smoke:** `npm run apphub -- test <slug>` — always available; no sandbox stack.

**Full gate (when using the harness):** run `pre-deploy` before register if `apphub.test.json` exists and the user has not asked to skip the sandbox.

```bash
npm run apphub -- test <slug>       # quick asset smoke (production config)
npm run apphub -- register <slug>   # upload zip — run pre-deploy first when harness is set up
npm run apphub -- launch <slug>     # smoke-test launch URL
```

Skip harness: user may say "skip sandbox" / "deploy without harness", or has no `apphub.test.json` and confirms production-only deploy.

## Test harness (isolated)

Use `apphub.test.json` (not `apphub.publisher.json`) for multi-account E2E. Blocks non-local URLs by default.

```bash
npm run test:harness -- run pre-deploy --slug video-review   # full gate before deploy
npm run test:harness -- run app video-review --case upload # single feature after a save
npm run test:harness -- list app video-review
npm run test:harness -- check
npm run test:harness -- logs --tail 50
```

See `tools/test-harness/README.md`.

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
