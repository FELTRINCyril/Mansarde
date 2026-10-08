import { openDB } from 'idb';
import type { IDBPDatabase } from 'idb';
import type { Id, Project } from '@/core/model/types';
import { migrateStoredProject } from '@/core/persistence/migrate';

export interface ProjectMeta { id: Id; name: string; updatedAt: string; levelCount: number }
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

/**
 * Projects saved by an older version of the app are migrated on every read (the store itself is
 * only rewritten by the next save): an app update never leaves a stored project unreadable.
 */
function toCurrentFormat(stored: Project): Project {
  return migrateStoredProject(stored) as Project;
}

export class ProjectStore {
  private readonly db: IDBPDatabase;

  constructor(db: IDBPDatabase) {
    this.db = db;
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const all = ((await this.db.getAll('projects')) as Project[]).map(toCurrentFormat);
    return all
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, levelCount: p.levels.length }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async getProject(id: Id): Promise<Project | null> {
    const stored = (await this.db.get('projects', id)) as Project | undefined;
    return stored ? toCurrentFormat(stored) : null;
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
