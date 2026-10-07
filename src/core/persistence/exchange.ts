import { validateProject } from '../commands/validate';
import { cloneProjectWithNewIds } from '../model/clone';
import { newId } from '../model/ids';
import { FORMAT_VERSION } from '../model/types';
import type { Id, Project } from '../model/types';
import { migrate } from './migrate';
import { exportFileSchema } from './schema';

/** Image payload of an export file: base64 WITHOUT any "data:" prefix. */
export interface ImageData64 { mime: string; data: string }

export interface ExportFile {
  app: 'plan-maison';
  formatVersion: number;
  project: Project;
  images: Record<Id, ImageData64>;
}

export type ImportResult =
  | { ok: true; project: Project; images: Record<Id, ImageData64> }
  | { ok: false; error: string };

const invalid = (detail: string): ImportResult => ({ ok: false, error: `Fichier invalide : ${detail}` });

export function serializeExport(project: Project, images: Record<Id, ImageData64>): string {
  const file: ExportFile = { app: 'plan-maison', formatVersion: FORMAT_VERSION, project, images };
  return JSON.stringify(file, null, 2);
}

export function parseImport(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fichier illisible : ce n'est pas un fichier JSON valide." };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || (raw as { app?: unknown }).app !== 'plan-maison') {
    return { ok: false, error: 'Ce fichier ne provient pas de Plan Maison.' };
  }
  const header = raw as { formatVersion?: unknown };
  const version = header.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return invalid('formatVersion invalide');
  }
  if (version > FORMAT_VERSION) {
    return { ok: false, error: 'Ce fichier a été créé par une version plus récente de Plan Maison.' };
  }

  let migrated: unknown;
  try {
    migrated = migrate(raw as { formatVersion: number });
  } catch {
    return invalid('migration impossible');
  }

  const parsed = exportFileSchema.safeParse(migrated);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue ? issue.path.map(String).join('.') : '';
    return invalid(`${path} ${issue?.message ?? 'format inattendu'}`.trim());
  }
  const { project, images } = parsed.data;

  const problems = validateProject(project);
  if (problems.length > 0) return invalid(problems[0]!);

  for (const level of project.levels) {
    if (level.background && !(level.background.imageId in images)) {
      return invalid('image de fond manquante');
    }
  }
  return { ok: true, project, images };
}

/** Gives an imported project fresh ids (project, elements, images) and a name unused in existingNames. */
export function prepareImportedProject(
  r: { project: Project; images: Record<Id, ImageData64> },
  existingNames: string[],
): { project: Project; images: Record<Id, ImageData64> } {
  const imageIdMap = new Map<Id, Id>();
  const images: Record<Id, ImageData64> = {};
  for (const [oldId, img] of Object.entries(r.images)) {
    const fresh = newId();
    imageIdMap.set(oldId, fresh);
    images[fresh] = { ...img };
  }
  const project = cloneProjectWithNewIds(r.project, imageIdMap);

  const taken = new Set(existingNames);
  if (taken.has(project.name)) {
    const base = project.name;
    let name = `${base} (import)`;
    for (let n = 2; taken.has(name); n++) name = `${base} (import ${n})`;
    project.name = name;
  }
  return { project, images };
}
