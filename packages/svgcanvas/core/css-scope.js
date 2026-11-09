/**
 * Confines the stylesheet of an imported SVG file to the element that holds
 * it in the drawing. In an SVG shown in a page, a stylesheet applies to the
 * whole document: the rules of an imported file (`rect{…}`, `.cls-1{…}`)
 * repainted the objects of the drawing.
 * @module css-scope
 * @license MIT
 */

/**
 * Splits a list at its top-level separators: `a, b:not(.c, .d)` gives two
 * items. Strings, brackets and parentheses are kept whole.
 * @function module:css-scope.splitTopLevel
 * @param {string} text
 * @param {string} separator - A single character
 * @returns {string[]}
 */
export const splitTopLevel = (text, separator) => {
  const parts = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '\\') {
      i++
    } else if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(' || char === '[') {
      depth++
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1)
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter(Boolean)
}

/**
 * The index just after a comment or a string that starts at `i`, or `i`
 * when none starts there.
 * @function module:css-scope.skipInert
 * @param {string} text
 * @param {Integer} i
 * @returns {Integer}
 */
export const skipInert = (text, i) => {
  if (text[i] === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2)
    return end === -1 ? text.length : end + 2
  }
  const quote = text[i]
  if (quote === '"' || quote === "'") {
    let j = i + 1
    while (j < text.length && text[j] !== quote) j += text[j] === '\\' ? 2 : 1
    return j + 1
  }
  return i
}

/**
 * The index of the first `{`, `;` or `}` at the top level from `i`.
 * @function module:css-scope.findStop
 * @param {string} text
 * @param {Integer} i
 * @returns {Integer} `text.length` when there is none
 */
export const findStop = (text, i) => {
  let depth = 0
  while (i < text.length) {
    const next = skipInert(text, i)
    if (next !== i) { i = next; continue }
    const char = text[i]
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (char === '{' || char === ';' || char === '}')) return i
    i++
  }
  return text.length
}

/**
 * The index just after the block that opens at `open`.
 * @function module:css-scope.blockEnd
 * @param {string} text
 * @param {Integer} open - Index of a `{`
 * @returns {Integer}
 */
export const blockEnd = (text, open) => {
  let depth = 0
  let i = open
  while (i < text.length) {
    const next = skipInert(text, i)
    if (next !== i) { i = next; continue }
    const char = text[i]
    if (char === '\\') {
      i += 2
      continue
    }
    if (char === '{') depth++
    else if (char === '}' && --depth === 0) return i + 1
    i++
  }
  return text.length
}

/**
 * The length of the first compound selector: `svg.a > text` gives 5.
 * @param {string} selector
 * @returns {Integer}
 */
const firstCompoundLength = (selector) => {
  let depth = 0
  for (let i = 0; i < selector.length; i++) {
    const next = skipInert(selector, i)
    if (next !== i) { i = next - 1; continue }
    const char = selector[i]
    if (char === '\\') i++
    else if (char === '(' || char === '[') depth++
    else if (char === ')' || char === ']') depth = Math.max(0, depth - 1)
    else if (depth === 0 && /[\s>+~]/.test(char)) return i
  }
  return selector.length
}

/** Group rules whose rules are confined in turn. */
const GROUP_RULES = new Set(['media', 'supports', 'container', 'layer', 'scope'])
/** At-rules that select nothing, kept as they are. */
const KEPT_RULES = new Set(['font-face', 'property', 'counter-style', 'font-feature-values', 'font-palette-values'])
const KEYFRAMES = /^@(-[a-z]+-)?keyframes$/i
/** Spaces or a comment, at a given index. */
const SPACE = /\s+|\/\*[\s\S]*?(?:\*\/|$)/y

/**
 * Writes an identifier as a CSS identifier.
 * @param {string} id
 * @returns {string}
 */
const cssIdent = (id) => id.replace(/[^\w-]/g, (char) => `\\${char}`)

/**
 * Confines one selector to the element `scope` (`#id`). A selector that
 * starts with the root of the file (`svg`, `:root`) now starts with that
 * element; any other one applies inside it, or to the element itself when
 * its first part has no element name. Every rule gains the same specificity
 * (one identifier), so the rules of the file keep their order of priority.
 * @param {string} selector
 * @param {{id: string, tag: string}} scope
 * @returns {string[]} The confined selectors; none when the selector can only
 *   match outside the drawing (`html`, `body`)
 */
