import { Box3, Scene, Vector3, type Object3D, type Texture } from 'three';
import { deriveLevel, type DerivedLevel } from '@/core/geometry/derived';
import { pointInRing } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import type { Id, Level, Project } from '@/core/model/types';
import type { SelectionItem } from '@/editor/selection';
import { boundsOf, CameraRig, presetPose, type Bounds, type Preset } from './camera';
import { buildLevelView, type LevelView } from './levelMeshes';
import { createMaterials, LOWER_LEVEL_OPACITY, type Materials } from './materials';
import { createRenderer, setupScene, type Lights } from './renderer';
import { createParquetTexture, createRugTexture } from './textures';
import { AlertTints, type AlertSeverity } from './alerts';
import { FurnitureLayer, Kit } from './furniture';
import { createLabels } from './labels';

export type { Preset } from './camera';

export interface Scene3DInput {
  project: Project;
  level: Level;
  /** Levels shown under the active one (empty unless "Afficher les niveaux inférieurs"), bottom first. */
  lowerLevels: Level[];
  selection: SelectionItem[];
  /** Severity by target id (task 12 tints the furniture). */
  alerts: Map<string, 'error' | 'warning'>;
  /** Object names (task 12). */
  showLabels: boolean;
  hideAllWalls: boolean;
}

export interface Scene3D {
  update(input: Scene3DInput): void;
  setPreset(p: Preset): void;
  resize(): void;
  dispose(): void;
}

export interface Scene3DCallbacks { onSelect(item: SelectionItem | null): void }

/**
 * Counters for the e2e tests (exposed in DEV by Plan3DView): live scenes, rendered frames, level
 * view builds, the camera position of the last frame, and what the renderer still held after the last dispose: 0 geometries and 1
 * texture when everything of ours was released (three.js keeps its DFG_LUT, a texture of its own
 * shared by every renderer, freed with the context).
 */
export const scene3dStats = {
  live: 0,
  frames: 0,
  builds: 0,
  /** Camera position (m) at the last frame. */
  camera: [0, 0, 0] as [number, number, number],
  lastDisposed: null as null | { geometries: number; textures: number },
};

/** Level fields the structure view depends on; the objects, dimensions and names do not matter. */
const STRUCTURE_KEYS = ['nodes', 'walls', 'openings', 'roomLabels', 'slopes', 'beams', 'cupboards', 'height', 'elevation'] as const;
const sameStructure = (a: Level, b: Level): boolean => a.id === b.id && STRUCTURE_KEYS.every((k) => a[k] === b[k]);

/**
 * DEV test hook (exposed by Plan3DView as window.__planMaison3DProbe): the color of the pixel at
 * the top center of an object, read from the canvas right after a render (rgba 0..255), or null
 * when the object is not shown or off screen.
 */
export const scene3dProbe = {
  objectPixel: null as null | ((objectId: Id) => [number, number, number, number] | null),
};

interface Shown { level: Level; d: DerivedLevel; view: LevelView }

/** The room of the selection: a selected room, else the room around the first selected object. */
function roomOfSelection(selection: SelectionItem[], level: Level, d: DerivedLevel): Room | null {
  const room = selection.find((s) => s.kind === 'room');
  if (room) return d.rooms.find((r) => r.key === room.id) ?? null;
  for (const s of selection) {
    const o = s.kind === 'object' ? level.objects[s.id] : undefined;
    if (o) return d.rooms.find((r) => pointInRing(o, r.ring)) ?? null;
  }
  return null;
}

/**
 * The 3D view in `container` (spec 8): renderer, lights, materials and camera of plan-chambre, the
 * active level (walls, floors, ceilings, beams, cupboards, doors and windows) and the lower levels
 * when asked. Renders on demand: a frame only when update() changed something, the camera moves
 * (animation, damping, gesture) or the size changes. Throws Error('webgl') when WebGL is missing.
 * `_cb.onSelect` is called by the picking of task 13.
 */
