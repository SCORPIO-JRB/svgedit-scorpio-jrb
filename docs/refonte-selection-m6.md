# Refonte de la sélection — lot M6 « Sélection avancée »

Branche `refonte-selection-m6`, partie de `refonte-selection-m4`. On peut maintenant prendre directement un objet au fond des groupes (Ctrl+clic), descendre aux enfants et remonter au parent au clavier (Entrée, Maj+Entrée), et sélectionner les objets semblables depuis le menu contextuel. Le SVG écrit par les opérations existantes ne change pas.

## 1. Ce qui change pour l'utilisateur

### Ctrl+clic : l'objet le plus profond

Ctrl+clic (Cmd+clic sur Mac) prend l'objet sous le pointeur, même s'il se trouve dans un groupe lui-même dans un groupe. On n'a plus à ouvrir les groupes un à un par double-clic.

- **Les groupes qui contiennent l'objet s'ouvrent**, comme après des doubles clics. Les autres objets sont estompés et le fil d'Ariane affiche « Calque 1 > groupe > sous-groupe ». Un clic simple prend ensuite les autres objets du même groupe.
- **Un objet estompé** reste accessible par Ctrl+clic. Son groupe s'ouvre à la place du groupe courant ; pour un objet du calque, tous les groupes se ferment.
- **Ctrl+glisser** déplace l'objet seul, en une étape d'annulation.
- **Maj+Ctrl+clic** ajoute un objet du même groupe à la sélection ; un second Maj+Ctrl+clic le retire. Dans un autre groupe, il commence une nouvelle sélection : une sélection reste dans un seul groupe ouvert.
- **Survol.** En tenant Ctrl, le contour bleu de M5 montre l'objet que prendrait le Ctrl+clic. Il suffit d'appuyer sur Ctrl ou de le relâcher, sans bouger la souris.
- **Groupe tourné.** Comme au double-clic, ouvrir un groupe tourné transfère sa rotation à ses objets. Le document est modifié, en une étape d'annulation, et le SVG est le même qu'avec un double-clic.
- **Sur Mac**, Ctrl+clic reste le clic droit.

Un clic simple et le double-clic ne changent pas.

### Entrée et Maj+Entrée

- **Entrée sur un groupe** sélectionné seul ouvre le groupe et sélectionne ses objets.
- **Entrée sur un chemin** passe à l'édition des nœuds ; **sur un texte**, à l'édition du texte. Le plan ne le demandait pas : c'est le comportement de Figma pour « descendre » dans un objet qui n'a pas d'enfants.
- **Maj+Entrée** sélectionne le groupe ouvert et ouvre le groupe qui le contient. Au niveau du calque, il ne fait rien.
- **Échap dans un groupe ouvert remonte d'un seul niveau**, comme Maj+Entrée. Avant, Échap fermait tous les groupes ouverts et sélectionnait le plus profond. La différence ne se voit qu'avec des groupes imbriqués.
- Avec plusieurs objets sélectionnés, Entrée ne fait rien. Entrée tapée dans un champ du panneau valide toujours le champ.

### Objets semblables

Trois entrées s'ajoutent en bas du menu contextuel :

| Entrée | Objets pris |
| --- | --- |
| Sélectionner le même symbole | les `use` qui renvoient au même symbole |
| Sélectionner le même remplissage | les formes et les textes de même couleur et de même opacité de remplissage |
| Sélectionner le même trait | les formes et les textes de même couleur et de même opacité de trait |

- **Les couleurs sont comparées après calcul par le navigateur** : `red`, `#f00` et `#ff0000` sont la même couleur. Une couleur héritée d'un groupe compte. Un dégradé compte par son identifiant.
- **Le trait** ne compare que sa couleur et son opacité, pas son épaisseur ni ses pointillés.
- **Avec plusieurs objets sélectionnés**, on obtient les objets semblables à l'un ou l'autre.
- **La recherche porte sur le groupe ouvert ou sur le calque**, au même niveau que Ctrl+A. Les objets rangés dans d'autres groupes ne sont pas pris (voir la section 5).
- **Les entrées sont grisées** quand la sélection n'offre pas de référence : pas de `use` pour le symbole, pas de forme ni de texte pour le remplissage et le trait.
- Rien n'est écrit dans le document.

