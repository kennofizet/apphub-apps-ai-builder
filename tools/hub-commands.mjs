import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';
import {
  discoverApps,
  fetchIntegrationDocs,
  findApp,
  hubApiBase,
  hubFetch,
  latestReleaseZip,
  loadHubToken,
  loadPublisherConfig,
} from './hub-client.mjs';

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn(`Warning: ${msg}`);
}

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function ok(label, detail = '') {
  log(`  [ok] ${label}${detail ? ` — ${detail}` : ''}`);
}

function bad(label, detail = '') {
  log(`  [fail] ${label}${detail ? ` — ${detail}` : ''}`);
}

async function checkAsset(url, launchToken, label) {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}launch_token=${encodeURIComponent(launchToken)}`);
  const ct = res.headers.get('content-type') || '';
  if (res.status === 200) {
    ok(label, `${res.status} ${ct.split(';')[0]}`);
    return { res, text: await res.text() };
  }
  bad(label, `HTTP ${res.status}`);
  return { res, text: await res.text() };
}

export async function cmdTest(slugArg) {
  const config = loadPublisherConfig();
  const token = loadHubToken();
  const apps = discoverApps();
  if (apps.length === 0) fail('No apps in apps/.');
  const app = slugArg ? findApp(slugArg) : apps[0];

  log(`\nApp Hub runtime test — ${app.slug} v${app.version}\n`);

  let docs;
  try {
    docs = await fetchIntegrationDocs(config);
    ok('integration-docs', `schema ${docs.schema_version || '?'}`);
  } catch (e) {
    bad('integration-docs', e.message);
  }

  const bridgeApi = docs?.audiences?.publisher?.bridge?.javascript_api;
  if (bridgeApi?.saveFile) {
    ok('contract saveFile', 'desktop.download export supported');
  } else {
    warn('integration-docs has no bridge.saveFile — hosted file export may not work');
  }

  const perms = app.manifest.permissions || [];
  if (perms.includes('desktop.download')) {
    ok('manifest desktop.download', 'declared');
  } else if (bridgeApi?.saveFile) {
    warn(`${app.slug} manifest missing desktop.download — add it for export/download features`);
  }

  const distManifest = `${app.distDir}/manifest.json`;
  try {
    statSync(distManifest);
    ok('dist built', distManifest);
  } catch {
    warn('dist/ not built — run npm run build in app folder or apphub release');
  }

  const launchRes = await hubFetch(config, token, 'POST', `/apps/${app.slug}/launch`, {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const launchBody = await launchRes.json();
  if (!launchRes.ok) {
    bad('POST launch', `HTTP ${launchRes.status}`);
    console.log(JSON.stringify(launchBody, null, 2));
    process.exit(1);
  }

  const data = launchBody.data || launchBody;
  const entryUrl = data.entry_url || data.runtime_url;
  const lt = data.launch_token;
  ok('POST launch', entryUrl);

  const runtimeBase = entryUrl.replace(/index\.html$/, '');
  const { text: html } = await checkAsset(entryUrl, lt, 'index.html');

  if (!html.includes('type="module"')) {
    warn('served index.html missing type="module"');
  } else {
    ok('ES modules', 'type="module" present');
  }

  const jsMatch = html.match(/src="([^"]+\.js[^"]*)"/);
  const cssMatch = html.match(/href="([^"]+\.css[^"]*)"/);
  if (jsMatch) {
    const rel = jsMatch[1].replace(/^\.\//, '').split('?')[0];
    const { text: js } = await checkAsset(`${runtimeBase}${rel}`, lt, rel);
    if (js.includes('fetch(`./locales/') || js.includes("fetch('./locales/")) {
      warn('JS fetches ./locales/ at runtime — bundle locales in hosted apps (opaque sandbox → 401)');
    } else {
      ok('locales', 'bundled or not fetched at runtime');
    }
  }
  if (cssMatch) {
    const rel = cssMatch[1].replace(/^\.\//, '').split('?')[0];
    await checkAsset(`${runtimeBase}${rel}`, lt, rel);
  }

  const localeRes = await fetch(
    `${runtimeBase}locales/en.json?launch_token=${encodeURIComponent(lt)}`
  );
  if (localeRes.status === 200) {
    warn('locales/en.json served at runtime — prefer bundling into JS for hosted apps');
  } else {
    ok('runtime locale fetch', `HTTP ${localeRes.status} (expected if bundled)`);
  }

  const catalogRes = await hubFetch(config, token, 'GET', `/apps?mode=publisher`);
  const catalog = await catalogRes.json();
  const items = catalog.data?.items || catalog.data || [];
  const record = Array.isArray(items) ? items.find((a) => a.slug === app.slug) : null;
  if (record) {
    ok('catalog', `status=${record.status} review=${record.current_version_review_status || '?'}`);
    if (record.awaiting_dev_review) {
      warn('app awaiting DEV review — install/open may fail until approved');
    }
  }

  log('\nDone. Open DevTools in Hub if UI issues persist (CSP frame-ancestors, bridge).\n');
}

export async function cmdLaunch(slugArg) {
  if (!slugArg) fail('Usage: npm run apphub -- launch <slug>');
  const config = loadPublisherConfig();
  const token = loadHubToken();
  findApp(slugArg);

  const res = await hubFetch(config, token, 'POST', `/apps/${slugArg}/launch`, {
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json();
  if (!res.ok) {
    console.log(JSON.stringify(body, null, 2));
    fail(`launch HTTP ${res.status}`);
  }
  const data = body.data || body;
  log(`\nLaunch OK: ${data.entry_url || data.runtime_url}`);
  log(`scopes_granted: ${(data.scopes_granted || []).join(', ') || '(none)'}`);
  log('(launch_token omitted — use test command for asset checks)\n');
}

export async function cmdRegister(slugArg, flags = {}) {
  if (!slugArg) fail('Usage: npm run apphub -- register <slug> [--yes]');
  const config = loadPublisherConfig();
  const token = loadHubToken();
  const app = findApp(slugArg);

  let zipPath = latestReleaseZip(app);
  if (!zipPath) {
    if (flags.yes) {
      fail(`No zip in ${app.releaseDir}. Run: npm run apphub -- release ${slugArg} -y`);
    }
    fail(`No release zip. Run: node tools/apphub.mjs release ${app.slug} -y`);
  }

  log(`\nRegister ${app.slug} — ${basename(zipPath)}\n`);

  const form = new FormData();
  form.append('bundle', new Blob([readFileSync(zipPath)]), basename(zipPath));

  const res = await hubFetch(config, token, 'POST', '/apps/register', { body: form });
  const body = await res.json();
  if (!res.ok) {
    console.log(JSON.stringify(body, null, 2));
    fail(`register HTTP ${res.status}`);
  }

  const data = body.data || body;
  log(`Registered: ${data.slug} v${data.version} status=${data.status}`);
  log(`permissions: ${(data.permissions || []).join(', ')}`);
  if (data.awaiting_dev_review) {
    warn('awaiting DEV review — approve in Hub portal before store install');
  }
  log('');
}
