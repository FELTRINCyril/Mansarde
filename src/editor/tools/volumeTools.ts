import { snapPoint, type Guide, type SnapKind } from '@/core/geometry/snap';
import { add, dot, scale, sub } from '@/core/geometry/vec';
import { wallFrame } from '@/core/geometry/walls';
import { SNAP_PX } from '@/core/model/defaults';
import type { Beam, Cupboard, Level, Slope, Vec2 } from '@/core/model/types';

/*
 * Shared by the slope, beam and cupboard tools and by the selection tool (volume handles): the
 * snapping of their points and the ghost payloads drawn by VolumeGhostView.
 */

/** A snapped point of a volume tool; `kind` 'face' = on a wall face (not a snapPoint kind). */
export interface VolumeSnap { point: Vec2; kind: SnapKind | 'face'; guides: Guide[] }

/**
 * Nearest wall face point within tol (cm) of p: the projection of p on a face line of a wall (axis
 * offset by half the thickness on either side), within the length of the wall. Null if none.
 */
export function snapToWallFace(level: Level, p: Vec2, tol: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = tol;
  for (const w of Object.values(level.walls)) {
    if (!Object.hasOwn(level.nodes, w.startNodeId) || !Object.hasOwn(level.nodes, w.endNodeId)) continue;
    const f = wallFrame(level, w.id);
    if (f.length < 1e-9) continue;
    const v = sub(p, f.start);
    const along = dot(v, f.dir);
    if (along < 0 || along > f.length) continue;
    const across = dot(v, f.normal);
    for (const sign of [-1, 1]) {
      const d = Math.abs(across - (sign * w.thickness) / 2);
      if (d <= bestD) {
        bestD = d;
        best = add(add(f.start, scale(f.dir, along)), scale(f.normal, (sign * w.thickness) / 2));
      }
    }
  }
  return best;
}

/**
 * Magnetism of the slope and beam points (spec 7.1): snapPoint's wall node, wall middle and wall
 * axis first, then a wall face, then snapPoint's alignment / angle (from `from`) / grid. With
 * `enabled` false (Alt), the raw point.
 */
export function snapVolumePoint(
  level: Level,
  raw: Vec2,
  o: { pxPerCm: number; gridStep: number; enabled: boolean; from?: Vec2 },
): VolumeSnap {
  const sn = snapPoint(raw, { level, pxPerCm: o.pxPerCm, gridStep: o.gridStep, enabled: o.enabled, ortho: false, from: o.from });
  if (!o.enabled || sn.kind === 'node' || sn.kind === 'wallMid' || sn.kind === 'wallAxis') return sn;
  const face = snapToWallFace(level, raw, SNAP_PX / o.pxPerCm);
  return face ? { point: face, kind: 'face', guides: [] } : sn;
}

/** Ghost of the slope tool: the start line so far (b null: not fixed yet), then the whole slope. */
export interface SlopeGhost { kind: 'volume-slope'; a: Vec2; b: Vec2; slope: Slope | null; marks: Vec2[] }
/** Ghost of the beam tool: the first point, then the beam to the cursor. */
export interface BeamGhost { kind: 'volume-beam'; marks: Vec2[]; beam: Beam | null }
/** Ghost of the cupboard tool (and of a refused cupboard drag): the cupboard on `level`, red when invalid. */
export interface CupboardGhost { kind: 'volume-cupboard'; level: Level; cupboard: Cupboard; valid: boolean }

export type VolumeGhost = SlopeGhost | BeamGhost | CupboardGhost;

export function isVolumeGhost(g: unknown): g is VolumeGhost {
  const k = typeof g === 'object' && g !== null ? (g as { kind?: unknown }).kind : null;
  return k === 'volume-slope' || k === 'volume-beam' || k === 'volume-cupboard';
}
