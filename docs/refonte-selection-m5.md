# Refonte de la sélection — lot M5 « Retours visuels »

Branche `refonte-selection-m5`, partie de `refonte-selection-m3`. Le canevas montre maintenant ce qu'un clic va prendre et ce qu'un geste est en train de faire. Le SVG écrit ne change pas.

## 1. Ce qui change pour l'utilisateur

### La surbrillance au survol

Avec l'outil de sélection, un contour bleu de 1 px entoure l'objet sous le curseur : c'est l'objet qu'un clic sélectionnera. Le contour est exactement le cadre que ce clic affichera, objets tournés compris.

- **Groupe fermé :** le contour entoure le groupe entier. Dans un groupe ouvert, il entoure l'objet survolé seul.
- **Pas de contour** sur un objet déjà sélectionné, sur le fond, pendant un geste, hors du canevas ou avec un autre outil.
- **Mise à jour :** le contour disparaît dès que le dessin, la sélection, le zoom ou l'outil change. Il revient au mouvement suivant de la souris.

### La cote vivante

Pendant un geste, une étiquette bleue s'affiche sous la sélection :

| Geste | Étiquette |
| --- | --- |
| Déplacement | X et Y du coin haut gauche de la sélection |
| Redimensionnement d'un objet seul | largeur × hauteur de l'objet, dans ses propres axes |
| Redimensionnement d'une multi-sélection | largeur × hauteur de l'ensemble |
| Rotation | angle de l'objet, ou celui du cadre commun, comme dans le champ angle |

Les longueurs sont mesurées sans le trait : pour un rectangle non tourné, ce sont son x, son y, sa largeur et sa hauteur, comme dans le panneau.

L'étiquette utilise l'unité du document, choisie dans les préférences de l'éditeur :
- les longueurs ont au plus deux décimales, suivies de l'unité sauf en pixels, par exemple « 26.46 × 21.17 mm » ;
- les angles ont une décimale, entre −180° et 180°.

L'étiquette disparaît au relâchement, ou avec Échap.

### Les curseurs orientés

Les flèches des poignées de redimensionnement suivent l'angle du cadre au degré près. Avant, elles tournaient par pas de 45°. Un navigateur qui ne sait pas afficher ces curseurs prend le curseur standard le plus proche, comme avant.

### La rotation aux coins

Juste à l'extérieur de chaque coin du cadre, sur 12 px au-delà de la poignée, le curseur devient une flèche de rotation tournée vers ce coin. Glisser depuis cette zone tourne la sélection comme la poignée ronde :
- un objet seul tourne autour de son centre ;
- une multi-sélection tourne autour du centre de son cadre, comme en M3 ;
- Maj tourne par pas de 15°, Échap annule, et le geste fait une seule étape d'annulation.

La rotation part de la position de la souris au moment du clic : l'objet ne saute pas vers le pointeur. La poignée ronde au-dessus du cadre est inchangée.

### Les petits objets

Quand un côté du cadre mesure moins de 24 px à l'écran :
- les poignées latérales de cette dimension disparaissent : celles du haut et du bas si le cadre est peu haut, celles de gauche et de droite s'il est peu large ;
- les poignées d'angle se décalent vers l'extérieur et n'entrent plus que de 3 px au plus dans le cadre ;
- un glisser à l'intérieur du cadre déplace donc l'objet.

Un trait horizontal garde ainsi ses poignées d'extrémité. Zoomer fait revenir les poignées masquées. La règle vaut pour un objet seul comme pour le cadre commun.

### L'aperçu exact du cercle

Redimensionné sans garder ses proportions, un cercle seul reste un cercle au relâchement, mais s'affichait en ellipse pendant le geste. L'aperçu montre maintenant le cercle final : rien ne saute au relâchement, et la cote affiche sa vraie taille. Le SVG écrit ne change pas : au relâchement, l'échelle réelle du geste est remise en place avant l'écriture.

## 2. Ce qui ne change pas

### Sortie SVG

La comparaison avec M3 (`e0e0e13`) par les scripts de `tests/output/` donne :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 49 sur 49 identiques, sans aucune différence attendue.

Le scénario « grip resize c1 » couvre le cercle redimensionné par une poignée.

Le contour, l'étiquette et les zones de rotation appartiennent au groupe des sélecteurs, hors du dessin : ils n'entrent jamais dans le SVG enregistré.

### API des extensions

- **Gestionnaire de sélection : nouvelles méthodes.**
  - `showHover(elem)` et `hideHover()` pour la surbrillance ;
  - `showSize(w, h)`, `showPosition(x, y)`, `showAngle(a)`, `showDimension(texte)` et `hideDimension()` pour la cote ;
  - `applyGripCursors(angle)` pour les curseurs.
- **Nouveaux éléments du groupe des sélecteurs :** `selectorHover`, `selectorDimension` et `selectorGripZone_rotate_nw`, `_ne`, `_se`, `_sw`.
- **Poignées.** Les carrés visibles `selectorGrip_resize_*` ne prennent plus la souris. Leur zone de prise `selectorGripHit_resize_*`, déjà posée par-dessus, la prend seule. Un script qui envoie ses événements directement à un carré visible fonctionne comme avant.
- **Style des poignées.** Il vaut maintenant `cursor: url(data:…) 12 12, ne-resize`, par exemple : le nom standard reste en repli.
- **Nouveau module `core/feedback.js`.** Il porte les formats de la cote, les curseurs et la disposition des poignées des petits cadres.
- **`drawingBoxOf(elements, boxes)`, nouveau, dans `core/multi-transform.js`.** Boîte d'objets dans le repère du dessin, sans le trait.
- **Événements inchangés.** `svgCanvas.call()` masque en plus la surbrillance sur `changed`, `selected`, `zoomed`, `contextset`, `sourcechanged` et `afterClear`. Les extensions reçoivent toujours `mouseMove` pendant un geste seulement.

