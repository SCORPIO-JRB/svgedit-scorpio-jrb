/* globals svgEditor */
import './seIcon.js'
import { t } from '../locale.js'
import { setControlName } from '../commands.js'

/**
 * Gives the keyboard focus to a button of a toolbar: its control takes the
 * focus for as long as the keyboard stays on it. A click never gives it the
 * focus, so that the shortcuts and the arrows keep working on the canvas.
 * @param {HTMLElement} item
 * @returns {void}
 */
export const focusControl = (item) => {
  if (!item) return
  const control = item.shadowRoot?.querySelector('[role="button"]') ?? item
  if (!control.hasAttribute('tabindex') && control.tabIndex < 0) {
    control.tabIndex = -1
    control.addEventListener('blur', () => control.removeAttribute('tabindex'), { once: true })
  }
  control.focus()
}

/**
 * @class FlyingButton
 */
export class FlyingButton extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.template = this.createTemplate(this.imgPath)
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(this.template.content.cloneNode(true))
    // locate the component
    this.$button = this._shadowRoot.querySelector('.menu-button')
    this.$handle = this._shadowRoot.querySelector('.handle')
    this.$overall = this._shadowRoot.querySelector('.overall')
    this.$img = this._shadowRoot.querySelector('se-icon')
    this.$menu = this._shadowRoot.querySelector('.menu')
    // the last element of the div is the slot
    // we retrieve all elements added in the slot (i.e. se-buttons)
    this.$elements = this.$menu.lastElementChild.assignedElements()

    // Closes opened menu on click
    document.addEventListener('click', e => {
      if (this.opened) {
        this.opened = false
      }
    })
  }

  /**
   * @function createTemplate
   * @param {string} imgPath
   * @returns {any} template
   */

  createTemplate (imgPath) {
    const template = document.createElement('template')
    template.innerHTML = `
      <style>
        :host {
          position: relative;
          display: inline-block;
        }
        .menu-button {
          box-sizing: border-box;
          width: var(--se-control-size);
          height: var(--se-control-size);
          margin: 2px 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-radius: var(--se-radius-control);
          color: var(--se-icon);
          background-color: transparent;
          cursor: pointer;
          transition: background-color var(--se-duration-state) var(--se-ease-out),
            color var(--se-duration-state) var(--se-ease-out);
        }
        .overall:not(.disabled):not(.pressed) .menu-button:hover {
          background-color: var(--se-control-hover);
          color: var(--se-text);
        }
        .overall.pressed .menu-button {
          background-color: var(--se-accent-bg);
          color: var(--se-accent);
        }
        .disabled {
          opacity: 0.38;
          cursor: default;
        }
        /* The corner that opens the menu of the group. */
        .handle {
          position: absolute;
          right: 0;
          bottom: 0;
          width: 10px;
          height: 10px;
        }
        .handle::after {
          content: '';
          position: absolute;
          right: 2px;
          bottom: 2px;
          border-style: solid;
          border-width: 0 0 4px 4px;
          border-color: transparent transparent currentColor transparent;
          pointer-events: none;
        }
        .menu {
          position: fixed;
          display: none;
          margin-left: 34px;
          padding: 2px;
          gap: 2px;
          border: 1px solid var(--se-border);
          border-radius: var(--se-radius-float);
          background-color: var(--se-surface-raised);
          box-shadow: var(--se-shadow-menu);
          z-index: 20;
        }
        .open {
          display: flex;
        }
        .menu-button:focus-visible {
          outline: 2px solid var(--se-focus-ring);
          outline-offset: -2px;
        }
        /* In the horizontal toolbar of the canvas layout (lot V3): a chevron
           opens the menu, which lists the tools of the group below it. */
        :host([placement="bottom"]) .menu-button {
          width: calc(var(--se-control-size) + 10px);
          justify-content: flex-start;
          padding-left: 6px;
        }
        :host([placement="bottom"]) .handle {
          top: 0;
          bottom: 0;
          width: 14px;
          height: auto;
        }
        :host([placement="bottom"]) .handle::after {
          right: 4px;
          bottom: calc(50% - 2px);
          border-width: 4px 3px 0 3px;
          border-color: currentColor transparent transparent transparent;
        }
        :host([placement="bottom"][menu-only]) .menu-button {
          width: var(--se-control-size);
          justify-content: center;
          padding-left: 0;
        }
        :host([menu-only]) .handle {
          display: none;
        }
        :host([placement="bottom"]) .menu {
          margin-left: 0;
          flex-direction: column;
          padding: 4px;
        }
      </style>

      <div class="overall">
        <div class="menu">
          <slot></slot>
        </div>
        <div class="menu-button" role="button" aria-haspopup="true" aria-expanded="false">
          <se-icon class="button-icon"></se-icon>
          <div class="handle"></div>
        </div>
      </div>`
    return template
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'pressed', 'disabled', 'opened', 'src']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        setControlName(this, this.$button, t(newValue), this.getAttribute('shortcut'), t)
        break
      case 'pressed':
        if (newValue) {
          this.$overall.classList.add('pressed')
        } else {
          this.$overall.classList.remove('pressed')
        }
        break
      case 'opened':
        if (newValue) {
          this.$menu.classList.add('open')
          this.placeMenu()
        } else {
          this.$menu.classList.remove('open')
        }
        this.$button.setAttribute('aria-expanded', String(Boolean(newValue)))
        break
      case 'src':
        // The icon of a menu-only group (More ▾) does not follow its tools.
        if (this.hasAttribute('menu-only') && newValue) this.$img.setAttribute('src', this.imgPath + '/' + newValue)
        break
      case 'disabled':
        if (newValue) {
          this.$overall.classList.add('disabled')
        } else {
          this.$overall.classList.remove('disabled')
        }
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get title () {
    return this.getAttribute('title')
  }

  /**
   * @function set
   * @returns {void}
   */
  set title (value) {
    this.setAttribute('title', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get pressed () {
    return this.hasAttribute('pressed')
  }

  /**
   * @function set
   * @returns {void}
   */
  set pressed (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('pressed', 'true')
    } else {
      this.removeAttribute('pressed', '')
      // close also the menu if open
      this.removeAttribute('opened')
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get opened () {
    return this.hasAttribute('opened')
  }

  /**
   * @function set
   * @returns {void}
   */
  set opened (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('opened', 'opened')
    } else {
      this.removeAttribute('opened')
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get disabled () {
    return this.hasAttribute('disabled')
  }

  /**
   * @function set
   * @returns {void}
   */
  set disabled (value) {
    // boolean value => existence = true
    if (value) {
      this.setAttribute('disabled', 'true')
    } else {
      this.removeAttribute('disabled', '')
    }
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    if (this.connected) return
    this.connected = true
    const slot = this.shadowRoot.querySelector('slot')
    const labelItems = () => {
      // The menu below a horizontal toolbar names its tools.
      if (this.getAttribute('placement') !== 'bottom') return
      for (const item of slot.assignedElements()) item.setAttribute('labelled', '')
    }
    const showActive = () => {
      if (this.hasAttribute('menu-only')) {
        this.$img.setAttribute('src', this.imgPath + '/' + (this.getAttribute('src') || 'more_horiz.svg'))
        return
      }
      if (!this.activeSlot || this.activeSlot.parentElement !== this) {
        this.activeSlot = slot.assignedElements()[0]
      }
      if (this.activeSlot) this.$img.setAttribute('src', this.imgPath + '/' + this.activeSlot.getAttribute('src'))
    }
    slot.addEventListener('slotchange', () => {
      labelItems()
      showActive()
    })
    labelItems()
    showActive()
    // capture click event on the button to manage the logic
    const onClickHandler = (ev) => {
      ev.stopPropagation()
      switch (ev.target.nodeName) {
        case 'SE-FLYINGBUTTON':
          if (this.hasAttribute('menu-only')) {
            this.toggleMenu()
          } else if (this.pressed || !this.activeSlot) {
            this.setAttribute('opened', 'opened')
          } else {
          // launch current action
            this.activeSlot.click()
            this.setAttribute('pressed', 'pressed')
          }
          break
        case 'SE-BUTTON':
        case 'SE-EXPLORERBUTTON':
        // change to the current action
          if (!this.hasAttribute('menu-only')) {
            this.$img.setAttribute('src', this.imgPath + '/' + ev.target.getAttribute('src'))
          }
          this.activeSlot = ev.target
          this.setAttribute('pressed', 'pressed')
          // and close the menu
          this.removeAttribute('opened')
          break
        case 'DIV':
        // this is a click on the handle so let's open/close the menu.
          this.toggleMenu()
          break
        default:
          console.error('unkonw nodeName for:', ev.target, ev.target.className)
      }
    }
    // capture event from slots
    svgEditor.$click(this, onClickHandler)
    svgEditor.$click(this.$handle, onClickHandler)
    this.$button.addEventListener('keydown', (e) => this.keydownButton(e))
    this.$menu.addEventListener('keydown', (e) => this.keydownMenu(e))
  }

  /**
   * @returns {void}
   */
  toggleMenu () {
    if (this.opened) this.removeAttribute('opened')
    else this.setAttribute('opened', 'opened')
  }

  /**
   * Puts the menu beside the button (vertical toolbar) or below it
   * (horizontal toolbar), inside the window.
   * @returns {void}
   */
  placeMenu () {
    const rect = this.getBoundingClientRect()
    if (this.getAttribute('placement') === 'bottom') {
      this.$menu.style.top = rect.bottom + 6 + 'px'
      const width = this.$menu.offsetWidth
      this.$menu.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px'
    } else {
      // In case menu scroll on top or bottom position based popup position set
      this.$menu.style.top = rect.top + 'px'
    }
  }

  /**
   * @returns {HTMLElement[]}
   */
  get menuItems () {
    return this.shadowRoot.querySelector('slot').assignedElements()
      .filter((item) => !item.hidden && item.style.display !== 'none')
  }

  /**
   * @param {HTMLElement} item
   * @returns {void}
   */
  focusItem (item) {
    focusControl(item)
  }

  /**
   * Enter or Space chooses (or opens a menu-only group), the down arrow
   * opens the menu on its first tool.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydownButton (e) {
    if ((e.key === 'Enter' || e.key === ' ') && this.$button.matches(':focus-visible')) {
      e.preventDefault()
      e.stopPropagation()
      this.click()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      this.setAttribute('opened', 'opened')
      this.focusItem(this.menuItems[0])
    }
  }

  /**
   * Up and down move in the open menu; Escape closes it.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keydownMenu (e) {
    const items = this.menuItems
    const index = items.findIndex((item) => item === document.activeElement || item.contains(document.activeElement))
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.removeAttribute('opened')
      focusControl(this)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const next = index + (e.key === 'ArrowDown' ? 1 : -1)
      this.focusItem(items[(next + items.length) % items.length])
    }
  }
}

// Register
customElements.define('se-flyingbutton', FlyingButton)
