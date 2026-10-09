/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { buildAttic } from './attic';
import { createProject, onPage } from './helpers';

// Visual check (spec 12): screenshots of the main screens for a human to look at. Skipped unless
// SHOT_DIR is set: SHOT_DIR=/tmp/shots E2E_PORT=5219 npx playwright test tests/e2e/visual.spec.ts
// The scenes are built through the dev handle (store.execute with core commands), like export.spec.

const SHOT_DIR = process.env.SHOT_DIR;
test.skip(!SHOT_DIR, 'visual check only (set SHOT_DIR)');
test.use({ viewport: { width: 1440, height: 900 } });

/** A 500 x 400 house: partition at x = 300, door in it, entrance door, two windows, furniture, labels, a manual dimension. */
async function furnishedHouse(page: Page) {
  await page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addRectRoom, addWallChain } = await mod('/src/core/commands/walls.ts');
    const { addOpening } = await mod('/src/core/commands/openings.ts');
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { addDimension } = await mod('/src/core/commands/dimensions.ts');
    const { renameRoom } = await mod('/src/core/commands/rooms.ts');
    const { deriveLevel } = await mod('/src/core/geometry/derived.ts');
    const { createOpening, createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const { getCatalogEntry } = await mod('/src/catalog/catalog.ts');
    const store = window.__planMaison!.store;
    const s = () => store.getState();
    const levelId = s().activeLevelId!;
    const level = () => s().project!.levels.find((l) => l.id === levelId)!;
    s().execute('Pièce', addRectRoom(levelId, { x: 0, y: 0 }, { x: 500, y: 400 }, 20, 250));
    s().execute('Cloison', addWallChain(levelId, [{ kind: 'free', x: 300, y: 0 }, { kind: 'free', x: 300, y: 400 }], 7, 250));
    /** The wall whose axis contains both points, and the offset of `at` along it. */
    const wallAt = (a: { x: number; y: number }, b: { x: number; y: number }, at: { x: number; y: number }) => {
      const l = level();
      for (const w of Object.values(l.walls)) {
        const p = l.nodes[w.startNodeId]!;
        const q = l.nodes[w.endNodeId]!;
        const on = (m: { x: number; y: number }) => Math.abs((q.x - p.x) * (m.y - p.y) - (q.y - p.y) * (m.x - p.x)) < 1e-6
          && Math.min(p.x, q.x) - 1e-6 <= m.x && m.x <= Math.max(p.x, q.x) + 1e-6 && Math.min(p.y, q.y) - 1e-6 <= m.y && m.y <= Math.max(p.y, q.y) + 1e-6;
        if (on(a) && on(b) && on(at)) return { id: w.id, offset: Math.hypot(at.x - p.x, at.y - p.y) };
      }
      throw new Error('no wall');
    };
    const opening = (kind: string, a: any, b: any, at: any, over: any = {}) => {
      const w = wallAt(a, b, at);
      s().execute('Ouverture', addOpening(levelId, createOpening(w.id, kind, w.offset, over)));
    };
    opening('door', { x: 300, y: 200 }, { x: 300, y: 390 }, { x: 300, y: 320 });
    opening('door', { x: 310, y: 400 }, { x: 490, y: 400 }, { x: 360, y: 400 });
    opening('window', { x: 310, y: 0 }, { x: 490, y: 0 }, { x: 400, y: 0 });
    opening('window', { x: 0, y: 150 }, { x: 0, y: 350 }, { x: 0, y: 260 });
    const place = (id: string, x: number, y: number, rotation = 0, name?: string, size?: any) => {
      const e = getCatalogEntry(id);
      const o = createObjectFromSize({ kind: 'catalog', catalogId: e.id }, x, y, size ?? e, name ?? e.name, e.color, { rotation });
      s().execute('Objet', addObject(levelId, o));
    };
    place('bed-160', 160, 110);
    place('nightstand', 57.5, 30);
    place('nightstand', 262.5, 30);
    place('generic-rect', 150, 360, 0, 'Piano', { width: 150, depth: 60, height: 100 });
    place('desk', 455, 200, 90);
    place('chair', 400, 200, 270);
    s().execute('Cote', addDimension(levelId, { kind: 'point', x: 0, y: 400 }, { kind: 'point', x: 300, y: 400 }, 110));
    const rooms = deriveLevel(level()).rooms;
    for (const r of rooms) {
      const name = r.labelPoint.x < 300 ? 'Chambre' : 'Bureau';
      s().execute('Nom', renameRoom(levelId, { label: r.label, labelPoint: r.labelPoint }, name));
    }
  });
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
}

const shot = (name: string) => `${SHOT_DIR}/${name}.png`;