### Performances

`npm run bench` mesure une nouvelle interaction, la surbrillance au survol. La mesure prend la moyenne de 20 mouvements sans bouton d'un objet à un autre, mise en page du contour comprise, sans attendre l'image suivante.

| Interaction | 200 objets | 2 000 objets | Budget |
| --- | --- | --- | --- |
| Surbrillance au survol, un mouvement | 0,3 ms | 0,4 ms | 4 ms |
| Glisser tout, un mouvement, cote comprise | 11 ms | 85 ms | 100 ms à 2 000 |
| Redimensionner tout, un mouvement | 12 ms | 59 ms | 100 ms à 2 000 |
| Pivoter tout, un mouvement | 16 ms | 76 ms | 100 ms à 2 000 |

Les autres mesures restent dans le bruit de celles de M3. Une comparaison directe avec M3 de la rotation collective à 200 objets donne les mêmes valeurs, entre 12 et 17 ms selon les passes.

Pendant une rotation collective, les curseurs du cadre ne sont pas redessinés à chaque mouvement : le bouton est enfoncé, et le cadre revient sur les axes au relâchement.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m5
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dessinez deux rectangles et survolez-les : un contour bleu fin les entoure tour à tour. Cliquez : le cadre apparaît exactement à la place du contour.
2. Déplacez un rectangle : l'étiquette X et Y le suit, puis disparaît au relâchement. Redimensionnez-le : elle affiche sa largeur et sa hauteur. Tournez-le : elle affiche l'angle.
3. Tournez un rectangle de 30° et survolez ses poignées : les flèches suivent l'angle. Approchez la souris juste à l'extérieur d'un coin : le curseur de rotation apparaît. Glissez : le rectangle tourne sans sauter.
4. Dessinez un carré de 10 px : seules les poignées d'angle restent. Glissez depuis son centre : il se déplace.
5. Dans les préférences de l'éditeur, choisissez l'unité mm, puis déplacez un objet : l'étiquette passe en millimètres.
6. Dessinez un cercle et tirez sa poignée droite : il grandit en restant un cercle, sans saut au relâchement.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. Pour M5, la référence est M3 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m3 ..\ref-m3
npx vite preview --port 8010 --strictPort --outDir ..\ref-m3\dist\editor
```

Puis, avec la version courante servie sur le port 8000, sans différence attendue :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000
```

## 4. Tests ajoutés

- **`tests/unit/feedback.test.js` (13 tests).** Formats de la cote et unités, curseurs au degré près et leur repli, disposition des poignées des petits cadres et des zones de rotation.
- **`tests/unit/select-module.test.js` (5 tests de plus).** Poignées masquées puis rétablies, zones sous les zones de prise, curseurs des zones, contour de survol, étiquette.
- **`tests/e2e/selection-m5.spec.js` (20 tests).**
  - **Survol :** contour égal au cadre du clic, objet tourné, groupe fermé ou ouvert, cas sans contour, contour retiré après un changement ou un zoom.
  - **Cote :** déplacement, objet seul redimensionné ou tourné, multi-sélection, unité du document, Échap.
  - **Cercle :** aperçu identique au résultat.
  - **Curseurs et coins :** angle des flèches, position des zones, rotation sans saut d'un objet seul et d'une multi-sélection, Maj par 15°.
  - **Petits objets :** poignées masquées, glisser à l'intérieur, poignées d'angle décalées, trait fin, zoom, cadre commun.
- **`tests/perf/`.** La mesure du survol et son budget de 4 ms, à 200 et à 2 000 objets.

Bilan : lint propre, 675 tests unitaires et 193 tests E2E verts.

## 5. Limites connues et décisions à prendre

- **X et Y de la cote : à confirmer avec M4.** La cote donne le coin haut gauche de la boîte des objets, sans le trait, dans le repère du dessin. Pour un rectangle non tourné, ce sont ses x et y, comme dans le panneau. Le panneau affiche d'autres valeurs pour certains types :
  - le centre pour un cercle ou une ellipse, les extrémités pour une ligne ;
  - une boîte trait compris pour un chemin ou une polyligne.

  M4 fixera X, Y, L et H de l'ensemble ; la cote suivra le même repère.
- **Redimensionnement collectif d'objets tournés.** La cote donne la boîte de départ mise à l'échelle par le geste. Un objet tourné étant mis à l'échelle dans ses propres axes (M2), la boîte finale peut en différer légèrement.
- **Cercle tourné ou portant une matrice.** L'aperçu exact ne vaut que pour un cercle sans rotation ni matrice. Sinon l'aperçu reste une ellipse, comme avant.
- **Zones de rotation et objets voisins.** Les zones débordent de 20 px autour des coins de la sélection et peuvent couvrir un objet voisin. Pour le prendre, il faut cliquer sur une autre partie de cet objet, ou désélectionner d'abord.
- **Réglage désactivable.** Le plan prévoit un réglage pour désactiver un lot tant que ses tests ne sont pas verts. Les tests de M5 sont verts : aucun réglage n'a été ajouté.
- **Lots suivants :**
  - les champs X, Y, L, H et angle de l'ensemble, et la valeur « Mixte » (M4) ;
  - la sélection avancée (M6), le presse-papiers et la duplication (M7), l'outil Échelle et le rangement (M9).
