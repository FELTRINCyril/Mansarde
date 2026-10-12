import { cupboardDoors, cupboardFrame } from '../../geometry/cupboards';
import { openingFrame } from '../../geometry/openings';
import { add, dist, normalize, scale, sub } from '../../geometry/vec';
import type { Level, Opening, Ring, Vec2 } from '../../model/types';
import { AREA_TOLERANCE, boxesOverlap, boxOf, isLow, makeCheck, nameOf, ringShape, targetOf, type Box, type CheckContext } from '../context';
import { overlapArea } from '../overlap';
import type { Check, CheckTarget } from '../types';

const ARC_SEGMENTS = 16;

/**
 * Area swept by a leaf hinged at `hinge`, of length `radius`, from closed (along `closed`) to open
 * (along `open`, perpendicular to it): the hinge and a 16-segment quarter circle.
 */
export function leafSector(hinge: Vec2, closed: Vec2, open: Vec2, radius: number): Ring {
  const ring: Ring = [{ ...hinge }];
  for (let k = 0; k <= ARC_SEGMENTS; k++) {
    const t = (k / ARC_SEGMENTS) * (Math.PI / 2);
    ring.push(add(hinge, add(scale(closed, radius * Math.cos(t)), scale(open, radius * Math.sin(t)))));
  }
  return ring;
}

/**
 * Sectors of a swinging door ('single' or 'double'; sliding and pocket doors sweep nothing), on
 * its `swing` side, hinged on that wall face: one leaf of the full width at the `hinge` jamb, or
 * two half leaves at both jambs (as drawn on the plan).
 */
function doorSectors(level: Level, o: Opening): Ring[] {
  if (o.kind !== 'door' || (o.variant !== 'single' && o.variant !== 'double')) return [];
  const wall = level.walls[o.wallId];
  // broken file (ruling R37): no wall, or a wall node missing, to place the door on
  if (!wall || !Object.hasOwn(level.nodes, wall.startNodeId) || !Object.hasOwn(level.nodes, wall.endNodeId)) return [];
  const f = openingFrame(level, o);
  const open = o.swing === 'left' ? f.normal : scale(f.normal, -1);
  const face = scale(open, f.thickness / 2);
  const back = scale(f.dir, -1);
  if (o.variant === 'double') {
    return [leafSector(add(f.start, face), f.dir, open, o.width / 2), leafSector(add(f.end, face), back, open, o.width / 2)];
  }
  return o.hinge === 'start' ? [leafSector(add(f.start, face), f.dir, open, o.width)] : [leafSector(add(f.end, face), back, open, o.width)];
}

interface Sector { ring: Ring; box: Box; target: CheckTarget; what: string }

function sectors(ctx: CheckContext): Sector[] {
  const out: Sector[] = [];
  for (const o of Object.values(ctx.level.openings)) {
    for (const ring of doorSectors(ctx.level, o)) out.push({ ring, box: boxOf(ring), target: { kind: 'opening', id: o.id }, what: 'de la porte' });
  }
  for (const item of ctx.cupboards) {
    const c = item.cupboard!;
    if (c.doorType !== 'hinged') continue;
    const outward = cupboardFrame(ctx.level, c).outward; // the wall exists: the item has a footprint
    for (const door of cupboardDoors(ctx.level, c)) {
      const other = dist(door.hingeAt, door.from) < dist(door.hingeAt, door.to) ? door.to : door.from;
      const ring = leafSector(door.hingeAt, normalize(sub(other, door.hingeAt)), outward, dist(door.from, door.to));
      out.push({ ring, box: boxOf(ring), target: targetOf(item), what: 'du placard' });
    }
  }
  return out;
}

/**
 * Door swing (spec 5.4): an object, other than a rug, with its underside under 200 cm, whose
 * footprint overlaps by more than 1 cm2 the area swept by a leaf of a swinging door or by a hinged
 * cupboard door (one check per object and door or cupboard).
 */
export function doorSwingChecks(ctx: CheckContext): Check[] {
  const all = sectors(ctx);
  if (all.length === 0) return [];
  const out: Check[] = [];
  for (const item of ctx.objects) {
    if (!isLow(item)) continue;
    const seen = new Set<string>();
    for (const s of all) {
      if (seen.has(s.target.id) || !boxesOverlap(item.box, s.box)) continue;
      if (overlapArea(ringShape(item.footprint), s.ring, true) <= AREA_TOLERANCE) continue; // sectors are convex
      seen.add(s.target.id);
      out.push(makeCheck('doorSwing', 'error', `${nameOf(ctx, item)} : gêne l'ouverture ${s.what}.`, [targetOf(item), s.target]));
    }
  }
  return out;
}
