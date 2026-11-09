/**
 * Templates of new documents (lot V7; plan v2, section 2.11, G4): a document
 * ready for a kind of drawing, opened from the document menu ("New from a
 * template") or the command palette.
 *
 * - Blank: the page of the preferences, one layer.
 * - Technical diagram: an A3 landscape page, its frame, the grid shown and
 *   snapping at 10: the symbols fall on it, their ports too, and so do the
 *   ends of the networks.
 * - Synoptic 1 920 × 1 080: the page and an output frame at the resolution
 *   of the supervision screen, the background of the synoptics in a locked
 *   layer, a layer for the networks, one for the equipments, one for the
 *   values; snapping at 10.
 *
 * A host gives its own with the `templates` option (same shape). The names
 * of the templates and of their layers are keys of the translations, or
 * texts written as is.
 * @module templates
 */
/* globals seConfirm */
import { escapeHtml } from './panels/TopBar.js'

/**
 * @typedef {object} Template
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {number} [width] Of the page; the preferences when absent
 * @property {number} [height]
 * @property {Array<{name: string, locked?: boolean, content?: string}>} layers
 *   Bottom first; `content` is markup put in the layer
 * @property {string} [current] The layer to draw in
 * @property {Array<{name: string, x: number, y: number, width: number, height: number}>} [frames]
 * @property {{show?: boolean, snap?: boolean, step?: number}} [grid]
 */

/** @type {Template[]} */
export const DEFAULT_TEMPLATES = [
  {
    id: 'blank',
    name: 'templates.blank',
    description: 'templates.blank_desc',
    layers: [{ name: 'templates.layer_1' }]
  },
  {
    id: 'technical',
    name: 'templates.technical',
    description: 'templates.technical_desc',
    width: 1587,
    height: 1123,
    layers: [{ name: 'templates.layer_networks' }, { name: 'templates.layer_equipment' }, { name: 'templates.layer_notes' }],
    current: 'templates.layer_equipment',
    frames: [{ name: 'templates.frame_a3', x: 0, y: 0, width: 1587, height: 1123 }],
    grid: { show: true, snap: true, step: 10 }
  },
  {
    id: 'synoptic',
    name: 'templates.synoptic',
    description: 'templates.synoptic_desc',
    width: 1920,
    height: 1080,
    layers: [
      // The background of the synoptics of the corpus (Nuit 70)
      { name: 'templates.layer_background', locked: true, content: '<rect x="0" y="0" width="1920" height="1080" fill="#160F23"/>' },
      { name: 'templates.layer_networks' },
      { name: 'templates.layer_equipment' },
      { name: 'templates.layer_values' }
    ],
    current: 'templates.layer_equipment',
    frames: [{ name: 'templates.frame_screen', x: 0, y: 0, width: 1920, height: 1080 }],
    grid: { snap: true, step: 10 }
  }
]

const NS_SVG = 'http://www.w3.org/2000/svg'
const NS_SE = 'http://svg-edit.googlecode.com'

export class Templates {
  /**
   * @param {import('./Editor.js').default} editor
   */
  constructor (editor) {
    this.editor = editor
    const given = editor.configObj.curConfig.templates
    this.templates = Array.isArray(given) && given.length ? given : DEFAULT_TEMPLATES
    editor.commands.register({ id: 'new_from_template', label: 'templates.new', run: () => this.open() })
    this.addMenuItem()
  }

  /**
   * @param {string} key
   * @returns {string}
   */
  label (key) {
    return this.editor.i18next.t(key, { defaultValue: key })
  }

  /**
   * The entry of the document menu, after "New document" once the
   * extension that adds it has.
   * @returns {void}
   */
  addMenuItem () {
    const menu = document.getElementById('main_button')
    if (!menu || document.getElementById('tool_template')) return
    // Built from markup, as the other entries: the element reads its
    // attributes when it is made.
    const template = document.createElement('template')
    template.innerHTML = '<se-menu-item id="tool_template" label="templates.new" src="new.svg"></se-menu-item>'
    const item = template.content.firstElementChild
    item.addEventListener('click', () => this.open())
    menu.prepend(item)
    const follow = () => {
      const clear = document.getElementById('tool_clear')
      if (clear && clear.nextElementSibling !== item) clear.after(item)
      return Boolean(clear)
    }
    if (!follow()) {
      const observer = new MutationObserver(() => { if (follow()) observer.disconnect() })
      observer.observe(menu, { childList: true })
    }
  }

