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

Nouveautés de la V2 (aménagement en volume) :

- pentes de toit (rampants), poutres et placards muraux paramétrables, dessinés sur le plan
  (dégradé et lignes de hauteur sous plafond, hauteur libre des poutres) et dans les exports ;
- vérifications automatiques, non bloquantes : hauteur sous plafond, meubles qui se
  chevauchent, meuble qui empiète sur un mur, meuble dans l'ouverture d'une porte, placard devant
  une ouverture, objet posé dans le vide, passage devant un placard ;
- modes de pose des objets (au sol, revêtement, posé sur un meuble, rangé dessous, mural) : un
  tapis sous le lit, une TV sur son meuble ou une chaise sous le bureau ne déclenchent pas
  d'alerte ;
- pièces tracées et modifiées en dimensions intérieures ;
- vue 3D de consultation, seule ou à côté du plan.

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
- `npm run e2e` : tests de bout en bout (Playwright), dont les parcours complets
  `tests/e2e/journey.spec.ts` (plan 2D) et `tests/e2e/attic-journey.spec.ts` (la chambre sous
  les toits : pente, poutre, placard, meubles, vérifications, 3D, rechargement, PDF) ;
- vérification visuelle : `SHOT_DIR=/tmp/captures npx playwright test tests/e2e/visual.spec.ts`
  enregistre des captures de l'accueil, d'un plan meublé, d'un plan avec image de fond, de la
  fenêtre d'export et du PDF produit (conversion par `pdftoppm`) ; avec la même variable,
  `tests/e2e/attic-journey.spec.ts` enregistre le plan de la chambre sous les toits, le panneau
  Vérifications et les vues 3D (ensemble, dessus, depuis la pièce, Plan + 3D).

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
| T | Pente (clic, clic : ligne de départ ; déplacer la souris : côté et profondeur ; clic ; puis hauteur de départ, Tab, hauteur d'arrivée, Entrée) |
| B | Poutre (clic, clic) |
| K | Placard (survoler un mur, clic pour poser ; l'outil reste actif) |
| Espace (appui bref) pendant le tracé d'un mur | Changer la face de référence (face gauche ou face droite) |
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

## Pentes, poutres et placards

- **Pente** (touche T) : la ligne de départ se trace en deux clics, puis on choisit le côté et
  la profondeur en déplaçant la souris (cote dynamique). Le champ numérique demande ensuite la
  hauteur au départ (celle du niveau par défaut) puis, après Tab, la hauteur à l'arrivée
  (1,50 m par défaut). La pente agit sur toute la bande qu'elle couvre : tracer la ligne de
  départ d'un mur à l'autre. Le panneau de la pente règle ses deux hauteurs, sa profondeur et son
  sens.
- **Poutre** (touche B) : deux clics. Par défaut elle est collée sous le plafond (12 cm de
  large, 15 cm de retombée) ; le panneau permet de la passer en "Hauteur fixe" et de saisir la
  hauteur de son dessous. Sur le plan, elle est dessinée en pointillés avec sa hauteur libre.
- **Placard** (touche K) : l'aperçu suit le mur survolé, plaqué sur la face du côté de la souris,
  rouge s'il ne tient pas. Par défaut 120 x 60 cm, "Jusqu'au plafond" (il suit la pente et les
  poutres, à 2 cm du plafond) ; on peut le passer en hauteur fixe, régler le socle, le nombre et
  le type de portes (battantes ou coulissantes), la couleur, ou le placer contre l'autre face du
  mur ("Changer de face"). Il glisse le long de son mur avec l'outil Sélection et suit le mur si
  celui-ci bouge ; supprimer le mur supprime le placard.

La hauteur sous plafond du niveau se règle dans le panneau "Niveau" (rien de sélectionné).

## Pose des objets

Chaque objet a une pose (menu "Pose" du panneau de l'objet), fixée par le catalogue et
modifiable :

| Pose | Usage | Effet sur les vérifications |
|---|---|---|
| Au sol | la plupart des meubles | se heurte aux autres objets |
| Revêtement | tapis | ne se heurte à rien (sauf un autre tapis) |
| Posé sur un meuble | TV, lampe de chevet, micro-ondes | posé à la hauteur du meuble, du placard de hauteur fixe ou de l'étagère murale qui est sous son centre ; alerte s'il ne repose sur rien |
| Rangé dessous | chaises, pouf | peut se glisser sous une table ou un bureau |
| Mural | TV murale, étagère murale | plaqué contre le mur le plus proche, à sa hauteur de pose |

Choisir "Posé sur un meuble" soulève l'objet sur le meuble placé sous lui ; revenir "Au sol" le
redescend. Sur le plan, les tapis sont dessinés sous les autres meubles.

## Pièces en dimensions intérieures

- L'outil Pièce rectangulaire (R) trace l'intérieur de la pièce : les murs sont construits à
  l'extérieur. On peut taper la largeur, Tab, la profondeur, Entrée. Quand un coin s'accroche à
  un mur existant (pièce voisine), le tracé repasse à l'axe des murs, comme l'indique l'aperçu.
- L'outil Mur (M) trace sur l'axe du mur par défaut ; la petite barre au-dessus du plan permet de
  tracer sur la face gauche ou la face droite (Espace inverse le côté pendant le tracé).
- Une pièce rectangulaire sélectionnée affiche sa largeur et sa profondeur intérieures,
  modifiables, avec le côté qui bouge ; un double-clic sur une cote intérieure fait de même. Si
  le mur déplacé est partagé, le panneau prévient que la pièce voisine sera modifiée. Une
  dimension impossible est refusée et reste en rouge avec sa raison.
- Un mur sélectionné affiche aussi la longueur de chacune de ses faces (face gauche, face droite).

## Vérifications

Le compteur "N alertes" de l'en-tête (absent s'il n'y a rien) ouvre le panneau Vérifications :
une ligne par alerte, rouge pour une erreur, orange pour un avertissement. Un clic sur une ligne
sélectionne les éléments concernés et centre le plan sur eux. Les éléments en alerte sont
entourés en rouge ou en orange sur le plan et teintés dans la 3D ; la case "Masquer les
alertes" retire ces marques (le compteur et la liste restent). Les alertes ne bloquent jamais
une action et ne sont jamais imprimées.

Exemples de messages :

- "Armoire : monte à 2,00 m, plafond à 1,54 m à cet endroit." (hauteur sous un rampant, une
  poutre ou le plafond) ;
- "Lit et Bureau se chevauchent." ;
- "Commode : empiète sur un mur." ;
- "Fauteuil : gêne l'ouverture de la porte." ;
- "Placard : devant une fenêtre." ;
- "Placard : pas assez de hauteur sous le plafond." (placard jusqu'au plafond dont le haut passe
  sous son socle après l'ajout d'un rampant ou d'une poutre) ;
- "TV : aucun support en dessous." ;
- "Placard : 40 cm de passage devant (60 cm conseillés)."

Deux objets de même nom sont distingués par un numéro ("Bureau (1)", "Bureau (2)") : renommer
ses meubles rend la liste plus lisible.

## Vue 3D

Les boutons "Plan", "3D" et "Plan + 3D" de l'en-tête choisissent l'affichage ; en "Plan + 3D",
la séparation se déplace à la souris (ou aux flèches du clavier). La 3D est chargée au premier
affichage ; elle sert à regarder, les modifications se font sur le plan et y apparaissent
aussitôt.

- Navigation : glisser avec le bouton gauche pour tourner, avec le bouton droit pour déplacer,
  molette pour zoomer.
- Vues prédéfinies : "Vue d'ensemble", "Dessus" et "Depuis la pièce sélectionnée" (à 1,60 m de
  hauteur, dans la pièce sélectionnée ou celle de l'objet sélectionné).
- Les murs et le plafond situés entre la caméra et la pièce se masquent tout seuls ; la case
  "Cacher tous les murs" les retire tous.
- "Noms des objets" affiche une étiquette sur chaque meuble.
- "Afficher les niveaux inférieurs" empile sous le niveau actif les niveaux placés avant lui.
- Un clic sur un meuble, un placard ou une poutre le sélectionne (son panneau s'ouvre, comme
  sur le plan).

Si le navigateur ne sait pas afficher la 3D (WebGL indisponible), la vue l'indique et le plan
reste utilisable.

## Publier sur GitHub Pages

Le dépôt contient le nécessaire pour publier l'application sur GitHub Pages ; rien n'est publié
automatiquement tant que ces étapes ne sont pas faites.

1. Créer un dépôt **public** nommé `plan-maison` sur GitHub (Pages gratuit exige un dépôt
   public) et y pousser le code, branche `main`.
2. Dans le dépôt : Settings > Pages > Build and deployment > Source : **GitHub Actions**.
3. Chaque push sur `main` lance le workflow `.github/workflows/deploy.yml` (vérification des
   types, construction avec `BASE_PATH=/plan-maison/`, publication). L'application est alors
   disponible à l'adresse `https://<compte>.github.io/plan-maison/`.

Pour un autre nom de dépôt, adapter `BASE_PATH` dans le workflow (`/<nom-du-dépôt>/`). Pour
vérifier localement : `BASE_PATH=/plan-maison/ npm run build`, puis
`npx vite preview --base /plan-maison/`.

Les données ne sont pas publiées avec l'application : chaque navigateur garde ses propres
projets, et pour une adresse donnée seulement (la version locale `http://localhost:5173` et la
version publiée ne voient pas les mêmes projets, pas plus que deux ordinateurs). Pour passer un
projet de l'une à l'autre, l'exporter en `.json` (Exporter > Projet (.json)) puis l'importer depuis
l'accueil.

## Limites connues

- Vue 3D de consultation seulement : pas d'édition dans la 3D, pas de visite à hauteur d'oeil,
  pas de vue en coupe.
- Pas de modèle de toiture complet (pans, faîtage, croupes, lucarnes) : les rampants sont des
  pentes planes, qu'on peut combiner (deux pentes face à face pour un toit à deux pans).
- Pas d'étagères ouvertes, de placards hauts posés sur un meuble ni de niches ; les placards
  sont plaqués contre un mur droit.
- Les escaliers ne sont pas contrôlés en hauteur (ils traversent les niveaux).
- Les dégagements mesurés pendant un déplacement vont jusqu'aux murs, pas jusqu'aux autres
  meubles (le contrôle "passage devant un placard", lui, tient compte des meubles).
- Murs droits uniquement ; pas de trémies ni de terrain ; pas de liste d'achats ni d'export
  CSV.
- Usage à la souris et au clavier sur ordinateur : pas d'usage tactile. La 3D sollicite la carte
  graphique ; sur un ordinateur sans accélération, elle peut être lente.
- Les projets sont stockés dans le navigateur (IndexedDB) : effacer les données du site ou
  changer de navigateur les fait disparaître. Exportez régulièrement vos projets en `.json`. Un
  projet enregistré dans un format que cette version ne sait pas lire apparaît comme "Projet
  illisible" sur l'accueil, où il peut être supprimé.
- L'historique d'annulation dure le temps de la session : il est vidé à la fermeture du projet.
- Les cotes automatiques dont le texte deviendrait illisible (vue trop dézoomée, échelle
  d'impression trop petite, texte sur un autre texte) ne sont pas dessinées ; les cotes manuelles
  le sont toujours.
- Image de fond : PNG ou JPEG uniquement, une image par niveau.
- PDF : formats A4 et A3, échelles 1/20, 1/50, 1/100 et 1/200, police Helvetica (les caractères
  hors de l'alphabet latin ne s'y affichent pas) ; les pentes sont teintées d'une couleur
  uniforme.

## Organisation du code

- `src/core` : modèle, géométrie, commandes (annuler / rétablir), persistance ; TypeScript pur,
  sans navigateur ni React.
- `src/editor` : état de l'éditeur, outils, clavier.
- `src/render` : rendu SVG du plan, partagé par l'écran et les exports.
- `src/core` contient aussi les vérifications (`src/core/checks`) et les maillages de la 3D
  (`src/core/mesh`), testés sans navigateur.
- `src/scene3d` : la vue 3D (Three.js, chargée à la demande).
- `src/ui` : écrans et panneaux React.
- `src/export`, `src/storage`, `src/catalog` : exports PNG et PDF, stockage navigateur, catalogue.

Spécifications : `docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md` (V1) et
`docs/superpowers/specs/2026-10-08-plan-maison-v2-design.md` (V2).
