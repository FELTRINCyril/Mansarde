/// <reference types="node" />
import { expect, test, type Page } from '@playwright/test';
import { createProject, onPage, type Vec } from './helpers';

/*
 * V2 spec 7.2 and 7.4: properties of slopes, beams and cupboards, the "Pose" menu of objects, the
 * interior size of a rectangular room, the checks panel with its header counter. Scenes are built
 * through the dev handle (store.execute with core commands); everything else is done like a user.
 */

/** A room of 400 x 300 inside (walls outside, 20 cm), then the view fitted on it with key 0. */
async function interiorRoom(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoomInterior } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoomInterior(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  });
  await fit(page);
}

async function fit(page: Page): Promise<void> {
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
}

/** Objects through the dev handle: [catalogId, name, x, y, size?]. */
async function addObjects(page: Page, list: Array<[string, string, number, number, { width: number; depth: number; height: number }?]>): Promise<void> {
  await page.evaluate(async (items) => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
    const s = window.__planMaison!.store.getState();
    for (const [id, name, x, y, size] of items) {
      const e = getCatalogEntry(id);
      s.execute('Objet', addObject(s.activeLevelId!, createObjectFromSize({ kind: 'catalog', catalogId: id }, x, y, size ?? e, name, e.color, { pose: e.pose })));
    }
  }, list);
}

async function clickWorld(page: Page, w: Vec): Promise<void> {
  const p = await onPage(page, w);
  await page.mouse.click(p.x, p.y);
}

/** Slope from y = 50 going down towards +y (150 deep, 250 -> 150), a beam on y = 200, a cupboard on the left wall (y 50..170). */
async function volumes(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addSlope } = await mod('/src/core/commands/slopes.ts');
    const { addBeam } = await mod('/src/core/commands/beams.ts');
    const { addCupboard } = await mod('/src/core/commands/cupboards.ts');
    const { createBeam, createCupboard, createSlope } = await mod('/src/core/model/factory.ts');
    const s = () => window.__planMaison!.store.getState();
    const levelId = s().activeLevelId!;
    s().execute('Pente', addSlope(levelId, createSlope({ x: 0, y: 50 }, { x: 400, y: 50 }, 'left', 150, 250)));
    s().execute('Poutre', addBeam(levelId, createBeam({ x: 50, y: 200 }, { x: 350, y: 200 })));
    const level = s().project!.levels.find((l) => l.id === levelId)!;
    const wall = Object.values(level.walls).find((w) => level.nodes[w.startNodeId]!.x === -10 && level.nodes[w.endNodeId]!.x === -10)!;
    const a = level.nodes[wall.startNodeId]!;
    const b = level.nodes[wall.endNodeId]!;
    const dirY = Math.sign(b.y - a.y); // the wall is vertical: left = +perp(dir) = (-dirY, 0)
    s().execute('Placard', addCupboard(levelId, createCupboard(wall.id, Math.abs(110 - a.y), -dirY > 0 ? 'left' : 'right')));
  });
}

const levelState = (page: Page) =>
  page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return {
      slopes: Object.values(level.slopes),
      beams: Object.values(level.beams),
      cupboards: Object.values(level.cupboards),
      objects: Object.values(level.objects),
      selection: s.selection,
    };
  });

test('slope panel: end height typed in the panel, direction flipped', async ({ page }) => {
  await createProject(page, 'Pente');
  await interiorRoom(page);
  await volumes(page);
  await clickWorld(page, { x: 200, y: 50 }); // on the start line
  const panel = page.getByTestId('properties-panel');
  await expect(panel.getByRole('heading', { name: 'Pente' })).toBeVisible();
  await expect(page.getByTestId('slope-height-start')).toHaveValue('250');
  await expect(page.getByTestId('slope-height-end')).toHaveValue('150');
  await expect(page.getByTestId('slope-depth')).toHaveValue('150');

  await page.getByTestId('slope-height-end').fill('120');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await levelState(page)).slopes[0]!.heightEnd).toBe(120);
  await expect(page.getByTestId('slope-height-end')).toHaveValue('120');

  await page.getByTestId('slope-flip').click();
  await expect.poll(async () => (await levelState(page)).slopes[0]!.side).toBe('right');
  // one history entry each: undo restores the direction, then the height
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await levelState(page)).slopes[0]!.side).toBe('left');
});

