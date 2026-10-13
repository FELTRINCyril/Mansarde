/*
 * Default catalog data of a Sweet Home 3D model (spec 5), from its source catalog: category,
 * pose, flags, automatic exclusion, license. Curation files override any of these per model.
 * Pure (no Node API): unit tested from tests/tools.
 */

export type Category = 'Chambre' | 'Séjour' | 'Bureau et repas' | 'Cuisine' | 'Salle de bain' | 'Luminaires' | 'Décoration' | 'Extérieur' | 'Divers' | 'Structure';
export type Pose = 'floor' | 'covering' | 'onTop' | 'tuckable' | 'wall';

export interface RuleItem {
  name: string;
  nameFr?: string;
  category?: string;
  tags?: string[];
  /** cm */
  width?: number;
  depth?: number;
  height?: number;
  elevation?: number;
}

/** Ceiling height a ceiling light is hung under by default (cm, the usual new project ceiling). */
export const CEILING_HEIGHT = 250;
/** Largest dimension of a model kept (cm). */
const MAX_SIZE = 600;
/** Below this largest dimension a model is a trinket, not something to plan (cm). */
const MIN_SIZE = 12;

const SH3D_CATEGORIES: Record<string, Category | null> = {
  Bedroom: 'Chambre',
  'Living room': 'Séjour',
  Office: 'Bureau et repas',
  Kitchen: 'Cuisine',
  Bathroom: 'Salle de bain',
  Lights: 'Luminaires',
  Exterior: 'Extérieur',
  Staircases: 'Structure',
  'Doors and windows': null,
  Vehicles: null,
  Characters: null,
};

/** Lower case words of the names and tags, without accents, for keyword rules. */
function words(it: RuleItem): string {
  const s = [it.name, it.nameFr ?? '', ...(it.tags ?? [])].join(' ');
  return ' ' + s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
}

/** True when one of the keywords (whole words or phrases) appears in the words. */
const has = (w: string, keys: string[]): boolean => keys.some((k) => w.includes(' ' + k + ' '));

const DECOR = ['vase', 'vases', 'cadre', 'frame', 'tableau', 'painting', 'picture', 'poster', 'plante', 'plant', 'plants', 'fleur', 'fleurs', 'flower', 'flowers', 'statue', 'statuette', 'sculpture', 'horloge', 'clock', 'miroir', 'mirror', 'coussin', 'cushion', 'pillow', 'bougie', 'candle', 'livre', 'livres', 'book', 'books', 'globe', 'aquarium', 'cactus', 'bonsai', 'orchid', 'orchids', 'orchidee', 'pot', 'decor', 'decoration'];
const ANIMALS = ['dog', 'dogs', 'bulldog', 'cat', 'cats', 'siamese', 'horse', 'horses', 'bird', 'birds', 'chicken', 'deer', 'cow', 'pig', 'sheep', 'duck', 'rabbit', 'chien', 'chat', 'cheval', 'oiseau', 'poule', 'poulet', 'cerf', 'vache', 'cochon', 'mouton', 'canard', 'lapin', 'animal'];
const NOT_ANIMALS = ['clothes horse', 'rocking horse', 'cheval a bascule', 'frame', 'cadre', 'cat tree', 'arbre a chat', 'dog house', 'niche', 'litter', 'litiere', 'aquarium', 'fish bowl', 'bocal', 'cage', 'statue', 'sculpture'];
const FOOD = ['bread', 'butter', 'cupcake', 'hot dog', 'hotdog', 'pizza', 'cake', 'apples', 'banana', 'cheese', 'sandwich', 'burger', 'steak', 'french fries', 'frites', 'salad', 'salade', 'fruits', 'roasted chicken', 'corn flakes', 'pasta', 'spaghetti', 'food', 'yogurt', 'tetrapak', 'beer', 'wine', 'cocktail', 'long drink', 'cup', 'mug', 'tasse', 'goblet', 'bottle', 'cutlery'];
const NOT_FOOD = ['bread box', 'bottles rack', 'wine rack', 'wine cellar', 'cave a vin'];
const WEAPONS = ['ammo', 'gun', 'rifle', 'pistol', 'sword', 'katana', 'weapon', 'munition', 'fusil'];
const TRINKETS = ['flacon', 'perfume', 'parfum', 'comb', 'scissors', 'ciseaux', 'ruler', 'marker', 'iphone', 'smartphone', 'headphones', 'casque audio', 'cosmetics', 'slippers', 'chaussons', 'briefcase', 'handbag', 'sac a main', 'remote', 'telecommande', 'pen', 'stylo', 'keys', 'cles', 'knife', 'couteau', 'spoon', 'fork', 'cutlery', 'couverts', 'assiette', 'jar', 'spray'];
const RUGS = ['rug', 'rugs', 'carpet', 'tapis', 'paillasson', 'doormat', 'tatami'];
const SEATS = ['chair', 'chairs', 'chaise', 'chaises', 'stool', 'stools', 'tabouret', 'tabourets', 'pouf', 'ottoman', 'silla'];
const NOT_TUCKED = ['armchair', 'arm chair', 'fauteuil', 'lounge', 'relax', 'deck chair', 'deckchair', 'transat', 'rocking', 'bascule', 'chaise longue', 'high chair', 'chaise haute', 'wheelchair', 'fauteuil roulant', 'swing', 'balancoire', 'massage'];
const CEILING = ['plafonnier', 'suspension', 'lustre', 'ceiling', 'chandelier', 'pendant', 'hanging', 'spot', 'spots'];
const SMALL_ON_TOP = ['lamp', 'lampe', 'vase', 'tv', 'tele', 'television', 'laptop', 'ordinateur', 'computer', 'imac', 'ibook', 'pc', 'ecran', 'screen', 'monitor', 'keyboard', 'clavier', 'micro ondes', 'microwave', 'grille pain', 'toaster', 'cafetiere', 'coffee', 'kettle', 'bouilloire', 'book', 'books', 'livre', 'livres', 'alarm', 'reveil', 'frame', 'cadre', 'radio', 'phone', 'telephone', 'plant', 'plante', 'candle', 'bougie', 'bowl', 'bol', 'statue', 'statuette', 'sculpture', 'printer', 'imprimante', 'speaker', 'enceinte', 'blender', 'mixeur', 'robot', 'mixer', 'kitchenaid', 'globe', 'aquarium', 'clock', 'horloge', 'pot', 'basket', 'panier', 'corbeille', 'decor'];
const NOT_ON_TOP = ['lampadaire', 'floor lamp', 'standing lamp', 'bin', 'poubelle', 'trash', 'dustbin', 'radiator', 'radiateur', 'bucket', 'seau', 'nightstand', 'night stand', 'bedside', 'chevet', 'table de nuit', 'cabinet', 'meuble', 'caisson', 'chest', 'coffre', 'drawer', 'drawers', 'tiroir', 'tiroirs', 'stool', 'tabouret', 'pouf', 'heater', 'chauffage', 'fan', 'ventilateur'];
const TABLES = ['table', 'tables', 'bureau', 'desk', 'console', 'comptoir', 'counter', 'bar', 'workbench', 'etabli', 'pupitre'];
const NOT_TABLES = ['table de nuit', 'table de chevet', 'bedside', 'nightstand', 'night table', 'lampe de table', 'table lamp', 'desk lamp', 'lampe de bureau', 'tablecloth', 'nappe', 'chaise de bureau', 'desk chair', 'office chair', 'fauteuil de bureau', 'table fan', 'ventilateur de table'];
const SHELVES = ['etagere', 'etageres', 'shelf', 'shelves', 'tablette'];

