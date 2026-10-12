import { expect, test, type Page } from '@playwright/test';
import { buildAttic } from './attic';
import { createProject, onPage } from './helpers';

test.setTimeout(150_000);
// a smaller view: software WebGL draws every pixel on the CPU
test.use({ viewport: { width: 1100, height: 700 } });

/*
 * Task 13: cut-away, selection by a click in the 3D view, targeted updates (the counters of
 * window.__planMaison3D, DEV), lower levels, and the camera of a narrow Plan + 3D pane.
 * window.__planMaison3DProbe gives where an object is drawn and where its 3D group stands.
 */

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const LOAD = { timeout: 30_000 };
const stats = (page: Page) => page.evaluate(() => ({ ...window.__planMaison3D! }));

/** Waits until the 3D view stopped rendering (scene3dStats.idle). */
async function settle(page: Page): Promise<void> {
  await expect.poll(async () => (await stats(page)).idle, { timeout: 60_000, message: 'the 3D view never stops rendering' }).toBe(true);
}

async function open(page: Page, view: '3d' | 'split'): Promise<void> {
  await page.getByTestId(`view-${view}`).click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  await expect.poll(async () => (await stats(page)).frames, LOAD).toBeGreaterThan(0);
  await settle(page);
}

/** A 400 x 400 room (inside) with a 160 bed in its middle; returns the bed id. */
async function roomWithBed(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addRectRoomInterior } = await mod('/src/core/commands/walls.ts');
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
    const s = window.__planMaison!.store.getState();
    const levelId = s.activeLevelId!;
    if (!s.execute('Pièce', addRectRoomInterior(levelId, { x: 0, y: 0 }, { x: 400, y: 400 }, 20, 250))) throw new Error('refused');
    const e = getCatalogEntry('bed-160');
    const bed = createObjectFromSize({ kind: 'catalog', catalogId: e.id }, 200, 200, e, e.name, e.color);
    if (!s.execute('Lit', addObject(levelId, bed))) throw new Error('refused');
    return bed.id as string;
  });
}

const selection = (page: Page) => page.evaluate(() => window.__planMaison!.store.getState().selection);

/** Clicks where the top center of an object is drawn in the 3D view. */
async function clickObject(page: Page, id: string): Promise<void> {
  const at = await page.evaluate((id) => window.__planMaison3DProbe!.objectScreen!(id), id);
  expect(at, 'object on screen').not.toBeNull();
  const box = (await page.getByTestId('scene3d-canvas').boundingBox())!;
  await page.mouse.click(box.x + at!.x, box.y + at!.y);
}

test('cut-away: from outside the attic the near walls and the ceiling are hidden, from inside nothing', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Masquage');
  await buildAttic(page);
  await open(page, '3d');
  // overview from the south-west (plan-chambre): the bottom and left walls, the ceiling and the beam go
  let s = await stats(page);
  expect(s.hiddenWalls).toBe(2);
  expect(s.hiddenCeilings).toBe(1);
  // from inside the room, at eye height: everything stands
  await page.evaluate(async () => {
    const { deriveLevel } = await import(/* @vite-ignore */ '/src/core/geometry/derived.ts' as string);
    const st = window.__planMaison!.store.getState();
    const level = st.project!.levels.find((l) => l.id === st.activeLevelId)!;
    st.setSelection([{ kind: 'room', id: deriveLevel(level).rooms[0].key }]);
  });
  await page.getByTestId('preset-room').click();
  await settle(page);
  s = await stats(page);
  expect(s.camera[1]).toBeCloseTo(1.6, 6);
  expect(s.hiddenWalls).toBe(0);
  expect(s.hiddenCeilings).toBe(0);
  // "Cacher tous les murs": the four walls and the ceiling, without rebuilding
  await page.getByTestId('hide-walls-3d').check();
  await settle(page);
  s = await stats(page);
  expect(s.hiddenWalls).toBe(4);
  expect(s.hiddenCeilings).toBe(1);
  expect(errors).toEqual([]);
});

