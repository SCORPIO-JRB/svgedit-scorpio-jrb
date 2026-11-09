/**
 * Floating toolbar of the canvas layout (lot V3; plan v2, section 4.2), at
 * the top left of the canvas: current layer ▾ | Select, Scale, Hand | Text,
 * Shapes ▾, Paths ▾ | Image, Connector, Library | More ▾.
 *
 * Declared order. Each tool declares its group and its rank with
 * `data-group` and `data-rank` instead of an index: "select", "create",
 * "insert" and "more" are groups of the bar, "shapes" and "paths" the menus
 * of the create group. A tool that declares nothing goes into More ▾. The
 * extensions still insert their buttons into #tools_left at an index; an
 * adapter moves each one to its place, so the order is the same at every
 * load, whatever the order in which the extensions arrive.
 *
 * A group with a menu shows the last tool chosen in it (se-flyingbutton).
 * Below 1 024 px the insert group folds into More ▾.
 *
 * Keyboard: role="toolbar"; the arrows go from one tool to the next, Enter
 * or Space chooses it, and the down arrow opens the menu of a group.
 * @module Toolbar
 */
import { escapeHtml } from './TopBar.js'
import { focusControl } from '../components/seFlyingButton.js'

/** Groups of the bar, in order. */
export const TOOL_GROUPS = ['select', 'create', 'insert', 'more']
/** Menus, and the group that holds each. */
export const TOOL_MENUS = { shapes: 'create', paths: 'create' }

/**
 * @param {Element} el
 * @returns {number}
 */
export const rankOf = (el) => {
  const rank = Number(el.getAttribute?.('data-rank'))
  return Number.isFinite(rank) && el.hasAttribute('data-rank') ? rank : Infinity
}

/**
 * Order of two tools: by rank, then by id, so that undeclared tools keep the
 * same order at every load.
 * @param {Element} a
 * @param {Element} b
 * @returns {number}
 */
export const compareTools = (a, b) => {
  const ra = rankOf(a)
  const rb = rankOf(b)
  if (ra !== rb) return ra < rb ? -1 : 1
  return (a.id || '').localeCompare(b.id || '')
}

/**
 * Where a tool goes: a group of the bar or a menu.
 * @param {Element} el
 * @param {boolean} [compact]
 * @returns {string}
 */
export const placeOf = (el, compact = false) => {
  const declared = el.getAttribute?.('data-group')
  const place = TOOL_GROUPS.includes(declared) || declared in TOOL_MENUS ? declared : 'more'
  return compact && place === 'insert' ? 'more' : place
}

/**
 * Inserts an element among its siblings by rank.
 * @param {Element} container
 * @param {Element} el
 * @returns {void}
 */
export const insertByRank = (container, el) => {
  const next = [...container.children].find((child) => child !== el && compareTools(el, child) < 0)
  if (next) {
    if (el.nextElementSibling !== next || el.parentElement !== container) container.insertBefore(el, next)
  } else if (el.parentElement !== container || container.lastElementChild !== el) {
    container.append(el)
  }
}

const TOOL_TAGS = new Set(['SE-BUTTON', 'SE-FLYINGBUTTON', 'SE-EXPLORERBUTTON'])

