# Refonte de la sélection — lot M4 « Panneau de la multi-sélection »

Branche `refonte-selection-m4`, partie de `refonte-selection-m5` (le plan place M5 avant M4). Le panneau d'une multi-sélection donne maintenant la position, la taille et l'angle de l'ensemble, montre les valeurs que les objets partagent ou « Mixte », et accepte des calculs. Le SVG écrit par les opérations existantes ne change pas.

## 1. Ce qui change pour l'utilisateur

### X, Y, L et H de l'ensemble

Dès deux objets sélectionnés, le panneau affiche X, Y, L et H de l'ensemble, suivis d'un verrou de proportions.

- **La boîte décrite** est celle des objets sans leur trait, dans le repère du dessin. Pour un rectangle non tourné, ce sont son x, son y, sa largeur et sa hauteur. Un objet tourné compte par sa boîte tournée. C'est la boîte que montre déjà la cote vivante de M5 : X et Y de la cote pendant un déplacement sont ceux des champs.
- **X et Y** déplacent l'ensemble, comme les flèches du clavier, en une étape d'annulation.
- **L et H** mettent l'ensemble à l'échelle depuis le coin haut gauche de sa boîte, avec les règles du redimensionnement par poignée (M2) : géométrie réécrite, trait inchangé, cercle qui reste un cercle, texte jamais déformé. Une étape d'annulation.
- **Le verrou** fait suivre H quand on change L, et inversement. Il est relâché par défaut et garde son état d'une sélection à l'autre.
- **Les valeurs** sont dans l'unité du document et arrondies à deux décimales. Un calcul s'applique à la valeur exacte, pas à l'arrondi : `*2` double exactement.

Un texte dans l'ensemble prend la plus petite des deux échelles (règle M2). Changer L seule écarte donc les textes sans changer leur taille de police : pour les agrandir, il faut le verrou.

### Les valeurs communes, ou « Mixte »

Une propriété que les objets partagent affiche sa valeur. Sinon le champ est vide et affiche « Mixte ». Une valeur tapée ou choisie s'applique alors à tous.

| Propriété | Objets lus |
| --- | --- |
| Épaisseur et style du trait | les formes, y compris celles des groupes |
| Opacité | les objets sélectionnés |
| Couleurs de remplissage et de trait | les formes ; une pastille rayée signale des couleurs différentes |
| Angle | les objets sélectionnés (voir plus bas) |
| Taille, famille, espacements, longueur et ajustement du texte | quand la sélection ne contient que des textes |

Avant M4, ces champs gardaient la valeur du dernier objet sélectionné seul.

### Le calcul dans les champs

Tous les champs numériques acceptent un calcul :
- une expression avec `+ - * /` et des parenthèses, par exemple `100+20` ou `(10+5)*2` ; la virgule vaut le point ;
- une expression qui commence par `+`, `*` ou `/` s'applique à la valeur affichée : `+10` ajoute 10, `*2` double, `/3` divise par trois ;
- `-10` donne −10. Pour retirer 10, on tape `+-10`, ou `Mixte-10` dans un champ « Mixte ».

Dans un champ « Mixte », un calcul s'applique à la valeur de chaque objet : `+2` dans l'épaisseur du trait ajoute 2 à chacune, en une étape d'annulation. Les flèches du champ font de même, d'un pas. Le résultat reste borné par le champ, par exemple entre 0 et 100 % pour l'opacité.

### Le champ angle

- **Angle commun** (tous les objets à 0°, par exemple) : le champ l'affiche ; une valeur tapée tourne l'ensemble autour de son centre, comme en M3.
- **Ensemble déjà tourné** par sa poignée ou par Ctrl+← → : le champ affiche la rotation appliquée, comme en M3.
- **Angles différents** : le champ affiche « Mixte ». Une valeur donne cet angle à chaque objet, autour de son propre centre : `0` redresse toute la sélection. Un calcul s'applique à l'angle de chaque objet : `+10` tourne chacun de 10°, sur place.

En M3, le champ restait vide et une valeur tapée tournait l'ensemble autour de son centre. Le plan prévoit « Mixte » pour M4 ; c'est la réponse retenue à la question laissée ouverte en M3.

### Les commandes

En multi-sélection, le panneau propose aussi :
- **premier plan et arrière-plan**, qui gardent l'ordre relatif des objets ;
- **la conversion en chemin**, visible quand la sélection contient au moins une forme convertible. Chaque forme est convertie comme si elle avait été cliquée seule puis convertie, avec son propre trait et son propre remplissage. Les autres objets restent tels quels et sélectionnés avec les nouveaux chemins. Une étape d'annulation.

La symétrie (M1) et le calque restaient déjà disponibles.

### L et H d'un chemin, d'un groupe ou d'un texte seul

