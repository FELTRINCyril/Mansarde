import { expect, test, type Page } from '@playwright/test';
import { createProject, gridPointAt, moveTo, onPage } from './helpers';

/*
 * Spec 6: rectangular rooms drawn by their inside, interior dimensions edited by a double-click,
 * reference line of the wall tool (option bar, Space).
 */

/** Room A, inside a..a+400 x a..a+300 (wall axes 10 cm outside); returns a (world cm). */
async function drawRoom400x300(page: Page): Promise<{ x: number; y: number }> {
  await page.keyboard.press('r');
  await expect(page.getByTestId('tool-rect')).toHaveAttribute('aria-pressed', 'true');
  const a = await gridPointAt(page, 0.25, 0.25);
  const pa = await onPage(page, a);
  const pb = await onPage(page, { x: a.x + 150, y: a.y + 120 });
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await page.keyboard.press('4');
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await page.keyboard.type('00');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('');
  await page.keyboard.type('300');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  return a;
}

async function clickAt(page: Page, w: { x: number; y: number }): Promise<void> {
  await moveTo(page, w);
  const p = await onPage(page, w);
  await page.mouse.click(p.x, p.y);
}

/** Walls meeting at the node placed at (x, y) (world cm, 0.01 cm), or -1 without a node there. */
async function degreeAt(page: Page, x: number, y: number): Promise<number> {
  return page.evaluate(
    ([x, y]) => {
      const s = window.__planMaison!.store.getState();
      const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
      const node = Object.values(level.nodes).find((n) => Math.abs(n.x - x!) < 0.01 && Math.abs(n.y - y!) < 0.01);
      if (!node) return -1;
      return Object.values(level.walls).filter((w) => w.startNodeId === node.id || w.endNodeId === node.id).length;
    },
    [x, y],
  );
}

/** How many nodes have a single wall (free chain ends). */
async function freeEnds(page: Page): Promise<number> {
  return page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    const walls = Object.values(level.walls);
    return Object.keys(level.nodes).filter((id) => walls.filter((w) => w.startNodeId === id || w.endNodeId === id).length === 1).length;
  });
}

/** Room B hooked on A's top right node (axis drawing, V2-R25): axes 410..730 x -10..310, inside 300 x 300. */
async function drawNeighbour(page: Page, a: { x: number; y: number }): Promise<void> {
  await page.keyboard.press('r');
  const pa = await onPage(page, { x: a.x + 410, y: a.y - 10 });
  const pb = await onPage(page, { x: a.x + 730, y: a.y + 310 });
  await page.mouse.move(pa.x, pa.y, { steps: 2 });
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 4 });
  await expect(page.locator('[data-kind="draw-label"]')).toContainText("Accroché à un mur : cotes à l'axe");
  await page.mouse.up();
}

