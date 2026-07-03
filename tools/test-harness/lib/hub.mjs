import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import { discoverApps, latestReleaseZip } from '../../hub-client.mjs';

export function createHubClient(config, log) {
  const base = config.hub_api_base.replace(/\/$/, '');

  async function fetch(actor, method, path, options = {}) {
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      'X-Knf-Token': actor.token,
      ...(options.headers || {}),
    };
    const start = Date.now();
    const res = await globalThis.fetch(url, { method, headers, ...options });
    const duration_ms = Date.now() - start;
    let body = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else if (options.rawBody !== true) {
      await res.text().catch(() => '');
    }

    const versionConflict =
      !res.ok &&
      res.status === 422 &&
      String(body?.message || '').includes('Version must be greater');

    log.record({
      actor: actor.role,
      action: 'hub.fetch',
      method,
      path,
      status: res.status,
      duration_ms,
      ok: res.ok || (options.allowVersionConflict && versionConflict),
      detail: res.ok
        ? undefined
        : versionConflict && options.allowVersionConflict
          ? `skip — ${body.message}`
          : JSON.stringify(body)?.slice(0, 200),
    });

    return { res, body };
  }

  return {
    base,
    fetch,
    async integrationDocs() {
      const url = `${base}/integration-docs`;
      const start = Date.now();
      const res = await globalThis.fetch(url);
      const body = await res.json();
      log.record({
        actor: 'system',
        action: 'integration-docs',
        method: 'GET',
        path: '/integration-docs',
        status: res.status,
        duration_ms: Date.now() - start,
        ok: res.ok,
        detail: res.ok ? `schema ${body.schema_version}` : undefined,
      });
      if (!res.ok) throw new Error(`integration-docs HTTP ${res.status}`);
      return body;
    },
    launch(actor, slug) {
      return fetch(actor, 'POST', `/apps/${slug}/launch`, {
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    },
    catalog(actor, mode = 'publisher') {
      return fetch(actor, 'GET', `/apps?mode=${mode}`);
    },
    register(actor, zipPath, opts = {}) {
      const form = new FormData();
      form.append('bundle', new Blob([readFileSync(zipPath)]), basename(zipPath));
      return fetch(actor, 'POST', '/apps/register', {
        body: form,
        allowVersionConflict: opts.allowVersionConflict,
      });
    },
    async checkRuntimeAsset(url, launchToken, label) {
      const sep = url.includes('?') ? '&' : '?';
      const full = `${url}${sep}launch_token=${encodeURIComponent(launchToken)}`;
      const start = Date.now();
      const res = await globalThis.fetch(full);
      log.record({
        actor: 'system',
        action: 'runtime.asset',
        method: 'GET',
        path: label,
        status: res.status,
        duration_ms: Date.now() - start,
        ok: res.status === 200,
      });
      return res;
    },
  };
}

export { discoverApps, latestReleaseZip };
