import { describe, it, expect } from 'vitest';
import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';

describe('smoke', () => {
  it('loads geometry libraries', () => {
    const sq = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] as [number, number][][];
    expect(polygonClipping.union(sq).length).toBe(1);
    const p = polylabel(sq as unknown as number[][][], 0.5);
    expect(p[0]).toBeCloseTo(5, 0);
  });
});
