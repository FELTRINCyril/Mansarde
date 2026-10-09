import { expect, test, type Page, type TestInfo } from '@playwright/test';

// The export functions run in the page (DOMParser, canvas, Blob), imported from the Vite dev
// server; the sample project comes from tests/export/sampleProject.ts. The generated files are
// downloaded into the test output folder (test-results/...) for the visual check.

const M = { pdf: '/src/export/pdf.ts', png: '/src/export/png.ts', sample: '/tests/export/sampleProject.ts', factory: '/src/core/model/factory.ts' };
type PdfModule = typeof import('../../src/export/pdf');
type PngModule = typeof import('../../src/export/png');
type SampleModule = typeof import('../export/sampleProject');
type FactoryModule = typeof import('../../src/core/model/factory');
type SampleWindow = { __samples?: Record<string, Blob> };

/** Downloads a blob kept by the page in window.__samples into the test output folder. */
async function saveSample(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate((n) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL((window as SampleWindow).__samples![n]!);
      a.download = n;
      a.click();
    }, name),
  ]);
  await download.saveAs(testInfo.outputPath(name));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate((m) => Promise.all(Object.values(m).map((path) => import(path))), M);
});

test('pdf: A4 landscape at 1/50, with accents in the names', async ({ page }, testInfo) => {
  const out = await page.evaluate(async (m) => {
    const { exportPdf }: PdfModule = await import(m.pdf);
    const { buildSampleProject }: SampleModule = await import(m.sample);
    const project = buildSampleProject();
    const blob = await exportPdf({
      project,
      level: project.levels[0]!,
      spec: { format: 'A4', orientation: 'landscape', scale: 50 },
      imageDataUrls: {},
      date: new Date(2026, 9, 7),
      dimMode: 'all',
    });
    const text = await blob.text();
    (window as SampleWindow).__samples = { 'sample-a4-landscape-1-50.pdf': blob };
    return { type: blob.type, size: blob.size, head: text.slice(0, 5), mediaBoxes: text.match(/\/MediaBox \[[^\]]*\]/g) };
  }, M);
  await saveSample(page, testInfo, 'sample-a4-landscape-1-50.pdf');
  expect(out.type).toBe('application/pdf');
  expect(out.head).toBe('%PDF-');
  expect(out.size).toBeGreaterThan(2048);
  // one page, A4 landscape: 297 x 210 mm (points / 72 * 25.4)
  expect(out.mediaBoxes).toHaveLength(1);
  const [, , w, h] = out.mediaBoxes![0]!.replace(/[^\d. ]/g, '').trim().split(/\s+/).map(Number);
  expect((w! / 72) * 25.4).toBeCloseTo(297, 6);
  expect((h! / 72) * 25.4).toBeCloseTo(210, 6);
});

test('pdf: at 1/100 the opening widths are kept, other unreadable dimensions left out (R38)', async ({ page }, testInfo) => {
  const out = await page.evaluate(async (m) => {
    const { exportPdf }: PdfModule = await import(m.pdf);
    const { buildSampleProject }: SampleModule = await import(m.sample);
    const layoutPath = '/src/render/dimensionsLayout.ts';
    const derivedPath = '/src/core/geometry/derived.ts';
    const { layoutDimensions } = await import(/* @vite-ignore */ layoutPath);
    const { deriveLevel } = await import(/* @vite-ignore */ derivedPath);
    const project = buildSampleProject();
    const level = project.levels[0]!;
    const blob = await exportPdf({
      project,
      level,
      spec: { format: 'A4', orientation: 'portrait', scale: 100 },
      imageDataUrls: {},
      date: new Date(2026, 9, 7),
      dimMode: 'all',
    });
    (window as SampleWindow).__samples = { 'sample-a4-portrait-1-100.pdf': blob };
    const layout = layoutDimensions(level, deriveLevel(level), 'all', 0.025 * 100);
    const openings = layout.auto.filter((p: { dim: { kind: string } } | null) => p?.dim.kind === 'opening').length;
    return { head: (await blob.text()).slice(0, 5), openings, expected: Object.keys(level.openings).length, culled: layout.culled };
  }, M);
  await saveSample(page, testInfo, 'sample-a4-portrait-1-100.pdf');
  expect(out.head).toBe('%PDF-');
  expect(out.openings).toBe(out.expected);
  expect(out.culled).toBeGreaterThan(0);
});

test('pdf: rejects a plan that does not fit the page at that scale', async ({ page }) => {
  const message = await page.evaluate(async (m) => {
    const { exportPdf }: PdfModule = await import(m.pdf);
    const { buildSampleProject }: SampleModule = await import(m.sample);
    const project = buildSampleProject();
    try {
      await exportPdf({
        project,
        level: project.levels[0]!,
        spec: { format: 'A4', orientation: 'portrait', scale: 20 },
        imageDataUrls: {},
        date: new Date(2026, 9, 7),
        dimMode: 'all',
      });
      return 'resolved';
    } catch (e) {
      return (e as Error).message;
    }
  }, M);
  expect(message).toBe('Le plan ne tient pas sur la page à cette échelle');
});

