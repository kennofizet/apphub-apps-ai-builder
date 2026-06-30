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

**Never write real Hub URLs into tracked files** (README, rules, source, or git). URLs belong only in the gitignored `apphub.publisher.json`.

App Hub may populate this file when the publisher links their instance.

## Repo layout

```
apphub.publisher.example.json   Tracked template (empty URLs)
apphub.publisher.json           Local only — user's real URLs (gitignored)
apps/<slug>/                    Apps you create
tools/apphub.mjs                Release CLI
docs/sdk-stub.js                Bridge SDK
```

## Per-app requirements (summary)

- `runtime_type`: `hosted` (zip on Hub) or `iframe` (publisher `entry_url`).
- **Hosted:** `await window.__APPHUB_STORAGE__?.ready`; zip `dist/` with `manifest.json` at root.
- **Bridge:** `apphub:bridge:ready`; `display_user` for UI only; server auth via `GET bridge/user`.
- **i18n:** `locales/en.json` + `locales/vi.json`.
- **Themes:** dark + light via CSS variables.
- **PLAN.md** per app, updated every session.

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

## New app checklist

1. User has filled `apphub.publisher.json` (or provide URLs when asked).
2. Create `apps/<slug>/PLAN.md`.
3. Scaffold per `apphub-publisher.mdc`.
4. Update `PLAN.md` before finishing.
