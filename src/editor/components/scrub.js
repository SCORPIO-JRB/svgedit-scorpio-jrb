/**
 * Values dragged (lot Valeurs glissées), after the fields of Figma: the icon
 * or the letter of a numeric field, dragged sideways, changes its value. The
 * pointer shows ↔ over it; the value follows the pointer, 1 per pixel (the
 * step of the field when it is under 1), 10 times as fast with Shift. The
 * drawing changes as the value does, and the whole drag is one undo step;
 * Escape gives the value it had back. A click without moving goes to the
 * field, to type a value.
 *
 * The field tells the editor when a drag starts and ends by two events that
 * cross shadow roots, `se-scrub-start` and `se-scrub-end` (detail
 * `{cancelled}`): the editor opens a group of the history on the first and
 * closes it, or undoes it, on the second.
 * @module scrub
 */

export const SCRUB_START = 'se-scrub-start'
export const SCRUB_END = 'se-scrub-end'
/** Pixels the pointer moves before a press becomes a drag. */
export const SCRUB_THRESHOLD = 3
/** Speed with Shift. */
export const SCRUB_FAST = 10
/** Class of the root of the page during a drag: ↔ everywhere. */
export const SCRUBBING_CLASS = 'se-scrubbing'

/**
 * @param {number} step - Step of the arrows of the field
 * @returns {number} Change of the value for a pixel
 */
export const scrubUnit = (step) => (Number.isFinite(step) && step > 0 && step < 1 ? step : 1)

/**
 * @param {number} value
 * @returns {number} Its number of decimals, as written
 */
