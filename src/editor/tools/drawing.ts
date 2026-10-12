import type { WallPoint } from '@/core/commands/walls';
import type { DimLine } from '@/core/geometry/autoDimensions';
import type { Guide, SnapKind, SnapResult } from '@/core/geometry/snap';
import { add, rad2deg } from '@/core/geometry/vec';
import type { Level, Vec2 } from '@/core/model/types';
import { formatNumber } from '@/ui/numeric';
import { activeLevel, type EditorStore, type WallReference } from '../store';
import type { PointerInfo, ToolContext } from './types';

/** Everything the drawing tools read from the editor (active level, zoom, project settings). */
export interface WallToolEnv {
  level: Level;
  pxPerCm: number;
  gridStep: number;
  thickness: number; // settings.defaultWallThickness
  partitionThickness: number; // settings.partitionThickness, Ctrl / Cmd held
  height: number; // settings.defaultCeilingHeight
  reference?: WallReference; // wall tool reference line (store.wallReference); absent = axis
}

/** Shift = orthogonal, Alt = no snapping, meta = Ctrl or Cmd (partition thickness). */
export interface Mods { shift: boolean; alt: boolean; meta: boolean }

/** Environment of the drawing tools: active level, zoom and project settings; null without a project. */
export function drawingEnv(c: ToolContext): WallToolEnv | null {
  const st = c.store.getState();
  const level = activeLevel(st);
  if (!st.project || !level) return null;
  const s = st.project.settings;
  return {
    level,
    pxPerCm: c.pxPerCm(),
    gridStep: s.gridStep,
    thickness: s.defaultWallThickness,
    partitionThickness: s.partitionThickness,
    height: s.defaultCeilingHeight,
    reference: st.wallReference,
  };
}

export const modsOf = (e: PointerInfo): Mods => ({ shift: e.shift, alt: e.alt, meta: e.meta });

/** A digit without Alt (Ctrl / Cmd allowed: partition): opens the numeric field of a drawing tool. */
export const isDigitKey = (e: KeyboardEvent): boolean => /^[0-9]$/.test(e.key) && !e.altKey;

/**
 * The shortcut modifier (Cmd on macOS, Ctrl elsewhere), like keyboard.ts. Not imported from there:
 * keyboard.ts imports the TOOLS registry, which imports the tools (module cycle at load time).
 */
export function isModKey(e: KeyboardEvent): boolean {
  const nav = (globalThis as { navigator?: { platform?: string } }).navigator;
  return /Mac|iPhone|iPad/.test(nav?.platform ?? '') ? e.metaKey : e.ctrlKey;
}

/** Mod+Z (undo) and Mod+Shift+Z / Mod+Y (redo) seen by a drawing tool, else null. */
export function undoKeyOf(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!isModKey(e) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  return k === 'y' ? 'redo' : null;
}

/**
 * Calls onChange(store) whenever the active level or the project of the store changes (a drawing
 * in progress belongs to one level). Each tool registers itself once per store (keyed by `owner`,
 * later calls are no-ops); nothing is ever unsubscribed (tools and
 * the editor store live as long as the page).
 */
const watched = new WeakMap<EditorStore, Map<object, () => void>>();
export function watchActiveLevel(store: EditorStore, owner: object, onChange: () => void): void {
  let listeners = watched.get(store);
  if (!listeners) {
    const map = new Map<object, () => void>();
    listeners = map;
    watched.set(store, map);
    store.subscribe((s, prev) => {
      if (s.activeLevelId !== prev.activeLevelId || s.project?.id !== prev.project?.id) for (const f of map.values()) f();
    });
  }
  if (!listeners.has(owner)) listeners.set(owner, onChange);
}

/** Lowering (px) of the numeric field when the tool label sits next to or below the cursor. */
export const FIELD_DROP_PX = 44;

/**
 * Where to open the numeric field (its box goes below-right of this point): the cursor, lowered
 * when the ghost label is placed beside or below the cursor (`toward`, see DrawGhost), so that
 * the field never covers it.
 */
export function fieldScreen(cursor: Vec2, toward: Vec2 | undefined): Vec2 {
  return toward && toward.y > -0.3 ? add(cursor, { x: 0, y: FIELD_DROP_PX }) : cursor;
}

/** What a snapped point stuck to: a snapPoint kind, or 'face' (a wall face, volume tools). */
export type MarkerKind = SnapKind | 'face';

/** Snapped cursor marker (SnapMarker in the render): where the point lands and what it stuck to. */
export interface CursorMarker { at: Vec2; snap: MarkerKind }

/**
 * Ghost of the drawing tools (wall, rectangular room) in `overlay.ghost`, drawn by DrawGhostView:
 * wall axes stroked with their thickness (polylines, closed for a rectangle), the snapped cursor
 * marker and a small text label next to the cursor. World cm. A path with `axis: false` is drawn
 * without its dashed axis line; a path of thickness 0 is only that dashed line (a reference line).
 */
export interface DrawGhost {
  kind: 'draw';
  paths: { points: Vec2[]; closed: boolean; thickness: number; axis?: false }[];
  marker: CursorMarker | null;
  /** Text next to `at`, offset in screen px along the unit vector `toward` (default: up-right). */
  label: { at: Vec2; lines: string[]; toward?: Vec2 } | null;
}

export function isDrawGhost(g: unknown): g is DrawGhost {
  return typeof g === 'object' && g !== null && (g as { kind?: unknown }).kind === 'draw';
}

/** The part of the overlay a drawing tool owns (the numeric field is opened and closed separately). */
export interface DrawOverlay {
  guides: Guide[];
  dynamicDims: DimLine[];
  activeDimIndex: number | null;
  ghost: DrawGhost | null;
}

export const EMPTY_DRAW_OVERLAY: DrawOverlay = { guides: [], dynamicDims: [], activeDimIndex: null, ghost: null };

/** Distance (screen px) between a dynamic dimension line and the face of the wall being drawn. */
export const DYN_DIM_GAP_PX = 18;

/** How a snapped point is passed to addWallChain: existing node, point on a wall axis, or free. */
export function wallPointOf(s: SnapResult): WallPoint {
  if (s.kind === 'node' && s.nodeId !== undefined) return { kind: 'node', nodeId: s.nodeId };
  if ((s.kind === 'wallAxis' || s.kind === 'wallMid') && s.wallId !== undefined && s.t !== undefined && s.t > 0 && s.t < 1) {
    return { kind: 'onWall', wallId: s.wallId, t: s.t };
  }
  return { kind: 'free', x: s.point.x, y: s.point.y };
}

/** Angle of v as read on screen: degrees in [0, 360), counterclockwise (y points down in the model). */
export function screenAngle(v: Vec2): number {
  const a = rad2deg(Math.atan2(-v.y, v.x));
  const r = ((a % 360) + 360) % 360;
  return Math.round(r * 10) / 10 >= 360 ? 0 : r;
}

export const formatAngle = (deg: number): string => `${formatNumber(deg)}°`;

/** "Mur 20 cm" or "Cloison 7 cm" (Ctrl / Cmd held). */
export const thicknessLabel = (thickness: number, partition: boolean): string =>
  `${partition ? 'Cloison' : 'Mur'} ${formatNumber(thickness)} cm`;
