import { describe, expect, it } from 'vitest';
import { addSlope, deleteSlopes, moveSlopes, updateSlope } from '@/core/commands/slopes';
import { createSlope } from '@/core/model/factory';
import type { Project, Slope } from '@/core/model/types';
import { rectRoom } from './fixtures';
import { emptyProject, levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const withSlope = (p: Project = projectFrom(rectRoom(0, 0, 400, 300)), s: Slope = createSlope({ x: 0, y: 0 }, { x: 400, y: 0 }, 'left', 200, 250, 150)) => ({
  p: run(p, addSlope(levelId(p), s)),
  id: s.id,
  slope: s,
});

describe('addSlope', () => {
  it('adds a copy of the slope', () => {
    const { p, id, slope } = withSlope();
    expect(lvl(p).slopes[id]).toEqual(slope);
    expect(lvl(p).slopes[id]).not.toBe(slope);
  });

  it('refuses a start line shorter than 1 cm, non-positive depth or heights, bad points and sides', () => {
    const p = emptyProject();
    const a = { x: 0, y: 0 };
    const add = (s: Slope) => refuse(p, addSlope(levelId(p), s));
    expect(add(createSlope(a, { x: 0.5, y: 0 }, 'left', 100, 250))).toBe('Longueur invalide');
    expect(add(createSlope(a, { x: NaN, y: 0 }, 'left', 100, 250))).toBe('Position invalide');
    expect(add(createSlope(a, { x: 100, y: 0 }, 'up' as 'left', 100, 250))).toBe('Position invalide');
    expect(add(createSlope(a, { x: 100, y: 0 }, 'left', 0, 250))).toBe('Dimension invalide');
    expect(add(createSlope(a, { x: 100, y: 0 }, 'left', Infinity, 250))).toBe('Dimension invalide');
    expect(add(createSlope(a, { x: 100, y: 0 }, 'left', 100, 0))).toBe('Hauteur invalide');
    expect(add(createSlope(a, { x: 100, y: 0 }, 'left', 100, 250, -1))).toBe('Hauteur invalide');
    expect(refuse(p, addSlope('nope', createSlope(a, { x: 100, y: 0 }, 'left', 100, 250)))).toBe('Niveau introuvable');
  });
});

describe('updateSlope', () => {
  it('changes heights, depth, side and the start line', () => {
    const { p, id } = withSlope();
    const next = run(p, updateSlope(levelId(p), id, { heightEnd: 120, depth: 150, side: 'right', b: { x: 300, y: 0 } }));
    expect(lvl(next).slopes[id]).toMatchObject({ heightEnd: 120, depth: 150, side: 'right', b: { x: 300, y: 0 }, heightStart: 250 });
  });

  it('is a no-op when nothing changes and ignores the id key', () => {
    const { p, id } = withSlope();
    noop(p, updateSlope(levelId(p), id, { heightEnd: 150, a: { x: 0, y: 0 } }));
    noop(p, updateSlope(levelId(p), id, { id: 'other' } as never));
  });

  it('validates the result', () => {
    const { p, id } = withSlope();
    expect(refuse(p, updateSlope(levelId(p), id, { depth: -5 }))).toBe('Dimension invalide');
    expect(refuse(p, updateSlope(levelId(p), id, { heightStart: NaN }))).toBe('Hauteur invalide');
    expect(refuse(p, updateSlope(levelId(p), id, { b: { x: 0, y: 0.2 } }))).toBe('Longueur invalide');
    expect(refuse(p, updateSlope(levelId(p), 'ghost', { depth: 10 }))).toBe('Pente introuvable');
  });
});

describe('moveSlopes', () => {
  it('translates the start line of each slope once', () => {
    const { p, id } = withSlope();
    const next = run(p, moveSlopes(levelId(p), [id, id], { x: 10, y: -5 }));
    expect(lvl(next).slopes[id]).toMatchObject({ a: { x: 10, y: -5 }, b: { x: 410, y: -5 }, depth: 200 });
  });

  it('is a no-op for a zero delta or no ids, refuses unknown ids and non-finite deltas', () => {
    const { p, id } = withSlope();
    noop(p, moveSlopes(levelId(p), [id], { x: 0, y: 0 }));
    noop(p, moveSlopes(levelId(p), [], { x: 5, y: 0 }));
    expect(refuse(p, moveSlopes(levelId(p), ['ghost'], { x: 5, y: 0 }))).toBe('Pente introuvable');
    expect(refuse(p, moveSlopes(levelId(p), [id], { x: NaN, y: 0 }))).toBe('Position invalide');
  });
});

describe('deleteSlopes', () => {
  it('deletes the slopes, refuses unknown ids', () => {
    const { p, id } = withSlope();
    const next = run(p, deleteSlopes(levelId(p), [id]));
    expect(lvl(next).slopes).toEqual({});
    expect(refuse(p, deleteSlopes(levelId(p), ['ghost']))).toBe('Pente introuvable');
    noop(p, deleteSlopes(levelId(p), []));
  });
});
