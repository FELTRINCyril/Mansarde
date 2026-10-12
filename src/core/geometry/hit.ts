import { SNAP_PX } from '../model/defaults';
import type { CustomObjectDef, Id, Level, Opening, Ring, Slope, Vec2 } from '../model/types';
import { dimLineEnds, manualDimLine } from './autoDimensions';
import { deriveVolumes, type DerivedLevel } from './derived';
import { objectFootprint, objectShape, objectsInDrawOrder } from './objects';
import { openingCutRing, openingFrame } from './openings';
import { pointInPolygon, pointInRing } from './polygon';
import { slopeFrame } from './slopes';
import { add, dist, projectOnSegment, scale, sub } from './vec';

export type HitKind = 'opening' | 'object' | 'node' | 'wall' | 'dimension' | 'room' | 'slope' | 'beam' | 'cupboard';
export interface HitTarget {
  kind: HitKind;
  id: Id; // for a room: room.key
}

/** Nearest item whose distance is strictly below the tolerance, or null. */
function nearest<T>(items: Iterable<T>, distance: (item: T) => number, tol: number): T | null {
  let best: T | null = null;
  let bestD = tol;
  for (const item of items) {
    const d = distance(item);
    if (d < bestD) {
      best = item;
      bestD = d;
    }
  }
  return best;
}

/** Id of the last ring (topmost, record order) containing p, or null. */
function lastContaining(rings: Map<Id, Ring>, p: Vec2): Id | null {
  let found: Id | null = null;
  for (const [id, ring] of rings) if (pointInRing(p, ring)) found = id;
  return found;
}

/**
 * Distance from p to the start line or the end line of the slope, whichever is nearer (the handles
 * of a slope lie on these lines). A click inside the band selects the room (ruling V2-R23).
 * Infinity for a degenerate slope.
 */
function slopeLineDistance(s: Slope, p: Vec2): number {
  const f = slopeFrame(s);
  if (!(f.length > 0 && s.depth > 0)) return Infinity; // degenerate: not drawn, never hit
  const n = scale(f.normal, s.depth);
  return Math.min(projectOnSegment(p, s.a, s.b).distance, projectOnSegment(p, add(s.a, n), add(s.b, n)).distance);
}

/** Wall whose outline contains p; inside the wall shape but in no outline (tiny joint notch), the wall with the nearest axis. */
function hitWall(level: Level, d: DerivedLevel, p: Vec2): Id | null {
  for (const [id, ring] of d.outlines) if (pointInRing(p, ring)) return id;
  if (!d.shapeNoOpenings.some((poly) => pointInPolygon(p, poly))) return null;
  const axisDistance = (id: Id) => {
    const w = level.walls[id]!;
    const a = level.nodes[w.startNodeId]!;
    const b = level.nodes[w.endNodeId]!;
    return projectOnSegment(p, a, b).distance;
  };
  return nearest(d.outlines.keys(), axisDistance, Infinity);
}

/**
 * Element under the point p (world cm). Priority: opening (inside its cut ring) > wall node
 * (closer than SNAP_PX screen pixels) > object (topmost in drawing order, objectsInDrawOrder:
 * rugs under the rest, then record order; inside its footprint) > cupboard (inside its
 * footprint; drawn under the objects, ruling V2-R27) > beam (inside its footprint) > manual
 * dimension (closer than the tolerance to its drawn line) > wall
 * (inside its outline) > slope (closer than the tolerance to its start or end line, ruling
 * V2-R23) > room (inside its ring and outside its islands). Among cupboards or beams, the last in
 * record order wins (drawn on top); among slopes, the nearest line. customObjects gives the
 * footprint shape of custom objects.
 */
