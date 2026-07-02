import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

export function loadPublisherConfig() {
  const path = join(ROOT, 'apphub.publisher.json');
  if (!existsSync(path)) {
    throw new Error(
      'apphub.publisher.json missing. Run: cp apphub.publisher.example.json apphub.publisher.json'
    );
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadHubToken() {
  const path = join(ROOT, '.apphub-token.local');
  if (!existsSync(path)) {
    throw new Error(
      '.apphub-token.local missing. Copy token from Hub portal → "Copy token for AI".'
    );
  }
  const token = readFileSync(path, 'utf8').trim();
  if (!token) throw new Error('.apphub-token.local is empty.');
  return token;
}

export function hubApiBase(config) {
  const url = config.integration_docs_url?.trim();
  if (!url) throw new Error('integration_docs_url is empty in apphub.publisher.json');
  return url.replace(/\/integration-docs\/?$/, '');
}

export async function hubFetch(config, token, method, path, options = {}) {
  const base = hubApiBase(config);
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const { headers: optionHeaders, ...rest } = options;
  const headers = {
    'X-Knf-Token': token,
    ...(optionHeaders || {}),
  };
  const res = await fetch(url, { method, headers, ...rest });
  return res;
}

export async function fetchIntegrationDocs(config) {
  const url = config.integration_docs_url?.trim();
  if (!url) throw new Error('integration_docs_url is empty');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`integration-docs HTTP ${res.status}`);
  return res.json();
}

export function discoverApps() {
  const appsDir = join(ROOT, 'apps');
  if (!existsSync(appsDir)) return [];

  return readdirSync(appsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = join(appsDir, d.name);
      const manifestPath = join(dir, 'manifest.json');
      const packagePath = join(dir, 'package.json');
      if (!existsSync(manifestPath) || !existsSync(packagePath)) return null;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
      return {
        slug: manifest.slug || d.name,
        dir,
        name: manifest.name || d.name,
        version: manifest.version || pkg.version || '0.0.0',
        runtimeType: manifest.runtime_type || 'unknown',
        manifest,
        manifestPath,
        packagePath,
        distDir: join(dir, 'dist'),
        releaseDir: join(dir, 'release'),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function findApp(slug) {
  const app = discoverApps().find((a) => a.slug === slug);
  if (!app) throw new Error(`App not found: ${slug}`);
  return app;
}

export function latestReleaseZip(app) {
  if (!existsSync(app.releaseDir)) return null;
  const zips = readdirSync(app.releaseDir)
    .filter((f) => f.endsWith('.zip') && f.startsWith(`${app.slug}-`))
    .sort()
    .reverse();
  return zips.length ? join(app.releaseDir, zips[0]) : null;
}

export { ROOT };
