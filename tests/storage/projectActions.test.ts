import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Project } from '@/core/model/types';
import { serializeExport } from '@/core/persistence/exchange';
import { openDb, ProjectStore } from '@/storage/db';
import { createNamedProject, duplicateProject, importProjectText, renameStoredProject } from '@/storage/projectActions';

let store: ProjectStore;

beforeEach(async () => {
  store = new ProjectStore(await openDb(newId()));
});

function withBackground(p: Project, imageId: string): Project {
  p.levels[0]!.background = {
    imageId, widthPx: 10, heightPx: 20, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, locked: false, visible: true,
  };
  return p;
}

async function bytesOf(b: Blob): Promise<number[]> {
  return [...new Uint8Array(await b.arrayBuffer())];
}

describe('project actions', () => {
  it('creates a project with a trimmed name (default when blank) and one RDC level', async () => {
    const p = await createNamedProject(store, '  Test  ');
    expect(p.name).toBe('Test');
    expect(p.levels.map((l) => l.name)).toEqual(['RDC']);
    expect((await store.getProject(p.id))?.name).toBe('Test');
    expect((await createNamedProject(store, '   ')).name).toBe('Mon logement');
  });

  it('renames a stored project through the command', async () => {
    const p = await createNamedProject(store, 'Test');
    expect(await renameStoredProject(store, p.id, ' Maison ')).toEqual({ ok: true });
    expect((await store.getProject(p.id))?.name).toBe('Maison');
    expect(await renameStoredProject(store, p.id, '  ')).toEqual({ ok: false, error: 'Nom invalide' });
    expect((await store.getProject(p.id))?.name).toBe('Maison');
  });

  it('duplicates a project as "<name> - variante" with fresh ids and copied images', async () => {
    const imageId = newId();
    const p = withBackground(createProject('Test'), imageId);
    await store.saveProject(p);
    await store.putImage({
      id: imageId, projectId: p.id, mime: 'image/png', blob: new Blob([new Uint8Array([1, 2, 3])]), widthPx: 10, heightPx: 20,
    });

    const copy = await duplicateProject(store, p.id);
    expect(copy.name).toBe('Test - variante');
    expect(copy.id).not.toBe(p.id);
    expect(copy.levels[0]!.id).not.toBe(p.levels[0]!.id);
    const newImageId = copy.levels[0]!.background!.imageId;
    expect(newImageId).not.toBe(imageId);
    const images = await store.listImages(copy.id);
    expect(images.map((i) => i.id)).toEqual([newImageId]);
    expect(await bytesOf(images[0]!.blob)).toEqual([1, 2, 3]);
    // the source is untouched
    expect((await store.listImages(p.id)).map((i) => i.id)).toEqual([imageId]);
    expect((await store.listProjects()).map((m) => m.name).sort()).toEqual(['Test', 'Test - variante']);
  });

  it('imports a valid file with fresh ids and its images', async () => {
    const imageId = newId();
    const p = withBackground(createProject('Test'), imageId);
    const text = serializeExport(p, { [imageId]: { mime: 'image/png', data: btoa('\u0001\u0002\u0003') } });
    await store.saveProject(p); // same name already present

    const r = await importProjectText(store, text);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.id).not.toBe(p.id);
    expect(r.project.name).toBe('Test (import)');
    const images = await store.listImages(r.project.id);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ id: r.project.levels[0]!.background!.imageId, mime: 'image/png', widthPx: 10, heightPx: 20 });
    expect(await bytesOf(images[0]!.blob)).toEqual([1, 2, 3]);
  });

  it('imports nothing from an invalid file', async () => {
    await createNamedProject(store, 'Test');
    const r = await importProjectText(store, 'pas du json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/);
    expect(await store.listProjects()).toHaveLength(1);
  });

  it('imports nothing when an image payload cannot be decoded', async () => {
    const imageId = newId();
    const p = withBackground(createProject('Test'), imageId);
    const text = serializeExport(p, { [imageId]: { mime: 'image/png', data: '%%%' } });
    const r = await importProjectText(store, text);
    expect(r.ok).toBe(false);
    expect(await store.listProjects()).toHaveLength(0);
  });
});
