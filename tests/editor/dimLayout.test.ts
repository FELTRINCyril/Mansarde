import { describe, expect, it } from 'vitest';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { boxesOverlap, dimText, dimTextBox, visibleAutoDims } from '@/render/dimLayout';
import { STYLE, textWidth } from '@/render/style';

const dim = (ax: number, ay: number, bx: number, by: number, offset = 30, kind: DimLine['kind'] = 'room'): DimLine => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  offset,
  value: Math.hypot(bx - ax, by - ay),
  kind,
});

describe('dimension text geometry', () => {
  it('a horizontal dimension: the text is centered on the line, on the far side of the measured points', () => {
    // a-b along +x, offset 30 towards perp(+x) = +y (below): the text hangs below the line
    const t = dimText(dim(0, 0, 400, 0, 30), 1, false)!;
    expect(t.at).toEqual({ x: 200, y: 30 });
    expect(t.angle).toBe(0);
    expect(t.width).toBeCloseTo(textWidth('4,00 m', STYLE.dimText), 9);
    const box = dimTextBox(t);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(200, 9);
    expect(box.minY).toBeGreaterThan(30); // below the line
    expect(box.maxX - box.minX).toBeGreaterThan(t.width);
  });

  it('a vertical dimension reads bottom to top and its box is tall and narrow', () => {
    const t = dimText(dim(0, 0, 0, 300, -30), 1, false)!;
    expect(t.angle).toBe(-90);
    const box = dimTextBox(t);
    expect(box.maxY - box.minY).toBeGreaterThan(box.maxX - box.minX);
    expect((box.minY + box.maxY) / 2).toBeCloseTo(150, 9);
  });

  it('boxes overlap only when they share an area', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(boxesOverlap(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
    expect(boxesOverlap(a, { minX: 10.5, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
    expect(boxesOverlap(a, { minX: 0, minY: 11, maxX: 10, maxY: 20 })).toBe(false);
  });
});

describe('visibleAutoDims: automatic dimensions whose text would be unreadable are left out', () => {
  it('keeps a dimension whose text fits between its ticks, drops one whose text is longer than its line', () => {
    const long = dim(0, 0, 400, 0);
    const short = dim(0, 100, 30, 100); // "0,30 m" is about 36 px wide at 1 px per cm
    expect(visibleAutoDims([{ dim: long }, { dim: short }], [], 1)).toEqual([true, false]);
    // zoomed in 4 times, the short one becomes readable
    expect(visibleAutoDims([{ dim: long }, { dim: short }], [], 0.25)).toEqual([true, true]);
  });

  it('drops the later of two dimensions whose texts collide, and any that hits an obstacle (room label)', () => {
    const a = dim(0, 0, 400, 0, 30);
    const b = dim(0, 2, 400, 2, 30); // same place, 2 cm lower: same text position
    const c = dim(0, 200, 400, 200, 30);
    expect(visibleAutoDims([{ dim: a }, { dim: b }, { dim: c }], [], 1)).toEqual([true, false, true]);
    const label = dimTextBox(dimText(c, 1, false)!);
    expect(visibleAutoDims([{ dim: a }, { dim: b }, { dim: c }], [label], 1)).toEqual([true, false, false]);
  });

  it('gives priority to facade, then room, then opening dimensions, whatever their order', () => {
    const opening = dim(0, 0, 400, 0, 30, 'opening');
    const room = dim(0, 1, 400, 1, 30, 'room');
    const facade = dim(0, 2, 400, 2, 30, 'facade');
    expect(visibleAutoDims([{ dim: opening }, { dim: room }, { dim: facade }], [], 1)).toEqual([false, false, true]);
    expect(visibleAutoDims([{ dim: opening }, { dim: room }], [], 1)).toEqual([false, true]);
  });

  it('ignores degenerate dimensions (zero length) without NaN', () => {
    expect(visibleAutoDims([{ dim: dim(5, 5, 5, 5) }], [], 1)).toEqual([false]);
  });
});
