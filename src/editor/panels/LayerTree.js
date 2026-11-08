/**
 * Layers tab of the canvas layout (lot V3; plan v2, section 4.5): the tree
 * of the layers, their groups and their objects, with type and id.
 *
 * - A click selects (Shift or Ctrl adds), in sync with the canvas both ways;
 *   the layer of the object becomes the current layer and its group opens,
 *   as for a Ctrl+click.
 * - The eye shows or hides a layer, or an object (`display="none"`, one undo
 *   step).
 * - A double click (or F2) renames a layer in place.
 * - A layer is dragged among the layers to change their order; an object
 *   dragged onto a layer moves to it.
 * - The search keeps the objects whose id, name or type contains the text,
 *   with the layers and groups that hold them.
 * - Keyboard: role="tree"; up and down move, right opens, left closes or goes
 *   to the parent, Home and End, Enter selects, F2 renames.
 *
 * Only the rows in view are drawn: a tree of 5 000 objects scrolls and
 * follows the selection without delay. The full tree with symbols and
 * connectors comes in V7.
 * @module LayerTree
 */
import { escapeHtml } from './TopBar.js'

export const ROW_HEIGHT = 28
const OVERSCAN = 8

/** Elements that are not drawn, never listed. */
const NOT_LISTED = new Set([
  'defs', 'title', 'desc', 'metadata', 'style', 'script', 'symbol', 'marker',
  'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'filter'
])

/** Icon of each type of element. */
const TYPE_ICONS = {
  rect: 'rect.svg',
  circle: 'circle.svg',
  ellipse: 'ellipse.svg',
  line: 'pen.svg',
  polyline: 'path.svg',
  polygon: 'polygon.svg',
  path: 'path.svg',
  text: 'text.svg',
  g: 'group_elements.svg',
  a: 'globe_link.svg',
  use: 'shapelib.svg',
  image: 'image.svg',
  foreignObject: 'tool_foreign.svg'
}

/**
 * @param {Element} el
 * @returns {boolean} Whether a row shows the element
 */
export const isListed = (el) => el?.nodeType === 1 && !NOT_LISTED.has(el.localName) &&
  typeof el.getBBox === 'function'

/**
 * @param {Element} el
 * @returns {boolean} Whether the element holds rows
 */
export const isContainerElement = (el) => el?.localName === 'g' || el?.localName === 'a'

/**
 * The name shown for an object: its id, else its title, else nothing.
 * @param {Element} el
 * @returns {string}
 */
export const nameOf = (el) => {
  if (el.id) return el.id
  const title = [...el.children].find((child) => child.localName === 'title')
  return title?.textContent.trim() ?? ''
}

/**
 * The rows of the tree, top of the drawing first, as the canvas draws them.
 * @param {{name: string, group: Element, visible: boolean}[]} layers From
 *   the bottom layer to the top one
 * @param {object} state
 * @param {(el: Element) => boolean} state.isExpanded
 * @param {string} [state.query] Lower case
 * @returns {{el: Element, depth: number, kind: "layer"|"object", name: string, parent: Element|null, container: boolean, hidden: boolean}[]}
 */
export const flattenTree = (layers, { isExpanded, query = '' }) => {
  const rows = []
  const matches = (el, name) => !query ||
    name.toLowerCase().includes(query) || el.localName.toLowerCase().includes(query)
  // With a search: does the element, or something inside it, match?
  const memo = new Map()
  const holdsMatch = (el) => {
    if (!query) return true
    if (memo.has(el)) return memo.get(el)
    let found = matches(el, nameOf(el))
    if (!found && isContainerElement(el)) {
      for (const child of el.children) {
        if (isListed(child) && holdsMatch(child)) {
          found = true
          break
        }
      }
    }
    memo.set(el, found)
    return found
  }
  const walk = (parent, depth) => {
    const children = [...parent.children]
    for (let i = children.length - 1; i >= 0; i--) {
      const el = children[i]
      if (!isListed(el) || !holdsMatch(el)) continue
      const container = isContainerElement(el)
      rows.push({
        el,
        depth,
        kind: 'object',
        name: nameOf(el),
        parent,
        container,
        hidden: el.getAttribute('display') === 'none'
      })
      if (container && (query || isExpanded(el))) walk(el, depth + 1)
    }
  }
  for (let i = layers.length - 1; i >= 0; i--) {
    const { name, group, visible } = layers[i]
    const layerMatches = !query || name.toLowerCase().includes(query)
    const inside = [...group.children].some((child) => isListed(child) && holdsMatch(child))
    if (!layerMatches && !inside) continue
    rows.push({ el: group, depth: 0, kind: 'layer', name, parent: null, container: true, hidden: !visible })
    if (query || isExpanded(group)) walk(group, 1)
  }
  return rows
}

