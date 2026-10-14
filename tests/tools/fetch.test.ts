import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { unzipTo } from '../../tools/models/lib/fetch';

/* The archives come from the internet: an entry must never be written outside its folder. */

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'mansarde-unzip-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('unzipTo', () => {
  it('extracts the entries under the target folder', () => {
    const root = tmp();
    const out = path.join(root, 'lib');
    unzipTo(zipSync({ 'a/b.txt': strToU8('hello') }), out);
    expect(readFileSync(path.join(out, 'a', 'b.txt'), 'utf8')).toBe('hello');
  });

  it('refuses an entry that climbs out of the folder (zip slip)', () => {
    const root = tmp();
    const out = path.join(root, 'lib');
    expect(() => unzipTo(zipSync({ '../evil.txt': strToU8('x') }), out)).toThrow(/unsafe path/);
    expect(existsSync(path.join(root, 'evil.txt'))).toBe(false);
  });
});
