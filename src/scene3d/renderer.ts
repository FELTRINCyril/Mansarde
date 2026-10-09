import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PCFShadowMap, Scene, WebGLRenderer } from 'three';
import type { Bounds } from './camera';
import { COLORS } from './materials';

/**
 * WebGLRenderer of plan-chambre (spec 8.2): antialias, pixel ratio at most 2, ACES filmic tone
 * mapping, exposure 1, soft shadows (PCF). Throws Error('webgl') when the browser gives no WebGL 2
 * context (three.js needs it): the context is asked on our own canvas first, so that three.js
 * never logs its own failure.
 */
export function createRenderer(): WebGLRenderer {
  const canvas = document.createElement('canvas');
  let context: WebGL2RenderingContext | null = null;
  try {
    context = canvas.getContext('webgl2', { antialias: true });
  } catch {
    context = null;
  }
  if (!context) throw new Error('webgl');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, context, antialias: true });
  } catch {
    throw new Error('webgl');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  // spec 8.2 says PCFSoftShadowMap (three r170 of plan-chambre); three r186 removed it in favour of
  // PCFShadowMap, which blurs by shadow.radius (4, as plan-chambre)
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

/** plan-chambre's sun: (0.5, 7, -2.5) aiming at (2, 0, 2) in a 4.30 m extent, i.e. this offset from the target. */
const SUN_OFFSET = [-1.5, 7, -4.5] as const;
const REF_EXTENT = 4.3;

export interface Lights {
  hemi: HemisphereLight;
  sun: DirectionalLight;
  /** Frames the sun and its shadow camera on the level (spec 8.2: "cadrage adapté à l'emprise du niveau"). */
  frame(b: Bounds, elevation: number): void;
}

/** Background and lights of plan-chambre: hemisphere 1.6 and a warm sun 1.8 with soft shadows. */
export function setupScene(scene: Scene): Lights {
  scene.background = new Color(COLORS.background);
  const hemi = new HemisphereLight('#ffffff', '#d9cfc1', 1.6);
  const sun = new DirectionalLight('#fff4e2', 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(hemi, sun, sun.target);
  const frame = (b: Bounds, elevation: number) => {
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const k = Math.max(1, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / REF_EXTENT);
    sun.target.position.set(cx, elevation, cz);
    sun.position.set(cx + SUN_OFFSET[0] * k, elevation + SUN_OFFSET[1] * k, cz + SUN_OFFSET[2] * k);
    // plan-chambre: +-4 m around a 4.30 m room, near 1, far 15
    const half = 4 * k;
    Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 0.5, far: 15 * k });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
  };
  return { hemi, sun, frame };
}
