import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

test.setTimeout(120_000);
// a smaller view: software WebGL draws every pixel on the CPU
test.use({ viewport: { width: 1100, height: 700 } });

/*
 * Furniture in the 3D view (task 12): an object in alert is tinted red (read from the canvas by
 * the DEV probe window.__planMaison3DProbe, which renders and reads the pixel at the top center
 * of an object), and the name labels follow "Noms des objets".
 */

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const LOAD = { timeout: 30_000 };
const frames = (page: Page) => page.evaluate(() => window.__planMaison3D!.frames);

/** Waits until the 3D view stopped rendering (no new frame for 1.2 s). */
async function settle(page: Page): Promise<void> {
  let last = -1;
  let still = 0;
  for (let i = 0; i < 100; i++) {
    const f = await frames(page);
    still = f === last ? still + 1 : 0;
    if (still === 2) return;
    last = f;
    await page.waitForTimeout(600);
  }
  throw new Error('the 3D view never stops rendering');
}

/** A 400 x 400 room with a 160 bed in the middle (its id is returned). */
async function roomWithBed(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addRectRoomInterior } = await mod('/src/core/commands/walls.ts');
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
    const s = window.__planMaison!.store.getState();
    const levelId = s.activeLevelId!;
    if (!s.execute('Pièce', addRectRoomInterior(levelId, { x: 0, y: 0 }, { x: 400, y: 400 }, 20, 250))) throw new Error('refused');
    const e = getCatalogEntry('bed-160');
    const bed = createObjectFromSize({ kind: 'catalog', catalogId: e.id }, 200, 200, e, e.name, e.color);
    if (!s.execute('Lit', addObject(levelId, bed))) throw new Error('refused');
    return bed.id as string;
  });
}

async function addChairOn(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    async ({ x, y }) => {
      const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
      const { addObject } = await mod('/src/core/commands/objects.ts');
      const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
      const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
      const s = window.__planMaison!.store.getState();
      const e = getCatalogEntry('chair');
      const chair = createObjectFromSize({ kind: 'catalog', catalogId: e.id }, x, y, e, e.name, e.color);
      if (!s.execute('Chaise', addObject(s.activeLevelId!, chair))) throw new Error('refused');
      return chair.id as string;
    },
    { x, y },
  );
}

const pixel = (page: Page, id: string) => page.evaluate((id) => window.__planMaison3DProbe!.objectPixel!(id), id);

test('a bed in alert is tinted red in 3D, back to its colors when the alert is gone', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Alerte 3D');
  const bed = await roomWithBed(page);
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  await expect.poll(() => frames(page), LOAD).toBeGreaterThan(0);
  await page.getByTestId('preset-top').click();
  await settle(page);

  // no alert: the blue duvet at the center of the bed
  const [r0, g0, b0] = (await pixel(page, bed))!;
  expect(b0, `${r0} ${g0} ${b0}`).toBeGreaterThan(r0 + 20);

  // a chair on the foot of the bed: collision, an error on both
  const chair = await addChairOn(page, 200, 270);
  await expect
    .poll(async () => {
      const [r, g, b] = (await pixel(page, bed))!;
      return r > b + 20 && r > g + 30;
    }, LOAD)
    .toBe(true);
  const [r1, g1, b1] = (await pixel(page, bed))!;
  // the duvet mixed 50 % with #cf2e2e (lit): red clearly over blue
  expect(r1, `${r1} ${g1} ${b1}`).toBeGreaterThan(b1 + 20);

  // the chair removed: no alert, the duvet is blue again
  await page.evaluate(
    async ({ chair }) => {
      const { deleteObjects } = await import(/* @vite-ignore */ '/src/core/commands/objects.ts' as string);
      const s = window.__planMaison!.store.getState();
      if (!s.execute('Supprimer', deleteObjects(s.activeLevelId!, [chair]))) throw new Error('refused');
    },
    { chair },
  );
  await expect
    .poll(async () => {
      const [r, , b] = (await pixel(page, bed))!;
      return b > r + 20;
    }, LOAD)
    .toBe(true);
  expect(errors).toEqual([]);
});

test('object names: shown over the furniture, hidden by "Noms des objets"', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Étiquettes 3D');
  await roomWithBed(page);
  await addChairOn(page, 80, 80);
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  const labels = page.locator('.label3d');
  await expect(labels.filter({ visible: true })).toHaveCount(2, LOAD);
  await expect(labels.filter({ hasText: 'Lit 160' })).toBeVisible();
  await expect(labels.filter({ hasText: 'Chaise' })).toBeVisible();
  // the pill of spec 8.2: white, #2438a0 border and text
  const style = await labels.first().evaluate((el) => {
    const c = getComputedStyle(el);
    return { color: c.color, border: c.borderTopColor, radius: c.borderTopLeftRadius };
  });
  expect(style.color).toBe('rgb(36, 56, 160)');
  expect(style.border).toBe('rgb(36, 56, 160)');

  await page.getByText('Noms des objets').click();
  await expect(labels.filter({ visible: true })).toHaveCount(0, LOAD);
  await page.getByText('Noms des objets').click();
  await expect(labels.filter({ visible: true })).toHaveCount(2, LOAD);

  // the labels follow the objects: a removed object loses its label
  await page.evaluate(async () => {
    const { deleteObjects } = await import(/* @vite-ignore */ '/src/core/commands/objects.ts' as string);
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    const chair = Object.values(level.objects).find((o) => o.name === 'Chaise')!;
    if (!s.execute('Supprimer', deleteObjects(s.activeLevelId!, [chair.id]))) throw new Error('refused');
  });
  await expect(labels).toHaveCount(1, LOAD);
  // leaving the 3D view removes the label layer
  await page.getByTestId('view-plan').click();
  await expect(labels).toHaveCount(0);
  expect(errors).toEqual([]);
});
