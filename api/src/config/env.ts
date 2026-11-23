import * as path from 'node:path';

/** Project root of the NestJS app (works from both `src/` and `dist/`). */
export const APP_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Seed JSON files bundled with the repo (`api/data`). They seed empty Mongo
 * collections (or DATA_DIR) on first boot and are what `/api/admin/backup` zips.
 */
export const BUNDLED_DATA_DIR = path.resolve(APP_ROOT, 'data');

/** Mirrors Python's `os.getenv(name)`; empty strings are returned as-is. */
export function getEnv(name: string): string | undefined {
  return process.env[name];
}

export function getEnvOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined ? fallback : value;
}

/** Equivalent of Python's `bool(os.getenv(name))`. */
export function hasEnv(name: string): boolean {
  return Boolean(process.env[name]);
}

export function dataDir(): string {
  return path.resolve(getEnvOr('DATA_DIR', BUNDLED_DATA_DIR));
}

export function useMongo(): boolean {
  return hasEnv('MONGODB_URI');
}
