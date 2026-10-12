import type { Beam, Level } from '../model/types';
import { beamFootprint } from '../geometry/beams';
import { isUsableRing } from '../geometry/boolean';
import { MeshBuilder } from './builder';
import { ceilingField, slopeEnds } from './cells';
import { emitColumns } from './solid';
import type { MeshData } from './types';

/**
 * A beam as a box over its footprint. 'ceiling' mode: the top on the ceiling without beams and
 * the underside `drop` below it, both inclined under a slope. 'fixed' mode: the underside at
 * `bottom`, the top `drop` above it, capped by the ceiling (nothing where the ceiling is lower
 * than `bottom`).
 */
export function buildBeam(level: Level, beam: Beam): MeshData {
  const b = new MeshBuilder();
  const ring = beamFootprint(beam);
  if (!isUsableRing(ring) || !Number.isFinite(beam.drop)) return b.build();
  const shape = [{ outer: ring, holes: [] }];
  const fixed = beam.mode === 'fixed';
  const constants = [level.height, ...slopeEnds(level), ...(fixed ? [beam.bottom, beam.bottom + beam.drop] : [])];
  emitColumns(b, level, [
    {
      region: shape,
      constants,
      intervals: (m) => {
        const c = ceilingField(level, m);
        if (!fixed) return [{ bottom: (p) => c(p) - beam.drop, top: c }];
        return [{ bottom: () => beam.bottom, top: (p) => Math.max(beam.bottom, Math.min(beam.bottom + beam.drop, c(p))) }];
      },
    },
  ]);
  return b.build();
}
