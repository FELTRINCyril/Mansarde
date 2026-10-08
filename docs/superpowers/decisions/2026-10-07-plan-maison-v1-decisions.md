# Plan Maison V1 : décisions prises pendant l'implémentation

Ces décisions ont été prises par l'orchestrateur sans attendre de validation, pour ne pas
bloquer le travail. Chaque ligne indique ce qui a été décidé, pourquoi, et ce que ça coûte si
c'est un mauvais choix. Toutes sont réversibles.

## Géométrie

- **R7** : la pointe d'un angle entre deux murs est tronquée seulement sous 15°, comme dans la
  spec (le plan disait ~29°). Coût : pointes un peu plus longues entre 15° et 29°.
- **R8** : la forme des murs est l'union des rectangles bruts et des remplissages d'angle
  extérieurs (exacte même avec des épaisseurs très différentes). Coût : le contour de sélection
  d'un mur peut garder une encoche minuscule à ces jonctions.
- **R9** : une pièce enfermée dans une autre (placard, WC) est exclue de la surface de la pièce
  qui l'entoure, et chacune garde son nom.
- **R11 / R30** : un point (tracé, coin de rectangle, coin déplacé) qui tombe sur l'axe d'un mur
  coupe ce mur et crée une jonction en T. Coût : coupe inattendue si un point tombe pile sur un
  axe (géométrie identique).
- **R16** : pendant le tracé à la souris, les longueurs sont arrondies au pas de la grille
  (10 cm). Alt ou la saisie au clavier permettent une longueur libre.
- **R17** : le magnétisme vise les axes des murs, pas leurs faces. Coût : pas de cote face à
  face par magnétisme (points libres possibles).
- **R29** : les distances d'une porte ou fenêtre se mesurent jusqu'à la face intérieure du mur
  voisin, pas jusqu'à son axe.
- **R37 / R41** : une erreur de la bibliothèque de géométrie ne doit jamais planter
  l'application : nouvel essai avec coordonnées arrondies, sinon affichage simplifié signalé
  par un bandeau ; une modification qui rendrait le plan incalculable est refusée.
- **R40** : les limites internes de la bibliothèque `polygon-clipping` sont abaissées au build
  pour éviter des gels de plusieurs secondes. Si une mise à jour change son code, le build
  échoue volontairement. Coût : au-delà d'environ 1 700 murs sur un niveau, le calcul passe par
  une méthode plus lente (irréaliste pour un logement).

## Modèle et commandes

- **R10** : fusionner deux points reporte les cotes accrochées au lieu de les supprimer.
- **R13** : un niveau dupliqué (variante) garde la même altitude que l'original.
- **R14** : l'ordre des onglets de niveaux fait foi pour l'empilement ; l'altitude est une
  simple propriété (utile en V2 pour la 3D).
- **R22** : la forme en L d'un objet est copiée dans l'objet posé ; modifier ensuite la
  définition dans "Mes objets" ne change pas les objets déjà posés.

## Sauvegarde et fichiers

- **R2** : dupliquer ou importer un projet renouvelle tous les identifiants (projet totalement
  indépendant).
- **R15** : les images de fond inutilisées sont nettoyées à l'ouverture d'un projet, pas après
  chaque sauvegarde (sinon annuler la suppression d'une image ne pourrait plus la restaurer).
- **R18** : quitter l'éditeur ou fermer l'onglet enregistre toujours la dernière modification.
- **R19** : ouvrir un projet sans le modifier ne le réenregistre pas.
- Import : tout fichier incohérent, piégé ou plus récent est refusé avec un message en
  français, sans rien importer.

## Interface et saisie

- **R5** : une valeur saisie au-delà de 1 km (100 000 cm) est refusée.
- **R26** : altitude, allège, hauteur de pose, décalage et rotation acceptent 0 et les valeurs
  négatives quand c'est pertinent.
- **R28** : ajout de l'aperçu des plans dans la liste des projets et des propriétés communes
  en sélection multiple (prévus par la spec, oubliés par le plan).
- **R31** : Tab + distance tapée fonctionne aussi sur une porte ou fenêtre sélectionnée seule.
- **R32** : pendant un tracé de mur, Cmd+Z retire le dernier point posé (l'historique n'est
  pas touché). Le libellé du champ de saisie s'affiche en entier au-dessus du champ.
- **R33** : Échap dans le champ de distance annule toute l'opération, même souris relâchée.
- **R36** : une distance refusée rouvre le champ en rouge avec la valeur reformatée.

## Rendu et export

- **R21** : les noms de pièces s'affichent au-dessus des meubles (écart à l'ordre des couches
  de la spec : un lit masquait le nom).
- **R23** : la surface d'une pièce trop petite pour l'afficher est masquée ; les cotes
  verticales se lisent de bas en haut (norme ISO 129).
- **R24** : le dessin du PDF peut déborder de 5 mm dans les marges pour ne pas couper les
  textes des cotes de façade ; l'échelle reste exacte.
- **R25 / R39** : seuls les battants de porte agrandissent la zone imprimée ; les arcs de
  fenêtre restent dessinés (fins, pointillés) sans l'agrandir.
- **R35** : un fond clair sous les noms de pièces masque une petite zone de l'image de fond
  derrière le nom, pour la lisibilité.
- **R38** : les cotes de largeur des portes et fenêtres ne sont jamais masquées ; si d'autres
  cotes illisibles sont masquées à l'export, le dialogue le signale et propose une échelle
  plus grande.

## Organisation du travail

- **R20** : à la demande de l'utilisateur, l'implémentation est passée en vagues parallèles
  (copies de travail Git séparées, fusion par l'orchestrateur après revue).
- R1, R3, R4, R6, R12, R27 : choix techniques internes sans effet visible (ordre des tâches,
  validation des invariants en développement, emplacement de tests, forme d'une fonction).
