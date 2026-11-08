# Refonte du canevas — étapes U0 et U1

Branche `refonte-canevas-u0-u1`, partie de `phase-0-securite`. Ces deux étapes ouvrent la refonte décrite dans le document « Refonte UX du canevas SVG-Edit » :

- **U0** pose le filet de sécurité : un banc de performance et des tests de vrais gestes à la souris.
- **U1** corrige et accélère le canevas sans changer la disposition de l'interface.

La sortie SVG reste identique à celle de la version de départ. Scorp-io lit déjà les fichiers produits par SVG-Edit : c'est le premier critère de non-régression.

## 1. Ce qui change pour l'utilisateur

### Raccourcis (Q1)

| Raccourci | Avant | Maintenant |
| --- | --- | --- |
| Cmd+Z sur Mac | ne faisait rien | annule |
| Ctrl+Maj+Z, Cmd+Maj+Z | annulait une seconde fois | rétablit (Ctrl+Y fonctionne toujours) |
| Ctrl+Maj+← / → | ne se déclenchait jamais | rotation de 15° (Ctrl+← / → : 1°) |
| Maj+D | ouvrait les propriétés du document et dupliquait | ouvre seulement les propriétés |
| Maj+P | changeait d'élément et activait l'outil chemin | change seulement d'élément |
| Z | annoncé, sans effet | outil loupe |
| V, H | — | outil Sélection, outil Main |

