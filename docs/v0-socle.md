# Plan v2 — lot V0 « Socle »

Branche `v0-socle`, partie de `fusion-refonte-master` (fusion de la refonte dans `master`). V0 ouvre le plan « Interface et expérience (v2) » : il mesure et il protège. Il ne change l'éditeur que pour cinq défauts trouvés en mesurant (section 3).

La branche contient aussi `b9ad875`, le dernier commit de `refonte-selection-corrections` (valeurs par défaut omises seulement sans effet), fusionné pour que le rapport le mesure. Il arrive dans `master` par la seconde demande de fusion (n° 2).

État : en cours. Livré :
- le rapport de fidélité ;
- les tests de survie des liaisons ;
- la suite E2E sous Firefox ;
- les contrats des extensions.

Reste à faire : voir la section 6.

## 1. Le rapport de fidélité

`compare-output.mjs` compare deux versions de l'éditeur entre elles. Il ne dit pas ce que l'éditeur fait à un fichier. Le nouveau script compare chaque fichier à ce que l'éditeur écrit après l'avoir ouvert, sans aucune modification :

```powershell
npm run start:e2e
npm run fidelity -- --out=fidelite.md
```

- **Corpus.** Sans option, les SVG du dépôt. `--corpus=dossier1,dossier2` lit des synoptiques gardés hors du dépôt.
- **Classement.** Chaque différence est rangée selon la section 7 du plan : perte, changement ou simple note.
- **Valeurs par défaut.** Une valeur par défaut retirée n'est une perte que si le rendu change : l'élément hérite d'un ancêtre une autre valeur (attribut, attribut `style` ou règle d'une feuille `<style>` du dessin), un `<use>` le réutilise, ou `rx`/`ry` à 0 accompagne un rayon non nul. Sinon, c'est une note.
- **Appariement.** Les éléments sont appariés par identifiant, sinon par ordre parmi les éléments de même type.
- **Sorties.** Un tableau Markdown (`--out`) et le détail en JSON (`--json`). Le script n'échoue jamais : il rapporte.

`tests/fixtures/fidelity/section-7.svg` contient un cas par ligne de la section 7 : `data-*` numérique, identifiant en double, animation SMIL et CSS, valeur « par défaut » sous un groupe à trait, attributs Inkscape, métadonnées RDF, dégradé en `userSpaceOnUse`, dégradé appelé depuis un `<style>`, `<svg>` imbriqué, objet hors calque, viewBox d'origine non nulle.

### Résultat sur les 16 SVG du dépôt

Éditeur compilé depuis `v0-socle`, avec `b9ad875`. Aucun fichier ne ressort sans différence.

| Nature | Gravité | Occurrences | Fichiers |
| --- | --- | --- | --- |
| Animation SMIL retirée | perte | 1 | 1 |
| Attribut `data-*` numérique réécrit | perte | 2 | 1 |
| Identifiant renommé ou supprimé | perte | 13 | 2 |
| Attribut `style` converti ou retiré | perte | 2 | 2 |
| Attribut d'un espace de noms étranger retiré | perte | 3 | 1 |
| Métadonnées aplaties | perte | 6 | 2 |
| Définition retirée | perte | 4 | 2 |
| `<svg>` imbriqué transformé | perte | 1 | 1 |
| Attribut retiré (hors liste blanche ou autre) | perte | 6 | 4 |
| Unités de dégradé converties | changement | 1 | 1 |
| Nombre arrondi | changement | 191 | 7 |
| Racine du document modifiée | changement | 11 | 6 |
| Calque ajouté (objets hors calque déplacés) | changement | 11 | 11 |
| Feuille `<style>` réécrite | changement | 1 | 1 |

Les notes (valeurs par défaut omises sans effet, tracés réécrits en commandes relatives, `xlink:href` devenu `href`, identifiants ajoutés) sont dans le rapport complet.

