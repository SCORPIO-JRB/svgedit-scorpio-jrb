# Refonte de la sélection — corrections

Branche `refonte-selection-corrections`, partie de `refonte-selection-arbitrages`. Elle reçoit les corrections demandées après les arbitrages du 8 novembre, sans pull request vers `master` pour l'instant.

| N° | Défaut | Correction |
| --- | --- | --- |
| 10 | La conversion en chemin écrit `fill-opacity="null"` et prend le style courant au lieu de celui de la forme | le chemin prend le style propre de la forme ; plus aucune valeur `null` n'est écrite |
| 10 (suite) | La conversion perd `fill-rule`, `mask`, `class`, le titre et tout attribut hors d'une courte liste | le chemin garde tout ce que la forme a, sauf sa géométrie |
| 10 (export) | L'enregistrement retire les valeurs par défaut même quand un groupe les remplace, et les retire aussi du dessin ouvert | une valeur par défaut n'est omise que si c'est sans effet ; l'enregistrement ne modifie plus le dessin |

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

L'enregistrement retirait lui aussi les valeurs par défaut, de toutes les formes : c'est l'objet de la section 3.

## 3. Question 10 (export) — Valeurs par défaut à l'enregistrement

### Le défaut

À chaque enregistrement, l'export retirait les valeurs par défaut de tous les éléments (`stroke-width="1"`, `fill-opacity="1"`, `stroke="none"`, `opacity="1"`, `rx="0"`…), sans regarder le contexte. Il les retirait aussi du dessin ouvert, pas seulement du fichier. Constaté dans l'éditeur :
- **Le trait.** Un rectangle au trait de 1, dans un groupe au trait de 5, passait à 5 dès l'enregistrement, et le fichier le gardait à 5.
- **Les coins arrondis.** Un rectangle `rx="0" ry="10"` perdait son `rx="0"`. Or un `rx` absent prend la valeur de `ry` : les coins devenaient arrondis.
- **Le dessin.** Avec un trait de 1 choisi dans le panneau, une forme dessinée dans un groupe ouvert au trait de 5 n'avait pas d'attribut et s'affichait à 5, alors que le panneau indiquait 1.
- **Le collage.** Un groupe collé perdait le trait de 1 de ses enfants. Chaque enfant était créé dans le calque, nettoyé là, puis déplacé dans son groupe.

### La règle de l'art

Un éditeur conserve le document ; l'optimisation est un choix explicite à part (Inkscape : « SVG Inkscape » et « SVG simple » gardent tout, « SVG optimisé » passe par Scour). Un optimiseur ne retire une valeur par défaut que si c'est sans effet. SVGO (`removeUnknownsAndDefaults`) exige qu'aucun parent ne fixe la propriété, que l'élément n'ait pas d'`id` (il pourrait être réutilisé par un `<use>`) et qu'aucune règle CSS ne cible l'attribut. L'option retenue (B) garde l'allègement de SVG-Edit, mais avec ces précautions.

### La correction

Une valeur par défaut n'est omise que si c'est sans effet :
- **Propriétés héritées** (`stroke`, `stroke-width`, `stroke-dasharray`, `stroke-linejoin`, `stroke-linecap`, `stroke-opacity`, `fill-opacity`) : omises seulement si le parent transmet lui-même la valeur initiale. L'ancêtre le plus proche qui fixe la propriété décide, par son attribut `style`, par une règle d'une feuille de style du dessin (`<style>`) ou par son attribut. Sans ancêtre qui la fixe, la valeur est la valeur initiale.
- **Élément réutilisé.** Un élément qu'un `<use>` réutilise, lui ou l'un de ses ancêtres, garde ses valeurs : il hérite aussi du `<use>`. SVGO garde les valeurs de tout élément qui a un `id`. Ici, tous les éléments en ont un, donc seuls ceux réellement référencés par un `<use>` les gardent.
- **Propriétés non héritées** (`opacity`, `stop-opacity`) : toujours omises, comme avant ; aucun groupe ne les transmet.
- **`rx` et `ry`.** `rx="0"` n'est omis que si `ry` est absent ou nul, et inversement. Sur une ellipse, ils sont gardés, comme avant.
- **Feuilles de style de l'éditeur.** Elles ne comptent pas. Le mode « fil de fer » impose par CSS un trait noir à tout le dessin : la sortie ne dépend pas du mode d'affichage.

