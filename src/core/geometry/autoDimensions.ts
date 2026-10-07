import type { Level, ManualDimension, Ring, Vec2 } from '../model/types';
import { resolveAnchor } from './anchors';
import type { DerivedLevel } from './derived';
import { openingFrame } from './openings';
import { mergeCollinear, ringEdges, signedArea } from './polygon';
import { add, dist, normalize, perp, scale, sub } from './vec';

export interface DimLine {
  a: Vec2;
  b: Vec2;
  offset: number; // signed perpendicular distance of the drawn line, positive = towards perp(b - a)
  value: number; // cm
  kind: 'room' | 'facade' | 'opening' | 'manual' | 'dynamic';
}

const ROOM_OFFSET = 25;
const FACADE_OFFSET = 50;
export const OPENING_GAP = 20; // beyond the wall face
const MIN_FACE_LENGTH = 10; // faces of this length or less get no dimension

/**
 * One dimension per straight side of the ring longer than MIN_FACE_LENGTH, drawn `inward` cm
 * towards the inside of the ring (negative = outside). Collinear pieces are merged first.
 */
function ringDims(ring: Ring, kind: 'room' | 'facade', inward: number): DimLine[] {
  const r = mergeCollinear(ring);
  // with x right and y down, perp(b - a) points inside the ring when its signed area is positive
  const offset = signedArea(r) > 0 ? inward : -inward;
  return ringEdges(r)
    .filter(([a, b]) => dist(a, b) > MIN_FACE_LENGTH)
    .map(([a, b]) => ({ a, b, offset, value: dist(a, b), kind }));
}

/**
 * Automatic dimensions of a level (spec 8): every interior wall face of every room (including the
 * outer faces of free-standing wall boxes, measured from the room), every facade face, and the
 * width of every opening, drawn beyond the wall face on the side opposite to the swing.
 */
export function computeAutoDimensions(level: Level, d: DerivedLevel): DimLine[] {
  const out: DimLine[] = [];
  for (const room of d.rooms) {
    out.push(...ringDims(room.ring, 'room', ROOM_OFFSET));
    for (const island of room.islands) out.push(...ringDims(island, 'room', -ROOM_OFFSET));
  }
  for (const ring of d.facadeRings) out.push(...ringDims(ring, 'facade', -FACADE_OFFSET));
  for (const opening of Object.values(level.openings)) {
    const f = openingFrame(level, opening);
    // swing 'left' opens towards +perp(dir), which is also perp(end - start)
    const side = opening.swing === 'left' ? -1 : 1;
    out.push({
      a: f.start,
      b: f.end,
      offset: side * (f.thickness / 2 + OPENING_GAP),
      value: opening.width,
      kind: 'opening',
    });
  }
  return out;
}

const autoCache = new WeakMap<DerivedLevel, DimLine[]>();

/**
 * computeAutoDimensions memoized on the derived level: deriveLevel returns the very same object
 * while nodes, walls, openings and room labels are unchanged (e.g. while furniture is dragged), so
 * the automatic dimensions are not recomputed on every pointer move. The array is shared: read only.
 */
export function autoDimensionsOf(level: Level, d: DerivedLevel): DimLine[] {
  let dims = autoCache.get(d);
  if (!dims) {
    dims = computeAutoDimensions(level, d);
    autoCache.set(d, dims);
  }
  return dims;
}

/** DimLine of a manual dimension; null when an anchor no longer resolves. */
export function manualDimLine(level: Level, dim: ManualDimension): DimLine | null {
  const a = resolveAnchor(level, dim.a);
  const b = resolveAnchor(level, dim.b);
  if (!a || !b) return null;
  return { a, b, offset: dim.offset, value: dist(a, b), kind: 'manual' };
}

/** End points of the drawn dimension line: a and b moved by the signed offset along perp(b - a). */
export function dimLineEnds(d: DimLine): [Vec2, Vec2] {
  const shift = scale(normalize(perp(sub(d.b, d.a))), d.offset);
  return [add(d.a, shift), add(d.b, shift)];
}
