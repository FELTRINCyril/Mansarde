# Catalogue de modèles 3D téléchargés : spécification de conception

Date : 13/10/2026
Statut : choix validés en conversation (13/10/2026), le reste délégué ("fais tout, veille à ce
que l'app reste rapide et utilisable")
Base : specs V1 et V2, toujours valables sauf mention contraire ici.

## 1. Objectif

Passer d'un catalogue de 44 meubles dessinés par le code à plusieurs centaines d'objets, repris
de bibliothèques gratuites existantes plutôt que recréés, sans ralentir l'app ni la rendre plus
compliquée à utiliser.

**Critère de réussite** : le catalogue propose au moins 500 objets nouveaux, chacun posable en 2D
et visible en 3D, redimensionnable comme les autres, couvert par les vérifications, crédité ; le
premier affichage de l'app et l'ouverture du catalogue ne sont pas plus lents qu'avant de façon
perceptible, et un projet de 60 objets téléchargés reste fluide en 3D.

## 2. Choix validés avec l'utilisateur

| Sujet | Choix |
|---|---|
| Intégration | Les 44 meubles actuels restent (paramétriques, sans déformation) ; les objets téléchargés s'ajoutent et s'étirent librement à la taille demandée. |
| Style | Base low-poly (Kenney, Quaternius) complétée par une sélection triée de modèles réalistes (Sweet Home 3D, Poly Haven). |
| Vue 2D | Contour vu de dessus calculé automatiquement depuis le modèle, dessiné au trait et rempli de la couleur de l'objet. |
| Couleur | Couleurs d'origine par défaut ; une couleur choisie par l'utilisateur s'applique à la matière principale. |
| Préparation | Un script prépare tout une fois (approche 1) ; le résultat est versionné ; l'app reste hors ligne. |

## 3. Sources retenues (vérifiées le 13/10/2026, archives ouvertes)

| Source | Contenu brut | Licence | Format |
|---|---|---|---|
| Kenney Furniture Kit 2.0 | 140 modèles (dont ~15 murs, sols, portes écartés) | CC0 | GLB |
| Quaternius Furniture Pack (OpenGameArt) | 23 modèles | CC0 | OBJ |
| Sweet Home 3D 1.9.3 : BlendSwap-CC-0 | 175 | domaine public | SH3F (OBJ + catalogue) |
| Sweet Home 3D : BlendSwap-CC-BY, Scopia, KatorLegaz | 135 + 500 + 90 | CC-BY | SH3F |
| Sweet Home 3D : Contributions, LucaPresidente | 511 + 64 | Free Art License | SH3F |
| Poly Haven (API) | meubles, luminaires, appareils, décoration, plantes d'intérieur | CC0 | glTF 1k |

Écartés : Quaternius "Ultimate Furniture" (distribué seulement par un dossier Google Drive, non
téléchargeable de façon fiable par script) ; bibliothèques Sweet Home 3D "Reallusion"
(personnages) et "Trees" (hors sujet) ; tout modèle dont la licence individuelle n'est pas l'une
des quatre ci-dessus (CC0, domaine public, CC-BY, Free Art License).

Les archives Sweet Home 3D portent, par modèle : nom (dont la traduction française), catégorie,
dimensions en cm, auteur, licence, élévation par défaut, rotation du modèle, porte ou fenêtre.

## 4. Architecture

```
tools/models/            script de préparation (non livré, package.json propre)
  sources.json           adresses figées et empreintes sha256 des archives
  curation/*.json        par source : objets gardés ou écartés, nom, catégorie, pose, tailles
  lib/*.ts               lecture SH3F, conversion, normalisation, contour, rapport
  render/                page three.js pilotée par Playwright : icônes et planches de tri
  build.ts               point d'entrée : npm run models (dans tools/models)
public/models/<id>.glb   modèle optimisé, normalisé dans une boîte unité
public/models/icons/<id>.webp  icône 96 x 96
src/catalog/generated/models.ts   entrées du catalogue (données pures, importées par catalog.ts)
src/catalog/generated/credits.ts  auteur, licence, source par modèle (chargé à la demande)
public/models/LICENSES/           textes des licences CC-BY 4.0 et Free Art License 1.3
```

Le script a ses propres dépendances (`@gltf-transform/*`, `meshoptimizer`, `obj2gltf`, `sharp`,
`fflate`, `three`, `playwright`) dans `tools/models/package.json`, pour ne rien changer à
`npm ci` de l'app ni au déploiement. L'app n'ajoute **aucune** dépendance : `GLTFLoader` et le
décodeur meshopt font partie de `three`.

### 4.1 Chaîne de préparation (par modèle)

1. **Téléchargement** des archives dans `tools/models/.cache/` (ignoré par git), vérification
   sha256 ; Poly Haven par son API (`/files/<id>`, résolution 1k).
2. **Conversion** en glTF : GLB lu tel quel (Kenney), OBJ + MTL via `obj2gltf` (Quaternius,
   Sweet Home 3D), glTF + textures (Poly Haven).
3. **Orientation** : rotation `modelRotation` de Sweet Home 3D appliquée ; convention finale de
   l'app (y vers le haut, dos vers -z, face vers +z), corrigée par source dans la curation.
4. **Normalisation dans une boîte unité** : boîte englobante ramenée à
   [-0,5 ; 0,5] x [0 ; 1] x [-0,5 ; 0,5]. L'app n'a plus qu'à appliquer l'échelle
   (largeur, hauteur, profondeur) en mètres : c'est l'étirement choisi par l'utilisateur, et le
   modèle remplit exactement la boîte que connaissent les vérifications.
5. **Optimisation** (`gltf-transform`) : dédoublonnage, aplatissement, fusion des maillages par
   matière, soudure, simplification si plus de 10 000 triangles (cible 10 000), textures
   ramenées à 256 px (512 px pour Poly Haven) en WebP, quantification, compression meshopt.
6. **Matière principale** : la matière de plus grande surface, hors matières sombres (< 15 %
   de luminance), métalliques ou transparentes quand une autre existe ; renommée `main`.
   La curation peut l'imposer.
7. **Contour 2D** (section 6).
8. **Contrôle de budget** : GLB <= 150 Ko, <= 10 000 triangles, <= 8 matières. Au-delà
   (après une seconde passe à 128 px de texture), le modèle est écarté et noté dans le rapport.
9. **Icône** : rendu du GLB final par la page three.js (même `GLTFLoader` et même décodeur que
   l'app), vue 3/4 avant, fond transparent, 96 x 96, WebP. Un modèle qui ne se charge pas ou rend
   une image vide est écarté : chaque modèle livré a donc été chargé au moins une fois par
   three.js.

Le script écrit `tools/models/report.md` : nombre d'objets par source et par catégorie, poids
total, modèles écartés avec leur raison. Il est idempotent : relancé sans changement, il
produit les mêmes fichiers.

### 4.2 Tri ("les deux, triés")

- **Filtres automatiques** : portes et fenêtres (l'app a ses ouvertures), véhicules,
  personnages, animaux, nourriture, objets hors d'échelle d'un logement (plus de 6 m), doublons
  évidents (même nom et mêmes dimensions à 5 % près), budget dépassé.
- **Revue visuelle** : planches de 100 icônes générées par la page de rendu ; les modèles
  ratés, illisibles ou trop éloignés du style de l'app sont listés dans `curation/*.json`
  (champ `exclude` avec sa raison).

### 4.3 Identifiants

Identifiant de catalogue stable, préfixé par la source : `kn-` (Kenney), `qt-` (Quaternius),
`sh-` (Sweet Home 3D, suivi du nom de la bibliothèque), `ph-` (Poly Haven), puis le nom du
modèle en kebab-case ASCII. Les projets enregistrent cet identifiant : il ne change jamais. Le
fichier `tools/models/ids.lock` liste tous les identifiants publiés ; un test interdit d'en
retirer un. Un identifiant inconnu (fichier ancien, modèle retiré malgré tout) retombe sur le
comportement actuel : rectangle en 2D et en 3D.

## 5. Catalogue (données)

`CatalogEntry` gagne un champ optionnel :

```ts
model?: {
  /** Outline rings of the top view, in thousandths of the box, x right, y = front (+y plan). */
  outline: number[][];
  /** Upper parts drawn as detail lines (same frame), may be empty. */
  detail: number[][];
  style: 'simple' | 'realiste';
}
```

`shape` vaut `'symbol'` pour ces entrées : emprise rectangulaire (`objectFootprint`), comme les
symboles actuels. Les drapeaux existants servent tels quels : `pose`, `elevation`,
`acceptsUnder` (tables, bureaux, consoles), `carriesOnTop` (étagères murales), catégorie
`Structure` (escaliers). La couleur par défaut est la teinte 2D de la catégorie, comme
aujourd'hui ; une couleur différente déclenche la couleur personnalisée en 3D (`custom`).

**Catégories** : les sept actuelles, plus `Luminaires`, `Décoration`, `Extérieur` et
`Divers`. Correspondance Sweet Home 3D : Bedroom -> Chambre, Living room -> Séjour, Office ->
Bureau et repas, Kitchen -> Cuisine, Bathroom -> Salle de bain, Lights -> Luminaires,
Exterior -> Extérieur, Miscellaneous -> Divers ou Décoration (curation), Staircases ->
Structure.

**Pose par défaut** (règles, puis curation) : tapis -> `covering` ; chaises, tabourets, poufs
-> `tuckable` ; petits objets de table (lampe de table, TV posée, micro-ondes, ordinateur,
livres, vase, petite plante) -> `onTop` ; éléments avec une élévation Sweet Home 3D > 0 hors
luminaires de plafond (meubles hauts de cuisine, miroir, applique, TV murale) -> `wall` avec
cette élévation ; luminaires de plafond -> `floor` avec élévation (hauteur sous plafond par
défaut moins leur hauteur) ; le reste -> `floor`.

**Taille** : les dimensions Sweet Home 3D (en cm) ; pour Kenney et Quaternius, dont l'échelle
n'est pas métrique, des dimensions réalistes saisies dans la curation ; pour Poly Haven, la
boîte du modèle (échelle réelle).

**Poids dans l'app** : `generated/models.ts` contient seulement ce qu'il faut pour le plan
(nom, catégorie, tailles, drapeaux, contour quantifié) ; les crédits sont dans un module à part,
chargé à l'ouverture de la fenêtre Crédits. Budget : `models.ts` <= 120 Ko compressé (gzip).

## 6. Vue 2D

**Calcul du contour (préparation)** : le modèle normalisé est vu de dessus sur une grille de
128 x 128 cellules ; chaque triangle est rastérisé (centres des cellules) et ses arêtes tracées
(pour les faces verticales fines) ; la hauteur maximale par cellule est gardée. Contour par
marching squares, simplification Douglas-Peucker (tolérance 0,6 cellule), anneaux de moins de
0,5 % de la surface supprimés, trous de moins de 2 % bouchés. **Détail** : même calcul sur les
cellules plus hautes que 60 % de la hauteur maximale (dossier de canapé, tête de lit) ; omis s'il
couvre plus de 90 % du contour ou moins de 3 %.

**Dessin** : nouveau symbole `ModelSymbol` dans `symbols.tsx`, dessiné comme les autres en cm
dans le repère de l'objet, sans transformation d'échelle : chaque point vaut
`(x / 1000 * w, y / 1000 * d)`. Contour rempli de la couleur de l'objet (opacité du calque des
objets), trait de l'objet ; détail au trait seul. PNG et PDF passent par le même rendu SVG.

**Panneau Catalogue** : les entrées téléchargées montrent leur icône
(`<img loading="lazy">`, 34 px affichés), les autres gardent leur symbole. Dans une catégorie :
meubles actuels d'abord, puis les autres par nom. Le titre d'une catégorie affiche son nombre
d'objets. La recherche (nom sans accents) couvre tout le catalogue et affiche au plus 80
résultats, avec un message "80 premiers résultats, précisez la recherche". Un filtre à trois
positions "Tous / Simples / Réalistes" sous la recherche (les meubles actuels comptent comme
"Simples"). Seules les catégories ouvertes sont rendues (comportement actuel).

## 7. Vue 3D

**Bibliothèque de modèles** (`src/scene3d/models.ts`, chargée avec le reste de la 3D) :
`GLTFLoader` + `MeshoptDecoder`, URL `import.meta.env.BASE_URL + 'models/<id>.glb'`. Un modèle
n'est téléchargé que lorsqu'un objet qui l'utilise est affiché, une seule fois par session
(cache des gabarits). Géométries et matières des gabarits sont partagées par tous les objets qui
les utilisent et libérées avec la vue 3D, jamais avec un objet. Les meshes reçoivent les
réglages d'ombre des meubles actuels.

**Construction d'un objet** (`buildObject3D`) : pour une entrée `model`, si le gabarit est
chargé, un clone (géométries partagées) mis à l'échelle (w, h, d) ; si la couleur est
personnalisée, la matière `main` est remplacée par une copie de la couleur choisie (cache par
modèle et couleur, purgé comme les matières du `Kit`). Sinon, en attendant : le rectangle
générique actuel, et le chargement est lancé. À la fin du chargement, les objets en attente de
ce modèle sont reconstruits (un nouvel appel de la mise à jour de la scène), ce qui remet en
place teinte d'alerte, contour de sélection et étiquette. En cas d'échec de chargement (fichier
absent, hors ligne sans cache) : le rectangle reste, un seul avertissement console par modèle,
pas de nouvelle tentative pendant la session.

`FurnitureLayer.remove` ne libère plus que les géométries propres à l'objet (marquées), pas
celles des gabarits. `scene3dStats` gagne `modelsLoaded` et `modelsFailed` (tests).

**Miroir** : inchangé (échelle -1 sur x du corps).

## 8. Vérifications, sauvegarde, export

- Vérifications : aucune règle nouvelle ; l'emprise est le rectangle de l'objet, comme pour les
  symboles. Les drapeaux du catalogue (`acceptsUnder`, `carriesOnTop`, catégorie `Structure`)
  sont posés par la curation.
- Sauvegarde : rien ne change dans le format (`source.catalogId` est une chaîne libre) ; pas de
  migration.
- Export PNG et PDF : le contour est dans les données, le rendu est synchrone.

## 9. Crédits

Fenêtre "Crédits des modèles 3D" ouverte depuis le menu de l'en-tête : par source, la licence
(lien vers son texte), puis la liste des modèles avec leur nom, leur auteur et un lien vers la
page d'origine quand elle existe. Le README gagne une section "Modèles 3D" qui renvoie aux mêmes
informations et aux textes de licence de `public/models/LICENSES/`. Les modèles CC0 sont aussi
listés (crédit non obligatoire mais apprécié).

## 10. Rapidité : budgets et mesures

| Mesure | Budget |
|---|---|
| Entrées du catalogue dans le bundle principal | <= 120 Ko gzip |
| GLB par modèle | <= 150 Ko, médiane visée < 40 Ko |
| Icône | 96 x 96 WebP, chargée seulement si la catégorie est ouverte |
| Ouverture d'une catégorie de 200 objets | rendu React < 50 ms |
| Recherche (1 frappe) | < 16 ms |
| 3D, 60 objets téléchargés différents | appels de dessin < 600, rendu d'une image < 16 ms sur la machine de dev |

Mesurés avant et après dans un test de performance existant ou nouveau (`tests/perf`), et
consignés dans les décisions.

## 11. Tests

- Préparation (Vitest, fonctions pures de `tools/models/lib`) : lecture des `.properties`
  (échappements `\uXXXX`), contour (carré, disque, forme en L, objet fin, trou bouché),
  normalisation, choix de la matière principale, slug des identifiants.
- Intégrité du catalogue : chaque entrée `model` a son GLB et son icône dans `public/models`,
  des tailles positives, un contour dans [-500 ; 500], un identifiant unique et présent dans
  `ids.lock`, et des crédits avec une licence de la liste autorisée ; aucun identifiant de
  `ids.lock` ne manque.
- 2D : `ModelSymbol` (points mis à l'échelle, détail présent ou absent) ; `ObjectsLayer` choisit
  `ModelSymbol` pour une entrée `model`.
- 3D : `FurnitureLayer` avec un chargeur factice : rectangle d'attente, puis modèle à la bonne
  échelle après chargement ; échec -> rectangle sans nouvelle tentative ; couleur personnalisée
  sur la matière `main` seulement ; suppression d'un objet sans libérer les géométries
  partagées.
- Panneau Catalogue : icône pour une entrée `model`, plafond de 80 résultats, filtre de style.
- E2E (Playwright) : chercher "réfrigérateur", poser un modèle téléchargé, le voir en 2D, ouvrir
  la 3D, attendre `modelsLoaded >= 1` sans `modelsFailed` ; ouvrir la fenêtre Crédits.

## 12. Hors périmètre

- Import par l'utilisateur de ses propres modèles (GLB, SH3F).
- Redimensionnement "intelligent" (sans déformation) des modèles téléchargés.
- Contour réel (non rectangulaire) dans les vérifications de collision.
- Textures réalistes pour les meubles paramétriques actuels.
