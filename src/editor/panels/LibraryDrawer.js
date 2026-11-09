/**
 * Library drawer of the canvas layout (lot V7; plan v2, section 3, zone
 * "Tiroir Bibliothèque", decision D5): shapes, symbols and images, with a
 * search, inserted by a click or dragged onto the canvas.
 *
 * - It opens from the Library button of the toolbar (or the command
 *   palette) and closes after an insertion, with Escape or its own button.
 * - Symbols: those of the symbol libraries (GTB by default, or the host's),
 *   by category. Shapes: the shape library of SVG-Edit (ext-shapes), read
 *   when first shown, whether the extension is loaded or not (lot S1).
 *   Images: those the document already holds, and a file of the computer.
 * - The search looks into the three at once, accents and case aside.
 * - A click, Enter or Space puts the item in the middle of the view; a drag
 *   puts it where it is dropped. Each insertion is one undo step and leaves
 *   the new object selected.
 * @module LibraryDrawer
 */
import { escapeHtml } from './TopBar.js'
import { insertByRank } from './Toolbar.js'
import { focusControl } from '../components/seFlyingButton.js'
import { fold } from '../symbols.js'

/** The type of the data a drag from the drawer carries. */
export const DRAG_TYPE = 'application/x-se-library'

/** Size of a shape put in the drawing, in units of the drawing. */
const SHAPE_SIZE = 80
/** Largest side of an image put in the drawing. */
const IMAGE_SIZE = 240

