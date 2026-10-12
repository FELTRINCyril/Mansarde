import { Group, Mesh } from 'three';
import type { DerivedLevel } from '@/core/geometry/derived';
import { buildLevelMeshes, type CupboardParts } from '@/core/mesh';
import type { Id, Level } from '@/core/model/types';
import { buildCupboardGroup } from './levelMeshes';
import type { Materials } from './materials';

/*
 * Targeted updates of the 3D view (spec 8.3), by identity keys: levels are immutable and share
 * every unchanged part (Immer), so a part whose inputs are the very same objects is kept.
 * - structure (walls with their doors and windows, floors, ceilings, beams, slab, lamps): the
 *   nodes, walls, openings, room labels, slopes, beams, height and elevation of the level;
 * - each object: its own PlacedObject (and custom definition), FurnitureLayer (furniture/index.ts);
 * - each cupboard: its CupboardParts from buildLevelMeshes, memoized there on the cupboard, its
 *   wall and nodes (and the ceiling in 'ceiling' mode), CupboardLayer below.
 */

/** Level fields the structure view depends on; the objects, cupboards, dimensions and names do not matter. */
export const STRUCTURE_KEYS = ['nodes', 'walls', 'openings', 'roomLabels', 'slopes', 'beams', 'height', 'elevation'] as const;

/** True when both levels have the same structure (same level, every structure field the very same object). */
export const sameStructure = (a: Level, b: Level): boolean => a.id === b.id && STRUCTURE_KEYS.every((k) => a[k] === b[k]);

interface BuiltCupboard { parts: CupboardParts; color: string | undefined; group: Group }

/**
 * The cupboards of the shown level, one group each (`cupboard:<id>`), rebuilt only when their
 * parts (or color) changed; the replaced geometries are disposed. The root is at the level
 * elevation; the materials are the scene's (shared, never disposed here).
 */
export class CupboardLayer {
  readonly root = new Group();
  private readonly built = new Map<Id, BuiltCupboard>();
  private levelId: Id | null = null;
  /** Number of cupboard groups built since the start (tests, scene3dStats). */
  buildCount = 0;

  private readonly mats: Materials;

  constructor(mats: Materials) {
    this.mats = mats;
    this.root.name = 'cupboards';
  }

  /** Shows the cupboards of `level` (null: none). True when a group was added or removed. */
  sync(level: Level | null, d: DerivedLevel | null): boolean {
    let changed = false;
    if (!level || level.id !== this.levelId) changed = this.clear();
    this.levelId = level?.id ?? null;
    if (!level || !d) return changed;
    this.root.position.y = level.elevation / 100;
    const parts = new Map(buildLevelMeshes(level, d).cupboards.map((c) => [c.id, c.parts]));
    for (const [id, b] of this.built) {
      if (parts.get(id) === b.parts && level.cupboards[id]?.color === b.color) continue;
      this.remove(id);
      changed = true;
    }
    for (const [id, p] of parts) {
      if (this.built.has(id)) continue;
      const c = level.cupboards[id];
      const group = buildCupboardGroup(id, c, p, this.mats);
      this.buildCount++;
      this.root.add(group);
      this.built.set(id, { parts: p, color: c?.color, group });
      changed = true;
    }
    return changed;
  }

  groupOf(id: Id): Group | undefined {
    return this.built.get(id)?.group;
  }

  private remove(id: Id): void {
    const b = this.built.get(id);
    if (!b) return;
    b.group.traverse((n) => {
      if (n instanceof Mesh) n.geometry.dispose();
    });
    b.group.removeFromParent();
    this.built.delete(id);
  }

  clear(): boolean {
    const any = this.built.size > 0;
    for (const id of [...this.built.keys()]) this.remove(id);
    return any;
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}
