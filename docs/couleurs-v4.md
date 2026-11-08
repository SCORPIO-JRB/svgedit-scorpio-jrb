# Plan v2 — fenêtre couleur (se-color-field)

Branche `v4-couleurs`, partie de `v4-contexte`. Le plan v2 prévoyait un composant `se-color-field` (pastille, fenêtre couleur, dégradés, pipette, couleurs du document) en remplacement de jPicker et jGraduate, deux greffons jQuery portés. Ce lot le réalise pour la disposition « canevas », d'après quatre références reçues le 8 novembre : sélecteur avec pipette et couleurs de la page, fenêtre Remplissage avec type uni, dégradé ou image, éditeur de dégradé à arrêts, onglet Bibliothèques avec recherche.

La disposition classique (`?layout=classic`) garde jPicker et jGraduate : elle sert de référence au test utilisateur de V4 et partira avec eux.

## 1. Fenêtre

Elle s'ouvre par la pastille du champ Remplissage ou Contour, dans l'inspecteur ou la barre contextuelle. Depuis l'inspecteur, elle se place à gauche du panneau, à la hauteur du champ, et couvre le dessin plutôt que le champ ; depuis la barre, au-dessus d'elle, sinon en dessous. Échap la ferme et rend le focus à la pastille, qui la rouvre avec Entrée.

**Onglet Personnalisé**
- Type : uni ou dégradé (contrôle segmenté).
- Carré saturation-luminosité, teinte et opacité ; au clavier, les flèches avancent de 1, de 10 avec Maj, Début et Fin vont aux bouts.
- Valeur en Hex, RVB ou TSL (le format est retenu, préférence `color_format`) et opacité en %. Le champ hexadécimal lit aussi `#abc`, `rgb(…)`, `hsl(…)` et les noms CSS.
- Pipette : celle du navigateur (EyeDropper) quand il en a une ; sinon, un clic sur un objet du dessin prend sa couleur sans changer la sélection, Échap annule.
- Couleurs proposées : « Dans ce document » (attributs, styles en ligne et feuilles de style, les plus employées d'abord) ou « Récentes » (16, préférence `recent_colors`).

**Dégradé**
- Style linéaire ou radial ; angle d'un dégradé linéaire, à la manière de CSS (0° vers le haut, 90° vers la droite).
- Barre des arrêts : un clic ajoute un arrêt à la couleur du dégradé en ce point ; un arrêt se glisse, Suppr le retire (deux au moins) ; les flèches le déplacent.
- Liste des arrêts : position, couleur et opacité saisies ; la couleur choisie dans le carré va à l'arrêt sélectionné.
- Passer d'uni à dégradé part de la couleur courante, opaque à transparente. Les attributs que la fenêtre ne règle pas (unités, transformation, répétition, centre d'un radial) sont gardés ; en `userSpaceOnUse`, l'angle tourne la ligne autour de son centre sans changer sa longueur.

**Onglet Bibliothèques**
- Recherche par nom, groupe ou hexadécimal, sans tenir compte des accents ; vue en grille ou en liste (nom et hexadécimal).
- « Synoptiques Scorp-io » : les couleurs du synoptique de référence du corpus (`tests/fixtures/import/scorpio/synoptique-chaufferie.svg`), nommées par leur usage : fonds (fond, tuile et carte, trait, plan de travail), textes (titre, mesure, équipement, libellé, discret), états (en marche, défaut, à l'arrêt), fluides (chaud et froid, départ et retour).
- « Design system Scorp-io » : les échelles Nuit, Lavande, Crème, Violet, Bleu, Rouge et Neutre des jetons `--scorpio-color-*`.
- L'option `colorLibraries` remplace ces deux bibliothèques (jamais lue dans l'URL).

## 2. Champ de l'inspecteur

