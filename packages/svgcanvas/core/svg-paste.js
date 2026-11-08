/**
 * Pasting SVG text that comes from outside the editor (M7): another browser,
 * a drawing application, a text editor. The text goes through the same filter
 * as an opened file, then its objects are added to the drawing as editable
 * objects, not as an image.
 * @module svg-paste
 * @license MIT
 */

import { NS } from './namespaces.js'
import * as hstry from './history.js'
import { text2xml } from './utilities.js'
import { convertToNum } from './units.js'
import { finishPaste } from './paste-elem.js'
import { splitTopLevel } from './css-scope.js'

const { BatchCommand, InsertElementCommand } = hstry

let svgCanvas = null

/**
 * @function module:svg-paste.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  svgCanvas.pasteSvgString = pasteSvgString
}

/** Objects that are pasted into the drawing. */
const DRAWABLE = new Set([
  'a', 'circle', 'ellipse', 'foreignObject', 'g', 'image', 'line', 'path',
  'polygon', 'polyline', 'rect', 'svg', 'switch', 'text', 'use'
])

/** Definitions found outside a <defs>: they go to the drawing's <defs>. */
const RESOURCES = new Set([
  'clipPath', 'filter', 'linearGradient', 'marker', 'mask', 'pattern',
  'radialGradient', 'symbol'
])

/**
 * CSS properties that are also SVG presentation attributes, and keep the same
 * syntax as attributes. `transform` is left out: its CSS syntax differs.
 */
const PRESENTATION = new Set([
  'alignment-baseline', 'baseline-shift', 'clip-path', 'clip-rule', 'color',
  'color-interpolation', 'color-interpolation-filters', 'direction', 'display',
  'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'filter',
  'flood-color', 'flood-opacity', 'font-family', 'font-size', 'font-size-adjust',
  'font-stretch', 'font-style', 'font-variant', 'font-weight', 'image-rendering',
  'letter-spacing', 'lighting-color', 'marker-end', 'marker-mid', 'marker-start',
  'mask', 'opacity', 'overflow', 'paint-order', 'shape-rendering', 'stop-color',
  'stop-opacity', 'stroke', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity',
  'stroke-width', 'text-anchor', 'text-decoration', 'text-rendering',
  'unicode-bidi', 'vector-effect', 'visibility', 'word-spacing', 'writing-mode'
])

/**
 * Specificity of one selector, as [ids, classes, types], close enough for the
 * stylesheets that drawing applications write.
 * @param {string} selector
 * @returns {number[]}
 */
const specificity = (selector) => {
  const text = selector.replace(/\([^)]*\)/g, '')
  const ids = (text.match(/#[\w-]+/g) || []).length
  const classes = (text.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length
  const types = (text.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length +
    (text.match(/::[\w-]+/g) || []).length
  return [ids, classes, types]
}

/**
 * Reads the style rules of a stylesheet. At-rules (`@media`, `@font-face`,
 * `@import`...) are skipped.
 * @param {string} css
 * @param {string[]} [skipped] - Receives the at-rules skipped
 * @returns {{selectors: {text: string, specificity: number[]}[], declarations: [string, string, boolean][]}[]}
 */
export const parseStyleRules = (css, skipped = []) => {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open === -1) break
    const prelude = text.slice(i, open).trim()
    // Find the matching closing brace (at-rules can nest blocks).
    let depth = 1
    let j = open + 1
    while (j < text.length && depth) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const body = text.slice(open + 1, j - 1)
    i = j
    const statements = prelude.split(';').map((part) => part.trim())
    const statement = statements.pop()
    skipped.push(...statements.filter((part) => part && !/^@charset\b/i.test(part)))
    if (statement.startsWith('@')) skipped.push(statement)
    if (!statement || statement.startsWith('@')) continue
    const declarations = splitTopLevel(body, ';').map((declaration) => {
      const colon = declaration.indexOf(':')
      if (colon === -1) return null
      const name = declaration.slice(0, colon).trim().toLowerCase()
      let value = declaration.slice(colon + 1).trim()
      const important = /!\s*important\s*$/i.test(value)
      if (important) value = value.replace(/!\s*important\s*$/i, '').trim()
      return name && value ? [name, value, important] : null
    }).filter(Boolean)
    if (!declarations.length) continue
    const selectors = splitTopLevel(statement, ',').map((selector) => ({
      text: selector,
      specificity: specificity(selector)
    }))
    rules.push({ selectors, declarations })
  }
  return rules
}

const compareSpecificity = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2])

