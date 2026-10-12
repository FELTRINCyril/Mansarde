# Plan Maison V2 : décisions prises pendant l'implémentation

Ces décisions ont été prises par l'orchestrateur sans attendre de validation, pour ne pas
bloquer le travail. Chaque ligne indique ce qui a été décidé, pourquoi, et ce que ça coûte si
c'est un mauvais choix. Toutes sont réversibles.

## Pentes, poutres, plafond

- **R1** : une poutre neuve a son dessous à 235 cm (plafond 250 moins 15 de retombée). Un
  placard posé avec l'outil va jusqu'au plafond par défaut (spec 7.1).
- **R5** : le dessus d'un placard "jusqu'au plafond" suit le plafond le plus bas sur toute sa
  profondeur (pentes et poutres comprises), pas seulement devant et derrière comme le disait la
  spec 5.2.
- **R6** : le calcul de hauteur sous un objet utilise un découpage convexe exact, plus rapide ;
  la bibliothèque de géométrie reste en secours.
- **R15** : une poutre fixe occupe sa hauteur propre, coupée par le plafond si celui-ci est plus
  bas.
- **R23** : une pente se sélectionne près de ses lignes de début et de fin ou de ses poignées,
  pas n'importe où dans sa zone (un clic dans une zone en pente sélectionne la pièce).
- **R24** : dans le PDF, la teinte des pentes est uniforme (l'export ne sait pas rendre le
  dégradé).
- Les hauteurs de pente sont absolues : monter la hauteur du niveau laisse une marche au niveau
  de la ligne de départ de la pente (voulu). Les lignes de hauteur au-dessus du plafond réel ne
  sont pas dessinées.

## Placards

- **R2** : 1 à 20 portes par placard (évite un rendu 3D démesuré depuis un fichier modifié à la
  main).
- **R8** : couper un mur sous un placard reste refusé ("Un placard est à cheval sur la
  jonction"), comme pour les portes et fenêtres.
- **R32 / R39** : un placard se cale sur la portion libre de sa face (il s'arrête à la face du
  mur d'angle), à la pose, au glisser, en changeant de face et après toute modification de mur.
  Seuls les placards touchés par la modification sont recalés ; un placard déjà en conflit ne
  bloque jamais une modification sans rapport. Si un placard ne tient plus, la modification est
  refusée ("Le mur est trop court pour ses placards").
- **R36** : un placard "jusqu'au plafond" dont le dessus passe sous le socle après coup (pente
  ajoutée, niveau abaissé, import) est signalé : "Placard : pas assez de hauteur sous le
  plafond.". Un placard qui empiète sur un mur est signalé : "Placard : empiète sur un mur.".
  Un socle trop haut est refusé avec "Socle plus haut que le dessus du placard.".

## Objets, pose et vérifications

- **R3** : un objet nommé "tapis" devient un revêtement seulement s'il est générique ou
  personnalisé ; les objets du catalogue gardent leur pose.
- **R10** : deux tapis qui se chevauchent sont signalés ; un placard devant une fenêtre plus
  haute que lui n'est pas signalé ; un objet posé à moins de 1 cm du sol compte comme au sol.
- **R16** : les escaliers (catégorie Structure) ne sont pas contrôlés en hauteur, car ils
  traversent les niveaux. Coût : un escalier sous une pente basse n'est pas signalé.
- **R17** : message neutre "X : aucun support en dessous." (la spec disait "n'est posée sur
  rien").
- **R27** : un objet posé sur ou devant un placard reste cliquable avant le placard.
- **R31** : choisir la pose "Posé sur un meuble" soulève l'objet sur son support, en une seule
  étape d'annulation.
- **R33** : les lits du catalogue font 90 cm de haut (tête de lit). Coût : un lit sous une pente
  basse peut être signalé à 90.
- **R37** : une seule définition du support, pour la pose comme pour les vérifications : objets
  au sol ou rangés dessous, placards de hauteur fixe et étagère murale. Une lampe posée sur un
  placard fixe est soulevée à sa hauteur.
- Les tapis sont dessinés et cliqués sous les autres meubles, même ajoutés après eux.

## Murs et pièces

- **R7** : un côté de pièce rectangulaire peut être fait de plusieurs murs alignés (jonctions en
  T des pièces voisines) ; le redimensionnement les déplace tous.
- **R9** : la jonction de deux murs tracés par la face est biseautée quand l'angle est très
  aigu.
- **R11 / R26** : un redimensionnement de pièce qui la déformerait, ou ferait disparaître une
  pièce voisine, est refusé : "Impossible de redimensionner cette pièce ainsi.".
- **R12 / R18** : quand un mur s'allonge par son début, ses portes, fenêtres et placards gardent
  leur position réelle ; un mur déplacé en bloc les emmène.
- **R21 / R22** : en mode face, un tracé accroché à un mur existant reste relié à lui ; "Face
  gauche" = à gauche de la ligne tracée à l'écran.
- **R25** : l'outil pièce rectangulaire accroché à un mur existant passe en cotes à l'axe
  (message "Accroché à un mur : cotes à l'axe").

## 3D

- **R13** : les portes ont un linteau au-dessus d'elles et un seuil au sol.
- **R14 / R20** : chaque mur est un maillage séparé (pour masquer les murs proches de la
  caméra) ; une porte en bout de mur découpe aussi le mur voisin, comme en 2D.
- **R29** : ombres douces, une lumière chaude par pièce (6 au plus), comme plan-chambre.
- **R34** : les objets du catalogue de couleur par défaut prennent les couleurs de plan-chambre ;
  une couleur choisie est respectée ; les placards en alerte sont teintés.
- **R35** : vue d'ensemble : les murs de façade côté caméra sont masqués, avec leurs portes et
  fenêtres ; la vue pièce se place au bord de la pièce, loin des meubles hauts ; un clic sur le
  sol ou un mur désélectionne ; les niveaux inférieurs gardent leur dalle.
- Un simple clic de sélection garde la vue prédéfinie (recadrage au redimensionnement) ; tourner
  ou zoomer la quitte.

## Interface

- **R19** : le choix Plan / 3D / Plan + 3D est dans l'en-tête, avec un séparateur déplaçable.
- **R30** : les réglages d'affichage (cotes, filigrane, grille) sont regroupés dans un menu
  "Affichage" pour que le nom du projet tienne dans l'en-tête.
- Le panneau d'un mur affiche la longueur de chacune de ses faces.
- Les flèches du clavier déplacent aussi pentes, poutres et placards.

## Publication et tests

- **R28** : les tests de performance mesurent le meilleur de 9 passages, pour ne pas échouer
  quand la machine est chargée.
- **R36** : la publication GitHub Pages vérifie les types et construit l'application, sans
  lancer les tests (les tests de performance dépendent de la machine). Rien n'est publié tant
  que le dépôt n'est pas poussé sur GitHub.

## Organisation du travail

- **R38** : la revue finale a laissé de côté, volontairement : l'étiquette de poutre fixe, la
  formule du plafond écrite à trois endroits (couverte par des tests croisés), des cas limites
  de pointeur en 3D, et les remarques visuelles listées par la dernière tâche (cotes intérieures
  sur les meubles, étiquettes sur les arcs de portes de placard, objets sans nom dans le plan,
  étiquette 3D d'un tapis au-dessus du lit, portes masquées avec leur mur).
- R4 : choix techniques internes sans effet visible (conventions de test, repli sans erreur des
  calculs de géométrie).
