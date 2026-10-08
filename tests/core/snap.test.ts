import { describe, expect, it } from 'vitest';
import { snapObjectToWalls, snapPoint, type SnapOptions } from '@/core/geometry/snap';
import { createLevel, createObjectFromSize } from '@/core/model/factory';
import type { Level, Vec2 } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';

const room = (): Level => levelFromWalls(rectRoom(0, 0, 400, 300));
const opts = (level: Level, extra: Partial<SnapOptions> = {}): SnapOptions => ({
  level,
  pxPerCm: 1,
  gridStep: 10,
  enabled: true,
  ortho: false,
  ...extra,
});
const close = (p: Vec2, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('snapPoint', () => {
  it('snaps to a node within the tolerance (8 cm at 1 px/cm)', () => {
    const level = room();
    const r = snapPoint({ x: 3, y: 4 }, opts(level));
    expect(r.kind).toBe('node');
    expect(r.point).toEqual({ x: 0, y: 0 });
    expect(level.nodes[r.nodeId!]).toMatchObject({ x: 0, y: 0 });
  });

  it('snaps to the middle of a wall', () => {
    const level = room();
    const r = snapPoint({ x: 203, y: 4 }, opts(level));
    expect(r.kind).toBe('wallMid');
    close(r.point, 200, 0);
    expect(r.wallId).toBe(findWall(level, 0, 0, 400, 0));
    expect(r.t).toBeCloseTo(0.5);
  });

  it('projects on a wall axis elsewhere, with the parameter t along the wall', () => {
    const level = room();
    const r = snapPoint({ x: 100, y: 4 }, opts(level));
    expect(r.kind).toBe('wallAxis');
    close(r.point, 100, 0);
    expect(r.wallId).toBe(findWall(level, 0, 0, 400, 0));
    expect(r.t).toBeCloseTo(0.25);
  });

  it('aligns on the x and y of existing nodes with a guide from each node', () => {
    const level = room();
    const r = snapPoint({ x: 403, y: 150.5 + 200 }, opts(level));
    expect(r.kind).toBe('align');
    close(r.point, 400, 350.5);
    expect(r.guides).toHaveLength(1);
    close(r.guides[0]!.a, 400, 300);
    close(r.guides[0]!.b, 400, 350.5);
    const both = snapPoint({ x: 405, y: 506 }, opts(levelFromWalls([[400, 0, 400, 300], [0, 500, 100, 500]])));
    expect(both.kind).toBe('align');
    close(both.point, 400, 500);
    expect(both.guides).toHaveLength(2);
  });

  it('snaps to multiples of 15 deg from the previous point, length rounded to the grid (R16)', () => {
    const empty = createLevel('Vide', 0, 250);
    const flat = snapPoint({ x: 100, y: 3 }, opts(empty, { from: { x: 0, y: 0 } }));
    expect(flat.kind).toBe('angle');
    close(flat.point, 100, 0);
    const off = snapPoint({ x: 103, y: 2 }, opts(empty, { from: { x: 0, y: 0 } }));
    expect(off.kind).toBe('angle');
    close(off.point, 100, 0);
    // raw length 71.45 -> 70 on the 45 deg ray
    const diag = snapPoint({ x: 52, y: 49 }, opts(empty, { from: { x: 0, y: 0 } }));
    expect(diag.kind).toBe('angle');
    close(diag.point, 70 / Math.SQRT2, 70 / Math.SQRT2);
    // from off the grid: the length is rounded, not the coordinates
    const shifted = snapPoint({ x: 5 + 52, y: 3 + 49 }, opts(empty, { from: { x: 5, y: 3 } }));
    close(shifted.point, 5 + 70 / Math.SQRT2, 3 + 70 / Math.SQRT2);
  });

  it('with a previous point, an alignment keeps the aligned coordinate and rounds the other offset (R16)', () => {
    // nodes at x = 400 (y 600..900), far from the cursor
    const level = levelFromWalls([[400, 600, 400, 900]]);
    const r = snapPoint({ x: 403, y: 137 }, opts(level, { from: { x: 5, y: 3 } }));
    expect(r.kind).toBe('align');
    // x stays on the guide, y - from.y = 134 -> 130
    close(r.point, 400, 133);
    close(r.guides[0]!.b, 400, 133);
    // without a previous point the free coordinate stays raw
    close(snapPoint({ x: 403, y: 137 }, opts(level)).point, 400, 137);
  });

  it('falls back to the grid when far from everything and without a previous point', () => {
    const r = snapPoint({ x: 123, y: 456 }, opts(room()));
    expect(r.kind).toBe('grid');
    expect(r.point).toEqual({ x: 120, y: 460 });
  });

  it('returns the raw point when disabled (Alt held)', () => {
    const r = snapPoint({ x: 3, y: 4 }, opts(room(), { enabled: false }));
    expect(r).toEqual({ point: { x: 3, y: 4 }, kind: 'none', guides: [] });
  });

  it('ortho constrains to the closest axis from the previous point', () => {
    const r = snapPoint({ x: 100, y: 30 }, opts(room(), { ortho: true, from: { x: 0, y: 0 } }));
    expect(r.kind).toBe('ortho');
    close(r.point, 100, 0);
  });

  it('ortho rounds the length from the previous point to the grid (R16)', () => {
    const empty = createLevel('Vide', 0, 250);
    const h = snapPoint({ x: 108, y: 20 }, opts(empty, { ortho: true, from: { x: 5, y: 5 } }));
    expect(h.kind).toBe('ortho');
    close(h.point, 105, 5);
    const v = snapPoint({ x: 0, y: -144 }, opts(empty, { ortho: true, from: { x: 5, y: 5 } }));
    close(v.point, 5, -145);
  });

  it('ortho snaps to nodes and walls near the projected point, never to a node off the line', () => {
    const level = room();
    const on = snapPoint({ x: 396, y: 30 }, opts(level, { ortho: true, from: { x: 0, y: 0 } }));
    expect(on.kind).toBe('node');
    expect(on.point).toEqual({ x: 400, y: 0 });
    // projected point (0, 296) is 4 cm from node (0, 300) and the node lies on the vertical axis
    const vertical = snapPoint({ x: 30, y: 296 }, opts(level, { ortho: true, from: { x: 0, y: 150 } }));
    expect(vertical.kind).toBe('node');
    // the wall axis x = 400 crosses the horizontal line y = 120 inside the wall
    const axis = snapPoint({ x: 405, y: 130 }, opts(level, { ortho: true, from: { x: 100, y: 120 } }));
    expect(axis.kind).toBe('wallAxis');
    close(axis.point, 400, 120);
    // node (400, 300) is 4.5 cm from the cursor but 20 cm from the projected point (396, 280)
    const off = snapPoint({ x: 396, y: 296 }, opts(level, { ortho: true, from: { x: 100, y: 280 } }));
    expect(off.kind).not.toBe('node');
    expect(off.point.y).toBeCloseTo(280, 6);
  });

  it('the tolerance is in screen pixels: 2 cm at 4 px/cm', () => {
    const r = snapPoint({ x: 3, y: 0.5 + 500 }, opts(levelFromWalls([[0, 500, 0, 900]]), { pxPerCm: 4 }));
    expect(r.kind).not.toBe('node');
    const near = snapPoint({ x: 1, y: 501 }, opts(levelFromWalls([[0, 500, 0, 900]]), { pxPerCm: 4 }));
    expect(near.kind).toBe('node');
  });

  it('ignores excluded nodes and the walls attached to them', () => {
    const level = room();
    const corner = Object.values(level.nodes).find((n) => n.x === 0 && n.y === 0)!;
    const r = snapPoint({ x: 3, y: 4 }, opts(level, { excludeNodeIds: new Set([corner.id]) }));
    expect(r.kind).not.toBe('node');
    expect(r.kind).not.toBe('wallAxis');
    const top = findWall(level, 0, 0, 400, 0);
    const w = snapPoint({ x: 203, y: 4 }, opts(level, { excludeWallIds: new Set([top]) }));
    expect(w.kind).not.toBe('wallMid');
  });
});

describe('snapObjectToWalls', () => {
  const bed = (x: number, y: number) =>
    createObjectFromSize({ kind: 'catalog', catalogId: 'bed-double' }, x, y, { width: 140, depth: 190, height: 50 }, 'Lit', '#999');

  it('pulls an object whose back edge is within the tolerance against the inner face', () => {
    const level = room();
    // inner face of the top wall at y = 10; back edge at y = 15
    const r = snapObjectToWalls(bed(200, 110), level, 1);
    expect(r.x).toBeCloseTo(200, 6);
    expect(r.y).toBeCloseTo(105, 6);
    expect(r.rotation).toBeCloseTo(0, 6);
    expect(r.wallId).toBe(findWall(level, 0, 0, 400, 0));
  });

  it('leaves an object far from every face unchanged', () => {
    const o = { ...bed(200, 150), rotation: 30 };
    expect(snapObjectToWalls(o, room(), 1)).toEqual({ x: 200, y: 150, rotation: 30, wallId: null });
  });

  it('takes the orientation of the wall, back against the face', () => {
    const level = room();
    // right wall inner face at x = 390, object 100 deep, back edge 6 cm from the face
    const o = { ...createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 334, 150, { width: 80, depth: 100, height: 50 }, 'X', '#999'), rotation: 10 };
    const r = snapObjectToWalls(o, level, 1);
    expect(r.wallId).toBe(findWall(level, 400, 0, 400, 300));
    expect(r.x).toBeCloseTo(340, 6);
    expect(r.y).toBeCloseTo(150, 6);
    // local +y (front) must point to -x: rotate((0, 1), r) = (-sin r, cos r) = (-1, 0)
    expect(r.rotation).toBeCloseTo(90, 6);
  });

  it('snaps against an oblique wall and takes its angle', () => {
    // wall at 30 deg; its +normal side is perp(dir) = (-sin 30, cos 30)
    const end = { x: 400 * Math.cos(Math.PI / 6), y: 400 * Math.sin(Math.PI / 6) };
    const level = levelFromWalls([[0, 0, end.x, end.y]]);
    const n = { x: -Math.sin(Math.PI / 6), y: Math.cos(Math.PI / 6) };
    const mid = { x: end.x / 2, y: end.y / 2 };
    // face at 10 cm from the axis, object 100 deep, back edge 5 cm from the face
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, mid.x + n.x * 65, mid.y + n.y * 65, { width: 80, depth: 100, height: 50 }, 'X', '#999');
    const r = snapObjectToWalls(o, level, 1);
    expect(r.wallId).toBe(Object.keys(level.walls)[0]);
    close({ x: r.x, y: r.y }, mid.x + n.x * 60, mid.y + n.y * 60);
    // rotate((0, 1), 30 deg) = (-sin 30, cos 30) = n: the front faces away from the wall
    expect(r.rotation).toBeCloseTo(30, 6);
  });

  it('snaps against an exterior face, turned to face outwards', () => {
    const level = room();
    // outer face of the top wall at y = -10; object 100 deep, back edge 4 cm above it
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 200, -64, { width: 80, depth: 100, height: 50 }, 'X', '#999');
    const r = snapObjectToWalls(o, level, 1);
    expect(r.wallId).toBe(findWall(level, 0, 0, 400, 0));
    close({ x: r.x, y: r.y }, 200, -60);
    expect(r.rotation).toBeCloseTo(180, 6);
  });
});
