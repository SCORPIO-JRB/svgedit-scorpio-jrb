# Points des chemins

Branche `chemins-points`, depuis `master`. Référence : l'aide de Vecta, [Basic shape operations](https://vecta.io/help/basic-shape-operations#drawing-lines-arcs-curves-and-freeforms-paths), sections « Moving path points », « Extending or joining paths », « Adding path points » et « Deleting path points ».

SVG-Edit savait déjà dessiner un chemin à la plume et en éditer les nœuds. Il lui manquait la manière de Vecta :

- sélectionner des points avec `Ctrl` aussi ;
- les déplacer aux flèches ;
- les supprimer avec `Suppr` ;
- en ajouter avec `Alt`+clic sur le tracé ;
- prolonger un chemin ou en joindre deux à la plume.

## 1. Ce qui existait, et ce qui est repris

**Édition des nœuds** (mode `pathedit`). On y entre :

- par un double-clic ;
- par un second clic sur un chemin sélectionné ;
- par `Entrée` ;
- par « Modifier les nœuds » dans la barre contextuelle.

Un nœud se sélectionne d'un clic, `Maj`+clic l'ajoute, un rectangle en prend plusieurs, et un glisser les déplace. La barre contextuelle offre :

- les points liés ;
- le type du segment ;
- cloner, supprimer ;
- ouvrir ou fermer le sous-chemin ;
- ajouter un sous-chemin.

Tout cela reste.

**Plume** (`P`). Un clic pose un point, un glisser tire les poignées d'une courbe, `Maj` contraint l'angle à 45°. Un clic sur le premier point ferme le chemin, un clic sur un autre de ses points le termine ouvert. Tout cela reste.

## 2. Déplacer des points

- **`Maj` ou `Ctrl`+clic** (`Cmd` sur Mac) ajoute un point à la sélection, ou l'en retire s'il y était.
- **Un rectangle tracé avec `Maj` ou `Ctrl`** ajoute ses points à ceux déjà sélectionnés. Sans touche, il les remplace, comme avant.
- **Un glisser** déplace tous les points sélectionnés, comme avant.
- **Les flèches** déplacent les points sélectionnés d'un pas de grille, ou de 1 sans grille ; `Maj`+flèche, de dix. Comme pour les objets (lot V5), des flèches à la suite font une seule étape d'annulation. Sur un chemin tourné, le déplacement suit les axes du dessin.
- **Un point sélectionné est rempli** de la couleur des repères (rose), les autres restent blancs. Avant, seule la couleur du contour changeait.

**Correction d'un défaut d'origine.** Un clic sur le premier point d'un chemin ouvert sélectionnait le dernier, car `selectPt(0)` lisait 0 comme « aucun point ». De même, la suppression de plusieurs points triait leurs numéros comme du texte : avec dix points ou plus, l'ordre de suppression était faux.

## 3. Supprimer des points

`Suppr` ou `Retour arrière` supprime les points sélectionnés, en une étape d'annulation. Avant, ces touches ne faisaient rien en édition des nœuds : elles visaient les objets sélectionnés, et il n'y en a pas dans ce mode.

La suppression reprend celle du bouton de la barre contextuelle :

- les deux voisins du point se rejoignent ;
- un chemin fermé le reste ;
- un chemin réduit à un seul point disparaît.

## 4. Ajouter des points

**`Alt`+clic sur le tracé** ajoute un point là où passe le chemin, sans en changer la forme. Ce point est le seul sélectionné. On peut :

- cliquer dans l'édition des nœuds ;
- cliquer sur un chemin déjà sélectionné : l'éditeur passe en édition des nœuds avec le point ajouté.

Un clic suffit s'il tombe à 6 pixels du tracé, ou plus près si le trait est épais. Ailleurs, rien n'est ajouté.

`Alt`+glisser ajoute le point et le déplace aussitôt. L'ajout et le déplacement ne font qu'une étape d'annulation.

**Sans changer la forme.** Le segment touché est coupé en deux à l'endroit du clic, selon son type :

| Segment | Coupure |
|---|---|
| Droite | Au point du clic |
| Bézier cubique ou quadratique | Algorithme de de Casteljau : les deux moitiés suivent exactement la courbe |
| Arc | Centre et angles de l'ellipse calculés (SVG 1.1, annexe F.6.5), puis deux arcs. Chacun a les rayons de l'ellipse ; son drapeau « grand arc » dépend de sa part de l'angle |

`S` et `T` sont relus comme `C` et `Q`, `H` et `V` comme `L`. Un segment ne dépend ainsi plus de celui qui le précède, et la coupure ne déforme pas le suivant.

## 5. Prolonger ou joindre des chemins

Avec la plume, au survol d'une extrémité d'un chemin ouvert, un cercle rose la signale. La ligne qui suit le pointeur s'y aimante.

