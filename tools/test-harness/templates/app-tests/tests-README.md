# Tests

| Path | Purpose | Git |
|------|---------|-----|
| `sandbox-apphub/` | App Hub pre-deploy harness (`npm run test:harness`) | **gitignored** — copy from `tools/test-harness/templates/app-tests/` |
| *(this folder)* | Your own unit/integration tests, mocks, docs | Commit if you track this app in git |

Sandbox layout:

```
tests/
  README.md              ← optional (this file)
  sandbox-apphub/        ← gitignored
    manifest.json
    cases/*.mjs
    fixtures/            ← e.g. sample.mp4 for Playwright upload tests
  unit/                  ← example: your Vitest/Jest tests (committed)
```
