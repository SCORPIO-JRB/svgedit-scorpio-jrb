# Refonte de la sélection — lot M3 « Rotation collective »

Branche `refonte-selection-m3`, partie de `refonte-selection-m2`. Une multi-sélection tourne maintenant comme un seul objet, autour du centre de son cadre commun, sans groupe ajouté au SVG.

Pour un objet seul, rien ne change : poignée, champ angle, raccourcis et sortie SVG restent ceux d'avant.

## 1. Ce qui change pour l'utilisateur

### La poignée de rotation du cadre commun

Le cadre commun d'une multi-sélection porte maintenant la poignée de rotation, au-dessus du milieu de son côté haut, comme le cadre d'un objet seul.

| Geste | Effet |
| --- | --- |
| Glisser la poignée | l'ensemble tourne autour du centre du cadre |
| Maj | pas de 15° |
| Échap avant de relâcher | tout revient comme avant, sans étape d'historique |

Pendant le geste, le cadre et ses poignées tournent avec la sélection, et chaque objet garde son contour orienté. Ce qui s'affiche est le résultat : rien ne saute au relâchement. Le cadre se recale ensuite sur les axes, autour des objets tournés.

L'angle part de la position de la souris au moment du clic : prendre la poignée un peu à côté de son centre ne fait pas sauter la sélection. Le magnétisme de la grille arrondit l'angle comme pour un objet seul.

Le geste entier forme une seule étape d'annulation. Annuler puis rétablir redonne le même SVG à l'octet près.

### Le champ angle et les raccourcis

Le champ angle reste affiché en multi-sélection. Il montre l'angle du cadre :

| Sélection | Valeur affichée | Valeur saisie |
| --- | --- | --- |
| Objets au même angle, par exemple 0° | cet angle | l'ensemble tourne jusqu'à cet angle : tous les objets le prennent |
| Objets à des angles différents | vide au départ, puis la somme des rotations appliquées depuis la sélection | l'ensemble tourne de la différence avec la valeur affichée |

Ressaisir la même valeur ne change donc rien, comme pour un objet seul. La somme ne vaut que tant que la sélection et les angles de ses objets sont ceux qu'elle a produits : après une annulation, par exemple, le champ redevient vide.

Exemple : une pompe à 0° et une vanne à 90°. Le champ est vide. Saisir 30 tourne l'ensemble de 30° : la pompe passe à 30°, la vanne à 120°, et le champ affiche 30. Saisir ensuite 45 tourne encore de 15°.

Les raccourcis de rotation agissent aussi sur l'ensemble :
- Ctrl+← et Ctrl+→ tournent de 1° ;
- avec Maj en plus, de 15°.

Chaque appui fait une étape d'annulation, comme pour un objet seul.

## 2. Règle appliquée à chaque objet

Chaque objet est tourné du même angle que l'ensemble autour de son propre centre, puis déplacé du trajet de ce centre. Ces deux étapes passent par le code qui tourne un objet seul (`setRotationAngle`) et par celui qui le déplace (`moveSelectedElements`). Le SVG obtenu est donc celui de ces deux commandes, quel que soit le type :

| Élément | Résultat |
| --- | --- |
| Rectangle, ellipse, cercle, image, foreignObject, ligne, polyligne, polygone, chemin | géométrie déplacée (x et y, centre, extrémités, points ou tracé), `rotate(angle cx cy)` autour du nouveau centre |
| Objet déjà tourné | même chose : son angle augmente de celui de l'ensemble |
| Texte, groupe, `use` | `rotate(angle cx cy)`, suivi du déplacement en matrice, comme pour le déplacement d'un objet seul de ce type ; une matrice déjà portée (échelle d'un `use`, miroir d'un texte) est gardée |

Un test compare, pour quatorze types d'objet et trois angles, le SVG d'une rotation collective et celui de ces deux commandes sur l'objet seul : ils sont identiques à l'octet près.

