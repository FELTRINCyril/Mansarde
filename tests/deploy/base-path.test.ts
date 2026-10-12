import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { build } from 'vite';

// Builds the app as the GitHub Pages workflow does (BASE_PATH=/plan-maison/) into a temporary folder
// and reads dist/index.html: every asset URL must carry the base, else the published site loads nothing.
const root = path.resolve(import.meta.dirname, '../..');
const outDir = mkdtempSync(path.join(tmpdir(), 'plan-maison-dist-'));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('deployment base path', () => {
  it('BASE_PATH prefixes the asset paths of the built index.html and of the lazy 3D chunk', async () => {
    const previous = process.env.BASE_PATH;
    process.env.BASE_PATH = '/plan-maison/';
    try {
      await build({ root, logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    } finally {
      if (previous === undefined) delete process.env.BASE_PATH;
      else process.env.BASE_PATH = previous;
    }
    const html = readFileSync(path.join(outDir, 'index.html'), 'utf8');
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(0);
    // the favicon (public/) is linked under the base too, so that Pages never looks for /favicon.ico
    const favicon = '/plan-maison/favicon.svg';
    expect(html).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/plan-maison\/favicon\.svg"/);
    expect(readFileSync(path.join(outDir, 'favicon.svg'), 'utf8')).toContain('<svg');
    for (const url of urls.filter((u) => u !== favicon)) expect(url.startsWith('/plan-maison/assets/'), url).toBe(true);
    // the 3D view is a separate chunk loaded on demand: it must be emitted next to the entry
    const assets = readdirSync(path.join(outDir, 'assets'));
    expect(assets.some((f) => /^index-.*\.js$/.test(f))).toBe(true);
    expect(assets.filter((f) => f.endsWith('.js')).length).toBeGreaterThan(1);
  }, 180000);

  it('the GitHub Pages workflow builds main with BASE_PATH /plan-maison/ through the official Pages actions', () => {
    const yml = readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
    expect(yml).toMatch(/on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
    expect(yml).toMatch(/run: npm run build\s*\n\s*env:\s*\n\s*BASE_PATH: \/plan-maison\//);
    for (const action of ['configure-pages', 'upload-pages-artifact', 'deploy-pages']) expect(yml).toContain(`uses: actions/${action}@`);
    expect(yml).toMatch(/upload-pages-artifact@v\d+\s*\n\s*with:\s*\n\s*path: dist/);
    expect(yml).toMatch(/pages: write/);
    expect(yml).toMatch(/id-token: write/);
  });
});
