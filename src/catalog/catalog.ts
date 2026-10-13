// Type-only imports: src/core (the V1 -> V2 migration) reads this module, so it must never pull
// React or a browser API (symbols live in symbols.tsx). generated/models.ts is plain data.
import type { GenericShape, LShapeParams, ObjectPose } from '../core/model/types';
import modelData from './generated/models.json';

export type CatalogCategory =
  | 'Chambre'
  | 'Séjour'
  | 'Bureau et repas'
  | 'Cuisine'
  | 'Salle de bain'
  | 'Luminaires'
  | 'Décoration'
  | 'Extérieur'
  | 'Divers'
  | 'Structure'
  | 'Génériques';

/** Display order of the categories in the catalog panel. */
export const CATEGORY_ORDER: CatalogCategory[] = ['Chambre', 'Séjour', 'Bureau et repas', 'Cuisine', 'Salle de bain', 'Luminaires', 'Décoration', 'Extérieur', 'Divers', 'Structure', 'Génériques'];

export type ModelStyle = 'simple' | 'realiste';

/**
 * A downloaded 3D model (spec 2026-10-13): its GLB is public/models/<id>.glb, normalized into the
 * unit box, stretched to the object's size; its top view is in public/models/outlines.json,
 * loaded by the plan when needed (src/render/modelOutlines.ts).
 */
export interface ModelInfo {
  style: ModelStyle;
}

/** A downloaded model as tools/models/publish.ts writes it in generated/models.json. */
export interface ModelEntryData {
  id: string;
  name: string;
  category: CatalogCategory;
  width: number;
  depth: number;
  height: number;
  pose: ObjectPose;
  elevation?: number;
  acceptsUnder?: boolean;
  carriesOnTop?: boolean;
  style: ModelStyle;
}

export interface CatalogEntry {
  id: string;
  name: string;
  category: CatalogCategory;
  /** Centimeters. */
  width: number;
  depth: number;
  height: number;
  /** Default fill, hex. */
  color: string;
  shape: GenericShape | 'symbol';
  /** Default notch for 'generic-lshape'. */
  lshape?: LShapeParams;
  /** Default pose of a new object. */
  pose: ObjectPose;
  /** Tables and desks: 'tuckable' objects may stand under them. */
  acceptsUnder?: boolean;
  /** Default height of the underside (cm) of a new object; absent means 0. Wall-mounted entries and ceiling lights. */
  elevation?: number;
  /** Wall-mounted entries that 'onTop' objects can stand on (shelves, ruling V2-R37). */
  carriesOnTop?: boolean;
  /** Downloaded 3D model (drawn by its outline in 2D, its GLB in 3D). */
  model?: ModelInfo;
}

const BEDROOM = '#d9c8b4';
const LIVING = '#c9d4c0';
const DINING = '#e0cfa8';
const KITCHEN = '#c4d3de';
const BATH = '#bfdbe0';
const STRUCTURE = '#d0d0d0';
const GENERIC = '#dddddd';
const LIGHTS = '#e6dcb0';
const DECOR = '#d8c8d8';
const OUTDOOR = '#c8d8b8';
const MISC = '#dddddd';

/** Default fill of each category (the 2D tint of the plan, not a material). */
const CATEGORY_COLOR: Record<CatalogCategory, string> = {
  Chambre: BEDROOM,
  Séjour: LIVING,
  'Bureau et repas': DINING,
  Cuisine: KITCHEN,
  'Salle de bain': BATH,
  Luminaires: LIGHTS,
  Décoration: DECOR,
  Extérieur: OUTDOOR,
  Divers: MISC,
  Structure: STRUCTURE,
  Génériques: GENERIC,
};

function sym(
  id: string,
  name: string,
  category: CatalogCategory,
  width: number,
  depth: number,
  height: number,
  color: string,
  extra: { pose?: ObjectPose; acceptsUnder?: boolean; elevation?: number; carriesOnTop?: boolean } = {},
): CatalogEntry {
  return {
    id,
    name,
    category,
    width,
    depth,
    height,
    color,
    shape: 'symbol',
    pose: extra.pose ?? 'floor',
    ...(extra.acceptsUnder ? { acceptsUnder: true } : {}),
    ...(extra.elevation !== undefined ? { elevation: extra.elevation } : {}),
    ...(extra.carriesOnTop ? { carriesOnTop: true } : {}),
  };
}
const UNDER = { acceptsUnder: true } as const;

