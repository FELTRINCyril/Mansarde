/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createProject, gridPointAt, moveTo, onPage, type Vec } from './helpers';

/*
 * Success criterion of the V2 spec (section 1, Task 14): the attic bedroom of plan-chambre built
 * and furnished like a user would (tool keys, clicks, typed values, Tab, properties panel, catalog,
 * checks panel, view switch). window.__planMaison (and the 3D probe) are only read, to check the
 * resulting state and to know where the bed is drawn in the 3D view.
 *
 * With SHOT_DIR set, the journey also saves the screenshots of the global visual check (plan,
 * checks panel, 3D overview / top / room) in that folder; without it, it takes none.
 */

test.setTimeout(240_000);
// a moderate view: software WebGL draws every pixel of the 3D view on the CPU
test.use({ viewport: { width: 1280, height: 800 } });

const LOAD = { timeout: 30_000 };
const plus = (a: Vec, x: number, y: number): Vec => ({ x: a.x + x, y: a.y + y });

type Level = {
  height: number;
  walls: Record<string, unknown>;
  slopes: Record<string, { a: Vec; b: Vec; side: string; depth: number; heightStart: number; heightEnd: number }>;
  beams: Record<string, { a: Vec; b: Vec; mode: string; bottom: number; width: number; drop: number }>;
  cupboards: Record<string, { wallId: string; width: number; heightMode: string }>;
  openings: Record<string, { kind: string }>;
  objects: Record<string, { id: string; name: string; x: number; y: number; width: number; depth: number; height: number; rotation: number; elevation: number; pose: string }>;
};

async function state(page: Page) {
  return page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const p = s.project!;
    return { project: p, level: p.levels.find((l) => l.id === s.activeLevelId)! as unknown as Level, selection: s.selection };
  });
}

/** The object of the active level with that name. */
async function objectNamed(page: Page, name: string) {
  const o = Object.values((await state(page)).level.objects).find((x) => x.name === name);
  expect(o, `object ${name}`).toBeDefined();
  return o!;
}

async function clickAt(page: Page, w: Vec): Promise<void> {
  await moveTo(page, w);
  const p = await onPage(page, w);
  await page.mouse.click(p.x, p.y);
}

/** Drags a catalog item onto the plan at a world point (cm); the new object gets selected. */
async function dropFromCatalog(page: Page, catalogId: string, at: Vec): Promise<void> {
  const item = page.getByTestId(`catalog-item-catalog-${catalogId}`);
  const canvas = page.getByTestId('plan-canvas');
  const box = (await canvas.boundingBox())!;
  const p = await onPage(page, at);
  await item.dragTo(canvas, { targetPosition: { x: p.x - box.x, y: p.y - box.y } });
  await expect(page.getByTestId('object-name')).toBeVisible();
}

/** Types a value in a properties field, then Enter. */
async function setField(page: Page, testId: string, value: string): Promise<void> {
  const f = page.getByTestId(testId);
  await f.fill(value);
  await f.press('Enter');
  await expect(f).toHaveValue(value);
}

