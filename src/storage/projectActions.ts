import { applyCommand } from '@/core/commands/apply';
import { renameProject } from '@/core/commands/project';
import { cloneProjectWithNewIds } from '@/core/model/clone';
import { createProject } from '@/core/model/factory';
import { newId } from '@/core/model/ids';
import type { Id, Project } from '@/core/model/types';
import { parseImport, prepareImportedProject, serializeExport, type ImageData64 } from '@/core/persistence/exchange';
import { exportFileName } from '@/export/fileName';
import type { ProjectStore, StoredImage } from './db';
import { base64ToBlob, blobToBase64, downloadText } from './files';

export const DEFAULT_PROJECT_NAME = 'Mon logement';
export const VARIANT_SUFFIX = ' - variante';

export type ActionResult = { ok: true } | { ok: false; error: string };

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** New project (one "RDC" level) saved right away; a blank name gives the default name. */
export async function createNamedProject(store: ProjectStore, name: string): Promise<Project> {
  const p = createProject(name.trim() === '' ? DEFAULT_PROJECT_NAME : name.trim());
  await store.saveProject(p);
  return p;
}

/** Renames a stored (not open) project through the renameProject command. */
export async function renameStoredProject(store: ProjectStore, id: Id, name: string): Promise<ActionResult> {
  const p = await store.getProject(id);
  if (!p) return { ok: false, error: 'Projet introuvable' };
  const r = applyCommand(p, renameProject(name));
  if (!r.ok) return r;
  if (r.patches.length > 0) await store.saveProject(r.project);
  return { ok: true };
}

/**
 * Saves an independent copy named "<name> - variante": every id is new (R2), the images are
 * copied under new ids. The images are written first: a failure leaves no half project behind.
 */
export async function duplicateProject(store: ProjectStore, id: Id): Promise<Project> {
  const p = await store.getProject(id);
  if (!p) throw new Error('Projet introuvable');
  const images = await store.listImages(id);
  const imageIdMap = new Map<Id, Id>(images.map((img) => [img.id, newId()]));
  const copy = cloneProjectWithNewIds(p, imageIdMap);
  const now = new Date().toISOString();
  copy.name = `${p.name}${VARIANT_SUFFIX}`;
  copy.createdAt = now;
  copy.updatedAt = now;
  try {
    for (const img of images) await store.putImage({ ...img, id: imageIdMap.get(img.id)!, projectId: copy.id });
    await store.saveProject(copy);
  } catch (e) {
    await store.deleteProject(copy.id).catch(() => undefined);
    throw e;
  }
  return copy;
}

/** Pixel size of an imported image, taken from the background that references it. */
function imageSizeFromLevels(project: Project, imageId: Id): { widthPx: number; heightPx: number } {
  const bg = project.levels.find((l) => l.background?.imageId === imageId)?.background;
  return { widthPx: bg?.widthPx ?? 1, heightPx: bg?.heightPx ?? 1 };
}

/**
 * Imports an exported file: validation (parseImport), fresh ids and a free name
 * (prepareImportedProject), then images and project are stored. Nothing is kept on failure.
 */
export async function importProjectText(
  store: ProjectStore,
  text: string,
): Promise<{ ok: true; project: Project } | { ok: false; error: string }> {
  const parsed = parseImport(text);
  if (!parsed.ok) return parsed;
  const existing = (await store.listProjects()).map((m) => m.name);
  const { project, images } = prepareImportedProject(parsed, existing);
  let stored: StoredImage[];
  try {
    stored = Object.entries(images).map(([id, img]) => ({
      id,
      projectId: project.id,
      mime: img.mime,
      blob: base64ToBlob(img.data, img.mime),
      ...imageSizeFromLevels(project, id),
    }));
  } catch {
    return { ok: false, error: 'Fichier invalide : image illisible' };
  }
  try {
    for (const img of stored) await store.putImage(img);
    await store.saveProject(project);
  } catch (e) {
    await store.deleteProject(project.id).catch(() => undefined);
    return { ok: false, error: `Import impossible : ${messageOf(e)}` };
  }
  return { ok: true, project };
}

/** Text of the .json export of a project, with its stored images in base64 (browser only). */
export async function exportProjectText(store: ProjectStore, project: Project): Promise<string> {
  const referenced = new Set(project.levels.flatMap((l) => (l.background ? [l.background.imageId] : [])));
  const images: Record<Id, ImageData64> = {};
  for (const img of await store.listImages(project.id)) {
    if (referenced.has(img.id)) images[img.id] = { mime: img.mime, data: await blobToBase64(img.blob) };
  }
  return serializeExport(project, images);
}

/** Downloads "<project>.json" (browser only). */
export async function downloadProject(store: ProjectStore, project: Project): Promise<void> {
  downloadText(exportFileName(project.name, '', 'json'), await exportProjectText(store, project));
}
