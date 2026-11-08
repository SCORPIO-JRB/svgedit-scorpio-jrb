import { describe, expect, it } from 'vitest'
import { normalizeShortcut, eventShortcut } from '../../src/editor/shortcuts.js'

const key = (init) => ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, code: '', ...init })

describe('shortcut normalisation', () => {
  it('treats ctrl, cmd, meta and mod as the primary modifier', () => {
    expect(normalizeShortcut('ctrl+Z')).toBe('mod+z')
    expect(normalizeShortcut('meta+z')).toBe('mod+z')
    expect(normalizeShortcut('Cmd+Z')).toBe('mod+z')
  })

  it('orders modifiers the same way as events', () => {
    expect(normalizeShortcut('ctrl+shift+arrowleft')).toBe('mod+shift+arrowleft')
    expect(normalizeShortcut('shift+ctrl+arrowleft')).toBe('mod+shift+arrowleft')
    expect(normalizeShortcut('Ctrl+Shift+]')).toBe('mod+shift+]')
  })

  it('ignores a hint written after " / " and keeps "+" as a key', () => {
    expect(normalizeShortcut('Z / Alt + wheels')).toBe('z')
    expect(normalizeShortcut('ctrl++')).toBe('mod++')
    expect(normalizeShortcut('')).toBe('')
  })

  it('maps Cmd to the primary modifier on macOS and Ctrl elsewhere', () => {
    expect(eventShortcut(key({ key: 'z', metaKey: true }), true)).toBe('mod+z')
    expect(eventShortcut(key({ key: 'z', ctrlKey: true }), true)).toBe('ctrl+z')
    expect(eventShortcut(key({ key: 'z', ctrlKey: true }), false)).toBe('mod+z')
  })

  it('keeps Shift, so Ctrl+Shift+Z is not Ctrl+Z and Shift+D is not D', () => {
    expect(eventShortcut(key({ key: 'Z', ctrlKey: true, shiftKey: true }), false)).toBe('mod+shift+z')
    expect(eventShortcut(key({ key: 'D', shiftKey: true }), false)).toBe('shift+d')
    expect(eventShortcut(key({ key: 'd' }), false)).toBe('d')
  })

  it('reads digits and shifted brackets by physical key', () => {
    // Shift+1 types "!" on QWERTY and "1" on AZERTY: same shortcut.
    expect(eventShortcut(key({ key: '!', code: 'Digit1', shiftKey: true }), false)).toBe('shift+1')
    expect(eventShortcut(key({ key: '1', code: 'Digit1', shiftKey: true }), false)).toBe('shift+1')
    expect(eventShortcut(key({ key: '}', code: 'BracketRight', shiftKey: true, ctrlKey: true }), false)).toBe('mod+shift+]')
    // Without Shift the typed character wins: "-" is on Digit6 in AZERTY.
    expect(eventShortcut(key({ key: '-', code: 'Digit6' }), false)).toBe('-')
  })

  it('matches specifications and events of the same shortcut', () => {
    expect(eventShortcut(key({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true }), false))
      .toBe(normalizeShortcut('ctrl+shift+arrowleft'))
    expect(eventShortcut(key({ key: 'Delete' }), false)).toBe(normalizeShortcut('delete'))
  })
})
