/**
 * Symbols of a library in the document (lot V7; plan v2, section 2.11,
 * SymbolLibrary): each symbol is a `<symbol>` in the `<defs>`, each use of it
 * an instance `<use>`. Changing the symbol changes all its instances.
 *
 * The `<symbol>` keeps, in the editor namespace, what the library said of it:
 *
 *   <symbol id="gtb-pompe" viewBox="0 0 40 40" se:symbol="gtb-pompe"
 *     se:version="2" se:ports="in 0 20 left in; out 40 20 right out">
 *     <title>Pompe</title> …drawing…
 *   </symbol>
 *
 * The drawing of a symbol of the GTB library sets neither the fill nor the
 * stroke of its body: they come from the instance, which carries them as
 * attributes. The supervision changes the state of an equipment by changing
 * these attributes of the `<use>` it designates by its id (D4); the rules of a
 * stylesheet do not reach inside a `<use>`, the inherited properties do.
 *
 * A library is data the host gives: each definition has an id, a version, a
 * name, its viewBox and size, the markup of its drawing, its ports and the
 * attributes of a new instance (see SymbolDefinition).
 * @module symbols
 */
import { NS } from './namespaces.js'
import { BatchCommand, InsertElementCommand, RemoveElementCommand, ChangeElementCommand } from './history.js'
import { findDefs, setHref, snapToGrid } from './utilities.js'
import { formatPorts, referencedSymbol } from './ports.js'

let svgCanvas = null

/**
 * @typedef {object} SymbolDefinition
 * @property {string} id Stable key of the symbol in its library
 * @property {number} version Raised by the library when the drawing changes
 * @property {string} name Name shown, and written in the `<title>`
 * @property {string} viewBox
 * @property {number} width Size of a new instance
 * @property {number} height
 * @property {string} body Markup of the drawing (SVG, without root)
 * @property {import('./ports.js').PortSpec[]} [ports]
 * @property {Object<string, string>} [attributes] Of a new instance
 */

/**
 * @param {Element} elem
 * @returns {string|null} The key of a symbol of a library
 */
export const symbolKey = (elem) => elem?.getAttributeNS?.(NS.SE, 'symbol') || elem?.getAttribute?.('se:symbol') || null

/**
 * @param {Element} symbol
 * @returns {number} The version of a symbol in the document, 0 when unknown
 */
export const symbolVersion = (symbol) => {
  const v = Number(symbol?.getAttributeNS?.(NS.SE, 'version') ?? symbol?.getAttribute?.('se:version'))
  return Number.isFinite(v) ? v : 0
}

/**
 * The `<symbol>` of a library key in the document, if any.
 * @param {string} key
 * @returns {Element|null}
 */
export const findSymbol = (key) => {
  const content = svgCanvas.getSvgContent()
  return [...content.querySelectorAll('symbol')].find((symbol) => symbolKey(symbol) === key) ?? null
}

/**
 * @param {Element} symbol
 * @returns {Element[]} The instances of a symbol in the drawing
 */
export const instancesOf = (symbol) => {
  if (!symbol?.id) return []
  const content = svgCanvas.getSvgContent()
  return [...content.querySelectorAll('use')].filter((use) => referencedSymbol(use) === symbol)
}

/**
 * Parses the markup of a drawing into SVG nodes of the page.
 * @param {string} markup
 * @returns {Node[]}
 */
const parseBody = (markup) => {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${NS.SVG}" xmlns:se="${NS.SE}">${markup}</svg>`, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return []
  return [...doc.documentElement.childNodes].map((node) => document.importNode(node, true))
}

/**
 * Fills a `<symbol>` with what its definition says.
 * @param {Element} symbol
 * @param {SymbolDefinition} def
 * @returns {void}
 */
const fill = (symbol, def) => {
  symbol.setAttribute('viewBox', def.viewBox)
  symbol.setAttributeNS(NS.SE, 'se:symbol', def.id)
  symbol.setAttributeNS(NS.SE, 'se:version', String(def.version ?? 1))
  if (def.ports?.length) symbol.setAttributeNS(NS.SE, 'se:ports', formatPorts(def.ports))
  else symbol.removeAttributeNS(NS.SE, 'ports')
  const title = document.createElementNS(NS.SVG, 'title')
  title.textContent = def.name
  symbol.append(title, ...parseBody(def.body))
  // What the host gives goes through the filter of the imports.
  svgCanvas.sanitizeSvg?.(symbol)
}

/**
 * What an opening does to a drawing (svg-exec: prepareSvg, setSvgString),
 * done now, in the document: the saved file stays the same when it is opened
 * again. The paths in absolute commands, closed on their start; an id for
 * every visible element.
 * @param {Element} root
 * @returns {void}
 */
