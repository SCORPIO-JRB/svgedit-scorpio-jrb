# Le panneau Propriétés, sur le modèle de Figma

Branche `panneau-proprietes`, depuis `plume-illustrator`. Référence : le panneau de propriétés de Figma pour un chemin (capture fournie). Le panneau est le même pour toutes les formes : le rectangle, l'ellipse, le polygone et le chemin y trouvent les mêmes sections, chacun avec les champs qui s'appliquent à lui.

## 1. Avant, après

| Section | Avant | Après |
| --- | --- | --- |
| Géométrie | X, Y ; L, H et verrou ; angle | **Position** : rangée d'alignement (6 boutons), X, Y ; « Rotation » : angle, ↻ 90°, miroir horizontal, miroir vertical |
| — | — | **Dimensions** : L, H, le verrou des proportions à leur droite (rayon d'un cercle, rayons d'une ellipse, branches d'une étoile, outil Échelle) |
| Apparence | « Masquer la sélection », « Verrouiller la sélection » en texte ; opacité | Sur la ligne du titre : l'œil (masquer) et la goutte (mode de fusion). Dessous : opacité et **rayon des coins** côte à côte |
| Remplissage | − sur la ligne du titre ; la couleur | Sur la ligne du titre : les bibliothèques (4 points) et +, quand il n'y a pas de remplissage. Dessous : la couleur, son opacité, l'œil, − |
| Contour | − sur la ligne du titre ; la couleur ; Épaisseur et tirets ; 3 boutons de flèches ; « Plus d'options » | Comme le remplissage, puis **Position** (Centre, Intérieur, Extérieur), **Épaisseur** et l'icône des réglages : tirets, jonctions, extrémités, flèches |

Depuis la branche `panneau-texte`, l'icône des réglages ouvre la fenêtre « Paramètres du contour » et la section Texte devient Typographie : voir `docs/panneau-texte.md`.

Les miroirs quittent le menu « … » : ils sont à côté de l'angle, avec leurs raccourcis `Maj`+`H` et `Maj`+`V`. Le verrouillage reste dans l'onglet Calques, le menu contextuel et `Ctrl`+`Maj`+`L`.

## 2. Position

- **Alignement.** Un objet seul s'aligne sur la page, plusieurs objets entre eux, comme `Alt`+`A`, `Alt`+`H`, `Alt`+`R`, `Alt`+`W`, `Alt`+`V`, `Alt`+`S`.
- **↻ 90°.** Chaque clic tourne de 90° dans le sens horaire, en une étape d'annulation : un objet autour de son centre, une sélection dont les objets ont le même angle d'un bloc, les autres chacun autour de son centre.

## 3. Apparence

- **L'œil** masque la sélection, puis la réaffiche (la commande « Afficher/Masquer la sélection », `Ctrl`+`Maj`+`H`). L'objet masqué reste sélectionné, comme dans Figma (lot Texte et masquage, `docs/texte-masquer.md`).
- **La goutte** ouvre la liste des modes de fusion : Normal, Produit, Superposition, Incrustation, Obscurcir, Éclaircir, Différence. Elle se colore quand l'objet en a un autre que Normal. Le mode s'écrit en `mix-blend-mode` dans le style de l'objet ; Normal n'écrit rien.
- **Rayon des coins.** Il s'affiche pour un rectangle, un polygone, une polyligne ou un chemin qui a des angles :
  - un rectangle garde `rx` et `ry` ;
  - un polygone ou une polyligne devient un chemin, ses angles arrondis par des arcs ;
  - un chemin a tous ses angles arrondis, comme les poignées d'angle du lot Coins ; 0 les rend vifs.

  Une seule étape d'annulation, « Arrondir les coins ». Des angles de rayons différents affichent « Mixte ».

## 4. Remplissage et contour

- **Les 4 points** ouvrent la fenêtre couleur sur ses bibliothèques.
- **+** apparaît sur la ligne du titre quand la forme n'a pas de peinture, et lui rend la couleur par défaut.
- **−** retire la peinture. Sans peinture, la section ne garde que son titre.
- **L'œil** masque la peinture sans la perdre : elle devient `none`, et sa valeur attend dans `data-se-fill-hidden` ou `data-se-stroke-hidden`, dans le fichier aussi. Le champ la montre estompée ; un clic sur l'œil la rend. Choisir une autre couleur la rend aussi visible.

### Position du contour

SVG ne sait dessiner qu'un contour centré sur le bord. L'intérieur et l'extérieur sont émulés, et le rendu est le même dans tout logiciel :

| Position | Dessin |
| --- | --- |
| Centre | Le contour SVG, tel quel. |
| Intérieur | Le contour est deux fois plus épais, découpé par la forme (`clip-path`). |
| Extérieur, avec un fond | Le contour est deux fois plus épais, passé sous le fond (`paint-order: stroke`). |
| Extérieur, sans fond | Le contour est deux fois plus épais, l'intérieur de la forme retiré par un masque (`mask`). |

- **Fichier.** La forme garde sa position dans `data-se-stroke-align` et, dans `stroke-width`, le double de son épaisseur ; le champ Épaisseur montre l'épaisseur et double ce qu'on tape. La découpe et le masque sont des copies du contour de la forme, dans les `defs`, nommées `se_stroke_` suivi de son identifiant.
- **Mise à jour.** Elles sont refaites à chaque modification de la forme (déplacement, redimensionnement, nœuds, couleur, annulation, collage, duplication, ouverture d'un fichier) et disparaissent avec elle.
- **Où elle s'applique.** Rectangle, cercle, ellipse, polygone, polyligne et chemin. Une ligne n'a pas d'intérieur : le champ est grisé. Une forme qui a sa propre découpe ou son propre masque garde un contour centré.
- **Limite.** À l'extérieur, un fond translucide laisse voir la moitié intérieure du contour sous lui.

## 5. Code

| Fichier | Rôle |
| --- | --- |
| `packages/svgcanvas/core/stroke-align.js` | Position du contour : `setStrokeAlign`, la découpe ou le masque, leur mise à jour par un `MutationObserver` sur le dessin, le nettoyage des copies orphelines |
| `packages/svgcanvas/core/elem-get-set.js` | `setPaintVisible` (l'œil d'une peinture), la peinture rendue visible par `setPaint`, l'épaisseur doublée par `setStrokeWidth` |
| `packages/svgcanvas/core/structure.js` | `setBlendModes` |
| `packages/svgcanvas/core/corner-actions.js` | `radiusOf` et `setRadius` : le rayon des coins de toutes les formes |
| `src/editor/panels/Inspector.js` | Sections Position et Dimensions, rangée d'alignement, rotation, Apparence, ligne du contour, réglages |
| `src/editor/panels/PaintPicker.js` | Bibliothèques, +, œil et − du remplissage et du contour |
| `src/editor/components/PaintBox.js` | Le champ montre une peinture masquée |
| `src/editor/panels/panelValues.js`, `BottomPanel.js` | L'épaisseur d'un contour intérieur ou extérieur |
| `src/editor/panels/TopPanel.js` | Le champ du rayon passe par `setRadius` |
| `src/editor/panels/ContextBar.js` | Un réglage replié reste disponible dans la barre contextuelle |
| `src/editor/history-steps.js`, `locale/lang.*.js` | Noms des étapes et des contrôles |
| `src/editor/images/` | Icônes `blend`, `styles`, `tune`, `stroke_weight`, `rotate_90`, `corner_radius` |

## 6. Vérifications

- Tests unitaires : `tests/unit/proprietes.test.js` (11 tests : position du contour, œil, fusion, rayon des coins).
- Tests E2E : `tests/e2e/proprietes-figma.spec.js` (8 tests). Les tests qui décrivaient l'ancien panneau sont mis à jour : `layout-v3`, `simplification-s1`, `couleurs-v4`, et `tests/unit/layout-v3.test.js`.
