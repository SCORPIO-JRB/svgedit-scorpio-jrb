/* globals svgEditor */
import 'elix/define/MenuItem.js'
import './sePlainMenuButton.js'
import { t } from '../locale.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    padding: 0px;
  }
  elix-menu-button::part(menu) {
    padding: 4px;
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-float);
    background-color: var(--se-surface-raised) !important;
    box-shadow: var(--se-shadow-menu);
    color: var(--se-text);
    font-family: var(--se-font-ui);
    font-size: var(--se-font-size-control);
  }
  elix-menu-button::part(popup-toggle) {
    padding: 0.25em 0.30em !important
  }
  :host ::slotted([current]){
    background-color: var(--se-control-hover) !important;
    color: var(--se-text);
  }
  :host ::slotted(*){
    padding: 0.25em 1.25em 0.25em 0.25em !important;
    margin: 0;
    border-radius: var(--se-radius-field);
  }
  </style>

  <elix-menu-button id="MenuButton">
    <slot></slot>
  </elix-menu-button>

`
/**
 * @class SeMenu
 */
export class SeMenu extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$menu = this._shadowRoot.querySelector('elix-menu-button')
    this.$label = this.$menu.shadowRoot.querySelector('#popupToggle').shadowRoot
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$menu.setAttribute('aria-label', t('ui.main_menu'))
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'src']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    const image = new Image()
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        image.src = this.imgPath + '/' + newValue
        image.width = 24
        image.height = 24
        image.alt = ''
        this.$label.prepend(image)
        break
      case 'label':
        this.$label.prepend(newValue)
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
  get label () {
    return this.getAttribute('label')
  }

  /**
   * @function set
   * @returns {void}
   */
  set label (value) {
    this.setAttribute('label', value)
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
}

// Register
customElements.define('se-menu', SeMenu)
