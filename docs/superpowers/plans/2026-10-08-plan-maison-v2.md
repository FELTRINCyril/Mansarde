# Plan Maison V2 - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter à Plan Maison les pentes de toit, poutres, placards muraux, modes de pose, vérifications non bloquantes, dimensions de pièces intérieures, et une vue 3D dans le style de `plan-chambre`.

**Architecture:** Le noyau pur (`src/core`) gagne le modèle des volumes, la hauteur sous plafond, le moteur de vérifications et la génération de maillages ; l'éditeur et le rendu SVG gagnent outils, panneaux et couches ; un module `src/scene3d` (Three.js, chargé à la demande) convertit les maillages et construit les meubles.

**Tech Stack:** existant (TypeScript, Vite, React, Zustand, Immer, polygon-clipping, polylabel, idb, zod, jspdf, svg2pdf.js, Vitest, Playwright) + `three` (et `@types/three`).

**Spec:** `docs/superpowers/specs/2026-10-08-plan-maison-v2-design.md` (et la spec V1 `docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md`, toujours valable). Référence visuelle et fonctionnelle : `/Users/cyril/Documents/Autre/plan-chambre/index.html` (lecture seule).

## Global Constraints

- Toutes les contraintes V1 restent valables : cm, Y vers le bas, rotation en degrés sens horaire (`rotate(v, rad) = (x cos - y sin, x sin + y cos)`), `src/core` sans React ni API navigateur, toute modification par une commande (`applyCommand` / `store.execute` / gestes), recettes déterministes (identifiants créés hors recette).
- Code, identifiants, commentaires, commits : ASCII anglais, pas de `Co-Authored-By`. Interface : français avec accents ; jamais de tiret long ou moyen, guillemets typographiques, ellipse, flèches unicode, puces unicode, signe multiplication, espace insécable. `²` et `°` autorisés (dans le code, via `²` / `°`).
- Une seule dépendance ajoutée : `three` + `@types/three`. Addons depuis `three/examples/jsm/...` (ou `three/addons/...`).
- Three.js chargé uniquement par import dynamique depuis le composant de vue 3D.
- Valeurs par défaut : pente `heightEnd` 150, `heightStart` = hauteur du niveau ; poutre largeur 12, retombée 15 ; placard 120 x 60, socle 10, hauteur fixe 220, jeu 2, couleur `#e8e1d4`, portes `max(1, round(width / 55))`.
- Couleurs 3D (spec 8.2) : fond `#eef0f4`, murs `#f2eee7`, plafond `#f6f3ee`, dalle `#b9b1a5`, cadres `#fbfbfa`, vitrage `#bcd7f0` 55 %, portes `#fbfaf7`, poutres `#a07e5c`, placards `#e8e1d4`, poignées `#8f8a82`, alerte `#cf2e2e`, avertissement `#e08a1e`, étiquettes `#2438a0`.
- Seuils : tolérance hauteur 1 cm ; recouvrement 1 cm² (emprise) et 1 cm (vertical) ; dégagement placard 60 (avertissement) / 30 (erreur) ; objets "bas" pour l'arc de porte : dessous < 200 cm.
- Branche de travail `feat/v2` ; travail parallèle en worktrees `pm-<tâche>` (branche `feat/v2-<tâche>`), port e2e `E2E_PORT` propre à chaque worktree ; fusion par l'orchestrateur après revue.
- Gates de chaque tâche : `npm test`, `npm run typecheck`, `npm run e2e` si la tâche touche l'interface ; tous verts.

## Review Focus

1. **Projets V1 déjà stockés dans IndexedDB** : ils doivent s'ouvrir après la mise à jour (migration au chargement, pas seulement à l'import). Test : Task 1, `ProjectStore migrates a stored V1 project on read`.
2. **Pente tracée à cheval sur plusieurs pièces ou objet à cheval sur la ligne de départ** : `ceilingUnder` doit découper l'emprise et donner la hauteur exacte au pire point. Test : Task 2, `footprint straddling the start line`.
3. **Mur porteur d'un placard déplacé, raccourci ou supprimé** : le placard suit, est recalé, ou la commande est refusée ; supprimer le mur supprime le placard. Test : Task 3, `cupboard follows, clamps or refuses with its wall` et `deleteWalls removes cupboards`.
4. **Vue 3D sur un niveau vide, sans pièce fermée, ou en géométrie dégradée** : pas d'erreur, scène vide ou simplifiée. Test : Task 11, e2e `3d view on empty and open-wall levels`.
5. **Beaucoup d'objets** : `computeChecks` sur 300 objets reste sous 50 ms et l'aperçu des gestes reste fluide. Test : Task 4, `checks performance budget`.

---

## Structure des fichiers (ajouts)

```
src/core/model/types.ts            (modifié) Slope, Beam, Cupboard, ObjectPose, champs Level/PlacedObject/CustomObjectDef
src/core/persistence/migrate.ts    (modifié) migration 1 -> 2
src/core/persistence/schema.ts     (modifié) schémas des nouveaux types
src/core/geometry/ceiling.ts       ceilingWithoutBeams, ceilingAt, ceilingUnder
src/core/geometry/slopes.ts        slopeFrame, slopeBand, slopeHeightAt, slopeIsolines
src/core/geometry/beams.ts         beamFootprint, beamBottomAt
src/core/geometry/cupboards.ts     cupboardFrame, cupboardFootprint, cupboardTopProfile, cupboardDoors
src/core/geometry/pose.ts          supportElevation, snapToWallForPose
src/core/geometry/roomRect.ts      rectangularRoom (détection pièce rectangulaire, faces et murs)
src/core/geometry/offsetChain.ts   offsetChain (ligne de référence de l'outil Mur)
src/core/checks/types.ts           Check, CheckKind
src/core/checks/computeChecks.ts   moteur + cache
src/core/checks/rules/*.ts         une règle par fichier
src/core/commands/slopes.ts  beams.ts  cupboards.ts  roomSize.ts
src/core/mesh/types.ts  walls.ts  floors.ts  ceilings.ts  beams.ts  cupboards.ts
src/catalog/catalog.ts  symbols.tsx (modifiés)
src/render/layers/SlopesLayer.tsx  BeamsLayer.tsx  CupboardsLayer.tsx  AlertsLayer.tsx
src/editor/tools/slopeTool.ts  beamTool.ts  cupboardTool.ts (+ machines pures si utile)
src/ui/ChecksPanel.tsx  SlopeProperties.tsx  BeamProperties.tsx  CupboardProperties.tsx  RoomSizeFields.tsx  ViewSwitch.tsx
src/scene3d/                       renderer, matériaux, textures, conversion de maillages, meubles, caméra, sélection
src/ui/Plan3DView.tsx              hôte React (import dynamique de src/scene3d)
.github/workflows/deploy.yml
```

