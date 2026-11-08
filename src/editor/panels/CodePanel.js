/**
 * Code tab of the canvas layout (lot V3; plan v2, section 4.5), as in Claude
 * Design: the SVG source of the selection, or of the document without
 * selection, written by the serializer of the export.
 *
 * It is edited in place. Apply (Ctrl+Enter) passes the new source through the
 * import filter (sanitizeSvg) and makes one undo step; a syntax error is shown
 * with its line and nothing is applied. Escape gives back the source of the
 * drawing. While the text is being edited it does not follow the canvas, and
 * Apply changes what was shown when the editing began.
 * @module CodePanel
 */
import { escapeHtml } from './TopBar.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/**
 * Parses SVG source, and gives the line of a syntax error.
 * @param {string} source
 * @param {object} [options]
 * @param {boolean} [options.fragment] The source is one or more elements,
 *   not a whole document
 * @returns {{nodes: Element[], doc: Document|null, error: null|{line: number|null, message: string}}}
 */
export const parseSvgSource = (source, { fragment = false } = {}) => {
  // The fragment is wrapped on a line of its own, so that its lines keep
  // their numbers.
  const text = fragment
    ? `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}" xmlns:se="http://svg-edit.googlecode.com">\n${source}\n</svg>`
    : source
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const error = doc.getElementsByTagName('parsererror')[0]
  if (error) {
    const message = error.textContent.replace(/\s+/g, ' ').trim()
    // Chromium: "error on line 3 at column 5"; Firefox: "Line Number 3".
    const match = /line[^\d]{0,12}(\d+)/i.exec(message)
    let line = match ? Number(match[1]) : null
    if (line !== null && fragment) line = Math.max(1, line - 1)
    return { nodes: [], doc: null, error: { line, message } }
  }
  const root = doc.documentElement
  if (root.namespaceURI !== SVG_NS || root.localName !== 'svg') {
    return { nodes: [], doc: null, error: { line: 1, message: 'svg' } }
  }
  const nodes = fragment ? [...root.children] : [root]
  return { nodes, doc, error: null }
}

