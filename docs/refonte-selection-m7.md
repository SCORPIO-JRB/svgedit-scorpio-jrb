# Refonte de la sélection — lot M7 « Presse-papiers et duplication »

Branche `refonte-selection-m7`, partie de `refonte-selection-m6` (correctif du connecteur compris).

- **Presse-papiers du système.** La copie part aussi dans le presse-papiers du système, en SVG. Un SVG venu d'un autre logiciel ou d'un autre navigateur se colle comme des objets modifiables, après le filtre d'import.
- **Nouveaux raccourcis.** Ctrl+Maj+V colle en place ; Ctrl+Alt+C et Ctrl+Alt+V copient et collent les propriétés.
- **Ctrl+D répété.** Ctrl+D reprend le décalage d'une copie déplacée.

Le SVG écrit par les opérations existantes ne change pas.

## 1. Ce qui change pour l'utilisateur

### Ctrl+D répète le dernier décalage

Dupliquez, déplacez la copie, puis faites Ctrl+D : la nouvelle copie se place par rapport à la précédente comme celle-ci par rapport à l'original. Ctrl+D répété produit ainsi une série régulière.

- **La première copie** se place toujours à 20 vers la droite et 20 vers le bas, comme avant. Ctrl+D sans rien déplacer garde ce décalage.
- **Tous les déplacements comptent** : glisser, flèches, champs X et Y, alignement.
- **Après un Alt+glisser,** Ctrl+D répète le glisser.
- **Alt+flèche** copie à 1 ou 10 pixels ; Ctrl+D répète ensuite ce décalage.
- **La touche D, la touche C et le bouton Dupliquer** du panneau suivent la même règle que Ctrl+D.
- **Retour au décalage de 20.** Il s'applique quand une copie a été replacée exactement sur son original (pour ne pas empiler des copies invisibles). Il s'applique aussi quand la sélection n'est plus faite des dernières copies.
- **Annulation.** Chaque Ctrl+D fait une étape d'annulation.

### Presse-papiers du système

**Copier.** Ctrl+C, Ctrl+X et les entrées Copier et Couper du menu contextuel remplissent le presse-papiers de l'éditeur, comme avant. Ils écrivent en plus la sélection dans le presse-papiers du système, en `text/plain` et en `image/svg+xml`. Ce texte est un document SVG autonome :
- il est écrit comme le fichier enregistré ;
- les dégradés et symboles utilisés sont repris ;
- les coordonnées sont conservées, et un `viewBox` cadre la copie trait compris.

On peut le coller dans un éditeur de texte, dans Inkscape, ou dans SVG-Edit ouvert dans un autre navigateur.

**Coller (Ctrl+V).**
- **SVG venu d'ailleurs.** Si le presse-papiers du système contient un SVG que l'éditeur n'a pas écrit lui-même (autre logiciel, autre navigateur), ce SVG est collé comme des objets modifiables, et non comme une image.
- **Sinon,** l'éditeur colle son propre presse-papiers exactement comme avant, avec la reprise des définitions entre onglets et la question posée en cas de conflit.
- **Texte qui n'est pas du SVG :** c'est aussi le presse-papiers de l'éditeur qui est collé.

