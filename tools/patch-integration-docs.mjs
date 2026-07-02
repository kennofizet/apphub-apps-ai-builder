/**
 * Build integration-docs.json patch for apphub-packages PR.
 * Reads _integration-docs-source.json (fetched from upstream) and writes
 * _integration-docs-patched.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './github-shared.mjs';

const sourcePath = join(ROOT, '_integration-docs-source.json');
const outPath = join(ROOT, '_integration-docs-patched.json');

const doc = JSON.parse(readFileSync(sourcePath, 'utf8'));
const pub = doc.audiences.publisher;

doc.schema_version = '1.13.0';
doc.package.version = '0.2.9';

pub.hosted_i18n = {
  summary:
    'Hosted opaque sandbox: runtime fetch() to ./locales/*.json often returns 401. Bundle translations at build time.',
  do: [
    'Import locale JSON into your JS bundle (e.g. Vite: import en from "./locales/en.json")',
    'Or embed strings at build time',
  ],
  do_not: "fetch('./locales/en.json') or other relative fetch for i18n on initial load",
  symptom: 'Locale not found / HTTP 401 on locales/*.json',
  iframe_note: 'iframe apps on your publisher origin may fetch locale files normally.',
};

pub.hosted_file_export = {
  summary:
    'Normal <a download> and programmatic blob URL clicks do not work in the hosted opaque sandbox.',
  manifest:
    'Add desktop.download to manifest.permissions[]. Users may need to re-install after permission changes.',
  flow: [
    "await bridge.requestPermission('desktop.download')",
    'await bridge.saveFile({ filename, mime, data }) — data as base64 string or ArrayBuffer',
    'Provide fallbacks: clipboard, open blob in new tab, right-click preview image',
  ],
  do_not: 'Rely on URL.createObjectURL + hidden <a download> only',
  see_also: 'audiences.publisher.bridge.javascript_api.saveFile',
};

pub.without_publisher_kit = {
  summary:
    'You do not need the publisher kit repo. This JSON from GET …/integration-docs is the machine-readable contract.',
  requirements: [
    'manifest.json with runtime_type, permissions, and (hosted) zip via POST /apps/register',
    'Implement bridge methods from audiences.publisher.bridge.javascript_api',
    'Publisher API auth: X-Knf-Token header (from Hub → Copy token for AI)',
    'Hosted: await window.__APPHUB_STORAGE__?.ready before localStorage reads',
  ],
  hosted_pitfalls: [
    'hosted_i18n — do not fetch ./locales at runtime',
    'hosted_file_export — use saveFile + desktop.download, not browser download only',
    'hosted_runtime_troubleshooting — ES modules, CSP frame-ancestors, 401 on assets',
  ],
};

pub.hosted_runtime_troubleshooting.troubleshooting_checklist.push(
  {
    symptom: 'Locale not found / 401 on locales/*.json',
    likely_cause:
      'fetch() from hosted JS without launch_token; HttpOnly cookie not sent in opaque sandbox',
    publisher_action:
      'Bundle locale JSON into JS (import at build time). Do not fetch ./locales/ at runtime.',
    platform_action: '—',
  },
  {
    symptom: 'Export / Download does nothing in hosted app',
    likely_cause: 'Opaque sandbox blocks blob downloads without bridge',
    publisher_action:
      'Add desktop.download to manifest; use bridge.saveFile; re-install app; provide clipboard/tab fallbacks',
    platform_action: 'Confirm Hub implements saveFile bridge handler',
  }
);

const stepInsert = 'Without publisher kit: read audiences.publisher.without_publisher_kit.';
if (!pub.steps.includes(stepInsert)) {
  pub.steps.splice(1, 0, stepInsert);
}
const i18nStep =
  'Hosted i18n: bundle translations — see audiences.publisher.hosted_i18n (do not fetch ./locales/).';
if (!pub.steps.includes(i18nStep)) {
  pub.steps.splice(4, 0, i18nStep);
}
const exportStep =
  'Hosted export: use saveFile + desktop.download — see audiences.publisher.hosted_file_export.';
if (!pub.steps.includes(exportStep)) {
  pub.steps.splice(5, 0, exportStep);
}

const vi = pub.locales?.vi;
if (vi) {
  vi.hosted_i18n = {
    summary:
      'Sandbox opaque: fetch ./locales/*.json thường 401 — gộp bản dịch vào bundle JS khi build.',
    symptom: 'Locale not found / 401 trên locales/*.json',
  };
  vi.hosted_file_export = {
    summary: '<a download> thường không hoạt động trong sandbox hosted.',
    manifest: 'Thêm desktop.download vào manifest.permissions[]; có thể cần cài lại app.',
  };
  vi.without_publisher_kit = {
    summary:
      'Không bắt buộc dùng publisher kit — JSON integration-docs là hợp đồng chính.',
  };
}

writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log('Wrote', outPath, 'schema', doc.schema_version);