Toutes les sources de raccourcis (boutons, menus, table de l'éditeur) partagent désormais une seule normalisation : `src/editor/shortcuts.js`.

- **Modificateur principal.** `ctrl` désigne Cmd sur Mac et Ctrl ailleurs.
- **Modificateurs pris en compte.** Maj et Alt comptent toujours dans le raccourci.
- **Chiffres avec Maj.** Ils sont lus par touche physique : Maj+1 fonctionne en QWERTY comme en AZERTY.

### Zoom (Q2)

- **Ctrl/Cmd+molette et pincement du trackpad.** Ils zooment autour du curseur, proportionnellement au geste. Alt+molette reste un alias.
- **Maj+molette.** Elle fait de nouveau défiler horizontalement (elle zoomait).
- **Raccourcis de vue :**
  - Maj+0 : 100 % ;
  - Maj+1 : tout afficher ;
  - Maj+2 : la sélection ;
  - Maj+3 : la page ;
  - Ctrl+« + » et Ctrl+« − » : palier suivant ou précédent.
- **Bornes uniques.** Le zoom va de 1 % à 1 000 % par tous les chemins (Ctrl+↑ ne le borne plus seul). 6 400 % viendra avec le canevas infini (U3).

### Gestes et sélection (Q6, Q7)

| Geste | Avant | Maintenant |
| --- | --- | --- |
| Seuil avant de déplacer | 4 unités du document (0,4 px à 10 %, 40 px à 1 000 %) | 3 px à l'écran, quel que soit le zoom |
| Flèches | 1 px à l'écran (le pas changeait avec le zoom) | 1 unité du document ; Maj : 10 ; avec la grille, un pas de grille |
| Alt + poignée | — | redimensionne depuis le centre |
| Maj + poignée | proportions, sauf pour les images (logique inversée) | proportions pour tous les éléments |
| Maj + rotation | pas de 45° | pas de 15° |
| Alt + glisser | clonait la sélection précédente dès le clic, même sans glisser et même en dessinant | duplique ce que l'on glisse, au début du glisser, et déplace la copie |
| Maj + rectangle de sélection | remplaçait la sélection | ajoute à la sélection |
| Maj + clic sur un élément sélectionné | échouait sur les groupes, panneaux non rafraîchis | le retire de la sélection |
| Clic sur un membre d'une multi-sélection | sans effet | ne garde que cet élément |
| Échap | revenait à la sélection depuis certains outils | remonte d'un niveau : outil, édition de nœuds, groupe ouvert, sélection |

### Poignées (Q8)

Les poignées sont des carrés blancs de 8 px à bord bleu, avec une zone de prise invisible de 16 px. Le cadre de sélection est en trait plein, et le rectangle de sélection est plus discret.

### Commandes sur toute la sélection (Q10)

- **Ordre d'affichage.** Premier plan, arrière-plan, monter et descendre s'appliquent à toute la sélection et gardent son ordre relatif. Avant, seul le premier élément bougeait. Une multi-sélection monte ou descend d'un rang parmi ses voisins ; un élément seul garde le comportement actuel, fondé sur les recouvrements.
- **Nouveaux raccourcis :**
  - Ctrl+D : dupliquer ;
  - Ctrl+G : grouper ;
  - Ctrl+Maj+G : dégrouper ;
  - Ctrl+Maj+] et Ctrl+Maj+[ : premier plan et arrière-plan (annoncés depuis longtemps, ils marchent enfin).
- **Équivalents pour AZERTY.** Ils ne dépendent pas de la disposition du clavier : Ctrl+Page préc. et Ctrl+Page suiv. pour un rang, Ctrl+Début et Ctrl+Fin pour les extrêmes.

### Fiabilité (Q9)

- **« Ouvrir ».** Le document n'est remplacé qu'après la lecture du nouveau fichier. Annuler le sélecteur laissait un document vide.
- **Confirmations.** Déplacer vers un calque et abandonner les modifications de la source attendent maintenant la réponse.
- **Règles.** Décocher « Afficher les règles » les masque.
- **Dépôt d'un fichier qui n'est pas une image.** La boîte « Chargement… » se ferme et un message en donne la raison.
- **Image déposée.** Elle forme une seule étape d'annulation. Elle n'était pas enregistrée du tout.
- **Groupe pivoté.** L'ouvrir enregistre la réécriture des enfants dans l'historique.
- **Menu contextuel.** Les entrées ajoutées par une extension apparaissent dans le menu du canevas. L'ajout levait une erreur.
- **Boutons masqués selon le type d'élément.** Convertir en chemin, réorienter, adresse d'image et lien étaient appelés par leur identifiant et jamais masqués.

## 2. Performances

Mesures avec `npm run bench`, sur Chromium headless : N rectangles dans un calque, tous sélectionnés. Les fichiers de résultats sont dans `tests/perf/results/`.

| Interaction | Avant, N = 2 000 | Après, N = 2 000 | Avant, N = 5 000 | Après, N = 5 000 |
| --- | --- | --- | --- | --- |
| Tout sélectionner | 1 217 ms | 110 ms | 6 926 ms | 351 ms |
| Un mouvement de glisser | 1 301 ms | 79 ms | 8 021 ms | 121 ms |
| Relâchement du glisser | 847 ms | 111 ms | 6 672 ms | 204 ms |
| Annuler le déplacement | 7 799 ms | 43 ms | 64 039 ms | 112 ms |
| Rétablir | 7 895 ms | 21 ms | 65 269 ms | 53 ms |
| Zoom ×2 | 968 ms | 41 ms | 6 945 ms | 93 ms |
| Rectangle de sélection, un mouvement | 596 ms | 60 ms | 3 988 ms | 221 ms |

Causes corrigées :

- **Historique.** Une annulation groupée rafraîchissait toute l'interface une fois par élément. Elle envoie maintenant une seule notification.
- **Lectures de géométrie.** Elles étaient intercalées avec des écritures, ce qui forçait une mise en page par élément. Toutes les boîtes sont maintenant lues avant toute écriture ; le glisser réutilise celles lues au départ.
- **Multiplication de matrices.** Elle allouait des objets à chaque facteur.
- **Panneau contextuel.** Il parcourait tout le document une vingtaine de fois à chaque mise à jour.
- **Zoom.** Il était appliqué deux fois.

Les critères de U1 sont atteints à 2 000 objets : tout sélectionner en moins de 150 ms, glisser en moins de 100 ms par mouvement, annuler en moins de 50 ms. Descendre sous 16 ms par mouvement à 5 000 objets demande la couche d'interaction agrégée de l'étape U2.

## 3. Ce qui ne change pas

- **Sortie SVG.** La sortie de cette branche a été comparée à celle de `phase-0-securite`, compilée séparément. La première comparaison partageait par erreur le cœur `svgcanvas` des deux builds ; elle a été refaite pendant M1 avec un cœur propre à chaque build, avec le même résultat (voir `docs/refonte-selection-m1.md`, section 2) :
  - aller-retour import puis export de tous les SVG du dépôt : 15 sur 15 identiques ;
  - 12 scénarios identiques à l'octet près : déplacements, redimensionnement, rotation, groupes, clonage, alignement, symétrie, ordre, conversion en chemin, annulations, et glisser de toute la sélection à la souris.
- **API des extensions.**
  - Mêmes événements.
  - `requestSelector(elem, bbox)` et `resize(bbox)` acceptent un paramètre facultatif de plus.
  - Les poignées gardent leurs identifiants `selectorGrip_*`, mais ce sont désormais des `rect`.
  - Le nouveau réglage `shiftWheelZoom` vaut `true` par défaut dans le cœur et `false` dans l'éditeur.

## 4. Tester en local (PowerShell)

```powershell
cd svgedit-scorpio-jrb
git fetch origin
git checkout refonte-canevas-u0-u1
git pull
npm ci
npm run build
```

Tests automatiques : `npm run lint`, puis `npm test` (unitaires et E2E). Le banc demande l'éditeur servi sur le port 8000. Dans un premier terminal :

```powershell
npm run start:e2e
```

Dans un second terminal :

```powershell
npm run bench
```

Vérifications manuelles conseillées, dans l'éditeur ouvert sur `http://localhost:8000/index.html` :

1. Dessinez deux rectangles. Sélectionnez-les avec Maj+clic, puis appuyez sur Ctrl+Maj+] : ils passent au premier plan dans le même ordre. Ctrl+Z les remet en place.
2. Ctrl+molette au-dessus d'un objet : il reste sous le curseur pendant le zoom.
3. Alt+glisser un objet : une copie part avec la souris, l'original reste en place.
4. Alt sur une poignée latérale : l'objet grandit des deux côtés.
5. Double-cliquez sur un groupe, sélectionnez un enfant, puis appuyez deux fois sur Échap : le groupe est d'abord sélectionné, puis plus rien.

