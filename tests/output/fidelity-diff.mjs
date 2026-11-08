/**
 * Compares an SVG file with what the editor writes after opening it, and
 * sorts every difference by kind. Pure functions on the data collected by
 * `collectDocument`, so they run in Node and in the browser.
 *
 * The kinds follow section 7 of the plan "Interface et expérience (v2)":
 * a loss (something of the file is gone), a change (a value is rewritten)
 * or a note (the editor adds or rewrites without changing the meaning).
 */

const SMIL = new Set(['animate', 'animateTransform', 'animateMotion', 'set', 'mpath'])
const DEFINITIONS = new Set(['defs', 'linearGradient', 'radialGradient', 'pattern', 'filter', 'marker', 'symbol', 'clipPath', 'mask'])
const DEFAULTS = {
  'fill-opacity': '1',
  'stop-opacity': '1',
  opacity: '1',
  stroke: 'none',
  'stroke-dasharray': 'none',
  'stroke-linejoin': 'miter',
  'stroke-linecap': 'butt',
  'stroke-opacity': '1',
  'stroke-width': '1',
  rx: '0',
  ry: '0'
}
const NOT_INHERITED = new Set(['opacity', 'stop-opacity'])
const KEPT_PREFIXES = new Set(['xlink', 'xml', 'se', 'oi'])
const isNumber = (value) => value !== '' && value !== null && !Number.isNaN(Number(value))
const isInitial = (name, value) => {
  const text = name === 'stroke-width' ? value.trim().replace(/px$/, '') : value.trim()
  return text === DEFAULTS[name] || (isNumber(text) && isNumber(DEFAULTS[name]) && Number(text) === Number(DEFAULTS[name]))
}

/** The kinds, in the order of the report, with their French label. */
export const KINDS = {
  'smil-removed': { label: 'Animation SMIL retirée', severity: 'perte' },
  'data-lost': { label: 'Attribut data-* perdu', severity: 'perte' },
  'data-rounded': { label: 'Attribut data-* numérique réécrit', severity: 'perte' },
  'id-lost': { label: 'Identifiant renommé ou supprimé', severity: 'perte' },
  'class-lost': { label: 'Classe perdue', severity: 'perte' },
  'style-removed': { label: 'Attribut style converti ou retiré', severity: 'perte' },
  'default-removed': { label: 'Valeur « par défaut » retirée, rendu changé', severity: 'perte' },
  'foreign-namespace': { label: 'Attribut d’un espace de noms étranger retiré', severity: 'perte' },
  'metadata-flattened': { label: 'Métadonnées aplaties', severity: 'perte' },
  'definition-removed': { label: 'Définition retirée', severity: 'perte' },
  'nested-svg': { label: '<svg> imbriqué transformé', severity: 'perte' },
  'element-removed': { label: 'Élément retiré', severity: 'perte' },
  'attribute-removed': { label: 'Attribut retiré (hors liste blanche ou autre)', severity: 'perte' },
  'gradient-units': { label: 'Unités de dégradé converties', severity: 'changement' },
  'number-rounded': { label: 'Nombre arrondi', severity: 'changement' },
  'root-changed': { label: 'Racine du document modifiée', severity: 'changement' },
  'layer-added': { label: 'Calque ajouté (objets hors calque déplacés)', severity: 'changement' },
  'value-changed': { label: 'Valeur modifiée', severity: 'changement' },
  'style-sheet-rewritten': { label: 'Feuille <style> réécrite', severity: 'changement' },
  'default-omitted': { label: 'Valeur « par défaut » omise sans effet', severity: 'note' },
  'path-rewritten': { label: 'Tracé réécrit (commandes relatives)', severity: 'note' },
  'href-rewritten': { label: 'xlink:href réécrit en href', severity: 'note' },
  'id-added': { label: 'Identifiant ajouté par l’éditeur', severity: 'note' },
  'attribute-added': { label: 'Attribut ajouté par l’éditeur', severity: 'note' }
}

/**
 * Runs in the page: reads an SVG string into plain data. The page receives
 * the source of this function alone, so its helpers live inside it.
 *
 * Besides its attributes, each element records what it would inherit for
 * the inherited properties that have a default value (`inherited`: the value
 * set by the nearest ancestor, by its style attribute, a rule of the
 * drawing's <style> or its attribute), and whether a <use> reuses it or an
 * ancestor (`reused`). They tell a default value left out without effect
 * from one whose removal changes the drawing.
 * @param {string} svg
 * @returns {{root: object, elements: object[]}|{error: string}}
 */
