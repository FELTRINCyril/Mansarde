/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, name: string) {
  await page.getByTestId('new-project').click();
  const dialog = page.getByTestId('prompt-dialog');
  await expect(dialog.getByRole('textbox')).toHaveValue('Mon logement');
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

const projectItem = (page: Page, name: string) =>
  page.getByTestId('project-item').filter({ has: page.getByTestId('project-name-cell').getByText(name, { exact: true }) });

test('project lifecycle: create, persist, levels, duplicate, export, delete, import', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Test');
  await expect(page.getByTestId('level-tab-0')).toHaveText('RDC');
  await expect(page.getByTestId('project-name')).toHaveValue('Test');

  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Test')).toBeVisible();
  await expect(projectItem(page, 'Test')).toContainText(/modifié le \d\d\/\d\d\/\d{4} \d\d:\d\d - 1 niveau/);

  await page.reload();
  await expect(projectItem(page, 'Test')).toBeVisible();

  // add a level above: 2 tabs, persisted by the autosave
  await projectItem(page, 'Test').getByRole('button', { name: 'Ouvrir' }).click();
  await page.getByTestId('level-menu-0').click();
  await page.getByRole('menuitem', { name: 'Ajouter au-dessus' }).click();
  await expect(page.getByTestId('level-tab-1')).toHaveText('Étage 1');
  await expect(page.getByTestId('level-tab-0')).toHaveText('RDC');
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');
  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Test')).toContainText('2 niveaux');

  // duplicate
  await projectItem(page, 'Test').getByRole('button', { name: 'Dupliquer' }).click();
  await expect(projectItem(page, 'Test - variante')).toBeVisible();
  await expect(projectItem(page, 'Test - variante')).toContainText('2 niveaux');

  // export
  const downloadPromise = page.waitForEvent('download');
  await projectItem(page, 'Test').getByRole('button', { name: 'Exporter' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Test.json');
  const file = test.info().outputPath('Test.json');
  await download.saveAs(file);
  const text = await readFile(file, 'utf8');
  expect(text).toContain('"app": "plan-maison"');

  // delete (with confirmation)
  await projectItem(page, 'Test').getByRole('button', { name: 'Supprimer' }).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(projectItem(page, 'Test')).toHaveCount(0);
  await expect(page.getByTestId('project-item')).toHaveCount(1);

  // re-import
  await page.getByTestId('import-input').setInputFiles(file);
  await expect(projectItem(page, 'Test')).toBeVisible();
  await expect(projectItem(page, 'Test')).toContainText('2 niveaux');
  await expect(page.getByTestId('project-item')).toHaveCount(2);

  // invalid file: error banner, nothing imported
  await page.getByTestId('import-input').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('ceci n est pas un plan') });
  await expect(page.getByTestId('home-error')).toBeVisible();
  await expect(page.getByTestId('home-error')).toContainText('JSON');
  await expect(page.getByTestId('project-item')).toHaveCount(2);
});

test('editor shell: tools, properties, settings, zoom and catalog', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Maison');

  // toolbar: active tool highlighted, tooltip with shortcut
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('title', 'Mur (M)');
  await page.getByTestId('tool-wall').click();
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('tool-select').click();

  // level properties: invalid value refused (red), valid value committed, undo restores it
  const height = page.getByTestId('level-height');
  await expect(height).toHaveValue('250');
  await height.fill('0');
  await height.press('Enter');
  await expect(height).toHaveAttribute('aria-invalid', 'true');
  await height.press('Escape');
  await expect(height).toHaveValue('250');
  await height.fill('2,6 m');
  await height.press('Enter');
  await expect(height).toHaveValue('260');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(height).toHaveValue('250');

  // settings dialog
  await page.getByTestId('open-settings').click();
  const wall = page.getByTestId('setting-defaultWallThickness');
  await expect(wall).toHaveValue('20');
  await wall.fill('25');
  await wall.press('Enter');
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Fermer' }).click();
  const thickness = await page.evaluate(() => window.__planMaison!.store.getState().project!.settings.defaultWallThickness);
  expect(thickness).toBe(25);

  // a room made through the dev handle, then fit view with "0" and zoom with the wheel
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoom(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  });
  const canvas = page.getByTestId('plan-canvas');
  await canvas.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('0');
  const zoomAfterFit = await page.evaluate(() => window.__planMaison!.store.getState().view.pxPerCm);
  expect(zoomAfterFit).toBeGreaterThan(1);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 200);
  const zoomAfterWheel = await page.evaluate(() => window.__planMaison!.store.getState().view.pxPerCm);
  expect(zoomAfterWheel).toBeLessThan(zoomAfterFit);

  // middle button drag pans the view
  const before = await page.evaluate(() => window.__planMaison!.store.getState().view);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30);
  await page.mouse.up({ button: 'middle' });
  const after = await page.evaluate(() => window.__planMaison!.store.getState().view);
  expect(after.tx - before.tx).toBeCloseTo(50, 0);
  expect(after.ty - before.ty).toBeCloseTo(30, 0);

  // space + drag pans too
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 120);
  await page.mouse.up();
  await page.keyboard.up('Space');
  const afterSpace = await page.evaluate(() => window.__planMaison!.store.getState().view);
  expect(afterSpace.tx - after.tx).toBeCloseTo(-40, 0);
  expect(afterSpace.ty - after.ty).toBeCloseTo(20, 0);

  // catalog: a click places the object at the view center and selects it
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  await expect(page.getByTestId('object-width')).toHaveValue('90');
  await expect(page.locator('[data-kind="object"]')).toHaveCount(1);
  await page.getByTestId('object-width').fill('100');
  await page.getByTestId('object-width').press('Enter');
  await expect(page.getByTestId('object-width')).toHaveValue('100');
  await page.getByTestId('delete-selection').click();
  await expect(page.locator('[data-kind="object"]')).toHaveCount(0);

  // drag and drop from the catalog onto the plan
  await page.getByTestId('catalog-item-catalog-bed-90').dragTo(canvas, { targetPosition: { x: 60, y: 60 } });
  await expect(page.locator('[data-kind="object"]')).toHaveCount(1);
  await expect(page.getByTestId('object-depth')).toHaveValue('190');
});

test('a failed save shows a persistent banner that names the project once it is closed', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Chalet');
  await page.evaluate(() => {
    window.__planMaison!.projectStore.saveProject = async () => {
      throw new Error('Stockage plein');
    };
  });
  const height = page.getByTestId('level-height');
  await height.fill('270');
  await height.press('Enter');
  const banner = page.getByTestId('save-error');
  await expect(banner).toHaveText(/La sauvegarde a échoué : Stockage plein\. Exportez votre projet en \.json pour ne rien perdre\./);
  await expect(page.getByTestId('save-status')).toHaveText('Non enregistré');

  // the export button of the banner saves the current, unsaved state
  const downloadPromise = page.waitForEvent('download');
  await banner.getByRole('button', { name: 'Exporter en .json' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Chalet.json');

  await page.getByTestId('back-to-projects').click();
  await expect(banner).toContainText('La sauvegarde du projet "Chalet" a échoué : Stockage plein.');

  // reopening shows the unsaved version, not the stale stored one
  await page.getByTestId('project-item').getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.getByTestId('level-height')).toHaveValue('270');
});
