import { expect, test, type Page } from '@playwright/test';
import { createProject, gridPointAt, moveTo, onPage, type Vec } from './helpers';

/*
 * Spec 7.1: the slope (T), beam (B) and cupboard (K) tools, the cupboard slid along its wall with
 * the selection tool, undo / redo.
 */

/** Room drawn by its inside a..a+400 x a..a+300 (wall axes 10 cm outside); returns a (world cm). */
async function drawRoom400x300(page: Page): Promise<Vec> {
  await page.keyboard.press('r');
  const a = await gridPointAt(page, 0.25, 0.25);
  const pa = await onPage(page, a);
  const pb = await onPage(page, { x: a.x + 150, y: a.y + 120 });
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await page.keyboard.press('4');
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await page.keyboard.type('00');
  await page.keyboard.press('Tab');
  await page.keyboard.type('300');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect.poll(() => counts(page).then((c) => c.walls)).toBe(4);
  return a;
}

async function clickAt(page: Page, w: Vec): Promise<void> {
  await moveTo(page, w);
  const p = await onPage(page, w);
  await page.mouse.click(p.x, p.y);
}

async function counts(page: Page): Promise<{ walls: number; slopes: number; beams: number; cupboards: number }> {
  return page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const l = s.project!.levels.find((x) => x.id === s.activeLevelId)!;
    return {
      walls: Object.keys(l.walls).length,
      slopes: Object.keys(l.slopes).length,
      beams: Object.keys(l.beams).length,
      cupboards: Object.keys(l.cupboards).length,
    };
  });
}

/** The single slope, beam or cupboard of the active level. */
async function only(page: Page, kind: 'slopes' | 'beams' | 'cupboards'): Promise<Record<string, unknown>> {
  return page.evaluate((k) => {
    const s = window.__planMaison!.store.getState();
    const l = s.project!.levels.find((x) => x.id === s.activeLevelId)!;
    return Object.values(l[k])[0] as unknown as Record<string, unknown>;
  }, kind);
}

test('slope typed 240 then 150, a beam, a cupboard slid along its wall, undo / redo', async ({ page }) => {
  await createProject(page, 'Combles');
  const a = await drawRoom400x300(page);
  const plan = page.getByTestId('plan-canvas');

  // slope: start line, side and depth, then the heights in the numeric field
  await page.keyboard.press('t');
  await expect(page.getByTestId('tool-slope')).toHaveAttribute('aria-pressed', 'true');
  await clickAt(page, { x: a.x + 50, y: a.y + 100 });
  await clickAt(page, { x: a.x + 350, y: a.y + 100 });
  await moveTo(page, { x: a.x + 200, y: a.y + 180 });
  await expect(plan.locator('[data-kind="slope-ghost"]')).toHaveCount(1);
  await clickAt(page, { x: a.x + 200, y: a.y + 180 });
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('250');
  await page.keyboard.type('240');
  await page.keyboard.press('Tab');
  await expect(input).toHaveValue('150');
  await page.keyboard.type('150');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
  await expect(plan.locator('[data-kind="slope"]')).toHaveCount(1);
  const slope = await only(page, 'slopes');
  expect(slope).toMatchObject({ a: { x: a.x + 50, y: a.y + 100 }, b: { x: a.x + 350, y: a.y + 100 }, side: 'left', heightStart: 240, heightEnd: 150 });
  expect(Math.abs((slope.depth as number) - 80)).toBeLessThanOrEqual(2);

  // beam: two clicks
  await page.keyboard.press('b');
  await clickAt(page, { x: a.x + 100, y: a.y + 250 });
  await clickAt(page, { x: a.x + 300, y: a.y + 250 });
  await expect(plan.locator('[data-kind="beam"]')).toHaveCount(1);
  expect(await only(page, 'beams')).toMatchObject({ a: { x: a.x + 100, y: a.y + 250 }, b: { x: a.x + 300, y: a.y + 250 }, width: 12, drop: 15 });

  // cupboard: hovering the top wall (axis 10 cm above the inside), on its inner half
  await page.keyboard.press('k');
  await moveTo(page, { x: a.x + 200, y: a.y - 6 });
  await expect(plan.locator('[data-kind="cupboard-ghost"]')).toHaveCount(1);
  await expect(plan.locator('[data-kind="cupboard-ghost"]')).not.toHaveAttribute('data-invalid', 'true');
  await clickAt(page, { x: a.x + 200, y: a.y - 6 });
  await expect(plan.locator('[data-kind="cupboard"]')).toHaveCount(1);
  const placed = await only(page, 'cupboards');
  expect(placed).toMatchObject({ width: 120, depth: 60, heightMode: 'ceiling' });
  expect(await counts(page)).toMatchObject({ slopes: 1, beams: 1, cupboards: 1 });

  // select it and slide it 100 cm to the left along the wall
  await page.keyboard.press('v');
  const from = await onPage(page, { x: a.x + 200, y: a.y + 30 });
  const to = await onPage(page, { x: a.x + 100, y: a.y + 30 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const moved = await only(page, 'cupboards');
  expect(moved.wallId).toBe(placed.wallId);
  expect(Math.abs(Math.abs((moved.offset as number) - (placed.offset as number)) - 100)).toBeLessThanOrEqual(1);

  // undo / redo: one entry for the slide
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await only(page, 'cupboards')).offset).toBe(placed.offset);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(async () => (await only(page, 'cupboards')).offset).toBe(moved.offset);
  // undo everything back to the room
  for (let i = 0; i < 4; i++) await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => counts(page)).toMatchObject({ walls: 4, slopes: 0, beams: 0, cupboards: 0 });
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => counts(page)).toMatchObject({ slopes: 1, beams: 0 });
});
