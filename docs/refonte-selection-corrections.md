# Refonte de la sélection — corrections

Branche `refonte-selection-corrections`, partie de `refonte-selection-arbitrages`. Elle reçoit les corrections demandées après les arbitrages du 8 novembre, sans pull request vers `master` pour l'instant.

| N° | Défaut | Correction |
| --- | --- | --- |
| 10 | La conversion en chemin écrit `fill-opacity="null"` et prend le style courant au lieu de celui de la forme | le chemin prend le style propre de la forme ; plus aucune valeur `null` n'est écrite |
| 10 (suite) | La conversion perd `fill-rule`, `mask`, `class`, le titre et tout attribut hors d'une courte liste | le chemin garde tout ce que la forme a, sauf sa géométrie |

## 1. Question 10 — Conversion en chemin

### Le défaut

Une ellipse sans `fill-opacity`, cliquée puis convertie en chemin, donnait dans le document ouvert :

```xml
<path fill="#a63" fill-opacity="null" stroke="#00f" stroke-width="3" stroke-dasharray="null"
      stroke-linejoin="null" stroke-linecap="null" stroke-opacity="null" d="…" id="e1"/>
```

La cause était double :
- **Le clic** recopie le style de la forme dans le style courant, avec `null` pour chaque attribut absent.
- **La conversion** ne lisait pas la forme mais ce style courant. L'écriture des attributs (`assignAttributes`) transformait ensuite `null` en texte « null ».

Effets constatés :
- **Pas de « null » dans le fichier enregistré.** L'export retirait déjà ces valeurs. Elles restaient dans le document ouvert, visibles dans les outils de développement, par les extensions et par l'API (`getAttribute` renvoie `"null"`). Le rendu n'était pas touché, car le navigateur ignore une valeur invalide.
- **Mauvais style, enregistré tel quel.** Une forme sélectionnée autrement que par un clic prenait le style courant : celui de la dernière forme cliquée ou, à défaut, le style par défaut de l'éditeur. C'est le cas d'une sélection par Tab, par le menu « objets semblables », par le panneau des calques ou par l'API. Exemples :
  - un rectangle vert à 50 % d'opacité, sélectionné par Tab après un clic sur une ellipse orange, devenait un chemin orange à trait bleu, opaque ;
  - une ellipse convertie par l'API sans clic préalable devenait rouge (`#FF0000`) à trait noir de 5.
- **Opacité perdue.** L'opacité de la forme était remplacée par l'opacité courante.
- **Dessin.** Une forme dessinée après un clic recevait les mêmes attributs « null » dans le document ouvert. Un texte écrit après un clic sur un texte sans taille recevait `font-size="null"`.

### La correction

- **Conversion.** Le chemin prend le style propre de la forme, quelle que soit la façon dont elle a été sélectionnée : remplissage, contour, épaisseur, pointillés, jonctions, extrémités, opacités. Un attribut absent de la forme reste absent du chemin, qui continue d'hériter de son groupe.
- **Multi-sélection.** La conversion de plusieurs formes (M4) suit la même règle. Elle n'a plus besoin de modifier puis de rétablir le style courant pour chaque forme.
- **Écriture des attributs.** `assignAttributes` traite `null` comme `undefined` : l'attribut n'est pas écrit, ou il est retiré s'il existait. Une forme dessinée après un clic ne reçoit donc pas les attributs que la forme cliquée n'avait pas. Comme elle, elle les hérite de son groupe.
- **Clic.** Inchangé : il recopie toujours le style de la forme cliquée, y compris l'absence d'un attribut.

Après correction, la même ellipse donne :

```xml
<path fill="#a63" stroke="#00f" stroke-width="3" d="…" id="e1"/>
```

## 2. Question 10 (suite) — Tout ce que la forme a

### Le défaut

La conversion ne reportait sur le chemin qu'une courte liste d'attributs : le style de la section 1, les marqueurs, le filtre, la découpe et la transformation. Tout le reste était perdu :
- **`fill-rule`** : une étoile en `evenodd`, dont le centre est vide, devenait pleine ;
- **`mask`** : la forme masquée réapparaissait entière ;
- **`clip-rule`, `stroke-dashoffset`, `stroke-miterlimit`** : découpe, décalage des pointillés et angles du contour changeaient ;
- **`class`** : le style donné par une feuille de style, celle du document ou celle de la page web qui affiche le dessin, disparaissait ;
- **`data-…`** et les attributs d'autres espaces de noms : les repères posés sur la forme (un repère d'équipement par exemple) étaient perdus ;
- **le titre (`<title>`), la description et les métadonnées** : l'infobulle et le texte lu par les lecteurs d'écran disparaissaient.

