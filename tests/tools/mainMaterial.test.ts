import { describe, expect, it } from 'vitest';
import { pickMainMaterial } from '../../tools/models/lib/mainMaterial';

const m = (area: number, color: [number, number, number] = [0.6, 0.5, 0.4], metallic = 0, alpha = 1) => ({ name: '', area, color, metallic, alpha });

describe('pickMainMaterial', () => {
  it('takes the largest area', () => {
    expect(pickMainMaterial([m(1), m(3), m(2)])).toBe(1);
  });
  it('skips dark, metallic and transparent materials when a plain one exists', () => {
    expect(pickMainMaterial([m(10, [0.02, 0.02, 0.02]), m(1)])).toBe(1);
    expect(pickMainMaterial([m(10, undefined, 0.9), m(1)])).toBe(1);
    expect(pickMainMaterial([m(10, undefined, 0, 0.3), m(1)])).toBe(1);
  });
  it('falls back to the largest when every material is excluded', () => {
    expect(pickMainMaterial([m(1, [0, 0, 0]), m(5, [0, 0, 0])])).toBe(1);
  });
  it('returns -1 without materials', () => {
    expect(pickMainMaterial([])).toBe(-1);
  });
});
