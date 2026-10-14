import { Mesh, type Material, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Loads the scene of a GLB (the glTF loader in the app, a fake in the tests). */
export type ModelLoader = (url: string) => Promise<Object3D>;

/** Name of the material the user's color goes on (tools/models: the largest plain surface). */
export const MAIN_MATERIAL = 'main';

const materialsOf = (m: Mesh): Material[] => (Array.isArray(m.material) ? m.material : [m.material]);

function disposeTree(root: Object3D): void {
  root.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    n.geometry.dispose();
    for (const m of materialsOf(n)) {
      for (const v of Object.values(m)) if (v && typeof v === 'object' && 'isTexture' in v) (v as { dispose(): void }).dispose();
      m.dispose();
    }
  });
}

/**
 * The downloaded models of the 3D view (spec 2026-10-13, section 7): each GLB is loaded once, when
 * an object first needs it, and kept as a template whose geometries and materials every object
 * using it shares (its meshes are marked `userData.sharedGeometry`, so that removing an object
 * never frees them); a template is freed when no object shows it any more (evict) or with the
 * library. A failed load is not retried during the
 * session. `onReady(id)` tells the view a model arrived (or failed) so that it rebuilds the
 * objects waiting for it; nothing is reported after `dispose`.
 */
export class ModelLibrary {
  readonly stats = { loaded: 0, failed: 0 };
  private readonly templates = new Map<string, Object3D>();
  private readonly pending = new Set<string>();
  private readonly failures = new Set<string>();
  private readonly tints = new Map<string, Material>();
  private disposed = false;
  private readonly load: ModelLoader;
  private readonly urlOf: (id: string) => string;
  private readonly onReady: (id: string) => void;

  constructor(load: ModelLoader, urlOf: (id: string) => string, onReady: (id: string) => void) {
    this.load = load;
    this.urlOf = urlOf;
    this.onReady = onReady;
  }

  /** The template of `id` when loaded; otherwise starts its load (once) and returns null. */
  get(id: string): Object3D | null {
    const t = this.templates.get(id);
    if (t) return t;
    if (this.disposed || this.pending.has(id) || this.failures.has(id)) return null;
    this.pending.add(id);
    this.load(this.urlOf(id)).then(
      (scene) => {
        this.pending.delete(id);
        if (this.disposed) {
          disposeTree(scene);
          return;
        }
        scene.traverse((n) => {
          if (!(n instanceof Mesh)) return;
          n.castShadow = true;
          n.receiveShadow = true;
          n.userData.sharedGeometry = true;
        });
        this.templates.set(id, scene);
        this.stats.loaded++;
        this.onReady(id);
      },
      (e: unknown) => {
        this.pending.delete(id);
        if (this.disposed) return;
        this.failures.add(id);
        this.stats.failed++;
        console.warn(`3D model ${id} could not be loaded`, e);
        this.onReady(id);
      },
    );
    return null;
  }

  /** True once the load of `id` failed (the object keeps its box). */
  failed(id: string): boolean {
    return this.failures.has(id);
  }

  /** True when `id` is loaded or failed: an object waiting for it can be rebuilt. */
  settled(id: string): boolean {
    return this.templates.has(id) || this.failures.has(id);
  }

  /** `base` (a main material of model `id`) in the user's color, cached by model, material and color. */
  tinted(id: string, base: Material, color: string): Material {
    const key = `${id}|${base.uuid}|${color.toLowerCase()}`;
    let m = this.tints.get(key);
    if (!m) {
      m = base.clone();
      if ('color' in m && m.color && typeof m.color === 'object' && 'set' in m.color) (m.color as { set(c: string): void }).set(color);
      this.tints.set(key, m);
    }
    return m;
  }

  /** Disposes the tinted materials no object uses any more (a color changed, objects removed). */
  purge(used: Set<Material>): void {
    for (const [k, m] of this.tints) {
      if (used.has(m)) continue;
      m.dispose();
      this.tints.delete(k);
    }
  }

  /**
   * Frees the models no object shows any more (`keep`: the ids still in use), and their tinted
   * materials: trying many models does not pile them up in GPU memory. A model asked again is
   * loaded again (from the HTTP cache).
   */
  evict(keep: Set<string>): void {
    for (const [id, t] of this.templates) {
      if (keep.has(id)) continue;
      disposeTree(t);
      this.templates.delete(id);
      for (const [k, m] of this.tints) {
        if (!k.startsWith(`${id}|`)) continue;
        m.dispose();
        this.tints.delete(k);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.templates.values()) disposeTree(t);
    this.templates.clear();
    for (const m of this.tints.values()) m.dispose();
    this.tints.clear();
  }
}

/** The GLB loader of the app: GLTFLoader with the meshopt decoder (the GLBs are meshopt-compressed). */
export function createGltfLoader(): ModelLoader {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return async (url) => (await loader.loadAsync(url)).scene;
}
