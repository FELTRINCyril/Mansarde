# Catalogue de modèles 3D - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter plusieurs centaines d'objets repris de bibliothèques gratuites (Kenney, Quaternius, Sweet Home 3D, Poly Haven), posables en 2D, visibles en 3D, étirables, crédités, sans ralentir l'app.

**Architecture:** Un script hors app (`tools/models`, dépendances propres) télécharge, convertit, normalise dans une boîte unité, optimise, calcule le contour vu de dessus et rend une icône par modèle ; il publie les GLB et icônes dans `public/models` et les entrées du catalogue dans `src/catalog/generated`. L'app dessine le contour en 2D (`ModelSymbol`) et charge le GLB à la demande en 3D (`ModelLibrary`), avec le rectangle générique en attendant.

**Tech Stack:** app inchangée (TypeScript, React, three, Vitest, Playwright) ; script : Node 26 (types effacés nativement), `@gltf-transform/core|functions|extensions`, `meshoptimizer`, `obj2gltf`, `sharp`, `fflate`, `three`, `playwright`.

**Spec:** `docs/superpowers/specs/2026-10-13-catalogue-modeles-3d-design.md` (et les specs V1, V2).

## Global Constraints

- `src/core` sans React ni API navigateur ; `src/catalog/catalog.ts` et `src/catalog/generated/models.ts` restent des données pures (lus par `src/core`).
- Aucune dépendance ajoutée à l'app ; les dépendances du script vivent dans `tools/models/package.json`.
- Code, identifiants, commentaires, commits : ASCII anglais, pas de `Co-Authored-By`. Interface : français avec accents ; jamais de tiret long ou moyen, guillemets typographiques, ellipse, flèches unicode, puces unicode, signe multiplication, espace insécable (test `FORBIDDEN` de `tests/core/catalog.test.tsx`, appliqué aussi aux noms importés).
- Identifiants : `kn-`, `qt-`, `sh-<bibliothèque>-`, `ph-` + kebab-case ASCII ; jamais modifiés une fois publiés (`tools/models/ids.lock`).
- Licences autorisées : `CC0`, `Public domain`, `CC-BY`, `Free Art License`.
- Budgets : GLB <= 150 Ko, <= 10 000 triangles, <= 8 matières ; icône 96 x 96 WebP ; `generated/models.ts` <= 120 Ko gzip ; recherche affichée <= 80 résultats.
- Modèle normalisé : boîte [-0,5 ; 0,5] x [0 ; 1] x [-0,5 ; 0,5], y vers le haut, dos vers -z, face vers +z ; matière principale nommée `main`.
- Contour : millièmes de la boîte, x à droite, y vers l'avant (= +y du plan).
- Gates de chaque tâche : `npm test`, `npm run typecheck`, `npm run lint`, et `npm run e2e` si la tâche touche l'interface.

## Review Focus

