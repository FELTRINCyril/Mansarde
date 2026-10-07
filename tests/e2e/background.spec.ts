import { expect, test, type Page } from '@playwright/test';

interface Vec { x: number; y: number }
const FIXTURE = 'tests/e2e/fixtures/plan.png';
// the 400 px line of plan.png, in image pixels
const LINE_A: Vec = { x: 200, y: 300 };
const LINE_B: Vec = { x: 600, y: 300 };

async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  const dialog = page.getByTestId('prompt-dialog');
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

const bgOf = (page: Page) =>
  page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    return s.project!.levels.find((l) => l.id === s.activeLevelId)!.background;
  });

/** Shows the whole 800 x 600 image (at its current scale and position) in the canvas. */
async function fitOnImage(page: Page) {
  await page.evaluate(() => {
    const st = window.__planMaison!.store;
    const s = st.getState();
    const bg = s.project!.levels.find((l) => l.id === s.activeLevelId)!.background!;
    const el = document.querySelector('[data-testid=plan-canvas]')!;
    const w = bg.widthPx * bg.scale;
    const h = bg.heightPx * bg.scale;
    const z = Math.min((el.clientWidth - 40) / w, (el.clientHeight - 40) / h);
    s.setView({ pxPerCm: z, tx: (el.clientWidth - w * z) / 2 - bg.x * z, ty: (el.clientHeight - h * z) / 2 - bg.y * z });
  });
}

/** Page coordinates of image pixel q (no rotation). */
async function pagePoint(page: Page, q: Vec): Promise<Vec> {
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const r = await page.evaluate((q) => {
    const s = window.__planMaison!.store.getState();
    const bg = s.project!.levels.find((l) => l.id === s.activeLevelId)!.background!;
    return { x: (bg.x + q.x * bg.scale) * s.view.pxPerCm + s.view.tx, y: (bg.y + q.y * bg.scale) * s.view.pxPerCm + s.view.ty };
  }, q);
  return { x: box.x + r.x, y: box.y + r.y };
}

async function importFixture(page: Page) {
  await page.getByTestId('background-file').setInputFiles(FIXTURE);
  await expect(page.locator('image[data-kind=background]')).toHaveCount(1);
  await fitOnImage(page);
}

/** Calibrates on the 400 px line: two clicks, then the typed length. */
async function calibrate(page: Page, realCm: string) {
  await page.getByTestId('background-calibrate').click();
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'false');
  const a = await pagePoint(page, LINE_A);
  const b = await pagePoint(page, LINE_B);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  await page.mouse.click(b.x, b.y);
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await expect(page.getByTestId('numeric-overlay')).toContainText('Longueur réelle');
  await page.keyboard.type(realCm);
  await page.keyboard.press('Enter');
}

async function addRoom(page: Page) {
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom } = await import(/* @vite-ignore */ url);
    const st = window.__planMaison!.store;
    st.getState().execute('room', addRectRoom(st.getState().activeLevelId!, { x: 100, y: 100 }, { x: 500, y: 400 }, 20, 250));
  });
}

test('import, calibrate on the 400 px line, persist across a reload', async ({ page }) => {
  await createProject(page, 'Fond');
  const shots = process.env.SHOT_DIR;
  await expect(page.getByTestId('background-import')).toHaveText('Importer une image de fond');
  if (shots) await page.screenshot({ path: `${shots}/0-panel-empty.png` });

  await importFixture(page);
  const bg = (await bgOf(page))!;
  expect(bg).toMatchObject({ widthPx: 800, heightPx: 600, scale: 1, rotation: 0, opacity: 0.5, locked: false, visible: true });
  // centered on the view when imported (the view was not fitted yet, but the image is centered on its center)
  await expect(page.getByTestId('background-width')).toHaveText('8,00 m');
  await addRoom(page);
  if (shots) await page.screenshot({ path: `${shots}/1-imported-under-plan.png` });

  // first calibration: 400 px declared 200 cm -> 0.5 cm/px, the first clicked point stays put
  const before = await pagePoint(page, LINE_A);
  await calibrate(page, '200');
  await expect.poll(async () => (await bgOf(page))!.scale).toBeCloseTo(0.5, 9);
  expect(await page.evaluate(() => window.__planMaison!.store.getState().tool)).toBe('select');
  const after = await pagePoint(page, LINE_A);
  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.y).toBeCloseTo(before.y, 3);
  await expect(page.getByTestId('background-width')).toHaveText('4,00 m');

  // second calibration: the same line declared 400 cm -> back to 1 cm/px, the image is 800 cm wide
  await fitOnImage(page);
  await calibrate(page, '400');
  await expect.poll(async () => (await bgOf(page))!.scale).toBeCloseTo(1, 9);
  await expect(page.getByTestId('background-width')).toHaveText('8,00 m');

  // undo restores the previous scale
  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await bgOf(page))!.scale).toBeCloseTo(0.5, 9);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await bgOf(page))!.scale).toBeCloseTo(1, 9);

  // reload: the image is still there and decodes
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');
  await page.reload();
  await page.getByRole('button', { name: 'Ouvrir' }).first().click();
  const img = page.locator('image[data-kind=background]');
  await expect(img).toHaveCount(1);
  const natural = await img.evaluate(
    (el) =>
      new Promise<number>((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i.naturalWidth);
        i.onerror = () => resolve(-1);
        i.src = el.getAttribute('href')!;
      }),
  );
  expect(natural).toBe(800);
  expect((await bgOf(page))!.scale).toBeCloseTo(1, 9);
});