Deux lectures :
- **Les valeurs « par défaut ».** Le premier rapport comptait 176 pertes : il traitait toute valeur par défaut retirée comme une perte. Avec le classement ci-dessus :

  | Valeur « par défaut » | Avant `b9ad875` | Avec `b9ad875` |
  | --- | --- | --- |
  | retirée, rendu changé (perte) | 2 | 0 |
  | omise sans effet (note) | 174 | 174 |

  Les 2 pertes étaient dans la fixture : `stroke="none"` sous un groupe à trait noir, et `rx="0"` à côté de `ry="5"`. Les 174 omissions sans effet sont des `stop-opacity`, `fill-opacity`, `stroke-opacity`, `stroke` et `stroke-width` d'`arbelos.svg`, `mickey.svg` et `logo.svg`, dont aucun ancêtre ne fixe la propriété. Les autres lignes du tableau sont identiques avant et après `b9ad875`.
- **Les nombres arrondis.** Ils ne figuraient pas dans la section 7 : toute valeur numérique est écrite à deux décimales. C'est sans effet visible à l'échelle d'un synoptique, mais à décider pour les attributs de liaison (voir ci-dessous).

## 2. Les tests de survie des liaisons

`tests/e2e/liaisons-v0.spec.js` suit les attributs auxquels SCorp-io peut lier des données (identifiant, classe, `data-*`) à travers les opérations d'édition.

**Ce qui survit, et doit continuer à survivre** (6 tests) :
- ouvrir puis exporter ;
- déplacer, redimensionner, pivoter ;
- grouper puis dégrouper : les objets gardent leurs liaisons ;
- convertir en chemin (depuis `b05993a`) ;
- copier-coller : la copie reçoit un nouvel identifiant, l'original garde le sien ;
- annuler un dégroupement et un groupement : tous les identifiants reviennent.

**Ce qui se perd aujourd'hui** (3 tests qui décrivent le comportement actuel, à changer volontairement en V6) :
- un `data-*` numérique est arrondi à l'export : `data-point="007"` devient `"7"` ;
- dégrouper un groupe lié supprime sa liaison sans prévenir ;
- un identifiant en double dans un fichier ouvert est renommé.

## 3. Firefox et les contrats des extensions

### Firefox

Le workflow `firefox.yml` lance toute la suite E2E sous Firefox à chaque push, avec `playwright.firefox.config.mjs`. Il est bloquant depuis que toute la suite y passe.

Premier passage, sur `1057bf6` : 245 tests passent, 45 échouent. Une sonde lancée sous les deux navigateurs a séparé deux causes.

**Ce qui venait des tests** (environ 40 échecs) : ils mesuraient avec ce qui diffère d'un navigateur à l'autre, pas avec l'éditeur.

| Différence de Firefox | Correction dans les tests |
| --- | --- |
| Pas de permission presse-papiers à accorder, pas de `TouchEvent` hors écran tactile | Deux préférences dans la configuration Firefox |
| Listes de transformations et tracés écrits avec virgules et espaces (`rotate(90, 210, 60)`, `M 300 300 L …`) | Comparaison sous une forme canonique (`canonical` dans `helpers.js`) |
| Boîte à l'écran du `<svg>` du dessin, d'un `<use>`, d'une forme clippée | Mesure par la matrice du premier calque ou de la forme (`screenPoint`, `SCREEN_BOX`) |
| Calcul en simple précision, souris au pixel entier, boîtes au 1/60 de pixel | 4 décimales après un glisser, 1° pour une rotation au pointeur, 1/30 px pour une boîte |

**Ce qui venait de l'éditeur** (4 défauts, corrigés). Trois tiennent à la simple précision des matrices SVG de Firefox :
- **Rectangle tourné.** Après une homothétie, il gardait `rotate(30) matrix(1.2, 2e-8, …)` au lieu d'une nouvelle largeur et hauteur : le bruit de 2e-8 passait pour un cisaillement.
- **Épaisseur d'un groupe.** L'outil Échelle réécrivait celle d'un groupe qui garde sa matrice : `2` devenait `1.99999997737`.
- **Rotation depuis un coin.** Elle laissait `matrix(1, -6.5e-9, 6.5e-9, 1, 3.6e-5, -2.6e-5)` derrière le `rotate`, et un second pas d'annulation.

Le moteur tolère désormais ce bruit : 1e-6 sur la partie linéaire, 1e-3 unité sur une translation (`MATRIX_TOLERANCE` et `TRANSLATION_TOLERANCE` dans `math.js`).

