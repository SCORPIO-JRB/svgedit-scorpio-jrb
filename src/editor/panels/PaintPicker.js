/**
 * The colour window of the canvas layout (se-color-field, plan v2,
 * section 4.7): it replaces the jPicker and jGraduate dialogs of the classic
 * layout, which keeps them.
 *
 * - Custom tab: a solid colour or a gradient (linear or radial, its angle and
 *   its stops); the saturation and brightness area, the hue and the opacity;
 *   the colour in hexadecimal, RGB or HSL; the eyedropper; the colours of the
 *   document and the recent ones.
 * - Libraries tab: the colours of the Scorp-io synoptics and of the design
 *   system, or those of the `colorLibraries` option; search, grid or list.
 *
 * It edits the paint of a se-colorpicker (the inspector's or a twin in the
 * contextual bar): while a control is dragged, the paint is previewed on the
 * drawing outside the history (`input` event); at the end of the gesture it
 * is applied once (`change` event), as one undo step.
 */
import SvgCanvas from '@svgedit/svgcanvas'
import { escapeHtml } from './TopBar.js'
import {
  parseColor, toHex, rgbToHsv, hsvToRgb, channelsOf, colorOfChannels, FORMATS,
  cssColor, documentColors, hueTrack
} from '../color/color.js'
import {
  angleOfLine, lineOf, setAngle, readStops, colorAt, cssGradient, makeGradient, sortStops
} from '../color/gradient.js'
import { DEFAULT_COLOR_LIBRARIES } from '../color-libraries.js'

const { Paint } = SvgCanvas

/** Most recent colours kept. */
export const RECENT_MAX = 16
/** Gap between the window and the panel or its anchor, in pixels. */
const GAP = 8
const MARGIN = 8

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

/**
 * Puts a colour at the head of the recent colours.
 * @param {string[]} list
 * @param {string} hex
 * @param {number} [max]
 * @returns {string[]}
 */
export const pushRecent = (list, hex, max = RECENT_MAX) =>
  [hex, ...list.filter((color) => color !== hex)].slice(0, max)

/**
 * Text folded for a search: lower case, without accents.
 * @param {string} text
 * @returns {string}
 */
export const fold = (text) => String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * The groups of a library whose colours match a search, on their name, the
 * name of their group or their hexadecimal.
 * @param {import('../color-libraries.js').ColorLibrary} library
 * @param {string} query
 * @param {(key: string) => string} label Name shown for a key
 * @returns {Array<{name: string, colors: Array<{value: string, label: string}>}>}
 */
