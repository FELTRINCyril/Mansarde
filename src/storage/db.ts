import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Id, Project } from '@/core/model/types';
import { canMigrateFrom, migrateStoredProject } from '@/core/persistence/migrate';

/**
 * A project of the home list. An unreadable one (format version this app cannot read, or a record
 * without levels) is listed too, so that it can be deleted: its name and date only when they are
 * strings in the record.
 */
export type ProjectMeta =
  | { readable: true; id: Id; name: string; updatedAt: string; levelCount: number }
  | { readable: false; id: Id; name: string | null; updatedAt: string | null };
export interface StoredImage { id: Id; projectId: Id; mime: string; blob: Blob; widthPx: number; heightPx: number }

const DEFAULT_DB_NAME = 'plan-maison';
const DB_VERSION = 1;

export function openDb(name: string = DEFAULT_DB_NAME): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' });
      const images = db.createObjectStore('images', { keyPath: 'id' });
      images.createIndex('byProject', 'projectId');
    },
  });
}

/** Stored record as read from IndexedDB: possibly written by an older (or unknown) version of the app, or damaged. */
type StoredRecord = { id: Id; name?: unknown; updatedAt?: unknown; levels?: unknown; formatVersion?: unknown };

/**
 * False (with a console error) for a record this version of the app cannot read: unknown format
 * version, or no levels array (every format version has one).
 */
function readableRecord(r: StoredRecord): boolean {
  if (!canMigrateFrom(r.formatVersion)) {
    console.error(`Stored project ${String(r.id)} has an unreadable format version: ${String(r.formatVersion)}`);
    return false;
  }
  if (!Array.isArray(r.levels)) {
    console.error(`Stored project ${String(r.id)} has no levels array`);
    return false;
  }
  return true;
}

const stringOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function metaOf(r: StoredRecord): ProjectMeta {
  const name = stringOrNull(r.name);
  const updatedAt = stringOrNull(r.updatedAt);
  if (readableRecord(r) && name !== null && updatedAt !== null) {
    return { readable: true, id: r.id, name, updatedAt, levelCount: (r.levels as unknown[]).length };
  }
  return { readable: false, id: r.id, name, updatedAt };
}

/** Most recent first; a project without a date last. */
function byUpdatedAtDesc(a: ProjectMeta, b: ProjectMeta): number {
  if (a.updatedAt === b.updatedAt) return 0;
  if (a.updatedAt === null) return 1;
  if (b.updatedAt === null) return -1;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

export class ProjectStore {
  private readonly db: IDBPDatabase;

  constructor(db: IDBPDatabase) {
    this.db = db;
  }

  /**
   * Metadata of every stored project. The fields read here (id, name, updatedAt, levels) exist in
   * every format version, so nothing is migrated. A record this app cannot read is listed as
   * unreadable (and logged) instead of breaking the whole list or being hidden: it can be deleted.
   */
  async listProjects(): Promise<ProjectMeta[]> {
    const all = (await this.db.getAll('projects')) as StoredRecord[];
    return all.map(metaOf).sort(byUpdatedAtDesc);
  }

  /**
   * The project at the current format version: a project saved by an older version of the app is
   * migrated on read (the store itself is only rewritten by the next save). Null when absent, or
   * (logged) when its format version cannot be read or its migration fails.
   */
  async getProject(id: Id): Promise<Project | null> {
    const stored = (await this.db.get('projects', id)) as StoredRecord | undefined;
    if (!stored || !readableRecord(stored)) return null;
    try {
      return migrateStoredProject(stored as { formatVersion: number }) as Project;
    } catch (e) {
      console.error(`Stored project ${String(id)} cannot be migrated`, e);
      return null;
    }
  }

  async saveProject(p: Project): Promise<void> {
    await this.db.put('projects', p);
  }

  /** Deletes the project and all its images in one transaction. */
  async deleteProject(id: Id): Promise<void> {
    const tx = this.db.transaction(['projects', 'images'], 'readwrite');
    const imageKeys = await tx.objectStore('images').index('byProject').getAllKeys(id);
    await Promise.all([
      tx.objectStore('projects').delete(id),
      ...imageKeys.map((k) => tx.objectStore('images').delete(k)),
      tx.done,
    ]);
  }

  async putImage(img: StoredImage): Promise<void> {
    await this.db.put('images', img);
  }

  async getImage(id: Id): Promise<StoredImage | null> {
    return ((await this.db.get('images', id)) as StoredImage | undefined) ?? null;
  }

  async listImages(projectId: Id): Promise<StoredImage[]> {
    return (await this.db.getAllFromIndex('images', 'byProject', projectId)) as StoredImage[];
  }

  /** Removes the project's images that no level background references; returns how many were removed. */
  async deleteUnreferencedImages(p: Project): Promise<number> {
    const referenced = new Set<Id>();
    for (const level of p.levels) if (level.background) referenced.add(level.background.imageId);
    const tx = this.db.transaction('images', 'readwrite');
    const keys = await tx.store.index('byProject').getAllKeys(p.id);
    const orphans = keys.filter((k) => !referenced.has(k as Id));
    await Promise.all([...orphans.map((k) => tx.store.delete(k)), tx.done]);
    return orphans.length;
  }
}
