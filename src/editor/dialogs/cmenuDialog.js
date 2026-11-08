/* globals svgEditor */
import cMenuDialogHTML from './cmenuDialog.html'
import { t } from '../locale.js'
import { shortcutHint } from '../commands.js'
const template = document.createElement('template')
template.innerHTML = cMenuDialogHTML
/**
 * @class SeCMenuDialog
 */
export class SeCMenuDialog extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this._workarea = document.getElementById('workarea')
    this.$dialog = this._shadowRoot.querySelector('#cmenu_canvas')
    this.$copyLink = this._shadowRoot.querySelector('#se-copy')
    this.$cutLink = this._shadowRoot.querySelector('#se-cut')
    this.$pasteLink = this._shadowRoot.querySelector('#se-paste')
    this.$pasteInPlaceLink = this._shadowRoot.querySelector('#se-paste-in-place')
    // Copy and paste the properties of an object (M7)
    this.$propertiesLinks = {
      copy_properties: this._shadowRoot.querySelector('#se-copy-properties'),
      paste_properties: this._shadowRoot.querySelector('#se-paste-properties')
    }
    this.$deleteLink = this._shadowRoot.querySelector('#se-delete')
    this.$groupLink = this._shadowRoot.querySelector('#se-group')
    this.$ungroupLink = this._shadowRoot.querySelector('#se-ungroup')
    this.$moveFrontLink = this._shadowRoot.querySelector('#se-move-front')
    this.$moveUpLink = this._shadowRoot.querySelector('#se-move-up')
    this.$moveDownLink = this._shadowRoot.querySelector('#se-move-down')
    this.$moveBackLink = this._shadowRoot.querySelector('#se-move-back')
    // Objects that look the same as the selection (M6)
    this.$similarLinks = {
      select_same_symbol: this._shadowRoot.querySelector('#se-select-same-symbol'),
      select_same_fill: this._shadowRoot.querySelector('#se-select-same-fill'),
      select_same_stroke: this._shadowRoot.querySelector('#se-select-same-stroke')
    }
  }

  /**
   * @function init
   * @param {any} name
   * @returns {void}
   */
  init (i18next) {
    this.setAttribute('tools-cut', i18next.t('tools.cut'))
    this.setAttribute('tools-copy', i18next.t('tools.copy'))
    this.setAttribute('tools-paste', i18next.t('tools.paste'))
    this.setAttribute('tools-paste_in_place', i18next.t('tools.paste_in_place'))
    this.setAttribute('tools-delete', i18next.t('tools.delete'))
    this.setAttribute('tools-group', i18next.t('tools.group'))
    this.setAttribute('tools-ungroup', i18next.t('tools.ungroup'))
    this.setAttribute('tools-move_front', i18next.t('tools.move_front'))
    this.setAttribute('tools-move_up', i18next.t('tools.move_up'))
    this.setAttribute('tools-move_down', i18next.t('tools.move_down'))
    this.setAttribute('tools-move_back', i18next.t('tools.move_back'))
    Object.entries(this.$similarLinks).forEach(([action, link]) => {
      link.textContent = i18next.t(`tools.${action}`)
    })
    Object.entries(this.$propertiesLinks).forEach(([action, link]) => {
      link.prepend(document.createTextNode(i18next.t(`tools.${action}`)))
    })
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['disableallmenu', 'enablemenuitems', 'disablemenuitems', 'tools-cut',
      'tools-copy', 'tools-paste', 'tools-paste_in_place', 'tools-delete', 'tools-group',
      'tools-ungroup', 'tools-move_front', 'tools-move_up', 'tools-move_down',
      'tools-move_back']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    let eles = []
    let textnode
    const sdowRoot = this._shadowRoot
    switch (name) {
      case 'disableallmenu':
        if (newValue === 'true') {
          const elesli = sdowRoot.querySelectorAll('li')
          elesli.forEach(function (eleli) {
            eleli.classList.add('disabled')
          })
        }
        break
      case 'enablemenuitems':
        eles = newValue.split(',')
        eles.forEach(function (ele) {
          const selEle = sdowRoot.querySelector('a[href*="' + ele + '"]')
          selEle.parentElement.classList.remove('disabled')
        })
        break
      case 'disablemenuitems':
        eles = newValue.split(',')
        eles.forEach(function (ele) {
          const selEle = sdowRoot.querySelector('a[href*="' + ele + '"]')
          selEle.parentElement.classList.add('disabled')
        })
        break
      case 'tools-cut':
        textnode = document.createTextNode(newValue)
        this.$cutLink.prepend(textnode)
        break
      case 'tools-copy':
        textnode = document.createTextNode(newValue)
        this.$copyLink.prepend(textnode)
        break
      case 'tools-paste':
        textnode = document.createTextNode(newValue)
        this.$pasteLink.prepend(textnode)
        break
      case 'tools-paste_in_place':
        textnode = document.createTextNode(newValue)
        this.$pasteInPlaceLink.prepend(textnode)
        break
      case 'tools-delete':
        textnode = document.createTextNode(newValue)
        this.$deleteLink.prepend(textnode)
        break
      case 'tools-group':
        textnode = document.createTextNode(newValue)
        this.$groupLink.prepend(textnode)
        break
      case 'tools-ungroup':
        textnode = document.createTextNode(newValue)
        this.$ungroupLink.prepend(textnode)
        break
      case 'tools-move_front':
        textnode = document.createTextNode(newValue)
        this.$moveFrontLink.prepend(textnode)
        break
      case 'tools-move_up':
        textnode = document.createTextNode(newValue)
        this.$moveUpLink.prepend(textnode)
        break
      case 'tools-move_down':
        textnode = document.createTextNode(newValue)
        this.$moveDownLink.prepend(textnode)
        break
      case 'tools-move_back':
        textnode = document.createTextNode(newValue)
        this.$moveBackLink.prepend(textnode)
        break
      default:
      // super.attributeChangedCallback(name, oldValue, newValue);
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get disableallmenu () {
    return this.getAttribute('disableallmenu')
  }

  /**
   * @function set
   * @returns {void}
   */
  set disableallmenu (value) {
    this.setAttribute('disableallmenu', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get enablemenuitems () {
    return this.getAttribute('enablemenuitems')
  }

  /**
   * @function set
   * @returns {void}
   */
  set enablemenuitems (value) {
    this.setAttribute('enablemenuitems', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get disablemenuitems () {
    return this.getAttribute('disablemenuitems')
  }

  /**
   * @function set
   * @returns {void}
   */
  set disablemenuitems (value) {
    this.setAttribute('disablemenuitems', value)
  }

  /**
   * Enables or greys out one item. Unlike the `enablemenuitems` attribute,
   * this applies even when the same value is set twice in a row.
   * @param {string} action The item's action, as in its href
   * @param {boolean} enabled
   * @returns {void}
   */
  setItemEnabled (action, enabled) {
    this._shadowRoot.querySelector(`a[href="#${action}"]`)
      ?.parentElement.classList.toggle('disabled', !enabled)
  }

  /**
   * Adds a menu item registered by an extension (see `contextmenu.add`). A
   * click dispatches `change` with the item id, which the editor routes to the
   * extension's action. The label is inserted as text, never as markup.
   * @param {{id: string, label: string, shortcut?: string}} menuItem
   * @returns {void}
   */
  addExtensionItem ({ id, label, shortcut }) {
    if (!this.hasExtensionItems) {
      // extension items appear at the bottom of the menu, after a separator
      const separator = document.createElement('li')
      separator.className = 'separator'
      this.$dialog.append(separator)
      this.hasExtensionItems = true
    }
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `#${id}`
    link.textContent = label
    if (shortcut) {
      // Shown in the notation of the platform; refreshShortcuts keeps it.
      link.dataset.shortcut = shortcut
      const hint = document.createElement('span')
      hint.className = 'shortcut'
      hint.textContent = shortcutHint(shortcut, t)
      link.append(hint)
    }
    item.append(link)
    this.$dialog.append(item)
    svgEditor.$click(link, (evt) => {
      evt.preventDefault()
      this.$dialog.style.display = 'none'
      this.dispatchEvent(new CustomEvent('change', { detail: { trigger: id } }))
    })
  }

  /**
   * Shows beside each entry the shortcut that runs the same command, read
   * from the registry of the editor (lot V1): the hint cannot differ from
   * the key that works. An entry without a shortcut shows none.
   * @returns {void}
   */
  refreshShortcuts () {
    const commands = svgEditor.commands
    if (!commands) return
    this.$dialog.querySelectorAll('a[href^="#"]').forEach((link) => {
      const action = link.getAttribute('href').slice(1)
      let hint = link.querySelector('.shortcut')
      const text = link.dataset.shortcut
        ? shortcutHint(link.dataset.shortcut, t)
        : commands.hint(action)
      if (!text) {
        hint?.remove()
        return
      }
      if (!hint) {
        hint = document.createElement('span')
        hint.className = 'shortcut'
        link.append(hint)
      }
      hint.textContent = text
    })
  }

  /**
   * @function connectedCallback
   * @returns {void}
   */
  connectedCallback () {
    const current = this
    const onMenuOpenHandler = (e) => {
      e.preventDefault()
      // Detect mouse position
      let x = e.pageX
      let y = e.pageY

      const xOff = screen.width - 250 // menu width
      const yOff = screen.height - (276 + 150) // menu height + bottom panel height and scroll bar

      if (x > xOff) {
        x = xOff
      }
      if (y > yOff) {
        y = yOff
      }
      current.$dialog.style.top = y + 'px'
      current.$dialog.style.left = x + 'px'
      current.refreshShortcuts()
      current.$dialog.style.display = 'block'
    }
    const onMenuCloseHandler = (e) => {
      if (e.button !== 2) {
        current.$dialog.style.display = 'none'
      }
    }
    const onMenuClickHandler = (e, action) => {
      // The clicked item takes the focus: give it back to the page, or the
      // keyboard shortcuts (Mod+V, Delete...) stop working until the canvas
      // is clicked.
      this._shadowRoot.activeElement?.blur()
      const triggerEvent = new CustomEvent('change', {
        detail: {
          trigger: action
        }
      })
      this.dispatchEvent(triggerEvent)
    }
    this._workarea.addEventListener('contextmenu', onMenuOpenHandler)
    this._workarea.addEventListener('mousedown', onMenuCloseHandler)
    svgEditor.$click(this.$cutLink, (evt) => onMenuClickHandler(evt, 'cut'))
    svgEditor.$click(this.$copyLink, (evt) => onMenuClickHandler(evt, 'copy'))
    svgEditor.$click(this.$pasteLink, (evt) => onMenuClickHandler(evt, 'paste'))
    svgEditor.$click(this.$pasteInPlaceLink, (evt) => onMenuClickHandler(evt, 'paste_in_place'))
    Object.entries(this.$propertiesLinks).forEach(([action, link]) => {
      svgEditor.$click(link, (evt) => onMenuClickHandler(evt, action))
    })
    svgEditor.$click(this.$deleteLink, (evt) => onMenuClickHandler(evt, 'delete'))
    svgEditor.$click(this.$groupLink, (evt) => onMenuClickHandler(evt, 'group'))
    svgEditor.$click(this.$ungroupLink, (evt) => onMenuClickHandler(evt, 'ungroup'))
    svgEditor.$click(this.$moveFrontLink, (evt) => onMenuClickHandler(evt, 'move_front'))
    svgEditor.$click(this.$moveUpLink, (evt) => onMenuClickHandler(evt, 'move_up'))
    svgEditor.$click(this.$moveDownLink, (evt) => onMenuClickHandler(evt, 'move_down'))
    svgEditor.$click(this.$moveBackLink, (evt) => onMenuClickHandler(evt, 'move_back'))
    Object.entries(this.$similarLinks).forEach(([action, link]) => {
      svgEditor.$click(link, (evt) => {
        evt.preventDefault()
        current.$dialog.style.display = 'none'
        onMenuClickHandler(evt, action)
      })
    })
  }
}

// Register
customElements.define('se-cmenu_canvas-dialog', SeCMenuDialog)