test('beam and cupboard panels: mode, underside height, resulting height under the slope', async ({ page }) => {
  await createProject(page, 'Volumes');
  await interiorRoom(page);
  await volumes(page);

  await clickWorld(page, { x: 200, y: 200 });
  await expect(page.getByTestId('properties-panel').getByRole('heading', { name: 'Poutre' })).toBeVisible();
  await expect(page.getByTestId('beam-length')).toHaveText('3,00 m');
  await expect(page.getByTestId('beam-width')).toHaveValue('12');
  await expect(page.getByTestId('beam-drop')).toHaveValue('15');
  await expect(page.getByTestId('beam-bottom')).toHaveCount(0);
  await page.getByTestId('beam-mode').selectOption('fixed');
  await expect(page.getByTestId('beam-bottom')).toHaveValue('235');
  await page.getByTestId('beam-bottom').fill('210');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await levelState(page)).beams[0]).toMatchObject({ mode: 'fixed', bottom: 210 });

  await clickWorld(page, { x: 30, y: 110 });
  await expect(page.getByTestId('properties-panel').getByRole('heading', { name: 'Placard' })).toBeVisible();
  await expect(page.getByTestId('cupboard-resulting-height')).toHaveText('2,20 m');
  await expect(page.getByTestId('cupboard-gap')).toHaveCount(0);
  await page.getByTestId('cupboard-height-mode').selectOption('ceiling');
  // y 50..170 under the slope: ceiling 250 at y = 50, 170 at y = 170, minus the 2 cm gap
  await expect(page.getByTestId('cupboard-resulting-height')).toHaveText('de 1,68 m à 2,48 m');
  await expect(page.getByTestId('cupboard-gap')).toHaveValue('2');
  await page.getByTestId('cupboard-door-count').selectOption('3');
  await page.getByTestId('cupboard-door-type').selectOption('sliding');
  await expect.poll(async () => (await levelState(page)).cupboards[0]).toMatchObject({ heightMode: 'ceiling', doorCount: 3, doorType: 'sliding' });

  // a refused width (the wall is too short) is toasted and changes nothing
  await page.getByTestId('cupboard-width').fill('900');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toHaveText('Pas assez de place sur ce mur');
  expect((await levelState(page)).cupboards[0]!.width).toBe(120);
});

test('checks: counter, panel rows, Revêtement, row click selects and centers, hide alerts', async ({ page }) => {
  await createProject(page, 'Vérifications');
  await interiorRoom(page);
  await expect(page.getByTestId('alert-counter')).toHaveCount(0);
  await addObjects(page, [
    ['bed-90', 'Lit', 100, 150],
    ['generic-rect', 'Coffre', 100, 230, { width: 80, depth: 60, height: 40 }],
    ['generic-rect', 'Commode', 300, 10, { width: 80, depth: 40, height: 80 }],
  ]);
  await expect(page.getByTestId('alert-counter')).toHaveText('2 alertes');
  await expect(page.locator('[data-kind="alert"]')).toHaveCount(3);

  await expect(page.getByTestId('check-row')).toHaveCount(0);
  await page.getByTestId('alert-counter').click();
  const rows = page.getByTestId('check-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: 'Lit et Coffre se chevauchent.' })).toHaveAttribute('data-severity', 'error');

  // a row selects its element and centers the plan on it
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('Escape');
  await rows.filter({ hasText: 'Commode : empiète sur un mur.' }).click();
  const st = await levelState(page);
  const commode = st.objects.find((o) => o.name === 'Commode')!;
  expect(st.selection).toEqual([{ kind: 'object', id: commode.id }]);
  await expect(page.getByTestId('object-name')).toHaveValue('Commode');
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const center = await onPage(page, { x: 300, y: 10 });
  expect(Math.abs(center.x - (box.x + box.width / 2))).toBeLessThan(1);
  expect(Math.abs(center.y - (box.y + box.height / 2))).toBeLessThan(1);

  // the chest becomes a covering: the collision is gone
  await clickWorld(page, { x: 100, y: 255 });
  await expect(page.getByTestId('object-name')).toHaveValue('Coffre');
  await expect(page.getByTestId('object-pose')).toHaveValue('floor');
  await page.getByTestId('object-pose').selectOption({ label: 'Revêtement' });
  await expect(page.getByTestId('alert-counter')).toHaveText('1 alerte');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('[data-kind="alert"]')).toHaveCount(1);
  expect((await levelState(page)).objects.find((o) => o.name === 'Coffre')!.pose).toBe('covering');

  // "Masquer les alertes" removes the outlines, the counter and the list stay
  await page.getByTestId('hide-alerts').check();
  await expect(page.locator('[data-kind="alert"]')).toHaveCount(0);
  await expect(page.getByTestId('alert-counter')).toHaveText('1 alerte');
  await expect(rows).toHaveCount(1);
  await page.getByTestId('hide-alerts').uncheck();
  await expect(page.locator('[data-kind="alert"]')).toHaveCount(1);

  // the panel folds
  await page.getByTestId('checks-toggle').click();
  await expect(rows).toHaveCount(0);
});

