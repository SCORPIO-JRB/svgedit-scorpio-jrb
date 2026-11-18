import { t } from '../locale.js'
const template = document.createElement('template')
template.innerHTML = `
<style>
select {
  margin-top: 4px;
  height: var(--se-control-size);
  padding: 0 24px 0 8px;
  border: 1px solid transparent;
  border-radius: var(--se-radius-field);
  background-color: var(--se-control);
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 13px) 50%, calc(100% - 9px) 50%;
  background-size: 4px 4px;
  background-repeat: no-repeat;
  color: var(--se-text);
  font: inherit;
  appearance: none;
  outline: none;
}
select:hover {
  border-color: var(--se-border-control);
}
select:focus-visible {
  outline: 2px solid var(--se-focus-ring);
  outline-offset: 1px;
}
label {
  margin-left: 2px;
  margin-right: 4px;
  color: var(--se-text-label);
}
::slotted(*) {
  padding:0;
  width:100%;
}
</style>
  <label part="label"></label>
  <select part="select">
  </select>

`
/**
 * @class SeList
 */
export class SeSelect extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$select = this._shadowRoot.querySelector('select')
    this.$label = this._shadowRoot.querySelector('label')
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'width', 'height', 'options', 'values', 'title', 'disabled']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    let options
    if (oldValue === newValue) return
    switch (name) {
      case 'label':
        this.$label.textContent = t(newValue)
        break
      case 'title':
        this.$select.setAttribute('title', t(newValue))
        break
      case 'disabled':
        if (newValue === null) {
          this.$select.removeAttribute('disabled')
        } else {
          this.$select.setAttribute('disabled', newValue)
        }
        break
      case 'height':
        this.$select.style.height = newValue
        break
      case 'width':
        this.$select.style.width = newValue
        break
      case 'options':
        if (newValue === '') {
          while (this.$select.firstChild) { this.$select.removeChild(this.$select.firstChild) }
        } else {
          options = newValue.split(',')
          options.forEach((option) => {
            const optionNode = document.createElement('OPTION')
            const text = document.createTextNode(t(option))
            optionNode.appendChild(text)
            this.$select.appendChild(optionNode)
          })
        }
        break
      case 'values':
        if (newValue === '') {
          while (this.$select.firstChild) { this.$select.removeChild(this.$select.firstChild) }
        } else {
          options = newValue.split('::')
          options.forEach((option, index) => {
            this.$select.children[index].setAttribute('value', option)
          })
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
  get width () {
    return this.getAttribute('width')
  }

  /**
   * @function set
   * @returns {void}
   */
  set width (value) {
    this.setAttribute('width', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get height () {
    return this.getAttribute('height')
  }

  /**
   * @function set
   * @returns {void}
   */
  set height (value) {
    this.setAttribute('height', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get value () {
    return this.$select.value
  }

  /**
   * @function set
   * @returns {void}
   */
  set value (value) {
    this.$select.value = value
  }

  /**
   * True when the list stands for several different values: it shows
   * "Mixed" until a value is chosen, which then applies to every element.
   * @returns {boolean}
   */
  get mixed () {
    return Boolean(this.$mixed?.selected)
  }

  /**
   * @param {boolean} mixed
   * @returns {void}
   */
  set mixed (mixed) {
    if (!mixed) {
      if (this.$mixed?.selected) { this.$select.selectedIndex = -1 }
      return
    }
    if (!this.$mixed) {
      this.$mixed = document.createElement('option')
      this.$mixed.value = ''
      this.$mixed.disabled = true
      this.$mixed.hidden = true
      this.$mixed.dataset.mixed = ''
      this.$select.append(this.$mixed)
    }
    this.$mixed.textContent = t('properties.mixed')
    this.$mixed.selected = true
  }

  /**
   * @function get
   * @returns {any}
   */
  get disabled () {
    return this.$select.getAttribute('disabled')
  }

  /**
   * @function set
   * @returns {void}
   */
  set disabled (value) {
    this.$select.setAttribute('disabled', value)
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    // Moved to another place of the page, the element is connected again:
    // its listeners must not be added twice
    if (this.connected) return
    this.connected = true
    const currentObj = this
    this.$select.addEventListener('change', () => {
      const value = this.$select.value
      const closeEvent = new CustomEvent('change', { detail: { value } })
      currentObj.dispatchEvent(closeEvent)
      currentObj.value = value
    })
  }
}

// Register
customElements.define('se-select', SeSelect)
