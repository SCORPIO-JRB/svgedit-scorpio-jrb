/* globals svgEditor */
import './seIcon.js'
import { t } from '../locale.js'
import { adoptTitle, controlTitle, bindElementCommand, unbindElementCommand } from '../commands.js'
const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    display: inline-block;
  }
  div {
    box-sizing: border-box;
    width: var(--se-control-size);
    height: var(--se-control-size);
    margin: 2px 1px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--se-radius-control);
    color: var(--se-icon);
    background-color: transparent;
    cursor: pointer;
    transition: background-color var(--se-duration-state) var(--se-ease-out),
      color var(--se-duration-state) var(--se-ease-out);
  }
  :host(:hover) div:not(.disabled):not(.pressed) {
    background-color: var(--se-control-hover);
    color: var(--se-text);
  }
  .small {
    width: 20px;
    height: 20px;
    border-radius: var(--se-radius-field);
    --se-icon-size: 14px;
  }
  .pressed {
    background-color: var(--se-accent-bg);
    color: var(--se-accent);
  }
  :host(:active) div:not(.disabled) {
    background-color: var(--se-accent-pressed-bg);
    transition-duration: var(--se-duration-press);
  }
  .disabled {
    opacity: 0.38;
    cursor: default;
  }
  div:focus-visible {
    outline: 2px solid var(--se-focus-ring);
    outline-offset: -2px;
  }
  /* In the menu of a group of tools (canvas layout, lot V3): the name and
     the shortcut of the tool next to its icon. */
  .label, .kbd {
    display: none;
  }
  :host([labelled]) {
    display: block;
  }
  :host([labelled]) div {
    width: 100%;
    min-width: 200px;
    justify-content: flex-start;
    gap: 8px;
    padding: 0 8px;
    margin: 0;
  }
  :host([labelled]) .label {
    display: inline;
    flex: 1;
    color: var(--se-text);
    white-space: nowrap;
  }
  :host([labelled]) .kbd {
    display: inline;
    color: var(--se-text-secondary);
    white-space: nowrap;
  }
  </style>
  <div role="button">
    <se-icon></se-icon>
    <span class="label"></span>
    <span class="kbd"></span>
  </div>
`
/**
 * @class ToolButton
 */
export class ToolButton extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    // locate the component
    this.$div = this._shadowRoot.querySelector('div')
    this.$img = this._shadowRoot.querySelector('se-icon')
    this.$label = this._shadowRoot.querySelector('.label')
    this.$kbd = this._shadowRoot.querySelector('.kbd')
    // A button reached with the keyboard is chosen with Enter or Space. A
    // button that has the focus from a click lets them through: Space then
    // still moves the view.
    this.$div.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && this.$div.matches(':focus-visible')) {
        e.preventDefault()
        e.stopPropagation()
        if (!this.disabled) this.click()
      }
    })
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'src', 'pressed', 'disabled', 'size', 'style']
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
        // Removed by adoptTitle: the name stays.
        if (newValue === null) break
        adoptTitle(this, this.$div, newValue, t)
        this.$label.textContent = this.seTooltip?.label ?? ''
        this.$kbd.textContent = this.seTooltip?.shortcut ?? ''
        break
      case 'style':
        this.$div.style = newValue
        break
      case 'src':
        if (newValue.indexOf('data:') !== -1) {
          this.$img.setAttribute('src', newValue)
        } else {
          this.$img.setAttribute('src', this.imgPath + '/' + newValue)
        }
        break
      case 'pressed':
        if (newValue === null) {
          this.$div.classList.remove('pressed')
        } else {
          this.$div.classList.add('pressed')
        }
        this.$div.setAttribute('aria-pressed', String(newValue !== null))
        break
      case 'size':
        if (newValue === 'small') {
          this.$div.classList.add('small')
        } else {
          this.$div.classList.remove('small')
        }
        break
      case 'disabled':
        if (newValue) {
          this.$div.classList.add('disabled')
        } else {
          this.$div.classList.remove('disabled')
        }
        this.$div.setAttribute('aria-disabled', String(Boolean(newValue)))
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
    return controlTitle(this)
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
      this.removeAttribute('pressed')
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
      this.removeAttribute('disabled')
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get src () {
    return this.getAttribute('src')
  }

  /**
   * @function set
   * @returns {void}
   */
  set src (value) {
    this.setAttribute('src', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get size () {
    return this.getAttribute('size')
  }

  /**
   * @function set
   * @returns {void}
   */
  set size (value) {
    this.setAttribute('size', value)
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    // The shortcut becomes a command of the editor, which clicks the button
    // unless it is disabled; with shortcut-hint-only it is only shown in the
    // tooltip, because another button already binds it.
    bindElementCommand(this, t)
  }

  /**
   * @function disconnectedCallback
   * @returns {void}
   */
  disconnectedCallback () {
    unbindElementCommand(this)
  }
}

// Register
customElements.define('se-button', ToolButton)
