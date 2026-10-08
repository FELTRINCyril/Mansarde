/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createProject } from './helpers';

// The export dialog, end to end: the scene is built through the dev handle (store.execute with core
// commands), the files are downloaded from the dialog into the test output folder.

/** A room of w x h cm with a door and a bed "Lit bébé", through the store like the tools do. */
async function addScene(page: Page, w: number, h: number) {
  await page.evaluate(
    async ({ w, h }) => {
      const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
      const { addRectRoom } = await mod('/src/core/commands/walls.ts');
      const { addOpening } = await mod('/src/core/commands/openings.ts');
      const { addObject } = await mod('/src/core/commands/objects.ts');
      const { createOpening, createObjectFromSize } = await mod('/src/core/model/factory.ts');
      const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
      const s = window.__planMaison!.store.getState();
      const levelId = s.activeLevelId!;
      s.execute('Pièce', addRectRoom(levelId, { x: 0, y: 0 }, { x: w, y: h }, 20, 250));
      const level = window.__planMaison!.store.getState().project!.levels[0]!;
      const wall = Object.values(level.walls)[0]!;
      s.execute('Porte', addOpening(levelId, createOpening(wall.id, 'door', Math.min(w, h) / 3)));
      const bed = getCatalogEntry('bed-140');
      s.execute(
        'Lit',
        addObject(levelId, createObjectFromSize({ kind: 'catalog', catalogId: bed.id }, 110, 190, bed, 'Lit bébé', bed.color)),
      );
    },
    { w, h },
  );
}

async function openExport(page: Page) {
  await page.getByTestId('open-export').click();
  const dialog = page.getByTestId('export-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function download(page: Page, testInfo: TestInfo, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const file = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), bytes: await readFile(file) };
}

test('export dialog: scaled pdf and png of a project with accents', async ({ page }, testInfo) => {
  await createProject(page, "Maison d'été");
  await addScene(page, 400, 300);
  const dialog = await openExport(page);

  // PDF tab: A4 landscape 1/50 by default fits; no message
  await expect(page.getByTestId('export-tab-pdf')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('export-format-A4').click();
  await page.getByTestId('export-orientation-landscape').click();
  await page.getByTestId('export-scale-50').click();
  await expect(page.getByTestId('export-fit-message')).toHaveCount(0);
  await dialog.screenshot({ path: testInfo.outputPath('dialog-pdf-fits.png') });
  const pdf = await download(page, testInfo, () => page.getByTestId('export-run').click());
  expect(pdf.name).toBe("Maison d'été - RDC.pdf");
  expect(pdf.bytes.length).toBeGreaterThan(2048);
  expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);

  // PNG tab
  await openExport(page);
  await page.getByTestId('export-tab-png').click();
  await expect(page.getByTestId('export-resolution-2')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('export-dialog').screenshot({ path: testInfo.outputPath('dialog-png.png') });
  const png = await download(page, testInfo, () => page.getByTestId('export-run').click());
  expect(png.name).toBe("Maison d'été - RDC.png");
  expect([...png.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test('export dialog: advice when the plan does not fit, with a one-click scale change', async ({ page }, testInfo) => {
  await createProject(page, "Maison d'été");
  await addScene(page, 1200, 900);
  const dialog = await openExport(page);
  await page.getByTestId('export-format-A4').click();
  await page.getByTestId('export-orientation-landscape').click();
  await page.getByTestId('export-scale-50').click();

  const message = page.getByTestId('export-fit-message');
  await expect(message).toContainText("Le plan ne tient pas sur cette page à l'échelle 1/50. Échelle conseillée : 1/100.");
  await expect(page.getByTestId('export-run')).toBeDisabled();
  await dialog.screenshot({ path: testInfo.outputPath('dialog-pdf-advice.png') });

  await page.getByRole('button', { name: 'Utiliser 1/100' }).click();
  await expect(page.getByTestId('export-scale-100')).toHaveAttribute('aria-pressed', 'true');
  await expect(message).toHaveCount(0);
  await expect(page.getByTestId('export-run')).toBeEnabled();
  const pdf = await download(page, testInfo, () => page.getByTestId('export-run').click());
  expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
});

test('export dialog: no scale fits, and an empty level', async ({ page }, testInfo) => {
  await createProject(page, 'Grand domaine');
  const dialog = await openExport(page);
  await expect(page.getByTestId('export-empty')).toHaveText('Ce niveau est vide.');
  await expect(page.getByTestId('export-run')).toBeDisabled();
  await dialog.screenshot({ path: testInfo.outputPath('dialog-empty.png') });
  await page.keyboard.press('Escape');

  await addScene(page, 5000, 3500);
  await openExport(page);
  await page.getByTestId('export-format-A4').click();
  await page.getByTestId('export-orientation-landscape').click();
  await expect(page.getByTestId('export-fit-message')).toHaveText(
    'Le plan ne tient pas sur cette page, même au 1/200. Choisissez un format plus grand.',
  );
  await expect(page.getByRole('button', { name: /Utiliser/ })).toHaveCount(0);
  await expect(page.getByTestId('export-run')).toBeDisabled();
  await dialog.screenshot({ path: testInfo.outputPath('dialog-pdf-too-big.png') });

  // an export error stays in the dialog (a 5000 x 3500 cm plan at 4x exceeds the canvas area limit)
  await page.getByTestId('export-tab-png').click();
  await page.getByTestId('export-resolution-4').click();
  await page.getByTestId('export-run').click();
  await expect(page.getByTestId('export-error')).toContainText('Image trop grande');
  await expect(page.getByTestId('export-run')).toBeEnabled();
  await dialog.screenshot({ path: testInfo.outputPath('dialog-png-error.png') });
});

test('export dialog: project file tab', async ({ page }, testInfo) => {
  await createProject(page, 'Test json');
  await openExport(page);
  await page.getByTestId('export-tab-json').click();
  const json = await download(page, testInfo, () => page.getByTestId('export-json').click());
  expect(json.name).toBe('Test json.json');
  expect(json.bytes.toString('utf8')).toContain('"app": "plan-maison"');
});
