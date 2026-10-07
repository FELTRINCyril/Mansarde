# Plan Maison - V1 : spécification de conception

Date : 07/10/2026
Statut : validée en conversation, en attente de relecture écrite

## 1. Objectif

Une application web locale, inspirée de Sweet Home 3D, pour dessiner un logement en plan 2D
et l'aménager avec des meubles aux dimensions réelles.

**Usage visé** : surtout personnel (aménager un logement réel, préparer un déménagement, tester
des dispositions), avec un côté projet plaisir et la possibilité de montrer un plan propre à
quelqu'un.

**Critère de réussite de la V1** : on peut relever son logement (en décalquant un plan existant
ou en saisissant les cotes), y placer ses meubles réels aux bonnes dimensions, vérifier les
passages grâce aux cotes, et imprimer un plan à l'échelle lisible par une autre personne.

## 2. Périmètre

### Inclus en V1
- Projets d'une seule pièce jusqu'à une maison complète **sur plusieurs niveaux**.
- Murs avec épaisseur, jonctions propres, pièces détectées automatiquement (nom + surface).
- Portes, fenêtres et passages accrochés aux murs.
- Objets du catalogue sous forme de **symboles d'architecte**, à dimensions libres.
- **Objets génériques** (rectangle, cercle, forme en L) nommés et dimensionnés librement,
  enregistrables dans "mes objets".
- Cotes **automatiques**, **manuelles** (accrochées aux éléments) et **dynamiques** pendant
  les déplacements, avec saisie des valeurs au clavier.
- **Image de fond à décalquer**, mise à l'échelle par une longueur connue.
- **Export PNG et PDF à l'échelle** avec cartouche.
- **Variantes** : dupliquer un projet ou un niveau.
- Sauvegarde automatique dans le navigateur, export/import du projet en `.json`.

### Exclus de la V1
- Vue 3D (prévue en V2 ; le modèle de données porte déjà les hauteurs nécessaires).
- Liste des objets / liste d'achats et export CSV.
- Comptes, synchronisation, partage par lien, hébergement en ligne.
- Usage tactile (tablette, téléphone) : la V1 vise souris + clavier sur ordinateur.
- Trémies (ouvertures dans les planchers), toitures, terrain.
- Murs courbes.

## 3. Contraintes et conventions

- Application **statique**, lancée en local par `npm run dev` (Vite). Aucune partie serveur :
  une mise en ligne ultérieure (hébergement statique) ne demandera aucune modification.
- Interface en **français**.
- Unité interne : le **centimètre** (nombres à virgule). Affichage des cotes en mètres avec
  deux décimales (`3,50 m`), surfaces en m² avec deux décimales (`12,40 m²`). Les saisies
  clavier se font en centimètres.
- Repère du plan : X vers la droite, Y vers le bas (comme une feuille de papier).
- Valeurs par défaut du projet (modifiables dans les réglages) : épaisseur de mur 20 cm,
  épaisseur de cloison proposée 7 cm, hauteur sous plafond 250 cm, pas de grille 10 cm.
- Emplacement : `/Users/cyril/Documents/Autre/plan-maison`, dépôt git.

## 4. Architecture

TypeScript + Vite + React, avec un **noyau métier indépendant de l'interface**.

```
src/
  core/            TypeScript pur : aucun import React ni API navigateur
    model/         types et identifiants
    geometry/      vecteurs, contours de murs, pièces, ouvertures, magnétisme, cotes
    commands/      toutes les modifications du modèle + historique annuler/rétablir
    persistence/   sérialisation, validation, migrations de format
  editor/          état de l'éditeur (Zustand), outils (machines à états), clavier/souris
  render/          composants SVG du plan, partagés entre l'écran et l'export
  ui/              écran d'accueil, barre d'outils, panneaux, dialogues
  export/          PNG, PDF
  catalog/         symboles SVG et dimensions par défaut des objets
```

