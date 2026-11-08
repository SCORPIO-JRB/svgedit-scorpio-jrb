/**
 * Properties tab of the right panel, in the canvas layout (lot V3; plan v2,
 * section 4.5): one inspector, with sections at fixed places.
 *
 * Order: actions on the selection, Geometry, Appearance, Fill, Stroke,
 * Text, Effects, Identity, Extensions, Frame, Document, Frames. A section
 * where nothing applies is hidden and the others keep their order. Without
 * selection the tab describes the document and lists its frames to export;
 * Fill and Stroke then give the style of the next objects drawn, as they
 * always did in SVG-Edit. A frame selected (lot V5) shows its own section
 * alone; the frames module fills both.
 *
 * The groups of fields are those of TopPanel and BottomPanel, with their ids
 * and classes: TopPanel.js still shows and hides them and fills their values,
 * and the extensions that add a panel to #tools_top (markers, polystar) find
 * it, here, in its section. The fields look as in the mockups: grey boxes
 * with their label inside, two per row.
 *
 * The verbs (clone, delete, order, flip, group, align…) are in the "…" menu
 * of the head of the tab, each with its name and shortcut, until V4 moves
 * them into the contextual bar. The menu stays inside #tools_top, where
 * TopPanel finds them.
 * @module Inspector
 */
import SvgCanvas from '@svgedit/svgcanvas'
import { escapeHtml } from './TopBar.js'

const { isValidUnit } = SvgCanvas

export const SECTIONS = ['actions', 'geometry', 'appearance', 'fill', 'stroke', 'text', 'effects', 'identity', 'extensions', 'frame', 'document', 'frames']

/** Order of the geometry groups: position, size, then angle. */
const GEOMETRY_ORDER = {
  path_node_panel: 0,
  xy_panel: 10,
  wh_panel: 20,
  rect_panel: 30,
  image_panel: 30,
  circle_panel: 30,
  ellipse_panel: 30,
  line_panel: 30,
  star_panel: 40,
  polygon_panel: 40,
  angle_panel: 50,
  scale_panel: 60
}

/** Panels of the extensions, and their section. */
const EXTENSION_PANELS = {
  marker_panel: 'stroke',
  star_panel: 'geometry',
  polygon_panel: 'geometry'
}

/** Controls of BottomPanel, and their section. */
const BOTTOM_CONTROLS = {
  fill_color: 'fill',
  palette: 'fill',
  stroke_color: 'stroke',
  stroke_width: 'stroke',
  stroke_style: 'stroke',
  stroke_linejoin: 'stroke',
  stroke_linecap: 'stroke',
  opacity: 'appearance'
}

/**
 * The section of a group of TopPanel.
 * @param {Element} el A child of #tools_top
 * @returns {string|null} A section, a zone ("editorPanel", "historyPanel",
 *   "contextPanel"), or null when it has no place in this layout
 */
export const sectionOfTopGroup = (el) => {
  const has = (selector) => Boolean(el.querySelector?.(selector))
  const is = (name) => el.classList?.contains(name)
  switch (el.id) {
    case 'title_panel': return null
    case 'editor_panel': return 'editorPanel'
    case 'history_panel': return 'historyPanel'
    case 'cur_context_panel': return 'contextPanel'
    // The hidden field that receives the typed text: in the canvas, so that
    // it can take the focus whichever tab is open.
    case 'text': return 'contextPanel'
  }
  if (el.id in EXTENSION_PANELS) return EXTENSION_PANELS[el.id]
  if (is('selected_panel')) {
    if (has('#elem_id') || has('#elem_class')) return 'identity'
    if (has('#blur')) return 'effects'
    return 'actions'
  }
  if (is('multiselected_panel') || is('use_panel') || is('g_panel')) return 'actions'
  if (is('image_panel')) return has('#image_url') ? 'identity' : 'geometry'
  if (Object.keys(GEOMETRY_ORDER).some(is)) return 'geometry'
  if (is('text_panel')) return 'text'
  if (is('container_panel') || is('a_panel')) return 'identity'
  return 'extensions'
}

const orderOf = (el) => {
  for (const [name, order] of Object.entries(GEOMETRY_ORDER)) {
    if (el.classList?.contains(name) || el.id === name) return order
  }
  return 100
}

/**
 * Whether a group of fields is shown: TopPanel hides a group with
 * `display: none`, an extension may use `hidden`.
 * @param {Element} el
 * @returns {boolean}
 */
