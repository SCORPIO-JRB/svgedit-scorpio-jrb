# Refonte de la sélection — lot M2 « Cadre commun et redimensionnement »

Branche `refonte-selection-m2`, partie de `refonte-selection-m1`. M2 est le cœur de la demande : une multi-sélection se redimensionne comme un seul objet, sans groupe ajouté au SVG.

Pour un objet seul, la sortie reste identique, à une exception voulue : un texte redimensionné reçoit une nouvelle taille de police au lieu d'une matrice qui le déforme.

## 1. Ce qui change pour l'utilisateur

### Le cadre commun

Dès deux objets sélectionnés, un cadre plein entoure l'ensemble et porte les huit poignées de redimensionnement. Chaque objet garde son contour fin, sans poignées. Un objet seul garde son cadre orienté et sa poignée de rotation.

La rotation d'une multi-sélection viendra avec M3 : en attendant, le cadre commun n'a pas de poignée de rotation.

### Le redimensionnement collectif

| Geste | Effet |
| --- | --- |
| Glisser une poignée | le côté ou le coin opposé reste en place |
| Maj | proportions de l'ensemble gardées |
| Alt | redimensionnement depuis le centre du cadre |
| Maj+Alt | les deux |
| Franchir le côté opposé | l'ensemble est retourné |
| Échap avant de relâcher | tout revient comme avant, sans étape d'historique |

Les positions relatives sont exactes : le centre de chaque objet suit la même transformation, à 0,01 unité près. Le geste entier forme une seule étape d'annulation. Annuler puis rétablir redonne le même SVG à l'octet près.

Ce qui s'affiche pendant le geste est le résultat. Les traits gardent leur épaisseur, le texte et les cercles ne se déforment pas, et les objets tournés ne sont pas cisaillés. Rien ne saute au relâchement.

### Règles par type d'élément

Chaque objet reçoit, au relâchement, le SVG qu'il aurait reçu s'il avait été redimensionné seul :

| Élément | Résultat |
| --- | --- |
| Rectangle, image, foreignObject, ellipse | géométrie réécrite (x, y, largeur, hauteur ou rayons) |
| Rectangle, ellipse, image ou foreignObject déjà tourné | **nouveau** : échelle appliquée dans ses propres axes, angle gardé, centre exact, sans cisaillement |
| Cercle | reste un cercle, de rayon multiplié par la plus petite échelle |
| Ligne, polyligne, polygone, chemin | points réécrits exactement, courbes et arcs compris |
| Texte | **nouveau** : taille de police multipliée par la plus petite échelle, sans matrice ; positions, décalages et tailles des tspan suivis ; une rotation est gardée |
| use, groupe | matrice gardée |

Les traits gardent leur épaisseur. Les attributs `data-*`, `se:` et `class` restent intacts.

La règle du texte vaut aussi pour un texte seul redimensionné par ses poignées : il grandit sans se déformer, et son aperçu montre déjà sa taille finale.

## 2. Ce qui ne change pas

### Sortie SVG

La comparaison passe désormais par deux scripts versés au dépôt, décrits en section 3. Résultats :

| Référence | Allers-retours | Scénarios identiques | Différences, toutes voulues |
| --- | --- | --- | --- |
| U1 (`a42f653`) | 15 sur 15 | 36 sur 39 | redimensionnement d'un texte seul ; symétrie d'une multi-sélection et alignement sur « le plus grand » (M1) |
| M1 (`1f4f362`) | 15 sur 15 | 38 sur 39 | redimensionnement d'un texte seul |

Pour chacun des huit types d'objet du dessin de test, trois gestes sur l'objet seul gardent leur sortie à l'octet près, sauf le redimensionnement du texte :
- la symétrie ;
- la rotation ;
- le redimensionnement par une poignée, à la souris.

Les huit types sont le rectangle, le rectangle tourné, l'ellipse, le cercle, le chemin, le texte, le groupe et la ligne.

Exemple pour le texte :
- **avant :** `<text x="60" y="60" font-size="20" transform="matrix(1.29996 0 0 1.89242 -17.9974 -37.3913)">` ;
- **après :** `<text x="60" y="72.05" font-size="26">`.

### API des extensions

- **`svgCanvas.scaleSelectedElements(sx, sy, ox, oy)`, nouveau.** Met la sélection à l'échelle autour d'un point, par défaut le coin haut gauche de son cadre, en une étape d'annulation. Le panneau de la multi-sélection (M4) s'en servira pour les champs L et H.
- **Nouveau module `core/multi-transform.js`.** Il porte la géométrie du geste et les règles du texte et des objets tournés.
- **Nouvelles méthodes du gestionnaire de sélection.** Le cadre commun a l'identifiant `selectorMultiFrame`, et le gestionnaire gagne `updateMultiFrame`, `lockFrame` et `showRotateGrip`. Les poignées gardent leurs identifiants `selectorGrip_resize_*`.
- **Événements inchangés.** `transition` part pendant le geste, et `changed` une seule fois au relâchement.

