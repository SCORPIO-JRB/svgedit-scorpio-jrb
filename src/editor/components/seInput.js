import 'elix/define/Input.js'
import { t } from '../locale.js'
import './seIcon.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  div {
    display: flex;
    align-items: center;
    gap: 4px;
    height: var(--se-control-size);
    margin: 4px 1px;
    padding: 0 2px;
  }
  se-icon {
    color: var(--se-icon);
  }
  span {
    color: var(--se-text-label);
  }
  elix-input {
    height: var(--se-control-size);
    border-radius: var(--se-radius-field);
    background-color: var(--se-control);
    color: var(--se-text);
  }
  elix-input::part(input) {
    padding: 0 6px;
    border: 1px solid transparent;
    border-radius: var(--se-radius-field);
    background: transparent;
    color: inherit;
    font: inherit;
  }
  elix-input::part(input):hover {
    border-color: var(--se-border-control);
  }
  elix-input::part(input):focus-visible {
    outline: 2px solid var(--se-focus-ring);
    outline-offset: 1px;
  }
  </style>
  <div part="field">
  <se-icon size="14" part="icon"></se-icon>
  <span id="label" part="label"></span>
  <elix-input part="box" exportparts="input"></elix-input>
  </div>
`

/**
 * @class SEInput
 */
export class SEInput extends HTMLElement {
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
    this.$label = this.shadowRoot.getElementById('label')
    this.$event = new CustomEvent('change')
    this.$input = this._shadowRoot.querySelector('elix-input')
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['value', 'label', 'src', 'size', 'title']
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
        this.$div.setAttribute('title', `${t(newValue)}`)
        // The field says what it is to a screen reader, as se-spin-input
        this.$input.setAttribute('aria-label', t(newValue))
        break
      case 'src':
        this.$img.setAttribute('src', newValue)
        this.$label.remove()
        break
      case 'size':
        this.$input.setAttribute('size', newValue)
        break
      case 'label':
        this.$label.textContent = t(newValue)
        this.$img.remove()
        if (!this.hasAttribute('title')) this.$input.setAttribute('aria-label', t(newValue))
        break
      case 'value':
        this.$input.value = newValue
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
  get value () {
    return this.$input.value
  }

  /**
   * @function set
   * @returns {void}
   */
  set value (value) {
    this.$input.value = value
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
    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      this.value = e.target.value
      this.dispatchEvent(this.$event)
    })
    this.$input.addEventListener('keyup', (e) => {
      e.preventDefault()
      this.value = e.target.value
      this.dispatchEvent(this.$event)
    })
  }
}
// Register
customElements.define('se-input', SEInput)
