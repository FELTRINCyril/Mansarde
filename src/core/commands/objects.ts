import type { Draft } from 'immer';
import { newId } from '../model/ids';
import { OBJECT_POSES } from '../model/types';
import type { Id, Level, ObjectPose, PlacedObject, Project, Vec2 } from '../model/types';
import { CommandError, getLevel, touch, type Recipe } from './apply';

const ERR_OBJECT_NOT_FOUND = 'Objet introuvable';
const ERR_SIZE = 'Dimension invalide';
const ERR_POSITION = 'Position invalide';
const ERR_POSE = 'Pose invalide';

type DLevel = Draft<Level>;

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;

export const normalizeRotation = (deg: number): number => ((deg % 360) + 360) % 360;

function requireObject(level: DLevel, id: Id): Draft<PlacedObject> {
  const o = level.objects[id];
  if (!o) throw new CommandError(ERR_OBJECT_NOT_FOUND);
  return o;
}

function requireSize(o: Pick<PlacedObject, 'width' | 'depth' | 'height' | 'elevation' | 'lshape'>): void {
  if (!isPositive(o.width) || !isPositive(o.depth) || !isPositive(o.height)) throw new CommandError(ERR_SIZE);
  if (!Number.isFinite(o.elevation) || o.elevation < 0) throw new CommandError(ERR_SIZE);
  if (o.lshape && (!isPositive(o.lshape.notchWidth) || !isPositive(o.lshape.notchDepth))) {
    throw new CommandError(ERR_SIZE);
  }
}

function requirePose(pose: unknown): void {
  if (!(OBJECT_POSES as readonly unknown[]).includes(pose as ObjectPose)) throw new CommandError(ERR_POSE);
}

function requireFinitePoint(p: Vec2): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new CommandError(ERR_POSITION);
}

/** Checks everything a placed object must satisfy before it enters the project. */
function requireValidObject(draft: Draft<Project>, o: PlacedObject): void {
  requireSize(o);
  requireFinitePoint(o);
  if (!Number.isFinite(o.rotation)) throw new CommandError(ERR_POSITION);
  requirePose(o.pose);
  if (o.source.kind === 'custom' && !draft.customObjects[o.source.customObjectId]) {
    throw new CommandError(ERR_OBJECT_NOT_FOUND);
  }
}

function removeObjects(level: DLevel, ids: Iterable<Id>): void {
  const removed = new Set(ids);
  for (const id of removed) delete level.objects[id];
  for (const dim of Object.values(level.dimensions)) {
    const hit = [dim.a, dim.b].some((a) => a.kind === 'objectCorner' && removed.has(a.objectId));
    if (hit) delete level.dimensions[dim.id];
  }
}

export function addObject(levelId: Id, obj: PlacedObject): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireValidObject(draft, obj);
    level.objects[obj.id] = { ...structuredClone(obj), rotation: normalizeRotation(obj.rotation) };
    touch(draft);
  };
}

export function moveObjects(levelId: Id, ids: Id[], delta: Vec2): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireFinitePoint(delta);
    const objects = ids.map((id) => requireObject(level, id));
    if (objects.length === 0 || (delta.x === 0 && delta.y === 0)) return;
    for (const o of new Set(objects)) {
      o.x += delta.x;
      o.y += delta.y;
    }
    touch(draft);
  };
}

/** Rotation is normalized to [0, 360). */
export function setObjectTransform(levelId: Id, id: Id, t: { x?: number; y?: number; rotation?: number }): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const o = requireObject(level, id);
    for (const v of [t.x, t.y, t.rotation]) {
      if (v !== undefined && !Number.isFinite(v)) throw new CommandError(ERR_POSITION);
    }
    const next = {
      x: t.x ?? o.x,
      y: t.y ?? o.y,
      rotation: t.rotation === undefined ? o.rotation : normalizeRotation(t.rotation),
    };
    if (next.x === o.x && next.y === o.y && next.rotation === o.rotation) return;
    o.x = next.x;
    o.y = next.y;
    o.rotation = next.rotation;
    touch(draft);
  };
}

/** width, depth and height must be finite and positive, elevation finite and >= 0, pose one of OBJECT_POSES. */
export function updateObject(
  levelId: Id,
  id: Id,
  patch: Partial<Omit<PlacedObject, 'id' | 'source'>>,
): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const o = requireObject(level, id);
    const changes = Object.entries(patch).filter(
      ([key, value]) => value !== undefined && key !== 'id' && key !== 'source',
    ) as Array<[keyof PlacedObject, unknown]>;
    const next: PlacedObject = { ...o, ...Object.fromEntries(changes) };
    requireSize(next);
    requireFinitePoint(next);
    if (!Number.isFinite(next.rotation)) throw new CommandError(ERR_POSITION);
    requirePose(next.pose);
    next.rotation = normalizeRotation(next.rotation);

    let changed = false;
    for (const [key] of changes) {
      if (key === 'id' || key === 'source') continue;
      const value = next[key];
      if (JSON.stringify(o[key]) === JSON.stringify(value)) continue;
      (o as Record<string, unknown>)[key] = structuredClone(value);
      changed = true;
    }
    if (changed) touch(draft);
  };
}

/** Also deletes the manual dimensions anchored to these objects. */
export function deleteObjects(levelId: Id, ids: Id[]): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    for (const id of ids) requireObject(level, id);
    if (ids.length === 0) return;
    removeObjects(level, ids);
    touch(draft);
  };
}

/** Adds copies of the objects (new ids) shifted by delta; out.ids receives the new ids in order. */
export function pasteObjects(levelId: Id, objects: PlacedObject[], delta: Vec2, out?: { ids: Id[] }): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    requireFinitePoint(delta);
    for (const o of objects) requireValidObject(draft, o);
    const ids: Id[] = [];
    for (const o of objects) {
      const id = newId();
      level.objects[id] = {
        ...structuredClone(o),
        id,
        x: o.x + delta.x,
        y: o.y + delta.y,
        rotation: normalizeRotation(o.rotation),
      };
      ids.push(id);
    }
    if (out) out.ids = ids;
    if (ids.length > 0) touch(draft);
  };
}
