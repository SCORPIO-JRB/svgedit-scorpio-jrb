/**
 * Texts of several lines. A text of one line stays as it always was: its
 * characters alone in the `<text>`. A text of several lines holds one
 * `<tspan>` per line, placed at an absolute `x` and `y`: an empty line keeps
 * its place (the `dy` of an empty `<tspan>` moves nothing), and every reader
 * draws the lines where the editor does.
 *
 * - The `<text>`'s `x` and `y` are those of the first line; `text-anchor`
 *   aligns every line on `x`.
 * - `se:line-height` is the spacing of the lines, in font sizes (1.2 when
 *   absent).
 * - `se:width` is a fixed width: the lines longer than it break at a space.
 *   A line made so carries `se:wrapped="true"`, so that the breaks typed stay
 *   what they were when the width changes.
 * - `xml:space="preserve"` is written when the content has spaces that SVG
 *   would otherwise merge (at the ends of a line, or several in a row): the
 *   spaces typed are drawn.
 * - `se:height` is a fixed height (lot Texte, "Fixed size" in Figma): the
 *   box of the text is that high, whatever its lines. `se:valign` ("middle"
 *   or "bottom"; top when absent) places the lines in it. The `<text>`'s
 *   `y` stays the first baseline of lines at the top of the box, so that the
 *   box keeps its place when lines come and go; the `<tspan>`s are moved
 *   down by what the alignment asks, a text of one line too.
 *
 * The content as it is typed (the source) has its lines separated by "\n".
 * @module text-lines
 */
import { NS } from './namespaces.js'

export const DEFAULT_LINE_HEIGHT = 1.2

/**
 * The attributes after a change of which a text is laid out again.
 * @type {Set<string>}
 */
export const LAYOUT_ATTRS = new Set([
  'font-size', 'font-family', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing',
  'x', 'y', 'se:width', 'se:line-height', 'se:height', 'se:valign'
])

/** The attributes of the box of a text: a text of one line is laid out too. */
const BOX_ATTRS = new Set(['se:width', 'se:height', 'se:valign'])

/** Where the lines of a text of fixed height go in its box. */
const VALIGN_FACTORS = { top: 0, middle: 0.5, bottom: 1 }

const isText = (elem) => elem?.localName === 'text' && elem.namespaceURI === NS.SVG

/**
 * The `<tspan>` lines of a text, or null when its content is something else
 * (characters alone, or spans styling part of a line).
 * @param {Element} text
 * @returns {Element[]|null}
 */
export const lineElements = (text) => {
  if (!isText(text)) return null
  const lines = []
  for (const node of text.childNodes) {
    if (node.nodeType === 3 && !node.nodeValue.trim()) continue
    if (node.nodeType === 1 && node.localName === 'tspan' && !node.firstElementChild &&
      node.hasAttribute('x') && (node.hasAttribute('y') || node.hasAttribute('dy'))) {
      lines.push(node)
      continue
    }
    return null
  }
  return lines.length ? lines : null
}

const isWrapped = (tspan) => tspan.getAttributeNS(NS.SE, 'wrapped') === 'true'

/**
 * The fixed width of a text, or 0.
 * @param {Element} text
 * @returns {number}
 */
export const getTextWidth = (text) => {
  const width = Number.parseFloat(text?.getAttributeNS?.(NS.SE, 'width'))
  return Number.isFinite(width) && width > 0 ? width : 0
}

/**
 * The fixed height of a text, or 0.
 * @param {Element} text
 * @returns {number}
 */
export const getTextHeight = (text) => {
  const height = Number.parseFloat(text?.getAttributeNS?.(NS.SE, 'height'))
  return Number.isFinite(height) && height > 0 ? height : 0
}

/**
 * Where the lines of a text of fixed height go in its box.
 * @param {Element} text
 * @returns {"top"|"middle"|"bottom"}
 */
export const getTextVerticalAlign = (text) => {
  const value = text?.getAttributeNS?.(NS.SE, 'valign')
  return value === 'middle' || value === 'bottom' ? value : 'top'
}

