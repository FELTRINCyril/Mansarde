import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProject } from '@/core/commands/validate';
import { newId } from '@/core/model/ids';
import { migrations } from '@/core/persistence/migrate';
import { openDb, ProjectStore } from '@/storage/db';
import { v1Project } from '../core/v1Fixture';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectStore and V1 data', () => {
  it('ProjectStore migrates a stored V1 project on read', async () => {
    const db = await openDb(newId());
    // written straight into the object store, as the V1 app left it
    await db.put('projects', v1Project());
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
    // reading does not rewrite the store
    expect((await db.get('projects', 'p1')).formatVersion).toBe(1);
  });

  it('listProjects lists a stored V1 record (metadata read from the raw record)', async () => {
    const db = await openDb(newId());
    const store = new ProjectStore(db);
    const v1 = v1Project();
    v1.levels.push({ ...structuredClone(v1.levels[0]), id: 'l2', name: 'Etage' });
    await db.put('projects', v1);
    const v2 = (await store.getProject('p1'))!;
    await store.saveProject({ ...v2, id: 'p2', name: 'Copie', updatedAt: '2026-01-03T00:00:00.000Z' });
    expect(await store.listProjects()).toEqual([
      { readable: true, id: 'p2', name: 'Copie', updatedAt: '2026-01-03T00:00:00.000Z', levelCount: 2 },
      { readable: true, id: 'p1', name: 'Maison V1', updatedAt: '2026-01-02T00:00:00.000Z', levelCount: 2 },
    ]);
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

describe('ProjectStore and unreadable stored records', () => {
  const unreadable: Array<[string, unknown]> = [
    ['version 0', 0],
    ['a fractional version', 1.5],
    ['a missing version', undefined],
    ['a string version', '1'],
    ['a newer version', 3],
  ];
  for (const [label, version] of unreadable) {
    it(`lists a record with ${label} as unreadable (name, date, no level count), returns null for it, with a console error`, async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const db = await openDb(newId());
      const store = new ProjectStore(db);
      await db.put('projects', v1Project()); // readable neighbour
      const bad = { ...v1Project(), id: 'bad', name: 'Cassé', updatedAt: '2026-01-01T00:00:00.000Z', formatVersion: version };
      if (version === undefined) delete bad.formatVersion;
      await db.put('projects', bad);

      expect(await store.listProjects()).toEqual([
        { readable: true, id: 'p1', name: 'Maison V1', updatedAt: '2026-01-02T00:00:00.000Z', levelCount: 1 },
        { readable: false, id: 'bad', name: 'Cassé', updatedAt: '2026-01-01T00:00:00.000Z' },
      ]);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0]![0])).toContain('bad');

      expect(await store.getProject('bad')).toBeNull();
      expect(errors).toHaveBeenCalledTimes(2);
      expect(await store.getProject('p1')).not.toBeNull();
      expect(errors).toHaveBeenCalledTimes(2);
    });
  }

  it('lists a record without a levels array as unreadable instead of throwing; odd name and date become null', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await openDb(newId());
    const store = new ProjectStore(db);
    await db.put('projects', v1Project());
    const noLevels: Record<string, unknown> = { ...v1Project(), id: 'nolevels', updatedAt: '2026-01-03T00:00:00.000Z' };
    delete noLevels.levels;
    await db.put('projects', noLevels);
    await db.put('projects', { ...v1Project(), id: 'odd', name: 42, updatedAt: null, levels: 'x' });
    await db.put('projects', { id: 'bare' });

    expect(await store.listProjects()).toEqual([
      { readable: false, id: 'nolevels', name: 'Maison V1', updatedAt: '2026-01-03T00:00:00.000Z' },
      { readable: true, id: 'p1', name: 'Maison V1', updatedAt: '2026-01-02T00:00:00.000Z', levelCount: 1 },
      // no date: last
      { readable: false, id: 'bare', name: null, updatedAt: null },
      { readable: false, id: 'odd', name: null, updatedAt: null },
    ]);
    expect(errors).toHaveBeenCalledTimes(3);
    expect(await store.getProject('nolevels')).toBeNull();
    // and it can be deleted like any project
    await store.deleteProject('nolevels');
    expect((await store.listProjects()).map((m) => m.id)).toEqual(['p1', 'bare', 'odd']);
  });

  it('treats a version without a registered migration as unreadable', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await openDb(newId());
    const store = new ProjectStore(db);
    await db.put('projects', v1Project());
    const step = migrations[1]!;
    delete migrations[1];
    try {
      expect(await store.listProjects()).toEqual([{ readable: false, id: 'p1', name: 'Maison V1', updatedAt: '2026-01-02T00:00:00.000Z' }]);
      expect(await store.getProject('p1')).toBeNull();
      expect(errors).toHaveBeenCalledTimes(2);
    } finally {
      migrations[1] = step;
    }
  });

  it('getProject returns null (logged) when the migration itself fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await openDb(newId());
    const store = new ProjectStore(db);
    await db.put('projects', v1Project());
    const step = migrations[1]!;
    migrations[1] = () => {
      throw new Error('boom');
    };
    try {
      expect(await store.getProject('p1')).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
      expect((await store.listProjects()).map((m) => m.id)).toEqual(['p1']); // metadata needs no migration
    } finally {
      migrations[1] = step;
    }
  });
});
