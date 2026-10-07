export const DEFAULT_SETTINGS = { defaultWallThickness: 20, partitionThickness: 7, defaultCeilingHeight: 250, gridStep: 10 } as const;
export const OPENING_DEFAULTS = {
  door: { width: 83, height: 204, sillHeight: 0, variant: 'single' },
  window: { width: 120, height: 135, sillHeight: 90, variant: 'single' },
  passage: { width: 90, height: 204, sillHeight: 0, variant: 'none' },
} as const;
export const MIN_WALL_LENGTH = 1;      // cm
export const SNAP_PX = 8;              // snap threshold in screen pixels
export const SLAB_THICKNESS = 20;      // used to stack levels
