import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './paths.mjs';

/** Gitignored per-app folder — harness cases + fixtures (see root .gitignore). */
export const SANDBOX_APPHUB_DIR = 'sandbox-apphub';

export function appTestsParent(slug) {
  return join(ROOT, 'apps', slug, 'tests');
}

export function appTestsRoot(slug) {
  return join(appTestsParent(slug), SANDBOX_APPHUB_DIR);
}

export function appCasesDir(slug) {
  return join(appTestsRoot(slug), 'cases');
}

export function appFixturesDir(slug) {
  return join(appTestsRoot(slug), 'fixtures');
}

/**
 * @returns {{ id: string, file: string, title?: string, type?: string }[]}
 */
export function listAppCases(slug) {
  const root = appTestsRoot(slug);
  const manifestPath = join(root, 'manifest.json');
  const casesDir = appCasesDir(slug);

  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return (manifest.cases || []).map((c) => ({
      id: c.id,
      file: c.file,
      title: c.title || c.id,
      type: c.type || 'api',
    }));
  }

  if (!existsSync(casesDir)) return [];

  return readdirSync(casesDir)
    .filter((f) => f.endsWith('.mjs'))
    .sort()
    .map((f) => ({
      id: f.replace(/^\d+-/, '').replace(/\.mjs$/, ''),
      file: f,
      title: f.replace(/^\d+-/, '').replace(/\.mjs$/, ''),
      type: 'api',
    }));
}

export function requireAppTests(slug) {
  const cases = listAppCases(slug);
  if (cases.length === 0) {
    throw new Error(
      `No app tests found for "${slug}". Add apps/${slug}/tests/${SANDBOX_APPHUB_DIR}/manifest.json and cases/*.mjs — see tools/test-harness/templates/app-tests/`
    );
  }
  return cases;
}

export async function runAppTests(ctx) {
  const slug = ctx.flags?.slug || ctx.slug;
  if (!slug) throw new Error('Pass --slug <slug>');

  const caseFilter = ctx.flags?.case || ctx.caseId;
  const cases = requireAppTests(slug);
  const casesDir = appCasesDir(slug);

  const selected = caseFilter ? cases.filter((c) => c.id === caseFilter) : cases;
  if (caseFilter && selected.length === 0) {
    throw new Error(`Unknown case "${caseFilter}" for ${slug}. Available: ${cases.map((c) => c.id).join(', ')}`);
  }

  for (const spec of selected) {
    const filePath = join(casesDir, spec.file);
    if (!existsSync(filePath)) {
      throw new Error(`Missing test file: ${filePath}`);
    }
    const mod = await import(pathToFileURL(filePath).href);
    const fn = mod.run || mod.default;
    if (typeof fn !== 'function') {
      throw new Error(`${spec.file} must export run(ctx) or default function`);
    }

    const { requireDev } = await import('./accounts.mjs');
    const { createHubClient } = await import('./hub.mjs');
    const { openHostedRuntime, closePlaywright, waitForAppRoot } = await import('./playwright-runtime.mjs');

    const start = Date.now();
    try {
      await fn({
        ...ctx,
        slug,
        case: spec,
        ROOT,
        appTestsDir: appTestsRoot(slug),
        fixturesDir: appFixturesDir(slug),
        requireDev,
        createHubClient,
        openHostedRuntime,
        closePlaywright,
        waitForAppRoot,
      });
      ctx.log.record({
        actor: 'dev',
        action: `app.${slug}.${spec.id}`,
        ok: true,
        duration_ms: Date.now() - start,
        detail: spec.title || spec.id,
      });
    } catch (e) {
      ctx.log.record({
        actor: 'dev',
        action: `app.${slug}.${spec.id}`,
        ok: false,
        duration_ms: Date.now() - start,
        error: e.message,
      });
      throw e;
    }
  }
}

export function printAppCaseList(slug) {
  const cases = listAppCases(slug);
  if (cases.length === 0) {
    console.log(`  (no cases — add apps/${slug}/tests/${SANDBOX_APPHUB_DIR}/)`);
    return;
  }
  for (const c of cases) {
    console.log(`    ${c.id.padEnd(16)} ${c.type || 'api'}  ${c.title || ''}`);
  }
}
