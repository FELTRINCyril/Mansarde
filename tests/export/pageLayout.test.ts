import { describe, expect, it } from 'vitest';
import { deriveLevel } from '@/core/geometry/derived';
import { createObjectFromSize } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import {
  BLEED_PX,
  contentSizeMm,
  drawableAreaMm,
  fits,
  formatPrintDate,
  levelBounds,
  MARGIN_MM,
  planPlacement,
  scaleBarMeters,
  titleBlockRect,
  pageSizeMm,
  printLineUnit,
  SCALES,
  suggestScale,
  TITLE_BLOCK_MM,
} from '@/export/pageLayout';
import { createLevel, createOpening } from '@/core/model/factory';
import type { Level, Opening } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from '../core/fixtures';
import { buildSampleProject } from './sampleProject';

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

  describe('opening swing extents', () => {
    // top wall (0,0)-(400,0): dir +x, normal perp(dir) = +y (into the room); swing 'right' opens outside (-y)
    const withOpening = (overrides: Partial<Opening>, kind: Opening['kind'] = 'door'): Level => {
      const level = levelFromWalls(rectRoom(0, 0, 400, 300, 20));
      const o = createOpening(findWall(level, 0, 0, 400, 0), kind, 200, { width: 83, ...overrides });
      level.openings[o.id] = o;
      return level;
    };
    const minY = (level: Level) => levelBounds(level, deriveLevel(level), 0)!.minY;

    it('includes the arc of an outward single door (radius = leaf width)', () => {
      expect(minY(withOpening({ swing: 'right' }))).toBeCloseTo(-(10 + 83), 9);
      expect(levelBounds(withOpening({ swing: 'right' }), deriveLevel(withOpening({ swing: 'right' })))!.minY).toBeCloseTo(-(10 + 83 + 60), 9);
    });

    it('double leaves reach half the width', () => {
      expect(minY(withOpening({ swing: 'right', variant: 'double' }))).toBeCloseTo(-(10 + 41.5), 9);
    });

    it('outward casement windows are included too', () => {
      expect(minY(withOpening({ swing: 'right', variant: 'single', width: 120 }, 'window'))).toBeCloseTo(-(10 + 120), 9);
    });

    it('inward doors, sliding and pocket doors, fixed windows and passages do not grow the bounds', () => {
      expect(minY(withOpening({ swing: 'left' }))).toBeCloseTo(-10, 9);
      expect(minY(withOpening({ swing: 'right', variant: 'sliding' }))).toBeCloseTo(-10, 9);
      expect(minY(withOpening({ swing: 'right', variant: 'pocket' }))).toBeCloseTo(-10, 9);
      expect(minY(withOpening({ swing: 'right', variant: 'fixed' }, 'window'))).toBeCloseTo(-10, 9);
      expect(minY(withOpening({ swing: 'right', variant: 'none' }, 'passage'))).toBeCloseTo(-10, 9);
    });
  });
});

describe('sheet layout', () => {
  const room = { minX: -30, minY: -20, maxX: 370, maxY: 280 }; // 400 x 300 cm

  it('places the plan at the margins at the exact scale: 4 m at 1/50 is 80 mm', () => {
    const p = planPlacement(room, { format: 'A4', orientation: 'landscape', scale: 50 });
    const mmPerCm = p.width / p.viewBox.width;
    expect(mmPerCm).toBeCloseTo(10 / 50, 12);
    expect(p.height / p.viewBox.height).toBeCloseTo(mmPerCm, 12);
    expect(400 * mmPerCm).toBeCloseTo(80, 9);
    // the bounds' top-left corner lands exactly on the margins
    expect(p.x + (room.minX - p.viewBox.x) * mmPerCm).toBeCloseTo(MARGIN_MM, 9);
    expect(p.y + (room.minY - p.viewBox.y) * mmPerCm).toBeCloseTo(MARGIN_MM, 9);
  });

  it('adds a bleed of BLEED_PX print units (5 mm on paper at every scale) for dimension text', () => {
    expect(BLEED_PX).toBe(20);
    for (const scale of [20, 50, 100, 200]) {
      const p = planPlacement(room, { format: 'A3', orientation: 'portrait', scale });
      expect(p.x).toBeCloseTo(MARGIN_MM - 5, 9);
      expect(p.y).toBeCloseTo(MARGIN_MM - 5, 9);
      expect(p.width).toBeCloseTo((400 * 10) / scale + 10, 9);
      expect(p.viewBox.x).toBeCloseTo(room.minX - BLEED_PX * printLineUnit(scale), 9);
    }
  });

  it('title block in the bottom right corner, inside the margins', () => {
    expect(titleBlockRect({ format: 'A4', orientation: 'landscape', scale: 50 })).toEqual({ x: 217, y: 172, width: 70, height: 28 });
    expect(titleBlockRect({ format: 'A3', orientation: 'portrait', scale: 50 })).toEqual({ x: 217, y: 382, width: 70, height: 28 });
  });

  it('scale bar length: 1 m at 1/20, 2 m at 1/50, 5 m at 1/100 and 1/200', () => {
    expect(scaleBarMeters(20)).toBe(1);
    expect(scaleBarMeters(50)).toBe(2);
    expect(scaleBarMeters(100)).toBe(5);
    expect(scaleBarMeters(200)).toBe(5);
  });

  it('date as dd/mm/yyyy', () => {
    expect(formatPrintDate(new Date(2026, 9, 7, 23, 59))).toBe('07/10/2026');
    expect(formatPrintDate(new Date(2027, 0, 31))).toBe('31/01/2027');
  });
});

describe('export sample', () => {
  it('builds a valid sample whose bounds include the outward door arc', () => {
    const p = buildSampleProject({ imageId: 'img-1' });
    const level = p.levels[0]!;
    const d = deriveLevel(level);
    expect(p.name).toBe("Maison d'été");
    expect(d.rooms.map((r) => r.name)).toEqual(['Séjour']);
    expect(Object.values(level.objects).map((o) => o.name)).toEqual(['Lit bébé']);
    // walls -10..410 x -10..310, door arc up to y = -(10 + 83), margin 60
    expect(levelBounds(level, d)).toEqual({ minX: -70, minY: -153, maxX: 470, maxY: 370 });
    expect(fits(levelBounds(level, d)!, { format: 'A4', orientation: 'landscape', scale: 50 })).toBe(true);
    expect(fits(levelBounds(level, d)!, { format: 'A4', orientation: 'portrait', scale: 20 })).toBe(false);
  });
});
