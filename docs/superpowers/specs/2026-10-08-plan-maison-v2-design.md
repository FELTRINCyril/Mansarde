# Plan Maison - V2 : spécification de conception

Date : 08/10/2026
Statut : validée en conversation, en attente de relecture écrite
Base : V1 (`docs/superpowers/specs/2026-10-07-plan-maison-v1-design.md`), dont tout reste valable
sauf mention contraire ici.

## 1. Objectif

Passer d'un plan 2D à un outil d'aménagement **en volume** :
- vue **3D** du logement, dans le style de l'app de référence `plan-chambre` (fichier
  `/Users/cyril/Documents/Autre/plan-chambre/index.html`) ;
- **pentes de toit**, **poutres** et **placards muraux** paramétrables ;
- **contrôles** non bloquants (hauteur sous plafond, collisions, empiètements, ouvertures,
  dégagements) affichés en rouge ou orange, avec un panneau "Vérifications" ;
- **dimensions de pièces intuitives** : on raisonne en dimensions intérieures.

**Critère de réussite** : on reproduit la chambre sous les toits de `plan-chambre` (pièce de
4,00 x 4,00 m intérieurs, plafond à 2,40 m qui descend à 1,50 m, poutre, placards sous rampant),
on y place les meubles, les alertes apparaissent aux bons endroits (armoire trop haute sous le
rampant, lit et bureau qui se chevauchent, tapis sous le lit sans alerte, TV posée sur le meuble
télé sans alerte), et la vue 3D rend la pièce de façon comparable à `plan-chambre`.

## 2. Périmètre

### Inclus
- Pentes de toit (plusieurs par niveau), poutres, placards muraux.
- Fonction unique de hauteur sous plafond, utilisée par les contrôles, les placards et la 3D.
- Modes de pose des objets et règles de collision associées.
- Moteur de vérifications et panneau "Vérifications".
- Outil Pièce rectangulaire en dimensions intérieures ; ligne de référence de l'outil Mur ;
  modification des dimensions intérieures d'une pièce.
- Vue 3D de consultation (orbite, vues prédéfinies, murs masqués, sélection par clic),
  affichage Plan / 3D / Plan + 3D.
- Compléments de catalogue liés aux modes de pose.
- Migration des projets V1 (format de fichier version 2).
- Préparation du déploiement GitHub Pages (configuration et workflow, sans publication).

### Exclus
- Édition dans la vue 3D, visite à hauteur d'oeil (possibles plus tard).
- Vue en coupe.
- Modèle de toiture complet (pans, faîtage, croupes, lucarnes).
- Étagères ouvertes, placards hauts sur meuble, niches.
- Publication effective sur GitHub (faite seulement sur demande explicite).

## 3. Contraintes

- Toutes les contraintes de la V1 restent valables (application statique, unités en cm,
  Y vers le bas, rotation en degrés sens horaire, `src/core` sans API navigateur ni React,
  toute modification par une commande, règles typographiques).
- Une seule dépendance ajoutée : `three` (et ses types). Les modules complémentaires de Three.js
  (`OrbitControls`, `RoundedBoxGeometry`, `CSS2DRenderer`) viennent du paquet `three` lui-même.
- Three.js est chargé à la demande (import dynamique) au premier affichage de la 3D.
- Aucun service extérieur : textures de parquet et de tapis générées par le code.

## 4. Modèle de données

### 4.1 Niveau
Ajouts à `Level` :
- `slopes: Record<Id, Slope>`
- `beams: Record<Id, Beam>`
- `cupboards: Record<Id, Cupboard>`