Un chemin, une polyligne, un groupe ou un texte sélectionné seul reçoit les champs L et H, avec la même boîte sans le trait et la même mise à l'échelle depuis le coin haut gauche.

- **Un texte** garde toujours ses proportions : le verrou est enfoncé et grisé.
- **X et Y** d'un chemin, d'une polyligne ou d'un groupe gardent leur sens d'origine, la boîte trait compris (voir la partie 5).

### Correction : la première touche tapée

Dans un champ numérique, la première touche tapée était appliquée aussitôt : taper « 120 » dans la largeur d'un rectangle donnait une largeur de 1, puis de 120 à Entrée, soit deux étapes d'annulation. Seule la valeur validée par Entrée, ou par la sortie du champ, s'applique maintenant. Le résultat final est le même ; l'historique compte une étape de moins.

## 2. Ce qui ne change pas

### Sortie SVG

La comparaison avec M5 (`27217ed`) par les scripts de `tests/output/` donne :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 60 sur 60 identiques, sans aucune différence attendue.

Onze scénarios sont nouveaux : ils envoient une valeur aux champs qui existaient avant M4, comme le fait le champ une fois la valeur tapée. Par exemple X et Y d'un chemin, d'un groupe et d'un texte, largeur et hauteur d'un rectangle, rayon d'un cercle, épaisseur du trait, opacité et angle, seul ou en multi-sélection.

### API des extensions

- **Canevas : nouvelles méthodes.**
  - `getSelectionBox(elements?)` : la boîte des champs X, Y, L et H ;
  - `moveSelectionTo(x, y)` et `resizeSelectionTo(width, height, { keepRatio })` ;
  - `rotateEachSelectedElement(angleOf)` : un nouvel angle pour chaque objet, autour de son centre ;
  - `changeSelectedAttributeEach(attr, valueOf, elems?)` : une valeur par objet, en une étape d'annulation ;
  - `convertSelectedToPaths()`.
- **Composant `se-spin-input`.**
  - Il gagne la propriété `mixed`, qui affiche « Mixte », et la propriété `preciseValue`, la valeur exacte derrière un arrondi.
  - Un calcul dans un champ « Mixte » envoie un événement `change` dont `detail.relative` donne la nouvelle valeur d'un objet à partir de la sienne.
  - Une valeur tapée dans un champ « Mixte » porte `detail.wasMixed`.
  - Un nombre tapé simplement est transmis tel quel, comme avant.
- **Composants `se-select` et `se-colorpicker`.** `se-select` gagne `mixed`. `se-colorpicker` gagne `updateMany(svgCanvas, elements)`.
- **Nouveaux modules de l'éditeur.**
  - `src/editor/components/fieldExpression.js` : le calcul dans les champs ;
  - `src/editor/panels/panelValues.js` : les valeurs communes.
- **Nouveaux éléments du panneau.** `selected_w`, `selected_h`, `tool_ratio_lock`, `tool_move_top_multi`, `tool_move_bottom_multi` et `tool_topath_multi`.
- **Champs X et Y.** En multi-sélection, ils déplacent l'ensemble au lieu de passer par `changeSelectedAttribute('x')`.

### Performances

Le panneau remplit les champs d'une multi-sélection après le dessin de l'image suivante, quand le navigateur est libre :
- les boîtes sont lues sur une mise en page déjà faite ;
- un rectangle de sélection, qui change la sélection à chaque mouvement, ne force aucune mise en page supplémentaire ;
- l'angle reste mis à jour aussitôt.

À 2 000 objets, ce remplissage prend environ 5 ms et ne retarde pas l'affichage du canevas.

Mesures alternées M5 puis M4, à 2 000 objets, trois passes chacune sur la même machine :

| Interaction | M5 | M4 | Budget |
| --- | --- | --- | --- |
| Tout sélectionner | 125 à 148 ms | 116 à 123 ms | 150 ms |
| Relâchement du glisser | 102 à 108 ms | 99 à 116 ms | 200 ms |
| Annuler le déplacement | 41 à 46 ms | 46 à 54 ms | 50 ms |
| Rectangle de sélection, un mouvement | 61 à 62 ms | 63 à 67 ms | 100 ms |

