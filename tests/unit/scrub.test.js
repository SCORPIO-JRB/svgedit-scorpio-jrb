import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18next from 'i18next'
import { UndoManager, ChangeElementCommand } from '../../packages/svgcanvas/core/history.js'
import {
  attachScrub, scrubInput, scrubUnit, roundToUnit, scrubbedValue,
  SCRUB_START, SCRUB_END, SCRUBBING_CLASS
} from '../../src/editor/components/scrub.js'

// Lot Valeurs glissées, after the fields of Figma: the icon or the letter of
// a numeric field, dragged sideways, changes its value; the drag is one undo
// step, and Escape gives the value back.

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0))

/** A pointer event jsdom can dispatch. */
const pointer = (type, x, { shiftKey = false, button = 0 } = {}) => {
  const event = new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: 10, shiftKey, button })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

/** Presses the handle at x, moves through each point, releases. */
const drag = (handle, points, { escape = false, shiftKey = false } = {}) => {
  handle.dispatchEvent(pointer('pointerdown', 100))
  for (const x of points) handle.dispatchEvent(pointer('pointermove', x, { shiftKey }))
  if (escape) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  handle.dispatchEvent(pointer('pointerup', points.at(-1) ?? 100))
}

beforeAll(() => {
  if (!globalThis.requestAnimationFrame) vi.stubGlobal('requestAnimationFrame', (fn) => setTimeout(fn, 0))
  if (!globalThis.cancelAnimationFrame) vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id))
})

describe('the arithmetic of a drag', () => {
  it('moves by 1 a pixel, or by the step of the field under 1', () => {
    expect(scrubUnit(5)).toBe(1)
    expect(scrubUnit(1)).toBe(1)
    expect(scrubUnit(0.1)).toBe(0.1)
    expect(scrubUnit(NaN)).toBe(1)
  })

  it('rounds to the unit without the noise of floats', () => {
    expect(roundToUnit(0.30000000000000004, 0.1)).toBe(0.3)
    expect(roundToUnit(7.6, 1)).toBe(8)
  })

  it('keeps the value between the bounds, with 2 decimals at most', () => {
    expect(scrubbedValue(10, 5, { unit: 1, min: 0, max: 100 })).toBe(15)
    expect(scrubbedValue(10, -50, { unit: 1, min: 0, max: 100 })).toBe(0)
    expect(scrubbedValue(98, 50, { unit: 1, min: 0, max: 100 })).toBe(100)
    expect(scrubbedValue(12.345, 1, { unit: 1 })).toBe(13.35)
    expect(scrubbedValue(1.5, 0.1, { unit: 0.1, min: 0.5, max: 5 })).toBe(1.6)
  })
})

describe('attachScrub', () => {
  let handle
  let calls

  beforeEach(() => {
    document.body.textContent = ''
    handle = document.createElement('span')
    document.body.append(handle)
    calls = { apply: [], end: [], click: 0, events: [] }
    for (const type of [SCRUB_START, SCRUB_END]) {
      document.addEventListener(type, (e) => calls.events.push([type, e.detail?.cancelled]), { once: true })
    }
  })

  const attach = (start = { value: 10, unit: 1, min: 0, max: 100 }) => attachScrub(handle, {
    begin: () => start,
    apply: (value, delta) => calls.apply.push([value, delta]),
    end: (cancelled) => calls.end.push(cancelled),
    click: () => calls.click++
  })

  it('applies the value the pointer reached, and tells when the drag starts and ends', () => {
    attach()
    expect(handle.classList.contains('se-scrub-handle')).toBe(true)
    handle.dispatchEvent(pointer('pointerdown', 100))
    handle.dispatchEvent(pointer('pointermove', 110))
    expect(document.documentElement.classList.contains(SCRUBBING_CLASS)).toBe(true)
    handle.dispatchEvent(pointer('pointermove', 125))
    handle.dispatchEvent(pointer('pointerup', 125))
    expect(calls.apply).toEqual([[35, 25]])
    expect(calls.end).toEqual([false])
    expect(calls.events).toEqual([[SCRUB_START, undefined], [SCRUB_END, false]])
    expect(document.documentElement.classList.contains(SCRUBBING_CLASS)).toBe(false)
  })

  it('goes 10 times as fast with Shift, and stops at the bounds', () => {
    attach()
    drag(handle, [104], { shiftKey: true })
    expect(calls.apply).toEqual([[50, 40]])
    calls.apply = []
    drag(handle, [90, 80, 20])
    expect(calls.apply.at(-1)[0]).toBe(0)
  })

  it('turns back at once from a bound', async () => {
    attach()
    handle.dispatchEvent(pointer('pointerdown', 100))
    handle.dispatchEvent(pointer('pointermove', 300))
    // A frame passes: the bound is applied.
    await new Promise((resolve) => setTimeout(resolve, 40))
    handle.dispatchEvent(pointer('pointermove', 295))
    handle.dispatchEvent(pointer('pointerup', 295))
    expect(calls.apply.map(([value]) => value)).toEqual([100, 95])
  })

  it('gives a change, not a value, to a field showing "Mixed"', () => {
    attach({ value: null, unit: 1 })
    drag(handle, [107])
    expect(calls.apply).toEqual([[null, 7]])
  })

  it('cancels on Escape, which no shortcut of the editor sees', () => {
    attach()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    drag(handle, [120], { escape: true })
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
    expect(calls.end).toEqual([true])
    expect(calls.events.at(-1)).toEqual([SCRUB_END, true])
  })

  it('is a click when the pointer hardly moves', () => {
    attach()
    drag(handle, [102])
    expect(calls.apply).toEqual([])
    expect(calls.click).toBe(1)
    expect(calls.events).toEqual([])
  })

  it('does nothing when the field cannot be dragged', () => {
    attachScrub(handle, { begin: () => null, apply: () => calls.apply.push(1) })
    drag(handle, [150])
    expect(calls.apply).toEqual([])
  })
})