Le SVG venu d'ailleurs passe par :
- **Le filtre d'import de la phase 0,** le même que pour un fichier ouvert. Il retire les scripts, les gestionnaires d'événements (`onclick`…), les liens `javascript:`, les références externes et le CSS dangereux.
- **Des identifiants renouvelés.** Rien du dessin n'est remplacé. Les définitions rejoignent les `<defs>` du dessin.
- **Les styles par classe** (`<style>.cls-1{fill:…}`, tels qu'Illustrator les écrit) deviennent des attributs, et la feuille de style est retirée. Laissée dans le dessin, elle s'appliquerait à tout le dessin : deux SVG collés qui nomment chacun une classe `cls-1` se recoloreraient l'un l'autre.
- **Sa taille déclarée.** Les objets gardent la taille que le SVG déclare. Un SVG en millimètres arrive dans un groupe mis à l'échelle (×3,78) qu'on peut dégrouper. Le groupe garde aux traits leur épaisseur relative.
- **L'ouverture des calques.** Les calques d'un dessin SVG-Edit sont ouverts : leurs objets sont collés, pas le calque lui-même.
- **Des identifiants pour chaque objet,** comme pour les objets dessinés dans l'éditeur ; le connecteur en a besoin.
- **Une seule étape d'annulation.**

Dans un champ du panneau, Ctrl+C et Ctrl+V copient et collent du texte comme d'habitude.

### Coller en place

Ctrl+Maj+V (Cmd+Maj+V sur Mac) colle les objets à leurs coordonnées d'origine. L'entrée « Coller sur place » du menu existait déjà ; elle a maintenant un raccourci. Un SVG venu d'ailleurs se colle à ses propres coordonnées. Le menu affiche aussi les raccourcis de Coller et de Coller sur place.

### Copier et coller les propriétés

**Ce qui est copié.** Ctrl+Alt+C (Cmd+Option+C sur Mac) copie l'aspect du premier objet sélectionné, ou du premier objet d'un groupe sélectionné :
- le remplissage ;
- le trait : couleur, épaisseur, opacité, pointillés, extrémités et jonctions ;
- l'opacité ;
- pour un texte, la police : famille, taille, graisse, style, alignement, espacements, soulignement.

**Où ça s'applique.** Ctrl+Alt+V donne ces propriétés aux objets sélectionnés, en une étape d'annulation. Sur un groupe, elles vont à ses objets, comme la couleur de remplissage du panneau.
- **Seules les propriétés qui ont un sens pour les deux objets passent.** Copiées d'un rectangle, elles ne touchent pas à la police d'un texte. Une ligne ne reçoit pas de remplissage.
- **Propriété absente.** Une propriété que l'objet source n'a pas est retirée de l'objet cible, pour qu'il lui ressemble. Une couleur que la source tient de son groupe compte.
- **Dégradé absent.** Un dégradé que le dessin ne contient pas (copié depuis un autre dessin) est laissé de côté.

**Ce qui n'est pas copié :**
- **Les marqueurs (flèches) et le flou.** L'éditeur en crée un par objet ; les partager lierait les objets entre eux.
- **La géométrie.** La position, la taille et les transformations ne sont jamais copiées.

**Menu.** Le menu contextuel offre « Copier les propriétés » et « Coller les propriétés ». Ces entrées sont grisées quand elles ne peuvent pas s'appliquer.

### Corrections au passage

- **Raccourcis après le menu contextuel.** Après un clic dans le menu contextuel, l'entrée cliquée gardait le focus. Les raccourcis clavier (Suppr, Ctrl+V, Ctrl+Z…) restaient sans effet jusqu'à un clic sur le canevas. Le focus revient maintenant à la page.
- **Raccourcis avec Alt sur Mac.** La touche Option change le caractère des lettres (Option+C tape « ç ») : les raccourcis Mod+Alt+lettre sont lus par touche physique.

## 2. Ce qui ne change pas

### Sortie SVG

La comparaison avec M6 (`952a59d`, correctif du connecteur compris) par les scripts de `tests/output/` donne :
- **allers-retours :** 15 sur 15 identiques ;
- **scénarios :** 65 sur 65 identiques, sans aucune différence attendue.

Trois scénarios sont nouveaux, parce que M7 touche au presse-papiers et à la duplication :
- copier puis coller sur place ;
- couper puis coller en un point ;
- Ctrl+D deux fois puis Alt+→, tapés au clavier.

### API des extensions

**Canevas.** Nouvelles méthodes :

| Méthode | Rôle |
| --- | --- |
| `duplicateSelectedElements(offset?)` | Ctrl+D ; sans décalage, applique la règle de répétition |
| `getDuplicateOffset(elements?)` | Le décalage que Ctrl+D donnerait |
| `rememberDuplicate(copies, offsetOrOriginals)` | Mémorise une duplication, avec son décalage ou ses originaux |
| `getClipboardSvg()` | Le texte SVG du presse-papiers de l'éditeur |
| `pasteSvgString(text, type?, x?, y?)` | Colle un SVG externe ; `type` comme pour `pasteElements` ; renvoie les objets collés, ou `null` si ce n'est pas du SVG |
| `copySelectedProperties()`, `pasteProperties()` | Ctrl+Alt+C et Ctrl+Alt+V |
| `hasCopiedProperties()`, `getCopiedProperties()` | Lecture des propriétés copiées |

**Modules du canevas :**
- `core/svg-paste.js`, nouveau : `parseSvgText`, `parseStyleRules`, `inlineStyleSheets`, `pasteSvgString` ;
- `core/paste-properties.js`, nouveau ;
- `core/paste-elem.js` exporte `finishPaste` ;
- `core/clipboard.js` exporte `createClipboardSvg`. Les données du presse-papiers ont un champ `svg` ; les données plus anciennes, qui ne l'ont pas, se collent toujours.

**Éditeur :**
- nouveau module `src/editor/SystemClipboard.js` ;
- nouvelles méthodes `getViewCenter()`, `copyProperties()`, `pasteProperties()` et `updatePropertiesMenu()`.

**Raccourcis :**
- Ctrl+Maj+V, Ctrl+Alt+C et Ctrl+Alt+V sont ajoutés.
- Ctrl+C, Ctrl+X et Ctrl+V n'agissent plus directement à l'appui. L'événement du presse-papiers que le navigateur déclenche ensuite fait le travail ; si aucun événement ne suit, le presse-papiers de l'éditeur est utilisé seul, comme avant.

**Menu contextuel :**
- deux entrées, `copy_properties` et `paste_properties`, qui envoient l'événement `change` comme les autres ;
- les raccourcis s'affichent pour Coller et Coller sur place ;
- Coller est maintenant actif dès que le navigateur offre l'API du presse-papiers, même quand le presse-papiers de l'éditeur est vide.

**Traductions.** `tools.copy_properties` et `tools.paste_properties`, en français dans `lang.fr.js` et en anglais dans les autres langues.

**Stockage.** Les propriétés copiées sont gardées dans `sessionStorage`, clé `svgedit_properties`.

### Performances

**Copier.** Copier 2 000 objets prend 62 à 65 ms, contre 15 à 17 ms avant : le texte SVG est écrit à chaque copie. Les données du presse-papiers de l'éditeur passent de 333 000 à 533 000 caractères.

**Stockage plein.** Si le stockage de l'onglet est plein, la copie est gardée sans le texte SVG. Le presse-papiers du système n'est alors pas écrit, et Ctrl+V colle celui de l'éditeur.

**Banc** (`npm run bench`, 2 000 objets, deux passes alternées M6 puis M7) : mêmes valeurs aux écarts de mesure près, et tous les budgets sont respectés. Coller et dupliquer ne changent pas de coût.

## 3. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-selection-m7
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test`.

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` après `npm run start:e2e` :

1. **Série par Ctrl+D.** Dessinez un rectangle, faites Ctrl+D, glissez la copie vers la droite, puis Ctrl+D deux fois : les copies forment une rangée régulière.
2. **Alt+glisser.** Alt+glissez une forme vers le bas, puis Ctrl+D : la nouvelle copie suit le même pas.
3. **Copier vers un autre logiciel.** Sélectionnez des objets, Ctrl+C, puis collez dans le Bloc-notes : le texte SVG apparaît. Collez-le aussi dans Inkscape ou dans SVG-Edit ouvert dans un autre navigateur.
4. **Coller depuis un autre logiciel.** Ouvrez un fichier `.svg` dans le Bloc-notes, copiez tout, cliquez sur le canevas, puis Ctrl+V : les formes arrivent, modifiables, au milieu de la vue. Ctrl+Z les retire en une fois. Faites de même depuis Inkscape, Figma ou Illustrator.
5. **Coller en place.** Ctrl+Maj+V colle à l'endroit d'origine.
6. **Propriétés au clavier.** Sélectionnez une forme colorée, Ctrl+Alt+C, sélectionnez un texte, Ctrl+Alt+V : ses couleurs changent, sa police reste.
7. **Propriétés au menu.** Clic droit sur un objet : « Copier les propriétés », puis clic droit sur un autre : « Coller les propriétés ».

Avec Coller du menu contextuel, Chrome demande la première fois l'accès au presse-papiers, et Firefox affiche un bouton « Coller » à confirmer. Ctrl+V ne demande jamais rien.

### Comparer la sortie avec une autre version

Mode d'emploi des scripts de `tests/output/` : voir la documentation de M2, section 3. Pour M7, la référence est M6 :

```powershell
node tests/output/build-reference.mjs refonte-selection-m6 ..\ref-m6
npx vite preview --port 8010 --strictPort --outDir ..\ref-m6\dist\editor
```

Puis, avec la version courante servie sur le port 8000, sans différence attendue :

```powershell
node tests/output/compare-output.mjs --ref=http://127.0.0.1:8010 --new=http://127.0.0.1:8000
```

## 4. Tests ajoutés

**`tests/unit/clipboard-m7.test.js` (25 tests) :**
- **Ctrl+D :** première copie à 20, répétition exacte sans déplacement, série après déplacement, plusieurs objets, retour à 20, copies retirées par une annulation, Alt+flèche et Alt+glisser, une étape d'annulation.
- **Copie :** texte SVG avec ses définitions, sans modifier le document ; anciennes données sans texte.
- **SVG venu d'ailleurs :**
  - SVG sans espace de noms, refus de ce qui n'est pas du SVG ;
  - lecture des règles CSS, styles par classe devenus attributs ;
  - filtre d'import et identifiants renouvelés ;
  - définitions reprises, calques ouverts, taille déclarée.
- **Propriétés :** rectangle, texte, ligne, couleur tenue d'un groupe, objets d'un groupe, dégradé absent, rien de copié.
- **Raccourcis :** lecture de Mod+Alt+lettre par touche physique.

**`tests/e2e/clipboard-m7.spec.js` (15 tests) :**
- **Presse-papiers :**
  - Ctrl+C écrit le SVG, et Ctrl+V colle la copie de l'éditeur comme avant ;
  - Ctrl+Maj+V colle en place ;
  - Ctrl+X ;
  - un SVG externe passe le filtre et se colle en une étape ;
  - Ctrl+V colle au milieu de la vue ;
  - un texte non SVG laisse coller la copie de l'éditeur ;
  - le menu copie, et les raccourcis marchent juste après ;
  - le menu colle en place ;
  - un champ copie son texte, pas les objets.
- **Ctrl+D :** série après déplacement, décalage de 20 sans déplacement, après un Alt+glisser, touche et bouton D.
- **Propriétés :** au clavier avec annulation ; au menu, avec les entrées grisées.

**`tests/output/compare-output.mjs` :** trois scénarios sur le presse-papiers et la duplication.

Chaque test E2E vérifie aussi qu'aucune erreur n'atteint la console.

**Bilan :** lint propre, 735 tests unitaires et 247 tests E2E verts.

## 5. Limites connues et décisions à prendre

### Navigateurs

- **Chromium seul testé.** Les tests automatiques tournent sous Chromium. Sous Firefox, les événements du presse-papiers existent aussi, et si l'un d'eux ne vient pas, l'éditeur se rabat sur son propre presse-papiers. Une vérification manuelle sous Firefox reste à faire ; Safari n'est pas testé.
- **Format `image/svg+xml` natif : à décider.** La copie écrit `image/svg+xml` par l'événement du navigateur. Chrome le garde pour les pages web (autres onglets, Figma) mais ne transmet aux autres logiciels que le texte. Inkscape et la plupart des logiciels acceptent ce texte. Écrire le format SVG natif du système, que lit Illustrator par exemple, demanderait l'API asynchrone (`ClipboardItem`, Chrome 124 et plus).
- **Coller depuis le menu.**
  - **Accès refusé.** Si l'accès au presse-papiers est refusé, Coller du menu colle celui de l'éditeur.
  - **Entrée toujours active.** L'entrée Coller reste active même quand les deux presse-papiers sont vides ; un clic ne fait alors rien.
- **Copie qui n'atteint pas le système.** Quand une copie n'a pas pu écrire dans le presse-papiers du système, Ctrl+V colle le presse-papiers de l'éditeur jusqu'à la copie suivante, plutôt que le contenu plus ancien du système.
- **AltGr sous Windows.** AltGr équivaut à Ctrl+Alt. Sur les claviers où AltGr+C ou AltGr+V tape un caractère (polonais par exemple), le raccourci des propriétés prend le dessus, mais seulement quand le focus est sur le canevas, jamais dans un champ.

### SVG venu d'ailleurs

- **CSS.** Seules les règles simples sont reprises : sélecteurs par classe, type ou identifiant. `@media`, `@font-face`, la propriété `transform` en CSS et le raccourci `font` sont ignorés.
- **Coller en place** utilise les coordonnées des objets, sans le décalage du `viewBox`.
- **Référence vers une définition absente** du SVG collé : elle garde son nom, et peut désigner un objet du dessin qui porte le même identifiant. Ce cas est rare.
- **Connecteurs.** Ceux d'un autre éditeur ne sont pas raccrochés, puisque les identifiants sont renouvelés.

### Propriétés et Ctrl+D

- **Propriétés non copiées : à décider.** Les marqueurs et le flou ne sont pas copiés ; on peut revenir sur ce choix. Un groupe ne reçoit rien lui-même : ses objets reçoivent les propriétés. Les valeurs écrites dans un attribut `style` sont ignorées, l'import les convertissant déjà en attributs.
- **Mesure du décalage de Ctrl+D.** Le décalage est mesuré sur le cadre des copies, arrondi au nombre de décimales du document (2 par défaut). Une copie déplacée de 13,333 à 150 % de zoom répète donc 13,33.

### Suite

- **Réglage désactivable.** Les tests de M7 sont verts : aucun réglage n'a été ajouté.
- **Décisions toujours ouvertes.**
  - **M4 :** sens du champ angle « Mixte » ; X et Y, trait compris, d'un chemin ou d'un groupe seul ; largeur de la barre du haut.
  - **M6 :** portée des objets semblables ; groupe tourné ouvert par Ctrl+clic.
- **Lot suivant :** l'outil Échelle et le rangement (M9).
