# Plan Maison V1 - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire une application web locale de plan 2D de logement (murs, pièces, ouvertures, meubles, cotes, niveaux, décalque, export) prête à recevoir une vue 3D en V2.

**Architecture:** Un noyau TypeScript pur (`src/core`) porte le modèle, la géométrie, les commandes avec historique et la persistance ; il est testé unitairement. L'éditeur (`src/editor`, Zustand) orchestre outils et état d'interface ; le rendu (`src/render`) est un SVG React en centimètres, réutilisé tel quel pour l'export PDF/PNG.

**Tech Stack:** TypeScript, Vite, React, Zustand, Immer, polygon-clipping, polylabel, idb, zod, jspdf, svg2pdf.js, Vitest, fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md` (lire la spec ET la tâche avant de coder).

## Global Constraints

- Projet : `/Users/cyril/Documents/Autre/plan-maison`, branche `main`, un commit par tâche minimum.
- Application statique ; lancement `npm run dev` ; aucun serveur applicatif.
- Unité interne : centimètre (nombres flottants). Affichage des longueurs : mètres, 2 décimales, virgule décimale (`3,50 m`). Surfaces : `12,40 m²`. Saisies clavier : centimètres.
- Repère : X vers la droite, Y vers le bas. Rotation des objets en degrés, sens horaire à l'écran (convention SVG `rotate()`), formule `rotate(v, rad) = (x cos - y sin, x sin + y cos)`.
- Défauts projet : mur 20 cm, cloison 7 cm, hauteur sous plafond 250 cm, grille 10 cm.
- Défauts ouvertures : porte 83 x 204, fenêtre 120 x 135 allège 90, passage 90 x 204.
- `src/core/**` : aucun import de React, de `window`, `document`, `indexedDB`, `Blob`, `FileReader`.
- Code, identifiants, commentaires, messages de commit : ASCII uniquement, en anglais.
- Textes d'interface : français avec accents. Interdits partout (code et interface) : tiret long ou moyen, guillemets typographiques, caractère ellipse, flèches unicode, puces unicode, signe multiplication, espaces insécables. `²` est autorisé.
- Pas de `Co-Authored-By` dans les commits.
- Dépendances autorisées : celles du Tech Stack + `@types/*` nécessaires + `@vitejs/plugin-react` + `typescript`. Rien d'autre sans justification écrite dans le rapport de tâche.
- Tests : `npm test` (Vitest, mode run), `npm run typecheck`, `npm run e2e` (Playwright). Tous verts à la fin de chaque tâche.

## Review Focus

1. **Raccourcis clavier pendant une saisie** : taper "Mezzanine" dans le champ de nom de pièce ne doit ni changer d'outil (M), ni supprimer la sélection (Suppr/Retour arrière), ni annuler (Cmd+Z natif du champ doit rester celui du champ). Test : Task 14, Step "keyboard guard".
2. **Annuler/rétablir qui fait disparaître des éléments sélectionnés ou le niveau actif** : la sélection doit être purgée des éléments inexistants et `activeLevelId` doit toujours désigner un niveau existant. Test : Task 11, `prunes selection and active level after undo`.
3. **Deux murs qui se croisent sans nœud commun** : le rendu reste propre et les pièces sont bien détectées des deux côtés. Test : Task 4, `crossing walls without shared node split rooms`.
4. **Accents et caractères spéciaux** dans les noms de projet, de niveau et de pièce : rendus correctement dans le PDF (é, è, à, ç, ², apostrophe), et nom de fichier d'export assaini. Test : Task 18, `sanitizeFileName` et e2e PDF avec un projet nommé "Maison d'été".
5. **Valeurs numériques absurdes dans le panneau de propriétés** (vide, 0, négatif, texte, très grand) : refusées sans corrompre le modèle ni produire de NaN. Test : Task 7 (`rejects non-positive dimensions`), Task 6 (`setWallLength rejects non-finite`), Task 13 (`parseCmInput`).

---

## Structure des fichiers

```
plan-maison/
  CLAUDE.md                         conventions du projet pour les agents
  index.html
  package.json  tsconfig.json  vite.config.ts  playwright.config.ts
  src/
    main.tsx  App.tsx  styles.css
    core/
      model/types.ts                tous les types du modèle
      model/defaults.ts             constantes par défaut
      model/ids.ts                  newId()
      model/factory.ts              createProject, createLevel, createOpening, createObject...
      model/clone.ts                cloneLevelWithNewIds, cloneProjectWithNewIds
      model/format.ts               formatLength, formatArea, parseCmInput
      geometry/vec.ts               opérations vectorielles
      geometry/polygon.ts           aire, point dans polygone, bbox, segments
      geometry/boolean.ts           adaptateur polygon-clipping -> Shape
      geometry/walls.ts             wallFrame, computeWallOutlines, computeWallShape
      geometry/openings.ts          openingFrame, openingPolygon, opening fit
      geometry/rooms.ts             computeRooms
      geometry/objects.ts           objectCorners, objectFootprint
      geometry/anchors.ts           resolveAnchor
      geometry/snap.ts              snapPoint, snapObjectToWalls
      geometry/hit.ts               hitTest, hitTestRect
      geometry/clearances.ts        objectClearances, openingClearances
      geometry/autoDimensions.ts    computeAutoDimensions
      geometry/derived.ts           deriveLevel (cache de tout le calculé)
      commands/apply.ts             applyCommand, CommandError, getLevel
      commands/history.ts           History, pushEntry, undo, redo
      commands/validate.ts          validateProject
      commands/walls.ts             commandes de murs
      commands/openings.ts          commandes d'ouvertures
      commands/objects.ts           commandes d'objets
      commands/dimensions.ts        commandes de cotes
      commands/rooms.ts             renameRoom
      commands/levels.ts            commandes de niveaux
      commands/project.ts           projet, réglages, mes objets, image de fond
      persistence/schema.ts         schéma zod du format
      persistence/migrate.ts        migrations
      persistence/exchange.ts       serializeExport, parseImport
    storage/
      db.ts                         IndexedDB (projets, images)
      files.ts                      Blob <-> base64, téléchargement, lecture fichier
      autosave.ts                   sauvegarde automatique
    catalog/
      catalog.ts                    entrées du catalogue
      symbols.tsx                   symboles SVG paramétriques
    editor/
      store.ts                      store Zustand
      view.ts                       maths de vue (zoom, pan, fit)
      selection.ts                  types et helpers de sélection
      tools/types.ts                interface Tool
      tools/selectTool.ts
      tools/wallTool.ts
      tools/rectRoomTool.ts
      tools/openingTool.ts
      tools/dimensionTool.ts
      tools/calibrateTool.ts
      keyboard.ts                   raccourcis globaux + garde de saisie
    render/
      PlanSvg.tsx                   racine SVG, couches
      layers/*.tsx                  une couche par fichier
      OverlayLayer.tsx              aperçus, guides, cotes dynamiques, poignées
    ui/
      HomeScreen.tsx  EditorScreen.tsx  Toolbar.tsx  PropertiesPanel.tsx
      LevelTabs.tsx  CatalogPanel.tsx  SettingsDialog.tsx  ExportDialog.tsx
      BackgroundPanel.tsx  Banner.tsx  Toast.tsx  NumericInput.tsx
    export/
      png.ts  pdf.ts  pageLayout.ts  fileName.ts
  tests/
    core/*.test.ts   storage/*.test.ts   editor/*.test.ts   export/*.test.ts
    e2e/*.spec.ts
```

---

### Task 1: Échafaudage du projet

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `.gitignore`, `CLAUDE.md`, `README.md`, `tests/core/smoke.test.ts`, `tests/e2e/smoke.spec.ts`, `src/types/polylabel.d.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `test`, `typecheck`, `e2e` ; alias d'import `@/` -> `src/`.

- [ ] **Step 1: Créer le projet Vite React TS** dans un dossier temporaire puis copier dans `plan-maison` (le dossier contient déjà `docs/` et `.git`) :

```bash
cd /tmp && rm -rf pm-scaffold && npm create vite@latest pm-scaffold -- --template react-ts
cp -R /tmp/pm-scaffold/. /Users/cyril/Documents/Autre/plan-maison/
cd /Users/cyril/Documents/Autre/plan-maison
npm install
npm install zustand immer polygon-clipping polylabel idb zod jspdf svg2pdf.js
npm install -D vitest fake-indexeddb @playwright/test
npx playwright install chromium
```

Supprimer les fichiers de démo du template (`src/assets`, `public/vite.svg`, contenu de démo de `App.tsx`/`App.css`/`index.css`). Si le template inclut ESLint, le garder mais ne pas l'exiger dans les tâches.

- [ ] **Step 2: Configurer** :
  - `vite.config.ts` : plugin react, `resolve.alias = { '@': path.resolve(__dirname, 'src') }`, bloc `test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'], environment: 'node' }` (via `/// <reference types="vitest/config" />`).
  - `tsconfig` : `paths: { "@/*": ["src/*"] }`, `strict: true`, `noUncheckedIndexedAccess: true`, inclure `src` et `tests`.
  - scripts : `"test": "vitest run"`, `"typecheck": "tsc -b --noEmit"` (adapter à la structure tsconfig du template pour que la commande vérifie `src` et `tests`), `"e2e": "playwright test"`.
  - `playwright.config.ts` : `testDir: 'tests/e2e'`, `webServer: { command: 'npm run dev -- --port 5199 --strictPort', port: 5199, reuseExistingServer: true }`, `use: { baseURL: 'http://localhost:5199' }`, projet chromium uniquement.
  - `src/types/polylabel.d.ts` :

```ts
declare module 'polylabel' {
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean,
  ): number[] & { distance: number };
}
```

  - `index.html` : `<html lang="fr">`, titre `Plan Maison`.
  - `App.tsx` : affiche `<h1>Plan Maison</h1>` (remplacé en Task 13).

- [ ] **Step 3: Tests fumée**

`tests/core/smoke.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import polygonClipping from 'polygon-clipping';
import polylabel from 'polylabel';

describe('smoke', () => {
  it('loads geometry libraries', () => {
    const sq = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] as [number, number][][];
    expect(polygonClipping.union(sq).length).toBe(1);
    const p = polylabel(sq as unknown as number[][][], 0.5);
    expect(p[0]).toBeCloseTo(5, 0);
  });
});
```

`tests/e2e/smoke.spec.ts` :
```ts
import { test, expect } from '@playwright/test';
test('app boots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Plan Maison' })).toBeVisible();
});
```

- [ ] **Step 4: Vérifier** : `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e` -> tout vert.

- [ ] **Step 5: `CLAUDE.md` du projet** (lu par tous les agents suivants) :

```markdown
# Plan Maison - conventions

App web locale de plan 2D (V1) ; spec : docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md ;
plan : docs/superpowers/plans/2026-10-07-plan-maison-v1.md.

- `src/core` = TypeScript pur, aucune API navigateur ni React. Toute modification du projet passe
  par une commande de `src/core/commands` (jamais de mutation directe ailleurs).
- Unités : cm partout dans le modèle. Y vers le bas. Rotation en degrés, sens horaire à l'écran.
- Code/commentaires/commits : ASCII anglais. Interface : français avec accents, sans tiret long,
  guillemets typographiques, ellipse, flèches unicode, signe multiplication.
- Commandes : `npm test`, `npm run typecheck`, `npm run e2e`, `npm run dev`.
- Pas de Co-Authored-By dans les commits.
```

`README.md` : 10 lignes en français (installation, `npm run dev`, tests).

- [ ] **Step 6: Commit** : `git add -A && git commit -m "chore: scaffold vite react ts app with test tooling"`

---

### Task 2: Modèle, primitives géométriques et adaptateur booléen

**Files:**
- Create: `src/core/model/types.ts`, `defaults.ts`, `ids.ts`, `factory.ts`, `format.ts`, `src/core/geometry/vec.ts`, `polygon.ts`, `boolean.ts`
- Test: `tests/core/vec.test.ts`, `tests/core/polygon.test.ts`, `tests/core/boolean.test.ts`, `tests/core/format.test.ts`, `tests/core/factory.test.ts`

**Interfaces:**
- Produces (exact) : tout le contenu de `types.ts` ci-dessous ; `newId(): string` ; fabriques ; `vec` ; `polygon` ; `boolean` ; `format`.

- [ ] **Step 1: `types.ts`** (à recopier tel quel) :

```ts
export type Id = string;
export interface Vec2 { x: number; y: number }
export type Ring = Vec2[]; // implicitly closed, first point NOT repeated
export interface PolygonWithHoles { outer: Ring; holes: Ring[] }
export type Shape = PolygonWithHoles[];

export interface ProjectSettings {
  defaultWallThickness: number;
  partitionThickness: number;
  defaultCeilingHeight: number;
  gridStep: number;
}

export interface WallNode { id: Id; x: number; y: number }
export interface Wall { id: Id; startNodeId: Id; endNodeId: Id; thickness: number; height: number }

export type OpeningKind = 'door' | 'window' | 'passage';
export type DoorVariant = 'single' | 'double' | 'sliding' | 'pocket';
export type WindowVariant = 'single' | 'double' | 'sliding' | 'fixed';
export type OpeningVariant = DoorVariant | WindowVariant | 'none';
export interface Opening {
  id: Id; wallId: Id; kind: OpeningKind; variant: OpeningVariant;
  offset: number;      // distance from wall start node to opening center, along axis
  width: number; height: number; sillHeight: number;
  hinge: 'start' | 'end';  // hinge side along the wall axis
  swing: 'left' | 'right'; // side of the wall the leaf opens to (left = +perp(dir))
}

export type GenericShape = 'rect' | 'circle' | 'lshape';
export interface LShapeParams { notchWidth: number; notchDepth: number }
export type ObjectSource =
  | { kind: 'catalog'; catalogId: string }
  | { kind: 'custom'; customObjectId: Id };
export interface PlacedObject {
  id: Id; source: ObjectSource;
  x: number; y: number; rotation: number; // center, degrees
  width: number; depth: number; height: number; elevation: number;
  name: string; color: string; mirrored: boolean;
  lshape: LShapeParams | null; // only for lshape generic objects
}
export interface CustomObjectDef {
  id: Id; name: string; shape: GenericShape;
  width: number; depth: number; height: number; color: string;
  lshape: LShapeParams | null;
}

export type Anchor =
  | { kind: 'node'; nodeId: Id }
  | { kind: 'objectCorner'; objectId: Id; corner: 0 | 1 | 2 | 3 }
  | { kind: 'point'; x: number; y: number };
export interface ManualDimension { id: Id; a: Anchor; b: Anchor; offset: number }

export interface RoomLabel { id: Id; name: string; anchor: Vec2 } // array order = age (oldest first)

export interface Background {
  imageId: Id; widthPx: number; heightPx: number;
  scale: number;            // cm per image pixel
  x: number; y: number;     // world position of image top-left corner
  rotation: number;         // degrees around top-left corner
  opacity: number;          // 0..1
  locked: boolean; visible: boolean;
}

export interface Level {
  id: Id; name: string; elevation: number; height: number;
  background: Background | null;
  nodes: Record<Id, WallNode>;
  walls: Record<Id, Wall>;
  openings: Record<Id, Opening>;
  objects: Record<Id, PlacedObject>;
  dimensions: Record<Id, ManualDimension>;
  roomLabels: RoomLabel[];
}

export const FORMAT_VERSION = 1;
export interface Project {
  formatVersion: number; id: Id; name: string;
  createdAt: string; updatedAt: string; // ISO strings
  settings: ProjectSettings;
  levels: Level[]; // ordered bottom to top
  customObjects: Record<Id, CustomObjectDef>;
}
```

- [ ] **Step 2: `defaults.ts`, `ids.ts`, `factory.ts`**

```ts
// defaults.ts
export const DEFAULT_SETTINGS = { defaultWallThickness: 20, partitionThickness: 7, defaultCeilingHeight: 250, gridStep: 10 } as const;
export const OPENING_DEFAULTS = {
  door: { width: 83, height: 204, sillHeight: 0, variant: 'single' },
  window: { width: 120, height: 135, sillHeight: 90, variant: 'single' },
  passage: { width: 90, height: 204, sillHeight: 0, variant: 'none' },
} as const;
export const MIN_WALL_LENGTH = 1;      // cm
export const SNAP_PX = 8;              // snap threshold in screen pixels
export const SLAB_THICKNESS = 20;      // used to stack levels
// ids.ts
export function newId(): string { return crypto.randomUUID(); } // globalThis.crypto exists in node >= 19 and browsers
```

`factory.ts` : `createProject(name: string, now = new Date()): Project` (un niveau `"RDC"`, elevation 0, height 250, `formatVersion: FORMAT_VERSION`) ; `createLevel(name: string, elevation: number, height: number): Level` ; `createOpening(wallId, kind, offset, overrides?: Partial<Opening>): Opening` (défauts depuis `OPENING_DEFAULTS`, hinge `'start'`, swing `'left'`) ; `createObjectFromSize(source, x, y, size: { width; depth; height }, name, color, overrides?): PlacedObject` (rotation 0, elevation 0, mirrored false, lshape null).

- [ ] **Step 3: `vec.ts`** (implémenter et tester chacune) :

```ts
export const v = (x: number, y: number): Vec2 => ({ x, y });
export function add(a, b), sub(a, b), scale(a, k), dot(a, b), cross(a, b) /* a.x*b.y - a.y*b.x */,
  len(a), dist(a, b), normalize(a) /* zero vector -> {0,0} */, perp(a) /* (-a.y, a.x) */,
  rotate(a, rad), angleOf(a) /* atan2(a.y, a.x) */, lerp(a, b, t), equals(a, b, eps = 1e-6);
