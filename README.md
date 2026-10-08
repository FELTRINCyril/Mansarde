# Plan Maison

Application web locale pour dessiner un logement en plan 2D et l'aménager avec des meubles aux
dimensions réelles, dans l'esprit de Sweet Home 3D.

On relève son logement (en décalquant un plan existant ou en saisissant les cotes au clavier), on
y place ses meubles, on vérifie les passages grâce aux cotes, puis on imprime un plan à l'échelle
lisible par une autre personne.

Fonctions principales :

- murs avec épaisseur et jonctions propres, cloisons, pièces détectées automatiquement (nom et
  surface) ;
- portes, fenêtres et passages accrochés aux murs ;
- catalogue de meubles en symboles d'architecte, objets génériques (rectangle, cercle, forme en
  L) enregistrables dans "Mes objets" ;
- cotes automatiques, manuelles et dynamiques (dégagements pendant un déplacement), avec saisie
  des distances au clavier ;
- plusieurs niveaux, niveau inférieur affiché en filigrane, variantes (dupliquer un niveau ou un
  projet) ;
- image de fond à décalquer, mise à l'échelle par une longueur connue ;
- export PNG, export PDF à l'échelle (A4 ou A3, 1/20 à 1/200) avec cartouche et barre
  d'échelle ;
- sauvegarde automatique dans le navigateur, export et import du projet en `.json`.

L'application est entièrement statique : aucun serveur, aucun compte, les projets restent dans
le navigateur.

## Installation

Il faut Node.js 22.12 ou plus récent (exigé par Vite et Vitest).

    npm install
    npx playwright install chromium   # une seule fois, pour les tests de bout en bout

## Lancement

    npm run dev

puis ouvrir http://localhost:5173 dans le navigateur, sur ordinateur avec souris et clavier.
L'application est testée sous Chromium (Chrome, Edge).

`npm run build` produit une version statique dans `dist/` (servie par `npm run preview`).

## Tests

- `npm test` : tests unitaires (Vitest) ;
- `npm run typecheck` : vérification des types TypeScript ;
- `npm run e2e` : tests de bout en bout (Playwright), dont le parcours complet
  `tests/e2e/journey.spec.ts` ;
- vérification visuelle : `SHOT_DIR=/tmp/captures npx playwright test tests/e2e/visual.spec.ts`
  enregistre des captures de l'accueil, d'un plan meublé, d'un plan avec image de fond, de la
  fenêtre d'export et du PDF produit (conversion par `pdftoppm`).

## Raccourcis clavier

Sur macOS, Cmd remplace Ctrl. Les raccourcis ne s'appliquent pas pendant la saisie dans un champ.

| Touche | Action |
|---|---|
| V | Sélection |
| M | Mur (clic, clic... ; double-clic, Entrée ou Échap pour finir ; clic sur le point de départ pour fermer) |
| R | Pièce rectangulaire (glisser) |
| P | Porte |
| F | Fenêtre |
| C | Cote (clic, clic, puis clic pour le décalage) |
| Double-clic dans une pièce | Renommer la pièce |
| Chiffres pendant un tracé | Saisir la longueur (cm) ; Tab passe à la valeur suivante (hauteur d'une pièce rectangulaire) |
| Ctrl maintenu pendant un clic d'un tracé (mur ou pièce) | Tracer des cloisons (épaisseur des cloisons des réglages) |
| Maj pendant un tracé | Angles droits |
| Alt | Sans magnétisme |
| Tab pendant un déplacement (ou objet sélectionné) | Choisir la cote de dégagement ; taper une distance puis Entrée pour placer à cette distance exacte |
| Échap | Annuler l'opération en cours, puis vider la sélection |
| Suppr / Retour arrière | Supprimer la sélection |
| Ctrl+Z | Annuler |
| Ctrl+Maj+Z ou Ctrl+Y | Rétablir |
| Ctrl+C / Ctrl+V | Copier / coller les objets sélectionnés |
| Ctrl+D | Dupliquer les objets sélectionnés |
| Flèches | Décaler la sélection de 1 cm (10 cm avec Maj) |
| Molette | Zoom autour du curseur |
| Espace + glisser, ou clic du milieu | Déplacer la vue |
| 0 | Tout afficher |

Les longueurs se saisissent en centimètres ; l'affichage est en mètres (`3,50 m`) et les surfaces
en m² (`12,40 m²`).

## Limites connues de la V1

- Pas de vue 3D, pas de liste d'achats ni d'export CSV.
- Murs droits uniquement ; pas de trémies, de toiture ni de terrain.
- Usage à la souris et au clavier sur ordinateur : pas d'usage tactile.
- Les projets sont stockés dans le navigateur (IndexedDB) : effacer les données du site ou
  changer de navigateur les fait disparaître. Exportez régulièrement vos projets en `.json`.
- L'historique d'annulation dure le temps de la session : il est vidé à la fermeture du projet.
- Les dégagements mesurés pendant un déplacement vont jusqu'aux murs, pas jusqu'aux autres
  meubles.
- Les cotes automatiques dont le texte deviendrait illisible (vue trop dézoomée, échelle
  d'impression trop petite, texte sur un autre texte) ne sont pas dessinées ; les cotes manuelles
  le sont toujours.
- Image de fond : PNG ou JPEG uniquement, une image par niveau.
- PDF : formats A4 et A3, échelles 1/20, 1/50, 1/100 et 1/200, police Helvetica (les caractères
  hors de l'alphabet latin ne s'y affichent pas).

## Piste V2 : la 3D

Le modèle contient déjà tout ce qu'il faut pour une vue 3D : hauteur des murs, altitude et
hauteur sous plafond des niveaux, hauteur et allège des ouvertures, hauteur et hauteur de pose
des objets. La vue 3D pourra consommer `src/core` (contours des murs, pièces, positions des
ouvertures) sans le modifier.

## Organisation du code

- `src/core` : modèle, géométrie, commandes (annuler / rétablir), persistance ; TypeScript pur,
  sans navigateur ni React.
- `src/editor` : état de l'éditeur, outils, clavier.
- `src/render` : rendu SVG du plan, partagé par l'écran et les exports.
- `src/ui` : écrans et panneaux React.
- `src/export`, `src/storage`, `src/catalog` : exports PNG et PDF, stockage navigateur, catalogue.

Spécification : `docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md`.