export const isShown = (el) => !el.hidden && el.style?.display !== 'none' && !el.classList?.contains('se-inspector-off')

/** Names of the types of element, for the head of the tab. */
const TYPE_KEYS = {
  rect: 'type_rect',
  circle: 'type_circle',
  ellipse: 'type_ellipse',
  line: 'type_line',
  polyline: 'type_polyline',
  polygon: 'type_polygon',
  path: 'type_path',
  text: 'type_text',
  g: 'type_group',
  use: 'type_use',
  image: 'type_image',
  foreignObject: 'type_foreign',
  a: 'type_link'
}

export class Inspector {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} tab The Properties tab
   */
  constructor (editor, tab) {
    this.editor = editor
    this.tab = tab
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const imgPath = escapeHtml(editor.configObj.curConfig.imgPath)
    const section = (name) => name === 'actions'
      ? `<se-popover id="se-actions-menu" placement="bottom-end" role="dialog" aria-label="${t('layout.actions')}">
          <div class="se-section se-actions" data-section="actions"><div class="se-section-body"></div></div>
        </se-popover>`
      : `<section class="se-section" data-section="${name}" aria-labelledby="se-section-${name}">
          <h3 id="se-section-${name}" class="se-section-title">${t(`layout.section_${name}`)}</h3>
          <div class="se-section-body"></div>
        </section>`
    tab.innerHTML = `
      <div class="se-inspector-head">
        <span class="se-inspector-type"></span>
        <span class="se-inspector-id"></span>
        <button type="button" id="se-actions-button" class="se-icon-button" hidden aria-haspopup="dialog"
          aria-expanded="false" aria-controls="se-actions-menu" aria-label="${t('layout.actions')}"
          ><se-icon src="${imgPath}/more_horiz.svg"></se-icon></button>
      </div>
      <div id="tools_top" class="se-inspector">${SECTIONS.map(section).join('')}</div>`
    this.root = tab.querySelector('#tools_top')
    this.initActions()
    this.buildDocumentSection()
    // The panels that extensions append to #tools_top go to their section,
    // and a section shows as soon as one of its groups does, whoever shows
    // it (TopPanel, or an extension such as polystar when its tool is chosen).
    this.observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' && record.target === this.root)) this.place()
      if (records.some((record) => record.type === 'attributes')) this.refreshSections()
    })
    this.observer.observe(this.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] })
  }

  /**
   * The "…" menu of the head: the verbs on the selection.
   * @returns {void}
   */
  initActions () {
    this.$actionsButton = this.tab.querySelector('#se-actions-button')
    this.$actionsMenu = this.tab.querySelector('#se-actions-menu')
    const button = this.$actionsButton
    const menu = this.$actionsMenu
    button.addEventListener('click', () => {
      if (menu.opened) menu.close()
      else menu.open(button)
    })
    menu.addEventListener('se-popover-open', () => button.setAttribute('aria-expanded', 'true'))
    menu.addEventListener('se-popover-close', () => button.setAttribute('aria-expanded', 'false'))
    // The alignment panel opens inside the menu, which grows: it is placed
    // again, so as to stay in the window.
    new MutationObserver(() => {
      if (menu.opened) requestAnimationFrame(() => menu.position())
    }).observe(menu, { subtree: true, attributes: true, attributeFilter: ['hidden'] })
    // A verb closes the menu; the alignment keeps it open, with its own
    // panel of buttons and fields.
    menu.addEventListener('click', (e) => {
      const verb = e.target.closest?.('se-button')
      if (!verb || verb.id === 'tool_align_menu' || verb.closest('#tool_align_popup')) return
      queueMicrotask(() => menu.close({ restoreFocus: true }))
    })
  }

  /**
   * The buttons of a group of verbs show their name and shortcut, as the
   * entries of a menu; the buttons of the alignment panel stay icons.
   * @param {Element} el
   * @returns {void}
   */
  labelVerbs (el) {
    const buttons = [...el.querySelectorAll('se-button')].filter((button) => !button.closest('#tool_align_popup'))
    for (const button of buttons) button.setAttribute('labelled', '')
  }

  /**
   * @param {string} name
   * @returns {HTMLElement}
   */
  body (name) {
    return this.root.querySelector(`[data-section="${name}"] > .se-section-body`)
  }

  /**
   * Puts a group in a section; geometry keeps position, size and angle in
   * this order.
   * @param {Element} el
   * @param {string} name
   * @returns {void}
   */
  put (el, name) {
    const body = this.body(name)
    if (name === 'actions') this.labelVerbs(el)
    if (name === 'geometry') {
      const order = orderOf(el)
      const next = [...body.children].find((child) => child !== el && orderOf(child) > order)
      if (next) {
        body.insertBefore(el, next)
        return
      }
    }
    body.append(el)
  }

  /**
   * The groups of TopPanel, before they enter the page.
   * @param {DocumentFragment} fragment
   * @param {object} zones
   * @param {(el: HTMLElement) => void} zones.editorPanel
   * @param {(el: HTMLElement) => void} zones.historyPanel
   * @param {(el: HTMLElement) => void} zones.contextPanel
   * @returns {void}
   */
  attachTop (fragment, zones) {
    const top = fragment.querySelector('#tools_top')
    for (const el of [...top.children]) {
      // Align to the page goes with the verbs, the blur with the effects.
      if (el.querySelector?.('#blur') && el.querySelector('#tool_position')) {
        const wrapper = document.createElement('div')
        wrapper.className = el.className
        const position = el.querySelector('#tool_position')
        // In the menu of verbs, the list says what it does.
        position.setAttribute('label', 'tools.align_to_page')
        wrapper.append(position)
        this.put(wrapper, 'actions')
      }
      const section = sectionOfTopGroup(el)
      if (!section) continue
      if (section in zones) zones[section](el)
      else this.put(el, section)
    }
  }

  /**
   * The controls of BottomPanel, before they enter the page. The zoom field
   * gives way to the zoom menu of the view group.
   * @param {DocumentFragment} fragment
   * @returns {void}
   */
  attachBottom (fragment) {
    const bottom = fragment.querySelector('#tools_bottom')
    for (const el of [...bottom.children]) {
      const section = BOTTOM_CONTROLS[el.id]
      if (section) this.put(el, section)
      // Fill and stroke: the colour and its opacity are typed in the field,
      // the swatch opens the colour window.
      if (el.localName === 'se-colorpicker') el.setAttribute('editable', '')
    }
    // The width of the stroke has no label in the bottom bar; here it has a
    // field of its own, named as in the mockups.
    this.root.querySelector('#stroke_width')?.setAttribute('label', 'layout.stroke_width')
  }

  /**
   * Panels added to #tools_top after start (extensions).
   * @returns {void}
   */
  place () {
    for (const el of [...this.root.children]) {
      if (el.classList.contains('se-section') || el === this.$actionsMenu) continue
      const section = sectionOfTopGroup(el)
      this.put(el, section && this.body(section) ? section : 'extensions')
    }
  }

  /**
   * Document fields, shown without selection: title, size, grid and
   * snapping; the rest stays in the document properties and preferences.
   * @returns {void}
   */
  buildDocumentSection () {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const body = this.body('document')
    body.innerHTML = `
      <label class="se-field se-field-wide">${t('layout.doc_title')}<input type="text" id="se-doc-title"></label>
      <label class="se-field se-field-short">${t('properties.w_label')}<input type="text" id="se-doc-width" inputmode="decimal" size="5"></label>
      <label class="se-field se-field-short">${t('properties.h_label')}<input type="text" id="se-doc-height" inputmode="decimal" size="5"></label>
      <label class="se-check"><input type="checkbox" id="se-doc-grid">${t('layout.grid')}</label>
      <label class="se-check"><input type="checkbox" id="se-doc-gridsnap">${t('layout.grid_snapping')}</label>
      <label class="se-check"><input type="checkbox" id="se-doc-objectsnap">${t('layout.object_snapping')}</label>
      <div class="se-section-links">
        <button type="button" class="se-link-button" data-target="tool_docprops">${t('tools.docprops')}…</button>
        <button type="button" class="se-link-button" data-target="tool_editor_prefs">${t('config.editor_prefs')}…</button>
      </div>`
    const field = (id) => body.querySelector(`#${id}`)
    field('se-doc-title').addEventListener('change', (e) => {
      editor.svgCanvas.setDocumentTitle(e.target.value)
      editor.topPanel.updateTitle?.(e.target.value || undefined)
    })
    const resize = () => {
      const w = field('se-doc-width').value.trim()
      const h = field('se-doc-height').value.trim()
      if (!isValidUnit('width', w) || !isValidUnit('height', h) || !editor.svgCanvas.setResolution(w, h)) {
        editor.toast(editor.i18next.t('notification.invalidAttrValGiven'), { type: 'error' })
        this.refreshDocument()
        return
      }
      editor.updateCanvas()
      this.refreshDocument()
    }
    field('se-doc-width').addEventListener('change', resize)
    field('se-doc-height').addEventListener('change', resize)
    field('se-doc-grid').addEventListener('change', (e) => editor.grid?.setVisible(e.target.checked))
    const snapping = (key) => (e) => editor.setConfig({ [key]: e.target.checked })
    field('se-doc-gridsnap').addEventListener('change', snapping('gridSnapping'))
    field('se-doc-objectsnap').addEventListener('change', snapping('objectSnapping'))
    body.addEventListener('click', (e) => {
      const target = e.target.closest('[data-target]')?.dataset.target
      if (target) editor.$container.querySelector(`#${target}`)?.click()
    })
    editor.$container.addEventListener('se-gridchange', () => this.refreshDocument())
  }

  /**
   * @returns {void}
   */
  refreshDocument () {
    const { editor } = this
    const { svgCanvas } = editor
    if (!svgCanvas) return
    const body = this.body('document')
    const set = (id, value) => {
      const input = body.querySelector(`#${id}`)
      if (input && document.activeElement !== input) input.value = value
    }
    const res = svgCanvas.getResolution()
    set('se-doc-title', svgCanvas.getDocumentTitle() ?? '')
    set('se-doc-width', String(Math.round(res.w * 100) / 100))
    set('se-doc-height', String(Math.round(res.h * 100) / 100))
    const { curConfig } = editor.configObj
    body.querySelector('#se-doc-grid').checked = Boolean(editor.grid?.visible)
    body.querySelector('#se-doc-gridsnap').checked = Boolean(curConfig.gridSnapping)
    body.querySelector('#se-doc-objectsnap').checked = curConfig.objectSnapping !== false
  }

  /**
   * Sections and head of the tab, after TopPanel has shown and hidden its
   * groups.
   * @returns {void}
   */
  /**
   * Shows the sections where something applies, hides the others.
   * @returns {boolean} Whether nothing is selected
   */
  refreshSections () {
    const selected = this.editor.svgCanvas?.getSelectedElements().filter(Boolean) ?? []
    const none = selected.length === 0
    const frame = none && Boolean(this.editor.frames?.selected)
    for (const section of this.root.querySelectorAll('.se-section')) {
      const name = section.dataset.section
      let shown
      if (frame) shown = name === 'frame'
      else if (name === 'frame') shown = false
      else if (name === 'document' || name === 'frames') shown = none && Boolean(section.querySelector('.se-section-body').children.length)
      else if (['fill', 'stroke', 'appearance'].includes(name)) shown = true
      else shown = [...section.querySelector('.se-section-body').children].some(isShown)
      if (name === 'actions') {
        // The verbs are in the "…" menu: its button shows when one applies.
        if (this.$actionsButton.hidden === shown) this.$actionsButton.hidden = !shown
        if (!shown && this.$actionsMenu.opened) this.$actionsMenu.close()
        continue
      }
      if (section.hidden === shown) section.hidden = !shown
    }
    return none
  }

  refresh () {
    const { editor } = this
    const selected = editor.svgCanvas?.getSelectedElements().filter(Boolean) ?? []
    const none = this.refreshSections()
    if (none) {
      this.refreshDocument()
      editor.frames?.refreshInspector()
    }
    this.root.dataset.empty = String(none)
    // The head: the type and the id of the selection.
    const type = this.tab.querySelector('.se-inspector-type')
    const id = this.tab.querySelector('.se-inspector-id')
    const frame = none && editor.frames?.selected
    if (frame) {
      type.textContent = editor.i18next.t('layout.section_frame')
      id.textContent = frame.getAttribute('name') || ''
    } else if (none) {
      type.textContent = editor.i18next.t('layout.section_document')
      id.textContent = ''
    } else if (selected.length > 1) {
      type.textContent = editor.i18next.t('layout.objects', { count: selected.length })
      id.textContent = ''
    } else {
      const el = selected[0]
      const key = TYPE_KEYS[el.nodeName]
      type.textContent = key ? editor.i18next.t(`layout.${key}`) : el.nodeName
      id.textContent = el.id ? `#${el.id}` : ''
    }
  }
}
