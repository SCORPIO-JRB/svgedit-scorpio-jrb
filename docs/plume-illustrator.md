# La plume sur un chemin

Branche `plume-illustrator`, depuis `coins-arrondis`. Référence : la plume d'Illustrator. Choisie avec un objet sélectionné, elle en montre les points d'ancrage :

- au-dessus d'un point, elle prend un petit « − » et le supprime ;
- au-dessus d'un segment, elle prend un petit « + » et y ajoute un point ;
- avec `Alt` au-dessus d'un segment, elle le courbe, avec deux poignées.

## 1. Ce qui existait

La plume dessinait un nouveau chemin, ou en prolongeait un depuis une de ses extrémités (lot Chemins). Pour modifier les points d'un chemin, il fallait passer en édition des nœuds, par :

- un double-clic ;
- `Entrée` ;
- « Modifier les nœuds » dans la barre contextuelle.

L'édition des nœuds permettait déjà :

- d'ajouter un point par `Alt`+clic ;
- de le supprimer par `Suppr`.

Choisir la plume avec un chemin sélectionné ne faisait rien de plus que dessiner.

**Défauts d'origine corrigés au passage :**

- **Outil choisi pendant l'édition des nœuds.** L'édition repassait par la sélection, dont l'évènement réenfonçait le bouton Sélection. Le canevas était dans l'outil choisi, la barre d'outils montrait la sélection. L'édition des nœuds se ferme désormais sans ce détour.
- **Annuler grisé après un changement de nœuds.** La mise à jour du panneau s'arrêtait, en édition des nœuds, avant les boutons Annuler et Rétablir. Après un ajout de point dans un historique vide, le bouton restait grisé, et `Ctrl`+`Z`, qui passe par lui, ne faisait rien.
- **Noms des étapes de nœuds.** Les noms prévus au lot Chemins ne s'appliquaient jamais : le canevas écrit leur texte précédé de « Change path ». Toutes s'appelaient donc « Modifier les nœuds ». Elles portent désormais leur nom :
  - « Ajouter un point » ;
  - « Déplacer des points » ;
  - « Supprimer des points » ;
  - « Courber le côté ».

## 2. Choisir la plume avec un objet sélectionné

| Sélection | Effet |
| --- | --- |
| Un chemin | Édition de ses nœuds avec la plume. Aucun nœud n'est présélectionné. |
| Un rectangle, une ellipse, un cercle, une ligne, une polyligne, un polygone | Ses points, ceux qu'il aurait en chemin, s'affichent. La forme reste une forme tant qu'on n'y touche pas. |
| Rien, plusieurs objets, un groupe, un texte, une image | La plume dessine, comme avant. |

Un chemin dont on éditait déjà les nœuds reste en édition, avec la plume. Un objet verrouillé ou un connecteur n'est pas concerné.

Le bouton de la plume reste enfoncé pendant l'édition des nœuds avec la plume. Sans la plume, après un double-clic, c'est le bouton Sélection, avec son icône de nœud, comme avant.

## 3. Ce que fait un clic

| Sous la plume | Curseur | Clic |
| --- | --- | --- |
| Un point | Plume « − » | Le supprime, au relâchement. Ses voisins se rejoignent. Un chemin réduit à un point disparaît, dans la même étape, et la plume reste. |
| Une extrémité d'un chemin ouvert | Plume | Prolonge le chemin depuis ce point (lot Chemins). |
| Un segment | Plume « + » | Ajoute un point à cet endroit, sans changer la forme. Un glisser le déplace aussitôt. |
| Un segment, avec `Alt` | Flèche avec une courbe | Le glisser courbe le segment (§ 4). |
| Une poignée de courbe | Celui des nœuds | La tire, comme en édition des nœuds. |
| La poignée d'un coin (lot Coins) | Celui des nœuds | Arrondit le coin. |
| Ailleurs | Plume | Commence un nouveau chemin. L'édition des nœuds du précédent prend fin. |

Le curseur suit `Alt` pressé ou relâché, même sans bouger la souris. Il est noir cerclé de blanc, et se lit sur un dessin clair comme sur un dessin foncé. Le point visé est à la pointe de la plume.

**`Ctrl`** (`Cmd` sur Mac) rend l'édition des nœuds habituelle, comme la flèche de sélection directe d'Illustrator :

- sélectionner des points, `Ctrl`+clic les ajoutant ou les retirant ;
- les déplacer ;
- les prendre dans un rectangle.

**`Suppr` et les flèches** agissent sur les points sélectionnés, comme en édition des nœuds.

**`Échap`** :

- pendant un glisser, remet tout comme avant le clic, `Alt` encore enfoncé ou non ;
- sinon, ferme l'édition des nœuds, ou cache les points de la forme.

La plume reste l'outil. Un second `Échap` ne fait rien de plus.

## 4. Courber un segment

`Alt`+glisser sur un segment le rend courbe : la courbe passe par le pointeur, et ses deux extrémités ne bougent pas.

- **Le segment devient une courbe de Bézier cubique**, avec une poignée à chaque bout :
  - une droite garde son tracé, ses poignées au tiers et aux deux tiers ;
  - une courbe quadratique est élevée en cubique, sans changer ;
  - un arc est remplacé par la cubique qui part et arrive le long de lui. Il en reste très près jusqu'au demi-cercle.
