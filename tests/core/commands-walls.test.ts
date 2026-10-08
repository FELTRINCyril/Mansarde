import { describe, expect, it } from 'vitest';
import { applyCommand } from '@/core/commands/apply';
import { reconcileOpenings } from '@/core/commands/reconcile';
import {
  addRectRoom,
  addWallChain,
  deleteWalls,
  joinNodeToWall,
  mergeNode,
  moveNodes,
  moveWalls,
  setWallHeight,
  setWallLength,
  setWallThickness,
  splitWall,
  type WallPoint,
} from '@/core/commands/walls';
import { computeRooms } from '@/core/geometry/rooms';
import { wallLength } from '@/core/geometry/walls';
import { createOpening } from '@/core/model/factory';
import type { Id, Level, ManualDimension, Project } from '@/core/model/types';
import { levelFromWalls, rectRoom } from './fixtures';
import { emptyProject, levelId, lvl, projectFrom, refuse, run } from './helpers';

function nodeAt(level: Level, x: number, y: number): Id {
  const n = Object.values(level.nodes).find((n) => Math.hypot(n.x - x, n.y - y) < 1e-6);
  if (!n) throw new Error(`no node at ${x},${y}`);
  return n.id;
}

function wallBetween(level: Level, a: [number, number], b: [number, number]): Id {
  const na = nodeAt(level, ...a);
  const nb = nodeAt(level, ...b);
  const w = Object.values(level.walls).find(
    (w) => (w.startNodeId === na && w.endNodeId === nb) || (w.startNodeId === nb && w.endNodeId === na),
  );
  if (!w) throw new Error(`no wall between ${a} and ${b}`);
  return w.id;
}

const incident = (level: Level, nodeId: Id): number =>
  Object.values(level.walls).filter((w) => w.startNodeId === nodeId || w.endNodeId === nodeId).length;

const free = (x: number, y: number): WallPoint => ({ kind: 'free', x, y });

function addDoor(level: Level, wallId: Id, offset: number, width = 83): Id {
  const o = createOpening(wallId, 'door', offset, { width });
  level.openings[o.id] = o;
  return o.id;
}

function addDim(level: Level, a: Id, b: Id): Id {
  const d: ManualDimension = { id: `dim-${a}-${b}`, a: { kind: 'node', nodeId: a }, b: { kind: 'node', nodeId: b }, offset: 30 };
  level.dimensions[d.id] = d;
  return d.id;
}

