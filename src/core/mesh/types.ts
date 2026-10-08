import type { Id } from '../model/types';

/**
 * Indexed triangle mesh, ready for a three.js BufferGeometry. Units: METERS, three.js axes:
 * plan x / 100 -> x, height / 100 -> y (up), plan y / 100 -> z; heights from the floor of the
 * level (the level elevation is applied by the renderer). Triangles are counter-clockwise seen
 * from their normal (front faces); faces are flat shaded (no vertex shared between faces).
 */
export interface MeshData { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }

export interface CupboardParts { body: MeshData; doors: MeshData[]; handles: MeshData }

export interface LevelMeshes {
  /** One mesh per wall (ruling V2-R14), so that the view can hide a single wall. */
  walls: Array<{ wallId: Id; mesh: MeshData }>;
  floors: Array<{ roomKey: string; mesh: MeshData }>;
  ceilings: Array<{ roomKey: string; mesh: MeshData }>;
  beams: Array<{ id: Id; mesh: MeshData }>;
  cupboards: Array<{ id: Id; parts: CupboardParts }>;
}