export function collectDocument (svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (doc.querySelector('parsererror')) { return { error: 'parse error' } }
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const INHERITED = ['fill-opacity', 'stroke', 'stroke-dasharray', 'stroke-linejoin', 'stroke-linecap', 'stroke-opacity', 'stroke-width']
  const attrs = (el) => [...el.attributes]
    .filter((a) => !a.name.startsWith('xmlns'))
    .map((a) => [a.name, a.value])
  const readDeclarations = (text) => Object.fromEntries(text.split(';')
    .map((declaration) => declaration.split(':'))
    .filter((parts) => parts.length > 1)
    .map(([name, ...value]) => [name.trim().toLowerCase(), value.join(':').replace(/!important/i, '').trim()]))
  // Rules of the drawing's style sheets, as [selector, declarations], in
  // order; at-rules (@media, @keyframes…) are left out.
  const rules = []
  for (const style of doc.getElementsByTagNameNS(SVG_NS, 'style')) {
    const css = style.textContent.replace(/\/\*[\s\S]*?\*\//g, '')
    let depth = 0
    let start = 0
    let prelude = ''
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '{') {
        if (depth === 0) { prelude = css.slice(start, i).trim(); start = i + 1 }
        depth++
      } else if (css[i] === '}' && depth > 0) {
        depth--
        if (depth === 0) {
          if (!prelude.startsWith('@')) { rules.push([prelude, readDeclarations(css.slice(start, i))]) }
          start = i + 1
        }
      }
    }
  }
  const matches = (el, selector) => { try { return el.matches(selector) } catch (e) { return false } }
  // The value an element sets itself: style attribute, then the last rule
  // that matches (without the full priority of CSS), then the attribute.
  const declared = (el, name) => {
    const inline = readDeclarations(el.getAttribute('style') || '')[name]
    if (inline) { return inline }
    let fromRule = null
    for (const [selector, declarations] of rules) {
      if (declarations[name] && matches(el, selector)) { fromRule = declarations[name] }
    }
    return fromRule || el.getAttribute(name)
  }
  const inheritedCache = new Map()
  const inherited = (el) => {
    if (!el || el.nodeType !== 1) { return {} }
    if (inheritedCache.has(el)) { return inheritedCache.get(el) }
    const fromParent = inherited(el.parentNode)
    const own = {}
    for (const name of INHERITED) {
      const value = declared(el, name)
      own[name] = value && value.trim() !== 'inherit' ? value.trim() : fromParent[name] ?? null
    }
    inheritedCache.set(el, own)
    return own
  }
  const usedIds = new Set([...doc.getElementsByTagNameNS(SVG_NS, 'use')]
    .map((use) => use.getAttribute('href') || use.getAttribute('xlink:href') || '')
    .filter((href) => href.startsWith('#'))
    .map((href) => href.slice(1)))
  const isReused = (el) => {
    for (let node = el; node?.nodeType === 1; node = node.parentNode) {
      if (node.id && usedIds.has(node.id)) { return true }
    }
    return false
  }
  const elements = []
  const walk = (el, path) => {
    for (const child of el.children) {
      const tag = child.namespaceURI === SVG_NS ? child.localName : `${child.prefix || '?'}:${child.localName}`
      const inLayer = path.includes('g.layer')
      elements.push({
        tag,
        id: child.getAttribute('id'),
        attrs: attrs(child),
        path: path.join(' > '),
        text: ['style', 'title', 'desc', 'metadata'].includes(child.localName) ? child.textContent.trim() : null,
        inLayer,
        inherited: Object.fromEntries(Object.entries(inherited(child.parentNode)).filter(([, value]) => value !== null)),
        reused: isReused(child)
      })
      const isLayer = child.localName === 'g' && child.parentNode === doc.documentElement && child.getAttribute('class') === 'layer'
      walk(child, [...path, isLayer ? 'g.layer' : tag])
    }
  }
  walk(doc.documentElement, ['svg'])
  return { root: { attrs: attrs(doc.documentElement) }, elements }
}

const finding = (kind, where, detail) => ({ kind, where, detail })

// A default value left out changes nothing when the property is not
// inherited, or when the element inherits the initial value and no <use>
// reuses it; rx or ry at 0 when the other one is absent or 0 too, except on
// an ellipse. Without the data of collectDocument, it counts as a loss.
const defaultKind = (tag, name, element) => {
  if (NOT_INHERITED.has(name)) { return 'default-omitted' }
  if (name === 'rx' || name === 'ry') {
    const other = Object.fromEntries(element.attrs)[name === 'rx' ? 'ry' : 'rx']
    return tag !== 'ellipse' && (other === undefined || other === 'auto' || Number.parseFloat(other) === 0)
      ? 'default-omitted'
      : 'default-removed'
  }
  if (!element.inherited || element.reused) { return 'default-removed' }
  const value = element.inherited[name]
  return value === undefined || isInitial(name, value) ? 'default-omitted' : 'default-removed'
}

const classifyAttribute = (tag, name, before, after, element) => {
  if (name === 'gradientUnits') { return 'gradient-units' }
  if (after === undefined) {
    if (name === 'id') { return tag === 'svg' ? 'nested-svg' : 'id-lost' }
    if (name === 'class') { return 'class-lost' }
    if (name === 'style') { return 'style-removed' }
    if (name.startsWith('data-')) { return 'data-lost' }
    if (name === 'xlink:href') { return null }
    if (name.includes(':') && !KEPT_PREFIXES.has(name.split(':')[0])) { return 'foreign-namespace' }
    if (DEFAULTS[name] === before) { return defaultKind(tag, name, element) }
    return 'attribute-removed'
  }
  if (name === 'id') { return tag === 'svg' ? 'nested-svg' : 'id-lost' }
  if (name.startsWith('data-')) { return 'data-rounded' }
  if (name === 'style') { return 'style-removed' }
  if (name === 'd' || name === 'points') { return 'path-rewritten' }
  if (isNumber(before) && isNumber(after)) { return 'number-rounded' }
  return 'value-changed'
}

