import { OBJECT_POSES } from '../model/types';
import type { Background, CustomObjectDef, Id, ProjectSettings } from '../model/types';
import { CommandError, getLevel, touch, type Recipe } from './apply';

const ERR_NAME = 'Nom invalide';
const ERR_VALUE = 'Valeur invalide';
const ERR_SIZE = 'Dimension invalide';
const ERR_SCALE = 'Échelle invalide';
const ERR_POSITION = 'Position invalide';
const ERR_CUSTOM_EXISTS = 'Objet déjà enregistré';
const ERR_CUSTOM_NOT_FOUND = 'Objet introuvable';
const ERR_CUSTOM_IN_USE = 'Objet utilisé dans le plan';
const ERR_NO_BACKGROUND = 'Aucune image de fond';
const ERR_POSE = 'Pose invalide';

const SETTING_KEYS: Array<keyof ProjectSettings> = [
  'defaultWallThickness',
  'partitionThickness',
  'defaultCeilingHeight',
  'gridStep',
];

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

export function renameProject(name: string): Recipe {
  return (draft) => {
    const trimmed = name.trim();
    if (trimmed === '') throw new CommandError(ERR_NAME);
    if (draft.name === trimmed) return;
    draft.name = trimmed;
    touch(draft);
  };
}

/** Every provided value must be finite and > 0. */
export function updateSettings(patch: Partial<ProjectSettings>): Recipe {
  return (draft) => {
    const changes = SETTING_KEYS.flatMap((key) => (patch[key] === undefined ? [] : [[key, patch[key]!] as const]));
    for (const [, value] of changes) {
      if (!isPositive(value)) throw new CommandError(ERR_VALUE);
    }
    let changed = false;
    for (const [key, value] of changes) {
      if (draft.settings[key] === value) continue;
      draft.settings[key] = value;
      changed = true;
    }
    if (changed) touch(draft);
  };
}

export function addCustomObject(def: CustomObjectDef): Recipe {
  return (draft) => {
    if (draft.customObjects[def.id]) throw new CommandError(ERR_CUSTOM_EXISTS);
    if (def.name.trim() === '') throw new CommandError(ERR_NAME);
    if (!isPositive(def.width) || !isPositive(def.depth) || !isPositive(def.height)) {
      throw new CommandError(ERR_SIZE);
    }
    if (def.lshape && (!isPositive(def.lshape.notchWidth) || !isPositive(def.lshape.notchDepth))) {
      throw new CommandError(ERR_SIZE);
    }
    if (!(OBJECT_POSES as readonly unknown[]).includes(def.pose)) throw new CommandError(ERR_POSE);
    draft.customObjects[def.id] = structuredClone(def);
    touch(draft);
  };
}

/** Refused while a placed object (on any level) uses the definition. */
export function deleteCustomObject(id: Id): Recipe {
  return (draft) => {
    if (!draft.customObjects[id]) throw new CommandError(ERR_CUSTOM_NOT_FOUND);
    const used = draft.levels.some((l) =>
      Object.values(l.objects).some((o) => o.source.kind === 'custom' && o.source.customObjectId === id),
    );
    if (used) throw new CommandError(ERR_CUSTOM_IN_USE);
    delete draft.customObjects[id];
    touch(draft);
  };
}

function requireBackgroundValues(bg: Omit<Background, 'imageId'>): void {
  if (!isPositive(bg.widthPx) || !isPositive(bg.heightPx)) throw new CommandError(ERR_SIZE);
  if (!isPositive(bg.scale)) throw new CommandError(ERR_SCALE);
  if (![bg.x, bg.y, bg.rotation, bg.opacity].every(Number.isFinite)) throw new CommandError(ERR_POSITION);
}

/** Sets (opacity clamped to 0..1) or removes (null) the background image of a level. */
export function setBackground(levelId: Id, bg: Background | null): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    if (bg === null) {
      if (level.background === null) return;
      level.background = null;
    } else {
      requireBackgroundValues(bg);
      level.background = { ...bg, opacity: clamp01(bg.opacity) };
    }
    touch(draft);
  };
}

/** opacity is clamped to 0..1, scale must be > 0. */
export function updateBackground(levelId: Id, patch: Partial<Omit<Background, 'imageId'>>): Recipe {
  return (draft) => {
    const level = getLevel(draft, levelId);
    const bg = level.background;
    if (!bg) throw new CommandError(ERR_NO_BACKGROUND);
    const changes = Object.entries(patch).filter(([key, v]) => v !== undefined && key !== 'imageId') as Array<
      [keyof Omit<Background, 'imageId'>, never]
    >;
    const next = { ...bg, ...Object.fromEntries(changes) } as Background;
    requireBackgroundValues(next);
    next.opacity = clamp01(next.opacity);

    let changed = false;
    for (const [key] of changes) {
      if (bg[key] === next[key]) continue;
      (bg as Record<string, unknown>)[key] = next[key];
      changed = true;
    }
    if (changed) touch(draft);
  };
}
