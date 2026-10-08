import { create } from 'zustand';
import { applyCommand, type Recipe } from '@/core/commands/apply';
import { emptyHistory, pushEntry, redo as redoHistory, undo as undoHistory, type History } from '@/core/commands/history';
import { deriveLevel } from '@/core/geometry/derived';
import type { DimLine } from '@/core/geometry/autoDimensions';
import type { Guide } from '@/core/geometry/snap';
import type { Id, Level, PlacedObject, Project, RoomLabel, Vec2 } from '@/core/model/types';
import type { NumericKind } from '@/ui/numeric';
import { pruneSelection, type SelectionItem } from './selection';
import { DEFAULT_VIEW, isValidView, type View } from './view';

export type ToolId = 'select' | 'wall' | 'rect' | 'door' | 'window' | 'dimension' | 'calibrate' | 'moveBackground';

/** Room name being edited in place (double-click in a room, select tool). */
export interface RoomRename { levelId: Id; label: RoomLabel | null; labelPoint: Vec2; placeholder: string }

/**
 * Shared numeric field shown near the cursor while a tool is active (see numericOverlay.ts). `screen` is
 * canvas px; `value` is the text being typed, `kind` selects the parsing rules, `label` an optional caption;
 * `invalid`: the field opens with the red invalid border (a refused value given back to correct).
 */
export interface NumericInput { value: string; screen: Vec2; kind: NumericKind; label?: string; invalid?: boolean }

/**
 * Transient interaction state drawn by OverlayLayer (world cm unless stated): snap guides, dynamic
 * dimensions, selection rectangle, tool ghost, plus the in-place inputs (numeric value, room name).
 */
export interface Overlay {
  guides: Guide[]; previewInvalid: boolean;
  dynamicDims: DimLine[]; activeDimIndex: number | null;
  numericInput: NumericInput | null;
  marquee: { a: Vec2; b: Vec2 } | null;
  ghost: unknown; // tool-specific preview payload, typed by each tool (see OutlineGhost in tools/types)
  rename: RoomRename | null;
}

export interface Gesture {
  base: Project;
  label: string;
  last: Project; // last accepted preview (the base until an update is accepted)
  lastRecipe: Recipe | null; // last accepted recipe; applied to base at commit
}

export interface EditorState {
  project: Project | null;
  history: History;
  activeLevelId: Id | null;
  selection: SelectionItem[];
  tool: ToolId;
  view: View;
  gesture: Gesture | null;
  overlay: Overlay;
  display: { dimMode: 'all' | 'manual' | 'none'; showLowerLevel: boolean; showGrid: boolean };
  clipboard: PlacedObject[];
  toast: { message: string; id: number } | null;
  // actions
  /** Resets history, selection, gesture, overlay and tool; activeLevelId = first level. */
  openProject(p: Project): void;
  closeProject(): void;
  /**
   * applyCommand + one history entry (none for a no-op); on refusal (command error, or a result
   * whose geometry cannot be computed, ERR_GEOMETRY) toasts the error and returns false. Cancels an
   * active gesture first.
   */
  execute(label: string, recipe: Recipe): boolean;
  /** Starts a live edit; an already active gesture is cancelled first. */
  beginGesture(label: string): void;
  /**
   * Applies recipe to the gesture base (not cumulatively on the preview). Refusal (command error, or
   * geometry that cannot be computed) keeps the last valid preview and flags previewInvalid.
   */
  updateGesture(recipe: Recipe): boolean;
  /**
   * Pushes ONE history entry, computed from the base and the last accepted recipe; nothing if there
   * is none or it changes nothing. The recipe is applied a second time here (updateGesture applied
   * it for the preview), so it must be deterministic: create ids and read clocks outside the recipe.
   */
  commitGesture(): void;
  cancelGesture(): void;
  /** Both cancel an active gesture first, then prune the selection and fix activeLevelId. */
  undo(): void;
  redo(): void;
  /** Cancels the gesture and clears the overlay. */
  setTool(t: ToolId): void;
  setSelection(s: SelectionItem[]): void;
  /** Ignored when the level does not exist; clears the selection. */
  setActiveLevel(id: Id): void;
  /** Ignores an invalid view (non-finite or non-positive zoom, non-finite translation): the current one is kept. */
  setView(v: View): void;
  setOverlay(p: Partial<Overlay>): void;
  setDisplay(p: Partial<EditorState['display']>): void;
  setClipboard(objects: PlacedObject[]): void;
  showToast(message: string): void;
}

export type EditorStore = ReturnType<typeof createEditorStore>;

/** A fresh overlay on every call: never share a mutable object between resets. */
export const createOverlay = (): Overlay => ({
  guides: [], previewInvalid: false, dynamicDims: [], activeDimIndex: null,
  numericInput: null, marquee: null, ghost: null, rename: null,
});

export function activeLevel(s: EditorState): Level | undefined {
  return s.project?.levels.find((l) => l.id === s.activeLevelId);
}

/** Selection and active level consistent with a project that just changed (edit, undo, redo). */
function reconcile(s: EditorState, project: Project): Pick<EditorState, 'selection' | 'activeLevelId'> {
  const level = project.levels.find((l) => l.id === s.activeLevelId) ?? project.levels[0];
  // rooms are only computed when a room is selected
  const rooms = s.selection.some((i) => i.kind === 'room') && level ? deriveLevel(level).rooms : [];
  return { selection: pruneSelection(s.selection, level, rooms), activeLevelId: level?.id ?? null };
}

