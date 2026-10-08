import { BEAM_DEFAULTS, CUPBOARD_DEFAULTS, DEFAULT_SETTINGS, OPENING_DEFAULTS, SLOPE_DEFAULT_END, doorCountFor } from './defaults';
import { newId } from './ids';
import { FORMAT_VERSION } from './types';
import type { Beam, Cupboard, Id, Level, ObjectSource, Opening, OpeningKind, PlacedObject, Project, Slope, Vec2 } from './types';

export function createLevel(name: string, elevation: number, height: number): Level {
  return {
    id: newId(),
    name,
    elevation,
    height,
    background: null,
    nodes: {},
    walls: {},
    openings: {},
    objects: {},
    dimensions: {},
    roomLabels: [],
    slopes: {},
    beams: {},
    cupboards: {},
  };
}

export function createProject(name: string, now: Date = new Date()): Project {
  const iso = now.toISOString();
  return {
    formatVersion: FORMAT_VERSION,
    id: newId(),
    name,
    createdAt: iso,
    updatedAt: iso,
    settings: { ...DEFAULT_SETTINGS },
    levels: [createLevel('RDC', 0, DEFAULT_SETTINGS.defaultCeilingHeight)],
    customObjects: {},
  };
}

export function createOpening(
  wallId: string,
  kind: OpeningKind,
  offset: number,
  overrides: Partial<Opening> = {},
): Opening {
  const d = OPENING_DEFAULTS[kind];
  return {
    id: newId(),
    wallId,
    kind,
    variant: d.variant,
    offset,
    width: d.width,
    height: d.height,
    sillHeight: d.sillHeight,
    hinge: 'start',
    swing: 'left',
    ...overrides,
  };
}

export function createObjectFromSize(
  source: ObjectSource,
  x: number,
  y: number,
  size: { width: number; depth: number; height: number },
  name: string,
  color: string,
  overrides: Partial<PlacedObject> = {},
): PlacedObject {
  return {
    id: newId(),
    source,
    x,
    y,
    rotation: 0,
    width: size.width,
    depth: size.depth,
    height: size.height,
    elevation: 0,
    name,
    color,
    mirrored: false,
    lshape: null,
    pose: 'floor',
    ...overrides,
  };
}

export function createSlope(
  a: Vec2,
  b: Vec2,
  side: 'left' | 'right',
  depth: number,
  heightStart: number,
  heightEnd = SLOPE_DEFAULT_END,
): Slope {
  return { id: newId(), a: { ...a }, b: { ...b }, side, depth, heightStart, heightEnd };
}

/**
 * Beam in 'ceiling' mode by default. `bottom` only matters in 'fixed' mode; it defaults to the
 * default ceiling height minus the drop so that switching modes starts from a plausible value.
 */
export function createBeam(a: Vec2, b: Vec2, overrides: Partial<Beam> = {}): Beam {
  return {
    id: newId(),
    a: { ...a },
    b: { ...b },
    width: BEAM_DEFAULTS.width,
    drop: BEAM_DEFAULTS.drop,
    mode: 'ceiling',
    bottom: DEFAULT_SETTINGS.defaultCeilingHeight - BEAM_DEFAULTS.drop,
    ...overrides,
  };
}

/** Cupboard of fixed height; doorCount follows the final width unless given explicitly. */
export function createCupboard(wallId: Id, offset: number, side: 'left' | 'right', overrides: Partial<Cupboard> = {}): Cupboard {
  const width = overrides.width ?? CUPBOARD_DEFAULTS.width;
  return {
    id: newId(),
    wallId,
    offset,
    side,
    width,
    depth: CUPBOARD_DEFAULTS.depth,
    plinth: CUPBOARD_DEFAULTS.plinth,
    heightMode: 'fixed',
    height: CUPBOARD_DEFAULTS.height,
    gap: CUPBOARD_DEFAULTS.gap,
    doorCount: doorCountFor(width),
    doorType: CUPBOARD_DEFAULTS.doorType,
    color: CUPBOARD_DEFAULTS.color,
    ...overrides,
  };
}
