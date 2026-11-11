/**
 * Contextual bar of the canvas layout (lot V4; plan v2, section 4.4).
 *
 * Above the selection, it holds the verbs that apply to it and at most four
 * frequent properties; the exact values stay in the inspector. A property
 * shown in both places is the same component bound to the same command: the
 * bar forwards its changes to the control of the inspector, which applies
 * them as it always did, so the two cannot diverge (one undo step, the same
 * checks). A verb of the bar clicks the button of the inspector it mirrors,
 * or runs a command of the registry, with the same shortcut.
 *
 * Placement: centred above the frame, 12 px beyond the rotation zone; below
 * the frame when there is no room under the top of the canvas; against the
 * edge of the view that hides fewer objects when the selection is taller
 * than the view; moved sideways so as never to go under the floating bars or
 * the drawer of the panel, 8 px apart. Hidden during a drag, a resize, a
 * rotation, a drawing, a zoom or a move of the view, and shown again 150 ms
 * after it ends; no position is computed during a gesture. Over an object it
 * covers, the empty parts of the bar fade and let the click through.
 *
 * F6 and Shift+F6 move the focus from the canvas to the bar, the inspector
 * and the toolbar. The preference "context_bar" turns the bar off; all its
 * actions stay in the menus and on the keyboard.
 * @module ContextBar
 */
import { escapeHtml } from './TopBar.js'
import { isShown } from './Inspector.js'
import { controlTitle } from '../commands.js'
import { isAllHidden } from '../structure.js'

/** Distance from the rotation zone to the bar, in pixels. */
export const BAR_GAP = 12
/** How far the grips and the rotation zones reach outside the frame. */
export const ROTATION_REACH = 20
/** Distance kept from the floating bars and the edges of the view. */
export const SIDE_MARGIN = 8
/** Delay before the bar shows again after a gesture, in milliseconds. */
export const SHOW_DELAY = 150

const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
const CONTAINERS = new Set(['g', 'a', 'switch'])
const ANCHORS = ['start', 'middle', 'end']
/** Buttons of the inspector that stay pressed while their state holds. */
const TOGGLES = new Set(['tool_bold', 'tool_italic', 'tool_text_decoration_underline'])

/**
 * What the selection is, for the content of the bar.
 * @param {object} options
 * @param {Element[]} options.elements Selected elements
 * @param {string} options.mode Mode of the canvas
 * @param {(elem: Element) => boolean} [options.isConnector]
 * @returns {"text"|"shape"|"path"|"nodes"|"group"|"use"|"image"|"multi"|"connector"|"other"|null}
 */
export const selectionKind = ({ elements, mode, isConnector = () => false }) => {
  if (mode === 'pathedit') return 'nodes'
  if (mode !== 'select' && mode !== 'textedit') return null
  const elems = (elements ?? []).filter(Boolean)
  if (!elems.length) return null
  if (elems.length > 1) return 'multi'
  const [elem] = elems
  if (isConnector(elem)) return 'connector'
  const tag = elem.tagName
  if (tag === 'text') return 'text'
  if (tag === 'path') return 'path'
  if (SHAPES.has(tag)) return 'shape'
  if (CONTAINERS.has(tag)) return 'group'
  if (tag === 'use') return 'use'
  if (tag === 'image') return 'image'
  return 'other'
}

/**
 * The entries of the bar for a kind of selection. "verb:id" mirrors a
 * button of the inspector, "text:id" too with its name written out,
 * "command:id" runs a command of the registry, "field:id" mirrors a field,
 * "list:id" a list of choices, "anchor:value" the anchor of a text.
 * @param {string} kind
 * @param {Element} [elem] The element, when alone
 * @returns {string[]}
 */
export const barEntries = (kind, elem) => {
  const filled = elem && !['line', 'polyline'].includes(elem.tagName)
  switch (kind) {
    case 'text':
      return ['textstyle', 'paint:fill', 'sep', 'verb:tool_bold', 'verb:tool_italic',
        'verb:tool_text_decoration_underline', 'verb:tool_make_link', 'sep',
        ...ANCHORS.map((anchor) => `anchor:${anchor}`), 'sep', 'command:edit_text', 'more']
    case 'shape':
      return [filled ? 'paint:fill' : null, 'paint:stroke', 'field:stroke_width',
        'field:rect_rx', 'field:starNumPoints', 'field:polySides', 'sep',
        'verb:tool_flip_h', 'text:tool_topath', 'more'].filter(Boolean)
    case 'path':
      return ['command:edit_nodes', 'paint:fill', 'paint:stroke', 'field:stroke_width', 'sep', 'verb:tool_flip_h', 'more']
    case 'nodes':
      // The commands of the nodes left the inspector with its Geometry
      // section: the pen and the keys act on the nodes.
      return []
    case 'group':
      return ['command:open_group', 'text:tool_ungroup', 'command:select_group_children', 'paint:fill', 'paint:stroke',
        'sep', 'command:hide_selection', 'more']
    case 'use':
      return ['command:select_same', 'command:replace_symbol', 'text:tool_unlink_use', 'more']
    case 'image':
      return ['command:select_same', 'command:replace_image', 'more']
    case 'multi':
      return ['align', 'text:tool_group_elements', 'verb:tool_flip_h_multi', 'paint:fill', 'paint:stroke', 'more']
    case 'connector':
      return ['paint:stroke', 'field:stroke_width', 'list:start_marker_list_opts', 'list:end_marker_list_opts', 'more']
    case 'other':
      return ['more']
    default:
      return []
  }
}

