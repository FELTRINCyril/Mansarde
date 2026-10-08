import { describe, expect, it } from 'vitest';
import { addCupboard, deleteCupboards, moveCupboard, updateCupboard } from '@/core/commands/cupboards';
import { CUPBOARDS_DO_NOT_FIT, reconcileCupboards } from '@/core/commands/reconcile';
import { addWallChain, deleteWalls, joinNodeToWall, mergeNode, moveNodes, moveWalls, setWallLength, setWallThickness, splitWall } from '@/core/commands/walls';
import { cupboardFootprint } from '@/core/geometry/cupboards';
import { MAX_CUPBOARD_DOORS } from '@/core/model/defaults';
import { createCupboard, createOpening } from '@/core/model/factory';
import type { Cupboard, Id, Level, Project } from '@/core/model/types';
import { findWall, levelFromWalls, rectRoom } from './fixtures';
import { levelId, lvl, noop, projectFrom, refuse, run } from './helpers';

const NO_ROOM = 'Pas assez de place sur ce mur';
const TOO_SHORT = 'Le mur est trop court pour ses placards';

/** 400 x 300 room (axes); top wall (0,0)->(400,0) has the room on its left. */
function setup(): { p: Project; top: Id; right: Id } {
  const p = projectFrom(rectRoom(0, 0, 400, 300));
  return { p, top: findWall(lvl(p), 0, 0, 400, 0), right: findWall(lvl(p), 400, 0, 400, 300) };
}

function withCupboard(p: Project, wallId: Id, offset: number, overrides: Partial<Cupboard> = {}): { p: Project; id: Id; c: Cupboard } {
  const c = createCupboard(wallId, offset, 'left', overrides);
  return { p: run(p, addCupboard(levelId(p), c)), id: c.id, c };
}

const nodeAt = (level: Level, x: number, y: number): Id =>
  Object.values(level.nodes).find((n) => Math.hypot(n.x - x, n.y - y) < 1e-6)!.id;

describe('addCupboard', () => {
  it('adds a copy of a cupboard that fits, touching the wall ends included', () => {
    const { p, top } = setup();
    const { p: next, id, c } = withCupboard(p, top, 200);
    expect(lvl(next).cupboards[id]).toEqual(c);
    expect(lvl(next).cupboards[id]).not.toBe(c);
    withCupboard(p, top, 60); // [0, 120]
    withCupboard(p, top, 340); // [280, 400]
  });

  it('refuses a cupboard sticking out of its wall, an unknown wall or level', () => {
    const { p, top } = setup();
    expect(refuse(p, addCupboard(levelId(p), createCupboard(top, 30, 'left')))).toBe(NO_ROOM);
    expect(refuse(p, addCupboard(levelId(p), createCupboard(top, 390, 'left')))).toBe(NO_ROOM);
    expect(refuse(p, addCupboard(levelId(p), createCupboard(top, 200, 'left', { width: 401 })))).toBe(NO_ROOM);
    expect(refuse(p, addCupboard(levelId(p), createCupboard('ghost', 200, 'left')))).toBe('Mur introuvable');
    expect(refuse(p, addCupboard('nope', createCupboard(top, 200, 'left')))).toBe('Niveau introuvable');
  });

  it('refuses invalid numbers and enum values', () => {
    const { p, top } = setup();
    const add = (o: Partial<Cupboard>) => refuse(p, addCupboard(levelId(p), createCupboard(top, 200, 'left', o)));
    expect(add({ offset: NaN })).toBe('Position invalide');
    expect(add({ side: 'up' as 'left' })).toBe('Position invalide');
    for (const o of [{ width: 0 }, { depth: -1 }, { height: Infinity }, { plinth: -1 }, { gap: NaN }, { heightMode: 'x' as 'fixed' }, { doorType: 'x' as 'hinged' }]) {
      expect(add(o)).toBe('Dimension invalide');
    }
    for (const doorCount of [0, 1.5, MAX_CUPBOARD_DOORS + 1]) expect(add({ doorCount })).toBe('Nombre de portes invalide');
  });

  it('a very wide new cupboard gets at most MAX_CUPBOARD_DOORS doors and is accepted', () => {
    const p = projectFrom([[0, 0, 2000, 0]]);
    const wall = Object.keys(lvl(p).walls)[0]!;
    const { p: next, id } = withCupboard(p, wall, 1000, { width: 1500 });
    expect(lvl(next).cupboards[id]!.doorCount).toBe(MAX_CUPBOARD_DOORS);
  });
});

