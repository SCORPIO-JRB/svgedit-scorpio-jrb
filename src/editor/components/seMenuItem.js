/* globals svgEditor */
import 'elix/define/Menu.js'
import 'elix/define/MenuItem.js'
import './seIcon.js'
import { t } from '../locale.js'
import { shortcutHint, bindElementCommand, unbindElementCommand } from '../commands.js'
const template = document.createElement('template')
template.innerHTML = `
  <style>
  elix-menu-item {
    color: var(--se-text);
    --se-icon-size: 16px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 24px;
  }
  se-icon {
    color: var(--se-icon);
  }
  .label {
    flex: 1;
  }
  .shortcut {
    padding-left: 24px;
    color: var(--se-text-secondary);
  }
  </style>
  <elix-menu-item>
    <div class="row">
      <se-icon style="display:none;"></se-icon>
      <span class="label"></span>
      <span class="shortcut"></span>
    </div>
  </elix-menu-item>
`
/**
 * @class SeMenuItem
 */
export class SeMenuItem extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$img = this._shadowRoot.querySelector('se-icon')
    this.$label = this._shadowRoot.querySelector('.label')
    this.$shortcut = this._shadowRoot.querySelector('.shortcut')
    this.$menuitem = this._shadowRoot.querySelector('elix-menu-item')
    this.$svg = this.$menuitem.shadowRoot.querySelector('#checkmark')
    this.$svg.setAttribute('style', 'display: none;')
    this.imgPath = svgEditor.configObj.curConfig.imgPath
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
    let shortcut = ''
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        this.$img.style.display = 'inline-block'
        this.$img.setAttribute('src', this.imgPath + '/' + newValue)
        break
      case 'label':
        shortcut = shortcutHint(this.getAttribute('shortcut'), t)
        this.$label.textContent = t(newValue)
        this.$shortcut.textContent = shortcut
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

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    // The shortcut becomes a command of the editor, which clicks the entry.
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
customElements.define('se-menu-item', SeMenuItem)
