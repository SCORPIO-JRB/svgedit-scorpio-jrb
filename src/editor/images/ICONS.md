# Icônes de l'éditeur

Les icônes de `src/editor/images/` forment un jeu monochrome homogène : Material Symbols Rounded,
graisse 400, grille de 24 px, complété par des dessins propres là où aucun symbole ne porte le sens.
Chaque fichier garde son nom d'origine, si bien que toutes les références (`src="…"`, extensions,
noms composés par l'extension des marqueurs) restent valables.

L'interface dessine ces icônes à travers un masque CSS (`mask-image`, mode alpha,
`background-color: currentColor`) : seule l'opacité porte la forme. Aucun fichier ne contient de
couleur codée en dur, de `<style>` ni de script ; les tracés sont en `currentColor` (ou `none`).

- Material Symbols : 106 fichiers. Tracé et `viewBox="0 -960 960 960"` repris tels quels, avec
  `width="24" height="24"` et `fill="currentColor"` sur la racine. `flip_vertical.svg` est le
  tracé de `flip` pivoté de 90° (attribut `transform`).
- Dessins propres : 56 fichiers. `viewBox="0 0 24 24"`, glyphe entre 3 et 21 environ, trait
  `currentColor` de 1,5 (l'épaisseur de Material Symbols en graisse 400 : 60/960 de 24 px),
  extrémités et jointures rondes. Exceptions voulues : les icônes de jointure et d'extrémité de
  trait montrent un trait épais, puisque c'est leur sujet.
- `rotate.svg` n'est pas dessiné par un masque : c'est l'image de repli de la propriété CSS
  `cursor` (poignées de rotation, `packages/svgcanvas/core/select.js`). Hors masque,
  `currentColor` y vaut le noir par défaut, comme l'ancienne image.
- Hors de ce tableau : `logo.svg` (logo, inchangé), le dossier `cursors/` (curseurs des outils de
  forme, inchangés) et `openpath.png` (image matricielle, inchangée, sans référence).

Les fichiers marqués *sans référence* ne sont cités nulle part dans `src/`, `packages/` ni
`tests/`, même par un nom composé ; ils sont convertis comme les autres et gardés.

| Fichier | Material Symbols (ou « dessin propre ») | Sens |
| --- | --- | --- |
| `add_subpath.svg` | dessin propre | Ajouter un sous-chemin (ancienne icône ; même dessin que tool_add_subpath) — *sans référence* |
| `align.svg` | `align_justify_center` | Bouton du menu « Aligner et répartir » (sélection multiple) |
| `align_bottom.svg` | `align_vertical_bottom` | Aligner en bas |
| `align_center.svg` | `align_horizontal_center` | Centrer horizontalement |
| `align_distrib_horiz.svg` | `horizontal_distribute` | Répartir horizontalement |
| `align_distrib_verti.svg` | `vertical_distribute` | Répartir verticalement |
| `align_left.svg` | `align_horizontal_left` | Aligner à gauche |
| `align_middle.svg` | `align_vertical_center` | Centrer verticalement (milieu) |
| `align_right.svg` | `align_horizontal_right` | Aligner à droite |
| `align_top.svg` | `align_vertical_top` | Aligner en haut |
| `anchor_end.svg` | `format_align_right` | Ancrage du texte : fin (text-anchor="end") |
| `anchor_middle.svg` | `format_align_center` | Ancrage du texte : milieu |
| `anchor_start.svg` | `format_align_left` | Ancrage du texte : début |
| `angle.svg` | dessin propre | Angle de rotation (champ) |
| `arrow_down.svg` | `arrow_drop_down` | Flèche de la liste déroulante du zoom |
| `arrow_right.svg` | `arrow_right` | Petite flèche vers la droite — *sans référence* |
| `arrow_right_big.svg` | `play_arrow` (variante pleine) | Grande flèche pleine vers la droite — *sans référence* |
| `blur.svg` | `blur_circular` | Flou (champ) |
| `bold.svg` | `format_bold` | Gras |
| `box.svg` | `square` (variante pleine) | Marqueur : carré plein |
| `box_o.svg` | `square` | Marqueur : carré vide |
| `c_radius.svg` | `rounded_corner` | Rayon des coins du rectangle (champ) |
| `cancel.svg` | `close` | Annuler — *sans référence* |
| `chevron_down.svg` | dessin propre | Ouvre un menu (barre supérieure, groupe de vue, calque courant) |
| `chevron_right.svg` | dessin propre | Déplie un calque ou un groupe (onglet Calques) |
| `circle.svg` | `circle` | Outil cercle |
| `clone.svg` | `content_copy` | Dupliquer l'élément |
| `close_path.svg` | dessin propre | Fermer le sous-chemin — *sans référence* |
| `closepath_icons.svg` | dessin propre | Ouvrir/fermer le sous-chemin (icônes de l'extension archivée ext-closepath) — *sans référence* |
| `config.svg` | `settings` | Réglages — *sans référence* |
| `conn.svg` | `shape_line` | Outil connecteur (relie deux formes) |
| `context_menu.svg` | `more_vert` | Autres options du calque |
| `delete.svg` | `delete` | Supprimer (élément, calque) |
| `docprop.svg` | `description` | Propriétés du document (menu principal) |
| `docprops.svg` | `description` | Propriétés du document (ancienne icône) — *sans référence* |
| `drawer.svg` | dessin propre | Tiroir Bibliothèque : symboles, formes, images (lot V7) |
| `editPref.svg` | `settings` | Préférences de l'éditeur (menu principal) |
| `edit_foreign.svg` | `code_blocks` | Éditer un objet étranger (foreignObject) — *sans référence* |
| `ellipse.svg` | dessin propre | Outil ellipse |
| `export.svg` | `output` | Exporter (PNG, JPEG, PDF…) |
| `eye.svg` | `visibility` | Visibilité du calque |
| `eye_dropper.svg` | `colorize` | Pipette |
| `eye_off.svg` | dessin propre | Calque ou objet masqué (onglet Calques) |
| `fh_ellipse.svg` | dessin propre | Outil ellipse à main levée |
| `fh_rect.svg` | dessin propre | Outil rectangle à main levée |
| `fill.svg` | `format_color_fill` | Couleur de remplissage |
| `flip_horizontal.svg` | `flip` | Retourner horizontalement |
| `flip_vertical.svg` | `flip` pivoté de 90° | Retourner verticalement |
| `fontsize.svg` | `format_size` | Taille de police (champ) |
| `forwardslash.svg` | dessin propre | Marqueur : barre oblique « / » — *sans référence* |
| `frame.svg` | dessin propre | Outil Cadre d'export (V5) |
| `globe_link.svg` | `add_link` | Créer un lien hypertexte |
| `go_down.svg` | `arrow_downward` | Descendre le calque |
| `go_up.svg` | `arrow_upward` | Monter le calque |
| `grid.svg` | `grid_4x4` | Afficher/masquer la grille (ext-grid) |
| `group_elements.svg` | dessin propre | Grouper |
| `handle.svg` | dessin propre | Coin des boutons qui ouvrent un menu d'outils — *sans référence* |
| `height.svg` | `height` | Hauteur — *sans référence* |
| `hello_world.svg` | `waving_hand` | Extension d'exemple « Hello World » |
| `home.svg` | dessin propre | Accueil de l'application hôte (barre supérieure) |
| `image.svg` | `image` | Outil image |
| `imagelib.svg` | `photo_library` | Bibliothèque d'images (extension archivée ext-imagelib) — *sans référence* |
| `import.svg` | `input` | Importer — *sans référence* |
| `importImg.svg` | `input` | Importer une image ou un SVG (menu principal) |
| `italic.svg` | `format_italic` | Italique |
| `layer_view.svg` | `layers` | N'afficher que le calque courant (ext-layer_view) |
| `leftarrow.svg` | dessin propre | Marqueur : flèche pleine vers la gauche |
| `leftarrow_o.svg` | dessin propre | Marqueur : flèche vide vers la gauche |
| `letter_spacing.svg` | `format_letter_spacing_2` | Espacement des lettres (champ) |
| `library.svg` | `shapes` | Bibliothèque (même dessin que shapelib) — *sans référence* |
| `line_height.svg` | dessin propre | Interligne d'un texte de plusieurs lignes (champ) |
| `linecap_butt.svg` | dessin propre | Extrémité du trait : plate (butt) |
| `linecap_round.svg` | dessin propre | Extrémité du trait : ronde |
| `linecap_square.svg` | dessin propre | Extrémité du trait : carrée |
| `linejoin_bevel.svg` | dessin propre | Jointure du trait : biseautée |
| `linejoin_miter.svg` | dessin propre | Jointure du trait : en pointe (miter) |
| `linejoin_round.svg` | dessin propre | Jointure du trait : ronde |
| `link_controls.svg` | dessin propre | Lier les points de contrôle (ancienne icône) — *sans référence* |
| `lock.svg` | dessin propre | Objet ou calque verrouillé (onglet Calques, lot V7) |
| `lock_open.svg` | dessin propre | Verrouiller un objet ou un calque (onglet Calques, lot V7) |
| `mcircle.svg` | `circle` (variante pleine) | Marqueur : cercle plein |
| `mcircle_o.svg` | `circle` | Marqueur : cercle vide |
| `minus.svg` | dessin propre | Retirer (remplissage, contour, arrêt de dégradé) |
| `mkr_markers_dimension.svg` | `arrow_range` | Marqueurs de cote — *sans référence* |
| `mkr_markers_label.svg` | `label` | Marqueur étiquette — *sans référence* |
| `mkr_markers_off.svg` | `horizontal_rule` | Sans marqueurs — *sans référence* |
| `more_horiz.svg` | dessin propre | Plus d'outils (barre d'outils) |
| `move_bottom.svg` | `flip_to_back` | Mettre à l'arrière-plan |
| `move_top.svg` | `flip_to_front` | Mettre au premier plan |
| `netlify-dark.svg` | `cloud_upload` | Badge « Deploys by Netlify » (marque remplacée par un pictogramme de déploiement) — *sans référence* |
| `new.svg` | `note_add` | Nouveau document (menu principal) ; nouveau calque |
| `no_color.svg` | `format_color_reset` | Aucune couleur — *sans référence* |
| `node_clone.svg` | dessin propre | Dupliquer le nœud (ancienne icône) — *sans référence* |
| `node_delete.svg` | dessin propre | Supprimer le nœud (ancienne icône) — *sans référence* |
| `nomarker.svg` | `horizontal_rule` | Marqueur : aucun |
| `ok.svg` | `check` | Valider — *sans référence* |
| `opacity.svg` | `opacity` | Opacité (champ) |
| `open.svg` | `folder_open` | Ouvrir |
| `open_path.svg` | dessin propre | Ouvrir le sous-chemin — *sans référence* |
| `paint_gradient.svg` | dessin propre | Peinture en dégradé |
| `paint_solid.svg` | dessin propre | Peinture unie |
| `panel_right.svg` | dessin propre | Afficher ou masquer le panneau de droite (Ctrl+\\) |
| `panning.svg` | `pan_tool` | Outil main : déplacer la vue (ext-panning) |
| `path.svg` | `stylus_fountain_pen` | Outil chemin (plume) |
| `pen.svg` | `pen_size_2` | Outil ligne |
| `pencil.svg` | `draw` | Outil crayon (main levée) |
| `play_arrow.svg` | `play_arrow` | Prévisualiser le fichier exporté (V6) |
| `plus.svg` | dessin propre | Ajouter (remplissage, contour, arrêt de dégradé) |
| `polygon.svg` | `pentagon` | Outil polygone (ext-polystar) |
| `ratio_lock.svg` | `link` | Conserver les proportions |
| `rect.svg` | `rectangle` | Outil rectangle |
| `redo.svg` | `redo` | Rétablir |
| `reorient.svg` | dessin propre | Réorienter le chemin (remettre sa rotation à zéro) |
| `reverseslash.svg` | dessin propre | Marqueur : barre oblique inverse « \ » — *sans référence* |
| `rightarrow.svg` | dessin propre | Marqueur : flèche pleine vers la droite |
| `rightarrow_o.svg` | dessin propre | Marqueur : flèche vide vers la droite |
| `rotate.svg` | `autorenew` | Curseur de rotation (repli de la propriété CSS cursor, pas un masque) |
| `save.svg` | `save` | Enregistrer — *sans référence* |
| `saveImg.svg` | `save` | Enregistrer ; enregistrer sous (menu principal) |
| `scale.svg` | `open_in_full` | Outil mise à l'échelle (proportions conservées) |
| `search.svg` | dessin propre | Rechercher un calque ou un objet (onglet Calques) |
| `select.svg` | `arrow_selector_tool` | Outil sélection |
| `select_node.svg` | dessin propre | Outil sélection en édition de chemin (nœuds) |
| `shapelib.svg` | `shapes` | Bibliothèque de formes (ext-shapes) |
| `source.svg` | `code` | Source SVG |
| `square.svg` | `square` | Outil carré |
| `star.svg` | `star` | Outil étoile (ext-polystar) |
| `star_o.svg` | `star` | Marqueur : étoile vide — *sans référence* |
| `stroke.svg` | `border_color` | Couleur du contour |
| `svg-edit-home.svg` | `public` | Site web de SVG-Edit — *sans référence* |
| `text.svg` | `title` | Outil texte ; renommer le calque |
| `text_auto_width.svg` | dessin propre | Largeur automatique d'un texte : il ne passe plus à la ligne de lui-même |
| `text_decoration_linethrough.svg` | `format_strikethrough` | Barré |
| `text_decoration_overline.svg` | `format_overline` | Trait au-dessus (overline) |
| `text_decoration_underline.svg` | `format_underlined` | Souligné |
| `text_length.svg` | `format_letter_spacing_wider` | Longueur imposée du texte (textLength) |
| `textmarker.svg` | `title` | Marqueur : texte — *sans référence* |
| `textmarker_bottom.svg` | dessin propre | Marqueur : texte sous la ligne — *sans référence* |
| `textmarker_top.svg` | dessin propre | Marqueur : texte au-dessus de la ligne — *sans référence* |
| `to_path.svg` | dessin propre | Convertir en chemin |
| `tool_add_subpath.svg` | dessin propre | Ajouter un sous-chemin |
| `tool_foreign.svg` | `functions` | Outil objet étranger (MathML…, extension archivée) — *sans référence* |
| `tool_imagelib.svg` | `photo_library` | Outil bibliothèque d'images (extension archivée) — *sans référence* |
| `tool_node_clone.svg` | dessin propre | Dupliquer le nœud |
| `tool_node_delete.svg` | dessin propre | Supprimer le nœud |
| `tool_node_link.svg` | dessin propre | Lier les points de contrôle |
| `tool_openclose_path.svg` | dessin propre | Ouvrir/fermer le sous-chemin |
| `tool_placemark.svg` | `location_on` | Repère (extension archivée ext-placemark) — *sans référence* |
| `triangle.svg` | `change_history` (variante pleine) | Marqueur : triangle plein — *sans référence* |
| `triangle_o.svg` | `change_history` | Marqueur : triangle vide — *sans référence* |
| `undo.svg` | `undo` | Annuler |
| `ungroup.svg` | `ungroup` | Dégrouper |
| `unlink_use.svg` | `link_off` | Rompre le lien vers l'élément de référence (&lt;use&gt;) |
| `verticalslash.svg` | dessin propre | Marqueur : barre verticale — *sans référence* |
| `view_grid.svg` | dessin propre | Nuancier en grille |
| `view_list.svg` | dessin propre | Nuancier en liste |
| `warning.svg` | `warning` | Avertissement — *sans référence* |
| `webappfind.svg` | `save` | Enregistrer via WebAppFind (extension archivée) — *sans référence* |
| `width.svg` | `arrow_range` | Largeur — *sans référence* |
| `wireframe.svg` | dessin propre | Mode fil de fer (contours seuls) |
| `word_spacing.svg` | `space_bar` | Espacement des mots (champ) |
| `xmark.svg` | `close` | Marqueur : croix — *sans référence* |
| `zoom.svg` | `zoom_in` | Outil zoom ; niveau de zoom |

## Licence

Material Symbols par Google, distribués sous licence Apache 2.0 (texte complet :
[`LICENSE-material-symbols.txt`](LICENSE-material-symbols.txt)). Source : paquet npm
`@material-symbols/svg-400` 0.48.3, style `rounded`
(https://github.com/google/material-design-icons, https://github.com/marella/material-symbols).
Les tracés n'ont pas été modifiés, sauf la rotation de `flip_vertical.svg` ; les attributs
`width`, `height` et `fill` de la racine ont été changés.

Les dessins propres font partie du projet et suivent sa licence.
