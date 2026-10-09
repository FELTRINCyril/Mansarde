import type { ProfilePoint } from '@/core/geometry/cupboards';
import { formatLength } from '@/core/model/format';

/**
 * Resulting height of a cupboard from its top profile (spec 7.2): "2,20 m" when constant (to the
 * centimeter shown), "de 1,48 m à 2,38 m" under a slope or a beam.
 */
export function resultingHeightText(profile: readonly ProfilePoint[]): string {
  if (profile.length === 0) return '-';
  const tops = profile.map((p) => p.top);
  const lo = formatLength(Math.min(...tops));
  const hi = formatLength(Math.max(...tops));
  return lo === hi ? lo : `de ${lo} à ${hi}`;
}
