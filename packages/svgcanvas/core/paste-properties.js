/**
 * Copying the look of an object onto others (M7): Mod+Alt+C copies the fill,
 * the stroke, the opacity and, for a text, its font; Mod+Alt+V gives them to
 * the selected objects, as one undo step.
 * @module paste-properties
 * @license MIT
 */

import * as hstry from './history.js'

const { BatchCommand, ChangeElementCommand } = hstry

/** Storage key, for this tab: properties survive a reload, like the clipboard. */
const PROPERTIES_ID = 'svgedit_properties'

/** Property groups, and the objects each one applies to. */
const GROUPS = {
  fill: {
    properties: ['fill', 'fill-opacity', 'fill-rule'],
    // Lines and polylines get no fill, as with the fill color of the panel.
    elements: new Set(['circle', 'ellipse', 'path', 'polygon', 'rect', 'text', 'use'])
  },
  stroke: {
    properties: [
      'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
      'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit'
    ],
    elements: new Set(['circle', 'ellipse', 'line', 'path', 'polygon', 'polyline', 'rect', 'text', 'use'])
  },
  opacity: {
    properties: ['opacity'],
    elements: new Set([
      'circle', 'ellipse', 'foreignObject', 'image', 'line', 'path', 'polygon',
      'polyline', 'rect', 'text', 'use'
    ])
  },
  text: {
    properties: [
      'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
      'letter-spacing', 'word-spacing', 'text-decoration'
    ],
    elements: new Set(['text'])
  }
}

/** Properties a group passes on to its objects when they do not set them. */
const NOT_INHERITED = new Set(['opacity', 'text-decoration'])

/** The objects a group stands for. */
const GRAPHICS = new Set([...Object.values(GROUPS).flatMap(({ elements }) => [...elements])])

let svgCanvas = null

/**
 * @function module:paste-properties.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  svgCanvas.copySelectedProperties = copySelectedProperties
  svgCanvas.pasteProperties = pasteProperties
  svgCanvas.hasCopiedProperties = hasCopiedProperties
  svgCanvas.getCopiedProperties = getCopiedProperties
}

/**
 * The objects a selected element stands for: itself, or for a group, the
 * objects inside it (as when the fill color is set on a group).
 * @param {Element} elem
 * @returns {Element[]}
 */
const graphicsOf = (elem) => {
  if (GRAPHICS.has(elem.localName)) return [elem]
  if (elem.localName === 'g' || elem.localName === 'a') {
    return [...elem.querySelectorAll('*')].filter((child) => GRAPHICS.has(child.localName))
  }
  return []
}

/**
 * The value of a property as the object shows it: its own attribute, or for
 * an inherited property, the one of the nearest group that sets it.
 * @param {Element} elem
 * @param {string} name
 * @returns {string|null}
 */
const effectiveValue = (elem, name) => {
  const svgContent = svgCanvas.getSvgContent()
  let node = elem
  while (node && node.nodeType === 1 && node !== svgContent) {
    if (node.hasAttribute(name)) return node.getAttribute(name)
    if (NOT_INHERITED.has(name)) return null
    node = node.parentNode
  }
  return null
}

/**
 * The object properties are copied from: the first selected object, or the
 * first object inside a selected group.
 * @returns {Element|null}
 */
const getSource = () => {
  const selected = svgCanvas.getSelectedElements().filter(Boolean)
  for (const elem of selected) {
    const [source] = graphicsOf(elem)
    if (source) return source
  }
  return null
}

/**
 * Tells whether properties have been copied in this tab.
 * @function module:svgcanvas.SvgCanvas#hasCopiedProperties
 * @returns {boolean}
 */
const hasCopiedProperties = () => Boolean(getCopiedProperties())

/**
 * The copied properties, by group: only the groups that apply to the object
 * they were copied from. A null value is a property the object did not set.
 * @function module:svgcanvas.SvgCanvas#getCopiedProperties
 * @returns {Object<string, Object<string, string|null>>|null}
 */
const getCopiedProperties = () => {
  try {
    const data = JSON.parse(sessionStorage.getItem(PROPERTIES_ID))
    return data && typeof data === 'object' && data.groups && typeof data.groups === 'object'
      ? data.groups
      : null
  } catch {
    return null
  }
}

/**
 * Copies the look of the first selected object: fill, stroke, opacity and,
 * for a text, its font. Nothing is written in the document.
 * @function module:svgcanvas.SvgCanvas#copySelectedProperties
 * @returns {boolean} False when no object gives properties
 */
const copySelectedProperties = () => {
  const source = getSource()
  if (!source) return false
  const groups = {}
  Object.entries(GROUPS).forEach(([group, { properties, elements }]) => {
    if (!elements.has(source.localName)) return
    groups[group] = Object.fromEntries(properties.map((name) => [name, effectiveValue(source, name)]))
  })
  try {
    sessionStorage.setItem(PROPERTIES_ID, JSON.stringify({ version: 1, groups }))
  } catch {
    return false
  }
  svgCanvas.call('clipboardChanged')
  return true
}

/**
 * Tells whether a value refers to a definition this drawing does not have:
 * a gradient copied from another drawing, for instance.
 * @param {string} value
 * @returns {boolean}
 */
const refersToMissing = (value) => {
  const match = /url\(\s*["']?#([^"')\s]+)["']?\s*\)/.exec(value)
  if (!match) return false
  const svgContent = svgCanvas.getSvgContent()
  return ![...svgContent.querySelectorAll('[id]')].some((el) => el.id === match[1])
}

/**
 * Gives the copied properties to the selected objects, or to the objects of a
 * selected group, as one undo step. Only the properties that apply to both
 * objects are given: copied from a rectangle, a fill does not remove the font
 * of a text. A property the source did not set is removed. A reference to a
 * gradient this drawing lacks is left out.
 * @function module:svgcanvas.SvgCanvas#pasteProperties
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {module:history.BatchCommand|null}
 */
const pasteProperties = () => {
  const groups = getCopiedProperties()
  if (!groups) return null
  const targets = []
  svgCanvas.getSelectedElements().filter(Boolean).forEach((elem) => {
    graphicsOf(elem).forEach((target) => {
      if (!targets.includes(target)) targets.push(target)
    })
  })
  const batchCmd = new BatchCommand('Paste properties')
  const changed = []
  targets.forEach((target) => {
    const oldValues = {}
    Object.entries(groups).forEach(([group, values]) => {
      if (!GROUPS[group]?.elements.has(target.localName) || !values) return
      GROUPS[group].properties.forEach((name) => {
        if (!(name in values)) return
        const value = typeof values[name] === 'string' ? values[name] : null
        if (value !== null && refersToMissing(value)) return
        const old = target.getAttribute(name)
        if (old === value) return
        oldValues[name] = old
        if (value === null) {
          target.removeAttribute(name)
        } else {
          target.setAttribute(name, value)
        }
      })
    })
    if (Object.keys(oldValues).length) {
      batchCmd.addSubCommand(new ChangeElementCommand(target, oldValues))
      changed.push(target)
    }
  })
  if (batchCmd.isEmpty()) return null
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.call('changed', changed)
  return batchCmd
}
