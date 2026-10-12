# Raccourcis clavier et souris

Sur macOS, Cmd remplace Ctrl. Les raccourcis ne s'appliquent pas pendant la saisie dans un champ
de texte, ni quand une fenêtre (Réglages, Exporter, confirmation) est ouverte. Ils restent actifs
en vue "3D" seule : le plan, masqué, garde la main sur le clavier.

## Outils

Chaque outil a sa lettre, rappelée sous son icône dans la barre de gauche.

| Touche | Outil |
|---|---|
| V | Sélection |
| M | Mur |
| R | Pièce rectangulaire |
| P | Porte |
| F | Fenêtre |
| C | Cote |
| T | Pente |
| B | Poutre |
| K | Placard |

## Tracé

| Touche ou geste | Effet |
|---|---|
| Clic, clic... (outil Mur) | Ajoute un point à la suite de murs |
| Double-clic, Entrée ou Échap (outil Mur) | Termine la suite de murs (au moins deux points) |
| Clic sur le point de départ (outil Mur) | Ferme la suite de murs et la termine |
| Ctrl+Z pendant un tracé de murs | Retire le dernier point |
| Espace (appui bref) pendant le tracé d'un mur | Change de face de référence (face gauche ou face droite) |
| Glisser (outil Pièce rectangulaire) | Trace l'intérieur de la pièce |
| Chiffres pendant un tracé | Ouvrent le champ de saisie : longueur d'un mur, largeur d'une pièce, hauteurs d'une pente |
| Tab dans le champ de saisie | Passe à la valeur suivante (profondeur d'une pièce, hauteur d'arrivée d'une pente) ; Maj+Tab revient |
| Entrée dans le champ de saisie | Valide la valeur |
| Ctrl maintenu pendant un clic de tracé (mur ou pièce) | Trace des cloisons (épaisseur des cloisons des réglages) |
| Maj maintenu | Angles droits |
| Alt maintenu | Sans magnétisme ; les portes, fenêtres et placards se posent au millimètre |
| Ctrl+Z pendant le tracé d'une pièce, d'une pente ou d'une poutre | Abandonne le tracé en cours |
| Échap | Abandonne le tracé en cours (pièce, cote, pente, poutre) ; sans tracé en cours, les outils Porte, Fenêtre, Cote, Pente, Poutre et Placard reviennent à l'outil Sélection. Avec l'outil Mur, Échap termine la suite de murs ; pendant la saisie des hauteurs d'une pente, il crée la pente avec les valeurs déjà données |

## Sélection et modification

| Touche ou geste | Effet |
|---|---|
| Clic | Sélectionne l'élément sous le curseur (un clic dans une pièce sélectionne la pièce) |
| Maj+clic | Ajoute l'élément à la sélection ou l'en retire |
| Glisser dans le vide ou dans une pièce | Rectangle de sélection |
| Glisser un élément | Le déplace (une seule étape d'annulation par geste) |
| Poignée ronde d'un objet | Rotation par pas de 15° (libre avec Alt) |
| Poignées carrées d'un objet | Redimensionnement, le côté opposé reste fixe |
| Double-clic dans une pièce | Renommer la pièce |
| Double-clic sur une cote intérieure d'une pièce rectangulaire | Saisir la nouvelle dimension intérieure |
| Tab pendant un déplacement, ou avec un objet ou une ouverture sélectionné | Choisit la cote de dégagement (Maj+Tab en arrière) ; taper une distance puis Entrée place l'élément à cette distance exacte |
| Flèches | Décalent la sélection de 1 cm (10 cm avec Maj) |
| Suppr ou Retour arrière | Supprime la sélection |
| Échap | Annule l'opération en cours, puis vide la sélection |

## Édition

| Touche | Effet |
|---|---|
| Ctrl+Z | Annuler |
| Ctrl+Maj+Z ou Ctrl+Y | Rétablir |
| Ctrl+C | Copier les objets sélectionnés |
| Ctrl+V | Coller (décalés de 20 cm ; coller à nouveau continue le décalage) |
| Ctrl+D | Dupliquer les objets sélectionnés |

Pendant un glisser, Ctrl+Z, Ctrl+Maj+Z et Ctrl+Y abandonnent seulement le geste en cours.

## Vue du plan

| Touche ou geste | Effet |
|---|---|
| Molette | Zoom autour du curseur |
| Espace + glisser, ou glisser avec le bouton du milieu | Déplacer la vue |
| 0 | Tout afficher |

## Vue 3D

| Geste | Effet |
|---|---|
| Glisser avec le bouton gauche | Tourner autour de la scène |
| Glisser avec le bouton droit | Déplacer la vue |
| Molette | Zoomer |
| Clic sur un meuble, un placard ou une poutre | Le sélectionner |
| Glisser la séparation (Plan + 3D) | Partager l'écran entre le plan et la 3D ; quand elle a le focus (touche Tab), les flèches gauche et droite la déplacent aussi |

## Niveaux

| Geste | Effet |
|---|---|
| Clic sur un onglet | Rendre le niveau actif |
| Double-clic sur un onglet | Renommer le niveau |
| Clic droit sur un onglet, ou bouton "..." | Menu du niveau |
