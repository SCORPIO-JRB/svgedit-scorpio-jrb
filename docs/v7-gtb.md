# Plan v2 — lot V7 « GTB et structure »

Branche `v7-gtb`, partie de `v6-fichier`. Le plan v2 donne à V7 cinq sujets :

- l'arbre complet de l'onglet Calques (S8, sections 2.6 et 4.5) ;
- la bibliothèque en tiroir (zone « Tiroir Bibliothèque » de la section 3, décision D5) ;
- les symboles GTB à ports (G1, SymbolLibrary et PortModel) ;
- les connecteurs orthogonaux (G2, OrthogonalRouter) ;
- les modèles « Schéma technique » et « Synoptique 1 920 × 1 080 » (G4).

Son critère de passage : un synoptique de référence réalisé de bout en bout et lu sans retouche par SCorp-io.

## 1. Arbre complet (2.6, 4.5)

L'onglet Calques de V3 listait déjà les calques, les groupes et les objets, avec recherche, œil et glisser-déposer des calques. V7 le complète :

- **Nom.** Une ligne montre le titre de l'objet, sinon son identifiant (le plan, 2.6). V3 montrait l'identifiant d'abord ; la recherche trouve toujours un objet par son identifiant. Le type à droite donne, pour une instance de symbole, le nom du symbole (« Pompe ») et, pour un connecteur, son fluide.
- **Renommer.** Double-clic ou F2 renomme aussi un objet. Le nom est son `<title>` (un nom vide le retire), en une étape d'annulation. L'identifiant n'est jamais touché : la supervision peut s'y lier (D4).
- **Verrou.** Le cadenas verrouille un objet ou un calque (`se:locked="true"`, dans l'espace de noms de l'éditeur). Un objet verrouillé, ou tout ce que contient un groupe ou un calque verrouillé, n'est jamais sélectionné, ni depuis le canevas, ni depuis l'arbre, ni par « Tout sélectionner » ou le rectangle de sélection. Le pointeur passe au travers, vers ce qui est dessous. L'arbre dit pourquoi un clic ne sélectionne rien. Aucun outil ne dessine dans un calque verrouillé, et l'éditeur l'explique.
- **Œil et cadenas.** Ils apparaissent au survol et restent visibles quand ils sont actifs. Ctrl+Maj+H masque la sélection, Ctrl+Maj+L la verrouille. « Tout afficher » et « Tout déverrouiller » sont dans la palette (Ctrl+K). Chaque commande forme une étape d'annulation.
- **Glisser-déposer.** Un objet, ou la sélection dont il fait partie, se dépose au-dessus ou au-dessous d'un autre, dans un groupe ou sur un calque. Une ligne d'insertion, décalée à la profondeur visée, montre où il va. L'objet garde sa place sur la page : quand les transformations des deux parents diffèrent, la sienne compense (par exemple `translate(-50,0)` en entrant dans un groupe décalé de 50). Le tout forme une étape d'annulation, et la sélection suit l'objet.
- **Alt+clic sur la flèche** d'un groupe ouvre ou ferme tout ce qu'il contient.
- **Calque dans l'inspecteur.** Sans sélection, la nouvelle section « Calque » de l'onglet Propriétés règle le calque courant : son nom, son opacité, son mode de fusion (`mix-blend-mode` : normal, produit, superposition, incrustation, obscurcir, éclaircir, différence), sa visibilité et son verrou. Chaque réglage forme une étape d'annulation.
- **Dernier calque.** L'entrée « Supprimer le calque » est grisée et dit pourquoi : « Un document garde au moins un calque ». La section Apparence offre aussi « Masquer la sélection » et « Verrouiller la sélection ».

## 2. Symboles GTB à ports (G1)

**Symbole et instance.** Chaque symbole est un `<symbol>` dans les `<defs>`, et chaque usage une instance `<use>`. Le `<symbol>` garde ce que la bibliothèque dit de lui :

```xml
<symbol id="gtb-pompe" viewBox="0 0 40 40" se:symbol="gtb-pompe" se:version="1"
  se:ports="in 0 20 left in; out 40 20 right out; power 20 0 up power">
  <title>Pompe</title> …dessin…
</symbol>
<use id="pompe-charge-1" href="#gtb-pompe" x="270" y="540" width="40" height="40"
  class="equipement pompe" fill="#160F23" stroke="#625A6E" stroke-width="1.5" color="#9B92AA"/>
```

Modifier le symbole modifie toutes ses instances.

**Bibliothèque versionnée.** La bibliothèque compte 18 équipements, dessinés dans le style du synoptique de référence du corpus (`gtb-symbols.js`) :