---

### Task 1: Modèle V2, migration, schéma, validation, clonage, stockage

**Files:**
- Modify: `src/core/model/types.ts`, `src/core/model/factory.ts`, `src/core/model/defaults.ts`, `src/core/model/clone.ts`, `src/core/persistence/migrate.ts`, `src/core/persistence/schema.ts`, `src/core/commands/validate.ts`, `src/storage/db.ts`, `src/catalog/catalog.ts` (champs `pose`, `acceptsUnder` seulement)
- Test: `tests/core/model-v2.test.ts`, `tests/core/migrate.test.ts`, `tests/storage/db-migrate.test.ts`, mises à jour des tests existants qui construisent des niveaux/objets

**Interfaces (Produces, exact):**

```ts
// types.ts
export type ObjectPose = 'floor' | 'covering' | 'onTop' | 'tuckable' | 'wall';
export interface Slope {
  id: Id; a: Vec2; b: Vec2;            // start line
  side: 'left' | 'right';              // ceiling goes down towards this side; left = +perp(b - a)
  depth: number;                       // distance start line -> end line, > 0
  heightStart: number; heightEnd: number;
}
export interface Beam {
  id: Id; a: Vec2; b: Vec2; width: number; drop: number;
  mode: 'ceiling' | 'fixed'; bottom: number; // bottom used in 'fixed' mode
}
export interface Cupboard {
  id: Id; wallId: Id; offset: number;  // center along the wall axis from the start node
  side: 'left' | 'right';              // wall face it stands against (left = +perp(dir))
  width: number; depth: number; plinth: number;
  heightMode: 'fixed' | 'ceiling'; height: number; gap: number;
  doorCount: number; doorType: 'hinged' | 'sliding'; color: string;
}
// Level gains: slopes: Record<Id, Slope>; beams: Record<Id, Beam>; cupboards: Record<Id, Cupboard>;
// PlacedObject gains: pose: ObjectPose;   CustomObjectDef gains: pose: ObjectPose;
export const FORMAT_VERSION = 2;
// catalog.ts: CatalogEntry gains pose: ObjectPose; acceptsUnder?: boolean
// defaults.ts:
export const SLOPE_DEFAULT_END = 150;
export const BEAM_DEFAULTS = { width: 12, drop: 15 } as const;
export const CUPBOARD_DEFAULTS = { width: 120, depth: 60, plinth: 10, height: 220, gap: 2, color: '#e8e1d4', doorType: 'hinged' } as const;
export const doorCountFor = (width: number): number => Math.max(1, Math.round(width / 55));
// factory.ts:
export function createSlope(a: Vec2, b: Vec2, side: 'left' | 'right', depth: number, heightStart: number, heightEnd = SLOPE_DEFAULT_END): Slope;
export function createBeam(a: Vec2, b: Vec2, overrides?: Partial<Beam>): Beam;
export function createCupboard(wallId: Id, offset: number, side: 'left' | 'right', overrides?: Partial<Cupboard>): Cupboard;
// createLevel returns empty slopes/beams/cupboards; createObjectFromSize gains pose (default 'floor')
// storage: ProjectStore.getProject / listProjects run migrate() on stored projects with formatVersion < 2 and return V2 projects
```

Pose par défaut du catalogue existant : `chair` -> `tuckable` ; `desk`, `table-rect`, `table-round`, `coffee-table` -> `acceptsUnder: true` ; tous les autres -> `floor`.

Migration 1 -> 2 : chaque niveau reçoit `slopes: {}`, `beams: {}`, `cupboards: {}` ; chaque objet `pose` = `getCatalogEntry(id).pose` si source catalogue, sinon `floor`, sauf nom contenant "tapis" (insensible à la casse et aux accents) -> `covering` ; chaque `customObjects` idem ; `formatVersion` (racine et projet) = 2. La migration est pure (pas d'import du catalogue dans `src/core` si cela crée un cycle : passer une table `poseByCatalogId` construite dans `src/core/model/catalogPose.ts` à partir des ids, ou importer `src/catalog/catalog.ts` s'il reste pur - vérifier qu'il n'importe pas React).

Invariants ajoutés (`validateProject`) : pente `depth > 0`, `|b - a| >= 1`, hauteurs > 0 ; poutre `|b - a| >= 1`, `width > 0`, `drop > 0`, `bottom > 0` ; placard : mur existant, `width/depth/plinth(>=0)/height/gap(>=0)` finis, tient dans le mur (`offset - width/2 >= 0` et `offset + width/2 <= wallLength`, tolérance 1e-6), `doorCount >= 1` entier ; objet : `pose` valide. Clonage : nouveaux ids pour pentes, poutres, placards ; `cupboard.wallId` remappé. Schéma zod : mêmes bornes que la V1 (coordonnées |v| <= 1e6, longueurs positives), clés égales aux ids.

- [ ] **Step 1: Tests** (`model-v2.test.ts`, `migrate.test.ts`, `db-migrate.test.ts`) :
  - `createLevel` a `slopes`, `beams`, `cupboards` vides ; `createCupboard(w, 100, 'left')` a 2 portes (120/55 = 2,18 -> 2) ; `doorCountFor(30) === 1`.
  - Migration d'un export V1 contenant une chaise du catalogue, un générique nommé "Tapis salon" et un générique "Table" : poses `tuckable`, `covering`, `floor` ; `formatVersion` 2 ; `parseImport` d'un fichier V1 réussit ; fichier version 3 refusé avec le message "version plus récente".
  - `validateProject` refuse un placard plus large que son mur, une pente de profondeur 0, une poutre de longueur 0, une pose inconnue.
  - `cloneLevelWithNewIds` d'un niveau avec un placard : `wallId` du clone pointe sur le mur cloné.
  - **`ProjectStore migrates a stored V1 project on read`** (Review Focus 1) : avec `fake-indexeddb`, écrire directement un objet projet V1 dans le store `projects`, puis `getProject` et `listProjects` renvoient un projet V2 valide (`validateProject` vide).
