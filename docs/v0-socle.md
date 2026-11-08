# Plan v2 — lot V0 « Socle »

Branche `v0-socle`, partie de `fusion-refonte-master` (fusion de la refonte dans `master`). V0 ouvre le plan « Interface et expérience (v2) » : il mesure et il protège, sans changer l'éditeur.

La branche contient aussi `b9ad875`, le dernier commit de `refonte-selection-corrections` (valeurs par défaut omises seulement sans effet), fusionné pour que le rapport le mesure. Il arrive dans `master` par la seconde demande de fusion (n° 2).

État : en cours. Livré : le rapport de fidélité et les tests de survie des liaisons. Reste à faire : voir la section 5.

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

## 3. Ce qui ne change pas

- **Éditeur.** V0 ne modifie aucune ligne de `src/` ni de `packages/`. Seul `b9ad875`, fusionné depuis `refonte-selection-corrections` et décrit dans `docs/refonte-selection-corrections.md`, touche `packages/svgcanvas`.
- **Sortie SVG.** Inchangée. La fixture s'ajoute aux allers-retours de `compare-output.mjs`, identiques entre deux versions tant que l'import ne change pas.

## 4. Tester en local (PowerShell)

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
npx playwright test tests/e2e/liaisons-v0.spec.js
```

## 5. Reste à faire dans V0

- **Corpus réel (D4).** 10 à 20 synoptiques SCorp-io, avec au moins un fichier lié, à passer au rapport par `--corpus`.
- **Firefox.** Le workflow `firefox.yml` lance les 290 tests E2E sous Firefox à chaque push, avec `playwright.firefox.config.mjs`. Il reste informatif, comme le banc, jusqu'à ce que la suite y passe ; son premier résultat dira ce qu'il faut corriger.
- **Contrats des extensions.** Un test par extension active : chargement, boutons, événements.
- **Maquettes.** Publiées le 8 novembre, à valider avant V3 : [maquette éditeur SVG-Edit v2](https://claude.ai/artifact/1W7asSMbQuGhQCCsYNTuaz). Cinq plans de travail d'après les captures de Claude Design : texte sélectionné et styles, forme et onglet Code, multi-sélection et menu d'alignement, glissement avec guides, menu du zoom et deux cadres d'export.