export function lineIntersection(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null; // lines p+s*d and q+t*e; null if |cross(d,e)| < 1e-9
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; distance: number }; // t clamped to [0,1]
export function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): { point: Vec2; t: number; u: number } | null;
export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
```

Tests minimum : `perp({1,0}) = {0,1}` ; `rotate({1,0}, PI/2)` ≈ `{0,1}` ; `lineIntersection` de deux droites perpendiculaires ; droites parallèles -> `null` ; `projectOnSegment` avant, sur et après le segment (t borné) ; `segmentIntersection` croisement en X et segments disjoints.

- [ ] **Step 4: `polygon.ts`** :

```ts
export function signedArea(r: Ring): number;          // shoelace, sign depends on orientation
export function area(r: Ring): number;                // abs
export function pointInRing(p: Vec2, r: Ring): boolean; // even-odd ray casting
export function pointInPolygon(p: Vec2, poly: PolygonWithHoles): boolean;
export function bbox(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } | null; // null if empty
export function ringEdges(r: Ring): [Vec2, Vec2][];
export function distanceToRing(p: Vec2, r: Ring): number;
export function rectRing(cx: number, cy: number, w: number, h: number, rotationDeg: number): Ring; // corners in order TL, TR, BR, BL (local -w/2,-h/2 first)
```

Tests : aire d'un carré 10x10 = 100 ; carré inversé -> même `area` ; point intérieur/extérieur/dans un trou ; `bbox([])` = null ; `rectRing` tourné de 90° a les bons coins.

- [ ] **Step 5: `boolean.ts`** (adaptateur unique vers polygon-clipping) :

```ts
import pc from 'polygon-clipping';
export function ringToPc(r: Ring): [number, number][]   // closes the ring (repeat first point)
export function toPc(shape: Shape): pc.MultiPolygon
export function fromPc(mp: pc.MultiPolygon): Shape      // drop closing point; outer = first ring of each polygon
export function unionRings(rings: Ring[]): Shape        // [] -> []
export function unionShapes(shapes: Shape[]): Shape
export function difference(subject: Shape, clip: Ring[]): Shape
```

Tests : union de deux carrés qui se chevauchent -> 1 polygone, aire 175 pour deux carrés 10x10 décalés de 5 en x et 5 en y... (calculer : 100 + 100 - 25 = 175) ; union de 4 rectangles formant un cadre -> 1 polygone avec 1 trou d'aire attendue ; difference d'un carré par un carré central -> 1 polygone avec 1 trou ; `unionRings([])` -> `[]`.

- [ ] **Step 6: `format.ts`** :

```ts
export function formatLength(cm: number): string  // 350 -> "3,50 m" ; 7 -> "0,07 m" ; -0 -> "0,00 m"
export function formatArea(cm2: number): string   // 124000 -> "12,40 m²"
export function formatCm(cm: number): string      // 83 -> "83 cm" ; 82.5 -> "82,5 cm" (max 1 decimal)
export function parseCmInput(text: string): number | null
// accepts "350", "350,5", "350.5", " 350 cm ", "3,5 m" (-> 350), "3.5m"; returns null for "", "abc", "NaN", "1e999", negative or zero values
```

Tests couvrant chaque exemple ci-dessus, y compris `parseCmInput('0') === null`, `parseCmInput('-5') === null`, `parseCmInput('1e999') === null`.

- [ ] **Step 7:** `tests/core/factory.test.ts` : `createProject('Maison')` a 1 niveau nommé `RDC`, `formatVersion === 1`, réglages = défauts ; `createOpening(wallId, 'window', 100)` a allège 90.

- [ ] **Step 8:** `npm test && npm run typecheck` verts ; commit `feat(core): add model types, vector and polygon primitives`.

---

### Task 3: Contours des murs et géométrie des ouvertures

**Files:**
- Create: `src/core/geometry/walls.ts`, `src/core/geometry/openings.ts`
- Test: `tests/core/walls.test.ts`, `tests/core/openings-geometry.test.ts`, `tests/core/fixtures.ts`

**Interfaces:**
- Consumes: types, vec, polygon, boolean (Task 2).
- Produces:

```ts
// walls.ts
export interface WallFrame { start: Vec2; end: Vec2; dir: Vec2; normal: Vec2; length: number } // normal = perp(dir) = left side
export function wallFrame(level: Level, wallId: Id): WallFrame;           // throws if missing
export function wallLength(level: Level, wallId: Id): number;
export function computeWallOutlines(level: Level): Map<Id, Ring>;         // one polygon per wall, mitered
export function computeJointPolygons(level: Level): Ring[];               // fill polygons at nodes with >= 2 walls
export function computeWallShape(level: Level, opts: { withOpenings: boolean }): Shape;
// openings.ts
export interface OpeningFrame { center: Vec2; dir: Vec2; normal: Vec2; start: Vec2; end: Vec2; thickness: number; wallLength: number }
export function openingFrame(level: Level, opening: Opening): OpeningFrame;
export function openingCutRing(level: Level, opening: Opening): Ring;     // rectangle along wall, across thickness + 2 cm margin each side
export function openingInterval(o: Opening): [number, number];            // [offset - width/2, offset + width/2]
export function openingFitsWall(o: Opening, wallLen: number): boolean;    // interval within [0, wallLen] (eps 1e-6)
export function openingsOverlap(a: Opening, b: Opening): boolean;         // intervals intersect with positive length
```

`tests/core/fixtures.ts` (utilisé par les tâches suivantes) : `levelFromWalls(segments: Array<[x1, y1, x2, y2, thickness?]>): Level` qui crée un niveau, fusionne les extrémités identiques (distance < 1e-6) en un seul nœud, épaisseur par défaut 20 ; `rectRoom(x1, y1, x2, y2, t = 20)` renvoie les 4 segments.

- [ ] **Step 1: Écrire les tests (`walls.test.ts`)** :

```ts
import { describe, it, expect } from 'vitest';
import { computeWallShape, computeWallOutlines } from '@/core/geometry/walls';
import { area } from '@/core/geometry/polygon';
import { levelFromWalls, rectRoom } from './fixtures';

const shapeArea = (s: ReturnType<typeof computeWallShape>) =>
  s.reduce((acc, p) => acc + area(p.outer) - p.holes.reduce((h, r) => h + area(r), 0), 0);

