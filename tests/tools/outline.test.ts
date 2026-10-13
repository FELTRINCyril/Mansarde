import { describe, expect, it } from 'vitest';
import { capPoints, computeOutline, type TopTriangle } from '../../tools/models/lib/outline';

type P = [number, number, number];
const quad = (x0: number, z0: number, x1: number, z1: number, y = 0): TopTriangle[] => [
  { a: [x0, y, z0], b: [x1, y, z0], c: [x1, y, z1] },
  { a: [x0, y, z0], b: [x1, y, z1], c: [x0, y, z1] },
];

function ringArea(r: number[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    s += r[i]! * r[j + 1]! - r[j]! * r[i + 1]!;
  }
  return Math.abs(s) / 2;
}
const area = (rings: number[][]) => rings.reduce((s, r) => s + ringArea(r), 0);
function bounds(rings: number[][]) {
  const xs = rings.flatMap((r) => r.filter((_, i) => i % 2 === 0));
  const ys = rings.flatMap((r) => r.filter((_, i) => i % 2 === 1));
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function assertSane(rings: number[][]) {
  for (const r of rings) {
    expect(r.length % 2).toBe(0);
    expect(r.length).toBeGreaterThanOrEqual(6);
    for (const v of r) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(500);
    }
  }
}

describe('computeOutline', () => {
  it('outlines a full square without detail', () => {
    const { outline, detail } = computeOutline(quad(-0.5, -0.5, 0.5, 0.5));
    assertSane(outline);
    expect(outline).toHaveLength(1);
    const b = bounds(outline);
    expect(b.minX).toBeLessThanOrEqual(-490);
    expect(b.maxX).toBeGreaterThanOrEqual(490);
    expect(b.minY).toBeLessThanOrEqual(-490);
    expect(b.maxY).toBeGreaterThanOrEqual(490);
    expect(detail).toHaveLength(0);
  });

  it('outlines a disc with its area', () => {
    const tris: TopTriangle[] = [];
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a0 = (2 * Math.PI * i) / n;
      const a1 = (2 * Math.PI * (i + 1)) / n;
      tris.push({ a: [0, 0, 0], b: [0.5 * Math.cos(a0), 0, 0.5 * Math.sin(a0)], c: [0.5 * Math.cos(a1), 0, 0.5 * Math.sin(a1)] });
    }
    const { outline } = computeOutline(tris);
    assertSane(outline);
    expect(outline).toHaveLength(1);
    expect(area(outline) / ((Math.PI / 4) * 1e6)).toBeCloseTo(1, 1);
  });

  it('outlines an L shape', () => {
    const tris = [...quad(-0.5, -0.5, 0.5, 0), ...quad(-0.5, 0, 0, 0.5)];
    const { outline } = computeOutline(tris);
    assertSane(outline);
    expect(outline).toHaveLength(1);
    expect(Math.abs(area(outline) / 0.75e6 - 1)).toBeLessThan(0.03);
  });

  it('keeps a thin vertical panel through its edges', () => {
    const p = (x: number, y: number, z: number): P => [x, y, z];
    const tris: TopTriangle[] = [
      { a: p(0, 0, -0.5), b: p(0, 1, -0.5), c: p(0, 1, 0.5) },
      { a: p(0, 0, -0.5), b: p(0, 1, 0.5), c: p(0, 0, 0.5) },
    ];
    const { outline } = computeOutline(tris);
    assertSane(outline);
    expect(outline.length).toBeGreaterThan(0);
  });

  it('draws the high back of a sofa as detail on the back side', () => {
    const tris = [...quad(-0.5, -0.5, 0.5, 0.5, 0.4), ...quad(-0.5, -0.5, 0.5, -0.25, 1)];
    const { outline, detail } = computeOutline(tris);
    assertSane(outline);
    assertSane(detail);
    expect(detail).toHaveLength(1);
    expect(Math.abs(area(detail) / area(outline) - 0.25)).toBeLessThan(0.05);
    expect(bounds(detail).maxY).toBeLessThan(0);
  });

  it('gives one ring per separate part', () => {
    const tris = [...quad(-0.5, -0.5, -0.1, 0.5), ...quad(0.1, -0.5, 0.5, 0.5)];
    const { outline } = computeOutline(tris);
    assertSane(outline);
    expect(outline).toHaveLength(2);
  });

  it('fills a small hole', () => {
    // a frame around a 0.1 x 0.1 hole (1 % of the area)
    const tris = [...quad(-0.5, -0.5, 0.5, -0.05), ...quad(-0.5, 0.05, 0.5, 0.5), ...quad(-0.5, -0.05, -0.05, 0.05), ...quad(0.05, -0.05, 0.5, 0.05)];
    const { outline } = computeOutline(tris);
    expect(outline).toHaveLength(1);
    expect(area(outline)).toBeGreaterThan(0.98e6);
  });

  it('returns nothing for no triangles', () => {
    expect(computeOutline([])).toEqual({ outline: [], detail: [] });
  });
});

describe('capPoints', () => {
  const circle = (n: number, r = 500): number[] => Array.from({ length: n }, (_, i) => [Math.round(r * Math.cos((2 * Math.PI * i) / n)), Math.round(r * Math.sin((2 * Math.PI * i) / n))]).flat();

  it('leaves small rings untouched', () => {
    const ring = [-500, -500, 500, -500, 500, 500, -500, 500];
    expect(capPoints([ring], 64)).toEqual([ring]);
  });

  it('simplifies until the total fits, keeping the shape', () => {
    const rings = capPoints([circle(400), circle(300, 200)], 64);
    const total = rings.reduce((s, r) => s + r.length / 2, 0);
    expect(total).toBeLessThanOrEqual(64);
    expect(rings).toHaveLength(2);
    expect(Math.abs(ringArea(rings[0]!) / (Math.PI * 500 * 500) - 1)).toBeLessThan(0.05);
  });

  it('simplifies a single ring further rather than dropping it', () => {
    const rings = capPoints([circle(600), circle(500, 300)], 6);
    expect(rings.length).toBeGreaterThan(0);
    expect(rings.reduce((s, r) => s + r.length / 2, 0)).toBeLessThanOrEqual(6);
    expect(rings.reduce((s, r) => s + r.length / 2, 0)).toBeGreaterThanOrEqual(3);
  });

  it('drops the smallest rings rather than looping forever', () => {
    const many = Array.from({ length: 40 }, (_, i) => circle(12, 20 + i));
    const rings = capPoints(many, 64);
    expect(rings.reduce((s, r) => s + r.length / 2, 0)).toBeLessThanOrEqual(64);
    expect(rings.length).toBeGreaterThan(0);
    // the largest ring is kept (simplified within 1.6 % of the box, so most of its area stays)
    expect(Math.max(...rings.map(ringArea)) / Math.max(...many.map(ringArea))).toBeGreaterThan(0.8);
  });
});
