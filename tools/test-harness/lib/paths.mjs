import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));

/** tools/test-harness */
export const HARNESS_ROOT = join(LIB_DIR, '..');

/** Repo root (oz-reg-vn-apphub-apps) */
export const ROOT = join(LIB_DIR, '..', '..', '..');