### Performances

`npm run bench` mesure deux nouvelles interactions, avec des budgets à 2 000 objets :

| Interaction | 200 objets | 2 000 objets | Budget à 2 000 |
| --- | --- | --- | --- |
| Redimensionner tout, un mouvement | 17 ms, dont 4 ms de calcul | 57 ms | 100 ms |
| Relâchement du redimensionnement collectif | 18 ms | 96 ms | 300 ms |

À 200 objets, le geste répond dans l'image suivante : la mesure inclut l'attente de cette image. Les autres mesures restent dans le bruit de celles de M1.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m2
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dessinez un rectangle, une ellipse et un texte. Sélectionnez-les : un seul cadre les entoure. Tirez la poignée bas droite. Tout grandit ensemble, le texte sans se déformer, puis Ctrl+Z annule en une fois.
2. Même geste avec Maj, puis avec Alt, puis en tirant la poignée droite au-delà du côté gauche : l'ensemble se retourne.
3. Tirez une poignée et appuyez sur Échap avant de relâcher : rien n'a changé.
4. Tournez un rectangle de 30°, sélectionnez-le avec un autre objet, puis tirez la poignée droite. Le rectangle s'élargit dans ses propres axes, sans devenir un losange.
5. Sélectionnez un texte seul et tirez sa poignée bas droite : il grandit, sans matrice dans la source (Ctrl+U).

### Comparer la sortie avec une autre version

Les deux scripts de `tests/output/` remplacent la comparaison manuelle. Il faut trois terminaux.

Premier terminal, une seule fois : construire la référence avec son propre moteur `svgcanvas`, puis la servir.

```powershell
node tests/output/build-reference.mjs refonte-selection-m1 ..\ref-m1
npx vite preview --port 8010 --strictPort --outDir ..\ref-m1\dist\editor
```

Second terminal : servir la version courante.

```powershell
npm run start:e2e
```

Troisième terminal : comparer. `--expect` liste les différences voulues ; toute autre différence fait échouer le script.

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000 --expect="grip resize t1"
```

Ensuite, `git worktree remove --force ..\ref-m1` supprime la référence.

## 4. Tests ajoutés

- **`tests/unit/multi-transform.test.js` (12 tests).** Géométrie du geste (coin opposé, côté, Alt, Maj, franchissement), échelles par axe, matrice sans cisaillement, aperçu du texte.
- **`tests/e2e/selection-m2.spec.js` (21 tests).**
  - **Cadre commun :** huit poignées, pas de poignée de rotation, retour au cadre orienté pour un objet seul.
  - **Gestes réels :** poignées, Maj, Alt, franchissement du côté opposé, Échap, clic sans mouvement.
  - **Historique :** une étape, et le même SVG après annuler puis rétablir.
  - **Résultat :** attributs métier conservés, aucun attribut d'aperçu laissé dans le dessin.
  - **Texte :** collectif, seul, aperçu identique au résultat.
  - **Autres types :** objet tourné, cercle, groupe, chemin avec courbes et arcs, polyligne avec marqueur, `use`, image, `foreignObject`.
  - **Équivalences :** même SVG seul ou avec un autre objet, centres qui suivent la transformation, groupes imbriqués et tournés au même rendu après mise à l'échelle puis dégroupage.
- **`tests/output/`.** Le script de comparaison de sortie et celui qui construit une référence.
- **`tests/perf/`.** Les deux mesures collectives et leurs budgets.

Bilan : lint propre, 661 tests unitaires et 159 tests E2E verts.

## 5. Limites connues et décisions à prendre

- **Objet avec `clip-path` : décision à prendre.** Un rectangle découpé par un `clip-path` est réécrit, mais sa zone de découpe ne suit pas l'échelle. C'est déjà le cas dans SVG-Edit pour un objet seul, et M2 garde ce comportement, car la règle est « même SVG que seul ». Le corriger, pour les deux gestes, changerait la sortie de ce geste existant.
- **Texte retourné.** Un texte déjà tourné et retourné par le geste garde une matrice. Un texte non tourné et retourné garde un miroir sous forme de matrice, sans déformation.
- **Objets à transformation complexe.** Un objet qui porte déjà une matrice, ou plusieurs transformations, suit les règles actuelles : sa matrice est multipliée.
- **Sélection hors du calque courant.** Le cadre commun suppose des objets du même calque ou du même groupe ouvert, ce que garantit la sélection de l'éditeur.
- **Lots suivants :**
  - la rotation du cadre commun (M3) ;
  - la cote vivante et les curseurs orientés (M5) ;
  - les champs X, Y, L et H de l'ensemble (M4).
