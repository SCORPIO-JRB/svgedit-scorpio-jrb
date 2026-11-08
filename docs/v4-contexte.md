# Plan v2 — lot V4 « Édition contextuelle »

Branche `v4-contexte`, partie de `master` après la fusion de V0 à V3 (n° 3). V4 met l'édition près de l'objet : survol et rectangle de sélection géométriques, barre contextuelle, styles de texte, menu selon la cible et palette de commandes. Il est construit sur la disposition « canevas » de V3 ; l'ancienne disposition (`layout: 'classic'`) n'a ni barre ni palette.

## 1. Survol et rectangle de sélection (4.3)

- **Survol.** Le contour réel d'une forme ou d'un chemin est copié dans la couche d'interaction, dans la matrice de l'objet, à 1,5 px à l'écran et sans remplissage. Un texte est souligné ligne par ligne, à sa ligne de base. Un groupe fermé, un symbole ou une image gardent le cadre de leur sélection (M5). Avec Ctrl, le contour désigne l'objet le plus profond, celui que prendra le Ctrl+clic.
- **Rectangle de sélection.** Les boîtes trient ; un objet que le rectangle ne couvre qu'en partie n'est pris que si son dessin le touche : le coin vide de la boîte d'une ellipse tournée, le creux d'un chemin ou l'espace entre les enfants d'un groupe ne le prennent plus. Le trait compte, le remplissage aussi (un rectangle tracé à l'intérieur d'une forme pleine la prend).
- Le module `packages/svgcanvas/core/outline.js` porte les deux.

Banc, à 2 000 objets : survol 0,3 ms (budget 4) ; rectangle arrêté au milieu du dessin, objets au bord testés sur leur géométrie, 19 ms (nouvelle mesure `marqueeEdge`, budget 100).

## 2. Barre contextuelle (4.4)

