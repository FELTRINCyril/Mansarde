# Catalogue de modèles 3D : décisions prises pendant l'implémentation

Spec : [2026-10-13-catalogue-modeles-3d-design.md](../specs/2026-10-13-catalogue-modeles-3d-design.md).
Les choix de fond (garder les meubles actuels, deux styles triés, contour au trait, couleur sur la
matière principale, préparation par script) ont été validés en conversation le 13/10/2026 ; le
reste a été délégué ("fais tout, veille à ce que l'app reste rapide et utilisable"). Chaque ligne
dit ce qui a été décidé, pourquoi, et ce que ça coûte si c'est un mauvais choix.

## Écarts à la spec

- **Vue de dessus en image** (spec 6, changé le 13/10/2026 après essai par l'utilisateur). Le
  contour au trait calculé sur une grille donnait des bords en escalier et perdait tout ce qui fait
  reconnaître un objet (oreillers, tête de lit) : jugé "très moche" à l'usage. Le plan dessine
  maintenant une image du modèle vu de dessus (caméra orthographique, éclairage rasant, arêtes de
  plus de 35 degrés tracées), 384 px au plus, `public/models/top/<id>.webp`, étirée à la taille de
  l'objet. Le navigateur ne charge que celles des objets posés ; une image absente donne le
  rectangle. Les exports l'intègrent en data URL (matricielle : moins nette qu'un trait en très
  gros plan) ; une image manquante est signalée. La couleur choisie par l'utilisateur ne change que
  la 3D. Les deux points suivants (contours) sont donc caducs.
- **Budget de triangles abaissé** de 10 000 à 5 000 (mesure d'une maison de 300 objets
  différents : 31 images par seconde au lieu de 49 avec les meubles d'origine, voir Mesures).
- **"Ombres des petits objets"** : case de la barre d'outils 3D (pas du menu "Affichage", qui est
  celui du plan), seule option d'affichage mémorisée par le navigateur (`localStorage`), car elle
  dépend de l'ordinateur. Petit objet : posé sur un meuble, tapis, ou plus grande dimension sous
  80 cm.

- **Contours hors du bundle** (spec 5 et 10). La spec mettait les contours 2D dans les données du
  catalogue. Mesuré : 1,66 Mo, soit 349 Ko compressé, trois fois le budget de 120 Ko, à cause
  d'une longue traîne (10 % des modèles dépassent 338 points). Les contours sont donc dans
  `public/models/outlines.json` (112 Ko compressé), chargé une fois, et seulement quand le plan
  montre un modèle téléchargé ; en attendant, l'objet est dessiné par son rectangle. Les exports
  PNG et PDF attendent ce fichier avant de dessiner. Coût : un projet ouvert hors ligne sans
  cache montre des rectangles.
- **Contour plafonné** à 64 points (détail : 32) : simplification jusqu'à 1,6 % de la boîte,
  puis abandon des plus petits anneaux ; un anneau seul trop détaillé est simplifié davantage
  plutôt que retiré.
- **Données en JSON** plutôt qu'en module TypeScript : un tableau littéral de 1 117 objets
  dépasse ce que TypeScript sait typer (TS2590), et le navigateur lit un JSON plus vite. `catalog.ts`
  importe `generated/models.json` ; le test "type-only imports" autorise cette seule importation de
  données.
- **Lien "Crédits"** en bas du panneau Catalogue, et non dans l'en-tête (spec 9) : l'en-tête est
  déjà plein, et le lien est à côté des objets concernés.
- **Quaternius "Ultimate Furniture"** écarté : distribué seulement par un dossier Google Drive.

## Sources et tri

- Kenney Furniture Kit 2.0 (GLB) : 120 objets gardés sur 140 (murs, sols, portes, trophée,
  doublons écartés). Échelle non métrique (environ 1 unité pour 2 m) : dimensions réalistes
  saisies dans `curation/kenney.json`. Escaliers tournés de 90 degrés pour monter dans la
  profondeur, comme les escaliers du catalogue.
- Quaternius (OBJ) : 23 objets. Les fichiers MTL ont tous la même couleur grise (défaut de la
  source) : couleurs rendues d'après le nom des matières (`materialColors`). Modèles tournés de
  -90 degrés (face avant vers +x dans la source).
- Poly Haven : 149 choisis sur vignettes parmi 275 candidats d'intérieur (outils, végétation
  sauvage, lots d'objets écartés) ; 134 tiennent le budget de 150 Ko avec des textures en 512 puis
  128 px ; écartés : 13 trop lourds, 1 sans glTF, 1 fichier invalide.
