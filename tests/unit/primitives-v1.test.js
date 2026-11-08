import { vi } from 'vitest'
import { placePopover, SePopover } from '../../src/editor/components/sePopover.js'
import '../../src/editor/components/seToast.js'

// V1: the shared primitives se-popover and se-toast.

const viewport = { width: 1000, height: 800 }
const size = { width: 200, height: 150 }

describe('se-popover placement (V1)', () => {
  it('opens under its anchor, aligned on its start', () => {
    const anchor = { left: 100, top: 50, right: 140, bottom: 78 }
    expect(placePopover(anchor, size, viewport)).toEqual({ x: 100, y: 82, side: 'bottom' })
    expect(placePopover(anchor, size, viewport, 'bottom-end')).toEqual({ x: 8, y: 82, side: 'bottom' })
  })

  it('goes above when there is no room below, and stays in the window', () => {
    const anchor = { left: 950, top: 700, right: 990, bottom: 728 }
    expect(placePopover(anchor, size, viewport)).toEqual({ x: 792, y: 546, side: 'top' })
  })

  it('keeps a top placement when it fits, falls back below otherwise', () => {
    expect(placePopover({ left: 10, top: 400, right: 50, bottom: 428 }, size, viewport, 'top-start').side).toBe('top')
    expect(placePopover({ left: 10, top: 60, right: 50, bottom: 88 }, size, viewport, 'top-start').side).toBe('bottom')
  })

  it('takes the side with more room when it fits on neither', () => {
    const tall = { width: 200, height: 700 }
    const result = placePopover({ left: 10, top: 500, right: 50, bottom: 528 }, tall, viewport)
    expect(result.side).toBe('top')
    expect(result.y).toBe(8)
  })
})

describe('se-popover behaviour (V1)', () => {
  const mount = () => {
    const anchor = document.createElement('button')
    const popover = document.createElement('se-popover')
    popover.setAttribute('menu', '')
    popover.innerHTML = '<div role="menuitem">One</div><div role="menuitem" aria-disabled="true">Off</div><div role="menuitem">Two</div>'
    document.body.append(anchor, popover)
    return { anchor, popover }
  }
  afterEach(() => { document.body.innerHTML = '' })

  it('is a menu whose arrows skip disabled entries, and Escape gives the focus back', () => {
    const { anchor, popover } = mount()
    expect(popover).toBeInstanceOf(SePopover)
    expect(popover.getAttribute('role')).toBe('menu')
    popover.open(anchor)
    expect(popover.opened).toBe(true)
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    const [one, two] = popover.items
    expect(document.activeElement).toBe(one)
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(two)
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(one)
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(document.activeElement).toBe(two)
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(popover.opened).toBe(false)
    expect(document.activeElement).toBe(anchor)
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on a press outside, not on a press inside, and after choosing an entry', () => {
    const { anchor, popover } = mount()
    popover.open(anchor)
    popover.items[0].dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(popover.opened).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(popover.opened).toBe(false)
    popover.open(anchor)
    let chosen = 0
    popover.items[1].addEventListener('click', () => chosen++)
    popover.items[1].focus()
    popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(chosen).toBe(1)
    expect(popover.opened).toBe(false)
  })
})

describe('se-toast (V1)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('shows messages that go away by themselves, or at once with their button', () => {
    const toasts = document.createElement('se-toast')
    document.body.append(toasts)
    toasts.show('Saved')
    const error = toasts.show('Not saved', { type: 'error', duration: 0, closeLabel: 'Fermer' })
    expect(toasts.messages).toEqual(['Saved', 'Not saved'])
    expect(error.getAttribute('role')).toBe('alert')
    expect(error.querySelector('button').getAttribute('aria-label')).toBe('Fermer')
    vi.advanceTimersByTime(5000)
    expect(toasts.messages).toEqual(['Not saved'])
    error.querySelector('button').click()
    expect(toasts.messages).toEqual([])
  })
})
