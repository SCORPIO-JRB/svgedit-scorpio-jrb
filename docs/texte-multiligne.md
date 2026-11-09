# Textes de plusieurs lignes

Branche `texte-multiligne`, partie de `v7-gtb`. Ticket : « Gestion des textes multilignes dans SVG-Edit ».

Avant ce changement, un texte ne tenait que sur une ligne. Désormais, `Entrée` fait une ligne, une poignée latérale donne au bloc une largeur fixe où les lignes se coupent d'elles-mêmes, et la police, la taille, l'interligne et l'alignement s'appliquent au bloc entier. Le tout est écrit en SVG natif : `<text>` et `<tspan>`, sans `foreignObject` ni moteur de texte.

## 1. Ce qui existait, et ce qui est repris

SVG-Edit édite un texte à travers un champ caché, `#text`, qui reçoit les touches : le canevas ne fait que dessiner le curseur et la sélection, d'après les positions des caractères que donne le navigateur (`text-actions.js`). Chaque frappe passe par `setTextContent`, puis par `changeSelectedAttribute('#text')`. Le lot V5 a regroupé en une seule étape d'annulation ce qui est tapé jusqu'à la fin de l'édition.

Ce mécanisme reste. Deux choses changent :

- **Le champ caché devient une `<textarea>`.** `Entrée`, la fusion de deux lignes par `Retour arrière`, la sélection au clavier, le copier-coller avec ses sauts de ligne, `Début` et `Fin` sont ceux de la `<textarea>`, sans code à écrire. `wrap="off"` : ses lignes sont celles que l'on tape.
- **`text-actions.js` lit le texte ligne par ligne.** Pour chaque ligne dessinée, il retient la place de chaque position du curseur, le haut et le bas de la ligne. Le curseur, la sélection (une bande par ligne), le clic, le double-clic (mot) et le triple-clic (tout) s'en servent. `Haut` et `Bas` vont à la ligne dessinée au-dessus ou au-dessous, à la position la plus proche, y compris dans une ligne que la largeur fixe a coupée. Avec `Maj`, la sélection suit.

Le reste est inchangé :

- double-clic pour éditer ;
- `Échap` ou un clic hors du texte pour valider ;
- une étape d'annulation par édition ;
- Annuler et Rétablir de l'éditeur pendant la frappe.

## 2. Le SVG écrit

Un texte d'une ligne reste ce qu'il a toujours été : ses caractères seuls, dans le `<text>`. Un texte de plusieurs lignes contient un `<tspan>` par ligne, placé à un `x` et un `y` absolus :

```xml
<text x="100" y="100" font-size="20" text-anchor="middle" se:width="120" se:line-height="1.2">
  <tspan x="100" y="100">Vanne trois</tspan><tspan x="100" y="124" se:wrapped="true">voies</tspan><tspan x="100" y="148"></tspan><tspan x="100" y="172">C1</tspan>
</text>
```

- **`x` et `y` absolus, pas `dy`.** Mesuré dans Chromium, le `dy` d'un `<tspan>` vide ne déplace rien : la ligne vide disparaîtrait. Avec `y`, chaque ligne est à sa place pour tout lecteur.
- **Le `x` et le `y` du `<text>`** sont ceux de la première ligne. `text-anchor` aligne chaque ligne sur `x` : à gauche, au centre ou à droite du bloc.
- **`se:line-height`** donne l'interligne, en tailles de police. Il vaut 1,2 par défaut. Pour un fichier qui ne le dit pas, l'interligne est lu sur ses deux premières lignes (`y`, ou `dy` en `em` ou en unités).
- **`se:width`** donne la largeur fixe. Les lignes plus longues se coupent à un espace ; un mot plus large que le bloc reste entier.
- **`se:wrapped="true"`** marque une ligne coupée par la largeur fixe. Quand la largeur change, les lignes tapées restent donc des lignes, et seules les coupures automatiques se refont. La largeur n'est pas confiée au navigateur : `inline-size` (SVG 2) n'est pas lu par tous. Les coupures sont écrites dans le fichier, donc l'export se dessine pareil partout.
- **`xml:space="preserve"`** est écrit quand le contenu a des espaces que SVG fusionnerait : au bout d'une ligne, ou plusieurs à la suite. Les espaces tapés sont alors dessinés, et chaque position du curseur correspond à un caractère.

## 3. Largeur, poignées, alignement

- **Poignées latérales (est, ouest).** Elles donnent au texte une largeur fixe. Un texte large comme ses lignes en prend une. Les lignes se recoupent en direct pendant le geste, sans transformation ni changement de police. `Alt` déplace les deux bords ; `Échap` annule le geste. Le geste entier forme une étape d'annulation.
- **Poignées des coins, haut et bas.** Elles agrandissent le texte en proportion, comme avant (la taille de police change, lot M4). La largeur fixe suit.
- **Boîte de sélection.** Celle d'un texte de largeur fixe a cette largeur, que les lignes la remplissent ou non (comme le cadre d'un bloc de texte dans Figma).
- **Largeur automatique.** Le bouton de la section Texte rend au texte la largeur de ses lignes.
- **Alignement.** Le bloc reste en place et ses lignes s'alignent dedans. L'ancre `x` passe au bord gauche, au milieu ou au bord droit du bloc, en une étape d'annulation. Avant, un texte changeait de place quand on changeait son alignement.
- **Interligne.** C'est le nouveau champ de la section Texte.
- **Police, taille, graisse, couleur, espacements.** Ils restent sur le `<text>` et s'appliquent donc à tout le bloc. Après un changement de police, de taille, d'espacement, de place ou de largeur, le texte est remis en page, ses lignes recoupées.

## 4. Annuler, enregistrer, ouvrir