describe('moveCupboard', () => {
  it('moves along the wall, onto another wall and to the other face', () => {
    const { p: p0, top, right } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    expect(lvl(run(p, moveCupboard(levelId(p), id, top, 300))).cupboards[id]).toMatchObject({ wallId: top, offset: 300, side: 'left' });
    expect(lvl(run(p, moveCupboard(levelId(p), id, right, 100, 'right'))).cupboards[id]).toMatchObject({
      wallId: right,
      offset: 100,
      side: 'right',
    });
  });

  it('is a no-op when nothing changes, refuses what does not fit or does not exist', () => {
    const { p: p0, top } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    noop(p, moveCupboard(levelId(p), id, top, 200));
    noop(p, moveCupboard(levelId(p), id, top, 200, 'left'));
    expect(refuse(p, moveCupboard(levelId(p), id, top, 399))).toBe(NO_ROOM);
    expect(refuse(p, moveCupboard(levelId(p), id, 'ghost', 100))).toBe('Mur introuvable');
    expect(refuse(p, moveCupboard(levelId(p), 'ghost', top, 100))).toBe('Placard introuvable');
    expect(refuse(p, moveCupboard(levelId(p), id, top, NaN))).toBe('Position invalide');
  });
});

describe('updateCupboard', () => {
  it('changes size, mode, doors and colour', () => {
    const { p: p0, top } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    const patch = { width: 180, depth: 45, heightMode: 'ceiling', gap: 3, doorCount: 3, doorType: 'sliding', color: '#ffffff' } as const;
    expect(lvl(run(p, updateCupboard(levelId(p), id, patch))).cupboards[id]).toMatchObject(patch);
  });

  it('is a no-op when nothing changes, ignores id and wallId keys, refuses what does not fit', () => {
    const { p: p0, top, right } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    noop(p, updateCupboard(levelId(p), id, { width: 120, color: '#e8e1d4' }));
    noop(p, updateCupboard(levelId(p), id, { wallId: right, id: 'x' } as never));
    expect(refuse(p, updateCupboard(levelId(p), id, { width: 500 }))).toBe(NO_ROOM);
    expect(refuse(p, updateCupboard(levelId(p), id, { offset: 50 }))).toBe(NO_ROOM);
    expect(refuse(p, updateCupboard(levelId(p), id, { doorCount: 0 }))).toBe('Nombre de portes invalide');
    expect(refuse(p, updateCupboard(levelId(p), 'ghost', { width: 100 }))).toBe('Placard introuvable');
  });
});

describe('deleteCupboards', () => {
  it('deletes the cupboards, refuses unknown ids', () => {
    const { p: p0, top } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    expect(lvl(run(p, deleteCupboards(levelId(p), [id]))).cupboards).toEqual({});
    expect(refuse(p, deleteCupboards(levelId(p), ['ghost']))).toBe('Placard introuvable');
    noop(p, deleteCupboards(levelId(p), []));
  });
});

