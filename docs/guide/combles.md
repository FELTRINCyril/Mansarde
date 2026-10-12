# Combles : pentes, poutres et placards

Sous les toits, la question n'est pas seulement "est-ce que ça rentre au sol ?" mais "est-ce que
ça passe sous le rampant ?". Mansarde décrit le plafond avec des pentes et des poutres, et ajoute
des placards muraux qui épousent ce plafond. Les meubles trop hauts sont signalés (voir
[Vérifications](verifications.md)).

![Une chambre sous les toits : pente en dégradé bleu, lignes de hauteur, placard et alertes](../images/combles-verifications.png)

## Hauteur sous plafond du niveau

Le plafond de référence est la "Hauteur sous plafond" du niveau (panneau "Niveau", rien de
sélectionné). Les pentes et les poutres le font descendre localement.

## Les pentes (rampants)

### Tracer une pente (touche T)

1. Cliquez deux points : c'est la **ligne de départ**, là où le plafond commence à descendre.
   Comme pour un mur, un repère montre où chaque point s'accroche (jonction, mur, face de mur,
   grille) ; Maj garde la ligne horizontale ou verticale, Alt pose un point libre.
2. Déplacez la souris : elle choisit le côté vers lequel le plafond descend et la
   **profondeur** de la pente (une cote dynamique l'affiche).
3. Cliquez : un champ s'ouvre avec la "Hauteur au départ", préremplie avec la hauteur sous
   plafond du niveau.
4. Tapez la hauteur au départ, Tab, la "Hauteur à l'arrivée" (1,50 m par défaut), puis Entrée.

La pente est créée et sélectionnée ; l'outil reste actif pour la suivante. Échap (ou un clic
hors du champ) pendant la saisie des hauteurs crée la pente avec les valeurs déjà tapées et les
valeurs par défaut pour les autres. Avant cette étape, Échap ou Ctrl+Z abandonnent la pente en
cours.

Les points s'accrochent aux jonctions, aux milieux, aux axes et aux faces des murs, puis aux
alignements, aux angles et à la grille. Alt donne un point libre.

### Comment une pente agit

- La pente couvre une **bande** : la largeur de sa ligne de départ, du côté choisi.
- Dans cette bande, le plafond descend en ligne droite de la hauteur au départ à la hauteur à
  l'arrivée sur la profondeur, puis reste à la hauteur d'arrivée au-delà.
- De l'autre côté de la ligne de départ, la pente n'a aucun effet.
- Le plafond retenu en chaque point est le plus bas entre la hauteur du niveau et toutes les
  pentes qui le couvrent.

