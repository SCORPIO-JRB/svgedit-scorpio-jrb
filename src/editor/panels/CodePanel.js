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
 *
 * As in the mockups, a tag with several attributes has one attribute per line
 * (x and y, x1 and y1… share one), and the source is coloured: a layer under
 * the text field draws the colours of what is typed. Only the spaces between
 * attributes change: the text of the drawing and every value stay as they
 * are written.
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

/** Attributes that share the line of the one before them. */
const PAIRS = { y: 'x', y1: 'x1', y2: 'x2', cy: 'cx', ry: 'rx', dy: 'dx' }

/** Above this length the source is not coloured (5 000 objects and more). */
const HIGHLIGHT_LIMIT = 300000

// A comment, a CDATA section, a processing instruction, a doctype, or a start
// tag with its attributes (a value may hold ">" between its quotes).
const MARKUP = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/[^>]*>|<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'))?/g

/**
 * One attribute per line in the start tags that have three or more and begin
 * a line, indented under their tag; the rest of the source is kept as it is.
 * @param {string} source
 * @returns {string}
 */
export const formatSvgSource = (source) => String(source).replace(MARKUP, (match, name, attrs, slash, offset, whole) => {
  if (!name) return match
  const list = [...(attrs ?? '').matchAll(ATTRIBUTE)].map((m) => ({ name: m[1], text: m[0] }))
  if (list.length < 3) return match
  const lineStart = whole.lastIndexOf('\n', offset - 1) + 1
  const before = whole.slice(lineStart, offset)
  // A tag inside a line of text (a tspan) stays on its line.
  if (before.trim()) return match
  const indent = before + '  '
  let out = `<${name}`
  list.forEach((attr, i) => {
    const pair = PAIRS[attr.name]
    out += pair && list[i - 1]?.name === pair ? ` ${attr.text}` : `\n${indent}${attr.text}`
  })
  return `${out}${slash ? '/>' : '>'}`
})

/**
 * The source as HTML, coloured: tags, attribute names, values, comments.
 * @param {string} source
 * @returns {string}
 */
export const highlightSvg = (source) => {
  const text = String(source)
  let html = ''
  let last = 0
  const span = (kind, value) => `<span class="se-code-${kind}">${escapeHtml(value)}</span>`
  for (const match of text.matchAll(MARKUP)) {
    html += escapeHtml(text.slice(last, match.index))
    last = match.index + match[0].length
    const [whole, name, attrs] = match
    if (!name) {
      html += span(whole.startsWith('</') ? 'tag' : 'comment', whole)
      continue
    }
    html += span('tag', `<${name}`)
    let rest = attrs ?? ''
    let at = 0
    for (const attr of rest.matchAll(ATTRIBUTE)) {
      html += escapeHtml(rest.slice(at, attr.index))
      at = attr.index + attr[0].length
      const equals = attr[0].slice(attr[1].length, attr[2] ? attr[0].length - attr[2].length : undefined)
      html += span('attr', attr[1]) + escapeHtml(equals) + (attr[2] ? span('value', attr[2]) : '')
    }
    rest = rest.slice(at)
    // What stands between the last attribute and the end of the tag.
    const end = whole.slice(1 + name.length + (attrs ?? '').length)
    html += escapeHtml(rest) + span('tag', end)
  }
  return html + escapeHtml(text.slice(last))
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
        <div class="se-code-editor">
          <pre class="se-code-highlight" aria-hidden="true"></pre>
          <textarea id="se-code-text" class="se-code-text" spellcheck="false" autocomplete="off"
            autocapitalize="off" wrap="soft" aria-label="${t('layout.code_label')}" aria-describedby="se-code-status"></textarea>
        </div>
        <p id="se-code-status" class="se-code-status" role="status"></p>
        <p class="se-code-help">${t('layout.code_help')}</p>
        <div class="se-code-actions">
          <button type="button" id="se-code-copy" class="se-text-button se-secondary">${t('layout.copy')}</button>
          <button type="button" id="se-code-apply" class="se-text-button se-secondary" disabled>${t('layout.apply')} (${hint})</button>
        </div>
      </div>`
    this.$text = tab.querySelector('#se-code-text')
    this.$highlight = tab.querySelector('.se-code-highlight')
    this.$status = tab.querySelector('#se-code-status')
    this.$apply = tab.querySelector('#se-code-apply')
    this.$text.addEventListener('input', () => {
      this.dirty = this.$text.value !== this.shown
      this.$apply.disabled = !this.dirty
      this.setStatus('')
      this.highlight()
    })
    this.$text.addEventListener('scroll', () => this.syncScroll())
    // The field can be resized: the coloured layer keeps its size.
    new ResizeObserver(() => this.syncScroll()).observe(this.$text)
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
   * Colours the text of the field, at the next frame.
   * @returns {void}
   */
  highlight () {
    if (this.highlightFrame) return
    this.highlightFrame = requestAnimationFrame(() => {
      this.highlightFrame = null
      const value = this.$text.value
      const plain = value.length > HIGHLIGHT_LIMIT
      this.$text.classList.toggle('se-code-plain', plain)
      // The last line break needs a character after it to take its height.
      this.$highlight.innerHTML = plain ? '' : `${highlightSvg(value)}\n`
      this.syncScroll()
    })
  }

  /**
   * @returns {void}
   */
  syncScroll () {
    this.$highlight.style.height = `${this.$text.offsetHeight}px`
    this.$highlight.scrollTop = this.$text.scrollTop
    this.$highlight.scrollLeft = this.$text.scrollLeft
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
    this.shown = formatSvgSource(selected.length
      ? selected.map((el) => svgCanvas.svgToString(el, 0)).join('\n')
      : svgCanvas.getSvgString())
    this.$text.value = this.shown
    this.highlight()
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
