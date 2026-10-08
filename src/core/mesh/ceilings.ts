import type { Level } from '../model/types';
import type { Room } from '../geometry/rooms';
import { MeshBuilder } from './builder';
import { beyond, cellEdges, cellsOf, ceilingField, junctionsOf, slopeEnds } from './cells';
import { inShape } from './solid';
import type { MeshData } from './types';

/**
 * Ceiling of a room: its ring minus its islands, cut at the slope lines, each vertex at
 * ceilingWithoutBeams, facing down. Where the ceiling jumps (lateral end of a slope inside the
 * room), a vertical face joins the lower part to the higher one, facing the higher side.
 */
export function buildCeiling(level: Level, room: Room): MeshData {
  const b = new MeshBuilder();
  const shape = [{ outer: room.ring, holes: room.islands }];
  const inside = inShape(shape);
  const cells = cellsOf(level, shape, [level.height, ...slopeEnds(level)]);
  const junctions = junctionsOf(cells);
  for (const cell of cells) {
    const h = ceilingField(level, cell.probe);
    b.surface(cell.pts, cell.tris, h, 'down');
    for (const { a, b: e, out } of cellEdges(cell, junctions)) {
      const q = beyond(a, e, out);
      if (!inside(q)) continue;
      const hn = ceilingField(level, q);
      b.band(a, e, [h(a), h(e)], [hn(a), hn(e)], out);
    }
  }
  return b.build();
}
