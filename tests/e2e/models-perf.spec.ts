import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

test.setTimeout(240_000);
test.use({ viewport: { width: 1100, height: 700 } });

/*
 * Performance budget of the downloaded models (spec 2026-10-13, section 10): a project of 60
 * different models stays under 600 draw calls and loads them all; the same count of parametric
 * furniture is measured alongside, for comparison (numbers in the decisions file). Frame times
 * are not asserted: the headless browser draws WebGL on the CPU.
 */

async function furnished(page: Page, pick: 'models' | 'builtin'): Promise<number> {
  await createProject(page, `Perf ${pick}`);
  return page.evaluate(async (pick) => {
    const mod = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const { addRectRoomInterior } = await mod('/src/core/commands/walls.ts');
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const { CATALOG } = await mod('/src/catalog/catalog.ts');
    const s = window.__planMaison!.store.getState();
    const L = s.activeLevelId!;
    s.execute('Pièce', addRectRoomInterior(L, { x: 0, y: 0 }, { x: 1600, y: 1300 }, 20, 300));
    const floor = (CATALOG as any[]).filter((e) => e.pose === 'floor' && e.category !== 'Structure' && (pick === 'models' ? !!e.model : !e.model && e.shape === 'symbol'));
    // 60 different entries (the parametric catalog has fewer: they repeat)
    const step = Math.max(1, Math.floor(floor.length / 60));
    for (let i = 0; i < 60; i++) {
      const e = floor[(i * step) % floor.length];
      const o = createObjectFromSize({ kind: 'catalog', catalogId: e.id }, 120 + (i % 10) * 150, 120 + Math.floor(i / 10) * 200, { width: Math.min(e.width, 130), depth: Math.min(e.depth, 150), height: e.height }, e.name, e.color, { pose: e.pose });
      s.execute('o', addObject(L, o));
    }
    s.setDisplay({ hideAlerts: true });
    return new Set(Array.from({ length: 60 }, (_, i) => floor[(i * step) % floor.length].id)).size;
  }, pick);
}

/** Opens the 3D view; returns the time until its canvas shows (ms). */
async function open3d(page: Page): Promise<number> {
  const t0 = Date.now();
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible({ timeout: 30_000 });
  return Date.now() - t0;
}

test('60 different downloaded models: draw calls under budget, all loaded', async ({ page }) => {
  const distinct = await furnished(page, 'models');
  expect(distinct).toBe(60);
  const t0 = Date.now();
  await open3d(page);
  await expect.poll(() => page.evaluate(() => window.__planMaison3D!.modelsLoaded), { timeout: 120_000 }).toBe(60);
  const loadMs = Date.now() - t0;
  await expect.poll(() => page.evaluate(() => window.__planMaison3D!.idle), { timeout: 60_000 }).toBe(true);
  const stats = await page.evaluate(() => ({ drawCalls: window.__planMaison3D!.drawCalls, triangles: window.__planMaison3D!.triangles, failed: window.__planMaison3D!.modelsFailed }));
  console.log(`models: ${JSON.stringify({ ...stats, loadMs })}`);
  expect(stats.failed).toBe(0);
  expect(stats.drawCalls).toBeLessThan(600);
});

test('60 parametric objects, for comparison', async ({ page }) => {
  await furnished(page, 'builtin');
  const loadMs = await open3d(page);
  await expect.poll(() => page.evaluate(() => window.__planMaison3D!.idle), { timeout: 60_000 }).toBe(true);
  const stats = await page.evaluate(() => ({ drawCalls: window.__planMaison3D!.drawCalls, triangles: window.__planMaison3D!.triangles }));
  console.log(`builtin: ${JSON.stringify({ ...stats, loadMs })}`);
});
