import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';

const TEST_CONFIG = join(ROOT, 'apphub.test.json');
const EXAMPLE = join(ROOT, 'apphub.test.example.json');

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$/i;
const LOCAL_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
const STAGING_RE = /\.(local|test|staging)(:\d+)?(\/|$)/i;

export function loadTestConfig() {
  if (!existsSync(TEST_CONFIG)) {
    throw new Error(
      'apphub.test.json missing. Run: npm run test:harness -- init'
    );
  }
  const raw = JSON.parse(readFileSync(TEST_CONFIG, 'utf8'));
  return normalizeConfig(raw);
}

export function normalizeConfig(raw) {
  const publisherPath = join(ROOT, 'apphub.publisher.json');
  let apiBase = raw.hub_api_base?.trim() || '';
  let portal = raw.hub_portal_url?.trim() || '';

  if (!apiBase && existsSync(publisherPath)) {
    try {
      const pub = JSON.parse(readFileSync(publisherPath, 'utf8'));
      const docs = pub.integration_docs_url?.trim() || '';
      if (docs) apiBase = docs.replace(/\/integration-docs\/?$/, '');
      if (!portal) portal = pub.hub_portal_url?.trim() || '';
    } catch {
      /* ignore */
    }
  }

  return {
    hub_api_base: apiBase,
    hub_portal_url: portal,
    allow_production: raw.allow_production === true,
    tokens: {
      dev: raw.tokens?.dev || '.apphub-token.dev.local',
      user: raw.tokens?.user || '.apphub-token.user.local',
      publisher_fallback: raw.tokens?.publisher_fallback || '.apphub-token.local',
    },
    demo: {
      apps: Array.isArray(raw.demo?.apps) ? raw.demo.apps : [],
      auto_register: raw.demo?.auto_register !== false,
      auto_build_release: raw.demo?.auto_build_release === true,
    },
    logging: {
      dir: raw.logging?.dir || 'logs/test-harness',
      console: raw.logging?.console !== false,
      jsonl: raw.logging?.jsonl !== false,
    },
    playwright: {
      enabled: raw.playwright?.enabled === true,
      headless: raw.playwright?.headless !== false,
      timeout_ms: raw.playwright?.timeout_ms || 30000,
    },
    stack: {
      mode: raw.stack?.mode || 'sandbox',
      backend_port: raw.stack?.backend_port || 8790,
      frontend_port: raw.stack?.frontend_port || 5173,
      api_prefix: raw.stack?.api_prefix || '/api/knf/apphub',
      frontend_repo:
        raw.stack?.frontend_repo || 'https://github.com/kennofizet/apphub-host-starter.git',
    },
  };
}

export function assertTestEnvironment(config) {
  if (config.allow_production) {
    return { mode: 'production-allowed', warning: 'allow_production is true — use with care' };
  }

  const urls = [config.hub_api_base, config.hub_portal_url].filter(Boolean);
  if (urls.length === 0) {
    throw new Error('hub_api_base and hub_portal_url are empty in apphub.test.json');
  }

  for (const url of urls) {
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      throw new Error(`Invalid test URL: ${url}`);
    }
    const ok =
      LOCAL_HOST_RE.test(host) ||
      LOCAL_URL_RE.test(url) ||
      STAGING_RE.test(url) ||
      host.endsWith('.localhost');
    if (!ok) {
      throw new Error(
        `Refusing non-local Hub URL: ${url}\n` +
          'Test harness only runs against localhost/staging. Set allow_production: true to override.'
      );
    }
  }

  return { mode: 'local', urls };
}

export { TEST_CONFIG, EXAMPLE };
