import { CATALOG } from '../../catalog/catalog';
import type { DerivedLevel, DerivedVolumes } from '../geometry/derived';
import { objectFootprint, objectShape } from '../geometry/objects';
import { bbox, isConvexRing } from '../geometry/polygon';
import { cupboardCarries, objectCarries } from '../geometry/support';
import type { Cupboard, CustomObjectDef, Id, Level, ObjectPose, PlacedObject, Ring, Shape, Vec2 } from '../model/types';
import { displayNames } from './names';
import type { Check, CheckKind, CheckSeverity, CheckTarget } from './types';

/** Height tolerance (cm): tops, supports, vertical overlaps (global constraints). */
export const HEIGHT_TOLERANCE = 1;
/** Footprint overlap below which two shapes only touch (cm2). */
export const AREA_TOLERANCE = 1;
/** Objects whose underside is at least this high do not block a door leaf nor a passage (cm). */
export const LOW_OBJECT_MAX_BOTTOM = 200;

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** An object or a cupboard, with everything the rules compare. */
export interface Item {
  kind: 'object' | 'cupboard';
  id: Id;
  /** Level order: objects first, then cupboards; orders the names in pair messages. */
  index: number;
  footprint: Ring;
  /** The footprint is convex (anything but an L shape): it can be the clip ring of clipConvex. */
  convex: boolean;
  box: Box;
  /** Vertical slice [bottom, top] (cm); a cupboard stands from the floor to its highest top. */
  bottom: number;
  top: number;
  /** Cupboards count as 'floor'. */
  pose: ObjectPose;
  /** Catalog tables and desks: 'tuckable' objects may stand under them. */
  acceptsUnder: boolean;
  /** Catalog 'Structure' entries (stairs): they go through the ceiling to the next level (ruling V2-R16). */
  structure: boolean;
  /** The item can carry an 'onTop' object (objectCarries / cupboardCarries, shared with the pose, ruling V2-R37). */
  carrier: boolean;
  center: Vec2;
  /** The cupboard of a 'cupboard' item, null for an object. */
  cupboard: Cupboard | null;
}

export interface CheckContext {
  level: Level;
  derived: DerivedLevel;
  volumes: DerivedVolumes;
  objects: Item[];
  cupboards: Item[];
  /** objects then cupboards */
  items: Item[];
  names: Map<Id, string>;
}

const ACCEPTS_UNDER = new Set(CATALOG.filter((e) => e.acceptsUnder).map((e) => e.id));
const STRUCTURE = new Set(CATALOG.filter((e) => e.category === 'Structure').map((e) => e.id));

/** Bounding box of a ring (an empty ring gives an empty box that overlaps nothing). */
export const boxOf = (r: Ring): Box => bbox(r) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

/** The boxes share an area (touching boxes do not overlap). */
export const boxesOverlap = (a: Box, b: Box): boolean =>
  Math.min(a.maxX, b.maxX) > Math.max(a.minX, b.minX) && Math.min(a.maxY, b.maxY) > Math.max(a.minY, b.minY);

/** The closed boxes meet (touching counts); for boxes that may be flat, e.g. of a segment. */
export const boxesMeet = (a: Box, b: Box): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const ringShape = (r: Ring): Shape => [{ outer: r, holes: [] }];

export const targetOf = (item: Item): CheckTarget => ({ kind: item.kind, id: item.id });

export function makeCheck(kind: CheckKind, severity: CheckSeverity, message: string, targets: CheckTarget[]): Check {
  return { id: [kind, ...targets.map((t) => `${t.kind}-${t.id}`)].join(':'), severity, kind, message, targets };
}

function objectItem(o: PlacedObject, index: number, customObjects: Record<Id, CustomObjectDef>): Item {
  const footprint = objectFootprint(o, objectShape(o, customObjects));
  return {
    kind: 'object',
    id: o.id,
    index,
    footprint,
    convex: isConvexRing(footprint),
    box: boxOf(footprint),
    bottom: o.elevation,
    top: o.elevation + o.height,
    pose: o.pose,
    acceptsUnder: o.source.kind === 'catalog' && ACCEPTS_UNDER.has(o.source.catalogId),
    structure: o.source.kind === 'catalog' && STRUCTURE.has(o.source.catalogId),
    carrier: objectCarries(o),
    center: { x: o.x, y: o.y },
    cupboard: null,
  };
}

function cupboardItem(c: Cupboard, index: number, footprint: Ring, tops: number[]): Item {
  const center = footprint.reduce((s, p) => ({ x: s.x + p.x / footprint.length, y: s.y + p.y / footprint.length }), { x: 0, y: 0 });
  return {
    kind: 'cupboard',
    id: c.id,
    index,
    footprint,
    convex: isConvexRing(footprint),
    box: boxOf(footprint),
    bottom: 0,
    top: tops.length > 0 ? Math.max(...tops) : c.height,
    pose: 'floor',
    acceptsUnder: false,
    structure: false,
    carrier: cupboardCarries(c),
    center,
    cupboard: c,
  };
}

/** Footprints, slices and names of the objects and of the cupboards whose wall exists. */
export function buildContext(level: Level, derived: DerivedLevel, volumes: DerivedVolumes, customObjects: Record<Id, CustomObjectDef>): CheckContext {
  const objects = Object.values(level.objects).map((o, i) => objectItem(o, i, customObjects));
  const cupboards: Item[] = [];
  for (const c of Object.values(level.cupboards)) {
    const footprint = volumes.cupboardFootprints.get(c.id);
    if (!footprint) continue; // wall missing (broken file): not placed, not checked
    const tops = (volumes.cupboardProfiles.get(c.id) ?? []).map((p) => p.top);
    cupboards.push(cupboardItem(c, objects.length + cupboards.length, footprint, tops));
  }
  return { level, derived, volumes, objects, cupboards, items: [...objects, ...cupboards], names: displayNames(level) };
}

/** Not a rug and its underside under 200 cm: it is in the way of a door leaf or of a passage. */
export const isLow = (item: Item): boolean => item.pose !== 'covering' && item.bottom < LOW_OBJECT_MAX_BOTTOM;

export const nameOf = (ctx: CheckContext, item: Item): string => ctx.names.get(item.id) ?? item.id;
