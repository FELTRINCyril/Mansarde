import { setBackground } from '@/core/commands/project';
import type { Id, Vec2 } from '@/core/model/types';
import type { ProjectStore } from '@/storage/db';
import { activeLevel, type EditorStore } from './store';

export const BACKGROUND_MIMES = ['image/png', 'image/jpeg'];
export const ERR_UNREADABLE = 'Image illisible';
export const ERR_FORMAT = 'Format non pris en charge (PNG ou JPEG)';
export const ERR_STORE = "Enregistrement de l'image impossible";
/** Opacity of a freshly imported tracing image. */
export const IMPORT_OPACITY = 0.5;

export interface ImportDeps {
  store: EditorStore;
  projectStore: Pick<ProjectStore, 'putImage'>;
  /** Natural size of the decoded image; rejects when it cannot be decoded. */
  measure(blob: Blob): Promise<{ widthPx: number; heightPx: number }>;
  /** Makes the stored image displayable (the editor creates and later revokes its object URL). */
  register(imageId: Id, blob: Blob): void;
  /** World point under the center of the plan view. */
  viewCenter(): Vec2;
  newId(): Id;
}

/**
 * Imports `file` as the tracing image of the active level: 1 cm per pixel, centered on the view,
 * half transparent, unlocked and visible (one history entry; replaces a previous image). An
 * unreadable image toasts "Image illisible" and changes nothing. Returns whether it was applied.
 */
export async function importBackground(file: Blob, d: ImportDeps): Promise<boolean> {
  const fail = (message: string): false => {
    d.store.getState().showToast(message);
    return false;
  };
  const s0 = d.store.getState();
  const projectId = s0.project?.id;
  const levelId = activeLevel(s0)?.id;
  if (!projectId || !levelId) return false;
  if (!BACKGROUND_MIMES.includes(file.type)) return fail(ERR_FORMAT);

  let size: { widthPx: number; heightPx: number };
  try {
    size = await d.measure(file);
  } catch {
    return fail(ERR_UNREADABLE);
  }
  if (!(size.widthPx > 0 && size.heightPx > 0)) return fail(ERR_UNREADABLE);

  const imageId = d.newId();
  try {
    await d.projectStore.putImage({ id: imageId, projectId, mime: file.type, blob: file, ...size });
  } catch {
    return fail(ERR_STORE);
  }
  if (d.store.getState().project?.id !== projectId) return false; // the project was closed meanwhile

  d.register(imageId, file);
  const c = d.viewCenter();
  return d.store.getState().execute(
    "Importer l'image de fond",
    setBackground(levelId, {
      imageId,
      ...size,
      scale: 1,
      x: c.x - size.widthPx / 2,
      y: c.y - size.heightPx / 2,
      rotation: 0,
      opacity: IMPORT_OPACITY,
      locked: false,
      visible: true,
    }),
  );
}
