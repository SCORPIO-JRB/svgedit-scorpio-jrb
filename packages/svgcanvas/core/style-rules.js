/**
 * Where the value of a property of an object comes from, and how to change
 * it there (lot S2 of the simplification audit, docs/audit-simplification.md).
 *
 * A rule of a `<style>` sheet wins over the presentation attributes of the
 * objects it matches. On an object styled by a class (`.fond { fill: #160F23 }`)
 * the panels showed the attribute, not what is drawn, and the attribute the
 * editor wrote changed nothing on screen. This module finds what gives a
 * value — the `style` attribute of the object, a rule, or neither (then the
 * attribute or the parent does) — following the cascade: `!important`
 * first, then the `style` attribute, then the most specific rule, the last
 * one written among equals. It rewrites a value in the text of its rule,
 * leaving the rest of the sheet as written.
 *
 * The sheets of an imported file are confined to its `<symbol>`
 * (css-scope.js): they are read in that form, and their selectors are shown
 * as the file wrote them.
 * @module style-rules
 * @license MIT
 */

import { splitTopLevel, skipInert, findStop, blockEnd, unscopeSelector } from './css-scope.js'
import { styleDeclarations } from './utilities.js'

/**
 * The properties that the panels show and change, and that a rule or the
 * `style` attribute can give: their change goes where the value comes from.
 * The others (geometry, text decoration and anchor, markers) are written as
 * attributes, as before.
 * @type {Set<string>}
 */
export const STYLED_PROPERTIES = new Set([
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linejoin', 'stroke-linecap', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing'
])

/** Shorthands that also give a property: `font: 500 34px X` gives the size. */
const SHORTHANDS = new Map([
  ['font-family', ['font']], ['font-size', ['font']], ['font-weight', ['font']], ['font-style', ['font']]
])

/** Properties whose value is a length: a number alone needs a unit in CSS. */
const LENGTHS = new Set(['font-size', 'letter-spacing', 'word-spacing', 'stroke-width'])
/** Of those, the ones CSS does not take without a unit. */
const NEEDS_UNIT = new Set(['font-size', 'letter-spacing', 'word-spacing'])
const COLORS = new Set(['fill', 'stroke'])

const COMMENT = /\/\*(?:[^*]|\*(?!\/))*(?:\*\/|$)/g
const SPACE = /\s+|\/\*(?:[^*]|\*(?!\/))*(?:\*\/|$)/y
const TRAILING = /(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)+$/
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i
/** At-rules whose rules apply when their condition holds. */
const GROUPS = new Set(['media', 'supports', 'layer'])

/**
 * The declarations of a block, as written. `valueStart` and `valueLength`
 * bound the value, without `!important`.
 * @param {string} text
 * @param {Integer} from - Just after the `{`
 * @param {Integer} to - The `}`
 * @returns {Array<{name: string, value: string, important: boolean, valueStart: Integer, valueLength: Integer}>}
 */
const declarationsOf = (text, from, to) => {
  const declarations = []
  let start = from
  const push = (end) => {
    let colon = -1
    for (let j = start; j < end; j++) {
      const next = skipInert(text, j)
      if (next !== j) {
        j = next - 1
      } else if (text[j] === '\\') {
        j++
      } else if (text[j] === ':') {
        colon = j
        break
      }
    }
    if (colon === -1) return
    const name = text.slice(start, colon).replace(COMMENT, '').trim().toLowerCase()
    if (!/^-?[a-z][\w-]*$/.test(name)) return
    let valueStart = colon + 1
    while (valueStart < end && /\s/.test(text[valueStart])) valueStart++
    const raw = text.slice(valueStart, end).replace(TRAILING, '')
    const important = /!\s*important$/i.exec(raw)
    const value = important ? raw.slice(0, important.index).trimEnd() : raw
    if (value) declarations.push({ name, value, important: Boolean(important), valueStart, valueLength: value.length })
  }
  let depth = 0
  let i = from
  while (i < to) {
    const next = skipInert(text, i)
    if (next !== i) {
      i = next
      continue
    }
    const char = text[i]
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === '(' || char === '[') {
      depth++
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1)
    } else if (!depth && char === ';') {
      push(i)
      start = i + 1
    } else if (!depth && char === '{') {
      // A nested rule: not a declaration of this one
      i = blockEnd(text, i)
      start = i
      continue
    }
    i++
  }
  push(Math.min(to, text.length))
  return declarations
}