/** The parametric entries, drawn by the code (symbols.tsx, scene3d/furniture). */
export const BUILTIN_CATALOG: CatalogEntry[] = [
  // Chambre
  sym('bed-90', 'Lit 90', 'Chambre', 90, 190, 90, BEDROOM),
  sym('bed-140', 'Lit 140', 'Chambre', 140, 190, 90, BEDROOM),
  sym('bed-160', 'Lit 160', 'Chambre', 160, 200, 90, BEDROOM),
  sym('bed-180', 'Lit 180', 'Chambre', 180, 200, 90, BEDROOM),
  sym('nightstand', 'Table de nuit', 'Chambre', 45, 40, 50, BEDROOM),
  sym('wardrobe', 'Armoire', 'Chambre', 120, 60, 200, BEDROOM),
  sym('dresser', 'Commode', 'Chambre', 100, 50, 85, BEDROOM),
  sym('crib', 'Berceau', 'Chambre', 60, 120, 90, BEDROOM),
  sym('bedside-lamp', 'Lampe de chevet', 'Chambre', 25, 25, 45, BEDROOM, { pose: 'onTop' }),
  // Sejour
  sym('sofa-2', 'Canapé 2 places', 'Séjour', 160, 90, 85, LIVING),
  sym('sofa-3', 'Canapé 3 places', 'Séjour', 210, 95, 85, LIVING),
  sym('sofa-corner', "Canapé d'angle", 'Séjour', 250, 200, 85, LIVING),
  sym('armchair', 'Fauteuil', 'Séjour', 80, 85, 85, LIVING),
  sym('coffee-table', 'Table basse', 'Séjour', 110, 60, 40, LIVING, UNDER),
  sym('tv-unit', 'Meuble TV', 'Séjour', 160, 45, 50, LIVING),
  sym('bookcase', 'Bibliothèque', 'Séjour', 100, 35, 200, LIVING),
  sym('display-cabinet', 'Vitrine', 'Séjour', 100, 45, 180, LIVING),
  sym('tv', 'TV', 'Séjour', 100, 20, 60, LIVING, { pose: 'onTop' }),
  sym('tv-wall', 'TV murale', 'Séjour', 110, 8, 65, LIVING, { pose: 'wall', elevation: 110 }),
  sym('shelf-wall', 'Étagère murale', 'Séjour', 80, 25, 3, LIVING, { pose: 'wall', elevation: 150, carriesOnTop: true }),
  sym('rug-round', 'Tapis rond', 'Séjour', 120, 120, 1, LIVING, { pose: 'covering' }),
  sym('rug-rect', 'Tapis', 'Séjour', 170, 120, 1, LIVING, { pose: 'covering' }),
  sym('plant', 'Plante', 'Séjour', 40, 40, 90, LIVING),
  sym('pouf', 'Pouf', 'Séjour', 50, 50, 40, LIVING, { pose: 'tuckable' }),
  // Bureau et repas
  sym('desk', 'Bureau', 'Bureau et repas', 140, 70, 75, DINING, UNDER),
  sym('chair', 'Chaise', 'Bureau et repas', 45, 50, 90, DINING, { pose: 'tuckable' }),
  sym('table-rect', 'Table rectangulaire', 'Bureau et repas', 160, 90, 75, DINING, UNDER),
  sym('table-round', 'Table ronde', 'Bureau et repas', 110, 110, 75, DINING, UNDER),
  // Cuisine
  sym('counter', 'Plan de travail', 'Cuisine', 120, 60, 90, KITCHEN),
  sym('sink', 'Évier', 'Cuisine', 80, 60, 90, KITCHEN),
  sym('cooktop', 'Plaque de cuisson', 'Cuisine', 60, 60, 90, KITCHEN),
  sym('fridge', 'Réfrigérateur', 'Cuisine', 60, 65, 180, KITCHEN),
  sym('dishwasher', 'Lave-vaisselle', 'Cuisine', 60, 60, 85, KITCHEN),
  sym('microwave', 'Micro-ondes', 'Cuisine', 50, 40, 30, KITCHEN, { pose: 'onTop' }),
  // Salle de bain
  sym('wc', 'WC', 'Salle de bain', 40, 65, 80, BATH),
  sym('washbasin', 'Lavabo', 'Salle de bain', 60, 45, 85, BATH),
  sym('shower', 'Douche', 'Salle de bain', 90, 90, 200, BATH),
  sym('bathtub', 'Baignoire', 'Salle de bain', 170, 75, 60, BATH),
  sym('washing-machine', 'Lave-linge', 'Salle de bain', 60, 60, 85, BATH),
  // Structure
  sym('stairs-straight', 'Escalier droit', 'Structure', 90, 300, 270, STRUCTURE),
  sym('stairs-quarter', 'Escalier quart tournant', 'Structure', 90, 250, 270, STRUCTURE),
  // Generiques
  { id: 'generic-rect', name: 'Rectangle', category: 'Génériques', width: 100, depth: 60, height: 75, color: GENERIC, shape: 'rect', pose: 'floor' },
  { id: 'generic-circle', name: 'Cercle', category: 'Génériques', width: 80, depth: 80, height: 75, color: GENERIC, shape: 'circle', pose: 'floor' },
  {
    id: 'generic-lshape',
    name: 'Forme en L',
    category: 'Génériques',
    width: 200,
    depth: 150,
    height: 90,
    color: GENERIC,
    shape: 'lshape',
    lshape: { notchWidth: 120, notchDepth: 90 },
    pose: 'floor',
  },
];

function modelEntry(m: ModelEntryData): CatalogEntry {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    width: m.width,
    depth: m.depth,
    height: m.height,
    color: CATEGORY_COLOR[m.category],
    shape: 'symbol',
    pose: m.pose,
    ...(m.acceptsUnder ? { acceptsUnder: true } : {}),
    ...(m.elevation !== undefined ? { elevation: m.elevation } : {}),
    ...(m.carriesOnTop ? { carriesOnTop: true } : {}),
    model: { style: m.style },
  };
}

/** The downloaded models, as tools/models/publish.ts writes them (sorted by category, then name). */
const MODEL_ENTRIES = modelData as ModelEntryData[];

/** Every entry: the parametric ones, then the downloaded models. */
export const CATALOG: CatalogEntry[] = [...BUILTIN_CATALOG, ...MODEL_ENTRIES.map(modelEntry)];

const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

/** URL of the GLB of a downloaded model; `base` is the app base URL (import.meta.env.BASE_URL). */
export const modelUrl = (id: string, base: string): string => `${base}models/${id}.glb`;
/** URL of the top views of every downloaded model ({ id: [outline rings, detail rings] }). */
export const modelOutlinesUrl = (base: string): string => `${base}models/outlines.json`;
/** URL of the catalog icon of a downloaded model. */
export const modelIconUrl = (id: string, base: string): string => `${base}models/icons/${id}.webp`;
