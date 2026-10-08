/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createProject, gridPointAt, moveTo, onPage, typeLength, type Vec } from './helpers';

// The success criterion of the spec (sections 1 and 12), played like a user: mouse, keyboard,
// panels and dialogs only. window.__planMaison is only read, to check the resulting state.

const plus = (a: Vec, x: number, y: number): Vec => ({ x: a.x + x, y: a.y + y });

/** The project as the editor holds it, and its active level. */
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const s = window.__planMaison!.store.getState();
    const p = s.project!;
    return { project: p, active: p.levels.find((l) => l.id === s.activeLevelId)!, history: s.history.past.length };
  });
}

const roomLabels = (page: Page) => page.locator('[data-kind="room-label"]');
const levelTabs = (page: Page) => page.locator('[data-testid^="level-tab-"]');
const myObjects = (page: Page) => page.getByTestId(/^catalog-item-custom-/);

/** Opens the action menu of a level tab and picks an entry. */
async function levelAction(page: Page, index: number, entry: string) {
  await page.getByTestId(`level-menu-${index}`).click();
  await page.getByRole('menuitem', { name: entry }).click();
}

/** Double-click at a world point, type the name, Enter. */
async function renameRoomAt(page: Page, at: Vec, name: string) {
  const p = await onPage(page, at);
  await page.mouse.dblclick(p.x, p.y);
  const input = page.getByTestId('room-rename');
  await expect(input).toBeFocused();
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  await expect(input).toHaveCount(0);
}

/** Hovers a wall with the door or window tool and clicks to place the opening. */
async function placeOpening(page: Page, toolKey: 'p' | 'f', at: Vec) {
  await page.keyboard.press(toolKey);
  await moveTo(page, at);
  await expect(page.locator('[data-kind="opening-ghost"]')).toHaveCount(1);
  await expect(page.locator('[data-kind="opening-ghost"][data-invalid="true"]')).toHaveCount(0);
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press('Escape'); // back to the selection tool
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
}

async function download(page: Page, testInfo: TestInfo, click: () => Promise<void>) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const file = testInfo.outputPath(dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), bytes: await readFile(file) };
}