/**
 * The style rules of a style sheet, in their order, those of `@media`,
 * `@supports` and `@layer` included with their conditions. `open` and
 * `close` are the places of the braces of each rule in the text.
 * @function module:style-rules.parseStyleSheet
 * @param {string} text
 * @returns {Array<{prelude: string, open: Integer, close: Integer, conditions: Array<{name: string, condition: string}>, declarations: object[]}>}
 */
export const parseStyleSheet = (text) => {
  text = String(text ?? '')
  const rules = []
  const walk = (from, to, conditions) => {
    let i = from
    while (i < to) {
      SPACE.lastIndex = i
      const space = SPACE.exec(text)
      if (space) {
        i += space[0].length
        continue
      }
      const stop = findStop(text, i)
      if (stop >= to) break
      if (text[stop] !== '{') {
        // A statement (`@import …;`) or a stray `}`
        i = stop + 1
        continue
      }
      const end = blockEnd(text, stop)
      const close = text[end - 1] === '}' ? end - 1 : end
      const prelude = text.slice(i, stop).replace(COMMENT, ' ').trim()
      if (prelude.startsWith('@')) {
        const name = (/^@([\w-]+)/.exec(prelude)?.[1] ?? '').toLowerCase()
        if (GROUPS.has(name)) {
          walk(stop + 1, close, [...conditions, { name, condition: prelude.slice(name.length + 1).trim() }])
        }
      } else if (prelude) {
        rules.push({ prelude, open: stop, close, conditions, declarations: declarationsOf(text, stop + 1, close) })
      }
      i = end
    }
  }
  walk(0, text.length, [])
  return rules
}

/**
 * Whether the browser takes a declaration (it drops one it cannot read).
 * @param {string} name
 * @param {string} value
 * @returns {boolean}
 */
const isValid = (name, value) => {
  if (typeof globalThis.CSS?.supports !== 'function') return true
  try {
    return globalThis.CSS.supports(name, value)
  } catch {
    return true
  }
}

const mediaHolds = (media) => {
  if (!media) return true
  if (typeof globalThis.matchMedia === 'function') return globalThis.matchMedia(media).matches
  return !/\bprint\b/i.test(media) || /\bscreen\b/i.test(media)
}

const conditionHolds = ({ name, condition }) => {
  if (name === 'media') return mediaHolds(condition)
  if (name === 'supports' && typeof globalThis.CSS?.supports === 'function') {
    try {
      return globalThis.CSS.supports(condition)
    } catch {
      return false
    }
  }
  return true
}

/**
 * The parsed rules of each `<style>`. A sheet is read again once its text
 * changed: an observer of it tells, at once through `takeRecords()`.
 * @type {WeakMap<Element, {rules: object[]|null, dirty: boolean, observer: MutationObserver|null}>}
 */
const sheets = new WeakMap()

const rulesOfSheet = (style) => {
  let sheet = sheets.get(style)
  if (!sheet) {
    sheet = { rules: null, dirty: false, observer: null }
    if (typeof MutationObserver === 'function') {
      sheet.observer = new MutationObserver(() => { sheet.dirty = true })
      sheet.observer.observe(style, { characterData: true, childList: true, subtree: true })
    }
    sheets.set(style, sheet)
  }
  const changed = sheet.dirty || !sheet.observer || sheet.observer.takeRecords().length > 0
  if (!sheet.rules || changed) {
    sheet.rules = parseStyleSheet(style.textContent).map((rule) => ({ ...rule, style }))
    sheet.dirty = false
    sheet.version = (sheet.version ?? 0) + 1
  }
  return sheet
}

/**
 * The rules of each drawing, while its sheets stay the same.
 * @type {WeakMap<Element, {styles: HTMLCollection, list: Array<[Element, number]>, rules: object[]}>}
 */
