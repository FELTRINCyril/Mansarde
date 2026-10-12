import { Box3, BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Matrix4, Mesh, Raycaster, Vector2, type Camera, type Material, type Object3D } from 'three';
import type { SelectionItem } from '@/editor/selection';

/*
 * Selection in the 3D view (spec 8.3): a click (not an orbit drag) on a piece of furniture, a
 * cupboard or a beam selects it in the plan; the selected elements get a blue outline.
 */

/** Selection color of the 3D view (spec 8.2 label color, as the 2D selection). */
export const SELECTION_COLOR = '#2438a0';
/** A press that moves less than this (px) before its release is a click, not an orbit gesture. */
export const CLICK_SLOP = 5;

/** The element named by an object of the scene or one of its ancestors (userData set by the builders). */
export function itemOf(o: Object3D | null): SelectionItem | null {
  for (let n = o; n; n = n.parent) {
    const u = n.userData as { objectId?: string; cupboardId?: string; beamId?: string };
    if (u.objectId) return { kind: 'object', id: u.objectId };
    if (u.cupboardId) return { kind: 'cupboard', id: u.cupboardId };
    if (u.beamId) return { kind: 'beam', id: u.beamId };
  }
  return null;
}

/** Shown: the object and all its ancestors are visible. */
function shown(o: Object3D): boolean {
  for (let n: Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** See-through materials (window glass, display cabinet glass) do not stop a click. */
function opaque(m: Material | Material[]): boolean {
  const list = Array.isArray(m) ? m : [m];
  return list.some((x) => !x.transparent || x.opacity >= 0.9);
}

/**
 * The element under a point of the view (ndc: -1..1, y up): the first visible opaque mesh hit
 * among `roots` (walls, floors and ceilings included, so that they hide what is behind them),
 * resolved to its object, cupboard or beam; null for anything else or nothing.
 */
export function pickAt(camera: Camera, ndc: { x: number; y: number }, roots: Object3D[], raycaster = new Raycaster()): SelectionItem | null {
  raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), camera);
  for (const hit of raycaster.intersectObjects(roots, true)) {
    const o = hit.object;
    if (!(o instanceof Mesh) || !shown(o) || !opaque(o.material)) continue;
    return itemOf(o);
  }
  return null;
}

/**
 * Calls `onClickAt` with the view point (ndc) of a primary-button click on `dom`: released within
 * CLICK_SLOP of where it was pressed (an orbit or pan gesture moves farther), with no other pointer
 * down at any time during the gesture (a pinch with one still finger, a mouse held while a finger
 * taps). Returns the remover.
 */
export function onClick(dom: HTMLElement, onClickAt: (ndc: { x: number; y: number }) => void): () => void {
  /** Pointers down now; the gesture lasts until none is left. */
  const active = new Set<number>();
  let start: { x: number; y: number; id: number } | null = null;
  let multi = false;
  const press = (e: PointerEvent) => {
    if (active.size === 0) {
      multi = false;
      start = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    } else {
      multi = true;
    }
    active.add(e.pointerId);
  };
  const release = (e: PointerEvent) => {
    if (!active.delete(e.pointerId)) return;
    const s = start;
    if (active.size === 0) start = null;
    if (multi || !s || e.pointerId !== s.id || e.button !== 0 || Math.hypot(e.clientX - s.x, e.clientY - s.y) > CLICK_SLOP) return;
    const r = dom.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    onClickAt({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 });
  };
  const cancel = (e: PointerEvent) => {
    active.delete(e.pointerId);
    multi = true; // the rest of this gesture is not a click
    if (active.size === 0) start = null;
  };
  dom.addEventListener('pointerdown', press);
  dom.addEventListener('pointerup', release);
  dom.addEventListener('pointercancel', cancel);
  return () => {
    dom.removeEventListener('pointerdown', press);
    dom.removeEventListener('pointerup', release);
    dom.removeEventListener('pointercancel', cancel);
  };
}

/** Margin (m) of the outline box around a piece of furniture, so that its lines do not sink into its faces. */
const BOX_MARGIN = 0.01;
/** Crease angle (degrees) of the outline of a cupboard or a beam: their sharp edges only. */
const EDGE_ANGLE = 20;

/**
 * Blue outlines (EdgesGeometry, SELECTION_COLOR) of the selected elements: the box of a piece of
 * furniture in its own frame (its builder's details would give a tangle of lines), the sharp
 * edges of a cupboard or a beam. The lines are children of the element, so they follow it; an
 * element rebuilt or dropped from the scene loses its outline at the next sync, which disposes it.
 */
export class SelectionOutline {
  readonly material = new LineBasicMaterial({ color: SELECTION_COLOR });
  private readonly lines = new Map<Object3D, LineSegments[]>();

  /** Outlines exactly the given elements: `box` for furniture groups, edges otherwise. */
  sync(targets: ReadonlyArray<{ root: Object3D; box: boolean }>): void {
    const want = new Map(targets.map((t) => [t.root, t.box]));
    for (const root of [...this.lines.keys()]) if (!want.has(root)) this.drop(root);
    for (const [root, box] of want) {
      if (this.lines.has(root)) continue;
      this.lines.set(root, box ? [this.boxLines(root)] : this.edgeLines(root));
    }
  }

  /** The outlined elements (tests). */
  get outlined(): Object3D[] {
    return [...this.lines.keys()];
  }

  private boxLines(root: Object3D): LineSegments {
    root.updateMatrixWorld(true);
    const toLocal = new Matrix4().copy(root.matrixWorld).invert();
    const box = new Box3();
    root.traverse((n) => {
      if (!(n instanceof Mesh) || n.userData.outline) return;
      n.geometry.computeBoundingBox();
      const b = n.geometry.boundingBox;
      if (b) box.union(b.clone().applyMatrix4(new Matrix4().multiplyMatrices(toLocal, n.matrixWorld)));
    });
    if (box.isEmpty()) box.set(box.min.set(-0.05, 0, -0.05), box.max.set(0.05, 0.1, 0.05));
    // a little larger on the sides and the top, not below the floor
    const size = box.getSize(box.max.clone());
    const geo = new BoxGeometry(size.x + 2 * BOX_MARGIN, size.y + BOX_MARGIN, size.z + 2 * BOX_MARGIN);
    const edges = new EdgesGeometry(geo);
    geo.dispose();
    const line = new LineSegments(edges, this.material);
    line.position.set((box.min.x + box.max.x) / 2, box.min.y + (size.y + BOX_MARGIN) / 2, (box.min.z + box.max.z) / 2);
    line.userData = { outline: true };
    line.name = 'selection-outline';
    root.add(line);
    return line;
  }

  private edgeLines(root: Object3D): LineSegments[] {
    const meshes: Mesh[] = [];
    root.traverse((n) => {
      if (n instanceof Mesh) meshes.push(n);
    });
    return meshes.map((m) => {
      const line = new LineSegments(new EdgesGeometry(m.geometry, EDGE_ANGLE), this.material);
      line.userData = { outline: true };
      line.name = 'selection-outline';
      m.add(line);
      return line;
    });
  }

  private drop(root: Object3D): void {
    for (const l of this.lines.get(root) ?? []) {
      l.geometry.dispose();
      l.removeFromParent();
    }
    this.lines.delete(root);
  }

  dispose(): void {
    for (const root of [...this.lines.keys()]) this.drop(root);
    this.material.dispose();
  }
}