L'ordre compte au dernier chiffre près : déplacer puis tourner donnerait des coordonnées différentes vers la sixième décimale. L'ordre retenu, tourner puis déplacer, permet aussi le gain de performances décrit en section 3.

Les attributs `data-*`, `se:` et `class` restent intacts. Les traits ne changent pas d'épaisseur.

### Objets d'un groupe ouvert

Dans un groupe ouvert lui-même tourné, chaque objet tourne autour du centre du cadre tel qu'on le voit à l'écran, et garde un simple `rotate()` dans le repère du groupe.

Seul cas sans règle de type : un groupe ouvert qui déforme les angles, par une échelle non uniforme ou un cisaillement. Une rotation à l'écran n'y est pas une rotation dans le repère du groupe. Le résultat est exact à l'écran, mais l'objet garde une matrice.

### Correction annexe

En multi-sélection, l'événement `changed` faisait du dernier objet modifié l'objet sélectionné de l'éditeur : après un geste collectif, le panneau repassait en mode « objet seul » pour cet objet. Le panneau de la multi-sélection reste maintenant affiché. Sans cette correction, le champ angle aurait repris l'angle de cet objet et l'aurait réappliqué en boucle.

## 3. Ce qui ne change pas

### Sortie SVG

La comparaison avec M2 (`8366122`) par les scripts de `tests/output/` donne :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 47 sur 49 identiques. Les deux différences sont voulues : la rotation d'une multi-sélection par la poignée, et par `setRotationAngle`, qui ne tournait que le premier objet.

Le script compare maintenant aussi la rotation à la souris, par sa poignée, de chacun des huit types d'objet seul : la sortie est identique à M2. La factorisation de `setRotationAngle`, dont la rotation collective réutilise le cœur, ne change donc rien pour un objet seul.

### API des extensions

- **`svgCanvas.rotateSelectedElements(angle, { cx, cy, addToHistory })`, nouveau.** Tourne la sélection autour d'un point, par défaut le centre de son cadre, en une étape d'annulation.
- **`svgCanvas.setSelectionAngle(angle)` et `svgCanvas.getSelectionAngle()`, nouveaux.** Écrivent et lisent l'angle du cadre, celui du champ.
- **`svgCanvas.getCommonRotationAngle(elements)`, nouveau.** Renvoie l'angle commun à des objets, ou `null` s'ils diffèrent.
- **`svgCanvas.setRotationAngle(val)` en multi-sélection : comportement modifié.** Il tournait le seul premier objet ; il tourne maintenant l'ensemble, comme le champ. Pour un objet seul, rien ne change.
- **Gestionnaire de sélection.** `setFrameRotation(angle, pivot)` fait tourner le cadre commun pendant le geste. La poignée garde son identifiant `selectorGrip_rotate`.
- **`utilities.withBBoxCache(cache, fn)`, nouveau.** Pendant `fn`, `getBBox` renvoie une copie des boîtes du cache au lieu de les lire.
- **Événements inchangés.** `transition` part pendant le geste, et `changed` une seule fois au relâchement.

### Performances

`npm run bench` mesure deux nouvelles interactions, avec des budgets à 2 000 objets :

| Interaction | 200 objets | 2 000 objets | Budget à 2 000 |
| --- | --- | --- | --- |
| Pivoter tout, un mouvement | 16 ms | 72 ms | 100 ms |
| Relâchement de la rotation collective | 23 ms | 172 ms | 300 ms |

À 200 objets, le geste répond dans l'image suivante : la mesure inclut l'attente de cette image. Les autres mesures restent dans le bruit de celles de M2.

Une première version mettait 494 ms au relâchement, à 2 000 objets. Chaque objet lisait sa boîte juste après l'écriture de l'objet précédent, ce qui obligeait le navigateur à recalculer la mise en page de tout le dessin, une fois par objet. Deux changements ont supprimé ces recalculs, sans changer le SVG écrit :
- **Boîtes lues d'avance.** Toutes les boîtes sont lues avant la première écriture, puis servies par un cache tant que la géométrie de l'objet n'a pas changé (`withBBoxCache`, dans `utilities.js`).
- **Travail par passes.** Tous les objets sont tournés, puis les boîtes que cette étape a changées sont relues en une fois, puis tous les objets sont déplacés.