const drawings = new WeakMap()

/**
 * The style rules that apply in a drawing, in their order: those of every
 * `<style>` of it whose condition (`media`, `@media`, `@supports`) holds.
 * A sheet is read again only when its text changed: a rule keeps its
 * identity until then.
 * @function module:style-rules.readStyleRules
 * @param {Element} root - The content of the drawing
 * @returns {object[]} Each rule has its `style` element
 */
export const readStyleRules = (root) => {
  if (!root?.getElementsByTagName) return []
  let drawing = drawings.get(root)
  if (!drawing) {
    drawing = { styles: root.getElementsByTagName('style'), list: [], rules: [] }
    drawings.set(root, drawing)
  }
  const styles = [...drawing.styles]
  const current = styles.map((style) => [style, rulesOfSheet(style).version])
  if (current.length === drawing.list.length && current.every(([style, version], i) =>
    drawing.list[i][0] === style && drawing.list[i][1] === version)) return drawing.rules
  const rules = []
  for (const style of styles) {
    const type = style.getAttribute('type')
    if ((type && !/^\s*text\/css\s*$/i.test(type)) || !mediaHolds(style.getAttribute('media'))) continue
    rules.push(...rulesOfSheet(style).rules.filter((rule) => rule.conditions.every(conditionHolds)))
  }
  drawing.list = current
  drawing.rules = rules
  return rules
}

/** The rules that set each property, by list of rules. */
const byProperty = new WeakMap()

/**
 * The rules of a list that set a property, or a shorthand of it.
 * @param {object[]} rules
 * @param {string} prop
 * @returns {object[]}
 */
const rulesSetting = (rules, prop) => {
  let map = byProperty.get(rules)
  if (!map) {
    map = new Map()
    byProperty.set(rules, map)
  }
  if (!map.has(prop)) {
    const names = [prop, ...(SHORTHANDS.get(prop) ?? [])]
    map.set(prop, rules.filter((rule) => rule.declarations.some(({ name }) => names.includes(name))))
  }
  return map.get(prop)
}

/**
 * The closing index of the bracket that opens at `i`.
 * @param {string} text
 * @param {Integer} i
 * @returns {Integer} Just after it
 */
const closing = (text, i) => {
  let depth = 0
  for (; i < text.length; i++) {
    const next = skipInert(text, i)
    if (next !== i) {
      i = next - 1
      continue
    }
    const char = text[i]
    if (char === '\\') i++
    else if (char === '(' || char === '[') depth++
    else if ((char === ')' || char === ']') && --depth === 0) return i + 1
  }
  return text.length
}

const IDENT = /(?:\\.|[\w-]|[\u0080-\uffff])+/y
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter'])

/**
 * Compares two specificities.
 * @function module:style-rules.compareSpecificity
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export const compareSpecificity = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2])

/**
 * The specificity of a selector: identifiers, then classes, attributes and
 * pseudo-classes, then element names and pseudo-elements. `:is()`, `:not()`
 * and `:has()` count their most specific argument, `:where()` nothing.
 * @function module:style-rules.specificity
 * @param {string} selector - One selector, not a list
 * @returns {number[]}
 */
