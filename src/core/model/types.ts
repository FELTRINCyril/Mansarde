export type Id = string;
export interface Vec2 { x: number; y: number }
export type Ring = Vec2[]; // implicitly closed, first point NOT repeated
export interface PolygonWithHoles { outer: Ring; holes: Ring[] }
export type Shape = PolygonWithHoles[];

export interface ProjectSettings {
  defaultWallThickness: number;
  partitionThickness: number;
  defaultCeilingHeight: number;
  gridStep: number;
}

export interface WallNode { id: Id; x: number; y: number }
export interface Wall { id: Id; startNodeId: Id; endNodeId: Id; thickness: number; height: number }

export type OpeningKind = 'door' | 'window' | 'passage';
export type DoorVariant = 'single' | 'double' | 'sliding' | 'pocket';
export type WindowVariant = 'single' | 'double' | 'sliding' | 'fixed';
export type OpeningVariant = DoorVariant | WindowVariant | 'none';
export interface Opening {
  id: Id; wallId: Id; kind: OpeningKind; variant: OpeningVariant;
  offset: number;      // distance from wall start node to opening center, along axis
  width: number; height: number; sillHeight: number;
  hinge: 'start' | 'end';  // hinge side along the wall axis
  swing: 'left' | 'right'; // side of the wall the leaf opens to (left = +perp(dir))
}

/**
 * How an object stands: on the floor, as a floor covering (rug), on top of another object, tucked
 * under a table or desk, or hung on a wall. `elevation` is always the height of its underside.
 */
export type ObjectPose = 'floor' | 'covering' | 'onTop' | 'tuckable' | 'wall';
export const OBJECT_POSES = ['floor', 'covering', 'onTop', 'tuckable', 'wall'] as const satisfies readonly ObjectPose[];

export type GenericShape = 'rect' | 'circle' | 'lshape';
export interface LShapeParams { notchWidth: number; notchDepth: number }
export type ObjectSource =
  | { kind: 'catalog'; catalogId: string }
  | { kind: 'custom'; customObjectId: Id };
export interface PlacedObject {
  id: Id; source: ObjectSource;
  x: number; y: number; rotation: number; // center, degrees
  width: number; depth: number; height: number; elevation: number;
  name: string; color: string; mirrored: boolean;
  lshape: LShapeParams | null; // only for lshape generic objects
  pose: ObjectPose;
}
export interface CustomObjectDef {
  id: Id; name: string; shape: GenericShape;
  width: number; depth: number; height: number; color: string;
  lshape: LShapeParams | null;
  pose: ObjectPose;
}

/**
 * Roof slope: the ceiling goes down from the start line [a, b] towards `side`
 * (left = +perp(b - a), as for openings), from heightStart on the start line to heightEnd at
 * distance `depth`, then stays at heightEnd.
 */
export interface Slope {
  id: Id; a: Vec2; b: Vec2;            // start line
  side: 'left' | 'right';              // ceiling goes down towards this side; left = +perp(b - a)
  depth: number;                       // distance start line -> end line, > 0
  heightStart: number; heightEnd: number;
}

/** Ceiling beam along the axis [a, b]; its underside follows the ceiling (minus drop) or is fixed. */
export interface Beam {
  id: Id; a: Vec2; b: Vec2; width: number; drop: number;
  mode: 'ceiling' | 'fixed'; bottom: number; // bottom used in 'fixed' mode
}

/** Built-in cupboard standing against one face of a wall; it must fit in the wall length. */
export interface Cupboard {
  id: Id; wallId: Id; offset: number;  // center along the wall axis from the start node
  side: 'left' | 'right';              // wall face it stands against (left = +perp(dir))
  width: number; depth: number; plinth: number;
  heightMode: 'fixed' | 'ceiling'; height: number; gap: number;
  doorCount: number; doorType: 'hinged' | 'sliding'; color: string;
}

export type Anchor =
  | { kind: 'node'; nodeId: Id }
  | { kind: 'objectCorner'; objectId: Id; corner: 0 | 1 | 2 | 3 }
  | { kind: 'point'; x: number; y: number };
export interface ManualDimension { id: Id; a: Anchor; b: Anchor; offset: number }

export interface RoomLabel { id: Id; name: string; anchor: Vec2 } // array order = age (oldest first)

export interface Background {
  imageId: Id; widthPx: number; heightPx: number;
  scale: number;            // cm per image pixel
  x: number; y: number;     // world position of image top-left corner
  rotation: number;         // degrees around top-left corner
  opacity: number;          // 0..1
  locked: boolean; visible: boolean;
}

export interface Level {
  id: Id; name: string; elevation: number; height: number;
  background: Background | null;
  nodes: Record<Id, WallNode>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  objects: Record<Id, PlacedObject>;
  dimensions: Record<Id, ManualDimension>;
  roomLabels: RoomLabel[];
  slopes: Record<Id, Slope>;
  beams: Record<Id, Beam>;
  cupboards: Record<Id, Cupboard>;
}

export const FORMAT_VERSION = 2;
export interface Project {
  formatVersion: number; id: Id; name: string;
  createdAt: string; updatedAt: string; // ISO strings
  settings: ProjectSettings;
  levels: Level[]; // ordered bottom to top
  customObjects: Record<Id, CustomObjectDef>;
}