test('a click on the bed in 3D selects it (its panel opens, blue outline); a click on the floor clears; an orbit drag does not select', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Sélection 3D');
  const bed = await roomWithBed(page);
  await page.evaluate(() => window.__planMaison!.store.getState().setSelection([]));
  await open(page, '3d');
  await page.getByTestId('preset-top').click();
  await settle(page);
  expect((await stats(page)).outlined).toBe(0);

  await clickObject(page, bed);
  await expect.poll(() => selection(page), LOAD).toEqual([{ kind: 'object', id: bed }]);
  await expect(page.getByTestId('object-name')).toHaveValue('Lit 160');
  await expect.poll(async () => (await stats(page)).outlined, LOAD).toBe(1);

  // a click on the floor, away from the bed: nothing selected
  const box = (await page.getByTestId('scene3d-canvas').boundingBox())!;
  const at = (await page.evaluate((id) => window.__planMaison3DProbe!.objectScreen!(id), bed))!;
  await page.mouse.click(box.x + at.x + 0.28 * box.height, box.y + at.y);
  await expect.poll(() => selection(page), LOAD).toEqual([]);
  await expect.poll(async () => (await stats(page)).outlined, LOAD).toBe(0);

  // an orbit drag starting on the bed is not a click
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await page.mouse.down();
  await page.mouse.move(box.x + at.x + 80, box.y + at.y + 10, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  expect(await selection(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('moving the bed in the plan: the 3D follows without rebuilding the walls; a cupboard edit rebuilds that cupboard only', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Mise à jour ciblée');
  const bed = await roomWithBed(page);
  await page.evaluate(() => window.__planMaison!.store.getState().setSelection([]));
  await open(page, 'split');
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
  await settle(page);
  const before = await stats(page);
  expect((await page.evaluate((id) => window.__planMaison3DProbe!.objectPlace!(id), bed))!.x).toBeCloseTo(200, 3);

  // drag the bed 80 cm to the right in the plan
  const from = await onPage(page, { x: 200, y: 200 });
  const to = await onPage(page, { x: 280, y: 200 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y, { steps: 1 });
  await page.mouse.up();
  const x = await page.evaluate((id) => {
    const s = window.__planMaison!.store.getState();
    return s.project!.levels.find((l) => l.id === s.activeLevelId)!.objects[id]!.x;
  }, bed);
  expect(x).toBeGreaterThan(250);
  await expect.poll(async () => (await page.evaluate((id) => window.__planMaison3DProbe!.objectPlace!(id), bed))!.x, LOAD).toBeCloseTo(x, 3);
  await settle(page);
  const after = await stats(page);
  // the structure was not rebuilt, the bed was (at least once, more while dragging)
  expect(after.builds).toBe(before.builds);
  expect(after.objectBuilds).toBeGreaterThan(before.objectBuilds);
  // the bed was selected by the drag in the plan: outlined in 3D
  expect(after.outlined).toBe(1);

  // a cupboard on the top wall, then narrower: neither changes the structure
  const cupboard = await page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addCupboard } = await mod('/src/core/commands/cupboards.ts');
    const { createCupboard } = await mod('/src/core/model/factory.ts');
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    const top = Object.values(level.walls).find((w) => {
      const a = level.nodes[w.startNodeId]!;
      const b = level.nodes[w.endNodeId]!;
      return Math.abs(a.y - b.y) < 1e-6 && a.y < 0;
    })!;
    const a = level.nodes[top.startNodeId]!;
    const c = createCupboard(top.id, Math.abs(80 - a.x), a.x < 0 ? 'right' : 'left', { width: 120 });
    if (!s.execute('Placard', addCupboard(s.activeLevelId!, c))) throw new Error('refused');
    return c.id as string;
  });
  await expect.poll(async () => (await stats(page)).cupboardBuilds, LOAD).toBe(after.cupboardBuilds + 1);
  await page.evaluate(async (id) => {
    const { updateCupboard } = await import(/* @vite-ignore */ '/src/core/commands/cupboards.ts' as string);
    const s = window.__planMaison!.store.getState();
    if (!s.execute('Placard', updateCupboard(s.activeLevelId!, id, { width: 100 }))) throw new Error('refused');
  }, cupboard);
  await expect.poll(async () => (await stats(page)).cupboardBuilds, LOAD).toBe(after.cupboardBuilds + 2);
  await settle(page);
  expect((await stats(page)).builds).toBe(before.builds);
  expect(errors).toEqual([]);
});

test('lower levels: shown under the upper floor, and the overview frames them too', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Deux niveaux');
  // ground floor 8 x 4 m, upper floor 4 x 4 m above its left half
  await page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addRectRoomInterior } = await mod('/src/core/commands/walls.ts');
    const { addLevel } = await mod('/src/core/commands/levels.ts');
    const s = () => window.__planMaison!.store.getState();
    if (!s().execute('Pièce', addRectRoomInterior(s().activeLevelId!, { x: 0, y: 0 }, { x: 800, y: 400 }, 20, 250))) throw new Error('refused');
    const out = { levelId: '' };
    if (!s().execute('Niveau', addLevel(s().activeLevelId!, 'above', 'Étage', out))) throw new Error('refused');
    s().setActiveLevel(out.levelId);
    if (!s().execute('Pièce', addRectRoomInterior(out.levelId, { x: 0, y: 0 }, { x: 400, y: 400 }, 20, 250))) throw new Error('refused');
  });
  await open(page, '3d');
  const alone = await stats(page);
  expect(alone.lowerLevels).toBe(0);
  await page.getByText('Afficher les niveaux inférieurs').click();
  await expect.poll(async () => (await stats(page)).lowerLevels, LOAD).toBe(1);
  await settle(page);
  const both = await stats(page);
  // the overview was refitted to the two levels (the ground floor goes 4 m further right)
  expect(both.camera).not.toEqual(alone.camera);
  // farther from the upper floor (box twice as wide), towards which it looked alone
  const far = (c: number[]) => Math.hypot(c[0]! - 2, c[2]! - 2);
  expect(far(both.camera)).toBeGreaterThan(far(alone.camera) + 1);
  expect(both.builds).toBe(alone.builds);
  // hiding them again: back to the upper floor alone
  await page.getByText('Afficher les niveaux inférieurs').click();
  await expect.poll(async () => (await stats(page)).lowerLevels, LOAD).toBe(0);
  await settle(page);
  const back = (await stats(page)).camera;
  for (let i = 0; i < 3; i++) expect(back[i]!).toBeCloseTo(alone.camera[i]!, 3);
  expect(errors).toEqual([]);
});