describe('cupboard follows, clamps or refuses with its wall', () => {
  it('follows: moving the wall keeps the offset; moving its start node keeps its place (V2-R12)', () => {
    const { p: p0, top } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    const moved = run(p, moveWalls(levelId(p), [top], { x: 0, y: -20 }));
    expect(lvl(moved).cupboards[id]!.offset).toBe(200);
    // back edge on the inner face of the moved wall: axis y = -20, half thickness 10
    expect(cupboardFootprint(lvl(moved), lvl(moved).cupboards[id]!)[0]).toEqual({ x: 140, y: -10 });

    // the wall grows at its start: the offset (from the start node) absorbs the 40 cm
    const startMoved = run(p, moveNodes(levelId(p), [{ nodeId: nodeAt(lvl(p), 0, 0), to: { x: -40, y: 0 } }]));
    expect(lvl(startMoved).cupboards[id]!.offset).toBe(240);
    expect(cupboardFootprint(lvl(startMoved), lvl(startMoved).cupboards[id]!)[0]).toEqual({ x: 140, y: 10 });
    // moving the end node changes nothing for it
    const endMoved = run(p, moveNodes(levelId(p), [{ nodeId: nodeAt(lvl(p), 400, 0), to: { x: 450, y: 0 } }]));
    expect(lvl(endMoved).cupboards[id]!.offset).toBe(200);
  });

  it('clamps: a shortened wall pulls the cupboard back inside', () => {
    const { p: p0, top } = setup();
    const { p, id } = withCupboard(p0, top, 300); // [240, 360]
    const next = run(p, setWallLength(levelId(p), top, 320, 'start'));
    expect(lvl(next).cupboards[id]!.offset).toBeCloseTo(260, 9);
    // a cupboard that still fits does not move
    const { p: p2, id: id2 } = withCupboard(p0, top, 100);
    expect(lvl(run(p2, setWallLength(levelId(p2), top, 320, 'start'))).cupboards[id2]!.offset).toBe(100);
  });

  it('refuses: a wall shorter than its cupboard', () => {
    const { p: p0, top } = setup();
    const { p } = withCupboard(p0, top, 200);
    expect(refuse(p, setWallLength(levelId(p), top, 100, 'start'))).toBe(TOO_SHORT);
    expect(TOO_SHORT).toBe(CUPBOARDS_DO_NOT_FIT);
  });

  it('clamps after mergeNode shortened the wall', () => {
    const p0 = projectFrom([
      [0, 0, 300, 0],
      [200, 50, 200, 100],
    ]);
    const wall = findWall(lvl(p0), 0, 0, 300, 0);
    const { p, id } = withCupboard(p0, wall, 240, { width: 100 });
    const next = run(p, mergeNode(levelId(p), nodeAt(lvl(p), 300, 0), nodeAt(lvl(p), 200, 50)));
    expect(lvl(next).cupboards[id]!.offset).toBeCloseTo(Math.hypot(200, 50) - 50, 9);
  });

  it('reconcileCupboards clamps in place and throws when a cupboard is wider than its wall', () => {
    const level = levelFromWalls([[0, 0, 300, 0]]);
    const wall = Object.keys(level.walls)[0]!;
    const c = createCupboard(wall, 280, 'left');
    level.cupboards[c.id] = c;
    reconcileCupboards(level);
    expect(c.offset).toBe(240);
    c.width = 301;
    expect(() => reconcileCupboards(level)).toThrow(TOO_SHORT);
  });
});

describe('setWallThickness', () => {
  it('the cupboard stays against the face of the thicker wall', () => {
    const { p: p0, top } = setup();
    const { p, id } = withCupboard(p0, top, 200);
    const next = run(p, setWallThickness(levelId(p), [top], 40));
    expect(lvl(next).cupboards[id]).toEqual(lvl(p).cupboards[id]);
    expect(cupboardFootprint(lvl(next), lvl(next).cupboards[id]!)[0]).toEqual({ x: 140, y: 20 });
  });
});

describe('deleteWalls removes cupboards', () => {
  it('deletes the cupboards of deleted walls only', () => {
    const { p: p0, top, right } = setup();
    const a = withCupboard(p0, top, 200);
    const b = withCupboard(a.p, right, 150);
    const next = run(b.p, deleteWalls(levelId(b.p), [top]));
    expect(lvl(next).cupboards[a.id]).toBeUndefined();
    expect(lvl(next).cupboards[b.id]).toBeDefined();
  });

  it('a wall removed by mergeNode takes its cupboard along', () => {
    const p0 = projectFrom([[0, 0, 300, 0]]);
    const wall = Object.keys(lvl(p0).walls)[0]!;
    const { p } = withCupboard(p0, wall, 150);
    const next = run(p, mergeNode(levelId(p), nodeAt(lvl(p), 0, 0), nodeAt(lvl(p), 300, 0)));
    expect(lvl(next).cupboards).toEqual({});
  });
});

