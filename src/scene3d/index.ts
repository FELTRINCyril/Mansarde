import { Box3, Mesh, Scene, Vector3, type Object3D, type Texture } from 'three';
import { ceilingWithoutBeams } from '@/core/geometry/ceiling';
import { deriveLevel, deriveVolumes, type DerivedLevel } from '@/core/geometry/derived';
import { pointInRing } from '@/core/geometry/polygon';
import type { Room } from '@/core/geometry/rooms';
import type { Id, Level, Project } from '@/core/model/types';
import type { SelectionItem } from '@/editor/selection';
import { boundsOf, CameraRig, MEDIUM, presetPose, tallFootprints, unionBounds, type Bounds, type Preset } from './camera';
import { hiddenCeilings, hiddenWalls } from './cutaway';
import { buildLevelView, type LevelView } from './levelMeshes';
import { onClick, pickAt, SelectionOutline } from './picking';
import { CupboardLayer, sameStructure } from './sync';
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

/**
 * onSelect: picking (task 13). onError: a failure outside update / setPreset / resize (a frame of
 * the render loop, the WebGL context lost); the view stops drawing and the host shows it.
 */
export interface Scene3DCallbacks { onSelect(item: SelectionItem | null): void; onError?(error: Error): void }

/**
 * Counters for the e2e tests (exposed in DEV by Plan3DView): live scenes, rendered frames, level
 * view builds, the camera position of the last frame, `idle` (no frame scheduled: nothing moves,
 * the view is up to date), and what the renderer still held after the last dispose: 0 geometries and 1
 * texture when everything of ours was released (three.js keeps its DFG_LUT, a texture of its own
 * shared by every renderer, freed with the context).
 */
export const scene3dStats = {
  live: 0,
  frames: 0,
  /** Builds of the structure of the active level (walls, floors, ceilings, beams). */
  builds: 0,
  /** Builds of a piece of furniture, of a cupboard (each rebuilt alone, spec 8.3). */
  objectBuilds: 0,
  cupboardBuilds: 0,
  /** What the cut-away hid at the last frame: walls of the active level, room ceilings. */
  hiddenWalls: 0,
  hiddenCeilings: 0,
  /** Elements outlined as selected. */
  outlined: 0,
  /** Lower levels shown under the active one. */
  lowerLevels: 0,
  /** Camera position and orbit target (m) at the last frame. */
  camera: [0, 0, 0] as [number, number, number],
  target: [0, 0, 0] as [number, number, number],
  idle: true,
  lastDisposed: null as null | { geometries: number; textures: number },
};

/**
 * DEV test hook (exposed by Plan3DView as window.__planMaison3DProbe): the color of the pixel at
 * the top center of an object, read from the canvas right after a render (rgba 0..255), or null
 * when the object is not shown or off screen.
 */
export const scene3dProbe = {
  objectPixel: null as null | ((objectId: Id) => [number, number, number, number] | null),
  /** Where the top center of an object is drawn, in CSS px from the top left of the canvas (null: not shown). */
  objectScreen: null as null | ((objectId: Id) => { x: number; y: number } | null),
  /** Position (plan cm: x, y; elevation cm) of the 3D group of an object, null when not built. */
  objectPlace: null as null | ((objectId: Id) => { x: number; y: number; z: number } | null),
};

interface Shown { level: Level; d: DerivedLevel; view: LevelView; box: Bounds }

/** Box (m) of a level: its wall outlines, from its elevation to the top of its walls. */
function levelBox(level: Level, d: DerivedLevel): Bounds {
  const top = Math.max(level.height, ...Object.values(level.walls).map((w) => w.height));
  return boundsOf([...d.outlines.values()], level.elevation / 100, (level.elevation + top) / 100);
}

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
 * active level (walls, floors, ceilings, beams, cupboards, doors and windows, furniture) and the
 * lower levels when asked. Renders on demand: a frame only when update() changed something, the
 * camera moves (animation, damping, gesture) or the size changes. Each frame hides the walls
 * between the camera and its target and the ceilings it is above (cutaway.ts). A click on a piece
 * of furniture, a cupboard or a beam selects it (`cb.onSelect`, picking.ts). Throws
 * Error('webgl') when WebGL is missing; `cb.onError` reports a failure of the render loop or a lost
 * WebGL context, after which the view no longer draws.
 */
