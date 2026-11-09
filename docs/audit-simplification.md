# Audit de simplification — synoptiques GTB

Le but est de rendre l'éditeur plus simple pour créer, intégrer et modifier des synoptiques techniques GTB. Il ne doit pas devenir un outil de dessin général. Une règle s'applique partout : moins de fonctions inutiles, une meilleure expérience, aucune régression sur l'existant.

- **Mesures** : relevées dans l'éditeur compilé depuis `master` (c1793877), disposition « canevas », avec les fichiers réels de `tests/fixtures/import/scorpio/`.
- **État** : décidé le 9 novembre 2026. Les lots S0 à S3 viennent après V4. Deux points restent ouverts (section 8).

## 1. Décisions

| Question | Décision | Conséquence |
| --- | --- | --- |
| Outils que le plan v2 garde (Main, Étoile, Crayon, Pipette, Loupe) | Gardés | Le menu Formes est celui de la section 4.2 du plan v2 : rectangle, ellipse, ligne, polygone, étoile |
| Couleur ou police d'un objet stylé par classe | La modification change la règle de la classe, avec un avertissement | Voir le lot S2 |
| Langues | Français et anglais | 57 fichiers de langue sont retirés en S3 |
| Éditeur toujours intégré à SCorp-io ? | Non | L'enregistrement dans le navigateur et son bandeau de consentement restent, comme le bouton Accueil, le fil d'Ariane et le bouton Enregistrer de l'hôte |
| Lots S0 à S3 avant V4 ? | Non, après V4 | L'ancienne disposition aura disparu : S1 et S3 ne touchent que la disposition « canevas » |
| Fichiers réels du correctif d'import dans le dépôt ? | Oui | Ils entrent dans le corpus du lot S0 |

## 2. Inventaire

