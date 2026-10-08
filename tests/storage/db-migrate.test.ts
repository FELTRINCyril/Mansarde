import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { validateProject } from '@/core/commands/validate';
import { newId } from '@/core/model/ids';
import { openDb, ProjectStore } from '@/storage/db';
import { v1Project } from '../core/v1Fixture';

describe('ProjectStore and V1 data', () => {
  it('ProjectStore migrates a stored V1 project on read', async () => {
    const db = await openDb(newId());
    // written straight into the object store, as the V1 app left it
    const stored = v1Project();
    await db.put('projects', stored);
    const store = new ProjectStore(db);

    const p = await store.getProject('p1');
    expect(p).not.toBeNull();
    expect(p!.formatVersion).toBe(2);
    expect(p!.levels[0]!.slopes).toEqual({});
    expect(p!.levels[0]!.beams).toEqual({});
    expect(p!.levels[0]!.cupboards).toEqual({});
    expect(p!.levels[0]!.objects.chair!.pose).toBe('tuckable');
    expect(p!.customObjects.c1!.pose).toBe('covering');
    expect(validateProject(p!)).toEqual([]);

    expect(await store.listProjects()).toEqual([
      { id: 'p1', name: 'Maison V1', updatedAt: '2026-01-02T00:00:00.000Z', levelCount: 1 },
    ]);
  });

  it('listProjects lists stored V1 projects alongside V2 ones', async () => {
    const db = await openDb(newId());
    const store = new ProjectStore(db);
    await db.put('projects', v1Project());
    const v2 = (await store.getProject('p1'))!;
    await store.saveProject({ ...v2, id: 'p2', name: 'Copie', updatedAt: '2026-01-03T00:00:00.000Z' });
    const metas = await store.listProjects();
    expect(metas.map((m) => m.id)).toEqual(['p2', 'p1']);
    expect(metas.every((m) => m.levelCount === 1)).toBe(true);
  });

  it('a stored project is saved back as V2', async () => {
    const db = await openDb(newId());
    const store = new ProjectStore(db);
    await db.put('projects', v1Project());
    await store.saveProject((await store.getProject('p1'))!);
    const raw = await db.get('projects', 'p1');
    expect(raw.formatVersion).toBe(2);
    expect(raw.levels[0].slopes).toEqual({});
  });
});
