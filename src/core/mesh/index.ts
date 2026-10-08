import type { Beam, Cupboard, Level } from '../model/types';
import type { DerivedLevel } from '../geometry/derived';
import { buildBeam } from './beams';
import { buildCeiling } from './ceilings';
import { buildCupboard } from './cupboards';
import { buildFloor } from './floors';
import type { CupboardParts, LevelMeshes, MeshData } from './types';
import { buildWalls } from './walls';

export type { CupboardParts, LevelMeshes, MeshData } from './types';
export { triangulate, triangulatePolygon } from './triangulate';

type Structure = Pick<LevelMeshes, 'walls' | 'floors' | 'ceilings'>;

/** Walls, floors and ceilings: they depend on the derived level, the walls, openings, height and slopes. */
const structures = new WeakMap<DerivedLevel, { level: Level; meshes: Structure }>();

function structureOf(level: Level, d: DerivedLevel): Structure {
  const hit = structures.get(d);
  const prev = hit?.level;
  if (hit && prev && prev.height === level.height && prev.slopes === level.slopes && prev.walls === level.walls && prev.openings === level.openings) {
    return hit.meshes;
  }
  const meshes: Structure = {
    walls: buildWalls(level, d.outlines),
    floors: d.rooms.map((r) => ({ roomKey: r.key, mesh: buildFloor(r) })),
    ceilings: d.rooms.map((r) => ({ roomKey: r.key, mesh: buildCeiling(level, r) })),
  };
  structures.set(d, { level, meshes });
  return meshes;
}

/** A beam depends on itself, and on the level height and slopes (its top follows the ceiling). */
const beamCache = new WeakMap<Beam, { level: Level; mesh: MeshData }>();

function beamOf(level: Level, beam: Beam): MeshData {
  const hit = beamCache.get(beam);
  if (hit && hit.level.height === level.height && hit.level.slopes === level.slopes) return hit.mesh;
  const mesh = buildBeam(level, beam);
  beamCache.set(beam, { level, mesh });
  return mesh;
}

/**
 * A cupboard depends on itself, its wall and the nodes of that wall; in 'ceiling' mode also on
 * the level height, slopes and beams. Null when its wall or one of its nodes is missing (broken
 * file): it is left out.
 */
const cupboardCache = new WeakMap<Cupboard, { level: Level; parts: CupboardParts }>();

function cupboardOf(level: Level, c: Cupboard): CupboardParts | null {
  const wall = level.walls[c.wallId];
  if (!wall || !level.nodes[wall.startNodeId] || !level.nodes[wall.endNodeId]) return null;
  const hit = cupboardCache.get(c);
  const prev = hit?.level;
  if (
    hit &&
    prev &&
    prev.walls[c.wallId] === wall &&
    prev.nodes[wall.startNodeId] === level.nodes[wall.startNodeId] &&
    prev.nodes[wall.endNodeId] === level.nodes[wall.endNodeId] &&
    (c.heightMode !== 'ceiling' || (prev.height === level.height && prev.slopes === level.slopes && prev.beams === level.beams))
  ) {
    return hit.parts;
  }
  const parts = buildCupboard(level, c);
  cupboardCache.set(c, { level, parts });
  return parts;
}

function compute(level: Level, d: DerivedLevel): LevelMeshes {
  const cupboards: LevelMeshes['cupboards'] = [];
  for (const c of Object.values(level.cupboards)) {
    const parts = cupboardOf(level, c);
    if (parts) cupboards.push({ id: c.id, parts });
  }
  return {
    ...structureOf(level, d),
    beams: Object.values(level.beams).map((b) => ({ id: b.id, mesh: beamOf(level, b) })),
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
 * Meshes of the walls (one per wall), floors, ceilings, beams and cupboards of a level for the 3D
 * view (spec 8.1), `d` being deriveLevel(level). Memoized like deriveLevel: by level identity,
 * and reused by a new Level whose geometry inputs are the very same objects (e.g. while furniture
 * moves). Each part is also memoized on its own inputs: walls, floors and ceilings on the derived
 * level, walls, openings, height and slopes; each beam and each cupboard on itself and what it
 * depends on, so that adding a cupboard does not rebuild the walls. A boolean failure gives a
 * simplified part (see walls.ts, cells.ts); a cupboard on a missing wall is left out.
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