### 4.2 Pente (`Slope`)
- `id`, `a`, `b` (points de la ligne de départ), `side` (`'left' | 'right'` : côté vers lequel le
  plafond descend, gauche = `+perp(b - a)` comme pour les ouvertures), `depth` (distance entre la
  ligne de départ et la ligne d'arrivée, > 0), `heightStart`, `heightEnd` (cm, > 0).
- Zone d'effet : la bande des points dont la projection sur `[a, b]` tombe dans le segment
  (étendue latérale = longueur de la ligne de départ), du côté `side`.
- Hauteur de la pente en un point de cette bande à la distance `d` de la ligne de départ :
  `heightStart + (heightEnd - heightStart) * d / depth` pour `0 <= d <= depth`, puis `heightEnd`
  au-delà. Aucun effet pour `d < 0` (côté opposé).
- Valeurs par défaut : `heightStart` = hauteur du niveau, `heightEnd` = 150.

### 4.3 Poutre (`Beam`)
- `id`, `a`, `b` (axe de la poutre en plan), `width` (12 par défaut), `drop` (retombée, 15 par
  défaut), `mode` (`'ceiling' | 'fixed'`), `bottom` (hauteur du dessous, utilisée en mode `fixed`).
- Mode `ceiling` : le dessus de la poutre suit le plafond sans poutres ; le dessous est à
  `ceilingWithoutBeams(p) - drop`.

### 4.4 Placard (`Cupboard`)
- `id`, `wallId`, `offset` (distance du début du mur au centre du placard, le long du mur),
  `side` (`'left' | 'right'` : face du mur contre laquelle il est posé), `width` (120 par défaut),
  `depth` (60), `plinth` (hauteur du socle, 10), `heightMode` (`'fixed' | 'ceiling'`),
  `height` (220, utilisé en mode `fixed`), `gap` (jeu sous le plafond en mode `ceiling`, 2),
  `doorCount` (calculé à la pose : `max(1, round(width / 55))`, modifiable), `doorType`
  (`'hinged' | 'sliding'`), `color` (`#e8e1d4`).
- Invariant : le placard tient dans la longueur de son mur (comme une ouverture). Il suit le mur
  quand celui-ci bouge ; si le mur devient trop court, la commande est refusée.

### 4.5 Objets
- Nouveau champ `pose: 'floor' | 'covering' | 'onTop' | 'tuckable' | 'wall'` sur `PlacedObject`
  et sur `CustomObjectDef`.
- `CatalogEntry` reçoit `pose` (mode par défaut) et `acceptsUnder?: boolean` (tables, bureaux :
  acceptent les objets `tuckable` en dessous).
- Sémantique de `elevation` : hauteur du dessous de l'objet, pour tous les modes.

### 4.6 Format de fichier
- `FORMAT_VERSION = 2`. Migration 1 vers 2 : `slopes`, `beams`, `cupboards` vides ; `pose` déduit
  de l'entrée du catalogue (ou `floor` pour les objets génériques et "Mes objets", sauf nom
  contenant "tapis" : `covering`).
- Le schéma de validation et les bornes de la V1 s'appliquent aux nouveaux champs (valeurs
  finies, longueurs positives, coordonnées bornées, clés égales aux identifiants).

## 5. Géométrie et contrôles (`src/core`)

### 5.1 Hauteur sous plafond
- `ceilingWithoutBeams(level, p)` = minimum de `level.height` et de la hauteur de chaque pente
  dont la zone d'effet contient `p`.
- `ceilingAt(level, p)` = minimum de `ceilingWithoutBeams(level, p)` et du dessous de chaque
  poutre dont l'emprise contient `p`.
- `ceilingUnder(level, footprint)` -> `{ height, at }` : hauteur minimale sous toute l'emprise.
  Calcul exact : l'emprise est découpée par les bandes des pentes ; le minimum d'un plan sur un
  polygone est atteint à un sommet, donc on évalue les sommets du découpage ; chaque poutre qui
  intersecte l'emprise contribue son dessous minimal sur l'intersection.
- Lignes de niveau : pour chaque pente, segments aux hauteurs multiples de 20 cm strictement
  comprises entre `heightStart` et `heightEnd`, plus les lignes de départ et d'arrivée.

