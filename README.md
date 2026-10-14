# Mansarde

**Dessinez votre logement, meublez-le aux vraies dimensions, et vérifiez que tout passe, même
sous les toits.**

Mansarde est une application web pour relever un logement en plan 2D et l'aménager. Vous tracez
les pièces (en tapant les cotes ou en décalquant un plan existant), vous posez les meubles, vous
décrivez les rampants et les poutres, et l'application vous prévient quand une armoire ne passe
pas sous la pente ou qu'un fauteuil bloque une porte. Une vue 3D montre le résultat, et un PDF à
l'échelle se partage avec un artisan ou un proche.

Tout se passe dans le navigateur : aucun serveur, aucun compte, vos projets restent sur votre
ordinateur.

![Le plan et la vue 3D côte à côte : une chambre sous les toits](docs/images/plan-et-3d.png)

| | | |
|---|---|---|
| ![Plan de deux pièces meublé](docs/images/plan-2d-meuble.png) | ![Plan d'une chambre mansardée avec ses alertes](docs/images/combles-verifications.png) | ![Vue d'ensemble 3D](docs/images/vue-3d-ensemble.png) |
| Plan meublé avec ses cotes | Pente, poutre, placard et vérifications | Vue 3D avec les noms des objets |

## Ce que fait Mansarde

**Plan 2D**
- Murs avec épaisseur et jonctions propres, cloisons, tracé sur l'axe ou sur une face.
- Pièces détectées automatiquement, avec nom et surface ; pièces tracées et modifiées en
  dimensions intérieures.
- Portes, fenêtres et passages accrochés aux murs.
- Cotes automatiques, manuelles et dynamiques ; placement à une distance exacte au clavier.
- Plusieurs niveaux, niveau inférieur en filigrane, variantes de niveau ou de projet.
- Image de fond à décalquer, mise à l'échelle par une longueur connue.

**Combles**
- Pentes de toit (rampants) avec lignes de hauteur sur le plan.
- Poutres collées au plafond ou à hauteur fixe, avec leur hauteur libre.
- Placards muraux qui suivent le plafond sous la pente, portes battantes ou coulissantes.

**Aménagement**
- Catalogue de meubles en symboles d'architecte (chambre, séjour, bureau, cuisine, salle de
  bain, escaliers).
