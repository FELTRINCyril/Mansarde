import { DEFAULT_SETTINGS, OPENING_DEFAULTS } from './defaults';
import { newId } from './ids';
import { FORMAT_VERSION } from './types';
import type { Level, ObjectSource, Opening, OpeningKind, PlacedObject, Project } from './types';

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
    ...overrides,
  };
}
