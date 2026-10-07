// Generates plan.png: 800x600, white, a 400 px black horizontal line (from x=200 to x=600 at y=300)
// with end ticks, two grey rooms and a thin grey frame (no text: no font dependency). Run from the repo root: node tests/e2e/fixtures/make-plan-png.mjs
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'plan.png');
execFileSync('magick', [
  '-size', '800x600', 'xc:white',
  '-fill', 'none', '-stroke', '#999999', '-strokewidth', '2', '-draw', 'rectangle 1,1 798,598',
  '-stroke', 'black', '-strokewidth', '4',
  '-draw', 'line 200,300 600,300',
  '-draw', 'line 200,285 200,315',
  '-draw', 'line 600,285 600,315',
  '-stroke', '#555555', '-strokewidth', '3', '-draw', 'rectangle 150,100 650,250 rectangle 150,350 650,500',
  `PNG24:${out}`,
]);
console.log(`wrote ${out}`);
