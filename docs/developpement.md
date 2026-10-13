# Développement

Mansarde est une application web entièrement statique : React et TypeScript, construite avec
Vite, sans serveur ni base de données. Les projets vivent dans le navigateur (IndexedDB).

## Prérequis

- **Node.js 22.12 ou plus récent** (exigé par Vite et Vitest ; la publication utilise Node 24).
- npm.
- Pour les tests de bout en bout : Chromium de Playwright, à installer une fois.
- Pour la conversion du PDF en image pendant la vérification visuelle : `pdftoppm` (paquet
  poppler).

```sh
npm install
npx playwright install chromium   # une seule fois, pour les tests de bout en bout
```

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement sur http://localhost:5173 |
| `npm run build` | Vérification des types (`tsc -b`) puis version statique dans `dist/` |
| `npm run preview` | Sert le contenu de `dist/` |
| `npm test` | Tests unitaires (Vitest) |
| `npm run typecheck` | Vérification des types TypeScript |
| `npm run e2e` | Tests de bout en bout (Playwright, Chromium) |
| `npm run lint` | Analyse statique (oxlint) |

## Tests

### Tests unitaires (Vitest)

Dans `tests/` : `core` (modèle, géométrie, commandes, vérifications, maillages 3D), `editor`
(outils, clavier, rendu, panneaux), `export` (mise en page, noms de fichiers), `storage`
(IndexedDB simulé par `fake-indexeddb`, sauvegarde automatique, migrations) et `deploy`
(construction avec le chemin de publication). Ils tournent sous Node, sans navigateur. Certains
tests de performance mesurent le meilleur de plusieurs passages : sur une machine très chargée,
ils restent sensibles.

### Tests de bout en bout (Playwright)

Dans `tests/e2e/`. Playwright démarre lui-même le serveur de développement, sur le port
`E2E_PORT` (5199 par défaut). Sans `E2E_PORT`, un serveur déjà lancé sur ce port est réutilisé ;
avec `E2E_PORT`, un serveur dédié est démarré, ce qui permet de lancer plusieurs suites en
parallèle.

Deux parcours complets reproduisent un usage réel :

- `tests/e2e/journey.spec.ts` : le plan 2D ;
- `tests/e2e/attic-journey.spec.ts` : la chambre sous les toits (pente, poutre, placard,
  meubles, vérifications, 3D, rechargement, PDF).

### Vérification visuelle

Avec la variable `SHOT_DIR`, deux suites enregistrent des captures d'écran à regarder :

```sh
SHOT_DIR=/tmp/captures E2E_PORT=5219 npx playwright test tests/e2e/visual.spec.ts tests/e2e/attic-journey.spec.ts
```

- `visual.spec.ts` (sautée sans `SHOT_DIR`) : accueil, plan meublé à plusieurs zooms, objet
  sélectionné, fenêtre d'export, PDF produit (converti par `pdftoppm`), image PNG, image de fond,
  chambre sous les toits en 2D et en 3D, catalogue complet en 3D, masquage automatique des murs,
  niveaux inférieurs, disposition Plan + 3D étroite.
- `attic-journey.spec.ts` : plan de la chambre sous les toits, panneau Vérifications, vues 3D
  (ensemble, dessus, depuis la pièce) et Plan + 3D.

Les captures de la documentation (`docs/images/`) viennent de ces deux suites.

## Architecture

| Dossier | Rôle |
|---|---|
| `src/core` | Modèle, géométrie, commandes (annuler / rétablir), persistance, vérifications (`checks`), maillages de la 3D (`mesh`). TypeScript pur : aucune API du navigateur, aucun React. |
| `src/editor` | État de l'éditeur (zustand), outils du plan (`tools`), clavier |
| `src/render` | Rendu SVG du plan, partagé par l'écran et les exports |
| `src/scene3d` | Vue 3D (Three.js) |
| `src/ui` | Écrans et panneaux React |
| `src/catalog` | Catalogue des objets et leurs symboles 2D ; `generated/` : modèles 3D téléchargés (produit par `tools/models`) |
| `src/export` | Exports PNG et PDF (jsPDF, svg2pdf.js) |
| `src/storage` | Stockage IndexedDB (idb), sauvegarde automatique, fichiers |

Principes :

- **Cœur pur** : `src/core` se teste sans navigateur. Les unités du modèle sont le centimètre,
  l'axe Y descend, les rotations sont en degrés dans le sens horaire à l'écran.
- **Commandes** : toute modification du projet passe par une commande de `src/core/commands`.
  Une commande vérifie ses invariants et refuse la modification s'ils ne tiennent pas (le
  projet ne change pas). Elle produit des patches Immer, directs et inverses, qui alimentent
  l'historique ; un geste complet (un glisser, un tracé) fait une seule entrée.
- **Géométrie dérivée** : murs unis, pièces, cotes automatiques, volumes et vérifications sont
  recalculés à partir du niveau et mémorisés par identité d'objet (les niveaux sont immuables).
- **Un seul rendu du plan** : le composant SVG du plan sert à l'écran, en mode impression pour le
  PNG et le PDF (sans grille, sélection ni alertes).