S'y ajoutait un effet de bord : la conversion retirait les valeurs par défaut (`stroke-width="1"`, `fill-opacity="1"`, `stroke="none"`…). Dans un groupe qui fixe une autre valeur, le chemin prenait donc celle du groupe. Exemple : un rectangle au trait de 1 dans un groupe au trait de 5 passait à 5 dès la conversion.

### La correction

Le chemin garde tout ce que la forme a, sauf sa géométrie (`x`, `y`, `width`, `height`, `rx`, `ry`, `cx`, `cy`, `r`, `x1`, `y1`, `x2`, `y2`, `points`), que remplace son `d` :
- **Attributs.** Ils sont copiés tels quels, espace de noms compris, valeurs par défaut comprises. Un attribut absent de la forme reste absent du chemin, qui continue d'hériter de son groupe (section 1).
- **Ordre.** Les attributs déjà reportés gardent leur place, en tête. La sortie ne change donc que pour une forme qui avait un attribut auparavant perdu.
- **Titre, description, métadonnées.** Ils sont copiés dans le chemin. L'annulation rend la forme d'origine intacte, avec les siens.
- **Visibilité.** Une forme cachée (`visibility="hidden"`) le reste ; avant, elle devenait visible.
- **Exceptions.** Le repère de connecteur (`se:connector`) n'est pas reporté : un chemin ne peut pas être un connecteur, et l'extension Connecteur essaierait de le mettre à jour comme une polyligne. Comme avant, un connecteur converti devient un chemin ordinaire. Les animations (SMIL) ne sont pas copiées, car elles sont hors périmètre.

### Ce qui reste : l'enregistrement retire les valeurs par défaut

L'export enregistre chaque élément sans ses valeurs par défaut (`svg-exec.js`, `cleanupElement`). Il le fait pour toutes les formes, converties ou non, et retire aussi ces valeurs du document ouvert. La conversion ne change donc plus rien de ce côté : le chemin se comporte exactement comme la forme, dans l'éditeur comme à l'enregistrement. Le défaut de l'export reste entier : une forme au trait de 1 dans un groupe au trait de 5 est enregistrée sans son trait, et passe à 5 à la réouverture. Sa correction change la sortie de nombreux dessins : elle est proposée à part.

## 3. Ce qui change dans la sortie

La sortie enregistrée ne change que pour la conversion en chemin :
- **Forme convertie sans clic préalable** (section 1). Elle garde son propre style au lieu de prendre le style courant.
- **Opacité** (section 1). Une forme opaque à 50 % le reste une fois convertie. Une forme sans opacité ne reçoit plus l'opacité courante.
- **Attributs auparavant perdus** (section 2). `fill-rule`, `mask`, `class`, le titre, etc. sont enregistrés sur le chemin.
- **Forme cliquée puis convertie, sans attribut auparavant perdu.** Sortie identique : l'export retirait déjà les « null », et les attributs gardent leur ordre.

Les formes et textes dessinés après un clic gardent la même sortie et le même rendu qu'avant, y compris dans un groupe. Seuls les attributs « null » disparaissent du document ouvert.

Comparaison avec `refonte-selection-arbitrages` (`06a75f9`), sur 72 scénarios :
- 15 allers-retours d'import et d'export sur 15 sont identiques ;
- 69 scénarios sur 72 sont identiques ;
- les 3 différences sont attendues :
  - « convert to path », une ellipse convertie par l'API sans clic : `fill="#FF0000" stroke="#000000" stroke-width="5"` devient `fill="#a63"`, son propre style ;
  - « convert several to paths », un rectangle à 50 % d'opacité converti avec deux autres formes : `opacity="0.5"` est conservé ;
  - « convert to path keeps all the shape has », une ellipse avec `fill-rule`, `stroke-miterlimit`, `class` et un titre : le chemin les garde tous.

Par rapport à la correction précédente (`4bb1cf5`), seul ce dernier scénario change : les 71 autres sont identiques.

### API des extensions

