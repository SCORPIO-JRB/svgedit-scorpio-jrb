/**
 * Frames to export, in the canvas layout (lot V5; plan v2, section 4.3,
 * decision D7): one frame per supervision screen, one SVG exported per frame.
 * A new document has none.
 *
 * The canvas keeps the frames in the document (module frames of svgcanvas)
 * and draws them with the frame tool. This layer shows them on the canvas,
 * in the interaction layer, never in the drawing: a grey outline with the
 * name above it. A click on the name selects the frame; dragged, the name
 * moves it, and the handles of a selected frame resize it. The inspector
 * then gives its name, format, position and size, its export and its
 * deletion; without selection, it lists the frames. Delete removes the
 * selected frame, the arrows move it, Escape lets it go. Each change is one
 * undo step.
 * @module frames
 */
import { escapeHtml } from './panels/TopBar.js'
import { insertByRank } from './panels/Toolbar.js'
import { readsOwnKeys } from './shortcuts.js'
import { scrubInput } from './components/scrub.js'

const NS_SVG = 'http://www.w3.org/2000/svg'

/** Formats offered, in the order of the list; the canvas gives their sizes. */
export const FRAME_FORMATS = ['hd', 'sxga', 'a4', 'a3_landscape']

/** Side of a resize handle, in screen pixels. */
const HANDLE = 8
/** Space between the name and the top of the frame, in screen pixels. */
const LABEL_GAP = 6
/** Handles of a selected frame, and the cursor of each. */
const HANDLES = { nw: 'nwse', n: 'ns', ne: 'nesw', e: 'ew', se: 'nwse', s: 'ns', sw: 'nesw', w: 'ew' }

/**
 * The format of a size, or "custom".
 * @param {number} width
 * @param {number} height
 * @param {Object<string, [number, number]>} presets
 * @returns {string}
 */
export const formatOf = (width, height, presets) =>
  FRAME_FORMATS.find((key) => presets[key]?.[0] === width && presets[key]?.[1] === height) ?? 'custom'

/**
 * A box resized by a handle.
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {string} dir - "nw", "n"…
 * @param {number} dx
 * @param {number} dy
 * @returns {{x: number, y: number, width: number, height: number}} Whole
 *   units, at least one wide and high
 */
export const resizeBox = (box, dir, dx, dy) => {
  let left = box.x
  let top = box.y
  let right = box.x + box.width
  let bottom = box.y + box.height
  if (dir.includes('w')) left += dx
  if (dir.includes('e')) right += dx
  if (dir.includes('n')) top += dy
  if (dir.includes('s')) bottom += dy
  const x = Math.round(Math.min(left, right))
  const y = Math.round(Math.min(top, bottom))
  return {
    x,
    y,
    width: Math.max(1, Math.round(Math.max(left, right)) - x),
    height: Math.max(1, Math.round(Math.max(top, bottom)) - y)
  }
}

/**
 * Saves a text as a file.
 * @param {string} name
 * @param {string} text
 * @returns {void}
 */
