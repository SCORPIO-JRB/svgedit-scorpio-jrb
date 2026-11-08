/* globals svgEditor */
import './seIcon.js'
import { t } from '../locale.js'
const template = document.createElement('template')
template.innerHTML = `
  <style>
  input{
    box-sizing: border-box;
    width: 44px;
    height: var(--se-control-size);
    min-width: unset;
    margin: 0 1px 0 4px;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: var(--se-radius-field) 0 0 var(--se-radius-field);
    background-color: var(--se-control);
    color: var(--se-text);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  input:hover {
    border-color: var(--se-border-control);
  }
  input:focus-visible {
    outline: 2px solid var(--se-focus-ring);
    outline-offset: 1px;
  }
  #tool-wrapper{
    height: var(--se-control-size);
    display:flex;
    align-items:center;
  }
  #icon{
    color: var(--se-icon);
  }
  #spinner{
    display:flex;
    flex-direction:column;
    gap: 1px;
  }
  #spinner > div {
    height: 13px;
    width: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7px;
    background-color: var(--se-control);
    color: var(--se-text-secondary);
    cursor: pointer;
  }
  #arrow-up, #arrow-down {
    user-select: none;
  }
  #arrow-up:hover, #arrow-down:hover {
    background-color: var(--se-control-hover);
    color: var(--se-accent);
  }
  #down{
    width: 20px;
    height: var(--se-control-size);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 4px 0 1px;
    border-radius: 0 var(--se-radius-field) var(--se-radius-field) 0;
    background-color: var(--se-control);
    color: var(--se-text-secondary);
    cursor: pointer;
  }
  #down:hover {
    color: var(--se-text);
  }
  #options-container {
    position: fixed;
    display: flex;
    flex-direction: column;
    padding: 4px;
    border: 1px solid var(--se-border);
    border-radius: var(--se-radius-float);
    background-color: var(--se-surface-raised);
    box-shadow: var(--se-shadow-menu);
    z-index: 20;
  }
  ::slotted(*) {
    margin: 0;
    padding: 4px 8px;
    border-radius: var(--se-radius-field);
    color: var(--se-text);
    cursor: pointer;
  }
  ::slotted(*:hover) {
    background-color: var(--se-control-hover);
  }
  </style>
  <div id="tool-wrapper">
    <se-icon id="icon"></se-icon>
    <input/>
    <div id="spinner">
      <div id="arrow-up">▲</div>
      <div id="arrow-down">▼</div>
    </div>
    <div id="down">
      <se-icon data-src="arrow_down.svg" size="16"></se-icon>
    </div>
  </div>
  <div id="options-container" style="display:none">
    <slot></slot>
  </div>
`

class SeZoom extends HTMLElement {
  constructor () {
    super()

    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.initPopup = this.initPopup.bind(this)
    this.handleInput = this.handleInput.bind(this)

    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    // locate the component
    this._shadowRoot.append(template.content.cloneNode(true))

    // prepare the slot element
    this.slotElement = this._shadowRoot.querySelector('slot')
    this.slotElement.addEventListener(
      'slotchange',
      this.handleOptionsChange.bind(this)
    )

    // hookup events for the input box
    this.inputElement = this._shadowRoot.querySelector('input')
    this.inputElement.addEventListener('click', this.handleClick.bind(this))
    this.inputElement.addEventListener('change', this.handleInput)
    this.inputElement.addEventListener('keydown', this.handleKeyDown)

    this.clickArea = this._shadowRoot.querySelector('#down')
    this.clickArea.addEventListener('click', this.handleClick.bind(this))

    this.imgPath = svgEditor.configObj.curConfig.imgPath

    this.downImageElement = this.clickArea.querySelector('se-icon')
    this.downImageElement.setAttribute(
      'src',
      (this.imgPath + '/' + this.downImageElement.dataset.src)
    )

    // set src for imageElement
    this.imageElement = this._shadowRoot.querySelector('#icon')
    this.imageElement.setAttribute(
      'src',
      (this.imgPath + '/' + this.getAttribute('src'))
    )

    // hookup events for arrow buttons
    this.arrowUp = this._shadowRoot.querySelector('#arrow-up')
    this.arrowUp.addEventListener('click', this.increment.bind(this))
    this.arrowUp.addEventListener('mousedown', e =>
      this.handleMouseDown('up', true)
    )
    this.arrowUp.addEventListener('mouseleave', e => this.handleMouseUp('up'))
    this.arrowUp.addEventListener('mouseup', e => this.handleMouseUp('up'))

    this.arrowDown = this._shadowRoot.querySelector('#arrow-down')
    this.arrowDown.addEventListener('click', this.decrement.bind(this))
    this.arrowDown.addEventListener('mousedown', e =>
      this.handleMouseDown('down', true)
    )
    this.arrowDown.addEventListener('mouseleave', e =>
      this.handleMouseUp('down')
    )
    this.arrowDown.addEventListener('mouseup', e => this.handleMouseUp('down'))

    this.optionsContainer = this._shadowRoot.querySelector(
      '#options-container'
    )

    // add an event listener to close the popup
    document.addEventListener('click', e => this.handleClose(e))
    this.changedTimeout = null
  }

