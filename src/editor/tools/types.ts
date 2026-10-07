import type { Ring, Vec2 } from '@/core/model/types';
import type { createEditorStore, ToolId } from '../store';
import { rectRoomTool } from './rectRoomTool';
import { selectTool } from './selectTool';
import { wallTool } from './wallTool';

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
  onKeyDown?(e: KeyboardEvent, c: ToolContext): boolean; // true = handled
  /**
   * The shared numeric field (overlay.numericInput, see numericOverlay.ts) was validated: the field is
   * already closed and the value parsed (cm, or degrees for the angle kind).
   */
  onNumericSubmit?(valueCm: number, c: ToolContext): void;
  /**
   * Tab in the shared numeric field: the typed value (null when the field is empty). When a tool
   * defines it, Tab stays in the field (the tool usually reopens it for its next value).
   */
  onNumericTab?(valueCm: number | null, c: ToolContext): void;
  /** The shared numeric field was dismissed (Escape or blur) without applying anything. */
  onNumericCancel?(c: ToolContext): void;
  /** Called when another tool becomes active (and on teardown): drop any internal state. */
  onDeactivate?(c: ToolContext): void;
}

/**
 * Generic ghost payload for `overlay.ghost`: outlines and points drawn by OverlayLayer, red when
 * `overlay.previewInvalid` is set, else in the selection color. Tools may use it for any preview
 * the project itself does not show (e.g. the refused position of a dragged opening).
 */
export interface OutlineGhost { kind: 'outline'; rings: Ring[]; points: Vec2[] }

export function isOutlineGhost(g: unknown): g is OutlineGhost {
  return typeof g === 'object' && g !== null && (g as { kind?: unknown }).kind === 'outline';
}

/** Tool implementations by id; filled by later tasks (wall, rect, door/window, dimension, calibrate). */
export const TOOLS: Partial<Record<ToolId, Tool>> = {
  select: selectTool,
  wall: wallTool,
  rect: rectRoomTool,
};
