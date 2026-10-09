import type { Id, Level, Opening, Ring, Shape, Vec2 } from '../model/types';
import { BooleanOpError, difference, intersection, isUsableRing } from '../geometry/boolean';
import { openingCutRing } from '../geometry/openings';
import { area, bbox } from '../geometry/polygon';
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

/** An opening and its cut ring (openingCutRing), computed once per level. */
export interface OpeningCut { opening: Opening; ring: Ring }

/** Cut rings of the openings whose wall and nodes exist (an opening on a missing wall has none). */
export function openingCuts(level: Level): OpeningCut[] {
  const out: OpeningCut[] = [];
  for (const o of Object.values(level.openings)) {
    const w = level.walls[o.wallId];
    if (!w || !level.nodes[w.startNodeId] || !level.nodes[w.endNodeId]) continue;
    const ring = openingCutRing(level, o);
    if (isUsableRing(ring)) out.push({ opening: o, ring });
  }
  return out;
}

/** Below this area (cm2) a neighbouring opening merely touches the outline (collinear walls, butt joints). */
const MIN_OVERLAP = 1e-6;

const boxesOverlap = (a: Ring, b: Ring): boolean => {
  const p = bbox(a)!;
  const q = bbox(b)!;
  return p.minX < q.maxX && q.minX < p.maxX && p.minY < q.maxY && q.minY < p.maxY;
};

/**
 * The openings that cut this wall: its own ones, and those of other walls whose cut ring overlaps
 * its outline (ruling V2-R20: a door flush at a wall end also cuts the mitered end of the wall met
 * there, as the 2D shape does, since subtractOpenings cuts the union of the walls).
 */
function cutsOf(wallId: Id, outline: Ring, cuts: OpeningCut[]): OpeningCut[] {
  return cuts.filter(({ opening, ring }) => {
    if (opening.wallId === wallId) return true;
    if (!boxesOverlap(outline, ring)) return false;
    try {
      return intersection([{ outer: outline, holes: [] }], ring).reduce((s, p) => s + area(p.outer), 0) > MIN_OVERLAP;
    } catch (e) {
      if (!(e instanceof BooleanOpError)) throw e;
      return false;
    }
  });
}

/**
 * One wall (ruling V2-R14): its own outline (d.outlines, mitered at its nodes) cut through by its
 * openings and by those of neighbouring walls overlapping it (V2-R20), extruded from the floor to
 * min(wall height, ceilingWithoutBeams) at each vertex, cut at the slope lines; each opening keeps
 * a sill [0, sill] (a threshold face when the sill is at 0: doors, passages) and a lintel
 * [sill + height, top] (ruling V2-R13), both capped by the top. The mesh is a closed solid but for
 * its underside on the floor. Faces of two walls meeting at a node may lie back to back (accepted
 * by V2-R14). When the openings cannot be cut (boolean failure), the wall is drawn whole.
 * `cuts` defaults to openingCuts(level).
 */
export function buildWall(level: Level, wallId: Id, outline: Ring, cuts: OpeningCut[] = openingCuts(level)): MeshData {
  const b = new MeshBuilder();
  const wall = level.walls[wallId];
  if (!wall || !isUsableRing(outline)) return b.build();
  const top = (m: Vec2): Field => {
    const c = ceilingField(level, m);
    return (p) => Math.max(0, Math.min(wall.height, c(p)));
  };
  const mine = cutsOf(wallId, outline, cuts);
  const openings: Opening[] = mine.map((c) => c.opening);
  const cut = mine.length > 0 ? cutByOpenings(outline, mine.map((c) => c.ring)) : null;
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
  const cuts = openingCuts(level);
  return [...outlines].filter(([id]) => level.walls[id]).map(([wallId, outline]) => ({ wallId, mesh: buildWall(level, wallId, outline, cuts) }));
}
