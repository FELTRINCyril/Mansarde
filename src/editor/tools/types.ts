import type { Vec2 } from '@/core/model/types';
import type { createEditorStore, ToolId } from '../store';

export interface ToolContext {
  store: ReturnType<typeof createEditorStore>;
  /** Canvas coordinates (px, relative to the plan container) to world cm. */
  toWorld(screen: Vec2): Vec2;
  pxPerCm(): number;
}

export interface PointerInfo { world: Vec2; screen: Vec2; button: number; shift: boolean; alt: boolean; meta: boolean; detail: number }

export interface Tool {
  id: ToolId;
  cursor: string;
  onPointerDown?(e: PointerInfo, c: ToolContext): void;
  onPointerMove?(e: PointerInfo, c: ToolContext): void;
  onPointerUp?(e: PointerInfo, c: ToolContext): void;
  onDoubleClick?(e: PointerInfo, c: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, c: ToolContext): boolean; // true = handled
  onDeactivate?(c: ToolContext): void;
}

/** Tool implementations by id; filled by later tasks (select, wall, rect, door/window, dimension, calibrate). */
export const TOOLS: Partial<Record<ToolId, Tool>> = {};
