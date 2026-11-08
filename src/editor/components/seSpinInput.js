/* globals svgEditor */
import '../dialogs/se-elix/define/NumberSpinBox.js'
import { t } from '../locale.js'
import { isPlainNumber, parseFieldExpression } from './fieldExpression.js'
import './seIcon.js'
import { titleWithShortcut } from '../commands.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  div {
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--se-control-size);
    margin: 4px 1px;
    padding: 0 2px;
  }
  div.imginside {
    width: var(--global-se-spin-input-width);
  }
  se-icon {
    color: var(--se-icon);
  }
  span {
    margin-right: 2px;
    color: var(--se-text-label);
  }
  elix-number-spin-box {
    box-sizing: border-box;
    width: 58px;
    height: var(--se-control-size);
    border: 1px solid transparent;
    border-radius: var(--se-radius-field);
    background-color: var(--se-control);
    color: var(--se-text);
    vertical-align: top;
  }
  elix-number-spin-box:hover {
    border-color: var(--se-border-control);
  }
  elix-number-spin-box:focus-within {
    outline: 2px solid var(--se-focus-ring);
    outline-offset: 1px;
  }
  elix-number-spin-box::part(spin-button) {
    padding: 0px;
    color: var(--se-text-secondary);
  }
  elix-number-spin-box::part(input) {
    width: 3em;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
  </style>
  <div>
  <se-icon></se-icon>
  <span id="label"></span>
  <elix-number-spin-box min="1" step="1"></elix-number-spin-box>
  </div>
`

/**
 * @class SESpinInput
 */
export class SESpinInput extends HTMLElement {
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
    this.$label = this._shadowRoot.getElementById('label')
    this.$input = this._shadowRoot.querySelector('elix-number-spin-box')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.committedValue = this.$input.value
    this.manualEdit = false
    this.inputEventsConnected = false
    this.#mixed = false
    // The arrows of a field showing "Mixed" change each element's own value.
    const { stepUp, stepDown } = this.$input
    this.$input.stepUp = () => (this.#mixed ? this.#stepMixed(1) : stepUp.call(this.$input))
    this.$input.stepDown = () => (this.#mixed ? this.#stepMixed(-1) : stepDown.call(this.$input))
  }

  #mixed

  // Exact value behind a rounded shown value: expressions apply to it.
  #precise

  /**
   * Words that stand, in an expression, for the value of each element.
   * @returns {string[]}
   */
  #mixedWords () {
    return [t('properties.mixed'), 'mixed', 'mixte']
  }

  /**
   * Keeps a value between the field's bounds.
   * @param {number} value
   * @returns {number}
   */
  #clamp (value) {
    const min = this.getAttribute('min')
    const max = this.getAttribute('max')
    let result = value
    if (min !== null && result < Number(min)) { result = Number(min) }
    if (max !== null && result > Number(max)) { result = Number(max) }
    return result
  }

  /**
   * Sends a change to apply to each element's own value, from a field
   * showing "Mixed". The listener reads `event.detail.relative`, a function
   * from an element's value to its new value; the field keeps showing
   * "Mixed" until the panel updates it.
   * @param {(value: number) => number} evaluate
   * @returns {void}
   */
  #dispatchRelative (evaluate) {
    const relative = (value) => {
      const result = evaluate(Number(value))
      return Number.isFinite(result) ? this.#clamp(result) : Number(value)
    }
    this.manualEdit = false
    this.$input.value = ''
    this.dispatchEvent(new CustomEvent('change', { detail: { relative } }))
  }

  #stepMixed (sign) {
    const step = Number(this.getAttribute('step')) || 1
    this.#dispatchRelative((value) => value + sign * step)
  }

  #isValidValue (value) {
    const normalized = String(value).trim()
    if (normalized === '') return false

    const number = Number(normalized)
    if (!Number.isFinite(number)) return false

    const min = this.getAttribute('min')
    const max = this.getAttribute('max')
    return (min === null || number >= Number(min)) &&
      (max === null || number <= Number(max))
  }

  /**
   * @param {PlainObject} [detail] - `{wasMixed: true}` when a value typed in a
   *   field showing "Mixed" is to be given to every element
   * @returns {void}
   */
  #dispatchChange (detail) {
    this.dispatchEvent(new CustomEvent('change', detail ? { detail } : undefined))
  }

  #commitValue (value) {
    const wasMixed = this.#mixed
    // A plain number is kept as typed, as before expressions were read.
    if (!isPlainNumber(value)) {
      const expression = parseFieldExpression(value, { words: this.#mixedWords() })
      if (!expression) {
        this.#revertValue()
        return
      }
      if (this.#mixed && expression.relative) {
        this.#dispatchRelative(expression.evaluate)
        return
      }
      // An empty field has no value to add to.
      const current = String(this.committedValue).trim() === ''
        ? NaN
        : (this.#precise ?? Number(this.committedValue))
      value = String(expression.evaluate(current))
    }
    if (!this.#isValidValue(value)) {
      this.#revertValue()
      return
    }

    this.value = value
    this.committedValue = String(this.value)
    this.manualEdit = false
    this.#dispatchChange(wasMixed ? { wasMixed } : undefined)
  }

  #revertValue () {
    this.manualEdit = false
    if (this.#mixed) {
      this.$input.value = ''
      return
    }
    this.value = this.committedValue
  }

  #connectInputEvents () {
    if (!this.isConnected || this.inputEventsConnected) return

    const inputRoot = this.$input.shadowRoot
    if (!inputRoot) return
    this.inputEventsConnected = true

    inputRoot.addEventListener('focus', (e) => {
      const input = e.target
      if (input?.id !== 'input') return
      this.committedValue = String(this.value)
      input.select()
    }, true)
    // In the capture phase: the spin box raises its own change event on the
    // input event, which must already see the manual edit. Otherwise the
    // first character typed was committed at once ("1" of "12", or the "+"
    // of "+10").
    inputRoot.addEventListener('input', (e) => {
      if (e.target?.id !== 'input') return
      this.manualEdit = true
    }, true)
    inputRoot.addEventListener('keydown', (e) => {
      const input = e.target
      if (input?.id !== 'input') return
      if (e.key === 'Enter') {
        e.preventDefault()
        this.#commitValue(input.value)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.#revertValue()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        this.manualEdit = false
      }
    })
    inputRoot.addEventListener('blur', (e) => {
      const input = e.target
      if (input?.id !== 'input') return
      if (this.manualEdit) {
        this.#commitValue(input.value)
      }
    }, true)

    inputRoot.addEventListener('mousedown', (e) => {
      if (e.target?.id === 'upButton' || e.target?.id === 'downButton') {
        this.manualEdit = false
      }
    }, { capture: true })

    this.$input.addEventListener('change', (e) => {
      e.preventDefault()
      if (this.manualEdit) {
        return
      }
      this.value = e.target.value
      this.committedValue = String(this.value)
      this.#dispatchChange()
    })
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['value', 'label', 'src', 'size', 'min', 'max', 'step', 'title']
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
        this.$div.setAttribute('title', titleWithShortcut(t(newValue), this.getAttribute('shortcut'), t))
        break
      case 'src':
        this.$img.setAttribute('src', this.imgPath + '/' + newValue)
        this.$label.remove()
        this.$div.classList.add('imginside')
        break
      case 'size':
      // access to the underlying input box
        this.$input.shadowRoot.getElementById('input').size = newValue
        // below seems mandatory to override the default width style that takes precedence on size
        this.$input.shadowRoot.getElementById('input').style.width = 'unset'
        break
      case 'step':
        this.$input.setAttribute('step', newValue)
        break
      case 'min':
        this.$input.setAttribute('min', newValue)
        break
      case 'max':
        this.$input.setAttribute('max', newValue)
        break
      case 'label':
        this.$label.textContent = t(newValue)
        this.$img.remove()
        break
      case 'value':
        this.#setMixed(false)
        this.$input.value = newValue
        if (!this.manualEdit) {
          this.committedValue = String(newValue)
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
    this.#setMixed(false)
    this.#precise = undefined
    this.$input.value = value
    if (!this.manualEdit) {
      this.committedValue = String(value)
    }
  }

  /**
   * Exact value of a field showing a rounded value: an expression such as
   * *2 applies to it rather than to the rounding. Set it after the value;
   * setting the value again drops it.
   * @param {number} value
   * @returns {void}
   */
  set preciseValue (value) {
    this.#precise = Number.isFinite(value) ? value : undefined
  }

  /**
   * @returns {number|undefined}
   */
  get preciseValue () {
    return this.#precise
  }

  /**
   * True when the field stands for several different values: it is empty
   * and shows "Mixed". A number typed then applies to every element; an
   * expression such as +10 or *2, or an arrow, changes each element's own
   * value (see the `relative` detail of the change event).
   * @returns {boolean}
   */
  get mixed () {
    return this.#mixed
  }

  /**
   * @param {boolean} mixed
   * @returns {void}
   */
  set mixed (mixed) {
    this.#setMixed(Boolean(mixed))
    if (mixed) {
      this.$input.value = ''
      if (!this.manualEdit) {
        this.committedValue = ''
      }
    }
  }

  #setMixed (mixed) {
    if (this.#mixed === mixed) return
    this.#mixed = mixed
    const input = this.$input.shadowRoot?.getElementById('input')
    if (input) {
      input.placeholder = mixed ? t('properties.mixed') : ''
    }
    this.classList.toggle('mixed', mixed)
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
    // Descendant connected callbacks render the Elix shadow root synchronously.
    // Wait until the current custom-element reaction stack has completed.
    queueMicrotask(() => this.#connectInputEvents())
  }
}

// Register
customElements.define('se-spin-input', SESpinInput)