describe('scrubInput', () => {
  it('writes the value in a plain input, which sends change; Escape writes it back', () => {
    document.body.innerHTML = '<label><span>Opacité</span><input value="50 %"></label>'
    const input = document.querySelector('input')
    const changes = []
    input.addEventListener('change', () => changes.push(input.value))
    scrubInput(input.previousElementSibling, input, { min: 0, max: 100, format: (value) => `${value} %` })
    drag(input.previousElementSibling, [80])
    expect(changes).toEqual(['30 %'])
    drag(input.previousElementSibling, [140], { escape: true })
    expect(input.value).toBe('30 %')
  })
})

describe('a group of the history', () => {
  const rect = () => {
    const elem = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    elem.setAttribute('width', '10')
    document.body.append(elem)
    return elem
  }
  const change = (undoMgr, elem, width) => {
    const old = elem.getAttribute('width')
    elem.setAttribute('width', String(width))
    undoMgr.addCommandToHistory(new ChangeElementCommand(elem, { width: old }, 'Change width'))
  }

  it('gathers the steps of a drag into one, named after the first', () => {
    const undoMgr = new UndoManager()
    const elem = rect()
    expect(undoMgr.beginGroup()).toBe(true)
    expect(undoMgr.beginGroup()).toBe(false)
    expect(undoMgr.isGrouping()).toBe(true)
    for (const width of [11, 12, 13]) change(undoMgr, elem, width)
    expect(undoMgr.getUndoStackSize()).toBe(0)
    const step = undoMgr.endGroup()
    expect(undoMgr.getUndoStackSize()).toBe(1)
    expect(step.stack).toHaveLength(3)
    expect(step.getText()).toBe(step.stack[0].getText())
    undoMgr.undo()
    expect(elem.getAttribute('width')).toBe('10')
    undoMgr.redo()
    expect(elem.getAttribute('width')).toBe('13')
  })

  it('adds a single step as it is, and nothing for none', () => {
    const undoMgr = new UndoManager()
    const elem = rect()
    undoMgr.beginGroup()
    change(undoMgr, elem, 20)
    const step = undoMgr.endGroup()
    expect(step).toBeInstanceOf(ChangeElementCommand)
    undoMgr.beginGroup()
    expect(undoMgr.endGroup()).toBeNull()
    expect(undoMgr.getUndoStackSize()).toBe(1)
  })

  it('undoes its steps on cancel, none reaching the history', () => {
    const undoMgr = new UndoManager()
    const elem = rect()
    undoMgr.beginGroup()
    change(undoMgr, elem, 30)
    change(undoMgr, elem, 40)
    expect(undoMgr.cancelGroup()).toBe(true)
    expect(elem.getAttribute('width')).toBe('10')
    expect(undoMgr.getUndoStackSize()).toBe(0)
    expect(undoMgr.getRedoStackSize()).toBe(0)
  })
})

describe('se-spin-input', () => {
  beforeAll(async () => {
    globalThis.svgEditor = { configObj: { curConfig: { imgPath: '' } } }
    // Keys stand for their translations.
    if (!i18next.isInitialized) await i18next.init({ lng: 'en', resources: {} })
    await import('../../src/editor/components/seSpinInput.js')
  })

  const createSpin = async (attrs) => {
    document.body.textContent = ''
    const spin = document.createElement('se-spin-input')
    for (const [name, value] of Object.entries(attrs)) spin.setAttribute(name, value)
    document.body.append(spin)
    await nextFrame()
    await nextFrame()
    return spin
  }

  it('drags its value from its letter, and sends change', async () => {
    const spin = await createSpin({ label: 'properties.w_label', min: '0', value: '120' })
    const changes = []
    spin.addEventListener('change', () => changes.push(spin.value))
    const letter = spin.shadowRoot.getElementById('label')
    expect(letter.classList.contains('se-scrub-handle')).toBe(true)
    drag(letter, [130])
    expect(changes.map(Number)).toEqual([150])
  })

  it('gives a field showing "Mixed" a change for each element', async () => {
    const spin = await createSpin({ src: 'opacity.svg', min: '0', max: '100' })
    spin.mixed = true
    let relative = null
    spin.addEventListener('change', (e) => { relative = e.detail?.relative })
    drag(spin.shadowRoot.querySelector('se-icon'), [110])
    expect(relative(50)).toBe(60)
    expect(relative(95)).toBe(100)
    expect(relative(51.00000000000001)).toBe(61)
  })

  it('shows its name in the tooltip of the editor, without a native title', async () => {
    const spin = await createSpin({ label: 'properties.w_label', title: 'properties.selection_width' })
    expect(spin.seTooltip.label).toBe('properties.selection_width')
    expect(spin.title).toBe('properties.selection_width')
    expect(spin.hasAttribute('title')).toBe(false)
    expect(spin.shadowRoot.querySelector('[title]')).toBeNull()
  })
})
