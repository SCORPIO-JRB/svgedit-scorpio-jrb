/**
 * se-popover: a panel anchored to a control (plan v2, section 4.7, lot V1),
 * for the menus and small windows of V3 and V4 (zoom menu, document menu,
 * typography window, context menu).
 *
 * - It opens under its anchor, or above it, left or right aligned, and is
 *   shifted to stay inside the window. With a "left-" placement it opens at
 *   the left of the panel given as `beside` (or of its anchor), its top at
 *   the top of the anchor: the windows of settings of the right panel.
 * - Escape closes it and gives the focus back to the anchor; so does a press
 *   outside it, or a click on an entry of a menu.
 * - With the `menu` attribute it is a menu: role="menu", the arrows move
 *   between its [role=menuitem], [role=menuitemcheckbox] and
 *   [role=menuitemradio] entries, Home and End go to the ends, Enter
 *   and Space activate the entry.
 *
 * Events: `se-popover-open` and `se-popover-close`, on the popover.
 */
const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 100000;
    display: none;
    box-sizing: border-box;
    min-width: 160px;
    max-width: calc(100vw - 16px);
    max-height: calc(100vh - 16px);
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-float);
    background: var(--se-surface-raised);
    box-shadow: var(--se-shadow-menu);
    color: var(--se-text);
    font-family: var(--se-font-ui);
    font-size: var(--se-font-size-control);
    line-height: var(--se-line-height-control);
  }
  :host([open]) {
    display: block;
    animation: enter var(--se-duration-state) var(--se-ease-out);
  }
  ::slotted([role^="menuitem"]) {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
    padding: 2px 8px;
    border-radius: var(--se-radius-field);
    cursor: pointer;
    outline: none;
  }
  ::slotted([role^="menuitem"]:hover),
  ::slotted([role^="menuitem"]:focus-visible) {
    background: var(--se-control-hover);
  }
  ::slotted([role^="menuitem"][aria-disabled="true"]) {
    opacity: 0.38;
    pointer-events: none;
  }
  /* The display of the entries would otherwise win over [hidden]. */
  ::slotted([hidden]) {
    display: none !important;
  }
  ::slotted([role="separator"]) {
    height: 1px;
    margin: 4px 0;
    background: var(--se-border);
  }
  @keyframes enter {
    from { opacity: 0; }
  }
  </style>
  <slot></slot>