- Sweet Home 3D (six bibliothèques 1.9.3) : 1 475 modèles ; écartés automatiquement les portes et
  fenêtres (84), les modèles à plus de 8 matières (71), trop lourds (23), les bibelots de moins de
  12 cm, la nourriture, les animaux, les armes, les objets de plus de 6 m, les véhicules et
  personnages ; puis 211 écartés à la revue des planches (vêtements, papeterie, outils,
  signalisation routière, robinetterie seule, jouets, un tapis dont la texture est perdue). Les
  doublons (même nom, tailles à 5 % près) gardent la meilleure source.
- Les mots-clés des règles sont des mots entiers : "glass" isolé écartait les tables en verre,
  "horse" le séchoir ("clothes horse").
- Noms : un même nom dans une catégorie est numéroté ("Chaise", "Chaise 2"...), dans l'ordre des
  sources. Les noms français viennent des catalogues Sweet Home 3D, nettoyés des caractères que
  l'interface interdit.

## Comportement

- **Pose par défaut** (Sweet Home 3D) : tapis en revêtement, chaises et tabourets rangés dessous,
  petits objets (60 cm au plus) d'une liste de mots-clés posés sur un meuble, objets avec une
  élévation source accrochés au mur à cette hauteur, plafonniers et lustres "au sol" à
  250 cm moins leur hauteur (le catalogue ne connaît pas la hauteur du plafond du projet).
- **Matière principale** : la plus grande surface hors matières sombres, métalliques ou
  transparentes, nommée `main` dans le GLB.
- **Échec de chargement** d'un modèle : le rectangle reste, un avertissement console, pas de
  nouvelle tentative pendant la session.
- **Contours 2D** : délai maximal de 15 s ; après un échec, nouvelle tentative au plus tôt 30 s
  plus tard (un plan ouvert est relancé à ce moment-là, un export aussi) ; un export fait sans
  eux (rectangles) le signale par un message.
- **Mémoire 3D** : un modèle qu'aucun objet n'affiche plus est libéré (géométries, textures,
  couleurs) ; reposé, il est rechargé depuis le cache du navigateur.
- **Arrivée des modèles** : les modèles arrivés pendant une même image donnent une seule mise à
  jour de la scène, protégée comme la boucle de rendu (une erreur passe la vue en état d'erreur).
- **Identifiants** figés dans `tools/models/ids.lock` ; un test interdit d'en retirer. Pendant la
  mise au point initiale, le fichier a été régénéré ; il fait foi à partir du premier commit.

## Revue indépendante (13/10/2026)

- **Bloquant corrigé** : attribution CC-BY. La notice Scopia exige de créditer "Space Mushrooms et
  Scopia Visual Interfaces Systems" ; KatorLegaz est sous CC-BY 3.0 United States (Andrew Kator et
  Jennifer Legaz). Les crédits ont maintenant une fiche par bibliothèque : licence (lien vers le
  texte officiel, les deux pour la double licence), attribution exigée, notice livrée
  (`public/models/LICENSES`), page d'origine, et la mention que les modèles ont été convertis,
  simplifiés et leurs textures réduites.
- Corrigés aussi : reconstruction différée hors du filet d'erreur, absence de preuve que le modèle
  s'affiche (compteur `modelsWaiting`, exigé à 0 par les e2e), modèles jamais libérés, contours
  jamais rechargés, caractères non ASCII dans des expressions régulières, accents manquants des
  noms Sweet Home 3D ("Echelle", "Etagère"), monte-escalier rangé en "Structure" (il échappait au
  contrôle de hauteur, désormais en "Divers"), clés et chemins lus dans les archives validés.
- **Non retenu** : Git LFS pour les 53 Mo de binaires (choix de dépôt laissé à l'utilisateur ;
  le déploiement GitHub Pages devrait alors activer LFS) ; mémoïsation du dessin des contours
  (64 points par objet au plus : coût jugé négligeable, non mesuré).

## Revue des vues de dessus (13/10/2026)

- **Export PDF** (bloquant corrigé) : jsPDF réencode un WebP en JPEG opaque, chaque objet non
  rectangulaire sortait sur un carré noir. Les vues de dessus sont réencodées en PNG avant
  l'export (jsPDF garde l'alpha d'un PNG en masque /SMask). Constaté puis vérifié dans un vrai
  navigateur par l'e2e `export-models.spec.ts` (échouait avant, passe après).
