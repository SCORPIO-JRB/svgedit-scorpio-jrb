/**
 * What the canvas layout no longer offers (lot S1 of the simplification
 * audit, docs/audit-simplification.md).
 *
 * Only the interface: every element stays read, shown, selected, transformed
 * and saved as before, the modes of svgcanvas stay, and so do the
 * extensions, which the `extensions` option still loads. The classic layout
 * keeps all of it until the user test of V4, whose reference it is.
 * @module simplification
 */

/**
 * Extensions the canvas layout no longer loads by default:
 * - ext-shapes: its button opened the shape library that the Shapes tab of
 *   the Library drawer shows (lot V7); the drawer reads the files of the
 *   extension, which stay;
 * - ext-layer_view: the eye of the Layers tab does the same, and its
 *   shortcut, Ctrl+Shift+L, is the one of the lock (lot V7).
 */
export const RETIRED_EXTENSIONS = ['ext-shapes', 'ext-layer_view']

/**
 * Controls taken out of the canvas layout. They stay in the page, hidden and
 * without shortcut, for the code that drives them.
 */
export const RETIRED_CONTROLS = [
  // Shapes menu: Rectangle and Ellipse with Shift draw a square and a
  // circle; the freehand ones drew ordinary rectangles and ellipses.
  'tool_square', 'tool_fhrect', 'tool_circle', 'tool_fhellipse',
  // "…" menu of a path: no use in a synoptic.
  'tool_reorient',
  // "…" menu: Align now opens for one object too, and aligns it on the page.
  'tool_position',
  // Document menu: the Document section of the Properties tab holds what the
  // dialog did, the choice of the images included; the home page of SVG-Edit.
  'tool_docprops', 'tool_editor_homepage',
  // Geometry of node editing: the pen adds, deletes and bends (Alt), and Delete
  // and the arrows act on the nodes selected; these fields read as broken.
  'path_node_panel'
]

/**
 * Commands of the table of shortcuts (Editor.js) that the canvas layout does
 * not register: A selects all as Ctrl+A does, Shift+O and Shift+P go through
 * the objects as Tab and Shift+Tab do.
 */
export const RETIRED_SHORTCUTS = ['select_all_a', 'select_next', 'select_previous']

/**
 * Buttons whose letter key is retired, and the shortcut they show instead:
 * the one of the command that does the same (`duplicate`, `group`). D, C and
 * G were Ctrl+D and Ctrl+G without Ctrl.
 */
export const SHOWN_SHORTCUTS = {
  tool_clone: 'ctrl+D',
  tool_clone_multi: 'ctrl+D',
  tool_group_elements: 'ctrl+G'
}

/**
 * The default extensions of a layout.
 * @param {string[]} defaults
 * @param {string} [layout] "classic" keeps them all; any other value is the
 *   canvas layout, as for `layoutOf`
 * @returns {string[]}
 */
export const defaultExtensionsOf = (defaults, layout) =>
  layout === 'classic' ? [...defaults] : defaults.filter((name) => !RETIRED_EXTENSIONS.includes(name))