### 5.2 Placards
- Rectangle au sol plaqué sur la face du mur (côté `side`), de `width` x `depth`.
- Profil du dessus : mode `fixed` -> hauteur `height` constante (façades de `plinth` à `height`) ;
  mode `ceiling` -> ligne brisée `ceilingAt(face avant et arrière, le long de la largeur) - gap`, points de cassure aux
  intersections avec les lignes de pente et les bords de poutres, minimum entre avant et arrière.

### 5.3 Pose des objets
- Tranche verticale d'un objet : `[elevation, elevation + height]`.
- Pose `onTop` : au dépôt (outil Sélection, catalogue), `elevation` = dessus le plus haut des
  objets `floor` (ou `tuckable`) dont l'emprise contient le centre de l'objet, sinon 0.
- Pose `wall` : au dépôt, l'objet se plaque contre la face de mur la plus proche (dos contre le
  mur), `elevation` conservée (défaut du catalogue).

### 5.4 Vérifications
`computeChecks(level, derived, customObjects) -> Check[]`, mis en cache par identité du niveau.
`Check = { id, severity: 'error' | 'warning', kind, message, targets: SelectionItem[] }`.

| Type | Règle | Gravité | Message (exemple) |
|---|---|---|---|
| Hauteur | `elevation + height > ceilingUnder(emprise).height + 1` ; placards en mode `fixed` idem | erreur | "Armoire : monte à 2,00 m, plafond à 1,54 m à cet endroit." |
| Collision | emprises qui se recouvrent de plus de 1 cm² et tranches verticales qui se recouvrent de plus de 1 cm, sauf : `covering` contre tout ce qui n'est pas `covering` ; `tuckable` sous un objet `acceptsUnder` ; `onTop` contre son support | erreur | "Lit et Bureau se chevauchent." |
| Empiètement | emprise d'un objet (non `covering`) qui entre dans la forme des murs de plus de 1 cm² ; placards non concernés | erreur | "Commode : empiète sur un mur." |
| Ouverture | objet (non `covering`, dessous sous 200 cm) dans l'arc d'une porte battante ou d'une porte de placard battante | erreur | "Fauteuil : gêne l'ouverture de la porte." |
| Placard devant une ouverture | placard dont l'intervalle sur le mur recouvre une porte (erreur) ou une fenêtre (avertissement) du même côté | erreur / avertissement | "Placard : devant une fenêtre." |
| Posé dans le vide | objet `onTop` sans support à sa hauteur (tolérance 1 cm) | avertissement | "TV : aucun support en dessous." |
| Dégagement placard | distance libre devant le placard, sur sa largeur, jusqu'au premier objet ou mur : < 60 cm | avertissement (< 30 cm : erreur) | "Placard : 40 cm de passage devant (60 cm conseillés)." |

Les objets sont comparés par paires après un tri par boîtes englobantes. Les messages utilisent
le nom de l'objet ; deux objets de même nom sont distingués ("Bureau (1)", "Bureau (2)").

## 6. Dimensions des pièces et tracé des murs

- **Outil Pièce rectangulaire** : le rectangle tracé ou saisi est l'intérieur de la pièce ; les
  murs sont créés à l'extérieur (axe à `épaisseur / 2` au-delà de chaque face). L'aperçu et les
  cotes dynamiques affichent les dimensions intérieures. Un coin posé sur un mur existant suit
  les règles de la V1 (jonction en T).
- **Outil Mur** : ligne de référence au choix dans une petite barre au-dessus du plan
  (`axe` par défaut, `face gauche`, `face droite`) ; `Espace` inverse le côté pendant le tracé.
  La chaîne tracée est décalée de `± épaisseur / 2` (décalage de polyligne avec coins en onglet)
  avant création des murs. Le choix est mémorisé pendant la session.