export class LibraryDrawer {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} stage Where the drawer floats
   */
  constructor (editor, stage) {
    this.editor = editor
    this.stage = stage
    this.tab = 'symbols'
    this.query = ''
    this.shapes = null
    this.shapesLoading = null
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const img = escapeHtml(editor.configObj.curConfig.imgPath)
    const template = document.createElement('template')
    template.innerHTML = `
      <aside id="se-library" class="se-library se-float" role="dialog" aria-labelledby="se-library-title" hidden>
        <div class="se-library-head">
          <h2 id="se-library-title">${t('library.title')}</h2>
          <button type="button" class="se-icon-button" id="se-library-close" aria-label="${t('library.close')}"
            ><se-icon src="${img}/xmark.svg"></se-icon></button>
        </div>
        <div class="se-tree-search se-library-search">
          <se-icon src="${img}/search.svg"></se-icon>
          <input type="search" id="se-library-search" autocomplete="off"
            aria-label="${t('library.search')}" placeholder="${t('library.search')}">
        </div>
        <div class="se-library-tabs" role="tablist" aria-label="${t('library.title')}">
          <button type="button" role="tab" id="se-library-tab-symbols" data-tab="symbols" aria-controls="se-library-body">${t('library.symbols')}</button>
          <button type="button" role="tab" id="se-library-tab-shapes" data-tab="shapes" aria-controls="se-library-body">${t('library.shapes')}</button>
          <button type="button" role="tab" id="se-library-tab-images" data-tab="images" aria-controls="se-library-body">${t('library.images')}</button>
        </div>
        <div id="se-library-body" class="se-library-body" role="tabpanel"></div>
        <p class="se-library-help">${t('library.help')}</p>
        <input type="file" id="se-library-file" accept="image/*" hidden>
      </aside>`
    stage.append(template.content)
    this.$root = stage.querySelector('#se-library')
    this.$body = this.$root.querySelector('#se-library-body')
    this.$search = this.$root.querySelector('#se-library-search')
    this.$file = this.$root.querySelector('#se-library-file')

    this.$root.querySelector('#se-library-close').addEventListener('click', () => this.close())
    this.$root.querySelector('.se-library-tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]')?.dataset.tab
      if (tab) this.selectTab(tab)
    })
    this.$root.querySelector('.se-library-tabs').addEventListener('keydown', (e) => this.tabKeydown(e))
    this.$search.addEventListener('input', () => {
      this.query = this.$search.value.trim()
      this.render()
    })
    this.$body.addEventListener('click', (e) => {
      if (e.target.closest('#se-library-pick')) {
        this.$file.click()
        return
      }
      const item = e.target.closest('.se-library-item')
      if (item) this.insertItem(item, this.editor.view?.center ?? { x: 0, y: 0 })
    })
    this.$body.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.se-library-item')
      if (!item) return
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: item.dataset.kind, key: item.dataset.key }))
      e.dataTransfer.setData('text/plain', item.querySelector('.se-library-label')?.textContent ?? '')
    })
    this.$file.addEventListener('change', () => this.pickFile())
    this.$root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.close()
      }
    })
    this.initDrop()
    editor.commands.register({ id: 'library', label: 'library.open', run: () => this.toggle() })
  }

  /**
   * The Library button, in the insert group of the toolbar.
   * @param {HTMLElement} bar
   * @returns {void}
   */
  addTool (bar) {
    const container = bar?.querySelector('[data-place="insert"]')
    if (!container || bar.querySelector('#tool_library')) return
    const template = document.createElement('template')
    template.innerHTML = '<se-button id="tool_library" data-group="insert" data-rank="40" title="library.open" src="drawer.svg"></se-button>'
    this.$button = template.content.firstElementChild
    this.$button.setAttribute('aria-haspopup', 'dialog')
    this.$button.setAttribute('aria-expanded', 'false')
    this.$button.addEventListener('click', () => this.toggle())
    insertByRank(container, this.$button)
  }

  /**
   * @returns {boolean}
   */
  get opened () {
    return !this.$root.hidden
  }

  /**
   * @returns {void}
   */
  toggle () {
    if (this.opened) this.close()
    else this.open()
  }

  /**
   * @returns {void}
   */
  open () {
    // Under the toolbar, at its left.
    const bar = this.editor.layout?.toolbar?.bar
    if (bar) {
      const stageBox = this.stage.getBoundingClientRect()
      const barBox = bar.getBoundingClientRect()
      this.$root.style.top = `${Math.round(barBox.bottom - stageBox.top + 8)}px`
      this.$root.style.left = `${Math.round(barBox.left - stageBox.left)}px`
    }
    this.$root.hidden = false
    this.$button?.setAttribute('aria-expanded', 'true')
    this.$button?.setAttribute('pressed', '')
    this.selectTab(this.tab, { focus: false })
    this.$search.focus()
  }

  /**
   * @param {object} [options]
   * @param {boolean} [options.restoreFocus=true]
   * @returns {void}
   */
  close ({ restoreFocus = true } = {}) {
    if (!this.opened) return
    this.$root.hidden = true
    this.$button?.setAttribute('aria-expanded', 'false')
    this.$button?.removeAttribute('pressed')
    if (restoreFocus) focusControl(this.$button)
  }

  /**
   * @param {"symbols"|"shapes"|"images"} tab
   * @param {object} [options]
   * @param {boolean} [options.focus=true]
   * @returns {void}
   */
  selectTab (tab, { focus = true } = {}) {
    this.tab = tab
    for (const button of this.$root.querySelectorAll('[role="tab"]')) {
      const on = button.dataset.tab === tab
      button.setAttribute('aria-selected', String(on))
      button.tabIndex = on ? 0 : -1
      if (on) this.$body.setAttribute('aria-labelledby', button.id)
      if (on && focus) button.focus()
    }
    this.render()
  }

  /**
   * Left and right go from one tab to the next.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  tabKeydown (e) {
    const tabs = ['symbols', 'shapes', 'images']
    const i = tabs.indexOf(this.tab)
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      this.selectTab(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length])
    }
  }

  /**
   * The shapes of ext-shapes, read once.
   * @returns {Promise<Array<{category: string, name: string, d: string}>>}
   */
  loadShapes () {
    if (this.shapes) return Promise.resolve(this.shapes)
    if (this.shapesLoading) return this.shapesLoading
    const base = `${this.editor.configObj.curConfig.extPath}/ext-shapes/shapelib`
    const names = this.loadShapeNames()
    this.shapesLoading = fetch(`${base}/index.json`)
      .then((response) => response.json())
      .then(({ lib }) => Promise.all(lib.map((category) => fetch(`${base}/${category}.json`)
        .then((response) => response.json())
        .then(({ data }) => Object.entries(data).map(([name, d]) => ({ category, name, d })))
        .catch(() => []))))
      .then(async (lists) => {
        await names
        this.shapes = lists.flat()
        return this.shapes
      })
      .catch(() => {
        this.shapes = []
        return this.shapes
      })
    return this.shapesLoading
  }

  /**
   * The names of the categories of shapes, from the translations of
   * ext-shapes, when the extension has not added them: the canvas layout no
   * longer loads it by default (lot S1). Without them, a category shows its
   * key ("basic").
   * @returns {Promise<void>}
   */
  async loadShapeNames () {
    const { i18next, configObj } = this.editor
    const lang = configObj.pref('lang')
    if (!i18next?.hasResourceBundle || i18next.hasResourceBundle(lang, 'shapes')) return
    const base = `${configObj.curConfig.extPath}/ext-shapes/locale`
    const load = async (code) => (await import(/* @vite-ignore */ `${base}/${code}.js`)).default
    let names = null
    for (const code of [/^[A-Za-z-]+$/.test(lang) ? lang : null, 'en'].filter(Boolean)) {
      try {
        names = await load(code)
        break
      } catch {
        // No translation in this language: English, as the extension does.
      }
    }
    if (names && !i18next.hasResourceBundle(lang, 'shapes')) i18next.addResourceBundle(lang, 'shapes', names)
  }

  /**
   * The images the document holds, each once.
   * @returns {string[]}
   */
  documentImages () {
    const content = this.editor.svgCanvas.getSvgContent()
    const hrefs = [...content.querySelectorAll('image')]
      .map((image) => image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'))
      .filter(Boolean)
    return [...new Set(hrefs)]
  }

  /**
   * Draws the items of the tab, or of the search.
   * @returns {void}
   */
  render () {
    if (!this.opened) return
    const { editor } = this
    const t = (key, options) => editor.i18next.t(key, options)
    const sections = []
    const searching = Boolean(this.query)
    const words = fold(this.query).split(/\s+/).filter(Boolean)
    const matches = (text) => words.every((word) => fold(text).includes(word))
    if (searching || this.tab === 'symbols') {
      const found = searching ? editor.symbols.search(this.query) : editor.symbols.all()
      const byCategory = new Map()
      for (const entry of found) {
        const category = entry.library.categories?.find((cat) => cat.id === entry.def.category)
        const title = searching ? t('library.symbols') : (category ? editor.symbols.label(category.name) : editor.symbols.label(entry.library.name))
        if (!byCategory.has(title)) byCategory.set(title, [])
        byCategory.get(title).push(this.symbolItem(entry.def))
      }
      for (const [title, items] of byCategory) sections.push(this.section(title, items))
    }
    if (searching || this.tab === 'shapes') {
      if (!this.shapes) {
        this.loadShapes().then(() => this.render())
        if (!searching) sections.push(`<p class="se-library-empty">${escapeHtml(t('library.loading'))}</p>`)
      } else {
        const byCategory = new Map()
        for (const shape of this.shapes) {
          const category = editor.i18next.t(`shapes:categories.${shape.category}`, { defaultValue: shape.category })
          if (searching && !matches(`${shape.name.replace(/_/g, ' ')} ${shape.category} ${category}`)) continue
          const title = searching ? t('library.shapes') : category
          if (!byCategory.has(title)) byCategory.set(title, [])
          byCategory.get(title).push(this.shapeItem(shape))
        }
        for (const [title, items] of byCategory) sections.push(this.section(title, items))
      }
    }
    if (searching || this.tab === 'images') {
      const images = this.documentImages().filter((href) => !searching || matches(href.startsWith('data:') ? '' : href))
      const items = images.map((href, i) => this.imageItem(href, i))
      if (!searching) {
        sections.push(`<div class="se-library-pick-row"><button type="button" class="se-text-button" id="se-library-pick">${escapeHtml(t('library.pick_file'))}</button></div>`)
        sections.push(items.length
          ? this.section(t('library.document_images'), items)
          : `<p class="se-library-empty">${escapeHtml(t('library.no_images'))}</p>`)
      } else if (items.length) {
        sections.push(this.section(t('library.images'), items))
      }
    }
    if (searching && !sections.length) {
      sections.push(`<p class="se-library-empty">${escapeHtml(t('library.no_match'))}</p>`)
    }
    this.$body.innerHTML = sections.join('')
    this.$root.querySelector('.se-library-tabs').hidden = searching
  }

  /**
   * @param {string} title
   * @param {string[]} items
   * @returns {string}
   */
  section (title, items) {
    return `<section class="se-library-section"><h3>${escapeHtml(title)}</h3><div class="se-library-grid">${items.join('')}</div></section>`
  }

  /**
   * @param {object} def
   * @returns {string}
   */
  symbolItem (def) {
    const label = escapeHtml(this.editor.symbols.label(def.name))
    return `<button type="button" class="se-library-item" draggable="true" data-kind="symbol" data-key="${escapeHtml(def.id)}"
      aria-label="${label}"><span class="se-library-preview se-library-symbol">${this.editor.symbols.previewMarkup(def)}</span>
      <span class="se-library-label">${label}</span></button>`
  }

  /**
   * @param {{category: string, name: string, d: string}} shape
   * @returns {string}
   */
  shapeItem (shape) {
    const label = escapeHtml(shape.name.replace(/_/g, ' '))
    return `<button type="button" class="se-library-item" draggable="true" data-kind="shape"
      data-key="${escapeHtml(`${shape.category}/${shape.name}`)}" aria-label="${label}"><span class="se-library-preview"
      ><svg viewBox="0 0 300 300" aria-hidden="true" focusable="false"><path d="${escapeHtml(shape.d)}"/></svg></span>
      <span class="se-library-label">${label}</span></button>`
  }

  /**
   * @param {string} href
   * @param {number} index
   * @returns {string}
   */
  imageItem (href, index) {
    const name = href.startsWith('data:') ? this.editor.i18next.t('library.embedded_image', { n: index + 1 }) : href.split('/').pop()
    const label = escapeHtml(name)
    return `<button type="button" class="se-library-item" draggable="true" data-kind="image" data-key="${escapeHtml(href)}"
      aria-label="${label}"><span class="se-library-preview"><img src="${escapeHtml(href)}" alt=""></span>
      <span class="se-library-label">${label}</span></button>`
  }

  /**
   * Puts an item in the drawing, centred on a point, then closes the drawer.
   * @param {HTMLElement|{dataset: {kind: string, key: string}}} item
   * @param {{x: number, y: number}} center In the drawing
   * @returns {Promise<Element|null>}
   */
  async insertItem (item, center) {
    const { kind, key } = item.dataset
    let elem = null
    if (kind === 'symbol') elem = this.editor.symbols.insert(key, center)
    else if (kind === 'shape') elem = await this.insertShape(key, center)
    else if (kind === 'image') elem = await this.insertImage(key, center)
    if (elem) {
      this.editor.leftPanel?.clickSelect?.()
      this.editor.svgCanvas.selectOnly([elem], true)
      this.close({ restoreFocus: false })
    }
    return elem
  }

  /**
   * @param {string} key "category/name"
   * @param {{x: number, y: number}} center
   * @returns {Promise<Element|null>}
   */
  async insertShape (key, center) {
    const shapes = await this.loadShapes()
    const shape = shapes.find((candidate) => `${candidate.category}/${candidate.name}` === key)
    if (!shape) return null
    const { svgCanvas } = this.editor
    if (svgCanvas.lockedDrawingTarget?.()) {
      svgCanvas.call('locked', svgCanvas.lockedDrawingTarget())
      return null
    }
    const path = svgCanvas.addSVGElementsFromJson({
      element: 'path',
      curStyles: true,
      // The opacity of the style, not the half one of a shape being drawn
      attr: { d: shape.d, id: svgCanvas.getNextId(), opacity: svgCanvas.getStyle?.().opacity ?? 1 }
    })
    // The shapes are drawn in a box of 300: brought to SHAPE_SIZE, centred.
    const k = SHAPE_SIZE / 300
    path.setAttribute('transform', `translate(${center.x - SHAPE_SIZE / 2},${center.y - SHAPE_SIZE / 2}) scale(${k})`)
    svgCanvas.recalculateDimensions(path)
    const { BatchCommand, InsertElementCommand } = svgCanvas.history
    const batch = new BatchCommand('Insert shape')
    batch.addSubCommand(new InsertElementCommand(path))
    svgCanvas.addCommandToHistory(batch)
    svgCanvas.call('changed', [path])
    return path
  }

  /**
   * @param {string} href
   * @param {{x: number, y: number}} center
   * @returns {Promise<Element|null>}
   */
  async insertImage (href, center) {
    const { svgCanvas } = this.editor
    if (svgCanvas.lockedDrawingTarget?.()) {
      svgCanvas.call('locked', svgCanvas.lockedDrawingTarget())
      return null
    }
    const size = await new Promise((resolve) => {
      const probe = new Image()
      probe.onload = () => resolve({ width: probe.naturalWidth || IMAGE_SIZE, height: probe.naturalHeight || IMAGE_SIZE })
      probe.onerror = () => resolve({ width: IMAGE_SIZE, height: IMAGE_SIZE })
      probe.src = href
    })
    const k = Math.min(1, IMAGE_SIZE / Math.max(size.width, size.height, 1))
    const width = Math.round(size.width * k)
    const height = Math.round(size.height * k)
    const image = svgCanvas.addSVGElementsFromJson({
      element: 'image',
      attr: {
        x: Math.round(center.x - width / 2),
        y: Math.round(center.y - height / 2),
        width,
        height,
        id: svgCanvas.getNextId(),
        style: 'pointer-events:inherit'
      }
    })
    svgCanvas.setHref(image, href)
    const { BatchCommand, InsertElementCommand } = svgCanvas.history
    const batch = new BatchCommand('Insert image')
    batch.addSubCommand(new InsertElementCommand(image))
    svgCanvas.addCommandToHistory(batch)
    svgCanvas.call('changed', [image])
    return image
  }

  /**
   * An image of the computer, put in the middle of the view.
   * @returns {void}
   */
  pickFile () {
    const file = this.$file.files?.[0]
    this.$file.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      this.insertItem({ dataset: { kind: 'image', key: String(reader.result) } }, this.editor.view?.center ?? { x: 0, y: 0 })
    }
    reader.readAsDataURL(file)
  }

  /**
   * The canvas takes what is dragged from the drawer, where it is dropped.
   * @returns {void}
   */
  initDrop () {
    const area = this.editor.workarea
    if (!area) return
    const carries = (e) => [...(e.dataTransfer?.types ?? [])].includes(DRAG_TYPE)
    area.addEventListener('dragover', (e) => {
      if (!carries(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    })
    area.addEventListener('drop', (e) => {
      if (!carries(e)) return
      e.preventDefault()
      let data = null
      try {
        data = JSON.parse(e.dataTransfer.getData(DRAG_TYPE))
      } catch (_err) {
        return
      }
      const point = this.editor.view?.screenToDoc(e.clientX, e.clientY) ?? { x: 0, y: 0 }
      this.insertItem({ dataset: data }, point)
    })
  }
}
