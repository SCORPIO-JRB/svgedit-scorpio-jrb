/**
 * Ports of connection (lot V7; plan v2, section 2.11, PortModel): the points
 * where a network joins an equipment.
 *
 * A symbol of the library declares its ports on its `<symbol>`, in the
 * editor namespace, in the units of its viewBox:
 *
 *   <symbol id="gtb-pompe" viewBox="0 0 40 40"
 *     se:ports="in 0 20 left in; out 40 20 right out">
 *
 * Each port: an id, a position, the direction in which a pipe leaves it
 * (left, right, up, down) and its kind (in, out, power, signal, any). Every
 * instance (`<use>`) of the symbol has these ports, moved, scaled and turned
 * with it. Any other object has four ports of its own, in the middle of the
 * sides of its box (n, e, s, w), so that a connector can join it too.
 *
 * The positions are in the coordinates of the drawing; nothing here writes
 * to the document.
 * @module ports
 */
import { NS } from './namespaces.js'
import { getHref } from './utilities.js'
import { getTransformList, transformListToTransform } from './math.js'
import { identity, multiply, apply, parentToDrawing, drawingBoxOf } from './multi-transform.js'

let svgCanvas = null

/** Directions a pipe leaves a port in, as unit vectors. */
export const DIRECTIONS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
}

/** Kinds of port. */
export const PORT_KINDS = ['in', 'out', 'power', 'signal', 'any']

/**
 * @typedef {object} PortSpec A port as a symbol declares it
 * @property {string} id
 * @property {number} x In the units of the viewBox of the symbol
 * @property {number} y
 * @property {"left"|"right"|"up"|"down"} dir
 * @property {string} kind
 */

/**
 * @typedef {object} Port A port of an object, in the drawing
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {"left"|"right"|"up"|"down"} dir
 * @property {string} kind
 * @property {boolean} implicit True for the middle of a side of a box
 */

/**
 * Reads the ports of a symbol: "id x y dir kind" separated by semicolons.
 * A port that cannot be read is left out.
 * @param {string|null} text
 * @returns {PortSpec[]}
 */
export const parsePorts = (text) => {
  if (!text) return []
  const ports = []
  for (const part of String(text).split(';')) {
    const [id, x, y, dir = 'right', kind = 'any'] = part.trim().split(/\s+/)
    const px = Number(x)
    const py = Number(y)
    if (!id || !Number.isFinite(px) || !Number.isFinite(py) || !(dir in DIRECTIONS)) continue
    ports.push({ id, x: px, y: py, dir, kind: PORT_KINDS.includes(kind) ? kind : 'any' })
  }
  return ports
}

/**
 * @param {PortSpec[]} ports
 * @returns {string} The value of `se:ports`
 */
export const formatPorts = (ports) => ports
  .map(({ id, x, y, dir, kind = 'any' }) => `${id} ${x} ${y} ${dir} ${kind}`)
  .join('; ')

/**
 * The direction closest to a vector.
 * @param {number} dx
 * @param {number} dy
 * @returns {"left"|"right"|"up"|"down"}
 */
export const directionOf = (dx, dy) => {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}

/**
 * The matrix from the viewBox of a symbol to the user space of a `<use>`,
 * as the viewport of the use places it (preserveAspectRatio of the symbol,
 * `xMidYMid meet` by default).
 * @param {{x: number, y: number, width: number, height: number}} box The
 *   x, y, width and height of the use
 * @param {number[]} viewBox [minX, minY, width, height]
 * @param {string} [preserve] preserveAspectRatio of the symbol
 * @returns {{a: number, b: number, c: number, d: number, e: number, f: number}}
 */
export const viewportMatrix = (box, viewBox, preserve = '') => {
  const [minX, minY, vbW, vbH] = viewBox
  if (!(vbW > 0) || !(vbH > 0)) return { a: 1, b: 0, c: 0, d: 1, e: box.x, f: box.y }
  const sx = box.width / vbW
  const sy = box.height / vbH
  const [align = 'xMidYMid', slice] = String(preserve || '').trim().split(/\s+/)
  if (align === 'none') {
    return { a: sx, b: 0, c: 0, d: sy, e: box.x - minX * sx, f: box.y - minY * sy }
  }
  const s = slice === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy)
  const fx = /xMin/.test(align) ? 0 : /xMax/.test(align) ? 1 : 0.5
  const fy = /YMin/.test(align) ? 0 : /YMax/.test(align) ? 1 : 0.5
  return {
    a: s,
    b: 0,
    c: 0,
    d: s,
    e: box.x + (box.width - vbW * s) * fx - minX * s,
    f: box.y + (box.height - vbH * s) * fy - minY * s
  }
}

/**
 * @param {Element} use
 * @returns {Element|null} The `<symbol>` (or other element) a `<use>` shows
 */