- **Modifier une pièce** :
  - pièce rectangulaire (4 faces à angle droit) : le panneau de la pièce affiche largeur et
    profondeur intérieures, modifiables ; un sélecteur indique le côté qui bouge (par défaut
    droite / bas dans le repère de la pièce) ;
  - double-clic sur une cote intérieure d'une pièce rectangulaire : saisie de la nouvelle valeur,
    même effet ;
  - l'effet est le déplacement du mur concerné le long de sa normale (les murs voisins
    s'allongent ou se raccourcissent) ; si ce mur est partagé avec une autre pièce, celle-ci
    change en conséquence (signalé dans le message de confirmation du panneau) ;
  - pour tout mur, le panneau affiche aussi la longueur de chacune de ses faces.

## 7. Éditeur 2D et interface

### 7.1 Nouveaux outils
| Outil | Touche | Comportement |
|---|---|---|
| Pente | T | Clic, clic : ligne de départ ; déplacement : côté et profondeur (cote dynamique) ; clic : création ; puis champ numérique hauteur de départ, Tab, hauteur d'arrivée, Entrée. Échap pendant les hauteurs garde les valeurs par défaut. |
| Poutre | B | Clic, clic (magnétisme sur nœuds, axes et faces de murs), création avec les valeurs par défaut. |
| Placard | K | Aperçu au survol d'un mur, plaqué sur la face côté souris, recalé pour tenir dans le mur, rouge s'il ne tient pas ; clic pour poser ; l'outil reste actif. |

Outil Sélection : sélection, déplacement et suppression des pentes (poignées sur les lignes de
départ et d'arrivée, déplacement de l'ensemble), des poutres (poignées aux extrémités) et des
placards (glissement le long du mur). Une seule entrée d'historique par geste.

### 7.2 Panneau de propriétés
- Pente : hauteur au départ, hauteur à l'arrivée, profondeur, inverser le sens.
- Poutre : largeur, retombée, mode de hauteur, hauteur du dessous (mode fixe), longueur.
- Placard : largeur, profondeur, socle, mode de hauteur, hauteur ou jeu, nombre et type de portes,
  couleur ; affiche la hauteur résultante (minimum et maximum sous une pente).
- Objet : menu "Pose" (Au sol, Revêtement, Posé sur un meuble, Rangé dessous, Mural).
- Pièce : largeur et profondeur intérieures (pièce rectangulaire).

### 7.3 Dessin sur le plan (couches ajoutées)
- Pentes (au-dessus des pièces, sous les objets) : dégradé bleu léger dans la bande, lignes de
  niveau en tirets avec leur hauteur, ligne de départ et ligne d'arrivée en trait plein.
- Placards (avec les objets) : rectangle, traits des portes, arcs des portes battantes, poignées ;
  zone de dégagement de 60 cm en orange léger quand le placard est sélectionné.
- Poutres (au-dessus des objets) : contour en pointillés et hauteur libre ("2,25 m").
- Alertes : contour rouge (erreur) ou orange (avertissement) sur les éléments concernés.
- Mode impression (export PDF/PNG) : pentes, poutres et placards dessinés ; alertes jamais
  dessinées.

### 7.4 En-tête, panneau Vérifications, catalogue
- En-tête : boutons "Plan", "3D", "Plan + 3D" ; compteur "N alertes" (rien si zéro) qui ouvre le
  panneau Vérifications.
- Panneau Vérifications (repliable) : une ligne par alerte, icône rouge ou orange, clic =
  sélection des éléments et centrage de la vue ; case "Masquer les alertes".
- Catalogue : `pose` et `acceptsUnder` sur chaque entrée existante ; nouvelles entrées :
  TV (à poser) 100 x 20 x 60 `onTop`, TV murale 110 x 8 x 65 `wall` (pose à 110 cm),
  étagère murale 80 x 25 x 3 `wall` (pose à 150 cm), tapis rond diamètre 120 `covering`,
  tapis 170 x 120 `covering`, plante 40 x 40 x 90 `floor`, lampe de chevet 25 x 25 x 45 `onTop`,
  micro-ondes 50 x 40 x 30 `onTop`, pouf diamètre 50 `tuckable`. Les chaises et tabourets
  deviennent `tuckable`, les tables et bureaux `acceptsUnder`.

