import { expect, test, type Page } from '@playwright/test';
import { createProject, gridPointAt, moveTo, onPage } from './helpers';

/*
 * Spec 6: rectangular rooms drawn by their inside, interior dimensions edited by a double-click,
 * reference line of the wall tool (option bar, Space).
 */

async function drawRoom400x300(page: Page): Promise<void> {
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
  await expect(page.getByTestId('toast')).toContainText('Dimension invalide');
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
