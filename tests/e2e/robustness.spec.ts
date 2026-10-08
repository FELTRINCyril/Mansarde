import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

/*
 * Ruling R37: a plan whose geometry cannot be computed never blanks the app. The broken plans are
 * written straight into the project store, as a corrupted IndexedDB would hold them (an import
 * would refuse them).
 */

const projectItem = (page: Page, name: string) => page.getByTestId('project-item').filter({ hasText: name });

/** Draws the two chains of the plan reported in the final review (polygon-clipping alone throws on it). */
async function drawReportedPlan(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addWallChain } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    const free = (pts: number[][]) => pts.map(([x, y]) => ({ kind: 'free', x, y }));
    s.execute('Murs', addWallChain(s.activeLevelId!, free([[70, 310], [80, 530], [160, 350], [360, 230]]), 7, 250));
    s.execute('Murs', addWallChain(s.activeLevelId!, free([[370, 130], [500, 20], [480, 0], [500, 140]]), 20, 250));
  });
}

/**
 * Stores a copy of the project `source` named `name`, whose first wall lost its start node; with
 * `door`, a door is put on that wall, which makes the plan rendering itself throw.
 */
async function storeBrokenCopy(page: Page, source: string, name: string, door: boolean): Promise<void> {
  await page.evaluate(
    async ({ source, name, door }) => {
      const ps = window.__planMaison!.projectStore;
      const meta = (await ps.listProjects()).find((m) => m.name === source)!;
      const p = (await ps.getProject(meta.id))!;
      p.id = crypto.randomUUID();
      p.name = name;
      const level = p.levels[0]!;
      const wall = Object.values(level.walls)[0]!;
      wall.startNodeId = 'missing-node';
      if (door) {
        const id = crypto.randomUUID();
        level.openings[id] = {
          id, wallId: wall.id, kind: 'door', variant: 'single', offset: 50, width: 83, height: 204, sillHeight: 0, hinge: 'start', swing: 'left',
        };
      }
      await ps.saveProject(p);
    },
    { source, name, door },
  );
}

test('the reported plan is drawn, and broken plans neither blank the home screen nor the editor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await createProject(page, 'Exact');
  await drawReportedPlan(page);
  await expect(page.locator('[data-kind="wall-shape"]')).toHaveCount(1);
  await expect(page.getByTestId('geometry-degraded')).toHaveCount(0);
  await page.getByTestId('back-to-projects').click();
  await expect(projectItem(page, 'Exact')).toHaveCount(1);

  await storeBrokenCopy(page, 'Exact', 'Cassé', true);
  await storeBrokenCopy(page, 'Exact', 'Abîmé', false);
  await page.reload();

  // every project is listed; the thumbnail that cannot be drawn is replaced, the others are drawn
  await expect(page.getByTestId('project-item')).toHaveCount(3);
  await expect(page.getByTestId('app-error')).toHaveCount(0);
  await expect(projectItem(page, 'Cassé').getByTestId('project-thumb-error')).toHaveText('Aperçu indisponible');
  await expect(projectItem(page, 'Exact').locator('[data-testid="project-thumb"] svg')).toHaveCount(1);
  await expect(projectItem(page, 'Abîmé').locator('[data-testid="project-thumb"] svg')).toHaveCount(1);

  // a plan whose geometry is partly broken opens with the walls it can draw and the notice
  await projectItem(page, 'Abîmé').getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('geometry-degraded')).toHaveText('Géométrie complexe : affichage simplifié.');
  await expect(page.locator('[data-kind="wall-shape"][data-degraded="true"] path')).not.toHaveCount(0);
  await page.getByTestId('back-to-projects').click();

  // a plan that cannot be drawn at all: the editor stays usable and leads back to the projects
  await projectItem(page, 'Cassé').getByRole('button', { name: 'Ouvrir' }).click();
  const fallback = page.getByTestId('plan-error');
  await expect(fallback).toContainText('Le plan ne peut pas être affiché.');
  await expect(page.getByTestId('editor')).toBeVisible();
  await fallback.getByRole('button', { name: 'Retour aux projets' }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expect(page.getByTestId('project-item')).toHaveCount(3);
  // only the errors the boundaries caught (React reports them), nothing uncaught
  expect(errors).toEqual([]);
});