| Zone | Contenu |
| --- | --- |
| Barre d'outils (20 outils) | Calque ▾ · Sélection V, Échelle K, Main H · Texte T · Formes ▾ (9) : rectangle R, carré, rectangle à main levée, ellipse E, cercle, ellipse à main levée, ligne L, étoile, polygone · Chemins ▾ : plume P, crayon Q · Image, Connecteur, Bibliothèque · Plus ▾ : loupe Z, pipette Ctrl+I |
| Barre du haut | Accueil et fil d'Ariane (fournis par l'hôte) · Annuler, Rétablir · Export ▾ (image, SVG) · Enregistrer (si l'hôte le fournit) |
| Menu Document (9) | Nouveau N, Ouvrir, Enregistrer Ctrl+S, Enregistrer sous, Importer, Exporter, Propriétés du document Maj+D, Préférences, Page d'accueil SVG-Edit |
| Menu Zoom (14) | Zoom avant et arrière, tout voir, sélection, page, 25 à 200 %, règles, grille, fil de fer, annuler, rétablir ; plus « Vue du calque seul » Ctrl+Maj+L |
| Menu contextuel (16) | Couper, copier, coller, coller sur place, copier et coller les propriétés, supprimer, grouper, dégrouper, ordre (4 entrées)… |
| Propriétés | Menu « … » (14 actions pour un objet seul) · Géométrie · Apparence (opacité) · Remplissage · Contour (couleur, épaisseur, style, jointures, extrémités, 3 marqueurs) · Texte (12 réglages) · Effets (flou) · Identité (id, classe, titre) · Document |
| Onglets | Propriétés, Calques, Code |
| Boîtes de dialogue | Préférences (24 langues, thème, fond, grille, magnétisme, règles, unité) · Propriétés du document (titre, taille, résolution, images incorporées ou liées) · Export (PNG, JPEG, BMP, WEBP, PDF) |
| Commandes | 93 dans le registre, avec leurs raccourcis |
| Extensions | 10 chargées : connector, eyedropper, grid, markers, panning, shapes, polystar, storage, opensave, layer_view ; 2 jamais chargées : helloworld, overview_window |

## 3. Constats

### 3.1 L'inspecteur est faux pour un objet stylé par classe

Les synoptiques SCorp-io sont stylés par des classes CSS : `synoptique-chaufferie.svg` compte 209 attributs `class`, dont des états comme `en-marche` ou `arret`.

| Objet | Rendu | L'inspecteur affiche | Après modification |
| --- | --- | --- | --- |
| Rectangle `.fond` | rempli de `#160F23` | Remplissage « Aucun » | `fill="#00ff00"` est écrit, l'écran ne change pas |
| Titre `.titre .titre-page` | 34 px, Space Grotesk | Taille « null », police vide | `font-size="48"` et `font-family="Courier New"` sont écrits, l'écran ne change pas |

Une règle CSS qui vise l'objet l'emporte sur ses attributs de présentation. L'utilisateur lit donc une valeur fausse, sa modification ne fait rien à l'écran, et le fichier garde des attributs inutiles. Pour notre usage, c'est le premier défaut d'ergonomie.

### 3.2 Un polygone n'a pas de champs X, Y, L, H

Seul l'angle s'affiche (`TopPanel.js`, `['line', 'circle', 'ellipse', 'polygon']`). Le code suppose que tout polygone a ses propres champs. Ce n'est vrai que pour les polygones de l'extension Étoile/Polygone, qui portent un attribut `shape`. La pompe de `repr-pompe.svg` contient un polygone ordinaire. La PR n° 5 vient de régler le même problème pour les imports (`<use>`) : on peut suivre la même voie.

### 3.3 Doublons

- Carré et Cercle font la même chose que Rectangle et Ellipse avec Maj. Les formes à main levée font des rectangles et des ellipses ordinaires.
- « Vue du calque seul » fait la même chose que l'œil du panneau Calques.
- « Aligner sur la page » (menu « … ») fait la même chose que le menu Aligner et Alt+lettre.
- La boîte Propriétés du document reprend la section Document du panneau, sauf le choix « images incorporées ou liées ».
- « Export ▾ SVG » reprend « Enregistrer sous ».
- Plusieurs raccourcis font la même chose :

  | Action | Raccourcis |
  | --- | --- |
  | Dupliquer | D, C (multi-sélection), Ctrl+D |
  | Grouper | G, Ctrl+G |
  | Tout sélectionner | A, Ctrl+A |
  | Objet suivant et précédent | Maj+O et Maj+P, Tab et Maj+Tab |

- Dans le registre, `tool_delete` et `tool_delete_multi` doublent `delete`, et `tool_move_top`/`tool_move_bottom` doublent `move_front`/`move_back`, avec les mêmes raccourcis.

Main, Loupe et Pipette ont aussi des équivalents (Espace + glisser, Ctrl+molette, Copier/Coller les propriétés), mais elles sont gardées (décision 1).

### 3.4 Réglages rares

Section Texte : barré, surligné, espacement des mots, longueur du texte et son ajustement. Section Effets : le flou. Section Contour : jointures et extrémités. On ne les crée presque jamais dans un synoptique, mais des fichiers existants peuvent en contenir.

### 3.5 Poids mort

- 59 fichiers de langue (1 Mo), alors que les préférences n'en proposent que 24.
- La bibliothèque de formes : 372 Ko d'animaux, de jeux et autres. V7 prévoit une bibliothèque GTB.
- Deux extensions jamais chargées.
- L'ancienne vue à défilement (`view: 'scroll'`), qui devait rester « jusqu'à la fin de V3 ». V3 est livré.

## 4. Recommandations

Les colonnes précisent ce que touche chaque retrait :
- **Outil** : l'interface (bouton, menu, champ, raccourci).
- **Création** : la possibilité de créer un nouvel élément.
- **Lecture** : la lecture, l'affichage, la sélection, la transformation et l'enregistrement d'un élément existant.

Aucune recommandation ne touche la lecture.

### Conserver

| Fonction | Raison |
| --- | --- |
| Sélection, Échelle, Texte, Rectangle, Ellipse, Ligne, Polygone, Plume, Image | Essentiel |
| Main, Étoile, Crayon, Pipette, Loupe | Décision 1, conforme au plan v2 |
| Connecteur | V7 apporte les connecteurs orthogonaux |
| Calques, onglet Code, menu contextuel, menu « … », grille, magnétisme, alignement | Essentiel ; V4 et V7 les font évoluer |
| Enregistrement dans le navigateur et bandeau de consentement | Décision 4 : l'éditeur sert aussi hors de SCorp-io |
| Export | Inchangé tant que le point ouvert 1 n'est pas tranché |
| Liste blanche d'import (`sanitize.js`) | À ne jamais réduire : elle garantit la lecture des fichiers existants |
| Modes de dessin du carré, du cercle et des formes à main levée dans `svgcanvas` | Les retirer ne gagnerait presque rien et compliquerait la reprise des versions amont |

### Améliorer

| Fonction | Changement | Gain |
| --- | --- | --- |
| Remplissage, contour, police, taille d'un objet stylé par classe | Afficher la valeur réelle et la règle qui la donne. Une modification change cette règle, après un avertissement qui nomme le sélecteur et le nombre d'objets touchés | L'inspecteur dit vrai ; les états SCorp-io restent pilotés par classe |
| X, Y, L, H d'un polygone | Un polygone sans attribut `shape` se place et se dimensionne comme une polyligne | Les polygones des fichiers réels se placent au clavier |

### Simplifier

| Fonction | Changement | Touche | Gain |
| --- | --- | --- | --- |
| Barré, surligné, espacement des mots, longueur du texte, flou | Affichés seulement quand l'objet en a déjà une valeur | Création | La section Texte passe de 12 à 7 réglages ; une valeur existante reste visible et modifiable |
| Jointures, extrémités, espacement des lettres | Repliés sous « Plus d'options » | Outil | Sections plus courtes |
| Aligner sur la page | Fusionné avec le menu Aligner, qui s'ouvre aussi pour un seul objet | Outil | Une seule façon d'aligner |
| Propriétés du document (Maj+D) | Retirée une fois le choix « images incorporées ou liées » déplacé dans la section Document | Outil | Une seule place pour le document |
| Langues | Français et anglais seulement | Outil | 57 fichiers en moins (environ 1 Mo) |

### Supprimer

| Fonction | Touche | Raison |
| --- | --- | --- |
| Carré, Cercle, rectangle et ellipse à main levée (menu Formes) | Outil, création | Doublons ; le menu Formes passe de 9 à 5 entrées |
| Bibliothèque de formes | Outil, jusqu'à V7 ; son contenu en S3 | Contenu hors sujet |
| Réorienter le chemin (menu « … ») | Outil | Sans usage pour un synoptique |
| Page d'accueil SVG-Edit (menu Document) | Outil | Sans usage |
| Vue du calque seul (extension `layer_view`) | Outil | Doublon de l'œil du panneau Calques ; l'extension reste chargeable par l'option `extensions` |
| Raccourcis D, C, G, A, Maj+O, Maj+P | Outil | Doublons ; Ctrl+D, Ctrl+G, Ctrl+A, Tab et Maj+Tab restent. Les boutons Dupliquer et Grouper du menu « … » appellent alors les commandes `duplicate` et `group` et affichent Ctrl+D et Ctrl+G |
| Extensions helloworld et overview_window | Code | Jamais chargées |
| Ancienne vue à défilement | Code | Remplacée par la vue sans bordure |
| Enregistrements en double du registre | Code | Une commande par action |

### Gains attendus

| Mesure | Avant | Après |
| --- | --- | --- |
| Outils de la barre | 20 | 15 |
| Entrées du menu Formes | 9 | 5 |
| Réglages de la section Texte | 12 | 7 |
| Commandes du registre | 93 | 85 après S1, 81 après S3 |
| Fichiers de langue | 59 | 2 |

À cela s'ajoutent 372 Ko de bibliothèque et deux extensions en moins. Surtout, l'inspecteur affiche la vraie valeur des objets stylés par classe.

## 5. Risques et dépendances des retraits

Pour chaque retrait, il faut faire trois vérifications :
- chercher les usages internes : registre, `layout.js`, `Inspector.js`, extensions, tests ;
- vérifier qu'une configuration de l'hôte ne s'en sert pas ;
- passer le corpus du lot S0.

| Retrait | Dépendances | Effet sur les documents existants |
| --- | --- | --- |
| Carré, cercle, formes à main levée | Boutons de `LeftPanel.html`, menu `shapes` de `Toolbar.js` ; les modes restent dans `svgcanvas` | Aucun : ce sont des `rect`, `circle`, `ellipse` ordinaires |
| Bibliothèque | Extension `ext-shapes` | Aucun : une forme déjà posée est un chemin ordinaire |
| Réglages rares du texte et flou | `TopPanel.js`, `Inspector.js` | Aucun : affichés dès que l'objet en a une valeur |
| Propriétés du document | Boîte `imagePropertiesDialog`, commande `tool_docprops`, menu Document | Aucun, si le choix des images est déplacé avant |
| Vue du calque seul | Extension `layer_view`, test de contrat des extensions | Aucun ; le test de contrat est mis à jour volontairement |
| Raccourcis en double | Registre de commandes, aide des raccourcis | Aucun |
| Langues | `locale/`, option `lang`, préférences | Aucun. Un navigateur réglé en allemand affiche l'éditeur en anglais |
| Vue à défilement | `view.js`, option `view` | Aucun. Une configuration qui demande `view: 'scroll'` aura la vue sans bordure |
| Extensions jamais chargées | Aucune | Aucun |

**V4 vient d'abord.** V4 construit les barres contextuelles et fait tester l'éditeur par 5 personnes, et la décision 5 place nos lots après lui. Pour ne pas défaire son travail, il vaut mieux que V4 ne mette pas dans ses barres les réglages que S1 retire ou replie (sections 3.4 et 4).

## 6. Interface proposée

L'interface suit la disposition « canevas » de V3, à la manière de Figma et de Claude Design :
- peu d'outils toujours visibles ;
- les réglages rares sous « Plus d'options » ;
- une valeur venant d'un style partagé montre le nom de ce style.

**Barre d'outils**, de haut en bas :

```
Sélection V · Échelle K · Main H
Texte T · Formes ▾ (Rectangle R, Ellipse E, Ligne L, Polygone, Étoile) · Chemins ▾ (Plume P, Crayon Q)
Image · Connecteur
Plus ▾ (Loupe Z, Pipette Ctrl+I)
```

**Propriétés**, pour un objet :

```
Géométrie     X  Y  L  H  angle
Apparence     opacité
Remplissage   ■ #160F23   ← classe .fond
Contour       couleur · épaisseur · style        [Plus d'options : jointures, extrémités, marqueurs]
Texte         police · taille · gras · italique · souligné · alignement
              [Plus d'options : espacement des lettres]
              (barré, surligné, espacement des mots, longueur : seulement si l'objet en a)
Effets        (seulement si l'objet a un flou)
Identité      id · classe · titre
```

Le repère « ← classe .fond » s'inspire des styles partagés de Figma. Modifier la valeur ouvre un avertissement, par exemple : « Cette couleur vient de la règle `.fond`, qui s'applique à 12 objets. Modifier la règle ? ». Si l'utilisateur confirme, la règle est modifiée en une seule étape d'annulation.

**Barre du haut, menus Document et Zoom** : inchangés, sauf « Page d'accueil SVG-Edit », « Propriétés du document » et « Vue du calque seul », qui disparaissent.

## 7. Plan de mise en œuvre

Les lots viennent après V4, dans cet ordre.

| Lot | Contenu | Sortie SVG |
| --- | --- | --- |
| S0 Filet (2 j) | Tests seulement ; l'éditeur ne change pas | Inchangée |
| S1 Masquer (2 à 3 j) | Retraits d'interface, réglages conditionnels et repliés, fusion d'« Aligner sur la page », Propriétés du document | Identique à l'octet |
| S2 Corriger (3 à 5 j) | Objets stylés par classe ; X, Y, L, H des polygones | Change volontairement |
| S3 Nettoyer (3 à 5 j, après deux semaines d'usage de S1) | Langues, bibliothèque, extensions jamais chargées, vue à défilement, enregistrements en double | Identique |

### S0 Filet

- **Corpus** :
  - les fichiers de `tests/fixtures/import/scorpio/` ;
  - les cinq fichiers réels du correctif d'import : dessin Illustrator, dessin Inkscape de 1 Mo, dessin SVG-Edit, plan sombre avec feuille de style, synoptique ;
  - un fichier par famille d'éléments touchée : carré, cercle, polygone ordinaire et de l'extension, étoile, texte barré, espacement des mots, `textLength`, flou, forme de la bibliothèque.
- **Scénario par fichier** : ouvrir, sélectionner, déplacer, redimensionner, pivoter, grouper, dégrouper, annuler, enregistrer, rouvrir.
- **Liste figée** des commandes du registre et de leurs raccourcis (test unitaire). Tout retrait devient une différence visible et voulue.
- **Référence de sortie** construite depuis `master` (`tests/output/build-reference.mjs`).
- **Réutilisés** :
  - le rapport de fidélité (`npm run fidelity`) ;
  - `import-fidelity.spec.js` (un dessin ouvert s'affiche pixel pour pixel) ;
  - `import-reopen.test.js` (enregistré puis rouvert, le texte est le même) ;
  - `liaisons-v0.spec.js` et `extensions-v0.spec.js`.

### S1 Masquer

- **Sortie** : sur tout le corpus, identique à l'octet à la référence (`compare-output.mjs`).
- **Mises à jour voulues** : liste figée des commandes, contrat des extensions (`layer_view` retiré du chargement par défaut et chargeable par `extensions`).
- **Tests de bout en bout** :
  - un fichier contenant un carré, un cercle, un flou ou un texte barré l'affiche, le sélectionne, le transforme et l'enregistre comme avant ;
  - les réglages rares apparaissent quand l'objet en a une valeur ;
  - les boutons Dupliquer et Grouper du menu « … » font la même chose qu'avant, et Ctrl+D et Ctrl+G aussi ;
  - le menu Aligner fonctionne pour un seul objet ;
  - le choix des images fonctionne depuis la section Document.

### S2 Corriger

- **Objets stylés par classe** :
  - Trouver la règle qui donne la valeur : la règle la plus spécifique, puis la dernière, parmi celles de la feuille `<style>` qui visent l'objet et fixent la propriété.
  - L'afficher dans l'inspecteur.
  - À la modification, demander confirmation, puis réécrire la propriété dans cette règle, en une seule étape d'annulation.
  - Une valeur seulement héritée d'un parent continue de s'écrire sur l'objet, car un attribut l'emporte sur l'héritage.
  - Les feuilles des fichiers importés sont confinées à leur import (`css-scope.js`) : la recherche doit les lire sous leur forme confinée.
- **Polygones** : un polygone sans attribut `shape` rejoint les éléments placés et dimensionnés par leur boîte, comme la polyligne. Ceux de l'extension gardent leur panneau.
- **Tests unitaires** de la recherche de règle :
  - une classe ;
  - plusieurs classes (`titre titre-page` : la taille vient de `.titre-page`, la police de `.titre`) ;
  - un sélecteur qui n'est pas une classe (`svg.synoptique`) ;
  - une feuille d'import confinée ;
  - une valeur héritée d'un groupe ;
  - `!important` et attribut `style`.
- **Tests de bout en bout** :
  - après confirmation, l'écran change, la règle est réécrite et aucun attribut n'est ajouté ;
  - une annulation rend la feuille d'origine ;
  - l'avertissement donne le bon nombre d'objets ;
  - un polygone de `repr-pompe.svg` se déplace et se redimensionne par X, Y, L, H ;
  - un polygone de l'extension garde ses champs.
- **Rapport de fidélité** : les seuls changements sont les règles modifiées.

### S3 Nettoyer

Chaque retrait passe par les mêmes vérifications :
- recherche des usages ;
- suite complète, unitaire et de bout en bout, sous Chromium et Firefox ;
- rapport de fidélité ;
- bench.

| Retrait | Vérification propre |
| --- | --- |
| 57 fichiers de langue | Le repli vers l'anglais fonctionne et aucun test ne lit une autre langue |
| Contenu de la bibliothèque de formes | En attendant V7, l'extension n'est plus chargée par défaut |
| Extensions helloworld et overview_window | Aucune configuration de l'hôte ne les charge |
| Vue à défilement | L'option `view: 'scroll'` retombe sur la vue sans bordure |
| `tool_delete`, `tool_delete_multi`, `tool_move_top`, `tool_move_bottom` | Fusionnés avec `delete`, `move_front` et `move_back` ; les boutons gardent leur effet |

## 8. Points ouverts

1. **Export.** Faut-il garder le PNG seul, ou le PNG et le PDF ? Tant que ce n'est pas tranché, l'export reste tel quel. Si on garde le PNG et le PDF, seuls BMP, JPEG et WEBP quittent la liste ; jsPDF et svg2pdf.js restent. Avec le PNG seul, ces deux dépendances partent en S3.
2. **Fichiers réels.** Les cinq fichiers du correctif d'import sont à fournir pour le lot S0. Ils doivent pouvoir être publiés dans le dépôt.
