## Summary

- **`tools/hub-client.mjs`** + **`tools/hub-commands.mjs`** — `test`, `launch`, `register` Hub commands (no `gh` CLI)
- **`npm run apphub -- test <slug>`** — launch smoke test; checks JS/CSS 200; warns on runtime locale fetch and missing `desktop.download` in manifest
- **`.cursor/rules/apphub-publisher.mdc`** — hosted export (`saveFile` + `desktop.download`), bundle i18n (no `fetch('./locales/')`), mount modals inside the app root (theme CSS variables)
- **`docs/sdk-stub.js`** — add `saveFile` bridge method (align with integration-docs `javascript_api`)
- **`AGENTS.md`**, **`README.md`** — document test/deploy workflow
- **`apps/.gitignore`** — ignore publisher apps under `apps/*` by default (keep kit lean)

## Motivation

Agents and publishers need local test tooling and rules that match the hosted runtime contract (export, i18n, bridge). Previously the kit omitted `saveFile` in the SDK stub and had no `apphub test` command.

## Test plan

- [ ] `npm install` at repo root
- [ ] `cp apphub.publisher.example.json apphub.publisher.json` + Hub URLs + `.apphub-token.local`
- [ ] `npm run apphub -- test <slug>` on a hosted app with `dist/` built
- [ ] `npm run apphub -- register <slug>` uploads latest release zip
- [ ] `docs/sdk-stub.js` exports `saveFile`
