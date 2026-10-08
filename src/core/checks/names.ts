import type { Id, Level } from '../model/types';

/** Name used in messages for a cupboard (cupboards have no name of their own). */
export const CUPBOARD_NAME = 'Placard';
/** Name used for an object whose name is empty. */
const UNNAMED_OBJECT = 'Objet';

/**
 * Names used in check messages, by object or cupboard id (spec 5.4): the object name, "Placard"
 * for a cupboard; names shared by several elements get " (1)", " (2)"... in the level order
 * (objects first, then cupboards), so that "Bureau (1)" and "Bureau (2)" can be told apart.
 */
export function displayNames(level: Level): Map<Id, string> {
  const base: Array<[Id, string]> = [
    ...Object.values(level.objects).map((o): [Id, string] => [o.id, o.name.trim() || UNNAMED_OBJECT]),
    ...Object.values(level.cupboards).map((c): [Id, string] => [c.id, CUPBOARD_NAME]),
  ];
  const count = new Map<string, number>();
  for (const [, name] of base) count.set(name, (count.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const out = new Map<Id, string>();
  for (const [id, name] of base) {
    if ((count.get(name) ?? 0) < 2) {
      out.set(id, name);
      continue;
    }
    const k = (seen.get(name) ?? 0) + 1;
    seen.set(name, k);
    out.set(id, `${name} (${k})`);
  }
  return out;
}