### Corrections au passage

- **Fil d'Ariane.** Il affichait les groupes imbriqués à l'envers, le plus intérieur d'abord.
- **Clic après un clic droit.** Après un clic droit sur un objet non sélectionné, un clic simple sur un membre de la multi-sélection ne le gardait pas seul, et Maj+clic ne le retirait pas. M6 rend ce cas fréquent : clic droit, « même remplissage », puis clic sur un des objets.
- **Objets estompés.** Ouvrir un groupe remplaçait tout l'attribut `style` des autres objets ; seule la propriété `pointer-events` change maintenant. L'import convertit déjà les styles en attributs, donc aucune perte n'a été constatée en pratique : la correction est préventive et la sortie ne change pas.

## 2. Ce qui ne change pas

### Sortie SVG

La comparaison avec M4 (`c2f3f3a`) par les scripts de `tests/output/` donne :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 62 sur 62 identiques, sans aucune différence attendue.

Deux scénarios sont nouveaux, parce que M6 touche à l'ouverture des groupes : ouvrir un groupe, déplacer un de ses objets puis le refermer, et ouvrir un groupe tourné par double-clic.

### API des extensions

- **Canevas : nouvelles méthodes**, dans le nouveau module `packages/svgcanvas/core/selection-nav.js` :
  - `getDeepTarget(evt)` : l'objet le plus profond sous le pointeur et le groupe qui le contient ;
  - `openDeepTarget(evt)` : ouvre ce groupe et renvoie l'objet ;
  - `selectChildren()` et `selectParent()` : Entrée et Maj+Entrée ;
  - `canSelectSimilar(criterion, elements?)` et `selectSimilar(criterion)`, avec `criterion` valant `'symbol'`, `'fill'` ou `'stroke'` ;
  - `refreshHover(evt)` : redessine le contour du survol avec les touches tenues.
- **Module `draw`.** Nouvelle fonction `elementFromPointInDrawing(x, y)`, qui voit aussi les objets estompés par un groupe ouvert.
- **Menu contextuel.**
  - Trois entrées : `select_same_symbol`, `select_same_fill` et `select_same_stroke`. Elles envoient l'événement `change`, comme les autres.
  - Une méthode `setItemEnabled(action, enabled)`. Contrairement à l'attribut `enablemenuitems`, elle agit même quand on donne deux fois de suite la même valeur.
- **Raccourcis.** Entrée et Maj+Entrée sont ajoutés, et Échap remonte d'un niveau dans un groupe ouvert.
- **Traductions.** `tools.select_same_symbol`, `tools.select_same_fill` et `tools.select_same_stroke`, en français dans `lang.fr.js` et en anglais dans les autres langues.

### Performances

Le Ctrl+clic et le survol avec Ctrl ne coûtent rien de plus qu'un clic, sauf pour viser un objet estompé. Il faut alors rendre un instant le pointeur à ces objets : environ 4 ms avec 2 000 objets estompés.

Mesures alternées M4 puis M6, à 2 000 objets, trois passes chacune sur la même machine :

| Interaction | M4 | M6 | Budget |
| --- | --- | --- | --- |
| Tout sélectionner | 111 à 118 ms | 120 à 132 ms | 150 ms |
| Relâchement du glisser | 98 à 100 ms | 94 à 102 ms | 200 ms |
| Annuler le déplacement | 41 à 44 ms | 42 à 46 ms | 50 ms |
| Rectangle de sélection, un mouvement | 60 à 68 ms | 64 à 68 ms | 100 ms |
| Pivoter tout, un mouvement | 68 à 96 ms | 62 à 69 ms | 100 ms |