/** Drags with the selection tool from one world point to another. */
async function drag(page: Page, from: Vec, to: Vec): Promise<void> {
  const a = await onPage(page, from);
  const b = await onPage(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
}

/** Opens a catalog group by its title when it is folded. */
async function openGroup(page: Page, title: string): Promise<void> {
  const head = page.locator('.catalog-group-head').filter({ hasText: title });
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
}

const stats = (page: Page) => page.evaluate(() => ({ ...window.__planMaison3D! }));

/** Waits until the 3D view stopped rendering (scene3dStats.idle: no frame scheduled). */
async function settle(page: Page): Promise<void> {
  await expect.poll(async () => (await stats(page)).idle, { timeout: 60_000, message: 'the 3D view never stops rendering' }).toBe(true);
}

/** A click on an empty corner of the plan: the focus leaves the panel, the selection is cleared. */
async function backToPlan(page: Page): Promise<void> {
  await page.getByTestId('plan-canvas').click({ position: { x: 3, y: 3 } });
  await expect.poll(async () => (await state(page)).selection).toEqual([]);
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.SHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/attic-${name}.png` });
}

async function download(page: Page, testInfo: TestInfo, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const file = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), bytes: await readFile(file) };
}

/** Ceiling (cm) at x (room coordinates) under the slope of plan-chambre: 240 at 197, 150 at 400. */
const slopeCeiling = (x: number) => 240 - ((x - 197) * 90) / 203;
const meters = (cm: number) => `${(cm / 100).toFixed(2).replace('.', ',')} m`;

test('attic journey: the plan-chambre bedroom drawn, furnished, checked, seen in 3D, reloaded and exported', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await createProject(page, 'Chambre sous les toits');
  const rows = page.getByTestId('check-row');

  // ===== ceiling 2,40 m for the level (nothing selected: the level properties) =====
  await setField(page, 'level-height', '240');
  expect((await state(page)).level.height).toBe(240);
  await backToPlan(page);

  // ===== a 400 x 400 room by its inside, with R: drag, then 400 Tab 400 Enter =====
  await page.keyboard.press('r');
  await expect(page.getByTestId('tool-rect')).toHaveAttribute('aria-pressed', 'true');
  const a = await gridPointAt(page, 0.3, 0.2); // inner top-left corner
  const pa = await onPage(page, a);
  const pb = await onPage(page, plus(a, 150, 150));
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move(pb.x, pb.y, { steps: 3 });
  await page.keyboard.press('4');
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toBeFocused();
  await page.keyboard.type('00');
  await page.keyboard.press('Tab');
  await page.keyboard.type('400');
  await page.keyboard.press('Enter');
  await page.mouse.up();
  await expect(page.locator('[data-kind="room-label"]')).toContainText('16,00 m²');
  expect(Object.keys((await state(page)).level.walls)).toHaveLength(4);
  // the whole room in view
  await page.keyboard.press('v');
  await page.keyboard.press('0');
  const w = (x: number, y: number) => plus(a, x, y); // room coordinates: inside = 0..400

  // ===== the slope: start line on x = 197, down to the right wall, 240 Tab 150 Enter =====
  await page.keyboard.press('t');
  await expect(page.getByTestId('tool-slope')).toHaveAttribute('aria-pressed', 'true');
  // Alt held: no magnetism, 197 is off the grid
  await page.keyboard.down('Alt');
  // from the outer face of the top wall to the outer face of the bottom wall: the whole room
  await clickAt(page, w(197, -20));
  await clickAt(page, w(197, 420));
  await page.keyboard.up('Alt'); // the depth is rounded to the cm
  await moveTo(page, w(330, 200));
  await expect(page.locator('[data-kind="slope-ghost"]')).toHaveCount(1);
  await clickAt(page, w(400, 200));
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('240'); // the ceiling of the level
  await page.keyboard.type('240');
  await page.keyboard.press('Tab');
  await page.keyboard.type('150');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
  let slope = Object.values((await state(page)).level.slopes)[0]!;
  expect(slope).toMatchObject({ side: expect.any(String), heightStart: 240, heightEnd: 150 });
  expect(Math.abs(slope.a.x - (a.x + 197))).toBeLessThan(1);
  expect(Math.abs(slope.b.x - (a.x + 197))).toBeLessThan(1);
  expect(slope.depth).toBe(203); // to the right wall face
  // the slope panel shows it
  await page.keyboard.press('v');
  await clickAt(page, w(197, 120));
  await expect(page.getByTestId('properties-panel').getByRole('heading', { name: 'Pente' })).toBeVisible();
  await expect(page.getByTestId('slope-height-start')).toHaveValue('240');
  await expect(page.getByTestId('slope-height-end')).toHaveValue('150');
  await expect(page.getByTestId('slope-depth')).toHaveValue('203');
  await page.keyboard.press('Escape');

  // ===== the beam along the slope start, x 185..197, fixed with its underside at 2,25 m =====
  await page.keyboard.press('b');
  await expect(page.getByTestId('tool-beam')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.down('Alt');
  await clickAt(page, w(191, 0));
  await clickAt(page, w(191, 400));
  await page.keyboard.up('Alt');
  await expect(page.locator('[data-kind="beam"]')).toHaveCount(1);
  await page.keyboard.press('v');
  await clickAt(page, w(188, 250));
  await expect(page.getByTestId('properties-panel').getByRole('heading', { name: 'Poutre' })).toBeVisible();
  await page.getByTestId('beam-mode').selectOption('fixed');
  await setField(page, 'beam-bottom', '225');
  const beam = Object.values((await state(page)).level.beams)[0]!;
  expect(beam).toMatchObject({ mode: 'fixed', bottom: 225, width: 12, drop: 15 });
  expect(Math.abs(beam.a.x - (a.x + 191))).toBeLessThan(1);
  await backToPlan(page);

  // ===== a cupboard up to the ceiling against the low (right) wall =====
  await page.keyboard.press('k');
  await expect(page.getByTestId('tool-cupboard')).toHaveAttribute('aria-pressed', 'true');
  await moveTo(page, w(406, 200)); // the inner half of the right wall (axis at 410)
  await expect(page.locator('[data-kind="cupboard-ghost"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="cupboard-ghost"]')).not.toHaveAttribute('data-invalid', 'true');
  await clickAt(page, w(406, 200));
  await expect(page.locator('[data-kind="cupboard"]')).toHaveCount(1);
  expect(Object.values((await state(page)).level.cupboards)[0]).toMatchObject({ width: 120, heightMode: 'ceiling' });

  // ===== the window in the top wall, the door in the left wall near the bottom corner =====
  await page.keyboard.press('f');
  await moveTo(page, w(115, -6));
  await expect(page.locator('[data-kind="opening-ghost"]')).toHaveCount(1);
  await clickAt(page, w(115, -6));
  await page.keyboard.press('p');
  await moveTo(page, w(-6, 345));
  await expect(page.locator('[data-kind="opening-ghost"]')).toHaveCount(1);
  await clickAt(page, w(-6, 345));
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  expect(Object.values((await state(page)).level.openings).map((o) => o.kind).sort()).toEqual(['door', 'window']);

  // ===== furniture from the catalog =====
  // a 140 bed against the top wall, named "Lit"
  await dropFromCatalog(page, 'bed-140', w(200, 97));
  await setField(page, 'object-name', 'Lit');
  // the rug under the bed
  await openGroup(page, 'Séjour');
  await dropFromCatalog(page, 'rug-rect', w(200, 200)); // half under the foot of the bed
  await expect(page.getByTestId('object-pose')).toHaveValue('covering');
  // drawn under the bed: a click where both lie picks the bed, below it the rug
  await clickAt(page, w(200, 165));
  await expect(page.getByTestId('object-name')).toHaveValue('Lit');
  await clickAt(page, w(200, 240));
  await expect(page.getByTestId('object-name')).toHaveValue('Tapis');
  // the desk against the left wall (turned to face the room), its chair tucked in front
  await openGroup(page, 'Bureau et repas');
  await dropFromCatalog(page, 'desk', w(70, 180));
  await setField(page, 'object-rotation', '270');
  await drag(page, w(70, 180), w(36, 180)); // pulled against the wall face
  let desk = await objectNamed(page, 'Bureau');
  expect(desk.x - 35).toBeCloseTo(a.x, 6);
  await dropFromCatalog(page, 'chair', w(85, 180));
  await setField(page, 'object-rotation', '90');
  // the wardrobe 100 x 60 x 200 under the slope, against the bottom wall
  await dropFromCatalog(page, 'wardrobe', w(340, 368));
  await setField(page, 'object-width', '100');
  await setField(page, 'object-rotation', '180');
  // the TV unit against the bottom wall, the TV put on it
  await dropFromCatalog(page, 'tv-unit', w(180, 376));
  await setField(page, 'object-rotation', '180');
  await dropFromCatalog(page, 'tv', w(180, 377));
  await expect(page.getByTestId('object-pose')).toHaveValue('onTop');
  await expect(page.getByTestId('object-elevation')).toHaveValue('50'); // on the TV unit
  await setField(page, 'object-rotation', '180');
  await backToPlan(page);

  // ===== checks: the wardrobe is too tall under the slope, nothing else =====
  const wardrobe = await objectNamed(page, 'Armoire');
  expect(wardrobe).toMatchObject({ width: 100, depth: 60, height: 200, rotation: 180 });
  expect(wardrobe.y + 30).toBeCloseTo(a.y + 400, 6); // against the bottom wall face
  // the lowest ceiling over its footprint: at its right edge, under the slope as drawn
  const ceiling = slope.heightStart - ((wardrobe.x + 50 - slope.a.x) * (slope.heightStart - slope.heightEnd)) / slope.depth;
  expect(Math.abs(ceiling - slopeCeiling(wardrobe.x + 50 - a.x))).toBeLessThan(0.5);
  expect(ceiling).toBeLessThan(200);
  await expect(page.getByTestId('alert-counter')).toHaveText('1 alerte');
  await page.getByTestId('alert-counter').click();
  await expect(rows.locator('.check-message')).toHaveText([`Armoire : monte à 2,00 m, plafond à ${meters(ceiling)} à cet endroit.`]);
  await expect(rows.first()).toHaveAttribute('data-severity', 'error');
  await expect(page.locator('[data-kind="alert"]')).toHaveCount(1);
  expect(await objectNamed(page, 'TV')).toMatchObject({ pose: 'onTop', elevation: 50 });
  await shot(page, 'plan');

  // ===== the desk put on the bed: they overlap; undo puts it back =====
  desk = await objectNamed(page, 'Bureau');
  await drag(page, { x: desk.x, y: desk.y }, w(200, 100));
  await expect(page.getByTestId('alert-counter')).toHaveText('2 alertes');
  await expect(rows.filter({ hasText: 'Lit et Bureau se chevauchent.' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Lit et Bureau se chevauchent.' })).toHaveAttribute('data-severity', 'error');
  // the rug under the bed and the TV on its unit raise nothing
  await expect(rows.filter({ hasText: /Tapis|TV/ })).toHaveCount(0);
  await shot(page, 'checks');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('alert-counter')).toHaveText('1 alerte');
  expect((await objectNamed(page, 'Bureau')).x).toBeCloseTo(desk.x, 6);
  await page.keyboard.press('Escape');

  // ===== 3D: opened from the view switch; a click on the bed selects it =====
  const bed = await objectNamed(page, 'Lit');
  // the world point at the center of the full width plan (for Plan + 3D below)
  const planBox = (await page.getByTestId('plan-canvas').boundingBox())!;
  const planCenterWorld = await page.evaluate(
    ({ w, h }) => {
      const v = window.__planMaison!.store.getState().view;
      return { x: (w / 2 - v.tx) / v.pxPerCm, y: (h / 2 - v.ty) / v.pxPerCm };
    },
    { w: planBox.width, h: planBox.height },
  );
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible(LOAD);
  await expect.poll(async () => (await stats(page)).frames, LOAD).toBeGreaterThan(0);
  await settle(page);
  await shot(page, '3d-overview');
  await page.getByTestId('preset-top').click();
  await settle(page);
  await shot(page, '3d-top');
  const at = await page.evaluate((id) => window.__planMaison3DProbe!.objectScreen!(id), bed.id);
  expect(at, 'the bed is on screen').not.toBeNull();
  const box3d = (await page.getByTestId('scene3d-canvas').boundingBox())!;
  await page.mouse.click(box3d.x + at!.x, box3d.y + at!.y);
  await expect.poll(async () => (await state(page)).selection, LOAD).toEqual([{ kind: 'object', id: bed.id }]);
  await expect(page.getByTestId('object-name')).toHaveValue('Lit');
  // from inside the room of the selected bed
  await page.getByTestId('preset-room').click();
  await settle(page);
  expect((await stats(page)).camera[1]).toBeCloseTo(1.6, 6); // eye height, in the room
  await shot(page, '3d-room');

  // ===== Plan + 3D side by side: the plan keeps the point it showed in its center =====
  const frames = (await stats(page)).frames;
  await page.getByTestId('view-split').click();
  await expect(page.getByTestId('plan-pane')).toBeVisible();
  await expect(page.getByTestId('scene3d-canvas')).toBeVisible();
  const narrow = (await page.getByTestId('plan-canvas').boundingBox())!;
  expect(narrow.width).toBeLessThan(planBox.width - 100);
  await expect.poll(async () => {
    const c = await onPage(page, planCenterWorld);
    return Math.hypot(c.x - (narrow.x + narrow.width / 2), c.y - (narrow.y + narrow.height / 2));
  }).toBeLessThan(1);
  await expect(page.locator('[data-kind="room-label"]')).toBeInViewport();
  // the narrower 3D pane is drawn again
  await expect.poll(async () => (await stats(page)).frames, LOAD).toBeGreaterThan(frames);
  await settle(page);
  await shot(page, 'split');
  await page.getByTestId('view-plan').click();
  await expect(page.getByTestId('scene3d-canvas')).toHaveCount(0);

  // ===== reload: everything is still there =====
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');
  const saved = (await state(page)).project;
  await page.reload();
  await page.getByTestId('project-item').filter({ hasText: 'Chambre sous les toits' }).getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  const back = await state(page);
  expect(back.project.levels).toEqual(saved.levels);
  const level = back.level;
  expect([Object.keys(level.slopes).length, Object.keys(level.beams).length, Object.keys(level.cupboards).length]).toEqual([1, 1, 1]);
  expect(Object.values(level.objects).map((o) => o.name).sort()).toEqual(['Armoire', 'Bureau', 'Chaise', 'Lit', 'Meuble TV', 'TV', 'Tapis']);
  await expect(page.getByTestId('alert-counter')).toHaveText('1 alerte');
  await expect(page.locator('[data-kind="slope"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="beam"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="cupboard"]')).toHaveCount(1);

  // ===== the PDF export =====
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format-A4').click();
  await page.getByTestId('export-scale-50').click();
  await expect(page.getByTestId('export-fit-message')).toHaveCount(0);
  const pdf = await download(page, testInfo, () => page.getByTestId('export-run').click());
  expect(pdf.name).toBe('Chambre sous les toits - RDC.pdf');
  expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(pdf.bytes.length).toBeGreaterThan(2048);
  expect(errors).toEqual([]);
});