Le quatrième tient aux événements. Firefox ne déclenche pas l'événement `paste` pour Ctrl+Maj+V hors d'un champ, si bien qu'un SVG copié dans une autre application n'était pas collé sur place. Sans événement, l'éditeur lit maintenant le presse-papiers système comme le fait le menu contextuel.

Reste une différence sans effet. Sous Firefox, le dessin ouvert peut contenir `x="399.99998"` là où Chromium écrit `400`. L'enregistrement arrondit à deux décimales, donc le fichier est le même.

Les passages suivants :
- **Sur `2f8605f`.** 284 tests passent et 6 échouent. Trois assertions étaient masquées par celles déjà corrigées, une mesure de copie de `<use>` restait à reprendre, et deux défauts de l'éditeur restaient à corriger (la rotation depuis un coin et le collage sur place).
- **Sur `e30adb0`.** Les 306 tests passent, sous Firefox comme sous Chromium : le workflow Firefox devient bloquant.

### Contrats des extensions

`tests/e2e/extensions-v0.spec.js` décrit ce que les dix extensions chargées par défaut attendent de l'éditeur, avant que V1 à V4 reconstruisent l'interface autour d'elles (13 tests) :
- **Chargement.** Chacune se charge avec les événements qu'elle écoute.
- **Emplacements.** Chacune trouve la place où elle range ses boutons.
- **Événements.** Pendant une séquence d'édition ordinaire, l'éditeur envoie tous ces événements : sélection, changement, souris, zoom, collage avec nouveaux identifiants, calques.
- **Boutons.** Chaque bouton fait ce qu'il annonce : connecteur, pipette, grille, marqueurs, main, bibliothèque de formes, étoile et polygone, menu Fichier, stockage, vue du calque.

Deux constats :
- **Bibliothèque de formes (défaut corrigé).** Son bouton choisit l'outil avant qu'une forme soit choisie dans le menu. Un glisser levait alors cinq exceptions (`setScale` avec une échelle infinie). Il ne dessine plus rien tant qu'aucune forme n'est choisie.
- **Pas de `mouseUp` en mode sélection.** Un glisser en mode sélection ne transmet pas `mouseUp` aux extensions. C'était déjà le cas dans SVG-Edit d'origine ; le contrat le constate.

## 4. Ce qui ne change pas

- **Éditeur.** V0 ne corrige que les cinq défauts trouvés en mesurant (section 3), dans `math.js`, `recalculate.js`, `scale-tool.js`, `SystemClipboard.js` et `ext-shapes.js`. Sous Chromium, la suite complète donne les mêmes résultats. Seul `b9ad875`, fusionné depuis `refonte-selection-corrections` et décrit dans `docs/refonte-selection-corrections.md`, touche aussi `packages/svgcanvas`.
- **Sortie SVG.** V0 ne la change pas. `b9ad875` la change pour les valeurs par défaut (section 1). La fixture s'ajoute aux allers-retours de `compare-output.mjs`, identiques entre deux versions tant que l'import ne change pas.

## 5. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout v0-socle
npm ci
npm run build
```

Dans un premier terminal :

```powershell
npm run start:e2e
```

Dans un second terminal :

```powershell
npm run fidelity -- --out=fidelite.md
npx vitest run tests/unit/fidelity-diff.test.js
npx playwright test tests/e2e/liaisons-v0.spec.js tests/e2e/extensions-v0.spec.js
npx playwright test --config playwright.firefox.config.mjs
```

La dernière commande demande Firefox pour Playwright : `npx playwright install firefox`.

## 6. Reste à faire dans V0

- **Corpus réel (D4).** 10 à 20 synoptiques SCorp-io, avec au moins un fichier lié, à passer au rapport par `--corpus`.
- **Maquettes.** Publiées le 8 novembre, à valider avant V3 : [maquette éditeur SVG-Edit v2](https://claude.ai/artifact/1W7asSMbQuGhQCCsYNTuaz). Cinq plans de travail d'après les captures de Claude Design : texte sélectionné et styles, forme et onglet Code, multi-sélection et menu d'alignement, glissement avec guides, menu du zoom et deux cadres d'export.