/**
 * Entries that run the command of another one, whose shortcut they show:
 * Enter edits a text, the nodes of a path or the children of a group.
 */
export const SHORTCUT_OF = {
  edit_text: 'select_children',
  edit_nodes: 'select_children',
  select_group_children: 'select_children',
  tool_flip_h_multi: 'tool_flip_h',
  // Their letters are gone (lot S1): the command that does the same.
  tool_clone: 'duplicate',
  tool_clone_multi: 'duplicate',
  tool_group_elements: 'group'
}

/**
 * The shortcut shown for a command.
 * @param {import('../commands.js').CommandRegistry} commands
 * @param {string} id
 * @returns {string}
 */
export const hintOf = (commands, id) => commands.hint(SHORTCUT_OF[id] ?? id)

/** Alignment and distribution: in the bar and in the context menu (4.4). */
const ALIGN_COMMANDS = ['align_left', 'align_center', 'align_right', 'align_top', 'align_middle', 'align_bottom',
  'align_distrib_horiz', 'align_distrib_verti']

/**
 * The entries of the context menu that depend on its target, before those
 * every object has (cut, copy, order...).
 * @param {string|null} kind See selectionKind
 * @returns {string[]} Entries, as in barEntries
 */
export const menuEntries = (kind) => {
  const own = {
    text: ['command:edit_text'],
    shape: ['text:tool_topath'],
    path: ['command:edit_nodes'],
    group: ['command:open_group', 'command:select_group_children'],
    use: ['command:select_same', 'command:replace_symbol', 'text:tool_unlink_use'],
    image: ['command:select_same', 'command:replace_image'],
    multi: ALIGN_COMMANDS.map((id) => `command:${id}`)
  }[kind] ?? []
  return kind && kind !== 'nodes' ? [...own, 'command:hide_selection'] : own
}

/** The labels written out on the buttons of the bar. */
const TEXT_LABELS = {
  tool_topath: 'context.to_path',
  tool_ungroup: 'context.ungroup',
  tool_unlink_use: 'context.unlink',
  tool_group_elements: 'context.group'
}

/**
 * The short labels of the commands on the bar: the hide button says
 * "Show" once the selection is hidden.
 * @param {string} id
 * @param {Element[]} elements
 * @returns {string|undefined} A translation key
 */
const commandLabel = (id, elements) => id === 'hide_selection'
  ? (isAllHidden(elements) ? 'context.show' : 'context.hide')
  : undefined

const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Where the bar goes (plan v2, section 4.4). All boxes in the same
 * coordinates, with left, top, right and bottom.
 * @param {object} options
 * @param {DOMRect|object} options.frame The frame of the selection
 * @param {DOMRect|object|null} [options.reach] The frame with its grips and
 *   rotation zones, when they show
 * @param {{width: number, height: number}} options.bar
 * @param {DOMRect|object} options.area The visible part of the canvas
 * @param {Array<DOMRect|object>} [options.obstacles] Floating bars and
 *   drawer over the canvas
 * @param {(box: object) => number} [options.covered] How many objects a box
 *   would hide
 * @returns {{left: number, top: number, side: "above"|"below"|"edge"}|null}
 *   Null when the selection is out of view
 */
export const placeBar = ({ frame, reach = null, bar, area, obstacles = [], covered = () => 0 }) => {
  if (frame.right < area.left || frame.left > area.right || frame.bottom < area.top || frame.top > area.bottom) {
    return null
  }
  const top0 = Math.min(frame.top - ROTATION_REACH, reach?.top ?? Infinity)
  const bottom0 = Math.max(frame.bottom + ROTATION_REACH, reach?.bottom ?? -Infinity)
  const minTop = area.top + SIDE_MARGIN
  const maxTop = area.bottom - SIDE_MARGIN - bar.height
  const minLeft = area.left + SIDE_MARGIN
  const maxLeft = area.right - SIDE_MARGIN - bar.width
  const clampLeft = (left) => Math.max(minLeft, Math.min(maxLeft, left))
  const boxAt = (left, top) => ({ left, top, right: left + bar.width, bottom: top + bar.height })
  const blocked = (box) => obstacles.some((ob) => intersects(box, {
    left: ob.left - SIDE_MARGIN, top: ob.top - SIDE_MARGIN, right: ob.right + SIDE_MARGIN, bottom: ob.bottom + SIDE_MARGIN
  }))
  /** Centred on the frame, or moved sideways off the floating bars. */
  const sideways = (top) => {
    const centre = clampLeft((frame.left + frame.right) / 2 - bar.width / 2)
    if (!blocked(boxAt(centre, top))) return centre
    const candidates = []
    for (const ob of obstacles) {
      candidates.push(ob.right + SIDE_MARGIN, ob.left - SIDE_MARGIN - bar.width)
    }
    const free = candidates.map(clampLeft).filter((left) => !blocked(boxAt(left, top)))
    if (!free.length) return null
    return free.reduce((best, left) => (Math.abs(left - centre) < Math.abs(best - centre) ? left : best))
  }
  const above = top0 - BAR_GAP - bar.height
  const below = bottom0 + BAR_GAP
  for (const [top, side] of [[above, 'above'], [below, 'below']]) {
    if (top < minTop || top > maxTop) continue
    const left = sideways(top)
    if (left !== null) return { left, top, side }
  }
  // Taller than the view (or no room on either side): against the edge of
  // the view that hides fewer objects.
  const edges = [minTop, maxTop].map((top) => {
    const left = sideways(top) ?? clampLeft((frame.left + frame.right) / 2 - bar.width / 2)
    return { left, top, side: 'edge', hidden: covered(boxAt(left, top)) }
  })
  const best = edges[1].hidden < edges[0].hidden ? edges[1] : edges[0]
  return { left: best.left, top: best.top, side: best.side }
}