La règle s'applique partout où SVG-Edit allège un élément :
- **Enregistrement.** Le dessin n'est plus modifié : seules les valeurs omises manquent au fichier.
- **Création d'une forme** (dessin, collage, extensions par `addSVGElementsFromJson`). Le nettoyage se fait une fois l'arbre entier en place, donc chaque enfant d'un groupe collé est jugé dans son groupe.
- **Presse-papiers du système** (M7). La copie est un document autonome : un élément copié seul n'a plus de groupe, et ses valeurs par défaut sont omises comme avant.

## 4. Ce qui change dans la sortie

La sortie enregistrée change pour la conversion en chemin :
- **Forme convertie sans clic préalable** (section 1). Elle garde son propre style au lieu de prendre le style courant.
- **Opacité** (section 1). Une forme opaque à 50 % le reste une fois convertie. Une forme sans opacité ne reçoit plus l'opacité courante.
- **Attributs auparavant perdus** (section 2). `fill-rule`, `mask`, `class`, le titre, etc. sont enregistrés sur le chemin.
- **Forme cliquée puis convertie, sans attribut auparavant perdu.** Sortie identique : l'export retirait déjà les « null », et les attributs gardent leur ordre.

Elle change aussi, pour tout dessin, là où une valeur par défaut omise aurait changé le rendu (section 3) : un trait de 1 dans un groupe au trait plus large, `rx="0"` à côté d'un `ry` non nul, un élément réutilisé par un `<use>` dans un groupe qui fixe la propriété. Ailleurs, les valeurs par défaut sont omises comme avant.

Les formes et textes dessinés après un clic gardent la même sortie et le même rendu qu'avant, y compris dans un groupe. Seuls les attributs « null » disparaissent du document ouvert.

Comparaison avec `refonte-selection-arbitrages` (`06a75f9`), sur 73 scénarios :
- 15 allers-retours d'import et d'export sur 15 sont identiques ;
- 69 scénarios sur 73 sont identiques ;
- les 4 différences sont attendues :
  - « convert to path », une ellipse convertie par l'API sans clic : `fill="#FF0000" stroke="#000000" stroke-width="5"` devient `fill="#a63"`, son propre style ;
  - « convert several to paths », un rectangle à 50 % d'opacité converti avec deux autres formes : `opacity="0.5"` est conservé ;
  - « convert to path keeps all the shape has », une ellipse avec `fill-rule`, `stroke-miterlimit`, `class` et un titre : le chemin les garde tous ;
  - « save keeps the defaults that matter » : le rectangle `g1`, au trait de 1 dans un groupe au trait de 5, garde `stroke-width="1"`, et `r1` garde `rx="0"` à côté de `ry="10"`. `opacity="1"` reste omis.

Par rapport à la correction précédente (`b05993a`), seul ce dernier scénario change : les 72 autres sont identiques.

Temps d'enregistrement, sur un dessin de 3 000 rectangles portant chacun 5 valeurs par défaut : 135 ms contre 129 ms au premier enregistrement. Les suivants paraissaient plus rapides auparavant, car le premier avait déjà retiré ces attributs du dessin.

### API des extensions

- `svgCanvas.convertToPath(elem)` donne au chemin tous les attributs de `elem` sauf sa géométrie, ainsi que son titre, sa description et ses métadonnées. Avant, il prenait le style courant et une courte liste d'attributs.
- `svgCanvas.convertSelectedToPaths()` suit la même règle et ne touche plus au style courant.
- `convertToPath(elem, attrs, svgCanvas)` du module `utilities` : `attrs` devient facultatif et s'applique par-dessus les attributs de la forme. Avant, c'était le style complet du chemin.
- `assignAttributes(elem, attrs)`, et donc `addSVGElementsFromJson`, retire l'attribut pour une valeur `null`, comme pour `undefined`, au lieu d'écrire « null ».
- `svgCanvas.svgToString(elem, indent)` ne modifie plus `elem` : les valeurs par défaut sont omises à l'écriture, selon la règle de la section 3.
- `cleanupElement(elem)` suit la même règle. Nouveaux, dans le module `utilities` :
  - `isRemovableDefault(elem, name)` dit si un attribut peut être omis ;
  - `cleanupElements(elems)` nettoie plusieurs éléments d'un même dessin ;
  - `getDefaultsContext(elem)` donne ce que la règle doit savoir du dessin (`<use>`, feuilles de style).
