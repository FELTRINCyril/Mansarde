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

test('an immediate return to the projects lists the last edits (no wait for "Enregistré")', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Rapide');
  await page.getByTestId('level-menu-0').click();
  await page.getByRole('menuitem', { name: 'Ajouter au-dessus' }).click();
  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Rapide')).toContainText('2 niveaux');

  await projectItem(page, 'Rapide').getByRole('button', { name: 'Ouvrir' }).click();
  await page.getByTestId('project-name').fill('Rapide renommé');
  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Rapide renommé')).toBeVisible();
  await expect(projectItem(page, 'Rapide')).toHaveCount(0);
});

test('a missing or unreadable background image is reported per level', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Images');
  await page.getByTestId('level-menu-0').click();
  await page.getByRole('menuitem', { name: 'Ajouter au-dessus' }).click();
  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Images')).toContainText('2 niveaux');

  await page.evaluate(async () => {
    const ps = window.__planMaison!.projectStore;
    const meta = (await ps.listProjects())[0]!;
    const p = (await ps.getProject(meta.id))!;
    const bg = (imageId: string) => ({
      imageId, widthPx: 10, heightPx: 10, scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, locked: false, visible: true,
    });
    p.levels[0]!.background = bg('img-missing');
    p.levels[1]!.background = bg('img-corrupt');
    await ps.putImage({
      id: 'img-corrupt', projectId: p.id, mime: 'image/png', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      widthPx: 10, heightPx: 10,
    });
    await ps.saveProject(p);
  });
  await projectItem(page, 'Images').getByRole('button', { name: 'Ouvrir' }).click();
  const banner = page.getByTestId('image-error');
  await expect(banner).toContainText('Image de fond introuvable pour le niveau RDC.');
  await expect(banner).toContainText('Image de fond introuvable pour le niveau Étage 1.');
  await banner.getByRole('button', { name: 'Fermer' }).click();
  await expect(banner).toHaveCount(0);
});

test('multiple selection edits the common properties of walls or objects in one step', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Multi');
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoom(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  });
  const state = () =>
    page.evaluate(() => {
      const s = window.__planMaison!.store.getState();
      const level = s.project!.levels[0]!;
      return { walls: Object.values(level.walls), objects: Object.values(level.objects), past: s.history.past.length };
    });

  // walls only: thickness and height, one history entry for all walls
  await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    s.setSelection(Object.keys(s.project!.levels[0]!.walls).map((id) => ({ kind: 'wall' as const, id })));
  });
  await expect(page.getByTestId('selection-count')).toHaveText('4 éléments sélectionnés');
  await expect(page.getByTestId('walls-thickness')).toHaveValue('20');
  const before = await state();
  await page.getByTestId('walls-thickness').fill('30');
  await page.getByTestId('walls-thickness').press('Enter');
  await page.getByTestId('walls-height').fill('270');
  await page.getByTestId('walls-height').press('Enter');
  let after = await state();
  expect(after.walls.map((w) => [w.thickness, w.height])).toEqual(before.walls.map(() => [30, 270]));
  expect(after.past).toBe(before.past + 2);

  // objects only: height, laying height and color, with differing values shown as empty
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  await page.getByTestId('catalog-item-catalog-nightstand').click();
  await page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    s.setSelection(Object.keys(s.project!.levels[0]!.objects).map((id) => ({ kind: 'object' as const, id })));
  });
  await expect(page.getByTestId('selection-count')).toHaveText('2 éléments sélectionnés');
  await expect(page.getByTestId('walls-thickness')).toHaveCount(0);
  await expect(page.getByTestId('objects-height')).toHaveValue('50');
  await page.getByTestId('objects-elevation').fill('10');
  await page.getByTestId('objects-elevation').press('Enter');
  await page.getByTestId('objects-height').fill('70');
  await page.getByTestId('objects-height').press('Enter');
  await page.getByTestId('objects-color').evaluate((el: HTMLInputElement) => {
    el.value = '#336699';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  after = await state();
  expect(after.objects.map((o) => [o.height, o.elevation, o.color])).toEqual([
    [70, 10, '#336699'],
    [70, 10, '#336699'],
  ]);
  await expect(page.getByTestId('delete-selection')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  after = await state();
  expect(after.objects.map((o) => o.color)).not.toContain('#336699');
  expect(after.objects.map((o) => o.height)).toEqual([70, 70]);
});

test('Escape in a field of a dialog reverts the field without closing the dialog', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Echap');
  await page.getByTestId('open-settings').click();
  const grid = page.getByTestId('setting-gridStep');
  await grid.fill('abc');
  await grid.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await expect(grid).toHaveValue('10');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
});

test('project list items show a preview of the first level', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Vide');
  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Vide').getByTestId('project-thumb')).toHaveText('Plan vide');

  await createProject(page, 'Avec pièce');
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoom(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  });
  await page.getByTestId('back-to-projects').click();
  const thumb = projectItem(page, 'Avec pièce').getByTestId('project-thumb');
  await expect(thumb.locator('svg[data-kind="plan"] [data-kind="wall-shape"]')).toHaveCount(1);
  await expect(thumb.locator('svg')).toHaveAttribute('width', '120');
});
