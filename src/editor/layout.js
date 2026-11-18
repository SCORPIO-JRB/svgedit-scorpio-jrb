/**
 * Layout of the editor (lot V3; plan v2, sections 3 and 4.1 to 4.5).
 *
 * - "canvas", the default: the canvas takes the whole editor under a top bar
 *   of 40 px. The tools float over it, top left, and the view group top
 *   right. Properties, layers and code share a panel on the right, which
 *   Ctrl+\ shows or hides, whose width is set between 240 and 420 px, and
 *   which becomes a drawer over the canvas below 1 280 px.
 * - "classic": the layout of SVG-Edit, kept behind this option until the
 *   end of V4 (`layout: 'classic'`, or `?layout=classic`). Read at start.
 *   It has no contextual bar (lot V4).
 *
 * The panels build their controls as before and hand them to `attach`, which
 * puts each one in its zone. Ids and classes do not change: the code that
 * drives the controls, and the extensions that insert into #tools_left,
 * #tools_top, #editor_panel or #main_button, keep working. Adapters move what
 * the extensions add into the new zones (Toolbar.js, Inspector.js).
 * @module layout
 */
import { Toolbar } from './panels/Toolbar.js'
import { Inspector } from './panels/Inspector.js'
import { TopBar } from './panels/TopBar.js'
import { ViewGroup } from './panels/ViewGroup.js'
import { LayerTree } from './panels/LayerTree.js'
import { CodePanel } from './panels/CodePanel.js'
import { ContextBar } from './panels/ContextBar.js'
import { TextStyles } from './panels/TextStyles.js'
import { PaintPicker } from './panels/PaintPicker.js'
import { CommandPalette } from './panels/CommandPalette.js'
import { HistoryMenu } from './panels/HistoryMenu.js'

export const LAYOUTS = ['canvas', 'classic']
export const PANEL_MIN_WIDTH = 240
export const PANEL_MAX_WIDTH = 420
export const PANEL_DEFAULT_WIDTH = 280
/** Below this width of the editor, the right panel is a drawer over the canvas. */
export const DRAWER_BELOW = 1280
/** Below this width, the groups of the toolbar fold and Export goes into the document menu. */
export const COMPACT_BELOW = 1024
export const PANEL_TABS = ['properties', 'layers', 'code']

/**
 * @param {any} value
 * @returns {"canvas"|"classic"}
 */
export const layoutOf = (value) => (LAYOUTS.includes(value) ? value : 'canvas')

/**
 * @param {any} width
 * @returns {number} A width of the panel, in pixels, between 240 and 420
 */
export const clampPanelWidth = (width) => {
  const value = Number(width)
  if (!Number.isFinite(value) || value <= 0) return PANEL_DEFAULT_WIDTH
  return Math.round(Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, value)))
}

/**
 * The size classes of the editor for a width.
 * @param {number} width
 * @returns {{drawer: boolean, compact: boolean}}
 */
export const sizeClasses = (width) => ({
  drawer: width < DRAWER_BELOW,
  compact: width < COMPACT_BELOW
})

const html = (markup) => {
  const template = document.createElement('template')
  template.innerHTML = markup.trim()
  return template.content
}

/**
 * The layout of one editor.
 */
export class EditorLayout {
  /**
   * @param {import('./Editor.js').default} editor
   * @param {object} [options]
   * @param {string} [options.layout]
   */
  constructor (editor, { layout } = {}) {
    this.editor = editor
    this.mode = layoutOf(layout)
    this.panelOpen = true
    this.panelWidth = PANEL_DEFAULT_WIDTH
    this.tab = 'properties'
    this.drawer = false
    this.compact = false
  }

  /** @returns {boolean} */
  get canvas () {
    return this.mode === 'canvas'
  }

  get root () {
    return this.editor.$svgEditor
  }

