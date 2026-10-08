import { expect, test, type Page } from '@playwright/test';

async function createProject(page: Page, name: string) {
  await page.goto('/');
  await page.getByTestId('new-project').click();
  const dialog = page.getByTestId('prompt-dialog');
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByTestId('editor')).toBeVisible();
}

async function openField(page: Page, x: number, y: number, initial = '3') {
  await page.evaluate(
    async ({ x, y, initial }) => {
      const url = '/src/editor/numericOverlay.ts';
      const { openNumericInput } = await import(/* @vite-ignore */ url);
      openNumericInput(window.__planMaison!.store, { initial, screen: { x, y }, kind: 'positive', label: 'Longueur' });
    },
    { x, y, initial },
  );
}

test('numeric overlay: placed near the cursor, typing, red on invalid, Escape closes, shortcuts ignored', async ({ page }) => {
  await createProject(page, 'Saisie');
  const canvas = (await page.getByTestId('plan-canvas').boundingBox())!;
  const field = page.getByTestId('numeric-overlay');
  const input = page.getByTestId('numeric-overlay-input');
  await expect(field).toHaveCount(0);

  await openField(page, 200, 150);
  await expect(field).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('3');
  await expect(field).toContainText('Longueur');
  await expect(field).toContainText('cm');
  const box = (await field.boundingBox())!;
  expect(box.x - canvas.x).toBeGreaterThan(200);
  expect(box.x - canvas.x).toBeLessThan(230);
  expect(box.y - canvas.y).toBeGreaterThan(150);
  expect(box.y - canvas.y).toBeLessThan(180);

  // caret at the end: typing appends; letters do not trigger tool shortcuts
  await page.keyboard.type('50');
  await expect(input).toHaveValue('350');
  await page.keyboard.press('m');
  await page.keyboard.press('r');
  await expect(input).toHaveValue('350mr');
  expect(await page.evaluate(() => window.__planMaison!.store.getState().tool)).toBe('select');

  // invalid text: Enter keeps it open and turns it red
  await page.keyboard.press('Enter');
  await expect(field).toBeVisible();
  await expect(input).toHaveClass(/input-invalid/);
  await expect(input).toHaveAttribute('aria-invalid', 'true');

  // typing again clears the error; Escape closes without touching the model
  await page.keyboard.press('Backspace');
  await expect(input).not.toHaveClass(/input-invalid/);
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  expect(await page.evaluate(() => window.__planMaison!.store.getState().overlay.numericInput)).toBeNull();
  await expect(page.getByTestId('plan-canvas')).toBeFocused();
});

test('numeric overlay: stays inside the canvas and a valid Enter closes it', async ({ page }) => {
  await createProject(page, 'Saisie bord');
  const canvas = (await page.getByTestId('plan-canvas').boundingBox())!;
  await openField(page, canvas.width - 2, canvas.height - 2);
  const box = (await page.getByTestId('numeric-overlay').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(canvas.x + canvas.width + 0.5);
  expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + canvas.height + 0.5);

  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
});

test('numeric overlay: blur closes it', async ({ page }) => {
  await createProject(page, 'Saisie blur');
  await openField(page, 100, 100);
  await expect(page.getByTestId('numeric-overlay-input')).toBeFocused();
  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
});


test('numeric overlay: no stale red border when reopened after an invalid blur', async ({ page }) => {
  await createProject(page, 'Saisie reouverture');
  await openField(page, 100, 100);
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay-input')).toHaveClass(/input-invalid/);
  await page.getByTestId('plan-canvas').click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);

  await openField(page, 100, 100, '4');
  const input = page.getByTestId('numeric-overlay-input');
  await expect(input).toHaveValue('4');
  await expect(input).not.toHaveClass(/input-invalid/);
  await expect(input).toHaveAttribute('aria-invalid', 'false');
});

test('numeric overlay: valid Enter calls the active tool and returns the focus to the plan', async ({ page }) => {
  await createProject(page, 'Saisie tool');
  // test page only: hook a temporary callback on the select tool entry of TOOLS
  await page.evaluate(async () => {
    const url = '/src/editor/tools/types.ts';
    const { TOOLS } = await import(/* @vite-ignore */ url);
    const w = window as unknown as { __submitted: number[]; __cancelled: number };
    w.__submitted = [];
    w.__cancelled = 0;
    TOOLS.select.onNumericSubmit = (v: number) => w.__submitted.push(v);
    TOOLS.select.onNumericCancel = () => w.__cancelled++;
  });
  await openField(page, 100, 100);
  await page.keyboard.type('50');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('numeric-overlay')).toHaveCount(0);
  await expect(page.getByTestId('plan-canvas')).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __submitted: number[] }).__submitted)).toEqual([350]);
  expect(await page.evaluate(() => (window as unknown as { __cancelled: number }).__cancelled)).toBe(0);

  // Escape calls the cancel callback only
  await openField(page, 100, 100);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { __cancelled: number }).__cancelled)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __submitted: number[] }).__submitted)).toEqual([350]);
});
