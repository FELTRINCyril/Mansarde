/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createProject } from './helpers';

/*
 * Exports of a plan with downloaded models: their top view goes into the file with its
 * transparency (a chair is not drawn on a black square). jsPDF keeps the alpha of a PNG as a soft
 * mask (/SMask); a WebP is re-encoded as an opaque JPEG.
 */

test('the PDF keeps the transparency of the top views', async ({ page }, testInfo) => {
  await createProject(page, 'Export modèles');
  await page.evaluate(async () => {
    const mod = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const { addRectRoomInterior } = await mod('/src/core/commands/walls.ts');
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
    const s = window.__planMaison!.store.getState();
    const L = s.activeLevelId!;
    s.execute('Pièce', addRectRoomInterior(L, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    const e = getCatalogEntry('sh-bs0-antique-chair');
    s.execute('Chaise', addObject(L, createObjectFromSize({ kind: 'catalog', catalogId: e.id }, 200, 150, e, e.name, e.color)));
  });
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  const file = testInfo.outputPath('models.pdf');
  await dl.saveAs(file);
  const pdf = (await readFile(file)).toString('latin1');
  expect(pdf.startsWith('%PDF')).toBe(true);
  // one image of the chair, with its soft mask; no opaque JPEG
  expect(pdf).toMatch(/\/Subtype \/Image/);
  expect(pdf).toMatch(/\/SMask \d+ 0 R/);
  expect(pdf).not.toMatch(/\/DCTDecode/);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
