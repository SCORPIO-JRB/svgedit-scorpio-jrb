/**
 * Gradients of the colour window: the angle of a linear gradient, its stops,
 * the colour between two stops and the CSS that previews them.
 *
 * The angle follows CSS: 0° goes up, 90° to the right, 180° down. A stop is
 * `{ offset, color, opacity }`: offset and opacity in 0–1, colour in six
 * lower-case hexadecimal digits.
 * @module gradient
 */
import { parseColor, toHex, cssColor } from './color.js'

const NS_SVG = 'http://www.w3.org/2000/svg'
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * A number written in an attribute: four decimals at most, no trailing zero.
 * @param {number} value
 * @returns {string}
 */
export const formatNumber = (value) => {
  const text = (Math.round(value * 10000) / 10000).toFixed(4).replace(/\.?0+$/, '')
  return text === '-0' ? '0' : text
}

/**
 * A length of a gradient attribute: "50%" is 0.5.
 * @param {string|null} value
 * @param {number} fallback
 * @returns {number}
 */
export const readLength = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return fallback
  return String(value).trim().endsWith('%') ? n / 100 : n
}

/**
 * The angle of a linear gradient, from its line.
 * @param {{x1: number, y1: number, x2: number, y2: number}} line
 * @returns {number} Whole degrees in 0–359
 */
export const angleOfLine = ({ x1, y1, x2, y2 }) => {
  const dx = x2 - x1
  const dy = y2 - y1
  if (!dx && !dy) return 90
  const deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI)
  return ((deg % 360) + 360) % 360
}

/**
 * The line of a linear gradient in the box of its object (objectBoundingBox):
 * through the centre, from one side or corner of the box to the other.
 * @param {number} deg
 * @returns {{x1: number, y1: number, x2: number, y2: number}}
 */
export const lineOfAngle = (deg) => {
  const rad = (deg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const scale = 0.5 / Math.max(Math.abs(dx), Math.abs(dy))
  const fix = (v) => Math.round(v * 1e9) / 1e9 || 0
  return {
    x1: fix(0.5 - dx * scale),
    y1: fix(0.5 - dy * scale),
    x2: fix(0.5 + dx * scale),
    y2: fix(0.5 + dy * scale)
  }
}

/**
 * The line of a linear gradient element, with the defaults of SVG.
 * @param {Element} grad
 * @returns {{x1: number, y1: number, x2: number, y2: number}}
 */
export const lineOf = (grad) => ({
  x1: readLength(grad.getAttribute('x1'), 0),
  y1: readLength(grad.getAttribute('y1'), 0),
  x2: readLength(grad.getAttribute('x2'), 1),
  y2: readLength(grad.getAttribute('y2'), 0)
})

/**
 * Turns a linear gradient to an angle. In the box of the object the line goes
 * from side to side; in user space (gradientUnits="userSpaceOnUse") it keeps
 * its centre and its length.
 * @param {Element} grad
 * @param {number} deg
 * @returns {void}
 */
export const setAngle = (grad, deg) => {
  let line
  if (grad.getAttribute('gradientUnits') === 'userSpaceOnUse') {
    const old = lineOf(grad)
    const cx = (old.x1 + old.x2) / 2
    const cy = (old.y1 + old.y2) / 2
    const half = Math.hypot(old.x2 - old.x1, old.y2 - old.y1) / 2 || 1
    const rad = (deg * Math.PI) / 180
    const dx = Math.sin(rad) * half
    const dy = -Math.cos(rad) * half
    line = { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy }
  } else {
    line = lineOfAngle(deg)
  }
  for (const [name, value] of Object.entries(line)) grad.setAttribute(name, formatNumber(value))
}

/**
 * The value of a presentation property of an element: its style attribute
 * wins over its attribute.
 * @param {Element} el
 * @param {string} name
 * @returns {string|null}
 */
const propertyOf = (el, name) => {
  const style = el.getAttribute('style') || ''
  const match = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, 'i'))
  return match ? match[1].trim() : el.getAttribute(name)
}

/**
 * The stops of a gradient, in their order; offsets are kept increasing, as
 * SVG renders them.
 * @param {Element} grad
 * @returns {Array<{offset: number, color: string, opacity: number}>}
 */
export const readStops = (grad) => {
  let last = 0
  return [...grad.children].filter((el) => el.localName === 'stop').map((stop) => {
    const offset = Math.max(last, clamp(readLength(stop.getAttribute('offset'), 0), 0, 1))
    last = offset
    const parsed = parseColor(propertyOf(stop, 'stop-color') ?? 'black') ?? { r: 0, g: 0, b: 0 }
    let opacity = Number.parseFloat(propertyOf(stop, 'stop-opacity') ?? '1')
    if (!Number.isFinite(opacity)) opacity = 1
    if (parsed.a !== undefined) opacity *= parsed.a
    return { offset, color: toHex(parsed), opacity: clamp(opacity, 0, 1) }
  })
}

