/**
 * Symbol libraries in the editor (lot V7; plan v2, section 2.11): the GTB
 * symbols of the editor, or those the host gives (`symbolLibraries`), their
 * search, their insertion, and what the inspector says of an instance.
 *
 * The canvas does the writing (core/symbols.js, core/ports.js); this module
 * names the symbols in the language of the interface and keeps the
 * definitions, so that a document holding an older version of a symbol is
 * offered the update.
 * @module symbols
 */
import { DEFAULT_SYMBOL_LIBRARIES } from './gtb-symbols.js'
import { escapeHtml } from './panels/TopBar.js'

/**
 * @typedef {object} SymbolLibraryData
 * @property {string} id
 * @property {string} name Translation key or text
 * @property {Array<{id: string, name: string}>} [categories]
 * @property {Array<import('@svgedit/svgcanvas/core/symbols.js').SymbolDefinition & {category?: string, keywords?: string}>} symbols
 */

/**
 * The drawing of a symbol, for an image of the interface: what can run
 * (scripts, foreign content, event handlers, javascript: links) is left out.
 * The canvas filters what goes into the document (sanitize).
 * @param {string} markup
 * @returns {string}
 */
export const safeMarkup = (markup) => {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml')
  if (doc.querySelector('parsererror')) return ''
  for (const el of [...doc.documentElement.querySelectorAll('script, foreignObject, iframe, object, embed')]) el.remove()
  for (const el of doc.documentElement.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || (/href$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name)
    }
  }
  return [...doc.documentElement.childNodes].map((node) => new XMLSerializer().serializeToString(node)).join('')
}

/** Lower case, without accents: "Vanne 3 voies" finds "vanne", "Échangeur" finds "echangeur". */
export const fold = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export class SymbolLibrary {
  /**
   * @param {import('./Editor.js').default} editor
   */
  constructor (editor) {
    this.editor = editor
    const given = editor.configObj.curConfig.symbolLibraries
    /** @type {SymbolLibraryData[]} */
    this.libraries = Array.isArray(given) && given.length ? given : DEFAULT_SYMBOL_LIBRARIES
    this.byKey = new Map()
    for (const library of this.libraries) {
      for (const def of library.symbols ?? []) this.byKey.set(def.id, { library, def })
    }
  }

  /**
   * @param {string} key Translation key or text
   * @returns {string}
   */
  label (key) {
    return this.editor.i18next.t(key, { defaultValue: key })
  }

  /**
   * @returns {Array<{library: SymbolLibraryData, def: object}>} Every symbol, in
   *   the order of the libraries
   */
  all () {
    return [...this.byKey.values()]
  }

  /**
   * @param {string} key
   * @returns {object|null} The definition of a symbol
   */
  definition (key) {
    return this.byKey.get(key)?.def ?? null
  }

  /**
   * The definition with its name in the language of the interface, as the
   * canvas writes it in the `<title>` of the symbol.
   * @param {object} def
   * @returns {object}
   */
  resolved (def) {
    return { ...def, name: this.label(def.name) }
  }

  /**
   * The symbols whose name, category or keywords hold every word of the
   * query, accents and case aside.
   * @param {string} query
   * @returns {Array<{library: SymbolLibraryData, def: object}>}
   */
  search (query) {
    const words = fold(query).split(/\s+/).filter(Boolean)
    if (!words.length) return this.all()
    return this.all().filter(({ library, def }) => {
      const category = library.categories?.find((cat) => cat.id === def.category)
      const text = fold([this.label(def.name), def.keywords, category ? this.label(category.name) : '', def.id].join(' '))
      return words.every((word) => text.includes(word))
    })
  }

  /**
   * Puts an instance of a symbol in the drawing, centred on a point: one undo
   * step, the instance selected.
   * @param {string} key
   * @param {{x: number, y: number}} center In the drawing
   * @returns {Element|null}
   */
  insert (key, center) {
    const def = this.definition(key)
    if (!def) return null
    return this.editor.svgCanvas.insertSymbol(this.resolved(def), center)
  }

  /**
   * @param {Element} use
   * @returns {Element|null} The `<symbol>` of an instance
   */
  symbolOf (use) {
    return this.editor.svgCanvas.referencedSymbol?.(use) ?? null
  }

  /**
   * The name of the symbol an instance shows: the name of the library in the
   * language of the interface, else the title of the symbol.
   * @param {Element} use
   * @returns {string}
   */
  nameOfInstance (use) {
    const symbol = this.symbolOf(use)
    if (!symbol) return ''
    const def = this.definition(this.editor.svgCanvas.symbolKey(symbol))
    if (def) return this.label(def.name)
    const title = [...symbol.children].find((child) => child.localName === 'title')
    return title?.textContent.trim() ?? ''
  }

  /**
   * @param {Element} symbol
   * @returns {object|null} The definition of the library when it is newer
   *   than the symbol of the document
   */
  newerVersion (symbol) {
    const { svgCanvas } = this.editor
    const def = this.definition(svgCanvas.symbolKey(symbol))
    if (!def) return null
    return (def.version ?? 1) > svgCanvas.symbolVersion(symbol) ? def : null
  }

  /**
   * Brings a symbol of the document to the version of the library: every
   * instance follows. One undo step.
   * @param {Element} symbol
   * @returns {boolean}
   */
  update (symbol) {
    const def = this.newerVersion(symbol)
    if (!def) return false
    return Boolean(this.editor.svgCanvas.updateSymbol(this.resolved(def)))
  }

  /**
   * A small drawing of a symbol, as a new instance shows it, for the drawer.
   * The markup is that of the library, which the host gives.
   * @param {object} def
   * @returns {string}
   */
  previewMarkup (def) {
    const attrs = Object.entries(def.attributes ?? {})
      .filter(([name]) => name !== 'class')
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeHtml(def.viewBox)}" aria-hidden="true" focusable="false"><g${attrs}>${safeMarkup(def.body)}</g></svg>`
  }
}

