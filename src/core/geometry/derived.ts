import type { Id, Level, Ring, Shape } from '../model/types';
import { beamFootprint } from './beams';
import { cupboardFootprint, cupboardTopProfile, type ProfilePoint } from './cupboards';
import { computeRooms, type Room } from './rooms';
import { slopeBand } from './slopes';
import { computeWallOutlines, subtractOpeningsResult, wallShapeResult } from './walls';

/** Everything the editor and the renderer compute from a level. */
export interface DerivedLevel {
  outlines: Map<Id, Ring>;
  shapeNoOpenings: Shape;
  shapeWithOpenings: Shape;
  rooms: Room[];
  /** Outer rings of shapeNoOpenings, except free-standing wall boxes lying inside a room (room islands). */
  facadeRings: Ring[];
  /**
   * A boolean operation failed even after its retries, or the level is broken (ruling R37): the
   * shapes are a simplified fallback. A failed wall union gives possibly overlapping polygons and
   * no rooms nor facades; a failed opening cut leaves the opening uncut (rooms are still exact).
   * The editor refuses an edit whose result is degraded and shows a notice on such a level.
   */
  degraded: boolean;
}

const cache = new WeakMap<Level, DerivedLevel>();

/** Inputs the derived geometry depends on; objects, dimensions and background do not matter. */
type Inputs = Pick<Level, 'nodes' | 'walls' | 'openings' | 'roomLabels'>;
const byInputs = new WeakMap<Level['nodes'], { inputs: Inputs; derived: DerivedLevel }>();

const sameInputs = (a: Inputs, b: Inputs): boolean =>
  a.nodes === b.nodes && a.walls === b.walls && a.openings === b.openings && a.roomLabels === b.roomLabels;

function computeExact(level: Level): DerivedLevel {
  const base = wallShapeResult(level);
  const shapeNoOpenings = base.shape;
  // a degraded shape is a set of overlapping polygons: its holes are not rooms, its rings not facades
  const rooms = base.degraded ? [] : computeRooms(level, shapeNoOpenings);
  const islands = new Set(rooms.flatMap((r) => r.islands));
  const cut = subtractOpeningsResult(level, shapeNoOpenings);
  return {
    outlines: computeWallOutlines(level),
    shapeNoOpenings,
    shapeWithOpenings: cut.shape,
    rooms,
    facadeRings: base.degraded ? [] : shapeNoOpenings.map((p) => p.outer).filter((r) => !islands.has(r)),
    degraded: base.degraded || cut.degraded,
  };
}

/**
 * Last resort when anything else throws (e.g. a stored plan with a wall whose node is missing):
 * the raw outlines of the walls whose nodes exist, as separate polygons, nothing derived from them.
 */
function computeFallback(level: Level): DerivedLevel {
  const walls = Object.fromEntries(
    Object.entries(level.walls).filter(([, w]) => Object.hasOwn(level.nodes, w.startNodeId) && Object.hasOwn(level.nodes, w.endNodeId)),
  );
  let outlines = new Map<Id, Ring>();
  try {
    outlines = computeWallOutlines({ ...level, walls });
  } catch {
    // nothing sensible can be drawn for the walls
  }
  const shape: Shape = [...outlines.values()].map((outer) => ({ outer, holes: [] }));
  return { outlines, shapeNoOpenings: shape, shapeWithOpenings: shape, rooms: [], facadeRings: [], degraded: true };
}

/** Never throws (ruling R37): whatever fails gives a degraded result instead. */
function compute(level: Level): DerivedLevel {
  try {
    return computeExact(level);
  } catch {
    return computeFallback(level);
  }
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

/** Plan geometry of the volumes of a level (slopes, beams, cupboards), for the checks and the renderer. */
export interface DerivedVolumes {
  slopeBands: Map<Id, Ring>;
  beamFootprints: Map<Id, Ring>;
  /** Cupboards whose wall exists; a cupboard on a missing wall (broken file) is left out. */
  cupboardFootprints: Map<Id, Ring>;
  cupboardProfiles: Map<Id, ProfilePoint[]>;
}

/** Inputs the volumes depend on (the ceiling height and the walls carrying the cupboards included). */
type VolumeInputs = Pick<Level, 'height' | 'nodes' | 'walls' | 'slopes' | 'beams' | 'cupboards'>;
const volumesCache = new WeakMap<Level, DerivedVolumes>();
const volumesByInputs = new WeakMap<Level['slopes'], { inputs: VolumeInputs; volumes: DerivedVolumes }>();

const sameVolumeInputs = (a: VolumeInputs, b: VolumeInputs): boolean =>
  a.height === b.height && a.nodes === b.nodes && a.walls === b.walls && a.slopes === b.slopes && a.beams === b.beams && a.cupboards === b.cupboards;

function computeVolumes(level: Level): DerivedVolumes {
  const slopeBands = new Map<Id, Ring>();
  for (const s of Object.values(level.slopes)) slopeBands.set(s.id, slopeBand(s));
  const beamFootprints = new Map<Id, Ring>();
  for (const b of Object.values(level.beams)) beamFootprints.set(b.id, beamFootprint(b));
  const cupboardFootprints = new Map<Id, Ring>();
  const cupboardProfiles = new Map<Id, ProfilePoint[]>();
  for (const c of Object.values(level.cupboards)) {
    const wall = Object.hasOwn(level.walls, c.wallId) ? level.walls[c.wallId]! : null;
    // wall or node missing (broken file): the cupboard cannot be placed, it is left out
    if (!wall || !Object.hasOwn(level.nodes, wall.startNodeId) || !Object.hasOwn(level.nodes, wall.endNodeId)) continue;
    cupboardFootprints.set(c.id, cupboardFootprint(level, c));
    cupboardProfiles.set(c.id, cupboardTopProfile(level, c));
  }
  return { slopeBands, beamFootprints, cupboardFootprints, cupboardProfiles };
}

/**
 * Volumes of a level, memoized like deriveLevel: by level identity, and reused by a new Level
 * whose height, nodes, walls, slopes, beams and cupboards are the very same objects (e.g. while
 * dragging furniture). Never throws on a cupboard whose wall is missing (it is left out).
 */
export function deriveVolumes(level: Level): DerivedVolumes {
  const hit = volumesCache.get(level);
  if (hit) return hit;
  const prev = volumesByInputs.get(level.slopes);
  const volumes = prev && sameVolumeInputs(prev.inputs, level) ? prev.volumes : computeVolumes(level);
  const { height, nodes, walls, slopes, beams, cupboards } = level;
  volumesByInputs.set(slopes, { inputs: { height, nodes, walls, slopes, beams, cupboards }, volumes });
  volumesCache.set(level, volumes);
  return volumes;
}