**Règles de dépendance** : `core` ne dépend de rien d'autre que de bibliothèques pures.
`editor` dépend de `core`. `render` dépend de `core` (et lit l'état de `editor` pour les
éléments d'interaction). `ui` et `export` sont au sommet. La V2 (vue 3D Three.js) consommera
`core` tel quel.

**Bibliothèques** : React, Zustand, Immer, `polygon-clipping` (union des murs, découpe des
ouvertures ; retenue face à `clipper2-js`, dont le paquet npm dépend d'Angular), `polylabel`
(position des libellés de pièces), `idb` (IndexedDB), `zod` (validation des imports),
`jspdf` + `svg2pdf.js` (PDF). Tests : Vitest, Playwright, `fake-indexeddb` pour tester le
stockage. Aucune autre dépendance sans raison précise.

**Épaisseur des traits** : plutôt que `vector-effect: non-scaling-stroke` (mal géré par
`svg2pdf.js`), les composants de rendu reçoivent une unité de trait `lineUnit` (en cm du
monde) : `1 / zoom` à l'écran, et une valeur dérivée de l'échelle en impression. Les symboles
d'objets sont dessinés de façon paramétrique en cm (un cercle reste rond quand on étire
l'objet), plutôt qu'étirés depuis un repère normalisé.

## 5. Modèle de données

Tous les éléments ont un identifiant unique (chaîne). Coordonnées et longueurs en cm.

### Projet
- `formatVersion` (entier), `id`, `name`, `createdAt`, `updatedAt`.
- `settings` : épaisseur de mur par défaut, hauteur sous plafond par défaut, pas de grille.
- `levels` : liste ordonnée de niveaux.
- `customObjects` : bibliothèque "mes objets" du projet (définitions d'objets génériques
  enregistrées : nom, forme, dimensions, couleur).

### Niveau
- `id`, `name` ("RDC", "Étage 1"...), `elevation` (altitude du plancher), `height`
  (hauteur sous plafond).
- `background` optionnel : référence de l'image, échelle (cm par pixel), position, rotation,
  opacité, verrouillé, visible.
- `nodes`, `walls`, `openings`, `objects`, `dimensions`, `roomLabels`.

### Murs (graphe)
- **Nœud** : `id`, `x`, `y`.
- **Mur** : `id`, `startNodeId`, `endNodeId`, `thickness`, `height`.
- Deux murs qui se rejoignent partagent un nœud. Déplacer un nœud déplace l'extrémité de tous
  les murs qui y arrivent.
- Un nœud sans aucun mur est supprimé automatiquement.
- Tracer un mur dont une extrémité tombe au milieu d'un mur existant **coupe** ce mur en deux
  au point de jonction (création d'une jonction en T). Les ouvertures du mur coupé sont
  réparties sur les deux morceaux selon leur position.

### Ouvertures
- `id`, `wallId`, `kind` (`door`, `window`, `passage`), `variant`, `offset` (distance du
  début du mur au centre de l'ouverture), `width`, `height`, `sillHeight` (hauteur d'allège),
  `hinge` (`start` / `end`), `swing` (côté d'ouverture : `left` / `right` du mur).
- Variantes V1 :
  - portes : battante simple, battante double, coulissante, galandage ;
  - fenêtres : battant simple, battant double, coulissante, fixe ;
  - passage : ouverture sans menuiserie.
- Valeurs par défaut : porte 83 x 204 cm, fenêtre 120 x 135 cm avec allège à 90 cm,
  passage 90 x 204 cm.
- Invariants : une ouverture tient entièrement dans la longueur de son mur et ne chevauche
  pas une autre ouverture du même mur.

### Objets
- `id`, `type` (référence au catalogue) ou `customObjectId` (référence à "mes objets"),
  `x`, `y` (centre), `rotation` (degrés), `width`, `depth`, `height`, `elevation` (hauteur de
  pose), `name`, `color`, `mirrored`.
- Objets génériques : forme `rect`, `circle` ou `lshape` (forme en L avec deux dimensions
  supplémentaires pour l'encoche).

### Cotes manuelles
- `id`, `a`, `b` (ancres), `offset` (décalage perpendiculaire de la ligne de cote).
- Une ancre est l'un de : `{ node: id }`, `{ objectCorner: id, corner: 0..3 }`,
  `{ point: { x, y } }`.
- Une cote dont une ancre référence un élément supprimé est supprimée avec lui.

### Pièces
- Les pièces ne sont **pas stockées** : elles sont calculées (voir 6.2).
- `roomLabels` : `id`, `name`, `anchor` (point situé dans la pièce). À chaque calcul, une
  pièce prend le nom de l'étiquette dont l'ancre est à l'intérieur. Si plusieurs ancres sont
  dans la même pièce (par exemple après suppression d'une cloison), la plus ancienne gagne et
  les autres sont conservées mais inactives. Si une pièce n'a pas d'ancre, elle s'affiche
  "Pièce" avec sa surface.

### Persistance
- Projets stockés dans IndexedDB ; images de fond stockées comme Blobs séparés, référencées par
  identifiant.
- Sauvegarde automatique 500 ms après la dernière commande.
- Export `.json` : le projet complet, images de fond encodées en base64 à l'intérieur du
  fichier.
- Import : validation complète par `zod`, puis migrations successives depuis `formatVersion`
  jusqu'à la version courante. Un fichier dont la version est supérieure à celle de l'app est
  refusé.

## 6. Géométrie

### 6.1 Contours des murs et jonctions
- Pour chaque nœud, les murs incidents sont triés par angle. Le coin entre deux murs voisins
  est l'intersection de leurs faces décalées (moitié de l'épaisseur de chaque côté), ce qui
  donne des coupes d'onglet propres, y compris aux angles non droits et entre murs
  d'épaisseurs différentes.
- Cas particuliers :
  - nœud à un seul mur : extrémité coupée droite ;
  - deux murs presque alignés (écart inférieur à 1°) : pas d'onglet, jonction droite ;
  - angle très aigu (moins de 15°) : l'onglet est tronqué pour éviter une pointe démesurée.
- Le contour de chaque mur est un polygone ; tous les polygones d'un niveau sont **unis** en
  une seule forme (bibliothèque de booléens). Les ouvertures sont ensuite **soustraites** de
  cette forme pour le rendu.

### 6.2 Détection des pièces
- Les pièces sont les **trous** de l'union des contours de murs, calculée **sans** les
  ouvertures (une porte ne fait pas fusionner deux pièces).
- Surface : surface nette du trou (intérieur des murs), en m².
- Position du libellé : le "pôle d'inaccessibilité" de la pièce (point intérieur le plus
  éloigné des bords), pour qu'il reste à l'intérieur même dans une pièce en L.

### 6.3 Ouvertures
- La position d'une ouverture est calculée à partir du mur et de `offset`. Quand un nœud
  bouge, `offset` est conservé ; si le mur devient trop court, l'ouverture est recalée pour
  rester dans le mur. Si c'est impossible, la commande de déplacement est refusée.

### 6.4 Magnétisme
Seuil en pixels écran (8 px), donc indépendant du zoom. Par ordre de priorité :
1. extrémités de murs (nœuds) ;
2. milieux de murs et projection sur la face ou l'axe d'un mur ;
3. alignement horizontal ou vertical avec un nœud existant (guide en pointillés) ;
4. angle multiple de 15° par rapport au point précédent (pendant le tracé) ;
5. grille.

Alt désactive temporairement le magnétisme ; Maj contraint aux angles de 90°. Un objet qui
s'approche à moins du seuil de la face d'un mur s'y plaque et prend l'orientation du mur.

### 6.5 Cotes dynamiques
- Pendant le déplacement d'un objet : distances entre les bords de l'objet et la face de mur
  la plus proche dans chacune des quatre directions de son repère.
- Pendant le tracé d'un mur : longueur du segment en cours et angle.
- Pendant le déplacement d'une ouverture : distances aux extrémités du mur (ou à l'ouverture
  voisine).

## 7. Interface et outils

### 7.1 Écran d'accueil
Liste des projets (nom, date de modification, aperçu), avec : nouveau projet, ouvrir,
renommer, dupliquer (variante), importer un `.json`, exporter, supprimer (avec confirmation).

### 7.2 Éditeur
- Barre d'outils à gauche, plan au centre, panneau de propriétés à droite, onglets de niveaux
  en bas, catalogue d'objets dans un panneau repliable.
- **Panneau de propriétés** : affiche et modifie numériquement l'élément sélectionné (longueur
  et épaisseur d'un mur, dimensions et rotation d'un objet, variante d'une ouverture, nom
  d'une pièce...). Sélection multiple : propriétés communes seulement.
- **Onglets de niveaux** : ajouter un niveau (au-dessus ou en dessous), renommer, dupliquer
  (variante), supprimer (avec confirmation), réordonner. Option "afficher le niveau inférieur
  en filigrane".

### 7.3 Outils
| Outil | Raccourci | Comportement |
|---|---|---|
| Sélection | V | Clic, rectangle de sélection, Maj+clic pour ajouter. Glisser pour déplacer, poignée de rotation, poignées de redimensionnement des objets, glisser un nœud ou un mur. |
| Mur | M | Clic, clic, clic pour tracer une suite de murs ; double-clic ou Échap pour finir ; clic sur le point de départ pour fermer. |
| Pièce rectangulaire | R | Glisser un rectangle : crée quatre murs fermés. |
| Porte | P | Survol d'un mur : aperçu accroché ; clic pour poser. |
| Fenêtre | F | Idem porte. |
| Cote | C | Clic, clic, puis clic pour fixer le décalage. |
| Nom de pièce | (double-clic dans une pièce) | Renommer la pièce. |
| Objet | (catalogue) | Glisser depuis le catalogue vers le plan. |

### 7.4 Saisie clavier des valeurs
- Pendant un tracé de mur, taper un nombre ouvre un petit champ près du curseur : Entrée fixe
  la longueur du segment en cours dans la direction actuelle.
- Pendant un déplacement, Tab passe d'une cote dynamique à l'autre ; taper une valeur puis
  Entrée place l'élément à cette distance exacte.
- Échap annule l'opération en cours sans rien modifier.

### 7.5 Raccourcis généraux
Ctrl+Z / Ctrl+Maj+Z (annuler / rétablir, historique illimité pendant la session), Suppr,
Ctrl+C / Ctrl+V, Ctrl+D (dupliquer), flèches (décalage de 1 cm, 10 cm avec Maj), molette
(zoom autour du curseur), espace + glisser ou clic du milieu (déplacer la vue), touche `0`
(tout afficher). Sur macOS, Cmd remplace Ctrl.

### 7.6 Image de fond
Importer une image (PNG, JPEG) sur le niveau actif, tracer un segment sur une longueur connue
de l'image, saisir sa valeur en cm : l'image est mise à l'échelle. Réglages : opacité,
position, rotation, verrouillage, visibilité, suppression.

### 7.7 Catalogue V1
Chaque entrée : nom, catégorie, symbole SVG, dimensions par défaut (largeur x profondeur x
hauteur, en cm).

- **Chambre** : lit 90 x 190, lit 140 x 190, lit 160 x 200, lit 180 x 200, table de nuit
  45 x 40, armoire 120 x 60, commode 100 x 50, berceau 60 x 120.
- **Séjour** : canapé 2 places 160 x 90, canapé 3 places 210 x 95, canapé d'angle 250 x 200,
  fauteuil 80 x 85, table basse 110 x 60, meuble TV 160 x 45, bibliothèque 100 x 35,
  vitrine 100 x 45.
- **Bureau / repas** : bureau 140 x 70, chaise 45 x 50, table rectangulaire 160 x 90,
  table ronde diamètre 110.
- **Cuisine** : plan de travail 60 de profondeur (longueur libre), évier 80 x 60, plaque de
  cuisson 60 x 60, réfrigérateur 60 x 65, lave-vaisselle 60 x 60.
- **Salle de bain** : WC 40 x 65, lavabo 60 x 45, douche 90 x 90, baignoire 170 x 75,
  lave-linge 60 x 60.
- **Structure** : escalier droit 90 x 300, escalier quart tournant 90 x 250 (symboles 2D
  uniquement, sans trémie).
- **Génériques** : rectangle, cercle, forme en L.

Un objet générique peut être enregistré dans "mes objets" (nom, forme, dimensions, couleur) et
réapparaît alors dans le catalogue du projet.

## 8. Rendu

- Le plan est un SVG dont l'unité utilisateur est le centimètre ; zoom et déplacement passent
  par une transformation de vue.
- **Murs** : la forme unie (6.1) remplie en gris foncé, sans trait intérieur aux jonctions.
- **Ouvertures** : portes = battant en trait + arc d'ouverture en pointillé ; fenêtres = traits
  fins doublés dans l'épaisseur du mur ; un symbole par variante.
- **Pièces** : remplissage léger, nom et surface au pôle d'inaccessibilité. Taille du texte
  constante à l'écran.
- **Objets** : symbole SVG dessiné de façon paramétrique aux dimensions de l'objet (en cm),
  traits d'épaisseur constante à l'écran grâce à `lineUnit` (voir 4).
- **Cotes automatiques** :
  - pour chaque pièce, la longueur de chaque face de mur intérieure (dimensions intérieures) ;
  - pour les murs de façade, la longueur de la face extérieure ;
  - largeur de chaque ouverture.
  Trois modes d'affichage : toutes les cotes, seulement les manuelles, aucune.
- **Niveau inférieur en filigrane** (option) : murs du niveau du dessous en gris clair.
- **Couches de rendu**, de bas en haut : image de fond, filigrane, grille, pièces, objets,
  murs et ouvertures, cotes, éléments d'interaction (sélection, poignées, guides, aperçus).
- Le même composant de plan accepte un mode "impression" qui masque la grille et la couche
  d'interaction : l'export réutilise exactement le rendu de l'écran.

## 9. Export

- **PNG** : niveau actif cadré sur son contenu avec une marge, résolution au choix
  (1x, 2x, 4x).
- **PDF à l'échelle** : format A4 ou A3, portrait ou paysage, échelle 1/20, 1/50, 1/100 ou 1/200.
  Contenu vectoriel (`svg2pdf.js`) avec un cartouche en bas à droite (nom du projet, niveau,
  échelle, date) et une barre d'échelle graphique. Si le plan ne tient pas sur la page à
  l'échelle choisie, l'app le signale et propose la plus grande échelle normalisée qui tient,
  au lieu de rogner.
- **Projet `.json`** : voir 5. Persistance.

## 10. Commandes et historique

- Toute modification du projet passe par une commande nommée (`addWall`, `moveNode`,
  `splitWall`, `addOpening`, `moveObject`, `renameRoom`...). Une commande vérifie ses
  invariants avant d'appliquer quoi que ce soit ; si un invariant est violé, elle est
  refusée et le modèle reste inchangé.
- Les commandes produisent des patches Immer ; l'historique conserve les patches directs et
  inverses. Un geste (un glisser complet, un tracé de mur) correspond à **une** entrée
  d'historique, même s'il a donné lieu à de nombreuses mises à jour intermédiaires.
- L'historique vit en mémoire et n'est pas sauvegardé.
- L'état de l'éditeur (outil actif, sélection, vue, aperçus) est distinct du modèle et n'entre
  pas dans l'historique.

## 11. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Import d'un fichier invalide | Message indiquant ce qui ne va pas ; rien n'est importé, le projet courant n'est pas modifié. |
| Fichier d'une version plus récente de l'app | Refusé avec un message explicite. |
| Échec de sauvegarde (stockage plein, navigation privée) | Bandeau d'alerte persistant et invitation à exporter en `.json`. Jamais d'échec silencieux. |
| Géométrie invalide (mur de longueur nulle, ouverture plus large que son mur, chevauchement d'ouvertures) | Commande refusée ; l'aperçu passe en rouge pendant le geste. |
| Image de fond illisible | Message, aucune modification du niveau. |
| Plan trop grand pour la page PDF | Message et proposition d'une échelle qui convient. |

En développement, les invariants du modèle sont revérifiés après chaque commande et une
violation lève une erreur immédiate.

## 12. Tests

### Vitest (`src/core`)
- Contours de murs : angle droit, angle non droit, jonction en T, jonction en croix, murs
  d'épaisseurs différentes, murs presque alignés, angle très aigu.
- Pièces : rectangle simple, pièce en L, deux pièces partageant une cloison, cloison supprimée
  (fusion et conservation des étiquettes), porte entre deux pièces (pas de fusion).
- Surfaces : valeurs exactes sur des cas calculables à la main.
- Ouvertures : suivi d'un mur déplacé, recalage, refus quand le mur devient trop court,
  répartition lors d'une coupe de mur.
- Magnétisme : priorités et seuil dépendant du zoom.
- Commandes : pour chacune, aller-retour faire / annuler / refaire qui retrouve un état
  identique.
- Persistance : aller-retour export / import identique, refus des fichiers invalides, refus
  d'une version future, migrations.

### Playwright (parcours)
- Créer un projet, tracer une pièce au clavier (longueurs saisies), vérifier la surface
  affichée.
- Poser une porte et un lit, déplacer le lit en saisissant une distance au mur.
- Annuler / rétablir.
- Renommer une pièce, ajouter un niveau, dupliquer un niveau.
- Exporter un PDF : le fichier est produit et non vide.
- Exporter puis réimporter un projet `.json`.

### Vérification visuelle
À chaque étape importante, l'app est ouverte dans le navigateur et le rendu réel est contrôlé
(jonctions, symboles, cotes, export), en plus des tests automatisés.

## 13. Préparation de la V2 (3D)

Rien de 3D n'est construit en V1, mais le modèle contient déjà tout ce qui est nécessaire :
hauteur des murs, altitude et hauteur des niveaux, hauteur et allège des ouvertures, hauteur
et hauteur de pose des objets. La vue 3D consommera `src/core` (contours des murs, pièces,
positions des ouvertures) sans modification de ce dernier.