- **Partir d'une extrémité** prolonge ce chemin. Le dessin s'ajoute à sa fin, ou avant son début, et le chemin garde son sens : ses marqueurs (flèches) restent au même bout. Un clic sur le dernier point posé termine le prolongement.
- **Finir sur l'extrémité d'un autre chemin** joint les deux. Le chemin prolongé garde son style et son identifiant ; l'autre disparaît, ses points repris dans le premier.
- **Finir sur l'autre extrémité du même chemin** le ferme.
- **Un nouveau dessin qui finit sur une extrémité** rejoint ce chemin, qui garde son style et son sens.

Le tout fait une seule étape d'annulation :

- « Prolonger le chemin » quand un seul chemin change ;
- « Joindre les chemins » quand deux deviennent un.

Annuler rend les deux chemins tels qu'ils étaient. Après le dessin, l'éditeur est en édition des nœuds du résultat, comme après tout tracé à la plume.

**Quels chemins.** Seuls les chemins qu'un clic peut sélectionner sont concernés : ceux du calque ou du groupe ouvert. Sont exclus :

- les chemins fermés ;
- les chemins masqués ;
- les chemins verrouillés (lot V7) ;
- les connecteurs : leur tracé est calculé (lot V7).

Un chemin tourné est prolongé dans son propre repère : le dessin est ramené par l'inverse de sa transformation. Pour un arc, l'ellipse elle-même est transformée : ses rayons et sa rotation sont recalculés, et son sens s'inverse sous une symétrie.

## 6. Code

| Fichier | Rôle |
|---|---|
| `packages/svgcanvas/core/path-points.js` | Géométrie sans DOM. `readPath` lit un `d` en sous-chemins de segments absolus `L`, `C`, `Q`, `A` ; un sous-chemin fermé finit par un segment vers son début, comme le fait `fixEnd`. `writePath` écrit le `d`. S'y ajoutent `nearestPoint`, `splitSegment` et `insertNode`, `reverseSubpath`, `transformSubpath`, `openEnds` et `joinSubpaths` |
| `packages/svgcanvas/core/path-actions.js` | `addPointAt`, `addPointOnPath`, `moveSelectedPoints`. La plume y gagne la recherche des extrémités (`#openEndAt`, avec un cache par chemin), l'indicateur `#path_end_hint` (`showEndAt`) et la fusion (`#commitJoin`, une `BatchCommand`) |
| `packages/svgcanvas/core/path-method.js` | Remplissage des points sélectionnés, `selectPt(0)`, tri numérique de la sélection |
| `packages/svgcanvas/core/event.js` | `Alt`+clic sur un chemin sélectionné ; indicateur au survol avec la plume |
| `src/editor/Editor.js` | `Suppr` et les flèches en édition des nœuds |
| `src/editor/history-steps.js`, `locale/lang.{fr,en}.js` | Noms des étapes : « Ajouter un point », « Déplacer des points », « Supprimer des points », « Prolonger le chemin », « Joindre les chemins » |

Le `d` réécrit après un ajout ou une jonction est en commandes absolues, arrondi comme le reste du canevas (`shortFloat`). À l'export, il passe en relatif comme tout chemin.

## 7. Limites assumées

- **Les nœuds restent des ronds.** Vecta dessine des losanges. La couleur du point sélectionné suit Vecta ; la forme des poignées, partagée avec le dessin à la plume, n'a pas changé.
- **Pas d'outils séparés pour l'arc et la courbe.** Vecta a un outil par sorte de tracé. Ici, la plume fait les droites et les courbes, et le crayon le tracé libre.
- **Un chemin dans un groupe fermé** n'est pas prolongé : on ouvre d'abord le groupe, comme pour le sélectionner.
- **La réécriture du `d`** lors d'un ajout ou d'une jonction remplace `H`, `V`, `S` et `T` par leurs équivalents `L`, `C` et `Q`. La forme est la même.

## 8. Vérifications

- Tests unitaires `tests/unit/path-points.test.js` (24) :
  - lecture et écriture ;
  - coupure sans changer la forme, pour droite, cubique, quadratique, arc et grand arc ;
  - point le plus proche ;
  - inversion ;
  - transformation d'arcs (rotation, échelle non uniforme, symétrie) ;
  - prolongement, fermeture et jonction dans tous les sens.
- Tests de bout en bout `tests/e2e/chemins-points.spec.js` (19) :
  - sélection `Maj` et `Ctrl` ;
  - rectangle additif ;
  - glisser, flèches et annulation ;
  - `Suppr` et `Retour arrière`, sur chemin ouvert et fermé, et avec plus de dix points ;
  - `Alt`+clic sur une courbe (longueur inchangée) et sur un chemin sélectionné ;
  - `Alt`+glisser en une étape ;
  - indicateur ;
  - prolongement par la fin et par le début ;
  - jonction de deux chemins, puis annulation ;
  - nouveau dessin joint ;
  - fermeture ;
  - chemins fermé, verrouillé ou connecteur non prolongés.
