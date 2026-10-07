import type { Id, Level, Ring, Shape } from '../model/types';
import { computeRooms, type Room } from './rooms';
import { computeWallOutlines, computeWallShape, subtractOpenings } from './walls';

/** Everything the editor and the renderer compute from a level. */
export interface DerivedLevel {
  outlines: Map<Id, Ring>;
  shapeNoOpenings: Shape;
  shapeWithOpenings: Shape;
  rooms: Room[];
  /** Outer rings of shapeNoOpenings, except free-standing wall boxes lying inside a room (room islands). */
  facadeRings: Ring[];
}

const cache = new WeakMap<Level, DerivedLevel>();

/** Inputs the derived geometry depends on; objects, dimensions and background do not matter. */
type Inputs = Pick<Level, 'nodes' | 'walls' | 'openings' | 'roomLabels'>;
const byInputs = new WeakMap<Level['nodes'], { inputs: Inputs; derived: DerivedLevel }>();

const sameInputs = (a: Inputs, b: Inputs): boolean =>
  a.nodes === b.nodes && a.walls === b.walls && a.openings === b.openings && a.roomLabels === b.roomLabels;

function compute(level: Level): DerivedLevel {
  const shapeNoOpenings = computeWallShape(level, { withOpenings: false });
  const rooms = computeRooms(level, shapeNoOpenings);
  const islands = new Set(rooms.flatMap((r) => r.islands));
  return {
    outlines: computeWallOutlines(level),
    shapeNoOpenings,
    shapeWithOpenings: subtractOpenings(level, shapeNoOpenings),
    rooms,
    facadeRings: shapeNoOpenings.map((p) => p.outer).filter((r) => !islands.has(r)),
  };
}

/**
 * Derived geometry of a level, memoized by object identity: levels are immutable (every change
 * produces a new Level object), so a cached entry can never be stale. A new Level whose nodes,
 * walls, openings and room labels are the very same objects as a previous one (Immer structural
 * sharing, e.g. while dragging furniture) reuses that result instead of recomputing the union.
 */
export function deriveLevel(level: Level): DerivedLevel {
  const hit = cache.get(level);
  if (hit) return hit;
  const prev = byInputs.get(level.nodes);
  const derived = prev && sameInputs(prev.inputs, level) ? prev.derived : compute(level);
  const { nodes, walls, openings, roomLabels } = level;
  byInputs.set(nodes, { inputs: { nodes, walls, openings, roomLabels }, derived });
  cache.set(level, derived);
  return derived;
}
