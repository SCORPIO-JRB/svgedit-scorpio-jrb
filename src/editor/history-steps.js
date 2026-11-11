/**
 * Names of the undo steps (lot V5, S4; plan v2, section 4.1): « Annuler :
 * déplacer 3 objets ».
 *
 * The canvas gives each step an English text of its own ("position",
 * "Delete Elements", "Change fill"…), never shown as is. A step is named from
 * that text when it is known, otherwise from what it holds: inserted,
 * removed or changed elements, and which attributes. The count is that of
 * the objects of the drawing it touches, an object inside another touched
 * object not counted again.
 * @module history-steps
 */

/** Texts of the canvas steps, in lower case, and the name they get. */
export const STEP_TEXTS = {
  position: 'move',
  size: 'resize',
  'resize elements': 'resize',
  'scale elements': 'resize',
  'scale text': 'resize',
  'scale strokes': 'resize',
  transform: 'transform',
  rotate: 'rotate',
  'rotate elements': 'rotate',
  'flip elements': 'flip',
  duplicate: 'duplicate',
  'clone elements': 'duplicate',
  'delete elements': 'delete',
  'paste elements': 'paste',
  'paste properties': 'paste_properties',
  'group elements': 'group',
  'make hyperlink': 'link',
  'ungroup elements': 'ungroup',
  'push group properties': 'ungroup',
  'open group': 'open_group',
  top: 'reorder',
  bottom: 'reorder',
  'move up': 'reorder',
  'move down': 'reorder',
  'reorient path': 'reorient_path',
  'convert element to path': 'convert_path',
  'convert elements to path': 'convert_path',
  'follow clip path': 'transform',
  'change source': 'edit_source',
  'edit source': 'edit_source',
  'replace symbol': 'replace_symbol',
  'import image': 'import_image',
  'change image url': 'image_url',
  'change link url': 'link_url',
  'change blur': 'blur',
  'set label': 'object_title',
  'change image title': 'document_title',
  'fit canvas to content': 'page_fit',
  'change image dimensions': 'page_size',
  'change attributes': 'properties',
  'create layer': 'layer_create',
  'delete layer': 'layer_delete',
  'duplicate layer': 'layer_duplicate',
  'merge layer': 'layer_merge',
  'merge all layers': 'layer_merge_all',
  'move elements to layer': 'move_to_layer',
  'add frame': 'frame_add',
  'change frame': 'frame_change',
  'delete frame': 'frame_delete',
  'change id': 'change_id',
  'change data': 'change_data',
  // Lot V7
  lock: 'lock',
  unlock: 'unlock',
  show: 'show',
  hide: 'hide',
  rename: 'object_title',
  reorder: 'reorder',
  'layer style': 'layer_style',
  'insert symbol': 'symbol_insert',
  'update symbol': 'symbol_update',
  'insert shape': 'shape_insert',
  'insert image': 'image_insert',
  'add connector': 'connector_add',
  'change route': 'connector_route',
  'change fluid': 'connector_fluid',
  'apply template': 'template',
  // Lot Chemins
  'add path point': 'add_nodes',
  'move path point(s)': 'move_nodes',
  'delete path node(s)': 'delete_nodes',
  'extend path': 'extend_path',
  'join paths': 'join_paths'
}

/** Names that give the number of objects. */
const COUNTED = new Set([
  'move', 'resize', 'transform', 'rotate', 'flip', 'duplicate', 'delete', 'paste',
  'group', 'reorder', 'convert_path', 'edit', 'create'
])

/** Elements that are parts of an object or of the document, not objects. */
const NOT_OBJECTS = new Set([
  'title', 'desc', 'metadata', 'tspan', 'textPath', 'stop', 'defs', 'style', 'script',
  'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'clipPath', 'mask', 'symbol'
])

/** Shapes that a single creation names. */
const CREATED = new Set(['rect', 'ellipse', 'circle', 'line', 'path', 'polyline', 'polygon', 'text', 'image', 'g', 'use', 'foreignObject'])