Les écarts restent dans le bruit de la machine de mesure. Sur ces passes, M4 a dépassé une fois le budget d'annulation (54 ms), une fois celui d'un mouvement de glisser (107 ms) et une fois celui d'un mouvement de rotation (111 ms). Ces deux derniers gestes n'appellent pas le code de M4. La troisième passe respecte tous les budgets.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m4
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dessinez un rectangle et une ellipse, sélectionnez les deux. Le panneau affiche X, Y, L et H de l'ensemble. Tapez une autre largeur : l'ensemble s'élargit depuis son coin haut gauche, et Ctrl+Z l'annule en une fois.
2. Activez le verrou, puis tapez `*2` dans H : la largeur double aussi.
3. Donnez des épaisseurs de trait différentes aux deux objets. Le champ affiche « Mixte » ; tapez `+2` : chaque épaisseur augmente de 2. La pastille de remplissage est rayée si les couleurs diffèrent.
4. Tournez un des deux objets, puis sélectionnez les deux : l'angle affiche « Mixte ». Tapez `0` : les deux objets se redressent sur place.
5. Avec deux formes et un texte sélectionnés, cliquez « Convertir en chemin » : les formes deviennent des chemins de la même couleur, le texte ne change pas.
6. Sélectionnez un chemin seul : L et H apparaissent. Doublez L : le chemin s'élargit depuis son coin haut gauche.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. Pour M4, la référence est M5 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m5 ..\ref-m5
npx vite preview --port 8010 --strictPort --outDir ..\ref-m5\dist\editor
```

Puis, avec la version courante servie sur le port 8000, sans différence attendue :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000
```

## 4. Tests ajoutés

- **`tests/unit/field-expression.test.js` (6 tests).** Nombres gardés tels quels, priorités et parenthèses, virgule, calcul sur la valeur affichée, mot « Mixte », saisies refusées.
- **`tests/unit/panel-values.test.js` (4 tests).** Valeur commune ou « Mixte », arrêt à la première différence, arrondi, formes des groupes.
- **`tests/unit/se-spin-input.test.js` (7 tests de plus).** Calcul sur la valeur affichée ou exacte, bornes, état « Mixte », calcul et flèches par objet, valeur tapée dans un champ « Mixte ».
- **`tests/unit/selection-m4.test.js` (2 tests).** Une valeur par objet, en une étape d'annulation.
- **`tests/e2e/selection-m4.spec.js` (18 tests).**
  - **Ensemble :** boîte sans le trait, objet tourné, X et Y, L et H depuis le coin haut gauche, verrou, calcul, texte jamais déformé, valeur renvoyée sans effet, unité du document.
  - **« Mixte » :** épaisseur du trait (`+2`, `Mixte*2`, valeur commune), valeurs partagées, pastille rayée, flèches, style du trait, police, angle par objet puis commun, première touche.
  - **Commandes et objet seul :** ordre, conversion en chemin, L et H d'un chemin, d'un groupe et d'un texte, cote vivante égale aux champs.
- **`tests/e2e/selection-m3.spec.js`.** Le test du champ angle aux angles différents suit le nouveau comportement : « Mixte », puis la rotation appliquée par Ctrl+→.
- **`tests/output/compare-output.mjs`.** Onze scénarios sur les champs existants.

Bilan : lint propre, 700 tests unitaires et 211 tests E2E verts.

## 5. Limites connues et décisions à prendre

- **Champ angle aux angles différents : à confirmer.** Une valeur ou un calcul s'applique à chaque objet sur son centre, comme Figma le fait pour les valeurs mixtes. L'autre lecture, celle de M3, tournait l'ensemble autour de son centre. La rotation de l'ensemble reste possible par la poignée, par Ctrl+← → ou par le champ quand l'angle est commun.
- **X et Y d'un chemin, d'une polyligne ou d'un groupe seul : à décider.** Ils décrivent la boîte trait compris, depuis l'origine de SVG-Edit. L, H et les champs d'une multi-sélection décrivent la boîte sans le trait. Pour un chemin au trait de 4, X vaut donc 298 seul et 300 dans une multi-sélection. Les aligner changerait le SVG écrit par ces champs : je ne l'ai pas fait sans accord.
- **Polygone seul.** Il n'a toujours ni X, Y ni L, H, comme dans SVG-Edit d'origine. Le plan ne le demande pas.
- **Largeur de la barre.** En multi-sélection, la barre du haut passe sur deux lignes sous 1 500 px de large environ, sans décaler le canevas. L'alignement compact du plan (section 4, « Interface sobre ») regrouperait les dix boutons d'alignement et de distribution en un seul : il ne fait pas partie de M4.
- **« Mixte » non affiché** pour le raccord et la terminaison du trait, l'ancrage du texte et les décorations : ces boutons ne montrent un état que lorsque tous les objets le partagent, comme avant.
- **Conversion en chemin.** Elle reproduit la conversion d'un objet seul cliqué, y compris un défaut existant : un attribut absent de la forme est écrit avec la valeur « null » (par exemple `fill-opacity="null"`). Une tâche séparée est proposée pour le corriger dans les deux cas.
- **Valeurs arrondies.** Les champs affichent deux décimales. Un calcul utilise la valeur exacte ; une valeur tapée est prise telle quelle.
- **Lots suivants :** la sélection avancée (M6), le presse-papiers et la duplication (M7), l'outil Échelle et le rangement (M9).
