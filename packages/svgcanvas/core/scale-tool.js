/**
 * The Scale tool (K). The selection keeps its proportions, and every length
 * scales with it: the geometry, as with a resize, but also stroke widths,
 * dashes, text sizes and the editor's blur. A resize keeps strokes as they
 * are, since the strokes of a technical drawing have standard widths; the
 * Scale tool is the way to scale them too.
 *
 * Strokes follow one rule, whatever the element type: after the scale, each
 * element shows its stroke k times wider than before. A rectangle whose
 * geometry is rewritten keeps its transform, so its own stroke width is
 * multiplied by k; a `use` keeps a scale matrix, which already scales the
 * stroke of its symbol, so it keeps its width. Children of a group follow
 * the same rule, and an element that inherits a width it must not keep gets
 * its own.
 * @module scale-tool
 * @license MIT
 */

import { BatchCommand, ChangeElementCommand } from './history.js'
import { getTransformList, transformListToTransform, MATRIX_TOLERANCE } from './math.js'

let svgCanvas = null
let scaleToolOn = false

// Lengths of the stroke, multiplied by the scale.
const STROKE_LENGTHS = ['stroke-width', 'stroke-dasharray', 'stroke-dashoffset']
const DEFAULTS = {
  stroke: 'none',
  'stroke-width': '1',
  'stroke-dasharray': 'none',
  'stroke-dashoffset': '0'
}
// Elements whose children are visited, and elements that only pass their
// values down: a container never gets a width of its own.
const DESCEND = new Set(['a', 'g', 'switch', 'text', 'textPath', 'tspan'])
const CONTAINERS = new Set(['a', 'g', 'switch'])
// Elements that draw no stroke.
const NO_STROKE = new Set(['foreignObject', 'image'])
const VISITED = new Set([
  'a', 'circle', 'ellipse', 'foreignObject', 'g', 'image', 'line', 'path',
  'polygon', 'polyline', 'rect', 'switch', 'text', 'textPath', 'tspan', 'use'
])
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi
const EPSILON = 1e-9
// Smallest factor of a drag: the selection never collapses or turns over.
export const MIN_SCALE = 0.01

/**
 * @function module:scale-tool.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  svgCanvas.setScaleTool = setScaleTool
  svgCanvas.isScaleTool = isScaleTool
}

/**
 * Turns the Scale tool on or off. It works in the select mode: choosing
 * another mode turns it off.
 * @function module:svgcanvas.SvgCanvas#setScaleTool
 * @param {boolean} on
 * @returns {void}
 */
export const setScaleTool = (on) => {
  scaleToolOn = Boolean(on)
}

/**
 * @function module:svgcanvas.SvgCanvas#isScaleTool
 * @returns {boolean} True while the Scale tool is on
 */
export const isScaleTool = () => scaleToolOn

// ---------------------------------------------------------------------------
// Geometry of the gesture.

/**
 * Point of a box for a position of the nine-point anchor, or of a grip.
 * @param {module:utilities.BBoxObject} box
 * @param {string} position - n, ne, e, se, s, sw, w, nw or c (center)
 * @returns {{x: number, y: number}}
 */
export const boxPoint = (box, position) => {
  let fx = 0.5
  let fy = 0.5
  if (position.includes('w')) { fx = 0 }
  if (position.includes('e')) { fx = 1 }
  if (position.includes('n')) { fy = 0 }
  if (position.includes('s')) { fy = 1 }
  return { x: box.x + fx * box.width, y: box.y + fy * box.height }
}

const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw' }

/**
 * Fixed point of a grip drag with the Scale tool: the opposite corner, the
 * middle of the opposite side, or the center with Alt.
 * @param {string} dir - The grip
 * @param {boolean} [alt]
 * @returns {string} A position for {@link boxPoint}
 */
export const anchorOfGrip = (dir, alt = false) => (alt ? 'c' : OPPOSITE[dir] || 'c')

/**
 * Factor of a drag with the Scale tool: how far the pointer has gone from
 * the fixed point, measured along the line from that point to the grip,
 * compared with where it started. It is 1 when the mouse goes down, whatever
 * the distance between the pointer and the grip.
 * @param {PlainObject} options
 * @param {{x: number, y: number}} options.anchor - The fixed point
 * @param {{x: number, y: number}} options.grip - The point of the grip
 * @param {{x: number, y: number}} options.start - Pointer when the mouse went down
 * @param {{x: number, y: number}} options.pointer - Pointer now
 * @returns {number}
 */