/**
 * Turns the stylesheets of an SVG into presentation attributes, then removes
 * them. A stylesheet left in the drawing would apply to the whole drawing:
 * two pasted files that both name a class `cls-1` would recolor each other.
 * Rules override presentation attributes and are applied by specificity,
 * then in order; the `style` attribute of an element still wins, as it is
 * turned into attributes afterwards (by the import filter, or by
 * styleToAttributes).
 * @function module:svg-paste.inlineStyleSheets
 * @param {Element} root - The <svg> element
 * @param {object} [options]
 * @param {function(string): string} [options.original] - The selector as the
 *   file wrote it, for the list of what is lost
 * @returns {string[]} What could not become attributes, so is lost: at-rules
 *   (`@keyframes`, `@media`...), properties without an attribute
 *   (`animation`...) and selectors that matched no object (states,
 *   `:hover`...)
 */
export const inlineStyleSheets = (root, { original = (selector) => selector } = {}) => {
  const styles = [...root.querySelectorAll('*')].filter((el) => el.localName === 'style')
  if (!styles.length) return []
  const css = styles.map((style) => style.textContent).join('\n')
  styles.forEach((style) => style.remove())
  const atRules = []
  const rules = parseStyleRules(css, atRules)
  const used = new Set()

  const elements = [root, ...root.querySelectorAll('*')]
  elements.forEach((element) => {
    const matches = []
    rules.forEach((rule, order) => {
      rule.selectors.forEach((selector) => {
        let matched = false
        try {
          matched = element.matches(selector.text)
        } catch {
          // A selector the browser does not know matches nothing.
        }
        if (matched) {
          matches.push({ specificity: selector.specificity, order, rule })
          used.add(original(selector.text))
        }
      })
    })
    if (!matches.length) return
    matches.sort((a, b) => compareSpecificity(a.specificity, b.specificity) || a.order - b.order)
    const values = new Map()
    const important = new Map()
    matches.forEach(({ rule }) => {
      rule.declarations.forEach(([name, value, isImportant]) => {
        (isImportant ? important : values).set(name, value)
      })
    })
    important.forEach((value, name) => values.set(name, value))
    values.forEach((value, name) => {
      if (PRESENTATION.has(name)) element.setAttribute(name, value)
    })
  })
  const properties = rules.flatMap((rule) => rule.declarations.map(([name]) => name))
    .filter((name) => !PRESENTATION.has(name))
  const unmatched = rules.flatMap((rule) => rule.selectors.map((selector) => original(selector.text)))
    .filter((selector) => !used.has(selector))
  return [...new Set([...atRules, ...properties, ...unmatched])]
}

/**
 * Turns the presentation properties of `style` attributes into attributes,
 * as the import filter does, so that the editor can show and change them.
 * Run after inlineStyleSheets: the `style` attribute wins over the rules.
 * @function module:svg-paste.styleToAttributes
 * @param {Element} root
 * @returns {void}
 */
export const styleToAttributes = (root) => {
  [root, ...root.querySelectorAll('[style]')].forEach((element) => {
    const style = element.getAttribute('style')
    if (style === null) return
    const kept = splitTopLevel(style, ';').filter((declaration) => {
      const colon = declaration.indexOf(':')
      const name = declaration.slice(0, colon).trim().toLowerCase()
      if (colon === -1 || !PRESENTATION.has(name)) return true
      element.setAttribute(name, declaration.slice(colon + 1).trim())
      return false
    })
    if (kept.length) element.setAttribute('style', kept.join('; '))
    else element.removeAttribute('style')
  })
}