export function categoryOf(it: RuleItem): Category | null {
  const c = it.category ?? 'Miscellaneous';
  if (c === 'Miscellaneous') return has(words(it), DECOR) ? 'Décoration' : 'Divers';
  return Object.hasOwn(SH3D_CATEGORIES, c) ? SH3D_CATEGORIES[c]! : 'Divers';
}

/** Pose and default elevation (cm) of a new object (spec 5, "Pose par défaut"). */
export function poseOf(it: RuleItem, category: Category): { pose: Pose; elevation?: number } {
  const w = words(it);
  const h = it.height ?? 0;
  if (has(w, RUGS) && h <= 5) return { pose: 'covering' };
  if (category === 'Luminaires' && has(w, CEILING)) return { pose: 'floor', elevation: Math.max(0, CEILING_HEIGHT - h) };
  if ((it.elevation ?? 0) > 0) return { pose: 'wall', elevation: it.elevation! };
  if (has(w, SEATS) && !has(w, NOT_TUCKED)) return { pose: 'tuckable' };
  const small = Math.max(it.width ?? Infinity, it.depth ?? Infinity) <= 60 && h <= 60;
  if (small && !has(w, NOT_ON_TOP) && has(w, SMALL_ON_TOP)) return { pose: 'onTop' };
  return { pose: 'floor' };
}

export function flagsOf(it: RuleItem, _category: Category, pose: Pose): { acceptsUnder?: true; carriesOnTop?: true } {
  const w = words(it);
  if (pose === 'floor' && has(w, TABLES) && !has(w, NOT_TABLES)) return { acceptsUnder: true };
  if (pose === 'wall' && has(w, SHELVES)) return { carriesOnTop: true };
  return {};
}

/** Why a model is left out automatically, or null. */
export function autoExclusion(it: RuleItem): string | null {
  const dims = [it.width, it.depth, it.height];
  if (dims.some((v) => v === undefined || !(v > 0))) return 'no size';
  const max = Math.max(...(dims as number[]));
  if (max > MAX_SIZE) return `out of scale: ${Math.round(max)} cm`;
  if (max < MIN_SIZE) return `trinket: ${Math.round(max)} cm`;
  const w = words(it);
  if (has(w, FOOD) && !has(w, NOT_FOOD)) return 'food or drink';
  if (has(w, ANIMALS) && !has(w, NOT_ANIMALS)) return 'animal';
  if (has(w, TRINKETS)) return 'trinket';
  if (has(w, WEAPONS)) return 'weapon';
  if ([it.name, it.nameFr ?? ''].some((n) => /^(glass|glasses|verre|verres)$/i.test(n.trim()))) return 'food or drink';
  return null;
}

/** License name shown in the credits, or null when the license is not one the catalog accepts. */
export function normalizeLicense(l: string): string | null {
  const k = l.trim().toLowerCase().replace(/\s+/g, ' ');
  if (k === 'cc-0' || k === 'cc0' || k === 'public domain') return 'CC0';
  if (k === 'cc-by') return 'CC-BY 3.0';
  if (k === 'free art') return 'Free Art License 1.3';
  if (k === 'free art / cc-by') return 'Free Art License 1.3 / CC-BY 3.0';
  return null;
}
