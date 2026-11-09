# Plan v2 — lot V6 « Fichier »

Branche `v6-fichier`, partie de `v5-export`. Le plan v2 donne à V6 quatre sujets :

- les corrections de la section 7, décidées une à une ;
- les animations (D3) ;
- la prévisualisation (4.6) ;
- le champ Liaison (G3).

Ses critères de passage :

- les fichiers que SVG-Edit a déjà produits restent identiques ;
- les tests de survie des liaisons sont verts ;
- la prévisualisation est identique à l'export.

## 1. Ce qui était déjà fait

Le plan d'import fusionné dans `master` (lots 1 à 5) avait déjà traité une partie de la section 7 :

- **Animations SMIL.** Elles sont gardées sous liste blanche (jamais `href` ni `on*`, ni valeur `javascript:` ou `url()` externe) et mises en pause dans l'éditeur.
- **Métadonnées.** Les métadonnées RDF et les attributs des autres applications (`inkscape:label`) sont gardés.
- **Accessibilité.** `role` et `aria-*` sont gardés.
- **Identifiants en double.** Ils sont renommés à l'ouverture, références comprises, seulement en cas de conflit. Il en va de même au collage, à l'import et dans un `<svg>` imbriqué.
- **Valeurs par défaut.** Une valeur n'est omise que si le rendu ne change pas.
- **Définitions inutilisées.** Une référence dans un attribut quelconque, un `style` ou une feuille `<style>` garde sa définition.
- **Conversion en chemin.** L'objet garde son identifiant, sa classe et ses `data-*`.

V6 mesure ce qui restait, avec le rapport de fidélité de V0 (`npm run fidelity`), et le corrige.

## 2. Les corrections de la section 7

Chaque correction est active par défaut. Une application hôte peut la couper par l'option `fidelity`, par exemple `{ fidelity: { gradientUnits: false } }` ; l'éditeur écrit alors le fichier comme avant.

| Option | Ligne de la section 7 | Avant | Depuis V6 |
| --- | --- | --- | --- |
| `rawValues` | Attributs `data-*` numériques | `data-point="007"` devenait `"7"`, `0.125` devenait `0.13` | `data-*`, `id`, `class`, `role`, `aria-*`, `scorp_*`, `instanceId` et `representationId` sont écrits tels quels ; la géométrie reste arrondie |
| `styleProperties` | Styles en ligne et animations CSS | les propriétés sans attribut (`animation`, `transform-origin`…) étaient retirées ; un clic retirait le `style` de l'objet et de ses descendants | elles restent dans `style`, sous le même contrôle que les feuilles `<style>` ; un `style` dont rien n'est retiré reste tel que le fichier l'écrit ; un clic n'y touche plus |
| `attributes` | Attributs hors liste blanche | `paint-order`, `vector-effect`, `pointer-events`, `mix-blend-mode`, `isolation`, `pathLength`, `dx` et `dy` d'un texte, `target` d'un lien étaient retirés | ils sont gardés, un test par attribut |
| `gradientUnits` | Dégradés | un dégradé `userSpaceOnUse` était converti d'après le premier objet qui l'utilise, ce qui changeait le rendu des autres | un dégradé garde ses unités à l'ouverture et suit son objet quand il bouge, change de taille ou se retourne (correctif d'import de `master`, PR #5) ; avant, seul un dégradé partagé gardait les siennes |
| `layerOrder` | Objets hors calque | rangés dans un nouveau calque en fin de dessin, donc dessinés au-dessus des calques qu'ils précédaient | chaque suite d'objets entre deux calques va dans un calque à sa place |
| `emptyValues` | Métadonnées, espaces de noms | un attribut vide d'une autre application (`rdf:about=""`) était retiré | il est écrit |
| `nestedSvg` | `<svg>` imbriqué | le groupe que l'éditeur met autour restait dans le fichier : le marqueur qui devait le retirer n'était jamais écrit | le groupe est omis tant qu'il ne porte rien d'à lui ; un groupe venu du fichier reste |
| `stableSave` | (trouvé en mesurant) | réenregistrer un fichier enregistré inversait l'ordre des attributs de la racine, et un `<defs>` vide laissait une ligne vide à la première sauvegarde | réenregistrer un fichier enregistré donne le même texte |

