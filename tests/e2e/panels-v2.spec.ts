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
  await page.keyboard.press('Escape');

  // "Changer de face": against the other face of the wall, one undo step
  const side = (await levelState(page)).cupboards[0]!.side;
  await page.getByTestId('cupboard-flip-side').click();
  await expect.poll(async () => (await levelState(page)).cupboards[0]!.side).toBe(side === 'left' ? 'right' : 'left');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await levelState(page)).cupboards[0]!.side).toBe(side);

  // fixed mode: a plinth up to the top is refused
  await page.getByTestId('cupboard-height-mode').selectOption('fixed');
  await page.getByTestId('cupboard-plinth').fill('220');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toHaveText('Dimension invalide');
  expect((await levelState(page)).cupboards[0]!.plinth).toBe(10);
  await page.keyboard.press('Escape');

  // a text that is not a value: red border and a short hint, nothing committed
  await page.getByTestId('cupboard-depth').fill('abc');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cupboard-depth-error')).toHaveText('Valeur invalide');
  await expect(page.getByTestId('cupboard-depth')).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('cupboard-depth-error')).toHaveCount(0);
  await expect(page.getByTestId('cupboard-depth')).toHaveValue('60');
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

test('checks list: bounded height, 200 rows at most, the properties stay in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProject(page, 'Beaucoup');
  await interiorRoom(page);
  // 25 chests on the same spot: 300 collisions
  await addObjects(
    page,
    Array.from({ length: 25 }, (_, i) => ['generic-rect', `Coffre ${i + 1}`, 200, 150, { width: 80, depth: 60, height: 40 }] as [string, string, number, number, { width: number; depth: number; height: number }]),
  );
  await expect(page.getByTestId('alert-counter')).toHaveText('300 alertes');
  await page.getByTestId('alert-counter').click();
  await expect(page.getByTestId('check-row')).toHaveCount(200);
  await expect(page.getByTestId('checks-more')).toHaveText('100 autres alertes');
  await expect(page.getByRole('img', { name: 'Erreur' }).first()).toBeVisible();
  const list = page.getByTestId('checks-list');
  const { client, scroll } = await list.evaluate((el) => ({ client: el.clientHeight, scroll: el.scrollHeight }));
  expect(client).toBeLessThanOrEqual(0.4 * 900 + 1);
  expect(scroll).toBeGreaterThan(client);
  // a row selects its two chests; the properties below the list are on screen
  await page.getByTestId('check-row').first().click();
  expect((await levelState(page)).selection).toHaveLength(2);
  await expect(page.getByTestId('selection-count')).toBeInViewport();
});

test('header at 1440 px: a 30 character name is whole, the display options are in the "Affichage" menu', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const name = 'Maison de campagne à Montargis';
  expect(name).toHaveLength(30);
  await createProject(page, name);
  await interiorRoom(page);
  await addObjects(page, [
    ['bed-90', 'Lit', 100, 150],
    ['generic-rect', 'Coffre', 100, 230, { width: 80, depth: 60, height: 40 }],
  ]);
  await expect(page.getByTestId('alert-counter')).toBeVisible();
  const input = page.getByTestId('project-name');
  const whole = () => input.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth);
  expect(await whole()).toBe(true);
  // the counter sits in the group of the view switch
  await expect(page.locator('.header-group').filter({ has: page.getByTestId('alert-counter') })).toContainText('Plan + 3D');
  // the name does not move between "Enregistrement..." and "Enregistré": the status has a fixed width
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');
  expect(await page.getByTestId('save-status').evaluate((el) => el.getBoundingClientRect().width)).toBe(112);

  // display menu: closed by default, grid off then on, Escape closes it
  await expect(page.getByRole('checkbox', { name: 'Grille' })).toHaveCount(0);
  await page.getByTestId('display-menu').click();
  await expect(page.getByTestId('dim-mode')).toHaveValue('all');
  await page.getByRole('checkbox', { name: 'Grille' }).uncheck();
  expect(await page.evaluate(() => window.__planMaison!.store.getState().display.showGrid)).toBe(false);
  await page.getByRole('checkbox', { name: 'Grille' }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('display-menu-panel')).toHaveCount(0);
  await expect(page.getByTestId('display-menu')).toBeFocused();
  // a press outside closes it too
  await page.getByTestId('display-menu').click();
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await expect(page.getByTestId('display-menu-panel')).toHaveCount(0);
});