  /**
   * Builds the zones, once the editor template is in place and before the
   * panels attach their controls. In the classic layout, nothing changes.
   * @returns {void}
   */
  build () {
    const root = this.root
    root.classList.add(`se-layout-${this.mode}`)
    if (!this.canvas) return
    const { i18next } = this.editor
    const t = (key) => i18next.t(key)
    root.append(html(`
      <header id="se-topbar"></header>
      <div id="se-stage"></div>
      <aside id="se-panel" aria-label="${t('layout.panel')}">
        <div class="se-panel-resize" role="separator" aria-orientation="vertical" tabindex="0"
          aria-label="${t('layout.panel_width')}" aria-valuemin="${PANEL_MIN_WIDTH}" aria-valuemax="${PANEL_MAX_WIDTH}"></div>
        <div class="se-panel-tabs" role="tablist" aria-label="${t('layout.panel')}">
          ${PANEL_TABS.map((tab) => `<button type="button" role="tab" id="se-tab-${tab}" aria-controls="se-tabpanel-${tab}"
            aria-selected="false" tabindex="-1">${t(`layout.tab_${tab}`)}</button>`).join('')}
        </div>
        ${PANEL_TABS.map((tab) => `<section id="se-tabpanel-${tab}" class="se-tabpanel" role="tabpanel"
          aria-labelledby="se-tab-${tab}" hidden></section>`).join('')}
      </aside>`))
    this.$topbar = root.querySelector('#se-topbar')
    this.$stage = root.querySelector('#se-stage')
    this.$panel = root.querySelector('#se-panel')
    // The drawing area, with the rulers that Rulers.js adds around it.
    this.$stage.append(this.editor.workarea)

    this.topBar = new TopBar(this.editor, this.$topbar)
    this.viewGroup = new ViewGroup(this.editor, this.$stage)
    this.historyMenu = new HistoryMenu(this.editor, this.$stage)
    this.toolbar = new Toolbar(this.editor, this.$stage)
    this.inspector = new Inspector(this.editor, root.querySelector('#se-tabpanel-properties'))
    this.codePanel = new CodePanel(this.editor, root.querySelector('#se-tabpanel-code'))
    // Over the canvas, above the selection (lot V4).
    this.contextBar = new ContextBar(this.editor, this.$stage)
    this.editor.textStyles = new TextStyles(this.editor, this.$stage)
    this.palette = new CommandPalette(this.editor, root)
    // The colour window, which replaces jPicker and jGraduate here.
    this.paintPicker = new PaintPicker(this.editor, root)

    this.initPanel()
    this.observeSize()
  }

  /**
   * Puts the controls of a panel in their zones.
   * @param {DocumentFragment} fragment The controls, not yet in the page
   * @param {"left"|"top"|"bottom"|"layers"|"menu"|"rulers"} part
   * @returns {void}
   */
  attach (fragment, part) {
    if (!this.canvas) {
      this.root.append(fragment)
      return
    }
    switch (part) {
      case 'left':
        this.toolbar.attach(fragment)
        break
      case 'top':
        this.inspector.attachTop(fragment, {
          editorPanel: (el) => this.viewGroup.attachEditorPanel(el),
          historyPanel: (el) => this.topBar.attachHistory(el),
          contextPanel: (el) => this.$stage.append(el)
        })
        break
      case 'bottom':
        this.inspector.attachBottom(fragment)
        // The eye and − at the end of the fill and the stroke.
        this.paintPicker?.mountRows()
        break
      case 'layers':
        this.attachLayers(fragment)
        break
      case 'menu':
        this.topBar.attachMenu(fragment)
        break
      case 'rulers':
        this.$stage.prepend(fragment)
        break
      default:
        this.root.append(fragment)
    }
  }

  /**
   * Takes a control out of the canvas layout (lot S1, simplification.js): it
   * stays in the page, hidden and without shortcut, for the code that drives
   * it. Call it before the control enters the page, so that its shortcut
   * never becomes a command.
   * @param {Element|null} el
   * @returns {void}
   */
  retire (el) {
    if (!el) return
    if (!this.$retired) {
      this.$retired = document.createElement('div')
      this.$retired.id = 'se-retired'
      this.$retired.hidden = true
      this.$retired.setAttribute('aria-hidden', 'true')
      this.root.append(this.$retired)
    }
    el.removeAttribute('shortcut')
    this.$retired.append(el)
  }