  /**
   * The SVG of a new document from a template.
   * @param {Template} template
   * @returns {string}
   */
  build (template) {
    const [dw, dh] = this.editor.configObj.curConfig.dimensions ?? [640, 480]
    const width = template.width ?? dw
    const height = template.height ?? dh
    const doc = document.implementation.createDocument(NS_SVG, 'svg', null)
    const root = doc.documentElement
    root.setAttribute('width', String(width))
    root.setAttribute('height', String(height))
    root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:se', NS_SE)
    for (const layer of template.layers ?? [{ name: 'templates.layer_1' }]) {
      const g = doc.createElementNS(NS_SVG, 'g')
      g.setAttribute('class', 'layer')
      const title = doc.createElementNS(NS_SVG, 'title')
      title.textContent = this.label(layer.name)
      g.append(title)
      if (layer.locked) g.setAttributeNS(NS_SE, 'se:locked', 'true')
      if (layer.content) {
        const parsed = new DOMParser().parseFromString(`<svg xmlns="${NS_SVG}">${layer.content}</svg>`, 'image/svg+xml')
        for (const node of [...parsed.documentElement.childNodes]) g.append(doc.importNode(node, true))
      }
      root.append(g)
    }
    if (template.frames?.length) {
      const metadata = doc.createElementNS(NS_SVG, 'metadata')
      for (const frame of template.frames) {
        const el = doc.createElementNS(NS_SE, 'se:frame')
        el.setAttribute('name', this.label(frame.name))
        for (const name of ['x', 'y', 'width', 'height']) el.setAttribute(name, String(frame[name]))
        metadata.append(el)
      }
      root.prepend(metadata)
    }
    return new XMLSerializer().serializeToString(doc)
  }

  /**
   * Opens a new document from a template, after asking when the current one
   * has changes. The history starts again, as for a new document.
   * @param {string} id
   * @returns {Promise<boolean>} Whether it was opened
   */
  async apply (id) {
    const { editor } = this
    const template = this.templates.find((candidate) => candidate.id === id)
    if (!template) return false
    if (editor.showSaveWarning) {
      const ok = await seConfirm(editor.i18next.t('notification.QwantToClear'))
      if (ok === 'Cancel') return false
    }
    const { svgCanvas } = editor
    editor.leftPanel?.clickSelect?.()
    if (!svgCanvas.setSvgString(this.build(template))) return false
    const grid = template.grid ?? {}
    editor.setConfig({
      gridSnapping: Boolean(grid.snap),
      ...(grid.step ? { snappingStep: grid.step } : {})
    })
    editor.grid?.setVisible(Boolean(grid.show))
    if (template.current) svgCanvas.setCurrentLayer(this.label(template.current))
    svgCanvas.undoMgr.resetUndoStack()
    editor.updateCanvas(true)
    editor.zoomChanged?.(window, 'canvas')
    editor.layersPanel.populateLayers()
    editor.topPanel.updateContextPanel()
    editor.topPanel.updateTitle('untitled.svg')
    editor.showSaveWarning = false
    editor.layout?.documentChanged?.()
    editor.layout?.layersChanged?.()
    editor.frames?.update()
    return true
  }

  /**
   * The window of the templates: one card per template.
   * @returns {void}
   */
  open () {
    const { editor } = this
    const t = (key) => escapeHtml(this.label(key))
    let dialog = editor.$container.querySelector('#se-templates')
    if (!dialog) {
      dialog = document.createElement('dialog')
      dialog.id = 'se-templates'
      dialog.className = 'se-templates'
      dialog.setAttribute('aria-labelledby', 'se-templates-title')
      dialog.addEventListener('click', (e) => {
        const card = e.target.closest('[data-template]')
        if (card) {
          dialog.close()
          this.apply(card.dataset.template)
        } else if (e.target.closest('[data-close]') || e.target === dialog) {
          dialog.close()
        }
      })
      editor.$container.append(dialog)
    }
    const [dw, dh] = editor.configObj.curConfig.dimensions ?? [640, 480]
    dialog.innerHTML = `
      <h2 id="se-templates-title">${t('templates.new')}</h2>
      <div class="se-templates-grid">${this.templates.map((template) => `
        <button type="button" class="se-template-card" data-template="${escapeHtml(template.id)}">
          <span class="se-template-page" style="aspect-ratio: ${template.width ?? dw} / ${template.height ?? dh}"></span>
          <span class="se-template-name">${t(template.name)}</span>
          <span class="se-template-size">${escapeHtml(editor.i18next.t('templates.size', { width: template.width ?? dw, height: template.height ?? dh }))}</span>
          ${template.description ? `<span class="se-template-desc">${t(template.description)}</span>` : ''}
        </button>`).join('')}
      </div>
      <div class="se-templates-actions"><button type="button" class="se-text-button" data-close>${t('common.cancel')}</button></div>`
    dialog.showModal()
    dialog.querySelector('.se-template-card')?.focus()
  }
}
