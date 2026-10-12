import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Group, Light, Mesh, PointLight, Shape as ThreeShape, Vector2, type Material, type Object3D } from 'three';
import { ceilingWithoutBeams } from '@/core/geometry/ceiling';
import type { DerivedLevel } from '@/core/geometry/derived';
import { signedArea } from '@/core/geometry/polygon';
import { buildLevelMeshes, type CupboardParts, type MeshData } from '@/core/mesh';
import type { Cupboard, Id, Level, Ring } from '@/core/model/types';
import type { Materials } from './materials';
import { buildOpening } from './openings';

/** Indexed BufferGeometry of a core mesh (meters, y up; core/mesh/types.ts). */
export function toGeometry(m: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(m.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(m.uvs, 2));
  g.setIndex(m.indices);
  g.computeBoundingSphere();
  return g;
}

/** Thickness of the slab under the level (m), as plan-chambre; its top stays just under the floor. */
const SLAB = 0.1;
const SLAB_TOP = -0.002;
/** Floors are lifted a little above the slab top and the wall bottoms (plan-chambre lifts them by 1 mm). */
const FLOOR_LIFT = 0.001;

/**
 * plan-chambre lights its room with a warm ceiling lamp (PointLight '#ffd9a0', 2.2, decay 2, 25 cm
 * under the 2.40 m ceiling): one per room here, at its label point, for the largest rooms only
 * (each light costs shader time on every pixel).
 */
const LAMP = { color: '#ffd9a0', intensity: 2.2, below: 25, max: 6 } as const;

/**
 * Options of a level view; `lower`: a lower level (walls, slab and floors only, spec 8.3);
 * `cupboards: false`: the cupboards are left to a CupboardLayer (sync.ts), which rebuilds them one
 * by one.
 */
export interface LevelViewOptions { lower?: boolean; cupboards?: boolean }

/**
 * The 3D view of one level, at its elevation. Walls are one group per wall (`wall:<id>`, with its
 * doors and windows), so that a single wall can be hidden (task 13); `furniture` is the hook point
 * of the furniture builders (task 12).
 */
export interface LevelView {
  root: Group;
  walls: Group;
  wallGroups: Map<Id, Group>;
  floors: Group;
  ceilings: Group;
  beams: Group;
  cupboards: Group;
  furniture: Group;
  slab: Group;
  lamps: Group;
  dispose(): void;
}

function meshOf(m: MeshData, material: Material, opts: { cast: boolean; receive?: boolean }): Mesh | null {
  if (m.indices.length === 0) return null;
  const mesh = new Mesh(toGeometry(m), material);
  mesh.castShadow = opts.cast;
  mesh.receiveShadow = opts.receive ?? true;
  return mesh;
}

/** Slab outline: the outer rings of the walls shape (rooms included, room islands excluded). */
function slabGeometry(rings: Ring[]): ExtrudeGeometry | null {
  const shapes = rings
    .filter((r) => r.length >= 3 && Math.abs(signedArea(r)) > 1)
    .map((r) => new ThreeShape((signedArea(r) > 0 ? r : [...r].reverse()).map((p) => new Vector2(p.x / 100, p.y / 100))));
  if (shapes.length === 0) return null;
  const g = new ExtrudeGeometry(shapes, { depth: SLAB, bevelEnabled: false });
  // shape (x, y) -> (x, z), extrusion depth -> downwards
  g.rotateX(Math.PI / 2);
  g.translate(0, SLAB_TOP, 0);
  return g;
}

const group = (name: string): Group => {
  const g = new Group();
  g.name = name;
  return g;
};

/**
 * Builds the view of a level from buildLevelMeshes (walls, floors, ceilings, beams, cupboards),
 * the openings (openings.ts) and a slab. Walls, ceilings and beams cast no shadow (as in
 * plan-chambre, where only the furniture does), floors and walls receive them.
 */