Toutes les passes respectent tous les budgets.

L'écart sur « Tout sélectionner » a été vérifié à part, avec 15 mesures par version en alternance. Les médianes sont de 63 ms pour M4 et de 61 ms pour M6. La seule nouveauté sur ce chemin, l'état des trois entrées du menu, coûte 0,05 ms. L'écart du banc vient donc de la machine de mesure.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m6
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dessinez deux rectangles et groupez-les (G), puis groupez ce groupe avec une ellipse. Ctrl+clic sur un rectangle : il est pris seul, le reste du dessin s'estompe et le fil d'Ariane montre les deux groupes. Cliquez l'autre rectangle sans Ctrl : il est pris à son tour.
2. Toujours dans le groupe, Ctrl+clic sur un objet estompé du calque : les groupes se ferment et l'objet est pris.
3. Sélectionnez le grand groupe, puis Entrée : ses deux objets sont sélectionnés. Maj+Entrée revient au groupe. Échap, dans un groupe ouvert, remonte aussi d'un niveau.
4. Sélectionnez un chemin et appuyez sur Entrée : ses nœuds s'affichent. Échap revient à la sélection.
5. Dessinez trois cercles, dont deux rouges. Clic droit sur un cercle rouge, puis « Sélectionner le même remplissage » : les deux cercles rouges sont pris.
6. Tenez Ctrl en survolant un objet groupé : le contour bleu passe du groupe à l'objet.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. Pour M6, la référence est M4 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m4 ..\ref-m4
npx vite preview --port 8010 --strictPort --outDir ..\ref-m4\dist\editor
```

Puis, avec la version courante servie sur le port 8000, sans différence attendue :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000
```

## 4. Tests ajoutés

