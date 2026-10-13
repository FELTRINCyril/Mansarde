import { describe, expect, it } from 'vitest';
import { parseProperties } from '../../tools/models/lib/properties';

describe('parseProperties', () => {
  it('reads keys, unicode escapes, comments and continued lines', () => {
    const p = parseProperties('a=1\nname#1=Fauteuil \\u00e0 bascule\n# comment\n! other\nlong=x\\\n  y\nsep\\:key = v\\=w\r\nempty=\n');
    expect(p.get('a')).toBe('1');
    expect(p.get('name#1')).toBe('Fauteuil à bascule');
    expect(p.get('long')).toBe('xy');
    expect(p.get('sep:key')).toBe('v=w');
    expect(p.get('empty')).toBe('');
    expect(p.has('# comment')).toBe(false);
    expect(p.size).toBe(5);
  });

  it('accepts a colon or a space as separator', () => {
    const p = parseProperties('k1: v1\nk2 v2\n');
    expect(p.get('k1')).toBe('v1');
    expect(p.get('k2')).toBe('v2');
  });
});