- **Annuler et Rétablir.** Une étape qui remet un texte en page garde son contenu d'avant et d'après : les `<tspan>`, plus `se:line-height` et `xml:space`, que la mise en page écrit. Annuler rend donc le texte exactement tel qu'il était, y compris un fichier venu d'ailleurs, ses identifiants et ses attributs. Un vieux correctif de SVG-Edit décalait les `<tspan>` à chaque annulation et pouvait écrire `NaN` ; il ne joue plus que pour un vrai changement de `x` ou de `y`.
- **Enregistrer.** L'éditeur indentait les enfants d'un `<text>`. Mesuré, l'espace ajouté décalait de 2,5 px une ligne centrée, et il grandissait à chaque enregistrement. Rien n'est plus ajouté à l'intérieur d'un `<text>`.
- **Ouvrir.** L'éditeur ne donne plus d'identifiant aux `<tspan>` : une ligne ne se sélectionne pas seule. Un texte enregistré, rouvert puis réenregistré est donc identique.
- **Le style de l'édition** (`cursor`) n'est plus laissé sur le texte. Avant, un texte édité gardait `style="cursor: move"` dans le fichier.
- **Textes existants.** Un texte d'une ligne n'est pas modifié tant qu'on ne l'édite pas. Un texte dont les `<tspan>` stylent une partie de ligne (`Temp <tspan fill="red">20</tspan> °C`) se lit comme une ligne, comme avant.

## 5. Sélection

Un texte de plusieurs lignes se prend partout dans son cadre : entre deux lignes ou sur une ligne vide, un clic le sélectionne, un double-clic l'édite, et un clic dans son cadre pendant l'édition ne la termine pas. Pendant l'édition, le cadre n'a pas de poignées. Avant, celles-ci revenaient à la fin du fondu de création.

## 6. Code

Le changement compte un module nouveau, des retouches dans le canevas et l'éditeur, et des tests.

**Module nouveau.** `packages/svgcanvas/core/text-lines.js` contient :

- le modèle : `getTextSource` et `setTextSource` (le contenu tel qu'il est tapé), `lineElements`, `wrapLine`, `getLineHeight`, `getTextWidth` ;
- la copie de contenu pour l'historique : `cloneContent`, `restoreContent`, `sameContent` ;
- le geste de largeur : `startTextWidthResize`, `resizeTextWidth`.

**Canevas, retouché.**

- `text-actions.js` : les lignes du curseur et de la sélection, `moveVertically`, la fin du style d'édition.
- `history.js` : `ChangeElementCommand` reçoit une copie du contenu ; `beginUndoableChange` et `finishUndoableChange` la font pour `#text` et pour les attributs de mise en page.
- `undo.js` : `changeSelectedAttributeNoUndo` remet le texte en page et écrit `se:` dans son espace de noms ; le décalage des `<tspan>` ne joue plus que pour un vrai changement de position.
- `elem-get-set.js` : `getLineHeight` et `setLineHeight`, `getTextWidth` et `setTextWidth`, l'alignement sur place.
- `event.js` : le geste des poignées latérales.
- `utilities.js` : la boîte d'un texte de largeur fixe.
- `selection.js` : un texte se prend dans son cadre.
- `svg-exec.js` : rien n'est ajouté dans un `<text>` ; pas d'identifiant aux `<tspan>`.
- `multi-transform.js` : la largeur fixe suit la mise à l'échelle.
- `paste-properties.js` : un style collé remet le texte en page.
- `select.js` : pas de poignées pendant l'édition.

**Éditeur, retouché.**

- `TopPanel.html` et `TopPanel.js` : la `<textarea>`, le champ Interligne, le bouton Largeur automatique.
- `EditorStartup.js` : `Haut` et `Bas`.
- `history-steps.js` et les traductions française et anglaise.
- Deux icônes dessinées, `line_height.svg` et `text_auto_width.svg`.

**Tests.** `tests/unit/texte-multiligne.test.js` (15 tests) et `tests/e2e/texte-multiligne.spec.js` (9 tests).

## 7. Limites assumées

- **Pas d'éditeur riche.** Pas de mise en forme par mot, ni de paragraphes : la typographie est celle du bloc.
- **Pas de hauteur fixe.** La hauteur suit les lignes.
- **Un mot plus large que le bloc** n'est pas coupé au milieu.
- **Espaces multiples à une coupure.** Une coupure automatique consomme un espace ; s'il y en avait plusieurs, les autres restent au bout de la ligne.
- **Police absente.** Les coupures sont écrites dans le fichier : un lecteur qui n'a pas la police dessine les mêmes lignes, avec ses propres glyphes.

## 8. Vérifications

- **Tests unitaires** : 995/995, dont les 15 de `texte-multiligne.test.js`.
- **De bout en bout, mise en page canevas** : 516/516, dont les 9 de `texte-multiligne.spec.js`. Après la limite posée sur la prise dans le cadre (ci-dessous), les suites touchées ont été rejouées : 32/32.
- **De bout en bout, mise en page classique** : en cours au moment de ce commit.
- **Sortie comparée à V7** (`tests/output/compare-output.mjs`) :
  - scénarios : 73/73 identiques ;
  - allers-retours : 23/23 identiques.
- **Fichiers produits par SVG-Edit** : 19/19 identiques. Le synoptique de référence de V7 (`docs/v7/synoptique-reference.svg`), ouvert puis enregistré, est identique.
- **Coût au survol.** Prendre un texte dans son cadre ne lit que les textes en bloc : ceux qui ont des lignes ou une largeur fixe. Mesuré sur 600 textes d'une ligne, l'appel par mouvement de souris passe de 0,0006 ms à 0,1 ms. Sans cette limite, il coûtait 0,78 ms.
- **Firefox** : à vérifier. La CI ne démarre pas, faute de facturation GitHub.
