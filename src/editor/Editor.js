/* globals seConfirm seAlert */
/**
 * The main module for the visual SVG this.
 *
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria
 * 2010 Pavol Rusnak
 * 2010 Jeff Schiller
 * 2010 Narendra Sisodiya
 * 2014 Brett Zamir
 * 2020 OptimistikSAS
 * @module SVGEditor
 */

import './components/index.js'
import './dialogs/index.js'

import { isMac } from '@svgedit/svgcanvas/common/browser'
import { CommandRegistry } from './commands.js'
import { readsOwnKeys, NAVIGATION_KEYS } from './shortcuts.js'

import SvgCanvas from '@svgedit/svgcanvas'
import ConfigObj from './ConfigObj.js'
import EditorStartup from './EditorStartup.js'
import LeftPanel from './panels/LeftPanel.js'
import TopPanel from './panels/TopPanel.js'
import BottomPanel from './panels/BottomPanel.js'
import LayersPanel from './panels/LayersPanel.js'
import MainMenu from './MainMenu.js'
import SystemClipboard from './SystemClipboard.js'
import { getParentsUntil } from '@svgedit/svgcanvas/common/util.js'
// Zoom bounds and ladder shared by every zoom gesture (1 = 100 %), from 1 %
// to 6 400 % (lot V2).
import { clampZoom, nextZoomStep } from './view.js'
import { ungroupSelected } from './binding.js'
import { RETIRED_SHORTCUTS } from './simplification.js'

const { $id, $click, decode64 } = SvgCanvas

/**
 *
 */
/**
 * Elements that read the keys typed in them: fields, menus, dialogs, the tree
 * of the Layers tab, tabs and the width handle of the panel. A keyboard
 * shortcut is not run there.
 * @param {EventTarget} node
 * @returns {boolean}
 */
