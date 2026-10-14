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

export type ToolId =
  | 'select' | 'wall' | 'rect' | 'door' | 'window' | 'dimension' | 'calibrate' | 'moveBackground'
  | 'slope' | 'beam' | 'cupboard';

/**
 * Reference line of the wall tool (spec 6): the clicked line is the wall axis, or its left / right
 * face in the model frame (left = +perp(direction), so the walls stand on the other side).
 */
export type WallReference = 'axis' | 'left' | 'right';

/** Space in the wall tool: left and right swap; from the axis it goes to the left face. */
export const flipWallReference = (r: WallReference): WallReference => (r === 'left' ? 'right' : 'left');

/** Room name being edited in place (double-click in a room, select tool). */
export interface RoomRename { levelId: Id; label: RoomLabel | null; labelPoint: Vec2; placeholder: string }

/**
 * Shared numeric field shown near the cursor while a tool is active (see numericOverlay.ts). `screen` is
 * canvas px; `value` is the text being typed, `kind` selects the parsing rules, `label` an optional caption;
 * `invalid`: the field opens with the red invalid border (a refused value given back to correct);
 * `select`: the initial text is selected (a current value that typing replaces).
 */
export interface NumericInput { value: string; screen: Vec2; kind: NumericKind; label?: string; invalid?: boolean; select?: boolean }

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

/** Layout of the editor center (ruling V2-R19): the plan, the 3D view, or both side by side. */
export type ViewMode = 'plan' | '3d' | 'split';

/**
 * Display options of the editor, kept while the session lasts (across projects): plan dimensions,
 * lower level, grid; the view layout and the share of the plan in 'split' (0.2 .. 0.8); the options
 * of the 3D view (object names, all walls hidden, lower levels shown); the check alerts (spec 7.4):
 * outlines hidden on the plan ("Masquer les alertes"), checks panel expanded.
 */
export interface Display {
  dimMode: 'all' | 'manual' | 'none'; showLowerLevel: boolean; showGrid: boolean;
  view: ViewMode; splitRatio: number;
  labels3d: boolean; hideWalls3d: boolean; lowerLevels3d: boolean;
  hideAlerts: boolean; checksOpen: boolean;
  /**
   * Small objects cast their shadow in 3D (unchecked: faster with many objects). Unlike the other
   * options, kept by the browser across sessions: it depends on the computer.
   */
  smallShadows3d: boolean;
}

/** localStorage key of the only display option the browser keeps (smallShadows3d). */
export const SMALL_SHADOWS_KEY = 'mansarde.smallShadows3d';

function readSmallShadows(): boolean {
  try {
    return globalThis.localStorage?.getItem(SMALL_SHADOWS_KEY) !== 'false';
  } catch {
    return true; // storage refused (private mode): the default
  }
}

function writeSmallShadows(v: boolean): void {
  try {
    globalThis.localStorage?.setItem(SMALL_SHADOWS_KEY, String(v));
  } catch {
    // storage refused: the option lasts for the session
  }
}

export const DEFAULT_DISPLAY: Display = {
  dimMode: 'all', showLowerLevel: true, showGrid: true,
  view: 'plan', splitRatio: 0.5,
  labels3d: true, hideWalls3d: false, lowerLevels3d: false,
  hideAlerts: false, checksOpen: false,
  smallShadows3d: true,
};

export interface EditorState {
  project: Project | null;
  history: History;
  activeLevelId: Id | null;
  selection: SelectionItem[];
  tool: ToolId;
  view: View;
  gesture: Gesture | null;
  overlay: Overlay;
  display: Display;
  clipboard: PlacedObject[];
  toast: { message: string; id: number } | null;
  /** Reference line of the wall tool, kept for the session (never reset by opening a project). */
  wallReference: WallReference;
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
  setWallReference(r: WallReference): void;
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
      display: { ...DEFAULT_DISPLAY, smallShadows3d: readSmallShadows() },
      clipboard: [],
      toast: null,
      wallReference: 'axis',

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
      setDisplay: (p) => {
        if (p.smallShadows3d !== undefined) writeSmallShadows(p.smallShadows3d);
        set((s) => ({ display: { ...s.display, ...p } }));
      },
      setClipboard: (clipboard) => set({ clipboard }),
      showToast: (message) => set({ toast: { message, id: ++toastId } }),
      setWallReference: (wallReference) => set({ wallReference }),
    };
  });
}

export const useEditor = createEditorStore();
