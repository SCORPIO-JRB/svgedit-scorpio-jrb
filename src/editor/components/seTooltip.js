/**
 * se-tooltip: the tooltip of the editor (plan v2, section 4.7, lot V1).
 *
 * It shows the name of a control and its shortcut in the notation of the
 * platform, as in Claude Design ("Undo  Ctrl+Z"), after 500 ms, and at once
 * when the pointer goes from one control to the next. It replaces the native
 * `title`, which showed neither in the theme nor with the shortcut apart.
 *
 * One tooltip serves the whole editor: the TooltipController listens on the
 * root of the editor and reads the `seTooltip` property ({ label, shortcut })
 * of the first element under the pointer that has one, across shadow roots.
 */
const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100000;
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 320px;
    padding: 4px 8px;
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-control);
    background: var(--se-surface-raised);
    box-shadow: var(--se-shadow-float);
    color: var(--se-text);
    font-family: var(--se-font-ui);
    font-size: var(--se-font-size-label);
    line-height: var(--se-line-height-label);
    white-space: nowrap;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--se-duration-state) var(--se-ease-out);
  }
  :host([open]) {
    visibility: visible;
    opacity: 1;
  }
  kbd {
    font: inherit;
    color: var(--se-text-secondary);
  }
  kbd:empty {
    display: none;
  }
  </style>
  <span id="label"></span><kbd id="shortcut"></kbd>
`

export class SeTooltip extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true))
    this.$label = this.shadowRoot.getElementById('label')
    this.$shortcut = this.shadowRoot.getElementById('shortcut')
  }

  connectedCallback () {
    this.setAttribute('role', 'tooltip')
  }

  /**
   * Shows the tooltip under its control, or above it at the bottom of the
   * window, kept inside the window.
   * @param {Element} anchor
   * @param {{label: string, shortcut?: string}} content
   * @returns {void}
   */
  show (anchor, { label, shortcut = '' }) {
    this.$label.textContent = label
    this.$shortcut.textContent = shortcut
    this.setAttribute('open', '')
    const box = anchor.getBoundingClientRect()
    const own = this.getBoundingClientRect()
    const margin = 8
    let x = box.left + box.width / 2 - own.width / 2
    let y = box.bottom + 6
    if (y + own.height > window.innerHeight - margin) y = box.top - own.height - 6
    // A control of the left column: the tooltip goes to its right.
    if (box.left < 60 && box.height > box.width - 4) {
      x = box.right + 6
      y = box.top + box.height / 2 - own.height / 2
    }
    x = Math.max(margin, Math.min(x, window.innerWidth - own.width - margin))
    y = Math.max(margin, Math.min(y, window.innerHeight - own.height - margin))
    this.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  }

  hide () {
    this.removeAttribute('open')
  }

  get open () {
    return this.hasAttribute('open')
  }
}

customElements.define('se-tooltip', SeTooltip)

export const TOOLTIP_DELAY = 500
// After a tooltip was shown, the next one follows at once for this long.
export const TOOLTIP_WARM = 300

/**
 * Finds the control under the pointer that carries a tooltip.
 * @param {Event} event
 * @returns {Element|null}
 */
const tooltipTarget = (event) => {
  for (const node of event.composedPath()) {
    if (node.seTooltip?.label) return node
    if (node === event.currentTarget) break
  }
  return null
}

export class TooltipController {
  /**
   * @param {HTMLElement} root The root of the editor
   */
  constructor (root) {
    this.root = root
    this.tooltip = document.createElement('se-tooltip')
    root.append(this.tooltip)
    this.current = null
    this.timer = null
    this.hiddenAt = 0
    this.onOver = (event) => {
      const target = tooltipTarget(event)
      if (target === this.current) return
      this.schedule(target)
    }
    this.onOut = (event) => {
      // Leaving the editor, or for a place without tooltip.
      if (!event.relatedTarget || !root.contains(event.relatedTarget)) this.schedule(null)
    }
    this.onDismiss = () => this.schedule(null, true)
    root.addEventListener('pointerover', this.onOver)
    root.addEventListener('pointerout', this.onOut)
    root.addEventListener('pointerdown', this.onDismiss, true)
    root.addEventListener('wheel', this.onDismiss, { passive: true })
    document.addEventListener('keydown', this.onDismiss, true)
  }

  /**
   * @param {Element|null} target
   * @param {boolean} [dismiss] The user acted: no tooltip until the pointer moves on
   * @returns {void}
   */
  schedule (target, dismiss = false) {
    clearTimeout(this.timer)
    this.timer = null
    if (this.tooltip.open) {
      this.tooltip.hide()
      this.hiddenAt = dismiss ? 0 : Date.now()
    }
    this.current = target
    if (!target || dismiss) return
    const warm = Date.now() - this.hiddenAt < TOOLTIP_WARM
    const show = () => {
      if (this.current !== target || !target.isConnected) return
      this.tooltip.show(target, target.seTooltip)
    }
    if (warm) show()
    else this.timer = setTimeout(show, TOOLTIP_DELAY)
  }

  destroy () {
    clearTimeout(this.timer)
    this.root.removeEventListener('pointerover', this.onOver)
    this.root.removeEventListener('pointerout', this.onOut)
    this.root.removeEventListener('pointerdown', this.onDismiss, true)
    this.root.removeEventListener('wheel', this.onDismiss)
    document.removeEventListener('keydown', this.onDismiss, true)
    this.tooltip.remove()
  }
}
