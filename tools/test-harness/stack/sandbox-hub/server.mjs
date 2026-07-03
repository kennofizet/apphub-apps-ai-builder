#!/usr/bin/env node
/**
 * Sandbox Hub API — test-only, in-memory. NOT production apphub-backend.
 * Implements publisher-facing routes for local publisher-kit testing.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const STACK_ROOT = join(HERE, '..');
const FIXTURES = join(HERE, 'fixtures');
const STATE_PATH = join(STACK_ROOT, 'data', 'sandbox-state.json');
const BUNDLES_DIR = join(STACK_ROOT, 'data', 'bundles');
const RUNTIME_DIR = join(STACK_ROOT, 'data', 'runtime');

const PORT = Number(process.env.SANDBOX_HUB_PORT || 8790);
const API_PREFIX = process.env.SANDBOX_API_PREFIX || '/api/knf/apphub';

function loadState() {
  mkdirSync(join(STACK_ROOT, 'data'), { recursive: true });
  if (!existsSync(STATE_PATH)) {
    const seed = JSON.parse(readFileSync(join(FIXTURES, 'state.json'), 'utf8'));
    writeFileSync(STATE_PATH, JSON.stringify(seed, null, 2));
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function getUserByToken(state, token) {
  if (!token) return null;
  return state.users.find((u) => u.token === token) ?? null;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseMultipart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(sep) + sep.length;
  while (start < buffer.length) {
    const next = buffer.indexOf(sep, start);
    const chunk = buffer.subarray(start, next > 0 ? next : buffer.length);
    const headerEnd = chunk.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    const headers = chunk.subarray(0, headerEnd).toString();
    const body = chunk.subarray(headerEnd + 4, chunk.length - 2);
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]+)"/);
    parts.push({ name: nameMatch?.[1], filename: fileMatch?.[1], body });
    if (next < 0) break;
    start = next + sep.length;
  }
  return parts;
}

function mime(path) {
  const ext = extname(path).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  return map[ext] || 'application/octet-stream';
}

function semverLte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return true;
}

async function handleRegister(state, req, res, bodyBuffer, boundary) {
  const user = getUserByToken(state, req.headers['x-knf-token']);
  if (!user) return json(res, 401, { success: false, message: 'Knf token is required' });

  const parts = parseMultipart(bodyBuffer, boundary);
  const bundle = parts.find((p) => p.name === 'bundle');
  if (!bundle?.body?.length) return json(res, 422, { success: false, message: 'bundle required' });

  let AdmZip;
  try {
    ({ default: AdmZip } = await import('adm-zip'));
  } catch {
    return json(res, 500, {
      success: false,
      message: 'adm-zip missing — run: cd tools/test-harness && npm install',
    });
  }

  const zip = new AdmZip(bundle.body);
  const manifestEntry = zip
    .getEntries()
    .find((e) => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'));
  if (!manifestEntry) return json(res, 422, { success: false, message: 'manifest.json missing in zip' });

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  const slug = manifest.slug;
  const version = manifest.version || '1.0.0';
  const existing = state.apps.find((a) => a.slug === slug);
  const runtimePath = join(RUNTIME_DIR, slug);

  if (existing && existing.owner_id !== user.id) {
    return json(res, 409, { success: false, message: 'App slug already exists' });
  }
  if (existing && semverLte(version, existing.version)) {
    return json(res, 422, {
      success: false,
      message: `Version must be greater than ${existing.version}`,
    });
  }

  mkdirSync(runtimePath, { recursive: true });
  zip.extractAllTo(runtimePath, true);

  const record = {
    slug,
    name: manifest.name || slug,
    version,
    status: user.is_dev ? 'active' : 'draft',
    owner_id: user.id,
    permissions: manifest.permissions || [],
    awaiting_dev_review: !user.is_dev,
    current_version_review_status: user.is_dev ? 'approved' : 'pending',
    runtime_type: manifest.runtime_type || 'hosted',
    updated_at: new Date().toISOString(),
  };

  if (existing) Object.assign(existing, record);
  else state.apps.push(record);
  saveState(state);

  return json(res, 200, {
    success: true,
    data: {
      slug,
      version,
      status: record.status,
      permissions: record.permissions,
      awaiting_dev_review: record.awaiting_dev_review,
    },
  });
}

function handleLaunch(state, slug, res) {
  const app = state.apps.find((a) => a.slug === slug);
  if (!app) return json(res, 404, { success: false, error: 'App not found' });

  const launchToken = `lt-${slug}-${Date.now()}`;
  const runtimeUrl = `http://127.0.0.1:${PORT}${API_PREFIX}/apps/${slug}/runtime/index.html`;

  return json(res, 200, {
    success: true,
    data: {
      entry_url: runtimeUrl,
      runtime_url: runtimeUrl,
      launch_token: launchToken,
      scopes_granted: app.permissions || ['user.read', 'user.profile'],
      display_user: { id: '1', name: 'Sandbox User', locale: 'en' },
    },
  });
}

function serveRuntime(slug, subPath, res, launchToken) {
  const base = join(RUNTIME_DIR, slug);
  let filePath = join(base, subPath || 'index.html');
  if (!existsSync(filePath) && existsSync(join(base, 'dist', subPath || 'index.html'))) {
    filePath = join(base, 'dist', subPath || 'index.html');
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (filePath.endsWith('.html')) {
    let content = readFileSync(filePath, 'utf8');
    const token = launchToken || '';
    content = content.replace(/(src|href)="(\.\/[^"]+)"/g, (_m, attr, url) => {
      const sep = url.includes('?') ? '&' : '?';
      return `${attr}="${url}${sep}launch_token=${token}"`;
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
    return;
  }
  res.writeHead(200, { 'Content-Type': mime(filePath) });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === `${API_PREFIX}/integration-docs`) {
    const doc = readFileSync(join(FIXTURES, 'integration-docs.json'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(doc);
    return;
  }

  const state = loadState();

  if (req.method === 'GET' && path === `${API_PREFIX}/apps`) {
    const mode = url.searchParams.get('mode') || 'store';
    const user = getUserByToken(state, req.headers['x-knf-token']);
    let items = [...state.apps];
    if (mode === 'publisher' && user) {
      items = items.filter((a) => a.owner_id === user.id);
    } else if (mode === 'store') {
      items = items.filter((a) => a.status === 'active');
    }
    return json(res, 200, { success: true, data: { items } });
  }

  const launchMatch = path.match(new RegExp(`^${API_PREFIX.replace(/\//g, '\\/')}/apps/([^/]+)/launch$`));
  if (req.method === 'POST' && launchMatch) {
    return handleLaunch(state, launchMatch[1], res);
  }

  const runtimeMatch = path.match(
    new RegExp(`^${API_PREFIX.replace(/\//g, '\\/')}/apps/([^/]+)/runtime/(.*)$`)
  );
  if (req.method === 'GET' && runtimeMatch) {
    return serveRuntime(runtimeMatch[1], runtimeMatch[2], res, url.searchParams.get('launch_token'));
  }

  if (req.method === 'POST' && path === `${API_PREFIX}/apps/register`) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const ct = req.headers['content-type'] || '';
    const boundary = ct.split('boundary=')[1];
    return handleRegister(state, req, res, body, boundary);
  }

  if (req.method === 'GET' && path === '/api/user/login') {
    const userId = Number(url.searchParams.get('user_id') || 1);
    const user = state.users.find((u) => u.id === userId) || state.users[0];
    const base = `http://127.0.0.1:${PORT}`;
    return json(res, 200, {
      success: true,
      rewardplay_token: user.token,
      user: { id: user.id, email: user.email, name: user.name },
      base_url: base,
      api_base: `${base}/api`,
      urls: { apphub: `${base}${API_PREFIX}`, core: `${base}/api/knf` },
    });
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Sandbox Hub API http://127.0.0.1:${PORT}${API_PREFIX}`);
  console.log('Tokens: sandbox-dev-token (dev), sandbox-user-token (user)');
});