export const normalizeAsOpened = (root) => {
  for (const path of root.querySelectorAll('path')) {
    path.setAttribute('d', svgCanvas.pathActions.convertPath(path))
    svgCanvas.pathActions.fixEnd(path)
  }
  for (const el of root.querySelectorAll(svgCanvas.getVisElems())) {
    if (!el.id) el.id = svgCanvas.getNextId()
  }
}

/**
 * The id a new symbol takes: its key, unless something else holds it.
 * @param {string} key
 * @returns {string}
 */
const freeId = (key) => {
  const base = key.replace(/[^\w-]/g, '-')
  let id = base
  for (let i = 2; svgCanvas.getElement(id); i++) id = `${base}-${i}`
  return id
}

/**
 * The symbol of a definition in the document: the one already there (in
 * whatever version), else a new one in the `<defs>`.
 * @param {SymbolDefinition} def
 * @param {BatchCommand} batch Receives the insertion
 * @returns {Element}
 */
export const ensureSymbol = (def, batch) => {
  const existing = findSymbol(def.id)
  if (existing) return existing
  const symbol = document.createElementNS(NS.SVG, 'symbol')
  symbol.id = freeId(def.id)
  // In the document before it is filled: the filter skips a detached element
  findDefs().append(symbol)
  fill(symbol, def)
  normalizeAsOpened(symbol)
  batch.addSubCommand(new InsertElementCommand(symbol))
  return symbol
}

/**
 * Puts an instance of a symbol in the current layer, centred on a point of
 * the drawing (snapped to the grid when the grid snaps: the ports of the
 * library fall on it). One undo step; the instance is selected.
 * @param {SymbolDefinition} def
 * @param {{x: number, y: number}} center
 * @returns {Element|null} The `<use>`
 */
export const insertSymbol = (def, center) => {
  if (svgCanvas.lockedDrawingTarget?.()) {
    svgCanvas.call('locked', svgCanvas.lockedDrawingTarget())
    return null
  }
  const batch = new BatchCommand('Insert symbol')
  const symbol = ensureSymbol(def, batch)
  let x = center.x - def.width / 2
  let y = center.y - def.height / 2
  if (svgCanvas.getCurConfig().gridSnapping) {
    x = snapToGrid(x)
    y = snapToGrid(y)
  }
  const use = document.createElementNS(NS.SVG, 'use')
  use.id = svgCanvas.getNextId()
  setHref(use, `#${symbol.id}`)
  use.setAttribute('x', String(Math.round(x * 100) / 100))
  use.setAttribute('y', String(Math.round(y * 100) / 100))
  use.setAttribute('width', String(def.width))
  use.setAttribute('height', String(def.height))
  for (const [name, value] of Object.entries(def.attributes ?? {})) use.setAttribute(name, value)
  const parent = svgCanvas.getCurrentGroup?.() || svgCanvas.getCurrentDrawing().getCurrentLayer()
  parent.append(use)
  batch.addSubCommand(new InsertElementCommand(use))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [use])
  svgCanvas.selectOnly([use], true)
  return use
}

/**
 * Brings the symbol of a definition in the document to the version of the
 * library: its drawing, viewBox and ports are those of the definition, and
 * every instance follows. One undo step.
 * @param {SymbolDefinition} def
 * @returns {BatchCommand|null}
 */
export const updateSymbol = (def) => {
  const symbol = findSymbol(def.id)
  if (!symbol) return null
  const batch = new BatchCommand('Update symbol')
  const old = {
    viewBox: symbol.getAttribute('viewBox'),
    'se:version': symbol.getAttribute('se:version'),
    'se:ports': symbol.getAttribute('se:ports')
  }
  for (const child of [...symbol.childNodes]) {
    // The next element, which the undo puts back before it (white space
    // between the elements is not kept)
    const next = child.nodeType === 1 ? child.nextElementSibling : null
    child.remove()
    if (child.nodeType === 1) batch.addSubCommand(new RemoveElementCommand(child, next, symbol))
  }
  fill(symbol, def)
  normalizeAsOpened(symbol)
  batch.addSubCommand(new ChangeElementCommand(symbol, old))
  for (const child of symbol.children) batch.addSubCommand(new InsertElementCommand(child))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [symbol, ...instancesOf(symbol)])
  return batch
}

/**
 * @function module:symbols.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.symbolKey = symbolKey
  canvas.symbolVersion = symbolVersion
  canvas.findSymbol = findSymbol
  canvas.instancesOf = instancesOf
  canvas.insertSymbol = insertSymbol
  canvas.updateSymbol = updateSymbol
  canvas.normalizeAsOpened = normalizeAsOpened
}