- [ ] **Step 2:** RED, puis implémentation, puis mettre à jour les tests V1 qui construisent des `Level`/`PlacedObject` à la main (fixtures, helpers) pour inclure les nouveaux champs ; tous les tests verts ; typecheck vert.
- [ ] **Step 3:** commit `feat(core): add V2 model (slopes, beams, cupboards, object pose) with migration`.

---

### Task 2: Géométrie des volumes (plafond, pentes, poutres, placards, pose)

**Files:**
- Create: `src/core/geometry/slopes.ts`, `beams.ts`, `ceiling.ts`, `cupboards.ts`, `pose.ts`
- Modify: `src/core/geometry/derived.ts` (ajout d'un cache des volumes)
- Test: `tests/core/ceiling.test.ts`, `tests/core/cupboards-geometry.test.ts`, `tests/core/pose.test.ts`

**Interfaces:**

```ts
// slopes.ts
export interface SlopeFrame { a: Vec2; b: Vec2; dir: Vec2; normal: Vec2; length: number; depth: number } // normal points down-slope
export function slopeFrame(s: Slope): SlopeFrame;
export function slopeBand(s: Slope): Ring;          // quad a, b, b + normal*depth, a + normal*depth
export function slopeHeightAt(s: Slope, p: Vec2): number | null; // null outside lateral extent or upslope (d < 0); heightEnd beyond depth
export interface Isoline { a: Vec2; b: Vec2; height: number; kind: 'start' | 'end' | 'level' }
export function slopeIsolines(s: Slope, stepCm = 20): Isoline[]; // start, end, and every multiple of step strictly between
// beams.ts
export function beamFootprint(b: Beam): Ring;       // rectangle around a->b, width
export function beamBottomAt(level: Level, b: Beam, p: Vec2): number; // fixed: b.bottom ; ceiling: ceilingWithoutBeams(level, p) - drop
// ceiling.ts
export function ceilingWithoutBeams(level: Level, p: Vec2): number;
export function ceilingAt(level: Level, p: Vec2): number;
export function ceilingUnder(level: Level, footprint: Ring): { height: number; at: Vec2 };
// cupboards.ts
export interface CupboardFrame { wallId: Id; back: [Vec2, Vec2]; front: [Vec2, Vec2]; dir: Vec2; outward: Vec2; width: number; depth: number }
export function cupboardFrame(level: Level, c: Cupboard): CupboardFrame; // back edge on the wall face (thickness/2 from axis on c.side)
export function cupboardFootprint(level: Level, c: Cupboard): Ring;
export interface ProfilePoint { s: number; top: number } // s = 0..width along the cupboard, top = absolute height
export function cupboardTopProfile(level: Level, c: Cupboard): ProfilePoint[]; // fixed: two points at height; ceiling: breakpoints at slope lines and beam edges, min(front, back) - gap
export function cupboardDoors(level: Level, c: Cupboard): Array<{ from: Vec2; to: Vec2; hingeAt: Vec2 }>; // equal doors on the front edge
// pose.ts
export function supportElevation(level: Level, objectId: Id | null, at: Vec2, customObjects: Record<Id, CustomObjectDef>): number; // highest top of floor/tuckable objects (not objectId) whose footprint contains `at`, else 0
export function snapToWallForPose(o: PlacedObject, level: Level): { x: number; y: number; rotation: number } | null; // back against the nearest wall face within 2 * depth, else null
```

Algorithme `ceilingUnder` (exact) : partir de `level.height` ; pour chaque pente, intersecter l'emprise avec la bande étendue (bande + zone au-delà de la ligne d'arrivée, bornée latéralement) via `src/core/geometry/boolean.ts` ; évaluer `slopeHeightAt` aux sommets de l'intersection, garder le minimum ; pour chaque poutre dont l'emprise intersecte l'emprise de l'objet, évaluer `beamBottomAt` aux sommets de l'intersection ; renvoyer le minimum global et le point. Plafond : `ceilingWithoutBeams` = min(`level.height`, pentes) ; `ceilingAt` = min(`ceilingWithoutBeams`, dessous des poutres dont l'emprise contient le point).

- [ ] **Step 1: Tests** (valeurs calculées à la main, pièce `plan-chambre` : niveau hauteur 240, pente de départ a = (197, -50), b = (197, 450), `side` vers +x, profondeur 203, 240 -> 150) :
  - `ceilingAt((100, 200)) === 240` ; `ceilingAt((300, 200))` proche de `240 - 103 * 90 / 203` (194,33) ; `ceilingAt((400, 200)) === 150` ; au-delà (x = 420) 150 ; côté amont (x = 150) 240.
  - **`footprint straddling the start line`** (Review Focus 2) : emprise x 180..260, y 0..60 -> `ceilingUnder.height` = `240 - 63 * 90 / 203` (212,07), `at.x === 260`.
  - Armoire x 330..390 -> 154,43 environ, `at.x === 390`.
  - Deux pentes opposées (toit à deux pans) : le plafond au faîtage vaut le min des deux.
  - Poutre fixe `bottom` 225 de (185, 0) à (185, 400), largeur 12 : `ceilingAt((185, 100)) === 225` ; objet qui la chevauche -> 225 ; poutre `ceiling` drop 15 sous la pente : dessous = plafond - 15.
  - `slopeIsolines` : lignes `start` (240), `level` à 220, 200, 180, 160, `end` (150) ; positions x calculées.
  - `cupboardTopProfile` en mode `ceiling` sous la pente, placard contre le mur x = 400 (face côté pièce) : top = 150 - 2 aux deux extrémités ; placard le long d'un mur perpendiculaire traversant la ligne de départ : point de cassure à la ligne de départ.
  - `cupboardDoors` : 120 cm -> 2 portes de 60.
  - `supportElevation` : TV au-dessus d'un meuble TV de hauteur 50 -> 50 ; hors meuble -> 0 ; ignore les tapis.
  - `snapToWallForPose` : TV murale près d'un mur -> dos contre la face, rotation du mur.
- [ ] **Step 2:** RED, implémentation, verts ; commit `feat(core): add ceiling height, slopes, beams, cupboard and pose geometry`.

---

### Task 3: Commandes des volumes et des dimensions de pièces

