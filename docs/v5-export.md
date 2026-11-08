# Plan v2 — lot V5 « Export et grand volume »

Branche `v5-export`, partie de `v4-couleurs`. Le plan v2 donne à V5 quatre sujets : les cadres d'export, plusieurs par fichier depuis la décision D7 ; l'origine du viewBox à l'import ; la couche d'interaction agrégée (S1) ; l'historique groupé et libellé (S4). Ses critères de passage : le corpus identique sans toucher au cadre, glisser 5 000 objets sous 16 ms, Alt+glisser en une étape.

## 1. Cadres d'export (4.3, D7)

Un cadre par écran de supervision, un SVG exporté par cadre ; un document neuf reste sans cadre.

**Dans le fichier.** Un cadre est une donnée de l'éditeur qui doit survivre à l'enregistrement sans faire partie du dessin : un élément `<se:frame>` de l'espace de noms de l'éditeur, dans un `<metadata>` à la racine, qu'aucun moteur de rendu n'affiche.

```xml
<metadata>
  <se:frame name="Chaufferie" x="0" y="0" width="1920" height="1080"/>
</metadata>
```

Le premier cadre ouvre ce `<metadata>` en tête du document, le dernier supprimé le retire : un document sans cadre s'écrit comme avant, à l'octet près. L'import garde ces éléments (le filtre garde déjà les données d'une autre application dans `<metadata>`), l'enregistrement les réécrit tels quels.

