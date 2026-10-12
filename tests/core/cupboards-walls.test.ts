import { describe, expect, it } from 'vitest';
import { overlapArea } from '@/core/checks/overlap';
import { addCupboard, moveCupboard, updateCupboard } from '@/core/commands/cupboards';
import type { Recipe } from '@/core/commands/apply';
import { setRoomInteriorSize } from '@/core/commands/roomSize';
import { addWallChain, moveNodes, moveWalls, setWallThickness } from '@/core/commands/walls';
import { validateProject } from '@/core/commands/validate';
import { cupboardFootprint } from '@/core/geometry/cupboards';
import { deriveLevel } from '@/core/geometry/derived';
import { createCupboard } from '@/core/model/factory';
import type { Cupboard, Id, Level, Project } from '@/core/model/types';
import { findWall, rectRoom, type WallSegment } from './fixtures';
import { levelId, lvl, projectFrom, refuse, run } from './helpers';

/*
 * Ruling V2-R39: a cupboard never ends up inside a wall through a wall or cupboard command (the
 * reviewer's probes A, B, B', C, D), the reconciliation never refuses an edit for a conflict it did
 * not cause, and a cupboard already inside a wall (import, legacy) is flagged by the checks.
 */

const NO_ROOM = 'Pas assez de place sur ce mur';
const TOO_SHORT = 'Le mur est trop court pour ses placards';

/** The cupboard on the room side (+y) of a horizontal wall, whatever the direction of the wall. */
function roomSide(level: Level, c: Cupboard): Cupboard {
  return cupboardFootprint(level, c).some((q) => q.y < 0) ? { ...c, side: c.side === 'left' ? 'right' : 'left' } : c;
}

function withCupboard(segments: WallSegment[], wall: [number, number, number, number], offset: number, over: Partial<Cupboard> = {}) {
  const p0 = projectFrom(segments);
  const wallId = findWall(lvl(p0), ...wall);
  const c = roomSide(lvl(p0), createCupboard(wallId, offset, 'left', over));
  return { p: run(p0, addCupboard(levelId(p0), c)), c, wallId };
}

/** Area (cm2) of the footprint of the cupboard inside the wall shape. */
const inWalls = (p: Project, id: Id): number => {
  const level = lvl(p);
  return overlapArea(deriveLevel(level).shapeNoOpenings, cupboardFootprint(level, level.cupboards[id]!), true);
};
const maxX = (p: Project, id: Id): number => Math.max(...cupboardFootprint(lvl(p), lvl(p).cupboards[id]!).map((q) => q.x));

describe('every path keeps a cupboard out of the walls (V2-R39)', () => {
  // top wall (0,0) -> (300,0) then (300,0) -> (400,0); a T partition goes up (outside) from (300, 0)
  const tee = (t: number): WallSegment[] => [[0, 0, 300, 0], [300, 0, 400, 0], [400, 0, 400, 300], [400, 300, 0, 300], [0, 300, 0, 0], [300, 0, 300, -200, t]];

  it('A: "Changer de face" next to a T partition on the other face clamps onto the new face, or is refused', () => {
    const { p, c, wallId } = withCupboard(tee(20), [0, 0, 300, 0], 240); // x 180..300 inside
    const flipped = run(p, moveCupboard(levelId(p), c.id, wallId, c.offset, c.side === 'left' ? 'right' : 'left'));
    // outside, the partition face is at x = 290
    expect(maxX(flipped, c.id)).toBeCloseTo(290, 6);
    expect(inWalls(flipped, c.id)).toBeLessThan(1e-6);
    // 280 wide: room for it inside (x 10..300), not outside against a 60 cm partition (x 0..270)
    const wide = withCupboard(tee(60), [0, 0, 300, 0], 160, { width: 280 });
    expect(refuse(wide.p, moveCupboard(levelId(wide.p), wide.c.id, wide.wallId, wide.c.offset, wide.c.side === 'left' ? 'right' : 'left'))).toBe(NO_ROOM);
  });

  it('B: a thicker corner wall pushes the corner cupboard back; B\': a cupboard over the whole face refuses it', () => {
    const { p, c } = withCupboard(rectRoom(0, 0, 400, 300), [0, 0, 400, 0], 330); // x 270..390
    const thick = run(p, setWallThickness(levelId(p), [findWall(lvl(p), 400, 0, 400, 300)], 40));
    expect(maxX(thick, c.id)).toBeCloseTo(380, 6);
    expect(inWalls(thick, c.id)).toBeLessThan(1e-6);
    const full = withCupboard([...rectRoom(0, 0, 400, 300), [600, 0, 600, 300]], [0, 0, 400, 0], 200, { width: 380 });
    expect(refuse(full.p, setWallThickness(levelId(full.p), [findWall(lvl(full.p), 400, 0, 400, 300)], 40))).toBe(TOO_SHORT);
  });

  it('C: a partition drawn with a T junction 2 cm beside the cupboard pushes it back', () => {
    const { p, c, wallId } = withCupboard(rectRoom(0, 0, 400, 300), [0, 0, 400, 0], 200); // x 140..260
    const next = run(p, addWallChain(levelId(p), [{ kind: 'onWall', wallId, t: 262 / 400 }, { kind: 'free', x: 262, y: 300 }], 7, 250));
    expect(maxX(next, c.id)).toBeCloseTo(258.5, 6);
    expect(inWalls(next, c.id)).toBeLessThan(1e-6);
  });
});

