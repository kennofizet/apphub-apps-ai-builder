# App Hub Publisher Kit

Clone this repo to **publish apps** on App Hub. It provides **rules, docs, and release tooling** — not sample apps. You (or an AI agent) create apps in `apps/<slug>/` per the contract.

**For AI agents:** read [AGENTS.md](AGENTS.md) first.

## Configure your App Hub instance (required)

Hub URLs are **only** in **`apphub.publisher.json`** — that file is **gitignored** so you do not accidentally push private endpoints to a public git remote.

```bash
cp apphub.publisher.example.json apphub.publisher.json
```

Edit `apphub.publisher.json` and set:

| Key | Purpose |
|-----|---------|
| `integration_docs_url` | Machine-readable integration docs JSON (from your App Hub operator) |
| `hub_portal_url` | Your App Hub portal URL |

Leave values empty until you have real URLs. Agents must **ask you** for these — they are not stored anywhere else in this repo.

**Do not commit `apphub.publisher.json`.** Only `apphub.publisher.example.json` (empty template) is tracked.

## What is included

| Path | Purpose |
|------|---------|
| `apphub.publisher.example.json` | Template — copy to `apphub.publisher.json` and fill in locally |
| `apphub.publisher.json` | **Your** URLs (gitignored, create after clone) |
| `.cursor/rules/apphub-publisher.mdc` | Project rules |
| `AGENTS.md` | Agent onboarding |
| `docs/sdk-stub.js` | Bridge SDK reference |
| `tools/apphub.mjs` | Release CLI (list, build, zip) |
| `apps/` | Your apps (one folder per slug) |

## Setup

```bash
npm install
cp apphub.publisher.example.json apphub.publisher.json
# Edit apphub.publisher.json with your Hub URLs
```

## Release tooling

After an app exists in `apps/<slug>/`:

```bash
npm run apphub -- list
node tools/apphub.mjs release <slug> 1.0.0 -y
```

Upload the zip from `apps/<slug>/release/` via your Hub (`POST /apps/register` for hosted apps).

## Official contract

Fetch the URL in **`integration_docs_url`** from your local `apphub.publisher.json`. There is no default link in this repository.

## Workflow

1. Clone this repo.
2. Create and fill `apphub.publisher.json` (from the example file).
3. Open in Cursor so the agent loads `.cursor/rules/apphub-publisher.mdc`.
4. Create apps under `apps/<slug>/`.
5. `node tools/apphub.mjs release <slug> <version> -y`
6. Upload the zip to your Hub portal (`hub_portal_url`).