export const searchLibrary = (library, query, label) => {
  const q = fold(query).trim().replace(/^#/, '')
  return (library?.groups ?? []).map((group) => {
    const groupName = label(group.name)
    const colors = group.colors.map((color) => ({
      value: color.value,
      label: color.name ? label(color.name) : `${groupName} ${color.step ?? ''}`.trim()
    })).filter((color) => !q ||
      fold(color.label).includes(q) ||
      fold(groupName).includes(q) ||
      fold(color.value).replace('#', '').includes(q))
    return { name: groupName, colors }
  }).filter((group) => group.colors.length)
}

/**
 * Where the window goes: beside the panel when it is opened from the
 * inspector, so that it covers the drawing and not the field; otherwise above
 * or below its anchor.
 * @param {object} p
 * @param {{left: number, top: number, right: number, bottom: number}} p.anchor
 * @param {{width: number, height: number}} p.size
 * @param {{width: number, height: number}} p.viewport
 * @param {{left: number}|null} [p.panel] The right panel holding the anchor
 * @returns {{x: number, y: number}}
 */
export const placePicker = ({ anchor, size, viewport, panel = null }) => {
  const fitY = (y) => Math.round(clamp(y, MARGIN, Math.max(MARGIN, viewport.height - size.height - MARGIN)))
  const fitX = (x) => Math.round(clamp(x, MARGIN, Math.max(MARGIN, viewport.width - size.width - MARGIN)))
  if (panel) {
    const x = panel.left - GAP - size.width
    if (x >= MARGIN) return { x: Math.round(x), y: fitY(anchor.top) }
  }
  const above = anchor.top - GAP - size.height
  const below = anchor.bottom + GAP
  const y = panel || above < MARGIN ? (below + size.height <= viewport.height - MARGIN ? below : above) : above
  return { x: fitX(anchor.left), y: fitY(y) }
}

/**
 * What a paint shows, to know whether the target changed outside the window.
 * @param {object|null} paint
 * @param {boolean} [mixed]
 * @returns {string}
 */
export const signatureOf = (paint, mixed = false) => {
  if (mixed) return 'mixed'
  if (!paint || paint.type === 'none' || (paint.type === 'solidColor' && (!paint.solidColor || paint.solidColor === 'none'))) return 'none'
  const alpha = Math.round(Number(paint.alpha) * 10) / 10
  if (paint.type === 'solidColor') return `solid:${String(paint.solidColor).toLowerCase()}:${alpha}`
  const grad = paint[paint.type]
  if (!grad) return 'none'
  const geometry = ['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy'].map((name) => grad.getAttribute(name)).join(',')
  return `${paint.type}:${alpha}:${geometry}:${JSON.stringify(readStops(grad))}`
}

/** Elements that carry a fill and a stroke. */
const PAINTED = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text'])

export class PaintPicker {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} root The editor, where the window goes
   */
  constructor (editor, root) {
    this.editor = editor
    this.target = null
    this.mode = 'solid'
    this.gradType = 'linearGradient'
    this.grad = null
    this.stops = []
    this.activeStop = null
    this.hsv = { h: 0, s: 0, v: 100 }
    this.alpha = 1
    this.paintAlpha = 100
    this.mixed = false
    this.signature = ''
    this.format = FORMATS.includes(this.pref('color_format')) ? this.pref('color_format') : 'hex'
    this.source = 'document'
    this.libraryView = 'grid'
    this.frame = 0
    this.build(root)
    this.initEvents()
    this.mountToggles(root)
  }

  /**
   * @param {string} key
   * @param {object} [options]
   * @returns {string}
   */
  t (key, options) {
    return this.editor.i18next.t(key, options)
  }

  /**
   * @param {string} key
   * @param {string} [value]
   * @returns {string|undefined}
   */
  pref (key, value) {
    const config = this.editor.configObj
    if (value === undefined) return config?.pref(key)
    config?.pref(key, value, true)
    return undefined
  }

  /**
   * @param {string} name File of the icon
   * @returns {string}
   */
  icon (name) {
    return `<se-icon src="${escapeHtml(this.editor.configObj.curConfig.imgPath)}/${escapeHtml(name)}"></se-icon>`
  }

  /** @returns {import('../color-libraries.js').ColorLibrary[]} */
  get libraries () {
    const configured = this.editor.configObj.curConfig.colorLibraries
    return Array.isArray(configured) && configured.length ? configured : DEFAULT_COLOR_LIBRARIES
  }

  /**
   * @param {HTMLElement} root
   * @returns {void}
   */
  build (root) {
    const t = (key) => escapeHtml(this.t(key))
    const template = document.createElement('template')
    template.innerHTML = `
      <se-popover id="se-paint" role="dialog" aria-labelledby="se-paint-title">
        <div class="se-paint-head">
          <span id="se-paint-title" class="se-paint-title"></span>
          <button type="button" id="se-paint-close" class="se-paint-icon" aria-label="${t('color.close')}">${this.icon('xmark.svg')}</button>
        </div>
        <div class="se-paint-tabs" role="tablist">
          <button type="button" role="tab" id="se-paint-tab-custom" aria-controls="se-paint-custom" aria-selected="true">${t('color.custom')}</button>
          <button type="button" role="tab" id="se-paint-tab-libraries" aria-controls="se-paint-libraries" aria-selected="false" tabindex="-1">${t('color.libraries')}</button>
        </div>
        <div id="se-paint-custom" role="tabpanel" aria-labelledby="se-paint-tab-custom">
          <div class="se-paint-row">
            <span class="se-paint-label" id="se-paint-type-label">${t('color.type')}</span>
            <div class="se-paint-segments" role="radiogroup" aria-labelledby="se-paint-type-label">
              <button type="button" role="radio" data-mode="solid" aria-checked="true" aria-label="${t('color.solid')}" title="${t('color.solid')}">${this.icon('paint_solid.svg')}</button>
              <button type="button" role="radio" data-mode="gradient" aria-checked="false" tabindex="-1" aria-label="${t('color.gradient')}" title="${t('color.gradient')}">${this.icon('paint_gradient.svg')}</button>
            </div>
          </div>
          <div class="se-paint-gradient" hidden>
            <div class="se-paint-row">
              <label class="se-paint-label" for="se-paint-style">${t('color.style')}</label>
              <select id="se-paint-style" class="se-paint-select">
                <option value="linearGradient">${t('color.linear')}</option>
                <option value="radialGradient">${t('color.radial')}</option>
              </select>
              <label class="se-paint-field se-paint-angle" title="${t('color.angle')}">
                ${this.icon('angle.svg')}
                <input id="se-paint-angle" inputmode="numeric" autocomplete="off" aria-label="${t('color.angle')}">
              </label>
            </div>
            <div class="se-paint-bar" id="se-paint-bar">
              <div class="se-paint-bar-fill"></div>
            </div>
            <div class="se-paint-row se-paint-stops-head">
              <span class="se-paint-label" id="se-paint-stops-label">${t('color.stops')}</span>
              <button type="button" id="se-paint-add-stop" class="se-paint-icon" aria-label="${t('color.add_stop')}" title="${t('color.add_stop')}">${this.icon('plus.svg')}</button>
            </div>
            <ul class="se-paint-stops" aria-labelledby="se-paint-stops-label"></ul>
          </div>
          <div class="se-paint-area" id="se-paint-area" role="slider" tabindex="0"
            aria-label="${t('color.area')}" aria-valuemin="0" aria-valuemax="100">
            <div class="se-paint-thumb"></div>
          </div>
          <div class="se-paint-sliders">
            <button type="button" id="se-paint-eyedropper" class="se-paint-icon" aria-label="${t('color.eyedropper')}" title="${t('color.eyedropper')}" aria-pressed="false">${this.icon('eye_dropper.svg')}</button>
            <div class="se-paint-tracks">
              <div class="se-paint-track se-paint-hue" id="se-paint-hue" role="slider" tabindex="0"
                aria-label="${t('color.hue')}" aria-valuemin="0" aria-valuemax="360"><div class="se-paint-thumb"></div></div>
              <div class="se-paint-track se-paint-alpha" id="se-paint-alpha" role="slider" tabindex="0"
                aria-label="${t('color.opacity')}" aria-valuemin="0" aria-valuemax="100"><div class="se-paint-thumb"></div></div>
            </div>
          </div>
          <p class="se-paint-hint" id="se-paint-hint" hidden>${t('color.eyedropper_hint')}</p>
          <div class="se-paint-values">
            <select id="se-paint-format" class="se-paint-select" aria-label="${t('color.format')}">
              ${FORMATS.map((format) => `<option value="${format}">${t(`color.format_${format}`)}</option>`).join('')}
            </select>
            <div class="se-paint-channels"></div>
            <label class="se-paint-field se-paint-percent">
              <input id="se-paint-opacity" inputmode="numeric" autocomplete="off" aria-label="${t('color.opacity')}"><span aria-hidden="true">%</span>
            </label>
          </div>
          <div class="se-paint-swatches-head">
            <select id="se-paint-source" class="se-paint-select se-paint-select-plain" aria-label="${t('color.source')}">
              <option value="document">${t('color.source_document')}</option>
              <option value="recent">${t('color.source_recent')}</option>
            </select>
          </div>
          <div class="se-paint-swatches" id="se-paint-swatches"></div>
        </div>
        <div id="se-paint-libraries" role="tabpanel" aria-labelledby="se-paint-tab-libraries" hidden>
          <label class="se-paint-field se-paint-search">
            ${this.icon('search.svg')}
            <input type="search" id="se-paint-search" autocomplete="off" placeholder="${t('color.search')}" aria-label="${t('color.search')}">
          </label>
          <div class="se-paint-row">
            <select id="se-paint-library" class="se-paint-select" aria-label="${t('color.library')}"></select>
            <button type="button" id="se-paint-view" class="se-paint-icon" aria-label="${t('color.view_list')}" title="${t('color.view_list')}">${this.icon('view_list.svg')}</button>
          </div>
          <div class="se-paint-groups" id="se-paint-groups"></div>
        </div>
      </se-popover>`
    root.append(template.content)
    const $ = (selector) => root.querySelector(selector)
    this.$popover = $('#se-paint')
    this.$title = $('#se-paint-title')
    this.$custom = $('#se-paint-custom')
    this.$libraries = $('#se-paint-libraries')
    this.$segments = $('.se-paint-segments')
    this.$gradient = $('.se-paint-gradient')
    this.$style = $('#se-paint-style')
    this.$angle = $('#se-paint-angle')
    this.$bar = $('#se-paint-bar')
    this.$barFill = $('.se-paint-bar-fill')
    this.$stops = $('.se-paint-stops')
    this.$area = $('#se-paint-area')
    this.$hue = $('#se-paint-hue')
    this.$alpha = $('#se-paint-alpha')
    this.$eyedropper = $('#se-paint-eyedropper')
    this.$hint = $('#se-paint-hint')
    this.$format = $('#se-paint-format')
    this.$channels = $('.se-paint-channels')
    this.$opacity = $('#se-paint-opacity')
    this.$source = $('#se-paint-source')
    this.$swatches = $('#se-paint-swatches')
    this.$search = $('#se-paint-search')
    this.$library = $('#se-paint-library')
    this.$view = $('#se-paint-view')
    this.$groups = $('#se-paint-groups')
    this.$hue.style.setProperty('--se-paint-hue-track', hueTrack())
    this.$format.value = this.format
    this.$library.innerHTML = this.libraries
      .map((library, i) => `<option value="${i}">${escapeHtml(this.t(library.name))}</option>`).join('')
    this.buildChannels()
  }

  /** @returns {void} */
  initEvents () {
    const { $popover } = this
    $popover.querySelector('#se-paint-close').addEventListener('click', () => this.close())
    $popover.addEventListener('se-popover-close', () => {
      this.stopPicking()
      this.commitPending()
      this.target?.setAttribute('aria-expanded', 'false')
      this.target = null
    })
    // Tabs.
    $popover.querySelector('[role="tablist"]').addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]')
      if (tab) this.selectTab(tab.id.endsWith('libraries') ? 'libraries' : 'custom', true)
    })
    $popover.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      const next = this.$libraries.hidden ? 'libraries' : 'custom'
      this.selectTab(e.key === 'Home' ? 'custom' : e.key === 'End' ? 'libraries' : next, true)
    })
    // Solid or gradient.
    this.$segments.addEventListener('click', (e) => {
      const button = e.target.closest('[data-mode]')
      if (button) this.setMode(button.dataset.mode)
    })
    this.$segments.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      e.preventDefault()
      this.setMode(this.mode === 'solid' ? 'gradient' : 'solid')
      this.$segments.querySelector(`[data-mode="${this.mode}"]`).focus()
    })
    this.$style.addEventListener('change', () => this.setGradientType(this.$style.value))
    this.$angle.addEventListener('change', () => this.setGradientAngle(this.$angle.value))
    this.$angle.addEventListener('keydown', (e) => this.stepField(e, this.$angle, () => this.setGradientAngle(this.$angle.value), 0, 359, true))
    // The area, the hue and the opacity: dragged or moved with the arrows.
    this.track(this.$area, (x, y) => {
      this.hsv = { ...this.hsv, s: x * 100, v: (1 - y) * 100 }
    })
    this.track(this.$hue, (x) => { this.hsv = { ...this.hsv, h: x * 360 } })
    this.track(this.$alpha, (x) => { this.alpha = x })
    this.keys(this.$area, (dx, dy) => {
      this.hsv = { ...this.hsv, s: clamp(this.hsv.s + dx, 0, 100), v: clamp(this.hsv.v - dy, 0, 100) }
    })
    this.keys(this.$hue, (dx, dy, end) => {
      this.hsv = { ...this.hsv, h: end === undefined ? clamp(this.hsv.h + dx - dy, 0, 360) : end * 360 }
    })
    this.keys(this.$alpha, (dx, dy, end) => {
      this.alpha = end === undefined ? clamp(this.alpha + (dx - dy) / 100, 0, 1) : end
    })
    // Values.
    this.$format.addEventListener('change', () => {
      this.format = this.$format.value
      this.pref('color_format', this.format)
      this.buildChannels()
      this.renderValues()
    })
    this.$opacity.addEventListener('change', () => {
      const value = Number.parseFloat(this.$opacity.value)
      if (Number.isFinite(value)) {
        this.alpha = clamp(value, 0, 100) / 100
        this.changed(true)
      } else {
        this.renderValues()
      }
    })
    this.$opacity.addEventListener('keydown', (e) => this.stepField(e, this.$opacity, () => this.$opacity.dispatchEvent(new Event('change')), 0, 100))
    // Eyedropper.
    this.$eyedropper.addEventListener('click', () => this.pickColor())
    // Swatches.
    this.$source.addEventListener('change', () => {
      this.source = this.$source.value
      this.renderSwatches()
    })
    const onSwatch = (e) => {
      const swatch = e.target.closest('[data-color]')
      if (!swatch) return
      const color = parseColor(swatch.dataset.color)
      if (color) this.setRgb(color, 1, true)
    }
    this.$swatches.addEventListener('click', onSwatch)
    this.$groups.addEventListener('click', onSwatch)
    this.$swatches.addEventListener('keydown', (e) => this.roveSwatches(e, this.$swatches))
    this.$groups.addEventListener('keydown', (e) => this.roveSwatches(e, this.$groups))
    // Libraries.
    this.$search.addEventListener('input', () => this.renderLibrary())
    this.$library.addEventListener('change', () => this.renderLibrary())
    this.$view.addEventListener('click', () => {
      this.libraryView = this.libraryView === 'grid' ? 'list' : 'grid'
      const list = this.libraryView === 'list'
      const label = this.t(list ? 'color.view_grid' : 'color.view_list')
      this.$view.setAttribute('aria-label', label)
      this.$view.title = label
      this.$view.innerHTML = this.icon(list ? 'view_grid.svg' : 'view_list.svg')
      this.renderLibrary()
    })
    // Gradient stops.
    this.$bar.addEventListener('pointerdown', (e) => this.barPointerDown(e))
    this.$bar.addEventListener('keydown', (e) => {
      const handle = e.target.closest('.se-paint-handle')
      if (handle) this.handleKey(e, this.stops[Number(handle.dataset.stop)])
    })
    this.$bar.addEventListener('keyup', () => {
      if (!this.keyed) return
      this.keyed = false
      this.commit()
    })
    this.$bar.addEventListener('focusout', () => this.commitPending())
    this.$popover.querySelector('#se-paint-add-stop').addEventListener('click', () => this.addStop())
    this.$stops.addEventListener('click', (e) => {
      const row = e.target.closest('[data-stop]')
      if (!row) return
      const stop = this.stops[Number(row.dataset.stop)]
      if (e.target.closest('.se-paint-remove')) this.removeStop(stop)
      else if (e.target.closest('.se-paint-chip')) this.selectStop(stop)
    })
    this.$stops.addEventListener('focusin', (e) => {
      const row = e.target.closest('[data-stop]')
      if (row && !e.target.closest('.se-paint-remove')) this.selectStop(this.stops[Number(row.dataset.stop)], false)
    })
    this.$stops.addEventListener('change', (e) => {
      const row = e.target.closest('[data-stop]')
      if (row) this.stopFieldChanged(this.stops[Number(row.dataset.stop)], e.target)
    })
  }

  // ---------------------------------------------------------------------
  // Opening, reading the target.
  // ---------------------------------------------------------------------

  /**
   * @param {HTMLElement} target A se-colorpicker
   * @returns {void}
   */
  open (target) {
    if (this.$popover.opened && this.target === target) {
      this.close()
      return
    }
    if (this.$popover.opened) this.$popover.close()
    this.target = target
    this.type = target.getAttribute('type') === 'stroke' ? 'stroke' : 'fill'
    // A field may name the window, and take solid colours only: the
    // background of the page (lot Fond).
    this.$title.textContent = this.t(target.dataset.title ?? (this.type === 'stroke' ? 'color.title_stroke' : 'color.title_fill'))
    this.solidOnly = target.hasAttribute('data-solid')
    this.$segments.closest('.se-paint-row').style.display = this.solidOnly ? 'none' : ''
    this.read()
    this.selectTab('custom')
    this.renderSwatches()
    this.renderLibrary()
    this.$popover.open(target)
    target.setAttribute('aria-expanded', 'true')
    this.place()
    // The focus enters the window: Tab goes to its controls, Escape closes it.
    this.$popover.tabIndex = -1
    this.$popover.focus({ preventScroll: true })
  }

  /** @returns {boolean} */
  get opened () {
    return this.$popover.opened
  }

  /**
   * @param {{restoreFocus?: boolean}} [options]
   * @returns {void}
   */
  close ({ restoreFocus = true } = {}) {
    this.$popover.close({ restoreFocus })
  }

  /**
   * After a change of selection or of the document.
   * @returns {void}
   */
  selectionChanged () {
    this.refreshToggles()
    if (!this.opened) return
    // A preview shown on the elements selected before goes back to them.
    if (this.pending) {
      cancelAnimationFrame(this.frame)
      this.pending = false
      this.editor.svgCanvas.cancelPaintPreview()
    }
    this.refresh()
  }

  /**
   * The title line of the Fill and Stroke sections of the inspector, as in
   * Figma (lot Propriétés): the colour libraries, and + when there is no
   * paint.
   * @param {HTMLElement} root
   * @returns {void}
   */
  mountToggles (root) {
    this.toggles = {}
    for (const type of ['fill', 'stroke']) {
      const tools = root.querySelector(`.se-inspector [data-section="${type}"] > .se-section-tools`)
      if (!tools) continue
      const styles = this.toolButton(type, 'se-paint-styles', 'styles.svg', this.t('color.styles'))
      styles.addEventListener('click', () => this.openLibraries(type))
      const add = this.toolButton(type, 'se-paint-add se-paint-toggle', 'plus.svg', this.t(`color.add_${type}`))
      add.addEventListener('click', () => this.togglePaint(type))
      tools.append(styles, add)
      this.toggles[type] = { add, styles }
    }
    this.refreshToggles()
  }

  /**
   * The end of the paint of Fill and Stroke: the eye, which hides the paint
   * and keeps it, and −, which removes it. Once the fields are in the
   * inspector.
   * @returns {void}
   */
  mountRows () {
    for (const type of ['fill', 'stroke']) {
      const picker = document.querySelector(`.se-inspector #${type}_color`)
      const toggles = this.toggles?.[type]
      if (!picker || !toggles || toggles.row) continue
      const row = document.createElement('div')
      row.className = 'se-paint-row'
      picker.before(row)
      const eye = this.toolButton(type, 'se-paint-eye', 'eye.svg', this.t(`color.hide_${type}`))
      eye.addEventListener('click', () => this.togglePaintVisible(type))
      const remove = this.toolButton(type, 'se-paint-remove se-paint-toggle', 'minus.svg', this.t(`color.remove_${type}`))
      remove.addEventListener('click', () => this.togglePaint(type))
      row.append(picker, eye, remove)
      Object.assign(toggles, { row, eye, remove })
    }
    this.refreshToggles()
  }

  /**
   * @param {"fill"|"stroke"} type
   * @param {string} className
   * @param {string} icon
   * @param {string} label
   * @returns {HTMLButtonElement}
   */
  toolButton (type, className, icon, label) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `se-paint-icon se-section-tool ${className}`
    button.dataset.paint = type
    button.setAttribute('aria-label', label)
    button.title = label
    button.innerHTML = this.icon(icon)
    return button
  }

  /**
   * Opens the window on the colour libraries of the fill or the stroke.
   * @param {"fill"|"stroke"} type
   * @returns {void}
   */
  openLibraries (type) {
    const picker = document.querySelector(`.se-inspector #${type}_color`)
    if (!picker) return
    if (!(this.opened && this.target === picker)) this.open(picker)
    this.selectTab('libraries')
  }

  /**
   * @param {"fill"|"stroke"} type
   * @returns {boolean} Whether the selection, or the next shape, has no paint
   */
  isNone (type) {
    const box = document.getElementById(`${type}_color`)?.paintBox
    return signatureOf(box?.paint, box?.mixed) === 'none'
  }

  /**
   * The shapes whose paint the eye hides: the selected ones, those of the
   * selected groups included.
   * @param {"fill"|"stroke"} type
   * @returns {Element[]}
   */
  paintedShapes (type) {
    const shapes = (this.editor.svgCanvas?.getSelectedElements() ?? []).filter(Boolean).flatMap((el) =>
      el.tagName === 'g' || el.tagName === 'a' ? [...el.querySelectorAll('*')] : [el])
    return shapes.filter((el) => PAINTED.has(el.tagName) && !(type === 'fill' && el.tagName === 'line'))
  }

  /**
   * @param {"fill"|"stroke"} type
   * @returns {boolean} Whether the eye hid the paint of every shape selected
   */
  isHidden (type) {
    const shapes = this.paintedShapes(type)
    return shapes.length > 0 && shapes.every((el) => this.editor.svgCanvas.isPaintHidden?.(el, type))
  }

  /** @returns {void} */
  refreshToggles () {
    for (const [type, toggles] of Object.entries(this.toggles ?? {})) {
      const none = this.isNone(type)
      toggles.add.hidden = !none
      const section = toggles.add.closest('.se-section')
      if (section) section.dataset.paintNone = String(none)
      if (!toggles.eye) continue
      const shapes = this.paintedShapes(type)
      const hidden = this.isHidden(type)
      toggles.eye.hidden = !shapes.length
      if (toggles.eye.dataset.hidden !== String(hidden)) {
        toggles.eye.dataset.hidden = String(hidden)
        const label = this.t(`color.${hidden ? 'show' : 'hide'}_${type}`)
        toggles.eye.setAttribute('aria-label', label)
        toggles.eye.title = label
        toggles.eye.setAttribute('aria-pressed', String(hidden))
        toggles.eye.innerHTML = this.icon(hidden ? 'eye_off.svg' : 'eye.svg')
      }
      toggles.row.classList.toggle('se-paint-hidden', hidden)
    }
  }

  /**
   * Removes the paint, or gives the colour of the options back.
   * @param {"fill"|"stroke"} type
   * @returns {void}
   */
  togglePaint (type) {
    const picker = document.getElementById(`${type}_color`)
    if (!picker?.commitPaint) return
    const { initFill, initStroke } = this.editor.configObj.curConfig
    const color = (type === 'fill' ? initFill : initStroke)?.color ?? '000000'
    const paint = this.isNone(type)
      ? new Paint({ solidColor: String(color).replace(/^#/, '').toLowerCase(), alpha: 100 })
      : new Paint({ solidColor: 'none' })
    picker.commitPaint(paint)
    if (this.target === picker) this.refresh()
    this.refreshToggles()
  }

  /**
   * Hides the paint of the selected shapes, or shows it again: the eye.
   * @param {"fill"|"stroke"} type
   * @returns {void}
   */
  togglePaintVisible (type) {
    const { svgCanvas } = this.editor
    if (!svgCanvas?.setPaintVisible) return
    svgCanvas.setPaintVisible(type, this.isHidden(type))
    this.editor.topPanel?.updateContextPanel?.()
    this.refreshToggles()
  }

  /**
   * Beside the panel when opened from the inspector, over the contextual bar
   * otherwise.
   * @returns {void}
   */
  place () {
    if (!this.opened || !this.target) return
    const panel = this.target.closest('#se-panel')
    const { x, y } = placePicker({
      anchor: this.target.getBoundingClientRect(),
      size: this.$popover.getBoundingClientRect(),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      panel: panel && !panel.hidden ? panel.getBoundingClientRect() : null
    })
    this.$popover.style.transform = `translate(${x}px, ${y}px)`
  }

  /**
   * The target's paint changed outside the window (undo, another selection):
   * the window shows it. Its own changes are not read back, so that the hue
   * of a grey, and the stop being edited, stay.
   * @returns {void}
   */
  refresh () {
    if (!this.opened || !this.target) return
    const box = this.target.paintBox
    if (signatureOf(box?.paint, box?.mixed) === this.signature) return
    this.read()
    this.renderSwatches()
  }

  /**
   * Reads the paint of the target.
   * @returns {void}
   */
  read () {
    const box = this.target?.paintBox
    const paint = box?.paint
    this.mixed = Boolean(box?.mixed)
    this.signature = signatureOf(paint, this.mixed)
    this.paintAlpha = Number.isFinite(Number(paint?.alpha)) ? Number(paint.alpha) : 100
    const grad = paint && (paint.type === 'linearGradient' || paint.type === 'radialGradient') ? paint[paint.type] : null
    if (grad && !this.mixed) {
      this.mode = 'gradient'
      this.gradType = paint.type
      this.grad = grad.cloneNode(true)
      this.stops = readStops(this.grad)
      if (!this.stops.length) this.stops = [{ offset: 0, color: '000000', opacity: 1 }, { offset: 1, color: 'ffffff', opacity: 1 }]
      this.activeStop = sortStops(this.stops)[0]
      this.setHsvOf(parseColor(this.activeStop.color), this.activeStop.opacity)
    } else {
      this.mode = 'solid'
      this.grad = null
      this.stops = []
      this.activeStop = null
      const color = paint?.type === 'solidColor' && paint.solidColor && paint.solidColor !== 'none'
        ? parseColor(paint.solidColor)
        : null
      this.none = !color
      this.setHsvOf(color ?? { r: 255, g: 255, b: 255 }, color ? this.paintAlpha / 100 : 1)
    }
    this.render()
  }

  /**
   * @param {{r: number, g: number, b: number}} rgb
   * @param {number} alpha 0–1
   * @returns {void}
   */
  setHsvOf (rgb, alpha) {
    const hsv = rgbToHsv(rgb)
    // A grey has no hue: the one shown stays.
    this.hsv = hsv.s === 0 ? { ...hsv, h: this.hsv.h } : hsv
    this.alpha = clamp(alpha, 0, 1)
  }

  /** @returns {{r: number, g: number, b: number}} */
  get rgb () {
    return hsvToRgb(this.hsv)
  }

  // ---------------------------------------------------------------------
  // Changes: preview while a control moves, then one change.
  // ---------------------------------------------------------------------

  /**
   * The colour being edited changed.
   * @param {boolean} commit Apply now (end of a gesture, a field, a swatch);
   *   otherwise preview
   * @returns {void}
   */
  changed (commit) {
    this.mixed = false
    this.none = false
    if (this.mode === 'gradient' && this.activeStop) {
      this.activeStop.color = toHex(this.rgb)
      this.activeStop.opacity = Math.round(this.alpha * 1000) / 1000
    }
    this.render()
    if (commit) this.commit()
    else this.preview()
  }

  /** @returns {object} The paint the window shows */
  paint () {
    if (this.mode === 'gradient') {
      const grad = makeGradient(document, this.gradType, this.stops, this.grad)
      return new Paint({ [this.gradType]: grad, alpha: this.paintAlpha })
    }
    return new Paint({ solidColor: toHex(this.rgb), alpha: Math.round(this.alpha * 100) })
  }

  /** @returns {void} */
  preview () {
    if (!this.target) return
    this.pending = true
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => {
      if (this.pending && this.target) this.target.previewPaint?.(this.paint())
    })
  }

  /** @returns {void} */
  commit () {
    cancelAnimationFrame(this.frame)
    this.pending = false
    if (!this.target) return
    const paint = this.paint()
    this.signature = signatureOf(paint)
    this.remember()
    this.target.commitPaint?.(paint)
    // The window keeps its own state; the target shows the paint applied.
    this.signature = signatureOf(this.target.paintBox?.paint, this.target.paintBox?.mixed)
    this.refreshToggles()
  }

  /**
   * A preview not followed by its change yet (the window closes during a
   * drag) is applied.
   * @returns {void}
   */
  commitPending () {
    if (this.pending) this.commit()
  }

  /**
   * Keeps the colour among the recent ones.
   * @returns {void}
   */
  remember () {
    const hex = toHex(this.rgb)
    const list = String(this.pref('recent_colors') ?? '').split(',').filter((c) => /^[0-9a-f]{6}$/.test(c))
    this.pref('recent_colors', pushRecent(list, hex).join(','))
    if (this.source === 'recent') this.renderSwatches()
  }

  /**
   * A colour chosen as a whole: a swatch, the eyedropper.
   * @param {{r: number, g: number, b: number}} rgb
   * @param {number} alpha
   * @param {boolean} commit
   * @returns {void}
   */
  setRgb (rgb, alpha, commit) {
    this.setHsvOf(rgb, alpha)
    this.changed(commit)
  }

  // ---------------------------------------------------------------------
  // Solid or gradient.
  // ---------------------------------------------------------------------

  /**
   * @param {"solid"|"gradient"} mode
   * @returns {void}
   */
  setMode (mode) {
    if (mode === this.mode || (mode === 'gradient' && this.solidOnly)) return
    if (mode === 'gradient') {
      // From the colour: opaque to transparent, left to right.
      const color = toHex(this.rgb)
      this.stops = [{ offset: 0, color, opacity: this.alpha }, { offset: 1, color, opacity: 0 }]
      this.activeStop = this.stops[0]
      this.gradType = this.gradType || 'linearGradient'
      this.grad = makeGradient(document, this.gradType, this.stops)
      this.paintAlpha = 100
    } else {
      const stop = this.activeStop ?? this.stops[0]
      if (stop) this.setHsvOf(parseColor(stop.color), stop.opacity)
      this.grad = null
      this.stops = []
      this.activeStop = null
    }
    this.mode = mode
    this.changed(true)
    this.place()
  }

  /**
   * @param {"linearGradient"|"radialGradient"} type
   * @returns {void}
   */
  setGradientType (type) {
    if (type === this.gradType || !this.grad) return
    this.grad = makeGradient(document, type, this.stops, this.grad)
    this.gradType = type
    this.changed(true)
  }

  /**
   * @param {string|number} value Degrees
   * @returns {void}
   */
  setGradientAngle (value) {
    const deg = Number.parseFloat(value)
    if (!this.grad || this.gradType !== 'linearGradient' || !Number.isFinite(deg)) {
      this.render()
      return
    }
    setAngle(this.grad, ((Math.round(deg) % 360) + 360) % 360)
    this.changed(true)
  }

  /**
   * @param {object} stop
   * @param {boolean} [focus]
   * @returns {void}
   */
  selectStop (stop, focus = false) {
    if (!stop) return
    this.activeStop = stop
    this.setHsvOf(parseColor(stop.color), stop.opacity)
    this.render()
    if (focus) this.$bar.querySelector(`[data-stop="${this.stops.indexOf(stop)}"]`)?.focus()
  }

  /**
   * Adds a stop: at an offset of the bar, else in the widest gap.
   * @param {number} [offset] 0–1
   * @returns {void}
   */
  addStop (offset) {
    if (offset === undefined) {
      const sorted = sortStops(this.stops)
      let best = 0.5
      let width = -1
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].offset - sorted[i - 1].offset
        if (gap > width) {
          width = gap
          best = (sorted[i].offset + sorted[i - 1].offset) / 2
        }
      }
      offset = best
    }
    const { color, opacity } = colorAt(this.stops, offset)
    const stop = { offset: Math.round(offset * 1000) / 1000, color, opacity }
    this.stops.push(stop)
    this.selectStop(stop)
    this.changed(true)
  }

  /**
   * @param {object} stop
   * @returns {void}
   */
  removeStop (stop) {
    if (this.stops.length <= 2 || !stop) return
    this.stops = this.stops.filter((s) => s !== stop)
    if (this.activeStop === stop) this.selectStop(sortStops(this.stops)[0])
    this.changed(true)
  }

  /**
   * A field of a stop of the list.
   * @param {object} stop
   * @param {HTMLInputElement} field
   * @returns {void}
   */
  stopFieldChanged (stop, field) {
    if (!stop) return
    const value = field.value
    if (field.dataset.field === 'offset') {
      const n = Number.parseFloat(value)
      if (Number.isFinite(n)) stop.offset = clamp(n, 0, 100) / 100
    } else if (field.dataset.field === 'color') {
      const color = parseColor(value)
      if (color) stop.color = toHex(color)
    } else if (field.dataset.field === 'opacity') {
      const n = Number.parseFloat(value)
      if (Number.isFinite(n)) stop.opacity = clamp(n, 0, 100) / 100
    }
    if (stop === this.activeStop) this.setHsvOf(parseColor(stop.color), stop.opacity)
    this.render()
    this.commit()
  }

  /**
   * A press on the bar: on a stop, selects and drags it; elsewhere, adds one.
   * @param {PointerEvent} e
   * @returns {void}
   */
  barPointerDown (e) {
    if (e.button !== 0) return
    const rect = this.$bar.getBoundingClientRect()
    const offsetAt = (ev) => clamp((ev.clientX - rect.left) / rect.width, 0, 1)
    const handle = e.target.closest('[data-stop]')
    if (!handle) {
      e.preventDefault()
      this.addStop(offsetAt(e))
      return
    }
    e.preventDefault()
    const stop = this.stops[Number(handle.dataset.stop)]
    this.selectStop(stop)
    handle.focus()
    handle.setPointerCapture?.(e.pointerId)
    let moved = false
    const move = (ev) => {
      moved = true
      stop.offset = Math.round(offsetAt(ev) * 1000) / 1000
      this.render()
      this.preview()
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      if (moved) this.commit()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  // ---------------------------------------------------------------------
  // Controls.
  // ---------------------------------------------------------------------

  /**
   * Drags on a control: a preview at each move, a change at the end.
   * @param {HTMLElement} el
   * @param {(x: number, y: number) => void} set Position in 0–1
   * @returns {void}
   */
  track (el, set) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      el.focus({ preventScroll: true })
      el.setPointerCapture?.(e.pointerId)
      const rect = el.getBoundingClientRect()
      const move = (ev) => {
        set(clamp((ev.clientX - rect.left) / rect.width, 0, 1), clamp((ev.clientY - rect.top) / rect.height, 0, 1))
        this.changed(false)
      }
      const up = () => {
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
        this.commit()
      }
      move(e)
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    })
  }

  /**
   * The arrows move a control by 1, with Shift by 10; Home and End go to its
   * ends. Previewed while the key is down, applied when it goes up.
   * @param {HTMLElement} el
   * @param {(dx: number, dy: number, end?: number) => void} step
   * @returns {void}
   */
  keys (el, step) {
    el.addEventListener('keydown', (e) => {
      const n = e.shiftKey ? 10 : 1
      const moves = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }
      if (moves[e.key]) step(...moves[e.key])
      else if (e.key === 'Home') step(0, 0, 0)
      else if (e.key === 'End') step(0, 0, 1)
      else return
      e.preventDefault()
      this.keyed = true
      this.changed(false)
    })
    el.addEventListener('keyup', () => {
      if (!this.keyed) return
      this.keyed = false
      this.commit()
    })
    el.addEventListener('blur', () => this.commitPending())
  }

  /**
   * The arrows of a number field change it by 1, with Shift by 10.
   * @param {KeyboardEvent} e
   * @param {HTMLInputElement} field
   * @param {() => void} apply
   * @param {number} min
   * @param {number} max
   * @param {boolean} [wrap] Values go round (an angle)
   * @returns {void}
   */
  stepField (e, field, apply, min, max, wrap = false) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const value = Number.parseFloat(field.value)
    if (!Number.isFinite(value)) return
    e.preventDefault()
    let next = value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
    next = wrap ? ((next % (max + 1)) + max + 1) % (max + 1) : clamp(next, min, max)
    field.value = String(next)
    apply()
  }

  /**
   * The arrows go from swatch to swatch.
   * @param {KeyboardEvent} e
   * @param {HTMLElement} container
   * @returns {void}
   */
  roveSwatches (e, container) {
    const items = [...container.querySelectorAll('[data-color]')]
    const index = items.indexOf(e.target)
    if (index < 0) return
    const rowOf = (el) => el.offsetTop
    const perRow = Math.max(1, items.filter((el) => rowOf(el) === rowOf(items[0])).length)
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow, Home: -index, End: items.length - 1 - index }
    if (!(e.key in moves)) return
    e.preventDefault()
    const next = items[clamp(index + moves[e.key], 0, items.length - 1)]
    for (const item of items) item.tabIndex = item === next ? 0 : -1
    next.focus()
  }

  /**
   * @param {"custom"|"libraries"} name
   * @param {boolean} [focus]
   * @returns {void}
   */
  selectTab (name, focus = false) {
    for (const tab of this.$popover.querySelectorAll('[role="tab"]')) {
      const selected = tab.id.endsWith(name)
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      if (selected && focus) tab.focus()
    }
    this.$custom.hidden = name !== 'custom'
    this.$libraries.hidden = name !== 'libraries'
    this.place()
  }

  // ---------------------------------------------------------------------
  // Eyedropper.
  // ---------------------------------------------------------------------

  /**
   * Takes a colour from the screen (EyeDropper, where the browser has it),
   * else from an object of the drawing.
   * @returns {Promise<void>}
   */
  async pickColor () {
    if (this.picking) {
      this.stopPicking()
      return
    }
    if (typeof window.EyeDropper === 'function') {
      try {
        const { sRGBHex } = await new window.EyeDropper().open()
        const color = parseColor(sRGBHex)
        if (color) this.setRgb(color, 1, true)
      } catch (err) {
        // Cancelled with Escape.
      }
      return
    }
    this.startPicking()
  }

  /**
   * Picking on the drawing: the next press on an object gives its colour,
   * without selecting it; Escape or a press elsewhere stops.
   * @returns {void}
   */
  startPicking () {
    this.picking = true
    this.$popover.keepOpen = true
    this.$eyedropper.setAttribute('aria-pressed', 'true')
    this.$hint.hidden = false
    this.editor.workarea?.classList.add('se-paint-picking')
    this.onPick = (e) => {
      if (this.$popover.contains(e.target)) return
      const content = this.editor.svgCanvas.getSvgContent()
      const el = e.target
      if (content.contains(el) && el !== content) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const style = getComputedStyle(el)
        const other = this.type === 'fill' ? 'stroke' : 'fill'
        const color = parseColor(style[this.type]) ?? parseColor(style[other])
        if (color) this.setRgb(color, 1, true)
      }
      this.stopPicking()
    }
    this.onPickKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      this.stopPicking()
    }
    document.addEventListener('pointerdown', this.onPick, true)
    document.addEventListener('keydown', this.onPickKey, true)
    this.place()
  }

  /** @returns {void} */
  stopPicking () {
    if (!this.picking) return
    this.picking = false
    document.removeEventListener('pointerdown', this.onPick, true)
    document.removeEventListener('keydown', this.onPickKey, true)
    // The click that follows the press must not reach the drawing either.
    const swallow = (e) => {
      const content = this.editor.svgCanvas.getSvgContent()
      if (content.contains(e.target)) e.stopImmediatePropagation()
    }
    for (const type of ['mousedown', 'mouseup', 'click']) {
      document.addEventListener(type, swallow, true)
      setTimeout(() => document.removeEventListener(type, swallow, true), 0)
    }
    this.$popover.keepOpen = false
    this.$eyedropper.setAttribute('aria-pressed', 'false')
    this.$hint.hidden = true
    this.editor.workarea?.classList.remove('se-paint-picking')
  }

  // ---------------------------------------------------------------------
  // Rendering.
  // ---------------------------------------------------------------------

  /** @returns {void} */
  buildChannels () {
    const names = this.format === 'hex' ? ['hex'] : this.format === 'rgb' ? ['r', 'g', 'b'] : ['h', 's', 'l']
    this.$channels.className = `se-paint-channels se-paint-channels-${names.length}`
    this.$channels.innerHTML = names.map((name, i) => `
      <label class="se-paint-field">
        <input data-channel="${i}" inputmode="${name === 'hex' ? 'text' : 'numeric'}" autocomplete="off" spellcheck="false"
          aria-label="${escapeHtml(this.t(`color.channel_${name}`))}">
      </label>`).join('')
    for (const input of this.$channels.querySelectorAll('input')) {
      input.addEventListener('change', () => this.channelsChanged())
      if (this.format !== 'hex') {
        const max = this.format === 'rgb' ? 255 : Number(input.dataset.channel) === 0 ? 359 : 100
        input.addEventListener('keydown', (e) => this.stepField(e, input, () => this.channelsChanged(), 0, max, max === 359))
      }
    }
  }

  /** @returns {void} */
  channelsChanged () {
    const values = [...this.$channels.querySelectorAll('input')].map((input) => input.value)
    const color = colorOfChannels(values, this.format)
    if (!color) {
      this.renderValues()
      return
    }
    this.setHsvOf(color, color.a ?? this.alpha)
    this.changed(true)
  }

  /** @returns {void} */
  render () {
    const gradient = this.mode === 'gradient'
    for (const button of this.$segments.querySelectorAll('[data-mode]')) {
      const checked = button.dataset.mode === this.mode
      button.setAttribute('aria-checked', String(checked))
      button.tabIndex = checked ? 0 : -1
    }
    this.$gradient.hidden = !gradient
    if (gradient) this.renderGradient()
    const rgb = this.rgb
    const hue = hsvToRgb({ h: this.hsv.h, s: 100, v: 100 })
    this.$area.style.setProperty('--se-paint-hue', cssColor(hue))
    this.$area.style.setProperty('--se-paint-color', cssColor(rgb))
    const areaThumb = this.$area.firstElementChild
    areaThumb.style.left = `${this.hsv.s}%`
    areaThumb.style.top = `${100 - this.hsv.v}%`
    this.$area.setAttribute('aria-valuenow', String(Math.round(this.hsv.s)))
    this.$area.setAttribute('aria-valuetext', this.t('color.area_value', { s: Math.round(this.hsv.s), v: Math.round(this.hsv.v) }))
    this.$hue.firstElementChild.style.left = `${(this.hsv.h / 360) * 100}%`
    this.$hue.firstElementChild.style.setProperty('--se-paint-color', cssColor(hue))
    this.$hue.setAttribute('aria-valuenow', String(Math.round(this.hsv.h)))
    this.$alpha.style.setProperty('--se-paint-opaque', cssColor(rgb))
    this.$alpha.firstElementChild.style.left = `${this.alpha * 100}%`
    this.$alpha.firstElementChild.style.setProperty('--se-paint-color', cssColor(rgb, this.alpha))
    this.$alpha.setAttribute('aria-valuenow', String(Math.round(this.alpha * 100)))
    this.$alpha.setAttribute('aria-valuetext', `${Math.round(this.alpha * 100)} %`)
    this.renderValues()
  }

  /** @returns {void} */
  renderValues () {
    const inputs = [...this.$channels.querySelectorAll('input')]
    const mixed = this.mixed
    const values = channelsOf(this.rgb, this.format)
    inputs.forEach((input, i) => {
      input.value = mixed ? '' : String(values[i])
      input.placeholder = mixed ? this.t('properties.mixed') : ''
    })
    this.$opacity.value = mixed ? '' : String(Math.round(this.alpha * 100))
    this.$opacity.placeholder = mixed ? this.t('properties.mixed') : ''
  }

  /** @returns {void} */
  renderGradient () {
    this.$style.value = this.gradType
    const linear = this.gradType === 'linearGradient'
    const angle = linear ? angleOfLine(lineOf(this.grad)) : 0
    this.$angle.closest('label').hidden = !linear
    if (document.activeElement !== this.$angle) this.$angle.value = String(angle)
    this.$barFill.style.background = cssGradient(this.stops)
    // Handles on the bar, in the order of the stops; kept while one is
    // dragged, so that it keeps the pointer.
    let handles = [...this.$bar.querySelectorAll('.se-paint-handle')]
    if (handles.length !== this.stops.length) {
      const focused = document.activeElement?.closest?.('.se-paint-handle')?.dataset.stop
      for (const el of handles) el.remove()
      this.$bar.insertAdjacentHTML('beforeend', this.stops.map((stop, i) =>
        `<button type="button" class="se-paint-handle" data-stop="${i}" role="slider" aria-valuemin="0" aria-valuemax="100"></button>`).join(''))
      handles = [...this.$bar.querySelectorAll('.se-paint-handle')]
      if (focused !== undefined) handles[Number(focused)]?.focus({ preventScroll: true })
    }
    this.stops.forEach((stop, i) => {
      const handle = handles[i]
      const offset = Math.round(stop.offset * 100)
      handle.setAttribute('aria-label', this.t('color.stop', { offset }))
      handle.setAttribute('aria-valuenow', String(offset))
      handle.setAttribute('aria-current', String(stop === this.activeStop))
      handle.tabIndex = stop === this.activeStop ? 0 : -1
      handle.style.left = `${stop.offset * 100}%`
      handle.style.setProperty('--se-paint-color', cssColor(parseColor(stop.color), stop.opacity))
    })
    // The list, by offset; not rebuilt under a field being typed in.
    if (document.activeElement?.closest?.('.se-paint-stops')) {
      for (const row of this.$stops.querySelectorAll('[data-stop]')) {
        const stop = this.stops[Number(row.dataset.stop)]
        row.setAttribute('aria-current', String(stop === this.activeStop))
        row.querySelector('.se-paint-chip')?.style.setProperty('--se-paint-color', cssColor(parseColor(stop.color), stop.opacity))
      }
      return
    }
    const removable = this.stops.length > 2
    this.$stops.innerHTML = sortStops(this.stops).map((stop) => {
      const i = this.stops.indexOf(stop)
      const hex = stop.color.toUpperCase()
      return `<li class="se-paint-stop" data-stop="${i}" aria-current="${stop === this.activeStop}">
        <label class="se-paint-field se-paint-percent"><input data-field="offset" inputmode="numeric" value="${Math.round(stop.offset * 100)}"
          aria-label="${escapeHtml(this.t('color.stop_offset'))}"><span aria-hidden="true">%</span></label>
        <span class="se-paint-field se-paint-stop-color">
          <button type="button" class="se-paint-chip" style="--se-paint-color: ${cssColor(parseColor(stop.color), stop.opacity)}"
            aria-label="${escapeHtml(this.t('color.edit_stop', { color: hex }))}"></button>
          <input data-field="color" value="${hex}" spellcheck="false" aria-label="${escapeHtml(this.t('color.channel_hex'))}">
        </span>
        <label class="se-paint-field se-paint-percent"><input data-field="opacity" inputmode="numeric" value="${Math.round(stop.opacity * 100)}"
          aria-label="${escapeHtml(this.t('color.opacity'))}"><span aria-hidden="true">%</span></label>
        <button type="button" class="se-paint-icon se-paint-remove" aria-label="${escapeHtml(this.t('color.remove_stop'))}"
          title="${escapeHtml(this.t('color.remove_stop'))}" ${removable ? '' : 'disabled'}>${this.icon('minus.svg')}</button>
      </li>`
    }).join('')
  }

  /**
   * Keys of a stop of the bar: the arrows move it, Delete removes it.
   * @param {KeyboardEvent} e
   * @param {object} stop
   * @returns {void}
   */
  handleKey (e, stop) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      this.removeStop(stop)
      this.$bar.querySelector('.se-paint-handle[tabindex="0"]')?.focus()
      return
    }
    const n = (e.shiftKey ? 10 : 1) / 100
    const delta = { ArrowLeft: -n, ArrowDown: -n, ArrowRight: n, ArrowUp: n }[e.key]
    if (delta === undefined) return
    e.preventDefault()
    stop.offset = Math.round(clamp(stop.offset + delta, 0, 1) * 1000) / 1000
    this.selectStop(stop)
    this.keyed = true
    this.preview()
  }

  /** @returns {void} */
  renderSwatches () {
    const colors = this.source === 'recent'
      ? String(this.pref('recent_colors') ?? '').split(',').filter((c) => /^[0-9a-f]{6}$/.test(c))
      : documentColors(this.editor.svgCanvas.getSvgContent())
    if (!colors.length) {
      this.$swatches.innerHTML = `<p class="se-paint-empty">${escapeHtml(this.t(this.source === 'recent' ? 'color.empty_recent' : 'color.empty_document'))}</p>`
      return
    }
    this.$swatches.innerHTML = colors.map((hex, i) => this.swatch(hex, `#${hex.toUpperCase()}`, i === 0)).join('')
  }

  /**
   * @param {string} value A colour
   * @param {string} label
   * @param {boolean} first Reached with Tab
   * @returns {string}
   */
  swatch (value, label, first) {
    const color = parseColor(value)
    const css = color ? cssColor(color) : ''
    return `<button type="button" class="se-swatch" data-color="${escapeHtml(value)}" style="--se-paint-color: ${css}"
      title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" tabindex="${first ? 0 : -1}"></button>`
  }

  /** @returns {void} */
  renderLibrary () {
    const library = this.libraries[Number(this.$library.value) || 0]
    const groups = searchLibrary(library, this.$search.value, (key) => this.t(key))
    if (!groups.length) {
      this.$groups.innerHTML = `<p class="se-paint-empty">${escapeHtml(this.t('color.no_match'))}</p>`
      return
    }
    let first = true
    const list = this.libraryView === 'list'
    this.$groups.innerHTML = groups.map((group) => {
      const items = group.colors.map((color) => {
        const hex = String(parseColor(color.value) ? `#${toHex(parseColor(color.value)).toUpperCase()}` : color.value)
        const tab = first ? 0 : -1
        first = false
        if (!list) return this.swatch(color.value, `${color.label} · ${hex}`, tab === 0)
        return `<button type="button" class="se-swatch-row" data-color="${escapeHtml(color.value)}" tabindex="${tab}"
          aria-label="${escapeHtml(`${color.label} · ${hex}`)}">
          <span class="se-swatch" aria-hidden="true" style="--se-paint-color: ${cssColor(parseColor(color.value) ?? { r: 0, g: 0, b: 0 })}"></span>
          <span class="se-swatch-name">${escapeHtml(color.label)}</span>
          <span class="se-swatch-hex">${escapeHtml(hex)}</span>
        </button>`
      }).join('')
      return `<section class="se-paint-group">
        <h4 class="se-paint-group-name">${escapeHtml(group.name)}</h4>
        <div class="${list ? 'se-paint-list' : 'se-paint-swatches'}">${items}</div>
      </section>`
    }).join('')
  }
}