/** Attributes, by name of the change. */
const ATTRIBUTES = {
  fill: 'fill',
  'fill-opacity': 'fill',
  stroke: 'stroke',
  'stroke-opacity': 'stroke',
  'stroke-width': 'stroke_width',
  'stroke-dasharray': 'stroke_style',
  'stroke-linejoin': 'stroke_style',
  'stroke-linecap': 'stroke_style',
  opacity: 'opacity',
  'font-family': 'font',
  'font-size': 'font_size',
  'font-weight': 'font',
  'font-style': 'font',
  'letter-spacing': 'letter_spacing',
  'text-anchor': 'text_anchor',
  'se:width': 'text_width',
  'se:line-height': 'line_height',
  'text-decoration': 'text_decoration',
  '#text': 'text',
  rx: 'radius',
  ry: 'radius',
  r: 'radius',
  x: 'position',
  y: 'position',
  cx: 'position',
  cy: 'position',
  x1: 'position',
  y1: 'position',
  x2: 'position',
  y2: 'position',
  width: 'size',
  height: 'size',
  transform: 'transform',
  d: 'shape',
  points: 'shape',
  '#href': 'href',
  href: 'href',
  'xlink:href': 'href',
  id: 'id',
  class: 'class',
  display: 'visibility',
  visibility: 'visibility',
  stdDeviation: 'blur',
  filter: 'blur',
  'marker-start': 'markers',
  'marker-mid': 'markers',
  'marker-end': 'markers'
}

/**
 * @param {object} cmd
 * @returns {object[]} The command and the commands it holds, depth first
 */
const flatten = (cmd) => cmd?.stack ? [cmd, ...cmd.stack.flatMap(flatten)] : (cmd ? [cmd] : [])

/**
 * @param {Element} elem
 * @returns {boolean} A layer of the drawing
 */
const isLayer = (elem) => elem?.tagName === 'g' && (elem.classList?.contains('layer') || elem.parentNode?.id === 'svgcontent')

/**
 * Objects of the drawing a step touches: no layer, no part of an object, no
 * definition, and none inside another of them.
 * @param {object} cmd
 * @returns {Element[]}
 */
export const stepObjects = (cmd) => {
  const found = new Set()
  for (const sub of flatten(cmd)) {
    if (sub.stack) continue
    const elem = sub.elem
    if (!elem || elem.nodeType !== 1 || NOT_OBJECTS.has(elem.tagName) || elem.tagName === 'svg') continue
    const parent = sub.parent || sub.newParent || elem.parentNode
    if (parent && (NOT_OBJECTS.has(parent.tagName) || parent.closest?.('defs'))) continue
    if (isLayer(elem)) continue
    found.add(elem)
  }
  const list = [...found]
  return list.filter((elem) => !list.some((other) => other !== elem && other.contains(elem)))
}

/**
 * @param {object} cmd
 * @returns {string[]} Attributes the changes of a step write
 */
const changedAttributes = (cmd) => {
  const attrs = new Set()
  for (const sub of flatten(cmd)) {
    if (sub.oldValues) Object.keys(sub.oldValues).forEach((attr) => attrs.add(attr))
  }
  return [...attrs]
}

/**
 * What a step does.
 * @param {object} cmd - A command of the history
 * @returns {{key: string, count?: number, what?: string, tag?: string}}
 *   `key` names a translation of the "history" namespace; `what`, for a
 *   change, names an attribute ("history.attr_<what>")
 */