L'éditeur ne laisse plus non plus son propre état dans un fichier. Il pose `pointer-events` sur les objets des calques et des groupes ouverts, et l'enregistrement le retirait seulement quand il ouvrait l'attribut `style`. Désormais, il ne l'écrit plus. Cet ajout passait aussi par `elem.style`, si bien que le navigateur réécrivait tout l'attribut : `fill: #123` devenait `fill: rgb(17, 34, 51)` et une animation était détaillée propriété par propriété. Il passe maintenant par le texte de l'attribut (`setStyleProperty`).

Restent hors de ces corrections : les nombres de la géométrie, toujours arrondis à deux décimales (le plan ne les compte pas dans la section 7), la racine (V5) et les identifiants en double, renommés parce qu'ils sont en conflit.

## 3. Animations (D3)

Les animations SMIL étaient déjà gardées et mises en pause. Les animations CSS du dessin (`@keyframes` et propriété `animation`) sont maintenant figées elles aussi pendant l'édition, par une règle de l'éditeur. Le dessin montre les valeurs qu'il enregistre, et la géométrie ne bouge pas sous la souris. Le fichier les garde, et la prévisualisation les joue.

## 4. Prévisualisation (4.6)

▷, dans le groupe de vue, montre le fichier exact que l'enregistrement écrirait, sans aucune interface d'édition. Échap ou « Retour à l'édition » ramène à l'édition. La commande `preview` est aussi dans la palette Ctrl+K et existe dans la disposition classique.

- Le fichier est affiché comme une image de son propre texte (un blob `image/svg+xml`). Un document affiché comme image n'exécute aucun script et ne charge rien du réseau : c'est le cadre isolé du plan.
- Les animations SMIL et CSS jouent.
- Une image externe du dessin n'est pas chargée.
- La page est dessinée en blanc, comme dans le canevas, et le fichier est mis à la taille de l'écran.
- Aucune touche n'atteint l'éditeur tant qu'elle est ouverte.
- L'événement `se-preview` part du conteneur à l'ouverture (avec le texte) et à la fermeture.

Le panneau de valeurs de test qui alimenterait les liaisons attend leur format (D4).

## 5. Identité et liaison (G3)

La section Identité de l'inspecteur devient « Identité et liaison » :

- **Identifiant.** Le champ ID renomme l'objet en une étape d'annulation, et les références du dessin suivent : `href="#id"`, `url(#id)`, `begin="id.click"`, un connecteur, un sélecteur `#id` d'une feuille de style. Un identifiant déjà pris, par le dessin ou par l'éditeur, est refusé avec un message. Avant, il était donné quand même et deux éléments le partageaient. Un nom qui n'est pas un identifiant XML est refusé aussi.
- **Liaison.** Ce champ montre les attributs SCorp-io de l'objet (`scorp_*`, `instanceId`, `representationId`) et le nombre d'éléments du dessin qui le désignent. Sans cela, il affiche « Aucune liaison connue ».
- **Données.** Les `data-*` de l'objet sont modifiables en place, peuvent être retirées (−) et ajoutées (« Ajouter une donnée »), chaque fois en une étape d'annulation.

Un objet est lié s'il porte un attribut SCorp-io ou un `data-*`, ou si un autre élément du dessin le désigne. Tant que le format des liaisons n'est pas fixé (D4), c'est la définition retenue. L'éditeur demande avant de lui faire perdre sa liaison :

- **Dégrouper** un groupe, un lien ou une référence liés : « L'objet « cta-1 » est lié. Il porte data-tag. Le dégrouper retire son identifiant et ses attributs : une liaison SCorp-io qui le désigne sera perdue. » La question passe par Ctrl+Maj+G, le bouton, la barre contextuelle et le menu contextuel. Un groupe sans liaison se dégroupe sans question.
- **Renommer** un identifiant lié : les références du dessin suivront, mais une liaison SCorp-io qui désigne l'ancien nom sera perdue.

Le canevas expose `getBinding(element)`, `getReferencesTo(id)`, `renameElementId(element, id)` et `setElementData(element, nom, valeur)`.

## 6. Corrigés au passage

- **Boutons des questions.** Le bouton principal des boîtes de question était illisible, dans les deux thèmes, depuis V1 : le `<button>` natif du bouton elix gardait son fond gris clair sous un texte blanc.
- **Champs de texte de l'inspecteur.** Les champs `se-input` (identifiant, classe, titre…) n'avaient pas de nom accessible ; ils prennent celui de leur infobulle, comme `se-spin-input`.

## 7. Fichiers