test('calibration segment preview, Escape and a refused length', async ({ page }) => {
  await createProject(page, 'Segment');
  await importFixture(page);
  const shots = process.env.SHOT_DIR;
  await page.getByTestId('background-calibrate').click();
  await expect(page.getByTestId('background-hint')).toBeVisible();
  const a = await pagePoint(page, LINE_A);
  const b = await pagePoint(page, LINE_B);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x - 60, b.y + 10);
  await expect(page.locator('[data-kind=calibration-segment]')).toHaveCount(1);
  if (shots) await page.screenshot({ path: `${shots}/2-calibrating.png` });
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('numeric-overlay-input')).toBeFocused();
  if (shots) await page.screenshot({ path: `${shots}/3-calibrating-length.png` });

  // 0 is refused (red, stays open), Escape drops the segment and leaves the scale alone
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay-input')).toHaveClass(/input-invalid/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
  await expect(page.locator('[data-kind=calibration-segment]')).toHaveCount(0);
  expect((await bgOf(page))!.scale).toBe(1);
  expect(await page.evaluate(() => window.__planMaison!.store.getState().tool)).toBe('calibrate');

  // Escape again leaves the tool
  await page.getByTestId('plan-canvas').focus();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__planMaison!.store.getState().tool)).toBe('select');
});

test('panel settings: opacity, rotation, hide, lock, move mode', async ({ page }) => {
  await createProject(page, 'Reglages');
  await importFixture(page);
  const shots = process.env.SHOT_DIR;

  await page.getByTestId('background-opacity').fill('80');
  await expect.poll(async () => (await bgOf(page))!.opacity).toBeCloseTo(0.8, 9);
  await page.getByTestId('background-rotation').fill('15');
  await page.getByTestId('background-rotation').press('Enter');
  await expect.poll(async () => (await bgOf(page))!.rotation).toBe(15);
  await expect(page.locator('image[data-kind=background]')).toHaveAttribute('transform', /rotate\(15 /);
  if (shots) await page.screenshot({ path: `${shots}/4-panel.png` });
  await page.getByTestId('background-rotation').fill('0');
  await page.getByTestId('background-rotation').press('Enter');

  // hide: not drawn, and the modes need a visible image
  await page.getByTestId('background-hidden').check();
  await expect(page.locator('image[data-kind=background]')).toHaveCount(0);
  await expect(page.getByTestId('background-move')).toBeDisabled();
  await expect(page.getByTestId('background-calibrate')).toBeDisabled();
  await page.getByTestId('background-hidden').uncheck();
  await expect(page.locator('image[data-kind=background]')).toHaveCount(1);

  // lock disables the move button
  await page.getByTestId('background-locked').check();
  await expect(page.getByTestId('background-move')).toBeDisabled();
  await page.getByTestId('background-locked').uncheck();
  await expect(page.getByTestId('background-move')).toBeEnabled();

  // move mode: a drag moves the image by the pointer delta, once in the history
  const start = (await bgOf(page))!;
  const z = await page.evaluate(() => window.__planMaison!.store.getState().view.pxPerCm);
  const o = await pagePoint(page, { x: 400, y: 300 });
  await page.getByTestId('background-move').click();
  await expect(page.getByTestId('background-move-done')).toBeVisible();
  await page.mouse.move(o.x, o.y);
  await page.mouse.down();
  await page.mouse.move(o.x + 30, o.y + 20, { steps: 4 });
  await page.mouse.up();
  const moved = (await bgOf(page))!;
  expect(moved.x - start.x).toBeCloseTo(30 / z, 3);
  expect(moved.y - start.y).toBeCloseTo(20 / z, 3);

  // Escape leaves the move mode
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__planMaison!.store.getState().tool)).toBe('select');
  await page.getByTestId('background-move').click();
  await page.getByTestId('background-move-done').click();
  expect(await page.evaluate(() => window.__planMaison!.store.getState().tool)).toBe('select');
});

test('delete the image after a confirmation, undo brings it back', async ({ page }) => {
  await createProject(page, 'Suppression');
  await importFixture(page);
  await page.getByTestId('background-delete').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Annuler' }).click();
  expect(await bgOf(page)).not.toBeNull();

  await page.getByTestId('background-delete').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Supprimer' }).click();
  expect(await bgOf(page)).toBeNull();
  await expect(page.locator('image[data-kind=background]')).toHaveCount(0);
  await expect(page.getByTestId('background-import')).toHaveText('Importer une image de fond');

  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ControlOrMeta+z');
  expect(await bgOf(page)).not.toBeNull();
  await expect(page.locator('image[data-kind=background]')).toHaveCount(1);
});

test('an unreadable image is refused with a toast and changes nothing', async ({ page }) => {
  await createProject(page, 'Illisible');
  await page.getByTestId('background-file').setInputFiles({ name: 'cassee.png', mimeType: 'image/png', buffer: Buffer.from('pas une image') });
  await expect(page.getByText('Image illisible')).toBeVisible();
  expect(await bgOf(page)).toBeNull();
  await expect(page.getByTestId('background-import')).toHaveText('Importer une image de fond');
});
