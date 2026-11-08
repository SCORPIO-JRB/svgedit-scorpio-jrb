# Refonte de la sélection — lot M9 « Échelle et rangement »

Branche `refonte-selection-m9`, partie de `refonte-selection-m7`. Ce lot apporte trois nouveautés :

- **L'outil Échelle (K).** La sélection grandit ou rétrécit en gardant ses proportions. L'épaisseur des traits, les pointillés, la taille du texte et le flou suivent la géométrie.
- **Ranger.** Une sélection disposée à peu près en ligne, en colonne ou en grille devient régulière.
- **L'espacement imposé.** Un champ « écart » fixe l'espace entre les objets pour la distribution et pour Ranger.

Rien ne change pour les gestes existants : la sortie SVG reste identique à celle de M7 à l'octet près.

## 1. Ce qui change pour l'utilisateur

### L'outil Échelle

Un bouton s'ajoute au panneau de gauche, sous la flèche de sélection. La touche K l'active, V revient à la sélection simple. L'outil est un réglage du mode Sélection :
- on sélectionne, on déplace et on fait pivoter comme d'habitude ;
- seules les poignées de redimensionnement changent de rôle.

**Pourquoi un outil à part.** Un redimensionnement garde l'épaisseur des traits, car les traits d'un schéma technique ont des épaisseurs normalisées. L'outil Échelle sert quand tout doit grandir ensemble, par exemple un symbole agrandi d'un coup.

| Geste avec l'outil Échelle | Effet |
| --- | --- |
| Glisser une poignée de coin | l'ensemble grandit, le coin opposé reste en place |
| Glisser une poignée de côté | le milieu du côté opposé reste en place |
| Alt | le centre reste en place |
| Échap avant de relâcher | tout revient comme avant, sans étape d'historique |

Comportement :
- **Proportions toujours gardées.** Maj n'est pas nécessaire. Le facteur ne descend pas sous 0,01 : la sélection ne s'écrase pas et ne se retourne pas.
- **Un ou plusieurs objets.** Un objet seul et tourné s'agrandit dans ses propres axes, en gardant son angle.
- **Aperçu exact.** Pendant le geste, les traits grossissent déjà : ce qui s'affiche est le résultat.
- **Une seule étape d'annulation.** Annuler puis rétablir redonne le même SVG à l'octet près.

**Ce qui est multiplié par le facteur.** La règle est la même pour tous les types : après le geste, chaque objet montre un trait k fois plus épais qu'avant.

| Objet | Résultat pour un facteur k |
| --- | --- |
| Rectangle, ellipse, cercle, ligne, polyligne, polygone, chemin | géométrie réécrite comme pour un redimensionnement ; `stroke-width`, `stroke-dasharray` et `stroke-dashoffset` multipliés par k |
| Texte | taille de police et trait multipliés par k, sans matrice |
| Groupe, `use` | matrice gardée, comme pour un redimensionnement : elle grossit déjà les traits qu'ils contiennent, leurs épaisseurs ne changent donc pas |
| Objet sans épaisseur propre, qui tient la valeur par défaut (1) ou celle de son calque | reçoit sa propre épaisseur, k fois plus grande ; un objet sans trait ne reçoit rien |
| Épaisseur écrite dans un attribut `style` | multipliée dans `style`, le reste de l'attribut inchangé |
| Flou de l'éditeur (`filter="url(#id_blur)"`) | écart type multiplié par k, et zone du filtre élargie au-delà de 3, comme le fait le champ Flou |

Les attributs métier (`data-*`, `se:`) restent intacts.

### Le panneau de l'outil Échelle

Avec l'outil actif et une sélection, le panneau du haut remplace les champs L et H par :
- **le facteur (×)**, compté depuis la taille qu'avait la sélection quand elle a été prise. Taper 2 la double ; taper 1 la remet à sa taille de départ. Un glisser met le champ à jour ;
- **L et H**, la largeur et la hauteur de la sélection, hors trait. En changer une met l'ensemble à l'échelle, traits compris ;
- **l'ancre à neuf points**, le point qui reste en place quand on tape une valeur. Par défaut, c'est le coin haut gauche, comme pour les champs L et H.

