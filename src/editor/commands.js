/**
 * Command registry of the editor (plan v2, sections 3 and 4.7, lot V1).
 *
 * Each action is declared once: an identifier, a label, its shortcuts, the
 * condition under which it applies and what it does. A button, a menu entry
 * and a shortcut call the same command, and every shortcut shown to the user
 * (tooltip, menu, context menu) is generated here from the shortcut that
 * actually runs the command: it cannot be wrong any more.
 *
 * One keydown listener dispatches every shortcut of the editor. When several
 * commands share a shortcut (a button for one object and its twin for a
 * multi-selection), the first enabled one runs, once.
 * @module commands
 */
import { isMac } from '@svgedit/svgcanvas/common/browser'
import { normalizeShortcut, eventShortcut } from './shortcuts.js'

/**
 * @typedef {object} CommandSpec
 * @property {string} id Unique identifier
 * @property {string} [label] Translation key or text of the label
 * @property {string|string[]} [shortcuts] Shortcuts, in any notation that
 *   normalizeShortcut reads; "Delete/Backspace" gives two shortcuts
 * @property {() => boolean} [when] Whether the command applies now
 * @property {(event?: Event) => void} run What it does
 * @property {boolean} [preventDefault=true] Whether the key event is
 *   prevented; false for cut, copy and paste, whose clipboard event must follow
 * @property {any} [source] The element that declared it, if any
 */

// Keys shown by name rather than by character, with their translation key.
const KEY_NAMES = {
  delete: 'delete',
  backspace: 'backspace',
  escape: 'escape',
  enter: 'enter',
  tab: 'tab',
  ' ': 'space',
  pageup: 'pageup',
  pagedown: 'pagedown',
  home: 'home',
  end: 'end'
}
const KEY_SYMBOLS = {
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→'
}
const MAC_KEYS = {
  enter: '↩',
  escape: '⎋',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥'
}
const DEFAULT_NAMES = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  delete: 'Delete',
  backspace: 'Backspace',
  escape: 'Esc',
  enter: 'Enter',
  tab: 'Tab',
  space: 'Space',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  home: 'Home',
  end: 'End'
}

/**
 * Splits a shortcut specification into canonical shortcuts.
 * @param {string|string[]} spec
 * @returns {string[]}
 */
export const parseShortcuts = (spec) => {
  const list = Array.isArray(spec) ? spec : [spec]
  return list
    .flatMap((item) => String(item ?? '').split(' / ')[0].split('/'))
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizeShortcut)
    .filter(Boolean)
}

/**
 * Formats a canonical shortcut for display: symbols on macOS (⇧⌘Z), names
 * joined by "+" elsewhere (Ctrl+Shift+Z), in the language of the interface.
 * @param {string} canonical As given by normalizeShortcut
 * @param {object} [options]
 * @param {boolean} [options.mac]
 * @param {(key: string, fallback: string) => string} [options.translate]
 * @returns {string}
 */
export const formatShortcut = (canonical, { mac = isMac(), translate } = {}) => {
  if (!canonical) return ''
  const name = (key) => {
    const fallback = DEFAULT_NAMES[key] ?? key
    return translate ? translate(`shortcuts.${key}`, fallback) : fallback
  }
  const parts = canonical === '+' || canonical.endsWith('++')
    ? [...canonical.slice(0, -1).split('+').filter(Boolean), '+']
    : canonical.split('+')
  const key = parts.pop()
  const modifiers = new Set(parts)
  let keyLabel
  if (KEY_SYMBOLS[key]) {
    keyLabel = KEY_SYMBOLS[key]
  } else if (mac && MAC_KEYS[key]) {
    keyLabel = MAC_KEYS[key]
  } else if (KEY_NAMES[key]) {
    keyLabel = name(KEY_NAMES[key])
  } else {
    keyLabel = key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1)
  }
  if (mac) {
    // Apple order: Control, Option, Shift, Command.
    return [
      modifiers.has('ctrl') ? '⌃' : '',
      modifiers.has('alt') ? '⌥' : '',
      modifiers.has('shift') ? '⇧' : '',
      modifiers.has('mod') ? '⌘' : '',
      keyLabel
    ].join('')
  }
  return [
    modifiers.has('mod') || modifiers.has('ctrl') ? name('ctrl') : '',
    modifiers.has('alt') ? name('alt') : '',
    modifiers.has('shift') ? name('shift') : '',
    keyLabel
  ].filter(Boolean).join('+')
}

