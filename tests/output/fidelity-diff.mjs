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
const KEPT_PREFIXES = new Set(['xlink', 'xml', 'se', 'oi'])
const isNumber = (value) => value !== '' && value !== null && !Number.isNaN(Number(value))

/** The kinds, in the order of the report, with their French label. */
export const KINDS = {
  'smil-removed': { label: 'Animation SMIL retirée', severity: 'perte' },
  'data-lost': { label: 'Attribut data-* perdu', severity: 'perte' },
  'data-rounded': { label: 'Attribut data-* numérique réécrit', severity: 'perte' },
  'id-lost': { label: 'Identifiant renommé ou supprimé', severity: 'perte' },
  'class-lost': { label: 'Classe perdue', severity: 'perte' },
  'style-removed': { label: 'Attribut style converti ou retiré', severity: 'perte' },
  'default-removed': { label: 'Valeur « par défaut » retirée', severity: 'perte' },
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
  'path-rewritten': { label: 'Tracé réécrit (commandes relatives)', severity: 'note' },
  'href-rewritten': { label: 'xlink:href réécrit en href', severity: 'note' },
  'id-added': { label: 'Identifiant ajouté par l’éditeur', severity: 'note' },
  'attribute-added': { label: 'Attribut ajouté par l’éditeur', severity: 'note' }
}

/**
 * Runs in the page: reads an SVG string into plain data.
 * @param {string} svg
 * @returns {{root: object, elements: object[]}|{error: string}}
 */
export function collectDocument (svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (doc.querySelector('parsererror')) { return { error: 'parse error' } }
  const SVG_NS = 'http://www.w3.org/2000/svg'
  const attrs = (el) => [...el.attributes]
    .filter((a) => !a.name.startsWith('xmlns'))
    .map((a) => [a.name, a.value])
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
        inLayer
      })
      const isLayer = child.localName === 'g' && child.parentNode === doc.documentElement && child.getAttribute('class') === 'layer'
      walk(child, [...path, isLayer ? 'g.layer' : tag])
    }
  }
  walk(doc.documentElement, ['svg'])
  return { root: { attrs: attrs(doc.documentElement) }, elements }
}

const finding = (kind, where, detail) => ({ kind, where, detail })

const classifyAttribute = (tag, name, before, after) => {
  if (name === 'gradientUnits') { return 'gradient-units' }
  if (after === undefined) {
    if (name === 'id') { return tag === 'svg' ? 'nested-svg' : 'id-lost' }
    if (name === 'class') { return 'class-lost' }
    if (name === 'style') { return 'style-removed' }
    if (name.startsWith('data-')) { return 'data-lost' }
    if (name === 'xlink:href') { return null }
    if (name.includes(':') && !KEPT_PREFIXES.has(name.split(':')[0])) { return 'foreign-namespace' }
    if (DEFAULTS[name] === before) { return 'default-removed' }
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
      const kind = classifyAttribute(before.tag, name, value, now)
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