/**
 * Replaces the stops of a gradient, sorted by offset.
 * @param {Element} grad
 * @param {Array<{offset: number, color: string, opacity: number}>} stops
 * @returns {void}
 */
export const writeStops = (grad, stops) => {
  // The stops go, with the blank text between them.
  for (const node of [...grad.childNodes]) {
    if (node.localName === 'stop' || (node.nodeType === 3 && !node.data.trim())) node.remove()
  }
  const doc = grad.ownerDocument
  for (const stop of sortStops(stops)) {
    const el = doc.createElementNS(NS_SVG, 'stop')
    el.setAttribute('offset', formatNumber(clamp(stop.offset, 0, 1)))
    el.setAttribute('stop-color', `#${stop.color}`)
    if (stop.opacity < 1) el.setAttribute('stop-opacity', formatNumber(clamp(stop.opacity, 0, 1)))
    grad.append(el)
  }
}

/**
 * @param {Array<{offset: number}>} stops
 * @returns {Array} A sorted copy, equal offsets in their order
 */
export const sortStops = (stops) =>
  stops.map((stop, i) => ({ stop, i })).sort((a, b) => a.stop.offset - b.stop.offset || a.i - b.i).map(({ stop }) => stop)

/**
 * The colour of a gradient at an offset, between the two stops around it.
 * @param {Array<{offset: number, color: string, opacity: number}>} stops
 * @param {number} offset 0–1
 * @returns {{color: string, opacity: number}}
 */
export const colorAt = (stops, offset) => {
  const sorted = sortStops(stops)
  if (!sorted.length) return { color: '000000', opacity: 1 }
  if (offset <= sorted[0].offset) return { color: sorted[0].color, opacity: sorted[0].opacity }
  const last = sorted[sorted.length - 1]
  if (offset >= last.offset) return { color: last.color, opacity: last.opacity }
  const i = sorted.findIndex((stop) => stop.offset >= offset)
  const a = sorted[i - 1]
  const b = sorted[i]
  const t = b.offset === a.offset ? 0 : (offset - a.offset) / (b.offset - a.offset)
  const ca = parseColor(a.color)
  const cb = parseColor(b.color)
  const mix = (x, y) => x + (y - x) * t
  return {
    color: toHex({ r: mix(ca.r, cb.r), g: mix(ca.g, cb.g), b: mix(ca.b, cb.b) }),
    opacity: Math.round(mix(a.opacity, b.opacity) * 1000) / 1000
  }
}

/**
 * The stops as a CSS gradient, for the bar of the window and the swatches.
 * @param {Array<{offset: number, color: string, opacity: number}>} stops
 * @param {{type?: "linearGradient"|"radialGradient", angle?: number}} [options]
 *   Without a type, a horizontal bar
 * @returns {string}
 */
export const cssGradient = (stops, { type, angle = 90 } = {}) => {
  const list = sortStops(stops)
    .map((stop) => `${cssColor(parseColor(stop.color), stop.opacity)} ${formatNumber(stop.offset * 100)}%`)
    .join(', ')
  if (type === 'radialGradient') return `radial-gradient(circle closest-side, ${list})`
  return `linear-gradient(${type ? angle : 90}deg, ${list})`
}

/** Attributes a linear and a radial gradient share, kept by a change of style. */
const SHARED = ['gradientUnits', 'gradientTransform', 'spreadMethod', 'id']

/**
 * A new gradient element.
 * @param {Document} doc
 * @param {"linearGradient"|"radialGradient"} type
 * @param {Array<{offset: number, color: string, opacity: number}>} stops
 * @param {Element} [from] Gradient whose shared attributes it keeps
 * @returns {Element}
 */
export const makeGradient = (doc, type, stops, from = null) => {
  const grad = doc.createElementNS(NS_SVG, type)
  for (const name of SHARED) {
    const value = from?.getAttribute(name)
    if (value) grad.setAttribute(name, value)
  }
  if (type === 'linearGradient') {
    // The line of an existing linear gradient is kept; a new one goes left to right.
    if (from?.localName === 'linearGradient') {
      for (const name of ['x1', 'y1', 'x2', 'y2']) {
        const value = from.getAttribute(name)
        if (value !== null) grad.setAttribute(name, value)
      }
    } else {
      setAngle(grad, 90)
    }
  } else if (from?.localName === 'radialGradient') {
    for (const name of ['cx', 'cy', 'r', 'fx', 'fy', 'fr']) {
      const value = from.getAttribute(name)
      if (value !== null) grad.setAttribute(name, value)
    }
  }
  writeStops(grad, stops)
  return grad
}
