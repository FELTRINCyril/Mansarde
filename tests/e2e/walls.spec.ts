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

/** Page coordinates of a world point (cm). */
async function onPage(page: Page, w: Vec): Promise<Vec> {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const v = await page.evaluate(() => window.__planMaison!.store.getState().view);
  return { x: box.x + w.x * v.pxPerCm + v.tx, y: box.y + w.y * v.pxPerCm + v.ty };
}

/** A grid point (cm) shown at the given fraction of the canvas. */
async function gridPointAt(page: Page, fx: number, fy: number): Promise<Vec> {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const v = await page.evaluate(() => window.__planMaison!.store.getState().view);
  const round = (n: number) => Math.round(n / 100) * 100;
  return { x: round((box.width * fx - v.tx) / v.pxPerCm), y: round((box.height * fy - v.ty) / v.pxPerCm) };
}

async function counts(page: Page): Promise<{ walls: number; nodes: number; history: number }> {
  return page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return { walls: Object.keys(level.walls).length, nodes: Object.keys(level.nodes).length, history: s.history.past.length };
  });
}

async function moveTo(page: Page, w: Vec) {
  const p = await onPage(page, w);
  await page.mouse.move(p.x, p.y, { steps: 3 });
}

/** Types a length in the numeric field opened by the first digit, then Enter. */
async function typeLength(page: Page, value: string) {
  await page.keyboard.press(value[0]!);
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await page.keyboard.type(value.slice(1));
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
}

test('wall tool: a 400 x 300 room typed on the keyboard, closed by a click on the start point', async ({ page }) => {
  await createProject(page, 'Murs');
  await page.keyboard.press('m');
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');

  const s = await gridPointAt(page, 0.25, 0.25);
  await moveTo(page, s);
  let p = await onPage(page, s);
  await page.mouse.click(p.x, p.y);

  // to the right, 400
  await moveTo(page, { x: s.x + 150, y: s.y });
  await expect(page.locator('[data-kind="draw-ghost"] [data-kind="wall-preview"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="dynamic-dimension"]')).toHaveCount(1);
  await typeLength(page, '400');
  // down, 300
  await moveTo(page, { x: s.x + 400, y: s.y + 120 });
  await typeLength(page, '300');
  // to the left, 400
  await moveTo(page, { x: s.x + 250, y: s.y + 300 });
  await typeLength(page, '400');
  // click on the start point closes the loop and finishes
  await moveTo(page, s);
  p = await onPage(page, s);
  await page.mouse.click(p.x, p.y);

  expect(await counts(page)).toEqual({ walls: 4, nodes: 4, history: 1 });
  await expect(page.locator('[data-kind="room-label"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('10,64 m²');
  // the tool stays active for a new chain, without a preview chain
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-kind="wall-preview"]')).toHaveCount(0);
});

test('wall tool: double-click finishes, Escape cancels a lone point', async ({ page }) => {
  await createProject(page, 'Murs double clic');
  await page.getByTestId('tool-wall').click();
  const s = await gridPointAt(page, 0.3, 0.5);
  let p = await onPage(page, s);
  await page.mouse.click(p.x, p.y);
  p = await onPage(page, { x: s.x + 300, y: s.y });
  await page.mouse.click(p.x, p.y);
  p = await onPage(page, { x: s.x + 300, y: s.y - 200 });
  await page.mouse.dblclick(p.x, p.y);
  expect(await counts(page)).toEqual({ walls: 2, nodes: 3, history: 1 });

  p = await onPage(page, { x: s.x, y: s.y + 200 });
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Escape');
  expect(await counts(page)).toEqual({ walls: 2, nodes: 3, history: 1 });
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
});

test('rectangle tool: a drag creates 4 walls, undo removes the whole room at once', async ({ page }) => {
  await createProject(page, 'Pièce rectangle');
  await page.keyboard.press('r');
  await expect(page.getByTestId('tool-rect')).toHaveAttribute('aria-pressed', 'true');
  const a = await gridPointAt(page, 0.2, 0.2);
  const pa = await onPage(page, a);
  const pb = await onPage(page, { x: a.x + 400, y: a.y + 300 });
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, { steps: 3 });
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await expect(page.locator('[data-kind="wall-preview"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="dynamic-dimension"]')).toHaveCount(2);
  await page.mouse.up();

  expect(await counts(page)).toEqual({ walls: 4, nodes: 4, history: 1 });
  await expect(page.locator('[data-kind="room-label"]')).toContainText('10,64 m²');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await counts(page)).toEqual({ walls: 0, nodes: 0, history: 0 });
});

test('rectangle tool: typed width, Tab, typed height, Enter', async ({ page }) => {
  await createProject(page, 'Pièce saisie');
  await page.keyboard.press('r');
  const a = await gridPointAt(page, 0.2, 0.2);
  const pa = await onPage(page, a);
  const pb = await onPage(page, { x: a.x + 120, y: a.y + 90 });
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await page.keyboard.press('5');
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toHaveValue('5');
  await page.keyboard.type('00');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
  await expect(page.getByTestId('numeric-overlay')).toContainText('Hauteur');
  await page.keyboard.type('350');
  await page.keyboard.press('Enter');
  await page.mouse.up();

  const size = await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    const xs = Object.values(level.nodes).map((n) => n.x);
    const ys = Object.values(level.nodes).map((n) => n.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  });
  expect(size).toEqual({ w: 500, h: 350 });
  expect((await counts(page)).history).toBe(1);
});

test('wall tool: Mod+Z removes the last point of the chain, never the previous history entry', async ({ page }) => {
  await createProject(page, 'Murs annuler');
  await page.keyboard.press('r');
  const a = await gridPointAt(page, 0.2, 0.2);
  const pa = await onPage(page, a);
  const pb = await onPage(page, { x: a.x + 300, y: a.y + 200 });
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await page.mouse.up();
  expect(await counts(page)).toEqual({ walls: 4, nodes: 4, history: 1 });

  await page.keyboard.press('m');
  const s = { x: a.x, y: a.y + 250 };
  for (const w of [s, { x: s.x + 200, y: s.y }, { x: s.x + 200, y: s.y + 100 }]) {
    const p = await onPage(page, w);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  expect(await counts(page)).toEqual({ walls: 4, nodes: 4, history: 1 });
  await page.keyboard.press('Enter');
  expect(await counts(page)).toEqual({ walls: 5, nodes: 6, history: 2 });
});

test('numeric field: its label is shown whole above the input and the field leaves the tool label visible', async ({ page }) => {
  await createProject(page, 'Libellé');
  await page.keyboard.press('m');
  const s = await gridPointAt(page, 0.3, 0.3);
  await moveTo(page, s);
  const p = await onPage(page, s);
  await page.mouse.click(p.x, p.y);
  await moveTo(page, { x: s.x + 200, y: s.y });
  await page.keyboard.press('2');
  const label = page.locator('.numeric-overlay-label');
  await expect(label).toHaveText('Longueur');
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const lb = (await label.boundingBox())!;
  const input = (await page.getByTestId('numeric-overlay-input').boundingBox())!;
  expect(lb.y + lb.height).toBeLessThanOrEqual(input.y);
  const field = (await page.getByTestId('numeric-overlay').boundingBox())!;
  const tool = (await page.locator('[data-kind="draw-label"]').boundingBox())!;
  const top = Math.min(field.y, lb.y);
  const overlaps = tool.x < field.x + field.width && field.x < tool.x + tool.width && tool.y < field.y + field.height && top < tool.y + tool.height;
  expect(overlaps).toBe(false);
});
