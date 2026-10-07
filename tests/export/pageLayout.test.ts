import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { createObjectFromSize } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import {
  contentSizeMm,
  drawableAreaMm,
  fits,
  levelBounds,
  MARGIN_MM,
  pageSizeMm,
  printLineUnit,
  SCALES,
  suggestScale,
  TITLE_BLOCK_MM,
} from '@/export/pageLayout';
import { createLevel } from '@/core/model/factory';
import { levelFromWalls, rectRoom } from '../core/fixtures';

const house = { minX: 0, minY: 0, maxX: 1320, maxY: 1020 };

describe('page layout', () => {
  it('page sizes', () => {
    expect(pageSizeMm('A4', 'landscape')).toEqual({ width: 297, height: 210 });
    expect(pageSizeMm('A4', 'portrait')).toEqual({ width: 210, height: 297 });
    expect(pageSizeMm('A3', 'landscape')).toEqual({ width: 420, height: 297 });
    expect(pageSizeMm('A3', 'portrait')).toEqual({ width: 297, height: 420 });
  });

  it('constants and drawable area', () => {
    expect(SCALES).toEqual([20, 50, 100, 200]);
    expect(MARGIN_MM).toBe(10);
    expect(TITLE_BLOCK_MM).toEqual({ width: 70, height: 28 });
    expect(drawableAreaMm({ format: 'A4', orientation: 'landscape', scale: 50 })).toEqual({ width: 277, height: 162 });
  });

  it('contentSizeMm: 1000 cm at 1/50 is 200 mm', () => {
    expect(contentSizeMm({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 50)).toEqual({ width: 200, height: 100 });
    expect(contentSizeMm({ minX: 100, minY: -50, maxX: 1100, maxY: 450 }, 50)).toEqual({ width: 200, height: 100 });
  });

  it('1320 x 1020 cm does not fit A4 landscape at 1/50 (204 mm > 162 mm)', () => {
    expect(contentSizeMm(house, 50).height).toBeCloseTo(204, 9);
    expect(fits(house, { format: 'A4', orientation: 'landscape', scale: 50 })).toBe(false);
    expect(fits(house, { format: 'A4', orientation: 'landscape', scale: 100 })).toBe(true);
  });

  it('suggestScale picks the smallest denominator that fits', () => {
    expect(suggestScale(house, 'A4', 'landscape')).toBe(100);
    expect(suggestScale({ minX: 0, minY: 0, maxX: 500, maxY: 300 }, 'A4', 'landscape')).toBe(20);
    expect(suggestScale({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, 'A4', 'landscape')).toBe(50);
    expect(suggestScale(house, 'A3', 'landscape')).toBe(50);
  });

  it('suggestScale is null when even 1/200 does not fit', () => {
    expect(suggestScale({ minX: 0, minY: 0, maxX: 5000, maxY: 5000 }, 'A4', 'landscape')).toBeNull();
  });

  it('fits accepts an exact fit', () => {
    // 277 mm x 162 mm at 1/100 = 2770 cm x 1620 cm
    expect(fits({ minX: 0, minY: 0, maxX: 2770, maxY: 1620 }, { format: 'A4', orientation: 'landscape', scale: 100 })).toBe(true);
  });

  it('printLineUnit: 0.25 mm on paper in world cm', () => {
    expect(printLineUnit(50)).toBeCloseTo(1.25, 12);
    expect(printLineUnit(100)).toBeCloseTo(2.5, 12);
  });
});

describe('levelBounds', () => {
  it('is null for an empty level', () => {
    const level = createLevel('Vide', 0, 250);
    expect(levelBounds(level, deriveLevel(level))).toBeNull();
  });

  it('covers wall outlines (thickness included) plus the margin', () => {
    const level = levelFromWalls(rectRoom(0, 0, 1200, 900, 20));
    // outer face is half a thickness (10 cm) outside the axes
    expect(levelBounds(level, deriveLevel(level))).toEqual({ minX: -70, minY: -70, maxX: 1270, maxY: 970 });
    expect(levelBounds(level, deriveLevel(level), 0)).toEqual({ minX: -10, minY: -10, maxX: 1210, maxY: 910 });
  });

  it('includes objects outside the walls (rotated corners)', () => {
    const level = levelFromWalls(rectRoom(0, 0, 100, 100, 20));
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 500, 50, { width: 100, depth: 40, height: 50 }, 'X', '#999');
    level.objects[o.id] = o;
    const b = levelBounds(level, deriveLevel(level), 0)!;
    expect(b.maxX).toBeCloseTo(550, 9);
    expect(b.minX).toBeCloseTo(-10, 9);
    expect(b.maxY).toBeCloseTo(110, 9);
  });

  it('includes manual dimensions, and ignores dimensions whose anchor is gone', () => {
    const level = levelFromWalls(rectRoom(0, 0, 100, 100, 20));
    const id = newId();
    level.dimensions[id] = {
      id,
      a: { kind: 'point', x: 0, y: 300 },
      b: { kind: 'point', x: 400, y: 300 },
      offset: 0,
    };
    const lost = newId();
    level.dimensions[lost] = {
      id: lost,
      a: { kind: 'point', x: 0, y: 0 },
      b: { kind: 'objectCorner', objectId: newId(), corner: 0 },
      offset: 0,
    };
    expect(levelBounds(level, deriveLevel(level), 0)).toEqual({ minX: -10, minY: -10, maxX: 400, maxY: 300 });
  });

  it('excludes the background image', () => {
    const level = levelFromWalls(rectRoom(0, 0, 100, 100, 20));
    level.background = {
      imageId: newId(), widthPx: 800, heightPx: 600, scale: 10, x: -5000, y: -5000,
      rotation: 0, opacity: 0.5, locked: false, visible: true,
    };
    expect(levelBounds(level, deriveLevel(level), 0)).toEqual({ minX: -10, minY: -10, maxX: 110, maxY: 110 });
  });
});