L'ancre se choisit à la souris, ou au clavier avec les flèches une fois le focus dessus. Chaque point a un nom lu par les lecteurs d'écran (« En haut à gauche »…). Le calcul dans les champs (`*2`, `/3`, `+10`) fonctionne comme dans les autres champs.

### Ranger

Un bouton « Ranger » s'ajoute aux boutons d'alignement d'une multi-sélection, après la distribution.

| Disposition reconnue | Résultat |
| --- | --- |
| Une ligne : tous les objets se chevauchent en hauteur | rangée alignée sur le haut, objets dans leur ordre de gauche à droite |
| Une colonne | colonne alignée sur la gauche, objets dans leur ordre de haut en bas |
| Une grille | chaque objet prend le coin haut gauche de sa case ; une colonne a la largeur de son objet le plus large, une ligne la hauteur de son objet le plus haut ; une case vide reste vide |

Règles communes :
- **L'écart** est l'écart le plus fréquent entre voisins, compté à l'unité près. Quand aucun écart ne se répète, c'est l'écart médian. Il n'est jamais négatif : les objets rangés ne se chevauchent pas.
- **Le coin haut gauche** de la sélection reste en place.
- **Une sélection déjà rangée** ne bouge plus.
- **Une seule étape d'annulation.**
- **Lignes et colonnes.** Un objet rejoint une ligne quand il chevauche tous les objets de cette ligne. Ainsi, un objet très haut ne fusionne pas deux lignes.

### L'espacement imposé

Un champ « écart » suit le bouton Ranger.

| Champ | Distribuer | Ranger |
| --- | --- | --- |
| vide | espaces égaux entre les objets extrêmes, comme avant | écart le plus fréquent |
| une valeur | le premier objet reste en place, chaque suivant le suit à cette distance, quelle que soit la référence choisie | cette valeur entre lignes et entre colonnes |

La valeur est dans l'unité du document.

### Corrections au passage

**Aligner, distribuer et déplacer par les flèches sont dix fois plus rapides** sur de grandes sélections. Après chaque objet déplacé, son cadre de sélection était redessiné, et la mesure de ce cadre forçait le navigateur à recalculer tout le dessin. Les cadres sont maintenant tous redessinés après les déplacements. Le SVG produit ne change pas.

Mesures sur 2 000 objets :

| Action | M7 | M9 |
| --- | --- | --- |
| Aligner | 670 ms | 79 ms |
| Distribuer | 737 ms | 98 ms |
| Déplacer par `moveSelectedElements` | 762 ms | 83 ms |

## 2. Ce qui ne change pas

### Sortie SVG

Comparaison avec M7 (`c487bf3`) :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 67 sur 67 identiques, sans aucune différence attendue.

Deux scénarios s'ajoutent au script :
- une distribution verticale par rapport à la page ;
- des déplacements aux flèches et Maj+flèche.

Ils couvrent les déplacements dont le redessin des cadres a changé.

Le redimensionnement par les poignées, outil Échelle éteint, garde exactement sa sortie : les huit scénarios « grip resize » sont identiques.

### API des extensions

**Canevas.** Nouvelles méthodes :

| Méthode | Rôle |
| --- | --- |
| `setScaleTool(on)`, `isScaleTool()` | Active ou lit l'outil Échelle ; tout autre mode que `select` l'éteint |
| `scaleSelectionBy(k, { anchor, x, y })` | Met la sélection à l'échelle k, traits compris, autour d'un point de son cadre (`nw`, `n`, `ne`, `w`, `c`, `e`, `sw`, `s`, `se` ; `nw` par défaut) ou d'un point donné ; une étape d'annulation |
| `tidyUpSelectedElements({ spacing })` | Ranger ; renvoie `null` si rien ne bouge |

