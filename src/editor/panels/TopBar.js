/**
 * Top bar of the canvas layout (lot V3; plan v2, section 4.1): one line of
 * 40 px, with no property of an object.
 *
 * - Left: home of the host application and its breadcrumb, when the host
 *   gives them (`homeUrl`, `breadcrumb`), then the name of the document ▾,
 *   which opens the document menu (#main_button: new, open, save, import,
 *   export, document properties, preferences).
 * - Middle: the save state.
 * - Right: undo and redo, Export ▾ and Save. Below 1 024 px, Export is only in
 *   the document menu.
 * @module TopBar
 */

export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]))

/**
 * A link given by the host page or the URL: only http(s), or a path of the
 * same site. A `javascript:` or `data:` link is refused.
 * @param {any} value
 * @param {string} [base]
 * @returns {string|null}
 */
export const safeHref = (value, base = globalThis.location?.href) => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, base)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

/**
 * The entries of the breadcrumb, from the `breadcrumb` option: an array of
 * labels or of {label, href}.
 * @param {any} value
 * @returns {{label: string, href: string|null}[]}
 */
export const breadcrumbOf = (value) => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? { label: item } : item))
    .filter((item) => item && typeof item.label === 'string' && item.label.trim())
    .slice(0, 6)
    .map((item) => ({ label: item.label.trim(), href: safeHref(item.href) }))
}

export class TopBar {
  /**
   * An element of this editor, never of the page around it.
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  byId (id) {
    return this.editor.$container.querySelector(`#${CSS.escape(id)}`)
  }

  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} root The header
   */
  constructor (editor, root) {
    this.editor = editor
    this.root = root
    this.saved = false
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const icon = (name) => `<se-icon src="${escapeHtml(editor.configObj.curConfig.imgPath)}/${name}"></se-icon>`
    root.innerHTML = `
      <div class="se-topbar-start">
        <a id="se-home" class="se-icon-button" hidden aria-label="${t('layout.home')}">${icon('home.svg')}</a>
        <nav id="se-breadcrumb" aria-label="${t('layout.breadcrumb')}" hidden><ol></ol></nav>
        <span class="se-doc-slot"></span>
      </div>
      <div class="se-topbar-center">
        <span id="se-save-state" role="status"></span>
      </div>
      <div class="se-topbar-end">
        <span class="se-history-slot"></span>
        <button type="button" id="se-export" class="se-text-button" aria-haspopup="menu" aria-expanded="false">
          <span>${t('layout.export')}</span>${icon('chevron_down.svg')}
        </button>
        <button type="button" id="se-save" class="se-text-button se-primary" hidden>${t('layout.save')}</button>
      </div>
      <se-popover id="se-export-menu" menu placement="bottom-end" aria-label="${t('layout.export')}">
        <div role="menuitem" data-target="tool_export"><span>${t('layout.export_image')}</span></div>
        <div role="menuitem" data-target="tool_save_as" hidden><span>${t('layout.export_svg')}</span></div>
      </se-popover>`
    this.initHost()
    this.$exportMenu = root.querySelector('#se-export-menu')
    root.querySelector('#se-export').addEventListener('click', (e) => {
      this.refreshExportMenu()
      this.$exportMenu.toggle(e.currentTarget)
    })
    this.$exportMenu.addEventListener('click', (e) => {
      const item = e.target.closest('[data-target]')
      if (item) this.byId(item.dataset.target)?.click()
    })
    root.querySelector('#se-save').addEventListener('click', () => {
      this.byId('tool_save')?.click()
    })
  }

  /**
   * Home link and breadcrumb of the host application.
   * @returns {void}
   */
  initHost () {
    const { homeUrl, breadcrumb } = this.editor.configObj.curConfig
    const home = this.root.querySelector('#se-home')
    const href = safeHref(homeUrl)
    if (href) {
      home.href = href
      home.hidden = false
    }
    const items = breadcrumbOf(breadcrumb)
    const nav = this.root.querySelector('#se-breadcrumb')
    const list = nav.querySelector('ol')
    for (const item of items) {
      const li = document.createElement('li')
      const node = document.createElement(item.href ? 'a' : 'span')
      if (item.href) node.href = item.href
      node.textContent = item.label
      li.append(node)
      list.append(li)
    }
    nav.hidden = !items.length
  }

  /**
   * The document menu of MainMenu, whose button shows the name of the
   * document.
   * @param {DocumentFragment} fragment
   * @returns {void}
   */
  attachMenu (fragment) {
    const menu = fragment.querySelector('#main_button')
    if (!menu) {
      this.root.append(fragment)
      return
    }
    menu.removeAttribute('src')
    menu.setAttribute('label', this.editor.title || this.editor.i18next.t('layout.untitled'))
    menu.classList.add('se-doc-menu')
    this.root.querySelector('.se-doc-slot').replaceWith(menu)
    menu.$menu?.setAttribute('aria-label', this.editor.i18next.t('layout.document_menu'))
  }

  /**
   * Undo and redo, on the right of the bar.
   * @param {HTMLElement} panel #history_panel
   * @returns {void}
   */
  attachHistory (panel) {
    panel.querySelector('.tool_sep')?.remove()
    this.root.querySelector('.se-history-slot').replaceWith(panel)
  }

  /**
   * @param {string} title
   * @returns {void}
   */
  setTitle (title) {
    const menu = this.root.querySelector('#main_button')
    menu?.setAttribute('label', title || this.editor.i18next.t('layout.untitled'))
  }

  /**
   * "Unsaved changes" from the first change, "Saved" once saved; nothing
   * for a document that nobody has changed.
   * @returns {void}
   */
  updateSaveState () {
    const state = this.root.querySelector('#se-save-state')
    const unsaved = Boolean(this.editor.showSaveWarning)
    if (unsaved) this.dirty = true
    else if (this.dirty) this.saved = true
    const value = unsaved ? 'unsaved' : this.saved ? 'saved' : ''
    // Called at each change of the drawing: the page is written only when
    // the state changes.
    if (state.dataset.state === value && state.dataset.lang === this.editor.i18next.language) return
    state.dataset.state = value
    state.dataset.lang = this.editor.i18next.language
    state.textContent = value ? this.editor.i18next.t(`layout.${value}`) : ''
  }

  /**
   * A new or opened document has not been saved yet.
   * @returns {void}
   */
  resetSaveState () {
    this.dirty = false
    this.saved = false
    this.updateSaveState()
  }

  /**
   * @returns {void}
   */
  refreshExportMenu () {
    for (const item of this.$exportMenu.querySelectorAll('[data-target]')) {
      item.hidden = !this.byId(item.dataset.target)
    }
  }

  /**
   * Save appears when an extension saves the document (ext-opensave).
   * @returns {void}
   */
  extensionsAdded () {
    this.root.querySelector('#se-save').hidden = !this.byId('tool_save')
    this.refreshExportMenu()
  }

  /**
   * @param {boolean} compact
   * @returns {void}
   */
  setCompact (compact) {
    this.root.querySelector('#se-export').hidden = compact
  }
}
