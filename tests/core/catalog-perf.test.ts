import { describe, expect, it } from 'vitest';
import { CATALOG } from '@/catalog/catalog';
import { filterCatalog, orderCatalog, SEARCH_LIMIT } from '@/ui/catalogFilter';

/*
 * Speed of the catalog with all the downloaded models (spec 2026-10-13, section 10): a keystroke
 * in the search must not be felt (one frame, 16 ms). Median of 20 runs; the budgets hold with a
 * wide margin on the dev machine (0.06 ms per search, 0.4 ms to order, measured 13/10/2026).
 */

function median(f: () => void, runs = 20): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    f();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[runs >> 1]!;
}

describe('catalog speed', () => {
  const ordered = orderCatalog(CATALOG);

  it('a search keystroke stays under a frame', () => {
    for (const q of ['a', 'chaise', 'refrig', 'zzz']) {
      const ms = median(() => filterCatalog(ordered, q, 'all', SEARCH_LIMIT));
      expect(ms, q).toBeLessThan(16);
    }
  });

  it('browsing (no search, a style filter) stays under a frame', () => {
    expect(median(() => filterCatalog(ordered, '', 'realiste'))).toBeLessThan(16);
  });

  it('ordering the catalog (once, at load) stays cheap', () => {
    expect(median(() => orderCatalog(CATALOG), 5)).toBeLessThan(50);
  });
});