**Méthodes modifiées :**
- **`alignSelectedElements(type, relativeTo, { spacing })`.** Un troisième argument facultatif impose l'écart d'une distribution. Sans lui, rien ne change.
- **`moveSelectedElements`.** Les cadres de sélection suivent après tous les déplacements, et non plus après chacun. Le SVG produit est le même, l'événement `changed` aussi.

**Modules du canevas :**
- `core/scale-tool.js`, nouveau : l'état de l'outil, la géométrie du geste (`boxPoint`, `anchorOfGrip`, `dragFactor`) et la règle des traits (`readStrokeLengths`, `scaleStrokeLengths`, `scaleNumbers`) ;
- `core/tidy-up.js`, nouveau : `bandsOf`, `usualGap` et `tidyUpLayout`, des fonctions pures sans accès au DOM ;
- `core/multi-transform.js` : le geste de l'outil Échelle (`beginGroupScale`, `updateGroupScale`, `commitGroupScale`, `isGroupScaling`). Échap l'annule par `cancelGroupGesture`, comme les autres gestes du cadre commun.

**Éditeur :**
- bouton `tool_scale` (touche K) dans le panneau de gauche ;
- `leftPanel.clickScale()` et `leftPanel.chooseSelect()`. `clickSelect()`, appelé par l'éditeur après chaque changement, garde maintenant l'outil Échelle actif ; seul le bouton de sélection ou la touche V l'éteint ;
- panneau `scale_panel` : champs `scale_factor`, `scale_w`, `scale_h` et ancre `scale_anchor` ;
- bouton `tool_tidy_up` et champ `tool_align_spacing` ;
- la zone de travail porte la classe `scale_tool` tant que l'outil est actif.

**Traductions.** Dix-huit clés `tools.*` s'ajoutent : `mode_scale`, `scale_*`, `anchor_*`, `tidy_up`, `spacing` et `spacing_label`. Elles sont en français dans `lang.fr.js` et en anglais dans les autres langues.

**Icônes.** `scale.svg` et `tidy_up.svg`, dans le style des icônes existantes.

### Performances

`npm run bench` mesure trois nouvelles interactions, avec des budgets à 2 000 objets :

| Interaction | 200 objets | 2 000 objets | Budget à 2 000 |
| --- | --- | --- | --- |
| Outil Échelle, un mouvement | 14 ms | 57 à 77 ms | 100 ms |
| Relâchement de l'outil Échelle | 16 ms | 97 à 140 ms | 300 ms |
| Ranger, tout sélectionné | 17 ms | 106 à 114 ms | 200 ms |

Les autres mesures restent dans les budgets, aux écarts de mesure près. Une première passe a dépassé deux budgets d'une interaction que M9 ne touche pas (glisser, annuler) ; les deux passes suivantes les respectaient.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m9
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. **Outil Échelle.** Dessinez deux rectangles à trait épais, sélectionnez-les, appuyez sur K, puis tirez la poignée bas droite. Tout grandit, traits compris. Ctrl+Z annule en une fois.
2. **Comparaison.** Même geste après V : les traits gardent leur épaisseur.
3. **Côté et centre.** Avec K, tirez la poignée droite : le milieu du côté gauche reste en place. Avec Alt, c'est le centre.
4. **Panneau.** Avec K et une sélection, tapez 2 dans le champ × : la sélection double depuis son coin haut gauche. Tapez 1 : elle revient. Cliquez le point central de l'ancre, puis tapez une largeur : le centre reste en place.
5. **Texte, groupe, symbole.** Avec K, agrandissez un texte, un groupe et une pompe (`use`) : tout grossit, rien ne se déforme.
6. **Ranger.** Disposez quatre rectangles en carré approximatif, sélectionnez-les, cliquez Ranger : ils forment une grille régulière.
7. **Espacement.** Tapez 10 dans le champ « écart », puis cliquez « Distribuer horizontalement » : 10 unités séparent chaque objet du suivant. Videz le champ pour revenir aux espaces égaux.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. Pour M9, la référence est M7 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m7 ..\ref-m7
npx vite preview --port 8010 --strictPort --outDir ..\ref-m7\dist\editor
```

Puis, avec la version courante servie sur le port 8000, sans différence attendue :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000
```

