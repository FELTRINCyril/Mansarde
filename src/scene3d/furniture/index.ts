import { Box3, Group, Mesh, type Material, type Object3D } from 'three';
import { getCatalogEntry } from '@/catalog/catalog';
import { objectShape } from '@/core/geometry/objects';
import { deg2rad } from '@/core/geometry/vec';
import type { CustomObjectDef, Id, Level, PlacedObject } from '@/core/model/types';
import { MAIN_MATERIAL, type ModelLibrary } from '../models';
import { bathtub, shower, washbasin, washingMachine, wc } from './bathroom';
import { bed, crib } from './beds';
import { lamp, plant, rugRect, rugRound, tv, tvWall } from './decor';
import { genericBuilder } from './generic';
import { cooktop, counter, dishwasher, fridge, microwave, sink } from './kitchen';
import type { Builder, FurnitureSpec, Kit } from './parts';
import { armchair, chair, pouf, sofa2, sofa3, sofaCorner } from './seating';
import { stairsQuarter, stairsStraight } from './structure';
import { bookcase, displayCabinet, dresser, nightstand, shelfWall, tvUnit, wardrobe } from './storage';
import { coffeeTable, desk, tableRect, tableRound } from './tables';

export { Kit } from './parts';
export type { Builder, FurnitureSpec } from './parts';

/** Builder of each catalog entry drawn by a symbol (the generic entries use genericBuilder). */
export const BUILDERS: Record<string, Builder> = {
  'bed-90': bed,
  'bed-140': bed,
  'bed-160': bed,
  'bed-180': bed,
  nightstand,
  wardrobe,
  dresser,
  crib,
  'bedside-lamp': lamp,
  'sofa-2': sofa2,
  'sofa-3': sofa3,
  'sofa-corner': sofaCorner,
  armchair,
  'coffee-table': coffeeTable,
  'tv-unit': tvUnit,
  bookcase,
  'display-cabinet': displayCabinet,
  tv,
  'tv-wall': tvWall,
  'shelf-wall': shelfWall,
  'rug-round': rugRound,
  'rug-rect': rugRect,
  plant,
  pouf,
  desk,
  chair,
  'table-rect': tableRect,
  'table-round': tableRound,
  counter,
  sink,
  cooktop,
  fridge,
  dishwasher,
  microwave,
  wc,
  washbasin,
  shower,
  bathtub,
  'washing-machine': washingMachine,
  'stairs-straight': stairsStraight,
  'stairs-quarter': stairsQuarter,
};

/** Tolerance of the box check (m): a builder may overhang its box by 1 cm. */
const BOX_TOLERANCE = 0.01;

/** The builder of an object: its catalog symbol, else its generic shape (custom objects, generic entries, unknown ids). */
function builderOf(o: PlacedObject, customObjects: Record<Id, CustomObjectDef>): Builder {
  const shape = objectShape(o, customObjects);
  if (shape !== 'symbol') return genericBuilder(shape, o.lshape);
  const b = o.source.kind === 'catalog' ? BUILDERS[o.source.catalogId] : undefined;
  return b ?? genericBuilder('rect', null);
}

/** Size and color of an object for its builder; `custom` when its color is not its catalog entry's default. */
export function specOf(o: PlacedObject): FurnitureSpec {
  const entry = o.source.kind === 'catalog' ? getCatalogEntry(o.source.catalogId) : undefined;
  const custom = !entry || entry.color.toLowerCase() !== o.color.toLowerCase();
  return { w: o.width / 100, d: o.depth / 100, h: o.height / 100, color: o.color, custom };
}

/**
 * Keeps a built body in its box: an object much smaller than the details of its builder (a 10 cm
 * bed) is scaled down to its box, so that what is drawn never exceeds what the checks know.
 */