export const dragFactor = ({ anchor, grip, start, pointer }) => {
  const ux = grip.x - anchor.x
  const uy = grip.y - anchor.y
  const d0 = (start.x - anchor.x) * ux + (start.y - anchor.y) * uy
  if (Math.abs(d0) < EPSILON) { return 1 }
  const d = (pointer.x - anchor.x) * ux + (pointer.y - anchor.y) * uy
  return Math.max(d / d0, MIN_SCALE)
}

// ---------------------------------------------------------------------------
// Lengths of the stroke.

const clean = (n) => String(Number(n.toPrecision(12)))

/**
 * Multiplies every number of a value by a factor: a width, a dash list, a
 * value with a unit. Keywords such as none are left as they are.
 * @param {string} value
 * @param {number} factor
 * @returns {string}
 */
export const scaleNumbers = (value, factor) =>
  String(value).replace(NUMBER, (n) => clean(Number(n) * factor))

/**
 * Value of a property in a style attribute.
 * @param {string|null} style
 * @param {string} prop
 * @returns {string|null}
 */
const styleValue = (style, prop) => {
  if (!style) { return null }
  for (const declaration of style.split(';')) {
    const i = declaration.indexOf(':')
    if (i > 0 && declaration.slice(0, i).trim().toLowerCase() === prop) {
      return declaration.slice(i + 1).trim()
    }
  }
  return null
}

/**
 * Style attribute with one property's value replaced, the rest kept as it is.
 * @param {string} style
 * @param {string} prop
 * @param {(value: string) => string} change
 * @returns {string}
 */
const replaceStyleValue = (style, prop, change) => style.split(';').map((declaration) => {
  const i = declaration.indexOf(':')
  if (i > 0 && declaration.slice(0, i).trim().toLowerCase() === prop) {
    const value = declaration.slice(i + 1)
    return declaration.slice(0, i + 1) + value.replace(value.trim(), change(value.trim()))
  }
  return declaration
}).join(';')

/**
 * An element's own value of a property: its style first, then its attribute.
 * @param {Element} elem
 * @param {string} prop
 * @returns {{value: string, inStyle: boolean}|null} Null when it inherits
 */
const ownValue = (elem, prop) => {
  const styled = styleValue(elem.getAttribute('style'), prop)
  if (styled && styled !== 'inherit') { return { value: styled, inStyle: true } }
  const attr = elem.getAttribute(prop)
  if (attr !== null && attr.trim() !== '' && attr.trim() !== 'inherit') {
    return { value: attr.trim(), inStyle: false }
  }
  return null
}

/**
 * Value an element inherits from its ancestors, outside of the selection.
 * @param {Element} elem
 * @param {string} prop
 * @returns {string}
 */
const inheritedValue = (elem, prop) => {
  const content = svgCanvas.getSvgContent()
  let node = elem.parentNode
  while (node && node.nodeType === 1 && node !== content) {
    const own = ownValue(node, prop)
    if (own) { return own.value }
    node = node.parentNode
  }
  return DEFAULTS[prop]
}

/**
 * Scale of an element's own transform: the square root of its determinant.
 * @param {Element} elem
 * @returns {number}
 */
const ownScale = (elem) => {
  const tlist = getTransformList(elem)
  if (!tlist?.numberOfItems) { return 1 }
  const m = transformListToTransform(tlist).matrix
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
}

/**
 * Scale of the transforms of an element's ancestors, up to the drawing.
 * @param {Element} elem
 * @returns {number}
 */
const ancestorScale = (elem) => {
  const content = svgCanvas.getSvgContent()
  let s = 1
  let node = elem.parentNode
  while (node && node.nodeType === 1 && node !== content) {
    s *= ownScale(node)
    node = node.parentNode
  }
  return s
}

/**
 * The editor's blur of an element: a filter named after it, with one
 * gaussian blur (see blur-event.js). Another filter is left as it is.
 * @param {Element} elem
 * @returns {{filter: Element, blur: Element}|null}
 */
const ownBlur = (elem) => {
  if (!elem.id || elem.getAttribute('filter') !== `url(#${elem.id}_blur)`) { return null }
  const filter = svgCanvas.getElement?.(`${elem.id}_blur`)
  const blur = filter?.querySelector?.('feGaussianBlur')
  if (!blur || filter.children.length !== 1) { return null }
  return { filter, blur }
}

/**
 * Reads, before the selection is scaled, the stroke lengths of its elements
 * and of their descendants, and the scale at which each one is drawn.
 * @param {Element[]} elements
 * @returns {PlainObject[]} One record per element, parents before children
 */
