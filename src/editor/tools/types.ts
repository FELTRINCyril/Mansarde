import type { Ring, Vec2 } from '@/core/model/types';
import type { createEditorStore, ToolId } from '../store';

/**
 * What a tool gets from the plan canvas (PlanCanvas builds it once). Tools never touch the DOM:
 * they read and write the editor store (project through execute / gestures, selection, overlay).
 */
export interface ToolContext {
  store: ReturnType<typeof createEditorStore>;
  /** Canvas coordinates (px, relative to the plan container) to world cm. */
  toWorld(screen: Vec2): Vec2;
  pxPerCm(): number;
  /** Fits the view on the content of the active level (key 0). */
  fitView(): void;
}

/**
 * A pointer event as tools see it. `world` is in cm, `screen` in px relative to the canvas.
 * `meta` is Cmd or Ctrl; `detail` is the click count of the DOM event.
 */
export interface PointerInfo { world: Vec2; screen: Vec2; button: number; shift: boolean; alt: boolean; meta: boolean; detail: number }

/**
 * Pointer routing (PlanCanvas): wheel, middle button and space + drag are the canvas' own (zoom,
 * pan); every other pointer event goes to the active tool, with pointer capture from down to up.
 * Keys go through handleGlobalKey (keyboard.ts), which offers them to onKeyDown first, except
 * while the user types in a field.
 */
export interface Tool {
  id: ToolId;
  cursor: string;
  onPointerDown?(e: PointerInfo, c: ToolContext): void;
  onPointerMove?(e: PointerInfo, c: ToolContext): void;
  onPointerUp?(e: PointerInfo, c: ToolContext): void;
  onDoubleClick?(e: PointerInfo, c: ToolContext): void;
  /**
   * true = handled. A tool that opens the numeric field (openNumericInput) for a typed digit MUST
   * return true: PlanCanvas then preventDefaults the key, otherwise the digit would also be typed
   * into the freshly focused field (twice in the field, once from `initial`).
   */
  onKeyDown?(e: KeyboardEvent, c: ToolContext): boolean;
  /**
   * The shared numeric field (overlay.numericInput, see numericOverlay.ts) was validated: the field is
   * already closed and the value parsed (cm, or degrees for the angle kind).
   */
  onNumericSubmit?(valueCm: number, c: ToolContext): void;
  /**
   * Tab in the shared numeric field: the typed value (null when the field is empty). When a tool
   * defines it, Tab stays in the field (the tool usually reopens it for its next value).
   * `backward` is true for Shift+Tab (previous value).
   */
  onNumericTab?(valueCm: number | null, c: ToolContext, backward?: boolean): void;
  /** The shared numeric field was dismissed (Escape or blur) without applying anything. */
  onNumericCancel?(c: ToolContext): void;
  /**
   * The pointer interaction in progress was interrupted without a pointerup: pointercancel, pointer
   * capture lost, window blur during a press (PlanCanvas), or Mod+Z / Escape during a gesture
   * (keyboard.ts). Abandon it like Escape would: cancel the open gesture, drop the drag state,
   * commit nothing. Must be safe to call when nothing is in progress.
   */
  onCancel?(c: ToolContext): void;
  /**
   * Space pressed and released on the plan without panning in between (PlanCanvas): space + drag
   * stays the pan of the view. Used by the wall tool to flip its reference line (spec 6).
   */
  onSpaceTap?(c: ToolContext): void;
  /** Called when another tool becomes active (and on teardown): drop any internal state. */
  onDeactivate?(c: ToolContext): void;
}

/*
 * Only types and ghost type guards here: the tool registry (TOOLS) lives in registry.ts, so that the
 * tools can import these types without a module cycle.
 */

/**
 * Generic ghost payload for `overlay.ghost`: outlines and points drawn by OverlayLayer, red when
 * `overlay.previewInvalid` is set, else in the selection color. Tools may use it for any preview
 * the project itself does not show (e.g. the refused position of a dragged opening).
 */
export interface OutlineGhost { kind: 'outline'; rings: Ring[]; points: Vec2[] }

export function isOutlineGhost(g: unknown): g is OutlineGhost {
  return typeof g === 'object' && g !== null && (g as { kind?: unknown }).kind === 'outline';
}

/** `overlay.ghost` payload of the calibration: the segment drawn so far and its fixed end points (world cm). */
export interface SegmentGhost { kind: 'segment'; a: Vec2; b: Vec2; points: Vec2[] }

export function isSegmentGhost(g: unknown): g is SegmentGhost {
  return typeof g === 'object' && g !== null && (g as { kind?: unknown }).kind === 'segment';
}
