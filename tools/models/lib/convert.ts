import path from 'node:path';
import { Document, Logger, NodeIO, Primitive, type Material, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeTransform, dedup, flatten, join, meshopt, prune, quantize, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import obj2gltf from 'obj2gltf';
import sharp from 'sharp';
import { pickMainMaterial, type MaterialStat } from './mainMaterial.ts';
import { computeOutline, type TopTriangle } from './outline.ts';

export const BUDGET = { bytes: 150 * 1024, tris: 10_000, materials: 8 };

let io: NodeIO | null = null;
async function getIO(): Promise<NodeIO> {
  if (io) return io;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  return io;
}

export interface ConvertOptions {
  textureSize: number;
  /** Sweet Home 3D modelRotation, 3 x 3 row by row. */
  modelRotation?: number[];
  /** Extra turn about y (degrees, counterclockwise seen from above), to face +z. */
  rotateY?: number;
  /** Base color (sRGB hex) by material name without its '.NNN' suffix, for sources whose MTL lost them. */
  materialColors?: Record<string, string>;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function recolor(doc: Document, colors: Record<string, string>): void {
  for (const mat of doc.getRoot().listMaterials()) {
    const hex = colors[mat.getName().replace(/\.\d+$/, '')];
    if (!hex) continue;
    const v = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
    mat.setBaseColorFactor([v[0]!, v[1]!, v[2]!, 1]);
  }
}

export interface Converted {
  glb: Uint8Array;
  tris: number;
  materials: number;
  outline: number[][];
  detail: number[][];
  /** Size before normalization, in the model's units. */
  natural: { w: number; d: number; h: number };
}

/** Column-major 4 x 4 (glTF) of a row-major 3 x 3. */
const mat3to4 = (m: number[]): number[] => [m[0]!, m[3]!, m[6]!, 0, m[1]!, m[4]!, m[7]!, 0, m[2]!, m[5]!, m[8]!, 0, 0, 0, 0, 1];

function rotY(deg: number): number[] {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

async function load(file: string): Promise<Document> {
  const io = await getIO();
  const ext = path.extname(file).toLowerCase();
  if (ext === '.glb' || ext === '.gltf') return io.read(file);
  if (ext === '.obj') {
    const glb: Buffer = await obj2gltf(file, { binary: true, secure: false });
    return io.readBinary(new Uint8Array(glb));
  }
  throw new Error(`unsupported format ${ext}`);
}

/** Puts the scene under a node carrying `pre` (the orientation fix), to be baked by flatten + clearNodeTransform. */
function bake(doc: Document, pre: number[] | null): void {
  const root = doc.getRoot();
  for (const scene of root.listScenes()) {
    if (pre) {
      const wrap = doc.createNode('orient').setMatrix(pre as Parameters<Node['setMatrix']>[0]);
      for (const child of scene.listChildren()) {
        scene.removeChild(child);
        wrap.addChild(child);
      }
      scene.addChild(wrap);
    }
  }
}

function listMeshNodes(doc: Document): Node[] {
  return doc.getRoot().listNodes().filter((n) => n.getMesh());
}

/** Triangle primitives only (drops points and lines); throws when nothing is left. */
function keepTriangles(doc: Document): void {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      if (p.getMode() !== Primitive.Mode.TRIANGLES) {
        mesh.removePrimitive(p);
        p.dispose();
      }
    }
  }
}

interface Tri { p: [number, number, number][]; material: Material | null }

function triangles(doc: Document): Tri[] {
  const out: Tri[] = [];
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const v = (i: number): [number, number, number] => pos.getElement(idx ? idx.getScalar(i) : i, [0, 0, 0]) as [number, number, number];
      for (let i = 0; i + 2 < n; i += 3) out.push({ p: [v(i), v(i + 1), v(i + 2)], material: prim.getMaterial() });
    }
  }
  return out;
}

function boundsOf(tris: Tri[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const p of t.p) for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k]!, p[k]!);
    max[k] = Math.max(max[k]!, p[k]!);
  }
  return { min, max };
}

const triArea = (p: [number, number, number][]): number => {
  const [a, b, c] = p as [[number, number, number], [number, number, number], [number, number, number]];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!) / 2;
};

/**
 * A source model as an app-ready GLB (spec 4.1): oriented (y up, front +z), normalized into the
 * unit box [-0.5, 0.5] x [0, 1] x [-0.5, 0.5], merged by material, simplified to the triangle
 * budget, its main material named 'main', textures in WebP, quantized and meshopt-compressed;
 * with its top view outline.
 */
export async function convertModel(file: string, opts: ConvertOptions): Promise<Converted> {
  const io = await getIO();
  const doc = await load(file);
  if (opts.materialColors) recolor(doc, opts.materialColors);
  let pre: number[] | null = opts.modelRotation ? mat3to4(opts.modelRotation) : null;
  if (opts.rotateY) pre = multiply(rotY(opts.rotateY), pre ?? rotY(0));
  bake(doc, pre);
  await doc.transform(flatten());
  for (const n of listMeshNodes(doc)) {
    // a mesh drawn by several nodes gets one copy per node, so that each copy takes its own transform
    const mesh = n.getMesh()!;
    if (mesh.listParents().filter((p) => p.propertyType === 'Node').length > 1) n.setMesh(mesh.clone());
    clearNodeTransform(n);
  }
  keepTriangles(doc);
  await doc.transform(dedup(), join({ keepNamed: false }), weld(), prune());

  let tris = triangles(doc);
  if (tris.length === 0) throw new Error('no triangles');
  const { min, max } = boundsOf(tris);
  const size = [max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!];
  const s = size.map((v) => 1 / Math.max(v, 1e-4));
  const cx = (min[0]! + max[0]!) / 2, cz = (min[2]! + max[2]!) / 2;
  // normalize: translate to (center x, bottom, center z), then scale to the unit box
  const m = [s[0]!, 0, 0, 0, 0, s[1]!, 0, 0, 0, 0, s[2]!, 0, -cx * s[0]!, -min[1]! * s[1]!, -cz * s[2]!, 1];
  for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, m as Parameters<typeof transformMesh>[1]);

  if (tris.length > BUDGET.tris) {
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: BUDGET.tris / tris.length, error: 0.01 }), prune());
  }
  tris = triangles(doc);

  // main material (largest plain surface)
  const mats = doc.getRoot().listMaterials();
  const area = new Map<Material, number>();
  for (const t of tris) if (t.material) area.set(t.material, (area.get(t.material) ?? 0) + triArea(t.p));
  const stats: MaterialStat[] = mats.map((mat) => {
    const f = mat.getBaseColorFactor();
    return { name: mat.getName(), area: area.get(mat) ?? 0, color: [f[0], f[1], f[2]], metallic: mat.getMetallicFactor(), alpha: mat.getAlphaMode() === 'BLEND' ? f[3] : 1 };
  });
  const main = pickMainMaterial(stats);
  mats.forEach((mat, i) => mat.setName(i === main ? 'main' : `m${i}`));

  const top: TopTriangle[] = tris.map((t) => ({ a: t.p[0]!, b: t.p[1]!, c: t.p[2]! }));
  const { outline, detail } = computeOutline(top);

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [opts.textureSize, opts.textureSize] }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const glb = await io.writeBinary(doc);
  return { glb, tris: tris.length, materials: mats.length, outline, detail, natural: { w: size[0]!, d: size[2]!, h: size[1]! } };
}

/** a x b, column-major 4 x 4. */
function multiply(a: number[], b: number[]): number[] {
  const r = new Array<number>(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i]! += a[k * 4 + i]! * b[j * 4 + k]!;
  return r;
}