export class Toolbar {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} stage
   */
  constructor (editor, stage) {
    this.editor = editor
    this.stage = stage
    this.compact = false
  }

  /**
   * Builds the bar from the buttons of LeftPanel, before they enter the page.
   * @param {DocumentFragment} fragment
   * @returns {void}
   */
  attach (fragment) {
    const { editor } = this
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const img = escapeHtml(editor.configObj.curConfig.imgPath)
    const bar = fragment.querySelector('#tools_left')
    const tools = [...bar.querySelectorAll('[data-group]')]
    // The wrappers of the old left panel (rectangle and ellipse groups) have
    // no place here: their tools go into the Shapes menu.
    bar.replaceChildren()
    bar.classList.add('se-toolbar', 'se-float')
    bar.setAttribute('role', 'toolbar')
    bar.setAttribute('aria-orientation', 'horizontal')
    bar.setAttribute('aria-label', editor.i18next.t('layout.tools'))
    const template = document.createElement('template')
    template.innerHTML = `
      <button type="button" id="se-layer-button" class="se-text-button" data-se-layout aria-haspopup="menu"
        aria-expanded="false"><span class="se-layer-name"></span><se-icon src="${img}/chevron_down.svg"></se-icon></button>
      <span class="se-sep" data-se-layout></span>
      <div class="se-tool-group" data-se-layout data-place="select"></div>
      <span class="se-sep" data-se-layout></span>
      <div class="se-tool-group" data-se-layout data-place="create">
        <se-flyingbutton id="tools_shapes" data-se-layout data-place="shapes" data-rank="20" title="layout.shapes" placement="bottom"></se-flyingbutton>
        <se-flyingbutton id="tools_paths" data-se-layout data-place="paths" data-rank="30" title="layout.paths" placement="bottom"></se-flyingbutton>
      </div>
      <div class="se-tool-group" data-se-layout data-place="insert"></div>
      <span class="se-sep" data-se-layout></span>
      <se-flyingbutton id="tools_more" data-se-layout data-place="more" title="layout.more_tools" placement="bottom"
        menu-only src="more_horiz.svg"></se-flyingbutton>`
    bar.append(template.content)
    this.bar = bar
    for (const tool of tools) insertByRank(this.containerOf(tool), tool)
    this.stage.append(bar)

    const menu = document.createElement('template')
    menu.innerHTML = `<se-popover id="se-layer-menu" menu placement="bottom-start" aria-label="${t('layout.layers')}"></se-popover>`
    this.stage.append(menu.content)
    this.$layerButton = bar.querySelector('#se-layer-button')
    this.$layerMenu = this.stage.querySelector('#se-layer-menu')
    this.$layerButton.addEventListener('click', () => {
      if (this.$layerMenu.opened) {
        this.$layerMenu.close()
        return
      }
      this.fillLayerMenu()
      this.$layerMenu.open(this.$layerButton)
    })
    this.$layerMenu.addEventListener('click', (e) => this.chooseLayer(e.target.closest('[role^="menuitem"]')))

    // The adapter: what the extensions add, at any index, goes to its place.
    this.observer = new MutationObserver((records) => {
      const added = records.flatMap((record) => [...record.addedNodes])
      if (added.some((node) => node.nodeType === 1)) this.place()
    })
    this.observer.observe(bar, { childList: true, subtree: true })
    bar.addEventListener('keydown', (e) => this.keydown(e))
  }

  /**
   * @param {Element} tool
   * @returns {Element}
   */
  containerOf (tool) {
    const place = placeOf(tool, this.compact)
    return this.bar.querySelector(`[data-place="${place}"]`)
  }

  /**
   * Puts every tool where it belongs; unwraps the menus that an extension
   * brings (ext-polystar groups star and polygon in its own).
   * @returns {void}
   */
  place () {
    if (!this.bar) return
    for (const wrapper of this.bar.querySelectorAll('se-flyingbutton:not([data-se-layout])')) {
      const children = [...wrapper.children]
      for (const child of children) insertByRank(this.containerOf(child), child)
      wrapper.remove()
    }
    const tools = [...this.bar.querySelectorAll('*')].filter((el) =>
      !el.hasAttribute('data-se-layout') && TOOL_TAGS.has(el.tagName) &&
      el.parentElement?.closest('#tools_left') === this.bar)
    for (const tool of tools) {
      const container = this.containerOf(tool)
      if (tool.parentElement !== container) insertByRank(container, tool)
    }
    // Keep the order inside each container; folded into More ▾, the insert
    // tools come first.
    for (const container of this.bar.querySelectorAll('[data-place]')) {
      const children = [...container.children].filter((child) => !child.matches('.se-sep'))
      const inserted = (el) => (el.getAttribute('data-group') === 'insert' ? 0 : 1)
      const sorted = [...children].sort((a, b) => inserted(a) - inserted(b) || compareTools(a, b))
      if (sorted.some((child, i) => child !== children[i])) sorted.forEach((child) => container.append(child))
    }
    for (const group of this.bar.querySelectorAll('.se-tool-group')) {
      group.hidden = !group.children.length
    }
  }

  /**
   * Below 1 024 px, Image, Connector and Library go into More ▾.
   * @param {boolean} compact
   * @returns {void}
   */
  setCompact (compact) {
    this.compact = compact
    this.place()
  }

  /**
   * @returns {void}
   */
  updateLayerButton () {
    if (!this.$layerButton) return
    const drawing = this.editor.svgCanvas?.getCurrentDrawing()
    const name = drawing?.getCurrentLayerName() ?? ''
    this.$layerButton.querySelector('.se-layer-name').textContent = name
    const label = `${this.editor.i18next.t('layout.current_layer')} : ${name}`
    this.$layerButton.setAttribute('aria-label', label)
    this.$layerButton.seTooltip = { label: this.editor.i18next.t('layout.current_layer') }
  }

  /**
   * @returns {void}
   */
  fillLayerMenu () {
    const { editor } = this
    const drawing = editor.svgCanvas.getCurrentDrawing()
    const current = drawing.getCurrentLayerName()
    const items = []
    for (let i = drawing.getNumLayers() - 1; i >= 0; i--) {
      const name = drawing.getLayerName(i)
      const item = document.createElement('div')
      item.setAttribute('role', 'menuitemradio')
      item.setAttribute('aria-checked', String(name === current))
      item.dataset.layer = name
      item.textContent = name
      items.push(item)
    }
    const separator = () => {
      const el = document.createElement('div')
      el.setAttribute('role', 'separator')
      return el
    }
    // The commands of the layer, as in the bar of the classic Layers panel.
    const count = drawing.getNumLayers()
    const index = editor.svgCanvas.indexCurrentLayer()
    const action = (name, label, disabled = false, why = '') => {
      const el = document.createElement('div')
      el.setAttribute('role', 'menuitem')
      el.dataset.action = name
      el.textContent = editor.i18next.t(label)
      el.setAttribute('aria-disabled', String(disabled))
      // A disabled entry says why (plan v2, 2.6: the last layer stays).
      if (disabled && why) {
        el.seTooltip = { label: why }
        el.setAttribute('aria-description', why)
      }
      return el
    }
    this.$layerMenu.replaceChildren(
      ...items,
      separator(),
      action('new', 'layers.new'),
      action('dupe', 'layers.dupe'),
      action('rename', 'layers.rename'),
      action('delete', 'layers.del', count < 2, editor.i18next.t('structure.last_layer')),
      action('up', 'layers.move_up', index >= count - 1),
      action('down', 'layers.move_down', index <= 0),
      separator(),
      action('show', 'layout.show_layers')
    )
  }

  /**
   * @param {HTMLElement|null} item
   * @returns {void}
   */
  chooseLayer (item) {
    if (!item || item.getAttribute('aria-disabled') === 'true') return
    const { editor } = this
    if (item.dataset.layer !== undefined) {
      editor.svgCanvas.setCurrentLayer(item.dataset.layer)
      editor.svgCanvas.clearSelection()
      editor.svgCanvas.runExtensions('layersChanged')
      editor.layersPanel.populateLayers()
    } else if (item.dataset.action === 'new') {
      editor.layersPanel.newLayer(this.$layerButton)
    } else if (item.dataset.action === 'dupe') {
      editor.layersPanel.cloneLayer(this.$layerButton)
    } else if (item.dataset.action === 'rename') {
      editor.layersPanel.layerRename(this.$layerButton)
    } else if (item.dataset.action === 'delete') {
      editor.layersPanel.deleteLayer()
    } else if (item.dataset.action === 'up') {
      editor.layersPanel.moveLayer(-1)
    } else if (item.dataset.action === 'down') {
      editor.layersPanel.moveLayer(1)
    } else if (item.dataset.action === 'show') {
      editor.layout.setPanelOpen(true)
      editor.layout.selectTab('layers', { focus: true })
    }
  }

  /**
   * The tools reachable by the arrows: those of the bar, not those of the
   * closed menus.
   * @returns {HTMLElement[]}
   */
  items () {
    return [...this.bar.querySelectorAll('#se-layer-button, se-button, se-flyingbutton, se-explorerbutton')]
      .filter((el) => !el.closest('[hidden]') && el.parentElement?.tagName !== 'SE-FLYINGBUTTON' &&
        el.style.display !== 'none')
  }

  /**
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydown (e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const items = this.items()
    const active = document.activeElement
    const index = items.findIndex((item) => item === active || item.contains(active))
    if (index < 0) return
    e.preventDefault()
    e.stopPropagation()
    const next = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: items.length - 1
    }[e.key]
    focusControl(items[(next + items.length) % items.length])
  }
}