export const ERR_GEOMETRY = 'Géométrie impossible à calculer pour cette modification.';

/**
 * Ruling R37: an edit is refused when a level it changed can only be derived in degraded mode
 * (a boolean operation failed even after its retries) while it was exact before. A level that was
 * already degraded (e.g. an imported file) stays editable, so that the user can repair it.
 */
export function degradesGeometry(before: Project, after: Project): boolean {
  return after.levels.some((level) => {
    if (before.levels.includes(level) || !deriveLevel(level).degraded) return false;
    const prev = before.levels.find((l) => l.id === level.id);
    return !prev || !deriveLevel(prev).degraded;
  });
}

export function createEditorStore() {
  let toastId = 0;
  return create<EditorState>()((set, get) => {
    /** Drops an active gesture and restores its base; returns the project the stack must work on. */
    const dropGesture = (): Project | null => {
      const { gesture, project } = get();
      if (!gesture) return project;
      set({ project: gesture.base, gesture: null, overlay: { ...get().overlay, previewInvalid: false } });
      return gesture.base;
    };

    const undoRedo = (step: typeof undoHistory) => {
      const project = dropGesture();
      if (!project) return;
      const r = step(project, get().history);
      if (!r) return;
      set((s) => ({ project: r.project, history: r.history, ...reconcile(s, r.project) }));
    };

    return {
      project: null,
      history: emptyHistory,
      activeLevelId: null,
      selection: [],
      tool: 'select',
      view: DEFAULT_VIEW,
      gesture: null,
      overlay: createOverlay(),
      display: { dimMode: 'all', showLowerLevel: true, showGrid: true },
      clipboard: [],
      toast: null,

      openProject: (p) =>
        set({
          project: p, history: emptyHistory, activeLevelId: p.levels[0]?.id ?? null, selection: [],
          gesture: null, overlay: createOverlay(), tool: 'select',
        }),

      closeProject: () =>
        set({
          project: null, history: emptyHistory, activeLevelId: null, selection: [],
          gesture: null, overlay: createOverlay(), tool: 'select',
        }),

      execute: (label, recipe) => {
        const project = dropGesture();
        if (!project) return false;
        const r = applyCommand(project, recipe);
        if (!r.ok) {
          get().showToast(r.error);
          return false;
        }
        if (r.patches.length === 0) return true;
        if (degradesGeometry(project, r.project)) {
          get().showToast(ERR_GEOMETRY);
          return false;
        }
        set((s) => ({
          project: r.project,
          history: pushEntry(s.history, { label, patches: r.patches, inverse: r.inverse }),
          ...reconcile(s, r.project),
        }));
        return true;
      },

      beginGesture: (label) => {
        const project = dropGesture();
        if (!project) return;
        set({ gesture: { base: project, label, last: project, lastRecipe: null } });
      },

      updateGesture: (recipe) => {
        const { gesture } = get();
        if (!gesture) return false;
        const r = applyCommand(gesture.base, recipe);
        if (!r.ok || degradesGeometry(gesture.base, r.project)) {
          set((s) => ({ project: gesture.last, overlay: { ...s.overlay, previewInvalid: true } }));
          return false;
        }
        set((s) => ({
          project: r.project,
          gesture: { ...gesture, last: r.project, lastRecipe: recipe },
          overlay: s.overlay.previewInvalid ? { ...s.overlay, previewInvalid: false } : s.overlay,
        }));
        return true;
      },

      commitGesture: () => {
        const { gesture } = get();
        if (!gesture) return;
        const settle = { gesture: null, overlay: { ...get().overlay, previewInvalid: false } };
        const r = gesture.lastRecipe ? applyCommand(gesture.base, gesture.lastRecipe) : null;
        if (!r || !r.ok || r.patches.length === 0) {
          set({ ...settle, project: gesture.base });
          return;
        }
        set((s) => ({
          ...settle,
          project: r.project,
          history: pushEntry(s.history, { label: gesture.label, patches: r.patches, inverse: r.inverse }),
          ...reconcile(s, r.project),
        }));
      },

      cancelGesture: () => {
        dropGesture();
      },

      undo: () => undoRedo(undoHistory),
      redo: () => undoRedo(redoHistory),

      setTool: (tool) => {
        dropGesture();
        set({ tool, overlay: createOverlay() });
      },

      setSelection: (selection) => set({ selection }),

      setActiveLevel: (id) => {
        if (!get().project?.levels.some((l) => l.id === id)) return;
        set({ activeLevelId: id, selection: [] });
      },

      setView: (view) => {
        if (isValidView(view)) set({ view });
      },
      setOverlay: (p) => set((s) => ({ overlay: { ...s.overlay, ...p } })),
      setDisplay: (p) => set((s) => ({ display: { ...s.display, ...p } })),
      setClipboard: (clipboard) => set({ clipboard }),
      showToast: (message) => set({ toast: { message, id: ++toastId } }),
    };
  });
}

export const useEditor = createEditorStore();