Une seconde rotation des mêmes objets passe de 586 ms à 229 ms.

## 4. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m3
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dessinez deux rectangles côte à côte et sélectionnez-les. Tirez la poignée ronde au-dessus du cadre : l'ensemble tourne autour du centre du cadre, le cadre avec. Relâchez, puis Ctrl+Z annule en une fois.
2. Même geste avec Maj : l'angle avance par pas de 15°.
3. Tirez la poignée et appuyez sur Échap avant de relâcher : rien n'a changé.
4. Tapez 90 dans le champ angle : les deux rectangles prennent 90°. Tapez 0 : ils reviennent à leur place.
5. Tournez un des rectangles seul, puis resélectionnez les deux. Le champ est vide ; Ctrl+→ tourne l'ensemble de 1° et le champ affiche 1.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. Pour M3, la référence est M2 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m2 ..\ref-m2
npx vite preview --port 8010 --strictPort --outDir ..\ref-m2\dist\editor
```

Puis, avec la version courante servie sur le port 8000 :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000 --expect="setRotationAngle (multi),handle rotate (multi)"
```

## 5. Tests ajoutés

- **`tests/unit/multi-transform.test.js` (2 tests de plus).** Rotation autour d'un point, centres après une échelle ×2 puis une rotation de 30°.
- **`tests/e2e/selection-m3.spec.js` (14 tests).**
  - **Poignée :** position au-dessus du cadre, rotation autour du centre, une étape d'annulation, cadre recalé sur les axes ensuite.
  - **Geste :** cadre et poignées qui tournent pendant le geste, aperçu identique au résultat, Maj par 15°, Échap, objet seul inchangé.
  - **Règle :** même SVG qu'une rotation puis un déplacement de l'objet seul, pour quatorze types et trois angles ; centres exacts après une échelle puis une rotation ; groupe ouvert tourné ; groupe ouvert à échelle non uniforme.
  - **Champ et raccourcis :** angle commun, valeur ressaisie sans effet, angles différents, somme des rotations, Ctrl+flèches, `setRotationAngle` en multi-sélection.
- **`tests/e2e/selection-m2.spec.js`.** Le test du cadre commun attend maintenant la poignée de rotation.
- **`tests/output/compare-output.mjs`.** Rotation à la souris de chaque type d'objet seul, rotation d'une multi-sélection par la poignée et par `setRotationAngle`.
- **`tests/perf/`.** Les deux mesures de rotation collective et leurs budgets.

Bilan : lint propre, 663 tests unitaires et 173 tests E2E verts.

## 6. Limites connues et décisions à prendre

- **Champ angle d'une sélection aux angles différents : décision à confirmer.** Il affiche la somme des rotations appliquées depuis la sélection, vide au départ. Une autre lecture possible serait de donner à chaque objet l'angle saisi, chacun autour de son propre centre. M4 prévoit d'afficher « Mixte » dans ce cas.
- **Saisie au clavier dans le champ angle.** Le champ applique la valeur à chaque touche, pour un objet seul comme pour un ensemble : taper 90 tourne à 9° puis à 90°, et laisse deux étapes d'annulation. Ce comportement est antérieur à M3.
- **Pivot fixe.** L'ensemble tourne toujours autour du centre de son cadre. Le pivot déplaçable n'est pas prévu.
- **Parent qui déforme les angles.** Voir la section 2 : l'objet garde une matrice.
- **Lots suivants :**
  - la cote vivante, les curseurs orientés et la rotation saisie aux coins du cadre (M5) ;
  - les champs X, Y, L et H de l'ensemble, et la valeur « Mixte » (M4).
