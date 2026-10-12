import { expect, test, type Page } from '@playwright/test';
import { createProject } from './helpers';

/*
 * Navigation in the plan and in the 3D view: a two-finger trackpad scroll pans, a pinch and a
 * mouse wheel zoom, a right drag pans, the arrows pan the view when nothing is selected.
 * page.mouse.wheel sends what Chromium sends for a wheel notch (wheelDeltaY = 120 per 100 px:
 * a mouse); a trackpad is mimicked by a synthetic WheelEvent carrying the legacy
 * wheelDeltaY = -3 x deltaY of Chrome and Safari on macOS, a pinch by a ctrlKey wheel.
 */

interface WheelInit { deltaX?: number; deltaY?: number; wheelDeltaX?: number; wheelDeltaY?: number; ctrlKey?: boolean; shiftKey?: boolean }

/** Dispatches wheel events on the element of a test id, at a point relative to its box (px). */
async function wheelOn(page: Page, testId: string, at: { x: number; y: number }, events: WheelInit[]): Promise<void> {
  await page.evaluate(
    ({ testId, at, events }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`)!;
      const r = el.getBoundingClientRect();
      for (const e of events) {
        el.dispatchEvent(new WheelEvent('wheel', { deltaMode: 0, clientX: r.left + at.x, clientY: r.top + at.y, bubbles: true, cancelable: true, ...e } as WheelEventInit));
      }
    },
    { testId, at, events },
  );
}

/** A trackpad scroll step (macOS Chrome / Safari: legacy wheelDelta = -3 x delta). */
const trackpad = (dx: number, dy: number): WheelInit => ({ deltaX: dx, deltaY: dy, wheelDeltaX: -3 * dx, wheelDeltaY: -3 * dy });

const view = (page: Page) => page.evaluate(() => window.__planMaison!.store.getState().view);
/** World point (cm) under a canvas point (px). */
const worldAt = (v: { pxPerCm: number; tx: number; ty: number }, p: { x: number; y: number }) => ({ x: (p.x - v.tx) / v.pxPerCm, y: (p.y - v.ty) / v.pxPerCm });

/** A 400 x 300 room and a box object (its id), the plan fitted and focused, nothing selected. */
async function roomAndBox(page: Page): Promise<string> {
  await createProject(page, 'Navigation');
  const id = await page.evaluate(async () => {
    const mod = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const { addRectRoom } = await mod('/src/core/commands/walls.ts');
    const { addObject } = await mod('/src/core/commands/objects.ts');
    const { createObjectFromSize } = await mod('/src/core/model/factory.ts');
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoom(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
    const o = createObjectFromSize({ kind: 'catalog', catalogId: 'x' }, 200, 150, { width: 50, depth: 40, height: 50 }, 'Caisse', '#ccc');
    s.execute('Caisse', addObject(s.activeLevelId!, o));
    s.setSelection([]);
    return o.id as string;
  });
  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('0');
  return id;
}

test.describe('plan', () => {
  test('a two-finger trackpad scroll pans on both axes and keeps the zoom', async ({ page }) => {
    await roomAndBox(page);
    const v0 = await view(page);
    await wheelOn(page, 'plan-canvas', { x: 300, y: 250 }, [trackpad(10, 20), trackpad(5, -4), trackpad(0, 12)]);
    const v1 = await view(page);
    expect(v1.pxPerCm).toBe(v0.pxPerCm);
    expect(v1.tx).toBeCloseTo(v0.tx - 15, 6);
    expect(v1.ty).toBeCloseTo(v0.ty - 28, 6);
  });

  test('a mouse wheel, Ctrl + wheel and a pinch zoom around the cursor', async ({ page }) => {
    await roomAndBox(page);
    const box = (await page.getByTestId('plan-canvas').boundingBox())!;
    const at = { x: 260, y: 210 };
    await page.mouse.move(box.x + at.x, box.y + at.y);

    let v0 = await view(page);
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => (await view(page)).pxPerCm).toBeGreaterThan(v0.pxPerCm);
    let v1 = await view(page);
    expect(worldAt(v1, at).x).toBeCloseTo(worldAt(v0, at).x, 6);
    expect(worldAt(v1, at).y).toBeCloseTo(worldAt(v0, at).y, 6);

    v0 = v1;
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 200);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await view(page)).pxPerCm).toBeLessThan(v0.pxPerCm);
    v1 = await view(page);
    expect(worldAt(v1, at).x).toBeCloseTo(worldAt(v0, at).x, 6);

    // pinch: a ctrlKey wheel with a small delta, zooms by about its scale (delta = -100 ln(scale))
    v0 = v1;
    await wheelOn(page, 'plan-canvas', at, [{ deltaY: -100 * Math.log(1.2), ctrlKey: true }]);
    v1 = await view(page);
    expect(v1.pxPerCm / v0.pxPerCm).toBeCloseTo(1.2, 6);
    expect(worldAt(v1, at).x).toBeCloseTo(worldAt(v0, at).x, 6);
    expect(worldAt(v1, at).y).toBeCloseTo(worldAt(v0, at).y, 6);

    // Safari: gesture events
    v0 = v1;
    await page.evaluate(({ at }) => {
      const el = document.querySelector('[data-testid="plan-canvas"]')!;
      const r = el.getBoundingClientRect();
      const g = (type: string, scale: number) =>
        el.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { scale, clientX: r.left + at.x, clientY: r.top + at.y }));
      g('gesturestart', 1);
      g('gesturechange', 1.1);
      g('gesturechange', 1.5);
      g('gestureend', 1.5);
    }, { at });
    v1 = await view(page);
    expect(v1.pxPerCm / v0.pxPerCm).toBeCloseTo(1.5, 6);
    expect(worldAt(v1, at).x).toBeCloseTo(worldAt(v0, at).x, 6);
  });

  test('Ctrl + mouse wheel (Control down) zooms at the wheel rate, a Chromium pinch (Control up) at the pinch rate (nav review M7)', async ({ page }) => {
    await roomAndBox(page);
    const at = { x: 260, y: 210 };
    // a slow macOS wheel notch with Control down, and a pinch as Chromium sends it (wheelDeltaY +-120)
    const notch = { deltaY: 4.000244140625, wheelDeltaY: -120, ctrlKey: true };
    let v0 = await view(page);
    await page.keyboard.down('Control');
    await wheelOn(page, 'plan-canvas', at, [notch]);
    await page.keyboard.up('Control');
    let v1 = await view(page);
    expect(v1.pxPerCm / v0.pxPerCm).toBeCloseTo(Math.exp(-4.000244140625 * 0.0015), 9);
    v0 = v1;
    await wheelOn(page, 'plan-canvas', at, [{ deltaY: -100 * Math.log(1.2), wheelDeltaY: 120, ctrlKey: true }]);
    v1 = await view(page);
    expect(v1.pxPerCm / v0.pxPerCm).toBeCloseTo(1.2, 6);
  });

  test('Shift + wheel pans sideways', async ({ page }) => {
    await roomAndBox(page);
    const box = (await page.getByTestId('plan-canvas').boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 200);
    const v0 = await view(page);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 100);
    await page.keyboard.up('Shift');
    await expect.poll(async () => (await view(page)).tx).not.toBe(v0.tx);
    const v1 = await view(page);
    expect(v1.pxPerCm).toBe(v0.pxPerCm);
    expect(v1.ty).toBe(v0.ty);
    expect(Math.abs(v1.tx - v0.tx)).toBeCloseTo(100, 6);
  });

  test('a right drag pans the view and leaves the tool alone', async ({ page }) => {
    await roomAndBox(page);
    const box = (await page.getByTestId('plan-canvas').boundingBox())!;
    const v0 = await view(page);
    // over the room: a left press would select it
    await page.mouse.move(box.x + 300, box.y + 250);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(box.x + 340, box.y + 220, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    const v1 = await view(page);
    expect(v1.pxPerCm).toBe(v0.pxPerCm);
    expect(v1.tx).toBeCloseTo(v0.tx + 40, 6);
    expect(v1.ty).toBeCloseTo(v0.ty - 30, 6);
    expect(await page.evaluate(() => window.__planMaison!.store.getState().selection)).toEqual([]);
    expect(await page.evaluate(() => window.__planMaison!.store.getState().history.past.length)).toBe(2);
  });

  test('the arrows pan the view with nothing selected, and nudge the selection otherwise', async ({ page }) => {
    const id = await roomAndBox(page);
    const v0 = await view(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const v1 = await view(page);
    expect(v1.pxPerCm).toBe(v0.pxPerCm);
    expect(v1.tx).toBeLessThan(v0.tx);
    expect(v1.ty).toBeLessThan(v0.ty);
    expect(v0.tx - v1.tx).toBeLessThan(v0.ty - v1.ty); // Shift: a bigger step

    await page.evaluate((id) => window.__planMaison!.store.getState().setSelection([{ kind: 'object', id }]), id);
    await page.keyboard.press('ArrowRight');
    expect(await view(page)).toEqual(v1);
    const x = await page.evaluate((id) => window.__planMaison!.store.getState().project!.levels[0]!.objects[id]!.x, id);
    expect(x).toBe(201);
  });

  test('the "?" shows the navigation help without touching the plan', async ({ page }) => {
    await roomAndBox(page);
    const hint = page.getByTestId('plan-navigation-hint');
    await hint.getByRole('button', { name: 'Aide à la navigation' }).click();
    await expect(hint).toContainText('Déplacer : deux doigts ou clic droit maintenu');
    await expect(hint).toContainText('Zoomer : pincer ou molette');
    expect(await page.evaluate(() => window.__planMaison!.store.getState().selection)).toEqual([]);
    await hint.getByRole('button', { name: 'Aide à la navigation' }).click();
    await expect(hint.getByRole('listitem')).toHaveCount(0);
  });
});

test.describe('3D view', () => {
  test.setTimeout(120_000);
  // a smaller view: software WebGL draws every pixel on the CPU
  test.use({ viewport: { width: 1100, height: 700 } });
  const LOAD = { timeout: 30_000 };

  /** Camera position and target once the damping has run out. */
  async function pose(page: Page): Promise<{ cam: number[]; tgt: number[]; dist: number }> {
    await expect.poll(() => page.evaluate(() => window.__planMaison3D!.idle), { timeout: 60_000 }).toBe(true);
    const { camera, target } = await page.evaluate(() => ({ camera: window.__planMaison3D!.camera, target: window.__planMaison3D!.target }));
    return { cam: camera, tgt: target, dist: Math.hypot(camera[0]! - target[0]!, camera[1]! - target[1]!, camera[2]! - target[2]!) };
  }
  const moved = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
  /**
   * A target "kept" may still move a little: the damping stops rendering while a residue of the
   * previous pan (mm) is left, applied at the next update. A pan moves it by far more (PANNED).
   */
  const KEPT = 0.03;
  const PANNED = 0.1;

  /** The room and its box (roomAndBox, the id of the box), shown in the 3D view or in Plan + 3D. */
  async function open3d(page: Page, mode: '3d' | 'split' = '3d'): Promise<string> {
    const id = await roomAndBox(page);
    await page.getByTestId(`view-${mode}`).click();
    await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
    await expect.poll(() => page.evaluate(() => window.__planMaison3D!.frames), LOAD).toBeGreaterThan(0);
    return id;
  }

  const boxAt = (page: Page, id: string) =>
    page.evaluate((id) => {
      const o = window.__planMaison!.store.getState().project!.levels[0]!.objects[id]!;
      return { x: o.x, y: o.y };
    }, id);
  const historyLength = (page: Page) => page.evaluate(() => window.__planMaison!.store.getState().history.past.length);

  test('a trackpad scroll moves the target, not the distance; a pinch and a wheel change the distance', async ({ page }) => {
    await open3d(page);
    const p0 = await pose(page);
    await wheelOn(page, 'scene3d-canvas', { x: 500, y: 350 }, [trackpad(8, 12), trackpad(8, 12), trackpad(4, 6)]);
    const p1 = await pose(page);
    expect(moved(p1.tgt, p0.tgt)).toBeGreaterThan(PANNED);
    expect(p1.dist).toBeCloseTo(p0.dist, 3);

    await wheelOn(page, 'scene3d-canvas', { x: 500, y: 350 }, [{ deltaY: -10, ctrlKey: true }]);
    const p2 = await pose(page);
    expect(p2.dist).toBeLessThan(p1.dist - 0.01);
    expect(moved(p2.tgt, p1.tgt)).toBeLessThan(KEPT);

    const box = (await page.getByTestId('scene3d-canvas').boundingBox())!;
    await page.mouse.move(box.x + 500, box.y + 350);
    await page.mouse.wheel(0, 200);
    const p3 = await pose(page);
    expect(p3.dist).toBeGreaterThan(p2.dist + 0.01);
    expect(moved(p3.tgt, p2.tgt)).toBeLessThan(KEPT);
  });

  test('Shift + drag and a right drag pan; a plain drag orbits around the same target', async ({ page }) => {
    await open3d(page);
    const box = (await page.getByTestId('scene3d-canvas').boundingBox())!;
    const drag = async (button: 'left' | 'right') => {
      await page.mouse.move(box.x + 500, box.y + 350);
      await page.mouse.down({ button });
      await page.mouse.move(box.x + 580, box.y + 320, { steps: 6 });
      await page.mouse.up({ button });
    };
    const p0 = await pose(page);
    await page.keyboard.down('Shift');
    await drag('left');
    await page.keyboard.up('Shift');
    const p1 = await pose(page);
    expect(moved(p1.tgt, p0.tgt)).toBeGreaterThan(PANNED);
    expect(p1.dist).toBeCloseTo(p0.dist, 3);

    await drag('right');
    const p2 = await pose(page);
    expect(moved(p2.tgt, p1.tgt)).toBeGreaterThan(PANNED);
    expect(p2.dist).toBeCloseTo(p1.dist, 3);

    await drag('left');
    const p3 = await pose(page);
    expect(moved(p3.tgt, p2.tgt)).toBeLessThan(KEPT);
    expect(moved(p3.cam, p2.cam)).toBeGreaterThan(PANNED);
  });

  test('in Plan + 3D the arrows pan the view that has the focus, and only that one', async ({ page }) => {
    await open3d(page, 'split');
    const canvas3d = page.getByTestId('scene3d-canvas');
    const p0 = await pose(page);
    const v0 = await view(page);
    await canvas3d.click({ position: { x: 20, y: 300 } });
    await expect(canvas3d).toBeFocused();
    const p1 = await pose(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    const p2 = await pose(page);
    expect(moved(p2.tgt, p1.tgt)).toBeGreaterThan(PANNED);
    expect(await view(page)).toEqual(v0);
    expect(moved(p1.tgt, p0.tgt)).toBeLessThan(KEPT); // the click itself does not move the camera

    await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('ArrowRight');
    expect((await view(page)).tx).toBeLessThan(v0.tx);
    const p3 = await pose(page);
    expect(moved(p3.tgt, p2.tgt)).toBeLessThan(KEPT);
  });

  test('in Plan + 3D, Space + drag over the plan pans it after a click in the 3D, and never moves the object under it (nav review I1)', async ({ page }) => {
    const id = await open3d(page, 'split');
    const canvas3d = page.getByTestId('scene3d-canvas');
    await canvas3d.click({ position: { x: 20, y: 300 } });
    await expect(canvas3d).toBeFocused();
    const v0 = await view(page);
    const past = await historyLength(page);
    const plan = (await page.getByTestId('plan-canvas').boundingBox())!;
    // the screen point of the box center (200, 150)
    const at = { x: plan.x + v0.tx + 200 * v0.pxPerCm, y: plan.y + v0.ty + 150 * v0.pxPerCm };
    await page.keyboard.down('Space');
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 60, at.y + 40, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    expect(await boxAt(page, id)).toEqual({ x: 200, y: 150 });
    expect(await historyLength(page)).toBe(past);
    const v1 = await view(page);
    expect(v1.pxPerCm).toBe(v0.pxPerCm);
    expect(v1.tx).toBeCloseTo(v0.tx + 60, 6);
    expect(v1.ty).toBeCloseTo(v0.ty + 40, 6);
  });

  test('with a selection, the arrows nudge it in the 3D view too; without one they move the camera (nav review M5)', async ({ page }) => {
    const id = await open3d(page, 'split');
    const canvas3d = page.getByTestId('scene3d-canvas');
    await canvas3d.click({ position: { x: 20, y: 300 } });
    await expect(canvas3d).toBeFocused();
    await page.evaluate((id) => window.__planMaison!.store.getState().setSelection([{ kind: 'object', id }]), id);
    const p0 = await pose(page);
    const v0 = await view(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => boxAt(page, id)).toEqual({ x: 201, y: 160 });
    const p1 = await pose(page);
    expect(moved(p1.tgt, p0.tgt)).toBeLessThan(KEPT);
    expect(moved(p1.cam, p0.cam)).toBeLessThan(KEPT);
    expect(await view(page)).toEqual(v0);
    // the 3D view alone: the same
    await page.getByTestId('view-3d').click();
    await canvas3d.click({ position: { x: 20, y: 300 } });
    await page.evaluate((id) => window.__planMaison!.store.getState().setSelection([{ kind: 'object', id }]), id);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => boxAt(page, id)).toEqual({ x: 200, y: 160 });
    // nothing selected: the camera moves, the box stays
    await page.evaluate(() => window.__planMaison!.store.getState().setSelection([]));
    const p2 = await pose(page);
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    const p3 = await pose(page);
    expect(moved(p3.tgt, p2.tgt)).toBeGreaterThan(PANNED);
    expect(await boxAt(page, id)).toEqual({ x: 200, y: 160 });
  });

  test('the 3D view has its navigation help', async ({ page }) => {
    await open3d(page);
    const hint = page.getByTestId('scene3d-navigation-hint');
    await hint.getByRole('button', { name: 'Aide à la navigation' }).click();
    await expect(hint).toContainText('Tourner : glisser');
    await expect(hint).toContainText('Déplacer : deux doigts, clic droit maintenu ou Maj + glisser');
    await expect(hint).toContainText('Zoomer : pincer ou molette');
  });
});