## 4. Tests ajoutés

**`tests/unit/scale-m9.test.js` (20 tests) :**
- **géométrie de l'outil :** les neuf points de l'ancre, le point fixe de chaque poignée, le facteur mesuré sur la ligne du point fixe à la poignée (1 au départ, plancher à 0,01), la multiplication des valeurs (unités, listes, mots-clés) ;
- **sur le canevas :**
  - outil éteint par un autre mode ;
  - géométrie, trait et pointillés en une étape d'annulation ;
  - épaisseur propre donnée à un objet qui tenait la valeur par défaut, rien pour un objet sans trait ;
  - épaisseurs écrites dans `style` ;
  - texte ;
  - flou et sa zone, annulation comprise ;
  - ancres ;
  - facteurs refusés ;
  - espacement imposé à une distribution ;
  - grille approximative rangée en une étape, puis immobile ;
- **Ranger, fonctions pures :** lignes qu'un objet haut ne fusionne pas, écart le plus fréquent ou médian, rangée, colonne avec écart imposé, grille de largeurs et hauteurs différentes, case vide, objets d'une même ligne dans une même colonne.

**`tests/e2e/scale-m9.spec.js` (12 tests, sans erreur dans la page) :**
- **outil :** K, V et un outil de dessin ;
- **gestes :** objet seul, poignée de côté, multi-sélection (proportions, traits, pointillés, positions relatives, aperçu identique au résultat, une étape, annuler et rétablir à l'octet près), Alt, Échap ;
- **types :** texte, groupe et `use` ; rectangle tourné ;
- **panneau :** remplacement de L et H, facteur compté depuis la sélection, largeur autour d'une ancre choisie, ancre au clavier ;
- **Ranger et espacement :** grille approximative en une étape d'annulation, écart imposé à Ranger et à la distribution, champ vide.

**`tests/output/`** : deux scénarios de déplacement.

**`tests/perf/`** : trois mesures et leurs budgets.

Bilan :
- lint propre ;
- 755 tests unitaires verts (735 + 20) ;
- 259 tests E2E verts (247 + 12) ;
- sortie identique à M7.

## 5. Limites connues et décisions à prendre

- **Dégroupage d'un groupe à matrice : décision à prendre.** Le plan demande que le dégroupage « cesse de modifier l'épaisseur des traits sans le dire ». Aujourd'hui, dégrouper un groupe mis à l'échelle multiplie l'épaisseur de ses enfants, pour garder leur rendu. M9 n'y touche pas, car ce serait changer la sortie d'un geste existant. Il y a trois options :
  - garder ce comportement ;
  - garder les épaisseurs, au prix d'un rendu qui change au dégroupage ;
  - prévenir l'utilisateur.
- **Alignement dans une case de Ranger : à confirmer.** Ranger aligne chaque objet sur le haut et la gauche de sa case. Un centrage serait possible si les synoptiques le demandent ; le bouton « Centrer » reste disponible ensuite.
- **Ce que l'outil Échelle laisse de côté :**
  - les filtres autres que le flou de l'éditeur ;
  - les marqueurs en `markerUnits="userSpaceOnUse"` (ceux de l'éditeur suivent l'épaisseur du trait, donc l'échelle) ;
  - les styles par classe d'une feuille `<style>`.
- **Écart d'une grille approximative.** Avec peu d'objets, aucun écart ne se répète : Ranger prend l'écart médian. Deux colonnes séparées de 12 et de 9 donnent 10,5. Le champ « écart » impose une valeur ronde.
- **Raccourcis d'alignement, de distribution et de rangement :** toujours reportés, comme décidé le 7 novembre.
