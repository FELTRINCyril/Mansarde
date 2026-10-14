export type SourceName = 'kenney' | 'quaternius' | 'sh3d' | 'polyhaven';

/** A model as found in its source, before conversion. Sizes in cm. */
export interface RawItem {
  source: SourceName;
  /** Library inside the source (Sweet Home 3D), else the source name. */
  library: string;
  /** Unique within the library (file stem, or Poly Haven id). */
  key: string;
  /** Identifier in the source catalog. */
  sourceId: string;
  name: string;
  nameFr?: string;
  category?: string;
  tags?: string[];
  width?: number;
  depth?: number;
  height?: number;
  elevation?: number;
  creator?: string;
  license: string;
  pageUrl?: string;
  /** .glb, .obj or .gltf */
  modelPath: string;
  iconPath?: string;
  /** Sweet Home 3D modelRotation: 3 x 3 matrix, row by row. */
  modelRotation?: number[];
  doorOrWindow?: boolean;
  staircase?: boolean;
}

/** Result of staging one model. */
export interface StagedItem extends RawItem {
  ok: boolean;
  reason?: string;
  glb?: string;
  bytes?: number;
  tris?: number;
  materials?: number;
  outline?: number[][];
  detail?: number[][];
  /** Natural size of the converted model (cm, its own units for Kenney and Quaternius). */
  natural?: { w: number; d: number; h: number };
  rendered?: boolean;
}
