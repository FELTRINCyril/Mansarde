import { describe, expect, it } from 'vitest';
import { resolveAnchor } from '@/core/geometry/anchors';
import { objectCorners, objectFootprint, objectShape } from '@/core/geometry/objects';
import { area, signedArea } from '@/core/geometry/polygon';
import { createObjectFromSize } from '@/core/model/factory';
import type { CustomObjectDef, PlacedObject } from '@/core/model/types';
import { levelFromWalls } from './fixtures';

const catalog = (id: string) => ({ kind: 'catalog', catalogId: id }) as const;
const box = (over: Partial<PlacedObject> = {}): PlacedObject =>
  createObjectFromSize(catalog('generic-rect'), 0, 0, { width: 100, depth: 50, height: 80 }, 'Boite', '#ccc', over);

describe('objectCorners', () => {
  it('lists the corners of an unrotated object in local order', () => {
    const c = objectCorners(box({ x: 200, y: 100 }));
    expect(c).toEqual([
      { x: 150, y: 75 },
      { x: 250, y: 75 },
      { x: 250, y: 125 },
      { x: 150, y: 125 },
    ]);
  });

  it('rotates around the center: 100x50 at (0,0) turned 90 degrees has corner 1 at (25, 50)', () => {
    // local corner 1 = (50, -25); rotate(v, 90deg) = (x cos - y sin, x sin + y cos) = (25, 50)
    const c = objectCorners(box({ rotation: 90 }));
    expect(c[1].x).toBeCloseTo(25, 9);
    expect(c[1].y).toBeCloseTo(50, 9);
    expect(c[0].x).toBeCloseTo(25, 9); // local (-50, -25) -> (25, -50)
    expect(c[0].y).toBeCloseTo(-50, 9);
  });
});

describe('objectFootprint', () => {
  it('is the corner rectangle for a rect', () => {
    const o = box({ rotation: 30, x: 10, y: 20 });
    expect(objectFootprint(o)).toEqual(objectCorners(o));
  });

  it('is a 32-gon inscribed in the ellipse for a circle', () => {
    const ring = objectFootprint(box({ width: 80, depth: 40 }), 'circle');
    expect(ring).toHaveLength(32);
    for (const p of ring) expect((p.x / 40) ** 2 + (p.y / 20) ** 2).toBeCloseTo(1, 9);
    expect(area(ring)).toBeLessThan(Math.PI * 40 * 20);
    expect(area(ring)).toBeGreaterThan(0.98 * Math.PI * 40 * 20);
  });

  it('removes the notch at the local (+x, +y) corner for an L, and mirrored flips x', () => {
    const l = box({ width: 100, depth: 60, lshape: { notchWidth: 40, notchDepth: 20 } });
    const ring = objectFootprint(l);
    expect(ring).toHaveLength(6);
    expect(area(ring)).toBeCloseTo(100 * 60 - 40 * 20, 9);
    expect(ring).toContainEqual({ x: 10, y: 10 }); // inner corner (hw - nw, hd - nd)
    expect(ring).not.toContainEqual({ x: 50, y: 30 }); // the notched corner itself

    const m = objectFootprint({ ...l, mirrored: true });
    expect(m).toHaveLength(6);
    expect(m).toContainEqual({ x: -10, y: 10 });
    expect(m).not.toContainEqual({ x: -50, y: 30 });
    expect(Math.sign(signedArea(m))).toBe(Math.sign(signedArea(ring))); // same winding
  });

  it('follows the rotation and the center for an L', () => {
    const l = box({ x: 100, y: 100, rotation: 180, width: 100, depth: 60, lshape: { notchWidth: 40, notchDepth: 20 } });
    const ring = objectFootprint(l);
    const inner = ring.find((p) => Math.abs(p.x - 90) < 1e-9 && Math.abs(p.y - 90) < 1e-9);
    expect(inner).toBeDefined(); // (10, 10) turned 180 degrees about (100, 100)
  });
});

describe('objectShape', () => {
  const defs: Record<string, CustomObjectDef> = {
    c1: { id: 'c1', name: 'Rond', shape: 'circle', width: 50, depth: 50, height: 50, color: '#fff', lshape: null, pose: 'floor' },
  };
  const placed = (source: PlacedObject['source']): PlacedObject => box({ source });

  it('maps the generic catalog ids, treats other catalog ids as symbols', () => {
    expect(objectShape(placed(catalog('generic-rect')), defs)).toBe('rect');
    expect(objectShape(placed(catalog('generic-circle')), defs)).toBe('circle');
    expect(objectShape(placed(catalog('generic-lshape')), defs)).toBe('lshape');
    expect(objectShape(placed(catalog('sofa-3')), defs)).toBe('symbol');
  });

  it('takes the shape of the custom definition', () => {
    expect(objectShape(placed({ kind: 'custom', customObjectId: 'c1' }), defs)).toBe('circle');
  });
});

describe('resolveAnchor', () => {
  const level = levelFromWalls([[0, 0, 400, 0]]);
  const nodeId = Object.keys(level.nodes)[0]!;
  const obj = box({ id: 'o1', rotation: 90 });
  level.objects['o1'] = obj;

  it('resolves node, point and object corner anchors', () => {
    expect(resolveAnchor(level, { kind: 'node', nodeId })).toEqual({ x: 0, y: 0 });
    expect(resolveAnchor(level, { kind: 'point', x: 7, y: 8 })).toEqual({ x: 7, y: 8 });
    const c = resolveAnchor(level, { kind: 'objectCorner', objectId: 'o1', corner: 1 })!;
    expect(c.x).toBeCloseTo(25, 9);
    expect(c.y).toBeCloseTo(50, 9);
  });

  it('returns null for missing nodes, objects and corners', () => {
    expect(resolveAnchor(level, { kind: 'node', nodeId: 'nope' })).toBeNull();
    expect(resolveAnchor(level, { kind: 'objectCorner', objectId: 'nope', corner: 0 })).toBeNull();
    expect(resolveAnchor(level, { kind: 'objectCorner', objectId: 'o1', corner: 4 as 0 })).toBeNull();
  });
});