## 8. Vue 3D

### 8.1 Architecture
- `src/core/mesh/` (pur, testé) : génère des maillages `{ positions, normals, uvs, indices }`
  pour les murs, sols, plafonds, poutres et placards d'un niveau.
  - Murs : forme 2D des murs (avec portes évidées) découpée aux lignes de pente, extrudée du sol
    jusqu'à `min(hauteur du mur, ceilingWithoutBeams)` à chaque sommet ; allèges et linteaux des
    fenêtres ajoutés en blocs.
  - Sols : polygone de chaque pièce (îlots exclus), UV en mètres.
  - Plafonds : polygone de chaque pièce découpé aux lignes de pente, sommets à
    `ceilingWithoutBeams`.
  - Poutres : boîtes orientées (inclinées sous une pente en mode `ceiling`).
  - Placards : socle, caissons et façades selon le profil du dessus, poignées.
- `src/scene3d/` (Three.js, navigateur) : conversion des maillages, constructeurs de meubles par
  entrée du catalogue (repris des constructeurs de `plan-chambre`), portes (vantail ouvert à 70°)
  et fenêtres (cadre, vitrage), étiquettes, caméra et contrôles, masquage des murs, sélection.
- Composant React `Plan3DView` hébergeant le canvas ; Three.js importé dynamiquement.

### 8.2 Rendu (repris de `plan-chambre`)
- `WebGLRenderer` antialias, `pixelRatio` max 2, `ACESFilmicToneMapping`, exposition 1,0, ombres
  `PCFSoftShadowMap`.
