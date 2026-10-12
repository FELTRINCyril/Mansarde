import { getCatalogEntry } from '../../catalog/catalog';
import { FORMAT_VERSION } from '../model/types';
import type { ObjectPose } from '../model/types';

// Migrations run BEFORE schema validation, on untrusted data: every step only rewrites the parts
// that have the expected shape and leaves anything else untouched, so that the schema reports the
// real problem afterwards instead of the migration throwing.

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Same record with every value that is an object passed through f (other values kept). */
function mapValues(rec: unknown, f: (v: Rec) => Rec): unknown {
  if (!isRec(rec)) return rec;
  // fromEntries defines own properties: a "__proto__" key stays a plain key (no prototype change)
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, isRec(v) ? f(v) : v]));
}

/** True when the name contains "tapis", whatever the case and the accents. */
function namesARug(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes('tapis');
}

/** Pose of a generic shape or a custom object: a rug covers the floor, anything else stands on it. */
const poseByName = (name: unknown): ObjectPose => (namesARug(name) ? 'covering' : 'floor');

/**
 * V1 objects had no pose. A catalog symbol takes the pose of its catalog entry; a generic shape
 * (rectangle, circle, L), a custom object or an unknown catalog id stands on the floor, unless its
 * name says it is a rug.
 */
function poseOfV1Object(o: Rec): ObjectPose {
  const source = o.source;
  if (isRec(source) && source.kind === 'catalog' && typeof source.catalogId === 'string') {
    const entry = getCatalogEntry(source.catalogId);
    if (entry && entry.shape === 'symbol') return entry.pose;
  }
  return poseByName(o.name);
}

function migrateLevel1to2(level: Rec): Rec {
  return {
    ...level,
    objects: mapValues(level.objects, (o) => ({ ...o, pose: poseOfV1Object(o) })),
    slopes: {},
    beams: {},
    cupboards: {},
  };
}

function migrateProject1to2(project: unknown): unknown {
  if (!isRec(project)) return project;
  return {
    ...project,
    formatVersion: 2,
    levels: Array.isArray(project.levels) ? project.levels.map((l: unknown) => (isRec(l) ? migrateLevel1to2(l) : l)) : project.levels,
    customObjects: mapValues(project.customObjects, (d) => ({ ...d, pose: poseByName(d.name) })),
  };
}

/**
 * Migrations of the export file, keyed by the version they upgrade FROM.
 * migrations[n] receives the raw parsed file at version n and returns it at version n + 1
 * (including project.formatVersion). Pure: the input is never modified.
 */
export const migrations: Record<number, (raw: any) => any> = {
  // V2: roof slopes, beams and cupboards per level; a pose on every object and custom definition
  1: (raw: Rec) => ({ ...raw, formatVersion: 2, project: migrateProject1to2(raw.project) }),
};

/** Applies every migration from raw.formatVersion up to FORMAT_VERSION. */
export function migrate(raw: { formatVersion: number }): unknown {
  let current: { formatVersion: number } = raw;
  for (let v = raw.formatVersion; v < FORMAT_VERSION; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`Missing migration from format version ${v}`);
    current = step(current);
  }
  return current;
}

/**
 * True when data at that format version can be brought up to FORMAT_VERSION: an integer from 1 to
 * FORMAT_VERSION with every intermediate migration registered.
 */
export function canMigrateFrom(version: unknown): version is number {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > FORMAT_VERSION) return false;
  for (let v = version; v < FORMAT_VERSION; v++) if (!Object.hasOwn(migrations, v)) return false;
  return true;
}

/**
 * Brings a project stored by an older version of the app (IndexedDB) up to FORMAT_VERSION, through
 * the same migrations as the export files. A current project is returned as is (same object).
 */
export function migrateStoredProject(project: { formatVersion: number }): unknown {
  if (!(project.formatVersion < FORMAT_VERSION)) return project;
  const file = migrate({ formatVersion: project.formatVersion, project } as { formatVersion: number }) as { project: unknown };
  return file.project;
}