## 5. Tests ajoutés et modifiés

- **Ajoutés :**
  - `tests/e2e/gestures.spec.js` : caractérisation des gestes conservés ;
  - `tests/e2e/shortcuts-zoom.spec.js` : Q1 et Q2, dont un test qui simule un Mac ;
  - `tests/e2e/gestures-u1.spec.js` : Q6 à Q8 ;
  - `tests/e2e/reliability-u1.spec.js` : Q9 et Q10 ;
  - `tests/unit/shortcuts.test.js` ;
  - `tests/perf/canvas-bench.mjs`, avec ses budgets.
- **Modifiés pour un changement voulu :**
  - `event.test.js` : le seuil de glisser passe à 3 px écran ;
  - `select-module.test.js` : poignées carrées ;
  - `contextmenu-extra.test.js` : le test validait l'injection cassée ;
  - `mainmenu.test.js` et `mainmenu.spec.js` : les simulacres n'avaient pas `rulers.display` ;
  - `group-transforms.spec.js` : Ctrl+Maj+G ne faisait rien avant, le test vérifiait donc un état non dégroupé ; il vérifie maintenant que le groupe disparaît sans que les positions bougent.

Bilan : lint propre, 640 tests unitaires et 126 tests E2E verts.

## 6. Limites connues et suite

- **Alt+glisser** produit deux étapes d'annulation : la copie, puis le déplacement. Une seule étape viendra avec l'historique regroupé (U2).
- **Échap en édition de nœuds** revient à la sélection, mais sans resélectionner le chemin.
- **N et S** (nouveau, enregistrer) restent sans modificateur, en attendant la décision sur le schéma de raccourcis.
- **Le magnétisme aux objets, les guides intelligents et le canevas infini** relèvent des étapes U2 et U3.
