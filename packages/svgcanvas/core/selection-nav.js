/**
 * Advanced selection (M6): the deepest object under the pointer (Ctrl+click,
 * Cmd+click on macOS), the children and the parent of the selection (Enter,
 * Shift+Enter), and the objects that look the same (same symbol, same fill,
 * same stroke).
 *
 * An object inside a group is selected the way a double click allows it: the
 * group is opened (the in-group editing context of SVG-Edit), so that the
 * clicks that follow take the objects of that group.
 * @module selection-nav
 * @license MIT
 */
import { NS } from './namespaces.js'
import { getRotationAngle } from './utilities.js'
import { BatchCommand } from './history.js'
import * as draw from './draw.js'

let svgCanvas = null

/** Children of a group that are not drawn, so never selected. */
const NOT_SELECTABLE = new Set([
  'defs', 'title', 'desc', 'metadata', 'style', 'script', 'symbol', 'marker',
  'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'filter'
])

/** Elements whose fill and stroke are their own look. */
const PAINTED = new Set([
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text'
])

/**
 * @param {Element} elem
 * @returns {boolean} True for a group or a link, which hold other objects
 */
const isContainer = (elem) => elem?.nodeType === 1 &&
  elem.namespaceURI === NS.SVG && (elem.tagName === 'g' || elem.tagName === 'a')

const currentLayer = () => svgCanvas.getCurrentDrawing()?.getCurrentLayer() ?? null

/**
 * @param {Element} elem
 * @returns {boolean} True for an object a click can select
 */
const isSelectable = (elem) => elem?.nodeType === 1 &&
  typeof elem.getBBox === 'function' && !NOT_SELECTABLE.has(elem.tagName)

/**
 * The objects of a group, as the selection holds them: a link around a single
 * object stands for that object, as on a click.
 * @param {Element} group
 * @returns {Element[]}
 */
export const selectableChildren = (group) => Array.from(group?.children ?? [])
  .filter(isSelectable)
  .map((elem) => (elem.tagName === 'a' && elem.childNodes.length === 1 && isSelectable(elem.firstElementChild)
    ? elem.firstElementChild
    : elem))

/**
 * Does the pointer event ask for the deepest object? Ctrl, or Cmd on macOS
 * (Ctrl+click opens the context menu there).
 * @param {MouseEvent} evt
 * @param {boolean} mac
 * @returns {boolean}
 */
export const isDeepClick = (evt, mac) => Boolean(mac ? evt?.metaKey : evt?.ctrlKey)

/**
 * The deepest object under the pointer, and the group it belongs to.
 * @function module:selection-nav.SvgCanvas#getDeepTarget
 * @param {MouseEvent} evt
 * @returns {{elem: Element, context: Element}|null} Null when the pointer is
 *   on no object of the current layer
 */
const getDeepTarget = (evt) => {
  const layer = currentLayer()
  let elem = evt?.target
  if (!layer || !elem) { return null }
  const group = svgCanvas.getCurrentGroup()
  if (group && !group.contains(elem)) {
    // The objects outside the open group ignore the pointer.
    elem = draw.elementFromPointInDrawing(evt.clientX, evt.clientY) ?? elem
  }
  // The content of a <use> belongs to the <use>.
  if (elem?.correspondingUseElement) { elem = elem.correspondingUseElement }
  if (!elem || elem === layer || !layer.contains(elem)) { return null }
  // Climb to the object held by a group (a tspan to its text, the content of a
  // foreignObject to the foreignObject).
  while (elem.parentNode !== layer && !isContainer(elem.parentNode)) {
    elem = elem.parentNode
  }
  if (!isSelectable(elem)) { return null }
  let context = elem.parentNode
  // A link around a single object is selected as that object.
  if (context !== layer && context.tagName === 'a' && context.childNodes.length === 1) {
    context = context.parentNode
  }
  return { elem, context }
}

/**
 * Opens a group, and the groups that hold it, as double clicks would: a
 * rotated group gives its rotation to its children first (one undo step for
 * them all), then becomes the editing context. The layer closes any open group.
 * @param {Element} context
 * @returns {void}
 */
const openContext = (context) => {
  const layer = currentLayer()
  if (!context || context === layer) {
    if (svgCanvas.getCurrentGroup()) { draw.leaveContext() }
    return
  }
  if (context === svgCanvas.getCurrentGroup()) { return }
  const chain = []
  for (let group = context; group && group !== layer; group = group.parentNode) {
    chain.unshift(group)
  }
  const batchCmd = new BatchCommand('Open group')
  chain.forEach((group) => {
    if (getRotationAngle(group)) {
      const cmd = svgCanvas.pushGroupProperties(group, true)
      if (cmd && !cmd.isEmpty()) { batchCmd.addSubCommand(cmd) }
    }
  })
  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
  }
  draw.setContext(context)
}

/**
 * Prepares a Ctrl+click: opens the group of the deepest object under the
 * pointer and returns that object, which the click then selects.
 * @function module:selection-nav.SvgCanvas#openDeepTarget
 * @param {MouseEvent} evt
 * @returns {Element|null} Null when there is no object under the pointer
 */
const openDeepTarget = (evt) => {
  const target = getDeepTarget(evt)
  if (!target) { return null }
  openContext(target.context)
  return target.elem
}

/**
 * Enter: selects the objects of the selected group. A selected path goes to
 * node editing and a selected text to text editing.
 * @function module:selection-nav.SvgCanvas#selectChildren
 * @returns {boolean} True if something happened
 */
