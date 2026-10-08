import type { Beam, Level, Ring, Vec2 } from '../model/types';
import { add, normalize, perp, scale, sub } from './vec';
import { slopesCeilingAt } from './slopes';

/** Rectangle of the beam in plan: the axis a -> b widened by width / 2 on each side (square ends). */
export function beamFootprint(b: Beam): Ring {
  const n = scale(perp(normalize(sub(b.b, b.a))), b.width / 2);
  return [sub(b.a, n), sub(b.b, n), add(b.b, n), add(b.a, n)];
}

/**
 * Height of the underside of the beam above p (p is not checked against the footprint): `bottom`
 * in 'fixed' mode; in 'ceiling' mode the ceiling without beams at p minus the drop (spec 4.3).
 */
export function beamBottomAt(level: Level, b: Beam, p: Vec2): number {
  return b.mode === 'fixed' ? b.bottom : slopesCeilingAt(level, p) - b.drop;
}
