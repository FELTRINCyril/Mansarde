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
}
export interface CustomObjectDef {
  id: Id; name: string; shape: GenericShape;
  width: number; depth: number; height: number; color: string;
  lshape: LShapeParams | null;
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
}

export const FORMAT_VERSION = 1;
export interface Project {
  formatVersion: number; id: Id; name: string;
  createdAt: string; updatedAt: string; // ISO strings
  settings: ProjectSettings;
  levels: Level[]; // ordered bottom to top
  customObjects: Record<Id, CustomObjectDef>;
}
