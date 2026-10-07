import { describe, expect, it } from 'vitest';
import { addDimension, deleteDimensions, setDimensionOffset } from '@/core/commands/dimensions';
import { addObject } from '@/core/commands/objects';
import { resolveAnchor } from '@/core/geometry/anchors';
import { createObjectFromSize } from '@/core/model/factory';
import type { Anchor, Id, Project } from '@/core/model/types';
import { rectRoom } from './fixtures';
import { levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const pt = (x: number, y: number): Anchor => ({ kind: 'point', x, y });

function withDim(p: Project, a: Anchor, b: Anchor, offset = 30): { p: Project; id: Id } {
  const out = { id: '' };
  return { p: run(p, addDimension(levelId(p), a, b, offset, out)), id: out.id };
}

describe('addDimension', () => {
  it('adds a dimension between a node and a point', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const nodeId = Object.keys(lvl(p).nodes)[0]!;
    const { p: next, id } = withDim(p, { kind: 'node', nodeId }, pt(500, 0), 25);
    expect(lvl(next).dimensions[id]).toMatchObject({ id, a: { kind: 'node', nodeId }, b: pt(500, 0), offset: 25 });
  });

  it('accepts object corner anchors', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'generic-rect' }, 200, 150, { width: 100, depth: 50, height: 80 }, 'B', '#ccc');
    const p2 = run(p, addObject(levelId(p), o));
    const a: Anchor = { kind: 'objectCorner', objectId: o.id, corner: 0 };
    const b: Anchor = { kind: 'objectCorner', objectId: o.id, corner: 2 };
    const { p: next, id } = withDim(p2, a, b);
    const d = lvl(next).dimensions[id]!;
    expect(resolveAnchor(lvl(next), d.a)).toEqual({ x: 150, y: 125 });
  });

  it('refuses points closer than 1 cm, accepts exactly 1 cm', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    expect(refuse(p, addDimension(levelId(p), pt(0, 0), pt(0.5, 0), 30))).toBe('Cote trop courte');
    expect(refuse(p, addDimension(levelId(p), pt(5, 5), pt(5, 5), 30))).toBe('Cote trop courte');
    withDim(p, pt(0, 0), pt(1, 0));
  });

  it('refuses missing anchors and non-finite values', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const lv = levelId(p);
    expect(refuse(p, addDimension(lv, { kind: 'node', nodeId: 'nope' }, pt(0, 0), 30))).toBe('Ancre introuvable');
    expect(refuse(p, addDimension(lv, pt(0, 0), { kind: 'objectCorner', objectId: 'nope', corner: 0 }, 30))).toBe('Ancre introuvable');
    expect(refuse(p, addDimension(lv, pt(0, 0), pt(100, 0), NaN))).toBe('Position invalide');
    expect(refuse(p, addDimension(lv, pt(0, 0), pt(NaN, 0), 30))).toBe('Position invalide');
  });
});

describe('setDimensionOffset', () => {
  it('changes the offset; no-op when equal; refuses unknown id and NaN', () => {
    const base = projectFrom(rectRoom(0, 0, 400, 300));
    const { p, id } = withDim(base, pt(0, 0), pt(100, 0), 30);
    const next = run(p, setDimensionOffset(levelId(p), id, -40));
    expect(lvl(next).dimensions[id]!.offset).toBe(-40);
    noop(p, setDimensionOffset(levelId(p), id, 30));
    expect(refuse(p, setDimensionOffset(levelId(p), 'nope', 1))).toBe('Cote introuvable');
    expect(refuse(p, setDimensionOffset(levelId(p), id, NaN))).toBe('Position invalide');
  });
});

describe('deleteDimensions', () => {
  it('deletes the dimensions', () => {
    const base = projectFrom(rectRoom(0, 0, 400, 300));
    const a = withDim(base, pt(0, 0), pt(100, 0));
    const b = withDim(a.p, pt(0, 0), pt(0, 100));
    const next = run(b.p, deleteDimensions(levelId(b.p), [a.id]));
    expect(Object.keys(lvl(next).dimensions)).toEqual([b.id]);
  });

  it('refuses an unknown id; no-op on empty list', () => {
    const base = projectFrom(rectRoom(0, 0, 400, 300));
    const a = withDim(base, pt(0, 0), pt(100, 0));
    expect(refuse(a.p, deleteDimensions(levelId(a.p), [a.id, 'nope']))).toBe('Cote introuvable');
    noop(a.p, deleteDimensions(levelId(a.p), []));
  });
});
