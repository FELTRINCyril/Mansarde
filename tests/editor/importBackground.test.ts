import { describe, expect, it, vi } from 'vitest';
import { importBackground, type ImportDeps } from '@/editor/importBackground';
import { createEditorStore } from '@/editor/store';
import { emptyProject } from '../core/helpers';

function setup(over: Partial<ImportDeps> = {}) {
  const store = createEditorStore();
  const project = emptyProject();
  store.getState().openProject(project);
  const putImage = vi.fn(async () => {});
  const register = vi.fn();
  const deps: ImportDeps = {
    store,
    projectStore: { putImage },
    measure: async () => ({ widthPx: 800, heightPx: 600 }),
    register,
    viewCenter: () => ({ x: 1000, y: 500 }),
    newId: () => 'img-1',
    ...over,
  };
  return { store, project, putImage, register, deps };
}
const png = () => new Blob(['x'], { type: 'image/png' });

describe('importBackground', () => {
  it('stores the image and sets a centered, half transparent, 1 cm per px background', async () => {
    const { store, project, putImage, register, deps } = setup();
    expect(await importBackground(png(), deps)).toBe(true);
    expect(putImage).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1', projectId: project.id, mime: 'image/png', widthPx: 800, heightPx: 600 }));
    expect(register).toHaveBeenCalledWith('img-1', expect.any(Blob));
    expect(store.getState().project!.levels[0]!.background).toEqual({
      imageId: 'img-1', widthPx: 800, heightPx: 600, scale: 1, x: 600, y: 200,
      rotation: 0, opacity: 0.5, locked: false, visible: true,
    });
    expect(store.getState().history.past).toHaveLength(1);
  });

  it('an unreadable image toasts "Image illisible" and changes nothing', async () => {
    const { store, putImage, register, deps } = setup({ measure: async () => Promise.reject(new Error('Image illisible')) });
    expect(await importBackground(png(), deps)).toBe(false);
    expect(store.getState().toast?.message).toBe('Image illisible');
    expect(putImage).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(store.getState().project!.levels[0]!.background).toBeNull();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('refuses a file that is neither PNG nor JPEG', async () => {
    const { store, deps } = setup();
    expect(await importBackground(new Blob(['x'], { type: 'image/gif' }), deps)).toBe(false);
    expect(store.getState().toast?.message).toMatch(/PNG ou JPEG/);
  });

  it('a storage failure leaves the project untouched', async () => {
    const { store, register, deps } = setup();
    deps.projectStore = { putImage: async () => Promise.reject(new Error('quota')) };
    expect(await importBackground(png(), deps)).toBe(false);
    expect(register).not.toHaveBeenCalled();
    expect(store.getState().project!.levels[0]!.background).toBeNull();
  });

  it('does nothing when the project was closed during the import', async () => {
    const { store, register, deps } = setup();
    deps.projectStore = { putImage: async () => store.getState().closeProject() };
    expect(await importBackground(png(), deps)).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });
});