describe('addWallChain', () => {
  it('creates 2 walls and 3 nodes from 3 free points', () => {
    const p = emptyProject();
    const out = { wallIds: [] as Id[] };
    const next = run(p, addWallChain(levelId(p), [free(0, 0), free(400, 0), free(400, 300)], 20, 250, out));
    const level = lvl(next);
    expect(Object.keys(level.walls)).toHaveLength(2);
    expect(Object.keys(level.nodes)).toHaveLength(3);
    expect(out.wallIds).toHaveLength(2);
    const [w0, w1] = out.wallIds.map((id) => level.walls[id]!);
    expect(w0).toMatchObject({ thickness: 20, height: 250 });
    expect(w1).toMatchObject({ thickness: 20, height: 250 });
    expect(level.nodes[w0!.startNodeId]).toMatchObject({ x: 0, y: 0 });
    expect(w0!.endNodeId).toBe(w1!.startNodeId);
    expect(level.nodes[w0!.endNodeId]).toMatchObject({ x: 400, y: 0 });
    expect(level.nodes[w1!.endNodeId]).toMatchObject({ x: 400, y: 300 });
  });

  it('closes a square on the first point without duplicating it: 4 walls, 4 nodes, 1 room', () => {
    const p = emptyProject();
    const pts = [free(0, 0), free(400, 0), free(400, 300), free(0, 300), free(0, 0)];
    const level = lvl(run(p, addWallChain(levelId(p), pts, 20, 250)));
    expect(Object.keys(level.walls)).toHaveLength(4);
    expect(Object.keys(level.nodes)).toHaveLength(4);
    expect(computeRooms(level)).toHaveLength(1);
  });

  it('closes a loop with a node point equal to the first node', () => {
    // stub wall going left from A = (0, 0); the chain starts and ends on A
    const p = projectFrom([[0, 0, -100, 0]]);
    const a = nodeAt(lvl(p), 0, 0);
    const pts: WallPoint[] = [{ kind: 'node', nodeId: a }, free(400, 0), free(400, 300), free(0, 300), { kind: 'node', nodeId: a }];
    const out = { wallIds: [] as Id[] };
    const level = lvl(run(p, addWallChain(levelId(p), pts, 20, 250, out)));
    expect(out.wallIds).toHaveLength(4);
    expect(Object.keys(level.walls)).toHaveLength(5);
    expect(Object.keys(level.nodes)).toHaveLength(5); // A, stub end, 3 new corners
    expect(incident(level, a)).toBe(3);
    expect(computeRooms(level)).toHaveLength(1);
  });

  it('splits a wall at an onWall point: T junction with 3 walls on the shared node', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    const level = lvl(run(p, addWallChain(levelId(p), [{ kind: 'onWall', wallId: w, t: 0.5 }, free(200, 300)], 20, 250)));
    expect(Object.keys(level.walls)).toHaveLength(3);
    expect(Object.keys(level.nodes)).toHaveLength(4);
    const mid = nodeAt(level, 200, 0);
    expect(incident(level, mid)).toBe(3);
    expect(wallLength(level, wallBetween(level, [0, 0], [200, 0]))).toBeCloseTo(200, 9);
    expect(wallLength(level, wallBetween(level, [200, 0], [400, 0]))).toBeCloseTo(200, 9);
  });

  it('handles two onWall points on the same wall in one chain', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    const pts: WallPoint[] = [
      { kind: 'onWall', wallId: w, t: 0.25 },
      free(100, 200),
      free(300, 200),
      { kind: 'onWall', wallId: w, t: 0.75 },
    ];
    const level = lvl(run(p, addWallChain(levelId(p), pts, 20, 250)));
    expect(Object.keys(level.walls)).toHaveLength(6);
    expect(incident(level, nodeAt(level, 100, 0))).toBe(3);
    expect(incident(level, nodeAt(level, 300, 0))).toBe(3);
    expect(computeRooms(level)).toHaveLength(1);
  });

  it('splits a wall drawn earlier in the same chain when a free point lands on it (R11)', () => {
    const p = emptyProject();
    const pts = [free(0, 0), free(400, 0), free(400, 300), free(200, 300), free(200, 0)];
    const out = { wallIds: [] as Id[] };
    const level = lvl(run(p, addWallChain(levelId(p), pts, 20, 250, out)));
    expect(Object.keys(level.walls)).toHaveLength(5);
    expect(Object.keys(level.nodes)).toHaveLength(5);
    const mid = nodeAt(level, 200, 0);
    expect(incident(level, mid)).toBe(3);
    // the first wall keeps its id as the start piece, the end piece is a new wall
    const first = out.wallIds[0]!;
    expect(wallBetween(level, [0, 0], [200, 0])).toBe(first);
    expect(wallLength(level, wallBetween(level, [200, 0], [400, 0]))).toBeCloseTo(200, 9);
    expect(computeRooms(level)).toHaveLength(1);
  });

  it('a free point on an existing wall axis splits it (R11)', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const level = lvl(run(p, addWallChain(levelId(p), [free(150, 0), free(150, 200)], 20, 250)));
    expect(Object.keys(level.walls)).toHaveLength(3);
    expect(incident(level, nodeAt(level, 150, 0))).toBe(3);
  });

  it('a free point then an onWall point at the same place share one node (M1)', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    const pts: WallPoint[] = [free(100, 0), free(100, 200), free(300, 200), free(300, 100), { kind: 'onWall', wallId: w, t: 0.25 }];
    const level = lvl(run(p, addWallChain(levelId(p), pts, 20, 250)));
    expect(Object.values(level.nodes).filter((n) => Math.hypot(n.x - 100, n.y) < 1e-6)).toHaveLength(1);
    expect(incident(level, nodeAt(level, 100, 0))).toBe(4);
    expect(Object.keys(level.walls)).toHaveLength(6);
  });

  it('is a no-op without touch when every segment duplicates an existing wall (M2)', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const pts: WallPoint[] = [{ kind: 'node', nodeId: nodeAt(lvl(p), 400, 0) }, free(0, 0)];
    const out = { wallIds: ['stale'] };
    const r = applyCommand(p, addWallChain(levelId(p), pts, 20, 250, out));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patches).toEqual([]);
    expect(r.project).toBe(p);
    expect(out.wallIds).toEqual([]);
  });

  it('reuses an existing node for a free point closer than 0.5 cm', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const b = nodeAt(lvl(p), 400, 0);
    const level = lvl(run(p, addWallChain(levelId(p), [free(400.3, 0), free(400, 300)], 20, 250)));
    expect(Object.keys(level.nodes)).toHaveLength(3);
    expect(level.nodes[b]).toEqual({ id: b, x: 400, y: 0 });
    expect(incident(level, b)).toBe(2);
  });

  it('refuses a zero-length segment', () => {
    const p = emptyProject();
    expect(refuse(p, addWallChain(levelId(p), [free(0, 0), free(0, 0)], 20, 250))).toBe('Mur trop court');
    expect(refuse(p, addWallChain(levelId(p), [free(0, 0), free(100, 0), free(100, 0.2)], 20, 250))).toBe(
      'Mur trop court',
    );
  });

  it('skips a segment duplicating an existing wall', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const a = nodeAt(lvl(p), 0, 0);
    const b = nodeAt(lvl(p), 400, 0);
    const out = { wallIds: [] as Id[] };
    const pts: WallPoint[] = [{ kind: 'node', nodeId: b }, { kind: 'node', nodeId: a }, free(0, 300)];
    const level = lvl(run(p, addWallChain(levelId(p), pts, 20, 250, out)));
    expect(Object.keys(level.walls)).toHaveLength(2);
    expect(out.wallIds).toHaveLength(1);
  });

  it('refuses fewer than 2 points, unknown nodes and invalid sizes', () => {
    const p = emptyProject();
    const id = levelId(p);
    expect(refuse(p, addWallChain(id, [free(0, 0)], 20, 250))).toBe('Il faut au moins deux points');
    expect(refuse(p, addWallChain(id, [], 20, 250))).toBe('Il faut au moins deux points');
    expect(refuse(p, addWallChain(id, [{ kind: 'node', nodeId: 'ghost' }, free(0, 100)], 20, 250))).toBe(
      'Nœud introuvable',
    );
    expect(refuse(p, addWallChain(id, [free(0, 0), free(0, 100)], 0, 250))).toBe('Épaisseur invalide');
    expect(refuse(p, addWallChain(id, [free(0, 0), free(0, 100)], 20, Number.NaN))).toBe('Hauteur invalide');
    expect(refuse(p, addWallChain(id, [free(0, 0), free(Number.NaN, 100)], 20, 250))).toBe('Position invalide');
    expect(refuse(p, addWallChain('nope', [free(0, 0), free(0, 100)], 20, 250))).toBe('Niveau introuvable');
  });
});

