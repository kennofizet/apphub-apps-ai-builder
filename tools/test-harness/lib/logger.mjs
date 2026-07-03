import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';

export class ActionLog {
  constructor(config, scenario) {
    this.config = config;
    this.scenario = scenario;
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.baseDir = join(ROOT, config.logging.dir, this.sessionId);
    this.jsonlPath = join(this.baseDir, 'actions.jsonl');
    this.pass = 0;
    this.fail = 0;
    this.actions = [];

    if (config.logging.jsonl) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  record(entry) {
    const row = {
      ts: new Date().toISOString(),
      scenario: this.scenario,
      ...entry,
    };
    this.actions.push(row);

    if (entry.ok === false) this.fail += 1;
    else if (entry.ok === true) this.pass += 1;

    if (this.config.logging.jsonl) {
      appendFileSync(this.jsonlPath, `${JSON.stringify(row)}\n`, 'utf8');
    }

    if (this.config.logging.console) {
      const status = entry.status != null ? ` ${entry.status}` : '';
      const ms = entry.duration_ms != null ? ` (${entry.duration_ms}ms)` : '';
      const mark = entry.ok === false ? 'FAIL' : entry.ok === true ? 'ok' : '…';
      console.log(`  [${mark}] ${entry.actor || '-'} ${entry.action}${status}${ms}`);
      if (entry.detail) console.log(`         ${entry.detail}`);
      if (entry.error) console.log(`         ${entry.error}`);
    }
  }

  async track(actor, action, fn, meta = {}) {
    const start = Date.now();
    try {
      const result = await fn();
      this.record({
        actor,
        action,
        ok: true,
        duration_ms: Date.now() - start,
        ...meta,
      });
      return result;
    } catch (err) {
      this.record({
        actor,
        action,
        ok: false,
        duration_ms: Date.now() - start,
        error: err?.message || String(err),
        ...meta,
      });
      throw err;
    }
  }

  finish(exitCode = 0) {
    const summary = {
      sessionId: this.sessionId,
      scenario: this.scenario,
      finishedAt: new Date().toISOString(),
      pass: this.pass,
      fail: this.fail,
      exitCode,
    };
    if (this.config.logging.jsonl) {
      writeFileSync(join(this.baseDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    }
    if (this.config.logging.console) {
      console.log(`\nSession ${this.sessionId}: ${this.pass} ok, ${this.fail} fail → ${this.baseDir}\n`);
    }
    return summary;
  }
}

export function listSessions(config) {
  const dir = join(ROOT, config.logging.dir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
}

export function tailLatestLog(config, lines = 30) {
  const sessions = listSessions(config);
  if (sessions.length === 0) {
    console.log('No harness logs yet.');
    return;
  }
  const path = join(ROOT, config.logging.dir, sessions[0], 'actions.jsonl');
  if (!existsSync(path)) {
    console.log(`No actions.jsonl in ${sessions[0]}`);
    return;
  }
  const all = readFileSync(path, 'utf8').trim().split('\n');
  const slice = all.slice(-lines);
  console.log(`\n--- ${sessions[0]} (last ${slice.length} actions) ---\n`);
  for (const line of slice) {
    try {
      const o = JSON.parse(line);
      console.log(`${o.ts} [${o.actor}] ${o.action} ${o.status || ''} ${o.error || o.detail || ''}`.trim());
    } catch {
      console.log(line);
    }
  }
  console.log('');
}