- **Collision de clés Sweet Home 3D** (bloquant corrigé, présent depuis le début) :
  `Sheep#desk` et `Ravey#desk`, `Sleipnir1#chair2` et `PeterSmolik#chair2` écrivaient le même
  GLB ; l'objet publié mélangeait les dimensions et le crédit de l'un avec le modèle de l'autre.
  Une clé en collision reçoit maintenant le nom de son auteur (`desk-ravey`), la préparation
  s'arrête si deux modèles visent le même fichier, et `ids.lock` retient le modèle source de
  chaque id (`id <TAB> source`) : la publication refuse qu'un id change de modèle. La branche
  n'étant pas déployée, le verrou a été recréé à cette occasion. Variante trouvée à la revue
  suivante : deux clés égales à la casse près (`glassDoorCabinet`, `glassdoorCabinet`) donnaient un
  seul fichier sur le Mac (système de fichiers insensible à la casse) ; les clés sont comparées en
  minuscules, et la publication vérifie que chaque GLB publié est celui préparé pour son modèle
  (même taille) et qu'aucun GLB n'est publié deux fois (un test le vérifie aussi).
- **Export sans `OffscreenCanvas`** (Safari avant 16.4) : réencodage PNG par un canvas de la page.
- **Poids des PDF** : une vue de dessus en PNG pèse environ 45 Ko contre 7 Ko en WebP (estimation
  de la revue sur 28 images, non mesurée sur un PDF réel) ; un modèle répété ne compte qu'une fois.
  Un plan de 100 modèles différents ajoute donc quelques Mo au PDF. Suite possible si c'est gênant :
  réduire la taille des PNG d'export.
- **Pendant le chargement** d'une vue de dessus, l'écran montre le rectangle de l'objet dessous
  (il n'est jamais invisible) ; une image en échec est retentée au retour du réseau (`online`).
- **Non retenu** : sens d'éclairage des vues de dessus qui tourne avec l'objet (cosmétique) ;
  numérotation des noms ("Bureau 12") qui peut changer quand des modèles entrent ou sortent (sans
  effet sur les projets, le nom étant copié à la pose) ; calcul de `detail` resté dans le contour
  de préparation (sert encore aux tests du contour, qui ne fait plus que rejeter les modèles
  invisibles de dessus).
- 10 % des vues de dessus n'ont pas de canal alpha : vérifié, ce sont des objets qui remplissent
  toute leur emprise vus d'en haut (armoire, chaise Kenney, escalier droit).

## Mesures (13/10/2026, machine de dev)

| Mesure | Avant (`main`) | Après |
|---|---|---|
| Bundle principal (gzip) | 416 Ko | 446 Ko (+30 Ko : liste des 1 117 objets) |
| Module 3D, chargé à la demande (gzip) | 174 Ko | 203 Ko (+29 Ko : chargeur glTF et décodeur meshopt) |
| Crédits, chargés à l'ouverture de la fenêtre (gzip) | - | 13 Ko |
| Contours, chargés si le plan montre un modèle (gzip) | - | 112 Ko |
| Recherche dans le catalogue (une frappe) | - | 0,06 ms |
| 60 objets différents en 3D : appels de dessin | 1 596 (meubles d'origine) | 308 à 341 selon l'échantillon (modèles téléchargés) |
| 60 objets différents en 3D : triangles | 266 000 | 438 000 à 455 000 |
| 60 modèles téléchargés : chargement complet depuis l'ouverture de la 3D | - | 2,6 à 5,4 s (serveur local de dev) |
| GLB publiés | - | 1 117, 39,8 Mo au total, médiane 22 Ko, maximum 149 Ko |

### Maison de 300 objets, puce Apple M2 (vraie carte graphique, 13/10/2026)

12 pièces, 300 objets tous différents (pire cas : une vraie maison répète ses modèles), images
par seconde mesurées pendant une rotation de caméra simulée (à lire en comparaison : deux mesures
identiques varient de 10 %).

| | Meubles d'origine | Téléchargés, 10 000 triangles | Téléchargés, 5 000 triangles | Idem, sans ombres des petits objets |
|---|---|---|---|---|
| Plan : mise à jour après un déplacement | 32 ms | 33 ms (contours) | 32 ms (vues de dessus) | 33 ms |
| 3D : images par seconde | 49 à 55 | 31 | 42 | 44 |
| 3D : triangles | 1,3 M | 3,7 M | 2,5 M | 2,3 M |
| 3D : premier affichage complet | 0,6 à 0,8 s | 6,2 s | 3,2 s | - |

Les vues de dessus : 1 127 images, 7,6 Mo au total, médiane 3,8 Ko. Les GLB passent de 39,8 à
34,9 Mo avec le budget de 5 000 triangles.

Les modèles téléchargés coûtent moins d'appels de dessin que les meubles paramétriques : leurs
pièces sont fusionnées par matière. Durée d'image non mesurée : le navigateur de test dessine la
3D sur le processeur.