describe('addRectRoom', () => {
  it('creates 4 walls forming one room of 380 x 280', () => {
    const p = emptyProject();
    const level = lvl(run(p, addRectRoom(levelId(p), { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250)));
    expect(Object.keys(level.walls)).toHaveLength(4);
    expect(Object.keys(level.nodes)).toHaveLength(4);
    const rooms = computeRooms(level);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(380 * 280, 3);
  });

  it('accepts corners in any order', () => {
    const p = emptyProject();
    const level = lvl(run(p, addRectRoom(levelId(p), { x: 400, y: 300 }, { x: 0, y: 0 }, 20, 250)));
    expect(computeRooms(level)[0]!.area).toBeCloseTo(380 * 280, 3);
  });

  it('splits an existing wall at both corners lying on its axis, without a duplicate side (R11)', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const original = Object.keys(lvl(p).walls)[0]!;
    const level = lvl(run(p, addRectRoom(levelId(p), { x: 100, y: 0 }, { x: 200, y: 60 }, 20, 250)));
    // 400 cm wall in 3 pieces + 3 new sides; the shared side is the existing middle piece
    expect(Object.keys(level.walls)).toHaveLength(6);
    expect(Object.keys(level.nodes)).toHaveLength(6);
    expect(wallBetween(level, [0, 0], [100, 0])).toBe(original);
    expect(wallLength(level, wallBetween(level, [100, 0], [200, 0]))).toBeCloseTo(100, 9);
    expect(wallLength(level, wallBetween(level, [200, 0], [400, 0]))).toBeCloseTo(200, 9);
    expect(incident(level, nodeAt(level, 100, 0))).toBe(3);
    expect(incident(level, nodeAt(level, 200, 0))).toBe(3);
    const rooms = computeRooms(level);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(80 * 40, 3);
  });

  it('refuses a degenerate rectangle', () => {
    const p = emptyProject();
    expect(refuse(p, addRectRoom(levelId(p), { x: 0, y: 0 }, { x: 400, y: 0.5 }, 20, 250))).toBe('Pièce trop petite');
    expect(refuse(p, addRectRoom(levelId(p), { x: 0, y: 0 }, { x: 0, y: 300 }, 20, 250))).toBe('Pièce trop petite');
  });
});

