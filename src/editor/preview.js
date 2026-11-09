/**
 * The preview (plan v2, section 4.6; lot V6): the exact file the editor
 * saves, without any editing interface.
 *
 * The file is shown as an image of its own text (a blob of type
 * `image/svg+xml`): a document shown as an image runs no script and loads
 * nothing from the network, which isolates it as the plan asks; it plays its
 * animations, SMIL and CSS, that the editor keeps still while editing
 * (decision D3). Escape or the button goes back to editing; the document and
 * its undo steps stay as they were.
 *
 * Test values feeding the bindings wait for their format (decision D4).
 * @module preview
 */
import { escapeHtml } from './panels/TopBar.js'

export class Preview {
  /**
   * @param {import('./Editor.js').default} editor
   */
  constructor (editor) {
    this.editor = editor
    this.root = null
    this.url = null
    /** The text shown, as the save writes it. @type {string|null} */
    this.source = null
    this.onKeydown = this.onKeydown.bind(this)
  }

  /** @returns {boolean} */
  get isOpen () {
    return Boolean(this.root)
  }

  /**
   * Shows the file the save would write.
   * @returns {Promise<void>} Once the image is drawn
   */
  open () {
    if (this.root) return Promise.resolve()
    const { editor } = this
    const t = (key, options) => escapeHtml(editor.i18next.t(key, options))
    this.source = editor.svgCanvas.getSvgString()
    this.url = URL.createObjectURL(new Blob([this.source], { type: 'image/svg+xml' }))
    const name = editor.title || editor.i18next.t('layout.untitled')
    const root = document.createElement('div')
    root.id = 'se-preview'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', editor.i18next.t('preview.title'))
    root.innerHTML = `
      <div class="se-preview-bar">
        <span class="se-preview-title">${t('preview.title')}</span>
        <span class="se-preview-name">${escapeHtml(name)}</span>
        <button type="button" id="se-preview-close" class="se-text-button">${t('preview.back')}<kbd>${t('preview.escape')}</kbd></button>
      </div>
      <div class="se-preview-stage"><img id="se-preview-image" alt="${t('preview.image')}"></div>`
    const image = root.querySelector('#se-preview-image')
    image.src = this.url
    root.querySelector('#se-preview-close').addEventListener('click', () => this.close())
    this.previousFocus = document.activeElement
    ;(editor.$container ?? document.body).append(root)
    this.root = root
    document.body.classList.add('se-previewing')
    window.addEventListener('keydown', this.onKeydown, true)
    root.querySelector('#se-preview-close').focus()
    editor.$container?.dispatchEvent(new CustomEvent('se-preview', { detail: { open: true, svg: this.source } }))
    this.onResize = () => this.fit()
    window.addEventListener('resize', this.onResize)
    return image.decode().catch(() => {}).then(() => this.fit())
  }

  /**
   * The file as large as the screen allows, in its proportions.
   * @returns {void}
   */
  fit () {
    const image = this.root?.querySelector('#se-preview-image')
    const stage = this.root?.querySelector('.se-preview-stage')
    if (!image?.naturalWidth || !stage) return
    const style = getComputedStyle(stage)
    const width = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight)
    image.style.width = `${Math.floor(image.naturalWidth * scale)}px`
    image.style.height = `${Math.floor(image.naturalHeight * scale)}px`
  }

  /**
   * Back to editing.
   * @returns {void}
   */
  close () {
    if (!this.root) return
    window.removeEventListener('keydown', this.onKeydown, true)
    window.removeEventListener('resize', this.onResize)
    this.root.remove()
    this.root = null
    document.body.classList.remove('se-previewing')
    URL.revokeObjectURL(this.url)
    this.url = null
    this.source = null
    if (this.previousFocus?.isConnected) this.previousFocus.focus?.()
    this.editor.$container?.dispatchEvent(new CustomEvent('se-preview', { detail: { open: false } }))
  }

  /**
   * While open, no key reaches the editor: Escape closes, Tab stays on the
   * button, which Enter and Space still press.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  onKeydown (e) {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      this.root?.querySelector('#se-preview-close').focus()
    }
  }
}
