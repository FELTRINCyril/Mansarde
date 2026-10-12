import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

test('the "Dupliquer" button copies a resized object and selects the copy', async ({ page }) => {
  await createProject(page, 'Duplication');
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  await expect(page.locator('[data-kind="object"]')).toHaveCount(1);

  // resized in the panel: the copy must keep these sizes
  for (const [field, value] of [['object-width', '120'], ['object-depth', '210']] as const) {
    await page.getByTestId(field).fill(value);
    await page.getByTestId(field).press('Enter');
    await expect(page.getByTestId(field)).toHaveValue(value);
  }

  const button = page.getByTestId('duplicate-selection');
  await expect(button).toHaveText('Dupliquer');
  await expect(button).toHaveAttribute('title', /^Dupliquer \((Cmd|Ctrl)\+D\)$/);
  await button.click();
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);

  const state = await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return { objects: Object.values(level.objects).map((o) => ({ id: o.id, width: o.width, depth: o.depth, x: o.x, y: o.y })), selection: s.selection };
  });
  expect(state.objects.map((o) => [o.width, o.depth])).toEqual([
    [120, 210],
    [120, 210],
  ]);
  const [original, copy] = state.objects;
  expect(copy!.x - original!.x).toBeCloseTo(20, 6);
  expect(copy!.y - original!.y).toBeCloseTo(20, 6);
  expect(state.selection).toEqual([{ kind: 'object', id: copy!.id }]);
  // the panel now shows the copy, with the same sizes
  await expect(page.getByTestId('object-width')).toHaveValue('120');

  // one undo removes the copy only
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('[data-kind="object"]')).toHaveCount(1);
});
