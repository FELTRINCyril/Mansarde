import { CATALOG } from '../../catalog/catalog';
import type { Cupboard, PlacedObject } from '../model/types';

const WALL_CARRIERS = new Set(CATALOG.filter((e) => e.carriesOnTop).map((e) => e.id));

/**
 * The single definition of what can carry an 'onTop' object (ruling V2-R37), shared by the pose
 * (supportElevation: drop, drag release, "Posé sur un meuble") and by the checks (floating
 * objects, collisions with what carries them): objects standing on the floor ('floor' and
 * 'tuckable') and wall shelves (catalog entries flagged carriesOnTop, with the 'wall' pose).
 * Rugs, objects already on top of others and other wall objects (a TV) carry nothing.
 */
export function objectCarries(o: Pick<PlacedObject, 'pose' | 'source'>): boolean {
  if (o.pose === 'floor' || o.pose === 'tuckable') return true;
  return o.pose === 'wall' && o.source.kind === 'catalog' && WALL_CARRIERS.has(o.source.catalogId);
}

/** A cupboard of fixed height has a level top that carries objects; one following the ceiling has none. */
export const cupboardCarries = (c: Pick<Cupboard, 'heightMode'>): boolean => c.heightMode === 'fixed';