**Files:**
- Create: `src/core/commands/slopes.ts`, `beams.ts`, `cupboards.ts`, `roomSize.ts`, `src/core/geometry/roomRect.ts`, `src/core/geometry/offsetChain.ts`
- Modify: `src/core/commands/reconcile.ts` (placards), `src/core/commands/walls.ts` (`deleteWalls` supprime les placards ; `splitWall` répartit les placards comme les ouvertures ; `addRectRoomInterior`), `src/core/commands/objects.ts` (`updateObject` accepte `pose`)
- Test: `tests/core/commands-slopes.test.ts`, `commands-beams.test.ts`, `commands-cupboards.test.ts`, `commands-roomsize.test.ts`, `offsetChain.test.ts`

**Interfaces:**

```ts
// slopes.ts
export function addSlope(levelId: Id, s: Slope): Recipe;
export function updateSlope(levelId: Id, id: Id, patch: Partial<Omit<Slope, 'id'>>): Recipe; // validated
export function moveSlopes(levelId: Id, ids: Id[], delta: Vec2): Recipe;
export function deleteSlopes(levelId: Id, ids: Id[]): Recipe;
// beams.ts: addBeam, updateBeam, moveBeams, deleteBeams (same shapes)
// cupboards.ts
export function addCupboard(levelId: Id, c: Cupboard): Recipe;          // must fit; ERR 'Pas assez de place sur ce mur'
export function moveCupboard(levelId: Id, id: Id, wallId: Id, offset: number, side?: 'left' | 'right'): Recipe;
export function updateCupboard(levelId: Id, id: Id, patch: Partial<Omit<Cupboard, 'id' | 'wallId'>>): Recipe;
export function deleteCupboards(levelId: Id, ids: Id[]): Recipe;
// reconcile.ts
export function reconcileCupboards(level: Draft<Level>): void; // clamp offset into the wall, refuse 'Le mur est trop court pour ses placards'
// roomRect.ts
export interface RectRoom { room: Room; faces: Array<{ wallId: Id; side: 'left' | 'right'; a: Vec2; b: Vec2 }>; width: number; depth: number; axisU: Vec2; axisV: Vec2 }
export function rectangularRoom(level: Level, d: DerivedLevel, roomKey: string): RectRoom | null; // 4 edges at right angles (1 deg tolerance), each edge on one wall face
// roomSize.ts
export function setRoomInteriorSize(levelId: Id, roomKey: string, axis: 'width' | 'depth', value: number, moveSide: 'min' | 'max'): Recipe;
// moves the wall of the chosen face along its normal by (value - current); neighbours follow via shared nodes; value finite > 0 and >= 10 else 'Dimension invalide'
// offsetChain.ts
export function offsetChain(points: Vec2[], offset: number, closed: boolean): Vec2[]; // polyline offset, positive = left of travel, mitered corners
// walls.ts
export function addRectRoomInterior(levelId: Id, a: Vec2, b: Vec2, thickness: number, height: number): Recipe; // a, b = interior corners; walls outside
```

- [ ] **Step 1: Tests** : chaque commande : cas nominal, refus (message exact), aller-retour `applyPatches(inverse)` (helpers `run`/`refuse` de `tests/core/helpers.ts`). Cas obligatoires :
  - **`cupboard follows, clamps or refuses with its wall`** (Review Focus 3) : déplacer un nœud du mur garde l'`offset` ; raccourcir le mur recale ; mur plus court que le placard -> refus.
  - **`deleteWalls removes cupboards`** ; `splitWall` place le placard sur le bon morceau.
  - `addRectRoomInterior((0,0),(400,300), 20, 250)` -> `computeRooms` donne une pièce d'aire 400 x 300 = 120000 (12,00 m²).
  - `setRoomInteriorSize(..., 'width', 420, 'max')` sur cette pièce -> aire 420 x 300 ; avec une pièce voisine partageant le mur déplacé, la voisine perd 20 cm.
  - `offsetChain([(0,0),(400,0),(400,300)], 10, false)` -> `[(0,10)... ]` vérifier les coins en onglet ; chaîne fermée.
  - `updateObject(..., { pose: 'covering' })` accepté ; pose inconnue refusée.
- [ ] **Step 2:** RED, implémentation, verts ; commit `feat(core): add slope, beam, cupboard and room size commands`.

---

### Task 4: Moteur de vérifications

**Files:**
- Create: `src/core/checks/types.ts`, `computeChecks.ts`, `rules/height.ts`, `rules/collisions.ts`, `rules/walls.ts`, `rules/doorSwing.ts`, `rules/cupboards.ts`, `rules/support.ts`, `names.ts`
- Test: `tests/core/checks.test.ts`, `tests/core/checks-perf.test.ts`

**Interfaces:**

```ts
export type CheckKind = 'height' | 'collision' | 'wallOverlap' | 'doorSwing' | 'cupboardOpening' | 'floating' | 'cupboardClearance';
export interface CheckTarget { kind: 'object' | 'cupboard' | 'opening'; id: Id }
export interface Check { id: string; severity: 'error' | 'warning'; kind: CheckKind; message: string; targets: CheckTarget[] }
export function computeChecks(level: Level, d: DerivedLevel, customObjects: Record<Id, CustomObjectDef>): Check[]; // memoized per (level, customObjects)
export function checkSeverityByTarget(checks: Check[]): Map<string, 'error' | 'warning'>; // key `${kind}:${id}`, worst severity
```