/**
 * Parses SVG text. A root <svg> written without its namespace, as copied from
 * an HTML page, is accepted, and so is the `xlink:` prefix left undeclared.
 * @function module:svg-paste.parseSvgText
 * @param {string} text
 * @returns {Document|null} Null when the text is not an SVG document
 */
export const parseSvgText = (text) => {
  if (typeof text !== 'string') return null
  let source = text.trim().replace(/^\uFEFF/, '')
  if (!/<svg[\s>]/i.test(source)) return null
  const svgTag = /<svg\b[^>]*>/i.exec(source)?.[0] || ''
  if (svgTag && !/\sxmlns\s*=/.test(svgTag)) {
    source = source.replace(/<svg\b/i, `<svg xmlns="${NS.SVG}"`)
  }
  if (/\bxlink:/.test(source) && !/\sxmlns:xlink\s*=/.test(source)) {
    source = source.replace(/<svg\b/i, `<svg xmlns:xlink="${NS.XLINK}"`)
  }
  let doc
  try {
    doc = text2xml(source)
  } catch {
    return null
  }
  const root = doc?.documentElement
  if (
    !root ||
    root.localName !== 'svg' ||
    root.namespaceURI !== NS.SVG ||
    doc.getElementsByTagName('parsererror').length
  ) {
    return null
  }
  return doc
}

/**
 * Reads a length of the root <svg> in pixels. A percentage or a relative unit
 * gives null: the size then comes from the view box.
 * @param {string|null} value
 * @returns {number|null}
 */
const readLength = (value) => {
  if (!value) return null
  const text = value.trim()
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(px|pt|pc|mm|cm|in)?$/i.test(text)) return null
  const number = convertToNum('width', text.replace(/px$/i, ''))
  return Number.isFinite(number) && number > 0 ? number : null
}

/**
 * Reads the view box of an element.
 * @function module:svg-paste.readViewBox
 * @param {Element} elem
 * @returns {number[]|null} [x, y, width, height]; null when missing or invalid
 */
