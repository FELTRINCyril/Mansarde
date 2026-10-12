import { Shape as ThreeShape } from 'three';
import { objectFootprint } from '@/core/geometry/objects';
import type { GenericShape, LShapeParams, PlacedObject } from '@/core/model/types';
import { mesh, named, prism, prismOf, type Builder } from './parts';

/** Radius of the rounded edges of the generic shapes (m). */
const BEVEL = 0.01;

/**
 * Generic shapes and custom objects (spec 8.2, plan-chambre's custom): the 2D outline extruded
 * from the floor to the object height with rounded edges, in the object color. The L comes from
 * objectFootprint (the notch at the local +x, +y corner) with the object's own `lshape` (ruling
 * R22: the placed object carries its shape); the mirror is applied by the caller, as for every
 * object. Plan y is local z.
 */
export function genericBuilder(shape: GenericShape, lshape: LShapeParams | null): Builder {
  return (s, kit) => {
    const { w, d, h } = s;
    const g = named(`generic-${shape}`);
    const material = kit.mat(s.color, { roughness: 0.7 });
    // the bevel grows the outline by BEVEL: the outline is inset by as much
    const b = Math.max(0, Math.min(BEVEL, w / 4, d / 4, h / 4));
    const iw = Math.max(0.001, w - 2 * b);
    const id = Math.max(0.001, d - 2 * b);
    if (shape === 'circle') {
      const e = new ThreeShape();
      e.absellipse(0, 0, iw / 2, id / 2, 0, Math.PI * 2, false, 0);
      g.add(mesh(prismOf(e, 0, h, b, 48), material));
      return g;
    }
    const cm = (v: number) => v * 100;
    const local: PlacedObject = {
      id: '',
      source: { kind: 'catalog', catalogId: 'generic-rect' },
      x: 0,
      y: 0,
      rotation: 0,
      width: cm(iw),
      depth: cm(id),
      height: cm(h),
      elevation: 0,
      name: '',
      color: s.color,
      mirrored: false,
      // an inset L keeps its notch sizes: its notch edges move out by the bevel as its outer edges move in
      lshape: shape === 'lshape' ? lshape : null,
      pose: 'floor',
    };
    const ring = objectFootprint(local, shape === 'lshape' ? 'lshape' : 'rect');
    g.add(mesh(prism(ring.map((p) => ({ x: p.x / 100, z: p.y / 100 })), 0, h, b), material));
    return g;
  };
}