`

const GAP = 4
const MARGIN = 8

/**
 * Where a popover goes: under its anchor if it fits, else above; aligned on
 * the start or the end of the anchor; then shifted inside the viewport.
 * @param {{left: number, top: number, right: number, bottom: number}} anchor
 * @param {{width: number, height: number}} size
 * @param {{width: number, height: number}} viewport
 * @param {string} [placement="bottom-start"] "bottom-start", "bottom-end", "top-start", "top-end", "left-start"
 * @returns {{x: number, y: number, side: "top"|"bottom"|"left"}}
 */
export const placePopover = (anchor, size, viewport, placement = 'bottom-start') => {
  const [side, align] = placement.split('-')
  if (side === 'left') {
    const x = Math.max(MARGIN, anchor.left - GAP - size.width)
    const top = align === 'end' ? anchor.bottom - size.height : anchor.top
    const y = Math.max(MARGIN, Math.min(top, viewport.height - size.height - MARGIN))
    return { x: Math.round(x), y: Math.round(y), side: 'left' }
  }
  const below = anchor.bottom + GAP
  const above = anchor.top - GAP - size.height
  const fitsBelow = below + size.height <= viewport.height - MARGIN
  const fitsAbove = above >= MARGIN
  let chosen = side === 'top' ? (fitsAbove || !fitsBelow ? 'top' : 'bottom') : (fitsBelow || !fitsAbove ? 'bottom' : 'top')
  // Fits on neither side: the side with more room.
  if (!fitsBelow && !fitsAbove) chosen = anchor.top > viewport.height - anchor.bottom ? 'top' : 'bottom'
  let y = chosen === 'bottom' ? below : above
  let x = align === 'end' ? anchor.right - size.width : anchor.left
  x = Math.max(MARGIN, Math.min(x, viewport.width - size.width - MARGIN))
  y = Math.max(MARGIN, Math.min(y, viewport.height - size.height - MARGIN))
  return { x: Math.round(x), y: Math.round(y), side: chosen }
}

export class SePopover extends HTMLElement {
  constructor () {
    super()
    this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true))
    this.anchor = null
    // keepOpen: a press outside does not close it (the eyedropper of the
    // colour window picks on the drawing).
    this.keepOpen = false
    this.onOutside = (event) => {
      if (this.keepOpen) return
      if (!event.composedPath().some((node) => node === this || node === this.anchor)) this.close()
    }
    this.onKeydown = (event) => this.keydown(event)
    this.onResize = () => this.close()
  }

  connectedCallback () {
    if (this.hasAttribute('menu')) this.setAttribute('role', 'menu')
    this.addEventListener('keydown', this.onKeydown)
    this.addEventListener('click', (event) => {
      const item = event.target.closest?.('[role^="menuitem"]')
      if (this.hasAttribute('menu') && item && item.getAttribute('aria-disabled') !== 'true') {
        // Chosen with the keyboard, the focus goes back to the control that
        // opened the menu; with the mouse, to the page, so that the arrows
        // and the shortcuts act on the drawing again.
        const keyboard = this.keyboardChoice
        this.keyboardChoice = false
        this.close({ restoreFocus: keyboard })
        if (!keyboard && this.contains(document.activeElement)) document.activeElement.blur()
      }
    })
  }

  disconnectedCallback () {
    this.close()
    this.removeEventListener('keydown', this.onKeydown)
  }

  get opened () {
    return this.hasAttribute('open')
  }

  /**
   * @returns {HTMLElement[]} The entries of a menu that can be reached
   */
  get items () {
    return [...this.querySelectorAll('[role^="menuitem"]')]
      .filter((item) => item.getAttribute('aria-disabled') !== 'true' && !item.hidden)
  }

  /**
   * @param {Element} anchor
   * @param {{placement?: string, focus?: boolean, beside?: Element}} [options]
   *   `beside`: the panel at the left of which a "left-" placement opens
   * @returns {void}
   */
  open (anchor, { placement = this.getAttribute('placement') || 'bottom-start', focus = true, beside = null } = {}) {
    this.anchor = anchor
    this.beside = beside
    this.setAttribute('open', '')
    anchor?.setAttribute?.('aria-expanded', 'true')
    this.position(placement)
    document.addEventListener('pointerdown', this.onOutside, true)
    window.addEventListener('resize', this.onResize)
    if (focus && this.hasAttribute('menu')) {
      this.items.forEach((item) => item.setAttribute('tabindex', '-1'))
      this.items[0]?.focus()
    }
    this.dispatchEvent(new CustomEvent('se-popover-open'))
  }

  /**
   * @param {string} [placement]
   * @returns {void}
   */
  position (placement = this.getAttribute('placement') || 'bottom-start') {
    if (!this.anchor) return
    let anchor = this.anchor.getBoundingClientRect()
    if (this.beside && placement.startsWith('left')) {
      const panel = this.beside.getBoundingClientRect()
      anchor = { left: panel.left, right: panel.right, top: anchor.top, bottom: anchor.bottom }
    }
    const own = this.getBoundingClientRect()
    const { x, y, side } = placePopover(anchor, own, { width: window.innerWidth, height: window.innerHeight }, placement)
    this.style.transform = `translate(${x}px, ${y}px)`
    this.dataset.side = side
  }

  /**
   * @param {{restoreFocus?: boolean}} [options]
   * @returns {void}
   */
  close ({ restoreFocus = false } = {}) {
    if (!this.opened) return
    this.removeAttribute('open')
    this.anchor?.setAttribute?.('aria-expanded', 'false')
    document.removeEventListener('pointerdown', this.onOutside, true)
    window.removeEventListener('resize', this.onResize)
    if (restoreFocus) this.anchor?.focus?.()
    this.dispatchEvent(new CustomEvent('se-popover-close'))
  }

  /**
   * @param {Element} anchor
   * @returns {void}
   */
  toggle (anchor) {
    if (this.opened) this.close()
    else this.open(anchor)
  }

  /**
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  keydown (event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.close({ restoreFocus: true })
      return
    }
    if (!this.hasAttribute('menu')) return
    const items = this.items
    if (!items.length) return
    const index = items.indexOf(document.activeElement)
    const go = (i) => {
      event.preventDefault()
      items[(i + items.length) % items.length].focus()
    }
    switch (event.key) {
      case 'ArrowDown': go(index + 1); break
      case 'ArrowUp': go(index < 0 ? items.length - 1 : index - 1); break
      case 'Home': go(0); break
      case 'End': go(items.length - 1); break
      case 'Enter':
      case ' ':
        if (index >= 0) {
          event.preventDefault()
          this.keyboardChoice = true
          items[index].click()
          this.keyboardChoice = false
        }
        break
    }
  }
}

customElements.define('se-popover', SePopover)