test('visual: home, furnished plan, export dialog and pdf', async ({ page }) => {
  await createProject(page, "Maison d'été");
  await furnishedHouse(page);
  await page.screenshot({ path: shot('2-furnished-editor') });
  await page.getByTestId('plan-canvas').screenshot({ path: shot('3-furnished-canvas') });

  // zoom in on the bedroom (wheel around the bed), then far out
  const bed = await onPage(page, { x: 160, y: 110 });
  await page.mouse.move(bed.x, bed.y);
  await page.mouse.wheel(0, -600);
  await page.getByTestId('plan-canvas').screenshot({ path: shot('4-furnished-zoom-in') });
  // fixed zoom levels around the house (the view is set like the wheel would)
  for (const z of [0.6, 0.45, 0.3]) {
    await page.evaluate((z) => {
      const s = window.__planMaison!.store.getState();
      s.setView({ pxPerCm: z, tx: 300 - 250 * z, ty: 250 - 200 * z });
    }, z);
    const c = (await page.getByTestId('plan-canvas').boundingBox())!;
    await page.screenshot({ path: shot(`5-furnished-zoom-${z}`), clip: { x: c.x, y: c.y, width: 600, height: 500 } });
  }
  // close-ups (4 px per cm): the partition T-junction on the facade, the door in the partition
  for (const [name, at] of [['junction', { x: 300, y: 0 }], ['partition-door', { x: 300, y: 330 }], ['corner', { x: 500, y: 400 }]] as const) {
    await page.evaluate((at) => {
      const s = window.__planMaison!.store.getState();
      s.setView({ pxPerCm: 4, tx: 300 - at.x * 4, ty: 250 - at.y * 4 });
    }, at);
    const c = (await page.getByTestId('plan-canvas').boundingBox())!;
    await page.screenshot({ path: shot(`5-close-${name}`), clip: { x: c.x, y: c.y, width: 600, height: 500 } });
  }
  await page.keyboard.press('0');

  // a selected object with its handles and clearances (Tab)
  const piano = await onPage(page, { x: 150, y: 360 });
  await page.mouse.click(piano.x, piano.y);
  await page.keyboard.press('Tab');
  await page.screenshot({ path: shot('6-selected-object') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // a second project, then the home screen
  await page.getByTestId('back-to-projects').click();
  await createProject(page, 'Studio vide');
  await page.getByTestId('back-to-projects').click();
  await expect(page.getByTestId('project-item')).toHaveCount(2);
  await page.screenshot({ path: shot('1-home') });

  // export dialog and the scaled pdf
  await page.getByTestId('project-item').filter({ hasText: "Maison d'été" }).getByRole('button', { name: 'Ouvrir' }).click();
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-format-A4').click();
  await page.getByTestId('export-orientation-landscape').click();
  await page.getByTestId('export-scale-50').click();
  await page.screenshot({ path: shot('7-export-dialog') });
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  await pdf.saveAs(`${SHOT_DIR}/plan.pdf`);
  execFileSync('pdftoppm', ['-png', '-r', '100', `${SHOT_DIR}/plan.pdf`, `${SHOT_DIR}/8-pdf`]);
  // the same plan at 1/100 (read at 200 dpi: the size of a printed A4 seen closely)
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-scale-100').click();
  const [pdf100] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  await pdf100.saveAs(`${SHOT_DIR}/plan-100.pdf`);
  execFileSync('pdftoppm', ['-png', '-r', '200', '-x', '0', '-y', '0', '-W', '900', '-H', '700', `${SHOT_DIR}/plan-100.pdf`, `${SHOT_DIR}/8-pdf-100`]);
  await page.getByTestId('open-export').click();
  await page.getByTestId('export-tab-png').click();
  await page.getByTestId('export-resolution-1').click();
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-run').click()]);
  await png.saveAs(shot('9-export-png'));
});

test('visual: a traced background image', async ({ page }) => {
  await createProject(page, 'Décalque');
  await page.getByTestId('background-file').setInputFiles('tests/e2e/fixtures/plan.png');
  await expect(page.locator('image[data-kind=background]')).toHaveCount(1);
  // the rooms of the image, traced on top of it (image 800 x 600 px at 1 cm/px)
  await page.evaluate(async () => {
    const { addRectRoom } = await import(/* @vite-ignore */ '/src/core/commands/walls.ts' as string);
    const s = window.__planMaison!.store.getState();
    const bg = s.project!.levels[0]!.background!;
    const at = (x: number, y: number) => ({ x: bg.x + x * bg.scale, y: bg.y + y * bg.scale });
    s.execute('Pièce', addRectRoom(s.activeLevelId!, at(150, 100), at(650, 250), 20, 250));
  });
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
  await page.screenshot({ path: shot('10-background') });
  await page.getByTestId('background-calibrate').click();
  await page.screenshot({ path: shot('11-background-calibrate') });
});

test('visual: 3D view of the attic room (compare with plan-chambre 03-3d-overview and 04-3d-top)', async ({ page }) => {
  await createProject(page, 'Chambre sous les toits');
  await buildAttic(page);
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
  await page.getByTestId('plan-canvas').screenshot({ path: shot('11-attic-plan') });
  await page.getByTestId('view-3d').click();
  const canvas = page.getByTestId('scene3d-canvas');
  await expect(canvas).toBeVisible();
  /** Waits for the camera animation and the damping to end (no new frame for 600 ms). */
  const still = async () => {
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const frames = await page.evaluate(() => window.__planMaison3D!.frames);
      if (frames === last) return;
      last = frames;
      await page.waitForTimeout(600);
    }
  };
  await still();
  await page.screenshot({ path: shot('12-3d-editor') });
  await canvas.screenshot({ path: shot('13-3d-overview') });
  await page.getByTestId('preset-top').click();
  await still();
  await canvas.screenshot({ path: shot('14-3d-top') });
  await page.getByTestId('hide-walls-3d').check();
  await page.getByTestId('preset-overview').click();
  await still();
  await canvas.screenshot({ path: shot('15-3d-overview-walls-hidden') });
  await page.getByTestId('hide-walls-3d').uncheck();
  await page.getByTestId('view-plan').click();
  await page.getByTestId('view-split').click();
  await expect(canvas).toBeVisible();
  await still();
  await page.screenshot({ path: shot('16-split') });
  // from inside the room: the room selected by a click in the plan
  await page.getByTestId('view-3d').click();
  await page.evaluate(async () => {
    const { deriveLevel } = await import(/* @vite-ignore */ '/src/core/geometry/derived.ts' as string);
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    s.setSelection([{ kind: 'room', id: deriveLevel(level).rooms[0].key }]);
  });
  await page.getByTestId('preset-room').click();
  await still();
  await canvas.screenshot({ path: shot('17-3d-room') });
});
