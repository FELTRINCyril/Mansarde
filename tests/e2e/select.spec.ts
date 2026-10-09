import { expect, test, type Page } from '@playwright/test';
import { createProject, onPage, type Vec } from './helpers';

/** A 400 x 300 room (wall axes) through the dev handle, then the view fitted on it with key 0. */
async function addRoom(page: Page) {
  await page.evaluate(async () => {
    const url = '/src/core/commands/walls.ts';
    const { addRectRoom } = await import(/* @vite-ignore */ url);
    const s = window.__planMaison!.store.getState();
    s.execute('Pièce', addRectRoom(s.activeLevelId!, { x: 0, y: 0 }, { x: 400, y: 300 }, 20, 250));
  });
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('0');
}

async function objects(page: Page): Promise<Array<{ id: string; x: number; y: number }>> {
  return page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const level = s.project!.levels.find((l) => l.id === s.activeLevelId)!;
    return Object.values(level.objects).map((o) => ({ id: o.id, x: o.x, y: o.y }));
  });
}

async function dragOnPage(page: Page, from: Vec, to: Vec) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 5, from.y + ((to.y - from.y) * i) / 5);
  await page.mouse.up();
}

test('selection tool: select, drag, undo, delete, rectangle, rename a room', async ({ page }) => {
  await createProject(page, 'Sélection');
  await addRoom(page);

  // a bed from the catalog lands at the view center (the room center) and is selected
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  await expect(page.locator('[data-kind="object"]')).toHaveCount(1);
  const [bed] = await objects(page);
  expect(bed!.x).toBeCloseTo(200, 0);
  expect(bed!.y).toBeCloseTo(150, 0);

  // click in the room (away from the bed) selects the room, a click on the bed selects it
  let p = await onPage(page, { x: 60, y: 150 });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('room-name')).toBeVisible();
  p = await onPage(page, { x: 200, y: 150 });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('object-width')).toHaveValue('90');
  await expect(page.locator('[data-kind="selected-object"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="handle-resize"]')).toHaveCount(8);
  await expect(page.locator('[data-kind="handle-rotate"]')).toHaveCount(1);

  // Escape closes a dialog without touching the selection behind it
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-dialog')).toHaveCount(0);
  await expect(page.getByTestId('object-width')).toHaveValue('90');

  // drag the bed: it moves (one history entry), undo puts it back
  await dragOnPage(page, await onPage(page, { x: 200, y: 150 }), await onPage(page, { x: 260, y: 170 }));
  const [moved] = await objects(page);
  expect(moved!.x).toBeCloseTo(260, 0);
  expect(moved!.y).toBeCloseTo(170, 0);
  await page.keyboard.press('ControlOrMeta+z');
  const [back] = await objects(page);
  expect(back!.x).toBeCloseTo(200, 0);
  expect(back!.y).toBeCloseTo(150, 0);

  // Delete removes the selected bed
  await page.keyboard.press('Delete');
  await expect(page.locator('[data-kind="object"]')).toHaveCount(0);

  // two beds, then a selection rectangle drawn from inside the room around both
  await page.evaluate(async () => {
    const url = '/src/editor/placeObject.ts';
    const { placeObjectAt } = await import(/* @vite-ignore */ url);
    const store = window.__planMaison!.store;
    placeObjectAt(store, 'catalog:bed-90', { x: 120, y: 150 });
    placeObjectAt(store, 'catalog:bed-90', { x: 280, y: 150 });
  });
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);
  await dragOnPage(page, await onPage(page, { x: 40, y: 30 }), await onPage(page, { x: 360, y: 270 }));
  await expect(page.getByTestId('selection-count')).toHaveText('2 éléments sélectionnés');

  // double-click in the room, type a name: the letters never reach the shortcuts (away from the
  // interior dimension texts, whose double-click edits the room size since V2)
  p = await onPage(page, { x: 200, y: 80 });
  await page.mouse.dblclick(p.x, p.y);
  const input = page.getByTestId('room-rename');
  await expect(input).toBeFocused();
  await page.keyboard.type('Mezz');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z'); // the field's own undo, not the plan's
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Mezzanine');
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-kind="room-label"]')).toContainText('Mezzanine');
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);

  // Escape in the field cancels
  await page.mouse.dblclick(p.x, p.y);
  await expect(input).toHaveValue('Mezzanine');
  await page.keyboard.type('Grenier');
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('Mezzanine');
});

test('keyboard: tool keys, nudge, copy and paste, duplicate', async ({ page }) => {
  await createProject(page, 'Clavier');
  await addRoom(page);
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  const [bed] = await objects(page);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  const [nudged] = await objects(page);
  expect(nudged!.x).toBeCloseTo(bed!.x + 1, 6);
  expect(nudged!.y).toBeCloseTo(bed!.y + 10, 6);

  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+d');
  await expect(page.locator('[data-kind="object"]')).toHaveCount(3);
  const xs = (await objects(page)).map((o) => o.x - nudged!.x).sort((a, b) => a - b);
  expect(xs.map((x) => Math.round(x))).toEqual([0, 20, 40]);

  await page.keyboard.press('m');
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
});

test('interrupted drags commit nothing; shortcuts work after a checkbox; rename kept on tool change', async ({ page }) => {
  await createProject(page, 'Interruptions');
  await addRoom(page);
  await page.getByTestId('catalog-item-catalog-bed-90').click();
  const [bed] = await objects(page);
  const entries = () => page.evaluate(() => window.__planMaison!.store.getState().history.past.length);
  const before = await entries();
  const center = await onPage(page, { x: bed!.x, y: bed!.y });
  const press = async () => {
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(center.x + i * 15, center.y);
    const [moving] = await objects(page);
    expect(moving!.x).toBeGreaterThan(bed!.x + 10);
  };
  const expectUnmoved = async () => {
    const [o] = await objects(page);
    expect(o!.x).toBeCloseTo(bed!.x, 6);
    expect(await entries()).toBe(before);
    expect(await page.evaluate(() => window.__planMaison!.store.getState().gesture)).toBeNull();
  };

  // pointercancel (touch / system interruption): the drag is abandoned; Chromium gives the mouse pointerId 1
  await press();
  await page.getByTestId('plan-canvas').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
  await expectUnmoved();
  await page.mouse.move(center.x + 100, center.y);
  await page.mouse.up();
  await expectUnmoved();

  // the window loses the focus during the drag
  await press();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expectUnmoved();
  await page.mouse.up();
  await expectUnmoved();

  // Cmd/Ctrl+Z during the drag cancels the drag only, the bed placement stays
  await press();
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.up();
  await expectUnmoved();
  await expect(page.locator('[data-kind="object"]')).toHaveCount(1);

  // a focused checkbox does not swallow the shortcuts
  await page.getByRole('checkbox', { name: 'Grille' }).click();
  await expect(page.getByRole('checkbox', { name: 'Grille' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-kind="object"]')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Grille' }).click();

  // a name typed in the room field is kept when a tool button is clicked
  const p = await onPage(page, { x: 200, y: 60 });
  await page.mouse.dblclick(p.x, p.y);
  await page.keyboard.type('Bureau');
  await page.getByTestId('tool-wall').click();
  await expect(page.getByTestId('room-rename')).toHaveCount(0);
  await expect(page.locator('[data-kind="room-label"]')).toContainText('Bureau');
});
