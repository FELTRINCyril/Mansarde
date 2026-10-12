# Limites connues

Ce que Mansarde ne fait pas, ou fait avec des restrictions.

## Plan et volumes

- Murs droits uniquement : pas de murs courbes.
- Pas de trémies (ouvertures dans les planchers) ni de terrain.
- Pas de modèle de toiture complet (pans, faîtage, croupes, lucarnes) : les rampants sont des
  pentes planes, qu'on peut combiner (deux pentes face à face pour un toit à deux pans).
- Pas d'étagères ouvertes, de placards hauts posés sur un meuble ni de niches. Les placards sont
  plaqués contre un mur droit.
- Les escaliers ne sont pas contrôlés en hauteur (ils traversent les niveaux) : un escalier sous
  une pente basse n'est pas signalé.
- Les dégagements mesurés pendant un déplacement vont jusqu'aux murs, pas jusqu'aux autres
  meubles. Le contrôle "passage devant un placard", lui, tient compte des meubles.
- Les cotes automatiques dont le texte deviendrait illisible (vue trop dézoomée, échelle
  d'impression trop petite, texte sur un autre texte) ne sont pas dessinées ; les cotes
  manuelles le sont toujours.
- Pour une géométrie très complexe, le plan peut passer en affichage simplifié ("Géométrie
  complexe : affichage simplifié.") ; une modification dont la géométrie ne peut pas être
  calculée est refusée.
- Pas de liste d'achats ni d'export CSV.

## Vue 3D

- Vue de consultation seulement : pas de modification dans la 3D, pas de visite à hauteur
  d'oeil en marchant, pas de vue en coupe.
- La 3D sollicite la carte graphique ; sur un ordinateur sans accélération graphique, elle peut
  être lente. Sans WebGL, elle ne s'affiche pas (le plan reste utilisable).

## Export

- PDF : formats A4 et A3, échelles 1/20, 1/50, 1/100 et 1/200.
- PDF : police Helvetica, les caractères hors de l'alphabet latin ne s'y affichent pas.
- PDF : les pentes sont teintées d'une couleur uniforme (pas de dégradé).
- Image de fond : PNG ou JPEG uniquement, une image par niveau.

## Données et usage

- Usage à la souris et au clavier sur ordinateur : pas d'usage tactile (tablette, téléphone).
- Testée sous Chromium (Chrome, Edge).
- Les projets sont stockés dans le navigateur : effacer les données du site ou changer de
  navigateur les fait disparaître. Exportez régulièrement vos projets en `.json` (voir
  [Export et sauvegarde](export-et-sauvegarde.md)).
- Pas de compte, de synchronisation ni de partage par lien : pour transmettre un projet, envoyez
  son fichier `.json`.
- Un projet enregistré dans un format que cette version ne sait pas lire apparaît comme "Projet
  illisible" sur l'écran des projets, où il peut seulement être supprimé.
- L'historique d'annulation dure le temps de la session : il est vidé à la fermeture du projet.
