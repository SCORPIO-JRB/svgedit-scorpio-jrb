/**
 * Copying the look of an object onto others (M7): Mod+Alt+C copies the fill,
 * the stroke, the opacity and, for a text, its font; Mod+Alt+V gives them to
 * the selected objects, as one undo step.
 *
 * On an object styled by a class (lot S4 of the simplification audit,
 * docs/audit-simplification.md), the copy takes the values as drawn, those
 * of the rules, and the paste changes a value where the target gets it: in
 * its rule, as a field of the panel does (lot S2), with the same warning.
 * @module paste-properties
 * @license MIT
 */

import * as hstry from './history.js'
import { cloneContent, pinLineHeight, changesLayout, layoutText } from './text-lines.js'
import { STYLED_PROPERTIES, getStyledValue, getShownValue } from './style-rules.js'
import { changeStyledProperty } from './undo.js'

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
 * The value of a property as the object shows it: the value a rule or its
 * `style` attribute gives it (lot S4), else its own attribute, or for an
 * inherited property, the one of the nearest group that sets it.
 * @param {Element} elem
 * @param {string} name
 * @returns {string|null}
 */
const effectiveValue = (elem, name) => {
  const svgContent = svgCanvas.getSvgContent()
  let node = elem
  while (node && node.nodeType === 1 && node !== svgContent) {
    const styled = getStyledValue(node, name)
    if (styled) return styled.value
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
const getCopiedProperties = () => readCopied()?.groups ?? null

/**
 * The copied properties, and the values the source showed for those it did
 * not set (lot S4); older data has none of the latter.
 * @returns {{groups: Object<string, Object<string, string|null>>, shown: Object<string, string>}|null}
 */
const readCopied = () => {
  try {
    const data = JSON.parse(sessionStorage.getItem(PROPERTIES_ID))
    if (!data || typeof data !== 'object' || !data.groups || typeof data.groups !== 'object') return null
    return { groups: data.groups, shown: data.shown && typeof data.shown === 'object' ? data.shown : {} }
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
  // What the source shows for a property it does not set: a target that
  // gets the property from a rule takes it there (lot S4).
  const shown = {}
  Object.entries(GROUPS).forEach(([group, { properties, elements }]) => {
    if (!elements.has(source.localName)) return
    groups[group] = Object.fromEntries(properties.map((name) => [name, effectiveValue(source, name)]))
    properties.forEach((name) => {
      if (groups[group][name] !== null || !STYLED_PROPERTIES.has(name)) return
      const value = getShownValue(source, name)
      if (value !== null) shown[name] = value
    })
  })
  try {
    sessionStorage.setItem(PROPERTIES_ID, JSON.stringify({ version: 1, groups, shown }))
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
 * A target that gets a property from a rule or its `style` attribute is
 * changed there, as by a field of the panel (lot S4): the rule takes the
 * value of the source, or for a property the source did not set, the value
 * it showed, unless the target shows it already. The editor asks before
 * keeping a rule changed (`styleRulesChanged`).
 * @function module:svgcanvas.SvgCanvas#pasteProperties
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @fires module:svgcanvas.SvgCanvas#event:styleRulesChanged
 * @returns {module:history.BatchCommand|null}
 */
const pasteProperties = () => {
  const copied = readCopied()
  if (!copied) return null
  const { groups, shown } = copied
  const targets = []
  svgCanvas.getSelectedElements().filter(Boolean).forEach((elem) => {
    graphicsOf(elem).forEach((target) => {
      if (!targets.includes(target)) targets.push(target)
    })
  })
  const batchCmd = new BatchCommand('Paste properties')
  const changed = []
  // The properties of each target changed where they come from (lot S4)
  const styled = new Map()
  Object.entries(groups).forEach(([group, values]) => {
    if (!GROUPS[group] || !values) return
    const applicable = targets.filter((target) => GROUPS[group].elements.has(target.localName))
    GROUPS[group].properties.forEach((name) => {
      if (!(name in values) || !STYLED_PROPERTIES.has(name)) return
      const own = typeof values[name] === 'string'
      const value = own ? values[name] : (typeof shown[name] === 'string' ? shown[name] : null)
      if (value === null || refersToMissing(value)) return
      // A value the source only showed is not written where the target
      // already shows it: `normal` and `400` are the same weight.
      const candidates = own ? applicable : applicable.filter((target) => getShownValue(target, name) !== value)
      const rest = new Set(changeStyledProperty(name, value, candidates, (cmd) => batchCmd.addSubCommand(cmd)))
      candidates.forEach((target) => {
        if (rest.has(target)) return
        if (!styled.has(target)) styled.set(target, new Set())
        styled.get(target).add(name)
      })
    })
  })
  targets.forEach((target) => {
    const oldValues = {}
    // A text of several lines is laid out again for its new font.
    const content = target.localName === 'text' ? cloneContent(target) : null
    Object.entries(groups).forEach(([group, values]) => {
      if (!GROUPS[group]?.elements.has(target.localName) || !values) return
      GROUPS[group].properties.forEach((name) => {
        if (!(name in values) || styled.get(target)?.has(name)) return
        const value = typeof values[name] === 'string' ? values[name] : null
        if (value !== null && refersToMissing(value)) return
        const old = target.getAttribute(name)
        if (old === value) return
        oldValues[name] = old
        if (content && changesLayout(target, name)) pinLineHeight(target)
        if (value === null) {
          target.removeAttribute(name)
        } else {
          target.setAttribute(name, value)
        }
      })
    })
    if (Object.keys(oldValues).length) {
      const laidOut = content && Object.keys(oldValues).some((name) => changesLayout(target, name)) && layoutText(target)
      batchCmd.addSubCommand(new ChangeElementCommand(target, oldValues, undefined, laidOut ? content : undefined))
      changed.push(target)
    } else if (styled.has(target)) {
      changed.push(target)
    }
  })
  if (batchCmd.isEmpty()) return null
  svgCanvas.addCommandToHistory(batchCmd)
  svgCanvas.call('changed', changed)
  return batchCmd
}