const selectChildren = () => {
  if (svgCanvas.getCurrentMode() !== 'select') { return false }
  const selected = svgCanvas.getSelectedElements().filter(Boolean)
  if (selected.length !== 1) { return false }
  const [elem] = selected
  if (isContainer(elem) && elem !== currentLayer()) {
    if (!selectableChildren(elem).length) { return false }
    openContext(elem)
    svgCanvas.addToSelection(selectableChildren(elem))
    return true
  }
  if (elem.tagName === 'path') {
    svgCanvas.pathActions.toEditMode(elem)
    return true
  }
  if (elem.tagName === 'text') {
    svgCanvas.textActions.start(elem)
    return true
  }
  return false
}

/**
 * Shift+Enter: selects the open group and opens the group that holds it.
 * @function module:selection-nav.SvgCanvas#selectParent
 * @returns {boolean} True if something happened
 */
const selectParent = () => {
  if (svgCanvas.getCurrentMode() !== 'select') { return false }
  const group = svgCanvas.getCurrentGroup()
  if (!group) { return false }
  openContext(group.parentNode)
  svgCanvas.selectOnly([group], true)
  return true
}

/**
 * The value of a fill or stroke that two objects must share. The computed
 * style reads the attribute, the style and what the groups give alike, and
 * writes a color one way ("red", "#f00" and "#ff0000" are the same).
 * @param {Element} elem
 * @param {"fill"|"stroke"} prop
 * @returns {string}
 */
export const paintKey = (elem, prop) => {
  const style = elem.ownerDocument?.defaultView?.getComputedStyle?.(elem)
  let paint = style?.getPropertyValue(prop)?.trim()
  let opacity = style?.getPropertyValue(`${prop}-opacity`)?.trim()
  if (!paint) {
    // No computed style (outside a browser): the attributes, inherited.
    const inherited = (name) => {
      for (let node = elem; node?.nodeType === 1; node = node.parentNode) {
        const value = node.getAttribute(name)
        if (value !== null && value !== 'inherit') { return value }
      }
      return null
    }
    paint = inherited(prop) ?? (prop === 'fill' ? 'black' : 'none')
    opacity = inherited(`${prop}-opacity`) ?? '1'
  }
  if (paint === 'none') { return 'none' }
  return `${paint}|${Number(opacity || 1)}`
}

/**
 * @param {Element} elem
 * @returns {string|null} The reference of a <use>
 */
const hrefOf = (elem) => elem.getAttribute('href') || elem.getAttributeNS(NS.XLINK, 'href') || null

/** What objects must share to be selected together, by criterion. */
const SIMILARITY = {
  symbol: (elem) => (elem.tagName === 'use' ? hrefOf(elem) : null),
  fill: (elem) => (PAINTED.has(elem.tagName) ? paintKey(elem, 'fill') : null),
  stroke: (elem) => (PAINTED.has(elem.tagName) ? paintKey(elem, 'stroke') : null)
}

/**
 * Can the selection give a reference for this criterion? Only the types are
 * checked, so that it is cheap enough for every selection change.
 * @function module:selection-nav.SvgCanvas#canSelectSimilar
 * @param {"symbol"|"fill"|"stroke"} criterion
 * @param {Element[]} [elements] The selection by default
 * @returns {boolean}
 */
const canSelectSimilar = (criterion, elements = svgCanvas.getSelectedElements()) => {
  const types = criterion === 'symbol' ? new Set(['use']) : PAINTED
  return Boolean(SIMILARITY[criterion]) && elements.some((elem) => elem && types.has(elem.tagName))
}

/**
 * Objects of the whole page that share a key, at any depth: inside groups
 * and links, in every visible layer, as Figma looks for them (decision of
 * 8 November). Hidden objects are left out.
 * @param {Set<string>} keys
 * @param {(elem: Element) => (string|null)} keyOf
 * @returns {Element[]} In document order
 */
const findInPage = (keys, keyOf) => {
  const drawing = svgCanvas.getCurrentDrawing()
  const matches = []
  const walk = (parent) => {
    Array.from(parent.children).forEach((elem) => {
      if (!isSelectable(elem) || elem.getAttribute('display') === 'none') { return }
      if (isContainer(elem)) {
        walk(elem)
        return
      }
      if (keys.has(keyOf(elem))) { matches.push(elem) }
    })
  }
  for (let i = 0; i < drawing.getNumLayers(); i++) {
    const name = drawing.getLayerName(i)
    if (drawing.getLayerVisibility(name)) { walk(drawing.getLayerByName(name)) }
  }
  return matches
}

/**
 * Selects the objects of the whole page that share the symbol, the fill or
 * the stroke of a selected object, inside groups and in every visible layer.
 * The objects may then sit in several groups: no group stays open, and the
 * commands of the selection (move, align, flip, group…) take each object in
 * its group's coordinates.
 * @function module:selection-nav.SvgCanvas#selectSimilar
 * @param {"symbol"|"fill"|"stroke"} criterion
 * @returns {Element[]} The objects selected (none: the selection is kept)
 */
const selectSimilar = (criterion) => {
  const keyOf = SIMILARITY[criterion]
  if (!keyOf) { return [] }
  const keys = new Set()
  svgCanvas.getSelectedElements().forEach((elem) => {
    const key = elem && keyOf(elem)
    if (key !== null && key !== undefined) { keys.add(key) }
  })
  if (!keys.size) { return [] }
  const matches = findInPage(keys, keyOf)
  if (matches.length) {
    if (svgCanvas.getCurrentGroup()) { draw.leaveContext() }
    svgCanvas.selectOnly(matches, matches.length === 1)
  }
  return matches
}

/**
 * @function module:selection-nav.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.getDeepTarget = getDeepTarget
  canvas.openDeepTarget = openDeepTarget
  canvas.selectChildren = selectChildren
  canvas.selectParent = selectParent
  canvas.canSelectSimilar = canSelectSimilar
  canvas.selectSimilar = selectSimilar
}
