# Coins arrondis

Branche `coins-arrondis`, depuis `master`. Référence : Illustrator, l'outil Rectangle arrondi et les « widgets d'angle » (*Live Corners*) qu'on tire à l'intérieur d'une forme pour en arrondir les coins.

SVG-Edit savait déjà donner un rayon à un rectangle, par le champ « rayon des coins » du panneau. Il manquait :

- de le faire à la main sur la forme ;
- de dessiner directement un rectangle arrondi ;
- d'arrondir un seul coin, ou les angles d'un polygone ou d'un chemin.

## 1. Les poignées d'angle

Une poignée d'angle est un petit anneau bleu avec un point au centre, placé à l'intérieur d'un coin. Elle grossit au survol et pendant qu'on la tire. On la distingue ainsi des poignées carrées de redimensionnement et des disques des nœuds.

Elle est placée au centre de l'arc du coin. Pour un coin vif ou peu arrondi, elle reste à 28 px du sommet, sur la bissectrice, soit environ 20 px de chaque côté d'un angle droit. On l'attrape ainsi sans toucher la poignée de redimensionnement, et à 12 px du coin on attrape toujours l'objet pour le déplacer.

Pendant qu'on la tire, l'étiquette sous la sélection donne le rayon : `R 12`, dans l'unité du document. `Échap` remet tout comme avant. Chaque glisser fait une seule étape d'annulation.

| Forme sélectionnée | Poignées | Glisser | `Alt`+glisser |
| --- | --- | --- | --- |
| Rectangle | Une dans chaque coin | Change le rayon des quatre coins (`rx`, `ry`). Le rectangle reste un `<rect>`. | N'arrondit que ce coin. Le rectangle devient un chemin. |
| Polygone, polyligne | Une à chaque angle | Arrondit tous les angles. La forme devient un chemin. | N'arrondit que cet angle. La forme devient un chemin. |
| Chemin | Une à chaque coin déjà arrondi | Donne le même rayon à tous ses coins arrondis. | Ne change que ce coin. |
| Chemin en édition des nœuds | Une à chaque angle des nœuds sélectionnés, arrondi ou non | Arrondit tous ces angles. | N'arrondit que cet angle. |

Les poignées ne s'affichent pas :

- sur une sélection multiple ;
- sur un rectangle de moins de 56 px de côté à l'écran ;
- sur un angle dont un côté fait moins de 40 px à l'écran ;
- sur un connecteur ;
- sur un objet verrouillé ;
- pendant un redimensionnement ou une rotation.

Le rayon s'arrondit à l'unité, ou au dixième à partir d'un zoom de 200 %.

## 2. Rectangle

SVG ne connaît qu'un rayon pour les quatre coins d'un `<rect>`. Tirer une poignée change donc `rx` et `ry` ensemble, et le rectangle reste un rectangle : ses champs et sa conversion en chemin restent ceux d'avant.

Le rayon s'arrête à la moitié du plus petit côté, comme dans le dessin SVG. Un rayon ramené à 0 retire `rx` et `ry` s'ils n'étaient pas là au départ. Un rectangle aux coins elliptiques (`rx` différent de `ry`) part de son plus petit rayon et finit avec un rayon unique. L'étape s'appelle « Modifier le rayon », comme celle du champ.

Le rectangle peut être tourné ou dans un groupe transformé : le calcul se fait dans son propre repère.

## 3. Un seul coin

`Alt`+glisser une poignée de rectangle n'arrondit que ce coin. Le rectangle devient un chemin avec ses quatre coins : les autres gardent leur rayon et le coin tiré prend le sien. Il est écrit avec des arcs de cercle (`A`) exacts, et non avec des courbes approchées. La conversion n'a lieu qu'au premier mouvement : un simple `Alt`+clic ne change rien.

Le chemin garde tout ce qu'avait le rectangle : identifiant, style, classes, titre, transformation. La conversion et l'arrondi font une seule étape, « Arrondir les coins ». Une annulation rend le rectangle d'origine.

Un polygone ou une polyligne devient aussi un chemin au premier arrondi.

## 4. Chemins

**Lecture des coins.** Un coin d'un chemin est un sommet entre deux segments droits. Un coin déjà arrondi est un arc de cercle tangent aux deux droites qui l'entourent. Il est replié en son sommet, avec son rayon : on peut l'arrondir encore, le réduire ou le rendre vif. Un arc qui ne suit pas ses deux droites est laissé tel quel, comme :

- un demi-cercle ;
- un arc elliptique ;
- un arc entre des courbes.

**Arrondi.** Arrondir un sommet coupe ses deux côtés à la distance `r / tan(θ/2)` et met entre les coupes un arc de rayon `r`, θ étant l'angle du coin. Chaque coupe prend au plus ce que l'autre bout du côté lui laisse, et au moins la moitié du côté. À côté d'un sommet vif, elle peut prendre le côté entier. Deux arrondis voisins de rayons différents restent donc tels qu'ils étaient.

