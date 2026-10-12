import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape as ThreeShape,
  SphereGeometry,
  Vector2,
  type Material,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Size and color of a piece of furniture, in meters. `color` is the object's color; `custom` is
 * true when the user changed it from the catalog default (spec 8.2: the object color goes on the
 * main parts). A builder uses `main(s, fallback)`: the object color when it is custom, else the
 * color of plan-chambre (the catalog defaults are 2D category tints, not materials).
 */
export interface FurnitureSpec { w: number; d: number; h: number; color: string; custom: boolean }

/**
 * Builds a piece of furniture in its local frame (plan-chambre's convention): origin at the
 * center of its underside, y up, back side towards -z, front towards +z (local plan +y), width
 * along x. Everything stays in the box [-w/2, w/2] x [0, h] x [-d/2, d/2] (1 cm tolerance).
 */
export type Builder = (s: FurnitureSpec, kit: Kit) => Group;

export const main = (s: FurnitureSpec, fallback: string): string => (s.custom ? s.color : fallback);

export interface MatOpts {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  doubleSide?: boolean;
}

/** Smallest size given to a geometry: a user may make an object smaller than its details. */
const MIN = 0.002;
const pos = (v: number): number => Math.max(MIN, v);

/**
 * Materials and geometry helpers of the furniture builders (plan-chambre's mat, box, rbox, cyl,
 * sphere, glow, glass). Materials are cached by color and options and shared by every object of
 * the scene (alerts.ts clones them for the objects in alert); they and the rug textures are
 * disposed with the kit, never with a mesh. `rugTexture` is null where there is no canvas (unit
 * tests): the rug is then a plain color.
 */
export class Kit {
  private readonly mats = new Map<string, MeshStandardMaterial>();
  private readonly rugTextures = new Map<boolean, Texture | null>();
  private readonly makeRugTexture: (round: boolean) => Texture | null;

  constructor(makeRugTexture: (round: boolean) => Texture | null = () => null) {
    this.makeRugTexture = makeRugTexture;
  }

  /** plan-chambre's mat(): MeshStandardMaterial, roughness 0.8, no metal, cached. */
  mat(color: string, opts: MatOpts = {}): MeshStandardMaterial {
    const key = `${color}|${JSON.stringify(opts)}`;
    let m = this.mats.get(key);
    if (!m) {
      const { emissive, doubleSide, ...rest } = opts;
      m = new MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0,
        ...rest,
        ...(emissive ? { emissive: new Color(emissive) } : {}),
        ...(doubleSide ? { side: DoubleSide } : {}),
      });
      this.mats.set(key, m);
    }
    return m;
  }

  /** Lamp shade lit from inside (plan-chambre's glow). */
  glow(color = '#ffd9a0'): MeshStandardMaterial {
    return this.mat('#f3e3c3', { emissive: color, emissiveIntensity: 0.55, doubleSide: true });
  }

  /** Clear glass of the display cabinet and the shower (plan-chambre's glass). */
  glass(): MeshStandardMaterial {
    return this.mat('#cfe6ee', { transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, doubleSide: true });
  }

  /** TV screen: dark, slightly lit in blue (plan-chambre). */
  screen(intensity = 0.35): MeshStandardMaterial {
    return this.mat('#0b0e16', { emissive: '#24365c', emissiveIntensity: intensity, roughness: 0.2 });
  }

  /** Rug material: the canvas pattern of plan-chambre, or its red border color without canvas. */
  rug(round: boolean): MeshStandardMaterial {
    if (!this.rugTextures.has(round)) this.rugTextures.set(round, this.makeRugTexture(round));
    const map = this.rugTextures.get(round) ?? null;
    const key = `rug|${round}`;
    let m = this.mats.get(key);
    if (!m) {
      m = map ? new MeshStandardMaterial({ map, roughness: 1 }) : new MeshStandardMaterial({ color: '#b5643f', roughness: 1 });
      this.mats.set(key, m);
    }
    return m;
  }

  /** Number of cached materials (tests). */
  get size(): number {
    return this.mats.size;
  }

  /** Disposes and forgets the cached materials not in `used` (FurnitureLayer.purge). */
  purge(used: ReadonlySet<Material>): void {
    for (const [key, m] of this.mats) {
      if (used.has(m)) continue;
      m.dispose();
      this.mats.delete(key);
    }
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
    for (const t of this.rugTextures.values()) t?.dispose();
    this.rugTextures.clear();
  }
}

