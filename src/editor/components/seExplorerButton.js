/* globals svgEditor */
import './seIcon.js'
import { setControlName } from '../commands.js'

/**
 * @class ExplorerButton
 */
export class ExplorerButton extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    // create the shadowDom and insert the template
    this.imgPath = svgEditor.configObj.curConfig.imgPath
    this.template = this.createTemplate(this.imgPath)
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(this.template.content.cloneNode(true))
    // locate the component
    this.$button = this._shadowRoot.querySelector('.menu-button')
    this.$overall = this._shadowRoot.querySelector('.overall')
    this.$img = this._shadowRoot.querySelector('.menu-button se-icon')
    this.$menu = this._shadowRoot.querySelector('.menu')
    this.$handle = this._shadowRoot.querySelector('.handle')
    this.$lib = this._shadowRoot.querySelector('.image-lib')
    this.files = []
    this.request = new XMLHttpRequest()
    this.imgPath = svgEditor.configObj.curConfig.imgPath

    // Closes opened (pressed) lib menu on click on the canvas
    const workarea = document.getElementById('workarea')
    workarea.addEventListener('click', (e) => {
      this.$menu.classList.remove('open')
      this.$lib.classList.remove('open-lib')
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
      cursor: pointer;
      transition: background-color var(--se-duration-state) var(--se-ease-out),
        color var(--se-duration-state) var(--se-ease-out);
    }
    .overall:not(.pressed) .menu-button:hover {
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
    /* The corner that opens the library. */
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
      top: 30%;
      left: 216px;
      display: none;
      padding: 4px;
      border: 1px solid var(--se-border);
      border-radius: 0 var(--se-radius-float) var(--se-radius-float) 0;
      background-color: var(--se-surface-raised);
      box-shadow: var(--se-shadow-menu);
    }
    .image-lib {
      position: fixed;
      left: 40px;
      top: 30%;
      box-sizing: border-box;
      width: 176px;
      display: none;
      flex-wrap: wrap;
      flex-direction: row;
      padding: 4px;
      border: 1px solid var(--se-border);
      border-radius: var(--se-radius-float) 0 0 var(--se-radius-float);
      background-color: var(--se-surface-raised);
      box-shadow: var(--se-shadow-menu);
    }
    .menu-item {
      padding: 4px 8px;
      border-radius: var(--se-radius-field);
      color: var(--se-text);
      white-space: nowrap;
      cursor: pointer;
    }
    .menu-item:hover {
      background-color: var(--se-control-hover);
    }
    .menu-item.pressed {
      background-color: var(--se-accent-bg);
      color: var(--se-accent);
    }
    .open-lib {
      display: inline-flex;
    }
    .open {
      display: block;
    }
    </style>

    <div class="overall">
      <div class="menu-button" role="button" aria-haspopup="true">
        <se-icon class="button-icon"></se-icon>
        <div class="handle"></div>
      </div>
      <div class="image-lib">
        <se-button></se-button>
      </div>
      <div class="menu">
        <div class="menu-item"></div>
      </div>
    </div>`
    return template
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['title', 'pressed', 'disabled', 'lib', 'src']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  async attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        setControlName(this, this.$button, newValue, this.getAttribute('shortcut'))
        break
      case 'pressed':
        if (newValue) {
          this.$overall.classList.add('pressed')
        } else {
          this.$overall.classList.remove('pressed')
        }
        break
      case 'disabled':
        if (newValue) {
          this.$overall.classList.add('disabled')
        } else {
          this.$overall.classList.remove('disabled')
        }
        break
      case 'lib':
        try {
          const response = await fetch(`${newValue}index.json`)
          const json = await response.json()
          const { lib } = json
          this.$menu.innerHTML = lib.map((menu, i) => (
          `<div data-menu="${menu}" class="menu-item ${(i === 0) ? 'pressed' : ''} ">${menu}</div>`
          )).join('')
          await this.updateLib(lib[0])
        } catch (error) {
          console.error(error)
        }
        break
      case 'src':
        this.$img.setAttribute('src', this.imgPath + '/' + newValue)
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
    // capture click event on the button to manage the logic
    const onClickHandler = (ev) => {
      ev.stopPropagation()
      switch (ev.target.nodeName) {
        case 'SE-EXPLORERBUTTON':
          this.$menu.classList.toggle('open')
          this.$lib.classList.toggle('open-lib')
          break
        case 'SE-BUTTON':
        // change to the current action
          this.currentAction = ev.target
          this.$img.setAttribute('src', this.currentAction.getAttribute('src'))
          this.dataset.draw = this.data[this.currentAction.dataset.shape]
          this._shadowRoot.querySelectorAll('.image-lib [pressed]').forEach((b) => { b.pressed = false })
          this.currentAction.setAttribute('pressed', 'pressed')
          // and close the menu
          this.$menu.classList.remove('open')
          this.$lib.classList.remove('open-lib')
          break
        case 'DIV':
          if (ev.target.classList[0] === 'handle') {
          // this is a click on the handle so let's open/close the menu.
            this.$menu.classList.toggle('open')
            this.$lib.classList.toggle('open-lib')
          } else {
            this._shadowRoot.querySelectorAll('.menu > .pressed').forEach((b) => { b.classList.remove('pressed') })
            ev.target.classList.add('pressed')
            this.updateLib(ev.target.dataset.menu)
          }
          break
        default:
          console.error('unknown nodeName for:', ev.target, ev.target.className)
      }
    }
    // capture event from slots
    svgEditor.$click(this, onClickHandler)
    svgEditor.$click(this.$menu, onClickHandler)
    svgEditor.$click(this.$lib, onClickHandler)
    svgEditor.$click(this.$handle, onClickHandler)
  }

  /**
   * @function updateLib
   * @param {string} lib
   * @returns {void}
   */
  async updateLib (lib) {
    const libDir = this.getAttribute('lib')
    try {
      // initialize buttons for all shapes defined for this library
      const response = await fetch(`${libDir}${lib}.json`)
      const json = await response.json()
      this.data = json.data
      const size = json.size ?? 300
      // Drawn as a mask by se-icon: only the shape counts, not the colour.
      const fill = json.fill ? 'currentColor' : 'none'
      const off = size * 0.05
      const vb = [-off, -off, size + off * 2, size + off * 2].join(' ')
      const stroke = json.fill ? 0 : (size / 30)
      this.$lib.innerHTML = Object.entries(this.data).map(([key, path]) => {
        const encoded = btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <svg viewBox="${vb}"><path fill="${fill}" stroke="currentColor" stroke-width="${stroke}" d="${path}"></path></svg>
        </svg>`)
        return `<se-button data-shape="${key}"src="data:image/svg+xml;base64,${encoded}"></se-button>`
      }).join('')
    } catch (error) {
      console.error(`could not read file:${libDir}${lib}.json`, error)
    }
  }
}

// Register
customElements.define('se-explorerbutton', ExplorerButton)