export class CommandRegistry {
  /**
   * @param {object} [options]
   * @param {boolean} [options.mac] Whether Cmd is the primary modifier
   * @param {(key: string, fallback: string) => string} [options.translate]
   */
  constructor ({ mac = isMac(), translate } = {}) {
    this.mac = mac
    this.translate = translate
    /** @type {Map<string, CommandSpec & {shortcuts: string[]}>} */
    this.commands = new Map()
    /** @type {Map<string, string[]>} canonical shortcut -> command ids */
    this.bindings = new Map()
  }

  /**
   * Declares a command, or replaces the command of the same identifier.
   * @param {CommandSpec} spec
   * @returns {CommandSpec}
   */
  register (spec) {
    if (!spec?.id) throw new Error('A command needs an id')
    if (typeof spec.run !== 'function') throw new Error(`Command ${spec.id} needs run()`)
    this.unregister(spec.id)
    const command = {
      preventDefault: true,
      ...spec,
      shortcuts: parseShortcuts(spec.shortcuts ?? [])
    }
    this.commands.set(command.id, command)
    for (const shortcut of command.shortcuts) {
      const ids = this.bindings.get(shortcut) ?? []
      ids.push(command.id)
      this.bindings.set(shortcut, ids)
    }
    return command
  }

  /**
   * @param {string} id
   * @returns {boolean} Whether a command was removed
   */
  unregister (id) {
    const command = this.commands.get(id)
    if (!command) return false
    for (const shortcut of command.shortcuts) {
      const ids = (this.bindings.get(shortcut) ?? []).filter((other) => other !== id)
      if (ids.length) this.bindings.set(shortcut, ids)
      else this.bindings.delete(shortcut)
    }
    this.commands.delete(id)
    return true
  }

  /**
   * @param {string} id
   * @returns {CommandSpec|undefined}
   */
  get (id) {
    return this.commands.get(id)
  }

  /**
   * @returns {CommandSpec[]} Every command, in the order of declaration
   */
  list () {
    return [...this.commands.values()]
  }

  /**
   * @param {string} shortcut In any notation
   * @returns {CommandSpec[]} The commands bound to it, in order
   */
  find (shortcut) {
    const canonical = normalizeShortcut(shortcut)
    return (this.bindings.get(canonical) ?? []).map((id) => this.commands.get(id))
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  isEnabled (id) {
    const command = this.commands.get(id)
    if (!command) return false
    try {
      return command.when ? Boolean(command.when()) : true
    } catch (err) {
      console.error(err)
      return false
    }
  }

  /**
   * Runs a command if it applies.
   * @param {string} id
   * @param {Event} [event]
   * @returns {boolean} Whether it ran
   */
  execute (id, event) {
    if (!this.isEnabled(id)) return false
    this.commands.get(id).run(event)
    return true
  }

  /**
   * Runs the first enabled command bound to the key of an event.
   * @param {KeyboardEvent} event
   * @returns {boolean} Whether a command ran
   */
  dispatch (event) {
    const ids = this.bindings.get(eventShortcut(event, this.mac))
    if (!ids) return false
    for (const id of ids) {
      if (!this.isEnabled(id)) continue
      const command = this.commands.get(id)
      if (command.preventDefault) event.preventDefault()
      command.run(event)
      return true
    }
    return false
  }

  /**
   * @param {string} canonical
   * @returns {string} The shortcut as shown on this platform
   */
  format (canonical) {
    return formatShortcut(canonical, { mac: this.mac, translate: this.translate })
  }

  /**
   * @param {string} id
   * @returns {string} The first shortcut of a command, as shown, or ""
   */
  hint (id) {
    const command = this.commands.get(id)
    return command?.shortcuts.length ? this.format(shownShortcut(command.shortcuts, this.mac)) : ''
  }

  /**
   * Shortcuts bound to more than one command, for diagnosis.
   * @returns {{shortcut: string, ids: string[]}[]}
   */
  conflicts () {
    return [...this.bindings.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([shortcut, ids]) => ({ shortcut, ids }))
  }
}

/*
 * Helpers for the se-* components, which read the registry of the editor
 * they belong to (window.svgEditor.commands).
 */
const editorRegistry = () => window.svgEditor?.commands

/**
 * Reads a shortcut attribute, which may be a translation key such as
 * "layer_view:buttons.0.key".
 * @param {string} spec
 * @param {(key: string) => string} [t]
 * @returns {string}
 */
const resolveSpec = (spec, t) => {
  if (!spec) return ''
  if (t && /^[\w-]+:[\w.]+$/.test(spec)) {
    const translated = t(spec)
    if (translated && translated !== spec) return translated
  }
  return spec
}

/**
 * The shortcut to show among several: Backspace on macOS, where the key named
 * "delete" sends it.
 * @param {string[]} shortcuts
 * @param {boolean} mac
 * @returns {string}
 */
const shownShortcut = (shortcuts, mac) => {
  if (mac && shortcuts.includes('backspace')) return 'backspace'
  return shortcuts[0]
}

/**
 * @param {string} spec A shortcut attribute
 * @param {(key: string) => string} [t]
 * @returns {string} The shortcut as shown on this platform, or ""
 */
export const shortcutHint = (spec, t) => {
  const shortcuts = parseShortcuts(resolveSpec(spec, t))
  if (!shortcuts.length) return ''
  const registry = editorRegistry()
  const mac = registry?.mac ?? isMac()
  const shown = shownShortcut(shortcuts, mac)
  return registry ? registry.format(shown) : formatShortcut(shown, { mac })
}

/**
 * A canonical shortcut in the notation of aria-keyshortcuts ("Control+Shift+Z").
 * @param {string} canonical
 * @param {boolean} mac
 * @returns {string}
 */
const ariaShortcut = (canonical, mac) => {
  const parts = canonical.endsWith('++')
    ? [...canonical.slice(0, -2).split('+').filter(Boolean), '+']
    : canonical.split('+')
  const names = { mod: mac ? 'Meta' : 'Control', ctrl: 'Control', alt: 'Alt', shift: 'Shift' }
  return parts.map((part) => names[part] ?? (part.length === 1 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))).join('+')
}