export const readStrokeLengths = (elements) => {
  const records = []
  const visit = (elem, parentScale, parent) => {
    const record = {
      elem,
      parent,
      s0: parentScale * ownScale(elem),
      own: {},
      eff: {},
      blur: ownBlur(elem)
    }
    ;['stroke', ...STROKE_LENGTHS].forEach((prop) => {
      const own = ownValue(elem, prop)
      record.own[prop] = own
      record.eff[prop] = own ? own.value : (parent ? parent.eff[prop] : inheritedValue(elem, prop))
    })
    records.push(record)
    if (DESCEND.has(elem.tagName)) {
      Array.from(elem.children).forEach((child) => {
        if (VISITED.has(child.tagName)) { visit(child, record.s0, record) }
      })
    }
  }
  elements.forEach((elem) => {
    if (elem && VISITED.has(elem.tagName)) { visit(elem, ancestorScale(elem), null) }
  })
  return records
}

/**
 * Multiplies the stroke lengths and the blur read by
 * {@link readStrokeLengths}, once the geometry has been scaled by `k`: each
 * element then shows a stroke k times wider than before.
 * @param {PlainObject[]} records
 * @param {number} k - The uniform scale of the selection
 * @returns {module:history.BatchCommand}
 */
export const scaleStrokeLengths = (records, k) => {
  const batch = new BatchCommand('Scale strokes')
  const changes = new Map()
  const change = (elem, name, oldValue, newValue) => {
    if (!changes.has(elem)) { changes.set(elem, { old: {}, next: {} }) }
    const entry = changes.get(elem)
    if (!(name in entry.old)) { entry.old[name] = oldValue }
    entry.next[name] = newValue
  }
  // Every scale is read before any value is written.
  const s1 = new Map()
  records.forEach((record) => {
    const parentScale = record.parent ? s1.get(record.parent) : ancestorScale(record.elem)
    s1.set(record, parentScale * ownScale(record.elem))
  })
  records.forEach((record) => {
    const { elem } = record
    const grown = record.s0 > EPSILON ? s1.get(record) / record.s0 : 1
    // The scales are read from SVG matrices: in Firefox, an element whose
    // matrix did not change can read a growth of 1.00000002 (see
    // MATRIX_TOLERANCE), and would get a stroke of 1.99999997 instead of 2.
    const g = k / grown
    record.passed = {}
    STROKE_LENGTHS.forEach((prop) => {
      const above = record.parent ? record.parent.passed[prop] : 1
      const own = record.own[prop]
      if (own) {
        record.passed[prop] = g
        if (Math.abs(g - 1) < MATRIX_TOLERANCE) { return }
        const scaled = scaleNumbers(own.value, g)
        if (scaled === own.value) { return }
        if (own.inStyle) {
          // Several properties may share the style attribute.
          const style = changes.get(elem)?.next.style ?? elem.getAttribute('style')
          change(elem, 'style', elem.getAttribute('style'),
            replaceStyleValue(style, prop, (value) => scaleNumbers(value, g)))
        } else {
          change(elem, prop, elem.getAttribute(prop), scaled)
        }
        return
      }
      record.passed[prop] = above
      if (CONTAINERS.has(elem.tagName) || NO_STROKE.has(elem.tagName)) { return }
      if (Math.abs(g - above) < MATRIX_TOLERANCE * Math.abs(above) || record.eff.stroke === 'none') { return }
      // The inherited value no longer fits this element: it gets its own.
      const value = record.eff[prop]
      const scaled = scaleNumbers(value, g)
      if (scaled === value) { return }
      change(elem, prop, elem.getAttribute(prop), scaled)
      record.passed[prop] = g
    })
    if (record.blur && Math.abs(g - 1) > MATRIX_TOLERANCE) {
      const { filter, blur } = record.blur
      const old = blur.getAttribute('stdDeviation')
      if (old !== null) {
        const scaled = scaleNumbers(old, g)
        change(blur, 'stdDeviation', old, scaled)
        // A wider blur needs a wider filter region (see setBlurOffsets).
        const widest = Math.max(...(scaled.match(NUMBER) || ['0']).map(Number))
        if (widest > 3 && !filter.hasAttribute('x')) {
          change(filter, 'x', null, '-50%')
          change(filter, 'y', null, '-50%')
          change(filter, 'width', null, '200%')
          change(filter, 'height', null, '200%')
        }
      }
    }
  })
  // Every value is written, then each command reads the new values.
  changes.forEach(({ next }, elem) => {
    Object.entries(next).forEach(([name, value]) => elem.setAttribute(name, value))
  })
  changes.forEach(({ old }, elem) => batch.addSubCommand(new ChangeElementCommand(elem, old)))
  return batch
}