  /**
   * The layer controls of LayersPanel, in the Layers tab: its buttons and the
   * move-to-layer list; the tree (LayerTree.js) takes the place of the table.
   * @param {DocumentFragment} fragment
   * @returns {void}
   */
  attachLayers (fragment) {
    const tab = this.root.querySelector('#se-tabpanel-layers')
    const sidepanels = fragment.querySelector('#sidepanels')
    if (!sidepanels) {
      tab.append(fragment)
      return
    }
    // The handle of the old side panel has no use here: Ctrl+\ and the view
    // group show and hide the panel. #sidepanels and #sidepanel_content stay,
    // for the layer menus and the extensions that add to the side panel.
    sidepanels.querySelector('#sidepanel_handle')?.remove()
    sidepanels.querySelector('#layersLabel')?.remove()
    // The tree takes the place of the table of layers, which stays hidden
    // for the code that still reads it.
    const wrap = document.createElement('div')
    wrap.className = 'se-tree-wrap'
    const table = sidepanels.querySelector('#layerlist')
    if (table) table.before(wrap)
    else sidepanels.querySelector('#layerpanel')?.append(wrap)
    tab.append(sidepanels)
    this.layerTree = new LayerTree(this.editor, wrap)
    const help = document.createElement('p')
    help.className = 'se-tree-help'
    help.textContent = this.editor.i18next.t('layout.tree_help')
    wrap.after(help)
  }

  /**
   * @param {string} tab
   * @param {object} [options]
   * @param {boolean} [options.focus]
   * @returns {void}
   */
  selectTab (tab, { focus = false } = {}) {
    if (!this.canvas || !PANEL_TABS.includes(tab)) return
    this.tab = tab
    for (const name of PANEL_TABS) {
      const button = this.root.querySelector(`#se-tab-${name}`)
      const panel = this.root.querySelector(`#se-tabpanel-${name}`)
      const selected = name === tab
      button.setAttribute('aria-selected', String(selected))
      button.tabIndex = selected ? 0 : -1
      panel.hidden = !selected
    }
    if (focus) this.root.querySelector(`#se-tab-${tab}`).focus()
    this.editor.configObj.pref('panel_tab', tab)
    this.root.dispatchEvent(new CustomEvent('se-paneltab', { detail: { tab } }))
  }

  /**
   * Shows or hides the right panel (Ctrl+\ and the view group).
   * @param {boolean} [open] Toggles when left out
   * @returns {void}
   */
  setPanelOpen (open = !this.panelOpen) {
    if (!this.canvas) {
      this.editor.layersPanel?.toggleSidePanel(open)
      return
    }
    this.panelOpen = Boolean(open)
    this.root.classList.toggle('se-panel-closed', !this.panelOpen)
    this.$panel.inert = !this.panelOpen
    this.$panel.setAttribute('aria-hidden', String(!this.panelOpen))
    this.viewGroup?.panelChanged(this.panelOpen)
    // In a drawer, the choice holds for this width only.
    if (!this.drawer) this.editor.configObj.pref('panel_open', this.panelOpen ? 'true' : 'false', true)
    this.root.dispatchEvent(new CustomEvent('se-panelchange', { detail: { open: this.panelOpen } }))
  }

  /**
   * @param {number} width In pixels, kept between 240 and 420
   * @param {object} [options]
   * @param {boolean} [options.save=true]
   * @returns {void}
   */
  setPanelWidth (width, { save = true } = {}) {
    this.panelWidth = clampPanelWidth(width)
    this.root.style.setProperty('--se-panel-width', `${this.panelWidth}px`)
    this.$panel?.querySelector('.se-panel-resize')?.setAttribute('aria-valuenow', String(this.panelWidth))
    if (save) this.editor.configObj.pref('panel_width', String(this.panelWidth))
  }