export const specificity = (selector) => {
  const text = String(selector)
  const result = [0, 0, 0]
  const add = ([a, b, c]) => {
    result[0] += a
    result[1] += b
    result[2] += c
  }
  const ident = (i) => {
    IDENT.lastIndex = i
    const match = IDENT.exec(text)
    return match ? match[0] : ''
  }
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (char === '#') {
      i += 1 + ident(i + 1).length
      add([1, 0, 0])
    } else if (char === '.') {
      i += 1 + ident(i + 1).length
      add([0, 1, 0])
    } else if (char === '[') {
      i = closing(text, i)
      add([0, 1, 0])
    } else if (char === ':') {
      const element = text[i + 1] === ':'
      i += element ? 2 : 1
      const name = ident(i).toLowerCase()
      i += name.length
      let inner = null
      if (text[i] === '(') {
        const end = closing(text, i)
        inner = text.slice(i + 1, end - 1)
        i = end
      }
      if (element || LEGACY_PSEUDO_ELEMENTS.has(name)) {
        add([0, 0, 1])
      } else if (name === 'where') {
        // Nothing
      } else if (['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'].includes(name) && inner !== null) {
        add(splitTopLevel(inner, ',').map(specificity).sort(compareSpecificity).pop() ?? [0, 0, 0])
      } else {
        add([0, 1, 0])
        const of = inner && /^nth-(?:last-)?child$/.test(name) ? /\sof\s([\s\S]+)$/i.exec(inner) : null
        if (of) add(splitTopLevel(of[1], ',').map(specificity).sort(compareSpecificity).pop() ?? [0, 0, 0])
      }
    } else if (char === '\\' || /[a-zA-Z_\u0080-￿]/.test(char)) {
      const name = ident(i)
      i += Math.max(1, name.length)
      // `svg|rect`: the first name is a namespace
      if (!(text[i] === '|' && text[i + 1] !== '=')) add([0, 0, 1])
    } else if (char === '"' || char === "'") {
      i = skipInert(text, i)
    } else {
      i++
    }
  }
  return result
}

const selectorsOf = (rule) => {
  rule.selectors ??= splitTopLevel(rule.prelude, ',').map((text) => ({ text, specificity: specificity(text) }))
  return rule.selectors
}

/**
 * The most specific selector of a rule that matches an element.
 * @param {object} rule
 * @param {Element} elem
 * @returns {{text: string, specificity: number[]}|null} Null when none does,
 *   or the rule cannot be read (the browser drops it)
 */
const matchingSelector = (rule, elem) => {
  try {
    if (!elem.matches(rule.prelude)) return null
  } catch {
    return null
  }
  let best = null
  for (const selector of selectorsOf(rule)) {
    let matched = false
    try {
      matched = elem.matches(selector.text)
    } catch {
      // A selector of a forgiving list
    }
    if (matched && (!best || compareSpecificity(selector.specificity, best.specificity) > 0)) best = selector
  }
  return best
}

/**
 * The declaration that gives `prop` among some: an important one first,
 * else the last; those the browser drops are left out.
 * @param {Array<{name: string, value: string, important: boolean}>} declarations
 * @param {string} prop
 * @returns {object|null}
 */
const winningDeclaration = (declarations, prop) => {
  const names = [prop, ...(SHORTHANDS.get(prop) ?? [])]
  let found = null
  for (const declaration of declarations) {
    if (!names.includes(declaration.name)) continue
    declaration.valid ??= isValid(declaration.name, declaration.value)
    if (!declaration.valid) continue
    if (!found || declaration.important || !found.important) found = declaration
  }
  return found
}

/**
 * The declaration of `prop` in the `style` attribute of an element.
 * @param {Element} elem
 * @param {string} prop
 * @returns {{name: string, value: string, important: boolean}|null}
 */
const inlineDeclaration = (elem, prop) => {
  const style = elem.getAttribute?.('style')
  if (!style) return null
  const declarations = styleDeclarations(style).map(({ name, text }) => {
    const raw = text.slice(text.indexOf(':') + 1).trim()
    const important = /!\s*important$/i.exec(raw)
    return { name, value: important ? raw.slice(0, important.index).trim() : raw, important: Boolean(important) }
  })
  return winningDeclaration(declarations, prop)
}

const layered = (rule) => rule.conditions.some(({ name }) => name === 'layer')
/** Normal declarations of a layer lose to the others; important ones win. */
const rank = ({ rule, declaration }) => declaration.important ? (layered(rule) ? 3 : 2) : (layered(rule) ? 0 : 1)

/**
 * The selector of a rule as the file wrote it: a sheet confined to an
 * imported `<symbol>` is shown without the identifier of the symbol.
 * @param {Element} style
 * @param {string} selector
 * @returns {string}
 */
const shownSelector = (style, selector) => {
  const symbol = style.closest?.('symbol[id]')
  return symbol ? unscopeSelector(selector, { id: symbol.id, tag: 'symbol' }) : selector
}

