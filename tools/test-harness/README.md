# App Hub test harness

Self-contained **local testing** for publisher apps. Does not use production `apphub.publisher.json`.

## What it includes

| Piece | Source | Purpose |
|-------|--------|---------|
| **Hub backend** | `kennofizet/apphub-backend` + `packages-core-backend` (Laravel, MySQL) | Real API — register, launch, runtime, pilot seed data |
| **Hub frontend** | [kennofizet/apphub-host-starter](https://github.com/kennofizet/apphub-host-starter) + `@kennofizet/apphub-frontend@latest` | Real desktop UI |
| **Mock API (optional)** | `stack/sandbox-hub/` (Node) | Lightweight fallback when PHP/Composer unavailable |
| **Scenarios** | `scenarios/` | API smoke tests with JSONL action logs |
| **Config** | `apphub.test.json` (gitignored) | Local URLs only — production blocked by default |

Default stack mode is **`stack.backend: "real"`** so tests track the same packages you ship. Set `"backend": "mock"` in `apphub.test.json` for the Node-only sandbox.

## Prerequisites (real backend)

- PHP 8.2+ with **pdo_mysql**
- Composer
- MySQL (Laragon default) — harness creates database `apphub_sandbox_test`
- Node.js 18+

Laragon on Windows already includes PHP — ensure `php` and `composer` are on your PATH.

## Quick start (full stack)

```bash
cp apphub.test.example.json apphub.test.json

npm run test:harness -- stack install   # Laravel host + hub-host-starter + latest frontend
npm run test:harness -- stack up        # API :8790 + portal :5173

# Another terminal:
npm run test:harness -- check
npm run test:harness -- seed              # register apps from apps/*/release/*.zip
npm run test:harness -- run smoke
npm run test:harness -- run dual-account
npm run test:harness -- logs --tail 30
```

`apphub.test.json` and `apps/<slug>/tests/sandbox-apphub/` are **gitignored** — local sandbox config and harness cases only. Other files under `apps/<slug>/tests/` may be committed.

When upstream packages change:

```bash
npm run test:harness -- stack update      # composer update + @kennofizet/apphub-frontend@latest
```

Reset fake DB + pilot apps: `npm run test:harness -- stack reset`

### Tokens (auto-synced from real backend)

| File | User | Role |
|------|------|------|
| `.apphub-token.dev.local` | user id 1 (`dev@test.local`) | Dev publisher — in `APPHUB_DEV_USER_IDS` |
| `.apphub-token.user.local` | user id 2 (`user@test.local`) | Normal user |

Tokens are written on `stack install`, `stack reset`, and `stack up` (via `/api/user/login` or artisan script).

### Mock backend (no PHP)

In `apphub.test.json`:

```json
"stack": { "backend": "mock" }
```

Then `stack install` / `stack up` use the Node mock API with fixed tokens `sandbox-dev-token` / `sandbox-user-token`.

## Commands

```bash
npm run test:harness -- init
npm run test:harness -- check
npm run test:harness -- stack install | update | up | reset
npm run test:harness -- seed
npm run test:harness -- run <scenario> [--slug <slug>]
npm run test:harness -- run app <slug> [--case <id>]
npm run test:harness -- run pre-deploy --slug <slug>
npm run test:harness -- list app <slug>
npm run test:harness -- logs [--tail N]
```

**Scenarios:** `smoke`, `launch-all`, `publisher-flow`, `dual-account`, `portal-smoke`, **`pre-deploy`**

## Per-app feature tests (required before deploy)

Each app needs harness cases under `apps/<slug>/tests/sandbox-apphub/` — **one script per user action** (upload, comment, export, draw, …).

**Not committed:** only `apps/*/tests/sandbox-apphub/` (root `.gitignore`). Copy the kit template once per app; add your own tests in `apps/<slug>/tests/` if you want them in git.

```bash
mkdir -p apps/<slug>/tests/sandbox-apphub/cases apps/<slug>/tests/sandbox-apphub/fixtures
cp tools/test-harness/templates/app-tests/tests-README.md apps/<slug>/tests/README.md
cp tools/test-harness/templates/app-tests/manifest.json apps/<slug>/tests/sandbox-apphub/
cp tools/test-harness/templates/app-tests/case.mjs apps/<slug>/tests/sandbox-apphub/cases/01-launch.mjs
# Add a real short MP4 for upload tests, e.g. apps/<slug>/tests/sandbox-apphub/fixtures/sample.mp4
```

```bash
npm run test:harness -- list app video-review
npm run test:harness -- run app video-review                    # all cases
npm run test:harness -- run app video-review --case upload      # after editing upload code
npm run test:harness -- run pre-deploy --slug video-review      # full gate → then register/deploy
```

Register each case in `tests/sandbox-apphub/manifest.json`. Template source: `tools/test-harness/templates/app-tests/`.

| Type | Runs when |
|------|-----------|
| `api` | Always — launch, assets, HTTP |
| `playwright` | `playwright.enabled: true` — UI clicks, file pick, save |

## Action logs

Each run writes `logs/test-harness/<session-id>/actions.jsonl`:

```json
{"ts":"2026-07-03T12:00:00.000Z","actor":"dev","action":"hub.fetch","method":"POST","path":"/apps/my-app/launch","status":200,"duration_ms":12,"ok":true}
```

## Use your operator Hub instead of sandbox

Edit `apphub.test.json`:

```json
{
  "stack": { "mode": "external" },
  "hub_api_base": "http://localhost:8000/api/.../apphub",
  "hub_portal_url": "http://localhost:8000"
}
```

Copy real tokens from your Hub portal. `allow_production` stays `false` unless you explicitly override.

## vs `npm run apphub -- test`

| | `apphub test` | `test:harness` |
|---|---------------|----------------|
| Config | `apphub.publisher.json` | `apphub.test.json` |
| Stack | your Hub | optional built-in sandbox (real or mock) |
| Accounts | one token | dev + user |
| Logs | console | JSONL per action |
| Production guard | none | blocks non-local URLs |

## Playwright (optional)

```bash
cd tools/test-harness && npm install && npx playwright install chromium
```

Set `"playwright": { "enabled": true }` in `apphub.test.json`, then `npm run test:harness -- run portal-smoke`.

## Layout

```text
tools/test-harness/
  cli.mjs
  lib/           config, logger, accounts, hub client, stack installer
  scenarios/     smoke, dual-account, publisher-flow, …
  stack/
    host-overlay/  Laravel seeders + dev login route (tracked)
    sandbox-hub/   mock API (optional)
    hub-frontend/  git clone (gitignored)
    hub-backend/   composer create-project + packages (gitignored)
    data/          mock runtime state (gitignored)
```