/** Ends of the regions F6 goes through, in order. */
export const FOCUS_REGIONS = ['canvas', 'bar', 'inspector', 'toolbar']

export class ContextBar {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} stage
   */
  constructor (editor, stage) {
    this.editor = editor
    this.stage = stage
    this.kind = null
    this.entries = []
    this.gesture = false
    this.showTimer = null
    this.layouts = 0
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const template = document.createElement('template')
    template.innerHTML = `
      <div id="se-context-bar" class="se-context-bar se-float" role="toolbar" aria-orientation="horizontal" hidden></div>
      <se-popover id="se-ctx-align" placement="bottom-start" role="dialog" aria-label="${t('context.align')}"></se-popover>
      <se-popover id="se-ctx-list" menu placement="bottom-start"></se-popover>`
    stage.append(template.content)
    this.$bar = stage.querySelector('#se-context-bar')
    this.$align = stage.querySelector('#se-ctx-align')
    this.$list = stage.querySelector('#se-ctx-list')
    this.enabled = editor.configObj.pref('context_bar') !== 'false'
    this.initEvents()
    this.registerCommands()
  }

  get svgCanvas () {
    return this.editor.svgCanvas
  }

  t (key) {
    return this.editor.i18next.t(key)
  }

  /**
   * @param {string} name File of the icon
   * @returns {string}
   */
  icon (name) {
    return `<se-icon src="${escapeHtml(this.editor.configObj.curConfig.imgPath)}/${escapeHtml(name)}"></se-icon>`
  }

  /**
   * Commands of the bar that have no button elsewhere: in the registry, so
   * that the menus, the palette (Ctrl+K) and the keyboard reach them too.
   * @returns {void}
   */
  registerCommands () {
    const { editor } = this
    const selected = () => this.svgCanvas.getSelectedElements().filter(Boolean)
    const one = (tags) => {
      const elems = selected()
      return elems.length === 1 && tags.includes(elems[0].tagName) ? elems[0] : null
    }
    const commands = [
      {
        id: 'edit_text',
        label: 'context.edit_text',
        when: () => Boolean(one(['text'])),
        run: () => this.svgCanvas.selectChildren()
      },
      {
        id: 'edit_nodes',
        label: 'context.edit_nodes',
        when: () => Boolean(one(['path'])),
        run: () => this.svgCanvas.selectChildren()
      },
      {
        id: 'open_group',
        label: 'context.open_group',
        when: () => Boolean(one([...CONTAINERS])),
        run: () => {
          const group = one([...CONTAINERS])
          this.svgCanvas.clearSelection()
          this.svgCanvas.setContext(group)
        }
      },
      {
        id: 'select_group_children',
        label: 'context.select_children',
        when: () => Boolean(one([...CONTAINERS])),
        run: () => this.svgCanvas.selectChildren()
      },
      {
        id: 'select_same',
        label: 'context.select_same',
        when: () => Boolean(one(['use', 'image'])),
        run: () => this.selectSame()
      },
      {
        id: 'replace_symbol',
        label: 'context.replace',
        when: () => Boolean(one(['use'])),
        run: () => this.replaceSymbol()
      },
      {
        id: 'replace_image',
        label: 'context.replace',
        when: () => Boolean(one(['image'])),
        run: () => editor.topPanel.promptImgURL({ cancelDeletes: false })
      },
      // F6 moves between the regions from anywhere, a field or a tab
      // included, where the other shortcuts give way: its listener is below.
      {
        id: 'focus_next_region',
        label: 'context.focus_next',
        shortcuts: 'f6',
        run: () => this.focusRegion(1)
      },
      {
        id: 'focus_previous_region',
        label: 'context.focus_previous',
        shortcuts: 'shift+f6',
        run: () => this.focusRegion(-1)
      },
      {
        id: 'toggle_context_bar',
        label: 'context.toggle',
        run: () => this.setEnabled(!this.enabled)
      },
      {
        // The context menu from the keyboard, as in the systems.
        id: 'open_context_menu',
        label: 'context.open_menu',
        shortcuts: 'shift+f10',
        run: () => this.openContextMenu()
      }
    ]
    commands.forEach((command) => editor.commands.register(command))
  }

  /**
   * Turns the bar on or off, and remembers it.
   * @param {boolean} enabled
   * @returns {void}
   */
  setEnabled (enabled) {
    this.enabled = Boolean(enabled)
    this.editor.configObj.pref('context_bar', this.enabled ? 'true' : 'false', true)
    this.refresh()
  }

  /**
   * Gestures hide the bar; it shows again 150 ms after the last one ends.
   * @returns {void}
   */
  initEvents () {
    const workarea = this.editor.workarea
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'F6' || !this.editor.$svgEditor.isConnected) return
      if (this.editor.commands.dispatch(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }, true)
    workarea.addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('#se-context-bar')) return
      this.gesture = true
      this.hide()
    }, true)
    const end = () => {
      if (!this.gesture) return
      this.gesture = false
      this.scheduleShow()
    }
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    workarea.addEventListener('wheel', () => {
      this.hide()
      this.scheduleShow()
    }, { passive: true, capture: true })
    // The empty parts of the bar let the click through to the canvas; the
    // bar fades while the pointer is over them and an object lies below.
    workarea.addEventListener('pointermove', (e) => {
      if (this.$bar.hidden || e.buttons) {
        this.$bar.classList.remove('se-ctx-faded')
        return
      }
      const box = this.$bar.getBoundingClientRect()
      const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom
      const over = inside && this.svgCanvas.getMouseTarget(e) !== this.svgCanvas.getSvgRoot()
      this.$bar.classList.toggle('se-ctx-faded', Boolean(over))
    })
    this.$bar.addEventListener('pointerleave', () => this.$bar.classList.remove('se-ctx-faded'))
    this.$bar.addEventListener('click', (e) => this.activate(e.target.closest('[data-entry]')))
    this.$bar.addEventListener('keydown', (e) => this.keydown(e))
    this.$list.addEventListener('click', (e) => this.chooseFromList(e.target.closest('[role="menuitemradio"]')))
    this.$align.addEventListener('se-popover-close', () => this.returnAlignPanel())
  }

  /**
   * Arrows move between the controls of the bar, as in a toolbar.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydown (e) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    if (e.target.closest?.('se-spin-input, input')) return
    const controls = this.controls()
    const index = controls.indexOf(e.target.closest('[data-entry]'))
    if (index === -1) return
    e.preventDefault()
    e.stopPropagation()
    const next = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: controls.length - 1
    }[e.key]
    controls[(next + controls.length) % controls.length]?.focus()
  }

  /** @returns {HTMLElement[]} The controls of the bar, in order. */
  controls () {
    return [...this.$bar.querySelectorAll('[data-entry]')].filter((el) => !el.hidden && !el.closest('.se-ctx-paint')?.hidden)
  }

  hide () {
    clearTimeout(this.showTimer)
    this.showTimer = null
    this.$bar.classList.add('se-ctx-hiding')
  }

  /**
   * Shows the bar again once the gestures are over.
   * @returns {void}
   */
  scheduleShow () {
    clearTimeout(this.showTimer)
    this.showTimer = setTimeout(() => {
      this.showTimer = null
      if (this.gesture) return
      this.$bar.classList.remove('se-ctx-hiding')
      this.position()
    }, SHOW_DELAY)
  }

  /**
   * After a change of the selection, of the mode or of the document: the
   * entries, their states, then the place. Waits for the extensions, which
   * show their panels after the inspector.
   * @returns {void}
   */
  refresh () {
    if (this.refreshing) return
    this.refreshing = true
    queueMicrotask(() => {
      this.refreshing = false
      this.update()
    })
  }

  update () {
    const { svgCanvas } = this
    const elements = svgCanvas.getSelectedElements().filter(Boolean)
    const kind = this.enabled
      ? selectionKind({
        elements,
        mode: svgCanvas.getMode(),
        isConnector: (elem) => elem.hasAttributeNS?.('http://svg-edit.googlecode.com', 'connector') ||
          Boolean(elem.getAttribute?.('se:connector'))
      })
      : null
    const entries = kind ? barEntries(kind, elements[0]) : []
    if (kind !== this.kind || entries.join() !== this.entries.join()) {
      this.kind = kind
      this.entries = entries
      this.build()
    }
    this.syncStates()
    const visible = this.controls().length > 0
    this.$bar.hidden = !visible
    if (!visible) {
      this.$align.close?.()
      return
    }
    this.$bar.setAttribute('aria-label', this.t(`context.label_${kind}`))
    if (this.gesture || this.showTimer) return
    this.schedulePosition()
  }

  /**
   * Places the bar at the next frame, once the panels have updated: the
   * layout of the drawing is then computed once, not twice.
   * @returns {void}
   */
  schedulePosition () {
    if (this.positionFrame) return
    this.positionFrame = requestAnimationFrame(() => {
      this.positionFrame = null
      this.position()
    })
  }

  /**
   * The original control of an entry, in the inspector.
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  original (id) {
    return document.getElementById(id)
  }

  /**
   * Whether the inspector shows a control now: the bar shows only what
   * applies to the selection.
   * @param {HTMLElement|null} el
   * @returns {boolean}
   */
  applies (el) {
    if (!el) return false
    const top = this.editor.$svgEditor.querySelector('#tools_top')
    for (let node = el; node && node !== top && node !== document.body; node = node.parentElement) {
      if (node.classList?.contains('se-section')) break
      // Folded settings (More options, the settings of the stroke) apply.
      if (node.classList?.contains('se-more-body')) continue
      if (!isShown(node)) return false
    }
    return true
  }

  /**
   * Builds the controls of the entries.
   * @returns {void}
   */
  build () {
    this.returnAlignPanel()
    this.$align.close?.()
    this.$bar.textContent = ''
    for (const entry of this.entries) {
      const el = this.buildEntry(entry)
      if (el) this.$bar.append(el)
    }
  }

  /**
   * @param {string} entry
   * @returns {HTMLElement|null}
   */
  buildEntry (entry) {
    const [type, id] = entry.split(':')
    const { commands } = this.editor
    const button = (className, html, label, hint) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = className
      el.dataset.entry = entry
      el.innerHTML = html
      el.setAttribute('aria-label', hint ? `${label} (${hint})` : label)
      el.seTooltip = { label, shortcut: hint }
      return el
    }
    switch (type) {
      case 'sep': {
        const sep = document.createElement('span')
        sep.className = 'se-sep'
        sep.setAttribute('role', 'separator')
        return sep
      }
      case 'verb':
      case 'text': {
        const original = this.original(id)
        if (!original) return null
        const title = controlTitle(original)
        const label = type === 'text' ? this.t(TEXT_LABELS[id] ?? title) : (title ? this.t(title) : id)
        const src = original.getAttribute('src')
        const el = type === 'text'
          ? button('se-text-button', `${src ? this.icon(src) : ''}<span>${escapeHtml(label)}</span>`, label, hintOf(commands, id))
          : button('se-icon-button', src ? this.icon(src) : escapeHtml(label), label, hintOf(commands, id))
        if (title && type === 'text') el.seTooltip = { label: this.t(title), shortcut: hintOf(commands, id) }
        return el
      }
      case 'command': {
        const command = commands.get(id)
        if (!command) return null
        const label = this.t(commandLabel(id, this.svgCanvas.getSelectedElements().filter(Boolean)) ?? command.label)
        return button('se-text-button', `<span>${escapeHtml(label)}</span>`, label, hintOf(commands, id))
      }
      case 'anchor': {
        const label = this.t(`properties.text_anchor_${id}`)
        const el = button('se-icon-button', this.icon(`anchor_${id}.svg`), label)
        el.setAttribute('aria-pressed', 'false')
        return el
      }
      case 'paint':
        return this.buildPaint(id)
      case 'field':
        return this.buildField(id)
      case 'list':
        return this.buildList(id)
      case 'align': {
        const label = this.t('context.align')
        const el = button('se-text-button', `${this.icon('align.svg')}<span>${escapeHtml(label)}</span>${this.icon('chevron_down.svg')}`, label)
        el.setAttribute('aria-haspopup', 'dialog')
        el.setAttribute('aria-expanded', 'false')
        return el
      }
      case 'textstyle':
        return this.editor.textStyles?.buildBarEntry(entry) ?? null
      case 'more': {
        const label = this.t('context.more')
        const el = button('se-icon-button', this.icon('more_horiz.svg'), label)
        el.setAttribute('aria-haspopup', 'menu')
        return el
      }
      default:
        return null
    }
  }

  /**
   * A twin of the paint of the inspector: the same component, whose changes
   * go to the same handler (BottomPanel.handleColorPicker).
   * @param {"fill"|"stroke"} type
   * @returns {HTMLElement|null}
   */
  buildPaint (type) {
    const original = this.original(`${type}_color`)
    if (!original) return null
    const wrap = document.createElement('span')
    wrap.className = 'se-ctx-paint'
    wrap.dataset.paint = type
    const picker = document.createElement('se-colorpicker')
    picker.id = `se-ctx-${type}`
    picker.setAttribute('type', type)
    picker.setAttribute('label', `context.${type}`)
    picker.dataset.entry = `paint:${type}`
    picker.tabIndex = 0
    picker.setAttribute('role', 'button')
    picker.setAttribute('aria-label', this.t(`context.${type}`))
    const name = document.createElement('span')
    name.className = 'se-ctx-paint-name'
    wrap.append(picker, name)
    picker.addEventListener('change', (e) => {
      original.setPaint(e.detail.paint)
      this.editor.bottomPanel.handleColorPicker(type, e)
    })
    picker.addEventListener('input', (e) => {
      if (e.detail?.paint) this.svgCanvas.previewPaint(type, e.detail.paint)
    })
    picker.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      picker.shadowRoot?.getElementById('picker')?.click()
    })
    name.addEventListener('click', () => picker.shadowRoot?.getElementById('picker')?.click())
    queueMicrotask(() => picker.init?.(this.editor.i18next))
    return wrap
  }

  /**
   * A twin of a numeric field of the inspector: its changes are given to
   * the field of the inspector, whose handler applies them.
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  buildField (id) {
    const original = this.original(id)
    if (!original) return null
    const field = document.createElement('se-spin-input')
    field.id = `se-ctx-${id}`
    field.dataset.entry = `field:${id}`
    field.dataset.original = id
    for (const name of ['min', 'max', 'step', 'src', 'title']) {
      // The title of a field became its tooltip (controlTitle keeps it).
      const value = name === 'title' ? controlTitle(original) : original.getAttribute(name)
      if (value !== null) field.setAttribute(name, value)
    }
    if (id === 'stroke_width' && !field.hasAttribute('src')) field.setAttribute('src', 'stroke.svg')
    field.addEventListener('change', (e) => {
      if (!e.detail?.relative) original.value = field.value
      original.dispatchEvent(new CustomEvent('change', e.detail ? { detail: e.detail } : undefined))
    })
    return field
  }

  /**
   * A list of the inspector (se-list, se-select): a button that shows the
   * choice, and a menu of the choices.
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  buildList (id) {
    const original = this.original(id)
    if (!original) return null
    const title = controlTitle(original)
    const label = title ? this.t(title) : id
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'se-text-button se-ctx-list'
    el.dataset.entry = `list:${id}`
    el.setAttribute('aria-haspopup', 'menu')
    el.setAttribute('aria-label', label)
    el.seTooltip = { label }
    el.innerHTML = `<span class="se-ctx-list-value"></span>${this.icon('chevron_down.svg')}`
    return el
  }

  /**
   * The choices of a list of the inspector.
   * @param {HTMLElement} original
   * @returns {{value: string, label: string, src: string|null}[]}
   */
  choicesOf (original) {
    if (original.localName === 'se-select') {
      const options = (original.getAttribute('options') || '').split(',')
      const values = (original.getAttribute('values') || '').split('::')
      return values.map((value, i) => ({ value, label: this.t(options[i] ?? value), src: null }))
    }
    return [...original.querySelectorAll('se-list-item')].map((item) => ({
      value: item.getAttribute('value'),
      label: this.t(item.getAttribute('title') || item.getAttribute('value')),
      src: item.getAttribute('src')
    }))
  }

  /**
   * States of the controls from those of the inspector: pressed, disabled,
   * values, paints.
   * @returns {void}
   */
  syncStates () {
    const elements = this.svgCanvas.getSelectedElements().filter(Boolean)
    for (const el of [...this.$bar.querySelectorAll('[data-entry]')]) {
      const [type, id] = el.dataset.entry.split(':')
      const holder = el.closest('.se-ctx-paint') ?? el
      switch (type) {
        case 'verb':
        case 'text': {
          const original = this.original(id)
          holder.hidden = !this.applies(original)
          el.disabled = Boolean(original?.hasAttribute('disabled') || original?.classList.contains('disabled'))
          if (TOGGLES.has(id)) el.setAttribute('aria-pressed', String(Boolean(original?.pressed)))
          break
        }
        case 'command': {
          holder.hidden = !this.editor.commands.isEnabled(id)
          const key = commandLabel(id, elements)
          if (key) {
            const label = this.t(key)
            const hint = hintOf(this.editor.commands, id)
            if (el.textContent !== label) el.querySelector('span').textContent = label
            el.setAttribute('aria-label', hint ? `${label} (${hint})` : label)
            el.seTooltip = { label, shortcut: hint }
          }
          break
        }
        case 'anchor': {
          const value = this.original('tool_text_anchor')?.getAttribute('value') || 'start'
          el.setAttribute('aria-pressed', String(value === id))
          break
        }
        case 'field': {
          const original = this.original(id)
          holder.hidden = !this.applies(original)
          if (original) {
            if (original.mixed) el.mixed = true
            else el.value = original.value
          }
          break
        }
        case 'list': {
          const original = this.original(id)
          holder.hidden = !this.applies(original)
          if (!original) break
          const value = original.getAttribute('value') ?? original.value
          const choice = this.choicesOf(original).find((item) => String(item.value) === String(value))
          const shown = el.querySelector('.se-ctx-list-value')
          shown.innerHTML = choice?.src ? this.icon(choice.src) : escapeHtml(choice?.label ?? '')
          el.disabled = original.hasAttribute('disabled')
          break
        }
        case 'textstyle':
          this.editor.textStyles?.syncButton(el)
          break
        case 'paint': {
          const original = this.original(`${id}_color`)
          const name = holder.querySelector('.se-ctx-paint-name')
          if (!original || !el.paintBox) break
          if (elements.length > 1) el.updateMany(this.svgCanvas, elements)
          else el.update(this.svgCanvas, elements[0], false)
          const mixed = el.classList.contains('mixed')
          name.textContent = mixed ? this.t('properties.mixed') : this.t(`context.${id}`)
          break
        }
      }
    }
  }

  /**
   * A control of the bar was clicked.
   * @param {HTMLElement|null} el
   * @returns {void}
   */
  activate (el) {
    if (!el || el.disabled) return
    const [type, id] = el.dataset.entry.split(':')
    switch (type) {
      case 'verb':
      case 'text':
        this.original(id)?.click()
        break
      case 'command':
        this.editor.commands.execute(id)
        break
      case 'anchor': {
        const list = this.original('tool_text_anchor')
        if (!list) break
        list.setAttribute('value', id)
        list.dispatchEvent(new CustomEvent('change', { detail: { value: id } }))
        break
      }
      case 'list':
        this.openList(el, id)
        return
      case 'align':
        this.openAlign(el)
        return
      case 'more':
        this.openContextMenu(el)
        return
      case 'textstyle':
        this.editor.textStyles?.open(el)
        return
      default:
        return
    }
    this.refresh()
  }

  /**
   * @param {HTMLElement} button
   * @param {string} id
   * @returns {void}
   */
  openList (button, id) {
    const original = this.original(id)
    if (!original) return
    const value = String(original.getAttribute('value') ?? original.value)
    this.$list.setAttribute('aria-label', button.getAttribute('aria-label'))
    this.$list.dataset.original = id
    this.$list.innerHTML = this.choicesOf(original).map((choice) =>
      `<div role="menuitemradio" data-value="${escapeHtml(choice.value)}" aria-checked="${String(choice.value) === value}">
        ${choice.src ? this.icon(choice.src) : ''}<span>${escapeHtml(choice.label)}</span></div>`).join('')
    this.$list.open(button)
  }

  /**
   * @param {HTMLElement|null} item
   * @returns {void}
   */
  chooseFromList (item) {
    if (!item) return
    const original = this.original(this.$list.dataset.original)
    this.$list.close({ restoreFocus: true })
    if (!original) return
    const { value } = item.dataset
    original.value = value
    original.setAttribute('value', value)
    original.dispatchEvent(new CustomEvent('change', { detail: { value } }))
    this.refresh()
  }

  /**
   * Aligner et distribuer ▾: the panel of the inspector itself, lent to the
   * bar while it is open.
   * @param {HTMLElement} button
   * @returns {void}
   */
  openAlign (button) {
    if (this.$align.opened) {
      this.$align.close({ restoreFocus: true })
      return
    }
    const panel = this.original('tool_align_popup')
    if (!panel) return
    this.alignHome = { parent: panel.parentNode, next: panel.nextSibling, hidden: panel.hidden, display: panel.style.display }
    panel.hidden = false
    panel.style.display = ''
    this.$align.append(panel)
    this.$align.open(button)
    button.setAttribute('aria-expanded', 'true')
  }

  /**
   * Gives the alignment panel back to the inspector.
   * @returns {void}
   */
  returnAlignPanel () {
    const panel = this.original('tool_align_popup')
    const home = this.alignHome
    this.$bar.querySelector('[data-entry="align"]')?.setAttribute('aria-expanded', 'false')
    if (!panel || !home) return
    this.alignHome = null
    home.parent.insertBefore(panel, home.next?.parentNode === home.parent ? home.next : null)
    panel.hidden = home.hidden
    panel.style.display = home.display
  }

  /**
   * "…" or Shift+F10: the context menu of the selection, under the button,
   * or at the selection; the focus goes to its first entry.
   * @param {HTMLElement} [button]
   * @returns {void}
   */
  openContextMenu (button) {
    let point
    if (button) {
      const box = button.getBoundingClientRect()
      point = { x: box.left, y: box.bottom + 4 }
    } else {
      const frame = this.frameBox()?.frame
      const area = this.editor.workarea.getBoundingClientRect()
      point = frame
        ? { x: Math.max(area.left, Math.min(area.right, frame.left)), y: Math.max(area.top, Math.min(area.bottom, frame.bottom)) }
        : { x: area.left + area.width / 2, y: area.top + area.height / 2 }
    }
    this.menuOpener = button ?? document.activeElement
    this.editor.workarea.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      view: window
    }))
  }

  /**
   * The entries of the context menu for the selection: label, shortcut, and
   * what they do. Only those that apply.
   * @returns {{id: string, label: string, hint: string, run: () => void}[]}
   */
  menuItems () {
    const { svgCanvas, editor } = this
    const elements = svgCanvas.getSelectedElements().filter(Boolean)
    const kind = selectionKind({
      elements,
      mode: svgCanvas.getMode(),
      isConnector: (elem) => elem.hasAttributeNS?.('http://svg-edit.googlecode.com', 'connector')
    })
    const items = []
    for (const entry of menuEntries(kind)) {
      const [type, id] = entry.split(':')
      if (type === 'command') {
        const command = editor.commands.get(id)
        if (!command || !editor.commands.isEnabled(id)) continue
        items.push({ id, label: this.t(commandLabel(id, elements) ?? command.label), hint: hintOf(editor.commands, id), run: () => editor.commands.execute(id) })
      } else {
        const original = this.original(id)
        if (!this.applies(original) || original.hasAttribute('disabled')) continue
        items.push({ id, label: this.t(TEXT_LABELS[id] ?? controlTitle(original)), hint: hintOf(editor.commands, id), run: () => original.click() })
      }
    }
    return items
  }

  /**
   * Selects the symbols, or the images, that show the same thing, in the
   * group or layer of the selection.
   * @returns {void}
   */
  selectSame () {
    const { svgCanvas } = this
    const [elem] = svgCanvas.getSelectedElements().filter(Boolean)
    if (!elem) return
    const href = svgCanvas.getHref(elem)
    const scope = elem.parentNode
    const same = [...scope.children].filter((el) => el.tagName === elem.tagName && svgCanvas.getHref(el) === href)
    svgCanvas.selectOnly(same, true)
  }

  /**
   * Remplacer: another SVG file takes the place of the symbol of the
   * selected <use>, which keeps its identifier, its place and its scale.
   * @returns {void}
   */
  replaceSymbol () {
    const { svgCanvas, editor } = this
    const [use] = svgCanvas.getSelectedElements().filter(Boolean)
    if (use?.tagName !== 'use') return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.svg,image/svg+xml'
    input.addEventListener('change', () => {
      const [file] = input.files
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (!svgCanvas.replaceUseSymbol(use, String(reader.result))) {
          editor.toast(this.t('notification.importFailed'), { type: 'error' })
        }
      }
      reader.readAsText(file)
    })
    input.click()
  }

  /**
   * Places the bar. Never during a gesture.
   * @returns {void}
   */
  position () {
    if (this.$bar.hidden || this.gesture) return
    const frame = this.frameBox()
    if (!frame) {
      this.$bar.classList.add('se-ctx-offscreen')
      return
    }
    this.layouts++
    const stageBox = this.stage.getBoundingClientRect()
    const toStage = (box) => box && ({
      left: box.left - stageBox.left,
      top: box.top - stageBox.top,
      right: box.right - stageBox.left,
      bottom: box.bottom - stageBox.top
    })
    const area = toStage(this.editor.workarea.getBoundingClientRect())
    area.right = Math.min(area.right, window.innerWidth - stageBox.left)
    area.bottom = Math.min(area.bottom, window.innerHeight - stageBox.top)
    const obstacles = this.obstacles().map(toStage)
    const bar = { width: this.$bar.offsetWidth, height: this.$bar.offsetHeight }
    const covered = (box) => this.coveredObjects({
      left: box.left + stageBox.left, top: box.top + stageBox.top, right: box.right + stageBox.left, bottom: box.bottom + stageBox.top
    })
    const place = placeBar({ frame: toStage(frame.frame), reach: toStage(frame.reach), bar, area, obstacles, covered })
    this.$bar.classList.toggle('se-ctx-offscreen', !place)
    if (!place) return
    this.$bar.style.left = `${Math.round(place.left)}px`
    this.$bar.style.top = `${Math.round(place.top)}px`
    this.$bar.dataset.side = place.side
  }

  /**
   * The frame of the selection and the reach of its grips, on the screen.
   * @returns {{frame: DOMRect|object, reach: DOMRect|object|null}|null}
   */
  frameBox () {
    const mgr = this.svgCanvas.selectorManager
    if (!mgr) return null
    const boxes = []
    const shown = (el) => el && el.getAttribute('display') !== 'none' && el.isConnected
    if (shown(mgr.multiFrame)) boxes.push(mgr.multiFrame.getBoundingClientRect())
    else {
      for (const selector of mgr.selectors ?? []) {
        if (selector?.selectedElement && shown(selector.selectorGroup)) boxes.push(selector.selectorRect.getBoundingClientRect())
      }
    }
    if (!boxes.length) {
      // Editing the nodes of a path, or the characters of a text.
      for (const elem of this.svgCanvas.getSelectedElements().filter(Boolean)) {
        boxes.push(elem.getBoundingClientRect())
      }
    }
    const real = boxes.filter((box) => box.width || box.height)
    if (!real.length) return null
    const union = (list) => ({
      left: Math.min(...list.map((box) => box.left)),
      top: Math.min(...list.map((box) => box.top)),
      right: Math.max(...list.map((box) => box.right)),
      bottom: Math.max(...list.map((box) => box.bottom))
    })
    const frame = union(real)
    const grips = mgr.selectorGripsGroup
    const reach = shown(grips) && grips.getAttribute('display') !== 'none' ? grips.getBoundingClientRect() : null
    return { frame, reach: reach && (reach.width || reach.height) ? union([frame, reach]) : null }
  }

  /**
   * The floating bars over the canvas, and the panel when it is a drawer.
   * @returns {DOMRect[]}
   */
  obstacles () {
    const root = this.editor.$svgEditor
    const list = [root.querySelector('#tools_left'), root.querySelector('#se-viewgroup')]
    if (root.classList.contains('se-panel-drawer') && !root.classList.contains('se-panel-closed')) {
      list.push(root.querySelector('#se-panel'))
    }
    return list.filter((el) => el && el.offsetParent !== null).map((el) => el.getBoundingClientRect())
  }

  /**
   * How many objects of the drawing a box of the screen would hide.
   * @param {object} box
   * @returns {number}
   */
  coveredObjects (box) {
    const layer = this.svgCanvas.getCurrentDrawing().getCurrentLayer()
    const scope = this.svgCanvas.getCurrentGroup() || layer
    let count = 0
    for (const el of scope?.children ?? []) {
      if (!el.getBoundingClientRect || ['title', 'desc'].includes(el.tagName)) continue
      const r = el.getBoundingClientRect()
      if ((r.width || r.height) && intersects(box, r)) count++
    }
    return count
  }

  /**
   * F6 and Shift+F6: the canvas, the bar, the inspector, the toolbar.
   * @param {1|-1} step
   * @returns {void}
   */
  focusRegion (step) {
    const root = this.editor.$svgEditor
    const active = document.activeElement
    const regions = {
      canvas: this.editor.workarea,
      bar: this.$bar,
      inspector: root.querySelector('#se-panel'),
      toolbar: root.querySelector('#tools_left')
    }
    const usable = (name) => {
      const el = regions[name]
      if (!el || el.offsetParent === null || el.hidden || el.inert) return false
      if (name === 'bar') return !el.classList.contains('se-ctx-offscreen') && this.controls().length > 0
      return true
    }
    let current = FOCUS_REGIONS.findIndex((name) => regions[name]?.contains(active))
    if (current === -1) current = 0
    for (let i = 1; i <= FOCUS_REGIONS.length; i++) {
      const name = FOCUS_REGIONS[(current + step * i + FOCUS_REGIONS.length * 4) % FOCUS_REGIONS.length]
      if (!usable(name)) continue
      this.focusIn(name, regions[name])
      return
    }
  }

  /**
   * @param {string} name
   * @param {HTMLElement} region
   * @returns {void}
   */
  focusIn (name, region) {
    if (name === 'canvas') {
      if (!region.hasAttribute('tabindex')) region.tabIndex = -1
      region.focus({ preventScroll: true })
      return
    }
    if (name === 'bar') {
      this.controls()[0]?.focus()
      return
    }
    if (name === 'inspector') {
      const tab = region.querySelector('[role="tab"][aria-selected="true"]')
      tab?.focus()
      return
    }
    const first = [...region.querySelectorAll('button, se-button, [tabindex="0"]')].find((el) => el.offsetParent !== null)
    if (first) {
      if (first.localName === 'se-button' && !first.hasAttribute('tabindex')) first.tabIndex = 0
      first.focus()
    }
  }
}