/**
 * The content of the drawing an element is in.
 * @param {Element} elem
 * @returns {Element|null}
 */
const drawingOf = (elem) => elem?.closest?.('#svgcontent') ?? elem?.ownerSVGElement ?? null

/**
 * What gives the value of a property to an element, in the order of the
 * cascade: an important declaration of its `style` attribute, an important
 * rule, its `style` attribute, the most specific rule that matches it and
 * sets the property (the last written among equals). A value that the
 * element only inherits is not given to it: its own attribute wins over it.
 * @function module:style-rules.findStyleSource
 * @param {Element} elem
 * @param {string} prop - A property, in lower case
 * @param {object[]} [rules] - From readStyleRules; those of its drawing by default
 * @returns {{kind: 'style', value: string, shorthand: boolean, important: boolean}|{kind: 'rule', rule: object, style: Element, selector: string, value: string, shorthand: boolean, important: boolean}|null}
 *   Null when neither gives it: its attribute, or its parent, does
 */
export const findStyleSource = (elem, prop, rules = readStyleRules(drawingOf(elem))) => {
  if (!elem || elem.nodeType !== 1) return null
  const inline = inlineDeclaration(elem, prop)
  const style = (declaration) => ({ kind: 'style', value: declaration.value, shorthand: declaration.name !== prop, important: declaration.important })
  if (inline?.important) return style(inline)
  let best = null
  for (const rule of rulesSetting(rules, prop)) {
    const declaration = winningDeclaration(rule.declarations, prop)
    if (!declaration) continue
    const selector = matchingSelector(rule, elem)
    if (!selector) continue
    const candidate = { rule, declaration, selector }
    if (!best || ((rank(candidate) - rank(best)) || compareSpecificity(selector.specificity, best.selector.specificity)) >= 0) {
      best = candidate
    }
  }
  if (best && (best.declaration.important || !inline)) {
    const { rule, declaration, selector } = best
    return {
      kind: 'rule',
      rule,
      style: rule.style,
      selector: shownSelector(rule.style, selector.text),
      value: declaration.value,
      shorthand: declaration.name !== prop,
      important: declaration.important
    }
  }
  return inline ? style(inline) : null
}

/**
 * The elements of a drawing whose value of `prop` the rule gives: those a
 * change of the rule changes.
 * @function module:style-rules.elementsStyledBy
 * @param {object} rule
 * @param {string} prop
 * @param {Element} root - The content of the drawing
 * @param {object[]} [rules] - From readStyleRules
 * @returns {Element[]}
 */
export const elementsStyledBy = (rule, prop, root, rules = readStyleRules(root)) => {
  let candidates = []
  try {
    candidates = [...root.querySelectorAll(rule.prelude)]
  } catch {
    return []
  }
  return candidates.filter((elem) => findStyleSource(elem, prop, rules)?.rule === rule)
}

/**
 * A value as CSS writes it: a length without unit gets `px` where CSS needs
 * one (`font-size: 48` would be dropped).
 * @function module:style-rules.cssValueOf
 * @param {string} prop
 * @param {string|number} value
 * @returns {string}
 */
export const cssValueOf = (prop, value) => {
  const text = String(value ?? '').trim()
  return NEEDS_UNIT.has(prop) && NUMBER.test(text) ? `${text}px` : text
}

/**
 * Whether two values of a property are the same, as CSS reads them.
 * @param {string} prop
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export const sameCssValue = (prop, a, b) => {
  const normal = (value) => cssValueOf(prop, value).replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').toLowerCase()
  return normal(a) === normal(b)
}

/**
 * The text of a style sheet with values of its rules replaced, the rest as
 * written. A value given by a shorthand (`font`) is set by a declaration
 * added at the end of the rule, which wins over it.
 * @function module:style-rules.rewriteStyleSheet
 * @param {string} text - The text the rules were read from
 * @param {Array<{rule: object, prop: string, value: string}>} edits
 * @returns {string}
 */