  /**
   * Tabs, width handle and the stored state of the panel.
   * @returns {void}
   */
  initPanel () {
    const { configObj } = this.editor
    this.setPanelWidth(configObj.pref('panel_width'), { save: false })
    const tabs = this.$panel.querySelector('[role="tablist"]')
    tabs.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]')
      if (tab) this.selectTab(tab.id.replace('se-tab-', ''))
    })
    tabs.addEventListener('keydown', (e) => {
      const index = PANEL_TABS.indexOf(this.tab)
      const go = (i) => {
        e.preventDefault()
        e.stopPropagation()
        this.selectTab(PANEL_TABS[(i + PANEL_TABS.length) % PANEL_TABS.length], { focus: true })
      }
      if (e.key === 'ArrowRight') go(index + 1)
      else if (e.key === 'ArrowLeft') go(index - 1)
      else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(PANEL_TABS.length - 1)
    })
    this.selectTab(PANEL_TABS.includes(configObj.pref('panel_tab')) ? configObj.pref('panel_tab') : 'properties')
    const stored = configObj.pref('panel_open')
    this.setPanelOpen(stored !== 'false' && stored !== false)
    this.initResize(this.$panel.querySelector('.se-panel-resize'))
  }

  /**
   * The handle on the left edge of the panel: drag it, or use the arrows
   * (8 px, 40 px with Shift), Home and End.
   * @param {HTMLElement} handle
   * @returns {void}
   */
  initResize (handle) {
    let start = null
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      handle.setPointerCapture(e.pointerId)
      start = { x: e.clientX, width: this.panelWidth }
      this.root.classList.add('se-panel-resizing')
    })
    handle.addEventListener('pointermove', (e) => {
      if (!start) return
      this.setPanelWidth(start.width + start.x - e.clientX, { save: false })
    })
    const end = (e) => {
      if (!start) return
      start = null
      handle.releasePointerCapture?.(e.pointerId)
      this.root.classList.remove('se-panel-resizing')
      this.setPanelWidth(this.panelWidth)
    }
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 40 : 8
      const widths = {
        ArrowLeft: this.panelWidth + step,
        ArrowRight: this.panelWidth - step,
        Home: PANEL_MIN_WIDTH,
        End: PANEL_MAX_WIDTH
      }
      if (!(e.key in widths)) return
      e.preventDefault()
      e.stopPropagation()
      this.setPanelWidth(widths[e.key])
    })
  }

  /**
   * Size classes from the width of the editor, which may be embedded in a
   * page narrower than the window.
   * @returns {void}
   */
  observeSize () {
    const apply = (width) => {
      if (!width) return
      const { drawer, compact } = sizeClasses(width)
      if (drawer !== this.drawer) {
        this.drawer = drawer
        this.root.classList.toggle('se-panel-drawer', drawer)
        // A drawer opens on demand: entering the small width closes it, and
        // leaving it brings back the stored choice.
        if (drawer) this.setPanelOpen(false)
        else this.setPanelOpen(this.editor.configObj.pref('panel_open') !== 'false')
      }
      if (compact !== this.compact) {
        this.compact = compact
        this.root.classList.toggle('se-compact', compact)
        this.toolbar?.setCompact(compact)
        this.topBar?.setCompact(compact)
      }
    }
    apply(this.root.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width)
    })
    this.resizeObserver.observe(this.root)
  }

  /**
   * After a change of selection, of mode or of the document.
   * @returns {void}
   */
  selectionChanged () {
    this.inspector?.refresh()
    this.layerTree?.selectionChanged(this.editor.svgCanvas?.getSelectedElements() ?? [])
    this.codePanel?.invalidate()
    this.contextBar?.refresh()
    this.paintPicker?.selectionChanged()
    this.editor.frames?.selectionChanged()
    this.editor.binding?.refresh()
    this.editor.symbolPanel?.refresh()
    this.editor.connectorPanel?.refresh()
    this.editor.connectors?.scheduleOverlay()
  }

  /**
   * After a change of the document.
   * @param {object} [options]
   * @param {boolean} [options.selection] - False when selectionChanged()
   *   follows at once: it refreshes the panels of the selected object, and
   *   its binding reads the whole drawing
   * @returns {void}
   */
  documentChanged ({ selection = true } = {}) {
    this.layerTree?.invalidate()
    this.codePanel?.invalidate()
    this.contextBar?.refresh()
    // The frames to export follow the document, and its undo steps (lot V5).
    this.editor.frames?.update()
    this.editor.frames?.refreshInspector()
    if (selection) {
      this.editor.binding?.refresh()
      this.editor.symbolPanel?.refresh()
      this.editor.connectorPanel?.refresh()
    }
    this.editor.connectors?.scheduleOverlay()
  }

  /**
   * After a change of the layers or of the current layer.
   * @returns {void}
   */
  layersChanged () {
    this.toolbar?.updateLayerButton()
    this.layerTree?.rebuild()
  }

  /**
   * @param {string} title
   * @returns {void}
   */
  titleChanged (title) {
    this.topBar?.setTitle(title)
  }

  /**
   * @returns {void}
   */
  saveStateChanged () {
    this.topBar?.updateSaveState()
  }

  /**
   * @param {number} zoom
   * @returns {void}
   */
  zoomChanged (zoom) {
    this.viewGroup?.setZoom(zoom)
    // The frame moved: the bar comes back once the zoom stops.
    this.contextBar?.hide()
    this.contextBar?.scheduleShow()
  }

  /**
   * After the extensions have been added.
   * @returns {void}
   */
  extensionsAdded () {
    this.toolbar?.place()
    this.inspector?.place()
    this.topBar?.extensionsAdded()
  }
}
