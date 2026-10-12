import { validateProject } from '../commands/validate';
import { cloneProjectWithNewIds } from '../model/clone';
import { newId } from '../model/ids';
import { FORMAT_VERSION } from '../model/types';
import type { Id, Project } from '../model/types';
import type { z } from 'zod';
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

/**
 * French wording of a schema issue, shown to the user after its path (the messages written in the
 * schema itself, already French, take precedence over this map).
 */
function frenchIssue(issue: z.core.$ZodRawIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? 'champ manquant' : 'type inattendu';
    case 'too_big':
    case 'too_small':
    case 'not_multiple_of':
      return 'valeur hors limites';
    case 'invalid_value':
      return 'valeur non reconnue';
    case 'unrecognized_keys':
      return `champ inconnu (${issue.keys.join(', ')})`;
    case 'invalid_format':
      return 'format invalide';
    case 'invalid_key':
      return 'identifiant invalide';
    default:
      return 'format inattendu';
  }
}

/** Path of the first "__proto__" key (zod records would silently drop it), or null. */
function findProtoKey(value: unknown, path: string): string | null {
  if (value === null || typeof value !== 'object') return null;
  if (Object.hasOwn(value, '__proto__')) return `${path}.__proto__`.replace(/^\./, '');
  for (const [k, v] of Object.entries(value)) {
    const found = findProtoKey(v, path === '' ? k : `${path}.${k}`);
    if (found !== null) return found;
  }
  return null;
}

export function serializeExport(project: Project, images: Record<Id, ImageData64>): string {
  const file: ExportFile = { app: 'plan-maison', formatVersion: FORMAT_VERSION, project, images };
  return JSON.stringify(file, null, 2);
}

/** Never throws, whatever the input string: every failure comes back as { ok: false, error }. */
export function parseImport(text: string): ImportResult {
  try {
    return parseImportUnsafe(text);
  } catch {
    return invalid('structure inattendue');
  }
}

function parseImportUnsafe(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fichier illisible : ce n'est pas un fichier JSON valide." };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || (raw as { app?: unknown }).app !== 'plan-maison') {
    return { ok: false, error: 'Ce fichier ne provient pas de Mansarde.' };
  }
  const header = raw as { formatVersion?: unknown };
  const version = header.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return invalid('formatVersion invalide');
  }
  if (version > FORMAT_VERSION) {
    return { ok: false, error: 'Ce fichier a été créé par une version plus récente de Mansarde.' };
  }

  const forbidden = findProtoKey(raw, '');
  if (forbidden !== null) return invalid(`${forbidden} identifiant interdit`);

  let migrated: unknown;
  try {
    migrated = migrate(raw as { formatVersion: number });
  } catch {
    return invalid('migration impossible');
  }

  const parsed = exportFileSchema.safeParse(migrated, { error: frenchIssue });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue ? issue.path.map(String).join('.') : '';
    return invalid(`${path} ${issue?.message ?? 'format inattendu'}`.trim());
  }
  const { project, images } = parsed.data;

  let problems: string[];
  try {
    problems = validateProject(project);
  } catch {
    return invalid('structure incohérente');
  }
  // the invariant checks speak English (developer wording): wrapped in a French sentence for the user
  if (problems.length > 0) return invalid(`plan incohérent (${problems[0]!})`);

  for (const level of project.levels) {
    if (level.background && !Object.hasOwn(images, level.background.imageId)) {
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