const classifyRemovedElement = (element) => {
  if (SMIL.has(element.tag)) { return 'smil-removed' }
  if (element.tag === 'svg') { return 'nested-svg' }
  if (DEFINITIONS.has(element.tag) || element.path.split(' > ').some((tag) => DEFINITIONS.has(tag))) { return 'definition-removed' }
  if (element.path.includes('metadata')) { return 'metadata-flattened' }
  return 'element-removed'
}

/**
 * Compares the data of a file with the data of its export.
 * @param {{root: object, elements: object[]}} input
 * @param {{root: object, elements: object[]}} output
 * @returns {Array<{kind: string, where: string, detail: string}>}
 */
export function diffDocuments (input, output) {
  const findings = []
  const rootIn = Object.fromEntries(input.root.attrs)
  const rootOut = Object.fromEntries(output.root.attrs)
  for (const [name, value] of Object.entries(rootIn)) {
    if (rootOut[name] !== value) {
      findings.push(finding('root-changed', 'svg', `${name}="${value}" → ${rootOut[name] === undefined ? 'absent' : `"${rootOut[name]}"`}`))
    }
  }

  // Pair the elements: by id when the file has one (the first element that
  // holds it), else the k-th element of the same tag not paired by id.
  const outById = new Map()
  for (const el of output.elements) { if (el.id && !outById.has(el.id)) { outById.set(el.id, el) } }
  const used = new Set()
  const seenIds = new Set()
  const pairs = []
  for (const el of input.elements) {
    if (el.id && !seenIds.has(el.id) && outById.has(el.id)) {
      seenIds.add(el.id)
      const match = outById.get(el.id)
      used.add(match)
      pairs.push([el, match])
    } else {
      pairs.push([el, null])
    }
  }
  const pending = new Map()
  for (const el of output.elements) {
    if (used.has(el)) { continue }
    if (!pending.has(el.tag)) { pending.set(el.tag, []) }
    pending.get(el.tag).push(el)
  }
  for (const pair of pairs) {
    if (pair[1]) { continue }
    const queue = pending.get(pair[0].tag)
    if (queue?.length) {
      pair[1] = queue.shift()
      used.add(pair[1])
    }
  }

  for (const [before, after] of pairs) {
    const where = before.id ? `${before.tag}#${before.id}` : `${before.tag} (${before.path})`
    if (!after) {
      findings.push(finding(classifyRemovedElement(before), where, 'absent de l’export'))
      continue
    }
    const attrsAfter = Object.fromEntries(after.attrs)
    for (const [name, value] of before.attrs) {
      const now = name === 'xlink:href' ? (attrsAfter['xlink:href'] ?? attrsAfter.href) : attrsAfter[name]
      if (name === 'xlink:href' && attrsAfter['xlink:href'] === undefined && attrsAfter.href === value) {
        findings.push(finding('href-rewritten', where, `xlink:href="${value}"`))
        continue
      }
      if (now === value) { continue }
      const kind = classifyAttribute(before.tag, name, value, now, after)
      if (!kind) { continue }
      findings.push(finding(kind, where, `${name}="${value}" → ${now === undefined ? 'absent' : `"${now}"`}`))
    }
    for (const [name, value] of after.attrs) {
      if (before.attrs.some(([n]) => n === name)) { continue }
      if (name === 'href' && before.attrs.some(([n]) => n === 'xlink:href')) { continue }
      findings.push(finding(name === 'id' ? 'id-added' : 'attribute-added', where, `${name}="${value}"`))
    }
    if (before.tag === 'style' && before.text !== after.text) {
      findings.push(finding('style-sheet-rewritten', where, 'contenu modifié'))
    }
    if (before.tag === 'metadata' && before.text !== after.text) {
      findings.push(finding('metadata-flattened', where, 'contenu modifié'))
    }
  }

  const layers = (doc) => doc.elements.filter((el) => el.path === 'svg' && el.tag === 'g' && el.attrs.some(([n, v]) => n === 'class' && v === 'layer')).length
  const added = layers(output) - layers(input)
  if (added > 0) {
    findings.push(finding('layer-added', 'svg', `${added} calque(s) de plus`))
  }
  return findings
}

/**
 * Groups findings by kind, in the order of KINDS.
 * @param {Array<{file: string, kind: string, where: string, detail: string}>} findings
 */
export function summarize (findings) {
  return Object.entries(KINDS)
    .map(([kind, { label, severity }]) => {
      const list = findings.filter((f) => f.kind === kind)
      return { kind, label, severity, count: list.length, files: new Set(list.map((f) => f.file)).size, examples: list.slice(0, 3) }
    })
    .filter((row) => row.count > 0)
}