test('rectangle tool: a 400 x 300 room typed on the keyboard is 12,00 m2 inside', async ({ page }) => {
  await createProject(page, 'Pièce intérieure');
  await drawRoom400x300(page);
  await expect(page.locator('[data-kind="room-label"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('12,00 m²');
});

test('double-click on the 4,00 m dimension, 450, Enter: the room becomes 13,50 m2', async ({ page }) => {
  await createProject(page, 'Cote modifiable');
  await drawRoom400x300(page);
  await page.keyboard.press('v');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');

  const text = page.locator('[data-kind="auto-dimension"] text', { hasText: '4,00 m' }).first();
  await expect(text).toBeVisible();
  const box = (await text.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);

  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('400');
  // the current value is selected: typing replaces it
  await page.keyboard.type('450');
  await expect(input).toHaveValue('450');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('13,50 m²');
  await expect(page.getByTestId('room-rename')).toHaveCount(0);

  // one history entry: undo gives the 12,00 m2 room back
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-kind="room-label"]')).toContainText('12,00 m²');
});

test('double-click on a dimension: a refused size shows its message and the field stays red', async ({ page }) => {
  await createProject(page, 'Cote refusée');
  await drawRoom400x300(page);
  await page.keyboard.press('v');
  const text = page.locator('[data-kind="auto-dimension"] text', { hasText: '3,00 m' }).first();
  const box = (await text.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toHaveValue('300');
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toContainText('Dimension minimale : 10 cm.');
  await expect(input).toHaveClass(/input-invalid/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-kind="room-label"]')).toContainText('12,00 m²');
});

test('wall tool: option bar, Space flips the reference line, a clockwise square drawn on its left face', async ({ page }) => {
  await createProject(page, 'Ligne de référence');
  await page.keyboard.press('m');
  const bar = page.getByTestId('wall-reference-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.getByRole('button', { name: 'Face gauche' })).toHaveAttribute('aria-pressed', 'false');
  await expect(bar.getByRole('button', { name: 'Face droite' })).toHaveAttribute('aria-pressed', 'false');

  // Space: axis -> left -> right; a click on the bar chooses directly and keeps the plan focused
  await page.keyboard.press('Space');
  await expect(bar.getByRole('button', { name: 'Face gauche' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(bar.getByRole('button', { name: 'Face droite' })).toHaveAttribute('aria-pressed', 'true');
  await bar.getByRole('button', { name: 'Face gauche' }).click();
  await expect(bar.getByRole('button', { name: 'Face gauche' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('plan-canvas')).toBeFocused();

  const s = await gridPointAt(page, 0.3, 0.3);
  for (const w of [s, { x: s.x + 400, y: s.y }, { x: s.x + 400, y: s.y + 400 }, { x: s.x, y: s.y + 400 }]) {
    await moveTo(page, w);
    const p = await onPage(page, w);
    await page.mouse.click(p.x, p.y);
  }
  await moveTo(page, s);
  const p = await onPage(page, s);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('16,00 m²');

  // the choice is kept for the session; the bar is only shown with the wall tool
  await page.keyboard.press('v');
  await expect(bar).toHaveCount(0);
  await page.keyboard.press('m');
  await expect(page.getByTestId('wall-reference-bar').getByRole('button', { name: 'Face gauche' })).toHaveAttribute('aria-pressed', 'true');
});

test('wall tool: Space + drag still pans the view without flipping the reference', async ({ page }) => {
  await createProject(page, 'Espace glisser');
  await page.keyboard.press('m');
  const canvas = (await page.getByTestId('plan-canvas').boundingBox())!;
  // the first fit of the opened project has been applied (the default view has tx 0)
  await expect.poll(() => page.evaluate(() => window.__planMaison!.store.getState().view.tx)).not.toBe(0);
  const before = await page.evaluate(() => window.__planMaison!.store.getState().view);
  await page.mouse.move(canvas.x + 200, canvas.y + 200);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(canvas.x + 260, canvas.y + 230, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const after = await page.evaluate(() => window.__planMaison!.store.getState().view);
  expect(after.tx - before.tx).toBeCloseTo(60, 0);
  await expect(page.getByTestId('wall-reference-bar').getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
});

test('rectangle tool: a room hooked on an existing wall is drawn at the axes, the shared wall is not doubled', async ({ page }) => {
  await createProject(page, 'Pièces voisines');
  const a = await drawRoom400x300(page);
  await drawNeighbour(page, a);
  const labels = page.locator('[data-kind="room-label"]');
  await expect(labels).toHaveCount(2);
  await expect(labels.filter({ hasText: '12,00 m²' })).toHaveCount(1);
  await expect(labels.filter({ hasText: '9,00 m²' })).toHaveCount(1);
  const xs = await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return [...new Set(Object.values(level.nodes).map((n) => n.x))].sort((p, q) => p - q);
  });
  expect(xs).toEqual([a.x - 10, a.x + 410, a.x + 730]);
});

test('double-click resize that would make the neighbour room vanish is refused with its message', async ({ page }) => {
  await createProject(page, 'Voisine protégée');
  const a = await drawRoom400x300(page);
  await drawNeighbour(page, a);
  await page.keyboard.press('v');
  const text = page.locator('[data-kind="auto-dimension"] text', { hasText: '4,00 m' }).first();
  const box = (await text.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toHaveValue('400');
  await page.keyboard.type('700');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('toast')).toContainText('Impossible de redimensionner cette pièce ainsi.');
  await expect(input).toHaveClass(/input-invalid/);
  await page.keyboard.press('Escape');
  const labels = page.locator('[data-kind="room-label"]');
  await expect(labels).toHaveCount(2);
  await expect(labels.filter({ hasText: '9,00 m²' })).toHaveCount(1);
});

test('wall tool, face mode: a wall started on a corner or on a wall stays joined (V2-R21)', async ({ page }) => {
  await createProject(page, 'Faces jointes');
  const a = await drawRoom400x300(page);
  // zoom out around the canvas center: the new walls to the right of A stay on screen
  const canvas = (await page.getByTestId('plan-canvas').boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, 400);
  await page.keyboard.press('m');
  await page.keyboard.press('Space'); // left face
  await expect(page.getByTestId('wall-reference-bar').getByRole('button', { name: 'Face gauche' })).toHaveAttribute('aria-pressed', 'true');

  // from A's top right corner node, to the right
  await clickAt(page, { x: a.x + 410, y: a.y - 10 });
  await clickAt(page, { x: a.x + 610, y: a.y - 10 });
  await page.keyboard.press('Enter');
  expect(await degreeAt(page, a.x + 410, a.y - 10)).toBe(3);
  expect(await freeEnds(page)).toBe(1);
  await page.keyboard.press('ControlOrMeta+z');

  // from the middle of A's right wall: T junction on its axis, 10 cm above the clicked point
  await clickAt(page, { x: a.x + 410, y: a.y + 150 });
  await clickAt(page, { x: a.x + 610, y: a.y + 150 });
  await page.keyboard.press('Enter');
  expect(await degreeAt(page, a.x + 410, a.y + 140)).toBe(3);
  expect(await freeEnds(page)).toBe(1);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('12,00 m²');
});

test('Space typed in the project name field does not flip the wall face', async ({ page }) => {
  await createProject(page, 'Nom');
  await page.keyboard.press('m');
  const name = page.getByTestId('project-name');
  await name.click();
  await name.press('End');
  await page.keyboard.press('Space');
  await expect(name).toHaveValue('Nom ');
  await expect(page.getByTestId('wall-reference-bar').getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
});