describe('splitWall', () => {
  it('moves a door to the second piece with a recomputed offset', () => {
    let door = '';
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      door = addDoor(l, Object.keys(l.walls)[0]!, 250);
    });
    const w = Object.keys(lvl(p).walls)[0]!;
    const out = { nodeId: '' };
    const level = lvl(run(p, splitWall(levelId(p), w, 0.5, out)));
    expect(level.nodes[out.nodeId]).toMatchObject({ x: 150, y: 0 });
    expect(Object.keys(level.walls)).toHaveLength(2);
    // the original wall keeps its id and becomes the start piece
    expect(level.walls[w]).toMatchObject({ startNodeId: lvl(p).walls[w]!.startNodeId, endNodeId: out.nodeId });
    const second = wallBetween(level, [150, 0], [300, 0]);
    expect(level.walls[second]).toMatchObject({ startNodeId: out.nodeId, endNodeId: lvl(p).walls[w]!.endNodeId });
    expect(level.openings[door]!.wallId).toBe(second);
    expect(level.openings[door]!.offset).toBeCloseTo(100, 9);
    for (const wall of Object.values(level.walls)) expect(wall).toMatchObject({ thickness: 20, height: 250 });
  });

  it('keeps a door on the first piece at the same offset', () => {
    let door = '';
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      door = addDoor(l, Object.keys(l.walls)[0]!, 60);
    });
    const level = lvl(run(p, splitWall(levelId(p), Object.keys(lvl(p).walls)[0]!, 0.5)));
    expect(level.openings[door]!.wallId).toBe(wallBetween(level, [0, 0], [150, 0]));
    expect(level.openings[door]!.offset).toBe(60);
  });

  it('refuses when an opening straddles the junction', () => {
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      addDoor(l, Object.keys(l.walls)[0]!, 150, 83);
    });
    expect(refuse(p, splitWall(levelId(p), Object.keys(lvl(p).walls)[0]!, 0.5))).toBe(
      'Une ouverture est à cheval sur la jonction',
    );
  });

  it('leaves manual dimensions anchored to nodes untouched', () => {
    let dim = '';
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      dim = addDim(l, nodeAt(l, 0, 0), nodeAt(l, 300, 0));
    });
    const level = lvl(run(p, splitWall(levelId(p), Object.keys(lvl(p).walls)[0]!, 0.5)));
    expect(level.dimensions[dim]).toEqual(lvl(p).dimensions[dim]);
  });

  it('refuses t outside ]0, 1[ and pieces shorter than the minimum', () => {
    const p = projectFrom([[0, 0, 300, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    expect(refuse(p, splitWall(levelId(p), w, 0))).toBe('Position invalide');
    expect(refuse(p, splitWall(levelId(p), w, 1))).toBe('Position invalide');
    expect(refuse(p, splitWall(levelId(p), w, Number.NaN))).toBe('Position invalide');
    expect(refuse(p, splitWall(levelId(p), w, 0.001))).toBe('Mur trop court');
    expect(refuse(p, splitWall(levelId(p), 'ghost', 0.5))).toBe('Mur introuvable');
  });
});

describe('moveNodes', () => {
  it('moves both walls sharing the node', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const c = nodeAt(lvl(p), 400, 0);
    const level = lvl(run(p, moveNodes(levelId(p), [{ nodeId: c, to: { x: 500, y: 0 } }])));
    expect(level.nodes[c]).toMatchObject({ x: 500, y: 0 });
    expect(wallLength(level, wallBetween(level, [0, 0], [500, 0]))).toBeCloseTo(500, 9);
    expect(wallLength(level, wallBetween(level, [500, 0], [400, 300]))).toBeCloseTo(Math.hypot(100, 300), 9);
  });

  function doorWall(): { p: Project; door: Id; end: Id } {
    let door = '';
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      door = addDoor(l, Object.keys(l.walls)[0]!, 100, 83);
    });
    return { p, door, end: nodeAt(lvl(p), 300, 0) };
  }

  it('keeps the door offset while it fits', () => {
    const { p, door, end } = doorWall();
    const level = lvl(run(p, moveNodes(levelId(p), [{ nodeId: end, to: { x: 150, y: 0 } }])));
    expect(level.openings[door]!.offset).toBe(100);
  });

  it('pulls the door back when the wall shrinks under it', () => {
    const { p, door, end } = doorWall();
    const level = lvl(run(p, moveNodes(levelId(p), [{ nodeId: end, to: { x: 120, y: 0 } }])));
    expect(level.openings[door]!.offset).toBeCloseTo(120 - 41.5, 9);
  });

  it('refuses when the wall becomes shorter than the door', () => {
    const { p, end } = doorWall();
    expect(refuse(p, moveNodes(levelId(p), [{ nodeId: end, to: { x: 80, y: 0 } }]))).toBe(
      'Le mur est trop court pour ses ouvertures',
    );
  });

  it('refuses a wall shorter than the minimum, an unknown node or a non-finite target', () => {
    const { p, end } = doorWall();
    const start = nodeAt(lvl(p), 0, 0);
    expect(refuse(p, moveNodes(levelId(p), [{ nodeId: start, to: { x: 300, y: 0.3 } }]))).toBe('Mur trop court');
    expect(refuse(p, moveNodes(levelId(p), [{ nodeId: 'ghost', to: { x: 0, y: 0 } }]))).toBe('Nœud introuvable');
    expect(refuse(p, moveNodes(levelId(p), [{ nodeId: end, to: { x: Number.NaN, y: 0 } }]))).toBe(
      'Position invalide',
    );
  });

  it('resolves overlaps between openings by keeping their order', () => {
    let door = '';
    let window = '';
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      const w = Object.keys(l.walls)[0]!;
      door = addDoor(l, w, 60, 83); // [18.5, 101.5]
      const win = createOpening(w, 'window', 200); // width 120: [140, 260]
      l.openings[win.id] = win;
      window = win.id;
    });
    const end = nodeAt(lvl(p), 300, 0);
    const level = lvl(run(p, moveNodes(levelId(p), [{ nodeId: end, to: { x: 210, y: 0 } }])));
    expect(level.openings[window]!.offset).toBeCloseTo(150, 9); // [90, 210]
    expect(level.openings[door]!.offset).toBeCloseTo(48.5, 9); // [7, 90]
    expect(refuse(p, moveNodes(levelId(p), [{ nodeId: end, to: { x: 200, y: 0 } }]))).toBe(
      'Le mur est trop court pour ses ouvertures',
    );
  });
});

