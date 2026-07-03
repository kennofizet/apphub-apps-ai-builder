## Summary

- **`tools/test-harness/`** — isolated E2E module (uses `apphub.test.json`, not production `apphub.publisher.json`)
- **Sandbox stack** — real `kennofizet/apphub-backend` + `@kennofizet/apphub-frontend` (Laravel + hub-host-starter on `:8790` / `:5173`); optional Node mock API when PHP unavailable
- **`apphub.test.example.json`** — test config template; blocks non-local production URLs unless `allow_production: true`
- **Pre-deploy gate** — `npm run test:harness -- run pre-deploy --slug <slug>` before `apphub register`
- **Per-app feature tests** — `apps/<slug>/tests/sandbox-apphub/` (gitignored); kit template in `tools/test-harness/templates/app-tests/`
- **JSONL action logs** per session (`logs/test-harness/<id>/actions.jsonl`)
- **Scenarios** — `smoke`, `launch-all`, `publisher-flow`, `dual-account`, `portal-smoke`, `pre-deploy`
- **`npm run test:harness`** — `init`, `check`, `stack install|update|up|reset`, `seed`, `run app <slug>`, `logs`

## Motivation

`npm run apphub -- test` is a quick smoke check against one token. Publishers and agents need:

1. **No production coupling** — separate config + localhost guard
2. **Dev vs normal user** — two tokens, dual-account scenario
3. **Real packages** — same backend/frontend stack as production when possible
4. **Per-feature cases** — one Playwright/API script per user action (upload, export, …)
5. **Per-action logs** — timestamped JSONL for debugging agent runs
6. **Deploy gate** — sandbox must pass before register/deploy

Operators with a real local Hub can point `apphub.test.json` at their instance (`stack.mode: external`).

## Test plan

- [ ] `cp apphub.test.example.json apphub.test.json`
- [ ] `npm run test:harness -- stack install` (PHP + MySQL for real backend)
- [ ] `npm run test:harness -- stack up` → API http://127.0.0.1:8790 , portal http://127.0.0.1:5173
- [ ] `npm run test:harness -- check`
- [ ] Copy `tools/test-harness/templates/app-tests/` → `apps/<slug>/tests/sandbox-apphub/`
- [ ] Build a hosted app, `node tools/apphub.mjs release <slug> -y`, then `npm run test:harness -- seed`
- [ ] `npm run test:harness -- run pre-deploy --slug <slug>`
- [ ] `npm run test:harness -- run dual-account`
- [ ] `npm run test:harness -- logs --tail 20`
