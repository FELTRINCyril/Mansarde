import { describe, expect, it } from 'vitest';
import { offsetChain } from '@/core/geometry/offsetChain';
import type { Vec2 } from '@/core/model/types';

const P = (x: number, y: number): Vec2 => ({ x, y });

function expectPoints(actual: Vec2[], expected: Vec2[]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i]!.x, 9);
    expect(p.y).toBeCloseTo(expected[i]!.y, 9);
  });
}

/** Distance from p to the infinite line through a and b. */
const lineDistance = (p: Vec2, a: Vec2, b: Vec2): number =>
  Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);

describe('offsetChain', () => {
  it('open chain, positive offset = left of travel (+perp), mitered corner', () => {
    expectPoints(offsetChain([P(0, 0), P(400, 0), P(400, 300)], 10, false), [P(0, 10), P(390, 10), P(390, 300)]);
  });

  it('negative offset goes to the right of travel', () => {
    expectPoints(offsetChain([P(0, 0), P(400, 0), P(400, 300)], -10, false), [P(0, -10), P(410, -10), P(410, 300)]);
  });

  it('closed chain: every corner is mitered, the closing corner included', () => {
    const square = [P(0, 0), P(400, 0), P(400, 400), P(0, 400)];
    expectPoints(offsetChain(square, 10, true), [P(10, 10), P(390, 10), P(390, 390), P(10, 390)]);
    expectPoints(offsetChain(square, -10, true), [P(-10, -10), P(410, -10), P(410, 410), P(-10, 410)]);
  });

  it('closed chain given with its first point repeated keeps that form', () => {
    const square = [P(0, 0), P(400, 0), P(400, 400), P(0, 400), P(0, 0)];
    expectPoints(offsetChain(square, 10, true), [P(10, 10), P(390, 10), P(390, 390), P(10, 390), P(10, 10)]);
  });

  it('a 45 deg corner: the miter point is at the offset distance from both segment lines', () => {
    const pts = [P(0, 0), P(100, 0), P(200, 100)];
    const out = offsetChain(pts, 10, false);
    expect(lineDistance(out[1]!, pts[0]!, pts[1]!)).toBeCloseTo(10, 9);
    expect(lineDistance(out[1]!, pts[1]!, pts[2]!)).toBeCloseTo(10, 9);
    // miter length offset / cos(22.5 deg), on the inner side of the turn
    expect(Math.hypot(out[1]!.x - 100, out[1]!.y)).toBeCloseTo(10 / Math.cos(Math.PI / 8), 9);
    expect(out[1]!.x).toBeLessThan(100);
  });

  it('collinear points, duplicates, hairpins and short inputs', () => {
    expectPoints(offsetChain([P(0, 0), P(200, 0), P(400, 0)], 10, false), [P(0, 10), P(200, 10), P(400, 10)]);
    expectPoints(offsetChain([P(0, 0), P(0, 0), P(100, 0)], 10, false), [P(0, 10), P(100, 10)]);
    expectPoints(offsetChain([P(0, 0), P(100, 0), P(0, 0)], 10, false), [P(0, 10), P(100, 10), P(0, -10)]);
    expectPoints(offsetChain([P(0, 0), P(400, 0), P(400, 300)], 0, false), [P(0, 0), P(400, 0), P(400, 300)]);
    expect(offsetChain([], 10, false)).toEqual([]);
    expect(offsetChain([P(1, 2)], 10, true)).toEqual([P(1, 2)]);
  });
});