- **`tests/unit/selection-m6.test.js` (10 tests).** Ctrl ou Cmd selon le système, objet le plus profond (tspan, lien autour d'un seul objet, hors du calque), ouverture sans écriture dans le document, objets estompés puis rendus, style conservé, Entrée et Maj+Entrée, couleur héritée des groupes, entrées grisées, objets semblables du groupe ouvert ou du calque.
- **`tests/unit/draw-context.test.js`.** Le test vérifiait la valeur exacte de l'attribut `style` ; il vérifie maintenant la seule propriété `pointer-events`.
- **`tests/e2e/selection-m6.spec.js` (15 tests).**
  - **Ctrl+clic :** objet profond et fil d'Ariane, objets estompés, Maj+Ctrl+clic, Ctrl+glisser en une étape, groupe tourné identique au double-clic et annulable, document inchangé après ouverture et fermeture, survol avec Ctrl.
  - **Clavier :** Entrée et Maj+Entrée, Échap d'un niveau, nœuds d'un chemin et édition d'un texte, Entrée dans un champ du panneau.
  - **Objets semblables :** symbole, couleur écrite de plusieurs façons, trait, clic après un clic droit, recherche limitée au groupe ouvert, réunion de plusieurs références.
- **`tests/output/compare-output.mjs`.** Deux scénarios sur l'ouverture des groupes.

Bilan : lint propre, 710 tests unitaires et 226 tests E2E verts.

## 5. Limites connues et décisions à prendre

- **Portée des objets semblables : à décider.** La recherche s'arrête au groupe ouvert ou au calque, comme Ctrl+A. Des pompes rangées chacune dans un groupe avec leur étiquette ne sont donc pas prises ensemble. Figma cherche dans toute la page. Le faire ici donnerait des sélections dont les objets ont des parents différents : or le déplacement, l'alignement et le groupement ne tiennent pas encore compte d'un groupe parent tourné ou mis à l'échelle. Il faudrait d'abord les corriger.
- **Groupe tourné ouvert par Ctrl+clic.** Le document est modifié comme au double-clic : la rotation passe aux objets du groupe, en une étape d'annulation. Une autre règle, ne pas ouvrir un groupe tourné par exemple, est possible si cette écriture gêne.
- **Groupe mis à l'échelle (sans rotation).** Il s'ouvre sans transformation, comme au double-clic. Un objet déplacé à l'intérieur suit alors le repère du groupe : le déplacement est multiplié par l'échelle. C'est un défaut existant du double-clic.
- **Sélection dans un seul groupe.** Maj+Ctrl+clic dans un autre groupe recommence la sélection au lieu de l'étendre.
- **Pas de raccourci** pour les objets semblables : le plan n'en prévoit pas. Figma utilise Alt+Ctrl+A.
- **Rectangle de sélection inchangé**, comme le prévoit le plan : il ne prend pas les objets à l'intérieur des groupes, même avec Ctrl.
- **Réglage désactivable.** Les tests de M6 sont verts : aucun réglage n'a été ajouté.
- **Décisions de M4 toujours ouvertes :** sens du champ angle « Mixte », X et Y trait compris d'un chemin ou d'un groupe seul, largeur de la barre du haut.
- **Lots suivants :** le presse-papiers et la duplication (M7), puis l'outil Échelle et le rangement (M9).

## 6. Correctif hors plan : l'outil connecteur

Signalé en test : « can't access property "value", connector.attributes['se:connector'] is undefined » à chaque clic sur un objet. Le défaut existe déjà dans la version d'origine (branche `master`) ; aucun lot de la refonte n'y touchait.

- **Cause.** L'outil connecteur ne terminait jamais un tracé. Le point de départ du geste était rangé dans une variable locale qui masquait celle du module, si bien que le relâchement calculait avec des valeurs vides et échouait. La ligne entamée restait dans le dessin, avec un id `conn_…` mais sans attribut `se:connector`. Ensuite, chaque changement de sélection parcourait les éléments dont l'id commence par `conn_` et échouait sur elle. Un objet importé dont l'id commence par `conn_` (un fichier issu d'un autre outil, par exemple) donnait la même erreur.
- **Correction** (`src/editor/extensions/ext-connector/ext-connector.js`) :
  - un connecteur est un élément du dessin qui porte l'attribut `se:connector`, lu par son espace de noms ; un autre objet nommé `conn_…` est laissé tel quel et peut être groupé ;
  - le point de départ est enregistré à l'appui, et la ligne suit la souris pendant le tracé ;
  - un connecteur dont un objet a disparu est ignoré au lieu de faire échouer la sélection. Il reste dans le dessin et se raccroche si une annulation fait revenir l'objet. Le code d'origine prévoyait de le supprimer hors de l'historique, ce qui aurait rendu cette annulation incomplète ;
  - après une annulation, les connecteurs des objets modifiés sont recalculés, même quand ces objets ne sont pas sélectionnés ;
  - un fichier dont un connecteur désigne un objet absent s'ouvre sans erreur.
- **Tests.** `tests/e2e/connector.spec.js`, 6 tests : tracé par glisser et par deux clics, déplacement puis annulation, suppression d'un objet relié, objet nommé `conn_…`, fichier avec un connecteur orphelin. Les 6 échouent sur `master` et passent avec la correction. Chaque test vérifie aussi qu'aucune erreur n'atteint la console.
- **Sortie SVG** des opérations existantes identique (15/15 allers-retours, 62/62 scénarios contre le commit M6). Bilan : lint propre, 710 tests unitaires et 232 tests E2E verts.
- **Limite.** Échap n'interrompt pas un connecteur commencé par un clic : le clic suivant sur un objet le termine. Changer d'outil l'abandonne.
- **Erreur « Permission denied to access property "apply" »** (`moz-extension://…/inpage_sol.js`) : elle vient d'une extension de Firefox, pas de l'éditeur. Elle disparaît dans une fenêtre privée sans extensions.
