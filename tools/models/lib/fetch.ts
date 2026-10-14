import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

const ROOT = path.resolve(import.meta.dirname, '..');
export const CACHE = path.join(ROOT, '.cache');
const LOCK = path.join(ROOT, 'sources.lock.json');

type Lock = Record<string, string>;
const readLock = (): Lock => (existsSync(LOCK) ? (JSON.parse(readFileSync(LOCK, 'utf8')) as Lock) : {});

/**
 * Downloads `url` once into .cache/<name> and checks it against sources.lock.json: the first
 * download records its sha256, later ones must match it (a source that changed upstream stops the
 * build instead of silently changing the catalog).
 */
export async function fetchCached(url: string, name: string): Promise<string> {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, name);
  if (!existsSync(file)) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'plan-maison-models' } });
    if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
  const lock = readLock();
  if (lock[name] === undefined) {
    lock[name] = sha;
    writeFileSync(LOCK, JSON.stringify(Object.fromEntries(Object.entries(lock).sort()), null, 2) + '\n');
  } else if (lock[name] !== sha) {
    throw new Error(`sha256 mismatch for ${name}: ${sha} (expected ${lock[name]})`);
  }
  return file;
}

/** Fetches JSON (not cached, not locked: API listings). */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'user-agent': 'plan-maison-models' } });
  if (!res.ok) throw new Error(`request failed ${res.status}: ${url}`);
  return (await res.json()) as T;
}

/** Extracts a zip (archive file or bytes) into `dir` once; returns `dir`. Paths escaping `dir` are refused. */
export function unzipTo(zip: string | Uint8Array, dir: string): string {
  if (existsSync(path.join(dir, '.done'))) return dir;
  const files = unzipSync(typeof zip === 'string' ? readFileSync(zip) : zip);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue;
    const target = path.resolve(dir, name);
    if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`unsafe path in archive: ${name}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  writeFileSync(path.join(dir, '.done'), '');
  return dir;
}