Le rayon maximal d'un coin dépend ainsi de ses voisins. Tiré au-delà, il s'arrête et l'étiquette donne le rayon obtenu.

**Hors édition des nœuds.** Un chemin sélectionné ne montre que ses coins arrondis : un chemin ordinaire ne se couvre pas de poignées. C'est ce qui permet de reprendre le rayon d'un rectangle devenu chemin ou d'un polygone arrondi.

**En édition des nœuds.** Les angles des nœuds sélectionnés montrent leur poignée, vifs ou arrondis. Après l'arrondi, le coin reste sélectionné par les deux extrémités de son arc, et sa poignée reste là. Ramené à 0, le coin redevient un seul nœud.

Les arcs créés ont `large-arc` à 0 et un `sweep` qui suit le sens du virage. Un côté entièrement pris par deux arrondis devient une droite de longueur nulle : elle est gardée pour que le coin se relise. On le voit en édition des nœuds, avec deux nœuds au même endroit.

## 5. Outil Rectangle : rayon mémorisé et flèches

Il n'y a pas d'outil « Rectangle arrondi » à part : une nouvelle commande changerait l'inventaire du registre (lot S0). L'outil Rectangle, et l'outil Carré, dessinent avec **le dernier rayon donné à un rectangle**, par :

- le champ « rayon des coins » ;
- une poignée d'angle ;
- les flèches pendant le tracé.

Pendant le tracé, comme dans Illustrator :

| Touche | Effet |
| --- | --- |
| `↑` / `↓` | Rayon plus ou moins 1 (`Maj` : 10) |
| `←` | Coins vifs (rayon 0) |
| `→` | Rayon maximal : la moitié du plus petit côté à ce moment |

L'étiquette montre le rayon. Le nouveau rayon est retenu pour les rectangles suivants. En fin de tracé, le rayon est ramené à ce que le rectangle peut prendre : un petit rectangle dessiné avec un grand rayon reçoit la moitié de son plus petit côté. Le rayon retenu n'est gardé que le temps de la session.

## 6. Code

| Fichier | Rôle |
| --- | --- |
| `packages/svgcanvas/core/corners.js` | Géométrie sans DOM : repère d'un coin (bissectrice, demi-angle), coins d'un rectangle, squelette d'un chemin (arrondis repliés en sommets) et arrondi d'un squelette. |
| `packages/svgcanvas/core/corner-actions.js` | Poignées : quel objet les montre, où elles vont, glisser, `Échap`, étape d'annulation, conversion en chemin, rayon mémorisé et flèches du tracé. |
| `packages/svgcanvas/core/select.js` | Calque des poignées (`#selectorCornerGrips`) et étiquette du rayon (`showRadius`). Les poignées suivent la sélection, son cadre et le glisser. |
| `packages/svgcanvas/core/event.js` | Clic sur une poignée, glisser, relâchement, `Échap` ; rayon des nouveaux rectangles. |
| `packages/svgcanvas/core/path-method.js` | En édition des nœuds, les poignées suivent la sélection et le déplacement des nœuds. |
| `packages/svgcanvas/core/elem-get-set.js` | Le champ « rayon des coins » donne aussi le rayon des rectangles suivants. |
| `src/editor/Editor.js` | Flèches pendant le tracé d'un rectangle (`drawingRadiusKey`), avant le registre : aucune commande nouvelle. |
| `src/editor/history-steps.js`, `locale/lang.*.js` | Étape « Arrondir les coins » (`round_corners`). |
| `src/editor/svgedit.css` | Anneau, point et survol des poignées, aux couleurs des jetons. |

## 7. Limites

- Un coin arrondi d'un chemin est figé dans le tracé : la poignée le retrouve, mais une transformation non uniforme (étirement d'un côté) en fait un arc elliptique, qu'elle ne reconnaît plus.
- Pas de coins « inversés » ni « chanfreinés » (les autres styles d'angle d'Illustrator), ni de fenêtre « Angles » au double-clic.
- Seuls les angles entre deux segments droits s'arrondissent : pas entre une droite et une courbe.
- Un arc qui commence directement après un autre arc, sans droite entre eux, n'est pas reconnu comme arrondi. C'est le cas de certains SVG importés.
- Le rayon mémorisé n'est pas enregistré dans les préférences.

## 8. Vérifications

- Unitaires : `tests/unit/corners.test.js`, 19 tests (repère, rectangle, squelettes, polygone, coins voisins).
- Bout en bout : `tests/e2e/coins-arrondis.spec.js`, 8 tests (rectangle, limite et `Échap`, absence de poignées, `Alt` sur un coin, polygone, édition des nœuds, flèches du tracé, champ du rayon).
