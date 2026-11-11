# Le panneau d'un texte et les réglages du contour, sur le modèle de Figma

Branche `panneau-texte`, depuis `scrub-valeurs`. Références : le panneau de Figma pour un texte, et sa fenêtre « Stroke settings », onglet Basic seul, sans « Width profile » (captures fournies).

## 1. Avant, après

| Section | Avant | Après |
| --- | --- | --- |
| Dimensions | L, H d'un texte : agrandir en proportion (la taille de police changeait) ; verrou forcé | **Redimensionnement** : largeur automatique, hauteur automatique, taille fixe. **L** donne au texte une largeur, ses lignes s'y coupent. **H** fixe sa boîte. La police garde sa taille. |
| Texte → **Typographie** | Après le contour. G, I, S ; « Fonte : » ; taille et bouton d'ancrage ; interligne ; « Plus d'options » (espacement des lettres) ; largeur automatique | Après l'apparence, comme dans Figma. La police seule sur sa ligne, puis le style (graisse et italique) et la taille avec son menu. Interligne et espacement des lettres sous leurs légendes. Alignement : horizontal, vertical, puis l'icône des réglages. Les 4 points du titre ouvrent les styles de texte. |
| Contour | « Centre » et l'épaisseur sans légende ; l'icône déplie tirets, jonctions, extrémités et flèches sous la ligne | Légendes **Position** et **Épaisseur**. L'icône ouvre la fenêtre **Paramètres du contour**, à gauche du panneau. |

## 2. Typographie

- **Police.** Toute la largeur, sans « Fonte : ».
  - La liste commence par les polices des styles de texte (Space Grotesk, Roboto Flex).
  - La police d'un fichier est reconnue quelle que soit sa casse : `sans-serif` montre « Sans-serif ».
  - Une police absente de la liste s'y ajoute sous son nom.
- **Style.** Les neuf graisses de Figma, chacune droite et italique : Fin, Extra-léger, Léger, Normal, Moyen, Demi-gras, Gras, Extra-gras, Noir.
  - Un choix écrit `font-weight` et, s'il le faut, `font-style`, en une étape d'annulation.
  - 400 et 700 s'écrivent `normal` et `bold`, comme SVG-Edit l'a toujours fait.
  - Des textes de styles différents montrent « Mixte ».
  - Les boutons G et I quittent le panneau. Ils restent dans la barre contextuelle, avec `Ctrl`+`B` et `Ctrl`+`I`.
- **Taille.** Le chevron ouvre les tailles de Figma : 8 à 128. L'icône glisse la valeur.
- **Interligne, espacement des lettres.** Côte à côte, sous leurs légendes. L'espacement des lettres sort de « Plus d'options » et peut être négatif.
- **Alignement.**
  - **Horizontal** : gauche, centre, droite. C'est l'ancrage d'avant ; le bloc reste en place.
  - **Vertical** : haut, milieu, bas, dans une boîte de taille fixe. Ailleurs, grisé.
- **Paramètres du texte** (icône au bout de la ligne) : souligné, barré, surligné, espacement des mots, longueur.
  - Les réglages rares du lot S1 n'y paraissent que si le texte en a une valeur.
  - L'icône se marque quand un réglage a une valeur.

## 3. Redimensionnement

| Mode | Fichier | Effet |
| --- | --- | --- |
| Largeur automatique | ni `se:width` ni `se:height` | Le texte est large comme ses lignes. |
| Hauteur automatique | `se:width` | Les lignes se coupent dans la largeur ; la hauteur les suit (lot Texte multiligne). |
| Taille fixe | `se:width`, `se:height`, et `se:valign` si les lignes sont au milieu ou en bas | La boîte a cette largeur et cette hauteur. Les lignes s'y placent selon l'alignement vertical ; un texte trop long déborde, comme dans Figma. |

- **Choisir un mode** prend la boîte du texte telle qu'elle est, en une étape d'annulation. La largeur automatique retire aussi la hauteur et l'alignement vertical.
- **L et H d'un texte seul** changent sa boîte, plus sa taille de police. H passe le texte en taille fixe. Le verrou des proportions est grisé. Plusieurs objets se mettent toujours à l'échelle.
- **Poignées.** Celles des côtés donnent la largeur (lot Texte multiligne). Celles des coins agrandissent en proportion, la boîte fixe comprise.

### Le SVG écrit

```xml
<text x="100" y="100" font-size="20" se:width="120" se:height="150" se:valign="bottom">
  <tspan x="100" y="203">Vanne trois</tspan><tspan x="100" y="227" se:wrapped="true">voies</tspan>
</text>
```