| Catégorie | Équipements |
| --- | --- |
| Hydraulique | pompe, vanne 2 voies, vanne 3 voies, clapet anti-retour, échangeur à plaques, ballon |
| Aéraulique | ventilateur, registre, filtre, batterie chaude, batterie froide |
| Production | chaudière, groupe froid, moteur |
| Mesure | sondes de température, de pression et d'humidité, compteur |

Chaque symbole porte un numéro de version. Quand la bibliothèque en a un plus récent que le document, la section Symbole de l'inspecteur propose « Mettre à jour (version 2, n instances) ». La mise à jour change le dessin, le viewBox et les ports en une étape d'annulation, et toutes les instances suivent. Une application hôte donne sa propre bibliothèque par l'option `symbolLibraries`, de même forme. Ce qu'elle fournit passe par le filtre d'import avant d'entrer dans le document, et l'aperçu du tiroir n'en exécute rien.

**Couleurs et état.** Le corps d'un symbole ne fixe ni `fill` ni `stroke` : il les prend de son instance. Les marques (sens d'une pompe, flamme, lettre d'une sonde) sont en `currentColor`, c'est-à-dire la couleur `color` de l'instance. La supervision peut donc montrer l'état d'un équipement en changeant les attributs du `<use>` qu'elle désigne par son identifiant. Une règle de feuille de style comme `.equipement.en-marche .corps` du synoptique de référence n'atteint pas l'intérieur d'un `<use>` ; seules les propriétés héritées le font. « Détacher l'instance » fait du `<use>` un groupe ordinaire, avec la confirmation de V6 s'il est lié.

**Ports (PortModel).** Chaque symbole déclare ses points de raccordement : un identifiant, une position, la direction dans laquelle une conduite en part (gauche, droite, haut, bas) et un type (entrée, sortie, alimentation, signal, libre). Les ports suivent l'instance quand elle est déplacée, mise à l'échelle, tournée ou retournée. Tout autre objet a quatre ports implicites, au milieu des côtés de sa boîte. Tous les ports de la bibliothèque sont sur le bord de la boîte, à des multiples de 10 : avec la grille de 10 aimantée, ils tombent sur la grille.