describe('mergeNode hands the items of a duplicate wall over to the kept wall', () => {
  /** kept wall A, doomed wall B (0,0)->(300,50) whose end is merged onto A's (300, 0) end. */
  function twins(reversedA: boolean, setup: (level: Level, a: Id, b: Id) => void): { p: Project; a: Id; merge: () => Project } {
    const p = projectFrom([reversedA ? [300, 0, 0, 0] : [0, 0, 300, 0], [0, 0, 300, 50]], (l) => {
      setup(l, findWall(l, 0, 0, 300, 0), findWall(l, 0, 0, 300, 50));
    });
    const merge = () => run(p, mergeNode(levelId(p), nodeAt(lvl(p), 300, 50), nodeAt(lvl(p), 300, 0)));
    return { p, a: findWall(lvl(p), 0, 0, 300, 0), merge };
  }

  it('same direction: cupboard and door keep offset, face, hinge and swing', () => {
    let c = '';
    let d = '';
    const { a, merge } = twins(false, (l, _a, b) => {
      const cup = createCupboard(b, 150, 'left');
      l.cupboards[cup.id] = cup;
      c = cup.id;
      const door = createOpening(b, 'door', 60, { hinge: 'start', swing: 'left' });
      l.openings[door.id] = door;
      d = door.id;
    });
    const level = lvl(merge());
    expect(Object.keys(level.walls)).toEqual([a]);
    expect(level.cupboards[c]).toMatchObject({ wallId: a, offset: 150, side: 'left' });
    expect(level.openings[d]).toMatchObject({ wallId: a, offset: 60, hinge: 'start', swing: 'left' });
  });

  it('kept wall running the other way: offset, face, hinge and swing are mirrored', () => {
    let c = '';
    let d = '';
    const { a, merge } = twins(true, (l, _a, b) => {
      const cup = createCupboard(b, 100, 'left');
      l.cupboards[cup.id] = cup;
      c = cup.id;
      const door = createOpening(b, 'door', 250, { hinge: 'start', swing: 'left' });
      l.openings[door.id] = door;
      d = door.id;
    });
    const level = lvl(merge());
    expect(level.cupboards[c]).toMatchObject({ wallId: a, offset: 200, side: 'right' });
    expect(level.openings[d]).toMatchObject({ wallId: a, offset: 50, hinge: 'end', swing: 'right' });
  });

  it('items that do not fit or overlap a door of the kept wall are dropped', () => {
    let c = '';
    let d = '';
    const { merge } = twins(false, (l, a, b) => {
      const cup = createCupboard(b, 260, 'left', { width: 100 }); // [210, 310] on the 304 cm wall, 300 after
      l.cupboards[cup.id] = cup;
      c = cup.id;
      const keptDoor = createOpening(a, 'door', 100);
      l.openings[keptDoor.id] = keptDoor;
      const door = createOpening(b, 'door', 120);
      l.openings[door.id] = door;
      d = door.id;
    });
    const level = lvl(merge());
    expect(level.cupboards[c]).toBeUndefined();
    expect(level.openings[d]).toBeUndefined();
    expect(Object.keys(level.openings)).toHaveLength(1);
  });
});

describe('splitWall distributes cupboards', () => {
  const lone = (): { p: Project; wall: Id } => {
    const p = projectFrom([[0, 0, 300, 0]]);
    return { p, wall: Object.keys(lvl(p).walls)[0]! };
  };

  it('puts each cupboard on the piece containing it, with a recomputed offset', () => {
    const { p: p0, wall } = lone();
    const a = withCupboard(p0, wall, 60, { width: 100 }); // [10, 110]
    const b = withCupboard(a.p, wall, 240, { width: 100 }); // [190, 290]
    const level = lvl(run(b.p, splitWall(levelId(b.p), wall, 0.5)));
    const second = findWall(level, 150, 0, 300, 0);
    expect(level.cupboards[a.id]).toMatchObject({ wallId: wall, offset: 60 });
    expect(level.cupboards[b.id]!.wallId).toBe(second);
    expect(level.cupboards[b.id]!.offset).toBeCloseTo(90, 9);
  });

  it('refuses a split under a cupboard (V2-R8), whichever command splits', () => {
    const { p: p0, wall } = lone();
    const { p } = withCupboard(p0, wall, 150); // [90, 210]
    const STRADDLE = 'Un placard est à cheval sur la jonction';
    expect(refuse(p, splitWall(levelId(p), wall, 0.5))).toBe(STRADDLE);
    // a wall drawn onto the face behind the cupboard: T junction at x = 150
    const chain = addWallChain(levelId(p), [{ kind: 'free', x: 150, y: -100 }, { kind: 'onWall', wallId: wall, t: 0.5 }], 20, 250);
    expect(refuse(p, chain)).toBe(STRADDLE);
    // a lone wall whose node is dropped on the wall at x = 150
    const p2 = run(p, addWallChain(levelId(p), [{ kind: 'free', x: 150, y: -100 }, { kind: 'free', x: 150, y: -50 }], 20, 250));
    const join = joinNodeToWall(levelId(p2), nodeAt(lvl(p2), 150, -50), wall, 0.5, { nodeId: 'n-split', wallId: 'w-split' });
    expect(refuse(p2, join)).toBe(STRADDLE);
    // outside the cupboard the split goes through
    run(p2, joinNodeToWall(levelId(p2), nodeAt(lvl(p2), 150, -50), wall, 0.25, { nodeId: 'n-split', wallId: 'w-split' }));
  });
});