export const rewriteStyleSheet = (text, edits) => {
  const changes = edits.map(({ rule, prop, value }) => {
    const css = cssValueOf(prop, value)
    const declaration = winningDeclaration(rule.declarations, prop)
    if (declaration && declaration.name === prop) {
      return { start: declaration.valueStart, end: declaration.valueStart + declaration.valueLength, text: css }
    }
    const body = text.slice(rule.open + 1, rule.close).replace(/\s+$/, '')
    const at = rule.open + 1 + body.length
    const written = `${prop}: ${css}${declaration?.important ? ' !important' : ''}`
    if (!body.trim()) return { start: rule.open + 1, end: rule.close, text: ` ${written} ` }
    return { start: at, end: at, text: body.endsWith(';') ? ` ${written};` : `; ${written}` }
  })
  changes.sort((a, b) => b.start - a.start)
  for (const { start, end, text: change } of changes) {
    text = text.slice(0, start) + change + text.slice(end)
  }
  return text
}

/**
 * An opaque rgb() colour in hexadecimal. A colour with transparency stays as
 * written: in hexadecimal it would be opaque, and the panel, "Copy
 * properties" and the eyedropper would lose it (an imported floor plan fills
 * its rooms with rgba(255, 255, 255, .1)).
 * @param {string} color
 * @returns {string}
 */
const toHex = (color) => {
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(color)
  if (!match) return color
  if (match[4] !== undefined && Number.parseFloat(match[4]) / (match[4].endsWith('%') ? 100 : 1) < 1) return color
  return '#' + match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

/**
 * The value an element gets for a property from a rule or its `style`
 * attribute, written as its attribute would be: a length in pixels as a
 * number, a value with `var()` or a keyword as the browser computes it.
 * @function module:style-rules.getStyledValue
 * @param {Element} elem
 * @param {string} prop
 * @param {object[]} [rules] - From readStyleRules
 * @returns {{value: string, kind: 'style'|'rule', selector?: string, rule?: object}|null}
 *   Null when neither gives it
 */
export const getStyledValue = (elem, prop, rules) => {
  const source = findStyleSource(elem, prop, rules)
  if (!source) return null
  let value = source.value
  const plain = !source.shorthand && !/\bvar\(|\benv\(|^(?:inherit|initial|unset|revert|revert-layer|currentcolor)$/i.test(value)
  if (!plain || (LENGTHS.has(prop) && !NUMBER.test(value) && !/^[-+]?[\d.]+px$/i.test(value))) {
    const computed = computedValue(elem, prop)
    if (computed) value = computed
  }
  return { ...source, value: asAttribute(prop, value) }
}

const computedValue = (elem, prop) => elem.ownerDocument?.defaultView?.getComputedStyle?.(elem)?.getPropertyValue(prop)?.trim() ?? ''

/**
 * A value of CSS written as its attribute would be: a length in pixels as a
 * number, a colour in hexadecimal.
 * @param {string} prop
 * @param {string} value
 * @returns {string}
 */
const asAttribute = (prop, value) => {
  if (LENGTHS.has(prop) && /^[-+]?[\d.]+px$/i.test(value)) return String(Number.parseFloat(value))
  if (prop === 'stroke-dasharray' && /^[-+]?[\d.]+px(?:[\s,]+[-+]?[\d.]+px)*$/i.test(value)) {
    return value.split(/[\s,]+/).map((length) => String(Number.parseFloat(length))).join(' ')
  }
  if (COLORS.has(prop)) return toHex(value.replace(/^url\(\s*(["']?)(#[^"')]+)\1\s*\)/i, 'url($2)'))
  return value
}

/**
 * The value an element shows for a property, whatever gives it (a rule, its
 * `style` attribute, its attribute, a parent, or nothing: the initial
 * value), written as its attribute would be. "Copy properties" and the
 * eyedropper take it for a property their source does not set, to give it
 * where the target gets the property from a rule (lot S4).
 * @function module:style-rules.getShownValue
 * @param {Element} elem
 * @param {string} prop
 * @returns {string|null} Null outside a document that computes styles
 */
export const getShownValue = (elem, prop) => {
  const computed = computedValue(elem, prop)
  return computed ? asAttribute(prop, computed) : null
}