Règles et messages : exactement la table de la spec 5.4 (formats : hauteurs avec `formatLength` -> "2,00 m"). Noms : `displayNames(level)` ajoute " (1)", " (2)" aux noms en double. Collisions : prétri par boîtes englobantes (balayage sur x) ; emprises via `objectFootprint(o, objectShape(o, customObjects))` et `cupboardFootprint` ; recouvrement surfacique par `boolean.ts` (intersection) seulement si les boîtes se chevauchent. Exceptions : `covering` vs non-`covering` ignoré ; `tuckable` sous un objet catalogue `acceptsUnder` ; `onTop` vs son support (objet dont le dessus est à `elevation` de l'objet à 1 cm près et qui contient son centre). Arc de porte : secteur polygonal (16 segments) du vantail côté `swing` ; portes battantes simples et doubles ; portes battantes de placard (secteur devant chaque porte).

- [ ] **Step 1: Tests** - un cas positif et un négatif par règle, dont : armoire 200 sous pente (erreur, message "Armoire : monte à 2,00 m, plafond à 1,54 m à cet endroit.") ; lit et bureau qui se chevauchent (erreur) ; tapis sous lit (rien) ; deux tapis superposés (erreur) ; TV `onTop` sur meuble TV (rien) ; TV `onTop` en l'air (avertissement "TV : n'est posée sur rien.") ; chaise sous bureau (rien) ; chaise sous lit (erreur) ; TV murale à 110 au-dessus d'un meuble bas de 50 (rien) ; commode dans un mur (erreur) ; fauteuil dans l'arc d'une porte (erreur) ; placard devant une porte (erreur) et une fenêtre (avertissement) ; dégagement 40 cm (avertissement), 20 cm (erreur), 80 cm (rien) ; noms en double "Bureau (1)" / "Bureau (2)".
- [ ] **Step 2: `checks performance budget`** (Review Focus 5) : niveau de 6 pièces et 300 objets aléatoires (graine fixe) : `computeChecks` < 50 ms (mesure `performance.now()`, moyenne de 5 appels après un appel de chauffe, le cache étant contourné par un nouvel objet `Level` à chaque appel).
- [ ] **Step 3:** implémentation, verts ; commit `feat(core): add non-blocking checks engine`.

---

### Task 5: Catalogue V2 et symboles

**Files:**
- Modify: `src/catalog/catalog.ts`, `src/catalog/symbols.tsx`
- Test: `tests/core/catalog.test.tsx` (ajouts)

Entrées ajoutées (id, nom, l x p x h, pose, catégorie, élévation par défaut via un nouveau champ facultatif `elevation?: number` de `CatalogEntry`) :
- `tv` TV 100 x 20 x 60 `onTop` (Séjour) ; `tv-wall` TV murale 110 x 8 x 65 `wall`, élévation 110 (Séjour) ; `shelf-wall` Étagère murale 80 x 25 x 3 `wall`, élévation 150 (Séjour) ; `rug-round` Tapis rond 120 x 120 x 1 `covering` ; `rug-rect` Tapis 170 x 120 x 1 `covering` (Séjour) ; `plant` Plante 40 x 40 x 90 `floor` (Séjour) ; `bedside-lamp` Lampe de chevet 25 x 25 x 45 `onTop` (Chambre) ; `microwave` Micro-ondes 50 x 40 x 30 `onTop` (Cuisine) ; `pouf` Pouf 50 x 50 x 40 `tuckable` (Séjour).
Symboles 2D paramétriques (mêmes conventions que la V1 : centrés, dos en -y, traits `lineUnit`) : TV (écran fin + pied), TV murale (trait épais + tirets), étagère (rectangle fin), tapis (rectangle à franges / cercles concentriques), plante (feuilles), lampe (cercle + croix), micro-ondes (cadre + hublot), pouf (cercle à couture).

- [ ] **Step 1: Tests** : chaque nouvelle entrée a un symbole sans `NaN` (tailles par défaut, minuscule 5 x 5, allongée 300 x 20) ; les poses du catalogue (y compris anciennes entrées) sont celles listées ; `chair` `tuckable`, `desk` `acceptsUnder`.
- [ ] **Step 2:** implémentation ; vérification visuelle (planche des nouveaux symboles en PNG) ; commit `feat(catalog): add V2 catalog entries with poses and symbols`.

---

### Task 6: Rendu 2D des volumes et des alertes, sélection

**Files:**
- Create: `src/render/layers/SlopesLayer.tsx`, `BeamsLayer.tsx`, `CupboardsLayer.tsx`, `AlertsLayer.tsx`
- Modify: `src/render/PlanSvg.tsx` (couches et prop `alerts`), `src/core/geometry/hit.ts` (`HitKind` + `'slope' | 'beam' | 'cupboard'`), `src/editor/selection.ts`, `src/render/layers/SelectionLayer.tsx`, `src/export/pageLayout.ts` (`levelBounds` inclut placards et poutres)
- Test: `tests/editor/render-v2.test.tsx`, `tests/core/hit-v2.test.ts`

Ordre des couches : pièces, **pentes**, objets + **placards**, murs et ouvertures, **poutres**, cotes, étiquettes de pièces (R21), **alertes**, sélection, overlay. Pentes : dégradé `#2438a0` de 0 à 0,18 d'opacité dans la bande, isolignes en tirets avec étiquette "2,00 m" à mi-ligne, lignes de départ et d'arrivée pleines. Poutres : contour pointillé + étiquette "2,25 m" (dessous minimal le long de la poutre, `formatLength`). Placards : rectangle rempli de la couleur à 35 %, traits de portes, arcs (battantes) ou double trait décalé (coulissantes), poignées ; zone de dégagement 60 cm orange `#f3b26b` à 22 % si sélectionné. Alertes : contour 2,2 `lineUnit` rouge `#cf2e2e` ou orange `#e08a1e` autour des emprises en alerte ; jamais en mode `print`. `hitTest` : placard (emprise) avant objet ; poutre (emprise, priorité sous les objets) ; pente (bande, priorité la plus basse avant pièce).

- [ ] **Step 1: Tests** : balisage avec une pente, une poutre, un placard et une alerte contient `data-kind="slope"`, `"beam"`, `"cupboard"`, `"alert"` et les libellés "2,00 m" ; `mode: 'print'` -> pas de `data-kind="alert"` ; `hitTest` renvoie `cupboard`, `beam`, `slope` aux bons points ; `levelBounds` englobe un placard hors des murs.
- [ ] **Step 2:** implémentation ; vérification visuelle (capture du plan de la chambre sous les toits) ; commit `feat(render): draw slopes, beams, cupboards and alerts on the plan`.

---

### Task 7: Outils Pente, Poutre, Placard et pose à la dépose

**Files:**
- Create: `src/editor/tools/slopeTool.ts`, `beamTool.ts`, `cupboardTool.ts` (+ machines pures `slopeMachine.ts` si utile), `src/render/VolumeGhostView.tsx`
- Modify: `src/editor/store.ts` (`ToolId` + `'slope' | 'beam' | 'cupboard'`), `src/editor/tools/registry.ts`, `src/editor/keyboard.ts` (T, B, K), `src/editor/tools/selectTool.ts` (sélection, déplacement et poignées des pentes/poutres/placards ; pose `onTop`/`wall` à la fin d'un glisser d'objet), `src/ui/CatalogPanel.tsx` (pose à la dépose), `src/ui/Toolbar.tsx`, `src/render/OverlayLayer.tsx` (une ligne)
- Test: `tests/editor/slopeTool.test.ts`, `beamTool.test.ts`, `cupboardTool.test.ts`, `selectTool-v2.test.ts`, `tests/e2e/volumes.spec.ts`

Comportements : spec 7.1. Pente : 3 clics (départ a, départ b, puis point qui fixe `side` et `depth` = distance à la ligne de départ), puis `openNumericInput` hauteur de départ (préremplie avec la hauteur du niveau), Tab, hauteur d'arrivée (150), Entrée -> une seule commande `addSlope`. Poutre : 2 clics avec `snapPoint` (nœuds, axes) -> `addBeam`. Placard : survol d'un mur (même logique que `openingTool` : `hoveredWall` de `tools/hover.ts`, côté = côté du curseur), recalage dans le mur, aperçu rouge si pas de place, clic -> `addCupboard`. Sélection : poignées des pentes (extrémités de la ligne de départ, milieu de la ligne d'arrivée pour la profondeur), déplacement d'ensemble ; poutres (extrémités, déplacement) ; placard glissé le long du mur (projection sur le mur survolé le plus proche, comme une ouverture). À la fin d'un glisser ou à la dépose depuis le catalogue : objet `onTop` -> `elevation = supportElevation(...)` ; objet `wall` -> `snapToWallForPose` si non nul. Une entrée d'historique par geste.

- [ ] **Step 1: Tests unitaires** : séquence de clics de la pente -> `addSlope` avec `side`, `depth`, hauteurs saisies ; poutre 2 clics ; placard recalé à `offset` = 60 sur un mur de 300 survolé à 20 cm du début ; aperçu invalide sur un mur de 80 ; TV déposée sur un meuble TV -> `elevation` 50 ; TV murale déposée près d'un mur -> plaquée.
- [ ] **Step 2: e2e `volumes.spec.ts`** : tracer une pièce, une pente au clavier (240 puis 150), une poutre, un placard ; vérifier `data-kind` présents ; déplacer le placard le long du mur ; annuler/rétablir.
- [ ] **Step 3:** implémentation ; vérification visuelle ; commit `feat(editor): add slope, beam and cupboard tools and pose-aware placement`.

---

### Task 8: Panneaux de propriétés, panneau Vérifications, bascule de vue

**Files:**
- Create: `src/ui/SlopeProperties.tsx`, `BeamProperties.tsx`, `CupboardProperties.tsx`, `RoomSizeFields.tsx`, `ChecksPanel.tsx`, `ViewSwitch.tsx`
- Modify: `src/ui/PropertiesPanel.tsx`, `src/ui/ObjectProperties.tsx` (menu Pose), `src/ui/Header.tsx` (compteur d'alertes, `ViewSwitch`), `src/ui/EditorScreen.tsx` / `PlanArea.tsx` (disposition Plan / 3D / Plan + 3D, séparation redimensionnable par glisser, emplacement 3D affichant "Vue 3D en préparation." remplacé à la tâche 11), `src/editor/store.ts` (`display.view: 'plan' | '3d' | 'split'`, `display.hideAlerts: boolean`)
- Test: `tests/e2e/panels-v2.spec.ts`, `tests/editor/store-v2.test.ts`

Contenu : spec 7.2 et 7.4. Pente : hauteur départ, hauteur arrivée, profondeur, bouton "Inverser le sens" (`side`). Poutre : largeur, retombée, mode ("Sous le plafond" / "Hauteur fixe"), hauteur du dessous (si fixe), longueur (lecture). Placard : largeur, profondeur, socle, mode ("Hauteur fixe" / "Jusqu'au plafond"), hauteur ou jeu, nombre de portes, type ("Battantes" / "Coulissantes"), couleur, hauteur résultante "de 1,48 m à 2,38 m". Objet : menu "Pose" (Au sol, Revêtement, Posé sur un meuble, Rangé dessous, Mural). Pièce rectangulaire : "Largeur intérieure", "Profondeur intérieure" + sélecteur "Côté qui bouge" ; message "La pièce voisine sera modifiée." si le mur est partagé. Vérifications : compteur "N alertes" dans l'en-tête (masqué si 0), panneau repliable, ligne cliquable (sélectionne les cibles et centre la vue sur leur boîte), case "Masquer les alertes". Le compteur et le panneau utilisent `computeChecks` du niveau actif.

- [ ] **Step 1: Tests** : store (`display.view`, `hideAlerts`) ; e2e : changer la hauteur d'arrivée d'une pente dans le panneau ; passer un objet en "Revêtement" fait disparaître une alerte de collision ; cliquer une ligne du panneau sélectionne l'objet ; "Masquer les alertes" retire les contours ; largeur intérieure 420 tapée -> surface "12,60 m²" pour une pièce 420 x 300 ; bascule Plan / 3D / Plan + 3D change la disposition.
- [ ] **Step 2:** implémentation ; vérification visuelle (captures des panneaux) ; commit `feat(ui): add volume properties, checks panel and view switch`.

---

### Task 9: Tracé intérieur des pièces, ligne de référence des murs, édition des cotes

**Files:**
- Modify: `src/editor/tools/rectRoomTool.ts` / `rectRoomMachine.ts` (intérieur), `src/editor/tools/wallTool.ts` / `wallMachine.ts` (ligne de référence, Espace), `src/editor/store.ts` (`wallReference: 'axis' | 'left' | 'right'`), `src/ui/` (barre d'option de l'outil Mur, éditeur de cote sur double-clic), `src/editor/tools/selectTool.ts` (double-clic sur une cote intérieure de pièce rectangulaire)
- Test: `tests/editor/rectRoomTool-v2.test.ts`, `wallTool-v2.test.ts`, `tests/e2e/room-dimensions.spec.ts`

Comportements : spec 6. Pièce rectangulaire : la commande devient `addRectRoomInterior` ; l'aperçu et les cotes dynamiques montrent l'intérieur. Mur : la barre d'option affiche "Axe / Face gauche / Face droite" ; Espace inverse gauche et droite (sans effet en axe : passe en gauche) ; à la validation, la chaîne cliquée est décalée par `offsetChain(points, ±thickness/2, closed)` avant `addWallChain` ; l'aperçu montre le mur décalé et la ligne de référence en tirets. Double-clic sur une cote automatique de type `room` d'une pièce rectangulaire : champ numérique (`openNumericInput`, valeur actuelle préremplie) -> `setRoomInteriorSize` (côté qui bouge : `max`) ; ailleurs, comportement V1 inchangé (renommer la pièce).

- [ ] **Step 1: Tests** : outil pièce 400 x 300 tapé -> aire 120000 ; outil mur en `left` sur un carré fermé de 400 tracé dans le sens horaire -> pièce intérieure 400 x 400 (murs à l'extérieur) ; Espace bascule ; e2e : "12,00 m²" affiché après une pièce 400 x 300 au clavier ; double-clic sur la cote "4,00 m", taper 450 -> "13,50 m²".
- [ ] **Step 2:** implémentation ; commit `feat(editor): interior room drawing, wall reference line and editable room dimensions`.

---

### Task 10: Maillages (noyau, sans Three.js)

**Files:**
- Create: `src/core/mesh/types.ts`, `walls.ts`, `floors.ts`, `ceilings.ts`, `beams.ts`, `cupboards.ts`, `triangulate.ts`
- Test: `tests/core/mesh.test.ts`

**Interfaces:**

```ts
export interface MeshData { positions: number[]; normals: number[]; uvs: number[]; indices: number[] } // x, y (up), z ; units: METERS (three.js convention): plan x/100 -> x, plan y/100 -> z, height/100 -> y
export interface LevelMeshes { walls: MeshData; floors: Array<{ roomKey: string; mesh: MeshData }>; ceilings: Array<{ roomKey: string; mesh: MeshData }>; beams: Array<{ id: Id; mesh: MeshData }>; cupboards: Array<{ id: Id; parts: { body: MeshData; doors: MeshData[]; handles: MeshData } }> }
export function buildLevelMeshes(level: Level, d: DerivedLevel): LevelMeshes; // memoized per level identity, excluding objects
export function triangulate(outer: Ring, holes: Ring[]): number[]; // ear clipping with holes, indices into concatenated vertices
```

Murs : polygones de `shapeWithOpenings` (portes et passages évidés pleine hauteur ; fenêtres : forme avec ouvertures évidées puis ajout de blocs allège `[0, sill]` et linteau `[sill + height, top]`), chaque polygone découpé par les lignes de départ et d'arrivée des pentes (boolean), extrudé : faces latérales par arête (sommet bas à 0, sommet haut à `min(wall.height, ceilingWithoutBeams(p))`), face supérieure triangulée avec hauteurs par sommet. Sols : `room.ring` moins `room.islands`, UV = coordonnées en mètres. Plafonds : même polygone découpé aux lignes de pente, sommets à `ceilingWithoutBeams`, normale vers le bas. Poutres : boîte orientée (mode `ceiling` : dessus et dessous suivent le plafond, inclinés sous la pente). Placards : socle, caisson extrudé sous le profil, une façade par porte avec 1 cm de joint, poignées en petits pavés.

- [ ] **Step 1: Tests** : pièce 400 x 300 intérieure, murs 20 : hauteur max des murs = 2,50 m ; sous une pente (plan-chambre), aucun sommet de mur au-dessus de `ceilingWithoutBeams` + 1e-6 ; sol d'aire 12 m² (somme des aires des triangles) ; plafond incliné : sommets à x = 4,00 m à 1,50 m ; aucun `NaN` ; indices dans les bornes ; triangles du sol orientés vers +y ; `triangulate` d'un carré avec trou -> aire correcte ; fenêtre : présence d'une allège de 0,90 m.
- [ ] **Step 2:** implémentation ; commit `feat(core): generate level meshes for the 3D view`.

---

### Task 11: Scène 3D de base

**Files:**
- Create: `src/scene3d/index.ts` (API `createScene3D(container, callbacks): Scene3D`), `renderer.ts`, `materials.ts`, `textures.ts` (parquet, tapis), `levelMeshes.ts` (conversion `MeshData` -> `BufferGeometry`), `openings.ts` (portes à 70°, fenêtres), `camera.ts` (OrbitControls, vues prédéfinies animées), `src/ui/Plan3DView.tsx`
- Modify: `package.json` (`three`, `@types/three`), `src/ui/PlanArea.tsx` / `EditorScreen.tsx` (remplace l'emplacement 3D vide), `src/ui/ErrorBoundary.tsx` (réutilisé)
- Test: `tests/e2e/scene3d.spec.ts`, `tests/editor/scene3d-api.test.ts` (API pure si possible)

**Interfaces:**

```ts
export interface Scene3D {
  update(input: { project: Project; level: Level; lowerLevels: Level[]; selection: SelectionItem[]; alerts: Map<string, 'error' | 'warning'>; showLabels: boolean; hideAllWalls: boolean }): void;
  setPreset(p: 'overview' | 'top' | 'room'): void;
  resize(): void;
  dispose(): void;
}
export function createScene3D(container: HTMLElement, cb: { onSelect(item: SelectionItem | null): void }): Scene3D; // throws Error('webgl') if WebGL is unavailable
```

Rendu : spec 8.2 et constantes de `plan-chambre` (lignes 1060-1240 de son `index.html` : lumières, matériaux, texture de parquet lignes 1089-1107, tapis). Rendu à la demande (`requestAnimationFrame` seulement si contrôles en mouvement ou `update` reçu). `Plan3DView` : import dynamique de `src/scene3d`, `ResizeObserver`, message "La 3D n'est pas disponible sur ce navigateur." si `createScene3D` lève, barrière d'erreur, cases "Noms des objets", "Cacher tous les murs", "Afficher les niveaux inférieurs", boutons des vues prédéfinies.

- [ ] **Step 1: e2e `scene3d.spec.ts`** : ouvrir la 3D sur la chambre sous les toits (projet construit via `window.__planMaison`) -> canvas présent, aucune erreur console ; vues prédéfinies cliquables ; **`3d view on empty and open-wall levels`** (Review Focus 4) : niveau vide et niveau avec deux murs ouverts -> pas d'erreur ; bascule Plan + 3D puis Plan -> le canvas est retiré et les ressources libérées (pas d'erreur).
- [ ] **Step 2:** implémentation ; vérification visuelle : captures 3D (vue d'ensemble, dessus) comparées à `/tmp/plan-chambre-shots/03-3d-overview.png` et `04-3d-top.png` (régénérer si absentes en servant `plan-chambre`) ; commit `feat(3d): add the 3D view with walls, floors, ceilings, openings and camera`.

---

### Task 12: Meubles 3D, placards, poutres, étiquettes, alertes

**Files:**
- Create: `src/scene3d/furniture/index.ts` (registre par `catalogId`), un fichier par famille (`beds.ts`, `seating.ts`, `tables.ts`, `storage.ts`, `kitchen.ts`, `bathroom.ts`, `decor.ts`, `structure.ts`, `generic.ts`), `src/scene3d/labels.ts`, `src/scene3d/alerts.ts`
- Modify: `src/scene3d/index.ts`
- Test: `tests/e2e/scene3d-furniture.spec.ts`, `tests/editor/furniture3d.test.ts` (chaque constructeur produit un `Object3D` dans la boîte `width x depth x height` à 1 cm près, exécuté avec `three` dans Vitest - Three.js s'exécute sous Node sans WebGL pour la construction de géométries)

Constructeurs repris de `plan-chambre` (`BUILD`, lignes 1240-1441 de son `index.html`) pour lit, table de nuit, bureau, chaise, armoire, commode, vitrine, bibliothèque, meuble TV, TV, TV murale, étagère murale, pouf, fauteuil, canapés, plante, lampadaire/lampe, tapis (texture), tables ; versions simples arrondies pour cuisine, salle de bain et escaliers ; génériques : rectangle/cercle/L extrudés arrondis à la couleur de l'objet. Objet positionné à `(x, elevation, y)` en mètres, `rotation` (sens horaire en plan = rotation négative autour de y), miroir. Placards et poutres depuis `LevelMeshes`. Étiquettes `CSS2DRenderer` (pastille spec 8.2). Alertes : couleur mélangée 50 % avec `#cf2e2e` / `#e08a1e` sur les matériaux des objets ciblés (matériaux clonés par objet en alerte), retirée si `hideAlerts`.

- [ ] **Step 1: Tests** : boîte englobante de chaque constructeur ; e2e : un lit en alerte apparaît rouge (lecture d'un pixel au centre du lit dans le canvas par `readPixels` via un hook de test exposé en DEV) ; étiquettes visibles puis masquées.
- [ ] **Step 2:** implémentation ; vérification visuelle (captures comparées à `plan-chambre`) ; commit `feat(3d): add furniture, cupboards, beams, labels and alert tint`.

---

### Task 13: Masquage des murs, niveaux inférieurs, sélection, mises à jour ciblées

**Files:**
- Create: `src/scene3d/cutaway.ts`, `src/scene3d/picking.ts`, `src/scene3d/sync.ts`
- Modify: `src/scene3d/index.ts`, `src/scene3d/camera.ts`
- Test: `tests/editor/cutaway.test.ts` (fonction pure `hiddenWalls(walls2D, camera, target)`), `tests/e2e/scene3d-interaction.spec.ts`

Masquage : un mur (par `wallId`, maillage par mur) est masqué si le segment caméra -> cible (projeté en plan) coupe son contour ; plafonds/rampants masqués si la caméra est au-dessus de leur hauteur ; "Cacher tous les murs". Niveaux inférieurs : empilés à leur altitude, murs et sols seulement, opacité 0,6. Sélection : `Raycaster` sur meubles, placards, poutres ; `onSelect` -> `store.setSelection` ; l'objet sélectionné reçoit un contour (`EdgesGeometry` bleu `#2438a0`). Mises à jour : clés d'identité (nœuds/murs/ouvertures/pentes/poutres -> structure ; chaque objet -> son mesh ; chaque placard -> son mesh) ; `dispose` des géométries et matériaux remplacés. Vue "Depuis la pièce sélectionnée" : caméra au centre de la pièce de l'objet sélectionné (ou de la pièce sélectionnée), 1,60 m, regard vers le centre, sinon vue d'ensemble.

- [ ] **Step 1: Tests** : `hiddenWalls` sur une pièce rectangulaire avec caméra au sud -> mur sud masqué seulement ; e2e : clic sur le lit dans la 3D -> panneau "Lit" ouvert ; déplacer le lit en 2D -> la 3D suit sans reconstruire les murs (compteur de reconstructions exposé en DEV inchangé pour la structure) ; afficher les niveaux inférieurs.
- [ ] **Step 2:** implémentation ; commit `feat(3d): wall cut-away, lower levels, picking and incremental updates`.

---

### Task 14: Déploiement, parcours complet, vérification visuelle, README

**Files:**
- Create: `.github/workflows/deploy.yml`, `tests/e2e/attic-journey.spec.ts`
- Modify: `vite.config.ts` (`base: process.env.BASE_PATH ?? '/'`), `README.md`

- [ ] **Step 1:** `vite.config.ts` lit `BASE_PATH` ; `npm run build` avec `BASE_PATH=/plan-maison/` produit des chemins préfixés (test : lire `dist/index.html`) ; workflow GitHub Pages officiel (`actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`) déclenché sur `push` vers `main` avec `BASE_PATH: /plan-maison/`. Ne rien pousser.
- [ ] **Step 2: e2e `attic-journey.spec.ts`** (critère de réussite de la spec V2, en pilotant l'interface comme un utilisateur) : pièce 400 x 400 intérieure ; pente de x = 197 à 400, 240 -> 150 ; poutre fixe à 225 vers x = 185 ; placard jusqu'au plafond contre le mur bas ; lit, bureau, armoire 100 x 60 x 200 sous la pente, tapis sous le lit, meuble TV + TV posée dessus ; vérifier le panneau : alertes "Armoire : monte à 2,00 m...", "Lit et Bureau se chevauchent." (en plaçant le bureau sur le lit) et aucune alerte pour le tapis ni la TV ; ouvrir la 3D sans erreur ; recharger ; exporter le PDF.
- [ ] **Step 3: Vérification visuelle globale** : captures du plan (pente, poutre, placards, alertes), du panneau Vérifications, de la 3D (vue d'ensemble, dessus, depuis la pièce) ; les comparer aux captures de `plan-chambre` ; corriger les défauts visibles.
- [ ] **Step 4:** README : nouvelles fonctions, raccourcis T / B / K / Espace, section "Publier sur GitHub Pages" (dépôt public, activation de Pages, données par navigateur et par adresse, passage par l'export `.json`).
- [ ] **Step 5:** gates complets (`npm test`, `npm run typecheck`, `npm run build`, `npx playwright test --repeat-each=3`) ; commit `feat: V2 deployment config, attic journey and docs`.