const scopeSelector = (selector, { id, tag }) => {
  const scope = `#${cssIdent(id)}`
  const length = firstCompoundLength(selector)
  const compound = selector.slice(0, length)
  const rest = selector.slice(length)
  if (/^:root\b/i.test(compound)) return [`${tag}${scope}${compound.slice(5)}${rest}`]
  const type = /^(?:(?:[\w-]+|\*)?\|)?([a-zA-Z_][\w-]*|\*)/.exec(compound)
  const name = type?.[1]
  if (name === 'svg') return [`${tag}${scope}${compound.slice(type[0].length)}${rest}`]
  if (name === 'html' || name === 'body') return []
  const ids = [...compound.matchAll(/#((?:[\w-]|\\.)+)/g)].map(([, value]) => value)
  const own = ids.includes(cssIdent(id))
  const scoped = own ? [] : [`${scope} ${selector}`]
  if ((!name || name === '*') && ids.every((value) => value === cssIdent(id))) {
    // The element itself, which carries the attributes and classes of the root
    scoped.push(`${scope}${name ? compound.slice(type[0].length) : compound}${rest}`)
  }
  return scoped
}

/**
 * A selector confined by scopeSelector, as the file wrote it.
 * @function module:css-scope.unscopeSelector
 * @param {string} selector
 * @param {{id: string, tag: string}} scope
 * @returns {string}
 */
export const unscopeSelector = (selector, { id, tag }) => {
  const scope = `#${cssIdent(id)}`
  if (selector.startsWith(tag + scope)) return `svg${selector.slice(tag.length + scope.length)}`
  if (selector.startsWith(`${scope} `)) return selector.slice(scope.length + 1)
  if (selector.startsWith(scope)) return selector.slice(scope.length).trim() || '*'
  return selector
}

/**
 * Names of the animations (`@keyframes`) a stylesheet defines.
 * @function module:css-scope.keyframesNames
 * @param {string} css
 * @returns {string[]}
 */
export const keyframesNames = (css) => [...String(css).matchAll(/@(?:-[a-z]+-)?keyframes\s+([^\s{;]+)/gi)].map(([, name]) => name)

/**
 * Confines a stylesheet to one element of the drawing: its rules match only
 * that element and what it contains. The declarations are kept as written.
 * Animations (`@keyframes`) named as one already in the drawing are renamed,
 * with the declarations that use them. What cannot be confined is removed and
 * listed: rules on `html` or `body`, and at-rules that apply to the whole
 * document (`@namespace`, `@page`...).
 * @function module:css-scope.scopeStyleSheet
 * @param {string} css
 * @param {object} scope
 * @param {string} scope.id - Identifier of the element
 * @param {string} scope.tag - Its element name
 * @param {Set<string>} [scope.takenKeyframes] - Animation names already used
 *   in the drawing; the new names are added to it
 * @returns {{css: string, removed: string[]}}
 */
export const scopeStyleSheet = (css, { id, tag, takenKeyframes = new Set() }) => {
  const removed = []
  // Animation names of this stylesheet, and their name in the drawing
  const own = new Map()
  const renamed = new Map()
  const scopeRules = (text) => {
    let out = ''
    let i = 0
    while (i < text.length) {
      SPACE.lastIndex = i
      const space = SPACE.exec(text)
      if (space) {
        out += space[0]
        i += space[0].length
        continue
      }
      const stop = findStop(text, i)
      const prelude = text.slice(i, stop).trim()
      if (stop >= text.length || text[stop] !== '{') {
        // A statement (`@namespace x;`) or a stray `}`
        if (prelude && !/^@charset\b/i.test(prelude)) removed.push(prelude)
        i = stop + 1
        continue
      }
      const end = blockEnd(text, stop)
      const block = text.slice(stop, end)
      i = end
      if (prelude.startsWith('@')) {
        const atName = /^@[\w-]+/.exec(prelude)?.[0] || prelude
        const name = atName.slice(1).toLowerCase()
        if (GROUP_RULES.has(name)) {
          out += `${prelude} {${scopeRules(block.slice(1, -1))}}`
        } else if (KEYFRAMES.test(atName)) {
          const animation = prelude.slice(atName.length).trim()
          let newName = own.get(animation)
          if (!newName) {
            newName = animation
            if (takenKeyframes.has(animation)) {
              let n = 2
              while (takenKeyframes.has(`${animation}-${n}`)) n++
              newName = `${animation}-${n}`
              renamed.set(animation, newName)
            }
            own.set(animation, newName)
            takenKeyframes.add(newName)
          }
          out += `${atName} ${newName} ${block}`
        } else if (KEPT_RULES.has(name)) {
          out += `${prelude} ${block}`
        } else {
          removed.push(prelude)
        }
        continue
      }
      const selectors = splitTopLevel(prelude, ',').flatMap((selector) => {
        const scoped = scopeSelector(selector, { id, tag })
        if (!scoped.length) removed.push(selector)
        return scoped
      })
      if (selectors.length) out += `${selectors.join(', ')} ${block}`
    }
    return out
  }
  let result = scopeRules(String(css))
  if (renamed.size) {
    result = result.replace(/(\banimation(?:-name)?\s*:)([^;}]*)/gi, (match, property, value) =>
      property + value.replace(/[^\s,]+/g, (word) => renamed.get(word) || word))
  }
  return { css: result, removed }
}