describe('one convergence point: every wall command keeps the corner cupboard out of the walls (V2-R39)', () => {
  // the corner cupboard x 270..390 against the right wall (inner face x = 390)
  const corner = () => withCupboard(rectRoom(0, 0, 400, 300), [0, 0, 400, 0], 330);
  const right = (p: Project) => findWall(lvl(p), 400, 0, 400, 300);
  const cases: Array<[string, (p: Project) => Recipe]> = [
    ['moveWalls', (p) => moveWalls(levelId(p), [right(p)], { x: -20, y: 0 })],
    ['moveNodes', (p) => {
      const w = lvl(p).walls[right(p)]!;
      return moveNodes(levelId(p), [w.startNodeId, w.endNodeId].map((nodeId) => ({ nodeId, to: { x: 380, y: lvl(p).nodes[nodeId]!.y } })));
    }],
    ['setWallThickness', (p) => setWallThickness(levelId(p), [right(p)], 60)],
    ['setRoomInteriorSize', (p) => setRoomInteriorSize(levelId(p), deriveLevel(lvl(p)).rooms[0]!.key, 'width', 360, 'max')],
  ];
  for (const [name, recipe] of cases) {
    it(name, () => {
      const { p, c } = corner();
      const next = run(p, recipe(p));
      expect(maxX(next, c.id)).toBeCloseTo(370, 6);
      expect(inWalls(next, c.id)).toBeLessThan(1e-6);
    });
  }
});

describe('the reconciliation never refuses an edit for a conflict it did not cause (V2-R39)', () => {
  /** A cupboard already inside the corner wall (imported, or left by an older version). */
  function legacy(width: number, offset: number): { p: Project; c: Cupboard; far: Id } {
    const p = projectFrom([...rectRoom(0, 0, 400, 300), [600, 0, 600, 300]], (level) => {
      level.walls[findWall(level, 400, 0, 400, 300)]!.thickness = 40; // face at x = 380
      const c = roomSide(level, createCupboard(findWall(level, 0, 0, 400, 0), offset, 'left', { width, id: 'legacy' }));
      level.cupboards[c.id] = c;
    });
    expect(validateProject(p)).toEqual([]); // tolerated: it fits the wall length
    return { p, c: lvl(p).cupboards['legacy']!, far: findWall(lvl(p), 600, 0, 600, 300) };
  }

  it("B' / D: moving an unrelated wall is accepted and leaves the cupboard where it is", () => {
    for (const [width, offset] of [[380, 200], [390, 200], [120, 330]] as const) {
      const { p, c, far } = legacy(width, offset);
      const node = lvl(p).walls[far]!.startNodeId;
      const at = lvl(p).nodes[node]!;
      const next = run(p, moveNodes(levelId(p), [{ nodeId: node, to: { x: at.x + 50, y: at.y } }]));
      expect(lvl(next).cupboards[c.id]).toEqual(c);
    }
  });

  it('D: such a cupboard can be recoloured, and narrowed onto its free stretch', () => {
    const { p, c } = legacy(390, 200);
    run(p, updateCupboard(levelId(p), c.id, { color: '#000000' }));
    const narrow = run(p, updateCupboard(levelId(p), c.id, { width: 370 }));
    expect(inWalls(narrow, c.id)).toBeLessThan(1e-6);
  });
});
