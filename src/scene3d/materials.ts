import { Color, DoubleSide, MeshStandardMaterial, type Material, type Texture } from 'three';

/** Colors of the 3D view (spec 8.2, taken from plan-chambre). */
export const COLORS = {
  background: '#eef0f4',
  wall: '#f2eee7',
  ceiling: '#f6f3ee',
  /** plan-chambre lifts the ceiling with this emissive color (CEIL_OPTS): it only gets the hemisphere ground light. */
  ceilingEmissive: '#4d4942',
  slab: '#b9b1a5',
  frame: '#fbfbfa',
  glass: '#bcd7f0',
  glassEmissive: '#9cc3ea',
  door: '#fbfaf7',
  beam: '#a07e5c',
  cupboard: '#e8e1d4',
  handle: '#8f8a82',
  windowSill: '#e9e4dc',
} as const;

export const GLASS_OPACITY = 0.55;
/** Opacity of the walls and floors of the lower levels (spec 8.3). */
export const LOWER_LEVEL_OPACITY = 0.6;

/**
 * The shared materials of a scene. Every mesh of the view uses one of them (cupboards: one per
 * color, created on demand, disposed by purgeCupboards once no cupboard uses that color); they
 * are disposed with the scene, never with a mesh.
 */
export interface Materials {
  wall: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  floor: MeshStandardMaterial;
  slab: MeshStandardMaterial;
  frame: MeshStandardMaterial;
  glass: MeshStandardMaterial;
  door: MeshStandardMaterial;
  beam: MeshStandardMaterial;
  handle: MeshStandardMaterial;
  windowSill: MeshStandardMaterial;
  cupboard(color: string): MeshStandardMaterial;
  /** Disposes and forgets the cupboard materials not in `used` (CupboardLayer.purge). */
  purgeCupboards(used: ReadonlySet<Material>): void;
  dispose(): void;
}

/** MeshStandardMaterial of plan-chambre (`mat`): roughness 0.8, no metal. */
const standard = (color: string, extra: ConstructorParameters<typeof MeshStandardMaterial>[0] = {}): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra });

/**
 * Materials of plan-chambre. `parquet` is the floor texture (textures.ts; null where there is no
 * canvas, e.g. in unit tests: the floor is then a plain wood color). `opacity` < 1 gives the
 * see-through variant used for the lower levels.
 */
export function createMaterials(parquet: Texture | null, opacity = 1): Materials {
  const see = opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {};
  const cupboards = new Map<string, MeshStandardMaterial>();
  const m: Omit<Materials, 'cupboard' | 'purgeCupboards' | 'dispose'> = {
    wall: standard(COLORS.wall, see),
    ceiling: standard(COLORS.ceiling, { emissive: new Color(COLORS.ceilingEmissive), ...see }),
    floor: parquet ? new MeshStandardMaterial({ map: parquet, roughness: 0.7, ...see }) : standard('#d8b98f', { roughness: 0.7, ...see }),
    slab: standard(COLORS.slab, see),
    frame: standard(COLORS.frame, see),
    glass: new MeshStandardMaterial({
      color: COLORS.glass,
      emissive: new Color(COLORS.glassEmissive),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: GLASS_OPACITY * opacity,
      depthWrite: false,
      side: DoubleSide,
    }),
    door: standard(COLORS.door, see),
    beam: standard(COLORS.beam, see),
    handle: standard(COLORS.handle, { metalness: 0.6, roughness: 0.3, ...see }),
    windowSill: standard(COLORS.windowSill, see),
  };
  return {
    ...m,
    cupboard(color) {
      let c = cupboards.get(color);
      if (!c) {
        c = standard(color, { roughness: 0.6, ...see });
        cupboards.set(color, c);
      }
      return c;
    },
    purgeCupboards(used) {
      for (const [color, c] of cupboards) {
        if (used.has(c)) continue;
        c.dispose();
        cupboards.delete(color);
      }
    },
    dispose() {
      for (const x of Object.values(m)) x.dispose();
      for (const x of cupboards.values()) x.dispose();
      cupboards.clear();
      // the parquet texture belongs to the scene (shared by both material sets): disposed there
    },
  };
}
