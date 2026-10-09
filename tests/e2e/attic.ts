import type { Page } from '@playwright/test';

/**
 * Builds the attic room of plan-chambre on the active level through the dev handle (core commands
 * via store.execute, like the visual and export specs): 4.00 x 4.00 m inside, 20 cm walls, ceiling
 * 2.40 m going down to 1.50 m from x = 1.97 m, a beam along the start of the slope, a window in
 * the top wall, the door in the left wall near the bottom corner, cupboards under the slope along
 * the right wall.
 */
export async function buildAttic(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addRectRoomInterior } = await mod('/src/core/commands/walls.ts');
    const { addOpening } = await mod('/src/core/commands/openings.ts');
    const { setLevelProps } = await mod('/src/core/commands/levels.ts');
    const { addSlope } = await mod('/src/core/commands/slopes.ts');
    const { addBeam } = await mod('/src/core/commands/beams.ts');
    const { addCupboard } = await mod('/src/core/commands/cupboards.ts');
    const { createOpening, createSlope, createBeam, createCupboard } = await mod('/src/core/model/factory.ts');
    const store = window.__planMaison!.store;
    const s = () => store.getState();
    const levelId = s().activeLevelId!;
    const level = () => s().project!.levels.find((l) => l.id === levelId)!;
    const ok = (label: string, recipe: unknown) => {
      if (!s().execute(label, recipe as never)) throw new Error(`refused: ${label}`);
    };
    ok('Hauteur', setLevelProps(levelId, { height: 240 }));
    ok('Pièce', addRectRoomInterior(levelId, { x: 0, y: 0 }, { x: 400, y: 400 }, 20, 240));
    /** The wall whose axis runs from a to b (either direction), its start and its direction. */
    const wallFrom = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const l = level();
      for (const w of Object.values(l.walls)) {
        const p = l.nodes[w.startNodeId]!;
        const q = l.nodes[w.endNodeId]!;
        const same = (m: { x: number; y: number }, n: { x: number; y: number }) => Math.hypot(m.x - n.x, m.y - n.y) < 1e-6;
        if ((same(p, a) && same(q, b)) || (same(p, b) && same(q, a))) return { id: w.id, start: p };
      }
      throw new Error('no wall');
    };
    const offsetOf = (w: { start: { x: number; y: number } }, at: { x: number; y: number }) => Math.hypot(at.x - w.start.x, at.y - w.start.y);
    const top = wallFrom({ x: -10, y: -10 }, { x: 410, y: -10 });
    ok('Fenêtre', addOpening(levelId, createOpening(top.id, 'window', offsetOf(top, { x: 115, y: -10 }), { width: 130, sillHeight: 95, height: 120, variant: 'double' })));
    const left = wallFrom({ x: -10, y: -10 }, { x: -10, y: 410 });
    // hinged on the side of the bottom corner, opening into the room (+x)
    const leftDirDown = left.start.y < 0;
    ok(
      'Porte',
      addOpening(levelId, {
        ...createOpening(left.id, 'door', offsetOf(left, { x: -10, y: 355 }), { width: 90 }),
        hinge: leftDirDown ? 'end' : 'start',
        swing: leftDirDown ? 'right' : 'left',
      }),
    );
    ok('Pente', addSlope(levelId, createSlope({ x: 197, y: -50 }, { x: 197, y: 450 }, 'right', 203, 240, 150)));
    ok('Poutre', addBeam(levelId, createBeam({ x: 191, y: 0 }, { x: 191, y: 400 })));
    const right = wallFrom({ x: 410, y: -10 }, { x: 410, y: 410 });
    const rightDirDown = right.start.y < 0;
    ok('Placard', addCupboard(levelId, createCupboard(right.id, offsetOf(right, { x: 410, y: 200 }), rightDirDown ? 'left' : 'right', { width: 400, heightMode: 'ceiling', doorCount: 4 })));
  });
}