**Sur le canevas.** L'outil Cadre d'export (Maj+F, après Texte dans la barre d'outils) trace un cadre au glisser ; un clic pose un cadre de 1 920 × 1 080 à partir de ce point. Le cadre est dessiné dans la couche d'interaction, jamais dans le dessin : un contour gris et son nom au-dessus. Le nom sélectionne le cadre et le déplace ; les huit poignées d'un cadre sélectionné le redimensionnent. Suppr le supprime, les flèches le déplacent (de 10 avec Maj), Échap le désélectionne. Un cadre et des objets ne sont jamais sélectionnés ensemble. L'accroche (V2) prend les bords et les milieux des cadres, comme ceux de la page.

**Dans l'inspecteur.** Sans sélection, la section « Cadres d'export » liste les cadres (nom et taille) et en ajoute un ; sans cadre, elle explique que l'export prend le contenu du dessin. Un cadre sélectionné a sa propre section : nom, format (1 920 × 1 080, 1 280 × 1 024, A4 portrait, A3 paysage ou personnalisé), X, Y, L et H, « Exporter en SVG » et « Supprimer le cadre ». Un double clic sur le nom d'un cadre va à son champ Nom.

**Historique.** Ajouter, déplacer, redimensionner, renommer ou supprimer un cadre est une étape d'annulation (« Ajouter un cadre », « Modifier le cadre », « Supprimer le cadre ») ; les flèches pressées à la suite en font une seule.

**Export.** Le menu Exporter ▾ propose une entrée par cadre (« “Chaufferie” en SVG ») et, à partir de deux, « Tous les cadres en SVG ». Le SVG d'un cadre est le document vu par le cadre :

- `viewBox`, `width` et `height` : ceux du cadre ;
- ni les cadres ni leur `<metadata>`, ni la déclaration `xmlns:se` quand plus rien ne l'emploie ;
- sans les objets entièrement hors du cadre : un écran exporté ne porte pas les liaisons des autres écrans. Un objet à cheval sur le bord est gardé, et le viewBox le coupe.

Sans cadre, l'entrée « Le contenu en SVG » exporte la boîte des objets visibles plus une marge de 20 unités. L'export d'image ou de PDF existant ne change pas.

Les fichiers sont enregistrés par le navigateur, un par cadre. Une application hôte peut les prendre elle-même : l'événement `se-export-svg`, annulable, part du conteneur de l'éditeur avec `detail.files`, une liste de `{ name, svg }`. Le canevas expose aussi `getFrames()`, `getFrameSvgString(element)` et `getContentSvgString(margin)`.

## 2. Origine du viewBox à l'import (section 7)

Un fichier dont le viewBox ne commence pas en 0, 0 (`viewBox="-20 -10 400 300"`) perdait son origine : l'enregistrement écrivait `viewBox="0 0 400 300"` et le dessin se décalait. L'origine est maintenant gardée et réécrite telle quelle. La page de l'éditeur commence à cette origine : son fond, l'accroche à la page, l'alignement et la répartition sur la page, le zoom sur la page. Les coordonnées des objets ne changent pas. « Ajuster au contenu », qui ramène le contenu en 0, 0, y ramène aussi la page.

## 3. Couche d'interaction agrégée (S1)

À 5 000 objets, un mouvement de glisser prenait 77 ms de calcul, dont 60 à recalculer le cadre de sélection de chaque objet. Deux changements :

- les cadres de la sélection, son cadre commun et ses poignées sont dans un groupe (`selectorSelectionGroup`) que le glisser déplace d'une seule translation ; ils sont redessinés une fois, au relâchement ;
- la translation temporaire de chaque objet est gardée au début du geste et réglée à chaque mouvement, au lieu d'être recréée et remplacée.

Un mouvement prend désormais 3 ms de calcul à 5 000 objets (budget : 16). Le navigateur met ensuite environ 30 ms à dessiner l'image : c'est le coût du rendu de 5 000 rectangles, hors du calcul de l'éditeur. Le banc mesure les deux (`--drag-sizes=5000`, mesures `dragMoveScript` et `dragMoveFrame`), et la CI applique le budget de 16 ms au premier.

## 4. Historique groupé et libellé (S4)

- **Libellés.** Annuler et Rétablir nomment leur étape dans le menu du zoom : « Annuler : déplacer 3 objets ». Chaque étape du canevas reçoit un nom traduit, tiré de son texte ou de ce qu'elle contient (objets créés, supprimés, attributs changés), et compte les objets touchés, un objet dans un autre n'étant pas compté deux fois. Un test unitaire vérifie que chaque libellé d'étape écrit dans le canevas a son nom.
- **Panneau Historique.** « Historique ▸ », dans le menu du zoom et dans la palette, liste les étapes, la dernière en tête, jusqu'à l'ouverture du document. Choisir une étape annule ou rétablit jusqu'à elle ; les étapes qui seraient rétablies sont estompées. Le menu se parcourt au clavier.
- **Sélection rendue.** Après une annulation ou un rétablissement, les objets de l'étape encore présents dans le dessin sont sélectionnés (disposition canevas).
- **Regroupement.** Les flèches pressées à la suite sur la même sélection (moins d'une seconde entre deux) sont une étape. Ce qui est tapé dans un texte, jusqu'à la fin de son édition, en est une ; pour un texte neuf, avec sa création.
- **Limite.** L'historique garde les 1 000 dernières étapes.
- **Alt+glisser** est une seule étape depuis M1 ; le test reste en place.

Corrigés au passage :

- la frappe dans un texte n'était pas annulable : `beginUndoableChange` lisait l'attribut `#text`, qui n'existe pas, au lieu du contenu ;
- dans un texte en cours d'édition, Ctrl+Z annulait la saisie du champ caché au lieu de l'historique, et Échap ne terminait pas l'édition ;
- dans la version compilée, `type()` des commandes rendait le nom raccourci de leur classe (« bv » au lieu de « InsertElementCommand ») : les réactions de l'historique à l'annulation (calques, symboles, références) ne se déclenchaient jamais. Chaque classe porte maintenant son nom en toutes lettres ;
- depuis V3, les menus de la disposition canevas n'affichaient pas la coche de leurs entrées cochées (« Barre contextuelle » et les options de vue dans le menu du zoom, le choix courant d'une liste de la barre contextuelle). La règle qui laisse la place de la coche était plus spécifique que celle qui la dessine ; seul le niveau de zoom courant était coché. L'étape courante de l'Historique en dépendait aussi.

## 5. Fichiers

- `packages/svgcanvas/core/frames.js` : les cadres dans le document, leur historique, l'export d'un cadre ou du contenu, l'accroche.
- `src/editor/frames.js` : la couche des cadres sur le canevas, l'outil, les gestes, le clavier, les sections de l'inspecteur, les entrées du menu Exporter.
- `src/editor/history-steps.js` : le nom des étapes ; `src/editor/panels/HistoryMenu.js` : le panneau Historique.
- `packages/svgcanvas/core/history.js` : regroupement (`merging`, `endMerge`, `prependToLast`), limite, `getSteps`, type des commandes.
- `packages/svgcanvas/core/select.js`, `event.js` : la couche d'interaction agrégée, l'outil cadre.
- `packages/svgcanvas/core/svg-exec.js`, `selected-elem.js`, `elem-get-set.js` : l'origine du viewBox.
- Une icône dessinée (`frame.svg`, listée dans `src/editor/images/ICONS.md`) ; jetons `--se-frame` et `--se-frame-label` dans les deux thèmes.

## 6. Vérifications

- **Lint** (`standard`, couleurs, libellés) : sans erreur.
- **Tests unitaires** : 921 sur 921, dont 11 pour l'historique (`history-v5.test.js`) et 9 pour les cadres et l'origine (`frames-v5.test.js`).
- **E2E Chromium** : 465 sur 465 en disposition canevas, dont 9 pour l'historique (`historique-v5.spec.js`) et 11 pour les cadres (`cadres-v5.spec.js`, axe compris dans les deux thèmes) ; 364 sur 364 en disposition classique.
- **Corpus, comparé à `v4-couleurs`** : 73 scénarios sur 73 identiques ; 20 allers-retours sur 21 identiques. Le seul écart est voulu : `section-7.svg` garde maintenant `viewBox="-20 -10 400 300"`. Aucun fichier ne change tant qu'on ne pose pas de cadre.
- **Banc** : glisser 5 000 objets, 2,6 ms de calcul par mouvement en local et 6,3 ms sur la CI (budget : 16). Le banc de la CI, informatif, ne dépasse plus qu'un budget, déjà dépassé avant ce lot : `selectAll` à 2 000 objets (177 ms pour 150). Sur `v4-couleurs`, il en dépassait trois (`selectAll` 220 ms, `undo` 55 ms, `marquee` 112 ms).
- **Alt+glisser** : une étape, test E2E en place depuis M1.

## 7. Hors de ce lot

- La saisie au clavier dans les champs de l'inspecteur n'est pas regroupée : chaque valeur validée reste une étape, ce qui est attendu.
- Le panneau Historique ne montre pas de vignette des étapes.
- Les cadres ne découpent pas l'export d'image ou de PDF, qui garde la page.
- La disposition classique n'a ni outil cadre ni panneau Historique ; l'API du canevas y fonctionne.
