/**
 * View group of the canvas layout (lot V3; plan v2, section 4.1), floating
 * at the top right of the canvas, as in the mockups: the button of the right
 * panel (Ctrl+\) and the zoom ▾ menu.
 *
 * The zoom menu holds zoom in and out, fit all (Shift+1), the selection
 * (Shift+2) and the page (Shift+3), steps from 25 to 200 %, the view options
 * (rulers, grid, wireframe, and the buttons that extensions add to
 * #editor_panel), then Undo and Redo. Each entry runs a command of the
 * registry and shows its shortcut; an entry that does not apply is greyed and
 * keeps its shortcut shown.
 *
 * #editor_panel stays in the page, out of sight: its buttons keep their ids,
 * their shortcuts and the state the extensions give them, and the menu shows
 * one entry for each. The source button gives way to the Code tab; Ctrl+U
 * still opens the source.
 * @module ViewGroup
 */
import { escapeHtml } from './TopBar.js'

/** Steps of the zoom menu, in per cent. */
export const ZOOM_MENU_STEPS = [25, 50, 100, 200]

/**
 * Buttons of #editor_panel that have their own entry, or none, in the menu.
 * The others (those of the extensions) each get an entry.
 */
const OWN_ENTRIES = new Set(['tool_source', 'tool_wireframe', 'view_grid'])

/**
 * @param {number} zoom 1 for 100 %
 * @param {string} [lang]
 * @returns {string} "100 %", "6 400 %", "37,5 %"
 */
export const formatZoom = (zoom, lang) => {
  const percent = Math.round(zoom * 1000) / 10
  const number = new Intl.NumberFormat(lang || undefined, { maximumFractionDigits: percent < 10 ? 1 : 0 }).format(percent)
  // A narrow no-break space before %, as French typography wants it.
  return `${number}\u202f%`
}

export class ViewGroup {
  /**
   * @param {import('../Editor.js').default} editor
   * @param {HTMLElement} stage
   */
  constructor (editor, stage) {
    this.editor = editor
    const t = (key) => escapeHtml(editor.i18next.t(key))
    const icon = (name) => `<se-icon src="${escapeHtml(editor.configObj.curConfig.imgPath)}/${name}"></se-icon>`
    const entry = (command, label, extra = '') =>
      `<div role="menuitem" data-command="${command}" ${extra}><span>${label}</span><kbd></kbd></div>`
    const check = (command, label) =>
      `<div role="menuitemcheckbox" data-command="${command}" aria-checked="false"><span>${label}</span><kbd></kbd></div>`
    const template = document.createElement('template')
    template.innerHTML = `
      <div id="se-viewgroup" class="se-float" role="toolbar" aria-label="${t('layout.view')}">
        <span class="se-editor-panel-slot"></span>
        <button type="button" id="se-panel-toggle" class="se-icon-button" aria-pressed="true">${icon('panel_right.svg')}</button>
        <button type="button" id="se-zoom-button" class="se-text-button" aria-haspopup="menu" aria-expanded="false"
          aria-label="${t('layout.zoom')}"><span class="se-zoom-value">100 %</span>${icon('chevron_down.svg')}</button>
      </div>
      <se-popover id="se-zoom-menu" menu placement="bottom-end" aria-label="${t('layout.zoom')}">
        ${entry('zoom_in', t('layout.zoom_in'))}
        ${entry('zoom_out', t('layout.zoom_out'))}
        ${entry('zoom_fit_content', t('layout.zoom_fit_content'))}
        ${entry('zoom_fit_selection', t('layout.zoom_fit_selection'))}
        ${entry('zoom_fit_canvas', t('layout.zoom_fit_canvas'))}
        <div role="separator"></div>
        <div class="se-menu-caption" role="presentation"></div>
        ${ZOOM_MENU_STEPS.map((step) => entry(step === 100 ? 'zoom_100' : '', formatZoom(step / 100, editor.i18next.language), `data-zoom="${step}"`)).join('')}
        <div role="separator"></div>
        ${check('toggle_rulers', t('layout.rulers'))}
        ${check('view_grid', t('layout.grid'))}
        ${check('tool_wireframe', t('layout.wireframe'))}
        <div role="separator"></div>
        ${entry('tool_undo', t('tools.undo'))}
        ${entry('tool_redo', t('tools.redo'), 'data-hint="redo_shift"')}
      </se-popover>`
    stage.append(template.content)
    this.$group = stage.querySelector('#se-viewgroup')
    this.$menu = stage.querySelector('#se-zoom-menu')
    this.$toggle = stage.querySelector('#se-panel-toggle')
    this.$zoomButton = stage.querySelector('#se-zoom-button')

    this.$toggle.addEventListener('click', () => editor.commands.execute('toggle_panel'))
    this.$zoomButton.addEventListener('click', () => {
      if (this.$menu.opened) {
        this.$menu.close()
        return
      }
      this.refreshMenu()
      this.$menu.open(this.$zoomButton)
    })
    this.$menu.addEventListener('click', (e) => this.choose(e.target.closest('[role^="menuitem"]')))
    this.registerCommands()
  }

  /**
   * Commands of the canvas layout: the panel and the rulers.
   * @returns {void}
   */
  registerCommands () {
    const { editor } = this
    editor.commands.register({
      id: 'toggle_panel',
      label: 'layout.toggle_panel',
      shortcuts: 'mod+\\',
      run: () => editor.layout.setPanelOpen()
    })
    editor.commands.register({
      id: 'toggle_rulers',
      label: 'layout.rulers',
      shortcuts: 'shift+r',
      run: () => editor.setRulersShown?.(!editor.rulersShown())
    })
    this.panelChanged(editor.layout?.panelOpen ?? true)
  }