Conseil : tracez la ligne de départ d'un mur à l'autre (par exemple d'une face extérieure à
l'autre) pour que la pente couvre toute la pièce. Plusieurs pentes se combinent : deux pentes
face à face donnent un toit à deux pans.

Les hauteurs d'une pente sont absolues : si vous montez ensuite la hauteur du niveau, une marche
apparaît au niveau de la ligne de départ.

### Sur le plan

- Un dégradé bleu léger dans la bande, plus soutenu vers le plafond bas.
- Des lignes de hauteur en tirets, tous les 20 cm, avec leur hauteur (seulement sous la hauteur
  du niveau).
- La ligne de départ et la ligne d'arrivée en trait plein.

Dans le PDF, la bande est teintée d'une couleur uniforme (sans dégradé).

### Modifier une pente

- **Sélection** : cliquez près de sa ligne de départ ou de sa ligne d'arrivée. Un clic au milieu
  de la bande sélectionne la pièce, pas la pente.
- **Poignées** : les extrémités de la ligne de départ, et le milieu de la ligne d'arrivée pour la
  profondeur. Glisser la pente ailleurs la déplace en entier.
- **Panneau "Pente"** : "Hauteur au départ", "Hauteur à l'arrivée", "Profondeur" et le bouton
  "Inverser le sens" (le plafond descend de l'autre côté de la ligne de départ).

## Les poutres

### Poser une poutre (touche B)

Cliquez les deux extrémités de la poutre (même magnétisme et même repère que les pentes, Maj
pour une poutre horizontale ou verticale, Alt pour un point libre). Elle est créée avec les valeurs par défaut et sélectionnée ; l'outil reste actif.

### Réglages (panneau "Poutre")

| Réglage | Par défaut | Rôle |
|---|---|---|
| "Largeur" | 12 cm | Largeur de la poutre en plan |
| "Retombée" | 15 cm | Hauteur de la poutre sous le plafond |
| "Hauteur" | "Sous le plafond" | "Sous le plafond" ou "Hauteur fixe" |
| "Hauteur du dessous" | hauteur du niveau moins la retombée | Visible en "Hauteur fixe" |
| "Longueur" | - | En lecture seule |

- **"Sous le plafond"** : la poutre est collée au plafond et le suit, y compris sous une pente
  (elle s'incline avec elle). Son dessous est à la hauteur du plafond moins la retombée.
- **"Hauteur fixe"** : le dessous de la poutre est à la hauteur saisie. Si le plafond est plus
  bas, la poutre est coupée par le plafond.

### Sur le plan

La poutre est dessinée en pointillés, avec sa hauteur libre (le point le plus bas de son
dessous, par exemple "2,25 m"). Ses poignées sont à ses extrémités ; glissez-la pour la
déplacer.

Une poutre abaisse le plafond sous elle : elle compte pour les vérifications de hauteur et pour
les placards "Jusqu'au plafond".

## Les placards muraux

### Poser un placard (touche K)

Survolez un mur : l'aperçu du placard se plaque contre la face du mur du côté de la souris,
centré sous le curseur et recalé pour tenir sur la partie libre de cette face (il s'arrête à la
face du mur d'angle). En rouge, il ne tient pas ("Pas assez de place sur ce mur"). Cliquez pour
le poser ; il est sélectionné et l'outil reste actif. Alt le place au millimètre.

### Réglages (panneau "Placard")

| Réglage | Par défaut |
|---|---|
| "Largeur" | 1,20 m |
| "Profondeur" | 60 cm |
| "Socle" | 10 cm |
| "Hauteur" | "Jusqu'au plafond" (ou "Hauteur fixe") |
| "Jeu sous le plafond" (mode "Jusqu'au plafond") | 2 cm |
| "Hauteur totale" (mode "Hauteur fixe") | 2,20 m |
| "Nombre de portes" | environ une porte par 55 cm (2 pour 1,20 m), de 1 à 20 |
| "Portes" | "Battantes" (ou "Coulissantes") |
| "Couleur" | beige clair |

- **"Jusqu'au plafond"** : le dessus du placard suit le plafond le plus bas sur toute sa
  profondeur (pentes et poutres comprises), moins le jeu. Sous un rampant, sa façade est donc
  biaise.
- **"Hauteur résultante"** (lecture seule) : la hauteur réelle obtenue, par exemple "2,20 m",
  ou "de 1,48 m à 2,38 m" sous une pente.
- **"Changer de face"** : place le placard contre l'autre face du même mur.
- Élargir un placard l'agrandit des deux côtés, puis le recale sur la partie libre de sa face.
  Le nombre de portes n'est pas recalculé quand la largeur change.
- Un socle qui atteint le dessus du placard est refusé : "Socle plus haut que le dessus du
  placard.".

### Déplacer un placard

Avec l'outil Sélection, glissez-le : il coulisse le long de son mur, ou passe sur un autre mur
survolé (contre la face du côté de la souris). Une position où il ne tient pas est dessinée en
rouge, et le placard reprend sa place au lâcher. Les flèches du clavier le font aussi coulisser.

Le placard suit son mur quand celui-ci bouge. Si le mur devient trop court pour lui, la
modification du mur est refusée. Supprimer le mur supprime le placard.

### Dupliquer un placard

Le bouton "Dupliquer" du panneau (ou Ctrl+D) crée un placard identique (largeur, profondeur,
hauteur, socle, portes, couleur) contre la même face du mur, au plus près de l'original : juste
après, sinon juste avant, sinon dans le premier espace libre de la face. La copie ne chevauche
jamais un autre placard, y compris un placard d'angle posé sur le mur voisin. Plusieurs
placards sélectionnés sont copiés à la suite les uns des autres. Si aucun espace de la largeur
du placard ne reste sur cette face, la copie est refusée avec le message "Pas assez de place sur
ce mur pour un autre placard.".

Sous un rampant, un placard "Jusqu'au plafond" est copié au premier emplacement où sa hauteur
tient. Les pentes et les poutres se dupliquent aussi, décalées de 20 cm.

### Sur le plan

Le placard est dessiné avec ses portes : panneaux et arcs d'ouverture pour des portes
battantes, deux rails pour des portes coulissantes, et les poignées. Sélectionné, il montre en
orange léger la zone de 60 cm conseillée devant lui pour circuler.

Un placard de hauteur fixe peut porter des objets (une lampe posée dessus) ; un placard
"Jusqu'au plafond" n'en porte pas.

### Vérifications liées aux placards

Un placard peut déclencher ces alertes (détail dans [Vérifications](verifications.md)) :
placard devant une porte, une fenêtre ou un passage ; passage insuffisant devant lui ; placard
de hauteur fixe trop haut sous le plafond ; placard "Jusqu'au plafond" sans assez de hauteur ;
placard qui empiète sur un mur ; meuble qui gêne l'ouverture de ses portes battantes ; placard
qui en chevauche un autre ou un meuble.