describe('reconcileOpenings', () => {
  it('pushes a later overlapping opening forward and leaves fitting ones alone', () => {
    const level = levelFromWalls([[0, 0, 400, 0]]);
    const w = Object.keys(level.walls)[0]!;
    const a = addDoor(level, w, 100, 83); // [58.5, 141.5]
    const b = createOpening(w, 'window', 120); // [60, 180]
    level.openings[b.id] = b;
    reconcileOpenings(level);
    expect(level.openings[a]!.offset).toBe(100);
    expect(level.openings[b.id]!.offset).toBeCloseTo(141.5 + 60, 9);
  });
});

describe('moveWalls', () => {
  it('moves the nodes of the walls once and stretches the neighbours', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const top = wallBetween(lvl(p), [0, 0], [400, 0]);
    const right = wallBetween(lvl(p), [400, 0], [400, 300]);
    const level = lvl(run(p, moveWalls(levelId(p), [top, right], { x: 50, y: -50 })));
    expect(level.nodes[nodeAt(lvl(p), 0, 0)]).toMatchObject({ x: 50, y: -50 });
    expect(level.nodes[nodeAt(lvl(p), 400, 0)]).toMatchObject({ x: 450, y: -50 });
    expect(level.nodes[nodeAt(lvl(p), 400, 300)]).toMatchObject({ x: 450, y: 250 });
    expect(level.nodes[nodeAt(lvl(p), 0, 300)]).toMatchObject({ x: 0, y: 300 });
  });

  it('refuses a non-finite delta and unknown walls', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const top = wallBetween(lvl(p), [0, 0], [400, 0]);
    expect(refuse(p, moveWalls(levelId(p), [top], { x: Number.POSITIVE_INFINITY, y: 0 }))).toBe('Position invalide');
    expect(refuse(p, moveWalls(levelId(p), ['ghost'], { x: 1, y: 0 }))).toBe('Mur introuvable');
  });
});