describe('wall outlines', () => {
  it('single wall is a rectangle with square ends', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0, 20]]);
    const ring = [...computeWallOutlines(lvl).values()][0]!;
    expect(area(ring)).toBeCloseTo(2000);
  });
  it('right-angle corner is mitered: L shape area equals outer minus inner', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0], [100, 0, 100, 100]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    // axis lengths 100 each, thickness 20: area = 2*100*20 = 4000 exactly with miters
    expect(shapeArea(shape)).toBeCloseTo(4000, 3);
  });
  it('closed rectangular room has exactly one hole of interior size', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shape[0]!.holes).toHaveLength(1);
    expect(area(shape[0]!.holes[0]!)).toBeCloseTo(380 * 280, 3);
    expect(area(shape[0]!.outer)).toBeCloseTo(420 * 320, 3);
  });
  it('non-right angle (60 deg) produces a single clean polygon without spikes', () => {
    const lvl = levelFromWalls([[0, 0, 200, 0], [200, 0, 100, 173.205]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    const b = shape[0]!.outer.reduce((m, p) => Math.max(m, Math.hypot(p.x - 200, p.y)), 0);
    expect(b).toBeLessThan(260); // the miter tip stays close to the corner (no spike)
  });
  it('T junction has no internal seam: one polygon, two holes when closing two rooms', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shape[0]!.holes).toHaveLength(2);
  });
  it('cross junction yields four holes in a square split in four', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 400), [200, 0, 200, 200], [200, 200, 200, 400], [0, 200, 200, 200], [200, 200, 400, 200]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape[0]!.holes).toHaveLength(4);
  });
  it('walls of different thickness join without gap', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0, 30], [100, 0, 100, 100, 10]]);
    expect(computeWallShape(lvl, { withOpenings: false })).toHaveLength(1);
  });
  it('nearly collinear walls (0.5 deg) join straight', () => {
    const lvl = levelFromWalls([[0, 0, 100, 0], [100, 0, 200, 0.87]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    expect(shape).toHaveLength(1);
    expect(shapeArea(shape)).toBeCloseTo(200 * 20, -1);
  });
  it('very acute angle (10 deg) is truncated (no long spike)', () => {
    const lvl = levelFromWalls([[0, 0, 200, 0], [0, 0, 197, 34.7]]);
    const shape = computeWallShape(lvl, { withOpenings: false });
    const minX = Math.min(...shape[0]!.outer.map((p) => p.x));
    expect(minX).toBeGreaterThan(-60);
  });
  it('opening cuts the wall shape', () => {
    const lvl = levelFromWalls([[0, 0, 300, 0]]);
    const wallId = Object.keys(lvl.walls)[0]!;
    lvl.openings['o1'] = { id: 'o1', wallId, kind: 'door', variant: 'single', offset: 150, width: 80, height: 204, sillHeight: 0, hinge: 'start', swing: 'left' };
    const shape = computeWallShape(lvl, { withOpenings: true });
    expect(shape).toHaveLength(2);
    expect(shapeArea(shape)).toBeCloseTo((300 - 80) * 20, 3);
  });
});
```

`openings-geometry.test.ts` : `openingFrame` d'une ouverture à offset 150 sur un mur (0,0)-(300,0) a `center = (150, 0)`, `dir = (1, 0)`, `normal = (0, 1)` ; `openingFitsWall` vrai pour [110,190] dans 300, faux pour offset 20 largeur 80 ; `openingsOverlap` vrai pour [100,180] et [170,250], faux pour [100,180] et [180,260] (contact sans recouvrement).

- [ ] **Step 2:** lancer `npx vitest run tests/core/walls.test.ts` -> FAIL (module absent).

- [ ] **Step 3: Implémenter `walls.ts`**. Algorithme imposé :

```ts
// For each node N, list incident walls with outgoing direction u (unit vector from N along the wall)
// and half thickness h. Sort by angleOf(u) ascending.
// For a wall at node N, define its two side lines through N:
//   ccwSide: N + perp(u) * h  (direction u)    cwSide: N - perp(u) * h (direction u)
// Corner between consecutive walls i and j = i+1 (cyclic) in the sorted list:
//   c = lineIntersection(ccwSide_i, u_i, cwSide_j, u_j)
//   - if only one wall at N: no corner; wall end is square: ccw point = N + perp(u)h, cw point = N - perp(u)h
//   - if the angle between u_i and u_j (measured ccw from i to j) is within 1 deg of 180 (collinear) or c is null:
//       use the square points of each wall (no miter)
//   - if |c - N| > 4 * max(h_i, h_j): truncate: use the square points (the joint polygon fills the gap)
//   wall i gets c as its "ccw end point at N"; wall j gets c as its "cw end point at N".
// Wall polygon for wall A->B with dir d:
//   at A, outgoing u = d: cw point = A - perp(d)h side, ccw point = A + perp(d)h side
//   at B, outgoing u = -d: perp(-d) = -perp(d), so B's ccw point lies on the -perp(d) side
//   ring = [A_cw, B_ccw, B_cw, A_ccw]  (A_cw and B_ccw are on the -perp(d) side; B_cw and A_ccw on +perp(d))
// Joint polygon at node N with k >= 2 walls: ring made of, for each wall in angular order, its cw point
//   then its ccw point at N (consecutive duplicates removed); skip if area < 1e-6. Fills notches left by truncation.
// computeWallShape = unionRings([...outlines, ...joints]); if withOpenings, difference(shape, openings.map(openingCutRing)).
```

Si un test de jonction échoue, corriger l'algorithme, jamais le test (les valeurs attendues sont calculées à la main). Les tests de forme exacte (aires) sont la référence.

- [ ] **Step 4: Implémenter `openings.ts`** : `openingFrame` à partir de `wallFrame` ; `start = center - dir * width/2`, `end = center + dir * width/2` ; `openingCutRing` = rectangle de `start` à `end`, de `-(thickness/2 + 2)` à `+(thickness/2 + 2)` selon `normal`.

- [ ] **Step 5:** tests verts, typecheck vert ; commit `feat(core): compute mitered wall outlines and opening geometry`.

---

### Task 4: Détection des pièces

**Files:**
- Create: `src/core/geometry/rooms.ts`
- Test: `tests/core/rooms.test.ts`

**Interfaces:**
- Consumes: `computeWallShape`, `area`, `pointInRing`, polylabel.
- Produces:

```ts
export interface Room {
  key: string;            // label id if labelled, else 'room-' + index (stable within one computation)
  ring: Ring;             // interior boundary (a hole of the wall shape)
  area: number;           // cm2
  labelPoint: Vec2;       // pole of inaccessibility
  label: RoomLabel | null;
  name: string;           // label name or 'Pièce'
}
export function computeRooms(level: Level, wallShape?: Shape): Room[]; // wallShape = computeWallShape(level, { withOpenings: false }) if omitted
```

Règle des étiquettes : pour chaque pièce, prendre la **première** étiquette (ordre du tableau `roomLabels`) dont l'ancre est dans `ring`. Les étiquettes qui ne sont dans aucune pièce, ou devancées par une plus ancienne, sont ignorées (pas supprimées). Une même étiquette ne peut servir qu'à une pièce.

- [ ] **Step 1: Tests** :

```ts
describe('computeRooms', () => {
  it('detects a single rectangular room with net area', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    const rooms = computeRooms(lvl);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.area).toBeCloseTo(380 * 280, 3);
    expect(rooms[0]!.name).toBe('Pièce');
  });
  it('L-shaped room: exact area and label point inside', () => {
    // outer L built with 6 walls on axes, thickness 20
    const lvl = levelFromWalls([[0, 0, 400, 0], [400, 0, 400, 200], [400, 200, 200, 200], [200, 200, 200, 400], [200, 400, 0, 400], [0, 400, 0, 0]]);
    const [room] = computeRooms(lvl);
    // interior: 380x180 + 180x200 (axis L inset by 10 each side)
    expect(room!.area).toBeCloseTo(380 * 180 + 180 * 200, 1);
    expect(pointInRing(room!.labelPoint, room!.ring)).toBe(true);
  });
  it('two rooms sharing a partition', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    expect(computeRooms(lvl)).toHaveLength(2);
  });
  it('a door in the partition does not merge rooms', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    const partition = Object.values(lvl.walls).find((w) => w.thickness === 10)!;
    lvl.openings['d'] = { id: 'd', wallId: partition.id, kind: 'door', variant: 'single', offset: 150, width: 83, height: 204, sillHeight: 0, hinge: 'start', swing: 'left' };
    expect(computeRooms(lvl)).toHaveLength(2);
  });
  it('labels: oldest label wins when two anchors fall in the same room', () => {
    const lvl = levelFromWalls(rectRoom(0, 0, 400, 300));
    lvl.roomLabels = [{ id: 'a', name: 'Salon', anchor: { x: 100, y: 100 } }, { id: 'b', name: 'Chambre', anchor: { x: 300, y: 100 } }];
    const [room] = computeRooms(lvl);
    expect(room!.name).toBe('Salon');
    expect(room!.key).toBe('a');
  });
  it('labels survive removing and re-adding a partition', () => {
    const base = levelFromWalls(rectRoom(0, 0, 400, 300));
    base.roomLabels = [{ id: 'a', name: 'Salon', anchor: { x: 100, y: 100 } }, { id: 'b', name: 'Chambre', anchor: { x: 300, y: 100 } }];
    const split = levelFromWalls([...rectRoom(0, 0, 400, 300), [200, 0, 200, 300, 10]]);
    split.roomLabels = base.roomLabels;
    expect(computeRooms(split).map((r) => r.name).sort()).toEqual(['Chambre', 'Salon']);
  });
  it('crossing walls without shared node split rooms', () => {
    const lvl = levelFromWalls([...rectRoom(0, 0, 400, 400), [200, -10, 200, 410, 10], [-10, 200, 410, 200, 10]]);
    expect(computeRooms(lvl)).toHaveLength(4);
  });
  it('open walls produce no room', () => {
    expect(computeRooms(levelFromWalls([[0, 0, 400, 0], [400, 0, 400, 300]]))).toHaveLength(0);
  });
});
```

- [ ] **Step 2:** lancer -> FAIL.
- [ ] **Step 3: Implémenter.** Pièces = tous les `holes` de toutes les formes de `computeWallShape(level, { withOpenings: false })`. `labelPoint` : `polylabel([ring.map(p => [p.x, p.y])], 1)`.
- [ ] **Step 4:** verts ; commit `feat(core): detect rooms from wall shape holes`.

---

### Task 5: Infrastructure des commandes, historique, invariants, clonage

**Files:**
- Create: `src/core/commands/apply.ts`, `history.ts`, `validate.ts`, `src/core/model/clone.ts`
- Test: `tests/core/apply.test.ts`, `tests/core/history.test.ts`, `tests/core/validate.test.ts`, `tests/core/clone.test.ts`

**Interfaces:**
- Produces:

```ts
// apply.ts
import { produceWithPatches, enablePatches, type Patch, type Draft } from 'immer';
enablePatches();
export class CommandError extends Error {}
export type Recipe = (draft: Draft<Project>) => void;
export type CommandResult =
  | { ok: true; project: Project; patches: Patch[]; inverse: Patch[] }
  | { ok: false; error: string };
export function applyCommand(project: Project, recipe: Recipe, opts?: { validate?: boolean }): CommandResult;
// - runs produceWithPatches; a thrown CommandError -> { ok: false, error: message }; other errors are rethrown
// - if opts.validate (default: import.meta.env?.DEV ?? true in tests), runs validateProject on the result and
//   throws Error('Invariant violation: ...') listing problems (programming error, never user error)
// - sets updatedAt only via commands that call touch(draft); applyCommand itself does not touch dates
export function getLevel(draft: Draft<Project> | Project, levelId: Id): Draft<Level>; // throws CommandError('Niveau introuvable')
export function touch(draft: Draft<Project>, now?: Date): void;
// history.ts
export interface HistoryEntry { label: string; patches: Patch[]; inverse: Patch[] }
export interface History { past: HistoryEntry[]; future: HistoryEntry[] }
export const emptyHistory: History;
export function pushEntry(h: History, e: HistoryEntry): History;   // clears future
export function undo(project: Project, h: History): { project: Project; history: History } | null;
export function redo(project: Project, h: History): { project: Project; history: History } | null;
// validate.ts
export function validateProject(p: Project): string[]; // empty = valid
// clone.ts
export function cloneLevelWithNewIds(level: Level): Level;       // remaps every id and every reference
export function cloneProjectWithNewIds(p: Project, imageIdMap?: Map<Id, Id>): Project;
```

Invariants vérifiés par `validateProject`, par niveau :
1. chaque mur référence deux nœuds existants et distincts ; longueur >= `MIN_WALL_LENGTH` ; épaisseur > 0 ; hauteur > 0 ;
2. aucun nœud orphelin (sans mur) ;
3. pas deux murs entre la même paire de nœuds ;
4. chaque ouverture référence un mur existant, `width > 0`, tient dans le mur (`openingFitsWall`), ne chevauche aucune autre ouverture du même mur ;
5. chaque objet : `width > 0`, `depth > 0`, `height > 0`, coordonnées finies ; source `custom` -> la définition existe ;
6. chaque cote : ancres `node`/`objectCorner` résolues vers des éléments existants ;
7. toutes les valeurs numériques finies ;
8. au moins un niveau ; ids de niveaux uniques.

- [ ] **Step 1: Tests** :
  - `applyCommand` : une recette qui renomme le projet -> `ok`, patches non vides, `inverse` restaure le nom via `applyPatches` ; une recette qui lève `CommandError('x')` -> `{ ok: false, error: 'x' }` et le projet d'origine n'est pas modifié ; une recette qui crée un mur orphelin (référence un nœud inexistant) -> lève une erreur contenant `Invariant violation`.
  - `history` : push A, push B, undo -> état après A ; redo -> état après B ; undo puis push C -> `future` vide ; `undo` sur historique vide -> `null`.
  - `validate` : projet par défaut valide ; nœud orphelin signalé ; ouverture qui dépasse signalée ; deux ouvertures qui se chevauchent signalées ; `NaN` dans un objet signalé.
  - `clone` : `cloneLevelWithNewIds` d'un niveau avec 4 murs, 1 porte, 1 objet, 1 cote accrochée à un nœud et 1 étiquette -> aucun id en commun avec l'original, toutes les références valides (`validateProject` sur un projet contenant les deux niveaux = `[]`), même nombre d'éléments.
- [ ] **Step 2:** FAIL puis implémentation, verts.
- [ ] **Step 3:** commit `feat(core): add command application, history, invariants and cloning`.

---

### Task 6: Commandes de murs

**Files:**
- Create: `src/core/commands/walls.ts`, `src/core/commands/reconcile.ts`
- Test: `tests/core/commands-walls.test.ts`

**Interfaces:**
- Consumes: `applyCommand`, `getLevel`, `CommandError`, `wallFrame`, géométrie des ouvertures.
- Produces (toutes renvoient une `Recipe`, à passer à `applyCommand`) :

```ts
export type WallPoint =
  | { kind: 'node'; nodeId: Id }
  | { kind: 'onWall'; wallId: Id; t: number }   // 0 < t < 1 along start->end
  | { kind: 'free'; x: number; y: number };
