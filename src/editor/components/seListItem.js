/* globals svgEditor */
import './seIcon.js'
import { t } from '../locale.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  [role="option"]{
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    padding: 2px !important;
    border-radius: var(--se-radius-field);
    color: var(--se-icon);
    background-color: transparent;
  }
  [role="option"]:hover{
    background-color: var(--se-control-hover);
    color: var(--se-text);
  }

  .selected {
    background-color: var(--se-accent-bg);
    color: var(--se-accent);
  }

  </style>
  <div role="option">
    <se-icon></se-icon>
    <slot></slot>
  </div>
`
/**
 * @class SeMenu
 */
export class SeListItem extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$menuitem = this._shadowRoot.querySelector('[role=option]')
    // this.$svg = this.$menuitem.shadowRoot.querySelector('#checkmark')
    // this.$svg.setAttribute('style', 'display: none;')
    this.$img = this._shadowRoot.querySelector('se-icon')
    this.$img.setAttribute('style', 'display: none;')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.$menuitem.addEventListener('mousedown', e => {
      this.$menuitem.dispatchEvent(new CustomEvent('selectedindexchange', {
        bubbles: true,
        composed: true,
        detail: { selectedItem: this.getAttribute('value') }
      }))
    })
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['option', 'src', 'title', 'img-height', 'selected']
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
      case 'option':
        this.$menuitem.setAttribute('option', newValue)
        this.$menuitem.textContent = t(newValue)
        break
      case 'src':
        this.$img.setAttribute('style', 'display: block;')
        this.$img.setAttribute('src', this.imgPath + '/' + newValue)
        break
      case 'title':
        this.$img.setAttribute('title', t(newValue))
        break
      case 'img-height':
        this.$img.setAttribute('size', Number.parseFloat(newValue) * 0.8 || 16)
        break
      case 'selected':
        if (newValue === 'true') {
          this.$menuitem.classList.add('selected')
        } else {
          this.$menuitem.classList.remove('selected')
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
  get option () {
    return this.getAttribute('option')
  }

  /**
   * @function set
   * @returns {void}
   */
  set option (value) {
    this.setAttribute('option', value)
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
  get imgHeight () {
    return this.getAttribute('img-height')
  }

  /**
   * @function set
   * @returns {void}
   */
  set imgHeight (value) {
    this.setAttribute('img-height', value)
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
customElements.define('se-list-item', SeListItem)