export function createScene3D(container: HTMLElement, _cb: Scene3DCallbacks): Scene3D {
  const renderer = createRenderer();
  const canvas = renderer.domElement;
  canvas.className = 'scene3d-canvas';
  canvas.dataset.testid = 'scene3d-canvas';
  container.appendChild(canvas);
  scene3dStats.live++;

  const scene = new Scene();
  const lights: Lights = setupScene(scene);
  let parquet: Texture | null = null;
  try {
    parquet = createParquetTexture();
  } catch {
    parquet = null; // no 2D canvas: plain floor color
  }
  const mats: Materials = createMaterials(parquet);
  let lowerMats: Materials | null = null;
  // furniture (task 12): builders, name labels, alert tint
  const labels = createLabels(container);
  const furniture = new FurnitureLayer(
    new Kit((round) => {
      try {
        return createRugTexture(round);
      } catch {
        return null; // no 2D canvas: plain rug
      }
    }),
    labels,
  );
  scene.add(furniture.root);
  const tints = new AlertTints();

  let frameId: number | null = null;
  let disposed = false;
  const frame = (now: number) => {
    frameId = null;
    if (disposed) return;
    const moving = rig.tick(now);
    renderer.render(scene, rig.camera);
    labels.render(scene, rig.camera);
    scene3dStats.frames++;
    scene3dStats.camera = rig.camera.position.toArray();
    if (moving) invalidate();
  };
  const invalidate = () => {
    if (frameId === null && !disposed) frameId = requestAnimationFrame(frame);
  };
  const rig = new CameraRig(canvas, invalidate);

  let shown: Shown | null = null;
  const lower = new Map<Id, Shown>();
  let bounds: Bounds = boundsOf([]);
  let framedLevelId: Id | null = null;
  let selection: SelectionItem[] = [];

  const applyVisibility = (hideAllWalls: boolean) => {
    if (!shown) return;
    // as plan-chambre's "hide the walls": the ceilings and beams go with them
    shown.view.walls.visible = !hideAllWalls;
    shown.view.ceilings.visible = !hideAllWalls;
    shown.view.beams.visible = !hideAllWalls;
  };

  const showLevel = (level: Level): void => {
    if (shown && shown.level === level) return;
    const d = deriveLevel(level);
    if (shown && sameStructure(shown.level, level) && shown.d === d) {
      shown.level = level;
      return;
    }
    shown?.view.dispose();
    const view = buildLevelView(level, d, mats);
    scene3dStats.builds++;
    scene.add(view.root);
    shown = { level, d, view };
    bounds = boundsOf([...d.outlines.values()]);
    rig.setBounds(bounds);
    lights.frame(bounds, level.elevation / 100);
  };

  const showLower = (levels: Level[]): void => {
    const keep = new Set(levels.map((l) => l.id));
    for (const [id, s] of lower) {
      if (!keep.has(id)) {
        s.view.dispose();
        lower.delete(id);
      }
    }
    for (const level of levels) {
      const prev = lower.get(level.id);
      const d = deriveLevel(level);
      if (prev && sameStructure(prev.level, level) && prev.d === d) continue;
      prev?.view.dispose();
      lowerMats ??= createMaterials(parquet, LOWER_LEVEL_OPACITY);
      const view = buildLevelView(level, d, lowerMats, { lower: true });
      scene.add(view.root);
      lower.set(level.id, { level, d, view });
    }
  };

  /** The furniture and cupboard groups of the alert keys (`object:<id>`, `cupboard:<id>`). */
  const alertTargets = (alerts: ReadonlyMap<string, AlertSeverity>): Map<Object3D, AlertSeverity> => {
    const out = new Map<Object3D, AlertSeverity>();
    for (const [key, severity] of alerts) {
      const i = key.indexOf(':');
      const kind = key.slice(0, i);
      const id = key.slice(i + 1);
      const g = kind === 'object' ? furniture.groupOf(id) : kind === 'cupboard' ? shown?.view.cupboards.getObjectByName(`cupboard:${id}`) : undefined;
      if (g) out.set(g, severity);
    }
    return out;
  };

  scene3dProbe.objectPixel = (objectId) => {
    const g = furniture.groupOf(objectId);
    if (!g || disposed) return null;
    g.updateMatrixWorld(true);
    const box = new Box3().setFromObject(g, true);
    rig.camera.updateMatrixWorld();
    const p = new Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(rig.camera);
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    renderer.render(scene, rig.camera);
    const gl = renderer.getContext();
    const x = Math.round(((p.x + 1) / 2) * gl.drawingBufferWidth);
    const y = Math.round(((p.y + 1) / 2) * gl.drawingBufferHeight);
    const out = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0]!, out[1]!, out[2]!, out[3]!];
  };

  const goToPreset = (p: Preset, instant: boolean) => {
    const room = p === 'room' && shown ? roomOfSelection(selection, shown.level, shown.d) : null;
    rig.goTo(presetPose(p === 'room' && !room ? 'overview' : p, bounds, room, rig.camera.aspect), instant, performance.now());
    invalidate();
  };

  return {
    update(input) {
      if (disposed) return;
      selection = input.selection;
      showLevel(input.level);
      showLower(input.lowerLevels);
      applyVisibility(input.hideAllWalls);
      furniture.sync(input.level, input.project.customObjects, input.showLabels);
      tints.sync(alertTargets(input.alerts));
      if (framedLevelId !== input.level.id) {
        framedLevelId = input.level.id;
        goToPreset('overview', true);
      }
      invalidate();
    },
    setPreset(p) {
      if (!disposed) goToPreset(p, false);
    },
    resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (disposed || w <= 0 || h <= 0) return;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      rig.setAspect(w / h);
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      rig.dispose();
      tints.dispose();
      furniture.dispose();
      labels.dispose();
      scene3dProbe.objectPixel = null;
      shown?.view.dispose();
      shown = null;
      for (const s of lower.values()) s.view.dispose();
      lower.clear();
      mats.dispose();
      lowerMats?.dispose();
      parquet?.dispose();
      lights.sun.dispose(); // its shadow map (color and depth textures)
      renderer.renderLists.dispose();
      scene3dStats.lastDisposed = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      scene3dStats.live--;
    },
  };
}
