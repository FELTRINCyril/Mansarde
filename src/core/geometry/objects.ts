import type { CustomObjectDef, GenericShape, Id, PlacedObject, Ring, Vec2 } from '../model/types';
import { deg2rad, rotate } from './vec';

const CIRCLE_SEGMENTS = 32;

/** Local (object frame, unrotated) points to world points: optional x mirror, rotation, translation. */
function toWorld(o: PlacedObject, local: Vec2[]): Vec2[] {
  const rad = deg2rad(o.rotation);
  return local.map((p) => {
    const q = rotate(p, rad);
    return { x: o.x + q.x, y: o.y + q.y };
  });
}

/** Corners of the bounding rectangle: local (-w/2,-d/2), (w/2,-d/2), (w/2,d/2), (-w/2,d/2), rotated about the center. */
export function objectCorners(o: PlacedObject): [Vec2, Vec2, Vec2, Vec2] {
  const hw = o.width / 2;
  const hd = o.depth / 2;
  const [a, b, c, d] = toWorld(o, [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]) as [Vec2, Vec2, Vec2, Vec2];
  return [a, b, c, d];
}

/**
 * Outline of the object in world coordinates (clockwise on screen).
 * An object does not store its shape, so the caller passes it (see objectShape); by default an
 * object with lshape params is an L and anything else a rectangle. A symbol uses its bounding
 * rectangle. Circle: 32-gon inscribed in the width x depth ellipse. L: notch removed at the local
 * (+x, +y) corner (notchWidth along x, notchDepth along y; both clamped to the object size),
 * `mirrored` flips local x.
 */
export function objectFootprint(o: PlacedObject, shape?: GenericShape | 'symbol'): Ring {
  const hw = o.width / 2;
  const hd = o.depth / 2;
  const kind = shape ?? (o.lshape ? 'lshape' : 'rect');

  if (kind === 'circle') {
    const local: Vec2[] = [];
    for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS;
      local.push({ x: hw * Math.cos(a), y: hd * Math.sin(a) });
    }
    return toWorld(o, local);
  }

  if (kind === 'lshape' && o.lshape) {
    const nw = Math.min(Math.max(o.lshape.notchWidth, 0), o.width);
    const nd = Math.min(Math.max(o.lshape.notchDepth, 0), o.depth);
    let local: Vec2[] = [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd - nd },
      { x: hw - nw, y: hd - nd },
      { x: hw - nw, y: hd },
      { x: -hw, y: hd },
    ];
    if (o.mirrored) local = local.map((p) => ({ x: -p.x, y: p.y })).reverse(); // reverse keeps the winding
    return toWorld(o, local);
  }

  return objectCorners(o);
}

/** 'symbol' for catalog entries that are not generic; the generic id's shape; a custom object's own shape. */
export function objectShape(o: PlacedObject, customObjects: Record<Id, CustomObjectDef>): GenericShape | 'symbol' {
  if (o.source.kind === 'custom') return customObjects[o.source.customObjectId]?.shape ?? 'rect';
  switch (o.source.catalogId) {
    case 'generic-rect':
      return 'rect';
    case 'generic-circle':
      return 'circle';
    case 'generic-lshape':
      return 'lshape';
    default:
      return 'symbol';
  }
}
