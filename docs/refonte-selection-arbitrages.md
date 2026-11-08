# Refonte de la sélection — arbitrages du 8 novembre

Branche `refonte-selection-arbitrages`, partie de `refonte-selection-m9`. Elle applique les réponses aux questions laissées ouvertes par les lots M2 à M9 et par U1.

| N° | Question | Réponse | Ce qui change |
| --- | --- | --- | --- |
| 1 | Découpe (`clip-path`) d'un objet redimensionné | la découpe suit l'objet | la découpe et le masque suivent tout changement de géométrie |
| 2 | Champ angle « Mixte » | garder | rien |
| 3 | X et Y d'un chemin, d'une polyligne ou d'un groupe seul | sans le trait | les champs décrivent la boîte sans le trait |
| 4 | Barre du haut sur deux lignes | alignement compact | un seul bouton « Aligner et distribuer » ouvre un menu |
| 5 | Portée des objets semblables | toute la page, comme Figma | recherche dans les groupes et dans tous les calques visibles |
| 6 | Groupe tourné ouvert par Ctrl+clic | garder | rien |
| 7 | Format SVG natif du presse-papiers | pas utile pour le moment | rien |
| 8 | Marqueurs et flou exclus de « Copier les propriétés » | garder | rien |
| 9 | Raccourcis N et S | Ctrl+S enregistre, N reste seul | Enregistrer passe de S à Ctrl+S |

## 1. Ce qui change pour l'utilisateur

### La découpe suit l'objet (1)

Un objet découpé par un `clip-path`, ou masqué par un `mask`, garde sa découpe en place sur lui. Avant, seule la rotation l'emportait. Désormais, ces gestes l'emportent aussi :
- un déplacement (souris, flèches, champs X et Y) ;
- un redimensionnement, seul ou collectif, par les poignées, l'outil Échelle ou les champs L et H ;
- une symétrie.

Exemple, un rectangle découpé par un cercle puis déplacé de 20 et 10 :
- **avant :** le rectangle bouge, le cercle de découpe reste où il était et le rectangle sort de sa découpe ;
- **après :** `<clipPath id="cp" transform="translate(20 10)">`, la découpe suit.

Comment c'est écrit :
- **Découpe.** Elle reçoit, sous forme de `transform`, exactement le changement que l'objet a reçu. Sa forme n'est pas réécrite.
- **Masque.** Un `mask` n'a pas de `transform` propre : son contenu le reçoit, et sa zone, si elle est donnée en unités du dessin, devient la boîte qu'elle couvre.
- **Découpe partagée.** Une découpe partagée avec un autre objet est d'abord copiée, avec de nouveaux identifiants, pour que l'autre objet garde la sienne.
- **Texte.** La règle vaut aussi pour un texte, que M2 redimensionne par sa taille de police.
- **Annulation.** Une seule étape d'annulation, qui remet la découpe comme avant.

Restent inchangés, car ils suivaient déjà :
- un groupe ou un `use`, qui gardent leur matrice ;
- une découpe en `clipPathUnits="objectBoundingBox"`.

### X et Y sans le trait (3)

Pour un chemin, une polyligne ou un groupe seul, les champs X et Y décrivent maintenant la boîte sans le trait. C'est déjà le cas en multi-sélection et pour la cote. Exemple, un chemin au trait de 4 :
- **avant :** X valait 298 seul et 300 dans une multi-sélection ;
- **après :** il vaut 300 dans les deux cas.

Taper une valeur place la boîte sans trait à cette valeur. Les autres types gardent leurs champs : x et y d'un rectangle ou d'un texte, centre d'un cercle, extrémités d'une ligne.

### Le menu « Aligner et distribuer » (4)

En multi-sélection, les huit boutons d'alignement et de distribution, le champ « écart » et le choix « par rapport à » prenaient 530 px. Un seul bouton les remplace. Il ouvre un menu sur trois lignes :
1. les six alignements ;
2. les deux distributions et le champ « écart » ;
3. la référence : objets sélectionnés, plus grand, plus petit, page.

La barre du haut tient maintenant sur une ligne dès 1 366 px de large ; avant, elle passait sur deux lignes à 1 366 comme à 1 440 px.

Fonctionnement du menu :
- **Il reste ouvert** pour enchaîner deux alignements (gauche puis haut, par exemple).
- **Il se ferme** par Échap, par un clic à l'extérieur, ou quand la sélection n'est plus multiple.
- **Au clavier.** Entrée ou Espace sur le bouton ouvre le menu et place le focus sur le premier alignement. Tab passe d'un bouton à l'autre, Entrée ou Espace l'actionne, et Échap ferme le menu en rendant le focus au bouton.

### Les objets semblables dans toute la page (5)