describe('mergeNode', () => {
  it('merging the free end of a wall onto an existing node closes a room', () => {
    const p = projectFrom([
      [0, 0, 400, 0],
      [400, 0, 400, 300],
      [400, 300, 0, 300],
      [0, 300, 0, 60],
    ]);
    expect(computeRooms(lvl(p))).toHaveLength(0);
    const level = lvl(run(p, mergeNode(levelId(p), nodeAt(lvl(p), 0, 60), nodeAt(lvl(p), 0, 0))));
    expect(Object.keys(level.walls)).toHaveLength(4);
    expect(Object.keys(level.nodes)).toHaveLength(4);
    expect(computeRooms(level)).toHaveLength(1);
  });

  it('merging both ends of the same wall deletes that wall and its openings', () => {
    let door = '';
    const p = projectFrom([[0, 0, 400, 0], [400, 0, 400, 300]], (l) => {
      door = addDoor(l, Object.keys(l.walls)[0]!, 200);
    });
    const first = wallBetween(lvl(p), [0, 0], [400, 0]);
    const level = lvl(run(p, mergeNode(levelId(p), nodeAt(lvl(p), 400, 0), nodeAt(lvl(p), 0, 0))));
    expect(level.walls[first]).toBeUndefined();
    expect(level.openings[door]).toBeUndefined();
    expect(Object.keys(level.walls)).toHaveLength(1);
    expect(Object.keys(level.nodes)).toHaveLength(2);
  });

  it('a lone wall merged onto itself disappears with its nodes', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const level = lvl(run(p, mergeNode(levelId(p), nodeAt(lvl(p), 400, 0), nodeAt(lvl(p), 0, 0))));
    expect(Object.keys(level.walls)).toHaveLength(0);
    expect(Object.keys(level.nodes)).toHaveLength(0);
  });

  it('deletes a wall that becomes a duplicate, keeps the pre-existing one and rewires dimensions (R10)', () => {
    let dim = '';
    let keptDoor = '';
    let goneDoor = '';
    const p = projectFrom([[0, 0, 200, 300], [400, 0, 200, 300]], (l) => {
      dim = addDim(l, nodeAt(l, 400, 0), nodeAt(l, 200, 300));
      keptDoor = addDoor(l, wallBetween(l, [0, 0], [200, 300]), 100);
      goneDoor = addDoor(l, wallBetween(l, [400, 0], [200, 300]), 100);
    });
    const a = nodeAt(lvl(p), 0, 0);
    const existing = wallBetween(lvl(p), [0, 0], [200, 300]);
    const level = lvl(run(p, mergeNode(levelId(p), nodeAt(lvl(p), 400, 0), a)));
    expect(Object.keys(level.walls)).toEqual([existing]);
    expect(level.walls[existing]).toEqual(lvl(p).walls[existing]);
    expect(level.openings[keptDoor]).toEqual(lvl(p).openings[keptDoor]);
    expect(level.openings[goneDoor]).toBeUndefined();
    expect(Object.keys(level.nodes)).toHaveLength(2);
    expect(level.dimensions[dim]!.a).toEqual({ kind: 'node', nodeId: a });
  });

  it('deletes a dimension whose both anchors end on the target node (R10)', () => {
    let dim = '';
    let other = '';
    const p = projectFrom([[0, 0, 400, 0], [400, 0, 400, 300], [400, 300, 0, 300], [0, 300, 0, 60]], (l) => {
      dim = addDim(l, nodeAt(l, 0, 60), nodeAt(l, 0, 0));
      other = addDim(l, nodeAt(l, 0, 60), nodeAt(l, 400, 300));
    });
    const a = nodeAt(lvl(p), 0, 0);
    const level = lvl(run(p, mergeNode(levelId(p), nodeAt(lvl(p), 0, 60), a)));
    expect(level.dimensions[dim]).toBeUndefined();
    expect(level.dimensions[other]!.a).toEqual({ kind: 'node', nodeId: a });
  });

  it('refuses unknown or identical nodes', () => {
    const p = projectFrom([[0, 0, 400, 0]]);
    const a = nodeAt(lvl(p), 0, 0);
    expect(refuse(p, mergeNode(levelId(p), 'ghost', a))).toBe('Nœud introuvable');
    expect(refuse(p, mergeNode(levelId(p), a, a))).toBe('Impossible de fusionner un nœud avec lui-même');
  });
});

