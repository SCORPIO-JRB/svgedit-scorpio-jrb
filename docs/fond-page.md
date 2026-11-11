# Le fond de la page, sur le modèle de Figma

Branche `fond-page`, depuis `panneau-texte`. Retour : « la couleur fill document ne semble pas fonctionner, le canevas reste blanc ».

## 1. La cause

Sans sélection, l'inspecteur montrait Apparence, Remplissage et Contour sous le titre « Document ». Ces champs ne réglaient pas le document : ils donnaient la peinture de la prochaine forme dessinée. La page n'avait aucun réglage de couleur ; seule la préférence « couleur d'arrière-plan » de l'éditeur, hors du fichier, la colorait.

## 2. Avant, après

| Sans sélection | Avant | Après |
| --- | --- | --- |
| Outil de sélection | Apparence, Remplissage, Contour (prochaine forme), Calque, Document, Cadres d'export | Calque, Document **avec son Fond**, Cadres d'export. Comme la section Page de Figma. |
| Outil de dessin (rectangle, ellipse, plume, texte…) | Les mêmes | Apparence, Remplissage et Contour reviennent : ils donnent la peinture de la prochaine forme, comme avant. |

## 3. Le champ Fond

Dans la section Document, sous L et H :

- **+** donne à la page un fond blanc (option `pageBackground`, `#ffffff` par défaut).
- **La couleur** se tape en hexadécimal, avec son opacité, ou se choisit dans la fenêtre couleur, intitulée « Fond ».
  - La fenêtre ne propose que des couleurs unies, comme Figma pour une page.
  - Pendant un glisser, la page montre la couleur ; le geste fait une seule étape d'annulation.
- **−** retire le fond.

Chaque réglage est une étape d'annulation : « Ajouter un fond à la page », « Modifier le fond de la page », « Retirer le fond de la page ».

## 4. Le SVG écrit

```xml
<g class="layer" se:locked="true">
  <title>Fond</title>
  <rect id="svg_1" data-se-background="true" x="0" y="0" width="640" height="480" fill="#160f23"/>
</g>
```

- **Un rectangle dans le fichier.** La page a sa couleur dans tout lecteur, et dans le PDF et les images exportés. C'est déjà ainsi que le modèle « Synoptique 1 920 × 1 080 » pose son fond Nuit 70 ; son rectangle est maintenant marqué, et le champ le montre.
- **Un calque verrouillé, sous les autres.** Un clic ou un rectangle de sélection sur la page ne le prend pas. Le calque courant reste celui où l'on dessine. Le calque « Fond » paraît dans l'onglet Calques.
- **La taille de la page.** Le rectangle part de l'origine de la page (celle du viewBox d'un fichier ouvert, lot V5). Il suit L et H dans la même étape d'annulation.
- **Ajuster au contenu** ne compte pas le fond comme du contenu, puis lui donne la nouvelle taille.
- **Retiré**, le fond emporte son calque s'il n'y a rien d'autre dedans.

## 5. Code

| Fichier | Rôle |
| --- | --- |
| `packages/svgcanvas/core/page-background.js` | `getPageBackground`, `setPageBackground`, l'aperçu (`previewPageBackground`, `cancelPageBackgroundPreview`), `fitPageBackground` |
| `packages/svgcanvas/core/elem-get-set.js` | `setResolution` : le fond suit la taille de la page |
| `packages/svgcanvas/core/utilities.js` | `getVisibleElements` : le fond n'est pas du contenu |
| `src/editor/panels/Inspector.js` | Le champ Fond de la section Document ; Apparence, Remplissage et Contour sans sélection, avec un outil de dessin seulement (`UNPAINTED_MODES`) |
| `src/editor/panels/PaintPicker.js` | Un champ peut nommer la fenêtre (`data-title`) et n'accepter que des couleurs unies (`data-solid`) |
| `src/editor/templates.js` | Le fond du modèle Synoptique est marqué |
| `src/editor/ConfigObj.js` | Option `pageBackground` |
| `src/editor/history-steps.js`, `locale/lang.*.js` | Noms des étapes et du champ |

## 6. Vérifications

- **Tests unitaires** : `tests/unit/fond-page.test.js`, 8 tests (création, couleur et opacité, retrait, aperçu, taille de la page, contenu, fichier, champ).
- **Tests E2E** : `tests/e2e/fond-page.spec.js`, 5 tests (sections sans sélection, +, couleur tapée, −, clic sur la page, L, Ajuster au contenu, fenêtre couleur, modèle Synoptique).
- **Tests mis à jour**, qui décrivaient Remplissage et Contour sans sélection :
  - `layout-v3` : sans sélection, les sections sont Calque, Document et Cadres d'export ;
  - `couleurs-v4` : après une annulation, l'objet est resélectionné pour rouvrir la fenêtre couleur.
- **Suite E2E complète** (Playwright, Chromium) : 663 sur 665 au premier passage. Les 2 échecs sont les deux tests ci-dessus, qui passent depuis leur mise à jour.
