import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.mjs';

function readTokenFile(relPath) {
  const path = join(ROOT, relPath);
  if (!existsSync(path)) return null;
  const token = readFileSync(path, 'utf8').trim();
  return token || null;
}

export function loadAccounts(config) {
  const dev =
    readTokenFile(config.tokens.dev) ||
    readTokenFile(config.tokens.publisher_fallback);

  const user = readTokenFile(config.tokens.user);

  return {
    dev: { role: 'dev', token: dev, file: config.tokens.dev },
    user: { role: 'user', token: user, file: config.tokens.user },
  };
}

export function requireDev(accounts) {
  if (!accounts.dev.token) {
    throw new Error(
      `Dev token missing. Create ${accounts.dev.file} or ${'.apphub-token.local'} (Hub → Copy token for AI, dev account).`
    );
  }
  return accounts.dev;
}

export function requireUser(accounts) {
  if (!accounts.user.token) {
    throw new Error(
      `User token missing. Create ${accounts.user.file} (Hub → Copy token for AI, normal user account).`
    );
  }
  return accounts.user;
}