  /**
   * #editor_panel of TopPanel, with the buttons the extensions add to it:
   * kept in the group, out of sight (see the module).
   * @param {HTMLElement} panel
   * @returns {void}
   */
  attachEditorPanel (panel) {
    panel.querySelector('.tool_sep')?.remove()
    this.$group.querySelector('.se-editor-panel-slot').replaceWith(panel)
    this.$editorPanel = panel
  }

  /**
   * One entry for each button that an extension adds to #editor_panel: its
   * label, its shortcut, pressed or not, enabled or not; choosing the entry
   * clicks the button.
   * @returns {void}
   */
  refreshMirrors () {
    const { editor } = this
    const buttons = [...(this.$editorPanel?.children ?? [])]
      .filter((el) => el.id && !OWN_ENTRIES.has(el.id) && el.localName === 'se-button')
    const ids = buttons.map((el) => el.id)
    for (const item of [...this.$menu.querySelectorAll('[data-mirror]')]) {
      if (!ids.includes(item.dataset.mirror)) item.remove()
    }
    // After the wireframe entry, in the order of the buttons (the entries are
    // children of the menu itself, which styles and navigates them).
    let anchor = this.$menu.querySelector('[data-command="tool_wireframe"]')
    for (const button of buttons) {
      let item = this.$menu.querySelector(`[data-mirror="${CSS.escape(button.id)}"]`)
      if (!item) {
        item = document.createElement('div')
        item.setAttribute('role', 'menuitemcheckbox')
        item.dataset.mirror = button.id
        item.innerHTML = '<span></span><kbd></kbd>'
      }
      anchor.after(item)
      anchor = item
      const title = button.getAttribute('title')
      item.querySelector('span').textContent = title ? editor.i18next.t(title) : button.id
      item.querySelector('kbd').textContent = editor.commands.hint(button.id) || ''
      item.setAttribute('aria-checked', String(Boolean(button.pressed)))
      item.setAttribute('aria-disabled', String(button.hasAttribute('disabled')))
    }
  }

  /**
   * @param {boolean} open
   * @returns {void}
   */
  panelChanged (open) {
    const { editor } = this
    const label = editor.i18next.t(open ? 'layout.hide_panel' : 'layout.show_panel')
    const hint = editor.commands.hint('toggle_panel')
    this.$toggle.setAttribute('aria-pressed', String(open))
    this.$toggle.setAttribute('aria-label', hint ? `${label} (${hint})` : label)
    this.$toggle.seTooltip = { label, shortcut: hint }
  }

  /**
   * @param {number} zoom
   * @returns {void}
   */
  setZoom (zoom) {
    if (!Number.isFinite(zoom) || zoom <= 0) return
    this.zoom = zoom
    this.$zoomButton.querySelector('.se-zoom-value').textContent = formatZoom(zoom, this.editor.i18next.language)
    if (this.$menu.opened) this.refreshMenu()
  }

  /**
   * States, checks and shortcuts of the entries, when the menu opens.
   * @returns {void}
   */
  refreshMenu () {
    const { editor } = this
    const { commands, svgCanvas } = editor
    const zoom = svgCanvas.getZoom()
    this.$menu.querySelector('.se-menu-caption').textContent =
      editor.i18next.t('layout.zoom_current', { zoom: formatZoom(zoom, editor.i18next.language) })
    const hasSelection = svgCanvas.getSelectedElements().some(Boolean)
    const { undoMgr } = svgCanvas
    const disabled = {
      zoom_fit_selection: !hasSelection,
      tool_undo: undoMgr.getUndoStackSize() === 0,
      tool_redo: undoMgr.getRedoStackSize() === 0
    }
    const checked = {
      toggle_rulers: editor.rulersShown?.() ?? false,
      view_grid: editor.grid?.visible ?? false,
      tool_wireframe: editor.workarea.classList.contains('wireframe')
    }
    this.refreshMirrors()
    for (const item of this.$menu.querySelectorAll('[role^="menuitem"]')) {
      if (item.dataset.mirror) continue
      const command = item.dataset.command
      const hint = commands.hint(item.dataset.hint || command)
      item.querySelector('kbd').textContent = hint || ''
      item.setAttribute('aria-disabled', String(Boolean(disabled[command]) || (command && !item.dataset.zoom && !commands.get(command))))
      if (item.getAttribute('role') === 'menuitemcheckbox') {
        item.setAttribute('aria-checked', String(Boolean(checked[command])))
        // The grid entry exists only with the grid extension.
        item.hidden = command === 'view_grid' && !commands.get(command) && !editor.grid
      }
      if (item.dataset.zoom) {
        item.setAttribute('aria-current', String(Math.abs(zoom * 100 - Number(item.dataset.zoom)) < 0.05))
      }
    }
  }

  /**
   * @param {HTMLElement|null} item
   * @returns {void}
   */
  choose (item) {
    if (!item || item.getAttribute('aria-disabled') === 'true') return
    const { editor } = this
    if (item.dataset.zoom) {
      editor.zoomAt(Number(item.dataset.zoom) / 100)
      return
    }
    if (item.dataset.mirror) {
      editor.$container.querySelector(`#${CSS.escape(item.dataset.mirror)}`)?.click()
      return
    }
    const command = item.dataset.command
    if (command === 'view_grid' && !editor.commands.get(command)) {
      // Without the grid extension, the grid of the interaction layer.
      editor.grid?.setVisible(!editor.grid.visible)
      return
    }
    editor.commands.execute(command)
  }
}
