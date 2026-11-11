# Valeurs glissées, sur le modèle de Figma

Branche `scrub-valeurs`, depuis `panneau-proprietes`. Référence : le champ « Dimensions » de Figma (capture fournie). On glisse son icône vers la gauche ou la droite et la valeur suit, le pointeur en ↔ ; au survol, une infobulle nomme le champ.

## 1. Le geste

| Geste | Effet |
| --- | --- |
| Survol de l'icône ou de la lettre | Pointeur ↔ ; après 500 ms, l'infobulle de l'éditeur donne le nom du champ (« Largeur du rectangle »). |
| Glisser vers la droite / la gauche | La valeur augmente / diminue de 1 par pixel, du pas du champ quand il est inférieur à 1 (interligne : 0,1). Le dessin suit à chaque image. |
| `Maj` pendant le glisser | 10 fois plus vite. |
| Butée | La valeur s'arrête aux bornes du champ (opacité 0–100, épaisseur 0–99…) et repart dès que le pointeur revient. |
| `Échap` pendant le glisser | La valeur d'avant revient ; l'objet reste sélectionné ; rien n'entre dans l'historique. Aucun raccourci de l'éditeur ne part pendant le glisser. |
| Clic sans bouger (moins de 3 px) | Le curseur va dans le champ, la valeur sélectionnée, pour la taper. |

- **Une étape d'annulation.** Tout le glisser est une seule étape, nommée comme la même valeur tapée au clavier. Un polygone dont on glisse le rayon des coins devient un chemin dès le premier pixel, et `Ctrl`+`Z` rend le polygone.
- **« Mixte ».** Un champ qui montre « Mixte » (deux objets d'opacités différentes) ajoute le même écart à chaque objet : 50 % et 80 % glissés de 10 px donnent 60 % et 90 %. Le champ reste « Mixte ».
- **Valeur précise.** Une valeur affichée arrondie part de sa valeur exacte (12,345 glissé de 1 donne 13,35).

## 2. Les champs concernés

Tous les champs numériques du panneau qui ont une icône ou une lettre :

| Section | Champs |
| --- | --- |
| Position | X, Y ; angle de rotation |
| Dimensions | L, H d'une sélection, d'un rectangle, d'une image ; rayon d'un cercle, rayons d'une ellipse ; centre ; extrémités d'une ligne ; outil Échelle (facteur, L, H) ; branches, rayon, décalage et côtés d'une étoile ou d'un polygone |
| Apparence | Opacité, rayon des coins, flou |
| Contour | Épaisseur |
| Texte | Taille, espacement des lettres et des mots, interligne, longueur |
| Nœuds | X, Y du nœud |
| Document | L, H de la page |
| Calque | Opacité |
| Cadre d'export | X, Y, L, H |

Les mêmes champs dans la barre contextuelle glissent aussi. L'opacité d'une peinture (« 100 % » après la couleur) et les champs de la fenêtre couleur n'ont pas d'icône : on les tape.

## 3. Infobulle

Le nom d'un champ passait par l'attribut `title` natif, qui ne suivait ni le thème ni le délai des autres infobulles. Il passe maintenant par l'infobulle de l'éditeur (`se-tooltip`), comme les boutons : `adoptTitle` garde la clé dans `seTitle`, retire l'attribut et nomme le champ pour les lecteurs d'écran (`aria-label`).

## 4. Code

| Fichier | Rôle |
| --- | --- |
| `src/editor/components/scrub.js` | `attachScrub` : le geste (seuil, vitesse, `Maj`, bornes, `Échap`, clic), une application par image ; `scrubInput` pour un champ simple ; événements `se-scrub-start` et `se-scrub-end` |
| `src/editor/components/seSpinInput.js` | L'icône et la lettre glissent la valeur ; « Mixte » envoie un écart (`relative`) ; l'infobulle de l'éditeur à la place du `title` |
| `packages/svgcanvas/core/history.js` | `beginGroup`, `endGroup`, `cancelGroup` : les étapes d'un geste qui dure, en une seule, ou défaites sans entrer dans l'historique |
| `src/editor/EditorStartup.js` | Ouvre le groupe au début du glisser, le ferme ou l'annule à la fin, rend la sélection après `Échap` |
| `src/editor/panels/Inspector.js`, `src/editor/frames.js` | Lettres des champs du document, du calque et du cadre |
| `src/editor/panels/ContextBar.js` | Le jumeau d'un champ reprend son nom par `controlTitle` |
| `src/editor/svgedit.css`, `src/editor/layout.css` | ↔ partout pendant le glisser, poignées des champs simples |

## 5. Vérifications

- Tests unitaires : `tests/unit/scrub.test.js` (17 tests : calculs, geste, `Échap`, clic, champ simple, groupe de l'historique, champ numérique).
- Tests E2E : `tests/e2e/valeurs-glissees.spec.js` (7 tests : infobulle et pointeur, glisser en une étape, `Maj` et bornes, `Échap`, clic, « Mixte », largeur de la page).
