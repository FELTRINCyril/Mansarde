import { getCatalogEntry } from '@/catalog/catalog';
import { applyCommand, type Recipe } from '@/core/commands/apply';
import { addObject } from '@/core/commands/objects';
import { addOpening } from '@/core/commands/openings';
import { setBackground } from '@/core/commands/project';
import { renameRoom } from '@/core/commands/rooms';
import { addRectRoom } from '@/core/commands/walls';
import { deriveLevel } from '@/core/geometry/derived';
import { createObjectFromSize, createOpening, createProject } from '@/core/model/factory';
import type { Id, Level, Project } from '@/core/model/types';

/**
 * Export sample shared by the unit tests and the browser tests (imported as
 * /tests/export/sampleProject.ts by the Vite dev server): project "Maison d'été", level RDC, one
 * room "Séjour" of 400 x 300 cm (axes, walls 20 cm), an outward door on the top wall (its arc goes
 * above the room), an inward window on the right wall and a bed "Lit bébé". With `imageId`, a
 * background image of 200 x 150 px at 2.5 cm per pixel, half transparent.
 */
export function buildSampleProject(opts: { imageId?: Id } = {}): Project {
  let p = createProject("Maison d'été");
  const levelId = p.levels[0]!.id;
  const run = (r: Recipe): void => {
    const res = applyCommand(p, r);
    if (!res.ok) throw new Error(res.error);
    p = res.project;
  };
  const level = (): Level => p.levels[0]!;
  const wallBetween = (ax: number, ay: number, bx: number, by: number) => {
    const l = level();
    const w = Object.values(l.walls).find((w) => {
      const s = l.nodes[w.startNodeId]!;
      const e = l.nodes[w.endNodeId]!;
      return (s.x === ax && s.y === ay && e.x === bx && e.y === by) || (s.x === bx && s.y === by && e.x === ax && e.y === ay);
    });
    if (!w) throw new Error('wall not found');
    return { wall: w, forward: l.nodes[w.startNodeId]!.x === ax && l.nodes[w.startNodeId]!.y === ay };
  };

  run(addRectRoom(levelId, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));

  // top wall: left side of (0,0)->(400,0) is +y (inside), so the outward swing is 'right'
  const top = wallBetween(0, 0, 400, 0);
  run(addOpening(levelId, createOpening(top.wall.id, 'door', 120, { swing: top.forward ? 'right' : 'left' })));
  // right wall: left side of (400,0)->(400,300) is -x (inside)
  const right = wallBetween(400, 0, 400, 300);
  run(addOpening(levelId, createOpening(right.wall.id, 'window', 150, { swing: right.forward ? 'left' : 'right' })));

  const bed = getCatalogEntry('bed-140')!;
  run(
    addObject(
      levelId,
      createObjectFromSize({ kind: 'catalog', catalogId: bed.id }, 110, 190, bed, 'Lit bébé', bed.color),
    ),
  );

  const room = deriveLevel(level()).rooms[0]!;
  run(renameRoom(levelId, { label: room.label, labelPoint: room.labelPoint }, 'Séjour'));

  if (opts.imageId) {
    run(
      setBackground(levelId, {
        imageId: opts.imageId,
        widthPx: 200,
        heightPx: 150,
        scale: 2.5,
        x: -50,
        y: -50,
        rotation: 0,
        opacity: 0.5,
        locked: true,
        visible: true,
      }),
    );
  }
  return p;
}