/**
 * The Symbol section of the inspector: the symbol of the selected instance,
 * its version, the update the library offers, and its ports.
 */
export class SymbolPanel {
  /**
   * @param {import('./Editor.js').default} editor
   * @param {HTMLElement} body Where the section goes
   */
  constructor (editor, body) {
    this.editor = editor
    this.body = body
    const t = (key) => escapeHtml(editor.i18next.t(key))
    body.innerHTML = `<div class="se-symbol-panel" hidden>
      <div class="se-symbol-info">
        <span class="se-symbol-name"></span>
        <span class="se-symbol-version"></span>
      </div>
      <p class="se-symbol-ports"></p>
      <div class="se-symbol-actions">
        <button type="button" class="se-text-button" id="se-symbol-update" hidden></button>
        <button type="button" class="se-text-button" id="se-symbol-detach">${t('symbols.detach')}</button>
      </div></div>`
    this.$panel = body.querySelector('.se-symbol-panel')
    this.$update = body.querySelector('#se-symbol-update')
    this.$update.addEventListener('click', () => {
      const symbol = this.current && editor.symbols.symbolOf(this.current)
      if (symbol && editor.symbols.update(symbol)) {
        editor.toast(editor.i18next.t('symbols.updated'), { type: 'success' })
      }
      this.refresh()
    })
    body.querySelector('#se-symbol-detach').addEventListener('click', () => {
      // The ungroup of a <use> breaks its link, asking first when it is bound (V6).
      editor.commands.execute('ungroup')
    })
  }

  /**
   * @returns {void}
   */
  refresh () {
    const { editor } = this
    const selected = editor.svgCanvas.getSelectedElements().filter(Boolean)
    const use = selected.length === 1 && selected[0].localName === 'use' ? selected[0] : null
    const symbol = use && editor.symbols.symbolOf(use)
    const key = symbol && editor.svgCanvas.symbolKey(symbol)
    // Only the symbols of a library: another <use> keeps the classic panel.
    this.current = key ? use : null
    this.$panel.hidden = !this.current
    if (!this.current) return
    const t = (k, o) => editor.i18next.t(k, o)
    this.body.querySelector('.se-symbol-name').textContent = editor.symbols.nameOfInstance(use)
    this.body.querySelector('.se-symbol-version').textContent = t('symbols.version', { version: editor.svgCanvas.symbolVersion(symbol) })
    const newer = editor.symbols.newerVersion(symbol)
    this.$update.hidden = !newer
    if (newer) {
      const count = editor.svgCanvas.instancesOf(symbol).length
      this.$update.textContent = t('symbols.update', { version: newer.version, count })
    }
    const ports = editor.svgCanvas.portsOf(use).filter((port) => !port.implicit)
    this.body.querySelector('.se-symbol-ports').textContent = ports.length
      ? t('symbols.ports', { count: ports.length, list: ports.map((port) => `${port.id} (${t(`symbols.kind_${port.kind}`)})`).join(', ') })
      : ''
  }
}