- Plus de 1 100 objets supplémentaires repris de bibliothèques libres (Kenney, Quaternius, Poly
  Haven, Sweet Home 3D) : électroménager, luminaires, décoration, extérieur, rangements, en style
  simple ou réaliste, redimensionnables comme les autres (voir [Modèles 3D](#modèles-3d)).
- Objets génériques (rectangle, cercle, forme en L) à enregistrer dans "Mes objets".
- Modes de pose : au sol, tapis, posé sur un meuble, rangé sous une table, mural.
- Bouton "Dupliquer" pour poser plusieurs meubles, placards, pentes ou poutres identiques.

**Vérifications**
- Contrôles automatiques et non bloquants : hauteur sous plafond, meubles qui se chevauchent,
  empiètement sur un mur, porte gênée, placard devant une ouverture, objet posé dans le vide,
  passage devant un placard.
- Alertes en rouge ou orange sur le plan et dans la 3D, avec un panneau qui les liste.

**3D**
- Vue 3D de consultation, seule ou à côté du plan, mise à jour en direct.
- Navigation au trackpad (deux doigts pour se déplacer, pincer pour zoomer) comme à la souris
  (molette pour zoomer, clic droit maintenu pour se déplacer), dans le plan comme en 3D.
- Vues prédéfinies (ensemble, dessus, depuis la pièce), murs masqués automatiquement, noms des
  objets, niveaux inférieurs.

**Export et sauvegarde**
- Sauvegarde automatique dans le navigateur.
- PDF à l'échelle (A4 ou A3, 1/20 à 1/200) avec cartouche et barre d'échelle, image PNG.
- Export et import du projet en `.json`, pour sauvegarder ou changer d'ordinateur.

## Essayer

Mansarde est publiée sur GitHub Pages : https://feltrincyril.github.io/Mansarde/ (l'adresse
fonctionne une fois GitHub Pages activé sur le dépôt).

À utiliser sur ordinateur, à la souris et au clavier ; l'application est testée sous Chrome et
Edge.

## Lancer en local

Il faut [Node.js](https://nodejs.org/) 22.12 ou plus récent.

```sh
npm install
npm run dev
```

Puis ouvrez http://localhost:5173 dans le navigateur.

Les projets de la version locale et ceux de la version en ligne sont séparés : pour passer de
l'une à l'autre, exportez le projet en `.json` puis importez-le (voir
[Export et sauvegarde](docs/guide/export-et-sauvegarde.md)).

## Documentation

| Page | Contenu |
|---|---|
| [Prise en main](docs/guide/prise-en-main.md) | Un premier projet pas à pas, du plan au PDF |
| [Le plan 2D](docs/guide/plan-2d.md) | Murs, pièces, ouvertures, cotes, sélection, niveaux, image de fond |
| [Combles](docs/guide/combles.md) | Pentes, poutres et placards muraux |
| [Objets et catalogue](docs/guide/objets.md) | Catalogue complet, objets génériques, "Mes objets", modes de pose |
| [Vérifications](docs/guide/verifications.md) | Chaque contrôle et son message |
| [La vue 3D](docs/guide/vue-3d.md) | Affichage, navigation, vues prédéfinies, sélection |
| [Export et sauvegarde](docs/guide/export-et-sauvegarde.md) | PDF, PNG, `.json`, où sont les données |
| [Raccourcis](docs/guide/raccourcis.md) | Tous les raccourcis clavier et souris |
| [Limites](docs/guide/limites.md) | Ce que Mansarde ne fait pas |
| [Développement](docs/developpement.md) | Tests, architecture, publication |

## Limites

La 3D sert à regarder (les modifications se font sur le plan), les toits sont décrits par des
pentes planes, et les projets sont stockés dans le navigateur : exportez-les régulièrement en
`.json`. La liste complète est dans [Limites](docs/guide/limites.md).

## Modèles 3D

Les objets marqués d'une icône dans le catalogue viennent de bibliothèques libres. Ils sont
convertis une fois pour toutes par le script `tools/models` (voir [Développement](docs/developpement.md#modèles-3d)),
puis servis avec l'application : rien n'est téléchargé depuis ces sites pendant l'utilisation, et
un modèle n'est chargé que s'il est posé sur le plan.

| Source | Objets | Licence |
|---|---|---|
| [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) | 120 | CC0 |
| [Quaternius Furniture Pack](https://opengameart.org/content/furniture-low-poly) | 23 | CC0 |
| [Poly Haven](https://polyhaven.com/models) | 134 | CC0 |
| [Sweet Home 3D](https://www.sweethome3d.com/importModels.jsp) : BlendSwap CC-0 | 120 | CC0 |
| Sweet Home 3D : Scopia, BlendSwap CC-BY | 275 | CC-BY 3.0 |
| Sweet Home 3D : KatorLegaz | 47 | CC-BY 3.0 US |
| Sweet Home 3D : Contributions, LucaPresidente | 398 | Free Art License 1.3 (certains aussi CC-BY 3.0) |

Merci à leurs auteurs. Le nom de l'auteur et la licence de chaque modèle sont dans la fenêtre
"Crédits des modèles 3D" (en bas du catalogue), avec l'attribution exigée par chaque
bibliothèque, un lien vers le texte de sa licence et sa notice (copiée dans
`public/models/LICENSES`). Les modèles ont été convertis, simplifiés et leurs textures réduites ;
chacun reste sous sa licence d'origine, et l'original se trouve sur la page de sa bibliothèque.

## Technique

TypeScript, React, Vite, Three.js pour la 3D, jsPDF et svg2pdf.js pour le PDF, IndexedDB pour le
stockage. Détails dans [Développement](docs/developpement.md).