export function addWallChain(levelId: Id, points: WallPoint[], thickness: number, height: number, out?: { wallIds: Id[] }): Recipe;
// - consecutive points create walls; points of kind onWall split that wall first (splitWall semantics)
// - a 'free' point closer than 0.5 cm to an existing node reuses that node
// - zero-length segments (< MIN_WALL_LENGTH) -> CommandError('Mur trop court')
// - a segment duplicating an existing wall (same node pair) is skipped silently
// - fewer than 2 points -> CommandError
export function addRectRoom(levelId: Id, a: Vec2, b: Vec2, thickness: number, height: number): Recipe; // a, b = opposite axis corners; |dx|,|dy| >= MIN_WALL_LENGTH else CommandError
export function splitWall(levelId: Id, wallId: Id, t: number, out?: { nodeId: Id }): Recipe;
// - new node at lerp(start, end, t); two walls inherit thickness/height
// - each opening goes to the piece containing its center; offset recomputed; must still fit, else CommandError('Une ouverture est à cheval sur la jonction')
// - manual dimensions anchored to nodes are unaffected
export function moveNodes(levelId: Id, moves: Array<{ nodeId: Id; to: Vec2 }>): Recipe; // then reconcileOpenings
export function moveWalls(levelId: Id, wallIds: Id[], delta: Vec2): Recipe;           // moves the set of their nodes once
export function mergeNode(levelId: Id, sourceNodeId: Id, targetNodeId: Id): Recipe;   // walls of source rewired to target; walls that become degenerate (both ends target) or duplicate are deleted (with their openings)
export function setWallThickness(levelId: Id, wallIds: Id[], thickness: number): Recipe; // > 0 and finite else CommandError
export function setWallHeight(levelId: Id, wallIds: Id[], height: number): Recipe;
export function setWallLength(levelId: Id, wallId: Id, length: number, keep: 'start' | 'end'): Recipe;
// moves the non-kept node along the current direction; finite and >= MIN_WALL_LENGTH else CommandError('Longueur invalide')
export function deleteWalls(levelId: Id, wallIds: Id[]): Recipe;
// removes the walls, their openings, orphan nodes, and manual dimensions anchored to removed nodes
// reconcile.ts
export function reconcileOpenings(level: Draft<Level>): void;
// for each opening: clamp offset into [width/2, wallLen - width/2]; if width > wallLen -> CommandError('Le mur est trop court pour ses ouvertures');
// then resolve overlaps on each wall by keeping order and pushing later openings forward; if impossible -> same CommandError
```

Messages d'erreur (affichés à l'utilisateur) en français.

- [ ] **Step 1: Tests** (chacun via `applyCommand` sur `createProject` ou sur un projet bâti avec les fabriques) :
  - `addWallChain` avec 3 points libres -> 2 murs, 3 nœuds ; avec fermeture (dernier point = `{kind:'node', nodeId: premier}`) d'un carré de 4 points -> 4 murs, 4 nœuds, `computeRooms` = 1 pièce.
  - un point `onWall` au milieu d'un mur existant -> ce mur est coupé, la jonction en T partage le nœud (3 murs incidents au nœud).
  - un point libre à 0,3 cm d'un nœud existant réutilise ce nœud.
  - segment de longueur 0 -> `{ ok: false, error: 'Mur trop court' }`.
  - `addRectRoom` (0,0)-(400,300) -> 4 murs, 1 pièce d'aire 380x280.
  - `splitWall` d'un mur avec une porte à offset 250 (longueur 300) à t=0,5 -> la porte est sur le second morceau à offset 100 ; avec une porte à offset 150 de largeur 83 -> refus `Une ouverture est à cheval sur la jonction`.
  - `moveNodes` déplace les deux murs qui partagent le nœud ; une porte reste à son offset tant qu'elle tient ; si le mur raccourcit sous la porte, elle est recalée ; si le mur devient plus court que la porte -> refus.
  - `mergeNode` de l'extrémité libre d'un mur sur un nœud existant ferme une pièce ; fusionner les deux extrémités d'un même mur supprime ce mur.
  - `setWallLength(..., 350, 'start')` sur un mur horizontal de 300 -> le nœud de fin passe à x=350 ; `setWallLength(..., NaN, ...)` et `(..., 0, ...)` -> refus `Longueur invalide` (**Review Focus 5**, nommer le test `setWallLength rejects non-finite`).
  - `deleteWalls` supprime ouvertures, nœuds orphelins et cotes accrochées.
  - Pour chaque commande ci-dessus, un test d'aller-retour : `applyPatches(result.project, result.inverse)` est profondément égal au projet initial.
- [ ] **Step 2:** FAIL ; implémenter ; verts ; commit `feat(core): add wall commands with splitting, merging and opening reconciliation`.

---

### Task 7: Commandes d'ouvertures, d'objets, de cotes, de pièces, de niveaux et de projet

**Files:**
- Create: `src/core/commands/openings.ts`, `objects.ts`, `dimensions.ts`, `rooms.ts`, `levels.ts`, `project.ts`, `src/core/geometry/objects.ts`, `src/core/geometry/anchors.ts`
- Test: `tests/core/commands-openings.test.ts`, `commands-objects.test.ts`, `commands-dimensions.test.ts`, `commands-rooms.test.ts`, `commands-levels.test.ts`, `commands-project.test.ts`, `anchors.test.ts`

**Interfaces:**
- Produces:

```ts
// geometry/objects.ts
export function objectCorners(o: PlacedObject): [Vec2, Vec2, Vec2, Vec2]; // local (-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2), rotated, translated
export function objectFootprint(o: PlacedObject): Ring;                     // rect ring; circle -> 32-gon; lshape -> 6-point ring (notch at local +x,+y corner, mirrored flips x)
export function objectShape(o: PlacedObject, customObjects: Record<Id, CustomObjectDef>): GenericShape | 'symbol';
// geometry/anchors.ts
export function resolveAnchor(level: Level, a: Anchor): Vec2 | null;
// commands/openings.ts
export function addOpening(levelId: Id, opening: Opening): Recipe;                 // must fit and not overlap else CommandError('Pas assez de place sur ce mur')
export function moveOpening(levelId: Id, openingId: Id, wallId: Id, offset: number): Recipe; // can change wall; same checks
export function updateOpening(levelId: Id, openingId: Id, patch: Partial<Omit<Opening, 'id' | 'wallId'>>): Recipe; // checks fit; width/height > 0
export function deleteOpenings(levelId: Id, ids: Id[]): Recipe;
// commands/objects.ts
export function addObject(levelId: Id, obj: PlacedObject): Recipe;
export function moveObjects(levelId: Id, ids: Id[], delta: Vec2): Recipe;
export function setObjectTransform(levelId: Id, id: Id, t: { x?: number; y?: number; rotation?: number }): Recipe; // rotation normalized to [0, 360)
export function updateObject(levelId: Id, id: Id, patch: Partial<Omit<PlacedObject, 'id' | 'source'>>): Recipe;
// width/depth/height must be finite and > 0, elevation finite >= 0, else CommandError('Dimension invalide')
export function deleteObjects(levelId: Id, ids: Id[]): Recipe;  // also deletes manual dimensions anchored to these objects
export function pasteObjects(levelId: Id, objects: PlacedObject[], delta: Vec2, out?: { ids: Id[] }): Recipe; // new ids
// commands/dimensions.ts
export function addDimension(levelId: Id, a: Anchor, b: Anchor, offset: number): Recipe; // resolved points must differ by >= 1 cm
export function setDimensionOffset(levelId: Id, id: Id, offset: number): Recipe;
export function deleteDimensions(levelId: Id, ids: Id[]): Recipe;
// commands/rooms.ts
export function renameRoom(levelId: Id, room: { label: RoomLabel | null; labelPoint: Vec2 }, name: string): Recipe;
// label present -> rename it; else push a new label anchored at labelPoint; empty/blank name -> remove the label if present
// commands/levels.ts
export function addLevel(refLevelId: Id, where: 'above' | 'below', name: string, out?: { levelId: Id }): Recipe;
// elevation: above = ref.elevation + ref.height + SLAB_THICKNESS; below = ref.elevation - (defaultCeilingHeight + SLAB_THICKNESS)
export function renameLevel(levelId: Id, name: string): Recipe; // trimmed, non-empty
export function setLevelProps(levelId: Id, p: { elevation?: number; height?: number }): Recipe;
export function duplicateLevel(levelId: Id, name: string, out?: { levelId: Id }): Recipe; // inserted just above the source, cloneLevelWithNewIds
export function deleteLevel(levelId: Id): Recipe;  // refuses deleting the last level: CommandError('Un projet doit garder au moins un niveau')
export function moveLevel(levelId: Id, toIndex: number): Recipe;
// commands/project.ts
export function renameProject(name: string): Recipe;
export function updateSettings(patch: Partial<ProjectSettings>): Recipe; // values finite > 0
export function addCustomObject(def: CustomObjectDef): Recipe;
export function deleteCustomObject(id: Id): Recipe; // refuses if used by a placed object: CommandError('Objet utilisé dans le plan')
export function setBackground(levelId: Id, bg: Background | null): Recipe;
export function updateBackground(levelId: Id, patch: Partial<Omit<Background, 'imageId'>>): Recipe; // opacity clamped 0..1, scale > 0
```

Toute commande qui modifie le projet appelle `touch(draft)`.

- [ ] **Step 1: Tests** : pour chaque fichier, au moins un cas nominal, un cas refusé et un aller-retour inverse. Cas obligatoires :
  - `addOpening` qui chevauche une ouverture existante -> refus ; `moveOpening` vers un autre mur -> `wallId` changé.
  - `updateObject(..., { width: 0 })`, `{ width: -3 }`, `{ depth: NaN }` -> refus `Dimension invalide` (**Review Focus 5** : nommer `rejects non-positive dimensions`).
  - `setObjectTransform(..., { rotation: -90 })` -> 270.
  - `deleteObjects` supprime la cote accrochée à un coin de l'objet.
  - `pasteObjects` crée de nouveaux ids décalés de `delta`.
  - `resolveAnchor` d'un coin 1 d'un objet 100x50 en (0,0) tourné de 90° -> (25, 50) (vérifier à la main avec la formule de rotation).
  - `renameRoom` sans étiquette crée une étiquette ; renommer avec `'  '` supprime l'étiquette.
  - `addLevel(..., 'above')` -> insérée au-dessus, altitude 270 pour un RDC (0 + 250 + 20) ; `deleteLevel` du dernier niveau -> refus ; `duplicateLevel` -> niveau inséré à l'index source + 1, ids distincts.
  - `deleteCustomObject` utilisé -> refus.
- [ ] **Step 2:** FAIL ; implémenter ; verts ; commit `feat(core): add opening, object, dimension, room, level and project commands`.

---

### Task 8: Persistance (format d'échange) et stockage IndexedDB

**Files:**
- Create: `src/core/persistence/schema.ts`, `migrate.ts`, `exchange.ts`, `src/storage/db.ts`, `src/storage/files.ts`
- Test: `tests/core/exchange.test.ts`, `tests/storage/db.test.ts`

**Interfaces:**
- Produces:

```ts
// exchange.ts (pure)
export interface ImageData64 { mime: string; data: string } // base64 without data: prefix
export interface ExportFile { app: 'plan-maison'; formatVersion: number; project: Project; images: Record<Id, ImageData64> }
export function serializeExport(project: Project, images: Record<Id, ImageData64>): string; // JSON.stringify(..., null, 2)
export type ImportResult = { ok: true; project: Project; images: Record<Id, ImageData64> } | { ok: false; error: string };
export function parseImport(text: string): ImportResult;
// - JSON parse error -> 'Fichier illisible : ce n\'est pas un fichier JSON valide.'
// - app !== 'plan-maison' -> 'Ce fichier ne provient pas de Plan Maison.'
// - formatVersion > FORMAT_VERSION -> 'Ce fichier a été créé par une version plus récente de Plan Maison.'
// - migrate(raw) then zod parse; zod error -> 'Fichier invalide : ' + first issue path joined by '.' + ' ' + message
// - validateProject non-empty -> 'Fichier invalide : ' + first problem
// - every background.imageId must exist in images, else 'Fichier invalide : image de fond manquante'
export function prepareImportedProject(r: { project: Project; images: Record<Id, ImageData64> }, existingNames: string[]):
  { project: Project; images: Record<Id, ImageData64> };