« Sélectionner le même symbole », « … le même remplissage » et « … le même trait » cherchent maintenant dans toute la page :
- **Où :** dans les groupes, les liens et tous les calques visibles. Les pompes rangées chacune dans un groupe avec leur étiquette sont prises ensemble.
- **Ce qui est écarté :** les objets masqués (`display="none"`) et les calques cachés.
- **Groupe ouvert :** il se referme, puisque les objets peuvent être dans plusieurs groupes.

Une telle sélection mêle des objets de groupes différents, parfois tournés ou mis à l'échelle. Les commandes en tiennent compte, sinon un objet sous un groupe agrandi ×2 aurait bougé deux fois plus loin que les autres :

| Commande | Comportement |
| --- | --- |
| Glisser | part de n'importe quel objet sélectionné, même rangé dans un groupe ; tous les objets bougent de la même distance à l'écran |
| Flèches, champs X et Y, `moveSelectedElements` | même distance à l'écran pour tous |
| Aligner, distribuer, symétrie | calculés sur le dessin, chaque objet dans le repère de son groupe |
| Grouper | chaque objet garde sa place et son apparence : il reçoit la transformation, le remplissage, le trait, la police et l'opacité des groupes qu'il quitte |
| Dupliquer (Ctrl+D, Alt+glisser) | la copie reste dans le groupe ou le calque de l'original |
| Redimensionner, pivoter, outil Échelle | déjà justes depuis M2 et M3 |
| Supprimer, couleurs, propriétés | inchangés |

**Correction au passage (question 11).** Dans un groupe mis à l'échelle et ouvert, un objet déplacé ne bouge plus de la distance multipliée par l'échelle. C'est le même calcul.

### Ctrl+S enregistre (9)

L'entrée Enregistrer du menu prend Ctrl+S, Cmd+S sur Mac. L'éditeur l'intercepte avant le navigateur, qui n'ouvre plus sa boîte « Enregistrer la page ». La touche S seule ne fait plus rien. N (nouveau) reste sans modificateur, car le navigateur réserve Ctrl+N.

## 2. Ce qui ne change pas

### Sortie SVG

Comparaison avec M9 (`4c9a323`) :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 68 sur 70 identiques. Les deux différences sont voulues ; ce sont les deux scénarios ajoutés : une découpe qui suit un déplacement, et un même remplissage cherché dans toute la page puis déplacé.

D'autres sorties changent aussi, par décision, sans scénario dans le script :
- le déplacement d'un chemin, d'une polyligne ou d'un groupe seul à trait épais par les champs X et Y (décision 3) ;
- le déplacement dans un groupe ouvert mis à l'échelle (question 11) ;
- tout geste sur un objet découpé ou masqué (décision 1).

Pour une sélection ordinaire, dans un seul groupe non transformé, déplacer, aligner, distribuer, retourner, grouper et dupliquer donnent le même SVG qu'avant, à l'octet près.

### API des extensions

**Canevas :**
- `selectSimilar(criterion)` cherche dans toute la page et referme le groupe ouvert.
- `recalculateDimensions(elem)` met aussi à jour la découpe et le masque de l'objet ; la commande renvoyée inclut ces changements.
- `moveSelectedElements` prend les distances sur le dessin, pour chaque objet dans le repère de son groupe. C'est inchangé pour un objet dont aucun groupe ne tourne ni ne met à l'échelle.
- `cloneSelectedElements` place la copie d'un objet d'un autre groupe ou calque dans ce groupe ou ce calque.
- `groupSelectedElements` garde la place et l'apparence d'objets venus de plusieurs groupes.
- `alignSelectedElements` et `flipSelectedElements` travaillent sur le dessin quand les objets ont des groupes différents.
- `changeSelectedAttribute('x' | 'y')` sur un chemin ou un groupe ne change pas : il garde la boîte avec le trait. Seuls les champs du panneau ont changé.

**Modules du canevas :**
- `core/multi-transform.js` exporte `parentToDrawing`, `parentDelta`, `parentBoxToDrawing` et `drawingMatrixInParent` ;
- `core/recalculate.js` exporte `readCutReferences` et `followCutReferences` ;
- `core/inherited.js`, nouveau : `INHERITED_PROPERTIES`, `ownPresentationValue` et `inheritedFromAncestors`, partagés par le dégroupage et le groupement ;
- `getMouseTarget` renvoie l'objet sélectionné sous le pointeur même s'il est rangé dans un groupe.

**Éditeur :**
- nouveau bouton `tool_align_menu` et son menu `tool_align_popup`, qui contient les anciens boutons sous les mêmes identifiants, le champ `tool_align_spacing` et le choix `tool_align_relative` ;
- `topPanel.setAlignMenu(open)` et `topPanel.initAlignMenu()` ;
- traduction `tools.align_menu`, en français dans `lang.fr.js` et en anglais ailleurs ;
- `tool_save` (extension `ext-opensave`) a pour raccourci `ctrl+S`.