export function buildLevelView(level: Level, d: DerivedLevel, mats: Materials, opts: LevelViewOptions = {}): LevelView {
  const lm = buildLevelMeshes(level, d);
  const root = group(`level:${level.id}`);
  root.position.y = level.elevation / 100;
  const walls = group('walls');
  const wallGroups = new Map<Id, Group>();
  const floors = group('floors');
  const ceilings = group('ceilings');
  const beams = group('beams');
  const cupboards = group('cupboards');
  const furniture = group('furniture');
  const slab = group('slab');
  const lamps = group('lamps');
  root.add(slab, floors, walls, ceilings, beams, cupboards, furniture, lamps);

  for (const { wallId, mesh } of lm.walls) {
    const g = group(`wall:${wallId}`);
    g.userData = { wallId };
    const m = meshOf(mesh, mats.wall, { cast: false });
    if (m) g.add(m);
    wallGroups.set(wallId, g);
    walls.add(g);
  }
  if (!opts.lower) {
    for (const o of Object.values(level.openings)) {
      const g = buildOpening(level, o, d.rooms, mats);
      if (g) (wallGroups.get(o.wallId) ?? walls).add(g);
    }
  }
  for (const { roomKey, mesh } of lm.floors) {
    const m = meshOf(mesh, mats.floor, { cast: false });
    if (!m) continue;
    m.position.y = FLOOR_LIFT;
    m.userData = { roomKey };
    floors.add(m);
  }
  const s = slabGeometry(d.facadeRings);
  if (s) {
    const m = new Mesh(s, mats.slab);
    m.receiveShadow = true;
    slab.add(m);
  }
  if (!opts.lower) {
    for (const { roomKey, mesh } of lm.ceilings) {
      const m = meshOf(mesh, mats.ceiling, { cast: false });
      if (!m) continue;
      m.userData = { roomKey };
      ceilings.add(m);
    }
    for (const room of [...d.rooms].sort((a, b) => b.area - a.area).slice(0, LAMP.max)) {
      const lamp = new PointLight(LAMP.color, LAMP.intensity, 0, 2);
      const p = room.labelPoint;
      lamp.position.set(p.x / 100, Math.max(0, ceilingWithoutBeams(level, p) - LAMP.below) / 100, p.y / 100);
      lamp.userData = { roomKey: room.key };
      lamps.add(lamp);
    }
    for (const { id, mesh } of lm.beams) {
      const m = meshOf(mesh, mats.beam, { cast: false });
      if (!m) continue;
      m.name = `beam:${id}`;
      m.userData = { beamId: id };
      beams.add(m);
    }
    if (opts.cupboards !== false) for (const { id, parts } of lm.cupboards) cupboards.add(buildCupboardGroup(id, level.cupboards[id], parts, mats));
  }
  return {
    root,
    walls,
    wallGroups,
    floors,
    ceilings,
    beams,
    cupboards,
    furniture,
    slab,
    lamps,
    dispose: () => disposeTree(root),
  };
}

/** The group of a cupboard (`cupboard:<id>`): body and doors in its color, handles; in the level frame. */
export function buildCupboardGroup(id: Id, c: Cupboard | undefined, parts: CupboardParts, mats: Materials): Group {
  const g = group(`cupboard:${id}`);
  g.userData = { cupboardId: id };
  const material = mats.cupboard(c?.color ?? '#e8e1d4');
  const body = meshOf(parts.body, material, { cast: true });
  if (body) g.add(body);
  for (const door of parts.doors) {
    const m = meshOf(door, material, { cast: true });
    if (m) g.add(m);
  }
  const handles = meshOf(parts.handles, mats.handle, { cast: true });
  if (handles) g.add(handles);
  return g;
}

/** Disposes the geometries and lights of a tree (materials are shared: disposed with the scene) and detaches it. */
export function disposeTree(root: Object3D): void {
  root.traverse((o) => {
    if (o instanceof Mesh) o.geometry.dispose();
    if (o instanceof Light) o.dispose();
  });
  root.removeFromParent();
}
