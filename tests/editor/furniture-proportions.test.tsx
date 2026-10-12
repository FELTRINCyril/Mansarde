import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box3, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { CATALOG, getCatalogEntry } from '@/catalog/catalog';
import { SYMBOLS } from '@/catalog/symbols';
import { createObjectFromSize } from '@/core/model/factory';
import { BUILDERS, Kit, specOf } from '@/scene3d/furniture';

/*
 * The 3D furniture keeps the proportions of its 2D symbol (task 14a): sofa back and arm
 * thicknesses, wardrobe door count; the catalog beds are 90 cm high (ruling V2-R33) so that the 3D
 * headboard rises above the mattress.
 */

const place = (id: string, width: number, depth: number, height: number) =>
  createObjectFromSize({ kind: 'catalog', catalogId: id }, 0, 0, { width, depth, height }, id, getCatalogEntry(id)!.color, {});

function build(id: string, width: number, depth: number, height: number): { g: Object3D; kit: Kit } {
  const kit = new Kit();
  return { g: BUILDERS[id]!(specOf(place(id, width, depth, height)), kit), kit };
}

/** Bounding boxes of the meshes (the builders' own frame), with their material color. */
function meshBoxes(g: Object3D): Array<{ box: Box3; size: Vector3; color: string }> {
  g.updateMatrixWorld(true);
  const out: Array<{ box: Box3; size: Vector3; color: string }> = [];
  g.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    n.geometry.computeBoundingBox();
    const box = n.geometry.boundingBox!.clone().applyMatrix4(n.matrixWorld);
    out.push({ box, size: box.getSize(new Vector3()), color: (n.material as MeshStandardMaterial).color.getHexString() });
  });
  return out;
}

const svg = (id: string, w: number, d: number) => {
  const Sym = SYMBOLS[id]!;
  return renderToStaticMarkup(<Sym w={w} d={d} lineUnit={1} stroke="#222" fill="#ccc" />);
};
const rects = (markup: string) =>
  [...markup.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map((m) => m.slice(1).map(Number) as [number, number, number, number]);

describe('3D furniture proportions follow the 2D symbols', () => {
  const sizes: Array<[string, number, number]> = [
    ['sofa-2', 160, 90],
    ['sofa-3', 210, 95],
    ['armchair', 85, 85],
    ['sofa-2', 300, 120],
    ['sofa-3', 120, 60],
  ];
  it.each(sizes)('%s %i x %i: back depth and arm width as in the symbol', (id, w, d) => {
    // 2D: body, back (full width, back thickness tall), left arm (arm thickness wide)
    const [, back2d, arm2d] = rects(svg(id, w, d));
    expect(back2d![2]).toBeCloseTo(w, 6);
    const backCm = back2d![3];
    const armCm = arm2d![2];
    const { g, kit } = build(id, w, d, 85);
    const W = w / 100;
    const D = d / 100;
    const boxes = meshBoxes(g);
    const back = boxes.find((b) => Math.abs(b.box.min.z + D / 2) < 1e-3 && Math.abs(b.size.x - W) < 1e-3 && b.size.z < D / 2)!;
    expect(back, 'back').toBeTruthy();
    expect(back.size.z * 100).toBeCloseTo(backCm, 3);
    const arm = boxes.find((b) => Math.abs(b.box.min.x + W / 2) < 1e-3 && b.size.x < W / 2)!;
    expect(arm, 'arm').toBeTruthy();
    expect(arm.size.x * 100).toBeCloseTo(armCm, 3);
    // the arm starts in front of the back, as in the symbol
    expect(arm.box.min.z * 100).toBeCloseTo(-d / 2 + backCm, 3);
    kit.dispose();
  });

  // 510: the 3D width 5.1 m gives 5.1 * 100 = 509.99999999999994 cm, just under 8.5 doors: it must be
  // rounded back; 509.6 (a typed width): rounding to the whole cm would give 9 doors instead of 8
  it.each([60, 90, 120, 150, 200, 240, 510, 509.6])('wardrobe %s cm wide: as many doors (handles) as the symbol', (w) => {
    const markup = svg('wardrobe', w, 60);
    // the door separations: vertical lines from the door leaf line to the front edge
    const separations = [...markup.matchAll(/<line x1="([^"]+)" y1="[^"]+" x2="([^"]+)" y2="30"/g)].filter((m) => m[1] === m[2]).length;
    const doors2d = separations + 1;
    const { g, kit } = build('wardrobe', w, 60, 200);
    const handles = meshBoxes(g).filter((b) => b.color === '8f8a82').length;
    expect(handles).toBe(doors2d);
    expect(doors2d).toBe(Math.max(1, Math.round(w / 60)));
    kit.dispose();
  });
});

describe('catalog beds (ruling V2-R33)', () => {
  const beds = CATALOG.filter((e) => e.id.startsWith('bed-'));
  it('bed-90, bed-140, bed-160 and bed-180 are 90 cm high', () => {
    expect(beds.map((e) => [e.id, e.height])).toEqual([
      ['bed-90', 90],
      ['bed-140', 90],
      ['bed-160', 90],
      ['bed-180', 90],
    ]);
  });
  it.each(beds.map((e) => [e.id, e] as const))('%s: the 3D headboard rises to the bed height, well above the mattress (~50)', (_id, e) => {
    const { g, kit } = build(e.id, e.width, e.depth, e.height);
    const boxes = meshBoxes(g);
    const headboard = boxes.find((b) => b.color === '8a6a4e')!;
    const mattress = boxes.find((b) => b.color === 'f4f1ea')!;
    expect(headboard.box.max.y).toBeCloseTo(0.9, 3);
    expect(mattress.box.max.y).toBeGreaterThan(0.45);
    expect(mattress.box.max.y).toBeLessThan(0.55);
    // everything else (pillows, duvet) stays under 0.65
    for (const b of boxes) if (b !== headboard) expect(b.box.max.y).toBeLessThan(0.65);
    kit.dispose();
  });
});