- **3D chargée à la demande** : `src/scene3d` est importé dynamiquement au premier affichage de
  la 3D ; Three.js reste hors du paquet principal (morceau séparé à la construction).

### Identifiants internes

L'application s'appelait auparavant "Plan Maison". Pour garder les projets déjà enregistrés et
les fichiers déjà exportés, les identifiants internes n'ont pas changé : la base IndexedDB
s'appelle `plan-maison` et le champ `"app"` des fichiers `.json` vaut `"plan-maison"`. Le format
de fichier est versionné (`formatVersion`, actuellement 2) ; les projets d'une version antérieure
sont convertis à la lecture (`src/core/persistence/migrate.ts`).

## Publication sur GitHub Pages

Le workflow `.github/workflows/deploy.yml` publie l'application à chaque push sur `main` (ou à la
demande, depuis l'onglet Actions) :

1. installation (`npm ci`, Node 24) ;
2. `npm run build` avec `BASE_PATH=/Mansarde/` (vérification des types puis construction) ;
3. publication de `dist/` par les actions officielles de GitHub Pages.

Les tests ne tournent pas dans ce workflow : les tests de performance dépendent de la machine.
Lancez-les en local avant de pousser.

### Activer Pages

Dans le dépôt GitHub : **Settings > Pages > Build and deployment > Source : GitHub Actions**.
L'application est ensuite disponible à l'adresse https://feltrincyril.github.io/Mansarde/.

Pages sur un dépôt privé demande une offre GitHub payante ; avec l'offre gratuite, le dépôt doit
être public.

### Chemin de publication

Pages sert l'application sous `/<nom-du-dépôt>/`. Vite lit ce chemin dans `BASE_PATH`
(`vite.config.ts`, `/` par défaut). Pour un autre nom de dépôt, adaptez `BASE_PATH` dans le
workflow, ainsi que `tests/deploy/base-path.test.ts`, qui vérifie ce chemin.

Pour tester localement la version publiée :

```sh
BASE_PATH=/Mansarde/ npm run build
npx vite preview --base /Mansarde/
```

Les données ne sont pas publiées avec l'application : chaque navigateur et chaque adresse garde
ses propres projets (voir [Export et sauvegarde](guide/export-et-sauvegarde.md#où-sont-vos-projets)).

## Modèles 3D

Les objets téléchargés (spec [catalogue de modèles 3D](superpowers/specs/2026-10-13-catalogue-modeles-3d-design.md))
sont préparés par un script hors application, avec ses propres dépendances :

```sh
cd tools/models
npm install
npx playwright install chromium   # rendu des icônes
npm run models                    # stage, render, publish
```

- `npm run stage` télécharge les sources (`sources.json`, empreintes figées dans
  `sources.lock.json`), convertit chaque modèle en GLB normalisé dans une boîte unité,
  optimisé (meshopt, textures WebP) et calcule son contour vu de dessus ; résultat dans `stage/`
  (ignoré par git).
- `npm run render` rend des planches de contrôle (`stage/sheets/`).
- `npm run publish` applique la curation (`curation/*.json` : noms, tailles, poses, exclusions),
  rend les icônes et écrit `public/models/` (GLB, icônes, `outlines.json`, licences),
  `src/catalog/generated/` (`models.json`, `credits.json`), `ids.lock` et `report.md`.
  `node publish.ts --sheets` produit aussi les planches de revue (`stage/review/`).

Règles :

- **Ne jamais renommer ni retirer un identifiant publié** (`kn-...`, `ph-...`, `sh-...`) : les
  projets enregistrés le référencent. `ids.lock` en garde la liste et un test l'impose.
- Budgets : GLB de 150 Ko au plus, 10 000 triangles, 8 matières ; contour de 64 points.
- La liste des modèles est dans le paquet principal (environ 31 Ko compressé) ; les contours,
  les crédits et les GLB sont chargés à la demande.

## Conventions

- Code, commentaires et messages de commit : anglais, ASCII.
- Interface : français avec accents ; pas de tiret long, de guillemets typographiques, de
  caractère "points de suspension", de flèche ni de signe de multiplication (on écrit "x").

## Spécifications et décisions

- Spécification V1 (plan 2D) : [docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md](superpowers/specs/2026-10-07-plan-maison-v1-design.md)
- Spécification V2 (3D, pentes, poutres, placards, vérifications) : [docs/superpowers/specs/2026-10-08-plan-maison-v2-design.md](superpowers/specs/2026-10-08-plan-maison-v2-design.md)
- Plans d'implémentation : [V1](superpowers/plans/2026-10-07-plan-maison-v1.md), [V2](superpowers/plans/2026-10-08-plan-maison-v2.md)
- Décisions prises pendant l'implémentation : [V1](superpowers/decisions/2026-10-07-plan-maison-v1-decisions.md), [V2](superpowers/decisions/2026-10-12-plan-maison-v2-decisions.md), [modèles 3D](superpowers/decisions/2026-10-13-catalogue-modeles-3d-decisions.md)
- Spécification et plan du catalogue de modèles 3D : [spec](superpowers/specs/2026-10-13-catalogue-modeles-3d-design.md), [plan](superpowers/plans/2026-10-13-catalogue-modeles-3d.md)

Les spécifications décrivent l'intention ; en cas d'écart, le code fait foi.
