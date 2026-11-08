/**
 * One normalisation for every keyboard shortcut of the editor.
 *
 * Buttons, menu items and the editor's own shortcut table used three
 * different normalisations: buttons ignored Shift and Alt (so Ctrl+Shift+Z
 * undid instead of redoing, and Shift+D also cloned), Cmd was never treated as
 * the primary modifier on macOS (so Cmd+Z did nothing), and the modifier order
 * of the table did not match the order of the events (so Ctrl+Shift+arrows
 * never fired).
 *
 * The canonical form is `alt+ctrl+mod+shift+key`, lower case, where `mod` is
 * the primary modifier: Cmd on macOS, Ctrl elsewhere. In a shortcut
 * specification, `ctrl`, `cmd`, `meta` and `mod` all mean the primary modifier.
 * @module shortcuts
 */
import { isMac } from '@svgedit/svgcanvas/common/browser'

const MODIFIER_ORDER = ['alt', 'ctrl', 'mod', 'shift']
const PRIMARY_ALIASES = new Set(['ctrl', 'cmd', 'meta', 'mod', 'control', 'command'])
// Keys read by physical position when Shift changes the character they type.
const SHIFTED_CODE_KEYS = { BracketLeft: '[', BracketRight: ']' }

const canonical = (modifiers, key) => [
  ...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)),
  key
].join('+')

/**
 * Normalises a shortcut specification such as `ctrl+Z`, `Ctrl+Shift+]` or
 * `shift+D`. A hint written after ` / ` (as in `Z / Alt + wheels`) is ignored.
 * @param {string} spec
 * @returns {string} The canonical shortcut, or an empty string
 */
export const normalizeShortcut = (spec) => {
  if (!spec) return ''
  const text = String(spec).split(' / ')[0].trim().toLowerCase()
  if (!text) return ''
  const parts = text.split('+')
  let key = parts.pop()
  if (key === '' && parts.length && parts[parts.length - 1] === '') {
    // `mod++`: the key itself is "+".
    parts.pop()
    key = '+'
  }
  const modifiers = new Set()
  parts.forEach((part) => {
    const token = part.trim()
    if (PRIMARY_ALIASES.has(token)) {
      modifiers.add('mod')
    } else if (token === 'option') {
      modifiers.add('alt')
    } else if (MODIFIER_ORDER.includes(token)) {
      modifiers.add(token)
    }
  })
  return canonical(modifiers, key.trim() || key)
}

/**
 * Returns the canonical shortcut of a keyboard event. With Shift, digits are
 * read by physical key, so that Shift+1 is the same shortcut on QWERTY (where
 * it types "!") and on AZERTY (where the digits need Shift).
 * @param {KeyboardEvent} event
 * @param {boolean} [mac=isMac()]
 * @returns {string}
 */
export const eventShortcut = (event, mac = isMac()) => {
  const modifiers = new Set()
  if (event.altKey) modifiers.add('alt')
  if (event.shiftKey) modifiers.add('shift')
  if (mac) {
    if (event.metaKey) modifiers.add('mod')
    if (event.ctrlKey) modifiers.add('ctrl')
  } else {
    if (event.ctrlKey) modifiers.add('mod')
    // The Windows key is not used by the editor.
  }
  let key = String(event.key || '').toLowerCase()
  if (event.altKey && !/^[a-z]$/.test(key)) {
    // Alt changes the character of letter keys (Option+C types "ç" on macOS,
    // AltGr+C a letter on some layouts): read them by physical key, so that
    // Mod+Alt+C stays Mod+Alt+C.
    const letter = /^Key([A-Z])$/.exec(event.code || '')
    if (letter) key = letter[1].toLowerCase()
  }
  if (event.shiftKey) {
    // Shift changes the character of digit and bracket keys ("!" on QWERTY,
    // "1" on AZERTY): read them by physical key. Without Shift the typed
    // character is kept, so that "-" stays "-" on AZERTY (Digit6).
    const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code || '')
    if (digit) {
      key = digit[1]
    } else if (SHIFTED_CODE_KEYS[event.code]) {
      key = SHIFTED_CODE_KEYS[event.code]
    }
  }
  return canonical(modifiers, key)
}