class Editor extends EditorStartup {
  /**
   *
   */
  constructor (div = null) {
    super(div)
    /**
     * @type {boolean}
     */
    this.langChanged = false
    /**
     * @type {boolean}
     */
    this.showSaveWarning = false
    /**
     * Will be set to a boolean by `ext-storage.js`
     * @type {"ignore"|"waiting"|"closed"}
     */
    this.storagePromptState = 'ignore'
    /**
     * document title
     */
    this.title = 'untitled.svg'

    this.svgCanvas = null
    this.$click = $click
    this.isReady = false
    this.customExportImage = false
    this.customExportPDF = false
    this.configObj = new ConfigObj(this)
    this.configObj.pref = this.configObj.pref.bind(this.configObj)
    this.setConfig = (opts, cfgCfg) => {
      const result = this.configObj.setConfig(opts, cfgCfg)
      // The theme applies at once, also after the editor started (lot V1).
      if (opts && 'theme' in opts) this.theme?.set(this.configObj.pref('theme'))
      // So do the snapping and the grid (lot V2): the canvas had kept the
      // options it started with.
      if (this.svgCanvas) this.svgCanvas.setConfig(this.configObj.curConfig)
      if (opts && ['showGrid', 'snappingStep', 'gridSubdivisions', 'gridColor'].some((key) => key in opts)) {
        this.grid?.update()
        this.frames?.update()
      }
      return result
    }
    this.callbacks = []
    this.curContext = null
    this.exportWindowName = null
    this.docprops = false
    this.configObj.preferences = false
    this.canvMenu = null
    // French and English (lot S3): any other language falls back to English.
    this.goodLangs = ['en', 'fr']

    const modKey = isMac() ? 'meta+' : 'ctrl+'
    /**
     * Every action with a shortcut, from the table below and from the buttons
     * and menu entries (lot V1). Tooltips and menus show the shortcuts it
     * holds, so that a shortcut shown is a shortcut that works.
     * @type {CommandRegistry}
     */
    this.commands = new CommandRegistry({
      translate: (key, fallback) => {
        const text = this.i18next?.t(key)
        return text && text !== key ? text : fallback
      }
    })
    this.shortcuts = [
      // Shortcuts not associated with buttons
      {
        id: 'rotate_left',
        key: ['ctrl+arrowleft', true],
        fn: () => {
          this.rotateSelected(0, 1)
        }
      },
      {
        id: 'rotate_right',
        key: 'ctrl+arrowright',
        fn: () => {
          this.rotateSelected(1, 1)
        }
      },
      {
        id: 'rotate_left_15',
        key: ['ctrl+shift+arrowleft', true],
        fn: () => {
          this.rotateSelected(0, 15)
        }
      },
      {
        id: 'rotate_right_15',
        key: ['ctrl+shift+arrowright', true],
        fn: () => {
          this.rotateSelected(1, 15)
        }
      },
      {
        // Redo: Ctrl+Y (tool_redo button) or the standard Mod+Shift+Z
        id: 'redo_shift',
        key: ['ctrl+shift+z', true],
        fn: () => {
          this.topPanel.clickRedo()
        }
      },
      {
        id: 'select_next',
        key: 'shift+o',
        fn: () => {
          this.svgCanvas.cycleElement(0)
        }
      },
      {
        id: 'select_previous',
        key: 'shift+p',
        fn: () => {
          this.svgCanvas.cycleElement(1)
        }
      },
      {
        // Enter: the objects of the selected group (a path: its nodes, a
        // text: its characters); Shift+Enter: the group that holds the
        // selection.
        id: 'select_children',
        key: ['enter', true],
        fn: () => {
          this.svgCanvas.selectChildren()
        }
      },
      {
        id: 'select_parent',
        key: ['shift+enter', true],
        fn: () => {
          this.svgCanvas.selectParent()
        }
      },
      {
        id: 'select_next_tab',
        key: 'tab',
        fn: () => {
          this.svgCanvas.cycleElement(0)
        }
      },
      {
        id: 'select_previous_tab',
        key: 'shift+tab',
        fn: () => {
          this.svgCanvas.cycleElement(1)
        }
      },
      // View shortcuts: Shift+0 100 %, Shift+1 fit content, Shift+2 fit
      // selection, Shift+3 fit page; Mod+plus / Mod+minus step the zoom.
      {
        id: 'zoom_100',
        key: ['shift+0', true],
        fn: () => {
          this.zoomAt(1)
        }
      },
      {
        id: 'zoom_fit_content',
        key: ['shift+1', true],
        fn: () => {
          this.zoomChanged(window, 'content')
        }
      },
      {
        id: 'zoom_fit_selection',
        key: ['shift+2', true],
        fn: () => {
          if (this.selectedElement || this.multiselected) {
            this.zoomChanged(window, 'selection')
          }
        }
      },
      {
        id: 'zoom_fit_canvas',
        key: ['shift+3', true],
        fn: () => {
          this.zoomChanged(window, 'canvas')
        }
      },
      { id: 'zoom_in', label: 'tools.zoom_in', key: ['ctrl+=/ctrl++/ctrl+shift++', true], fn: () => { this.zoomStep(1) } },
      { id: 'zoom_out', label: 'tools.zoom_out', key: ['ctrl+-', true], fn: () => { this.zoomStep(-1) } },
      {
        id: 'zoom_double',
        key: [modKey + 'arrowup', true],
        fn: () => {
          this.zoomImage(2)
        }
      },
      {
        id: 'zoom_half',
        key: [modKey + 'arrowdown', true],
        fn: () => {
          this.zoomImage(0.5)
        }
      },
      // Order: Mod+] and Mod+[ one step, Mod+Shift+] and Mod+Shift+[ to the
      // front and back; Mod+PageUp/PageDown and Mod+Home/End do the same
      // whatever the keyboard layout (brackets need AltGr on AZERTY).
      { id: 'move_up', label: 'tools.move_up', key: [modKey + ']/ctrl+pageup', true], fn: () => { this.moveUpDownSelected('Up') } },
      { id: 'move_front', label: 'tools.move_front', key: ['ctrl+shift+]/ctrl+home', true], fn: () => { this.topPanel.moveToTopSelected() } },
      { id: 'move_back', label: 'tools.move_back', key: ['ctrl+shift+[/ctrl+end', true], fn: () => { this.topPanel.moveToBottomSelected() } },
      {
        // Duplicate the selection (Mod+D), like the D / C buttons. After the
        // copy has been moved, Mod+D repeats that offset (M7).
        id: 'duplicate',
        label: 'tools.clone',
        key: ['ctrl+d', true],
        fn: () => {
          if (this.selectedElement || this.multiselected) {
            this.svgCanvas.duplicateSelectedElements()
          }
        }
      },
      {
        id: 'group',
        label: 'tools.group',
        key: ['ctrl+g', true],
        fn: () => {
          if (this.multiselected) {
            this.svgCanvas.groupSelectedElements()
          }
        }
      },
      {
        id: 'ungroup',
        label: 'tools.ungroup',
        key: ['ctrl+shift+g', true],
        fn: () => {
          const elem = this.selectedElement
          if (elem && !this.multiselected && ['g', 'a', 'use'].includes(elem.tagName)) {
            // A bound group: asked first (V6)
            ungroupSelected(this)
          }
        }
      },
      {
        id: 'move_down',
        label: 'tools.move_down',
        key: [modKey + '[/ctrl+pagedown', true],
        fn: () => {
          this.moveUpDownSelected('Down')
        }
      },
      {
        id: 'nudge_up',
        key: ['arrowup', true],
        fn: () => {
          this.moveSelected(0, -1)
        }
      },
      {
        id: 'nudge_down',
        key: ['arrowdown', true],
        fn: () => {
          this.moveSelected(0, 1)
        }
      },
      {
        id: 'nudge_left',
        key: ['arrowleft', true],
        fn: () => {
          this.moveSelected(-1, 0)
        }
      },
      {
        id: 'nudge_right',
        key: ['arrowright', true],
        fn: () => {
          this.moveSelected(1, 0)
        }
      },
      {
        id: 'nudge_up_10',
        key: 'shift+arrowup',
        fn: () => {
          this.moveSelected(0, -10)
        }
      },
      {
        id: 'nudge_down_10',
        key: 'shift+arrowdown',
        fn: () => {
          this.moveSelected(0, 10)
        }
      },
      {
        id: 'nudge_left_10',
        key: 'shift+arrowleft',
        fn: () => {
          this.moveSelected(-10, 0)
        }
      },
      {
        id: 'nudge_right_10',
        key: 'shift+arrowright',
        fn: () => {
          this.moveSelected(10, 0)
        }
      },
      {
        id: 'duplicate_up',
        key: ['alt+arrowup', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: 0, y: -1 })
        }
      },
      {
        id: 'duplicate_down',
        key: ['alt+arrowdown', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: 0, y: 1 })
        }
      },
      {
        id: 'duplicate_left',
        key: ['alt+arrowleft', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: -1, y: 0 })
        }
      },
      {
        id: 'duplicate_right',
        key: ['alt+arrowright', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: 1, y: 0 })
        }
      },
      {
        id: 'duplicate_up_10',
        key: ['alt+shift+arrowup', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: 0, y: -10 })
        }
      },
      {
        id: 'duplicate_down_10',
        key: ['alt+shift+arrowdown', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: 0, y: 10 })
        }
      },
      {
        id: 'duplicate_left_10',
        key: ['alt+shift+arrowleft', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: -10, y: 0 })
        }
      },
      {
        id: 'duplicate_right_10',
        key: ['alt+shift+arrowright', true],
        fn: () => {
          this.svgCanvas.duplicateSelectedElements({ x: 10, y: 0 })
        }
      },
      {
        id: 'delete',
        label: 'tools.delete',
        key: ['delete/backspace', true],
        fn: () => {
          // In node editing, the selected nodes (lot Chemins).
          if (this.svgCanvas.getMode() === 'pathedit') {
            this.svgCanvas.pathActions.deletePathNode()
            return
          }
          if (this.selectedElement || this.multiselected) {
            this.svgCanvas.deleteSelectedElements()
          }
        }
      },
      // Alignment and distribution (lot V2, decision D6): Alt and a letter,
      // as in Figma, except Alt+R for the right edge: Alt+D takes the
      // address bar of the browsers on Windows. A selection alone aligns on
      // the page; several on one another, as the reference of the panel
      // says.
      ...[
        ['align_left', 'left', 'alt+a'],
        ['align_center', 'center', 'alt+h'],
        ['align_right', 'right', 'alt+r'],
        ['align_top', 'top', 'alt+w'],
        ['align_middle', 'middle', 'alt+v'],
        ['align_bottom', 'bottom', 'alt+s'],
        ['align_distrib_horiz', 'distrib_horiz', 'alt+shift+h'],
        ['align_distrib_verti', 'distrib_verti', 'alt+shift+v']
      ].map(([id, pos, key]) => ({
        id,
        label: `tools.${id}`,
        key: [key, true],
        fn: () => this.alignSelection(pos)
      })),
      {
        id: 'select_all_a',
        key: 'a',
        fn: () => {
          this.svgCanvas.selectAllInCurrentLayer()
        }
      },
      {
        id: 'select_all',
        label: 'tools.select_all',
        key: [modKey + 'a', true],
        fn: () => {
          this.svgCanvas.selectAllInCurrentLayer()
        }
      },
      // Cut, copy and paste go through the system clipboard (M7): the key
      // announces the action, the browser's clipboard event carries it out.
      // The key must not be prevented, or the event would not follow.
      {
        id: 'cut',
        label: 'tools.cut',
        key: modKey + 'x',
        fn: () => {
          this.systemClipboard.request('cut')
        }
      },
      {
        id: 'copy',
        label: 'tools.copy',
        key: modKey + 'c',
        fn: () => {
          this.systemClipboard.request('copy')
        }
      },
      {
        id: 'paste',
        label: 'tools.paste',
        key: modKey + 'v',
        fn: () => {
          this.systemClipboard.request('paste', { center: true })
        }
      },
      {
        // Paste in place: the objects keep their coordinates.
        id: 'paste_in_place',
        label: 'tools.paste_in_place',
        key: modKey + 'shift+v',
        fn: () => {
          this.systemClipboard.request('paste', { type: 'in_place' })
        }
      },
      {
        // Copy, paste the properties: fill, stroke, opacity, font (M7)
        id: 'copy_properties',
        label: 'tools.copy_properties',
        key: [modKey + 'alt+c', true],
        fn: () => {
          this.copyProperties()
        }
      },
      {
        id: 'paste_properties',
        label: 'tools.paste_properties',
        key: [modKey + 'alt+v', true],
        fn: () => {
          this.pasteProperties()
        }
      },
      {
        // Escape first cancels a drag in progress (move, duplicate, resize,
        // rotation, rubber band). Otherwise it goes up one level: drawing tool
        // -> selection tool, node editing -> selection, open group -> the
        // group selected, selection -> nothing selected.
        id: 'escape',
        key: 'escape',
        fn: () => {
          // enableToolCancel is false while the mouse button is down: only
          // the gesture can be cancelled then, not the tool.
          if (this.svgCanvas.cancelGesture?.()) { return }
          if (!this.enableToolCancel) { return }
          const mode = this.svgCanvas.getMode()
          if (mode === 'pathedit') {
            this.svgCanvas.pathActions.toSelectMode()
            return
          }
          if (mode !== 'select') {
            this.cancelTool()
            return
          }
          // In an open group, up one level, as Shift+Enter: the group is
          // selected in the group that holds it.
          if (this.svgCanvas.selectParent()) { return }
          if (this.svgCanvas.getSelectedElements().some(Boolean)) {
            this.svgCanvas.clearSelection()
          }
        }
      }
    ]
    this.systemClipboard = new SystemClipboard(this)
    this.leftPanel = new LeftPanel(this)
    this.bottomPanel = new BottomPanel(this)
    this.topPanel = new TopPanel(this)
    this.layersPanel = new LayersPanel(this)
    this.mainMenu = new MainMenu(this)
    // makes svgEditor accessible as a global variable
    window.svgEditor = this
  } // end Constructor

  /**
   *
   * @param {string} str SVG string
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.noAlert]
   * @throws {Error} Upon failure to load SVG
   * @returns {void}
   */
  loadSvgString (str, { noAlert } = {}) {
    const success = this.svgCanvas.setSvgString(str) !== false
    if (success) {
      this.updateCanvas()
      // The layers of the new document: list, tree and the layer menu of the
      // toolbar, which kept the name of the previous document's layer.
      this.layersPanel?.populateLayers()
      return
    }
    if (!noAlert) seAlert(this.i18next.t('notification.errorLoadingSVG'))
    throw new Error('Error loading SVG')
  }

  /**
   * All methods are optional.
   * @interface module:SVGthis.CustomHandler
   * @type {PlainObject}
   */
  /**
   * Its responsibilities are:
   *  - invoke a file chooser dialog in 'open' mode
   *  - let user pick a SVG file
   *  - calls [svgCanvas.setSvgString()]{@link module:svgcanvas.SvgCanvas#setSvgString} with the string contents of that file.
   * Not passed any parameters.
   * @function module:SVGthis.CustomHandler#open
   * @returns {void}
   */
  /**
   * Its responsibilities are:
   *  - accept the string contents of the current document
   *  - invoke a file chooser dialog in 'save' mode
   *  - save the file to location chosen by the user.
   * @function module:SVGthis.CustomHandler#save
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:saved} svgStr A string of the SVG
   * @listens module:svgcanvas.SvgCanvas#event:saved
   * @returns {void}
   */
  /**
   * Its responsibilities (with regard to the object it is supplied in its 2nd argument) are:
   *  - inform user of any issues supplied via the "issues" property
   *  - convert the "svg" property SVG string into an image for export;
   *    utilize the properties "type" (currently 'PNG', 'JPEG', 'BMP',
   *    'WEBP', 'PDF'), "mimeType", and "quality" (for 'JPEG' and 'WEBP'
   *    types) to determine the proper output.
   * @function module:SVGthis.CustomHandler#exportImage
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exported} data
   * @listens module:svgcanvas.SvgCanvas#event:exported
   * @returns {void}
   */
  /**
   * @function module:SVGthis.CustomHandler#exportPDF
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exportedPDF} data
   * @listens module:svgcanvas.SvgCanvas#event:exportedPDF
   * @returns {void}
   */

  /**
   * @function module:SVGthis.randomizeIds
   * @param {boolean} arg
   * @returns {void}
   */
  randomizeIds (arg) {
    this.svgCanvas.randomizeIds(arg)
  }

  /**
   *  @lends module:SVGEditor~Actions */
  /**
   * editor shortcuts init
   * @returns {void}
   */
  setAll () {
    // The shortcuts of the table become commands of the registry (lot V1),
    // ahead of those of the buttons, which were declared as the panels
    // were built: the table wins when both bind the same key.
    const buttonCommands = this.commands.list()
    buttonCommands.forEach((command) => this.commands.unregister(command.id))
    // The canvas layout leaves out the letters that repeat another shortcut
    // (lot S1): A for Ctrl+A, Shift+O and Shift+P for Tab and Shift+Tab.
    const retired = this.layout?.canvas ? RETIRED_SHORTCUTS : []
    this.shortcuts.forEach((shortcut, index) => {
      if (!shortcut.key || retired.includes(shortcut.id)) return
      const [spec, pd = false] = Array.isArray(shortcut.key) ? shortcut.key : [shortcut.key]
      this.commands.register({
        id: shortcut.id ?? `shortcut-${index}`,
        label: shortcut.label,
        shortcuts: String(spec),
        run: shortcut.fn,
        preventDefault: Boolean(pd)
      })
    })
    buttonCommands.forEach((command) => this.commands.register(command))
    // Copy, cut and paste events of the system clipboard (M7)
    this.systemClipboard.init()
    // One listener for every shortcut of the editor: the registry runs the
    // first enabled command bound to the key.
    document.addEventListener('keydown', (e) => {
      // The shortcuts run unless a field, a menu, a dialog or a control that
      // reads its own keys has the focus (lot V3: a toolbar button that was
      // clicked no longer takes them away).
      const path = e.composedPath()
      if (path.some(readsOwnKeys)) return
      // On a focused control, Tab, Enter, Space and the arrows keep their
      // meaning there (next control, press, move in a group of buttons).
      const origin = path[0]
      const onControl = origin?.nodeType === 1 && origin !== document.body && origin !== document.documentElement
      if (onControl && NAVIGATION_KEYS.has(e.key)) return
      this.commands.dispatch(e)
    })

    // Misc additional actions

    // Make 'return' keypress trigger the change event
    const elements = document.getElementsByClassName('attr_changer')
    Array.from(elements).forEach(function (element) {
      element.addEventListener('keydown', function (evt) {
        evt.currentTarget.dispatchEvent(new Event('change'))
        evt.preventDefault()
      })
    })
    $id('image_url').addEventListener('keydown', function (evt) {
      evt.currentTarget.dispatchEvent(new Event('change'))
      evt.preventDefault()
    })
  }

  // parents() https://stackoverflow.com/a/12981248
  getParents (el, parentSelector /* optional */) {
    // If no parentSelector defined will bubble up all the way to *document*
    if (parentSelector === undefined) {
      parentSelector = document
    }

    const parents = []
    let p = el.parentNode

    while (p !== parentSelector) {
      const o = p
      parents.push(o)
      p = o.parentNode
    }
    parents.push(parentSelector) // Push that parentSelector you wanted to stop at

    return parents
  }

  /**
   * @param {string} sel Selector to match
   * @returns {module:SVGthis.ToolButton}
   */
  getButtonData (sel) {
    return Object.values(this.shortcuts).find((btn) => {
      return btn.sel === sel
    })
  }

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:exported} data
   * @listens module:svgcanvas.SvgCanvas#event:exported
   * @returns {void}
   */
  exportHandler (win, data) {
    const { issues, exportWindowName } = data
    this.exportWindow = window.open('', exportWindowName) // A hack to get the window via JSON-able name without opening a new one
    if (!this.exportWindow || this.exportWindow.closed) {
      seAlert(this.i18next.t('notification.popupWindowBlocked'))
      return
    }

    this.exportWindow.location.href = data.bloburl || data.datauri
    const done = this.configObj.pref('export_notice_done')
    if (done !== 'all') {
      let note = this.i18next.t('notification.saveFromBrowser', {
        type: data.type
      })

      // Check if there are issues
      if (issues.length) {
        const pre = '\n \u2022 '
        note +=
          '\n\n' +
          this.i18next.t('notification..noteTheseIssues') +
          pre +
          issues.join(pre)
      }
      // Note that this will also prevent the notice even though new issues may appear later.
      // May want to find a way to deal with that without annoying the user
      this.configObj.pref('export_notice_done', 'all')
      seAlert(note)
    }
  }

  /**
   *
   * @param {string} color
   * @param {string} url
   * @returns {void}
   */
  setBackground (color, url) {
    // if (color == this.configObj.pref('bkgd_color') && url == this.configObj.pref('bkgd_url')) { return; }
    this.configObj.pref('bkgd_color', color)
    this.configObj.pref('bkgd_url', url, true)

    // This should be done in  this.svgCanvas.js for the borderRect fill
    this.svgCanvas.setBackground(color, url)
  }

  /**
   * Shows a message that does not block (lot V1).
   * @param {string} text
   * @param {{type?: "info"|"warning"|"error", duration?: number}} [options]
   * @returns {HTMLElement|null} The message
   */
  toast (text, options = {}) {
    return this.$toasts?.show(text, { closeLabel: this.i18next?.t('ui.close'), ...options }) ?? null
  }

  /**
   * Whether changes are waiting to be saved. The top bar of the canvas
   * layout shows it (lot V3); a host that saves the document sets it back
   * to false.
   * @type {boolean}
   */
  get showSaveWarning () {
    return Boolean(this._showSaveWarning)
  }

  set showSaveWarning (value) {
    this._showSaveWarning = Boolean(value)
    this.layout?.saveStateChanged()
  }

  /**
   * Shows the zoom in the zoom field (classic layout) or the zoom menu
   * (canvas layout).
   * @param {number} zoom 1 for 100 %
   * @returns {void}
   */
  showZoom (zoom) {
    document.getElementById('zoom')?.syncValue((zoom * 100).toFixed(1))
    this.layout?.zoomChanged(zoom)
  }

  /**
   * @returns {boolean} Whether the rulers are shown
   */
  rulersShown () {
    return Boolean(this.configObj.curConfig.showRulers)
  }

  /**
   * Shows or hides the rulers (Shift+R, zoom menu, preferences).
   * @param {boolean} on
   * @returns {void}
   */
  setRulersShown (on) {
    this.configObj.curConfig.showRulers = Boolean(on)
    this.rulers?.display(Boolean(on))
    this.$svgEditor?.classList.toggle('se-rulers-hidden', !on)
    if (on) this.rulers?.updateRulers()
  }

  /**
   * Sets the theme of the interface and remembers it. The document is not
   * touched.
   * @param {"system"|"dark"|"light"} theme
   * @returns {void}
   */
  setTheme (theme) {
    this.theme?.set(theme)
    this.configObj.pref('theme', this.theme?.preference ?? theme)
  }

  /**
   * @function module:SVGthis.updateCanvas
   * @param {boolean} center
   * @param {module:math.XYObject} newCtr
   * @returns {void}
   */
  updateCanvas (center, newCtr) {
    // The borderless view places the drawing itself (lot V2), the only view
    // since lot S3.
    this.view?.layout({ center, newCtr })
  }

  /**
   *
   * @returns {void}
   */
  updateWireFrame () {
    const rule = `
      #workarea.wireframe #svgcontent * {
        stroke-width: ${1 / this.svgCanvas.getZoom()}px;
      }
    `
    if (document.querySelectorAll('#wireframe_rules').length > 0) {
      document.querySelector('#wireframe_rules').textContent =
        this.workarea.classList.contains('wireframe') ? rule : ''
    }
  }

  // called when we've selected a different element
  /**
   *
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:selected} elems Array of elements that were selected
   * @listens module:svgcanvas.SvgCanvas#event:selected
   * @fires module:svgcanvas.SvgCanvas#event:ext_selectedChanged
   * @returns {void}
   */
  selectedChanged (win, elems) {
    const mode = this.svgCanvas.getMode()
    if (mode === 'select') {
      this.leftPanel.clickSelect()
    }
    const isNode = mode === 'pathedit'
    // if this.elems[1] is present, then we have more than one element
    this.selectedElement = elems.length === 1 || !elems[1] ? elems[0] : null
    this.multiselected = elems.length >= 2 && !!elems[1]
    if (this.selectedElement && !isNode) {
      this.topPanel.update()
    } // if (elem)

    // Deal with pathedit mode
    this.topPanel.togglePathEditMode(isNode, elems)
    this.topPanel.updateContextPanel()
    // The rules of the style sheets that give the values shown (lot S2)
    this.classStyles?.refresh()
    this.svgCanvas.runExtensions(
      'selectedChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_selectedChanged} */ {
        elems,
        selectedElement: this.selectedElement,
        multiselected: this.multiselected
      }
    )
  }

  // Call when part of element is in process of changing, generally
  // on mousemove actions like rotate, move, etc.
  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:transition} elems
   * @listens module:svgcanvas.SvgCanvas#event:transition
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementTransition
   * @returns {void}
   */
  elementTransition (win, elems) {
    const mode = this.svgCanvas.getMode()
    const elem = elems[0]
    // The orthogonal connectors follow the moving equipments (lot V7).
    this.connectors?.transition(elems)

    if (!elem) {
      return
    }

    this.multiselected = elems.length >= 2 && elems[1]
    if (this.multiselected && mode === 'rotate') {
      // The angle the elements share follows the rotation.
      this.topPanel.updateSelectionAngle()
    } else if (!this.multiselected) {
      switch (mode) {
        case 'rotate': {
          const ang = this.svgCanvas.getRotationAngle(elem)
          $id('angle').value = ang
          ang === 0
            ? $id('tool_reorient').classList.add('disabled')
            : $id('tool_reorient').classList.remove('disabled')
          break
        }
      }
    }
    this.svgCanvas.runExtensions(
      'elementTransition',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementTransition} */ {
        elems
      }
    )
  }

  // called when any element has changed
  /**
   * @param {external:Window} win
   * @param {Array<PlainObject>} elems
   * @listens module:svgcanvas.SvgCanvas#event:changed
   * @fires module:svgcanvas.SvgCanvas#event:ext_elementChanged
   * @returns {void}
   */
  elementChanged (win, elems) {
    const mode = this.svgCanvas.getMode()
    // Their route follows every change, the undo and redo included (lot V7).
    this.connectors?.elementsChanged(elems)
    if (mode === 'select') {
      this.leftPanel.clickSelect()
    }

    elems.forEach((elem) => {
      const isSvgElem = elem?.tagName === 'svg'
      if (isSvgElem || this.svgCanvas.isLayer(elem)) {
        this.layersPanel.populateLayers()
        // if the element changed was the svg, then it could be a resolution change
        if (isSvgElem) {
          this.updateCanvas()
        }
        // Update selectedElement if element is no longer part of the image.
        // This occurs for the text elements in Firefox. Not for a
        // multi-selection: the panel would show the last changed element alone
        // (and, in the angle field, its own angle).
      } else if (elem && !this.multiselected && !this.selectedElement?.parentNode && !elem.closest?.('metadata') &&
        elem.localName !== 'style') {
        // Not the frames to export, nor other data of the editor (lot V5),
        // nor a style sheet whose rule a step changed (lot S2).
        this.selectedElement = elem
      }
    })

    this.showSaveWarning = true
    // The tree of the Layers tab follows the document (lot V3).
    this.layout?.documentChanged()

    // we update the contextual panel with potentially new
    // positional/sizing information (we DON'T want to update the
    // toolbar here as that creates an infinite loop)
    // also this updates the history buttons

    // we tell it to skip focusing the text control if the
    // text element was previously in focus
    this.topPanel.updateContextPanel()

    // In the event a gradient was flipped:
    if (this.selectedElement && mode === 'select') {
      this.bottomPanel.updateColorpickers()
    }
    this.classStyles?.refresh()

    this.svgCanvas.runExtensions(
      'elementChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementChanged} */ {
        elems
      }
    )
  }

  /**
   * Says, in one message, what an import, an opening or an ungrouping could
   * not keep.
   * @param {external:Window} win
   * @param {{action: 'import'|'open'|'ungroup', items: string[]}} removed
   * @returns {void}
   */
  contentRemoved (win, { action, items }) {
    const messages = {
      import: ['notification.importRemoved', 'These contents of the imported file were removed, as they are not supported or would apply to the whole drawing: {{list}}'],
      open: ['notification.openRemoved', 'These contents of the opened file are not supported and were removed: {{list}}'],
      ungroup: ['notification.ungroupRemoved', 'These styles of the ungrouped objects could not become attributes and were removed: {{list}}']
    }
    const [key, defaultValue] = messages[action] || messages.import
    const shown = items.slice(0, 12).join(', ') + (items.length > 12 ? ` … (+${items.length - 12})` : '')
    // Shown as text, not markup: the items (<script>...) are not escaped
    seAlert(this.i18next.t(key, { defaultValue, list: shown, interpolation: { escapeValue: false } }))
  }

  /**
   * @returns {void}
   */
  elementRenamed (win, renameObj) {
    this.svgCanvas.runExtensions(
      'elementRenamed',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_elementRenamed} */ {
        renameObj
      }
    )
  }

  /**
   * @returns {void}
   */
  afterClear (win) {
    this.svgCanvas.runExtensions('afterClear')
  }

  /**
   * @returns {void}
   */
  beforeClear (win) {
    this.svgCanvas.runExtensions('beforeClear')
  }

  /**
   * @returns {void}
   */
  zoomDone () {
    // Read every selection box first, then resize the selectors: interleaving
    // reads and writes forced one layout per selected element.
    const elements = this.svgCanvas.selectedElements.filter(Boolean)
    const measure = this.svgCanvas.getSelector().getSelectionBBox
    const boxes = elements.map((el) => measure(el))
    elements.forEach((el, index) => {
      this.svgCanvas.selectorManager.requestSelector(el).resize(boxes[index], Boolean(boxes[index]))
    })
    this.updateWireFrame()
  }

  /**
   * @typedef {PlainObject} module:SVGthis.BBoxObjectWithFactor (like `DOMRect`)
   * @property {Float} x
   * @property {Float} y
   * @property {Float} width
   * @property {Float} height
   * @property {Float} [factor] Needed if width or height are 0
   * @property {Float} [zoom]
   * @see module:svgcanvas.SvgCanvas#event:zoomed
   */

  /**
   * @function module:svgcanvas.SvgCanvas#zoomChanged
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:zoomed} bbox
   * @param {boolean} autoCenter
   * @listens module:svgcanvas.SvgCanvas#event:zoomed
   * @fires module:svgcanvas.SvgCanvas#event:ext_zoomChanged
   * @returns {void}
   */
  zoomChanged (win, bbox, autoCenter) {
    // The borderless view has no scroll bar.
    const zInfo = this.svgCanvas.setBBoxZoom(
      bbox,
      parseFloat(getComputedStyle(this.workarea, null).width.replace('px', '')),
      parseFloat(getComputedStyle(this.workarea, null).height.replace('px', ''))
    )
    if (!zInfo) {
      return
    }
    // Fitting a tiny object asks for more than the view gives.
    if (clampZoom(zInfo.zoom) !== zInfo.zoom) {
      zInfo.zoom = clampZoom(zInfo.zoom)
      this.svgCanvas.setZoom(zInfo.zoom)
    }
    const zoomlevel = zInfo.zoom
    const bb = zInfo.bbox

    if (zoomlevel < 0.001) {
      // Editor has no changeZoom method: this branch used to throw.
      this.zoomAt(0.1)
      return
    }

    this.showZoom(this.svgCanvas.getZoom())

    if (autoCenter) {
      this.updateCanvas()
    } else {
      this.updateCanvas(false, {
        x: bb.x * zoomlevel + (bb.width * zoomlevel) / 2,
        y: bb.y * zoomlevel + (bb.height * zoomlevel) / 2
      })
    }

    if (this.svgCanvas.getMode() === 'zoom' && bb.width) {
      // Go to select if a zoom box was drawn
      this.leftPanel.clickSelect()
    }

    this.zoomDone()

    this.svgCanvas.runExtensions(
      'zoomChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_zoomChanged} */ this.svgCanvas.getZoom()
    )
  }

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:contextset} context
   * @listens module:svgcanvas.SvgCanvas#event:contextset
   * @returns {void}
   */
  contextChanged (win, context) {
    const panel = $id('cur_context_panel')
    // Layer names and group ids come from the edited document: the breadcrumb
    // is built with DOM nodes so they are never parsed as HTML.
    panel.replaceChildren()
    if (context) {
      let str = ''
      const rootLink = document.createElement('a')
      rootLink.href = '#'
      rootLink.dataset.root = 'y'
      rootLink.textContent = this.svgCanvas.getCurrentDrawing().getCurrentLayerName()
      panel.append(rootLink)
      // From the outermost group to the open one (the list went the other
      // way, which read backwards once groups are nested).
      const parentsUntil = getParentsUntil(context, '#svgcontent').reverse()
      parentsUntil.forEach(function (parent) {
        if (parent.id) {
          str += ' > ' + parent.id
          panel.append(' > ')
          if (parent !== context) {
            const link = document.createElement('a')
            link.href = '#'
            link.textContent = parent.id
            panel.append(link)
          } else {
            panel.append(parent.id)
          }
        }
      })

      this.curContext = str
    } else {
      this.curContext = null
    }
    panel.style.display = context ? 'block' : 'none'
  }

  /**
   * @function module:SVGEditor.setIcon
   * @param {string|Element|external:jQuery} elem
   * @param {string|external:jQuery} iconId
   * @returns {void}
   */
  setIcon (elem, iconId) {
    const img = document.createElement('img')
    img.src = this.configObj.curConfig.imgPath + iconId
    const icon = typeof iconId === 'string' ? img : iconId.cloneNode(true)
    if (!icon) {
      // Todo: Investigate why this still occurs in some cases
      console.warn('NOTE: Icon image missing: ' + iconId)
      return
    }
    // empty()
    while ($id(elem).firstChild) {
      $id(elem).removeChild($id(elem).firstChild)
    }
    $id(elem).appendChild(icon)
  }

  /**
   * @param {external:Window} win
   * @param {module:svgcanvas.SvgCanvas#event:extension_added} ext
   * @listens module:svgcanvas.SvgCanvas#event:extension_added
   * @returns {Promise<void>|void} Resolves to `undefined`
   */
  async extAdded (win, ext) {
    if (!ext) {
      return undefined
    }
    let cbCalled = false

    /**
     *
     * @returns {void}
     */
    const runCallback = () => {
      if (ext.callback && !cbCalled) {
        cbCalled = true
        ext.callback.call(this)
      }
    }

    if (ext.events) {
      this.leftPanel.add(ext.events.id, ext.events.click)
    }
    return runCallback()
  }

  /**
   * Zooms to a level, keeping the document point under a screen position
   * fixed. Every zoom gesture (wheel, pinch, keyboard steps) goes through it,
   * with the same bounds.
   * @param {Float} level - Requested zoom (1 = 100 %), clamped to the bounds
   * @param {Float} [clientX] - Anchor, in client coordinates; defaults to the view center
   * @param {Float} [clientY]
   * @returns {void}
   */
  zoomAt (level, clientX, clientY) {
    const zoom = this.svgCanvas.getZoom()
    const newZoom = clampZoom(level)
    if (!Number.isFinite(newZoom) || Math.abs(newZoom - zoom) < 1e-9) { return }
    this.view?.zoomAt(newZoom, clientX, clientY)
    this.showZoom(newZoom)
    this.zoomDone()
    this.svgCanvas.runExtensions('zoomChanged', newZoom)
  }

  /**
   * Zooms to the next or previous step of the zoom ladder, around the view
   * center.
   * @param {1|-1} direction
   * @returns {void}
   */
  zoomStep (direction) {
    this.zoomAt(nextZoomStep(this.svgCanvas.getZoom(), direction))
  }

  /**
   * @param {Float} multiplier
   * @returns {void}
   */
  zoomImage (multiplier) {
    const resolution = this.svgCanvas.getResolution()
    multiplier = multiplier ? resolution.zoom * multiplier : 1
    multiplier = clampZoom(multiplier)
    // setResolution(res.w * multiplier, res.h * multiplier, true);
    this.showZoom(multiplier)
    this.svgCanvas.setCurrentZoom(multiplier)
    this.zoomDone()
    this.updateCanvas(true)
  }

  /**
   *
   * @returns {void}
   */
  cutSelected () {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.cutSelectedElements()
    }
  }

  /**
   * @function copySelected
   * @returns {void}
   */
  copySelected () {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.copySelectedElements()
    }
  }

  /**
   *
   * @returns {void}
   */
  pasteInCenter () {
    const { x, y } = this.getViewCenter()
    this.svgCanvas.pasteElements('point', x, y)
  }

  /**
   * The middle of the visible part of the canvas, in drawing coordinates:
   * where Mod+V pastes.
   * @returns {{x: number, y: number}}
   */
  getViewCenter () {
    return this.view.center
  }

  /**
   * Aligns or distributes the selection (lot V2, decision D6): on the page
   * for a selection alone, else on the reference of the panel.
   * @param {"left"|"center"|"right"|"top"|"middle"|"bottom"|"distrib_horiz"|"distrib_verti"} pos
   * @returns {void}
   */
  alignSelection (pos) {
    const selected = this.svgCanvas.getSelectedElements().filter(Boolean)
    if (!selected.length || this.svgCanvas.getMode() !== 'select') return
    if (selected.length === 1) {
      if (!pos.startsWith('distrib')) this.svgCanvas.alignSelectedElements(pos, 'page')
      return
    }
    this.topPanel.clickAlign(pos)
  }

  /**
   * Copies the fill, stroke, opacity and font of the first selected object.
   * @returns {void}
   */
  copyProperties () {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.copySelectedProperties()
    }
  }

  /**
   * Gives the copied properties to the selected objects.
   * @returns {void}
   */
  pasteProperties () {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.pasteProperties()
    }
  }

  /**
   * @param {"Up"|"Down"} dir
   * @returns {void}
   */
  moveUpDownSelected (dir) {
    if (this.selectedElement || this.multiselected) {
      this.svgCanvas.moveUpDownSelected(dir)
    }
  }

  /**
   * @param {Float} dx
   * @param {Float} dy
   * @returns {void}
   */
  moveSelected (dx, dy) {
    const step = this.configObj.curConfig.gridSnapping
      ? this.configObj.curConfig.snappingStep
      : 1
    if (this.svgCanvas.getMode() === 'pathedit') {
      // In node editing, the arrows move the selected nodes (lot Chemins),
      // in a row one undo step.
      this.svgCanvas.undoMgr.merging('nudge', () => this.svgCanvas.pathActions.moveSelectedPoints(dx * step, dy * step))
      return
    }
    if (this.selectedElement || this.multiselected) {
      // Arrow keys move by document units (one grid step when snapping),
      // whatever the zoom. moveSelectedElements expects screen pixels.
      const multi = this.svgCanvas.getZoom() * step
      // Nudges in a row are one undo step (lot V5).
      this.svgCanvas.undoMgr.merging('nudge', () => this.svgCanvas.moveSelectedElements(dx * multi, dy * multi))
    }
  }

  /**
   *
   * @returns {void}
   */
  selectNext () {
    this.svgCanvas.cycleElement(1)
  }

  /**
   *
   * @returns {void}
   */
  selectPrev () {
    this.svgCanvas.cycleElement(0)
  }

  /**
   * @param {0|1} cw
   * @param {Integer} step
   * @returns {void}
   */
  rotateSelected (cw, step) {
    if (!cw) {
      step *= -1
    }
    if (this.multiselected) {
      // The whole selection turns about the center of its frame.
      this.svgCanvas.rotateSelectedElements(step)
      this.topPanel.updateContextPanel()
      return
    }
    if (!this.selectedElement) {
      return
    }
    const angle = Number.parseFloat($id('angle').value) + step
    this.svgCanvas.setRotationAngle(angle)
    this.topPanel.updateContextPanel()
  }

  /**
   *
   * @returns {void}
   */
  hideSourceEditor () {
    const $editorDialog = $id('se-svg-editor-dialog')
    $editorDialog.setAttribute('dialog', 'closed')
  }

  /**
   * @param {Event} e
   * @returns {void} Resolves to `undefined`
   */
  async saveSourceEditor (e) {
    const $editorDialog = $id('se-svg-editor-dialog')
    if ($editorDialog.getAttribute('dialog') !== 'open') return
    const saveChanges = () => {
      this.svgCanvas.clearSelection()
      this.hideSourceEditor()
      this.zoomImage()
      this.layersPanel.populateLayers()
    }

    if (!this.svgCanvas.setSvgString(e.detail.value)) {
      const ok = await seConfirm(
        this.i18next.t('notification.QerrorsRevertToSource')
      )
      if (ok === false || ok === 'Cancel') {
        return
      }
      saveChanges()
      return
    }
    saveChanges()
    this.leftPanel.clickSelect()
  }

  /**
   * @param {Event} e
   * @returns {void} Resolves to `undefined`
   */
  async cancelOverlays (e) {
    if ($id('dialog_box') != null) $id('dialog_box').style.display = 'none'
    const $editorDialog = $id('se-svg-editor-dialog')
    const editingsource = $editorDialog.getAttribute('dialog') === 'open'
    if (!editingsource && !this.docprops && !this.configObj.preferences) {
      if (this.curContext) {
        this.svgCanvas.leaveContext()
      }
      return
    }

    if (editingsource) {
      const origSource = this.svgCanvas.getSvgString()
      if (origSource !== e.detail.value) {
        // Wait for the answer before discarding the edited source.
        const ok = await seConfirm(
          this.i18next.t('notification.QignoreSourceChanges')
        )
        if (ok !== false && ok !== 'Cancel') {
          this.hideSourceEditor()
        }
      } else {
        this.hideSourceEditor()
      }
    }
  }

  /**
   * @returns {void}
   */
  toggleDynamicOutput (e) {
    this.configObj.curConfig.dynamicOutput = e.detail.dynamic
    this.svgCanvas.setConfig(this.configObj.curConfig)
    const $editorDialog = document.getElementById('se-svg-editor-dialog')
    const origSource = this.svgCanvas.getSvgString()
    $editorDialog.setAttribute('dialog', 'open')
    $editorDialog.setAttribute('value', origSource)
  }

  /**
   * @returns {void}
   */
  enableOrDisableClipboard () {
    // The system clipboard may hold SVG from another application (M7).
    const canPaste = this.systemClipboard.canPaste()
    this.canvMenu.setAttribute(
      (canPaste ? 'en' : 'dis') + 'ablemenuitems',
      '#paste,#paste_in_place'
    )
    this.updatePropertiesMenu()
  }

  /**
   * Enables "Copy properties" when an object can give them, and "Paste
   * properties" when some have been copied and objects are selected.
   * @returns {void}
   */
  updatePropertiesMenu () {
    const menu = this.canvMenu
    if (!menu?.setItemEnabled) return
    const selected = this.svgCanvas.getSelectedElements().some(Boolean)
    const editingNodes = this.svgCanvas.getMode() === 'pathedit'
    menu.setItemEnabled('copy_properties', selected && !editingNodes)
    menu.setItemEnabled(
      'paste_properties',
      selected && !editingNodes && this.svgCanvas.hasCopiedProperties()
    )
  }

  /**
   * Asks how direct use-target conflicts should be resolved during paste.
   * @param {Window} _win
   * @param {{conflicts: string[]}} conflictInfo
   * @returns {Promise<'use-existing'|'replace-existing'|'keep-both'|'cancel'>}
   */
  async resolveClipboardConflicts (_win, { conflicts = [] } = {}) {
    const useExisting = this.i18next.t('notification.clipboardUseExisting')
    const replaceExisting = this.i18next.t('notification.clipboardReplaceExisting')
    const keepBoth = this.i18next.t('notification.clipboardKeepBoth')
    const message = this.i18next.t('notification.clipboardDefsConflict', {
      ids: conflicts.join(', ')
    })
    const response = await seConfirm(message, [
      useExisting,
      replaceExisting,
      keepBoth
    ])

    if (response === useExisting) return 'use-existing'
    if (response === replaceExisting) return 'replace-existing'
    if (response === keepBoth) return 'keep-both'
    return 'cancel'
  }

  /**
   * @function module:SVGthis.openPrep
   * @returns {boolean|Promise<boolean>} Resolves to boolean indicating `true` if there were no changes
   *  and `false` after the user confirms.
   */
  async openPrep () {
    if (this.svgCanvas.undoMgr.getUndoStackSize() === 0) {
      return true
    }
    return await seConfirm(this.i18next.t('notification.QwantToOpen'))
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  onDragEnter (e) {
    e.stopPropagation()
    e.preventDefault()
    // and indicator should be displayed here, such as "drop files here"
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  onDragOver (e) {
    e.stopPropagation()
    e.preventDefault()
  }

  /**
   *
   * @param {Event} e
   * @returns {void}
   */
  onDragLeave (e) {
    e.stopPropagation()
    e.preventDefault()
    // hypothetical indicator should be removed here
  }

  /**
   * @function module:SVGthis.setLang
   * @param {string} lang The language code
   * @param {module:locale.LocaleStrings} allStrings See {@tutorial LocaleDocs}
   * @fires module:svgcanvas.SvgCanvas#event:ext_langReady
   * @fires module:svgcanvas.SvgCanvas#event:ext_langChanged
   * @returns {void} A Promise which resolves to `undefined`
   */
  setLang (lang) {
    this.langChanged = true
    this.configObj.pref('lang', lang)
    const $editDialog = $id('se-edit-prefs')
    $editDialog.setAttribute('lang', lang)
    const oldLayerName = $id('#layerlist')
      ? $id('#layerlist').querySelector('tr.layersel td.layername').textContent
      : ''
    const renameLayer =
      oldLayerName === this.i18next.t('notification.common.layer') + ' 1'

    this.setTitles()

    if (renameLayer) {
      this.svgCanvas.renameCurrentLayer(
        this.i18next.t('notification.common.layer') + ' 1'
      )
      this.layersPanel.populateLayers()
    }

    this.svgCanvas.runExtensions(
      'langChanged',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_langChanged} */ lang
    )
  }

  /**
   * @callback module:SVGthis.ReadyCallback
   * @returns {Promise<void>|void}
   */
  /**
   * Queues a callback to be invoked when the editor is ready (or
   *   to be invoked immediately if it is already ready--i.e.,
   *   if `runCallbacks` has been run).
   * @function module:SVGthis.ready
   * @param {module:SVGthis.ReadyCallback} cb Callback to be queued to invoke
   * @returns {Promise<ArbitraryCallbackResult>} Resolves when all callbacks, including the supplied have resolved
   */
  ready (cb) {
    return new Promise((resolve, reject) => {
      if (this.isReady) {
        resolve(cb())
        return
      }
      this.callbacks.push([cb, resolve, reject])
    })
  }

  /**
   * Invokes the callbacks previous set by `svgthis.ready`
   * @function module:SVGthis.runCallbacks
   * @returns {Promise<void>} Resolves to `undefined` if all callbacks succeeded and rejects otherwise
   */
  async runCallbacks () {
    try {
      await Promise.all(
        this.callbacks.map(([cb]) => {
          return cb()
        })
      )
    } catch (err) {
      this.callbacks.forEach(([, , reject]) => {
        reject()
      })
      throw err
    }
    this.callbacks.forEach(([, resolve]) => {
      resolve()
    })
    this.isReady = true
  }

  /**
   * @function module:SVGthis.loadFromString
   * @param {string} str The SVG string to load
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.noAlert=false] Option to avoid alert to user and instead get rejected promise
   * @returns {Promise<void>}
   */
  loadFromString (str, { noAlert } = {}) {
    return this.ready(async () => {
      try {
        await this.loadSvgString(str, { noAlert })
      } catch (err) {
        if (noAlert) {
          throw err
        }
      }
    })
  }

  /**
   * @callback module:SVGthis.URLLoadCallback
   * @param {boolean} success
   * @returns {void}
   */
  /**
   * @function module:SVGthis.loadFromURL
   * @param {string} url URL from which to load an SVG string via Ajax
   * @param {PlainObject} [opts={}] May contain properties: `cache`, `callback`
   * @param {boolean} [opts.cache]
   * @param {boolean} [opts.noAlert]
   * @returns {Promise<void>} Resolves to `undefined` or rejects upon bad loading of
   *   the SVG (or upon failure to parse the loaded string) when `noAlert` is
   *   enabled
   */
  loadFromURL (url, { cache, noAlert } = {}) {
    return this.ready(() => {
      return new Promise((resolve, reject) => {
        fetch(url, { cache: cache ? 'force-cache' : 'no-cache' })
          .then((response) => {
            if (!response.ok) {
              if (noAlert) {
                reject(new Error('URLLoadFail'))
                return
              }
              seAlert(this.i18next.t('notification.URLLoadFail'))
              resolve()
            }
            return response.text()
          })
          .then((str) => {
            this.loadSvgString(str, { noAlert })
            resolve(str)
          })
          .catch((error) => {
            if (noAlert) {
              reject(new Error('URLLoadFail'))
              return
            }
            seAlert(
              this.i18next.t('notification.URLLoadFail') + ': \n' + error
            )
            resolve()
          })
      })
    })
  }

  /**
   * @function module:SVGthis.loadFromDataURI
   * @param {string} str The Data URI to base64-decode (if relevant) and load
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.noAlert]
   * @returns {Promise<void>} Resolves to `undefined` and rejects if loading SVG string fails and `noAlert` is enabled
   */
  loadFromDataURI (str, { noAlert } = {}) {
    return this.ready(() => {
      let base64 = false
      let pre = str.match(/^data:image\/svg\+xml;base64,/)
      if (pre) {
        base64 = true
      } else {
        pre = str.match(/^data:image\/svg\+xml(?:;|;utf8)?,/)
      }
      if (pre) {
        pre = pre[0]
      }
      const src = str.slice(pre.length)
      return this.loadSvgString(
        base64 ? decode64(src) : decodeURIComponent(src),
        { noAlert }
      )
    })
  }

  /**
   * @function module:SVGthis.addExtension
   * @param {string} name Used internally; no need for i18n.
   * @param {module:svgcanvas.ExtensionInitCallback} initfn Config to be invoked on this module
   * @param {module:svgcanvas.ExtensionInitArgs} initArgs
   * @throws {Error} If called too early
   * @returns {Promise<void>} Resolves to `undefined`
   */
  addExtension (name, initfn, initArgs) {
    // Note that we don't want this on this.ready since some extensions
    // may want to run before then (like server_opensave).
    if (!this.svgCanvas) {
      throw new Error('Extension added too early')
    }
    return this.svgCanvas.addExtension(name, initfn, initArgs)
  }
}

export default Editor