export const describeStep = (cmd) => {
  const text = String(cmd?.text ?? '').trim()
  const lower = text.toLowerCase()
  const subs = flatten(cmd).filter((sub) => !sub.stack)
  const objects = stepObjects(cmd)
  const count = Math.max(1, objects.length)
  const done = (key, extra = {}) => (COUNTED.has(key) ? { key, count, ...extra } : { key, ...extra })

  // A layer renamed, moved, shown or hidden.
  const layerChange = subs.length && subs.every((sub) =>
    (sub.elem?.tagName === 'title' && isLayer(sub.elem.parentNode)) || isLayer(sub.elem))
  if (layerChange && !STEP_TEXTS[lower]) {
    if (subs.some((sub) => sub.oldValues && 'display' in sub.oldValues)) return { key: 'layer_visibility' }
    if (subs.some((sub) => sub.oldValues && '#text' in sub.oldValues)) return { key: 'layer_rename' }
    if (subs.some((sub) => sub.type?.() === 'MoveElementCommand')) return { key: 'layer_move' }
  }

  if (STEP_TEXTS[lower]) return done(STEP_TEXTS[lower])
  // "Change fill", from beginUndoableChange or a paint.
  const changeOf = /^change (\S+)$/.exec(lower)
  if (changeOf && cmd.stack) {
    return changeStep([text.slice(7)], objects)
  }

  const types = new Set(subs.map((sub) => sub.type?.() ?? sub.constructor?.name))
  // A creation and the changes of what it creates: a text and what is typed.
  const inserted = subs.filter((sub) => sub.type?.() === 'InsertElementCommand').map((sub) => sub.elem)
  if (inserted.length && subs.every((sub) => sub.type?.() === 'InsertElementCommand' ||
    (sub.type?.() === 'ChangeElementCommand' && inserted.some((elem) => elem === sub.elem || elem.contains(sub.elem))))) {
    types.clear()
    types.add('InsertElementCommand')
  }
  if (types.size === 1 && types.has('InsertElementCommand')) {
    const tags = new Set(objects.map((elem) => elem.tagName))
    if (objects.length === 1 && CREATED.has(objects[0].tagName)) return { key: `create_${objects[0].tagName}` }
    if (tags.size) return done('create')
  }
  if (types.size === 1 && types.has('RemoveElementCommand')) return done('delete')
  if (types.size === 1 && types.has('MoveElementCommand')) return done('reorder')
  if (types.size === 1 && types.has('ChangeElementCommand')) {
    return changeStep(changedAttributes(cmd), objects)
  }
  return done('edit')
}

/**
 * @param {string[]} attrs
 * @param {Element[]} objects
 * @returns {{key: string, count?: number, what?: string}}
 */
const changeStep = (attrs, objects) => {
  const kinds = new Set(attrs.map((attr) => ATTRIBUTES[attr] ?? 'other'))
  if (kinds.size === 1) {
    const [what] = kinds
    if (what === 'text') return { key: 'text' }
    if (what === 'shape' && objects.length === 1 && objects[0].tagName === 'path') return { key: 'edit_nodes' }
    if (what === 'position') return { key: 'move', count: Math.max(1, objects.length) }
    if (what === 'transform') return { key: 'transform', count: Math.max(1, objects.length) }
    if (what !== 'other') return { key: 'change', what }
  }
  if (kinds.size === 2 && kinds.has('position') && kinds.has('size')) {
    return { key: 'resize', count: Math.max(1, objects.length) }
  }
  return { key: 'edit', count: Math.max(1, objects.length) }
}

/**
 * Name of a step, translated.
 * @param {object} cmd
 * @param {(key: string, options?: object) => string} t - i18next.t
 * @returns {string} « Déplacer 3 objets »
 */
export const stepLabel = (cmd, t) => {
  const { key, count, what } = describeStep(cmd)
  // Shown as text, not markup: the values are not escaped (« l'opacité »).
  const options = { interpolation: { escapeValue: false } }
  if (count !== undefined) options.count = count
  if (what) options.what = t(`history.attr_${what}`)
  return t(`history.${key}`, options)
}

/**
 * Entry of the zoom menu for Undo or Redo: « Annuler : déplacer 3 objets ».
 * @param {'undo'|'redo'} action
 * @param {object|undefined} cmd - The step it would undo or redo
 * @param {(key: string, options?: object) => string} t
 * @param {string} [lang]
 * @returns {string}
 */
export const actionLabel = (action, cmd, t, lang) => {
  const plain = t(action === 'undo' ? 'tools.undo' : 'tools.redo')
  if (!cmd) return plain
  const step = stepLabel(cmd, t)
  const stepLower = step.charAt(0).toLocaleLowerCase(lang || undefined) + step.slice(1)
  return t(`history.${action}_step`, { step, stepLower, interpolation: { escapeValue: false } })
}

/**
 * Objects to select after a step is undone or redone: those it touched that
 * are still in the drawing.
 * @param {object} cmd
 * @returns {Element[]}
 */
export const stepTargets = (cmd) => stepObjects(cmd).filter((elem) => elem.isConnected)