const decimalsOf = (value) => {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

/**
 * @param {number} value
 * @param {number} unit
 * @returns {number} The value in whole units, without the noise of floats
 */
export const roundToUnit = (value, unit) =>
  Number((Math.round(value / unit) * unit).toFixed(decimalsOf(unit)))

/**
 * The value of a field after a drag: its value when the drag started plus
 * the change, kept between its bounds, with at most 2 decimals more than
 * the unit (a value of 12.345 dragged by 1 gives 13.35).
 * @param {number} start
 * @param {number} change
 * @param {{unit: number, min?: number|null, max?: number|null}} bounds
 * @returns {number}
 */
export const scrubbedValue = (start, change, { unit, min = null, max = null }) => {
  let value = start + change
  if (Number.isFinite(min) && value < min) value = min
  if (Number.isFinite(max) && value > max) value = max
  return Number(value.toFixed(Math.max(decimalsOf(unit), 2)))
}

/**
 * @typedef {object} ScrubStart
 * @property {number|null} value - The value of the field; null when it shows
 *   "Mixed" (each element keeps its own value, changed by the same amount)
 * @property {number} unit - Change for a pixel
 * @property {number|null} [min]
 * @property {number|null} [max]
 */

/**
 * Makes a handle (the icon or the letter of a field) drag the value.
 * @param {HTMLElement} handle
 * @param {object} options
 * @param {() => (ScrubStart|null)} options.begin - The value when the
 *   pointer is pressed; null when the field cannot be dragged now
 * @param {(value: number|null, delta: number) => void} options.apply - Gives
 *   the field its new value (null for "Mixed") and the change since the
 *   last call
 * @param {(cancelled: boolean, start: ScrubStart) => void} [options.end] -
 *   The drag ended; on Escape, the field shows the value it had back
 * @param {() => void} [options.click] - The handle was clicked, not dragged
 * @param {EventTarget} [options.target] - What sends the start and end
 *   events; the handle by default
 * @returns {() => void} Detaches the drag
 */
export const attachScrub = (handle, options) => {
  const target = options.target ?? handle
  let drag = null
  // The click that ends a drag does not reach the field (a label gives it
  // the focus).
  let swallowClick = false

  const emit = (type, detail) => target.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }))

  const flush = () => {
    if (!drag) return
    cancelAnimationFrame(drag.frame)
    drag.frame = 0
    const change = roundToUnit(drag.change, drag.unit)
    if (change === drag.applied) return
    const delta = roundToUnit(change - drag.applied, drag.unit)
    drag.applied = change
    options.apply(drag.value === null ? null : scrubbedValue(drag.value, change, drag), delta)
  }

  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.x) < SCRUB_THRESHOLD) return
      drag.started = true
      document.documentElement.classList.add(SCRUBBING_CLASS)
      emit(SCRUB_START)
    }
    const dx = e.clientX - drag.lastX
    drag.lastX = e.clientX
    drag.change += dx * drag.unit * (e.shiftKey ? SCRUB_FAST : 1)
    // At a bound, the value turns back as soon as the pointer does.
    if (drag.value !== null) drag.change = scrubbedValue(drag.value, drag.change, drag) - drag.value
    if (!drag.frame) drag.frame = requestAnimationFrame(flush)
  }

  const finish = (cancelled) => {
    if (!drag) return
    if (!cancelled) flush()
    const done = drag
    drag = null
    cancelAnimationFrame(done.frame)
    window.removeEventListener('keydown', onKey, true)
    try { handle.releasePointerCapture?.(done.pointerId) } catch (err) { /* already released */ }
    if (!done.started) {
      if (!cancelled) options.click?.()
      return
    }
    swallowClick = true
    setTimeout(() => { swallowClick = false })
    document.documentElement.classList.remove(SCRUBBING_CLASS)
    emit(SCRUB_END, { cancelled })
    options.end?.(cancelled, done)
  }

  // During a drag, no shortcut of the editor runs; Escape cancels it.
  const onKey = (e) => {
    if (!drag) return
    if (e.key === 'Shift') return
    e.preventDefault()
    e.stopImmediatePropagation()
    if (e.key === 'Escape') finish(true)
  }

  const onClick = (e) => {
    if (!swallowClick) return
    swallowClick = false
    e.preventDefault()
    e.stopPropagation()
  }

  const onDown = (e) => {
    if (e.button !== 0 || drag) return
    const start = options.begin()
    if (!start) return
    // No text selected, no focus taken from the drawing.
    e.preventDefault()
    e.stopPropagation()
    drag = {
      ...start,
      pointerId: e.pointerId,
      x: e.clientX,
      lastX: e.clientX,
      change: 0,
      applied: 0,
      started: false,
      frame: 0
    }
    try { handle.setPointerCapture?.(e.pointerId) } catch (err) { /* a synthetic pointer */ }
    window.addEventListener('keydown', onKey, true)
  }

  const onUp = (e) => {
    if (drag && e.pointerId === drag.pointerId) finish(false)
  }
  // The browser took the pointer: the value goes back.
  const onCancel = (e) => {
    if (drag && e.pointerId === drag.pointerId) finish(true)
  }

  handle.addEventListener('pointerdown', onDown)
  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onCancel)
  handle.addEventListener('click', onClick)
  handle.classList.add('se-scrub-handle')
  return () => {
    finish(true)
    handle.removeEventListener('pointerdown', onDown)
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onCancel)
    handle.removeEventListener('click', onClick)
    handle.classList.remove('se-scrub-handle')
  }
}

/**
 * Makes the label of a plain input drag its value: each change is written
 * in the input, which then sends `change` as if it had been typed.
 * @param {HTMLElement} handle - The letter or the word before the input
 * @param {HTMLInputElement} input
 * @param {object} [options]
 * @param {number} [options.step=1]
 * @param {number|null} [options.min]
 * @param {number|null} [options.max]
 * @param {(text: string) => number} [options.parse] - Reads the input
 * @param {(value: number) => string} [options.format] - Writes it
 * @returns {() => void} Detaches the drag
 */
export const scrubInput = (handle, input, options = {}) => {
  const {
    step = 1,
    min = null,
    max = null,
    parse = (text) => Number.parseFloat(String(text).replace(',', '.')),
    format = (value) => String(value)
  } = options
  const write = (value) => {
    input.value = format(value)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  return attachScrub(handle, {
    target: input,
    begin: () => {
      if (input.disabled || input.readOnly) return null
      // A value being typed is committed first.
      if (input.matches(':focus')) input.blur()
      const value = parse(input.value)
      return Number.isFinite(value) ? { value, unit: scrubUnit(step), min, max } : null
    },
    apply: (value) => write(value),
    end: (cancelled, start) => {
      if (cancelled) input.value = format(start.value)
    },
    click: () => input.focus()
  })
}
