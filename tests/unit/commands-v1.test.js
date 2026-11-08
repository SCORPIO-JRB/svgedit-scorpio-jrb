import { CommandRegistry, formatShortcut, parseShortcuts } from '../../src/editor/commands.js'

// Lot V1: one registry for every command with a shortcut.

const key = (k, mods = {}) => {
  const event = new KeyboardEvent('keydown', { key: k, cancelable: true, ...mods })
  return event
}

describe('shortcut notation (V1)', () => {
  it('splits alternatives and normalises each', () => {
    expect(parseShortcuts('Delete/Backspace')).toEqual(['delete', 'backspace'])
    expect(parseShortcuts(['ctrl+=/ctrl++', 'Ctrl+Shift+]'])).toEqual(['mod+=', 'mod++', 'mod+shift+]'])
    expect(parseShortcuts('Z / Alt + wheels')).toEqual(['z'])
    expect(parseShortcuts('')).toEqual([])
    expect(parseShortcuts(undefined)).toEqual([])
  })

  it('shows names joined by + outside macOS, in the language of the interface', () => {
    expect(formatShortcut('mod+shift+z', { mac: false })).toBe('Ctrl+Shift+Z')
    expect(formatShortcut('alt+mod+c', { mac: false })).toBe('Ctrl+Alt+C')
    expect(formatShortcut('mod++', { mac: false })).toBe('Ctrl++')
    expect(formatShortcut('mod+]', { mac: false })).toBe('Ctrl+]')
    expect(formatShortcut('delete', { mac: false })).toBe('Delete')
    expect(formatShortcut('shift+arrowup', { mac: false })).toBe('Shift+↑')
    const french = { shift: 'Maj', delete: 'Suppr', escape: 'Échap' }
    const translate = (k, fallback) => french[k.split('.')[1]] ?? fallback
    expect(formatShortcut('mod+shift+v', { mac: false, translate })).toBe('Ctrl+Maj+V')
    expect(formatShortcut('delete', { mac: false, translate })).toBe('Suppr')
    expect(formatShortcut('escape', { mac: false, translate })).toBe('Échap')
  })

  it('shows symbols in the Apple order on macOS', () => {
    expect(formatShortcut('mod+shift+z', { mac: true })).toBe('⇧⌘Z')
    expect(formatShortcut('alt+mod+c', { mac: true })).toBe('⌥⌘C')
    expect(formatShortcut('alt+ctrl+mod+shift+k', { mac: true })).toBe('⌃⌥⇧⌘K')
    expect(formatShortcut('backspace', { mac: true })).toBe('⌫')
    expect(formatShortcut('mod+\\', { mac: true })).toBe('⌘\\')
  })
})

describe('command registry (V1)', () => {
  it('runs the command bound to a key, and prevents the key unless told not to', () => {
    const registry = new CommandRegistry({ mac: false })
    const ran = []
    registry.register({ id: 'undo', shortcuts: 'ctrl+Z', run: () => ran.push('undo') })
    registry.register({ id: 'copy', shortcuts: 'ctrl+C', run: () => ran.push('copy'), preventDefault: false })
    const undo = key('z', { ctrlKey: true })
    expect(registry.dispatch(undo)).toBe(true)
    expect(undo.defaultPrevented).toBe(true)
    const copy = key('c', { ctrlKey: true })
    expect(registry.dispatch(copy)).toBe(true)
    expect(copy.defaultPrevented).toBe(false)
    expect(registry.dispatch(key('q'))).toBe(false)
    expect(ran).toEqual(['undo', 'copy'])
  })

  it('binds every alternative: Delete and Backspace both delete', () => {
    const registry = new CommandRegistry({ mac: false })
    let count = 0
    registry.register({ id: 'delete', shortcuts: 'Delete/Backspace', run: () => count++ })
    registry.dispatch(key('Delete'))
    registry.dispatch(key('Backspace'))
    expect(count).toBe(2)
    expect(registry.hint('delete')).toBe('Delete')
    expect(new CommandRegistry({ mac: true }).format('backspace')).toBe('⌫')
  })

  it('runs only the first enabled command of a shared key, once', () => {
    const registry = new CommandRegistry({ mac: false })
    const ran = []
    let single = false
    registry.register({ id: 'clone', shortcuts: 'D', when: () => single, run: () => ran.push('clone') })
    registry.register({ id: 'clone_multi', shortcuts: 'D', when: () => !single, run: () => ran.push('clone_multi') })
    registry.dispatch(key('d'))
    single = true
    registry.dispatch(key('d'))
    expect(ran).toEqual(['clone_multi', 'clone'])
    expect(registry.conflicts()).toEqual([{ shortcut: 'd', ids: ['clone', 'clone_multi'] }])
  })

  it('does nothing, and lets the key through, when no command applies', () => {
    const registry = new CommandRegistry({ mac: false })
    registry.register({ id: 'group', shortcuts: 'ctrl+G', when: () => false, run: () => { throw new Error('ran') } })
    const event = key('g', { ctrlKey: true })
    expect(registry.dispatch(event)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(registry.execute('group')).toBe(false)
  })

  it('replaces a command declared again, and forgets a removed one', () => {
    const registry = new CommandRegistry({ mac: false })
    registry.register({ id: 'save', shortcuts: 'ctrl+S', run: () => {} })
    registry.register({ id: 'save', shortcuts: 'ctrl+shift+S', run: () => {} })
    expect(registry.find('ctrl+S')).toEqual([])
    expect(registry.find('ctrl+shift+S').map((c) => c.id)).toEqual(['save'])
    expect(registry.hint('save')).toBe('Ctrl+Shift+S')
    expect(registry.unregister('save')).toBe(true)
    expect(registry.find('ctrl+shift+S')).toEqual([])
    expect(registry.hint('save')).toBe('')
    expect(registry.list()).toEqual([])
  })

  it('reads Cmd as the primary modifier on macOS', () => {
    const registry = new CommandRegistry({ mac: true })
    let count = 0
    registry.register({ id: 'undo', shortcuts: 'ctrl+Z', run: () => count++ })
    registry.dispatch(key('z', { metaKey: true }))
    registry.dispatch(key('z', { ctrlKey: true }))
    expect(count).toBe(1)
    expect(registry.hint('undo')).toBe('⌘Z')
  })

  it('refuses a command without id or action', () => {
    const registry = new CommandRegistry({ mac: false })
    expect(() => registry.register({ run: () => {} })).toThrow()
    expect(() => registry.register({ id: 'x' })).toThrow()
  })
})
