import { describe, expect, it } from 'vitest';
import type { DimLine } from '@/core/geometry/autoDimensions';
import { boxesOverlap, dimText, dimTextBox, MIN_OPENING_FONT_SCALE, placeAutoDims, type Box } from '@/render/dimLayout';
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

/** Which dimensions are drawn at all. */
const visibleAutoDims = (dims: Array<{ dim: DimLine; textInside?: boolean }>, obstacles: Box[], lineUnit: number): boolean[] =>
  placeAutoDims(dims, obstacles, lineUnit).map((p) => p !== null);

describe('placeAutoDims: automatic dimensions whose text would be unreadable are left out', () => {
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

  it('places opening widths first, then facades, then rooms, whatever their order (R38)', () => {
    const opening = dim(0, 0, 400, 0, 30, 'opening');
    const room = dim(0, 1, 400, 1, 30, 'room');
    const facade = dim(0, 2, 400, 2, 30, 'facade');
    expect(visibleAutoDims([{ dim: room }, { dim: facade }, { dim: opening }], [], 1)).toEqual([false, false, true]);
    expect(visibleAutoDims([{ dim: room }, { dim: facade }], [], 1)).toEqual([false, true]);
  });

  it('ignores degenerate dimensions (zero length) without NaN', () => {
    expect(visibleAutoDims([{ dim: dim(5, 5, 5, 5) }], [], 1)).toEqual([false]);
  });
});

describe('placeAutoDims: opening widths are never left out (ruling R38)', () => {
  it('a door too narrow for its text gets a smaller text, down to the minimum', () => {
    // at 1/100 (lineUnit 2.5) "0,83 m" is about 91 cm wide at full size: longer than the 83 cm door
    const door = dim(0, 0, 83, 0, 30, 'opening');
    const [p] = placeAutoDims([{ dim: door }], [], 2.5);
    expect(p).not.toBeNull();
    expect(p!.fontScale).toBeLessThan(1);
    expect(p!.fontScale).toBeGreaterThanOrEqual(MIN_OPENING_FONT_SCALE);
    const t = dimText(p!.dim, 2.5, false, p!.fontScale)!;
    expect(t.width).toBeLessThanOrEqual(t.lineLength);
    expect(t.fontSize).toBeCloseTo(STYLE.dimText * 2.5 * p!.fontScale, 9);
  });

  it('a wide opening keeps the normal text', () => {
    expect(placeAutoDims([{ dim: dim(0, 0, 400, 0, 30, 'opening') }], [], 1)[0]).toMatchObject({ fontScale: 1 });
  });

  it('an opening width over an obstacle moves away from its wall, never disappears', () => {
    const door = dim(0, 0, 200, 0, 30, 'opening');
    const t = dimText(door, 1, false)!;
    // an obstacle covering the text at every size in place, but not one text line further
    const box = dimTextBox(t);
    const obstacle = { minX: box.minX - 50, minY: box.minY - 5, maxX: box.maxX + 50, maxY: box.maxY + 2 };
    const [p] = placeAutoDims([{ dim: door }], [obstacle], 1);
    expect(p).not.toBeNull();
    expect(p!.fontScale).toBe(MIN_OPENING_FONT_SCALE);
    expect(Math.abs(p!.dim.offset)).toBeGreaterThan(30);
    expect(Math.sign(p!.dim.offset)).toBe(1);
    expect(boxesOverlap(obstacle, dimTextBox(dimText(p!.dim, 1, false, p!.fontScale)!))).toBe(false);
  });

  it('when no place is free, an opening width is still drawn, smallest text, in place', () => {
    const door = dim(0, 0, 200, 0, 30, 'opening');
    const everywhere = { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 };
    expect(placeAutoDims([{ dim: door }], [everywhere], 1)[0]).toEqual({ dim: door, textInside: false, fontScale: MIN_OPENING_FONT_SCALE });
    // a room dimension at the same place is left out
    expect(placeAutoDims([{ dim: dim(0, 0, 200, 0, 30, 'room') }], [everywhere], 1)[0]).toBeNull();
  });

  it('two doors side by side are both drawn', () => {
    const a = dim(0, 0, 83, 0, 30, 'opening');
    const b = dim(90, 0, 173, 0, 30, 'opening');
    expect(placeAutoDims([{ dim: a }, { dim: b }], [], 2.5).every((p) => p !== null)).toBe(true);
  });
});