test('pose menu: "Posé sur un meuble" lifts the object onto the furniture under its center', async ({ page }) => {
  await createProject(page, 'Pose');
  await interiorRoom(page);
  await addObjects(page, [
    ['nightstand', 'Chevet', 100, 100],
    ['generic-rect', 'Lampe', 115, 100, { width: 25, depth: 25, height: 45 }],
  ]);
  await expect(page.getByTestId('alert-counter')).toHaveText('1 alerte');
  await clickWorld(page, { x: 125, y: 100 });
  await expect(page.getByTestId('object-name')).toHaveValue('Lampe');
  await page.getByTestId('object-pose').selectOption({ label: 'Posé sur un meuble' });
  await expect(page.getByTestId('object-elevation')).toHaveValue('50');
  const lamp = (await levelState(page)).objects.find((o) => o.name === 'Lampe')!;
  expect(lamp).toMatchObject({ pose: 'onTop', elevation: 50 });
  await expect(page.getByTestId('alert-counter')).toHaveCount(0);
  // one history entry: undo gives back the floor pose and the laying height together
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('object-pose')).toHaveValue('floor');
  await expect(page.getByTestId('object-elevation')).toHaveValue('0');
});

test('room panel: interior width 420 typed gives 12,60 m2; a refused size stays red with its reason', async ({ page }) => {
  await createProject(page, 'Pièce');
  await interiorRoom(page);
  await clickWorld(page, { x: 200, y: 150 });
  await expect(page.getByTestId('room-width')).toHaveValue('400');
  await expect(page.getByTestId('room-depth')).toHaveValue('300');
  await expect(page.getByTestId('room-move-side')).toHaveValue('max');
  await expect(page.getByTestId('room-neighbour-width')).toHaveCount(0);

  await page.getByTestId('room-width').fill('420');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-area')).toHaveText('12,60 m²');
  await expect(page.getByTestId('room-width')).toHaveValue('420');

  await page.getByTestId('room-depth').fill('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-size-error')).toHaveText('Dimension minimale : 10 cm.');
  await expect(page.getByTestId('room-depth')).toHaveValue('5');
  await expect(page.getByTestId('room-depth')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('room-area')).toHaveText('12,60 m²');
  await page.getByTestId('room-depth').fill('320');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-area')).toHaveText('13,44 m²');
  await expect(page.getByTestId('room-size-error')).toHaveCount(0);
});

test('room panel: "La pièce voisine sera modifiée." when the moving wall is shared', async ({ page }) => {
  await createProject(page, 'Deux pièces');
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom, addWallChain } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièces', addRectRoom(s.activeLevelId!, { x: -10, y: -10 }, { x: 710, y: 310 }, 20, 250));
    s.execute('Cloison', addWallChain(s.activeLevelId!, [{ kind: 'free', x: 410, y: -10 }, { kind: 'free', x: 410, y: 310 }], 20, 250));
  });
  await fit(page);
  await clickWorld(page, { x: 200, y: 150 });
  await expect(page.getByTestId('room-width')).toHaveValue('400');
  await expect(page.getByTestId('room-neighbour-width')).toHaveText('La pièce voisine sera modifiée.');
  await expect(page.getByTestId('room-neighbour-depth')).toHaveCount(0);
  await page.getByTestId('room-move-side').selectOption('min');
  await expect(page.getByTestId('room-neighbour-width')).toHaveCount(0);
  await page.getByTestId('room-move-side').selectOption('max');
  // the neighbour (280 wide) shrinks to 260
  await page.getByTestId('room-width').fill('420');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-area')).toHaveText('12,60 m²');
  await clickWorld(page, { x: 600, y: 150 });
  await expect(page.getByTestId('room-width')).toHaveValue('260');
});

// Visual check of the panels (spec 12), only with SHOT_DIR set (like visual.spec).
test('screenshots of the V2 panels', async ({ page }) => {
  const dir = process.env.SHOT_DIR;
  test.skip(!dir, 'visual check only (set SHOT_DIR)');
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProject(page, 'Captures V2');
  await interiorRoom(page);
  await volumes(page);
  await addObjects(page, [
    ['bed-90', 'Lit', 300, 150],
    ['generic-rect', 'Coffre', 300, 230, { width: 80, depth: 60, height: 40 }],
    ['bedside-lamp', 'Lampe', 200, 280],
  ]);
  await fit(page);
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` });
  await page.getByTestId('alert-counter').click();
  await shot('checks-panel');
  await page.getByTestId('check-row').first().click();
  await shot('checks-row-clicked');
  await page.getByTestId('hide-alerts').check();
  await shot('checks-hidden');
  await page.getByTestId('hide-alerts').uncheck();
  await page.getByTestId('checks-toggle').click();
  await clickWorld(page, { x: 200, y: 50 });
  await shot('slope-panel');
  await clickWorld(page, { x: 100, y: 200 });
  await page.getByTestId('beam-mode').selectOption('fixed');
  await shot('beam-panel');
  await clickWorld(page, { x: 30, y: 110 });
  await page.getByTestId('cupboard-height-mode').selectOption('ceiling');
  await shot('cupboard-panel');
  await clickWorld(page, { x: 300, y: 255 });
  await shot('object-panel');
  await clickWorld(page, { x: 120, y: 120 });
  await page.getByTestId('room-depth').fill('5');
  await page.keyboard.press('Enter');
  await shot('room-panel-refused');
});
