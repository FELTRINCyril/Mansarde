import { FORMAT_VERSION } from '../model/types';

/**
 * Migrations of the export file, keyed by the version they upgrade FROM.
 * migrations[n] receives the raw parsed file at version n and returns it at version n + 1
 * (including project.formatVersion). Empty while FORMAT_VERSION is 1.
 */
export const migrations: Record<number, (raw: any) => any> = {};

/** Applies every migration from raw.formatVersion up to FORMAT_VERSION. */
export function migrate(raw: { formatVersion: number }): unknown {
  let current: { formatVersion: number } = raw;
  for (let v = raw.formatVersion; v < FORMAT_VERSION; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`Missing migration from format version ${v}`);
    current = step(current);
  }
  return current;
}