- `packages/svgcanvas/core/fidelity.js` : les options des corrections.
- `packages/svgcanvas/core/sanitize.js` : la liste blanche élargie, les propriétés de style gardées.
- `packages/svgcanvas/core/svg-exec.js` : l'écriture (valeurs brutes, style, attributs vides, `<svg>` imbriqué, racine, `<defs>` vide), les dégradés partagés, `getBinding`, `getReferencesTo`, `renameElementId`, `setElementData`.
- `packages/svgcanvas/core/draw.js` : les objets hors calque.
- `packages/svgcanvas/core/utilities.js`, `layer.js` : `setStyleProperty` et `withoutStyleProperty`.
- `src/editor/binding.js` : la section Identité et liaison, les questions avant de dégrouper et de renommer.
- `src/editor/preview.js` : la prévisualisation ; une icône `play_arrow.svg`, listée dans `ICONS.md`, et le jeton `--se-preview-page`.

## 8. Vérifications

- **Fichiers que SVG-Edit a produits.** Chaque fichier du corpus est d'abord écrit par V5. Ce fichier, rouvert et enregistré par V6, ressort identique à l'octet près pour 17 sur 19. Le synoptique de la chaufferie en fait partie, alors que V5 lui-même le modifiait à chaque enregistrement. Les deux autres ne changent que par une correction voulue :
  - `controle-fonctionnalites-legitimes.svg` perd le `pointer-events:inherit` que l'éditeur y avait laissé ;
  - `sun.svg` perd la ligne vide de son `<defs>` vide, que V5 retirait déjà au second enregistrement.

  Un test E2E refait la même vérification dans une seule version, en coupant les corrections pour le premier enregistrement.
- **Sortie comparée à `v5-export`.** Les 73 scénarios d'édition sont identiques. 16 allers-retours sur 21 le sont aussi ; les 5 autres sont des fichiers venus d'autres logiciels, et chaque écart est une correction de la section 7 :
  - `section-7.svg` : unités du dégradé, `data-*`, style animé, `paint-order`, `<svg>` imbriqué ;
  - `arbelos.svg` : `target` ;
  - `sun.svg` : `rdf:about`, ligne vide ;
  - le synoptique : ordre de la racine ;
  - `controle-…` : style écrit tel quel, sans `pointer-events`.
- **Rapport de fidélité** (21 fichiers). Les pertes passent de 23 à 17 :
  - 12 identifiants en double renommés à cause de leur conflit, références comprises ;
  - un `font-size` passé du style à un attribut, sans changement de rendu ;
  - le `<defs>` vide de `sun.svg` ;
  - trois attributs « retirés » : deux artefacts d'appariement du rapport (`display` est bien gardé) et un lien `javascript:` retiré par sécurité.

  Les lignes « `data-*` arrondi », « espace de noms étranger retiré » et « unités de dégradé converties » ont disparu.
- **Tests de survie des liaisons** (V0) : 10 sur 10. Les trois tests qui décrivaient une perte décrivent maintenant la correction : `data-*` écrits tels quels, question avant de dégrouper, seul le doublon renommé.
- **Prévisualisation** : le texte affiché est identique à l'octet à l'enregistrement ; aucune requête réseau, même pour une image externe du dessin ; document et historique inchangés après un aller-retour ; ouverture en moins de 500 ms à 2 000 objets (environ 70 ms pour un petit dessin) ; axe (AA) sans violation dans les deux thèmes.
- **Lint** (`standard`, couleurs, libellés) : sans erreur.
- **Tests unitaires** : 962 sur 962, dont 27 cas pour V6 (`fichier-v6.test.js`). Trois tests anciens décrivaient l'ancien comportement et ont été mis à jour : `paint-order` et `vector-effect` gardés, `fill: blue` écrit tel quel.
- **E2E Chromium** : 480 sur 480 en disposition canevas, dont 13 pour V6 (`fichier-v6.spec.js`), et 365 sur 365 en disposition classique. Le test V3 du groupe de vue compte maintenant le bouton ▷.
- **E2E Firefox** : à vérifier. La CI GitHub n'a pas démarré sur ce lot : le compte a un paiement refusé ou une limite de dépenses atteinte (« Billing & plans » des réglages GitHub).

## 9. Hors de ce lot

- **Valeurs de test des liaisons** dans la prévisualisation : elles attendent le format des liaisons (D4).
- **Prévisualisation par cadre** : elle montre le document entier, pas un cadre d'export.
- **Nombres de la géométrie** : toujours arrondis à deux décimales.
- **`<defs>` vide d'un fichier** : il n'est pas réécrit (`sun.svg`).
