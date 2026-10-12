import { snapPoint, type Guide } from '@/core/geometry/snap';
import { add, cross, dist, dot, lineIntersection, scale, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { SNAP_PX } from '@/core/model/defaults';
import type { Beam, Cupboard, Level, Slope, Vec2 } from '@/core/model/types';
import type { CursorMarker, DrawGhost, MarkerKind } from './drawing';

/*
 * Shared by the slope, beam and cupboard tools and by the selection tool (volume handles): the
 * snapping of their points and the ghost payloads drawn by VolumeGhostView.
 */

/** A snapped point of a volume tool; `kind` 'face' = on a wall face (not a snapPoint kind). */
export interface VolumeSnap { point: Vec2; kind: MarkerKind; guides: Guide[] }

/** The face lines of the walls of a level: start point, unit direction and length (the wall's). */
function wallFaces(level: Level): { start: Vec2; dir: Vec2; length: number }[] {
  const faces: { start: Vec2; dir: Vec2; length: number }[] = [];
  for (const w of Object.values(level.walls)) {
    if (!Object.hasOwn(level.nodes, w.startNodeId) || !Object.hasOwn(level.nodes, w.endNodeId)) continue;
    const f = wallFrame(level, w.id);
    if (f.length < 1e-9) continue;
    for (const sign of [-1, 1]) faces.push({ start: add(f.start, scale(f.normal, (sign * w.thickness) / 2)), dir: f.dir, length: f.length });
  }
  return faces;
}

/**
 * Nearest wall face point within tol (cm) of p: the projection of p on a face line of a wall (axis
 * offset by half the thickness on either side), within the length of the wall. Null if none.
 */
export function snapToWallFace(level: Level, p: Vec2, tol: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const f of wallFaces(level)) {
    const along = dot(sub(p, f.start), f.dir);
    if (along < 0 || along > f.length) continue;
    const foot = add(f.start, scale(f.dir, along));
    const d = dist(p, foot);
    if (d <= bestD) {
      bestD = d;
      best = foot;
    }
  }
  return best;
}

/**
 * Shift (ortho) variant of snapToWallFace: the crossing of the line through `from` along the unit
 * vector u with a wall face, within the length of the wall and within tol (cm) of q (the cursor
 * projected on that line), so that the point stays on the line. Null if none.
 */
function snapToWallFaceOnLine(level: Level, from: Vec2, u: Vec2, q: Vec2, tol: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const f of wallFaces(level)) {
    if (Math.abs(cross(u, f.dir)) < 1e-9) continue; // parallel to the line
    const x = lineIntersection(from, u, f.start, f.dir);
    if (!x) continue;
    const along = dot(sub(x, f.start), f.dir);
    const d = dist(x, q);
    if (along >= 0 && along <= f.length && d <= bestD) {
      bestD = d;
      best = x;
    }
  }
  return best;
}

/**
 * Magnetism of the slope and beam points (spec 7.1): snapPoint's wall node, wall middle and wall
 * axis first, then a wall face, then snapPoint's alignment / angle (from `from`) / grid. With
 * `ortho` (Shift) and `from`, like the walls: horizontal or vertical from `from` (snapPoint's
 * ortho), a wall face crossing that line taking precedence over the grid. With `enabled` false
 * (Alt), the raw point.
 */
export function snapVolumePoint(
  level: Level,
  raw: Vec2,
  o: { pxPerCm: number; gridStep: number; enabled: boolean; from?: Vec2; ortho?: boolean },
): VolumeSnap {
  const ortho = !!o.ortho && o.from !== undefined;
  const sn = snapPoint(raw, { level, pxPerCm: o.pxPerCm, gridStep: o.gridStep, enabled: o.enabled, ortho, from: o.from });
  if (!o.enabled || sn.kind === 'node' || sn.kind === 'wallMid' || sn.kind === 'wallAxis') return sn;
  const tol = SNAP_PX / o.pxPerCm;
  if (ortho) {
    // same choice of line as snapPoint's ortho: the closer of the horizontal and the vertical
    const from = o.from!;
    const horizontal = Math.abs(raw.x - from.x) >= Math.abs(raw.y - from.y);
    const u = horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 };
    const q = horizontal ? { x: raw.x, y: from.y } : { x: from.x, y: raw.y };
    const face = snapToWallFaceOnLine(level, from, u, q, tol);
    return face ? { point: face, kind: 'face', guides: [] } : sn;
  }
  const face = snapToWallFace(level, raw, tol);
  return face ? { point: face, kind: 'face', guides: [] } : sn;
}

/** The snapped cursor marker of a snapped point. */
export const markerOf = (s: VolumeSnap): CursorMarker => ({ at: s.point, snap: s.kind });

/**
 * Ghost of a point being picked with nothing else to draw yet (first point of the slope and beam
 * tools, end handle of a slope or beam being dragged): only the snapped cursor marker, like the
 * wall tool before its first click.
 */
export const markerGhost = (s: VolumeSnap): DrawGhost => ({ kind: 'draw', paths: [], marker: markerOf(s), label: null });

/**
 * Ghost of the slope tool: the start line a -> b (b follows the cursor until fixed, with its
 * snapped cursor marker), then the whole slope.
 */
export interface SlopeGhost { kind: 'volume-slope'; a: Vec2; b: Vec2; slope: Slope | null; marks: Vec2[]; marker?: CursorMarker | null }
/** Ghost of the beam tool: the beam from the first point to the cursor, with the snapped cursor marker. */
export interface BeamGhost { kind: 'volume-beam'; marks: Vec2[]; beam: Beam | null; marker?: CursorMarker | null }
/** Ghost of the cupboard tool (and of a refused cupboard drag): the cupboard on `level`, red when invalid. */
export interface CupboardGhost { kind: 'volume-cupboard'; level: Level; cupboard: Cupboard; valid: boolean }

export type VolumeGhost = SlopeGhost | BeamGhost | CupboardGhost;

export function isVolumeGhost(g: unknown): g is VolumeGhost {
  const k = typeof g === 'object' && g !== null ? (g as { kind?: unknown }).kind : null;
  return k === 'volume-slope' || k === 'volume-beam' || k === 'volume-cupboard';
}
