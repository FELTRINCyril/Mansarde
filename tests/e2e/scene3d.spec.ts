import { expect, test, type Page } from '@playwright/test';
import { buildAttic } from './attic';
import { createProject } from './helpers';

test.setTimeout(120_000);
// a smaller view: software WebGL draws every pixel on the CPU
test.use({ viewport: { width: 1100, height: 700 } });

/*
 * The 3D view (task 11): opened from the view switch on the attic room, presets, render on demand,
 * Plan + 3D layout, release of the GPU resources, and the levels without rooms (review focus 4).
 * window.__planMaison3D (DEV) gives the counters of src/scene3d (scene3dStats).
 */

/** Collects console errors and uncaught page errors. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

const stats = (page: Page) => page.evaluate(() => ({ ...window.__planMaison3D! }));

/** Waits until the 3D view stopped rendering (render on demand): no new frame for 1.2 s. */
async function settle(page: Page): Promise<number> {
  let last = -1;
  let still = 0;
  // the damping of the orbit lasts about 100 frames, and software WebGL on a loaded machine draws
  // only a few frames per second
  for (let i = 0; i < 100; i++) {
    const { frames } = await stats(page);
    still = frames === last ? still + 1 : 0;
    if (still === 2) return frames;
    last = frames;
    await page.waitForTimeout(600);
  }
  throw new Error('the 3D view never stops rendering');
}

/**
 * The first opening loads src/scene3d on demand: with the whole suite running in parallel, the dev
 * server may take more than the default 5 s to serve it ("Chargement de la 3D..." meanwhile).
 */
const LOAD = { timeout: 30_000 };

async function open3d(page: Page): Promise<void> {
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  await expect.poll(async () => (await stats(page)).frames, LOAD).toBeGreaterThan(0);
}

test('3d view of the attic room: canvas, presets, render on demand, no console error', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Chambre sous les toits');
  await buildAttic(page);
  await open3d(page);
  await expect(page.getByTestId('view-3d')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('plan-pane')).toBeHidden();
  const { builds } = await stats(page);
  expect(builds).toBeGreaterThanOrEqual(1);

  // render on demand: nothing is drawn while nothing moves
  const idle = await settle(page);
  await page.waitForTimeout(500);
  expect((await stats(page)).frames).toBe(idle);

  // each preset animates (several frames) then stops on its pose: top above the room, room at eye
  // height (1.60 m) inside it, overview back above and outside the room
  const checks: Record<string, (c: number[]) => boolean> = {
    top: (c) => c[1]! > 9,
    room: (c) => Math.abs(c[1]! - 1.6) < 1e-6 && c[0]! > 0 && c[0]! < 4 && c[2]! > 0 && c[2]! < 4,
    overview: (c) => c[1]! > 4 && c[0]! < 0 && c[2]! > 4,
  };
  // a room is selected for the room preset
  await page.evaluate(async () => {
    const { deriveLevel } = await import(/* @vite-ignore */ '/src/core/geometry/derived.ts' as string);
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    s.setSelection([{ kind: 'room', id: deriveLevel(level).rooms[0].key }]);
  });
  for (const p of ['top', 'room', 'overview']) {
    const before = await settle(page);
    await page.getByTestId(`preset-${p}`).click();
    await expect.poll(async () => (await stats(page)).frames, LOAD).toBeGreaterThan(before + 1);
    await settle(page);
    expect(checks[p]!((await stats(page)).camera), `${p}: ${(await stats(page)).camera}`).toBe(true);
  }

  // an orbit gesture renders, then the damping stops
  const box = (await page.getByTestId('scene3d-canvas').boundingBox())!;
  const before = await settle(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  expect((await stats(page)).frames).toBeGreaterThan(before);
  await settle(page);

  // hiding the walls draws a new frame without rebuilding the level
  const shown = await settle(page);
  await page.getByTestId('hide-walls-3d').check();
  await expect.poll(async () => (await stats(page)).frames, LOAD).toBeGreaterThan(shown);
  await settle(page);
  expect((await stats(page)).builds).toBe(builds);
  expect(errors).toEqual([]);
});

