import { z } from 'zod';
import { FORMAT_VERSION } from '../model/types';
import type { Anchor, Background, CustomObjectDef, Level, ManualDimension, Opening, PlacedObject, Project, RoomLabel, Wall, WallNode } from '../model/types';

// Every object is strict: unknown keys are refused (the export root is the only loose object).

const id = z.string();
const num = z.number(); // zod 4: rejects NaN and Infinity

const vec2 = z.strictObject({ x: num, y: num });

const projectSettings = z.strictObject({
  defaultWallThickness: num,
  partitionThickness: num,
  defaultCeilingHeight: num,
  gridStep: num,
});

const wallNode = z.strictObject({ id, x: num, y: num });
const wall = z.strictObject({ id, startNodeId: id, endNodeId: id, thickness: num, height: num });

const opening = z.strictObject({
  id,
  wallId: id,
  kind: z.enum(['door', 'window', 'passage']),
  variant: z.enum(['single', 'double', 'sliding', 'pocket', 'fixed', 'none']),
  offset: num,
  width: num,
  height: num,
  sillHeight: num,
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['left', 'right']),
});

const lshape = z.strictObject({ notchWidth: num, notchDepth: num });

const objectSource = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('catalog'), catalogId: z.string() }),
  z.strictObject({ kind: z.literal('custom'), customObjectId: id }),
]);

const placedObject = z.strictObject({
  id,
  source: objectSource,
  x: num,
  y: num,
  rotation: num,
  width: num,
  depth: num,
  height: num,
  elevation: num,
  name: z.string(),
  color: z.string(),
  mirrored: z.boolean(),
  lshape: lshape.nullable(),
});

const customObjectDef = z.strictObject({
  id,
  name: z.string(),
  shape: z.enum(['rect', 'circle', 'lshape']),
  width: num,
  depth: num,
  height: num,
  color: z.string(),
  lshape: lshape.nullable(),
});

const anchor = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('node'), nodeId: id }),
  z.strictObject({
    kind: z.literal('objectCorner'),
    objectId: id,
    corner: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  }),
  z.strictObject({ kind: z.literal('point'), x: num, y: num }),
]);

const manualDimension = z.strictObject({ id, a: anchor, b: anchor, offset: num });

const roomLabel = z.strictObject({ id, name: z.string(), anchor: vec2 });

const background = z.strictObject({
  imageId: id,
  widthPx: num,
  heightPx: num,
  scale: num,
  x: num,
  y: num,
  rotation: num,
  opacity: num,
  locked: z.boolean(),
  visible: z.boolean(),
});

const level = z.strictObject({
  id,
  name: z.string(),
  elevation: num,
  height: num,
  background: background.nullable(),
  nodes: z.record(z.string(), wallNode),
  walls: z.record(z.string(), wall),
  openings: z.record(z.string(), opening),
  objects: z.record(z.string(), placedObject),
  dimensions: z.record(z.string(), manualDimension),
  roomLabels: z.array(roomLabel),
});

export const projectSchema = z.strictObject({
  formatVersion: z.literal(FORMAT_VERSION),
  id,
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: projectSettings,
  levels: z.array(level),
  customObjects: z.record(z.string(), customObjectDef),
});

export const imageData64Schema = z.strictObject({ mime: z.string(), data: z.string() });

/** Root of an export file: loose on purpose, so later versions may add informative keys. */
export const exportFileSchema = z.looseObject({
  app: z.literal('plan-maison'),
  formatVersion: z.number().int().min(1),
  project: projectSchema,
  images: z.record(z.string(), imageData64Schema),
});

// Compile-time guard: the schema and the model types must be mutually assignable.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type SchemaGuards = [
  // formatVersion is the literal FORMAT_VERSION in the schema, plain number in the type
  Assert<Same<Omit<z.infer<typeof projectSchema>, 'formatVersion'>, Omit<Project, 'formatVersion'>>>,
  Assert<Same<z.infer<typeof level>, Level>>,
  Assert<Same<z.infer<typeof wall>, Wall>>,
  Assert<Same<z.infer<typeof wallNode>, WallNode>>,
  Assert<Same<z.infer<typeof opening>, Opening>>,
  Assert<Same<z.infer<typeof placedObject>, PlacedObject>>,
  Assert<Same<z.infer<typeof customObjectDef>, CustomObjectDef>>,
  Assert<Same<z.infer<typeof anchor>, Anchor>>,
  Assert<Same<z.infer<typeof manualDimension>, ManualDimension>>,
  Assert<Same<z.infer<typeof roomLabel>, RoomLabel>>,
  Assert<Same<z.infer<typeof background>, Background>>,
];
