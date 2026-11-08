/**
 * The system clipboard (M7).
 *
 * Copying writes the selection as SVG text, in `text/plain` and in
 * `image/svg+xml`, so that it can be pasted into another browser or another
 * application. Pasting reads the system clipboard: SVG text that does not
 * come from this editor is pasted through the import filter of an opened file
 * (`svgCanvas.pasteSvgString`); otherwise the editor's own clipboard is
 * pasted, which keeps definitions and identifiers exactly as before.
 *
 * Browsers only give the clipboard to the `copy`, `cut` and `paste` events
 * (or, for the context menu, to the asynchronous Clipboard API). The keyboard
 * shortcuts therefore only announce the action; the event that follows
 * carries it out. When no event follows, the editor's clipboard alone is used,
 * as before.
 * @module SystemClipboard
 */

const SVG_TYPE = 'image/svg+xml'
const TEXT_TYPE = 'text/plain'

/**
 * Tells whether text looks like SVG markup.
 * @param {string} text
 * @returns {boolean}
 */
const looksLikeSvg = (text) => typeof text === 'string' && /<svg[\s>]/i.test(text)

/**
 * Compares two SVG texts, ignoring the line ends that some systems change.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const sameText = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  a.replace(/\r\n?/g, '\n').trim() === b.replace(/\r\n?/g, '\n').trim()

export default class SystemClipboard {
  /**
   * @param {module:SVGEditor} editor
   */
  constructor (editor) {
    this.editor = editor
    /** The action announced by a shortcut or a menu, until its event arrives. */
    this.pending = null
    /**
     * True when the last copy could not reach the system clipboard: the
     * system clipboard then holds older content, and the editor's own
     * clipboard is pasted instead.
     */
    this.internalIsNewer = false
  }

  get canvas () {
    return this.editor.svgCanvas
  }

  /**
   * @returns {boolean} Whether objects are selected
   */
  hasSelection () {
    return this.canvas.getSelectedElements().some(Boolean)
  }

  /**
   * Whether a clipboard event is for the canvas: announced by the editor, or
   * fired with no field or text focused. In a field, the browser copies and
   * pastes text as usual.
   * @param {ClipboardEvent} evt
   * @returns {boolean}
   */
  ownsEvent (evt) {
    return Boolean(this.pending) || evt.target === document.body
  }

  /**
   * Listens to the clipboard events.
   * @returns {void}
   */
  init () {
    // Chromium only fires copy, cut and paste outside of editable content
    // when the matching "before" event is cancelled.
    const allow = (needsSelection) => (evt) => {
      if (this.ownsEvent(evt) && (!needsSelection || this.hasSelection())) {
        evt.preventDefault()
      }
    }
    document.addEventListener('beforecopy', allow(true))
    document.addEventListener('beforecut', allow(true))
    document.addEventListener('beforepaste', allow(false))
    document.addEventListener('copy', (evt) => this.onCopy(evt, 'copy'))
    document.addEventListener('cut', (evt) => this.onCopy(evt, 'cut'))
    document.addEventListener('paste', (evt) => this.onPaste(evt))
  }

  /**
   * Announces an action from a keyboard shortcut. The browser fires the
   * matching clipboard event right after the key, in the same task; if it
   * does not, the action is done with the editor's clipboard alone.
   * @param {'copy'|'cut'|'paste'} kind
   * @param {{type?: 'in_place'}} [options] - For a paste
   * @returns {void}
   */
  request (kind, options = {}) {
    if (kind !== 'paste' && !this.hasSelection()) return
    const pending = { kind, ...options }
    this.pending = pending
    setTimeout(() => {
      if (this.pending === pending) {
        this.pending = null
        this.fallback(pending)
      }
    }, 0)
  }

  /**
   * Copy or cut from the context menu: the copy event is fired by the
   * browser's copy command, which the click allows.
   * @param {'copy'|'cut'} kind
   * @returns {void}
   */
  copyFromMenu (kind) {
    if (!this.hasSelection()) return
    const pending = { kind }
    this.pending = pending
    try {
      document.execCommand('copy')
    } catch {
      // The command is not available: the editor's clipboard is used.
    }
    if (this.pending === pending) {
      this.pending = null
      this.fallback(pending)
    }
  }

  /**
   * Paste from the context menu, through the asynchronous Clipboard API. The
   * browser may ask the user first; if it refuses, the editor's clipboard is
   * pasted.
   * @param {{type?: 'in_place'}} [options]
   * @returns {Promise<void>}
   */
  async pasteFromMenu (options = {}) {
    let text = ''
    try {
      text = await this.readSystemClipboard()
    } catch {
      text = ''
    }
    await this.pasteText(text, options)
  }

  /**
   * Reads SVG, or else text, from the system clipboard.
   * @returns {Promise<string>}
   */
  async readSystemClipboard () {
    const { clipboard } = navigator
    if (!clipboard) return ''
    if (clipboard.read) {
      const items = await clipboard.read()
      for (const type of [SVG_TYPE, TEXT_TYPE]) {
        const item = items.find((candidate) => candidate.types.includes(type))
        if (item) return await (await item.getType(type)).text()
      }
      return ''
    }
    return clipboard.readText ? await clipboard.readText() : ''
  }

  /**
   * Whether the context menu can offer to paste: the editor has a clipboard,
   * or the browser lets the page read the system clipboard.
   * @returns {boolean}
   */
  canPaste () {
    return this.canvas.hasClipboardData() ||
      Boolean(navigator.clipboard?.read || navigator.clipboard?.readText)
  }

  /**
   * Copy or cut with the editor's clipboard alone, when the system clipboard
   * cannot be reached; or the paste of the editor's clipboard.
   * @param {{kind: 'copy'|'cut'|'paste', type?: 'in_place'}} pending
   * @returns {void}
   */
  fallback (pending) {
    if (pending.kind === 'paste') {
      // No paste event came: Firefox fires none for Mod+Shift+V outside a
      // field. The system clipboard is read as the context menu reads it,
      // and the editor's clipboard is pasted when the browser refuses.
      this.pasteFromMenu(pending)
      return
    }
    if (this.copyInternal(pending.kind)) this.internalIsNewer = true
  }

  /**
   * Copies, or cuts, the selection to the editor's clipboard.
   * @param {'copy'|'cut'} kind
   * @returns {string|null} The copy as SVG text, or null with no selection
   */
  copyInternal (kind) {
    if (!this.hasSelection()) return null
    if (kind === 'cut') {
      this.canvas.cutSelectedElements()
    } else {
      this.canvas.copySelectedElements()
    }
    return this.canvas.getClipboardSvg() || ''
  }

  /**
   * The copy and cut events: the selection goes to the editor's clipboard
   * and, as SVG text, to the system clipboard.
   * @param {ClipboardEvent} evt
   * @param {'copy'|'cut'} eventKind
   * @returns {void}
   */
  onCopy (evt, eventKind) {
    if (!this.ownsEvent(evt)) return
    const kind = this.pending?.kind === 'cut' || (!this.pending && eventKind === 'cut') ? 'cut' : 'copy'
    this.pending = null
    const svg = this.copyInternal(kind)
    if (svg === null) return
    evt.preventDefault()
    if (svg && evt.clipboardData) {
      evt.clipboardData.setData(TEXT_TYPE, svg)
      try {
        evt.clipboardData.setData(SVG_TYPE, svg)
      } catch {
        // A browser that refuses the type keeps the text.
      }
      this.internalIsNewer = false
    } else {
      this.internalIsNewer = true
    }
  }

  /**
   * The paste event: SVG from outside the editor, or the editor's clipboard.
   * @param {ClipboardEvent} evt
   * @returns {void}
   */
  onPaste (evt) {
    if (!this.ownsEvent(evt)) return
    const options = this.pending || { center: true }
    this.pending = null
    evt.preventDefault()
    const data = evt.clipboardData
    let text = ''
    try {
      text = data?.getData(SVG_TYPE) || data?.getData(TEXT_TYPE) || ''
    } catch {
      text = ''
    }
    this.pasteText(text, options)
  }

  /**
   * Pastes the text of the system clipboard when it is SVG that this editor
   * did not write, and the editor's clipboard otherwise.
   * @param {string} text
   * @param {{type?: 'in_place', center?: boolean}} options
   * @returns {Promise<void>}
   */
  async pasteText (text, options) {
    const external = looksLikeSvg(text) &&
      !this.internalIsNewer &&
      !sameText(text, this.canvas.getClipboardSvg())
    if (external) {
      const [type, x, y] = this.pastePosition(options)
      const pasted = this.canvas.pasteSvgString(text, type, x, y)
      if (pasted) return
    }
    this.pasteInternal(options)
  }

  /**
   * Where a paste goes: the middle of the view for Mod+V, the place of the
   * objects for a paste in place, the last click for the context menu.
   * @param {{type?: 'in_place', center?: boolean}} options
   * @returns {Array}
   */
  pastePosition (options) {
    if (options.type === 'in_place') return ['in_place']
    if (options.center) {
      const { x, y } = this.editor.getViewCenter()
      return ['point', x, y]
    }
    return []
  }

  /**
   * Pastes the editor's clipboard.
   * @param {{type?: 'in_place', center?: boolean}} options
   * @returns {void}
   */
  pasteInternal (options) {
    this.canvas.pasteElements(...this.pastePosition(options))
  }
}