test('png: signature and size (1 px per cm at 1x, here 2x)', async ({ page }) => {
  const out = await page.evaluate(async (m) => {
    const { exportPng }: PngModule = await import(m.png);
    const { buildSampleProject }: SampleModule = await import(m.sample);
    const project = buildSampleProject();
    const blob = await exportPng({ project, level: project.levels[0]!, resolution: 2, imageDataUrls: {}, dimMode: 'all' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    return { type: blob.type, signature: Array.from(bytes.subarray(0, 8)), width: view.getUint32(16), height: view.getUint32(20) };
  }, M);
  expect(out.type).toBe('image/png');
  expect(out.signature).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  // levelBounds -70..470 x -153..370 (door arc included) + 20 cm bleed on each side, x2
  expect(out.width).toBe((540 + 40) * 2);
  expect(out.height).toBe((523 + 40) * 2);
});

test('background image (data URL, opacity) in the pdf and the png', async ({ page }, testInfo) => {
  const out = await page.evaluate(async (m) => {
    const { exportPdf }: PdfModule = await import(m.pdf);
    const { exportPng }: PngModule = await import(m.png);
    const { buildSampleProject }: SampleModule = await import(m.sample);
    // 200 x 150 px, plain red: 500 x 375 cm from (-50, -50), opacity 0.5
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 200, 150);
    const imageDataUrls = { 'img-1': canvas.toDataURL('image/png') };
    const project = buildSampleProject({ imageId: 'img-1' });
    const level = project.levels[0]!;
    const pdf = await exportPdf({
      project,
      level,
      spec: { format: 'A4', orientation: 'portrait', scale: 50 },
      imageDataUrls,
      date: new Date(2026, 9, 7),
      dimMode: 'all',
    });
    const png = await exportPng({ project, level, resolution: 1, imageDataUrls, dimMode: 'manual' });
    // pixel at world (-40, 200): outside the walls, on the image; the PNG starts at (-90, -173)
    const bitmap = await createImageBitmap(png);
    const read = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
    read.drawImage(bitmap, 0, 0);
    (window as SampleWindow).__samples = { 'sample-background-a4-portrait-1-50.pdf': pdf, 'sample-background-1x.png': png };
    return {
      pdfHasImage: (await pdf.text()).includes('/Subtype /Image'),
      onImage: Array.from(read.getImageData(-40 + 90, 200 + 173, 1, 1).data),
      offImage: Array.from(read.getImageData(460 + 90, 200 + 173, 1, 1).data),
    };
  }, M);
  await saveSample(page, testInfo, 'sample-background-a4-portrait-1-50.pdf');
  await saveSample(page, testInfo, 'sample-background-1x.png');
  expect(out.pdfHasImage).toBe(true);
  // red at half opacity over white
  expect(out.onImage[0]).toBe(255);
  expect(out.onImage[1]).toBeGreaterThan(110);
  expect(out.onImage[1]).toBeLessThan(145);
  expect(out.offImage).toEqual([255, 255, 255, 255]);
});

test('volumes: slope (gradient), beam and cupboard in the pdf and the png, no alert drawn', async ({ page }, testInfo) => {
  const out = await page.evaluate(async (m) => {
    const { exportPdf }: PdfModule = await import(m.pdf);
    const { exportPng }: PngModule = await import(m.png);
    const { buildSampleProject }: SampleModule = await import(m.sample);
    const { createBeam, createCupboard, createSlope }: FactoryModule = await import(m.factory);
    // the sample is frozen (immer): build a new level and project around it
    const sample = buildSampleProject();
    const base = sample.levels[0]!;
    const slope = createSlope({ x: 200, y: 0 }, { x: 200, y: 300 }, 'right', 200, 250, 150);
    const beam = createBeam({ x: 150, y: 0 }, { x: 150, y: 300 });
    const wall = Object.values(base.walls)[0]!;
    const cupboard = createCupboard(wall.id, 100, 'left', { width: 120 });
    const level = {
      ...base,
      slopes: { [slope.id]: slope },
      beams: { [beam.id]: beam },
      cupboards: { [cupboard.id]: cupboard },
    };
    const project = { ...sample, levels: [level] };
    const pdf = await exportPdf({
      project,
      level,
      spec: { format: 'A3', orientation: 'landscape', scale: 50 },
      imageDataUrls: {},
      date: new Date(2026, 9, 9),
      dimMode: 'all',
    });
    const png = await exportPng({ project, level, resolution: 1, imageDataUrls: {}, dimMode: 'all' });
    (window as SampleWindow).__samples = { 'sample-volumes-a3-1-50.pdf': pdf, 'sample-volumes-1x.png': png };
    const text = await pdf.text();
    return { head: text.slice(0, 5), shading: /\/ShadingType 2/.test(text), png: png.type, pngSize: png.size };
  }, M);
  await saveSample(page, testInfo, 'sample-volumes-a3-1-50.pdf');
  await saveSample(page, testInfo, 'sample-volumes-1x.png');
  expect(out.head).toBe('%PDF-');
  expect(out.shading).toBe(true); // the slope gradient became a PDF axial shading
  expect(out.png).toBe('image/png');
  expect(out.pngSize).toBeGreaterThan(1000);
});
