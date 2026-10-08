import type { Level } from '../model/types';
import type { DerivedLevel } from '../geometry/derived';
import { buildBeam } from './beams';
import { emptyMesh } from './builder';
import { buildCeiling } from './ceilings';
import { buildCupboard } from './cupboards';
import { buildFloor } from './floors';
import type { LevelMeshes, MeshData } from './types';
import { buildWalls } from './walls';

export type { CupboardParts, LevelMeshes, MeshData } from './types';
export { triangulate } from './triangulate';

/** Runs build; a failure (broken level, see ruling R37) gives `fallback` instead of an exception. */
function safe<T>(build: () => T, fallback: T): T {
  try {
    return build();
  } catch {
    return fallback;
  }
}

function compute(level: Level, d: DerivedLevel): LevelMeshes {
  const cupboards: LevelMeshes['cupboards'] = [];
  for (const c of Object.values(level.cupboards)) {
    // a cupboard whose wall is missing (broken file) is left out
    const parts = safe(() => buildCupboard(level, c), null);
    if (parts) cupboards.push({ id: c.id, parts });
  }
  return {
    walls: safe(() => buildWalls(level, d), emptyMesh()),
    floors: d.rooms.map((r) => ({ roomKey: r.key, mesh: safe((): MeshData => buildFloor(r), emptyMesh()) })),
    ceilings: d.rooms.map((r) => ({ roomKey: r.key, mesh: safe((): MeshData => buildCeiling(level, r), emptyMesh()) })),
    beams: Object.values(level.beams).map((b) => ({ id: b.id, mesh: safe((): MeshData => buildBeam(level, b), emptyMesh()) })),
    cupboards,
  };
}

/** Inputs the meshes depend on: not the objects, dimensions, background nor names. */
type Inputs = Pick<Level, 'height' | 'nodes' | 'walls' | 'openings' | 'roomLabels' | 'slopes' | 'beams' | 'cupboards'> & { d: DerivedLevel };

const sameInputs = (a: Inputs, b: Inputs): boolean =>
  a.d === b.d &&
  a.height === b.height &&
  a.nodes === b.nodes &&
  a.walls === b.walls &&
  a.openings === b.openings &&
  a.roomLabels === b.roomLabels &&
  a.slopes === b.slopes &&
  a.beams === b.beams &&
  a.cupboards === b.cupboards;

const cache = new WeakMap<Level, { d: DerivedLevel; meshes: LevelMeshes }>();
const byInputs = new WeakMap<Level['nodes'], { inputs: Inputs; meshes: LevelMeshes }>();

/**
 * Meshes of the walls, floors, ceilings, beams and cupboards of a level for the 3D view (spec
 * 8.1), `d` being deriveLevel(level). Memoized like deriveLevel: by level identity, and reused by
 * a new Level whose geometry inputs are the very same objects (e.g. while furniture moves).
 * Never throws: a part that cannot be built is empty (or left out for a cupboard).
 */
export function buildLevelMeshes(level: Level, d: DerivedLevel): LevelMeshes {
  const hit = cache.get(level);
  if (hit && hit.d === d) return hit.meshes;
  const inputs: Inputs = {
    d,
    height: level.height,
    nodes: level.nodes,
    walls: level.walls,
    openings: level.openings,
    roomLabels: level.roomLabels,
    slopes: level.slopes,
    beams: level.beams,
    cupboards: level.cupboards,
  };
  const prev = byInputs.get(level.nodes);
  const meshes = prev && sameInputs(prev.inputs, inputs) ? prev.meshes : compute(level, d);
  byInputs.set(level.nodes, { inputs, meshes });
  cache.set(level, { d, meshes });
  return meshes;
}