/**
 * Sets the name and the shortcut of a control: its tooltip (se-tooltip) and
 * its accessible name. The native title is removed, as the tooltip replaces it.
 * @param {HTMLElement} host The element the tooltip controller finds
 * @param {HTMLElement} control The element that carries the accessible name
 * @param {string} label
 * @param {string} spec A shortcut attribute
 * @param {(key: string) => string} [t]
 * @returns {void}
 */
export const setControlName = (host, control, label, spec, t) => {
  const shortcut = shortcutHint(spec, t)
  host.seTooltip = label ? { label, shortcut } : null
  control.removeAttribute('title')
  if (label) control.setAttribute('aria-label', shortcut ? `${label} (${shortcut})` : label)
  else control.removeAttribute('aria-label')
  if (shortcut) {
    const mac = editorRegistry()?.mac ?? isMac()
    control.setAttribute('aria-keyshortcuts', parseShortcuts(resolveSpec(spec, t))
      .map((canonical) => ariaShortcut(canonical, mac)).join(' '))
  } else {
    control.removeAttribute('aria-keyshortcuts')
  }
}

/**
 * The title attribute of a button (se-button, se-flyingbutton,
 * se-explorerbutton) gives its name, then leaves the element: the browser
 * would show it in a tooltip of its own, next to se-tooltip. The `title`
 * property of the button and controlTitle keep it.
 * @param {HTMLElement} host
 * @param {HTMLElement} control The element that carries the accessible name
 * @param {string} value The title attribute
 * @param {(key: string) => string} [t]
 * @returns {void}
 */
export const adoptTitle = (host, control, value, t) => {
  host.seTitle = value
  setControlName(host, control, t ? t(value) : value, host.getAttribute('shortcut'), t)
  host.removeAttribute('title')
}

/**
 * @param {Element} element
 * @returns {string|null} Its title, also when adoptTitle took it
 */
export const controlTitle = (element) => element.seTitle ?? element.getAttribute('title')

/**
 * @param {string} label
 * @param {string} spec A shortcut attribute
 * @param {(key: string) => string} [t]
 * @returns {string} "Label (Ctrl+Z)", or the label alone
 */
export const titleWithShortcut = (label, spec, t) => {
  const hint = shortcutHint(spec, t)
  return hint ? `${label} (${hint})` : label
}

let anonymous = 0
/**
 * Declares the command of a button or menu entry: its shortcut clicks it,
 * unless it is disabled.
 * @param {HTMLElement} element
 * @param {(key: string) => string} [t]
 * @returns {string|null} The identifier of the command
 */
export const bindElementCommand = (element, t) => {
  const registry = editorRegistry()
  const spec = resolveSpec(element.getAttribute('shortcut'), t)
  if (!registry || !spec || element.hasAttribute('shortcut-hint-only')) return null
  if (!element.id && !element.dataset.commandId) element.dataset.commandId = `element-${++anonymous}`
  const id = element.id || element.dataset.commandId
  registry.register({
    id,
    label: controlTitle(element) ?? element.getAttribute('label') ?? id,
    shortcuts: spec,
    when: () => element.isConnected && !element.hasAttribute('disabled'),
    run: () => element.click(),
    source: element
  })
  return id
}

/**
 * @param {HTMLElement} element
 * @returns {void}
 */
export const unbindElementCommand = (element) => {
  const registry = editorRegistry()
  const id = element.id || element.dataset.commandId
  if (registry && id && registry.get(id)?.source === element) registry.unregister(id)
}