export const downloadSvg = (name, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * A file name from a frame name: « Chaufferie N°2 » → "Chaufferie N°2.svg".
 * @param {string} name
 * @returns {string}
 */
export const fileNameOf = (name) => `${String(name || 'frame').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'frame'}.svg`

export class FrameLayer {
  /**
   * @param {import('./Editor.js').default} editor
   */
  constructor (editor) {
    this.editor = editor
    /** The selected `<se:frame>`, or null. */
    this.selected = null
    this.group = document.createElementNS(NS_SVG, 'g')
    this.group.id = 'se-frames'
    this.group.setAttribute('pointer-events', 'none')
    this.group.addEventListener('pointerdown', (e) => this.pointerdown(e))
    this.group.addEventListener('dblclick', (e) => this.dblclick(e))
    this.onKeydown = (e) => this.keydown(e)
    document.addEventListener('keydown', this.onKeydown, true)
    // A press on the drawing lets the frame go (the name and the handles
    // keep theirs: they cancel the mouse events that follow).
    editor.workarea?.addEventListener('mousedown', () => this.select(null))
    editor.svgCanvas.bind('frameCreated', (win, frame) => this.created(frame))
    // In the palette (Ctrl+K), beside the tool and the Export ▾ menu.
    editor.commands?.register({ id: 'add_frame', label: 'frames.add', run: () => this.addFrame() })
    editor.commands?.register({ id: 'export_frames', label: 'frames.export_all', run: () => this.export() })
    this.place()
  }

  get canvas () {
    return this.editor.svgCanvas
  }

  get t () {
    return (key, options) => this.editor.i18next.t(key, options)
  }

  /**
   * The frame tool, after Text in the toolbar.
   * @param {HTMLElement} bar
   * @returns {void}
   */
  addTool (bar) {
    const container = bar?.querySelector('[data-place="create"]')
    if (!container || bar.querySelector('#tool_frame')) return
    const template = document.createElement('template')
    template.innerHTML = `<se-button id="tool_frame" data-group="create" data-rank="15" title="frames.tool"
      src="frame.svg" shortcut="Shift+F"></se-button>`
    const button = template.content.firstElementChild
    button.addEventListener('click', () => {
      if (this.editor.leftPanel.updateLeftPanel('tool_frame')) {
        this.select(null)
        this.canvas.setMode('frame')
      }
    })
    insertByRank(container, button)
  }

  /**
   * Over the drawing and the grid, under the selection.
   * @returns {void}
   */
  place () {
    const content = this.canvas.getSvgContent()
    const grid = this.editor.grid?.group
    const anchor = grid?.parentNode ? grid : content
    if (anchor?.parentNode && anchor.nextSibling !== this.group) anchor.after(this.group)
  }

  /**
   * Draws the frames again: after a change of the document, of the view or
   * of the selected frame.
   * @returns {void}
   */
  update () {
    this.place()
    const frames = this.canvas.getFrames?.() ?? []
    if (this.selected && !frames.some((frame) => frame.element === this.selected)) {
      this.selected = null
      this.editor.layout?.inspector?.refresh()
    }
    const zoom = this.canvas.getZoom()
    const offset = this.canvas.getOffset()
    this.group.setAttribute('transform', `translate(${offset.x},${offset.y})`)
    this.group.replaceChildren()
    frames.forEach((frame, index) => {
      const selected = frame.element === this.selected
      const g = document.createElementNS(NS_SVG, 'g')
      g.setAttribute('class', `se-frame${selected ? ' se-frame-selected' : ''}`)
      g.dataset.index = String(index)
      const x = frame.x * zoom
      const y = frame.y * zoom
      const w = frame.width * zoom
      const h = frame.height * zoom
      const box = document.createElementNS(NS_SVG, 'rect')
      box.setAttribute('class', 'se-frame-box')
      Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => box.setAttribute(k, v))
      const label = document.createElementNS(NS_SVG, 'text')
      label.setAttribute('class', 'se-frame-label')
      label.setAttribute('x', x)
      label.setAttribute('y', y - LABEL_GAP)
      label.textContent = frame.name
      const hit = document.createElementNS(NS_SVG, 'rect')
      hit.setAttribute('class', 'se-frame-hit')
      g.append(box, hit, label)
      this.group.append(g)
      // The name is the handle that moves the frame: its box catches the
      // pointer, the text itself takes none.
      let width = 0
      try { width = label.getComputedTextLength() } catch (err) { width = 0 }
      Object.entries({ x: x - 2, y: y - LABEL_GAP - 13, width: Math.max(width, 24) + 4, height: 16 })
        .forEach(([k, v]) => hit.setAttribute(k, v))
      if (selected) {
        const points = {
          nw: [x, y],
          n: [x + w / 2, y],
          ne: [x + w, y],
          e: [x + w, y + h / 2],
          se: [x + w, y + h],
          s: [x + w / 2, y + h],
          sw: [x, y + h],
          w: [x, y + h / 2]
        }
        for (const [dir, [px, py]] of Object.entries(points)) {
          const handle = document.createElementNS(NS_SVG, 'rect')
          handle.setAttribute('class', 'se-frame-handle')
          handle.dataset.dir = dir
          handle.setAttribute('style', `cursor: ${HANDLES[dir]}-resize`)
          Object.entries({ x: px - HANDLE / 2, y: py - HANDLE / 2, width: HANDLE, height: HANDLE })
            .forEach(([k, v]) => handle.setAttribute(k, v))
          g.append(handle)
        }
      }
    })
  }

  /**
   * @param {Element|null} element - A `<se:frame>`, or null to let it go
   * @returns {void}
   */
  select (element) {
    if (element === this.selected) return
    this.selected = element
    if (element) {
      // A frame and objects are not selected together.
      this.canvas.clearSelection()
    }
    this.update()
    this.editor.layout?.inspector?.refresh()
    this.editor.layout?.contextBar?.refresh?.()
  }

  /**
   * Objects selected: the frame goes.
   * @returns {void}
   */
  selectionChanged () {
    if (this.selected && this.canvas.getSelectedElements().some(Boolean)) this.select(null)
  }

  /**
   * A frame drawn with the tool: back to the selection, the new frame
   * selected.
   * @param {object} frame
   * @returns {void}
   */
  created (frame) {
    this.editor.leftPanel?.clickSelect()
    this.select(frame.element)
  }

  /**
   * @param {PointerEvent} e
   * @returns {object|null} The frame of the event's target
   */
  frameOfEvent (e) {
    const g = e.target.closest?.('.se-frame')
    const frames = this.canvas.getFrames()
    return g ? frames[Number(g.dataset.index)] ?? null : null
  }

  /**
   * A press on a name moves the frame, on a handle resizes it.
   * @param {PointerEvent} e
   * @returns {void}
   */
  pointerdown (e) {
    if (e.button !== 0) return
    const frame = this.frameOfEvent(e)
    if (!frame) return
    // The canvas does not see this press (no mouse events follow).
    e.preventDefault()
    e.stopPropagation()
    const dir = e.target.dataset?.dir
    this.select(frame.element)
    const zoom = this.canvas.getZoom()
    const start = { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
    const from = Object.fromEntries(['x', 'y', 'width', 'height'].map((name) => [name, frame.element.getAttribute(name)]))
    const step = this.editor.configObj.curConfig.gridSnapping
      ? Number(this.editor.configObj.curConfig.snappingStep) || 10
      : 1
    const snap = (value) => Math.round(value / step) * step
    // The frame is drawn again on each move, its handles with it: the moves
    // are followed on the window.
    let box = start
    const move = (ev) => {
      const dx = (ev.clientX - e.clientX) / zoom
      const dy = (ev.clientY - e.clientY) / zoom
      box = dir
        ? resizeBox(start, dir, dx, dy)
        : { ...start, x: snap(start.x + dx), y: snap(start.y + dy) }
      for (const [name, value] of Object.entries(box)) frame.element.setAttribute(name, String(value))
      this.update()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (box !== start) this.canvas.changeFrame(frame.element, box, { from })
      this.update()
      this.editor.layout?.inspector?.refresh()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /**
   * A double click on a name: its field in the inspector.
   * @param {MouseEvent} e
   * @returns {void}
   */
  dblclick (e) {
    if (!this.frameOfEvent(e)) return
    e.stopPropagation()
    this.editor.layout?.setPanelOpen?.(true)
    this.editor.layout?.selectTab?.('properties')
    const field = this.editor.$container.querySelector('#se-frame-name')
    field?.focus()
    field?.select()
  }

  /**
   * With a frame selected: Delete removes it, the arrows move it, Escape lets
   * it go.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydown (e) {
    if (!this.selected || readsOwnKeys(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const element = this.selected
      this.select(null)
      this.canvas.removeFrame(element)
    } else if (e.key === 'Escape') {
      this.select(null)
    } else if (arrows[e.key]) {
      const [dx, dy] = arrows[e.key].map((v) => v * (e.shiftKey ? 10 : 1))
      const frame = this.canvas.getFrames().find((f) => f.element === this.selected)
      if (!frame) return
      this.canvas.undoMgr.merging('nudge', () =>
        this.canvas.changeFrame(frame.element, { x: frame.x + dx, y: frame.y + dy }))
      this.update()
      this.editor.layout?.inspector?.refresh()
    } else {
      return
    }
    e.preventDefault()
    e.stopPropagation()
  }

  /**
   * Adds a frame of a format beside the frames there are, or at the top left
   * of the page for the first one, and selects it.
   * @param {string} [format="hd"]
   * @returns {void}
   */
  addFrame (format = 'hd') {
    const [width, height] = this.canvas.getFramePresets()[format]
    const frames = this.canvas.getFrames()
    const right = frames.reduce((max, frame) => Math.max(max, frame.x + frame.width), -Infinity)
    const x = frames.length ? Math.round(right + 100) : 0
    const frame = this.canvas.addFrame({ name: this.canvas.nextFrameName(this.t('frames.default_name')), x, y: 0, width, height })
    this.select(frame.element)
  }

  /**
   * The files to export: one per frame, or the content without frames.
   * @param {Element} [element] - A single frame
   * @returns {Array<{name: string, svg: string}>}
   */
  exportFiles (element) {
    const frames = this.canvas.getFrames()
    const chosen = element ? frames.filter((frame) => frame.element === element) : frames
    if (chosen.length) {
      return chosen.map((frame) => ({ name: fileNameOf(frame.name), svg: this.canvas.getFrameSvgString(frame.element) }))
    }
    const svg = this.canvas.getContentSvgString()
    const title = this.canvas.getDocumentTitle?.() || this.editor.title || 'drawing'
    return svg ? [{ name: fileNameOf(title), svg }] : []
  }

  /**
   * Exports, as files saved by the browser; a host may handle them itself
   * (event `se-export-svg`, cancelable, on the editor).
   * @param {Element} [element]
   * @returns {void}
   */
  export (element) {
    const files = this.exportFiles(element)
    if (!files.length) return
    const event = new CustomEvent('se-export-svg', { detail: { files }, cancelable: true, bubbles: true })
    if (!this.editor.$container.dispatchEvent(event)) return
    files.forEach((file) => downloadSvg(file.name, file.svg))
  }

  /**
   * The sections of the inspector: the selected frame, the list of frames.
   * @param {(name: string) => HTMLElement} body - The body of a section
   * @returns {void}
   */
  buildInspector (body) {
    const t = (key, options) => escapeHtml(this.t(key, options))
    const frameBody = body('frame')
    const listBody = body('frames')
    const presets = this.canvas.getFramePresets()
    frameBody.innerHTML = `
      <label class="se-field se-field-wide">${t('frames.name')}<input type="text" id="se-frame-name"></label>
      <label class="se-field se-field-wide">${t('frames.format')}<select id="se-frame-format">
        ${FRAME_FORMATS.map((key) => `<option value="${key}">${t(`frames.format_${key}`, { width: presets[key][0], height: presets[key][1] })}</option>`).join('')}
        <option value="custom">${t('frames.format_custom')}</option>
      </select></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('properties.x_label')}</span><input type="text" id="se-frame-x" inputmode="decimal" size="5"></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('properties.y_label')}</span><input type="text" id="se-frame-y" inputmode="decimal" size="5"></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('properties.w_label')}</span><input type="text" id="se-frame-width" inputmode="decimal" size="5"></label>
      <label class="se-field se-field-short"><span class="se-field-letter">${t('properties.h_label')}</span><input type="text" id="se-frame-height" inputmode="decimal" size="5"></label>
      <div class="se-section-links">
        <button type="button" class="se-link-button" id="se-frame-export">${t('frames.export')}</button>
        <button type="button" class="se-link-button" id="se-frame-delete">${t('frames.delete')}</button>
      </div>`
    listBody.innerHTML = `
      <ul class="se-frame-list" aria-label="${t('layout.section_frames')}"></ul>
      <p class="se-frame-empty">${t('frames.empty')}</p>
      <div class="se-section-links">
        <button type="button" class="se-link-button" id="se-frame-add">${t('frames.add')}</button>
      </div>`
    const field = (id) => frameBody.querySelector(`#${id}`)
    const current = () => this.canvas.getFrames().find((frame) => frame.element === this.selected)
    const apply = (attrs) => {
      const frame = current()
      if (!frame) return
      this.canvas.changeFrame(frame.element, attrs)
      this.update()
      this.refreshInspector()
    }
    field('se-frame-name').addEventListener('change', (e) => {
      const name = e.target.value.trim()
      if (name) apply({ name })
      else this.refreshInspector({ force: true })
    })
    field('se-frame-format').addEventListener('change', (e) => {
      const size = presets[e.target.value]
      if (size) apply({ width: size[0], height: size[1] })
    })
    for (const name of ['x', 'y', 'width', 'height']) {
      field(`se-frame-${name}`).addEventListener('change', (e) => {
        const value = Number.parseFloat(String(e.target.value).replace(',', '.'))
        const valid = Number.isFinite(value) && (name === 'x' || name === 'y' || value > 0)
        if (valid) {
          apply({ [name]: value })
        } else {
          this.editor.toast(this.t('notification.invalidAttrValGiven'), { type: 'error' })
          this.refreshInspector({ force: true })
        }
      })
    }
    // The letters drag the position and the size (lot Valeurs glissées).
    for (const name of ['x', 'y', 'width', 'height']) {
      const input = field(`se-frame-${name}`)
      scrubInput(input.previousElementSibling, input, { min: name === 'x' || name === 'y' ? null : 1 })
    }
    for (const input of frameBody.querySelectorAll('input')) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.target.dispatchEvent(new Event('change'))
        if (e.key === 'Escape') this.refreshInspector({ force: true })
      })
    }
    frameBody.querySelector('#se-frame-export').addEventListener('click', () => this.export(this.selected))
    frameBody.querySelector('#se-frame-delete').addEventListener('click', () => {
      const element = this.selected
      this.select(null)
      if (element) this.canvas.removeFrame(element)
    })
    listBody.querySelector('#se-frame-add').addEventListener('click', () => this.addFrame())
    listBody.addEventListener('click', (e) => {
      const row = e.target.closest('[data-index]')
      if (!row) return
      const frame = this.canvas.getFrames()[Number(row.dataset.index)]
      if (frame) this.select(frame.element)
    })
    this.frameBody = frameBody
    this.listBody = listBody
  }

  /**
   * The values of the sections, from the document.
   * @param {{force?: boolean}} [options] - Also the field being typed in
   * @returns {void}
   */
  refreshInspector ({ force = false } = {}) {
    if (!this.frameBody) return
    const frames = this.canvas.getFrames()
    const frame = frames.find((f) => f.element === this.selected)
    if (frame) {
      const set = (id, value) => {
        const input = this.frameBody.querySelector(`#${id}`)
        if (force || document.activeElement !== input) input.value = value
      }
      set('se-frame-name', frame.name)
      set('se-frame-x', String(frame.x))
      set('se-frame-y', String(frame.y))
      set('se-frame-width', String(frame.width))
      set('se-frame-height', String(frame.height))
      this.frameBody.querySelector('#se-frame-format').value = formatOf(frame.width, frame.height, this.canvas.getFramePresets())
    }
    const list = this.listBody.querySelector('.se-frame-list')
    list.innerHTML = frames.map((f, i) => `<li><button type="button" class="se-frame-row" data-index="${i}">
      <span>${escapeHtml(f.name)}</span><span class="se-frame-size">${escapeHtml(this.t('frames.size', { width: f.width, height: f.height }))}</span>
      </button></li>`).join('')
    list.hidden = !frames.length
    this.listBody.querySelector('.se-frame-empty').hidden = frames.length > 0
  }

  /**
   * The entries of the Export ▾ menu: one per frame, all of them, or the
   * content without frames.
   * @returns {Array<{label: string, run: () => void}>}
   */
  exportEntries () {
    const frames = this.canvas.getFrames()
    if (!frames.length) return [{ label: this.t('layout.export_content'), run: () => this.export() }]
    const entries = frames.map((frame) => ({
      label: this.t('layout.export_frame', { name: frame.name, interpolation: { escapeValue: false } }),
      run: () => this.export(frame.element)
    }))
    if (frames.length > 1) {
      entries.push({ label: this.t('layout.export_frames', { count: frames.length }), run: () => this.export() })
    }
    return entries
  }

  /**
   * @returns {void}
   */
  destroy () {
    document.removeEventListener('keydown', this.onKeydown, true)
    this.group.remove()
  }
}
