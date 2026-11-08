/* globals svgEditor */
import './seIcon.js'
import { t } from '../locale.js'
import { setControlName } from '../commands.js'

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
      </style>

      <div class="overall">
        <div class="menu">
          <slot></slot>
        </div>
        <div class="menu-button" role="button" aria-haspopup="true">
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
    return ['title', 'pressed', 'disabled', 'opened']
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
        } else {
          this.$menu.classList.remove('open')
        }
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
    this.activeSlot = this.shadowRoot.querySelector('slot').assignedElements()[0]
    this.$img.setAttribute('src', this.imgPath + '/' + this.activeSlot.getAttribute('src'))
    // capture click event on the button to manage the logic
    const onClickHandler = (ev) => {
      ev.stopPropagation()
      switch (ev.target.nodeName) {
        case 'SE-FLYINGBUTTON':
          if (this.pressed) {
            this.setAttribute('opened', 'opened')
          } else {
          // launch current action
            this.activeSlot.click()
            this.setAttribute('pressed', 'pressed')
          }
          break
        case 'SE-BUTTON':
        // change to the current action
          this.$img.setAttribute('src', this.imgPath + '/' + ev.target.getAttribute('src'))
          this.activeSlot = ev.target
          this.setAttribute('pressed', 'pressed')
          // and close the menu
          this.$menu.classList.remove('open')
          break
        case 'DIV':
        // this is a click on the handle so let's open/close the menu.
          if (this.opened) {
            this.removeAttribute('opened')
          } else {
            this.setAttribute('opened', 'opened')
            // In case menu scroll on top or bottom position based popup position set
            const rect = this.getBoundingClientRect()
            this.$menu.style.top = rect.top + 'px'
          }
          break
        default:
          console.error('unkonw nodeName for:', ev.target, ev.target.className)
      }
    }
    // capture event from slots
    svgEditor.$click(this, onClickHandler)
    svgEditor.$click(this.$handle, onClickHandler)
  }
}

// Register
customElements.define('se-flyingbutton', FlyingButton)
