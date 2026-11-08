/**
 * Adds context menu functionality.
 * @module contextmenu
 * @license Apache-2.0
 * @author Adam Bender
 */

let contextMenuExtensions = {}

/**
 * Signature depends on what the user adds; in the case of our uses with
 * SVGEditor, no parameters are passed nor anything expected for a return.
 * @callback module:contextmenu.MenuItemAction
 * @param {...args} args
 * @returns {any}
*/

/**
* @typedef {PlainObject} module:contextmenu.MenuItem
* @property {string} id
* @property {string} label
* @property {module:contextmenu.MenuItemAction} action
*/

/**
* @param {module:contextmenu.MenuItem} menuItem
* @returns {boolean}
*/
const menuItemIsValid = function (menuItem) {
  return menuItem && menuItem.id && menuItem.label && menuItem.action && typeof menuItem.action === 'function'
}

/**
* @function module:contextmenu.add
* @param {module:contextmenu.MenuItem} menuItem
* @throws {Error|TypeError}
* @returns {void}
*/
export const add = function (menuItem) {
  // menuItem: {id, label, shortcut, action}
  if (!menuItemIsValid(menuItem)) {
    throw new TypeError(
      'Menu items must be defined and have at least properties: ' +
      'id, label, action, where action must be a function'
    )
  }
  if (menuItem.id in contextMenuExtensions) {
    throw new Error('Cannot add extension "' + menuItem.id + '", an extension by that name already exists"')
  }
  // Register menuItem action, see below for deferred menu dom injection
  contextMenuExtensions[menuItem.id] = menuItem
  // TODO: Need to consider how to handle custom enable/disable behavior
}

/**
* @function module:contextmenu.hasCustomHandler
* @param {string} handlerKey
* @returns {boolean}
*/
export const hasCustomHandler = function (handlerKey) {
  return Boolean(contextMenuExtensions[handlerKey])
}

/**
* @function module:contextmenu.getCustomHandler
* @param {string} handlerKey
* @returns {module:contextmenu.MenuItemAction}
*/
export const getCustomHandler = function (handlerKey) {
  return contextMenuExtensions[handlerKey].action
}

/**
* @param {module:contextmenu.MenuItem} menuItem
* @returns {void}
*/
const injectExtendedContextMenuItemIntoDom = function (menuItem) {
  // The canvas menu lives in the shadow DOM of <se-cmenu_canvas-dialog>: the
  // former code appended a string to a missing #cmenu_canvas and threw.
  document.getElementById('se-cmenu_canvas')?.addExtensionItem?.(menuItem)
}

/**
* @function module:contextmenu.injectExtendedContextMenuItemsIntoDom
* @returns {void}
*/
export const injectExtendedContextMenuItemsIntoDom = function () {
  Object.values(contextMenuExtensions).forEach((menuItem) => {
    injectExtendedContextMenuItemIntoDom(menuItem)
  })
}
/**
* @function module:contextmenu.resetCustomMenus
* @returns {void}
*/
export const resetCustomMenus = function () { contextMenuExtensions = {} }