export const referencedSymbol = (use) => {
  if (use?.localName !== 'use') return null
  const href = getHref(use)
  if (!href?.startsWith('#')) return null
  const id = href.slice(1)
  const root = svgCanvas?.getSvgContent?.() ?? use.ownerDocument
  return root.querySelector?.(`[id="${CSS.escape(id)}"]`) ?? use.ownerDocument.getElementById(id)
}

/**
 * @param {Element} elem
 * @returns {{a: number, b: number, c: number, d: number, e: number, f: number}}
 *   The matrix from the user space of the element to the drawing
 */
export const toDrawing = (elem) => {
  const tlist = getTransformList(elem)
  let own = identity()
  if (tlist?.numberOfItems) {
    const m = transformListToTransform(tlist).matrix
    own = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f }
  }
  return multiply(parentToDrawing(elem), own)
}

/**
 * @param {Element} use
 * @param {Element} symbol
 * @returns {{x: number, y: number, width: number, height: number}} The
 *   viewport of a use
 */
const useBox = (use, symbol) => {
  const vb = (symbol.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  const num = (value, fallback) => {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? n : fallback
  }
  return {
    x: num(use.getAttribute('x'), 0),
    y: num(use.getAttribute('y'), 0),
    width: num(use.getAttribute('width'), num(symbol.getAttribute('width'), vb[2] || 100)),
    height: num(use.getAttribute('height'), num(symbol.getAttribute('height'), vb[3] || 100))
  }
}

/**
 * The ports a symbol declares, if any.
 * @param {Element} symbol
 * @returns {PortSpec[]}
 */
export const declaredPorts = (symbol) => parsePorts(symbol?.getAttributeNS(NS.SE, 'ports') ?? symbol?.getAttribute('se:ports'))

/**
 * The ports of an object, in the coordinates of the drawing: those its
 * symbol declares, else the middle of the sides of its box.
 * @param {Element} elem
 * @returns {Port[]}
 */
export const portsOf = (elem) => {
  if (!elem || elem.nodeType !== 1) return []
  const symbol = referencedSymbol(elem)
  const specs = declaredPorts(symbol)
  if (specs.length) {
    const vb = (symbol.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    const viewBox = vb.length === 4 && vb.every(Number.isFinite) ? vb : [0, 0, useBox(elem, symbol).width, useBox(elem, symbol).height]
    const m = multiply(toDrawing(elem), viewportMatrix(useBox(elem, symbol), viewBox, symbol.getAttribute('preserveAspectRatio')))
    return specs.map((spec) => {
      const p = apply(m, spec.x, spec.y)
      const v = DIRECTIONS[spec.dir]
      // The linear part only: the direction turns and flips with the object.
      const dir = directionOf(m.a * v.x + m.c * v.y, m.b * v.x + m.d * v.y)
      return { id: spec.id, x: p.x, y: p.y, dir, kind: spec.kind, implicit: false }
    })
  }
  let box = null
  try {
    box = drawingBoxOf([elem])
  } catch (_e) {
    box = null
  }
  if (!box || !Number.isFinite(box.x)) return []
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  return [
    { id: 'n', x: cx, y: box.y, dir: 'up', kind: 'any', implicit: true },
    { id: 'e', x: box.x + box.width, y: cy, dir: 'right', kind: 'any', implicit: true },
    { id: 's', x: cx, y: box.y + box.height, dir: 'down', kind: 'any', implicit: true },
    { id: 'w', x: box.x, y: cy, dir: 'left', kind: 'any', implicit: true }
  ]
}

/**
 * @param {Element} elem
 * @param {string} id
 * @returns {Port|null} One port of an object; an unknown id gives null
 */
export const portOf = (elem, id) => portsOf(elem).find((port) => port.id === id) ?? null

/**
 * @param {Element} elem
 * @returns {boolean} Whether the object declares ports of its own (a symbol
 *   of the library)
 */
export const hasDeclaredPorts = (elem) => declaredPorts(referencedSymbol(elem)).length > 0

/**
 * The port nearest a point, among those of some objects, within a distance.
 * Declared ports win over the middle of a side at the same distance: they
 * are magnets first (plan v2, 2.11).
 * @param {Element[]} elems
 * @param {{x: number, y: number}} point In the drawing
 * @param {number} radius In units of the drawing
 * @returns {{elem: Element, port: Port, distance: number}|null}
 */
export const nearestPort = (elems, point, radius) => {
  let best = null
  for (const elem of elems) {
    for (const port of portsOf(elem)) {
      const distance = Math.hypot(port.x - point.x, port.y - point.y)
      // A declared port counts as a little closer.
      const score = port.implicit ? distance : distance * 0.5
      if (distance <= radius && (!best || score < best.score)) best = { elem, port, distance, score }
    }
  }
  if (!best) return null
  const { score: _score, ...found } = best
  return found
}

/**
 * @function module:ports.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.portsOf = portsOf
  canvas.portOf = portOf
  canvas.nearestPort = nearestPort
  canvas.hasDeclaredPorts = hasDeclaredPorts
  canvas.referencedSymbol = referencedSymbol
}