- **Au survol.** Avec l'outil de sélection ou l'outil Connecteur, les ports d'un symbole s'affichent en petits cercles.
- **Aimants prioritaires.** Pendant le tracé d'un connecteur, le port le plus proche du pointeur l'attire (à 14 pixels de l'écran). Un port déclaré l'emporte sur le milieu d'un côté. Quand on déplace un symbole, un de ses ports qui passe près d'un port d'un autre symbole s'y pose, avant les alignements et la grille de V2. Ctrl suspend l'aimant, comme les autres.

## 3. Tiroir Bibliothèque (section 3, D5)

Le bouton Bibliothèque, dans le groupe Insérer de la barre d'outils, ouvre un tiroir sous la barre. On peut aussi l'ouvrir par la palette.

- Trois onglets : **Symboles** (par catégorie), **Formes** (la bibliothèque de formes de SVG-Edit, lue à la première ouverture) et **Images** (celles du document, et une image de l'ordinateur).
- **Recherche.** Elle cherche dans les trois onglets à la fois, sans tenir compte des accents ni de la casse : « echangeur » trouve « Échangeur ».
- **Insertion.** Un clic, Entrée ou Espace place l'élément au centre de la vue ; un glisser le place au point de dépôt. Chaque insertion forme une étape d'annulation, laisse le nouvel objet sélectionné et ferme le tiroir. Échap le ferme aussi et rend le focus au bouton.

Le bouton de formes de SVG-Edit (ext-shapes) reste à sa place, conformément au contrat des extensions de V0.

## 4. Connecteurs orthogonaux (G2)

**Routeur (OrthogonalRouter, `core/orthogonal.js`).** Le tracé part de chaque port dans sa direction, sur un talon de 20, puis relie les deux talons à angles droits. Il contourne les deux équipements à 10 de distance et ne traverse aucun autre équipement de la zone ; il peut en longer un, comme une sonde posée sur sa conduite. Il fait le moins de coudes possible, et le coude au milieu à coût égal. C'est une recherche A* sur la grille des coordonnées utiles. Avec la grille aimantée, les coordonnées libres tombent sur la grille. Fonctions pures, testées sans navigateur ; une centaine de tracés prend moins de 5 ms chacun.

**Dans le fichier.** Un connecteur est une `<polyline>`, comme ceux de l'extension, accompagnée de ce qui le garde attaché :

```xml
<polyline id="conn_svg_31" points="310,560 600,560 600,620 880,620" fill="none"
  stroke="#F08A62" stroke-width="3" marker-end="url(#se-arrow-F08A62)" class="tuyau chaud depart"
  se:connector="pompe-charge-1 bouteille-decouplage" se:start-port="out" se:end-port="l1"
  se:route="auto" se:fluid="chaud-depart"/>
```

`se:connector` nomme les deux équipements comme avant. Un copier-coller, un import ou une duplication renomme donc les extrémités avec les objets. Le collage garde désormais l'espace de noms des attributs `se:`, ce qu'il ne faisait pas pour un connecteur droit.

**Outil Connecteur.**

- Le connecteur est orthogonal dès qu'une de ses extrémités est un port de symbole. Entre deux objets ordinaires, il reste le connecteur droit de l'extension, dont V0 a fixé le contrat. L'option `connectorRouting` choisit : `auto` (par défaut), `orthogonal` ou `straight`.
- On le trace en glissant d'un port à un autre, ou par deux clics. Pendant le tracé, le parcours s'affiche en pointillés et le port visé est marqué.
- Le connecteur va sous les objets du calque courant, comme les conduites d'un synoptique. Les ports de tous les calques visibles servent d'aimants : les réseaux peuvent avoir leur propre calque.

**Le tracé suit les équipements.**

- Pendant un déplacement, il suit une fois par image ; il est recalculé après chaque changement, annulation et rétablissement compris.
- Il n'entre pas dans l'historique : c'est une fonction des ports et de la forme gardée, et l'annulation d'un déplacement rend donc le tracé d'avant.
- Un connecteur ne se déplace pas seul : ses extrémités le tiennent.

**Coudes ajustables.**

- Un connecteur sélectionné montre une poignée au milieu de chaque segment mobile ; le premier et le dernier tiennent les ports.
- Glisser une poignée déplace le segment en travers, aimanté à la grille. Le tracé devient « manuel », en une étape d'annulation, et garde sa forme quand les équipements bougent : seuls les segments voisins des ports suivent.
- Si un équipement tourne d'un quart de tour, la forme ne peut plus être gardée et le tracé redevient automatique. « Tracé automatique » (dans l'inspecteur et dans la palette) le rend aussi.

**Fluides.** Chaque connecteur a un fluide, qui fixe sa couleur, son épaisseur, ses tirets, sa flèche de sens (un marqueur dans les `<defs>`, un par couleur) et ses classes :

| Fluide | Couleur | Classes |
| --- | --- | --- |
| Sans fluide | gris 1,5 | `tuyau` |
| Eau chaude, départ / retour | `#F08A62` / `#B5623F`, 3, flèche | `tuyau chaud depart` / `tuyau chaud retour` |
| Eau glacée, départ / retour | `#6E9CF5` / `#4A70BD`, 3, flèche | `tuyau froid depart` / `tuyau froid retour` |
| Air soufflé, repris, neuf, extrait | violet, lavande, bleu, crème ; 2,5, flèche | `gaine air …` |
| Gaz | gris, tirets 6 5, flèche | `gaz` |
| Alimentation électrique | gris clair, pointillé | `cable` |
| Signal, bus | gris, tirets 4 3 | `signal` |

Les couleurs et les classes de l'eau sont celles du synoptique de référence du corpus : sa feuille de style, qui anime les conduites par classe (`.tuyau.en-marche.chaud.depart`), les retrouve. Les autres sont à confirmer par SCorp-io, comme la bibliothèque de couleurs. La section Connecteur de l'inspecteur règle le fluide et la flèche de la sélection, en une étape chacun. Elle montre aussi les deux extrémités (« De Pompe de charge 1 (out) à … »). Quand l'outil est actif sans sélection, elle règle le fluide des prochains connecteurs. L'option `fluids` donne une autre liste.

## 5. Modèles (G4)

« Nouveau depuis un modèle… », dans le menu du document juste après « Nouveau document », et dans la palette :

- **Vide** : la page des préférences, un calque.
- **Schéma technique** : A3 paysage (1 587 × 1 123), son cadre, la grille affichée et aimantée à 10. Un symbole posé tombe sur la grille, ses ports aussi, et les extrémités des liaisons avec eux.
- **Synoptique 1 920 × 1 080** : la page et un cadre de sortie « Écran de supervision » à la résolution de l'écran. Le fond des synoptiques (Nuit 70) est dans un calque « Fond » verrouillé, suivi des calques « Réseaux », « Équipements » (courant) et « Valeurs ». La grille est aimantée à 10.

Un modèle ouvre un nouveau document : l'éditeur demande d'abord si le document courant a des changements, et l'historique repart de zéro. L'option `templates` donne d'autres modèles.

## 6. Synoptique de référence (critère de passage)

`tests/e2e/gtb-reference.js` construit une chaufferie avec les commandes de l'éditeur : deux chaudières et leurs pompes de charge, une bouteille de découplage, et deux circuits (vanne 3 voies, pompe, sonde de départ, compteur d'énergie). Ses étapes :

