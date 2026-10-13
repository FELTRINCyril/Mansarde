import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

test.setTimeout(180_000);
// a smaller view: software WebGL draws every pixel on the CPU
test.use({ viewport: { width: 1100, height: 700 } });

/*
 * Downloaded models (spec 2026-10-13): found in the catalog, placed, drawn by their outline on
 * the plan, loaded in the 3D view; the catalog search stays capped; the credits open.
 */

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function room(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { addRectRoomInterior } = await import(/* @vite-ignore */ '/src/core/commands/walls.ts' as string);
    const s = window.__planMaison!.store.getState();
    if (!s.execute('Pièce', addRectRoomInterior(s.activeLevelId!, { x: 0, y: 0 }, { x: 500, y: 400 }, 20, 250))) throw new Error('refused');
  });
}

const search = (page: Page) => page.getByRole('searchbox', { name: 'Rechercher un objet' });

test('a downloaded model: catalog, plan outline, 3D model', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Modèles');
  await room(page);

  await search(page).fill('réfrigérateur combiné');
  const item = page.getByTestId('catalog-item-catalog-kn-kitchen-fridge');
  await expect(item).toBeVisible();
  await expect(item.locator('img')).toHaveAttribute('src', /models\/icons\/kn-kitchen-fridge\.webp$/);
  // the icon really loads (not a broken image)
  await expect.poll(() => item.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await item.click();

  // the plan draws its top view, an image that really loads
  const object = page.locator('[data-kind="object"]');
  await expect(object).toHaveCount(1);
  const top = object.locator('image[data-kind="model-top"]');
  await expect(top).toHaveCount(1);
  const href = await top.getAttribute('href');
  expect(href).toMatch(/models\/top\/kn-kitchen-fridge\.webp$/);
  // loaded: its placeholder box is gone
  await expect(object.locator('rect')).toHaveCount(0);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/webp');

  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => window.__planMaison3D!.modelsLoaded), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => window.__planMaison3D!.modelsFailed)).toBe(0);
  // loaded is not shown: the objects waiting for their model are rebuilt with it
  await expect.poll(() => page.evaluate(() => window.__planMaison3D!.modelsWaiting), { timeout: 30_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('a missing top view falls back to the box', async ({ page }) => {
  await page.route('**/models/top/**', (route) => route.fulfill({ status: 404, body: '' }));
  await createProject(page, 'Sans vue de dessus');
  await room(page);
  await search(page).fill('réfrigérateur combiné');
  await page.getByTestId('catalog-item-catalog-kn-kitchen-fridge').click();
  const object = page.locator('[data-kind="object"]');
  await expect(object.locator('rect')).toHaveCount(1);
  await expect(object.locator('image')).toHaveCount(0);
});

test('3D: the small objects shadows option is kept by the browser', async ({ page }) => {
  await createProject(page, 'Ombres');
  await room(page);
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible({ timeout: 30_000 });
  const box = page.getByTestId('small-shadows-3d');
  await expect(box).toBeChecked();
  await box.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('mansarde.smallShadows3d'))).toBe('false');
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__planMaison?.store.getState().display.smallShadows3d)).toBe(false);
  await page.evaluate(() => localStorage.removeItem('mansarde.smallShadows3d'));
});

test('catalog: capped search, style filter, credits', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Catalogue');

  await search(page).fill('a');
  await expect(page.getByTestId('catalog-truncated')).toContainText('80 premiers résultats');
  await expect(page.locator('.catalog-item')).toHaveCount(80);

  await search(page).fill('');
  await page.getByTestId('catalog-style-realiste').click();
  await expect(page.getByTestId('catalog-item-catalog-bed-140')).toHaveCount(0);
  await expect(page.locator('.catalog-item img').first()).toBeVisible();
  await page.getByTestId('catalog-style-simple').click();
  await expect(page.getByTestId('catalog-item-catalog-bed-140')).toBeVisible();

  await page.getByTestId('open-credits').click();
  const dialog = page.getByTestId('credits-dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.getByTestId('credits-group').count()).toBeGreaterThanOrEqual(5);
  await expect(dialog).toContainText('Kenney');
  await expect(dialog).toContainText('CC-BY 3.0');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});