export const readViewBox = (elem) => {
  const viewBox = (elem.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  return viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0
    ? viewBox
    : null
}

/**
 * The size an SVG declares for itself, in pixels: its width and height, else
 * those of its view box. A missing width or height follows the proportions of
 * the view box.
 * @function module:svg-paste.getDeclaredSize
 * @param {Element} root
 * @returns {{width: number|null, height: number|null}} Null when not declared
 *   (or as a percentage)
 */
export const getDeclaredSize = (root) => {
  const viewBox = readViewBox(root)
  let width = readLength(root.getAttribute('width'))
  let height = readLength(root.getAttribute('height'))
  if (viewBox) {
    if (width === null && height === null) {
      [, , width, height] = viewBox
    } else if (width === null) {
      width = height * viewBox[2] / viewBox[3]
    } else if (height === null) {
      height = width * viewBox[3] / viewBox[2]
    }
  }
  return { width, height }
}

/**
 * The scale between the root's view box and the size the SVG declares, so
 * that pasted objects keep the size the SVG asks for. Null when they already
 * do. The position of the view box is not applied: pasting places the
 * objects, and pasting in place keeps their own coordinates.
 * @param {Element} root
 * @returns {{x: number, y: number}|null}
 */
const getRootScale = (root) => {
  const viewBox = readViewBox(root)
  if (!viewBox) return null
  const width = readLength(root.getAttribute('width'))
  const height = readLength(root.getAttribute('height'))
  let x = width ? width / viewBox[2] : null
  let y = height ? height / viewBox[3] : null
  if (x === null && y === null) return null
  if (x === null) x = y
  if (y === null) y = x
  if ((root.getAttribute('preserveAspectRatio') || '').trim() !== 'none') {
    x = y = Math.min(x, y)
  }
  if (Math.abs(x - 1) < 1e-9 && Math.abs(y - 1) < 1e-9) return null
  return { x, y }
}

/**
 * Sorts the content of a pasted <svg>: the objects to paste, and the
 * definitions they need. The layers of a drawing made by this editor are
 * opened, so that their objects are pasted rather than the layer itself.
 * @param {Element} root
 * @returns {{drawables: Element[], resources: Element[]}}
 */
const sortContent = (root) => {
  const drawables = []
  const resources = []
  const visit = (parent) => {
    [...parent.children].forEach((child) => {
      const name = child.localName
      if (name === 'defs') {
        resources.push(...child.children)
      } else if (name === 'g' && (child.getAttribute('class') || '').split(/\s+/).includes('layer')) {
        visit(child)
      } else if (DRAWABLE.has(name)) {
        drawables.push(child)
      } else if (RESOURCES.has(name)) {
        resources.push(child)
      }
      // title, desc, metadata: dropped
    })
  }
  visit(root)
  return { drawables, resources }
}

/**
 * Pastes SVG text from outside the editor, as one undo step, and selects the
 * pasted objects. The text goes through the import filter of an opened file:
 * scripts, event handlers, external references and unsafe CSS are removed.
 * The identifiers already used in the drawing are renewed, so nothing in the
 * drawing is replaced; the others are kept.
 * @function module:svgcanvas.SvgCanvas#pasteSvgString
 * @param {string} text
 * @param {'in_place'|'point'|void} type - As for pasteElements
 * @param {Integer|void} x - Expected if type is "point"
 * @param {Integer|void} y - Expected if type is "point"
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {Element[]|null} The pasted objects; null when the text is not SVG
 */
export const pasteSvgString = (text, type, x, y) => {
  const doc = parseSvgText(text)
  if (!doc) return null
  inlineStyleSheets(doc.documentElement)
  // The import filter of an opened file (phase 0), and absolute path commands
  svgCanvas.prepareSvg(doc)
  const domDocument = svgCanvas.getDOMDocument()
  const root = domDocument.importNode(doc.documentElement, true)
  svgCanvas.uniquifyElems(root)
  const scale = getRootScale(root)
  let { drawables, resources } = sortContent(root)
  if (!drawables.length) return []
  // Every object drawn in the editor has an identifier, which connectors and
  // the panel rely on: so do pasted objects.
  drawables.forEach((drawable) => {
    [drawable, ...drawable.querySelectorAll('*')].forEach((element) => {
      if (DRAWABLE.has(element.localName) && !element.id) element.id = svgCanvas.getNextId()
    })
  })

  if (scale) {
    // A group keeps the strokes in proportion; it can be ungrouped.
    const group = domDocument.createElementNS(NS.SVG, 'g')
    group.id = svgCanvas.getNextId()
    group.setAttribute('transform', `scale(${scale.x}${scale.x === scale.y ? '' : ` ${scale.y}`})`)
    group.append(...drawables)
    drawables = [group]
  }

  const batchCmd = new BatchCommand('Paste elements')
  const defs = svgCanvas.findDefs()
  resources.forEach((resource) => {
    defs.append(resource)
    batchCmd.addSubCommand(new InsertElementCommand(resource))
  })
  const parent = svgCanvas.getCurrentGroup() || svgCanvas.getCurrentDrawing().getCurrentLayer()
  const pasted = []
  drawables.forEach((drawable) => {
    parent.append(drawable)
    let element = drawable
    if (element.localName === 'svg') {
      // A nested <svg> is wrapped in a group, as when a file is opened.
      svgCanvas.groupSvgElem(element)
      element = element.parentNode
    }
    batchCmd.addSubCommand(new InsertElementCommand(element))
    svgCanvas.restoreRefElements(element)
    pasted.push(element)
  })
  svgCanvas.setUseData(parent)
  finishPaste(pasted, batchCmd, type, x, y)
  return pasted
}