1. le modèle Synoptique ;
2. 13 instances de 6 symboles, chacune avec un identifiant lisible (`pompe-charge-1`) et un titre ;
3. 14 conduites d'eau chaude, départ et retour, de port à port, dans le calque Réseaux ;
4. 6 valeurs, chacune avec un identifiant stable et son point (`data-point="CHAUF.C1.T_DEPART"`, format à confirmer avec D4) ;
5. l'export du cadre.

Le test E2E vérifie l'export :

- c'est un SVG valide de 1 920 × 1 080, sans script ni cadre de l'éditeur ;
- il garde les 6 symboles, les 13 instances, les 14 conduites et les 6 points ;
- chaque conduite est à angles droits, ses extrémités sur les ports de ses équipements ;
- il s'affiche en image.

Le test vérifie aussi que le fichier enregistré se rouvre et se réenregistre à l'identique.

`scripts/gtb-reference.mjs` écrit dans `docs/v7` les fichiers à faire lire par SCorp-io :

- `synoptique-reference.svg` : le document enregistré par l'éditeur, que l'éditeur rouvre ;
- `synoptique-reference-export.svg` : l'export du cadre, c'est-à-dire le fichier livré à la supervision ;
- `synoptique-reference.png` : son image.

**La lecture par SCorp-io reste à faire.** C'est la moitié du critère qui ne dépend pas de l'éditeur. Ce qu'il faut regarder :

- l'affichage des `<use>` et de leurs `<symbol>` ;
- les couleurs prises de l'instance (`fill`, `stroke`, `color`) ;
- le changement d'état par attribut sur un `<use>` désigné par son identifiant ;
- les classes des conduites ;
- les `data-point` des valeurs.

## 7. Vérifications

(rempli à la fin du lot)

## 8. Corrigés au passage

- **Attributs `se:` à l'historique et au collage.** Une annulation ou un rétablissement recréait un attribut `se:` sans son espace de noms. Le collage faisait de même : un connecteur droit collé n'était plus reconnu comme connecteur.
- **Attribut `color` à l'import.** Le filtre le retirait, ce qui ôtait leur couleur aux marques en `currentColor`. Il fait maintenant partie des attributs de présentation gardés (option `fidelity.attributes` de V6). Un fichier que SVG-Edit a déjà enregistré ne le porte jamais, il ne change donc pas.
- **Fichier stable à la réouverture.** Un symbole, sa flèche et un modèle sont écrits dès leur création comme une ouverture les laisserait (chemins absolus fermés sur leur départ, identifiants des éléments visibles). Le fichier enregistré se rouvre donc à l'identique.

## 9. Choix à confirmer

- **Nom d'une ligne de l'arbre.** Le titre, sinon l'identifiant, comme le dit le plan (V3 montrait l'identifiant d'abord). Le renommage d'un objet écrit son titre, jamais son identifiant.
- **Verrou.** Strict, comme dans Illustrator : un objet verrouillé n'est sélectionné nulle part, même pas depuis l'arbre. On le déverrouille d'abord.
- **Ctrl+Maj+L.** Ce raccourci est partagé avec la vue du seul calque courant (ext-layer_view). Avec une sélection, il verrouille ; sans sélection, il bascule la vue.
- **Connecteur orthogonal ou droit.** Le connecteur est orthogonal dès qu'un port de symbole est en jeu, droit entre deux objets ordinaires (`connectorRouting: 'auto'`).
- **Fluides.** Les couleurs de l'air, du gaz, de l'électricité et des signaux, et les classes `gaine`, `gaz`, `cable`, `signal`, sont à confirmer par SCorp-io.
- **État des équipements.** Il passe par les attributs de l'instance (`fill`, `stroke`, `color`), puisque les règles de feuille de style n'atteignent pas l'intérieur d'un `<use>`. À confirmer avec D4 : si la supervision doit animer une partie d'un équipement (la roue d'une pompe), il faut détacher l'instance, ou prévoir une classe par partie.

## 10. Hors de ce lot

- Les barres contextuelles propres au symbole et au connecteur : l'inspecteur et la palette suffisent pour l'instant.
- L'évitement de tous les objets du dessin par le routeur : il évite les équipements, pas les textes ni les formes libres.
- Le rattachement d'une extrémité existante à un autre port, en la glissant.