/**
 * The content of an element as it is typed: for a text, its lines separated
 * by "\n" (a line made by the fixed width joins the previous one with the
 * space it broke at); for a text of characters alone, what it draws on one
 * line; for any other element, its `textContent`.
 * @param {Element} elem
 * @returns {string}
 */
export const getTextSource = (elem) => {
  if (!isText(elem)) return elem?.textContent ?? ''
  const lines = lineElements(elem)
  if (!lines) return elem.textContent.replace(/[\r\n\t]/g, ' ')
  return lines.map((line, i) => (i === 0 ? '' : isWrapped(line) ? ' ' : '\n') + line.textContent).join('')
}

/** How much wider than its width a line may measure (the rounding of a width). */
const WRAP_TOLERANCE = 0.01

/**
 * Breaks a line at its spaces so that each part is at most `width` wide; a
 * word wider than that stays whole. Joining the parts with one space gives
 * the line back.
 * @param {string} line
 * @param {number} width
 * @param {(s: string) => number} measure - Width of a string
 * @returns {string[]}
 */
export const wrapLine = (line, width, measure) => {
  const words = line.split(' ')
  const parts = []
  let current = words[0]
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`
    // A width rounded in the file is not a reason to break a line.
    if (current !== '' && measure(candidate) > width + WRAP_TOLERANCE) {
      parts.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  parts.push(current)
  return parts
}

/**
 * A function measuring strings as the text draws them: a copy of the text,
 * without its transform, next to it.
 * @param {Element} text
 * @returns {{measure: (s: string) => number, done: () => void}}
 */
const measurer = (text) => {
  const probe = text.cloneNode(false)
  probe.removeAttribute('id')
  probe.removeAttribute('transform')
  probe.setAttribute('visibility', 'hidden')
  probe.setAttributeNS(NS.XML, 'xml:space', 'preserve')
  const parent = text.parentNode
  parent?.append(probe)
  const fontSize = fontSizeOf(text)
  return {
    measure: (s) => {
      probe.textContent = s
      try {
        return probe.getComputedTextLength()
      } catch {
        // No layout (a test document): an average glyph
        return s.length * fontSize * 0.55
      }
    },
    done: () => probe.remove()
  }
}

/**
 * The font size of a text, in user units.
 * @param {Element} text
 * @returns {number}
 */
const fontSizeOf = (text) => {
  const computed = text.isConnected ? Number.parseFloat(window.getComputedStyle(text).fontSize) : NaN
  if (Number.isFinite(computed) && computed > 0) return computed
  const own = Number.parseFloat(text.getAttribute('font-size'))
  return Number.isFinite(own) && own > 0 ? own : 16
}

const firstNumber = (value) => Number.parseFloat(String(value ?? '').trim().split(/[\s,]+/)[0])

const metricsCache = new Map()

/**
 * The height of a line of a text above its baseline and under it, as the
 * browser draws its box (the font's ascent and descent), read once for each
 * font.
 * @param {Element} text
 * @returns {{ascent: number, descent: number}}
 */
export const lineMetrics = (text) => {
  const fontSize = fontSizeOf(text)
  const fallback = { ascent: fontSize * 0.9, descent: fontSize * 0.25 }
  if (!text?.isConnected || typeof text.getBBox !== 'function') return fallback
  const style = window.getComputedStyle(text)
  const key = `${style.fontStyle} ${style.fontWeight} ${fontSize} ${style.fontFamily}`
  if (metricsCache.has(key)) return metricsCache.get(key)
  const probe = text.cloneNode(false)
  probe.removeAttribute('id')
  probe.removeAttribute('transform')
  probe.setAttribute('x', '0')
  probe.setAttribute('y', '0')
  probe.setAttribute('visibility', 'hidden')
  probe.textContent = 'Hg'
  text.parentNode.append(probe)
  let metrics = fallback
  try {
    const box = probe.getBBox()
    if (box.height > 0) metrics = { ascent: -box.y, descent: box.height + box.y }
  } catch {
    // No layout: the fallback
  } finally {
    probe.remove()
  }
  if (metrics !== fallback) metricsCache.set(key, metrics)
  return metrics
}

/**
 * How far the lines of a text of fixed height are moved down in its box, for
 * a number of lines.
 * @param {Element} text
 * @param {number} count
 * @param {number} step - From a line to the next
 * @returns {number}
 */
const alignOffset = (text, count, step) => {
  const height = getTextHeight(text)
  const factor = height ? VALIGN_FACTORS[getTextVerticalAlign(text)] : 0
  if (!factor) return 0
  const { ascent, descent } = lineMetrics(text)
  return (height - (ascent + descent + (count - 1) * step)) * factor
}

/**
 * The spacing of the lines of a text, in font sizes: `se:line-height`, else
 * read from its first two lines, else 1.2.
 * @param {Element} text
 * @returns {number}
 */
export const getLineHeight = (text) => {
  const own = Number.parseFloat(text?.getAttributeNS?.(NS.SE, 'line-height'))
  if (Number.isFinite(own) && own > 0) return own
  const lines = lineElements(text)
  if (lines?.length > 1) {
    const fontSize = fontSizeOf(text)
    const [first, second] = lines
    let step = NaN
    if (first.hasAttribute('y') && second.hasAttribute('y')) {
      step = firstNumber(second.getAttribute('y')) - firstNumber(first.getAttribute('y'))
    } else if (second.hasAttribute('dy')) {
      const dy = String(second.getAttribute('dy')).trim()
      step = dy.endsWith('em') ? Number.parseFloat(dy) * fontSize : firstNumber(dy)
    }
    const ratio = step / fontSize
    if (Number.isFinite(ratio) && ratio > 0) return Math.round(ratio * 1000) / 1000
  }
  return DEFAULT_LINE_HEIGHT
}

/**
 * Writes the line height a text of several lines has, when it does not say
 * it: before its font size changes, its lines tell it.
 * @param {Element} text
 * @returns {void}
 */
export const pinLineHeight = (text) => {
  if (!lineElements(text)?.[1] || text.hasAttributeNS(NS.SE, 'line-height')) return
  text.setAttributeNS(NS.SE, 'se:line-height', String(getLineHeight(text)))
}

const round = (n) => String(Math.round(n * 1000) / 1000)

/**
 * Lays a text out from its source: one line, its characters; several, one
 * `<tspan>` each. The `<tspan>` of a line that was there stays (with its
 * attributes); only its place and characters change.
 * @param {Element} text
 * @param {string} [source] - The content as typed; the text's own when absent
 * @returns {void}
 */
export const setTextSource = (text, source = getTextSource(text)) => {
  source = String(source ?? '').replace(/\r\n?/g, '\n')
  const width = getTextWidth(text)
  const rows = []
  const measuring = width ? measurer(text) : null
  for (const line of source.split('\n')) {
    const parts = measuring ? wrapLine(line, width, measuring.measure) : [line]
    parts.forEach((part, i) => rows.push({ text: part, wrapped: i > 0 }))
  }
  measuring?.done()
  if (/^ | $| {2}|\t/m.test(source)) {
    text.setAttributeNS(NS.XML, 'xml:space', 'preserve')
  }

  const existing = lineElements(text)
  const origin = {
    x: text.getAttribute('x') ?? existing?.[0].getAttribute('x') ?? '0',
    y: text.getAttribute('y') ?? existing?.[0].getAttribute('y') ?? '0'
  }
  const lineHeight = getLineHeight(text)
  const step = lineHeight * fontSizeOf(text)
  // A line moved down in its box of fixed height is a <tspan> too.
  const offset = alignOffset(text, rows.length, step)
  if (rows.length === 1 && !offset) {
    if (existing && !text.hasAttribute('x')) text.setAttribute('x', firstNumber(origin.x))
    if (existing && !text.hasAttribute('y')) text.setAttribute('y', firstNumber(origin.y))
    if (existing || text.textContent !== rows[0].text) text.textContent = rows[0].text
    return
  }

  const x = firstNumber(origin.x) || 0
  const y = firstNumber(origin.y) || 0
  if (!text.hasAttribute('x')) text.setAttribute('x', round(x))
  if (!text.hasAttribute('y')) text.setAttribute('y', round(y))
  if (rows.length > 1 && !text.hasAttributeNS(NS.SE, 'line-height')) {
    text.setAttributeNS(NS.SE, 'se:line-height', String(lineHeight))
  }
  const tspans = existing ?? []
  // Whatever else the text held goes: characters, spans, spaces between lines.
  for (const node of [...text.childNodes]) {
    if (!tspans.includes(node)) node.remove()
  }
  rows.forEach((row, i) => {
    let tspan = tspans[i]
    if (!tspan) {
      tspan = document.createElementNS(NS.SVG, 'tspan')
      text.append(tspan)
    }
    tspan.setAttribute('x', round(x))
    tspan.setAttribute('y', round(y + offset + i * step))
    tspan.removeAttribute('dy')
    if (row.wrapped) {
      tspan.setAttributeNS(NS.SE, 'se:wrapped', 'true')
    } else {
      tspan.removeAttributeNS(NS.SE, 'wrapped')
    }
    if (tspan.textContent !== row.text) tspan.textContent = row.text
  })
  tspans.slice(rows.length).forEach((tspan) => tspan.remove())
}

/**
 * Lays a text out again after a change of its font, place, box or line
 * height. A text of characters alone without fixed width or height is left
 * as it is.
 * @param {Element} text
 * @returns {boolean} Whether it was laid out
 */
export const layoutText = (text) => {
  if (!isText(text) || (!lineElements(text) && !getTextWidth(text) && !getTextHeight(text))) return false
  setTextSource(text, getTextSource(text))
  return true
}

/**
 * Whether a change of `attr` lays `elem` out again.
 * @param {Element} elem
 * @param {string} attr
 * @returns {boolean}
 */
export const changesLayout = (elem, attr) =>
  isText(elem) && LAYOUT_ATTRS.has(attr) &&
  (BOX_ATTRS.has(attr) || Boolean(lineElements(elem) || getTextWidth(elem) || getTextHeight(elem)))

// Attributes of a text that its layout writes: a step putting back its
// content puts them back too.
const OWNED = [[NS.SE, 'se:line-height'], [NS.XML, 'xml:space']]
const localOf = (name) => name.slice(name.indexOf(':') + 1)

/**
 * A copy of the content of an element (and of the attributes its layout
 * writes), to put back with {@link restoreContent}.
 * @param {Element} elem
 * @returns {{nodes: Node[], attrs: Array<string|null>}}
 */
export const cloneContent = (elem) => ({
  nodes: [...elem.childNodes].map((node) => node.cloneNode(true)),
  attrs: OWNED.map(([ns, name]) => elem.getAttributeNS(ns, localOf(name)))
})

/**
 * Puts back a content copied by {@link cloneContent} (a copy of it: the
 * same step can be undone and redone again).
 * @param {Element} elem
 * @param {{nodes: Node[], attrs: Array<string|null>}} content
 * @returns {void}
 */
export const restoreContent = (elem, content) => {
  elem.replaceChildren(...content.nodes.map((node) => node.cloneNode(true)))
  OWNED.forEach(([ns, name], i) => {
    const value = content.attrs[i]
    if (value === null) {
      elem.removeAttributeNS(ns, localOf(name))
    } else {
      elem.setAttributeNS(ns, name, value)
    }
  })
}

/**
 * Whether an element still has a content copied by {@link cloneContent}.
 * @param {{nodes: Node[], attrs: Array<string|null>}} content
 * @param {Element} elem
 * @returns {boolean}
 */
export const sameContent = (content, elem) => {
  const current = cloneContent(elem)
  return content.nodes.length === current.nodes.length &&
    content.nodes.every((node, i) => node.isEqualNode(current.nodes[i])) &&
    content.attrs.every((value, i) => value === current.attrs[i])
}

/**
 * Starts the change of the box of a text by a grip, as in Figma: the text
 * keeps its font, its lines break again in the box.
 * - A side grip gives the width: a text as wide as its lines gets a fixed
 *   width (auto height); a text of fixed size keeps its height.
 * - The top and bottom grips give the height, the corners both: the text
 *   becomes of fixed size.
 * @param {Element} text
 * @returns {object} What {@link resizeTextBox} and the end of the gesture read
 */
export const startTextBoxResize = (text) => {
  const box = text.getBBox()
  const width = getTextWidth(text) || box.width
  const anchor = window.getComputedStyle(text).textAnchor
  const factor = anchor === 'middle' ? 0.5 : anchor === 'end' ? 1 : 0
  const x = firstNumber(text.getAttribute('x')) || 0
  const y = firstNumber(text.getAttribute('y')) || 0
  const { ascent } = lineMetrics(text)
  // Units of the drawing in a unit of the text (its groups, its transform)
  const ctm = text.getScreenCTM?.()
  const content = text.ownerSVGElement?.getScreenCTM?.()
  const scale = ctm && content ? Math.hypot(ctm.a, ctm.b) / (Math.hypot(content.a, content.b) || 1) : 1
  return {
    text,
    width,
    height: getTextHeight(text) || box.height,
    left: x - factor * width,
    top: y - ascent,
    ascent,
    factor,
    scale: scale || 1,
    min: fontSizeOf(text),
    before: {
      'se:width': text.getAttribute('se:width'),
      'se:height': text.getAttribute('se:height'),
      x: text.getAttribute('x'),
      y: text.getAttribute('y')
    },
    content: cloneContent(text)
  }
}

/**
 * Sets the box of a text during the gesture: the dragged sides follow the
 * pointer, the others stay.
 * @param {object} state - From {@link startTextBoxResize}
 * @param {number} dx - Move of the pointer, in the drawing, along the text
 * @param {number} dy - Move of the pointer, across the text
 * @param {string} side - The grip: "e", "w", "n", "s", "ne", "nw", "se" or "sw"
 * @param {object} [options]
 * @param {boolean} [options.symmetric] - The opposite sides move too (Alt)
 * @param {boolean} [options.proportional] - A corner keeps the proportions of the box (Shift)
 * @returns {{width: number, height: number}} The box
 */
export const resizeTextBox = (state, dx, dy, side, { symmetric = false, proportional = false } = {}) => {
  const horizontal = /[ew]/.test(side)
  const vertical = /[ns]/.test(side)
  const k = symmetric ? 2 : 1
  let width = state.width
  let height = state.height
  if (horizontal) width = Math.max(state.min, state.width + k * (side.includes('w') ? -dx : dx) / state.scale)
  if (vertical) height = Math.max(1, state.height + k * (side.includes('n') ? -dy : dy) / state.scale)
  if (proportional && horizontal && vertical && state.height > 0) {
    const ratio = Math.max(width / state.width, height / state.height)
    width = Math.max(state.min, state.width * ratio)
    height = width * state.height / state.width
  }
  const left = symmetric
    ? state.left + (state.width - width) / 2
    : side.includes('w') ? state.left + state.width - width : state.left
  const top = symmetric
    ? state.top + (state.height - height) / 2
    : side.includes('n') ? state.top + state.height - height : state.top
  const { text } = state
  // A fixed height needs a fixed width: the box of a text as wide as its
  // lines is as wide as they are.
  if (horizontal || vertical) text.setAttributeNS(NS.SE, 'se:width', round(width))
  if (vertical) text.setAttributeNS(NS.SE, 'se:height', round(height))
  text.setAttribute('x', round(left + state.factor * width))
  if (vertical) text.setAttribute('y', round(top + state.ascent))
  setTextSource(text, getTextSource(text))
  return { width, height }
}
