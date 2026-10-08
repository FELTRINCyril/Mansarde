import { expect, type Page } from '@playwright/test';

/*
 * Shared helpers of the e2e specs. They act like a user (clicks, keys); window.__planMaison is only
 * read, to convert world coordinates (cm) to page pixels and to check the resulting state.
 */

export interface Vec { x: number; y: number }

/**
 * From the home screen: "Nouveau projet", the name, "Créer", then waits for the editor. The editor
 * attaches its key handler in the commit that shows it, so keys can be pressed right after.
 */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  const dialog = page.getByTestId('prompt-dialog');
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

/** Page coordinates of a world point (cm) in the current view. */
export async function onPage(page: Page, w: Vec): Promise<Vec> {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const v = await page.evaluate(() => window.__planMaison!.store.getState().view);
  return { x: box.x + w.x * v.pxPerCm + v.tx, y: box.y + w.y * v.pxPerCm + v.ty };
}

/** A grid point (cm, multiple of 100) shown at the given fraction of the canvas. */
export async function gridPointAt(page: Page, fx: number, fy: number): Promise<Vec> {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const v = await page.evaluate(() => window.__planMaison!.store.getState().view);
  const round = (n: number) => Math.round(n / 100) * 100;
  return { x: round((box.width * fx - v.tx) / v.pxPerCm), y: round((box.height * fy - v.ty) / v.pxPerCm) };
}

/** Moves the mouse to a world point (cm), in a few steps like a hand would. */
export async function moveTo(page: Page, w: Vec): Promise<void> {
  const p = await onPage(page, w);
  await page.mouse.move(p.x, p.y, { steps: 3 });
}

/** Types a length (cm) in the numeric field opened by its first digit, then Enter. */
export async function typeLength(page: Page, value: string): Promise<void> {
  await page.keyboard.press(value[0]!);
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await page.keyboard.type(value.slice(1));
  await expect(input).toHaveValue(value);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
}