test('header at 1280 and 1100 px: nothing overflows, the name keeps 12 characters, undo and redo as icons', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProject(page, 'Maison de campagne à Montargis');
  await interiorRoom(page);
  await addObjects(page, [
    ['bed-90', 'Lit', 100, 150],
    ['generic-rect', 'Coffre', 100, 230, { width: 80, depth: 60, height: 40 }],
  ]);
  await expect(page.getByTestId('alert-counter')).toBeVisible();
  const header = page.locator('.header');
  const undo = page.getByRole('button', { name: 'Annuler', exact: true });
  const redo = page.getByRole('button', { name: 'Rétablir', exact: true });
  // at 1440 the undo and redo buttons show their words
  await expect(undo).toHaveText('Annuler', { useInnerText: true });
  await expect(undo.locator('svg')).toBeHidden();
  for (const width of [1280, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await header.evaluate((el) => el.scrollWidth - el.clientWidth), `overflow at ${width}`).toBeLessThanOrEqual(0);
    const exportBox = (await page.getByTestId('open-export').boundingBox())!;
    expect(exportBox.x + exportBox.width, `Exporter at ${width}`).toBeLessThanOrEqual(width);
    // the visible part of the name holds its first 12 characters
    const room = await page.getByTestId('project-name').evaluate((el: HTMLInputElement) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return inner - ctx.measureText(el.value.slice(0, 12)).width;
    });
    expect(room, `name at ${width}`).toBeGreaterThanOrEqual(0);
    // icons only below 1300 px, the same accessible names and titles
    await expect(undo).toHaveText('', { useInnerText: true });
    await expect(undo).toHaveAttribute('title', /^Annuler/);
    await expect(redo).toHaveAttribute('title', /^Rétablir/);
    await expect(undo.locator('svg')).toBeVisible();
  }
  await undo.click();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(redo).toBeDisabled();
});

test('"Affichage" menu: closes when the focus leaves it (Tab out)', async ({ page }) => {
  await createProject(page, 'Menu');
  await page.getByTestId('display-menu').click();
  await expect(page.getByTestId('display-menu-panel')).toBeVisible();
  // button -> select -> watermark -> grid -> out of the menu
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await expect(page.getByRole('checkbox', { name: 'Grille' })).toBeFocused();
  await expect(page.getByTestId('display-menu-panel')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('display-menu-panel')).toHaveCount(0);
  // Shift+Tab out of the button closes it too
  await page.getByTestId('display-menu').click();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('display-menu-panel')).toHaveCount(0);
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

  // back on the furniture, then "Au sol": down to 0 in one step
  await page.getByTestId('object-pose').selectOption('onTop');
  await expect(page.getByTestId('object-elevation')).toHaveValue('50');
  await page.getByTestId('object-pose').selectOption('floor');
  await expect(page.getByTestId('object-elevation')).toHaveValue('0');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('object-pose')).toHaveValue('onTop');
  await expect(page.getByTestId('object-elevation')).toHaveValue('50');

  // "Mural" keeps the laying height; from "Mural" to a floor pose: back to 0 in one step
  await page.getByTestId('object-pose').selectOption('wall');
  await expect(page.getByTestId('object-elevation')).toHaveValue('50');
  await page.getByTestId('object-elevation').fill('150');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('object-elevation')).toHaveValue('150');
  for (const floorPose of ['floor', 'covering', 'tuckable']) {
    await page.getByTestId('object-pose').selectOption(floorPose);
    await expect(page.getByTestId('object-elevation')).toHaveValue('0');
    expect((await levelState(page)).objects.find((o) => o.name === 'Lampe')).toMatchObject({ pose: floorPose, elevation: 0 });
    await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
    await page.keyboard.press('ControlOrMeta+z');
    await clickWorld(page, { x: 125, y: 100 });
    await expect(page.getByTestId('object-pose')).toHaveValue('wall');
    await expect(page.getByTestId('object-elevation')).toHaveValue('150');
  }
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
  // the blur that follows does not submit the refused value a second time
  const toastId = () => page.evaluate(() => window.__planMaison!.store.getState().toast?.id ?? null);
  const first = await toastId();
  await page.getByTestId('room-width').focus();
  expect(await toastId()).toBe(first);
  // Escape in the field drops the value and the reason
  await page.getByTestId('room-depth').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('room-depth')).toHaveValue('300');
  await expect(page.getByTestId('room-size-error')).toHaveCount(0);
  await page.getByTestId('room-depth').fill('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-size-error')).toHaveText('Dimension minimale : 10 cm.');
  // the reason is linked to the refused field
  const describedBy = await page.getByTestId('room-depth').getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText('Dimension minimale : 10 cm.');
  // undo (header button): the level changes, the refused text and its red border go
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByTestId('room-width')).toHaveValue('400');
  await expect(page.getByTestId('room-depth')).toHaveValue('300');
  await expect(page.getByTestId('room-depth')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByTestId('room-depth')).not.toHaveAttribute('aria-describedby');
  await expect(page.getByTestId('room-size-error')).toHaveCount(0);
  // same after a redo
  await page.getByTestId('room-depth').fill('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-depth')).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Rétablir', exact: true }).click();
  await expect(page.getByTestId('room-width')).toHaveValue('420');
  await expect(page.getByTestId('room-depth')).toHaveValue('300');
  await expect(page.getByTestId('room-depth')).toHaveAttribute('aria-invalid', 'false');
  await page.getByTestId('room-depth').fill('320');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('room-area')).toHaveText('13,44 m²');
  await expect(page.getByTestId('room-size-error')).toHaveCount(0);
  // an unreadable text: "Valeur invalide", linked to the field
  await page.getByTestId('room-width').fill('abc');
  await page.keyboard.press('Enter');
  const hint = await page.getByTestId('room-width').getAttribute('aria-describedby');
  await expect(page.locator(`[id="${hint}"]`)).toHaveText('Valeur invalide');
  await expect(page.getByTestId('room-width-error')).toHaveAttribute('id', hint!);
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

