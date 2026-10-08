import type { Id, Level, Opening, Ring, Shape, Vec2 } from '../model/types';
import { BooleanOpError, difference, intersection, isUsableRing } from '../geometry/boolean';
import { openingCutRing } from '../geometry/openings';
import { MeshBuilder } from './builder';
import { ceilingField, slopeEnds, type Field } from './cells';
import { emitColumns, type Column, type Interval } from './solid';
import type { MeshData } from './types';

/**
 * The wall cut through by its openings and the footprint of each opening, or null when a boolean
 * failed. Footprints do not overlap: where two openings overlap (refused by the commands, but
 * possible in a hand-edited file), the first one keeps the overlap.
 */
function cutByOpenings(outline: Ring, cuts: Ring[]): { body: Shape; footprints: Shape[] } | null {
  const shape: Shape = [{ outer: outline, holes: [] }];
  try {
    return { body: difference(shape, cuts), footprints: cuts.map((c, i) => difference(intersection(shape, c), cuts.slice(0, i))) };
  } catch (e) {
    if (!(e instanceof BooleanOpError)) throw e;
    return null;
  }
}

/**
 * One wall (ruling V2-R14): its own outline (d.outlines, mitered at its nodes) with its own
 * openings cut through, extruded from the floor to min(wall height, ceilingWithoutBeams) at each
 * vertex, cut at the slope lines; each opening keeps a sill [0, sill] (a threshold face when the
 * sill is at 0: doors, passages) and a lintel [sill + height, top] (ruling V2-R13), both capped
 * by the top. The mesh is a closed solid but for its underside on the floor. Faces of two walls
 * meeting at a node may lie back to back (accepted by V2-R14). When the openings cannot be cut
 * (boolean failure), the wall is drawn whole.
 */
export function buildWall(level: Level, wallId: Id, outline: Ring): MeshData {
  const b = new MeshBuilder();
  const wall = level.walls[wallId];
  if (!wall || !isUsableRing(outline)) return b.build();
  const top = (m: Vec2): Field => {
    const c = ceilingField(level, m);
    return (p) => Math.max(0, Math.min(wall.height, c(p)));
  };
  const openings: Opening[] = Object.values(level.openings).filter((o) => o.wallId === wallId);
  const cut = openings.length > 0 ? cutByOpenings(outline, openings.map((o) => openingCutRing(level, o))) : null;
  const base = [level.height, wall.height, ...slopeEnds(level)];
  const columns: Column[] = [
    {
      region: cut ? cut.body : [{ outer: outline, holes: [] }],
      constants: base,
      intervals: (m) => [{ bottom: () => 0, top: top(m), floor: true }],
    },
  ];
  if (cut) {
    openings.forEach((o, i) => {
      const sill = Math.max(0, o.sillHeight);
      const head = sill + Math.max(0, o.height);
      columns.push({
        region: cut.footprints[i]!,
        constants: [...base, sill, head],
        intervals: (m): Interval[] => {
          const t = top(m);
          const lintel: Interval = { bottom: (p) => Math.min(head, t(p)), top: t };
          if (sill <= 0) return [{ bottom: () => 0, top: () => 0, floor: true, flat: true }, lintel];
          return [{ bottom: () => 0, top: (p) => Math.min(sill, t(p)), floor: true }, lintel];
        },
      });
    });
  }
  emitColumns(b, level, columns);
  return b.build();
}

/** One mesh per wall whose outline exists (walls with a missing node have none). */
export function buildWalls(level: Level, outlines: Map<Id, Ring>): Array<{ wallId: Id; mesh: MeshData }> {
  return [...outlines].filter(([id]) => level.walls[id]).map(([wallId, outline]) => ({ wallId, mesh: buildWall(level, wallId, outline) }));
}