test('3d view on empty and open-wall levels', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Vide');
  // empty level
  await open3d(page);
  await settle(page);
  // two open walls (no room), then a window in one of them
  await page.evaluate(async () => {
    const { addWallChain } = await import(/* @vite-ignore */ '/src/core/commands/walls.ts' as string);
    const s = window.__planMaison!.store.getState();
    const free = (pts: number[][]) => pts.map(([x, y]) => ({ kind: 'free', x, y }));
    if (!s.execute('Murs', addWallChain(s.activeLevelId!, free([[0, 0], [300, 0], [300, 200]]), 20, 250))) throw new Error('refused');
  });
  await expect.poll(async () => (await stats(page)).builds, LOAD).toBeGreaterThanOrEqual(2);
  await settle(page);
  // a second, empty level above, with the lower levels shown
  await page.evaluate(async () => {
    const { addLevel } = await import(/* @vite-ignore */ '/src/core/commands/levels.ts' as string);
    const s = window.__planMaison!.store.getState();
    const out = { levelId: '' };
    if (!s.execute('Niveau', addLevel(s.activeLevelId!, 'above', 'Étage', out))) throw new Error('refused');
    window.__planMaison!.store.getState().setActiveLevel(out.levelId);
  });
  await page.getByText('Afficher les niveaux inférieurs').click();
  for (const p of ['top', 'room', 'overview']) await page.getByTestId(`preset-${p}`).click();
  await settle(page);
  await expect(page.getByTestId('scene3d-error')).toHaveCount(0);
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Plan + 3D, separator, then Plan: the canvas is removed and its resources released', async ({ page }) => {
  const errors = watchErrors(page);
  await createProject(page, 'Côte à côte');
  await buildAttic(page);
  await page.getByTestId('view-split').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  const plan = page.getByTestId('plan-pane');
  const center = (await page.locator('.editor-center').boundingBox())!;
  const w0 = (await plan.boundingBox())!.width;
  expect(w0).toBeCloseTo(center.width / 2, -1);
  // drag the separator to 30 % of the center
  const handle = (await page.getByTestId('split-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(center.x + center.width * 0.3, handle.y + handle.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await plan.boundingBox())!.width, LOAD).toBeLessThan(w0 - 100);
  expect(await page.evaluate(() => window.__planMaison!.store.getState().display.splitRatio)).toBeCloseTo(0.3, 1);
  await expect.poll(async () => (await stats(page)).live, LOAD).toBe(1);

  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('scene3d-canvas')).toHaveCount(0);
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  const after = await stats(page);
  expect(after.live).toBe(0);
  // nothing of ours is left: three.js only keeps its own shared DFG_LUT texture (see scene3dStats)
  expect(after.lastDisposed).toEqual({ geometries: 0, textures: 1 });
  // the choice is kept: back to Plan + 3D gives a fresh view
  await page.getByTestId('view-split').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  await expect.poll(async () => (await stats(page)).live, LOAD).toBe(1);
  expect(errors).toEqual([]);
});

test('without WebGL: a message in the 3D view, the plan keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  const errors = watchErrors(page);
  await createProject(page, 'Sans WebGL');
  await page.getByTestId('view-split').click();
  await expect(page.getByTestId('scene3d-unavailable')).toHaveText("La 3D n'est pas disponible sur ce navigateur.", LOAD);
  await expect(page.getByTestId('scene3d-canvas')).toHaveCount(0);
  // the plan still works
  await buildAttic(page);
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await expect(page.locator('[data-kind="wall-shape"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('in the 3D layout, a catalog click still places the object at the center of the (hidden) plan view', async ({ page }) => {
  await createProject(page, 'Placement');
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  const center = await page.evaluate(({ w, h }) => {
    const v = window.__planMaison!.store.getState().view;
    return { x: (w / 2 - v.tx) / v.pxPerCm, y: (h / 2 - v.ty) / v.pxPerCm };
  }, { w: box.width, h: box.height });
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('plan-pane')).toBeHidden();
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  const o = await page.evaluate(() => Object.values(window.__planMaison!.store.getState().project!.levels[0]!.objects)[0]!);
  expect(o.x).toBeCloseTo(center.x, 0);
  expect(o.y).toBeCloseTo(center.y, 0);
});
