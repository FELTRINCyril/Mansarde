import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Project } from '@/core/model/types';
import { openDb, ProjectStore, type StoredImage } from '@/storage/db';

let store: ProjectStore;

beforeEach(async () => {
  store = new ProjectStore(await openDb(newId()));
});

function projectAt(name: string, updatedAt: string): Project {
  const p = createProject(name);
  p.updatedAt = updatedAt;
  return p;
}

function image(projectId: string, bytes = [1, 2, 3]): StoredImage {
  return {
    id: newId(), projectId, mime: 'image/png',
    blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }),
    widthPx: 10, heightPx: 20,
  };
}

function withBackground(p: Project, imageId: string): Project {
  p.levels[0]!.background = {
    imageId, widthPx: 10, heightPx: 20, scale: 1, x: 0, y: 0, rotation: 0,
    opacity: 1, locked: false, visible: true,
  };
  return p;
}

async function bytesOf(b: Blob): Promise<number[]> {
  return [...new Uint8Array(await b.arrayBuffer())];
}

describe('ProjectStore', () => {
  it('saves and gets a project', async () => {
    const p = projectAt('A', '2026-01-01T00:00:00.000Z');
    await store.saveProject(p);
    expect(await store.getProject(p.id)).toEqual(p);
    expect(await store.getProject('nope')).toBeNull();
  });

  it('overwrites on save with the same id', async () => {
    const p = projectAt('A', '2026-01-01T00:00:00.000Z');
    await store.saveProject(p);
    await store.saveProject({ ...p, name: 'B' });
    expect((await store.getProject(p.id))!.name).toBe('B');
    expect(await store.listProjects()).toHaveLength(1);
  });

  it('lists metadata sorted by updatedAt descending', async () => {
    const a = projectAt('A', '2026-01-01T00:00:00.000Z');
    const b = projectAt('B', '2026-03-01T00:00:00.000Z');
    const c = projectAt('C', '2026-02-01T00:00:00.000Z');
    c.levels.push({ ...c.levels[0]!, id: newId() });
    for (const p of [a, b, c]) await store.saveProject(p);
    expect(await store.listProjects()).toEqual([
      { readable: true, id: b.id, name: 'B', updatedAt: b.updatedAt, levelCount: 1 },
      { readable: true, id: c.id, name: 'C', updatedAt: c.updatedAt, levelCount: 2 },
      { readable: true, id: a.id, name: 'A', updatedAt: a.updatedAt, levelCount: 1 },
    ]);
  });

  it('stores and reads images with their blob content', async () => {
    const p = projectAt('A', '2026-01-01T00:00:00.000Z');
    const img = image(p.id, [9, 8, 7, 6]);
    await store.putImage(img);
    const got = (await store.getImage(img.id))!;
    expect(got.id).toBe(img.id);
    expect(got.projectId).toBe(p.id);
    expect(got.mime).toBe('image/png');
    expect([got.widthPx, got.heightPx]).toEqual([10, 20]);
    expect(got.blob).toBeInstanceOf(Blob);
    expect(got.blob.type).toBe('image/png');
    expect(await bytesOf(got.blob)).toEqual([9, 8, 7, 6]);
    expect(await store.getImage('nope')).toBeNull();
  });

  it('lists images of a project only', async () => {
    const p = projectAt('A', '2026-01-01T00:00:00.000Z');
    const q = projectAt('B', '2026-01-01T00:00:00.000Z');
    const i1 = image(p.id);
    const i2 = image(p.id);
    const i3 = image(q.id);
    for (const i of [i1, i2, i3]) await store.putImage(i);
    expect((await store.listImages(p.id)).map((i) => i.id).sort()).toEqual([i1.id, i2.id].sort());
    expect((await store.listImages(q.id)).map((i) => i.id)).toEqual([i3.id]);
  });

  it('deleteProject removes the project and its images only', async () => {
    const p = projectAt('A', '2026-01-01T00:00:00.000Z');
    const q = projectAt('B', '2026-01-01T00:00:00.000Z');
    await store.saveProject(p);
    await store.saveProject(q);
    const ip = image(p.id);
    const iq = image(q.id);
    await store.putImage(ip);
    await store.putImage(iq);
    await store.deleteProject(p.id);
    expect(await store.getProject(p.id)).toBeNull();
    expect(await store.getImage(ip.id)).toBeNull();
    expect(await store.getProject(q.id)).not.toBeNull();
    expect(await store.getImage(iq.id)).not.toBeNull();
  });

  it('deleteUnreferencedImages removes only unreferenced images of that project', async () => {
    const p = projectAt('A', '2026-01-01T00:00:00.000Z');
    const other = projectAt('B', '2026-01-01T00:00:00.000Z');
    const kept = image(p.id);
    const orphan1 = image(p.id);
    const orphan2 = image(p.id);
    const foreign = image(other.id);
    for (const i of [kept, orphan1, orphan2, foreign]) await store.putImage(i);
    withBackground(p, kept.id);
    expect(await store.deleteUnreferencedImages(p)).toBe(2);
    expect((await store.listImages(p.id)).map((i) => i.id)).toEqual([kept.id]);
    expect(await store.getImage(foreign.id)).not.toBeNull();
    expect(await store.deleteUnreferencedImages(p)).toBe(0);
  });
});
