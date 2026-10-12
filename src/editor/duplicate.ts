import type { Recipe } from '@/core/commands/apply';
import { addBeam } from '@/core/commands/beams';
import { duplicateCupboards } from '@/core/commands/cupboards';
import { pasteObjects } from '@/core/commands/objects';
import { addSlope } from '@/core/commands/slopes';
import { newId } from '@/core/model/ids';
import type { Beam, Id, Level, PlacedObject, Slope, Vec2 } from '@/core/model/types';
import type { SelectionItem } from './selection';
import { settledCopies } from './settlePose';
import { activeLevel, type EditorStore } from './store';

/*
 * Copy, paste and duplicate of the selection, shared by the keyboard (Mod+C, Mod+V, Mod+D) and
 * the "Dupliquer" button of the properties panel.
 */

/** Offset of pasted and duplicated objects, slopes and beams (cm). */
export const PASTE_OFFSET: Vec2 = { x: 20, y: 20 };

const DUPLICABLE: ReadonlySet<SelectionItem['kind']> = new Set<SelectionItem['kind']>(['object', 'cupboard', 'slope', 'beam']);

/** Items of the selection that duplicateSelection copies: objects, cupboards, slopes and beams. */
export const duplicableCount = (selection: SelectionItem[]): number => selection.filter((i) => DUPLICABLE.has(i.kind)).length;

/** Ids of the selected items of that kind that exist on the level, each once, in selection order. */
function selectedIds(level: Level, selection: SelectionItem[], kind: 'object' | 'cupboard' | 'slope' | 'beam'): Id[] {
  const items: Record<Id, unknown> = { object: level.objects, cupboard: level.cupboards, slope: level.slopes, beam: level.beams }[kind];
  return [...new Set(selection.filter((i) => i.kind === kind).map((i) => i.id))].filter((id) => Object.hasOwn(items, id));
}

function selectedObjects(store: EditorStore): PlacedObject[] {
  const s = store.getState();
  const level = activeLevel(s);
  if (!level) return [];
  return selectedIds(level, s.selection, 'object').map((id) => level.objects[id]!);
}

const shifted = (p: Vec2): Vec2 => ({ x: p.x + PASTE_OFFSET.x, y: p.y + PASTE_OFFSET.y });

/**
 * Adds copies of the objects at +PASTE_OFFSET (one history entry), an 'onTop' copy posed on its
 * support there (settledCopies, spec 5.3), and selects them; the new ids, or null when refused.
 */
function pasteCopies(store: EditorStore, label: string, objects: PlacedObject[]): Id[] | null {
  const s = store.getState();
  const level = activeLevel(s);
  if (!s.project || !level || objects.length === 0) return null;
  const out = { ids: [] as Id[] };
  const copies = settledCopies(level, objects, PASTE_OFFSET, s.project.customObjects);
  if (!s.execute(label, pasteObjects(level.id, copies, PASTE_OFFSET, out))) return null;
  store.getState().setSelection(out.ids.map((id) => ({ kind: 'object', id })));
  return out.ids;
}

/** Mod+C: puts copies of the selected objects in the clipboard; false when no object is selected. */
export function copySelection(store: EditorStore): boolean {
  const objects = selectedObjects(store);
  if (objects.length === 0) return false;
  store.getState().setClipboard(objects.map((o) => structuredClone(o)));
  return true;
}

/** Mod+V: pastes the clipboard; the clipboard then follows the copies, so that pasting again cascades. */
export function paste(store: EditorStore): boolean {
  const clipboard = store.getState().clipboard;
  if (clipboard.length === 0) return false;
  if (pasteCopies(store, 'Coller', clipboard)) {
    store.getState().setClipboard(clipboard.map((o) => ({ ...o, ...shifted(o) })));
  }
  return true;
}

/**
 * Mod+D and the "Dupliquer" button: copies the selected objects, slopes and beams at
 * +PASTE_OFFSET (an 'onTop' object copy posed on its support there, as a paste) and the selected
 * cupboards right next to themselves on the same face (duplicateCupboards), with all their
 * properties, in one history entry; the copies are then selected (objects, cupboards, slopes,
 * beams). Other items are ignored. A refusal (no room for a cupboard copy) is toasted by execute
 * and changes nothing. False when the selection has nothing to duplicate.
 */
export function duplicateSelection(store: EditorStore): boolean {
  const s = store.getState();
  const level = activeLevel(s);
  if (!s.project || !level) return false;
  const objects = selectedIds(level, s.selection, 'object').map((id) => level.objects[id]!);
  const cupboardIds = selectedIds(level, s.selection, 'cupboard');
  const slopes: Slope[] = selectedIds(level, s.selection, 'slope').map((id) => {
    const sl = level.slopes[id]!;
    return { ...structuredClone(sl), id: newId(), a: shifted(sl.a), b: shifted(sl.b) };
  });
  const beams: Beam[] = selectedIds(level, s.selection, 'beam').map((id) => {
    const b = level.beams[id]!;
    return { ...structuredClone(b), id: newId(), a: shifted(b.a), b: shifted(b.b) };
  });
  if (objects.length + cupboardIds.length + slopes.length + beams.length === 0) return false;

  const levelId = level.id;
  const pasted = { ids: [] as Id[] };
  const cupboards = { ids: [] as Id[] };
  const copies = settledCopies(level, objects, PASTE_OFFSET, s.project.customObjects);
  const recipe: Recipe = (draft) => {
    if (copies.length > 0) pasteObjects(levelId, copies, PASTE_OFFSET, pasted)(draft);
    if (cupboardIds.length > 0) duplicateCupboards(levelId, cupboardIds, cupboards)(draft);
    for (const sl of slopes) addSlope(levelId, sl)(draft);
    for (const b of beams) addBeam(levelId, b)(draft);
  };
  if (!s.execute('Dupliquer', recipe)) return true;
  store.getState().setSelection([
    ...pasted.ids.map((id) => ({ kind: 'object' as const, id })),
    ...cupboards.ids.map((id) => ({ kind: 'cupboard' as const, id })),
    ...slopes.map((sl) => ({ kind: 'slope' as const, id: sl.id })),
    ...beams.map((b) => ({ kind: 'beam' as const, id: b.id })),
  ]);
  return true;
}