function fitToBox(body: Object3D, s: FurnitureSpec): void {
  const box = new Box3().setFromObject(body);
  if (box.isEmpty()) return;
  const t = BOX_TOLERANCE;
  const inside =
    box.min.x >= -s.w / 2 - t && box.max.x <= s.w / 2 + t && box.min.y >= -t && box.max.y <= s.h + t && box.min.z >= -s.d / 2 - t && box.max.z <= s.d / 2 + t;
  if (inside) return;
  const size = box.getSize(box.max.clone());
  const k = (want: number, got: number) => (got > want ? want / got : 1);
  const kx = k(s.w, size.x);
  const ky = k(s.h, size.y);
  const kz = k(s.d, size.z);
  const center = box.getCenter(box.min.clone());
  const wrapper = new Group();
  for (const c of [...body.children]) wrapper.add(c);
  // scale about the box center, then put the box back in [-w/2, w/2] x [0, h] x [-d/2, d/2]
  wrapper.scale.set(kx, ky, kz);
  wrapper.position.set(-center.x * kx, -box.min.y * ky, -center.z * kz);
  body.add(wrapper);
}

/** Catalog id of the downloaded model an object shows, if any. */
function modelIdOf(o: PlacedObject): string | null {
  if (o.source.kind !== 'catalog') return null;
  return getCatalogEntry(o.source.catalogId)?.model ? o.source.catalogId : null;
}

/**
 * Body of a downloaded model (spec 2026-10-13, section 7): a clone of its template (shared
 * geometries and materials) stretched from the unit box to w x h x d, its 'main' material in the
 * object's color when the user chose one. Null while the model is not loaded.
 */
function modelBody(id: string, s: FurnitureSpec, models: ModelLibrary): Group | null {
  const template = models.get(id);
  if (!template) return null;
  const body = new Group();
  const inst = template.clone(true);
  inst.scale.set(s.w, s.h, s.d);
  if (s.custom) {
    inst.traverse((n) => {
      if (!(n instanceof Mesh)) return;
      const swap = (m: Material) => (m.name === MAIN_MATERIAL ? models.tinted(id, m, s.color) : m);
      n.material = Array.isArray(n.material) ? n.material.map(swap) : swap(n.material);
    });
  }
  body.add(inst);
  return body;
}

/**
 * The 3D object of a placed object, in the frame of its level (meters, y up, plan y = z): a
 * group at (x, elevation, y) turned by -rotation about y (clockwise on the plan, spec 8.2), whose
 * `body` child carries the builder's meshes, mirrored on x when the object is. userData.objectId
 * names it for the alerts and the picking. A downloaded model not loaded yet (or without a
 * library, e.g. in unit tests) shows the generic box; `userData.waitingModel` then names the
 * model it waits for (absent once the load failed: the box stays).
 */
export function buildObject3D(o: PlacedObject, customObjects: Record<Id, CustomObjectDef>, kit: Kit, models: ModelLibrary | null = null): Group {
  const s = specOf(o);
  const g = new Group();
  g.name = `object:${o.id}`;
  g.userData = { objectId: o.id };
  g.position.set(o.x / 100, o.elevation / 100, o.y / 100);
  g.rotation.y = -deg2rad(o.rotation);
  const modelId = modelIdOf(o);
  let body = modelId && models ? modelBody(modelId, s, models) : null;
  if (!body) {
    body = builderOf(o, customObjects)(s, kit);
    if (modelId && models && !models.failed(modelId)) g.userData.waitingModel = modelId;
  }
  body.name = 'body';
  fitToBox(body, s);
  if (o.mirrored) body.scale.x = -1;
  g.add(body);
  return g;
}

/** Height (m) of an object's label above its top, as plan-chambre (18 cm). */
const LABEL_ABOVE = 0.18;

interface Built { o: PlacedObject; def: CustomObjectDef | undefined; group: Group; label: Object3D | null }

/**
 * The furniture of the shown level: one group per object (buildObject3D), rebuilt only when the
 * object (or its custom definition) changed, with its name label (labels.ts) above it. The root
 * is at the level elevation. `makeLabel` is null where there is no DOM (unit tests).
 */
