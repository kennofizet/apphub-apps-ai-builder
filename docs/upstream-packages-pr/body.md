## Summary

Updates `packages/backend/src/Modules/Bridge/Resources/integration-docs.json` (`audiences.publisher`):

- **`hosted_i18n`** — do not `fetch('./locales/…')` at runtime (401 in opaque sandbox); bundle JSON at build time
- **`hosted_file_export`** — `desktop.download` + `bridge.saveFile` workflow; do not rely on `<a download>` only
- **`without_publisher_kit`** — contract-only integration path (manifest, register, bridge, token)
- **Troubleshooting checklist** — locale 401 + export/download rows
- **`steps`** — pointers to new sections
- **`locales.vi`** — short summaries for new sections
- **schema_version** `1.12.0` → `1.13.0`

## Motivation

Hosted publishers often hit locale 401 from runtime `fetch('./locales/…')` and export failures in the opaque sandbox. These patterns belong in the public integration contract returned by `GET /integration-docs`.

## Test plan

- [ ] `GET /integration-docs` returns schema 1.13.0
- [ ] `hosted_i18n`, `hosted_file_export`, `without_publisher_kit` present under `audiences.publisher`
- [ ] Hub Guide / publisher UI still parses JSON (if applicable)