1. **Projet enregistré avec un identifiant de modèle inconnu** (fichier d'une version future, modèle retiré) : rectangle en 2D et en 3D, aucune erreur. Test : Task 6 `unknown model id falls back to a rectangle` et Task 8 `unknown id builds the generic box`.
2. **Hors ligne, ou GLB absent ou corrompu** : le rectangle reste, pas de boucle de chargement, la 3D continue de vivre. Test : Task 8 `failed load keeps the box and is not retried`.
3. **Objet étiré à l'extrême (5 x 5 cm, 600 x 10 cm) ou en miroir** : contour fini, sans NaN, 3D dans sa boîte. Test : Task 6 `extreme sizes stay finite`, Task 8 `scaled into its box, mirrored`.
4. **Vue 3D fermée pendant un chargement** : la promesse résolue après `dispose` ne touche plus la scène. Test : Task 8 `load resolved after dispose is ignored`.
5. **Recherche très large ("a") sur ~1 000 objets** : affichage plafonné, pas de gel. Test : Task 7 `search shows at most 80 results` et Task 10 mesure.

---

### Task 1: Script de préparation, bibliothèque pure

**Files:**
- Create: `tools/models/package.json`, `tools/models/.gitignore` (`.cache/`, `node_modules/`, `stage/`)
- Create: `tools/models/lib/properties.ts`, `tools/models/lib/names.ts`, `tools/models/lib/outline.ts`, `tools/models/lib/mainMaterial.ts`
- Test: `tests/tools/properties.test.ts`, `tests/tools/names.test.ts`, `tests/tools/outline.test.ts`, `tests/tools/mainMaterial.test.ts`
- Modify: `tsconfig.app.json` (include `tools/models/lib`)

**Interfaces:**
- Produces:
  - `parseProperties(text: string): Map<string, string>` : format Java (`key=value`, `#` et `!` commentaires, `\uXXXX`, lignes continuées par `\`, `\:` `\=`).
  - `slug(s: string): string` : kebab-case ASCII (accents retirés, camelCase coupé, non alphanumériques -> `-`).
  - `cleanName(s: string): string` : remplace `’‘` -> `'`, `“”«»` -> `"`, `–—` -> `-`, `…` -> `...`, `×` -> `x`, espace insécable -> espace, espaces multiples réduits, trim.
  - `interface TopTriangle { a: [number, number, number]; b: [number, number, number]; c: [number, number, number] }` (coordonnées normalisées, y vers le haut).
  - `computeOutline(tris: TopTriangle[], grid?: number): { outline: number[][]; detail: number[][] }` : anneaux plats `[x0, y0, x1, y1, ...]` en millièmes, y = +z du modèle.
  - `pickMainMaterial(mats: Array<{ name: string; area: number; color: [number, number, number]; metallic: number; alpha: number }>): number` (index).

- [ ] **Step 1: tests properties et names** : `parseProperties('a=1\nname#1=Fauteuil \\u00e0 bascule\n# c\nlong=x\\\n  y')` -> `a`='1', `name#1`='Fauteuil à bascule', `long`='xy' ; `slug('loungeSofaCorner')` = `lounge-sofa-corner`, `slug('Lit à barreaux 2')` = `lit-a-barreaux-2` ; `cleanName('Table d’appoint – 2…')` = `Table d'appoint - 2...`.
- [ ] **Step 2: tests outline** : carré plein (deux triangles horizontaux couvrant la boîte) -> un anneau dont la boîte englobante est à 1 % près [-500, 500]² et aucun détail ; disque (64 triangles en éventail) -> un anneau d'aire pi/4 x 10^6 à 3 % près ; forme en L -> un anneau non convexe d'aire 0,75 x 10^6 à 3 % ; panneau vertical fin (deux triangles dans le plan x = 0) -> un anneau non vide grâce au tracé des arêtes ; canapé (bloc bas sur toute la boîte + dossier haut sur l'arrière) -> détail d'environ 25 % de l'aire, côté -y ; deux blocs séparés -> deux anneaux ; aucune coordonnée hors [-500, 500], aucune NaN.
- [ ] **Step 3: test mainMaterial** : plus grande aire gagne ; une matière noire (luminance < 0,15), métallique (>= 0,5) ou transparente (alpha < 0,9) perd contre une autre plus petite mais "normale" ; si toutes sont exclues, la plus grande gagne.
- [ ] **Step 4: vérifier l'échec** (`npm test -- tests/tools`).
- [ ] **Step 5: implémenter.** `computeOutline` : grille `grid` (défaut 128) sur [-0,5 ; 0,5]² ; pour chaque triangle, remplissage des cellules dont le centre est dans le triangle projeté (x, z) et tracé des trois arêtes (pas d'une demi-cellule), hauteur max par cellule ; fermeture morphologique d'une cellule ; trous de moins de 2 % de l'aire bouchés (remplissage par inondation depuis le bord) ; marching squares sur le masque ; Douglas-Peucker 0,6 cellule ; anneaux de moins de 0,5 % retirés ; détail = même chose sur les cellules de hauteur >= 0,6 x max, gardé si son aire est entre 3 % et 90 % de l'aire du contour ; conversion en millièmes arrondis.
- [ ] **Step 6: vérifier le succès, puis commit** `feat(models): pure helpers of the models pipeline`.

### Task 2: Acquisition, conversion, normalisation, optimisation

**Files:**
- Create: `tools/models/sources.json`, `tools/models/lib/fetch.ts`, `tools/models/lib/sh3f.ts`, `tools/models/lib/polyhaven.ts`, `tools/models/lib/convert.ts`, `tools/models/stage.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `fetchCached(url: string, sha256?: string): Promise<string>` (chemin dans `.cache/`).
  - `readSh3fCatalog(dir: string, library: string): RawItem[]` avec
    `interface RawItem { source: 'kenney'|'quaternius'|'sh3d'|'polyhaven'; library: string; key: string; name: string; nameFr?: string; category?: string; width?: number; depth?: number; height?: number; elevation?: number; creator?: string; license: string; pageUrl?: string; modelPath: string; modelRotation?: number[]; doorOrWindow?: boolean; tags?: string[] }`.
  - `toNormalizedGlb(item: RawItem, opts: { textureSize: number }): Promise<{ glb: Uint8Array; tris: number; materials: number; outline: number[][]; detail: number[][]; natural: { w: number; d: number; h: number } }>`.
  - `stage.ts` : écrit `tools/models/stage/<source>/<key>.glb` et `stage/index.json` (tous les `RawItem` + résultats ou raison d'échec).
- [ ] **Step 1: `sources.json`** : URL Kenney (`kenney_furniture-kit.zip`), Quaternius (OpenGameArt), les six archives Sweet Home 3D 1.9.3 (SourceForge), Poly Haven (`https://api.polyhaven.com`, catégories `furniture`, `seating`, `table`, `shelves`, `lighting`, `appliances`, `electronics`, `decorative`, `plants`, `office`) ; sha256 relevés au premier téléchargement et figés.
- [ ] **Step 2: `sh3f.ts`** : dézippe l'archive puis le `.sh3f` (fflate), lit `PluginFurnitureCatalog.properties` et `_fr`, produit un `RawItem` par index `#n` ; `license` vient du champ `license#n` sinon de la bibliothèque.
- [ ] **Step 3: `convert.ts`** : GLB lu, ou OBJ via `obj2gltf`, ou glTF Poly Haven ; `modelRotation` appliquée (matrice 3 x 3 ligne par ligne) ; boîte englobante -> normalisation unité ; `dedup, flatten, join, weld`, `simplify` si > 10 000 triangles (ratio = 10 000 / n, erreur 0,01), `prune`, `textureCompress` WebP (taille `opts.textureSize`), `quantize`, `meshopt` ; renomme `main` la matière de `pickMainMaterial` (aire = somme des aires de triangles par matière) ; contour par `computeOutline` sur les triangles normalisés.
- [ ] **Step 4: `stage.ts`** : lance tout, seconde passe à 128 px si GLB > 150 Ko, rejette au-delà des budgets, écrit `stage/index.json` avec `reason` pour chaque rejet.
- [ ] **Step 5: lancer** `cd tools/models && npm install && npm run stage` ; vérifier le décompte par source dans la sortie ; commit `feat(models): fetch, convert and normalize the sources`.

### Task 3: Rendu des icônes et planches de tri

**Files:**
- Create: `tools/models/render/page.html`, `tools/models/render/render.ts`

**Interfaces:**
- Consumes: `stage/index.json`, GLB du stage.
- Produces: `stage/icons/<source>/<key>.webp` (96 x 96, fond transparent, vue 3/4 avant, caméra cadrée sur la boîte unité mise aux tailles réelles), `stage/sheets/<source>-<n>.png` (planches 10 x 10 avec la clé sous chaque icône), et `rendered: boolean` / `reason: 'render-failed' | 'empty-render'` dans l'index.
- [ ] **Step 1** : serveur HTTP Node minimal servant `render/`, `stage/` et `node_modules/three` ; page avec importmap, `GLTFLoader` + `MeshoptDecoder`, lumière ambiante + directionnelle, `window.renderModel(url, w, h, d): Promise<string>` (dataURL PNG) ; image vide (aucun pixel opaque) = échec.
- [ ] **Step 2** : `render.ts` (Playwright Chromium) rend chaque modèle, convertit en WebP 96 px (sharp), compose les planches.
- [ ] **Step 3: lancer** `npm run render` ; ouvrir les planches ; commit `feat(models): icon and contact sheet renderer`.

### Task 4: Curation et publication

**Files:**
- Create: `tools/models/curation/kenney.json`, `quaternius.json`, `polyhaven.json`, `sh3d.json`, `tools/models/lib/rules.ts`, `tools/models/publish.ts`
- Create (générés) : `public/models/*.glb`, `public/models/icons/*.webp`, `public/models/LICENSES/*.txt`, `src/catalog/generated/models.ts`, `src/catalog/generated/credits.ts`, `tools/models/ids.lock`, `tools/models/report.md`
- Test: `tests/tools/rules.test.ts`

**Interfaces:**
- Produces (dans `src/catalog/generated/models.ts`) :

```ts
import type { ModelEntryData } from '../catalog';
export const MODEL_ENTRIES: ModelEntryData[] = [ /* ... */ ];
```

  avec `ModelEntryData = { id; name; category; width; depth; height; pose; elevation?; acceptsUnder?; carriesOnTop?; style: 'simple' | 'realiste'; outline: number[][]; detail: number[][] }` (défini en Task 5).
- `credits.ts` : `export const MODEL_CREDITS: Record<string, { source: string; library: string; author: string; license: string; url?: string }>`.
- `rules.ts` : `categoryOf(item): CatalogCategory | null` (null = écarté), `poseOf(item, category): { pose; elevation? }`, `flagsOf(item, category): { acceptsUnder?; carriesOnTop? }`, `autoExclusion(item): string | null`.

- [ ] **Step 1: tests rules** : `Bedroom` -> `Chambre` ; `Doors and windows` -> null ; nom contenant "tapis"/"rug" -> `covering` ; "chaise"/"tabouret"/"chair"/"stool" -> `tuckable` ; élévation 150 hors luminaire -> `wall` avec 150 ; "plafonnier"/"ceiling" -> `floor` avec élévation `250 - height` (>= 0) ; "table"/"bureau"/"desk" (hors "table de nuit", "lampe de table") -> `acceptsUnder` ; "étagère murale"/"wall shelf" en pose `wall` -> `carriesOnTop` ; véhicule, personnage, animal, nourriture, objet > 600 cm -> exclusion avec raison.
- [ ] **Step 2: implémenter `rules.ts`**, vérifier.
- [ ] **Step 3: curation Kenney et Quaternius** : pour chaque modèle gardé, `{ key, id, name, category, width, depth, height, pose?, elevation?, flags?, rotateY? }` en dimensions réelles (cm) ; murs, sols, portes, cartons, ours en peluche écartés avec raison.
- [ ] **Step 4: curation Poly Haven** : liste des identifiants gardés avec nom français et catégorie, à partir des planches (meubles, luminaires, appareils, déco d'intérieur, plantes en pot) ; tailles prises sur le modèle (échelle réelle).
- [ ] **Step 5: tri Sweet Home 3D** : règles automatiques, puis revue des planches ; `sh3d.json` = `{ exclude: { "<library>/<key>": "<raison>" }, override: { ... } }`.
- [ ] **Step 6: `publish.ts`** : fusionne stage + curation, dédoublonne (même nom normalisé et tailles à 5 % près : garder Kenney > Quaternius > Poly Haven > Sweet Home 3D CC0 > CC-BY > Free Art License), copie GLB et icônes sous l'identifiant final, écrit `models.ts` (trié par catégorie puis nom, une entrée par ligne), `credits.ts`, les textes de licence, `ids.lock` (union avec l'existant, jamais de retrait), `report.md` (comptes, poids total et médian, rejets).
- [ ] **Step 7: lancer** `npm run publish` ; vérifier `report.md` (>= 500 objets, médiane GLB < 40 Ko) ; commit `feat(models): curated catalog of downloaded models`.

### Task 5: Catalogue de l'app

**Files:**
- Modify: `src/catalog/catalog.ts`
- Modify: `tests/core/catalog.test.tsx`
- Create: `tests/core/catalog-models.test.ts`

**Interfaces:**
- Produces:

```ts
export type CatalogCategory = 'Chambre' | 'Séjour' | 'Bureau et repas' | 'Cuisine' | 'Salle de bain' | 'Luminaires' | 'Décoration' | 'Extérieur' | 'Divers' | 'Structure' | 'Génériques';
export const CATEGORY_ORDER: CatalogCategory[]; // display order, as listed
export interface ModelInfo { outline: number[][]; detail: number[][]; style: 'simple' | 'realiste' }
export interface CatalogEntry { /* existing */ model?: ModelInfo }
export interface ModelEntryData { id: string; name: string; category: CatalogCategory; width: number; depth: number; height: number; pose: ObjectPose; elevation?: number; acceptsUnder?: boolean; carriesOnTop?: boolean; style: 'simple' | 'realiste'; outline: number[][]; detail: number[][] }
export const BUILTIN_CATALOG: CatalogEntry[]; // the 44 parametric entries
export const CATALOG: CatalogEntry[]; // builtin then models
export const modelUrl: (id: string, base: string) => string; // `${base}models/${id}.glb`
export const modelIconUrl: (id: string, base: string) => string; // `${base}models/icons/${id}.webp`
```

  Les entrées modèles prennent `shape: 'symbol'` et `color` = teinte de leur catégorie (nouvelles teintes : Luminaires `#e6dcb0`, Décoration `#d8c8d8`, Extérieur `#c8d8b8`, Divers `#dddddd`). `getCatalogEntry` passe par une `Map` (plus de `find` linéaire sur ~1 000 entrées).

- [ ] **Step 1: tests** : `catalog.test.tsx` vise `BUILTIN_CATALOG` pour "44 entries" ; les tests de noms, couleurs et tailles couvrent tout `CATALOG` ; `catalog-models.test.ts` : chaque entrée `model` a `public/models/<id>.glb` et `icons/<id>.webp`, un contour non vide dans [-500 ; 500] avec un nombre pair de valeurs, un identifiant présent dans `ids.lock` et dans `MODEL_CREDITS` avec une licence autorisée ; chaque identifiant de `ids.lock` existe dans `CATALOG` ; au moins 500 entrées `model` ; préfixes autorisés ; aucun identifiant en double avec le catalogue paramétrique ; `getCatalogEntry` retrouve un modèle.
- [ ] **Step 2: échec, implémentation, succès.**
- [ ] **Step 3: commit** `feat(catalog): downloaded model entries`.

### Task 6: Symbole 2D des modèles

**Files:**
- Modify: `src/catalog/symbols.tsx` (ajout `ModelSymbol`), `src/render/layers/ObjectsLayer.tsx`
- Test: `tests/editor/model-symbol.test.tsx`

**Interfaces:**
- Produces: `ModelSymbol(p: SymbolProps & { model: ModelInfo }): JSX.Element` : un `<path>` par anneau du contour (`fill={p.fill}`, `fillRule="evenodd"`), un `<path fill="none">` par anneau de détail ; point `(x / 1000 * w, y / 1000 * d)` arrondi au centième ; anneau de moins de 3 points ignoré.
- [ ] **Step 1: tests** : contour carré mis à l'échelle (200 x 100 -> coordonnées -100..100 et -50..50) ; détail en `fill="none"` ; extreme sizes stay finite (5 x 5, 600 x 10, pas de NaN/Infinity) ; `ObjectsLayer` rend un `ModelSymbol` pour un identifiant modèle ; unknown model id falls back to a rectangle (`kn-does-not-exist` -> `rect`).
- [ ] **Step 2: échec, implémentation, succès ; commit** `feat(plan): top view outline of downloaded models`.

### Task 7: Panneau Catalogue

**Files:**
- Modify: `src/ui/CatalogPanel.tsx`, `src/styles.css`
- Test: `tests/editor/catalog-panel.test.tsx`

**Interfaces:**
- Consumes: `CATALOG`, `CATEGORY_ORDER`, `modelIconUrl`.
- Produces: `filterCatalog(entries, query, style: 'all' | 'simple' | 'realiste', limit = 80): { items: CatalogEntry[]; truncated: boolean }` (exporté pour test), ordre : catégorie (`CATEGORY_ORDER`), paramétriques d'abord, puis nom (`localeCompare` fr).
- [ ] **Step 1: tests** : icône `<img loading="lazy">` pour une entrée modèle, symbole SVG pour une paramétrique ; titre de catégorie avec son nombre ; search shows at most 80 results (`truncated` vrai, message "80 premiers résultats, précisez la recherche") ; filtre `realiste` n'affiche aucune entrée paramétrique ; recherche sans accents (`refrigerateur` trouve "Réfrigérateur").
- [ ] **Step 2: échec, implémentation, succès ; e2e catalogue existants verts ; commit** `feat(ui): catalog panel for hundreds of models`.

### Task 8: Modèles en 3D

**Files:**
- Create: `src/scene3d/models.ts`
- Modify: `src/scene3d/furniture/index.ts`, `src/scene3d/index.ts`
- Test: `tests/editor/models3d.test.ts`

**Interfaces:**
- Produces:

```ts
export type ModelLoader = (url: string) => Promise<Object3D>; // the glTF scene
export class ModelLibrary {
  constructor(load: ModelLoader, urlOf: (id: string) => string, onReady: (id: string) => void);
  /** The template when loaded; starts the load once otherwise and returns null. */
  get(id: string): Object3D | null;
  failed(id: string): boolean;
  /** Main material tinted to `color` (cached by model and color). */
  tinted(id: string, base: Material, color: string): Material;
  purge(used: Set<Material>): void;
  dispose(): void;
  readonly stats: { loaded: number; failed: number };
}
export function createGltfLoader(): ModelLoader; // GLTFLoader + MeshoptDecoder
```

  `FurnitureLayer` reçoit une `ModelLibrary | null` ; `Built` garde `waiting: string | null` (identifiant du modèle attendu) ; `sync` reconstruit les objets dont le modèle attendu est prêt ou en échec. Les meshes de modèle ont `userData.sharedGeometry = true` ; `remove` ne libère pas ces géométries. Dans `createScene3D`, `onReady` relance `update(lastInput)` (rien après `dispose`). `scene3dStats.modelsLoaded/modelsFailed`.

- [ ] **Step 1: tests (chargeur factice contrôlé par promesses)** : premier `sync` -> boîte générique et un seul appel au chargeur pour deux objets du même modèle ; après résolution -> `onReady` appelé, `sync` reconstruit, le corps contient le gabarit cloné, scaled into its box (boîte englobante = w, h, d à 1 mm), mirrored (scale.x négatif) ; couleur personnalisée -> la matière `main` est une copie de la couleur, les autres matières sont celles du gabarit ; failed load keeps the box and is not retried (chargeur rejeté -> `failed`, un seul appel après plusieurs `sync`) ; suppression d'un objet sans libérer les géométries partagées (espion sur `dispose`) ; load resolved after dispose is ignored ; unknown id builds the generic box.
- [ ] **Step 2: échec, implémentation, succès.**
- [ ] **Step 3: e2e** `tests/e2e/scene3d-models.spec.ts` : chercher "réfrigérateur", poser un modèle, ouvrir la 3D, attendre `modelsLoaded >= 1` et `modelsFailed === 0`, aucune erreur console.
- [ ] **Step 4: commit** `feat(3d): load downloaded models on demand`.

### Task 9: Crédits et documentation

**Files:**
- Create: `src/ui/CreditsDialog.tsx`
- Modify: `src/ui/Header.tsx`, `README.md`, `CLAUDE.md`
- Test: `tests/editor/credits.test.tsx`, e2e dans `tests/e2e/scene3d-models.spec.ts`

- [ ] **Step 1: tests** : la fenêtre (avec `MODEL_CREDITS` injecté) groupe par source, affiche licence, nom, auteur, lien ; e2e : ouvrir "Crédits" depuis l'en-tête.
- [ ] **Step 2: implémenter** (chargement de `credits.ts` par `import()` à l'ouverture ; bouton "Crédits" dans l'en-tête) ; README : section "Modèles 3D" (sources, licences, `cd tools/models && npm install && npm run models`) ; CLAUDE.md : commande de régénération et règle "ne jamais renommer un identifiant de modèle".
- [ ] **Step 3: commit** `feat(ui): credits of the 3D models`.

### Task 10: Rapidité, décisions, revue

**Files:**
- Create: `tests/core/catalog-perf.test.tsx`, `docs/superpowers/decisions/2026-10-13-catalogue-modeles-3d-decisions.md`

- [ ] **Step 1: mesures avant (sur `main`) et après** : taille gzip du bundle principal (`npm run build`), temps de rendu d'une catégorie de 200 objets et d'une recherche (test perf), 3D avec 60 modèles différents (appels de dessin via `renderer.info.render.calls`, durée d'une image) dans l'e2e.
- [ ] **Step 2: budgets en tests** : `filterCatalog` sur tout le catalogue < 16 ms (médiane de 20) ; rendu d'une catégorie de 200 < 50 ms ; `models.ts` gzip <= 120 Ko.
- [ ] **Step 3: décisions consignées** (choix, chiffres mesurés, modèles écartés et pourquoi).
- [ ] **Step 4: revue indépendante de la branche** (agent `client-reviewer`), traitement des bloquants, re-revue jusqu'à zéro bloquant ; commit.