type Paint = string | Material | Material[];

function paint(kit: Kit, p: Paint, opts?: MatOpts): Material | Material[] {
  return typeof p === 'string' ? kit.mat(p, opts) : p;
}

/** plan-chambre's mesh(): positioned, casts and receives shadows. */
export function mesh(geo: BufferGeometry, material: Material | Material[], x = 0, y = 0, z = 0, shadow = true): Mesh {
  const m = new Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Geometry helpers bound to a kit (plan-chambre's box, rbox, cyl, sphere). Sizes in meters, position = center. */
export function parts(kit: Kit) {
  return {
    box: (w: number, h: number, d: number, p: Paint, x: number, y: number, z: number, opts?: MatOpts): Mesh =>
      mesh(new BoxGeometry(pos(w), pos(h), pos(d)), paint(kit, p, opts), x, y, z),
    /** Box with rounded edges of radius r (RoundedBoxGeometry, 3 segments), as plan-chambre's rbox. */
    rbox: (w: number, h: number, d: number, r: number, p: Paint, x: number, y: number, z: number, opts?: MatOpts): Mesh => {
      const W = pos(w);
      const H = pos(h);
      const D = pos(d);
      const rr = Math.max(0.0005, Math.min(r, W / 2 - 0.0005, H / 2 - 0.0005, D / 2 - 0.0005));
      return mesh(new RoundedBoxGeometry(W, H, D, 3, rr), paint(kit, p, opts), x, y, z);
    },
    cyl: (rt: number, rb: number, h: number, p: Paint, x: number, y: number, z: number, opts?: MatOpts, seg = 24): Mesh =>
      mesh(new CylinderGeometry(pos(rt), pos(rb), pos(h), seg), paint(kit, p, opts), x, y, z),
    sphere: (r: number, p: Paint, x: number, y: number, z: number, opts?: MatOpts): Mesh =>
      mesh(new SphereGeometry(pos(r), 20, 14), paint(kit, p, opts), x, y, z),
    plane: (w: number, h: number, p: Paint, x: number, y: number, z: number): Mesh =>
      mesh(new PlaneGeometry(pos(w), pos(h)), paint(kit, p), x, y, z, false),
  };
}

export type Parts = ReturnType<typeof parts>;

/**
 * Vertical prism of a plan polygon (meters, local x and z = plan y) from y0 to y1, with rounded
 * edges: a bevel of `bevel` meters; the outline is expected to be inset by the bevel already
 * (the bevel grows it back to the given size).
 */
export function prism(points: Array<{ x: number; z: number }>, y0: number, y1: number, bevel: number, curveSegments = 12): ExtrudeGeometry {
  const shape = new ThreeShape(points.map((p) => new Vector2(p.x, p.z)));
  return prismOf(shape, y0, y1, bevel, curveSegments);
}

/** Same as prism for a three.js shape (ellipses). */
export function prismOf(shape: ThreeShape, y0: number, y1: number, bevel: number, curveSegments = 12): ExtrudeGeometry {
  const h = Math.max(MIN, y1 - y0);
  const b = Math.max(0, Math.min(bevel, h / 2 - MIN / 2));
  const g = new ExtrudeGeometry(shape, {
    depth: Math.max(MIN / 2, h - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments,
  });
  // shape (x, y) -> (x, z); the extrusion (z in [-b, depth + b]) goes down: y = -z
  g.rotateX(Math.PI / 2);
  g.translate(0, y1 - b, 0);
  return g;
}

/** Group with a name (debugging in the three.js devtools). */
export function named(name: string): Group {
  const g = new Group();
  g.name = name;
  return g;
}