La pastille ouvre la fenêtre ; la couleur et l'opacité se saisissent aussi dans le champ (Entrée applique, Échap rend la valeur, une saisie invalide est rendue). Une multi-sélection aux peintures différentes affiche « Mixte » ; la couleur choisie s'applique à tous. À droite des titres Remplissage et Contour, − retire la peinture et + rend celle des options `initFill` ou `initStroke`.

## 3. Une étape d'annulation, un aperçu sans historique

- `setPaint` du canevas enregistre en une seule étape l'opacité, la couleur et le dégradé ajouté aux defs. Avant, l'opacité était écrite hors historique : annuler rendait la couleur et laissait l'opacité, et le dégradé restait dans les defs.
- `groupHistory(label, fn)` regroupe en une étape les commandes d'une fonction, imbrications comprises.
- `previewPaint(type, paint)` montre une peinture sur la sélection pendant un glisser, hors historique, avec un dégradé temporaire ; `cancelPaintPreview()` rend les valeurs d'avant et retire ce dégradé (et les defs qu'il avait créées). `setPaint` commence par là, si bien que l'étape enregistre la peinture d'avant l'aperçu.
- La fenêtre prévisualise à chaque mouvement (une fois par image) et applique au relâchement, à la touche relâchée, à la saisie validée ou au clic sur une pastille.

## 4. Fichiers

- `src/editor/color/color.js` : conversions RVB, TSV, TSL, lecture des couleurs CSS, formats, couleurs d'un document.
- `src/editor/color/gradient.js` : angle et ligne, arrêts, couleur entre deux arrêts, CSS d'aperçu, changement de style.
- `src/editor/panels/PaintPicker.js` : la fenêtre, le placement, les boutons − et +.
- `src/editor/color-libraries.js` : les bibliothèques par défaut.
- `src/editor/components/seColorPicker.js` : ouverture de la nouvelle fenêtre en disposition canevas, `previewPaint`, `commitPaint`, champ éditable.
- `packages/svgcanvas/core/elem-get-set.js`, `undo.js` : `setPaint` en une étape, `groupHistory`, `previewPaint`, `cancelPaintPreview`.
- Six icônes dessinées (plus, moins, uni, dégradé, liste, grille), listées dans `src/editor/images/ICONS.md` ; jetons `--se-checker-light`, `--se-checker-dark` et `--se-thumb-shadow`, identiques dans les deux thèmes comme les marqueurs.

## 5. Vérifications

Sous Chromium :
- lint vert (dont aucune couleur ni aucun libellé en dur) ; 901 tests unitaires réussis, dont 13 sur les calculs de couleur et de dégradé et 6 sur l'historique et l'aperçu d'une peinture ;
- E2E en disposition canevas : 446 réussis, dont les 19 de la fenêtre (`tests/e2e/couleurs-v4.spec.js`) : ouverture et Échap, aperçu puis une étape, clavier, formats, couleurs du document et récentes, dégradé, glisser d'un arrêt, bibliothèques, champ de l'inspecteur, − et +, multi-sélection, barre contextuelle, pipette, axe (AA) dans les deux thèmes, jGraduate gardé par la disposition classique ;
- E2E en disposition classique, sans les tests propres à V3 et V4 : 364 réussis ;
- sortie comparée à `v4-contexte` : 21 allers-retours sur 21 et 73 scénarios sur 73 identiques ;
- banc à 2 000 objets : inchangé ; « Tout sélectionner » dépasse toujours son budget (157 ms pour 150), comme depuis V2.

Firefox tourne en CI.

## 6. Hors de ce lot

- Le type « image » de la référence (motif d'image en remplissage) : SVG-Edit n'a pas de peinture par motif ; c'est un sujet de fidélité (V6) avant d'être un sujet d'interface.
- Le « + » de l'onglet Bibliothèques (ajouter une couleur à une bibliothèque) : il suppose un lieu où l'hôte enregistre ses bibliothèques.
- Le centre et le rayon d'un dégradé radial, et la ligne d'un dégradé linéaire, réglés sur le dessin.
- Le retrait de jPicker et jGraduate, avec la disposition classique.