export function hitTest(
  level: Level,
  d: DerivedLevel,
  p: Vec2,
  pxPerCm: number,
  customObjects: Record<Id, CustomObjectDef>,
): HitTarget | null {
  const tol = SNAP_PX / pxPerCm;

  const opening = Object.values(level.openings).find((o) => pointInRing(p, openingCutRing(level, o)));
  if (opening) return { kind: 'opening', id: opening.id };

  const node = nearest(Object.values(level.nodes), (n) => dist(p, n), tol);
  if (node) return { kind: 'node', id: node.id };

  const objects = objectsInDrawOrder(level.objects);
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]!;
    if (pointInRing(p, objectFootprint(o, objectShape(o, customObjects)))) return { kind: 'object', id: o.id };
  }

  const volumes = deriveVolumes(level);
  const cupboard = lastContaining(volumes.cupboardFootprints, p);
  if (cupboard) return { kind: 'cupboard', id: cupboard };

  const beam = lastContaining(volumes.beamFootprints, p);
  if (beam) return { kind: 'beam', id: beam };

  const dimension = nearest(
    Object.values(level.dimensions),
    (dim) => {
      const line = manualDimLine(level, dim);
      if (!line) return Infinity;
      const [a, b] = dimLineEnds(line);
      return projectOnSegment(p, a, b).distance;
    },
    tol,
  );
  if (dimension) return { kind: 'dimension', id: dimension.id };

  const wallId = hitWall(level, d, p);
  if (wallId) return { kind: 'wall', id: wallId };

  const slope = nearest(Object.values(level.slopes).reverse(), (s) => slopeLineDistance(s, p), tol);
  if (slope) return { kind: 'slope', id: slope.id };

  const room = d.rooms.find((r) => pointInRing(p, r.ring) && !r.islands.some((i) => pointInRing(p, i)));
  return room ? { kind: 'room', id: room.key } : null;
}

/** The opening rectangle within the wall thickness (no cut margin). */
function openingRect(level: Level, o: Opening): Ring {
  const f = openingFrame(level, o);
  const n = scale(f.normal, f.thickness / 2);
  return [sub(f.start, n), sub(f.end, n), add(f.end, n), add(f.start, n)];
}

/**
 * Elements fully contained in the axis-aligned rectangle with opposite corners a and b, in this
 * order: objects (whole footprint), openings (whole rectangle in the wall), walls (both nodes),
 * manual dimensions (both anchors and both ends of the drawn line), cupboards and beams (whole
 * footprint), slopes (whole band). Rooms and nodes are never selected by rectangle.
 */
export function hitTestRect(
  level: Level,
  _d: DerivedLevel,
  a: Vec2,
  b: Vec2,
  customObjects: Record<Id, CustomObjectDef>,
): HitTarget[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const inside = (p: Vec2) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  const out: HitTarget[] = [];
  for (const o of Object.values(level.objects)) {
    if (objectFootprint(o, objectShape(o, customObjects)).every(inside)) out.push({ kind: 'object', id: o.id });
  }
  for (const o of Object.values(level.openings)) {
    if (openingRect(level, o).every(inside)) out.push({ kind: 'opening', id: o.id });
  }
  for (const w of Object.values(level.walls)) {
    const s = level.nodes[w.startNodeId];
    const e = level.nodes[w.endNodeId];
    if (s && e && inside(s) && inside(e)) out.push({ kind: 'wall', id: w.id });
  }
  for (const dim of Object.values(level.dimensions)) {
    const line = manualDimLine(level, dim);
    if (line && [line.a, line.b, ...dimLineEnds(line)].every(inside)) out.push({ kind: 'dimension', id: dim.id });
  }
  const volumes = deriveVolumes(level);
  const rings: Array<[HitKind, Map<Id, Ring>]> = [
    ['cupboard', volumes.cupboardFootprints],
    ['beam', volumes.beamFootprints],
    ['slope', volumes.slopeBands],
  ];
  for (const [kind, map] of rings) {
    for (const [id, ring] of map) if (ring.every(inside)) out.push({ kind, id });
  }
  return out;
}
