# Poignées d'un texte et œil de l'Apparence, sur le modèle de Figma

Branche `texte-masquer`, depuis `master` (après le lot Fond). Deux retours d'essai :

- « les options de resizing d'un texte ne fonctionnent pas » ;
- « Hide sélection sur une forme est bugué, il ne réapparaît pas ».

## 1. Redimensionner un texte

### La cause

Les boutons Largeur automatique, Hauteur automatique et Taille fixe écrivaient bien `se:width` et `se:height`. Mais les poignées ne suivaient pas ces modes :

| Poignée | Avant |
| --- | --- |
| Gauche, droite | Donnaient la largeur (lot Texte multiligne). |
| Haut, bas | Déplaçaient le texte au lieu de régler sa hauteur. |
| Coins | Changeaient la taille de police (20 → 9,8 pour un geste de 100 px). |

Une taille fixe ne se réglait donc qu'au champ H.

### Après, comme dans Figma

| Poignée | Effet | Mode qui en résulte |
| --- | --- | --- |
| Gauche, droite | La largeur ; les lignes se coupent dedans | Largeur auto → Hauteur auto ; Taille fixe le reste |
| Haut, bas | La hauteur de la boîte ; le bord opposé ne bouge pas | Taille fixe |
| Coins | La largeur et la hauteur | Taille fixe |

- **La police garde sa taille.** Pour agrandir un texte en proportion, il y a l'outil Échelle (`K`), comme dans Figma.
- **`Alt`** déplace aussi les bords opposés. **`Maj`** sur un coin garde les proportions de la boîte. **`Échap`** annule le geste.
- **Une étape d'annulation par geste**, nommée « Redimensionner un objet ». L'historique nommait « Déplacer » tout redimensionnement d'un objet seul par ses poignées, forme ou texte ; c'est corrigé aussi.
- **La poignée du haut** déplace le haut de la boîte : le `y` du texte, ligne de base de sa première ligne, descend ou monte avec lui (lot Texte, `docs/panneau-texte.md`).
- **Un texte tourné** garde sa rotation : la boîte grandit le long de ses propres axes.
- **Plusieurs objets** se mettent toujours à l'échelle ensemble, textes compris.

Un défaut voisin est corrigé au passage. La ligne qui relie la poignée de rotation se termine au milieu de la poignée du haut, et elle prenait le clic au centre de celle-ci : le geste déplaçait l'objet. Cela valait pour toutes les formes. La ligne ne prend plus le pointeur.

## 2. Masquer et réafficher

### La cause

L'œil de la section Apparence (et `Ctrl`+`Maj`+`H`) masquait la sélection, puis la vidait. Le panneau passait alors à la page, sans œil pour réafficher l'objet. Il ne revenait que par l'onglet Calques ou la commande « Tout afficher ».

La barre contextuelle avait en plus sa propre commande « Masquer », enregistrée sous le même nom que celle de `Ctrl`+`Maj`+`H`. Elle écrivait l'attribut autrement.

### Après, comme dans Figma

- **L'objet masqué reste sélectionné.** Son cadre reste à l'écran ; l'œil se barre et devient « Afficher ».
- **Le même œil le réaffiche.** `Ctrl`+`Maj`+`H` bascule de la même façon : la commande s'appelle maintenant « Afficher/Masquer la sélection ». Une sélection mêlée, en partie masquée, est masquée en entier.
- **La barre contextuelle d'un groupe** et le menu contextuel disent « Afficher » quand la sélection est masquée. Ils utilisent la commande unique ; le doublon de la barre est retiré.
- **L'onglet Calques** masque aussi sans désélectionner.
- **Un objet masqué** ne se prend toujours pas d'un clic sur le canevas, ni par un rectangle de sélection : on le retrouve dans l'onglet Calques.

## 3. Code

| Fichier | Rôle |
| --- | --- |
| `packages/svgcanvas/core/text-lines.js` | `startTextBoxResize`, `resizeTextBox` : la boîte d'un texte suit la poignée (remplacent `startTextWidthResize`, `resizeTextWidth`). Une largeur arrondie dans le fichier ne coupe plus la ligne qu'elle mesure (`WRAP_TOLERANCE`). |
| `packages/svgcanvas/core/event.js` | Toutes les poignées d'un texte seul règlent sa boîte. Le chemin qui changeait la taille de police est retiré. Un geste des poignées est une étape `size` (« Redimensionner »), plus `position`. |
| `packages/svgcanvas/core/multi-transform.js` | `commitSingleTextResize` et `singleTextPreview` retirés : ils ne servaient plus. |
| `packages/svgcanvas/core/select.js` | La ligne de la poignée de rotation ne prend plus le pointeur. |
| `packages/svgcanvas/core/structure.js` | `setElementsVisible` ne retire plus l'objet masqué de la sélection. |
| `src/editor/structure.js` | `hide_selection` bascule ; `isAllHidden`. |
| `src/editor/panels/Inspector.js` | L'œil de l'Apparence : icône barrée, « Afficher », `aria-pressed`. |
| `src/editor/panels/ContextBar.js` | Doublon de `hide_selection` retiré ; libellé « Masquer » ou « Afficher ». |
| `src/editor/locale/lang.*.js` | « Afficher/Masquer la sélection », « Afficher » dans la barre. |

## 4. Vérifications

- **Tests unitaires** : `tests/unit/texte-masquer.test.js`, 6 tests :
  - les poignées des côtés, du haut, du bas et des coins ;
  - `Alt` et `Maj` ;
  - la largeur arrondie ;
  - l'œil d'une sélection en partie masquée.
- **Tests E2E** : `tests/e2e/texte-masquer.spec.js`, 5 tests :
  - les poignées haut et bas, puis l'annulation ;
  - un côté, un coin, `Maj`, `Échap` ;
  - la poignée du haut d'un rectangle ;
  - l'œil de l'Apparence et `Ctrl`+`Maj`+`H` ;
  - la barre d'un groupe et l'onglet Calques.
- **Tests mis à jour** pour le nouveau comportement :
  - `gtb-v7` : après `Ctrl`+`Maj`+`H`, l'objet masqué reste sélectionné ;
  - `selection-m2` : le coin d'un texte lui donne une taille fixe, sa police ne change pas ;
  - `simplification-s0` : l'étape « redimensionné » mesure le cadre de la sélection, plus les glyphes, puisque la poignée d'un texte règle sa boîte.
- **Suite E2E complète** : 664 tests passent. Les 6 échecs restants étaient ces anciennes attentes ; une fois mises à jour, les spécifications touchées passent (83 tests).