export class LayerTree {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} container Where the tree goes
   */
  constructor (editor, container) {
    this.editor = editor
    this.rows = []
    this.indexOf = new Map()
    this.collapsed = new WeakSet()
    this.expanded = new WeakSet()
    this.selected = new Set()
    this.query = ''
    this.focusIndex = 0
    this.dirty = true
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const template = document.createElement('template')
    template.innerHTML = `
      <div class="se-tree-search">
        <se-icon src="${escapeHtml(editor.configObj.curConfig.imgPath)}/search.svg"></se-icon>
        <input type="search" id="se-tree-search" aria-label="${t('layout.search_layers')}"
          placeholder="${t('layout.search_layers')}" autocomplete="off">
      </div>
      <div id="se-tree" class="se-tree" role="tree" tabindex="0" aria-label="${t('layout.layers')}"
        aria-multiselectable="true">
        <div class="se-tree-spacer"></div>
      </div>
      <p class="se-tree-empty" hidden>${t('layout.no_match')}</p>`
    container.append(template.content)
    this.$search = container.querySelector('#se-tree-search')
    this.$tree = container.querySelector('#se-tree')
    this.$spacer = this.$tree.querySelector('.se-tree-spacer')
    this.$empty = container.querySelector('.se-tree-empty')

    this.$search.addEventListener('input', () => {
      this.query = this.$search.value.trim().toLowerCase()
      this.dirty = true
      this.refresh()
    })
    this.$tree.addEventListener('scroll', () => this.render())
    this.$tree.addEventListener('click', (e) => this.click(e))
    this.$tree.addEventListener('keydown', (e) => this.keydown(e))
    this.initDrag()
    // The tree is built when the tab is shown, and kept up to date while it is.
    editor.$svgEditor.addEventListener('se-paneltab', () => this.refresh())
    editor.$svgEditor.addEventListener('se-panelchange', () => this.refresh())
  }

  /**
   * @returns {boolean} Whether the tree is on screen
   */
  get visible () {
    const { layout } = this.editor
    return Boolean(layout?.panelOpen && layout.tab === 'layers')
  }

  /**
   * @param {Element} el
   * @returns {boolean}
   */
  isExpanded (el) {
    if (this.collapsed.has(el)) return false
    // Layers are open, groups closed, unless the user chose otherwise.
    return this.expanded.has(el) || el.parentNode === this.editor.svgCanvas.getSvgContent()
  }

  /**
   * @param {Element} el
   * @param {boolean} open
   * @returns {void}
   */
  setExpanded (el, open) {
    if (open) {
      this.collapsed.delete(el)
      this.expanded.add(el)
    } else {
      this.expanded.delete(el)
      this.collapsed.add(el)
    }
    // At once: the user is looking at it.
    this.dirty = true
    this.refresh()
  }

  /**
   * The layers, bottom first.
   * @returns {{name: string, group: Element, visible: boolean}[]}
   */
  layers () {
    const drawing = this.editor.svgCanvas.getCurrentDrawing()
    const layers = []
    for (let i = 0; i < drawing.getNumLayers(); i++) {
      const name = drawing.getLayerName(i)
      const layer = drawing.all_layers[i]
      layers.push({ name, group: layer.getGroup(), visible: drawing.getLayerVisibility(name) })
    }
    return layers
  }

  /**
   * The document or the layers changed: the rows are built again, at the
   * next frame, if the tree is on screen.
   * @returns {void}
   */
  invalidate () {
    this.dirty = true
    if (!this.visible || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.refresh()
    })
  }

  /**
   * The layers or the document changed: the rows are built again at once.
   * @returns {void}
   */
  rebuild () {
    this.dirty = true
    this.refresh()
  }

  /**
   * @returns {void}
   */
  refresh () {
    if (!this.visible) {
      this.dirty = true
      return
    }
    if (this.dirty) this.build()
    this.render()
  }

  /**
   * @returns {void}
   */
  build () {
    const { svgCanvas } = this.editor
    if (!svgCanvas) return
    this.dirty = false
    this.rows = flattenTree(this.layers(), {
      isExpanded: (el) => this.isExpanded(el),
      query: this.query
    })
    this.indexOf = new Map(this.rows.map((row, i) => [row.el, i]))
    this.current = svgCanvas.getCurrentDrawing().getCurrentLayer()
    this.focusIndex = Math.min(this.focusIndex, Math.max(0, this.rows.length - 1))
    this.$spacer.style.height = `${this.rows.length * ROW_HEIGHT}px`
    this.$empty.hidden = this.rows.length > 0 || !this.query
  }

  /**
   * Draws the rows in view.
   * @returns {void}
   */
  render () {
    if (!this.visible || this.dirty) return
    const top = this.$tree.scrollTop
    const height = this.$tree.clientHeight || 600
    const first = Math.max(0, Math.floor(top / ROW_HEIGHT) - OVERSCAN)
    const last = Math.min(this.rows.length, Math.ceil((top + height) / ROW_HEIGHT) + OVERSCAN)
    const fragment = document.createDocumentFragment()
    for (let i = first; i < last; i++) fragment.append(this.rowElement(i))
    for (const old of this.$tree.querySelectorAll('.se-tree-row')) old.remove()
    this.$tree.append(fragment)
    const focused = this.rows[this.focusIndex]
    if (focused) this.$tree.setAttribute('aria-activedescendant', `se-tree-row-${this.focusIndex}`)
    else this.$tree.removeAttribute('aria-activedescendant')
  }

  /**
   * @param {number} index
   * @returns {HTMLElement}
   */
  rowElement (index) {
    const { editor } = this
    const row = this.rows[index]
    const img = editor.configObj.curConfig.imgPath
    const el = document.createElement('div')
    el.className = 'se-tree-row'
    el.id = `se-tree-row-${index}`
    el.dataset.index = String(index)
    el.dataset.kind = row.kind
    el.setAttribute('role', 'treeitem')
    el.setAttribute('aria-level', String(row.depth + 1))
    el.setAttribute('aria-setsize', String(this.rows.length))
    el.setAttribute('aria-posinset', String(index + 1))
    el.style.top = `${index * ROW_HEIGHT}px`
    el.style.paddingLeft = `${4 + row.depth * 14}px`
    const selected = row.kind === 'layer' ? row.el === this.current : this.selected.has(row.el)
    el.setAttribute('aria-selected', String(selected))
    if (row.kind === 'layer' && row.el === this.current) el.classList.add('se-tree-current')
    if (index === this.focusIndex) el.classList.add('se-tree-focus')
    if (row.hidden) el.classList.add('se-tree-hidden')
    el.draggable = true
    const open = row.container && (this.query || this.isExpanded(row.el))
    if (row.container) el.setAttribute('aria-expanded', String(Boolean(open)))

    const toggle = document.createElement('span')
    toggle.className = 'se-tree-toggle'
    if (row.container) {
      const chevron = document.createElement('se-icon')
      chevron.setAttribute('src', `${img}/chevron_right.svg`)
      toggle.append(chevron)
    }
    const icon = document.createElement('se-icon')
    icon.className = 'se-tree-icon'
    icon.setAttribute('src', `${img}/${row.kind === 'layer' ? 'layer_view.svg' : TYPE_ICONS[row.el.localName] ?? 'box.svg'}`)
    const name = document.createElement('span')
    name.className = 'se-tree-name'
    const type = document.createElement('span')
    type.className = 'se-tree-type'
    if (row.kind === 'layer') {
      name.textContent = row.name
    } else {
      const typeName = editor.i18next.t(`layout.type_${TYPE_KEYS[row.el.localName] ?? 'other'}`, { defaultValue: row.el.localName })
      name.textContent = row.name || typeName
      if (row.name) type.textContent = typeName
    }
    const eye = document.createElement('button')
    eye.type = 'button'
    eye.className = 'se-tree-eye'
    eye.tabIndex = -1
    const label = editor.i18next.t(row.hidden ? 'layout.show' : 'layout.hide')
    eye.setAttribute('aria-label', `${label} : ${name.textContent}`)
    eye.seTooltip = { label }
    const eyeIcon = document.createElement('se-icon')
    eyeIcon.setAttribute('src', `${img}/${row.hidden ? 'eye_off.svg' : 'eye.svg'}`)
    eye.append(eyeIcon)
    el.append(toggle, icon, name, type, eye)
    return el
  }

  /**
   * @param {EventTarget} target
   * @returns {object|null} The row of an element of the tree
   */
  rowOf (target) {
    const el = target?.closest?.('.se-tree-row')
    return el ? this.rows[Number(el.dataset.index)] ?? null : null
  }

  /**
   * @param {MouseEvent} e
   * @returns {void}
   */
  click (e) {
    const row = this.rowOf(e.target)
    if (!row) return
    this.focusIndex = this.indexOf.get(row.el) ?? 0
    if (e.detail === 2 && row.kind === 'layer' && e.target.closest('.se-tree-name')) {
      // The second click of a double click: the rows were drawn again after
      // the first one, so no dblclick event reaches them.
      this.rename(row)
      return
    } else if (e.target.closest('.se-tree-eye')) {
      this.toggleVisibility(row)
    } else if (e.target.closest('.se-tree-toggle') && row.container) {
      this.setExpanded(row.el, !this.isExpanded(row.el))
    } else {
      this.choose(row, { add: e.shiftKey || e.ctrlKey || e.metaKey })
    }
    this.$tree.focus({ preventScroll: true })
  }

  /**
   * Makes a layer current, or selects an object.
   * @param {object} row
   * @param {object} [options]
   * @param {boolean} [options.add]
   * @returns {void}
   */
  choose (row, { add = false } = {}) {
    const { editor } = this
    const { svgCanvas } = editor
    if (row.kind === 'layer') {
      if (svgCanvas.getCurrentGroup?.()) svgCanvas.leaveContext()
      svgCanvas.setCurrentLayer(row.name)
      svgCanvas.clearSelection()
      svgCanvas.runExtensions('layersChanged')
      editor.layersPanel.populateLayers()
      return
    }
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (add && selected.includes(row.el)) {
      svgCanvas.removeFromSelection([row.el])
      return
    }
    svgCanvas.selectElements([row.el], { add })
  }

  /**
   * @param {object} row
   * @returns {void}
   */
  toggleVisibility (row) {
    const { editor } = this
    const { svgCanvas } = editor
    if (row.kind === 'layer') {
      svgCanvas.setLayerVisibility(row.name, row.hidden)
      svgCanvas.runExtensions('layerVisChanged')
      editor.layersPanel.populateLayers()
      return
    }
    // One undo step; an empty value removes the attribute.
    svgCanvas.changeSelectedAttribute('display', row.hidden ? '' : 'none', [row.el])
    this.invalidate()
  }

  /**
   * Renames the current layer in its row, when the tree is on screen.
   * @returns {boolean} Whether the renaming started
   */
  renameCurrent () {
    if (!this.visible) return false
    if (this.dirty) this.build()
    const current = this.editor.svgCanvas.getCurrentDrawing().getCurrentLayer()
    const row = this.rows[this.indexOf.get(current)]
    if (!row) return false
    this.rename(row)
    return true
  }

  /**
   * Renames a layer in place.
   * @param {object} row
   * @returns {void}
   */
  rename (row) {
    if (row.kind !== 'layer') return
    const { editor } = this
    const index = this.indexOf.get(row.el)
    this.scrollTo(index)
    this.render()
    const rowEl = this.$tree.querySelector(`#se-tree-row-${index}`)
    const nameEl = rowEl?.querySelector('.se-tree-name')
    if (!nameEl) return
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'se-tree-rename'
    input.value = row.name
    input.setAttribute('aria-label', editor.i18next.t('layers.rename'))
    nameEl.replaceWith(input)
    rowEl.draggable = false
    input.focus()
    input.select()
    let done = false
    const finish = (commit) => {
      if (done) return
      done = true
      const name = input.value.trim()
      if (commit && name && name !== row.name) {
        if (editor.svgCanvas.getCurrentDrawing().hasLayer(name)) {
          editor.toast(editor.i18next.t('notification.layerHasThatName'), { type: 'error' })
        } else {
          editor.svgCanvas.setCurrentLayer(row.name)
          editor.svgCanvas.renameCurrentLayer(name)
          editor.layersPanel.populateLayers()
        }
      }
      this.invalidate()
      this.$tree.focus({ preventScroll: true })
    }
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') finish(true)
      else if (e.key === 'Escape') finish(false)
    })
    input.addEventListener('blur', () => finish(true))
  }

  /**
   * The selection of the canvas changed: the selected rows show it, and the
   * first one comes into view, its groups open.
   * @param {Element[]} elements
   * @returns {void}
   */
  selectionChanged (elements) {
    this.selected = new Set(elements.filter(Boolean))
    if (!this.visible) {
      this.dirty = true
      return
    }
    const content = this.editor.svgCanvas.getSvgContent()
    let opened = false
    for (const el of this.selected) {
      for (let parent = el.parentNode; parent && parent !== content; parent = parent.parentNode) {
        if (!this.isExpanded(parent)) {
          this.collapsed.delete(parent)
          this.expanded.add(parent)
          opened = true
        }
      }
    }
    // A new object, not yet in the rows: they are built again.
    if (opened || this.dirty || [...this.selected].some((el) => !this.indexOf.has(el))) this.build()
    const first = [...this.selected].map((el) => this.indexOf.get(el)).filter((i) => i !== undefined).sort((a, b) => a - b)[0]
    if (first !== undefined) {
      this.focusIndex = first
      this.scrollTo(first)
    }
    this.render()
  }

  /**
   * @param {number} index
   * @returns {void}
   */
  scrollTo (index) {
    const top = index * ROW_HEIGHT
    const view = this.$tree.clientHeight || 0
    if (top < this.$tree.scrollTop) this.$tree.scrollTop = top
    else if (top + ROW_HEIGHT > this.$tree.scrollTop + view) this.$tree.scrollTop = top + ROW_HEIGHT - view
  }

  /**
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydown (e) {
    if (e.target !== this.$tree) return
    const row = this.rows[this.focusIndex]
    const go = (index) => {
      e.preventDefault()
      e.stopPropagation()
      this.focusIndex = Math.max(0, Math.min(this.rows.length - 1, index))
      this.scrollTo(this.focusIndex)
      this.render()
    }
    switch (e.key) {
      case 'ArrowDown': go(this.focusIndex + 1); break
      case 'ArrowUp': go(this.focusIndex - 1); break
      case 'Home': go(0); break
      case 'End': go(this.rows.length - 1); break
      case 'ArrowRight':
        if (row?.container && !this.isExpanded(row.el)) {
          e.preventDefault()
          e.stopPropagation()
          this.setExpanded(row.el, true)
        } else if (row?.container) {
          go(this.focusIndex + 1)
        }
        break
      case 'ArrowLeft':
        if (row?.container && this.isExpanded(row.el) && !this.query) {
          e.preventDefault()
          e.stopPropagation()
          this.setExpanded(row.el, false)
        } else if (row?.parent) {
          go(this.indexOf.get(row.parent) ?? this.focusIndex)
        }
        break
      case 'Enter':
      case ' ':
        if (row) {
          e.preventDefault()
          e.stopPropagation()
          this.choose(row, { add: e.shiftKey || e.ctrlKey || e.metaKey })
        }
        break
      case 'F2':
        if (row?.kind === 'layer') {
          e.preventDefault()
          e.stopPropagation()
          this.rename(row)
        }
        break
    }
  }

  /**
   * Drag and drop: layers among layers, objects onto a layer.
   * @returns {void}
   */
  initDrag () {
    let dragged = null
    const clear = () => {
      for (const el of this.$tree.querySelectorAll('.se-tree-drop-before, .se-tree-drop-after, .se-tree-drop-into')) {
        el.classList.remove('se-tree-drop-before', 'se-tree-drop-after', 'se-tree-drop-into')
      }
    }
    const placement = (e, row, rowEl) => {
      if (!dragged || !row || row.el === dragged.el) return null
      if (dragged.kind === 'layer') {
        if (row.kind !== 'layer') return null
        const box = rowEl.getBoundingClientRect()
        return e.clientY < box.top + box.height / 2 ? 'before' : 'after'
      }
      // An object goes into another layer.
      if (row.kind === 'layer' && row.el !== dragged.el.closest?.('g.layer')) return 'into'
      return null
    }
    this.$tree.addEventListener('dragstart', (e) => {
      const row = this.rowOf(e.target)
      if (!row) return
      dragged = row
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', row.name || row.el.localName)
    })
    this.$tree.addEventListener('dragover', (e) => {
      const rowEl = e.target.closest?.('.se-tree-row')
      const where = placement(e, this.rowOf(e.target), rowEl)
      clear()
      if (!where) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      rowEl.classList.add(`se-tree-drop-${where}`)
    })
    this.$tree.addEventListener('dragleave', clear)
    this.$tree.addEventListener('dragend', () => {
      clear()
      dragged = null
    })
    this.$tree.addEventListener('drop', (e) => {
      const rowEl = e.target.closest?.('.se-tree-row')
      const row = this.rowOf(e.target)
      const where = placement(e, row, rowEl)
      clear()
      if (!where) return
      e.preventDefault()
      this.drop(dragged, row, where)
      dragged = null
    })
  }

  /**
   * @param {object} dragged
   * @param {object} target
   * @param {"before"|"after"|"into"} where
   * @returns {void}
   */
  drop (dragged, target, where) {
    const { editor } = this
    const { svgCanvas } = editor
    const drawing = svgCanvas.getCurrentDrawing()
    if (dragged.kind === 'layer') {
      // Rows go from the top layer down: "before" a row is above it.
      const layers = this.layers().map((layer) => layer.name)
      const from = layers.indexOf(dragged.name)
      let to = layers.indexOf(target.name) + (where === 'before' ? 1 : 0)
      if (from < to) to -= 1
      if (from < 0 || to === from) return
      svgCanvas.setCurrentLayer(dragged.name)
      svgCanvas.setCurrentLayerPosition(to)
      editor.layersPanel.populateLayers()
      return
    }
    if (where === 'into' && target.kind === 'layer' && drawing.hasLayer(target.name)) {
      const moved = svgCanvas.selectElements([dragged.el])
      if (!moved.length) return
      svgCanvas.moveSelectedToLayer(target.name)
      svgCanvas.clearSelection()
      editor.layersPanel.populateLayers()
    }
  }
}

/** Translation keys of the types, as in the head of the Properties tab. */
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