// new project id, new image ids (remapped in backgrounds) via cloneProjectWithNewIds; if the name exists, append ' (import)', then ' (import 2)', ...
// migrate.ts
export const migrations: Record<number, (raw: any) => any>; // key = from version; empty for now
export function migrate(raw: { formatVersion: number }): unknown; // applies migrations up to FORMAT_VERSION
// storage/db.ts (browser; tested with fake-indexeddb)
export interface ProjectMeta { id: Id; name: string; updatedAt: string; levelCount: number }
export interface StoredImage { id: Id; projectId: Id; mime: string; blob: Blob; widthPx: number; heightPx: number }
export function openDb(name?: string): Promise<IDBPDatabase>;  // db 'plan-maison' v1, stores 'projects' (keyPath id), 'images' (keyPath id, index 'byProject')
export class ProjectStore {
  constructor(db: IDBPDatabase);
  listProjects(): Promise<ProjectMeta[]>;                 // sorted by updatedAt desc
  getProject(id: Id): Promise<Project | null>;
  saveProject(p: Project): Promise<void>;
  deleteProject(id: Id): Promise<void>;                   // also deletes its images
  putImage(img: StoredImage): Promise<void>;
  getImage(id: Id): Promise<StoredImage | null>;
  listImages(projectId: Id): Promise<StoredImage[]>;
  deleteUnreferencedImages(p: Project): Promise<number>; // removes project images not referenced by any level background
}
// storage/files.ts (browser)
export function blobToBase64(b: Blob): Promise<string>;
export function base64ToBlob(data: string, mime: string): Blob;
export function downloadText(fileName: string, text: string, mime?: string): void;
export function downloadBlob(fileName: string, blob: Blob): void;
export function readFileAsText(f: File): Promise<string>;
export function imageSize(blob: Blob): Promise<{ widthPx: number; heightPx: number }>; // rejects with Error('Image illisible')
```

- [ ] **Step 1: Tests `exchange`** : aller-retour `serializeExport` puis `parseImport` profondément égal ; JSON tronqué -> message "Fichier illisible" ; `app: 'autre'` -> message de provenance ; `formatVersion: 99` -> message "version plus récente" ; ouverture qui déborde -> "Fichier invalide" ; image manquante -> message dédié ; `prepareImportedProject` avec nom existant -> `'Maison (import)'` puis `'Maison (import 2)'`, ids différents, `background.imageId` remappé vers une clé présente dans `images`.
- [ ] **Step 2: Tests `db`** (en tête : `import 'fake-indexeddb/auto';`, et `Blob` est natif dans Node 18+) : save/get/list triés ; delete supprime les images ; `deleteUnreferencedImages` supprime seulement les images non référencées.
- [ ] **Step 3:** schéma zod strictement aligné sur `types.ts` (objets stricts : clés inconnues refusées sauf au niveau racine de l'export). Implémenter ; verts ; commit `feat: add export format, import validation and indexeddb storage`.

---

### Task 9: Géométrie de l'éditeur (magnétisme, sélection par pointage, dégagements, cotes automatiques, dérivés)

**Files:**
- Create: `src/core/geometry/snap.ts`, `hit.ts`, `clearances.ts`, `autoDimensions.ts`, `derived.ts`
- Test: `tests/core/snap.test.ts`, `hit.test.ts`, `clearances.test.ts`, `autoDimensions.test.ts`

**Interfaces:**
- Produces:

```ts
// derived.ts
export interface DerivedLevel {
  outlines: Map<Id, Ring>;
  shapeNoOpenings: Shape;
  shapeWithOpenings: Shape;
  rooms: Room[];
  facadeRings: Ring[];   // outer rings of shapeNoOpenings
}
export function deriveLevel(level: Level): DerivedLevel; // memoized by object identity (WeakMap<Level, DerivedLevel>)
// snap.ts
export type SnapKind = 'node' | 'wallMid' | 'wallAxis' | 'align' | 'angle' | 'ortho' | 'grid' | 'none';
export interface Guide { a: Vec2; b: Vec2 }
export interface SnapResult { point: Vec2; kind: SnapKind; nodeId?: Id; wallId?: Id; t?: number; guides: Guide[] }
export interface SnapOptions {
  level: Level; pxPerCm: number; gridStep: number;
  enabled: boolean;              // false when Alt is held -> kind 'none', raw point
  ortho: boolean;                // Shift: constrain to 0/90/180/270 deg from `from`
  from?: Vec2;                   // previous point (wall drawing)
  excludeNodeIds?: Set<Id>; excludeWallIds?: Set<Id>;
}
export function snapPoint(raw: Vec2, o: SnapOptions): SnapResult;
// tolerance = SNAP_PX / pxPerCm. Priority: node > wallMid > wallAxis (projection on axis, 0<t<1) > align (x and/or y of a node, guide from node to point) > angle (multiples of 15 deg from `from`, keeps distance) > grid.
// ortho applies first (projects raw on the closest axis from `from`), then node/wall snapping only if they lie on that axis line (within tolerance), else grid along the axis.
export interface ObjectSnap { x: number; y: number; rotation: number; wallId: Id | null }
export function snapObjectToWalls(o: PlacedObject, level: Level, pxPerCm: number): ObjectSnap;
// For each wall face (two sides of each outline edge parallel to the wall axis), if the object's back edge (local -y side, after choosing
// rotation = wall angle aligned so the object's back faces the wall) is within tolerance + depth/2 of the face, return the snapped
// center = foot point on face + faceNormal * depth/2 and that rotation. Otherwise return the input transform unchanged with wallId null.
// hit.ts
export type HitKind = 'opening' | 'object' | 'node' | 'wall' | 'dimension' | 'room';
export interface HitTarget { kind: HitKind; id: Id }   // for room: id = room.key
export function hitTest(level: Level, d: DerivedLevel, p: Vec2, pxPerCm: number): HitTarget | null;
// priority: opening (point in cut ring) > node (distance < tolerance) > object (topmost = last in record order, point in footprint)
//   > dimension (distance to dim line < tolerance) > wall (point in outline) > room (point in ring)
export function hitTestRect(level: Level, d: DerivedLevel, a: Vec2, b: Vec2): HitTarget[]; // fully contained: objects, openings, walls (both nodes inside), dimensions (both ends inside)
// clearances.ts
export interface Clearance { side: 'left' | 'right' | 'front' | 'back'; from: Vec2; to: Vec2; distance: number; dir: Vec2 }
export function objectClearances(o: PlacedObject, d: DerivedLevel): Clearance[];
// for each local side (back = -y, front = +y, left = -x, right = +x), ray from the side midpoint along the outward local axis,
// nearest intersection with any edge of shapeNoOpenings rings (outer and holes); omit sides with no hit within 2000 cm
export function placeAtClearance(o: PlacedObject, c: Clearance, value: number): { x: number; y: number }; // moves along c.dir so distance becomes value
export interface OpeningClearance { side: 'before' | 'after'; from: Vec2; to: Vec2; distance: number }
export function openingClearances(level: Level, opening: Opening): OpeningClearance[]; // to wall ends or neighbour openings on the same wall
// autoDimensions.ts
export interface DimLine { a: Vec2; b: Vec2; offset: number; value: number; kind: 'room' | 'facade' | 'opening' | 'manual' | 'dynamic' }
// offset: signed perpendicular distance, positive = towards perp(b - a)
export function computeAutoDimensions(level: Level, d: DerivedLevel): DimLine[];
// room: each edge of each room ring longer than 10 cm, offset 25 towards the room interior;
// facade: each edge of each facade ring longer than 10 cm, offset 50 outwards;
// opening: one per opening, from frame.start to frame.end, offset (thickness/2 + 20) on the side opposite to swing.
```

- [ ] **Step 1: Tests `snap`** (niveau = pièce 400x300, `pxPerCm = 1` donc tolérance 8 cm) :
  - point à (3, 4) d'un nœud en (0,0) -> `kind 'node'`, point exact du nœud ;
  - point près du milieu d'un mur -> `wallMid` ; près de l'axe ailleurs -> `wallAxis` avec `t` correct ;
  - loin de tout, `from = (0,0)`, point (100, 3) -> `angle` (0°) ; point (52, 49) -> `angle` 45° ;
  - grille : (123, 456) loin de tout et sans `from` -> (120, 460) ;
  - `enabled: false` -> point brut, `kind 'none'` ;
  - `ortho: true`, `from = (0,0)`, point (100, 30) -> (100, 0) ;
  - avec `pxPerCm = 4`, la tolérance est de 2 cm : point à 3 cm d'un nœud -> pas `node`.
  - `snapObjectToWalls` (pièce d'axes 0..400 x 0..300, murs 20, face intérieure du mur haut en y=10) : un lit 140x190 centré en (200, 110), rotation 0 (dos vers le haut, bord arrière en y=15, à 5 cm de la face) -> centre (200, 105), rotation 0, `wallId` = mur haut ; centré en (200, 150) -> inchangé, `wallId` null.
- [ ] **Step 2: Tests `hit`** : clic dans une porte -> `opening` ; clic sur un objet posé sur un mur -> `object` ; clic dans l'épaisseur d'un mur -> `wall` ; clic au milieu d'une pièce vide -> `room` ; clic à l'extérieur -> `null` ; rectangle englobant un objet seulement -> `[object]`.
- [ ] **Step 3: Tests `clearances`** : objet 100x50 au centre d'une pièce intérieure 380x280 (axes 0..400, 0..300) en (200,150) -> left 140, right 140, back 115, front 115 ; `placeAtClearance` sur `left` avec 60 -> x = 120 ; `openingClearances` d'une porte centrée à 150 de largeur 80 sur un mur de 300 -> 110 et 110.
- [ ] **Step 4: Tests `autoDimensions`** : pièce 400x300 seule -> 4 cotes `room` de valeurs 380/280/380/280, 4 cotes `facade` 420/320/420/320 (les murs sont entièrement en façade) ; avec une porte -> une cote `opening` de valeur 83.
- [ ] **Step 5:** implémenter ; verts ; commit `feat(core): add snapping, hit testing, clearances and automatic dimensions`.

---

### Task 10: Catalogue et symboles

**Files:**
- Create: `src/catalog/catalog.ts`, `src/catalog/symbols.tsx`
- Test: `tests/core/catalog.test.ts`

**Interfaces:**
- Produces:

```ts
export type CatalogCategory = 'Chambre' | 'Séjour' | 'Bureau et repas' | 'Cuisine' | 'Salle de bain' | 'Structure' | 'Génériques';
export interface CatalogEntry {
  id: string; name: string; category: CatalogCategory;
  width: number; depth: number; height: number;
  color: string;                               // default fill, hex
  shape: GenericShape | 'symbol';
  lshape?: LShapeParams;                       // default notch for 'generic-lshape'
}
export const CATALOG: CatalogEntry[];
export function getCatalogEntry(id: string): CatalogEntry | undefined;
// symbols.tsx
export interface SymbolProps { w: number; d: number; lineUnit: number; stroke: string; fill: string }
export type SymbolComponent = (p: SymbolProps) => JSX.Element; // draws centered at (0,0), local axes, back side = -y
export const SYMBOLS: Record<string, SymbolComponent>;          // key = catalog id
export function GenericSymbol(p: SymbolProps & { shape: GenericShape; lshape: LShapeParams | null }): JSX.Element;
```

Entrées (id : nom, l x p x h), à reprendre exactement :
- Chambre : `bed-90` Lit 90 x 190 x 50 ; `bed-140` Lit 140 x 190 x 50 ; `bed-160` Lit 160 x 200 x 50 ; `bed-180` Lit 180 x 200 x 50 ; `nightstand` Table de nuit 45 x 40 x 50 ; `wardrobe` Armoire 120 x 60 x 200 ; `dresser` Commode 100 x 50 x 85 ; `crib` Berceau 60 x 120 x 90.
- Séjour : `sofa-2` Canapé 2 places 160 x 90 x 85 ; `sofa-3` Canapé 3 places 210 x 95 x 85 ; `sofa-corner` Canapé d'angle 250 x 200 x 85 ; `armchair` Fauteuil 80 x 85 x 85 ; `coffee-table` Table basse 110 x 60 x 40 ; `tv-unit` Meuble TV 160 x 45 x 50 ; `bookcase` Bibliothèque 100 x 35 x 200 ; `display-cabinet` Vitrine 100 x 45 x 180.
- Bureau et repas : `desk` Bureau 140 x 70 x 75 ; `chair` Chaise 45 x 50 x 90 ; `table-rect` Table rectangulaire 160 x 90 x 75 ; `table-round` Table ronde 110 x 110 x 75.
- Cuisine : `counter` Plan de travail 120 x 60 x 90 ; `sink` Évier 80 x 60 x 90 ; `cooktop` Plaque de cuisson 60 x 60 x 90 ; `fridge` Réfrigérateur 60 x 65 x 180 ; `dishwasher` Lave-vaisselle 60 x 60 x 85.
- Salle de bain : `wc` WC 40 x 65 x 80 ; `washbasin` Lavabo 60 x 45 x 85 ; `shower` Douche 90 x 90 x 200 ; `bathtub` Baignoire 170 x 75 x 60 ; `washing-machine` Lave-linge 60 x 60 x 85.
- Structure : `stairs-straight` Escalier droit 90 x 300 x 270 ; `stairs-quarter` Escalier quart tournant 90 x 250 x 270.
- Génériques : `generic-rect` Rectangle 100 x 60 x 75 ; `generic-circle` Cercle 80 x 80 x 75 ; `generic-lshape` Forme en L 200 x 150 x 90 (encoche 120 x 90).

Symboles (vus de dessus, dos de l'objet du côté `-y`, traits `strokeWidth = lineUnit`) : lit = cadre + oreiller(s) côté dos (1 pour 90, 2 sinon) + rabat de couette en diagonale ; armoire = cadre + ligne de portes + diagonales en pointillé ; canapé = assise + dossier côté dos + accoudoirs ; fauteuil idem ; chaise = assise + dossier ; table ronde = cercle ; tables = cadre ; bureau = cadre + retrait de chaise en pointillé ; bibliothèque/vitrine = cadre + étagères (vitrine : double trait vitré côté face) ; évier = cuve arrondie + robinet ; plaque = 4 cercles ; frigo et électroménager = cadre + étiquette textuelle courte ("Frigo", "LV", "LL") ; WC = réservoir + cuvette ovale ; lavabo = vasque ovale ; douche = cadre + diagonales + bonde ; baignoire = cadre + intérieur arrondi ; escalier droit = marches (une ligne tous les 25 cm) + flèche de montée ; quart tournant = marches droites puis rayonnantes. Les cercles et ellipses sont calculés à partir de `w` et `d` (jamais de transform `scale`).

- [ ] **Step 1: Tests** : chaque entrée a un symbole dans `SYMBOLS` (sauf les génériques qui utilisent `GenericSymbol`) ; ids uniques ; toutes les dimensions > 0 ; les noms ne contiennent aucun caractère interdit (regex `/[\u2014\u2013\u2026\u00a0\u00d7\u2018\u2019\u201c\u201d\u2192]/`) ; rendu `renderToStaticMarkup` de chaque symbole avec w=100, d=50 ne lève pas d'erreur et ne contient pas `NaN` (`react-dom/server` est disponible via react-dom).
- [ ] **Step 2:** implémenter ; verts ; commit `feat(catalog): add furniture catalog with parametric plan symbols`.

---

### Task 11: Store de l'éditeur, maths de vue, sauvegarde automatique

**Files:**
- Create: `src/editor/store.ts`, `src/editor/view.ts`, `src/editor/selection.ts`, `src/storage/autosave.ts`
- Test: `tests/editor/store.test.ts`, `tests/editor/view.test.ts`, `tests/storage/autosave.test.ts`

**Interfaces:**
- Produces:

```ts
// view.ts
export interface View { pxPerCm: number; tx: number; ty: number } // screen = world * pxPerCm + t
export const MIN_ZOOM = 0.05, MAX_ZOOM = 20;
export function worldToScreen(v: View, p: Vec2): Vec2;
export function screenToWorld(v: View, p: Vec2): Vec2;
export function zoomAt(v: View, screenPoint: Vec2, factor: number): View; // keeps the world point under the cursor fixed; clamps zoom
export function fitView(bounds: { minX; minY; maxX; maxY } | null, viewport: { width: number; height: number }, margin = 40): View;
// null or degenerate bounds -> default view: pxPerCm 1, world (0,0) at viewport center. Never returns NaN/Infinity.
// selection.ts
export interface SelectionItem { kind: HitKind; id: Id }
export function pruneSelection(sel: SelectionItem[], level: Level | undefined, rooms: Room[]): SelectionItem[];
// store.ts
export type ToolId = 'select' | 'wall' | 'rect' | 'door' | 'window' | 'dimension' | 'calibrate';
export interface Overlay {
  guides: Guide[]; previewInvalid: boolean;
  dynamicDims: DimLine[]; activeDimIndex: number | null;
  numericInput: { value: string; screen: Vec2 } | null;
  marquee: { a: Vec2; b: Vec2 } | null;
  ghost: unknown; // tool-specific preview payload, typed by each tool
}
export interface EditorState {
  project: Project | null;
  history: History;
  activeLevelId: Id | null;
  selection: SelectionItem[];
  tool: ToolId;
  view: View;
  gesture: { base: Project; label: string; last: Project } | null;
  overlay: Overlay;
  display: { dimMode: 'all' | 'manual' | 'none'; showLowerLevel: boolean; showGrid: boolean };
  clipboard: PlacedObject[];
  toast: { message: string; id: number } | null;
  // actions
  openProject(p: Project): void;                    // resets history, selection, gesture; activeLevelId = first level
  closeProject(): void;
  execute(label: string, recipe: Recipe): boolean;  // applyCommand + pushEntry; on refusal -> toast(error), returns false
  beginGesture(label: string): void;
  updateGesture(recipe: Recipe): boolean;            // applies recipe to gesture.base; success -> project = result, last = result, previewInvalid false; refusal -> project = last valid, previewInvalid true
  commitGesture(): void;                            // pushes ONE history entry computed from base to last (via applyCommand(base, draft => replace with last)) ; no-op if unchanged
  cancelGesture(): void;                            // project = base
  undo(): void; redo(): void;                       // then prune selection and fix activeLevelId
  setTool(t: ToolId): void;                         // cancels gesture, clears overlay
  setSelection(s: SelectionItem[]): void;
  setActiveLevel(id: Id): void;                     // clears selection
  setView(v: View): void;
  setOverlay(p: Partial<Overlay>): void;
  setDisplay(p: Partial<EditorState['display']>): void;
  showToast(message: string): void;
}
export const useEditor: UseBoundStore<StoreApi<EditorState>>;
export function createEditorStore(): UseBoundStore<StoreApi<EditorState>>; // for tests
export function activeLevel(s: EditorState): Level | undefined;
// autosave.ts
export type SaveStatus = { state: 'idle' | 'saving' | 'saved' } | { state: 'error'; message: string };
export function startAutosave(store: ReturnType<typeof createEditorStore>, saver: (p: Project) => Promise<void>,
  onStatus: (s: SaveStatus) => void, delayMs = 500): () => void; // returns unsubscribe
