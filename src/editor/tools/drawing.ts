import type { WallPoint } from '@/core/commands/walls';
import type { DimLine } from '@/core/geometry/autoDimensions';
import type { Guide, SnapKind, SnapResult } from '@/core/geometry/snap';
import { rad2deg } from '@/core/geometry/vec';
import type { Vec2 } from '@/core/model/types';
import { formatNumber } from '@/ui/numeric';

/**
 * Ghost of the drawing tools (wall, rectangular room) in `overlay.ghost`, drawn by DrawGhostView:
 * wall axes stroked with their thickness (polylines, closed for a rectangle), the snapped cursor
 * marker and a small text label next to the cursor. World cm.
 */
export interface DrawGhost {
  kind: 'draw';
  paths: { points: Vec2[]; closed: boolean; thickness: number }[];
  marker: { at: Vec2; snap: SnapKind } | null;
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
