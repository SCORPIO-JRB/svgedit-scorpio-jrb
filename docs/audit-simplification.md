# Audit de simplification — synoptiques GTB

Le but est de rendre l'éditeur plus simple pour créer, intégrer et modifier des synoptiques techniques GTB. Il ne doit pas devenir un outil de dessin général. Une règle s'applique partout : moins de fonctions inutiles, une meilleure expérience, aucune régression sur l'existant.

- **Mesures** : relevées dans l'éditeur compilé depuis `master` (b2a1dbd5), qui contient V0 à V7 et les textes de plusieurs lignes. Disposition « canevas », fichiers réels de `tests/fixtures/import/scorpio/`.
- **État** : décidé le 9 novembre 2026. Les lots S0, S1 et S2 sont livrés (section 7) ; S3 reste à faire. Les sections 2 et 3 décrivent l'éditeur avant S1 et S2.

## 1. Décisions

| Question | Décision | Conséquence |
| --- | --- | --- |
| Outils que le plan v2 garde (Main, Étoile, Crayon, Pipette, Loupe) | Gardés | Le menu Formes devient celui de la section 4.2 du plan v2 : rectangle, ellipse, ligne, polygone, étoile |
| Couleur ou police d'un objet stylé par classe | La modification change la règle de la classe, avec un avertissement | Voir le lot S2 |
| Langues | Français et anglais | 57 fichiers de langue sont retirés en S3 |
| Export | Tel quel | PNG, JPEG, BMP, WEBP et PDF restent, ainsi que jsPDF et svg2pdf.js |
| Éditeur toujours intégré à SCorp-io ? | Non | L'enregistrement dans le navigateur et son bandeau de consentement restent, comme le bouton Accueil, le fil d'Ariane et le bouton Enregistrer de l'hôte |
| Lots S0 à S3 avant V4 ? | Non, après V4 | V4 est livré. Son test utilisateur, qui compare les deux dispositions, reste à mener : d'ici là, l'interface de l'ancienne disposition (`layout: 'classic'`) ne change pas, et S1 ne touche que la disposition « canevas ». S2, qui corrige des valeurs fausses, s'applique aux deux : la tâche 4 du test réussit ainsi dans l'une comme dans l'autre |
| Fichiers réels du correctif d'import dans le corpus ? | Pas pour l'instant | Le corpus du lot S0 se limite aux fichiers du dépôt et aux fichiers construits pour lui |

## 2. Inventaire