export function createScene3D(container: HTMLElement, cb: Scene3DCallbacks): Scene3D {
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
  const cupboards = new CupboardLayer(mats);
  scene.add(cupboards.root);
  const tints = new AlertTints();
  const outline = new SelectionOutline();

  let frameId: number | null = null;
  let disposed = false;
  let failed = false;
  const fail = (e: unknown) => {
    if (failed || disposed) return;
    failed = true;
    scene3dStats.idle = true;
    cb.onError?.(e instanceof Error ? e : new Error(String(e)));
  };
  const frame = (now: number) => {
    frameId = null;
    if (disposed || failed) return;
    try {
      const moving = rig.tick(now);
      cutaway();
      renderer.render(scene, rig.camera);
      labels.render(scene, rig.camera);
      scene3dStats.frames++;
      scene3dStats.camera = rig.camera.position.toArray();
      scene3dStats.target = rig.controls.target.toArray();
      if (moving) invalidate();
    } catch (e) {
      fail(e);
    }
    if (frameId === null) scene3dStats.idle = true;
  };
  const invalidate = () => {
    if (frameId === null && !disposed && !failed) {
      frameId = requestAnimationFrame(frame);
      scene3dStats.idle = false;
    }
  };
  // a context lost while the view lives (GPU reset, too many contexts); our own dispose loses it too
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    fail(new Error('webgl-context-lost'));
  });
  const rig = new CameraRig(canvas, invalidate);

  let shown: Shown | null = null;
  const lower = new Map<Id, Shown>();
  /** Box of the overview and top presets: the active level and the lower levels shown. */
  let fitBox: Bounds = boundsOf([]);
  let lowerKey = '';
  let framedLevelId: Id | null = null;
  let selection: SelectionItem[] = [];
  let project: Project | null = null;
  let hideAllWalls = false;

  /**
   * Cut-away of the active level for the current camera (spec 8.3), before each frame: walls
   * between the camera and its target, facade walls turned towards it, ceilings and beams it is
   * above; "Cacher tous les murs" hides every wall, ceiling and beam (plan-chambre).
   */
  const cutaway = () => {
    if (!shown) return;
    const v = shown.view;
    const cam = rig.camera.position;
    const at = rig.controls.target;
    const eye = { x: cam.x * 100, y: cam.z * 100 };
    const walls = hideAllWalls ? null : hiddenWalls(shown.d, eye, { x: at.x * 100, y: at.z * 100 });
    const ceilings = hideAllWalls ? null : hiddenCeilings(shown.level, shown.d.rooms, eye, cam.y * 100 - shown.level.elevation);
    let hw = 0;
    for (const [id, g] of v.wallGroups) {
      g.visible = walls !== null && !walls.has(id);
      if (!g.visible) hw++;
    }
    let hc = 0;
    for (const m of v.ceilings.children) {
      m.visible = ceilings !== null && !ceilings.rooms.has(m.userData.roomKey as string);
      if (!m.visible) hc++;
    }
    for (const m of v.beams.children) m.visible = ceilings !== null && !ceilings.beams.has(m.userData.beamId as string);
    scene3dStats.hiddenWalls = hw;
    scene3dStats.hiddenCeilings = hc;
  };

  const showLevel = (level: Level): boolean => {
    if (shown && shown.level === level) return false;
    const d = deriveLevel(level);
    if (shown && sameStructure(shown.level, level) && shown.d === d) {
      shown.level = level;
      return false;
    }
    shown?.view.dispose();
    // the cupboards are kept by the CupboardLayer, rebuilt one by one
    const view = buildLevelView(level, d, mats, { cupboards: false });
    scene3dStats.builds++;
    scene.add(view.root);
    shown = { level, d, view, box: levelBox(level, d) };
    lights.frame(shown.box, level.elevation / 100);
    return true;
  };

  /** Shows the lower levels (walls, slab and floors, see-through); true when the set of levels changed. */
  const showLower = (levels: Level[]): boolean => {
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
      lower.set(level.id, { level, d, view, box: levelBox(level, d) });
    }
    const key = levels.map((l) => l.id).join(',');
    const changed = key !== lowerKey;
    lowerKey = key;
    return changed;
  };

  /** The furniture and cupboard groups of the alert keys (`object:<id>`, `cupboard:<id>`). */
  const alertTargets = (alerts: ReadonlyMap<string, AlertSeverity>): Map<Object3D, AlertSeverity> => {
    const out = new Map<Object3D, AlertSeverity>();
    for (const [key, severity] of alerts) {
      const i = key.indexOf(':');
      const kind = key.slice(0, i);
      const id = key.slice(i + 1);
      const g = kind === 'object' ? furniture.groupOf(id) : kind === 'cupboard' ? cupboards.groupOf(id) : undefined;
      if (g) out.set(g, severity);
    }
    return out;
  };

  /** The 3D elements of the selected objects, cupboards and beams. */
  const selectedTargets = (): Array<{ root: Object3D; box: boolean }> => {
    const out: Array<{ root: Object3D; box: boolean }> = [];
    for (const s of selection) {
      if (s.kind === 'object') {
        const g = furniture.groupOf(s.id);
        if (g) out.push({ root: g, box: true });
      } else if (s.kind === 'cupboard') {
        const g = cupboards.groupOf(s.id);
        if (g) out.push({ root: g, box: false });
      } else if (s.kind === 'beam') {
        const m = shown?.view.beams.getObjectByName(`beam:${s.id}`);
        if (m) out.push({ root: m, box: false });
      }
    }
    return out;
  };

  // picking: a click selects what is under it (walls, floors and ceilings shown hide what is behind)
  const offClick = onClick(canvas, (ndc) => {
    if (disposed || failed || !shown) return;
    try {
      rig.camera.updateMatrixWorld();
      cb.onSelect(pickAt(rig.camera, ndc, [shown.view.root, cupboards.root, furniture.root]));
    } catch (e) {
      fail(e);
    }
  });

  const groupBox = (g: Object3D) => {
    g.updateMatrixWorld(true);
    // the object, without its label nor its selection outline
    const box = new Box3();
    g.traverse((n) => {
      if (n instanceof Mesh && !n.userData.outline) box.expandByObject(n, true);
    });
    return box;
  };
  const screenOf = (objectId: Id): { p: Vector3; box: Box3 } | null => {
    const g = furniture.groupOf(objectId);
    if (!g || disposed || failed) return null;
    const box = groupBox(g);
    rig.camera.updateMatrixWorld();
    const p = new Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(rig.camera);
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return null;
    return { p, box };
  };
  scene3dProbe.objectPixel = (objectId) => {
    const s = screenOf(objectId);
    if (!s) return null;
    cutaway();
    renderer.render(scene, rig.camera);
    const gl = renderer.getContext();
    const x = Math.round(((s.p.x + 1) / 2) * gl.drawingBufferWidth);
    const y = Math.round(((s.p.y + 1) / 2) * gl.drawingBufferHeight);
    const out = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0]!, out[1]!, out[2]!, out[3]!];
  };
  scene3dProbe.objectScreen = (objectId) => {
    const s = screenOf(objectId);
    if (!s) return null;
    const r = canvas.getBoundingClientRect();
    return { x: ((s.p.x + 1) / 2) * r.width, y: ((1 - s.p.y) / 2) * r.height };
  };
  scene3dProbe.objectPlace = (objectId) => {
    const g = furniture.groupOf(objectId);
    if (!g) return null;
    g.updateMatrixWorld(true);
    const w = new Vector3().setFromMatrixPosition(g.matrixWorld);
    return { x: w.x * 100, y: w.z * 100, z: w.y * 100 };
  };

  const surroundings = () => {
    if (!shown) return undefined;
    const level = shown.level;
    const cupboardRings = deriveVolumes(level).cupboardFootprints;
    const custom = project?.customObjects ?? {};
    return {
      obstacles: tallFootprints(level, custom, cupboardRings),
      medium: tallFootprints(level, custom, cupboardRings, MEDIUM),
      ceiling: (p: { x: number; y: number }) => ceilingWithoutBeams(level, p),
    };
  };

  const goToPreset = (p: Preset, instant: boolean) => {
    const room = p === 'room' && shown ? roomOfSelection(selection, shown.level, shown.d) : null;
    const preset: Preset = p === 'room' && !room ? 'overview' : p;
    // the room preset stands on the active level; the others frame the lower levels shown too
    const box = preset === 'room' && shown ? shown.box : fitBox;
    rig.goTo(presetPose(preset, box, room, rig.camera.aspect, preset === 'room' ? surroundings() : undefined), instant, performance.now(), preset);
    invalidate();
  };

  return {
    update(input) {
      if (disposed) return;
      selection = input.selection;
      project = input.project;
      hideAllWalls = input.hideAllWalls;
      const rebuilt = showLevel(input.level);
      const lowerChanged = showLower(input.lowerLevels);
      if (rebuilt || lowerChanged) {
        fitBox = [...lower.values()].reduce((b, s) => unionBounds(b, s.box), shown!.box);
        rig.setBounds(fitBox);
      }
      const objectsChanged = furniture.sync(input.level, input.project.customObjects, input.showLabels);
      const cupboardsChanged = cupboards.sync(input.level, shown!.d);
      tints.sync(alertTargets(input.alerts));
      // materials of rebuilt or removed objects and cupboards (a color changed): disposed once unused
      if (objectsChanged) furniture.purge(tints.originals());
      if (cupboardsChanged) cupboards.purge(tints.originals());
      outline.sync(selectedTargets());
      scene3dStats.objectBuilds = furniture.buildCount;
      scene3dStats.cupboardBuilds = cupboards.buildCount;
      scene3dStats.outlined = outline.outlined.length;
      scene3dStats.lowerLevels = lower.size;
      if (framedLevelId !== input.level.id) {
        framedLevelId = input.level.id;
        goToPreset('overview', true);
      } else if (lowerChanged && (rig.preset === 'overview' || rig.preset === 'top')) {
        // a view left on its preset frames the lower levels shown (or no longer shown)
        goToPreset(rig.preset, false);
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
      // a view left on a fitted preset is fitted again to its new size (split separator, window)
      if (shown && (rig.preset === 'overview' || rig.preset === 'top')) goToPreset(rig.preset, true);
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      scene3dStats.idle = true;
      offClick();
      rig.dispose();
      outline.dispose();
      tints.dispose();
      furniture.dispose();
      cupboards.dispose();
      labels.dispose();
      scene3dProbe.objectPixel = null;
      scene3dProbe.objectScreen = null;
      scene3dProbe.objectPlace = null;
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
