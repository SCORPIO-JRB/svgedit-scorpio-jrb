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
  'x', 'y', 'se:width', 'se:line-height'
])

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
    if (current !== '' && measure(candidate) > width) {
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
  if (rows.length === 1) {
    if (existing && !text.hasAttribute('x')) text.setAttribute('x', firstNumber(origin.x))
    if (existing && !text.hasAttribute('y')) text.setAttribute('y', firstNumber(origin.y))
    if (existing || text.textContent !== rows[0].text) text.textContent = rows[0].text
    return
  }

  const x = firstNumber(origin.x) || 0
  const y = firstNumber(origin.y) || 0
  if (!text.hasAttribute('x')) text.setAttribute('x', round(x))
  if (!text.hasAttribute('y')) text.setAttribute('y', round(y))
  const lineHeight = getLineHeight(text)
  if (!text.hasAttributeNS(NS.SE, 'line-height')) {
    text.setAttributeNS(NS.SE, 'se:line-height', String(lineHeight))
  }
  const step = lineHeight * fontSizeOf(text)
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
    tspan.setAttribute('y', round(y + i * step))
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
 * Lays a text out again after a change of its font, place, width or line
 * height. A text of characters alone without fixed width is left as it is.
 * @param {Element} text
 * @returns {boolean} Whether it was laid out
 */
export const layoutText = (text) => {
  if (!isText(text) || (!lineElements(text) && !getTextWidth(text))) return false
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
  isText(elem) && LAYOUT_ATTRS.has(attr) && Boolean(lineElements(elem) || getTextWidth(elem))

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
 * Starts the change of the width of a text by a side grip: the text keeps
 * its font, its lines break again (a text as wide as its lines gets a fixed
 * width).
 * @param {Element} text
 * @returns {object} What {@link resizeTextWidth} and the end of the gesture read
 */
export const startTextWidthResize = (text) => {
  const box = text.getBBox()
  const width = getTextWidth(text) || box.width
  const anchor = window.getComputedStyle(text).textAnchor
  const factor = anchor === 'middle' ? 0.5 : anchor === 'end' ? 1 : 0
  const x = firstNumber(text.getAttribute('x')) || 0
  // Units of the drawing in a unit of the text (its groups, its transform)
  const ctm = text.getScreenCTM?.()
  const content = text.ownerSVGElement?.getScreenCTM?.()
  const scale = ctm && content ? Math.hypot(ctm.a, ctm.b) / (Math.hypot(content.a, content.b) || 1) : 1
  return {
    text,
    width,
    left: x - factor * width,
    factor,
    scale: scale || 1,
    min: fontSizeOf(text),
    before: { 'se:width': text.getAttribute('se:width'), x: text.getAttribute('x') },
    content: cloneContent(text)
  }
}

/**
 * Sets the width of a text during the gesture: the dragged side follows the
 * pointer, the other stays (both move with `symmetric`).
 * @param {object} state - From {@link startTextWidthResize}
 * @param {number} dx - Move of the pointer, in the drawing, along the text
 * @param {"e"|"w"} side
 * @param {boolean} [symmetric]
 * @returns {number} The width
 */
export const resizeTextWidth = (state, dx, side, symmetric = false) => {
  const d = (side === 'w' ? -dx : dx) / state.scale
  const width = Math.max(state.min, state.width + (symmetric ? 2 * d : d))
  const left = symmetric
    ? state.left + (state.width - width) / 2
    : side === 'w' ? state.left + state.width - width : state.left
  const { text } = state
  text.setAttributeNS(NS.SE, 'se:width', round(width))
  text.setAttribute('x', round(left + state.factor * width))
  setTextSource(text, getTextSource(text))
  return width
}