| Zone | Contenu |
| --- | --- |
| Barre d'outils (22 outils) | Calque ▾ · Sélection V, Échelle K, Main H · Texte T, Cadre d'export Maj+F · Formes ▾ (9) : rectangle R, carré, rectangle à main levée, ellipse E, cercle, ellipse à main levée, ligne L, étoile, polygone · Chemins ▾ : plume P, crayon Q · Image, Connecteur, Formes de SVG-Edit, Bibliothèque · Plus ▾ : loupe Z, pipette Ctrl+I |
| Barre contextuelle (V4) | Au-dessus de la sélection, selon son type (texte, forme, chemin, groupe, symbole, image, multi-sélection, connecteur) ; désactivable |
| Palette et aide | Ctrl+K cherche une action ; `?` liste les raccourcis |
| Barre du haut | Accueil et fil d'Ariane (fournis par l'hôte) · Annuler, Rétablir · Export ▾ (image, SVG, un SVG par cadre) · Enregistrer (si l'hôte le fournit) |
| Menu Document (10) | Nouveau N, Nouveau depuis un modèle, Ouvrir, Enregistrer Ctrl+S, Enregistrer sous, Importer, Exporter, Propriétés du document Maj+D, Préférences, Page d'accueil SVG-Edit |
| Menu Zoom (16) | Zoom avant et arrière, tout voir, sélection, page, 25 à 200 %, règles, grille, fil de fer, barre contextuelle, historique, annuler, rétablir ; plus « Vue du calque seul » |
| Menu « … » d'un rectangle (8) | Dupliquer, supprimer, premier plan, arrière-plan, convertir en chemin, retourner (2), aligner sur la page |
| Propriétés | Géométrie · Apparence · Remplissage · Contour · Texte (14 réglages) · Effets (flou) · Identité et liaison · Symbole, Connecteur ou Cadre selon la sélection · sans sélection : Calque, Cadres d'export, Document |
| Onglets | Propriétés, Calques (arbre complet, œil, verrou), Code |
| Fenêtres | Préférences · Propriétés du document · Export (PNG, JPEG, BMP, WEBP, PDF) · Couleur (V4) · Styles de texte (V4) · Bibliothèque en tiroir : Symboles GTB, Formes, Images (V7) · Aperçu (V6) |
| Commandes | 118 dans le registre, avec leurs raccourcis |
| Extensions | 10 chargées : connector, eyedropper, grid, markers, panning, shapes, polystar, storage, opensave, layer_view ; 2 jamais chargées : helloworld, overview_window |

`tests/fixtures/simplification/inventaire.json` garde ce relevé (section 7).

## 3. Constats

### 3.1 L'inspecteur est faux pour un objet stylé par classe

Corrigé par S2 (section 7).

Les synoptiques SCorp-io sont stylés par des classes CSS : `synoptique-chaufferie.svg` compte 209 attributs `class`, dont des états comme `en-marche` ou `arret`.

| Objet | Rendu | L'inspecteur affiche | Après modification |
| --- | --- | --- | --- |
| Rectangle `.fond` | rempli de `#160F23` | Remplissage « 000000 », du noir | `fill="#00ff00"` est écrit, l'écran ne change pas |
| Titre `.titre .titre-page` | 34 px, Space Grotesk | Taille « null », police vide | `font-size="48"` et `font-family="Courier New"` sont écrits, l'écran ne change pas |
| Tuyauterie `.tuyau.chaud.depart.arret` | trait `#4F465F` de 1,5 | Contour vide, épaisseur 1 | `stroke="#F08A62"` et `stroke-width="3"` sont écrits, l'écran ne change pas |

Une règle CSS qui vise l'objet l'emporte sur ses attributs de présentation. L'utilisateur lit donc une valeur fausse, sa modification ne fait rien à l'écran, et le fichier garde des attributs inutiles. Une valeur seulement héritée d'un groupe, elle, se modifie bien : l'attribut l'emporte sur l'héritage.

Deux conséquences :
- **Test utilisateur de V4.** Sa tâche 4 (« passer l'épaisseur d'une tuyauterie à 3 et sa couleur à `#F08A62` », sur ce synoptique) ne pouvait réussir dans aucune des deux dispositions. Depuis S2, elle réussit dans les deux : elle change la règle `.tuyau.arret`, donc toutes les tuyauteries à l'arrêt, après un avertissement qui le dit.
- **Styles de texte (V4).** Ils écrivent les mêmes attributs (`font-family`, `font-size`, `font-weight`, `fill`). Sur un texte stylé par classe, ils étaient masqués de la même façon. Depuis S2, ils changent les règles, après un seul avertissement.

### 3.2 Un polygone n'a pas de champs X, Y, L, H

Corrigé par S2 (section 7).

Seul l'angle s'affiche (`TopPanel.js`, `['line', 'circle', 'ellipse', 'polygon']`). Le code suppose que tout polygone a ses propres champs. Ce n'est vrai que pour les polygones de l'extension Étoile/Polygone, qui portent un attribut `shape`. La pompe de `repr-pompe.svg` contient un polygone ordinaire. La PR n° 5 a réglé le même problème pour les imports (`<use>`) : on peut suivre la même voie.

### 3.3 Doublons

- Carré et Cercle font la même chose que Rectangle et Ellipse avec Maj. Les formes à main levée font des rectangles et des ellipses ordinaires.
- Le bouton Formes de SVG-Edit (extension `ext-shapes`) ouvre la même bibliothèque que l'onglet Formes du tiroir Bibliothèque (V7).
- « Vue du calque seul » fait la même chose que l'œil du panneau Calques. Son raccourci Ctrl+Maj+L est aussi celui de « Verrouiller la sélection » (V7) : c'est le verrou qui s'exécute, et la vue du calque ne s'ouvre plus au clavier.
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

Section Texte : barré, surligné, espacement des mots, longueur du texte et son ajustement. Section Effets : le flou. Section Contour : jointures et extrémités. On ne les crée presque jamais dans un synoptique, mais des fichiers existants peuvent en contenir. L'interligne et la largeur automatique, arrivés avec les textes de plusieurs lignes, servent : ils restent.

### 3.5 Poids mort

- 59 fichiers de langue (1 Mo), alors que les préférences n'en proposent que 24.
- La bibliothèque de formes de SVG-Edit (372 Ko) : animaux, jeux, musique, objets… Le tiroir Bibliothèque la lit pour son onglet Formes (`LibraryDrawer.js`). Seules les catégories basic, arrow, flowchart et electronics (environ 40 Ko) servent à un synoptique.
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
| Connecteur, Cadre d'export, tiroir Bibliothèque, modèles, aperçu, verrou | Faits pour les synoptiques (V5 à V7) |
| Barre contextuelle, palette, menu contextuel, menu « … », fenêtre couleur, styles de texte | Le cœur de l'édition depuis V4 |
| Calques, onglet Code, grille, magnétisme, alignement | Essentiel |
| Interligne et largeur automatique des textes | Textes de plusieurs lignes |
| Enregistrement dans le navigateur et bandeau de consentement | Décision 4 : l'éditeur sert aussi hors de SCorp-io |
| Export (PNG, JPEG, BMP, WEBP, PDF) | Décision : tel quel |
| Ancienne disposition | Référence du test utilisateur de V4 ; retirée après lui, comme V4 le prévoit |
| Liste blanche d'import (`sanitize.js`) | À ne jamais réduire : elle garantit la lecture des fichiers existants |
| Modes de dessin du carré, du cercle et des formes à main levée dans `svgcanvas` | Les retirer ne gagnerait presque rien et compliquerait la reprise des versions amont |

### Améliorer

| Fonction | Changement | Gain |
| --- | --- | --- |
| Remplissage, contour, police, taille d'un objet stylé par classe | Afficher la valeur réelle et la règle qui la donne. Une modification change cette règle, après un avertissement qui nomme le sélecteur et le nombre d'objets touchés | L'inspecteur dit vrai ; les états SCorp-io restent pilotés par classe |
| X, Y, L, H d'un polygone | Un polygone sans attribut `shape` se place et se dimensionne comme une polyligne | Les polygones des fichiers réels se placent au clavier |

Les deux sont faites (lot S2).

### Simplifier

| Fonction | Changement | Touche | Gain |
| --- | --- | --- | --- |
| Barré, surligné, espacement des mots, longueur du texte, flou | Affichés seulement quand l'objet en a déjà une valeur | Création | La section Texte passe de 14 à 9 réglages ; une valeur existante reste visible et modifiable |
| Jointures, extrémités, espacement des lettres | Repliés sous « Plus d'options » | Outil | Sections plus courtes |
| Aligner sur la page | Fusionné avec le menu Aligner, qui s'ouvre aussi pour un seul objet | Outil | Une seule façon d'aligner |
| Propriétés du document (Maj+D) | Retirée une fois le choix « images incorporées ou liées » et « Ajuster au contenu » déplacés dans la section Document | Outil | Une seule place pour le document |
| Langues | Français et anglais seulement | Outil | 57 fichiers en moins (environ 1 Mo) |
| Bibliothèque de formes de SVG-Edit | Réduite aux catégories basic, arrow, flowchart et electronics | Création | Onglet Formes du tiroir lisible ; environ 330 Ko en moins |

### Supprimer

| Fonction | Touche | Raison |
| --- | --- | --- |
| Carré, Cercle, rectangle et ellipse à main levée (menu Formes) | Outil, création | Doublons ; le menu Formes passe de 9 à 5 entrées |
| Bouton Formes de SVG-Edit | Outil | Doublon de l'onglet Formes du tiroir ; l'extension n'est plus chargée par défaut, ses fichiers restent pour le tiroir |
| Réorienter le chemin (menu « … » d'un chemin) | Outil | Sans usage pour un synoptique |
| Page d'accueil SVG-Edit (menu Document) | Outil | Sans usage |
| Vue du calque seul (extension `layer_view`) | Outil | Doublon de l'œil du panneau Calques, et son raccourci ne marche plus ; l'extension reste chargeable par l'option `extensions` |
| Raccourcis D, C, G, A, Maj+O, Maj+P | Outil | Doublons ; Ctrl+D, Ctrl+G, Ctrl+A, Tab et Maj+Tab restent. Les boutons Dupliquer et Grouper du menu « … » font la même chose que les commandes `duplicate` et `group`, et affichent Ctrl+D et Ctrl+G |
| Extensions helloworld et overview_window | Code | Jamais chargées |
| Ancienne vue à défilement | Code | Remplacée par la vue sans bordure |
| Enregistrements en double du registre | Code | Une commande par action |

### Gains attendus

| Mesure | Avant | Après S1 (mesuré) | Après S3 (prévu) |
| --- | --- | --- | --- |
| Outils de la barre | 22 | 17 | 17 |
| Entrées du menu Formes | 9 | 5 | 5 |
| Réglages de la section Texte | 14 | 9, dont 1 replié | 9 |
| Entrées du menu Document | 10 | 8 | 8 |
| Commandes du registre | 118 | 110 | 106 |
| Raccourcis attribués à deux commandes | 5 | 4 | aucun |
| Fichiers de langue | 59 | 59 | 2 |

À cela s'ajoutent environ 330 Ko de formes hors sujet et deux extensions en moins. Surtout, depuis S2, l'inspecteur affiche la vraie valeur des objets stylés par classe.

## 5. Risques et dépendances des retraits

Pour chaque retrait, il faut faire trois vérifications :
- chercher les usages internes : registre, `layout.js`, `Inspector.js`, extensions, tests ;
- vérifier qu'une configuration de l'hôte ne s'en sert pas ;
- passer le filet du lot S0.

| Retrait | Dépendances | Effet sur les documents existants |
| --- | --- | --- |
| Carré, cercle, formes à main levée | Boutons de `LeftPanel.html`, menu `shapes` de `Toolbar.js` ; les modes restent dans `svgcanvas` | Aucun : ce sont des `rect`, `circle`, `ellipse` ordinaires |
| Bouton Formes de SVG-Edit | Extension `ext-shapes`, contrat des extensions de V0 ; le tiroir lit `ext-shapes/shapelib/`, et les noms des catégories dans les traductions de l'extension | Aucun : une forme déjà posée est un chemin ordinaire. Le tiroir lit lui-même fichiers et traductions quand l'extension n'est plus chargée |
| Catégories de formes | `shapelib/index.json`, lu par l'extension et par le tiroir | Aucun |
| Réglages rares du texte et flou | `TopPanel.js`, `Inspector.js` | Aucun : affichés dès que l'objet en a une valeur |
| Propriétés du document | Boîte `imagePropertiesDialog`, commande `tool_docprops`, menu Document | Aucun, si le choix des images et « Ajuster au contenu » sont déplacés avant. Les tailles prédéfinies de la boîte (640 × 480…) ne sont pas reprises : on tape L et H |
| Vue du calque seul | Extension `layer_view`, contrat des extensions de V0 | Aucun ; le contrat est mis à jour volontairement |
| Raccourcis en double | Registre de commandes, aide des raccourcis, palette | Aucun |
| Langues | `locale/`, option `lang`, préférences | Aucun. Un navigateur réglé en allemand affiche l'éditeur en anglais |
| Vue à défilement | `view.js`, option `view` | Aucun. Une configuration qui demande `view: 'scroll'` aura la vue sans bordure |
| Extensions jamais chargées | Aucune | Aucun |

**Ancienne disposition.** Elle reste telle quelle jusqu'au test utilisateur de V4, dont elle est la référence. S1 n'y touche pas. S2 y corrige les mêmes valeurs que dans la nouvelle, sans changer ses contrôles. S3 ne retire rien de ce qu'elle emploie (jPicker, jGraduate).

## 6. Interface proposée

L'interface suit la disposition « canevas » de V3 et V4, à la manière de Figma et de Claude Design :
- peu d'outils toujours visibles ;
- les réglages rares sous « Plus d'options » ;
- une valeur venant d'un style partagé montre le nom de ce style.

**Barre d'outils**, de haut en bas :

```
Sélection V · Échelle K · Main H
Texte T · Cadre d'export Maj+F · Formes ▾ (Rectangle R, Ellipse E, Ligne L, Polygone, Étoile) · Chemins ▾ (Plume P, Crayon Q)
Image · Connecteur · Bibliothèque
Plus ▾ (Loupe Z, Pipette Ctrl+I)
```

**Propriétés**, pour un objet :

```
Géométrie     X  Y  L  H  angle
Apparence     opacité
Remplissage ← .fond   ■ 160F23
Contour       couleur · épaisseur · style · marqueurs        [Plus d'options : jointures, extrémités]
Texte         police · taille · gras · italique · souligné · alignement · interligne · largeur automatique
              [Plus d'options : espacement des lettres]
              (barré, surligné, espacement des mots, longueur : seulement si l'objet en a)
Effets        (seulement si l'objet a un flou)
Identité      id · classe · titre · liaison
```

Le repère « ← .fond » s'inspire des styles partagés de Figma : le titre de la section nomme les règles qui donnent ses valeurs. Modifier une valeur montre le résultat sur le dessin et ouvre un avertissement, par exemple : « Cette couleur vient de la règle .fond, qui s'applique à 12 objets. Modifier la règle ? ». Confirmée, la modification forme une seule étape d'annulation. Refusée, elle disparaît sans laisser d'étape. La barre contextuelle, qui emploie les mêmes champs, suit d'elle-même.

**Barre du haut, menus Document et Zoom** : inchangés, sauf « Page d'accueil SVG-Edit », « Propriétés du document » et « Vue du calque seul », qui disparaissent.

**Menu « … »** : « Aligner et distribuer » s'ouvre aussi pour un seul objet. Il l'aligne alors sur la page, et la répartition et la référence, qui demandent plusieurs objets, laissent la place à une ligne qui le dit.

## 7. Plan de mise en œuvre

| Lot | Contenu | Sortie SVG | État |
| --- | --- | --- | --- |
| S0 Filet | Tests seulement ; l'éditeur ne change pas | Inchangée | Livré |
| S1 Masquer | Retraits d'interface, réglages conditionnels et repliés, fusion d'« Aligner sur la page », Propriétés du document | Identique à l'octet | Livré |
| S2 Corriger | Objets stylés par classe ; X, Y, L, H des polygones ; les deux dispositions | Change volontairement : la règle modifiée, rien d'autre | Livré |
| S3 Nettoyer (3 à 5 j, après deux semaines d'usage de S1) | Langues, catégories de formes, extensions jamais chargées, vue à défilement, enregistrements en double | Identique | À faire |

### S0 Filet (livré)

`tests/e2e/simplification-s0.spec.js`, avec `tests/fixtures/simplification/` :
- **Inventaire** (`inventaire.json`) : les 118 commandes et leurs raccourcis, la barre d'outils, les menus Document, Zoom et « … », les réglages de la section Texte. S1 et S3 le mettent à jour volontairement : `S0_UPDATE=1` le réécrit, et la différence se relit dans la demande de fusion.
- **Raccourcis partagés** : les cinq connus (section 3.3), quatre depuis S1 ; tout autre partage fait échouer le test. Un test montre que Ctrl+Maj+L verrouille la sélection sans toucher aux calques.
- **Familles** (`familles.svg`) : carré, cercle, rectangle, ellipse, polygone ordinaire, étoile, hexagone de l'extension, forme de la bibliothèque, tracé à main levée, flou, texte barré, surligné, espacé, à longueur fixée. Pour chacun, on ouvre le fichier, on déplace l'objet, on le redimensionne par sa poignée, on le fait pivoter, puis on le groupe et on le dégroupe. On vérifie ensuite trois choses :
  - les attributs propres à la famille sont gardés (`shape`, `text-decoration`, `filter`…) ;
  - annuler les cinq étapes rend le texte d'origine ;
  - le dessin modifié, rouvert, s'enregistre à l'identique.
- **Ce que S2 corrige**, tel que c'était avant lui (`styles-classe.svg`) :
  - le remplissage affiché « 000000 » et la couleur masquée ;
  - la taille affichée « null » et la police masquée ;
  - la valeur héritée d'un groupe, qui se modifie bien et doit le rester ;
  - le polygone sans X, Y, L, H, et l'étoile qui garde son panneau.

  S2 a retourné ces tests.

Les deux fichiers entrent aussi dans le corpus des tests existants : allers-retours de `compare-output.mjs`, rapport de fidélité, tests du corpus de V6.

**Mesures à la livraison** (Chromium) :
- `simplification-s0.spec.js` : 21 tests réussis, deux passages ;
- V6, robustesse de l'import, contrats des extensions, registre, liaisons, fidélité de l'import : 70 tests réussis ;
- sortie comparée à `master` (référence construite par `build-reference.mjs`) : 25 allers-retours sur 25 et 73 scénarios sur 73 identiques ;
- rapport de fidélité des deux fichiers : aucune perte ; les deux chemins de `familles.svg` sont réécrits en commandes relatives, comme pour tout fichier.

Firefox tourne en CI.

**Vérifier un lot S1 à S3** :

```bash
node tests/output/build-reference.mjs origin/master ../reference
```

```bash
npx vite preview --port 8010 --strictPort --outDir ../reference/dist/editor
```

```bash
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000
```

```bash
npx playwright test tests/e2e/simplification-s0.spec.js
```

### S1 Masquer (livré)

Seule la disposition « canevas » change. `src/editor/simplification.js` liste ce que S1 retire. Un contrôle retiré reste dans la page, caché et sans raccourci (`#se-retired`), pour le code qui le pilote.

**Ce qui disparaît ou se replie :**
- **Barre d'outils** : le menu Formes garde rectangle, ellipse, ligne, étoile et polygone. Maj avec Rectangle ou Ellipse trace toujours un carré ou un cercle : les modes restent dans `svgcanvas`.
- **Extensions** : `ext-shapes` et `ext-layer_view` ne sont plus chargées par défaut. L'onglet Formes du tiroir lit lui-même les formes et le nom de leurs catégories. Ctrl+Maj+L ne sert plus qu'au verrou.
- **Menu « … »** : Réorienter le chemin et Aligner sur la page disparaissent. « Aligner et distribuer » s'ouvre aussi pour un seul objet, l'aligne sur la page et reste ouvert entre deux alignements. Dupliquer et Grouper affichent Ctrl+D et Ctrl+G, dans le menu comme dans la barre contextuelle.
- **Menu Document** : Propriétés du document et Page d'accueil SVG-Edit disparaissent. La section Document reçoit le choix des images (incorporées ou par adresse) et « Ajuster au contenu ».
- **Réglages rares** : barré, surligné, espacement des mots, longueur du texte et son ajustement, flou. Chacun n'apparaît que si l'un des objets sélectionnés en a une valeur. Affiché, il reste tant que la sélection ne change pas, pour qu'on puisse remettre une valeur qu'on vient d'ôter.
- **« Plus d'options »** : jointures et extrémités sous Contour, espacement des lettres sous Texte. Un point marque le bouton quand l'objet a une valeur inhabituelle (jointure arrondie, espacement non nul). Les marqueurs restent visibles.
- **Raccourcis** : D, C, G, A, Maj+O, Maj+P et Maj+D ne font plus rien.

**Correction en passant** : l'option `extensions` était ignorée tant que les extensions par défaut se chargeaient, contrairement à sa documentation. Elle s'y ajoute désormais, sans doublon : c'est ce qui rend `ext-shapes` et `ext-layer_view` chargeables. Une extension du dossier `extensions` demandée par l'URL (`?extensions=ext-…`) se charge donc aussi. `lockExtensions` et `preventAllURLConfig` l'empêchent, comme avant.

**Tests :**
- `simplification-s1.spec.js`, 12 tests :
  - les outils retirés sont hors de la vue et sans raccourci, et Maj trace un carré ;
  - le tiroir montre les formes nommées et en insère une ;
  - Ctrl+D, Ctrl+G, Ctrl+A et Tab agissent ; D, C, G, A, Maj+O et Maj+P ne font rien ;
  - Aligner, pour un objet puis pour plusieurs ;
  - la section Document ; les réglages rares et repliés ;
  - les deux extensions chargées par l'option ;
  - l'ancienne disposition comparée à un relevé fait sur `master` (`classique.json` : commandes, outils, menu Document, extensions et barre du haut pour sept sélections).
- Mises à jour voulues :
  - l'inventaire de S0, réécrit par `S0_UPDATE=1` ; le relevé de la section Texte se fait sur un texte simple ajouté à `familles.svg` ;
  - les raccourcis partagés, quatre depuis S1 ;
  - le contrat des extensions de V0, qui charge les deux extensions par l'option et vérifie ce que chaque disposition charge par défaut ;
  - la barre d'outils de V3, la section Effets, le raccourci de Dupliquer, la vue du calque ;
  - le test unitaire de `ConfigObj`.

**Mesures à la livraison** (Chromium) :
- `simplification-s1.spec.js` : 12 tests réussis ; `simplification-s0.spec.js` : 21 ;
- suites touchées (V3, V4, V7, contrats des extensions, registre, presse-papiers, outils de texte, raccourcis, menu principal) : 172 tests réussis, après la mise à jour de `layout-v3` ;
- suite complète de bout en bout : 557 tests sur 558. Le dernier, « Enter makes a line » (`texte-multiligne.spec.js`), échoue quand la machine est chargée : il passe seul, et sous quatre processus il échoue aussi sur `master` (7 fois sur 12, contre 9 sur 12 avec S1) ;
- sortie comparée à `master` : 25 allers-retours sur 25 et 73 scénarios sur 73 identiques ;
- rapport de fidélité des fichiers du lot : aucune perte ;
- `standard`, contrôles des couleurs et des libellés, `remark` : réussis.

Firefox tourne en CI.

**Refaire le relevé de l'ancienne disposition** (seulement si elle change volontairement) :

```bash
S1_CLASSIC_UPDATE=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:8010 npx playwright test tests/e2e/simplification-s1.spec.js -g "Classic"
```

### S2 Corriger (livré)

Les deux dispositions changent : c'est une correction (section 1).

**Objets stylés par classe :**
- **Recherche** (`packages/svgcanvas/core/style-rules.js`). Ce qui donne une propriété à un objet, dans l'ordre de la cascade CSS :
  1. une déclaration `!important` de son attribut `style` ;
  2. une règle `!important` ;
  3. son attribut `style` ;
  4. la règle la plus spécifique qui le vise et fixe la propriété, la dernière écrite à égalité.

  Les règles de `@media`, `@supports` et `@layer` comptent, comme le raccourci `font`. Une règle que le navigateur ne lit pas est écartée. Une valeur seulement héritée d'un parent ne vient d'aucune règle de l'objet : son attribut continue de l'emporter. Les feuilles des fichiers importés sont lues sous leur forme confinée, et leurs sélecteurs s'affichent comme le fichier les écrit.
- **Affichage**. Ces champs montrent la valeur de la règle :
  - remplissage et opacité ;
  - contour : couleur, épaisseur, style, jointures, extrémités ;
  - police, taille, gras, italique, espacements.

  Dans la disposition canevas, le titre de la section nomme les règles : « Contour ← .tuyau.arret, .tuyau ». L'ancienne disposition n'a pas de place pour ce repère : seules les valeurs de ses champs changent.
- **Écriture**. Une modification de ces propriétés va là où se trouve la valeur :
  - une règle est réécrite dans le texte de sa feuille, valeur seule, le reste tel quel. `!important` est gardé, `px` est ajouté là où CSS l'exige, et une déclaration est ajoutée après un raccourci `font` ;
  - l'attribut `style` d'un objet est réécrit de la même façon.

  Aucun attribut n'est ajouté. La réécriture fait partie de l'étape d'annulation de la modification. Les textes de plusieurs lignes que la règle touche sont remis en page dans la même étape.
- **Avertissement** (`src/editor/class-styles.js`). La modification se voit sur le dessin, puis l'éditeur demande : « Cette couleur vient de la règle .fond, qui s'applique à 12 objets. Modifier la règle ? ».
  - Refusée, l'étape est retirée : la feuille revient, il n'y a rien à rétablir, la sélection reste.
  - Acceptée, les mêmes règles ne sont plus demandées tant que la sélection ne change pas : l'épaisseur puis la couleur d'une tuyauterie ne posent qu'une question.
  - Un style de texte qui touche plusieurs règles pose une seule question, qui les liste.
- **Aperçu de la fenêtre couleur**. Sur un objet stylé, il passe par l'attribut `style`, rendu tel quel à la fin.
- **Écart avec le plan**. La règle est réécrite avant la question, qui s'affiche sur le résultat ; un refus la retire. Une question posée avant l'écriture aurait coupé en deux les étapes composées, comme une peinture avec son dégradé ou un style de texte : la question ne peut pas attendre au milieu d'elles.
- **Ce qui ne change pas** :
  - la décoration et l'ancrage du texte, les marqueurs et la géométrie s'écrivent toujours en attributs ;
  - une valeur héritée d'un groupe s'affiche comme avant : l'attribut de l'objet, ou la valeur par défaut ;
  - la liste des polices n'affiche que ses propres polices, comme avant ;
  - « Copier / Coller les propriétés » et la Pipette lisent et écrivent toujours les attributs : sur un objet stylé par classe, ils restent sans effet visible, comme avant S2. Les faire passer par les règles est un lot à part.

**Polygones** : un polygone sans attribut `shape` a X, Y, L, H, comme une polyligne. Il se déplace et se redimensionne par sa boîte, et ses points sont réécrits. Ceux de l'outil Étoile/Polygone gardent leur panneau.

**Tests :**
- `tests/unit/style-rules.test.js`, 19 tests :
  - une classe ;
  - plusieurs classes (`titre titre-page`) ;
  - un état : `.tuyau.arret`, et `.tuyau.en-marche.chaud.depart` qui l'emporte par sa spécificité ;
  - des sélecteurs qui ne sont pas une classe : `svg.synoptique text.mesure`, et `svg.synoptique`, qui ne donne la police que par héritage ;
  - une feuille d'import confinée ;
  - une valeur héritée d'un groupe ;
  - `!important` et l'attribut `style` ;
  - le raccourci `font`, une règle illisible, `@media` ;
  - le décompte des objets, la réécriture ;
  - sur le canevas : une étape sans attribut, annulée et rétablie ; l'attribut `style` ; une valeur inchangée ; le retrait d'une étape refusée.
- `tests/e2e/simplification-s2.spec.js`, 13 tests ; les cinq premiers tournent dans les deux dispositions :
  - le remplissage et la police montrent les valeurs des règles, nommées dans la disposition canevas ;
  - après confirmation, l'écran change, la règle est réécrite et aucun attribut n'est ajouté ; une annulation rend la feuille d'origine ;
  - un refus ne laisse rien ;
  - une valeur héritée s'écrit sur l'objet, sans question ;
  - la tâche 4 du test de V4, sur `synoptique-chaufferie.svg` : l'avertissement donne le bon nombre de tuyauteries, l'épaisseur et la couleur ne posent qu'une question, et le fichier enregistré ne diffère de l'original que par la règle ;
  - un style de texte de V4 : une question pour les deux règles, une étape ;
  - le polygone de `repr-pompe.svg` se déplace et se redimensionne par X, Y, L, H ; l'étoile garde son panneau.
- Les quatre tests « ce que S2 corrige » de S0, retournés.

**Mesures à la livraison** (Chromium) :
- tests unitaires : 1 022 réussis, dont 19 nouveaux ;
- `simplification-s2.spec.js` : 13 tests réussis ; `simplification-s0.spec.js` : 21 ; `simplification-s1.spec.js` : 12, dont la comparaison de l'ancienne disposition à `classique.json`, inchangé ;
- sortie comparée à `master` : 25 allers-retours sur 25 et 73 scénarios sur 73 identiques. Un fichier ouvert puis enregistré sans modification ne change pas ;
- rapport de fidélité des fichiers du lot et des fichiers SCorp-io : le même que sur `master` ;
- `standard`, contrôles des couleurs et des libellés, `remark` : réussis.

Firefox tourne en CI.

### S3 Nettoyer

Chaque retrait passe par les mêmes vérifications :
- recherche des usages ;
- suite complète, unitaire et de bout en bout, sous Chromium et Firefox ;
- rapport de fidélité ;
- bench.

| Retrait | Vérification propre |
| --- | --- |
| 57 fichiers de langue | Le repli vers l'anglais fonctionne et aucun test ne lit une autre langue |
| Catégories de formes hors sujet | Le tiroir et l'extension lisent la même liste réduite |
| Extensions helloworld et overview_window | Aucune configuration de l'hôte ne les charge |
| Vue à défilement | L'option `view: 'scroll'` retombe sur la vue sans bordure |
| `tool_delete`, `tool_delete_multi`, `tool_move_top`, `tool_move_bottom` | Fusionnés avec `delete`, `move_front` et `move_back` ; les boutons gardent leur effet ; plus aucun raccourci partagé |