- **Le point pris suit le pointeur.** Les deux poignées bougent : également si on prend le segment en son milieu, celle du bout le plus proche davantage sinon. Ce sont les poids qu'Inkscape donne au glisser d'une courbe.
- **Près d'un bout**, le point pris est ramené à 10 % de la longueur du segment : plus près, une poignée devrait partir très loin.

Les poignées s'affichent pendant et après le glisser : on peut les tirer ensuite.

Un `Alt`+clic sans glisser ne change rien. Le glisser fait une étape d'annulation, « Courber le côté ».

## 5. Formes : chemin au premier changement

Un rectangle, une ellipse ou un polygone montrent leurs points sans être convertis. Ce n'est qu'au premier clic sur un point ou un segment que la forme devient un chemin, et le clic s'y applique aussitôt. La conversion et le changement font une seule étape, nommée d'après le changement : « Ajouter un point », « Supprimer des points » ou « Courber le côté ». Une annulation rend la forme d'origine, ses points toujours montrés par la plume.

Choisir la plume après avoir tracé un rectangle, pour dessiner autre chose, ne le change donc pas. Le premier clic à côté du rectangle commence le nouveau chemin.

Partir d'une extrémité de ligne ou de polyligne la convertit d'abord, en une étape à part. Le tracé qui suit fait la sienne, « Prolonger le chemin ».

Le chemin garde ce qu'avait la forme : identifiant, style, transformation (voir `convertToPath`).

## 6. Annuler et rétablir

Avec la plume, une annulation ou un rétablissement remontre les points de l'objet que l'étape a changé : le chemin en édition des nœuds, ou la forme rendue. La plume reste l'outil. Avant, l'annulation pendant l'édition des nœuds repassait à l'outil Sélection.

## 7. Code

| Fichier | Rôle |
| --- | --- |
| `packages/svgcanvas/core/path-points.js` | `toCubic`, qui rend tout segment cubique, et `bendCubic`, qui courbe une cubique par un point. |
| `packages/svgcanvas/core/path-actions.js` | La plume sur un chemin : choix de l'outil (`penChosen`, `penLeft`), ce qui est sous la plume (`#penHit`), curseur (`penHover`), clic en édition des nœuds (`#penDown`), suppression, courbure, nouveau tracé. S'y ajoutent les points d'une forme (`#pen_shape_nodes`) et sa conversion au premier clic (`#shapeDown`, `#withConversion`), `Échap` (`leaveNodes`, `cancelPen`) et l'après-annulation (`penAfterHistory`). |
| `packages/svgcanvas/svgcanvas.js` | `setMode` ferme l'édition des nœuds sans repasser par la sélection, et prévient la plume. |
| `packages/svgcanvas/core/event.js` | Curseur au survol, `Échap` pendant un clic de la plume. |
| `packages/svgcanvas/core/undo.js` | Les points d'une forme sont cachés avant une étape d'historique. |
| `src/editor/Editor.js` | `Échap` avec la plume. |
| `src/editor/panels/TopPanel.js` | Le bouton de la plume reste enfoncé en édition des nœuds ; après une annulation, la plume remontre les points ; les boutons Annuler et Rétablir suivent aussi les changements de nœuds (`updateHistoryButtons`). |
| `src/editor/svgedit.css` | Les quatre curseurs, en SVG dans la feuille de style, et les points d'une forme. |
| `src/editor/history-steps.js`, `locale/lang.*.js` | Étape « Courber le côté » (`bend_segment`). Les étapes de nœuds sont nommées d'après leur texte (« Change path Add path point »). |

## 8. Limites

- **Pas de conversion de point.** `Alt` au-dessus d'un point ne le change pas en point d'angle ou point lisse (outil Conversion de point d'ancrage d'Illustrator).
- **Pas de contour du chemin survolé.** Illustrator surligne le chemin sous la plume dans la couleur du calque ; ici seuls les points s'affichent.
- **Un glisser depuis un point** ne déplace pas ce point : il le supprime au relâchement. Pour déplacer un point, `Ctrl`+glisser.
- **Un objet dans un groupe fermé** n'est pas concerné : on ouvre d'abord le groupe, comme pour le sélectionner seul.

## 9. Vérifications

- Unitaires, `tests/unit/path-points.test.js`, 6 tests de plus :
  - droite, quadratique et arc rendus cubiques ;
  - point pris qui suit le glisser, extrémités fixes ;
  - poids des poignées ;
  - bouts du segment.
- Unitaire, `tests/unit/history-v5.test.js` : noms des étapes de nœuds, et d'une forme convertie puis courbée.
- Bout en bout, `tests/e2e/plume-illustrator.spec.js`, 11 tests :
  - plume choisie sur un chemin ;
  - curseurs avec et sans `Alt` ;
  - ajout et suppression, puis annulation qui garde la plume ;
  - courbure en une étape ;
  - `Échap` pendant la courbure ;
  - nouveau tracé et `Échap` ;
  - extrémité prolongée ;
  - chemin supprimé point par point ;
  - points d'un rectangle sans conversion ;
  - rectangle courbé en une étape, annulé puis rétabli ;
  - polygone et ellipse.