test('wall panel: the length of each face of the wall, read only (spec 6)', async ({ page }) => {
  await createProject(page, 'Faces');
  await interiorRoom(page);
  // the top wall: its axis is at y = -10, from x = -10 to 410
  await clickWorld(page, { x: 200, y: -10 });
  await expect(page.getByTestId('wall-length')).toHaveValue('420');
  // "Face gauche" is the +perp(direction) face (ruling V2-R22): the room side for a wall drawn towards +x
  const towardsPlusX = await page.evaluate(() => {
    const st = window.__planMaison!.store.getState();
    const level = st.project!.levels.find((l) => l.id === st.activeLevelId)!;
    const w = Object.values(level.walls).find((x) => level.nodes[x.startNodeId]!.y === -10 && level.nodes[x.endNodeId]!.y === -10)!;
    return level.nodes[w.endNodeId]!.x > level.nodes[w.startNodeId]!.x;
  });
  const [inner, outer] = ['4,00 m', '4,40 m'];
  await expect(page.getByTestId('wall-face-left')).toHaveText(towardsPlusX ? inner : outer);
  await expect(page.getByTestId('wall-face-right')).toHaveText(towardsPlusX ? outer : inner);
  // read only: no input, and they follow the room when it changes
  await expect(page.locator('input[data-testid^="wall-face"]')).toHaveCount(0);
  // the left wall 40 cm thick (axis kept at x = -10): the inner face of the top wall starts at x = 10, its outer face at x = -30
  await clickWorld(page, { x: -10, y: 150 });
  await page.getByTestId('wall-thickness').fill('40');
  await page.keyboard.press('Enter');
  await clickWorld(page, { x: 200, y: -10 });
  await expect(page.getByTestId(towardsPlusX ? 'wall-face-left' : 'wall-face-right')).toHaveText('3,90 m');
  await expect(page.getByTestId(towardsPlusX ? 'wall-face-right' : 'wall-face-left')).toHaveText('4,50 m');
});

// Visual check of the panels (spec 12), only with SHOT_DIR set (like visual.spec).
test('screenshots of the V2 panels', async ({ page }) => {
  const dir = process.env.SHOT_DIR;
  test.skip(!dir, 'visual check only (set SHOT_DIR)');
  await page.setViewportSize({ width: 1440, height: 900 });
  await createProject(page, 'Maison de campagne à Montargis');
  await interiorRoom(page);
  await volumes(page);
  await addObjects(page, [
    ['bed-90', 'Lit', 300, 150],
    ['generic-rect', 'Coffre', 300, 230, { width: 80, depth: 60, height: 40 }],
    ['bedside-lamp', 'Lampe', 200, 280],
  ]);
  await fit(page);
  const shot = (name: string) => page.screenshot({ path: `${dir}/${name}.png` });
  await shot('header');
  await page.getByTestId('display-menu').click();
  await shot('display-menu');
  await page.keyboard.press('Escape');
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