test('narrow Plan + 3D pane: a structure edit does not move the camera; narrowing the pane refits the overview', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Volet étroit');
  await buildAttic(page);
  await page.evaluate(() => window.__planMaison!.store.getState().setDisplay({ splitRatio: 0.7 }));
  await open(page, 'split');
  const fitted = (await stats(page)).camera;
  const builds = (await stats(page)).builds;
  // a free wall drawn in the plan (structure rebuild): the camera stays where it is
  await page.evaluate(async () => {
    const { addWallChain } = await import(/* @vite-ignore */ '/src/core/commands/walls.ts' as string);
    const s = window.__planMaison!.store.getState();
    if (!s.execute('Mur', addWallChain(s.activeLevelId!, [{ kind: 'free', x: 100, y: 100 }, { kind: 'free', x: 300, y: 100 }], 10, 240))) throw new Error('refused');
  });
  await expect.poll(async () => (await stats(page)).builds, LOAD).toBeGreaterThan(builds);
  await settle(page);
  const kept = (await stats(page)).camera;
  for (let i = 0; i < 3; i++) expect(kept[i]!).toBeCloseTo(fitted[i]!, 4);

  // the pane gets narrower (80 % plan): the overview, still untouched, moves back to fit
  await page.evaluate(() => window.__planMaison!.store.getState().setDisplay({ splitRatio: 0.8 }));
  await expect.poll(async () => {
    const c = (await stats(page)).camera;
    return Math.hypot(c[0]! - kept[0]!, c[1]! - kept[1]!, c[2]! - kept[2]!);
  }, LOAD).toBeGreaterThan(0.5);
  await settle(page);
  const narrow = (await stats(page)).camera;
  // farther from the room center
  const far = (c: number[]) => Math.hypot(c[0]! - 2, c[2]! - 2);
  expect(far(narrow)).toBeGreaterThan(far(kept));
  expect(errors).toEqual([]);
});

test('a selection click keeps the preset: switching to Plan + 3D still refits the top view (review I1)', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Clic puis volet');
  const bed = await roomWithBed(page);
  await page.evaluate(() => window.__planMaison!.store.getState().setSelection([]));
  await open(page, '3d');
  await page.getByTestId('preset-top').click();
  await settle(page);
  const full = (await stats(page)).camera;
  await clickObject(page, bed);
  await expect.poll(() => selection(page), LOAD).toEqual([{ kind: 'object', id: bed }]);
  await settle(page);
  // the click did not move the camera
  const clicked = (await stats(page)).camera;
  for (let i = 0; i < 3; i++) expect(clicked[i]!).toBeCloseTo(full[i]!, 4);
  // half the width: the top view moves up to keep the whole room in view
  await page.getByTestId('view-split').click();
  await expect.poll(async () => (await stats(page)).camera[1]!, LOAD).toBeGreaterThan(full[1]! * 1.3);
  await settle(page);
  // the bed at the room center is still drawn inside the narrower view (null when off screen)
  expect(await page.evaluate((id) => window.__planMaison3DProbe!.objectScreen!(id), bed)).not.toBeNull();
  expect(errors).toEqual([]);
});