- `addSVGElementsFromJson(data)` nettoie les éléments créés une fois l'arbre entier en place, et non plus chacun au moment de sa création.

## 5. Tester en local (PowerShell)

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
5. Dans la source, collez `<g stroke="#000" stroke-width="5"><rect x="400" y="300" width="80" height="60" fill="#c00" stroke-width="1"/></g>` et `<rect x="250" y="300" width="80" height="60" fill="#c00" rx="0" ry="10"/>`. Enregistrez (Ctrl+S), puis rouvrez le fichier. Le premier rectangle garde son trait fin et le second ses coins carrés. Avant la correction, le trait passait à 5 dès l'enregistrement et les coins s'arrondissaient.

## 6. Tests ajoutés

**Tests unitaires :**
- `tests/unit/utilities-extra2.test.js` : `assignAttributes` retire l'attribut pour `null`, y compris avec un espace de noms ;
- `tests/unit/json.test.js` : une forme créée avec le style courant ne reçoit pas les attributs à `null`, ni aucune valeur « null » ;
- `tests/unit/utilities.test.js` :
  - la conversion garde tous les attributs sauf la géométrie, espaces de noms et valeurs par défaut compris, ainsi que le titre (une copie). Elle laisse de côté le repère de connecteur et les animations ;
  - les attributs déjà reportés gardent leur ordre ;
- `tests/unit/utilities-extra2.test.js`, valeurs par défaut :
  - une valeur que rien ne remplace est retirée, comme avant ;
  - une valeur qu'un groupe remplace est gardée, que le groupe la fixe par attribut, par `style` ou par feuille de style ;
  - elle est retirée si le groupe transmet aussi la valeur initiale ;
  - un élément réutilisé par un `<use>` garde la sienne ;
  - la règle de `rx` et `ry`, et le cas d'un élément hors du dessin ;
- `tests/unit/json.test.js` : un enfant créé avec son groupe est nettoyé dans son groupe, pas dans le calque.

**`tests/e2e/corrections.spec.js` (12 tests, sans erreur dans la page) :**
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
- rectangle au trait de 1 dans un groupe au trait de 5 : le chemin garde le trait de 1 ;
- enregistrement d'un dessin où un groupe, une feuille de style ou un `<use>` remplace une valeur par défaut :
  - la valeur est enregistrée, tout comme `rx="0"` à côté de `ry="10"` ;
  - les valeurs que rien ne remplace sont omises ;
  - le dessin ouvert n'est pas modifié, et le fichier rouvert s'affiche à l'identique ;
- rectangle dessiné au trait de 1 dans un groupe ouvert au trait de 5 : il garde son trait, à l'écran comme à l'enregistrement ;
- groupe collé dont un enfant a un trait de 1 : l'enfant le garde.

Les 7 premiers tests échouent sur `refonte-selection-arbitrages`. Les 8e et 9e échouent sur `4bb1cf5`, et les 3 derniers sur `b05993a`. Tous passent sur cette branche.

**`tests/output/`** : nouveaux scénarios « convert several to paths », « convert to path keeps all the shape has » et « save keeps the defaults that matter ».

**Résultats :** lint propre, 759 tests unitaires et 284 tests E2E passent ; comparaison de sortie en section 4.

## 7. Limites connues

- **Feuilles de style hors du dessin.** La règle ne connaît que les `<style>` du dessin. Une page web qui affiche le fichier et fixe, par CSS, le trait d'un groupe peut encore remplacer une valeur omise.
- **Sélecteurs d'attribut.** Une règle CSS qui cible un attribut (`[stroke-width="1"]`) n'est pas prise en compte, contrairement à SVGO. Pour une même propriété, la règle de feuille de style retenue est la dernière qui s'applique, sans calcul complet de priorité.
- **`<use>` d'un autre fichier.** Un élément réutilisé depuis un autre fichier ne peut pas être repéré.
- **Animations (SMIL).** Elles ne sont pas copiées sur le chemin, car elles sont hors périmètre.
- **Connecteurs.** Un connecteur converti devient un chemin ordinaire, comme avant.