- Lumières : `HemisphereLight('#ffffff', '#d9cfc1', 1.6)` ; `DirectionalLight('#fff4e2', 1.8)`
  avec ombres (carte 2048, flou 4, biais -0.0004, cadrage adapté à l'emprise du niveau).
- Fond `#eef0f4`. Murs `#f2eee7`, plafond `#f6f3ee`, dalle `#b9b1a5`, cadres `#fbfbfa`,
  vitrage `#bcd7f0` à 55 %, portes `#fbfaf7`, poutres `#a07e5c`, placards `#e8e1d4`, poignées
  `#8f8a82`.
- Parquet : texture canvas 1024 px, lames de 16 cm de longueurs aléatoires (graine fixe), teinte
  bois claire, joints sombres, rugosité 0,7. Tapis : texture canvas (motif de `plan-chambre`).
- Meubles : `MeshStandardMaterial` rugosité 0,8, arêtes arrondies (`RoundedBoxGeometry`),
  couleur de l'objet appliquée aux parties principales.
- Étiquettes : pastilles HTML (`CSS2DRenderer`) blanches, bord et texte `#2438a0`, case
  "Noms des objets".
- Alertes : teinte rouge (`#cf2e2e`) ou orange (`#e08a1e`) mélangée à la couleur des objets en
  alerte ; désactivée par "Masquer les alertes".

### 8.3 Navigation et affichage
- `PerspectiveCamera(45)` et `OrbitControls` (amorti, angle polaire max 0,495 pi, distance
  bornée selon la taille du niveau).
- Vues prédéfinies animées (750 ms) : "Vue d'ensemble", "Dessus", "Depuis la pièce
  sélectionnée" (caméra dans la pièce, à 160 cm de hauteur, regard vers son centre).
- Masquage : un mur est masqué quand le segment caméra -> cible traverse son emprise ; plafonds
  et rampants masqués quand la caméra est au-dessus ; case "Cacher tous les murs".
- Niveau affiché : le niveau actif ; case "Afficher les niveaux inférieurs" (empilés selon
  l'ordre des onglets et leur altitude).
- Clic sur un objet, un placard ou une poutre : sélection dans le plan.
- Reconstruction ciblée : murs, sols, plafonds et poutres reconstruits quand nœuds, murs,
  ouvertures, pentes ou poutres changent ; meubles et placards reconstruits individuellement ;
  ressources libérées (`dispose`).
- Rendu à la demande : une image seulement quand la caméra bouge ou que la scène change.
- Disposition : `Plan`, `3D` (pleine largeur) ou `Plan + 3D` (côte à côte, séparation
  redimensionnable). Le choix est mémorisé dans l'affichage de l'éditeur.

## 9. Déploiement (préparation)

- `vite.config.ts` lit `base` dans une variable d'environnement (`BASE_PATH`, défaut `/`).
- Workflow `.github/workflows/deploy.yml` : build avec `BASE_PATH=/plan-maison/` et publication
  sur GitHub Pages au push sur `main`. Le fichier est créé mais rien n'est poussé.
- README : section "Publier sur GitHub Pages" (dépôt public, activation de Pages, données propres
  à chaque navigateur et adresse, passage par l'export `.json`).

## 10. Gestion des erreurs

- Les contrôles ne bloquent jamais une action.
- Commandes refusées (message en français, modèle inchangé) : placard qui ne tient pas sur son
  mur, pente ou poutre de longueur nulle, hauteurs ou dimensions non positives.
- Échec d'initialisation WebGL : la vue 3D affiche "La 3D n'est pas disponible sur ce
  navigateur." et l'éditeur 2D reste utilisable.
- Toute erreur de rendu 3D est confinée par une barrière d'erreur autour de `Plan3DView`.
- Une géométrie dégradée (V1, R37) produit une 3D simplifiée sans planter.

## 11. Tests

- Vitest (`src/core`) :
  - `ceilingAt` / `ceilingUnder` : pièce de `plan-chambre` (4,00 x 4,00, 2,40 à 1,50 m à partir de
    1,97 m) : `ceilingAt` à x = 300 vaut `240 - (300 - 197) * 90 / 203` (environ 194,3) ; armoire
    100 x 60 x 200 occupant x de 330 à 390 -> `ceilingUnder` environ 154,4 (hauteur à x = 390) ; pentes croisées (toit à deux pans) ; poutres fixes et
    sous plafond.
  - Lignes de niveau, profil des placards (fixe, plafond, sous poutre).
  - Chaque règle de vérification avec un cas positif et un cas négatif, dont : tapis sous lit
    (aucune alerte), TV `onTop` sur meuble TV (aucune), chaise sous bureau (aucune), chaise sous
    lit (collision), TV murale au-dessus d'un meuble bas (aucune), objet dans l'arc de porte.
  - Commandes des pentes, poutres, placards et dimensions de pièce (refus et aller-retour annuler).
  - Migration V1 vers V2 et refus d'un fichier V3.
  - Maillages : bornes, hauteurs des sommets sous une pente, absence de NaN, triangles orientés.
- Playwright :
  - parcours "chambre sous les toits" (critère de réussite), contrôles affichés et panneau ;
  - Pièce rectangulaire 400 x 300 -> "12,00 m²" ;
  - modification de la largeur intérieure d'une pièce ;
  - vue 3D : ouverture sans erreur console, vues prédéfinies, sélection par clic, Plan + 3D.
- Vérification visuelle sur captures : plan avec pente, poutre et placards ; vues 3D comparées à
  celles de `plan-chambre`.

## 12. Phases

1. **Volumes et contrôles en 2D** : modèle, migration, géométrie, vérifications, outils Pente,
   Poutre, Placard, modes de pose, dimensions de pièces, panneau Vérifications, catalogue.
2. **Vue 3D** : maillages, scène, rendu, navigation, masquage, sélection, disposition.
3. **Déploiement et finitions** : configuration GitHub Pages, parcours complet, README.

Chaque phase laisse l'application utilisable.
