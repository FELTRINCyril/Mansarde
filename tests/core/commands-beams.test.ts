import { describe, expect, it } from 'vitest';
import { addBeam, deleteBeams, moveBeams, updateBeam } from '@/core/commands/beams';
import { createBeam } from '@/core/model/factory';
import type { Beam, Project } from '@/core/model/types';
import { emptyProject, levelId, lvl, noop, refuse, run } from './helpers';

const withBeam = (p: Project = emptyProject(), b: Beam = createBeam({ x: 0, y: 100 }, { x: 400, y: 100 })) => ({
  p: run(p, addBeam(levelId(p), b)),
  id: b.id,
  beam: b,
});

describe('addBeam', () => {
  it('adds a copy of the beam', () => {
    const { p, id, beam } = withBeam();
    expect(lvl(p).beams[id]).toEqual(beam);
    expect(lvl(p).beams[id]).not.toBe(beam);
  });

  it('refuses a zero-length axis, non-positive sizes, bad points and modes', () => {
    const p = emptyProject();
    const a = { x: 0, y: 0 };
    const add = (b: Beam) => refuse(p, addBeam(levelId(p), b));
    expect(add(createBeam(a, { x: 0, y: 0 }))).toBe('Longueur invalide');
    expect(add(createBeam(a, { x: 0, y: Infinity }))).toBe('Position invalide');
    expect(add(createBeam(a, { x: 100, y: 0 }, { width: 0 }))).toBe('Dimension invalide');
    expect(add(createBeam(a, { x: 100, y: 0 }, { drop: -1 }))).toBe('Dimension invalide');
    expect(add(createBeam(a, { x: 100, y: 0 }, { drop: NaN }))).toBe('Dimension invalide');
    expect(add(createBeam(a, { x: 100, y: 0 }, { bottom: 0 }))).toBe('Hauteur invalide');
    expect(add(createBeam(a, { x: 100, y: 0 }, { mode: 'floating' as 'fixed' }))).toBe('Position invalide');
  });
});

describe('updateBeam', () => {
  it('switches to fixed mode with a bottom, changes width and drop', () => {
    const { p, id } = withBeam();
    const next = run(p, updateBeam(levelId(p), id, { mode: 'fixed', bottom: 210, width: 20, drop: 25 }));
    expect(lvl(next).beams[id]).toMatchObject({ mode: 'fixed', bottom: 210, width: 20, drop: 25 });
  });

  it('is a no-op when nothing changes, validates the result', () => {
    const { p, id } = withBeam();
    noop(p, updateBeam(levelId(p), id, { width: 12, b: { x: 400, y: 100 } }));
    expect(refuse(p, updateBeam(levelId(p), id, { width: 0 }))).toBe('Dimension invalide');
    expect(refuse(p, updateBeam(levelId(p), id, { a: { x: 400, y: 100 } }))).toBe('Longueur invalide');
    expect(refuse(p, updateBeam(levelId(p), 'ghost', { width: 10 }))).toBe('Poutre introuvable');
  });
});

describe('moveBeams', () => {
  it('translates both ends', () => {
    const { p, id } = withBeam();
    const next = run(p, moveBeams(levelId(p), [id], { x: 0, y: 50 }));
    expect(lvl(next).beams[id]).toMatchObject({ a: { x: 0, y: 150 }, b: { x: 400, y: 150 } });
  });

  it('is a no-op for a zero delta, refuses unknown ids and non-finite deltas', () => {
    const { p, id } = withBeam();
    noop(p, moveBeams(levelId(p), [id], { x: 0, y: 0 }));
    expect(refuse(p, moveBeams(levelId(p), ['ghost'], { x: 1, y: 0 }))).toBe('Poutre introuvable');
    expect(refuse(p, moveBeams(levelId(p), [id], { x: 1, y: NaN }))).toBe('Position invalide');
  });
});

describe('deleteBeams', () => {
  it('deletes the beams, refuses unknown ids', () => {
    const { p, id } = withBeam();
    expect(lvl(run(p, deleteBeams(levelId(p), [id]))).beams).toEqual({});
    expect(refuse(p, deleteBeams(levelId(p), ['ghost']))).toBe('Poutre introuvable');
  });
});
