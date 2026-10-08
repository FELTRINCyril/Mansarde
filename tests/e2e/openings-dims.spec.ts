import { expect, test, type Page } from '@playwright/test';

interface Vec { x: number; y: number }

async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  const dialog = page.getByTestId('prompt-dialog');
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

/** A 400 x 300 room (wall axes, 20 cm walls) through the dev handle, then the view fitted on it with key 0. */
async function addRoom(page: Page) {
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoom(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  });
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
}

/** Page coordinates of a world point (cm). */
async function onPage(page: Page, w: Vec): Promise<Vec> {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const v = await page.evaluate(() => window.__planMaison!.store.getState().view);
  return { x: box.x + w.x * v.pxPerCm + v.tx, y: box.y + w.y * v.pxPerCm + v.ty };
}

async function hover(page: Page, w: Vec) {
  const p = await onPage(page, w);
  await page.mouse.move(p.x, p.y);
}

const autoDims = (page: Page) => page.locator('[data-kind="auto-dimension"]');

test('door and window tools, dimension tool, typed clearance while moving a bed', async ({ page }) => {
  await createProject(page, 'Ouvertures');
  await addRoom(page);

  // door on the bottom wall: ghost while hovering, click places it, the tool stays active
  await page.keyboard.press('p');
  await expect(page.getByTestId('tool-door')).toHaveAttribute('aria-pressed', 'true');
  await hover(page, { x: 150, y: 296 });
  await expect(page.locator('[data-kind="opening-ghost"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="opening-ghost"][data-invalid="true"]')).toHaveCount(0);
  await expect(page.locator('[data-kind="dynamic-dimension"]')).toHaveCount(2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('[data-kind="opening"]')).toHaveCount(1);
  await expect(autoDims(page).filter({ hasText: '0,83 m' })).toHaveCount(1);
  await expect(page.getByTestId('tool-door')).toHaveAttribute('aria-pressed', 'true');

  // over the door just placed: red ghost, a click adds nothing
  await hover(page, { x: 160, y: 300 });
  await expect(page.locator('[data-kind="opening-ghost"][data-invalid="true"]')).toHaveCount(1);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('[data-kind="opening"]')).toHaveCount(1);

  // Escape returns to the selection tool; a window on the right wall
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('f');
  await hover(page, { x: 404, y: 150 });
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('[data-kind="opening"]')).toHaveCount(2);
  await expect(autoDims(page).filter({ hasText: '1,20 m' })).toHaveCount(1);
  const kinds = await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return Object.values(level.openings).map((o) => `${o.kind}:${o.width}`).sort();
  });
  expect(kinds).toEqual(['door:83', 'window:120']);

  // manual dimension between the nodes (0, 0) and (0, 300), its line 60 cm left of the wall
  await page.keyboard.press('c');
  await expect(page.getByTestId('tool-dimension')).toHaveAttribute('aria-pressed', 'true');
  for (const w of [{ x: 2, y: 1 }, { x: 1, y: 298 }, { x: -60, y: 150 }]) {
    const p = await onPage(page, w);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.locator('[data-kind="dimension"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="dimension"]')).toContainText('3,00 m');
  const dim = await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return Object.values(level.dimensions)[0]!;
  });
  expect(dim.a.kind).toBe('node');
  expect(dim.b.kind).toBe('node');
  await page.keyboard.press('Escape');

  // a bed, moved with the selection tool: Tab, 60, Enter -> its back clearance is 0,60 m
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  await page.keyboard.press('v');
  const start = await onPage(page, { x: 200, y: 150 });
  const end = await onPage(page, { x: 230, y: 150 });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(start.x + ((end.x - start.x) * i) / 5, start.y);
  await page.keyboard.press('Tab');
  await page.keyboard.press('6');
  const field = page.getByTestId('numeric-overlay-input');
  await expect(field).toBeFocused();
  await page.keyboard.type('0');
  await expect(field).toHaveValue('60');
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  await page.mouse.up();
  const active = page.locator('[data-kind="dynamic-dimension"]');
  await expect(active.filter({ hasText: '0,60 m' })).toHaveCount(1);
  const bed = await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return Object.values(level.objects)[0]!;
  });
  // depth 190: back edge 60 cm below the inner face y = 10
  expect(bed.y - 95).toBeCloseTo(70, 6);
  expect(await page.evaluate(() => window.__planMaison!.store.getState().history.past.at(-1)!.label)).toBe('Déplacer');

  // the door (bottom wall, x 108.5..191.5) selected alone: Tab, a distance too large is refused and
  // the field stays open with it; Tab in the field moves to the next clearance; Escape changes nothing
  const door = await onPage(page, { x: 150, y: 300 });
  await page.mouse.click(door.x, door.y);
  await expect(page.getByTestId('opening-variant')).toBeVisible();
  const entries = await page.evaluate(() => window.__planMaison!.store.getState().history.past.length);
  await page.keyboard.press('Tab');
  await page.keyboard.press('9');
  await page.keyboard.type('00');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toContainText('Pas assez de place sur ce mur');
  await expect(field).toHaveValue('900');
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(field).toBeFocused(); // still typing, on the other clearance
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  expect(await page.evaluate(() => window.__planMaison!.store.getState().history.past.length)).toBe(entries);
});