export class CodePanel {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} tab The Code tab
   */
  constructor (editor, tab) {
    this.editor = editor
    this.tab = tab
    this.target = null
    this.dirty = false
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const hint = escapeHtml(editor.commands.format('mod+enter'))
    tab.innerHTML = `
      <div class="se-inspector-head">
        <span class="se-inspector-type"></span>
        <span class="se-inspector-id"></span>
      </div>
      <div class="se-code">
        <textarea id="se-code-text" class="se-code-text" spellcheck="false" autocomplete="off"
          autocapitalize="off" wrap="soft" aria-label="${t('layout.code_label')}" aria-describedby="se-code-status"></textarea>
        <p id="se-code-status" class="se-code-status" role="status"></p>
        <p class="se-code-help">${t('layout.code_help')}</p>
        <div class="se-code-actions">
          <button type="button" id="se-code-copy" class="se-text-button se-secondary">${t('layout.copy')}</button>
          <button type="button" id="se-code-apply" class="se-text-button se-secondary" disabled>${t('layout.apply')} (${hint})</button>
        </div>
      </div>`
    this.$text = tab.querySelector('#se-code-text')
    this.$status = tab.querySelector('#se-code-status')
    this.$apply = tab.querySelector('#se-code-apply')
    this.$text.addEventListener('input', () => {
      this.dirty = this.$text.value !== this.shown
      this.$apply.disabled = !this.dirty
      this.setStatus('')
    })
    this.$text.addEventListener('keydown', (e) => {
      // The shortcuts of the editor do not apply while typing code.
      e.stopPropagation()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        this.apply()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.revert()
      }
    })
    tab.querySelector('#se-code-copy').addEventListener('click', () => this.copy())
    this.$apply.addEventListener('click', () => this.apply())
    editor.$svgEditor.addEventListener('se-paneltab', () => this.refresh())
    editor.$svgEditor.addEventListener('se-panelchange', () => this.refresh())
  }

  /**
   * @returns {boolean}
   */
  get visible () {
    const { layout } = this.editor
    return Boolean(layout?.panelOpen && layout.tab === 'code')
  }

  /**
   * The selection or the document changed: the source follows, at the next
   * frame, unless it is being edited.
   * @returns {void}
   */
  invalidate () {
    if (!this.visible || this.dirty || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.refresh()
    })
  }

  /**
   * @returns {void}
   */
  refresh () {
    if (!this.visible || this.dirty) return
    const { svgCanvas, i18next } = this.editor
    if (!svgCanvas) return
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    this.target = selected.length ? selected : null
    this.shown = selected.length
      ? selected.map((el) => svgCanvas.svgToString(el, 0)).join('\n')
      : svgCanvas.getSvgString()
    this.$text.value = this.shown
    this.$apply.disabled = true
    this.setStatus('')
    const type = this.tab.querySelector('.se-inspector-type')
    const id = this.tab.querySelector('.se-inspector-id')
    if (!selected.length) {
      type.textContent = i18next.t('layout.section_document')
      id.textContent = ''
    } else if (selected.length > 1) {
      type.textContent = i18next.t('layout.objects', { count: selected.length })
      id.textContent = ''
    } else {
      type.textContent = i18next.t(`layout.type_${TYPE_KEYS[selected[0].localName] ?? 'other'}`)
      id.textContent = selected[0].id ? `#${selected[0].id}` : ''
    }
  }

  /**
   * @param {string} message
   * @param {object} [options]
   * @param {boolean} [options.error]
   * @returns {void}
   */
  setStatus (message, { error = false } = {}) {
    this.$status.textContent = message
    this.$status.classList.toggle('se-code-error', error)
    this.$text.setAttribute('aria-invalid', String(error))
  }

  /**
   * @returns {void}
   */
  revert () {
    this.dirty = false
    this.refresh()
  }

  /**
   * @returns {Promise<void>}
   */
  async copy () {
    const text = this.$text.value
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      this.$text.select()
      document.execCommand?.('copy')
    }
    this.editor.toast(this.editor.i18next.t('layout.copied'))
  }

  /**
   * Applies the edited source: to the objects shown, or to the document.
   * @returns {boolean} Whether something was applied
   */
  apply () {
    if (!this.dirty) return false
    const { editor } = this
    const { svgCanvas, i18next } = editor
    const source = this.$text.value
    const fragment = Boolean(this.target)
    const { nodes, error } = parseSvgSource(source, { fragment })
    if (error) {
      this.setStatus(error.line
        ? i18next.t('layout.code_error_line', { line: error.line })
        : i18next.t('layout.code_error'), { error: true })
      this.selectLine(error.line)
      return false
    }
    if (!fragment) {
      if (!svgCanvas.setSvgString(source)) {
        this.setStatus(i18next.t('layout.code_error'), { error: true })
        return false
      }
      svgCanvas.clearSelection()
      editor.updateCanvas()
      editor.layersPanel.populateLayers()
      this.dirty = false
      this.refresh()
      return true
    }
    const targets = this.target.filter((el) => el.isConnected)
    if (!targets.length || !nodes.length) {
      this.setStatus(i18next.t('layout.code_error'), { error: true })
      return false
    }
    // An id taken elsewhere in the drawing would break the references.
    const content = svgCanvas.getSvgContent()
    const kept = new Set(targets.flatMap((el) => [el, ...el.querySelectorAll('[id]')]))
    for (const node of nodes) {
      for (const el of [node, ...node.querySelectorAll('[id]')]) {
        if (!el.id) continue
        const other = content.querySelector(`#${CSS.escape(el.id)}`)
        if (other && !kept.has(other)) {
          this.setStatus(i18next.t('layout.code_error_id', { id: el.id }), { error: true })
          return false
        }
      }
    }
    // The new objects take the place of the first one shown.
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const batch = new BatchCommand('Edit source')
    const anchor = targets[0]
    const parent = anchor.parentNode
    const next = anchor.nextSibling
    // The import filter needs a parent: it removes what it refuses from it.
    const holder = document.createElementNS(SVG_NS, 'g')
    for (const node of nodes) holder.append(document.importNode(node, true))
    for (const el of [...holder.children]) svgCanvas.sanitizeSvg(el)
    const created = [...holder.children]
    if (!created.length) {
      this.setStatus(i18next.t('layout.code_error'), { error: true })
      return false
    }
    svgCanvas.clearSelection()
    for (const el of targets) {
      const elParent = el.parentNode
      const elNext = el.nextSibling
      el.remove()
      batch.addSubCommand(new RemoveElementCommand(el, elNext, elParent))
    }
    for (const el of created) {
      parent.insertBefore(el, next?.parentNode === parent ? next : null)
      batch.addSubCommand(new InsertElementCommand(el))
    }
    svgCanvas.addCommandToHistory(batch)
    svgCanvas.call('changed', created)
    this.dirty = false
    // The tree of the Layers tab follows the "changed" event.
    const drawn = created.filter((el) => el.isConnected && typeof el.getBBox === 'function')
    if (drawn.length) svgCanvas.selectOnly(drawn, drawn.length === 1)
    else this.refresh()
    return true
  }

  /**
   * Puts the caret on a line of the text.
   * @param {number|null} line From 1
   * @returns {void}
   */
  selectLine (line) {
    if (!line) return
    const lines = this.$text.value.split('\n')
    const start = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0)
    const end = start + (lines[line - 1]?.length ?? 0)
    this.$text.focus()
    this.$text.setSelectionRange(start, end)
  }
}

const TYPE_KEYS = {
  rect: 'rect',
  circle: 'circle',
  ellipse: 'ellipse',
  line: 'line',
  polyline: 'polyline',
  polygon: 'polygon',
  path: 'path',
  text: 'text',
  g: 'group',
  use: 'use',
  image: 'image',
  foreignObject: 'foreign',
  a: 'link'
}