- **Le `y` du `<text>`** reste la ligne de base d'une première ligne posée en haut de la boîte. Le haut de la boîte est donc `y` moins la hauteur de la police au-dessus de sa ligne de base. La boîte garde sa place quand des lignes viennent ou partent, ou que l'alignement change.
- **Les `<tspan>`** descendent de ce que l'alignement demande. Au milieu ou en bas, une ligne seule est aussi un `<tspan>`, pour que le fichier se dessine pareil partout.
- **La hauteur d'une ligne** au-dessus et au-dessous de sa ligne de base est celle de la boîte que le navigateur donne à la police. Elle est mesurée une fois par police (`lineMetrics`).

## 4. Paramètres du contour

Une fenêtre à gauche du panneau, comme « Stroke settings » de Figma : titre, bouton de fermeture, une ligne par réglage. Seul l'onglet Basic est repris, sans « Width profile ».

| Ligne | Réglage |
| --- | --- |
| Style | Plein, Pointillé, Tirets, Tiret-point, Tiret-point-point (`stroke-dasharray`) |
| Jonction | Trois boutons : angle, arrondi, biseau (`stroke-linejoin`) |
| Angle d'onglet | Sous cet angle, une jonction en angle est biseautée. SVG l'écrit en `stroke-miterlimit` = 1 / sin(angle / 2) ; la valeur par défaut de SVG, 4, donne 28,96°, celle de Figma. Visible pour une jonction en angle. |
| Extrémités | Trois boutons : plate, carrée, arrondie (`stroke-linecap`) |
| Flèches | Début, milieu, fin : les marqueurs de l'extension, pour une ligne ou un chemin |

- **Annulation.** Chaque réglage est une étape d'annulation. Plusieurs formes qui diffèrent n'ont aucun bouton choisi.
- **Fermer.** `Échap`, le bouton ×, l'icône ou un clic ailleurs ferment la fenêtre. `Échap` la ferme d'abord, sans désélectionner l'objet.

## 5. Code

| Fichier | Rôle |
| --- | --- |
| `src/editor/panels/Inspector.js` | Typographie (`buildTypography`, `changeFontStyle`, `refreshText`), Redimensionnement (`buildResizing`), fenêtres de réglages (`settingsWindow`), boutons d'une liste (`choices`), angle d'onglet (`miterAngleOf`, `miterLimitOf`) |
| `packages/svgcanvas/core/text-lines.js` | `getTextHeight`, `getTextVerticalAlign`, `lineMetrics` ; la mise en page place les lignes dans une boîte de hauteur fixe |
| `packages/svgcanvas/core/elem-get-set.js` | `setTextResizing`, `setTextBox`, `setTextVerticalAlign` et leurs lecteurs |
| `packages/svgcanvas/core/utilities.js` | La boîte d'un texte de hauteur fixe |
| `packages/svgcanvas/core/multi-transform.js` | La hauteur fixe suit la mise à l'échelle |
| `src/editor/panels/TopPanel.js` | L et H d'un texte seul : sa boîte |
| `src/editor/components/sePopover.js` | Placement `left-start`, à gauche du panneau (`beside`) |
| `src/editor/panels/TextStyles.js` | La fenêtre des styles s'ouvre aussi depuis le titre de Typographie |
| `src/editor/layout.css`, `history-steps.js`, `locale/lang.*.js` | Styles, noms des étapes et des contrôles |
| `src/editor/images/` | `text_auto_height`, `text_fixed_size`, `text_valign_top`, `text_valign_middle`, `text_valign_bottom` |

## 6. Limites

- **Changer la taille de police d'un texte de taille fixe** garde sa ligne de base. Le haut de la boîte bouge donc un peu, comme pour tout texte de l'éditeur. Dans Figma, la boîte ne bouge pas.
- **Un fichier écrit à la main** avec `se:valign` mais sans `<tspan>` n'est mis en page qu'à la première modification du texte. Un fichier enregistré par l'éditeur a toujours ses `<tspan>`.
- **Poignées haut et bas.** Elles agrandissent toujours en proportion (lot M4). Dans Figma, elles donnent la hauteur.

## 7. Vérifications

- **Tests unitaires** : `tests/unit/panneau-texte.test.js`, 10 tests :
  - angle d'onglet ;
  - liste Style ;
  - ordre des sections ;
  - mise en page d'un texte de taille fixe ;
  - placement à gauche du panneau.
- **Tests E2E** : `tests/e2e/panneau-texte.spec.js`, 6 tests :
  - Typographie ;
  - Style et « Mixte » ;
  - tailles et alignement ;
  - Redimensionnement, L, H et alignement vertical ;
  - paramètres du texte ;
  - paramètres du contour.
- **Tests mis à jour**, qui décrivaient l'ancien panneau :
  - `layout-v3` : ordre des sections ;
  - `selection-m4` : L et H d'un texte ;
  - `simplification-s1` : réglages rares et repliés ;
  - `proprietes-figma` : réglages du contour ;
  - `text-tools` : G et I par la barre contextuelle ;
  - `tests/fixtures/simplification/inventaire.json` : section Typographie ; le registre des commandes ne change pas.