describe('joinNodeToWall (R30)', () => {
  it('splits the wall at t with the given ids and moves the node there (T junction)', () => {
    let door = '';
    // wall A along y = 0, wall B hanging from (150, 200) up to (150, 40)
    const p = projectFrom([[0, 0, 400, 0], [150, 200, 150, 40]], (l) => {
      door = addDoor(l, wallBetween(l, [0, 0], [400, 0]), 300);
    });
    const wall = wallBetween(lvl(p), [0, 0], [400, 0]);
    const free = nodeAt(lvl(p), 150, 40);
    const ids = { nodeId: 'split-node', wallId: 'split-wall' };
    const level = lvl(run(p, joinNodeToWall(levelId(p), free, wall, 150 / 400, ids)));
    // the dragged node was merged into the split node
    expect(level.nodes[free]).toBeUndefined();
    expect(level.nodes['split-node']).toEqual({ id: 'split-node', x: 150, y: 0 });
    expect(level.walls[wall]).toMatchObject({ endNodeId: 'split-node' });
    expect(level.walls['split-wall']).toMatchObject({ startNodeId: 'split-node', endNodeId: nodeAt(level, 400, 0) });
    expect(incident(level, 'split-node')).toBe(3);
    expect(wallBetween(level, [150, 200], [150, 0])).toBeDefined();
    // the door beyond the split point follows the second piece
    expect(level.openings[door]).toMatchObject({ wallId: 'split-wall', offset: 150 });
    expect(Object.keys(level.nodes)).toHaveLength(4);
  });

  it('is deterministic: the same recipe gives the same project twice', () => {
    const p = projectFrom([[0, 0, 400, 0], [150, 200, 150, 40]]);
    const recipe = joinNodeToWall(levelId(p), nodeAt(lvl(p), 150, 40), wallBetween(lvl(p), [0, 0], [400, 0]), 0.375, { nodeId: 'n', wallId: 'w' });
    const a = applyCommand(p, recipe);
    const b = applyCommand(p, recipe);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(lvl(b.project)).toEqual(lvl(a.project));
  });

  it('refuses a wall attached to the node, a missing node and a split too close to an end', () => {
    const p = projectFrom([[0, 0, 400, 0], [150, 200, 150, 40]]);
    const wall = wallBetween(lvl(p), [0, 0], [400, 0]);
    const ids = { nodeId: 'n', wallId: 'w' };
    expect(refuse(p, joinNodeToWall(levelId(p), nodeAt(lvl(p), 400, 0), wall, 0.5, ids))).toBe('Position invalide');
    expect(refuse(p, joinNodeToWall(levelId(p), 'ghost', wall, 0.5, ids))).toBe('Nœud introuvable');
    expect(refuse(p, joinNodeToWall(levelId(p), nodeAt(lvl(p), 150, 40), wall, 0.001, ids))).toBe('Mur trop court');
  });
});

describe('setWallThickness / setWallHeight', () => {
  it('sets the values on all given walls', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const ids = Object.keys(lvl(p).walls).slice(0, 2);
    const thick = lvl(run(p, setWallThickness(levelId(p), ids, 7)));
    const high = lvl(run(p, setWallHeight(levelId(p), ids, 220)));
    for (const id of ids) {
      expect(thick.walls[id]).toMatchObject({ thickness: 7, height: 250 });
      expect(high.walls[id]).toMatchObject({ thickness: 20, height: 220 });
    }
    const other = Object.keys(lvl(p).walls)[2]!;
    expect(thick.walls[other]).toMatchObject({ thickness: 20, height: 250 });
    expect(high.walls[other]).toMatchObject({ thickness: 20, height: 250 });
  });

  it('refuses non-positive or non-finite values', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    const ids = Object.keys(lvl(p).walls);
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(refuse(p, setWallThickness(levelId(p), ids, bad))).toBe('Épaisseur invalide');
      expect(refuse(p, setWallHeight(levelId(p), ids, bad))).toBe('Hauteur invalide');
    }
    expect(refuse(p, setWallThickness(levelId(p), ['ghost'], 10))).toBe('Mur introuvable');
  });
});

