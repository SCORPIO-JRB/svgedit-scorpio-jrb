# Refonte de la sélection — lot M1 « Corrections rapides »

Branche `refonte-selection-m1`, partie de `refonte-canevas-u0-u1`. M1 est le premier lot du plan décrit dans l'onglet « Sélection et transformations » du document de refonte. Il corrige des commandes qui existent déjà, sans changer la disposition de l'interface. Le cadre commun et le redimensionnement d'une multi-sélection viendront avec M2.

Pour un objet seul, la sortie SVG reste identique à celle de U1.

## 1. Ce qui change pour l'utilisateur

| Commande | Avant | Maintenant |
| --- | --- | --- |
| Symétrie d'une multi-sélection | chaque objet retourné sur lui-même ; boutons masqués | l'ensemble retourné autour du centre de la boîte commune, positions relatives comprises ; boutons dans le panneau de multi-sélection |
| Maj+H, Maj+V | sans effet | symétrie horizontale, verticale (objet seul ou sélection) |
| Aligner sur « le plus grand », « le plus petit » | comparait la largeur seule, même pour un alignement vertical | compare la surface |
| Distribuer | objets triés par bord droit (ou bas) : l'objet le plus à gauche pouvait bouger et la série dépasser l'étendue de départ | objets triés par bord gauche (ou haut) : le premier reste en place et la série garde son étendue |
| Alt+glisser | deux étapes d'annulation : la copie, puis le déplacement | une seule étape |
| Échap pendant un glisser | sans effet, le geste continuait | annule le geste en cours |

Échap annule ces gestes :
- le déplacement, d'un objet ou d'une sélection ;
- la duplication par Alt+glisser, dont la copie disparaît ;
- le redimensionnement ;
- la rotation ;
- le rectangle de sélection, dont la sélection revient à son état de départ.

Rien n'entre dans l'historique et le relâchement du bouton est ignoré. Une fois le geste annulé, Échap reprend son rôle habituel : il remonte d'un niveau.

## 2. Ce qui ne change pas

### Sortie SVG

La sortie de M1 a été comparée à celle de U1 (`a42f653`), compilée séparément avec son propre cœur `svgcanvas` :

- aller-retour import puis export de tous les SVG du dépôt : 15 sur 15 identiques ;
- 22 scénarios sur 24 identiques à l'octet près, dont :
  - la symétrie d'un objet seul : rectangle, rectangle tourné, texte, groupe, chemin ;
  - l'alignement d'un objet seul sur la page, et d'une sélection sur la sélection ;
  - la distribution, le clonage et les annulations ;
  - le glisser de toute la sélection et Alt+glisser, à la souris.

Seuls deux scénarios diffèrent, et ce sont les changements voulus :
- la symétrie d'une multi-sélection ;
- l'alignement sur « le plus grand » quand l'objet le plus large n'a pas la plus grande surface.

### Correction de la comparaison de U1

La comparaison publiée pour U1 avait un défaut. Le build de référence partageait le `node_modules` du dépôt, et le paquet `@svgedit/svgcanvas`, lié par l'espace de travail npm, pointait vers le cœur en cours de modification. Seul l'éditeur était donc comparé, pas le moteur qui produit le SVG.

Elle a été refaite pendant M1, avec un cœur propre à chaque build, entre `phase-0-securite` (`c51eebf`) et U1 (`a42f653`) :
- aller-retour : 15 sur 15 identiques ;
- 23 scénarios sur 24 identiques.

Le seul scénario qui diffère est Alt+glisser, un changement voulu de U1. La phase 0 déplaçait l'objet au lieu de le dupliquer. La conclusion publiée pour U1 tient donc.

### API des extensions

- `cloneSelectedElements(x, y, options)` renvoie maintenant la commande d'insertion. Avec `{ addToHistory: false }`, l'appelant l'enregistre lui-même. Sans option, le comportement est inchangé.
- Une nouvelle méthode, `svgCanvas.cancelGesture()`, annule le geste en cours et renvoie `true` si un geste était en cours.
- Un nouvel attribut, `shortcut-hint-only`, s'applique à `se-button` : le raccourci est affiché dans l'info-bulle sans être lié. Les boutons de symétrie de la multi-sélection l'utilisent, car Maj+H et Maj+V sont déjà liés par ceux de l'objet seul.

### Performances

`npm run bench` respecte tous les budgets. À 2 000 objets, les mesures restent dans le bruit de celles de U1 : par exemple, « tout sélectionner » prend entre 103 et 143 ms selon les passages, contre 110 ms pour U1.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m1
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dessinez deux formes différentes côte à côte. Sélectionnez-les, puis appuyez sur Maj+H : elles échangent leurs côtés et chacune est retournée. Ctrl+Z les remet en place en une fois.
2. Alt+glissez un objet, puis appuyez une fois sur Ctrl+Z : la copie disparaît, l'original n'a pas bougé.
3. Glissez un objet et appuyez sur Échap avant de relâcher : il revient à sa place, et Ctrl+Z n'a rien à annuler.
4. Même essai avec une poignée de redimensionnement, puis avec la poignée de rotation.
5. Dessinez un rectangle large et plat, et un carré plus grand en surface. Sélectionnez-les et choisissez « Aligner par rapport à : le plus grand objet », puis « Aligner en haut » : le rectangle s'aligne sur le carré.

## 4. Tests ajoutés

- **`tests/unit/selection-m1.test.js` (9 tests).** Symétrie autour du centre commun et en une étape, symétrie d'un objet seul inchangée, alignement par surface, distribution par bord gauche et haut, clonage sans historique. Sept de ces tests échouent sur le code de U1.
- **`tests/e2e/selection-m1.spec.js` (12 tests, vrais gestes à la souris).** Maj+H, Maj+V, boutons de la multi-sélection, Alt+glisser en une étape, et Échap pendant :
  - un déplacement simple ;
  - un déplacement multiple ;
  - un Alt+glisser ;
  - un redimensionnement ;
  - une rotation ;
  - un rectangle de sélection.

Bilan : lint propre, 649 tests unitaires et 138 tests E2E verts.

## 5. Limites connues et suite

- **Échap pendant un tracé** (rectangle, ellipse, chemin) reste sans effet tant que le bouton est enfoncé, comme avant.
- **Symétrie collective.** La boîte commune suppose que les objets ont le même parent. C'est toujours le cas d'une sélection faite dans l'éditeur, dans le calque courant ou dans le groupe ouvert.
- **Hors M1, selon le plan :**
  - le champ d'angle et la rotation d'une multi-sélection (M3) ;
  - l'alignement d'un objet seul sur son groupe parent (M4) ;
  - l'espacement imposé et « Ranger » (M9).
- **Lot suivant : M2.** Il apporte le cadre commun et le redimensionnement d'une multi-sélection.