  static get observedAttributes () {
    return ['value']
  }

  /**
   * The title is a translation key: it becomes the tooltip and the
   * accessible name of the field (lot V1).
   * @returns {void}
   */
  connectedCallback () {
    const titleKey = this.getAttribute('title')
    if (titleKey) {
      this.seTooltip = { label: t(titleKey) }
      this.inputElement.setAttribute('aria-label', t(titleKey))
      this.removeAttribute('title')
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get value () {
    return this.getAttribute('value')
  }

  /**
   * @function set
   * @returns {void}
   */
  set value (value) {
    this.setAttribute('value', value)
  }

  /**
   * Displays a zoom level that the editor has already applied, without
   * emitting `change`. Setting `value` emits `change`, which made the editor
   * apply the same zoom a second time.
   * @param {string|number} value
   * @returns {void}
   */
  syncValue (value) {
    this.silent = true
    try {
      this.setAttribute('value', value)
    } finally {
      this.silent = false
    }
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) {
      switch (name) {
        case 'value':
          if (parseInt(this.inputElement.value) !== newValue) {
            this.inputElement.value = newValue
          }
          break
      }

      return
    }

    switch (name) {
      case 'value':
        this.inputElement.value = newValue
        if (!this.silent) {
          this.dispatchEvent(
            new CustomEvent('change', { detail: { value: newValue } })
          )
        }
        break
    }
  }

  /**
   * @function handleOptionsChange
   * @returns {void}
   */
  handleOptionsChange () {
    if (this.slotElement.assignedElements().length > 0) {
      this.options = this.slotElement.assignedElements()
      this.selectedValue = this.options[0].textContent

      this.initPopup()

      this.options.forEach(option => {
        option.addEventListener('click', e => this.handleSelect(e))
      })
    }
  }

  /**
   * @function handleClick
   * @returns {void}
   */
  handleClick () {
    this.optionsContainer.style.display = 'flex'
    this.inputElement.select()
    this.initPopup()
  }

  /**
   * @function handleSelect
   * @param {Event} e
   * @returns {void}
   */
  handleSelect (e) {
    this.value = e.target.getAttribute('value')
  }

  /**
   * @function handleShow
   * @returns {void}
   * initialises the popup menu position
   */
  initPopup () {
    const zoomPos = this.getBoundingClientRect()
    const popupPos = this.optionsContainer.getBoundingClientRect()
    const top = zoomPos.top - popupPos.height
    const left = zoomPos.left

    this.optionsContainer.style.position = 'fixed'
    this.optionsContainer.style.top = `${top}px`
    this.optionsContainer.style.left = `${left}px`
  }

  /**
   * @function handleClose
   * @param {Event} e
   * @returns {void}
   * Close the popup menu
   */
  handleClose (e) {
    if (e.target !== this) {
      this.optionsContainer.style.display = 'none'
      this.inputElement.blur()
    }
  }

  /**
   * @function handleInput
   * @returns {void}
   */
  handleInput () {
    if (this.changedTimeout) {
      clearTimeout(this.changedTimeout)
    }

    this.changedTimeout = setTimeout(this.triggerInputChanged.bind(this), 500)
  }

  /**
   * @function triggerInputChanged
   * @returns {void}
   */
  triggerInputChanged () {
    const newValue = this.inputElement.value
    this.value = newValue
  }

  /**
   * @function increment
   * @returns {void}
   */
  increment () {
    this.value = parseInt(this.value) + 10
  }

  /**
   * @function decrement
   * @returns {void}
   */
  decrement () {
    if (this.value - 10 <= 0) {
      this.value = 10
    } else {
      this.value = parseInt(this.value) - 10
    }
  }

  /**
   * @function handleMouseDown
   * @param {string} dir
   * @param {boolean} isFirst
   * @returns {void}
   * Increment/Decrement on mouse held down, if its the first call add a delay before starting
   */
  handleMouseDown (dir, isFirst) {
    if (dir === 'up') {
      this.incrementHold = true
      !isFirst && this.increment()

      setTimeout(
        () => {
          if (this.incrementHold) {
            this.handleMouseDown(dir, false)
          }
        },
        isFirst ? 500 : 50
      )
    } else if (dir === 'down') {
      this.decrementHold = true
      !isFirst && this.decrement()

      setTimeout(
        () => {
          if (this.decrementHold) {
            this.handleMouseDown(dir, false)
          }
        },
        isFirst ? 500 : 50
      )
    }
  }

  /**
   * @function handleMouseUp
   * @param {string} dir
   * @returns {void}
   */
  handleMouseUp (dir) {
    if (dir === 'up') {
      this.incrementHold = false
    } else {
      this.decrementHold = false
    }
  }

  /**
   * @function handleKeyDown
   * @param {Event} e
   * @returns {void}
   */
  handleKeyDown (e) {
    if (e.key === 'ArrowUp') {
      this.increment()
    } else if (e.key === 'ArrowDown') {
      this.decrement()
    }
  }
}

// Register
customElements.define('se-zoom', SeZoom)