// debounced on project identity change; if the project id changes before the timer fires, the pending save of the
// previous project is flushed immediately (never saves project A's content under project B, never drops A's last edit)
```

`commitGesture` : le geste conserve `lastRecipe` (la dernière recette acceptée par `updateGesture`). Au commit, `applyCommand(base, lastRecipe)` produit les patches et l'inverse de l'entrée d'historique unique (le type de `gesture` inclut donc `lastRecipe: Recipe | null`). Aucun `updateGesture` accepté -> rien n'est ajouté à l'historique.

- [ ] **Step 1: Tests `view`** : `screenToWorld(worldToScreen(p)) == p` ; `zoomAt` garde le point sous le curseur ; zoom borné à `MAX_ZOOM` ; `fitView(null, ...)` et `fitView({minX:0,minY:0,maxX:0,maxY:0}, ...)` -> valeurs finies, zoom 1.
- [ ] **Step 2: Tests `store`** :
  - `execute` d'une recette valide -> historique +1 ; refus -> `toast.message` = message d'erreur, projet inchangé ;
  - geste : `beginGesture`, 3 `updateGesture` successifs (déplacement cumulatif depuis la base), `commitGesture` -> une seule entrée ; `undo` -> retour exact à la base ;
  - geste avec une mise à jour refusée -> `previewInvalid` vrai et projet = dernier état valide ;
  - `cancelGesture` -> projet = base, historique inchangé ;
  - **`prunes selection and active level after undo`** (Review Focus 2) : ajouter un niveau via `execute` puis le rendre actif et y sélectionner un objet ajouté ; `undo` deux fois -> `activeLevelId` désigne un niveau existant et la sélection ne contient plus l'objet.
- [ ] **Step 3: Tests `autosave`** (timers factices `vi.useFakeTimers()`) : 3 modifications rapides -> 1 sauvegarde après 500 ms ; changement de projet avant le délai -> le projet A est sauvegardé immédiatement avec sa dernière version, puis B après délai ; un `saver` qui rejette -> statut `error` avec le message.
- [ ] **Step 4:** implémenter ; verts ; commit `feat(editor): add editor store with gestures, view math and autosave`.

---

### Task 12: Rendu SVG du plan

**Files:**
- Create: `src/render/PlanSvg.tsx`, `src/render/layers/BackgroundLayer.tsx`, `GridLayer.tsx`, `LowerLevelLayer.tsx`, `RoomsLayer.tsx`, `ObjectsLayer.tsx`, `WallsLayer.tsx`, `OpeningsLayer.tsx`, `DimensionsLayer.tsx`, `src/render/DimLineView.tsx`, `src/render/style.ts`
- Test: `tests/editor/render.test.tsx`

**Interfaces:**
- Consumes: `deriveLevel`, `computeAutoDimensions`, `resolveAnchor`, catalogue, `formatLength`, `formatArea`.
- Produces:

```tsx
export interface PlanSvgProps {
  project: Project; level: Level;
  lowerLevel?: Level | null;                 // ghost
  viewBox: { x: number; y: number; width: number; height: number }; // world cm
  lineUnit: number;                          // world cm per display pixel
  dimMode: 'all' | 'manual' | 'none';
  showGrid: boolean;
  mode: 'screen' | 'print';
  imageUrls: Record<Id, string>;             // background imageId -> URL (object URL on screen, data URL in export)
  selection?: SelectionItem[];               // screen only, highlights
  overlay?: React.ReactNode;                 // screen only, rendered last
  width?: number | string; height?: number | string;
}
export function PlanSvg(p: PlanSvgProps): JSX.Element;
// style.ts: colors and sizes in display px (multiplied by lineUnit): wallFill '#3a3a3a', roomFill '#f4efe6', text 12, dimText 11, etc.
```

Couches dans l'ordre de la spec (8). Chaque élément porte `data-kind` et `data-id` (utile aux tests et au débogage ; la sélection reste calculée par `hitTest`). Murs : un seul `<path fillRule="evenodd">` construit depuis `shapeWithOpenings`. Ouvertures : symboles par variante (porte battante : ligne de vantail de longueur `width` depuis le gond + arc d'un quart de cercle en pointillé ; double : deux vantaux de `width/2` ; coulissante : deux traits décalés dans l'épaisseur ; galandage : un trait + pointillé dans le mur ; fenêtres : deux traits parallèles fins sur les faces du mur + un trait central, battants avec arcs plus petits côté `swing`; fixe : trait central seul ; passage : rien que l'ouverture). Objets : `<g transform="translate(x y) rotate(r) scale(mirrored ? -1 : 1, 1)">` puis symbole ; couleur de remplissage `color` à 35 % d'opacité. Texte : `fontSize = 12 * lineUnit`, centré, jamais tourné à l'envers (pour les cotes : si l'angle est dans ]90°, 270°], inverser le sens). Mode `print` : pas de grille, pas de sélection, pas d'`overlay`.

- [ ] **Step 1: Test** (`render.test.tsx`, environnement node, `renderToStaticMarkup`) : projet avec une pièce, une porte, un lit, une cote manuelle et une étiquette "Chambre" -> le balisage contient `data-kind="wall-shape"`, `data-kind="opening"`, `data-kind="object"`, `data-kind="dimension"`, `Chambre`, `m²`, aucune occurrence de `NaN` ; avec `dimMode: 'none'` -> aucune cote ; `mode: 'print'` -> pas de `data-kind="grid"`.
- [ ] **Step 2:** implémenter ; vert ; commit `feat(render): render plan layers as svg in centimeters`.

---

### Task 13: Coque de l'application (accueil, éditeur, panneaux)

**Files:**
- Create: `src/App.tsx` (remplacé), `src/ui/HomeScreen.tsx`, `EditorScreen.tsx`, `Toolbar.tsx`, `PropertiesPanel.tsx`, `LevelTabs.tsx`, `CatalogPanel.tsx`, `SettingsDialog.tsx`, `Banner.tsx`, `Toast.tsx`, `NumericInput.tsx`, `ConfirmDialog.tsx`, `src/styles.css`
- Test: `tests/e2e/shell.spec.ts`, `tests/editor/numeric-input.test.ts`

**Interfaces:**
- Consumes: store, `ProjectStore`, `startAutosave`, commandes, `PlanSvg`, catalogue, `parseImport`, `prepareImportedProject`, `serializeExport`, `files.ts`.
- Produces: `EditorScreen` rend `<PlanSvg>` dans un conteneur `data-testid="plan-canvas"` qui expose les événements pointeur à la Task 14 via `src/editor/tools/types.ts` (créé ici, vide d'outils) :

```ts
export interface ToolContext {
  store: ReturnType<typeof createEditorStore>;
  toWorld(screen: Vec2): Vec2;
  pxPerCm(): number;
}
export interface PointerInfo { world: Vec2; screen: Vec2; button: number; shift: boolean; alt: boolean; meta: boolean; detail: number }
export interface Tool {
  id: ToolId;
  cursor: string;
  onPointerDown?(e: PointerInfo, c: ToolContext): void;
  onPointerMove?(e: PointerInfo, c: ToolContext): void;
  onPointerUp?(e: PointerInfo, c: ToolContext): void;
  onDoubleClick?(e: PointerInfo, c: ToolContext): void;
  onKeyDown?(e: KeyboardEvent, c: ToolContext): boolean; // true = handled
  onDeactivate?(c: ToolContext): void;
}
export const TOOLS: Partial<Record<ToolId, Tool>>; // filled by later tasks
// NumericInput.tsx
export function NumericInput(p: { label: string; valueCm: number; onCommit(v: number): void; testId?: string }): JSX.Element;
// commits on Enter/blur using parseCmInput; invalid -> red border, reverts on Escape, never calls onCommit with invalid values
```

Écrans :
- **Accueil** (`HomeScreen`) : titre "Plan Maison", bouton "Nouveau projet" (demande un nom, défaut "Mon logement"), liste des projets (nom, date "modifié le 07/10/2026 14:30", nombre de niveaux), actions par projet : Ouvrir, Renommer, Dupliquer (nom + " - variante", images copiées avec de nouveaux ids), Exporter (`.json`, nom via `sanitizeFileName` de Task 18 : en attendant, créer `src/export/fileName.ts` ici avec `sanitizeFileName(name: string): string` qui retire `/\\:*?"<>|` et les caractères de contrôle, remplace les espaces multiples par un seul, coupe à 80 caractères, renvoie `plan` si vide), Supprimer (confirmation). Bouton "Importer un projet" (input file `.json`) : erreurs affichées dans un bandeau, rien n'est importé en cas d'erreur.
- **Éditeur** (`EditorScreen`) : en-tête (nom du projet éditable, bouton "Projets" retour accueil, boutons Annuler/Rétablir, menu affichage des cotes : "Toutes les cotes", "Cotes manuelles", "Aucune cote", case "Niveau inférieur en filigrane", case "Grille", bouton "Réglages", bouton "Exporter" (dialogue en Task 18), statut de sauvegarde : "Enregistré" / "Enregistrement..." / bandeau rouge persistant "La sauvegarde a échoué : <message>. Exportez votre projet en .json pour ne rien perdre." avec bouton d'export).
- **Barre d'outils** (gauche) : Sélection (V), Mur (M), Pièce rectangulaire (R), Porte (P), Fenêtre (F), Cote (C) ; info-bulle avec raccourci ; outil actif surligné ; `data-testid="tool-<id>"`.
- **Onglets de niveaux** (bas) : un onglet par niveau dans l'ordre bas -> haut, clic = niveau actif, double-clic = renommer, menu contextuel ou bouton "..." : Ajouter au-dessus, Ajouter en dessous, Dupliquer (variante), Monter, Descendre, Supprimer (confirmation). `data-testid="level-tab-<index>"`.
- **Panneau de propriétés** (droite) selon la sélection : rien -> propriétés du niveau (nom, altitude, hauteur sous plafond) ; mur -> longueur (avec choix du point fixe : début/fin), épaisseur, hauteur ; ouverture -> type, variante, largeur, hauteur, allège, côté des gonds, sens d'ouverture ; objet -> nom, largeur, profondeur, hauteur, hauteur de pose, rotation, couleur, miroir, et pour un générique : forme en L (encoche), bouton "Enregistrer dans mes objets" ; pièce -> nom et surface (lecture seule) ; cote -> valeur (lecture seule), décalage ; sélection multiple -> nombre d'éléments et bouton Supprimer. Tous les champs numériques utilisent `NumericInput` et passent par `execute`.
- **Catalogue** (panneau repliable à droite ou à gauche) : catégories repliables, recherche par nom, section "Mes objets" (définitions du projet, suppression possible), éléments glissables vers le plan (HTML5 drag & drop, `dataTransfer` = `catalog:<id>` ou `custom:<id>` ; au dépôt : `addObject` au point monde, puis `snapObjectToWalls`) ; clic sur un élément = pose au centre de la vue.
- **Réglages** : épaisseur des murs, épaisseur des cloisons, hauteur sous plafond, pas de grille.
- En développement uniquement (`import.meta.env.DEV`), exposer `window.__planMaison = { store: useEditor, projectStore }` pour les tests e2e.
- Chargement des images de fond : `EditorScreen` crée des object URLs pour les images du projet (via `ProjectStore.listImages`) et les révoque à la fermeture.
- Le zoom/pan de base (molette, espace + glisser, clic du milieu, touche 0) est implémenté ici sur le conteneur, en utilisant `zoomAt` et `fitView` ; `lineUnit = 1 / view.pxPerCm`.

- [ ] **Step 1: Test `numeric-input`** (logique pure extraite : `commitNumeric(text): { ok: true; value } | { ok: false }` dans `NumericInput.tsx` exportée) : `'350'` -> 350 ; `''`, `'0'`, `'-2'`, `'abc'` -> refus (**Review Focus 5** : nommer `parseCmInput` dans le titre du `describe`).
- [ ] **Step 2: e2e `shell.spec.ts`** : créer un projet "Test", il apparaît dans l'éditeur avec l'onglet "RDC" ; retour aux projets -> il est listé ; recharger la page -> toujours listé (persistance) ; ajouter un niveau au-dessus -> 2 onglets ; dupliquer le projet -> "Test - variante" listé ; exporter le projet (intercepter le téléchargement, vérifier `"app": "plan-maison"`), le supprimer, le réimporter -> listé ; importer un fichier texte invalide -> bandeau d'erreur visible et aucun nouveau projet.
- [ ] **Step 3:** implémenter ; `npm test`, `npm run typecheck`, `npm run e2e` verts ; ouvrir l'app (`npm run dev`) et vérifier visuellement l'écran d'accueil et l'éditeur vide (capture d'écran dans le rapport) ; commit `feat(ui): add home screen, editor layout, panels and persistence wiring`.

---

### Task 14: Interactions de base et outil Sélection

**Files:**
- Create: `src/editor/tools/selectTool.ts`, `src/editor/keyboard.ts`, `src/render/OverlayLayer.tsx`
- Modify: `src/editor/tools/types.ts` (enregistrer l'outil), `src/ui/EditorScreen.tsx` (brancher pointeur, clavier, overlay)
- Test: `tests/editor/keyboard.test.ts`, `tests/e2e/select.spec.ts`

**Interfaces:**
- Produces:

```ts
// keyboard.ts
export function isTypingTarget(t: EventTarget | null): boolean; // input, textarea, select, [contenteditable]
export function handleGlobalKey(e: KeyboardEvent, store, ctx: ToolContext): boolean;
// order: if isTypingTarget(e.target) -> return false (do nothing). Then active tool onKeyDown. Then globals:
// V/M/R/P/F/C tools; Escape -> tool cancel / clear selection; Delete/Backspace -> delete selection;
// Mod+Z undo, Mod+Shift+Z and Mod+Y redo; Mod+C copy objects; Mod+V paste (+20,+20); Mod+D duplicate (+20,+20);
// arrows nudge selection 1 cm (10 with Shift) as one history entry per key press; '0' fit view. Mod = metaKey on mac, ctrlKey otherwise.
export function deleteSelection(store): void; // walls -> deleteWalls, openings, objects, dimensions; rooms -> renameRoom(..., '') is NOT deletion: ignore rooms
```

Outil Sélection :
- clic sur un élément : sélection (Maj = ajout/retrait) ; clic dans le vide : sélection vidée ; glisser dans le vide : rectangle de sélection (`hitTestRect`).
- glisser un objet : geste `moveObjects` recalculé depuis la base avec le delta total, puis magnétisme mur (`snapObjectToWalls`) si un seul objet ; Alt désactive le magnétisme ; cotes dynamiques (`objectClearances`) affichées en overlay.
- glisser un nœud (survol d'un nœud de mur sélectionné ou non) : `moveNodes` avec `snapPoint` (en excluant ce nœud) ; au relâchement sur un autre nœud -> `mergeNode`.
- glisser un mur : `moveWalls` avec le delta (magnétisme grille sur le delta).
- glisser une ouverture : `moveOpening` (projection sur le mur survolé le plus proche, sinon le mur d'origine), cotes dynamiques `openingClearances`.
- glisser une cote : `setDimensionOffset`.
- poignées sur un objet sélectionné seul : rotation (au-dessus du dos, pas de 15°, libre avec Alt) et redimensionnement (4 coins + 4 milieux, côté opposé fixe, minimum 1 cm).
- double-clic dans une pièce : ouvre un champ de renommage (input positionné à l'écran, Entrée valide via `renameRoom`, Échap annule).
- l'overlay dessine : sélection (contour bleu), poignées, rectangle de sélection, guides, cotes dynamiques, aperçus invalides en rouge.

- [ ] **Step 1: Test `keyboard guard`** (Review Focus 1, `keyboard.test.ts`) : avec un faux événement dont `target` est un `HTMLInputElement` simulé (`{ tagName: 'INPUT' }`), `handleGlobalKey` pour `m`, `Delete`, `Backspace`, `Meta+z` renvoie `false` et ne change ni l'outil, ni la sélection, ni l'historique. Même chose pour `TEXTAREA` et un élément `isContentEditable`.
- [ ] **Step 2: e2e `select.spec.ts`** : créer un projet, poser une pièce via `execute` exposé en dev (`window.__planMaison = { store }` uniquement si `import.meta.env.DEV`), poser un lit depuis le catalogue (clic), le sélectionner par clic, le déplacer par glisser (la position change), Cmd/Ctrl+Z -> position d'origine, Suppr -> lit supprimé, rectangle de sélection autour de deux objets -> panneau "2 éléments sélectionnés" ; double-cliquer dans la pièce, taper "Mezzanine" puis Entrée -> l'outil actif est toujours Sélection et la pièce affiche "Mezzanine".
- [ ] **Step 3:** implémenter ; tests verts ; vérification visuelle (sélection, poignées, cotes dynamiques pendant un déplacement) ; commit `feat(editor): add selection tool, keyboard shortcuts and overlay`.

---

### Task 15: Outils Mur et Pièce rectangulaire, saisie numérique

**Files:**
- Create: `src/editor/tools/wallTool.ts`, `src/editor/tools/rectRoomTool.ts`, `src/ui/NumericOverlayInput.tsx`
- Modify: `src/editor/tools/types.ts`, `src/render/OverlayLayer.tsx`, `src/ui/EditorScreen.tsx`
- Test: `tests/editor/wallTool.test.ts`, `tests/e2e/walls.spec.ts`

**Interfaces:**
- Produces: outils `wall` et `rect` enregistrés dans `TOOLS`.

Comportement de l'outil Mur :
- état `idle` : survol -> aperçu du point aimanté (`snapPoint`, sans `from`).
- 1er clic -> état `drawing` avec `points: WallPoint[]` (un `SnapResult` de kind `node` -> `{kind:'node'}`, `wallAxis`/`wallMid` -> `{kind:'onWall'}`, sinon `free`).
- survol en `drawing` -> aperçu du segment (épaisseur = défaut du projet), cote dynamique de longueur et angle, `snapPoint` avec `from` = dernier point ; Maj = ortho ; Alt = sans aimant.
- clic -> ajoute un point ; clic sur le premier point (kind `node` égal au premier nœud, ou distance < tolérance du premier point libre) -> ferme et termine.
- double-clic ou Entrée -> termine ; Échap -> termine si >= 2 points, sinon annule.
- Terminer = un seul `execute('Tracer des murs', addWallChain(...))`.
- Saisie numérique : en `drawing`, une touche chiffre ouvre `NumericOverlayInput` près du curseur, prérempli avec la touche ; Entrée -> point = dernier point + direction courante (vers le curseur aimanté) * valeur ; Échap ferme le champ. La direction est celle de l'aperçu au moment de l'ouverture du champ.
- L'épaisseur utilisée est `settings.defaultWallThickness` ; Ctrl/Cmd maintenu pendant le tracé utilise `settings.partitionThickness` (indiqué dans l'aperçu).

Outil Pièce rectangulaire : appui -> coin A aimanté, glisser -> aperçu + cotes largeur/hauteur, relâchement -> `addRectRoom` ; saisie numérique : taper une valeur pendant le glisser fixe la largeur, Tab passe à la hauteur, Entrée valide.

La logique de chaque outil est écrite sous forme de machine à états pure testable (fonction `reduceWallTool(state, event, ctx) -> { state, effects }` ou équivalent) ; le branchement DOM reste mince.

- [ ] **Step 1: Test unitaire `wallTool`** : séquence clic (0,0), clic (400,0), clic (400,300), clic (0,300), clic (0,0) -> une commande `addWallChain` avec 5 points dont le dernier référence le premier nœud ; séquence clic (0,0) puis saisie "350" + Entrée avec curseur vers la droite -> point (350,0).
- [ ] **Step 2: e2e `walls.spec.ts`** : outil Mur, tracer un rectangle d'axes 400x300 au clavier (clic de départ, saisies 400 / 300 / 400 dans les bonnes directions, clic de fermeture sur le point de départ) -> une pièce affichant "10,64 m²" (intérieur 3,80 x 2,80 avec des murs de 20) ; outil Pièce rectangulaire -> un glisser crée 4 murs ; Cmd/Ctrl+Z annule toute la pièce en une fois.
- [ ] **Step 3:** implémenter ; verts ; vérification visuelle (jonctions, aperçu, guides) ; commit `feat(editor): add wall and rectangular room tools with numeric input`.

---

### Task 16: Outils Porte/Fenêtre, Cote, cotes dynamiques au clavier

**Files:**
- Create: `src/editor/tools/openingTool.ts`, `src/editor/tools/dimensionTool.ts`
- Modify: `src/editor/tools/selectTool.ts` (Tab + saisie de distance pendant un déplacement), `src/editor/tools/types.ts`, `src/render/OverlayLayer.tsx`
- Test: `tests/editor/openingTool.test.ts`, `tests/e2e/openings-dims.spec.ts`

**Comportement :**
- **Porte (P) / Fenêtre (F)** : survol d'un mur (`hitTest` kind `wall`, ou distance à l'axe < épaisseur/2 + tolérance) -> aperçu de l'ouverture par défaut centrée sur la projection du curseur, recalée pour tenir dans le mur, côté d'ouverture = côté du curseur par rapport à l'axe ; aperçu rouge si pas de place ; clic -> `addOpening`. L'outil reste actif (poses successives). Cotes dynamiques `openingClearances` pendant le survol.
- **Cote (C)** : clic 1 et clic 2 aimantés (nœud -> ancre `node` ; coin d'objet à moins de la tolérance -> ancre `objectCorner` ; sinon `point`), puis mouvement pour le décalage, clic 3 -> `addDimension`. Échap annule.
- **Saisie de distance pendant un déplacement d'objet ou d'ouverture** (outil Sélection) : pendant le glisser, Tab sélectionne la cote dynamique suivante (`activeDimIndex`), une touche chiffre ouvre `NumericOverlayInput` ; Entrée -> `placeAtClearance` (objet) ou nouvel offset (ouverture) appliqué dans le geste puis `commitGesture`. Aussi disponible sans glisser : objet sélectionné seul + Tab affiche ses dégagements et permet la saisie (geste ouvert puis validé).

- [ ] **Step 1: Test unitaire** : la position d'aperçu d'une porte survolant un mur de 300 à 20 cm de son début est recalée à offset = 41,5 (83/2) ; survol d'un mur de 60 cm -> aperçu invalide.
- [ ] **Step 2: e2e** : poser une porte sur un mur d'une pièce -> la porte apparaît (`data-kind="opening"`) et la cote automatique "0,83 m" est visible ; poser une fenêtre ; poser une cote manuelle entre deux nœuds -> libellé correct ; poser un lit, le déplacer, Tab, taper 60, Entrée -> le dégagement affiché vaut "0,60 m".
- [ ] **Step 3:** implémenter ; verts ; vérification visuelle (symboles de portes et fenêtres de chaque variante via le panneau de propriétés) ; commit `feat(editor): add door, window and dimension tools with typed clearances`.

---

### Task 17: Image de fond à décalquer

**Files:**
- Create: `src/editor/tools/calibrateTool.ts`, `src/ui/BackgroundPanel.tsx`
- Modify: `src/ui/EditorScreen.tsx`, `src/ui/PropertiesPanel.tsx` (section "Image de fond" quand rien n'est sélectionné)
- Test: `tests/editor/calibrate.test.ts`, `tests/e2e/background.spec.ts`, fixture `tests/e2e/fixtures/plan.png` (générer une image 800x600 avec un trait de 400 px, via un script node ou `magick`)

**Comportement :**
- "Importer une image de fond" (PNG/JPEG) : lecture du fichier, `imageSize`, `putImage` (nouvel id), `setBackground` avec `scale = 1` cm/px, position telle que l'image est centrée sur la vue, opacité 0,5, non verrouillée, visible. Image illisible -> toast "Image illisible", rien n'est modifié.
- "Mettre à l'échelle" : active l'outil `calibrate` : deux clics sur l'image (sans aimant) puis saisie d'une longueur en cm (`NumericOverlayInput`, Entrée) -> `updateBackground` avec `scale = scale * (valeur / distanceMonde)` et position ajustée pour que le premier point cliqué reste fixe à l'écran.
- Réglages : opacité (curseur 0-100 %), verrouiller, masquer, rotation (degrés), supprimer l'image (confirmation ; l'image est supprimée du stockage au prochain `deleteUnreferencedImages`, appelé après chaque sauvegarde).
- Déplacement : bouton "Déplacer l'image" (désactivé si l'image est verrouillée) qui active un mode où le glisser déplace l'image ; Échap ou bouton "Terminer" sort du mode.

Fonction pure testée : `calibrateBackground(bg: Background, p1: Vec2, p2: Vec2, realCm: number): Background` (dans `calibrateTool.ts`).

- [ ] **Step 1: Test** : fond `scale 1`, `x=0,y=0`, points (0,0) et (400,0), valeur 800 -> `scale 2`, `x=0,y=0` ; points (100,100) et (300,100), valeur 100 -> `scale 0,5` et le point (100,100) reste au même endroit monde ; `realCm <= 0` -> lève une erreur (l'UI ne l'appelle jamais avec une valeur invalide).
- [ ] **Step 2: e2e** : importer `plan.png`, calibrer sur le trait de 400 px en saisissant 400 -> l'image mesure 800 cm de large (vérifier `background.scale` via `window.__planMaison`) ; recharger -> l'image est toujours affichée.
- [ ] **Step 3:** implémenter ; verts ; vérification visuelle ; commit `feat(editor): add tracing background image with calibration`.

---

### Task 18: Export PNG et PDF à l'échelle

**Files:**
- Create: `src/export/pageLayout.ts`, `src/export/png.ts`, `src/export/pdf.ts`, `src/ui/ExportDialog.tsx`
- Modify: `src/export/fileName.ts` (créé en Task 13), `src/ui/EditorScreen.tsx`
- Test: `tests/export/pageLayout.test.ts`, `tests/export/fileName.test.ts`, `tests/e2e/export.spec.ts`

**Interfaces:**

```ts
// pageLayout.ts (pure)
export type PaperFormat = 'A4' | 'A3';
export type Orientation = 'portrait' | 'landscape';
export const SCALES = [20, 50, 100, 200] as const;
export interface PageSpec { format: PaperFormat; orientation: Orientation; scale: number }
export function pageSizeMm(format: PaperFormat, o: Orientation): { width: number; height: number }; // A4 210x297, A3 297x420
export const MARGIN_MM = 10, TITLE_BLOCK_MM = { width: 70, height: 28 };
export function drawableAreaMm(spec: PageSpec): { width: number; height: number }; // page minus margins minus title block height
export function contentSizeMm(boundsCm: { minX; minY; maxX; maxY }, scale: number): { width: number; height: number }; // cm * 10 / scale
export function fits(boundsCm, spec: PageSpec): boolean;
export function suggestScale(boundsCm, format: PaperFormat, o: Orientation): number | null; // smallest denominator in SCALES that fits, null if none
export function levelBounds(level: Level, d: DerivedLevel, marginCm = 60): { minX; minY; maxX; maxY } | null; // walls, objects, dimensions, background excluded
export function printLineUnit(scale: number): number; // 0.25 mm on paper in world cm = 0.025 * scale
// fileName.ts
export function sanitizeFileName(name: string): string;
export function exportFileName(projectName: string, levelName: string, ext: 'pdf' | 'png' | 'json'): string; // "<projet> - <niveau>.pdf", sanitized
// pdf.ts / png.ts (browser)
export async function exportPdf(args: { project: Project; level: Level; spec: PageSpec; imageDataUrls: Record<Id, string>; date: Date; dimMode }): Promise<Blob>;
export async function exportPng(args: { project: Project; level: Level; resolution: 1 | 2 | 4; imageDataUrls: Record<Id, string>; dimMode }): Promise<Blob>;
```

PDF : jsPDF en mm, page selon `spec` ; rendre `<PlanSvg mode="print" lineUnit={printLineUnit(scale)} viewBox={bounds}>` en chaîne (`renderToStaticMarkup`), le parser (`DOMParser`) et le placer avec `svg2pdf(svgElement, doc, { x: MARGIN_MM, y: MARGIN_MM, width: content.width, height: content.height })` ; cartouche en bas à droite (cadre, nom du projet, niveau, "Échelle 1/50", date "07/10/2026") dessiné avec l'API jsPDF ; barre d'échelle graphique (segments de 1 m alternés noir/blanc sur 5 m à 1/100, 2 m à 1/20...) à gauche du cartouche. Police standard `helvetica` (encodage WinAnsi : accents français et `²` supportés). Le texte du SVG utilise `font-family="Helvetica, Arial, sans-serif"`.

PNG : même SVG en chaîne, `pxPerCm = 1 * resolution` (1 px = 1 cm à 1x), `Image` depuis un Blob SVG, `canvas.toBlob('image/png')`, fond blanc. Les images de fond sont passées en data URL.

Dialogue : format, orientation, échelle (1/20, 1/50, 1/100, 1/200), niveau (par défaut l'actif), case "inclure les cotes selon l'affichage courant" ; si `!fits` -> message "Le plan ne tient pas sur cette page à l'échelle 1/50. Échelle conseillée : 1/100." avec bouton "Utiliser 1/100" ; si `suggestScale` est `null` -> "Le plan ne tient pas sur cette page, même au 1/200. Choisissez un format plus grand." ; bouton Exporter désactivé tant que ça ne tient pas. Onglet PNG : résolution 1x/2x/4x.

- [ ] **Step 1: Tests purs** : `pageSizeMm('A4','landscape')` = 297x210 ; `contentSizeMm` d'un plan de 1000 cm à 1/50 = 200 mm ; bornes 1320 x 1020 cm (maison 12 x 9 m + marges de 60) : `fits` A4 paysage 1/50 faux (hauteur 204 mm > 162 mm disponibles = 210 - 2x10 de marges - 28 de cartouche), `suggestScale` A4 paysage -> 100 ; `sanitizeFileName("Maison d'été / RDC")` -> `"Maison d'été - RDC"` (règle : chaque caractère interdit `/\:*?"<>|` et de contrôle est remplacé par `-`, puis les espaces multiples sont compactés et le résultat est rogné) ; `sanitizeFileName('   ')` -> `plan` ; **Review Focus 4** : accents et apostrophe conservés.
- [ ] **Step 2: e2e `export.spec.ts`** : projet "Maison d'été" avec une pièce, une porte et un lit nommé "Lit bébé" ; exporter en PDF A4 1/50 -> téléchargement nommé `Maison d'été - RDC.pdf`, plus de 2 Ko, commençant par `%PDF` ; exporter en PNG -> fichier commençant par la signature PNG (`89 50 4E 47`). Le rendu des accents dans le PDF est contrôlé visuellement en Step 4 (pas d'extraction de texte : aucune dépendance supplémentaire).
- [ ] **Step 3:** implémenter ; verts.
- [ ] **Step 4: Vérification visuelle obligatoire** : générer un PDF d'exemple dans `/tmp`, le convertir en image (`magick -density 100 /tmp/x.pdf /tmp/x.png`) et l'inspecter : murs pleins, portes avec arcs, texte accentué correct ("Maison d'été", "m²", "Échelle"), cartouche lisible, barre d'échelle. Mesurer : à 1/50, une pièce de 4 m doit mesurer 80 mm sur le PDF (largeur en points / 72 * 25,4). Corriger avant de commit.
- [ ] **Step 5:** commit `feat(export): add scaled pdf and png export with title block`.

---

### Task 19: Parcours de bout en bout, finitions, vérification visuelle globale

**Files:**
- Create: `tests/e2e/journey.spec.ts`
- Modify: `README.md`, fichiers nécessitant des corrections trouvées pendant la vérification

**Steps:**
- [ ] **Step 1: e2e `journey.spec.ts`** (le parcours "critère de réussite" de la spec) : nouveau projet "Maison d'été" ; tracer au clavier une pièce 500x400 et une cloison qui la coupe en deux (point de départ aimanté sur le mur) ; vérifier 2 pièces ; renommer "Chambre" et "Bureau" ; poser une porte dans la cloison et une fenêtre en façade ; poser un lit 160, le plaquer contre un mur, saisir 70 cm de dégagement latéral ; poser un objet générique rectangle, le renommer "Piano", l'enregistrer dans "Mes objets" ; ajouter un niveau "Étage", activer le filigrane ; dupliquer le RDC en variante ; annuler/rétablir ; recharger la page -> tout est là ; exporter PDF et JSON.
- [ ] **Step 2:** lancer **toute** la suite : `npm test`, `npm run typecheck`, `npm run build`, `npm run e2e`. Tout doit être vert.
- [ ] **Step 3: Vérification visuelle globale** dans le navigateur (`npm run dev`) : captures de l'accueil, d'un plan meublé à deux pièces, d'un plan avec image de fond, de l'export PDF. Lister et corriger tout défaut visible (chevauchement de textes, cotes illisibles, symbole déformé, jonction imparfaite).
- [ ] **Step 4:** `README.md` final en français : présentation, installation (`npm install`), lancement (`npm run dev`), tests, raccourcis clavier, limites connues de la V1, piste V2 (3D).
- [ ] **Step 5:** commit `test: add end-to-end journey and polish`.
