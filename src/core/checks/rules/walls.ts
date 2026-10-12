import type { DerivedLevel } from '../../geometry/derived';
import { area, pointInPolygon, ringEdges } from '../../geometry/polygon';
import type { PolygonWithHoles, Ring, Shape } from '../../model/types';
import { AREA_TOLERANCE, boxesMeet, boxOf, makeCheck, nameOf, ringShape, targetOf, type Box, type CheckContext } from '../context';
import { clipShape, overlapArea } from '../overlap';
import type { Check } from '../types';

/** A polygon of the wall shape with its box and the boxes of its edges (outer ring and holes). */
interface IndexedPolygon { poly: PolygonWithHoles; box: Box; edges: Box[] }

const index = new WeakMap<DerivedLevel, IndexedPolygon[]>();

/** The wall shape without openings, indexed once per derived geometry. */
function wallIndex(d: DerivedLevel): IndexedPolygon[] {
  const hit = index.get(d);
  if (hit) return hit;
  const out = d.shapeNoOpenings.map((poly) => ({
    poly,
    box: boxOf(poly.outer),
    edges: [poly.outer, ...poly.holes].flatMap(ringEdges).map(([a, b]) => boxOf([a, b])),
  }));
  index.set(d, out);
  return out;
}

/**
 * The part of the wall shape inside the area of `box`, as polygons to clip: those whose boundary
 * meets the box; plus `inside` when the box lies entirely in the walls (no boundary meets it but a
 * point of it is in a polygon).
 */
function wallsNear(d: DerivedLevel, box: Box): { crossing: Shape; inside: boolean } {
  const crossing: Shape = [];
  let inside = false;
  for (const p of wallIndex(d)) {
    if (!boxesMeet(p.box, box)) continue;
    if (p.edges.some((e) => boxesMeet(e, box))) crossing.push(p.poly);
    else if (pointInPolygon({ x: box.minX, y: box.minY }, p.poly)) inside = true;
  }
  return { crossing, inside };
}

/** The wall shape (without openings) clipped to the ring `clip`, whose box is `box`. */
export function wallsInside(d: DerivedLevel, clip: Ring, box: Box): Shape {
  const { crossing, inside } = wallsNear(d, box);
  if (inside) return ringShape(clip);
  return crossing.length > 0 ? clipShape(crossing, clip) : [];
}

/**
 * Wall overlap (spec 5.4): an object, other than a rug, or a cupboard whose footprint enters the
 * wall shape (without openings) by more than 1 cm2. A cupboard stands against its wall face and
 * the commands keep it on the free stretch of that face; one inside a wall comes from an import
 * or an older version (ruling V2-R39): same message, "Placard : empiète sur un mur.".
 */
export function wallOverlapChecks(ctx: CheckContext): Check[] {
  const out: Check[] = [];
  for (const item of ctx.items) {
    if (item.pose === 'covering') continue;
    const { crossing, inside } = wallsNear(ctx.derived, item.box);
    const overlap = inside ? area(item.footprint) : crossing.length > 0 ? overlapArea(crossing, item.footprint, item.convex) : 0;
    if (overlap > AREA_TOLERANCE) out.push(makeCheck('wallOverlap', 'error', `${nameOf(ctx, item)} : empiète sur un mur.`, [targetOf(item)]));
  }
  return out;
}
