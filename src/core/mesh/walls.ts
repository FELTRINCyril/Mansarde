import type { Id, Level, Opening, Ring, Shape, Vec2 } from '../model/types';
import type { DerivedLevel } from '../geometry/derived';
import { BooleanOpError, difference, intersection, isUsableRing, unionShapes } from '../geometry/boolean';
import { openingCutRing, openingFrame } from '../geometry/openings';
import { distanceToRing, pointInRing } from '../geometry/polygon';
import { add, scale, sub } from '../geometry/vec';
import { MeshBuilder, UP } from './builder';
import { cellsOf, ceilingField, slopeEnds, type Field } from './cells';
import { emitSolid, inShape } from './solid';
import type { MeshData } from './types';

/** Height (cm) of the walls at p: the highest wall whose outline contains p, else the nearest outlines. */
function wallHeightLookup(level: Level, outlines: Map<Id, Ring>): (p: Vec2) => number {
  const entries = [...outlines]
    .map(([id, ring]) => ({ ring, height: level.walls[id]?.height }))
    .filter((e): e is { ring: Ring; height: number } => Number.isFinite(e.height) && e.ring.length >= 3);
  const heights = new Set(entries.map((e) => e.height));
  if (heights.size <= 1) {
    const h = entries[0]?.height ?? level.height;
    return () => h;
  }
  return (p) => {
    let inside = -Infinity;
    let nearest = Infinity;
    let nearestH = -Infinity;
    for (const e of entries) {
      if (pointInRing(p, e.ring)) inside = Math.max(inside, e.height);
      if (inside > -Infinity) continue;
      const d = distanceToRing(p, e.ring);
      if (d < nearest - 1e-6) {
        nearest = d;
        nearestH = e.height;
      } else if (d <= nearest + 1e-6) nearestH = Math.max(nearestH, e.height);
    }
    return inside > -Infinity ? inside : Number.isFinite(nearestH) ? nearestH : level.height;
  };
}

/**
 * The wall shape split so that each piece has a single wall height: the parts covered by the
 * outlines of the highest walls first, then the next height, and the joint fills left over.
 * A single height (the usual case) needs no split; a failed boolean keeps the shape whole.
 */
function splitByWallHeight(level: Level, outlines: Map<Id, Ring>, shape: Shape): Shape {
  const byHeight = new Map<number, Ring[]>();
  for (const [id, ring] of outlines) {
    const h = level.walls[id]?.height;
    if (h === undefined || !Number.isFinite(h) || !isUsableRing(ring)) continue;
    byHeight.set(h, [...(byHeight.get(h) ?? []), ring]);
  }
  if (byHeight.size <= 1) return shape;
  try {
    const out: Shape = [];
    let rest = shape;
    for (const h of [...byHeight.keys()].sort((x, y) => y - x)) {
      const rings = byHeight.get(h)!;
      const parts = rings.flatMap((r) => intersection(rest, r));
      out.push(...(parts.length > 1 ? unionShapes(parts.map((p) => [p])) : parts));
      rest = difference(rest, rings);
    }
    return [...out, ...rest];
  } catch (e) {
    if (!(e instanceof BooleanOpError)) throw e;
    return shape;
  }
}

/** Plan region of the wall removed by the opening (the wall shape inside its cut ring). */
function openingFootprint(level: Level, d: DerivedLevel, o: Opening): Shape {
  const cut = openingCutRing(level, o);
  try {
    return intersection(d.shapeNoOpenings, cut);
  } catch (e) {
    if (!(e instanceof BooleanOpError)) throw e;
    const f = openingFrame(level, o);
    const n = scale(f.normal, f.thickness / 2);
    return [{ outer: [sub(f.start, n), sub(f.end, n), add(f.end, n), add(f.start, n)], holes: [] }];
  }
}

/**
 * Sill and lintel of an opening, as blocks filling its footprint: the sill from 0 to the sill
 * height, the lintel from sill + height to the top of the wall (both capped by that top); a sill
 * at 0 (doors, passages) leaves a threshold face on the floor. Faces against the wall around the
 * opening are hidden by it and left out.
 */
function addOpeningBlocks(b: MeshBuilder, level: Level, d: DerivedLevel, o: Opening, insideWalls: (p: Vec2) => boolean): void {
  const neighbours = [d.shapeWithOpenings];
  const wall = level.walls[o.wallId];
  if (!wall) return;
  const footprint = openingFootprint(level, d, o);
  if (footprint.length === 0) return;
  // the cut failed (degraded level): the wall is drawn whole over the opening
  if (insideWalls(openingFrame(level, o).center)) return;
  const sill = Math.max(0, o.sillHeight);
  const head = sill + Math.max(0, o.height);
  const cells = cellsOf(level, footprint, [level.height, wall.height, sill, head, ...slopeEnds(level)]);
  const top = (m: Vec2): Field => {
    const c = ceilingField(level, m);
    return (p) => Math.max(0, Math.min(wall.height, c(p)));
  };
  const inside = inShape(footprint);
  if (sill > 0) {
    emitSolid(b, cells, {
      inside,
      covered: insideWalls,
      bottom: () => () => 0,
      top: (m) => {
        const t = top(m);
        return (p) => Math.min(sill, t(p));
      },
      bottomFace: false,
      neighbours,
    });
  } else {
    for (const cell of cells) b.surface(cell.pts, cell.tris, () => 0, 'up', UP);
  }
  emitSolid(b, cells, {
    inside,
    covered: insideWalls,
    bottom: (m) => {
      const t = top(m);
      return (p) => Math.min(head, t(p));
    },
    top,
    bottomFace: true,
    neighbours,
  });
}

/**
 * The walls of the level: the wall shape with its openings cut through (shapeWithOpenings), cut
 * at the slope lines and extruded from the floor to min(wall height, ceilingWithoutBeams) at each
 * vertex, plus the sill and lintel blocks of every opening. Spec 8.1 and plan-chambre: doors and
 * passages also get a lintel above their height (the shape cuts them full height).
 */
export function buildWalls(level: Level, d: DerivedLevel): MeshData {
  const b = new MeshBuilder();
  const shape = d.shapeWithOpenings;
  const insideWalls = inShape(shape);
  const wallHeight = wallHeightLookup(level, d.outlines);
  const wallHeights = [...new Set(Object.values(level.walls).map((w) => w.height))];
  const cells = cellsOf(level, splitByWallHeight(level, d.outlines, shape), [level.height, ...wallHeights, ...slopeEnds(level)]);
  emitSolid(b, cells, {
    inside: insideWalls,
    bottom: () => () => 0,
    top: (m) => {
      const h = wallHeight(m);
      const c = ceilingField(level, m);
      return (p) => Math.max(0, Math.min(h, c(p)));
    },
    bottomFace: false,
  });
  for (const o of Object.values(level.openings)) {
    try {
      addOpeningBlocks(b, level, d, o, insideWalls);
    } catch {
      // opening on a missing wall or node (broken file): nothing to add
    }
  }
  return b.build();
}
