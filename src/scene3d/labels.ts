import type { Camera, Object3D, Scene } from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Object names over the 3D view (spec 8.2, plan-chambre's label3d): white pills with a
 * `#2438a0` border and text (styles.css `.label3d`), drawn by a CSS2DRenderer whose layer covers
 * the canvas without catching the pointer.
 */
export interface Labels {
  make(text: string): Object3D;
  /** Removes the element of a label (a CSS2DObject keeps its element when its parent is removed). */
  free(label: Object3D): void;
  render(scene: Scene, camera: Camera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export function createLabels(container: HTMLElement): Labels {
  const renderer = new CSS2DRenderer();
  renderer.domElement.className = 'scene3d-labels';
  renderer.domElement.dataset.testid = 'scene3d-labels';
  container.appendChild(renderer.domElement);
  return {
    make(text) {
      const div = document.createElement('div');
      div.className = 'label3d';
      div.textContent = text;
      return new CSS2DObject(div);
    },
    free(label) {
      if (label instanceof CSS2DObject) label.element.remove();
    },
    render: (scene, camera) => renderer.render(scene, camera),
    setSize: (w, h) => renderer.setSize(w, h),
    dispose() {
      renderer.domElement.remove();
    },
  };
}
