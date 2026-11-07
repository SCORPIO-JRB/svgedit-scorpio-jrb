import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  add,
  getCustomHandler,
  hasCustomHandler,
  injectExtendedContextMenuItemsIntoDom,
  resetCustomMenus
} from '../../src/editor/contextmenu.js'

describe('contextmenu helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = "<ul id='cmenu_canvas'></ul>"
    resetCustomMenus()
  })

  it('validates menu entries and prevents duplicates', () => {
    expect(() => add(null)).toThrow(/must be defined/)
    add({ id: 'foo', label: 'Foo', action: () => 'ok' })
    expect(hasCustomHandler('foo')).toBe(true)
    expect(getCustomHandler('foo')()).toBe('ok')
    expect(() =>
      add({ id: 'foo', label: 'Again', action: () => {} })
    ).toThrow(/already exists/)
  })

  it('injects extensions into the canvas context menu', () => {
    // The canvas menu is <se-cmenu_canvas-dialog id="se-cmenu_canvas">; the
    // former code appended strings to a missing #cmenu_canvas and threw.
    const host = document.createElement('div')
    host.id = 'se-cmenu_canvas'
    host.addExtensionItem = vi.fn()
    document.body.append(host)
    add({ id: 'alpha', label: 'Alpha', action: () => {}, shortcut: 'Ctrl+A' })
    add({ id: 'beta', label: 'Beta', action: () => {} })

    injectExtendedContextMenuItemsIntoDom()

    expect(host.addExtensionItem).toHaveBeenCalledTimes(2)
    expect(host.addExtensionItem.mock.calls[0][0]).toMatchObject({ id: 'alpha', label: 'Alpha', shortcut: 'Ctrl+A' })
    expect(host.addExtensionItem.mock.calls[1][0]).toMatchObject({ id: 'beta', label: 'Beta' })
  })

  it('does nothing when the canvas menu is absent', () => {
    add({ id: 'gamma', label: 'Gamma', action: () => {} })
    expect(() => injectExtendedContextMenuItemsIntoDom()).not.toThrow()
  })
})