export class FurnitureLayer {
  readonly root = new Group();
  private readonly built = new Map<Id, Built>();
  private readonly kit: Kit;
  private readonly models: ModelLibrary | null;
  private readonly makeLabel: ((text: string) => Object3D) | null;
  private readonly freeLabel: (label: Object3D) => void;
  private levelId: Id | null = null;
  /** Number of object groups built since the start (tests). */
  buildCount = 0;

  constructor(kit: Kit, labels: { make: (text: string) => Object3D; free: (label: Object3D) => void } | null, models: ModelLibrary | null = null) {
    this.kit = kit;
    this.models = models;
    this.makeLabel = labels?.make ?? null;
    this.freeLabel = labels?.free ?? (() => {});
    this.root.name = 'furniture';
  }

  /** Shows the objects of `level` (null: none). True when an object group was added or removed. */
  sync(level: Level | null, customObjects: Record<Id, CustomObjectDef>, showLabels: boolean): boolean {
    let changed = false;
    if (!level || level.id !== this.levelId) changed = this.clear();
    this.levelId = level?.id ?? null;
    if (!level) return changed;
    this.root.position.y = level.elevation / 100;
    for (const [id, b] of this.built) {
      const o = level.objects[id];
      const def = o?.source.kind === 'custom' ? customObjects[o.source.customObjectId] : undefined;
      const waiting = b.group.userData.waitingModel as string | undefined;
      // unchanged, and not waiting for a model that has arrived (or failed) since
      if (o === b.o && def === b.def && !(waiting && this.models?.settled(waiting))) continue;
      this.remove(id);
      changed = true;
    }
    for (const o of Object.values(level.objects)) {
      let b = this.built.get(o.id);
      if (!b) {
        const def = o.source.kind === 'custom' ? customObjects[o.source.customObjectId] : undefined;
        const group = buildObject3D(o, customObjects, this.kit, this.models);
        this.buildCount++;
        changed = true;
        let label: Object3D | null = null;
        // an object without a name gets no (empty) pill
        if (this.makeLabel && o.name.trim() !== '') {
          label = this.makeLabel(o.name);
          label.position.set(0, o.height / 100 + LABEL_ABOVE, 0);
          group.add(label);
        }
        this.root.add(group);
        b = { o, def, group, label };
        this.built.set(o.id, b);
      }
      if (b.label) b.label.visible = showLabels;
    }
    return changed;
  }

  /**
   * Disposes the kit materials no longer used by any object (after objects were rebuilt or
   * removed, e.g. a color changed): `alsoUsed` are materials held elsewhere, i.e. the originals
   * of the objects tinted by an alert (alerts.ts), which their meshes get back later.
   */
  purge(alsoUsed: Iterable<Material> = []): void {
    const used = new Set<Material>(alsoUsed);
    this.root.traverse((n) => {
      if (!(n instanceof Mesh)) return;
      for (const m of Array.isArray(n.material) ? n.material : [n.material]) used.add(m);
    });
    this.kit.purge(used);
    this.models?.purge(used);
  }

  /** The group of an object, if shown. */
  groupOf(id: Id): Group | undefined {
    return this.built.get(id)?.group;
  }

  /** Every object group by object id. */
  groups(): Map<Id, Group> {
    return new Map([...this.built].map(([id, b]) => [id, b.group]));
  }

  private remove(id: Id): void {
    const b = this.built.get(id);
    if (!b) return;
    if (b.label) this.freeLabel(b.label);
    // the geometries of a downloaded model belong to its template (ModelLibrary), not to the object
    b.group.traverse((n) => {
      if (n instanceof Mesh && !n.userData.sharedGeometry) n.geometry.dispose();
    });
    b.group.removeFromParent();
    this.built.delete(id);
  }

  /** Removes every object; true when there was one. */
  clear(): boolean {
    const any = this.built.size > 0;
    for (const id of [...this.built.keys()]) this.remove(id);
    return any;
  }

  /** Frees every geometry, label, material and texture of the furniture (downloaded models included). */
  dispose(): void {
    this.clear();
    this.root.removeFromParent();
    this.kit.dispose();
    this.models?.dispose();
  }
}