- `svgCanvas.convertToPath(elem)` donne au chemin tous les attributs de `elem` sauf sa géométrie, ainsi que son titre, sa description et ses métadonnées. Avant, il prenait le style courant et une courte liste d'attributs.
- `svgCanvas.convertSelectedToPaths()` suit la même règle et ne touche plus au style courant.
- `convertToPath(elem, attrs, svgCanvas)` du module `utilities` : `attrs` devient facultatif et s'applique par-dessus les attributs de la forme. Avant, c'était le style complet du chemin.
- `assignAttributes(elem, attrs)`, et donc `addSVGElementsFromJson`, retire l'attribut pour une valeur `null`, comme pour `undefined`, au lieu d'écrire « null ».

## 4. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-corrections
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérification manuelle, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. Dans la source (Ctrl+U), collez `<ellipse cx="200" cy="200" rx="50" ry="30" fill="#a63" stroke="#00f" stroke-width="3"/>` et `<rect x="350" y="150" width="80" height="60" fill="#3a6" opacity="0.5"/>` dans le calque.
2. Cliquez l'ellipse, puis appuyez sur Tab : le rectangle est sélectionné. Cliquez « Convertir en chemin ». Le chemin reste vert, à 50 % d'opacité, sans contour. Avant la correction, il devenait orange à trait bleu, opaque.
3. Cliquez l'ellipse, puis dessinez un rectangle : il est orange à trait bleu. Dans les outils de développement (F12, onglet Éléments), il n'a aucun attribut « null ».
4. Dans la source, collez `<polygon points="150,20 209,200 55,90 245,90 91,200" fill="#3a6" fill-rule="evenodd"><title>Vanne V12</title></polygon>` : une étoile au centre vide. Cliquez une de ses branches (le centre vide ne la sélectionne pas), puis « Convertir en chemin ». Le centre reste vide, et le chemin contient toujours le titre « Vanne V12 » (F12, onglet Éléments). Avant la correction, l'étoile devenait pleine et perdait son titre.

## 5. Tests ajoutés

**Tests unitaires :**
- `tests/unit/utilities-extra2.test.js` : `assignAttributes` retire l'attribut pour `null`, y compris avec un espace de noms ;
- `tests/unit/json.test.js` : une forme créée avec le style courant ne reçoit pas les attributs à `null`, ni aucune valeur « null » ;
- `tests/unit/utilities.test.js` :
  - la conversion garde tous les attributs sauf la géométrie, espaces de noms et valeurs par défaut compris, ainsi que le titre (une copie). Elle laisse de côté le repère de connecteur et les animations ;
  - les attributs déjà reportés gardent leur ordre.

**`tests/e2e/corrections.spec.js` (9 tests, sans erreur dans la page) :**
- forme cliquée puis convertie par le bouton : style gardé, aucun « null », annulation ;
- forme sélectionnée par l'API après un clic sur une autre : elle garde son style et son opacité ;
- forme d'un groupe : aucun attribut ajouté, le remplissage et le contour hérités du groupe sont les mêmes ;
- multi-sélection convertie par le bouton : chaque forme garde son style et son opacité ;
- rectangle dessiné après un clic : il prend le style de la forme cliquée, sans « null » ;
- rectangle dessiné dans un groupe après un clic sur une forme sans remplissage : il n'a pas de remplissage propre et garde celui du groupe ;
- texte écrit après un clic sur un texte sans taille : il prend sa police, n'a pas de taille non plus et s'affiche à la même taille ;
- étoile en `evenodd` avec masque, pointillés décalés, classe, repère `data-` et titre, convertie par le bouton :
  - tout est gardé et le centre reste vide ;
  - le titre est enregistré dans le chemin ;
  - l'annulation rend l'étoile intacte ;
- rectangle au trait de 1 dans un groupe au trait de 5 : le chemin garde le trait de 1.

Les 7 premiers tests échouent sur `refonte-selection-arbitrages`. Les 2 derniers échouent sur la correction précédente (`4bb1cf5`). Tous passent sur cette branche.

**`tests/output/`** : nouveaux scénarios « convert several to paths » et « convert to path keeps all the shape has ».

**Résultats :** lint propre, 752 tests unitaires et 281 tests E2E passent ; comparaison de sortie en section 3.

## 6. Limites connues

- **Valeurs par défaut à l'enregistrement.** L'export retire les valeurs par défaut de chaque élément (section 2). C'est un défaut général de l'export, pas de la conversion, et sa correction est proposée à part.
- **Animations (SMIL).** Elles ne sont pas copiées sur le chemin, car elles sont hors périmètre.
- **Connecteurs.** Un connecteur converti devient un chemin ordinaire, comme avant.