describe('setWallLength', () => {
  it('moves the end node when keeping the start', () => {
    const p = projectFrom([[0, 0, 300, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    const level = lvl(run(p, setWallLength(levelId(p), w, 350, 'start')));
    expect(level.nodes[nodeAt(lvl(p), 300, 0)]!.x).toBeCloseTo(350, 9);
    expect(level.nodes[nodeAt(lvl(p), 0, 0)]).toMatchObject({ x: 0, y: 0 });
  });

  it('moves the start node when keeping the end', () => {
    const p = projectFrom([[0, 0, 300, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    const level = lvl(run(p, setWallLength(levelId(p), w, 350, 'end')));
    expect(level.nodes[nodeAt(lvl(p), 0, 0)]!.x).toBeCloseTo(-50, 9);
    expect(level.nodes[nodeAt(lvl(p), 300, 0)]).toMatchObject({ x: 300, y: 0 });
  });

  it('reconciles openings of the resized wall', () => {
    let door = '';
    const p = projectFrom([[0, 0, 300, 0]], (l) => {
      door = addDoor(l, Object.keys(l.walls)[0]!, 250, 83);
    });
    const w = Object.keys(lvl(p).walls)[0]!;
    const level = lvl(run(p, setWallLength(levelId(p), w, 200, 'start')));
    expect(level.openings[door]!.offset).toBeCloseTo(200 - 41.5, 9);
    expect(refuse(p, setWallLength(levelId(p), w, 50, 'start'))).toBe('Le mur est trop court pour ses ouvertures');
  });

  it('setWallLength rejects non-finite', () => {
    const p = projectFrom([[0, 0, 300, 0]]);
    const w = Object.keys(lvl(p).walls)[0]!;
    for (const bad of [Number.NaN, 0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -10, 0.5]) {
      expect(refuse(p, setWallLength(levelId(p), w, bad, 'start'))).toBe('Longueur invalide');
      expect(refuse(p, setWallLength(levelId(p), w, bad, 'end'))).toBe('Longueur invalide');
    }
  });
});

describe('deleteWalls', () => {
  it('removes the walls, their openings, orphan nodes and anchored dimensions', () => {
    let door = '';
    let keptDoor = '';
    let goneDim = '';
    let keptDim = '';
    const p = projectFrom(rectRoom(0, 0, 400, 300), (l) => {
      door = addDoor(l, wallBetween(l, [0, 0], [400, 0]), 200);
      keptDoor = addDoor(l, wallBetween(l, [400, 300], [0, 300]), 200);
      goneDim = addDim(l, nodeAt(l, 400, 0), nodeAt(l, 0, 300));
      keptDim = addDim(l, nodeAt(l, 0, 0), nodeAt(l, 400, 300));
    });
    const top = wallBetween(lvl(p), [0, 0], [400, 0]);
    const right = wallBetween(lvl(p), [400, 0], [400, 300]);
    const level = lvl(run(p, deleteWalls(levelId(p), [top, right])));
    expect(Object.keys(level.walls)).toHaveLength(2);
    expect(Object.keys(level.nodes)).toHaveLength(3);
    expect(level.nodes[nodeAt(lvl(p), 400, 0)]).toBeUndefined();
    expect(level.openings[door]).toBeUndefined();
    expect(level.openings[keptDoor]).toBeDefined();
    expect(level.dimensions[goneDim]).toBeUndefined();
    expect(level.dimensions[keptDim]).toBeDefined();
  });

  it('refuses unknown walls', () => {
    const p = projectFrom(rectRoom(0, 0, 400, 300));
    expect(refuse(p, deleteWalls(levelId(p), ['ghost']))).toBe('Mur introuvable');
  });
});