### Performances

`npm run bench`, 2 000 objets, trois passages : toutes les mesures restent proches de celles de M9. Chaque passage a eu au plus un dépassement de moins de 2 ms (redimensionnement collectif à 101,5 ms, « tout sélectionner » à 150,7 ms), jamais sur la même mesure, et le troisième passage respecte tous les budgets. Le glisser lit une fois par geste la matrice des groupes, seulement pour les objets qui ne sont pas directement dans le calque.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-arbitrages
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. **Découpe.** Dans la source (Ctrl+U), ajoutez `<clipPath id="cp"><circle cx="140" cy="130" r="30"/></clipPath>` dans `<defs>` et `clip-path="url(#cp)"` sur un rectangle placé en 100, 100. Déplacez le rectangle, agrandissez-le, retournez-le : le cercle visible reste au même endroit du rectangle.
2. **X et Y.** Sélectionnez un chemin au trait épais : X et Y donnent le bord du tracé, sans le trait.
3. **Menu Aligner.** Sélectionnez deux objets : un seul bouton d'alignement dans la barre, qui tient sur une ligne. Ouvrez-le, alignez à gauche puis en haut, puis Échap.
4. **Objets semblables.** Groupez une pompe (`use`) avec une étiquette, agrandissez le groupe, puis clic droit sur une autre pompe et « Sélectionner le même symbole » : les deux pompes sont prises. Glissez l'une d'elles : les deux bougent ensemble. Alignez-les à gauche, puis groupez-les : rien ne saute.
5. **Ctrl+S.** Ctrl+S enregistre le dessin ; la touche S seule ne fait rien.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. La référence est M9 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m9 ..\ref-m9
npx vite preview --port 8010 --strictPort --outDir ..\ref-m9\dist\editor
```

Puis, avec la version courante servie sur le port 8000 :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000 --expect="clip path follows a move,same fill in the page then move"
```

Les noms de `--expect` sont séparés par des virgules : un nom de scénario ne doit pas en contenir.

## 4. Tests ajoutés et mis à jour

**`tests/e2e/arbitrages.spec.js` (12 tests, sans erreur dans la page) :**
- **découpe :** déplacement, redimensionnement et symétrie en une étape d'annulation ; poignée seule ou avec un autre objet ; découpe partagée copiée, sans identifiant en double ;
- **X et Y :** groupe seul au trait épais, affichage et saisie ;
- **menu :** barre sur une ligne à 1 366 px, ouverture, deux alignements de suite, Échap, clic à l'extérieur ; clavier (Entrée, Tab, Échap qui rend le focus) ; référence « page » ;
- **objets semblables :**
  - quatre pompes : seule, dans un groupe agrandi, dans un groupe tourné, dans un autre calque ; une pompe cachée écartée ;
  - cadres de sélection justes ;
  - flèches et glisser depuis la pompe du groupe agrandi ;
  - alignement, symétrie, groupement sans saut, avec l'apparence gardée et l'annulation à l'identique ;
  - copies dans le groupe de l'original ;
- **Ctrl+S :** Ctrl+S actionne Enregistrer, S seul non.

**Tests mis à jour :**
- `selection-m4.spec.js` : X d'un chemin au trait de 4, maintenant 300, et sa saisie ;
- `selection-m6.test.js` et `selection-m6.spec.js` : la recherche couvre la page et referme le groupe ouvert ;
- `scale-m9.spec.js` : la distribution s'ouvre par le menu.

**`tests/output/`** : deux scénarios, différences attendues contre M9.

Bilan :
- lint propre ;
- 748 tests unitaires verts ;
- 272 tests E2E verts (260 + 12) ;
- sortie identique à M9, sauf les différences voulues.

## 5. Limites connues et questions restantes

- **Copier-coller d'objets pris dans des groupes transformés.** Le collage ne reprend pas la transformation ni l'apparence de leur groupe, comme avant. Le collage dans un groupe ouvert prend déjà le repère de ce groupe ; il faudrait traiter les deux ensemble.
- **Grouper des objets de plusieurs calques.** Le groupe est créé dans le calque courant ; les objets y passent.
- **Filtre, découpe ou masque d'un groupe quitté.** Ils ne sont pas reportés sur les objets qui le quittent par un groupement ; la transformation et l'apparence le sont.
- **Rectangle de sélection et Maj+Ctrl+clic.** Ils restent limités au groupe ouvert ou au calque, comme en M6.
- **Questions encore ouvertes :**
  - la conversion en chemin qui écrit `fill-opacity="null"` (question 10) ;
  - le corpus de synoptiques réels et la vérification sous Firefox (questions 12 et 13) ;
  - la fusion des branches vers `master` (question 14).