test("journey: a two-room summer house, furnished, on two levels, saved and exported", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await createProject(page, "Maison d'été");

  // ===== a 500 x 400 room typed on the keyboard =====
  await page.keyboard.press('m');
  await expect(page.getByTestId('tool-wall')).toHaveAttribute('aria-pressed', 'true');
  const o = await gridPointAt(page, 0.15, 0.12); // top-left corner (wall axes), on the grid
  await moveTo(page, o);
  let p = await onPage(page, o);
  await page.mouse.click(p.x, p.y);
  await moveTo(page, plus(o, 200, 0));
  await typeLength(page, '500');
  await moveTo(page, plus(o, 500, 150));
  await typeLength(page, '400');
  await moveTo(page, plus(o, 300, 400));
  await typeLength(page, '500');
  await moveTo(page, plus(o, 0, 250));
  await typeLength(page, '400'); // back on the first point: the loop closes
  let s = await snapshot(page);
  expect(Object.keys(s.active.walls)).toHaveLength(4);
  await expect(roomLabels(page)).toHaveCount(1);
  await expect(roomLabels(page)).toContainText('18,24 m²'); // 480 x 380 inside

  // ===== a partition (Ctrl / Cmd held on the first click) from the top wall, typed 400 down =====
  const top = plus(o, 300, 0);
  await moveTo(page, top);
  await page.keyboard.down('ControlOrMeta');
  p = await onPage(page, top);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('ControlOrMeta');
  await moveTo(page, plus(o, 300, 150));
  await expect(page.locator('[data-kind="draw-label"]')).toContainText('Cloison 7 cm');
  await typeLength(page, '400');
  await page.keyboard.press('Escape'); // finishes the chain
  await page.keyboard.press('v'); // back to the selection tool
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true');
  s = await snapshot(page);
  const walls = Object.values(s.active.walls);
  // the partition starts and ends on the facade walls, which were split there (T-junctions)
  expect(walls).toHaveLength(7);
  const partition = walls.find((w) => w.thickness === 7)!;
  const ends = [s.active.nodes[partition.startNodeId]!, s.active.nodes[partition.endNodeId]!].map((n) => [n.x - o.x, n.y - o.y]);
  expect(ends.sort((a, b) => a[1]! - b[1]!)).toEqual([
    [300, 0],
    [300, 400],
  ]);
  await expect(roomLabels(page)).toHaveCount(2);
  await expect(roomLabels(page).filter({ hasText: '10,89 m²' })).toHaveCount(1); // 286.5 x 380
  await expect(roomLabels(page).filter({ hasText: '7,09 m²' })).toHaveCount(1); // 186.5 x 380

  // ===== room names =====
  await renameRoomAt(page, plus(o, 150, 330), 'Chambre');
  await renameRoomAt(page, plus(o, 400, 330), 'Bureau');
  await expect(roomLabels(page).filter({ hasText: 'Chambre' })).toContainText('10,89 m²');
  await expect(roomLabels(page).filter({ hasText: 'Bureau' })).toContainText('7,09 m²');

  // ===== a door in the partition, a window in the facade =====
  await placeOpening(page, 'p', plus(o, 300, 320));
  await placeOpening(page, 'f', plus(o, 400, -4));
  s = await snapshot(page);
  const openings = Object.values(s.active.openings);
  expect(openings.map((x) => `${x.kind}:${s.active.walls[x.wallId]!.thickness}`).sort()).toEqual(['door:7', 'window:20']);

  // ===== a 160 bed dropped in the bedroom, pulled against the top wall, 70 cm typed on its left =====
  const canvas = page.getByTestId('plan-canvas');
  const box = (await canvas.boundingBox())!;
  const drop = await onPage(page, plus(o, 150, 200));
  await page.getByTestId('catalog-item-catalog-bed-160').dragTo(canvas, { targetPosition: { x: drop.x - box.x, y: drop.y - box.y } });
  await expect(page.getByTestId('object-width')).toHaveValue('160');
  s = await snapshot(page);
  const bedId = Object.keys(s.active.objects)[0]!;
  // drag it up: its back edge (y = 100) comes within the snapping distance of the wall face (y = 10)
  const from = await onPage(page, plus(o, 150, 200));
  const to = await onPage(page, plus(o, 150, 114));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
  // Tab walks through the clearances: back, front, then left
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  const activeDim = await page.evaluate(() => {
    const ov = window.__planMaison!.store.getState().overlay;
    return ov.dynamicDims[ov.activeDimIndex!]!;
  });
  expect(activeDim.a.y).toBeCloseTo(activeDim.b.y, 6); // horizontal: a lateral clearance
  expect(Math.min(activeDim.a.x, activeDim.b.x)).toBeCloseTo(o.x + 10, 6); // to the left wall face
  await page.keyboard.press('7');
  const field = page.getByTestId('numeric-overlay-input');
  await expect(field).toBeFocused();
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator('[data-kind="dynamic-dimension"]').filter({ hasText: '0,70 m' })).toHaveCount(1);
  s = await snapshot(page);
  const bed = s.active.objects[bedId]!;
  expect(bed.rotation).toBe(0);
  expect(bed.y - bed.depth / 2).toBeCloseTo(o.y + 10, 6); // against the inner face of the top wall
  expect(bed.x - bed.width / 2).toBeCloseTo(o.x + 10 + 70, 6); // 70 cm from the left wall face
  await page.keyboard.press('Escape');

  // ===== a generic rectangle renamed "Piano", saved in "Mes objets" =====
  await page.getByRole('button', { name: /Génériques/ }).click(); // opens the catalog group
  await page.getByTestId('catalog-item-catalog-generic-rect').click();
  const name = page.getByTestId('object-name');
  await expect(name).toHaveValue('Rectangle');
  await expect(page.getByTestId('object-model')).toHaveText('Rectangle');
  await name.fill('Piano');
  await name.press('Enter');
  await expect(name).toHaveValue('Piano');
  await page.getByTestId('save-custom-object').click();
  await expect(page.getByTestId('toast')).toContainText('"Piano" est enregistré dans Mes objets.');
  await expect(myObjects(page)).toHaveCount(1);
  await expect(myObjects(page)).toContainText('Piano');
  s = await snapshot(page);
  expect(Object.values(s.project.customObjects).map((c) => c.name)).toEqual(['Piano']);
  expect(Object.values(s.active.objects).map((x) => x.name).sort()).toEqual(['Lit 160', 'Piano']);

  // ===== a level "Étage" above, the ground floor shown under it =====
  await levelAction(page, 0, 'Ajouter au-dessus');
  await expect(page.getByTestId('level-tab-1')).toHaveText('Étage 1');
  await page.getByTestId('level-tab-1').dblclick();
  const levelName = page.getByRole('textbox', { name: 'Nom du niveau' });
  await levelName.fill('Étage');
  await levelName.press('Enter');
  await expect(page.getByTestId('level-tab-1')).toHaveText('Étage');
  // the watermark option is on by default: off, then on again
  const watermark = page.getByRole('checkbox', { name: 'Niveau inférieur en filigrane' });
  await expect(watermark).toBeChecked();
  await watermark.uncheck();
  await expect(page.locator('[data-kind="lower-level"]')).toHaveCount(0);
  await watermark.check();
  await expect(page.locator('[data-kind="lower-level"]')).toHaveCount(1);

  // ===== the ground floor duplicated as a variant =====
  await levelAction(page, 0, 'Dupliquer (variante)');
  await expect(levelTabs(page)).toHaveText(['RDC', 'RDC - variante', 'Étage']);
  await expect(page.getByTestId('level-tab-1')).toHaveAttribute('aria-current', 'page');
  await expect(roomLabels(page).filter({ hasText: 'Chambre' })).toHaveCount(1);
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);

  // ===== undo, redo =====
  const before = await snapshot(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(levelTabs(page)).toHaveText(['RDC', 'Étage']);
  s = await snapshot(page);
  expect(s.project.levels.some((l) => l.id === s.active.id)).toBe(true); // the active level still exists
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(levelTabs(page)).toHaveText(['RDC', 'RDC - variante', 'Étage']);
  s = await snapshot(page);
  expect(s.project.levels).toEqual(before.project.levels);
  expect(s.history).toBe(before.history);

  // ===== reload: everything is still there =====
  await expect(page.getByTestId('save-status')).toHaveText('Enregistré');
  const saved = (await snapshot(page)).project;
  await page.reload();
  const item = page.getByTestId('project-item').filter({ hasText: "Maison d'été" });
  await expect(item).toContainText('3 niveaux');
  await item.getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(levelTabs(page)).toHaveText(['RDC', 'RDC - variante', 'Étage']);
  await expect(roomLabels(page).filter({ hasText: 'Chambre' })).toContainText('10,89 m²');
  await expect(roomLabels(page).filter({ hasText: 'Bureau' })).toContainText('7,09 m²');
  await expect(page.locator('[data-kind="opening"]')).toHaveCount(2);
  await expect(page.locator('[data-kind="object"]')).toHaveCount(2);
  await expect(myObjects(page)).toHaveCount(1);
  await expect(myObjects(page)).toContainText('Piano');
  s = await snapshot(page);
  expect(s.project.levels).toEqual(saved.levels);
  expect(s.project.customObjects).toEqual(saved.customObjects);
  expect(s.project.name).toBe("Maison d'été");

  // ===== exports: a scaled PDF of the ground floor, then the project file =====
  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  await page.getByTestId('export-format-A4').click();
  await page.getByTestId('export-orientation-landscape').click();
  await page.getByTestId('export-scale-50').click();
  await expect(page.getByTestId('export-fit-message')).toHaveCount(0);
  const pdf = await download(page, testInfo, () => page.getByTestId('export-run').click());
  expect(pdf.name).toBe("Maison d'été - RDC.pdf");
  expect(pdf.bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(pdf.bytes.length).toBeGreaterThan(4096);

  await page.getByTestId('open-export').click();
  await page.getByTestId('export-tab-json').click();
  const json = await download(page, testInfo, () => page.getByTestId('export-json').click());
  expect(json.name).toBe("Maison d'été.json");
  const file = JSON.parse(json.bytes.toString('utf8'));
  expect(file.app).toBe('plan-maison');
  expect(file.project.name).toBe("Maison d'été");
  expect(file.project.levels.map((l: { name: string }) => l.name)).toEqual(['RDC', 'RDC - variante', 'Étage']);
  expect(JSON.stringify(file.project.levels[0].roomLabels)).toContain('Chambre');
});