| Sélection | Barre |
| --- | --- |
| Texte | Style ▾, couleur, gras, italique, souligné, lien (s'il s'applique), ancrage début, milieu, fin, Modifier le texte |
| Forme | remplissage (sauf ligne), contour et épaisseur, rayon des coins ou nombre de branches ou de côtés, symétrie, Convertir en chemin |
| Chemin | Modifier les nœuds, remplissage, contour et épaisseur, symétrie ; en édition des nœuds : lien des poignées, type de segment, ajouter, supprimer, ouvrir ou fermer, sous-chemin |
| Groupe | Ouvrir le groupe, Dégrouper, Sélectionner les enfants, remplissage et contour, Masquer |
| Symbole | Sélectionner les mêmes, Remplacer, Dissocier |
| Image | Sélectionner les mêmes, Remplacer |
| Multi-sélection | Aligner et distribuer ▾, Grouper, symétrie, remplissage et contour (« Mixte » s'ils diffèrent) |
| Connecteur | contour et épaisseur, flèches de début et de fin |

Chaque barre finit par « … », qui ouvre le menu contextuel de la cible. Aucune barre ne montre X, Y, L, H ni l'angle : les valeurs exactes restent dans l'inspecteur.

**Mêmes composants, mêmes commandes.** Une propriété présente aussi dans l'inspecteur y est le même composant (`se-colorpicker`, `se-spin-input`), dont les changements vont au contrôle de l'inspecteur : son gestionnaire les applique, avec ses contrôles et en une étape d'annulation. Un verbe clique le bouton de l'inspecteur qu'il reflète, ou lance une commande du registre ; il montre le même raccourci. « Aligner et distribuer ▾ » prête à la barre le panneau d'alignement de l'inspecteur lui-même. Les nouvelles actions sont des commandes du registre : `open_group`, `select_group_children`, `hide_selection`, `select_same`, `replace_symbol`, `replace_image`, `edit_text`, `edit_nodes`.

**Placement.** Centrée au-dessus du cadre, 12 px au-delà de la zone de rotation, soit 32 px au-dessus du cadre (la maquette en montrait 12) ; en dessous faute de place sous le haut du canevas ; contre le bord de la vue qui masque le moins d'objets quand la sélection est plus haute que la vue ; décalée pour ne jamais passer sous la barre d'outils, le groupe de vue ni le panneau en tiroir, à 8 px.

**Gestes.** Masquée dès qu'un bouton est enfoncé sur le canevas (glisser, redimensionner, pivoter, tracer, déplacer la vue) et pendant un zoom ; de retour 150 ms après la fin ; aucune position n'est calculée pendant un geste.

**Ce qu'elle couvre.** Ses parties vides laissent passer le clic, et la barre s'estompe quand le pointeur y passe au-dessus d'un objet. Ses boutons restent actifs : une barre qui disparaîtrait sous le pointeur ne pourrait plus servir.

**Clavier.** F6 et Maj+F6 font passer le focus du canevas à la barre, à l'inspecteur et à la barre d'outils, même depuis un champ ; les flèches vont d'un contrôle à l'autre de la barre.

**Préférence.** « Barre contextuelle », dans le menu du zoom, la désactive (préférence `context_bar`) ; ses actions restent dans le menu contextuel, l'inspecteur, la palette et au clavier.

Corrigés au passage : « Remplacer » un symbole est une seule étape d'annulation (`replaceUseSymbol`) ; dégrouper ou dissocier un symbole aussi, au lieu de deux ; la conversion d'un `<use>` lit le symbole qu'il montre au moment même, et non celui qu'il montrait avant une annulation.

## 3. Styles de texte (N10)

« Style ▾ », première entrée de la barre d'un texte, ouvre une fenêtre à deux onglets :
- **Thème** : onze styles, chacun montré dans sa police — titres de page, de section et de carte, sous-titre, nom d'équipement, libellé, petit libellé, valeurs essentielle, de synthèse, mesurée et de détail ;
- **Personnalisé** : police, graisse, taille et interlettrage ; la taille et l'interlettrage sont les champs de l'inspecteur.

Un style n'écrit que `font-family`, `font-size`, `font-weight` et `fill`, en une étape d'annulation (`changeSelectedAttributes`, nouveau dans le canevas). Il est reconnu par ses valeurs, écrites en attributs ou par une feuille de style : il n'ajoute ni classe ni `data-*` au fichier.

La liste vient de la feuille de style du synoptique de référence du corpus (`tests/fixtures/import/scorpio/synoptique-chaufferie.svg`) : la GED ne contient pas encore de standard des synoptiques. Elle est à valider ; l'option `textStyles` permet à l'hôte de fournir la sienne.

## 4. Menu selon la cible et palette

- **Menu contextuel.** Il commence par les verbes de sa cible : Modifier le texte, Convertir en chemin, Modifier les nœuds, Ouvrir le groupe et Sélectionner les enfants, Sélectionner les mêmes, Remplacer et Dissocier, les huit alignements et distributions d'une multi-sélection, Masquer. Suivent les entrées de tout objet (couper, copier, ordre…), puis celles des extensions (`contextmenu.add`, inchangé). Maj+F10 l'ouvre au clavier, le focus sur la première entrée ; flèches, Début, Fin, Entrée et Échap. Échap le ferme aussi quand il a été ouvert à la souris, sans toucher à la sélection.
- **Palette.** Ctrl+K cherche une action par son nom, sans tenir compte des accents ni de la casse : début du nom, puis début d'un mot, puis n'importe où. Une action qui ne s'applique pas est grisée, après les autres. `?` liste les raccourcis. Les deux lisent le registre : chaque bouton, entrée de menu et raccourci de l'éditeur, avec le raccourci qui l'exécute réellement.

## 5. Critères de passage

| Critère | État |
| --- | --- |
| 4.3 : pas de contour depuis le coin vide de la boîte d'une ellipse tournée ; survol sous 4 ms à 2 000 objets | tenu : test E2E ; 0,3 ms au banc |
| 4.3 : rectangle qui ne touche que le coin de la boîte d'une ellipse ; 100 ms par mouvement à 2 000 objets | tenu : test E2E ; 19 ms au banc |
| 4.4 : un test par ligne du tableau (sélection, commandes affichées, exécution, SVG et annulation) | tenu : huit tests, dont le connecteur et « … » |
| 4.4 : ni le cadre ni ses poignées recouverts, 50 positions et 3 tailles de fenêtre | tenu : 150 placements, sans recouvrement ni passage sous les barres flottantes |
| 4.4 : apparition 150 ms après le relâchement, aucun calcul pendant un geste | tenu : mesuré entre 150 et 400 ms, compteur de placements inchangé pendant le glisser |
| 4.4 : F6 canevas → barre → inspecteur → barre d'outils | tenu |
| 4.4 : préférence qui désactive la barre, actions restant au menu et au clavier | tenu |
| Tâches de référence plus rapides qu'avant V3 | à mesurer : test utilisateur, section 6 |
| Ancienne disposition retirée | reportée après le test utilisateur, qui la prend pour référence |

## 6. Test utilisateur à mener

Cinq personnes qui font des synoptiques, chacune sur les deux dispositions, dans un ordre alterné : l'ancienne (`?layout=classic`, l'éditeur d'avant V3) et la nouvelle. Même fichier de départ, le synoptique de chaufferie du corpus ; chronomètre lancé à la consigne, arrêté quand le SVG est juste.

1. Donner au titre le style « Titre de page ».
2. Aligner en haut les trois tuiles de pompes, puis les répartir à égale distance.
3. Remplacer le symbole d'une pompe par une autre version du fichier.
4. Passer l'épaisseur d'une tuyauterie à 3 et sa couleur à `#F08A62`.
5. Grouper un équipement et son libellé, puis masquer le groupe.
6. Convertir un rectangle en chemin et supprimer un de ses nœuds.
7. Sélectionner au rectangle les seules vannes d'un circuit, sans les tuyauteries voisines.

Relever pour chaque tâche le temps, les erreurs et les hésitations de plus de cinq secondes. Le critère est tenu si la médiane des cinq personnes est plus courte sur la nouvelle disposition pour chaque tâche. Alors seulement l'ancienne disposition peut être retirée.

## 7. Vérifications

Sous Chromium :
- lint vert, 882 tests unitaires réussis ;
- E2E en disposition canevas : 427 réussis, dont les 33 de V4 (`tests/e2e/contexte-v4.spec.js`) ;
- E2E en disposition classique, sans les tests propres à V3 et V4 : 364 réussis ;
- sortie comparée à `master`, les deux éditeurs construits par `build-reference.mjs` : 21 allers-retours sur 21 et 73 scénarios sur 73 identiques.

Banc à 2 000 objets : le survol et les deux rectangles de sélection tiennent leurs budgets. « Tout sélectionner » les dépasse d'un passage à l'autre, comme depuis V2 ; mesurée en alternance dans une même page, la barre y ajoute environ 11 ms (65 ms contre 54 ms en médiane), le temps de lire la mise en page pour la placer. Elle la lit à l'image suivante, une seule fois.

Firefox tourne en CI. Sous Firefox, `getBoundingClientRect()` d'un `<use>` compte la zone de son symbole transformée une seconde fois par sa viewBox, arrondit les boîtes au pixel et élargit celle d'un chemin à arcs : les tests concernés mesurent par `getBBox()` et `getScreenCTM()`.

## 8. Hors V4

Le verrouillage d'un objet (D4) ; la prévisualisation (V6) ; les cadres d'export (V5) ; le nom lisible des objets dans l'arbre ; le retrait de l'ancienne disposition (après le test utilisateur).
