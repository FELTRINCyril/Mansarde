import { z } from 'zod';
import { MAX_CUPBOARD_DOORS } from '../model/defaults';
import { FORMAT_VERSION } from '../model/types';
import { OBJECT_POSES } from '../model/types';
import type { Anchor, Background, Beam, Cupboard, CustomObjectDef, Level, ManualDimension, Opening, PlacedObject, Project, RoomLabel, Slope, Wall, WallNode } from '../model/types';

// Every object is strict: unknown keys are refused (the export root is the only loose object).

// Numbers: zod 4 already rejects NaN and Infinity. Every coordinate and length is further bounded
// to +-1e6 cm (10 km) so that later geometry (wall lengths, areas) can never overflow.
const MAX_ABS = 1e6;
const id = z.string();
const num = z.number().min(-MAX_ABS).max(MAX_ABS); // signed: coordinates, offsets, rotation, elevation
const pos = z.number().positive().max(MAX_ABS); // strictly positive: sizes, thicknesses, scale
const nonNeg = z.number().min(0).max(MAX_ABS);
const unit = z.number().min(0).max(1);

/** Record of elements keyed by their own id (key and id must agree). */
function keyedRecord<T extends z.ZodType<{ id: string }>>(value: T) {
  return z
    .record(z.string(), value)
    .superRefine((rec, ctx) => {
      for (const [key, el] of Object.entries(rec)) {
        if (el.id !== key) ctx.addIssue({ code: 'custom', path: [key, 'id'], message: 'identifiant incohérent' });
      }
    });
}

const vec2 = z.strictObject({ x: num, y: num });

const projectSettings = z.strictObject({
  defaultWallThickness: pos,
  partitionThickness: pos,
  defaultCeilingHeight: pos,
  gridStep: pos,
});

const wallNode = z.strictObject({ id, x: num, y: num });
const wall = z.strictObject({ id, startNodeId: id, endNodeId: id, thickness: pos, height: pos });

const opening = z.strictObject({
  id,
  wallId: id,
  kind: z.enum(['door', 'window', 'passage']),
  variant: z.enum(['single', 'double', 'sliding', 'pocket', 'fixed', 'none']),
  offset: num,
  width: pos,
  height: pos,
  sillHeight: nonNeg,
  hinge: z.enum(['start', 'end']),
  swing: z.enum(['left', 'right']),
});

const lshape = z.strictObject({ notchWidth: pos, notchDepth: pos });

const pose = z.enum(OBJECT_POSES);

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
  width: pos,
  depth: pos,
  height: pos,
  elevation: nonNeg,
  name: z.string(),
  color: z.string(),
  mirrored: z.boolean(),
  lshape: lshape.nullable(),
  pose,
});

const customObjectDef = z.strictObject({
  id,
  name: z.string(),
  shape: z.enum(['rect', 'circle', 'lshape']),
  width: pos,
  depth: pos,
  height: pos,
  color: z.string(),
  lshape: lshape.nullable(),
  pose,
});

const side = z.enum(['left', 'right']);

const slope = z.strictObject({
  id,
  a: vec2,
  b: vec2,
  side,
  depth: pos,
  heightStart: pos,
  heightEnd: pos,
});

const beam = z.strictObject({
  id,
  a: vec2,
  b: vec2,
  width: pos,
  drop: pos,
  mode: z.enum(['ceiling', 'fixed']),
  bottom: pos,
});

const cupboard = z.strictObject({
  id,
  wallId: id,
  offset: num,
  side,
  width: pos,
  depth: pos,
  plinth: nonNeg,
  heightMode: z.enum(['fixed', 'ceiling']),
  height: pos,
  gap: nonNeg,
  doorCount: z.number().int().min(1).max(MAX_CUPBOARD_DOORS),
  doorType: z.enum(['hinged', 'sliding']),
  color: z.string(),
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
  widthPx: pos,
  heightPx: pos,
  scale: pos,
  x: num,
  y: num,
  rotation: num,
  opacity: unit,
  locked: z.boolean(),
  visible: z.boolean(),
});

const level = z.strictObject({
  id,
  name: z.string(),
  elevation: num,
  height: pos,
  background: background.nullable(),
  nodes: keyedRecord(wallNode),
  walls: keyedRecord(wall),
  openings: keyedRecord(opening),
  objects: keyedRecord(placedObject),
  dimensions: keyedRecord(manualDimension),
  roomLabels: z.array(roomLabel),
  slopes: keyedRecord(slope),
  beams: keyedRecord(beam),
  cupboards: keyedRecord(cupboard),
});

export const projectSchema = z.strictObject({
  formatVersion: z.literal(FORMAT_VERSION),
  id,
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: projectSettings,
  levels: z.array(level),
  customObjects: keyedRecord(customObjectDef),
});

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Image payload: strict base64 (no data: prefix) and a raster mime type the app can display. */
export const imageData64Schema = z.strictObject({
  mime: z.string().regex(/^image\/(png|jpeg|webp|gif)$/, { message: "type d'image non pris en charge" }),
  data: z
    .string()
    .min(1, { message: 'image vide' })
    .refine((d) => d.length % 4 === 0 && BASE64.test(d), { message: 'image corrompue (base64 invalide)' }),
});

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
  Assert<Same<z.infer<typeof slope>, Slope>>,
  Assert<Same<z.infer<typeof beam>, Beam>>,
  Assert<Same<z.infer<typeof cupboard>, Cupboard>>,
];
