export const DEFAULT_SETTINGS = { defaultWallThickness: 20, partitionThickness: 7, defaultCeilingHeight: 250, gridStep: 10 } as const;
export const OPENING_DEFAULTS = {
  door: { width: 83, height: 204, sillHeight: 0, variant: 'single' },
  window: { width: 120, height: 135, sillHeight: 90, variant: 'single' },
  passage: { width: 90, height: 204, sillHeight: 0, variant: 'none' },
} as const;
export const MIN_WALL_LENGTH = 1;      // cm
export const SNAP_PX = 8;              // snap threshold in screen pixels
export const SLAB_THICKNESS = 20;      // used to stack levels
export const SLOPE_DEFAULT_END = 150;  // cm, height at the end line of a new slope
export const BEAM_DEFAULTS = { width: 12, drop: 15 } as const;
export const CUPBOARD_DEFAULTS = { width: 120, depth: 60, plinth: 10, height: 220, gap: 2, color: '#e8e1d4', doorType: 'hinged' } as const;
/** Doors of a cupboard of that width: about one door per 55 cm, at least one. */
/** Upper bound of Cupboard.doorCount (ruling V2-R2): keeps hand-edited files from costing an absurd 3D mesh. */
export const MAX_CUPBOARD_DOORS = 20;
export const doorCountFor = (width: number): number => Math.max(1, Math.round(width / 55));
