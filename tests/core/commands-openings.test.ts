import { describe, expect, it } from 'vitest';
import { addOpening, deleteOpenings, moveOpening, updateOpening } from '@/core/commands/openings';
import { createOpening } from '@/core/model/factory';
import type { Id, Level, Project } from '@/core/model/types';
import { rectRoom } from './fixtures';
import { levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const NO_ROOM = 'Pas assez de place sur ce mur';

/** 400 x 300 room; returns the project with the top wall (length 400) and the right wall (length 300). */
function setup(): { p: Project; top: Id; right: Id } {
  const p = projectFrom(rectRoom(0, 0, 400, 300));
  const walls = Object.values(lvl(p).walls);
  const top = walls.find((w) => lvl(p).nodes[w.startNodeId]!.y === 0 && lvl(p).nodes[w.endNodeId]!.y === 0)!.id;
  const right = walls.find((w) => lvl(p).nodes[w.startNodeId]!.x === 400 && lvl(p).nodes[w.endNodeId]!.x === 400)!.id;
  return { p, top, right };
}

const withDoor = (p: Project, wallId: Id, offset: number, width = 80): { p: Project; id: Id } => {
  const o = createOpening(wallId, 'door', offset, { width });
  return { p: run(p, addOpening(levelId(p), o)), id: o.id };
};

describe('addOpening', () => {
  it('adds an opening that fits', () => {
    const { p, top } = setup();
    const o = createOpening(top, 'window', 200);
    const next = run(p, addOpening(levelId(p), o));
    expect(lvl(next).openings[o.id]).toEqual(o);
  });

  it('accepts an opening exactly touching the wall ends and a neighbour', () => {
    const { p, top } = setup();
    const a = withDoor(p, top, 40); // [0, 80]
    withDoor(a.p, top, 120); // [80, 160] touches, no overlap
  });

  it('refuses an opening that overlaps an existing one', () => {
    const { p, top } = setup();
    const { p: p2 } = withDoor(p, top, 200, 80);
    const err = refuse(p2, addOpening(levelId(p2), createOpening(top, 'door', 250, { width: 80 })));
    expect(err).toBe(NO_ROOM);
  });

  it('refuses an opening that sticks out of the wall or an unknown wall', () => {
    const { p, top } = setup();
    expect(refuse(p, addOpening(levelId(p), createOpening(top, 'door', 380)))).toBe(NO_ROOM);
    expect(refuse(p, addOpening(levelId(p), createOpening(top, 'door', 20)))).toBe(NO_ROOM);
    expect(refuse(p, addOpening(levelId(p), createOpening('nope', 'door', 200)))).toBe('Mur introuvable');
  });

  it('refuses invalid sizes and offsets', () => {
    const { p, top } = setup();
    expect(refuse(p, addOpening(levelId(p), createOpening(top, 'door', 200, { width: 0 })))).toBe('Dimension invalide');
    expect(refuse(p, addOpening(levelId(p), createOpening(top, 'door', 200, { height: NaN })))).toBe('Dimension invalide');
    expect(refuse(p, addOpening(levelId(p), createOpening(top, 'door', NaN)))).toBe('Position invalide');
  });

  it('refuses an unknown level', () => {
    const { p, top } = setup();
    expect(refuse(p, addOpening('nope', createOpening(top, 'door', 200)))).toBe('Niveau introuvable');
  });
});

describe('moveOpening', () => {
  it('moves along the wall', () => {
    const { p, top } = setup();
    const { p: p2, id } = withDoor(p, top, 100);
    const next = run(p2, moveOpening(levelId(p2), id, top, 300));
    expect(lvl(next).openings[id]).toMatchObject({ wallId: top, offset: 300 });
  });

  it('can change wall', () => {
    const { p, top, right } = setup();
    const { p: p2, id } = withDoor(p, top, 100);
    const next = run(p2, moveOpening(levelId(p2), id, right, 150));
    expect(lvl(next).openings[id]).toMatchObject({ wallId: right, offset: 150 });
  });

  it('refuses a move that overlaps, does not fit, or targets unknown things', () => {
    const { p, top, right } = setup();
    const a = withDoor(p, top, 100);
    const b = withDoor(a.p, right, 150);
    expect(refuse(b.p, moveOpening(levelId(b.p), b.id, top, 120))).toBe(NO_ROOM);
    expect(refuse(b.p, moveOpening(levelId(b.p), b.id, right, 280))).toBe(NO_ROOM);
    expect(refuse(b.p, moveOpening(levelId(b.p), 'nope', right, 100))).toBe('Ouverture introuvable');
    expect(refuse(b.p, moveOpening(levelId(b.p), b.id, 'nope', 100))).toBe('Mur introuvable');
  });

  it('does not collide with itself and is a no-op when nothing changes', () => {
    const { p, top } = setup();
    const { p: p2, id } = withDoor(p, top, 100);
    run(p2, moveOpening(levelId(p2), id, top, 110)); // overlaps its old self only
    noop(p2, moveOpening(levelId(p2), id, top, 100));
  });
});

describe('updateOpening', () => {
  it('changes the width when there is room, and other fields', () => {
    const { p, top } = setup();
    const { p: p2, id } = withDoor(p, top, 200, 80);
    const next = run(p2, updateOpening(levelId(p2), id, { width: 120, variant: 'double', swing: 'right' }));
    expect(lvl(next).openings[id]).toMatchObject({ width: 120, variant: 'double', swing: 'right', wallId: top });
  });

  it('refuses a width that overlaps a neighbour or exceeds the wall', () => {
    const { p, top } = setup();
    const a = withDoor(p, top, 100, 80);
    const b = withDoor(a.p, top, 200, 80);
    expect(refuse(b.p, updateOpening(levelId(b.p), b.id, { width: 300 }))).toBe(NO_ROOM);
    expect(refuse(b.p, updateOpening(levelId(b.p), b.id, { offset: 130 }))).toBe(NO_ROOM);
  });

  it('refuses non-positive or non-finite width and height', () => {
    const { p, top } = setup();
    const { p: p2, id } = withDoor(p, top, 200);
    for (const patch of [{ width: 0 }, { width: -5 }, { height: 0 }, { width: NaN }, { height: Infinity }]) {
      expect(refuse(p2, updateOpening(levelId(p2), id, patch))).toBe('Dimension invalide');
    }
    expect(refuse(p2, updateOpening(levelId(p2), id, { sillHeight: -1 }))).toBe('Dimension invalide');
  });

  it('is a no-op when the patch changes nothing', () => {
    const { p, top } = setup();
    const { p: p2, id } = withDoor(p, top, 200, 80);
    noop(p2, updateOpening(levelId(p2), id, { width: 80 }));
    noop(p2, updateOpening(levelId(p2), id, {}));
  });
});

describe('deleteOpenings', () => {
  it('deletes several openings', () => {
    const { p, top } = setup();
    const a = withDoor(p, top, 100);
    const b = withDoor(a.p, top, 300);
    const next = run(b.p, deleteOpenings(levelId(b.p), [a.id, b.id]));
    expect(Object.keys((lvl(next) as Level).openings)).toHaveLength(0);
  });

  it('refuses an unknown id without deleting anything, no-op on empty list', () => {
    const { p, top } = setup();
    const a = withDoor(p, top, 100);
    expect(refuse(a.p, deleteOpenings(levelId(a.p), [a.id, 'nope']))).toBe('Ouverture introuvable');
    noop(a.p, deleteOpenings(levelId(a.p), []));
  });
});
