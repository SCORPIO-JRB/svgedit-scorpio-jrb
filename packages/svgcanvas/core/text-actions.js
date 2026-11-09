/**
 * @module text-actions Tools for Text edit functions
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { transformPoint, matrixMultiply, getTransformList, transformListToTransform } from './math.js'
import {
  assignAttributes,
  getElement,
  getBBox as utilsGetBBox
} from './utilities.js'
import { supportsGoodTextCharPos } from '../common/browser.js'
import { getTextSource, lineElements } from './text-lines.js'

let svgCanvas = null

/**
 * @function module:text-actions.init
 * @param {module:text-actions.svgCanvas} textActionsContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
}

/**
 * A line of the text as it is drawn, for the caret and the selection.
 * @typedef {object} TextLine
 * @property {number} start - Index, in the content as typed, of its first character
 * @property {number} end - Index just after its last character
 * @property {number[]} slots - The x of each place of the caret, from `start` to `end`
 * @property {number} top
 * @property {number} bottom
 */

/**
 * Group: Text edit functions
 * Functions relating to editing text elements. The characters are typed in
 * a hidden field (a textarea: Enter, the selection, the clipboard are its
 * own); the caret and the selection are drawn on the text, line by line.
 * @class TextActions
 * @memberof module:svgcanvas.SvgCanvas#
 */
class TextActions {
  #curtext = null
  #textinput = null
  #cursor = null
  #selblock = null
  #blinker = null
  /** @type {TextLine[]} */
  #lines = []
  #matrix = null
  #lastX = null
  #lastY = null
  #allowDbl = false

  /**
   * Get the accumulated transformation matrix from the element up to the SVG content element.
   * This includes transforms from all parent groups, fixing the issue where text cursor
   * appears in the wrong position when editing text inside a transformed group.
   * @param {Element} elem - The element to get the accumulated matrix for
   * @returns {SVGMatrix|null} The accumulated transformation matrix, or null if none
   * @private
   */
  #getAccumulatedMatrix = (elem) => {
    const svgContent = svgCanvas.getSvgContent()
    const matrices = []

    let current = elem
    while (current && current !== svgContent && current.nodeType === 1) {
      const tlist = getTransformList(current)
      if (tlist && tlist.numberOfItems > 0) {
        const matrix = transformListToTransform(tlist).matrix
        matrices.unshift(matrix) // Add to beginning to maintain correct order
      }
      current = current.parentNode
    }

    if (matrices.length === 0) {
      return null
    }

    if (matrices.length === 1) {
      return matrices[0]
    }

    // Multiply all matrices together
    return matrixMultiply(...matrices)
  }

  /**
   * The line holding a place of the caret: at the end of a line, the caret
   * stays on it.
   * @param {Integer} index
   * @returns {TextLine}
   * @private
   */
  #lineOf = (index) => {
    return this.#lines.find((line) => index <= line.end) ?? this.#lines[this.#lines.length - 1]
  }

  /**
   * @param {Integer} index
   * @returns {number} The x of the caret at that place
   * @private
   */
  #slotX = (index) => {
    const line = this.#lineOf(index)
    const k = Math.max(0, Math.min(index - line.start, line.slots.length - 1))
    return line.slots[k]
  }

  /**
   *
   * @param {Integer} index
   * @returns {void}
   * @private
   */
  #setCursor = (index = undefined) => {
    // No text being edited: nothing to draw
    if (!this.#curtext || !this.#lines.length) return
    const empty = this.#textinput.value === ''
    this.#textinput.focus()

    if (index === undefined) {
      if (empty) {
        index = 0
      } else {
        if (this.#textinput.selectionEnd !== this.#textinput.selectionStart) {
          return
        }
        index = this.#textinput.selectionEnd
      }
    }

    if (!empty) {
      this.#textinput.setSelectionRange(index, index)
    }
    this.#cursor = getElement('text_cursor')
    if (!this.#cursor) {
      this.#cursor = document.createElementNS(NS.SVG, 'line')
      assignAttributes(this.#cursor, {
        id: 'text_cursor',
        stroke: '#333',
        'stroke-width': 1
      })
      getElement('selectorParentGroup').append(this.#cursor)
    }

    if (!this.#blinker) {
      this.#blinker = setInterval(() => {
        const show = this.#cursor.getAttribute('display') === 'none'
        this.#cursor.setAttribute('display', show ? 'inline' : 'none')
      }, 600)
    }

    const line = this.#lineOf(index)
    const x = this.#slotX(index)
    const startPt = this.#ptToScreen(x, line.top)
    const endPt = this.#ptToScreen(x, line.bottom)

    assignAttributes(this.#cursor, {
      x1: startPt.x,
      y1: startPt.y,
      x2: endPt.x,
      y2: endPt.y,
      visibility: 'visible',
      display: 'inline'
    })

    if (this.#selblock) {
      this.#selblock.setAttribute('d', '')
    }
  }

  /**
   *
   * @param {Integer} start
   * @param {Integer} end
   * @param {boolean} skipInput
   * @returns {void}
   * @private
   */
  #setSelection = (start, end, skipInput) => {
    if (!this.#curtext || !this.#lines.length) return
    if (start === end) {
      this.#setCursor(end)
      return
    }

    if (!skipInput) {
      this.#textinput.setSelectionRange(start, end)
    }

    this.#selblock = getElement('text_selectblock')
    if (!this.#selblock) {
      this.#selblock = document.createElementNS(NS.SVG, 'path')
      assignAttributes(this.#selblock, {
        id: 'text_selectblock',
        fill: 'green',
        opacity: 0.5,
        style: 'pointer-events:none'
      })
      getElement('selectorParentGroup').append(this.#selblock)
    }

    this.#cursor?.setAttribute('visibility', 'hidden')

    // One band per line the selection covers; the end of a line it goes
    // past shows as a little more.
    let dstr = ''
    for (const line of this.#lines) {
      if (end < line.start || start > line.end || (start === line.end && end > line.end)) continue
      const from = Math.max(start, line.start)
      const to = Math.min(end, line.end)
      const x1 = line.slots[from - line.start]
      let x2 = line.slots[to - line.start]
      if (end > line.end) x2 += (line.bottom - line.top) * 0.25
      if (x2 === x1) continue
      const corners = [[x1, line.top], [x2, line.top], [x2, line.bottom], [x1, line.bottom]]
        .map(([x, y]) => this.#ptToScreen(x, y))
      dstr += `M${corners.map((pt) => `${pt.x},${pt.y}`).join(' L')}z`
    }

    assignAttributes(this.#selblock, {
      d: dstr,
      display: 'inline'
    })
  }

  /**
   * The place of the caret nearest a point: on the line under it, or the
   * nearest line.
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {Integer}
   * @private
   */
  #getIndexFromPoint = (mouseX, mouseY) => {
    let line = this.#lines[0]
    let best = Infinity
    for (const candidate of this.#lines) {
      const distance = mouseY < candidate.top
        ? candidate.top - mouseY
        : mouseY > candidate.bottom ? mouseY - candidate.bottom : 0
      if (distance < best) {
        best = distance
        line = candidate
      }
    }
    return line.start + this.#nearestSlot(line, mouseX)
  }

  /**
   * @param {TextLine} line
   * @param {Float} x
   * @returns {Integer} The place on the line nearest x
   * @private
   */
  #nearestSlot = (line, x) => {
    let k = 0
    line.slots.forEach((slot, i) => {
      if (Math.abs(slot - x) < Math.abs(line.slots[k] - x)) k = i
    })
    return k
  }

  /**
   *
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   * @private
   */
  #setCursorFromPoint = (mouseX, mouseY) => {
    this.#setCursor(this.#getIndexFromPoint(mouseX, mouseY))
  }

  /**
   *
   * @param {Float} x
   * @param {Float} y
   * @param {boolean} apply
   * @returns {void}
   * @private
   */
  #setEndSelectionFromPoint = (x, y, apply) => {
    const i1 = this.#textinput.selectionStart
    const i2 = this.#getIndexFromPoint(x, y)

    const start = Math.min(i1, i2)
    const end = Math.max(i1, i2)
    this.#setSelection(start, end, !apply)
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #screenToPt = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }
    const zoom = svgCanvas.getZoom()
    out.x /= zoom
    out.y /= zoom

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix.inverse())
      out.x = pt.x
      out.y = pt.y
    }

    return out
  }

  /**
   *
   * @param {Float} xIn
   * @param {Float} yIn
   * @returns {module:math.XYObject}
   * @private
   */
  #ptToScreen = (xIn, yIn) => {
    const out = {
      x: xIn,
      y: yIn
    }

    if (this.#matrix) {
      const pt = transformPoint(out.x, out.y, this.#matrix)
      out.x = pt.x
      out.y = pt.y
    }
    const zoom = svgCanvas.getZoom()
    out.x *= zoom
    out.y *= zoom

    return out
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   * @private
   */
  #selectAll = (evt) => {
    this.#setSelection(0, this.#textinput.value.length)
    evt.target.removeEventListener('click', this.#selectAll)
  }

  /**
   *
   * @param {Event} evt
   * @returns {void}
   * @private
   */
  #selectWord = (evt) => {
    if (!this.#allowDbl || !this.#curtext) {
      return
    }
    const zoom = svgCanvas.getZoom()
    const ept = transformPoint(evt.pageX, evt.pageY, svgCanvas.getrootSctm())
    const mouseX = ept.x * zoom
    const mouseY = ept.y * zoom
    const pt = this.#screenToPt(mouseX, mouseY)

    const index = this.#getIndexFromPoint(pt.x, pt.y)
    const str = this.#textinput.value
    const first = str.slice(0, index).replace(/[\p{L}\p{N}_]+$/u, '').length
    const m = str.slice(index).match(/^[\p{L}\p{N}_]+/u)
    const last = (m ? m[0].length : 0) + index
    this.#setSelection(first, last)

    // Set tripleclick
    svgCanvas.$click(evt.target, this.#selectAll)

    setTimeout(() => {
      evt.target.removeEventListener('click', this.#selectAll)
    }, 300)
  }

  /**
   * @param {Element} target
   * @param {Float} x
   * @param {Float} y
   * @returns {void}
   */
  select (target, x, y) {
    this.#curtext = target
    svgCanvas.textActions.toEditMode(x, y)
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  start (elem) {
    this.#curtext = elem
    svgCanvas.textActions.toEditMode()
  }

  /**
   * @param {external:MouseEvent} evt
   * @param {Element} mouseTarget
   * @param {Float} startX
   * @param {Float} startY
   * @returns {void}
   */
  mouseDown (evt, mouseTarget, startX, startY) {
    const pt = this.#screenToPt(startX, startY)

    this.#textinput.focus()
    this.#setCursorFromPoint(pt.x, pt.y)
    this.#lastX = startX
    this.#lastY = startY

    // TODO: Find way to block native selection
  }

  /**
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  mouseMove (mouseX, mouseY) {
    const pt = this.#screenToPt(mouseX, mouseY)
    this.#setEndSelectionFromPoint(pt.x, pt.y)
  }

  /**
   * @param {external:MouseEvent} evt
   * @param {Float} mouseX
   * @param {Float} mouseY
   * @returns {void}
   */
  mouseUp (evt, mouseX, mouseY) {
    const pt = this.#screenToPt(mouseX, mouseY)

    this.#setEndSelectionFromPoint(pt.x, pt.y, true)

    // A click away from the text ends its editing (one of its lines, the
    // space between them, are the text too).
    const box = this.#curtext?.getBoundingClientRect?.()
    const inBox = box && evt.clientX >= box.left && evt.clientX <= box.right &&
      evt.clientY >= box.top && evt.clientY <= box.bottom
    if (
      !this.#curtext?.contains(evt.target) && !inBox &&
      mouseX < this.#lastX + 2 &&
      mouseX > this.#lastX - 2 &&
      mouseY < this.#lastY + 2 &&
      mouseY > this.#lastY - 2
    ) {
      svgCanvas.textActions.toSelectMode(true)
    }
  }

  /**
   * @param {Integer} index
   * @returns {void}
   */
  setCursor (index) {
    this.#setCursor(index)
  }

  /**
   * Moves the caret to the line above or below, at the place nearest the
   * one it leaves; with `extend`, the selection follows it.
   * @param {-1|1} direction
   * @param {boolean} [extend]
   * @returns {boolean} False when the text is not being edited
   */
  moveVertically (direction, extend = false) {
    if (!this.#curtext || !this.#lines.length) return false
    const input = this.#textinput
    const backward = input.selectionDirection === 'backward'
    const anchor = backward ? input.selectionEnd : input.selectionStart
    const focus = backward ? input.selectionStart : input.selectionEnd
    const from = this.#lineOf(focus)
    const i = this.#lines.indexOf(from)
    const target = this.#lines[i + direction]
    let index
    if (!target) {
      index = direction < 0 ? 0 : input.value.length
    } else {
      index = target.start + this.#nearestSlot(target, this.#slotX(focus))
    }
    if (extend) {
      input.setSelectionRange(Math.min(anchor, index), Math.max(anchor, index), index < anchor ? 'backward' : 'forward')
    } else {
      input.setSelectionRange(index, index)
    }
    this.#setSelection(input.selectionStart, input.selectionEnd, true)
    return true
  }

  /**
   * @param {Float} x
   * @param {Float} y
   * @returns {void}
   */
  toEditMode (x, y) {
    this.#allowDbl = false
    svgCanvas.setCurrentMode('textedit')
    svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    // Make selector group accept clicks
    /* const selector = */ svgCanvas.selectorManager.requestSelector(this.#curtext) // Do we need this? Has side effect of setting lock, so keeping for now, but next line wasn't being used
    // const sel = selector.selectorRect;

    svgCanvas.textActions.init()

    this.#curtext.style.cursor = 'text'

    if (arguments.length === 0) {
      this.#setCursor()
    } else {
      const pt = this.#screenToPt(x, y)
      this.#setCursorFromPoint(pt.x, pt.y)
    }

    setTimeout(() => {
      this.#allowDbl = true
    }, 300)
  }

  /**
   * @param {boolean|Element} selectElem
   * @fires module:svgcanvas.SvgCanvas#event:selected
   * @returns {void}
   */
  toSelectMode (selectElem) {
    svgCanvas.setCurrentMode('select')
    // What is typed next is another step (lot V5).
    svgCanvas.undoMgr?.endMerge?.()
    clearInterval(this.#blinker)
    this.#blinker = null
    if (this.#selblock) {
      this.#selblock.setAttribute('display', 'none')
    }
    if (this.#cursor) {
      this.#cursor.setAttribute('visibility', 'hidden')
    }
    // The cursor of the editing goes with it: it is not part of the drawing
    this.#curtext.style.removeProperty('cursor')
    if (this.#curtext.getAttribute('style') === '') this.#curtext.removeAttribute('style')

    if (selectElem) {
      svgCanvas.clearSelection()

      svgCanvas.call('selected', [this.#curtext])
      svgCanvas.addToSelection([this.#curtext], true)
    }
    if (!this.#curtext?.textContent.length) {
      // No content, so delete
      svgCanvas.deleteSelectedElements()
    }

    this.#textinput.blur()

    this.#curtext = false
  }

  /**
   * @param {Element} elem
   * @returns {void}
   */
  setInputElem (elem) {
    this.#textinput = elem
  }

  /**
   * @returns {void}
   */
  clear () {
    if (svgCanvas.getCurrentMode() === 'textedit') {
      svgCanvas.textActions.toSelectMode()
    }
  }

  /**
   * Reads the lines of the text as they are drawn: where each place of the
   * caret is, and how high each line is.
   * @param {Element} _inputElem Not in use
   * @returns {void}
   */
  init (_inputElem) {
    if (!this.#curtext) {
      return
    }

    if (!this.#curtext.parentNode) {
      // Result of the ffClone, need to get correct element
      const selectedElements = svgCanvas.getSelectedElements()
      this.#curtext = selectedElements[0]
      svgCanvas.selectorManager.requestSelector(this.#curtext).showGrips(false)
    }

    const text = this.#curtext
    // Calculate accumulated transform matrix including all parent groups
    // This fixes the issue where text cursor appears in wrong position
    // when editing text inside a group with transforms
    this.#matrix = this.#getAccumulatedMatrix(text)
    this.#textinput.focus()

    text.removeEventListener('dblclick', this.#selectWord)
    text.addEventListener('dblclick', this.#selectWord)

    const fontSize = Number.parseFloat(window.getComputedStyle(text).fontSize) || 16
    const offset = supportsGoodTextCharPos() ? null : svgCanvas.contentW * svgCanvas.getZoom()
    const charX = (point) => (offset === null ? point.x : (point.x - offset) / svgCanvas.getZoom())
    const safe = (fn, fallback) => { try { return fn() } catch { return fallback } }
    const total = safe(() => text.getNumberOfChars(), getTextSource(text).length)
    // How far a line reaches above and below its baseline
    let ascent = fontSize * 0.8
    let descent = fontSize * 0.25
    if (total > 0) {
      const extent = safe(() => text.getExtentOfChar(0), null)
      const baseline = safe(() => text.getStartPositionOfChar(0).y, null)
      if (extent && baseline !== null && extent.height > 0) {
        ascent = baseline - extent.y
        descent = extent.y + extent.height - baseline
      }
    }

    const source = getTextSource(text)
    const elements = lineElements(text)
    // The parts drawn: the lines, or the text alone
    const parts = elements
      ? elements.map((tspan) => ({ node: tspan, length: tspan.textContent.length }))
      : [{ node: text, length: source.length }]
    this.#lines = []
    let start = 0
    let first = 0 // Index of the part's first character among those drawn
    parts.forEach(({ node, length }, i) => {
      if (i > 0) start += 1 // The "\n", or the space a fixed width broke at
      const drawn = Math.max(0, Math.min(node === text ? total : safe(() => node.getNumberOfChars(), length), total - first))
      const anchorX = Number.parseFloat(node.getAttribute('x')) || 0
      const slots = []
      for (let k = 0; k <= length; k++) {
        if (!drawn) {
          slots.push(node === text ? utilsGetBBox(text)?.x ?? anchorX : anchorX)
        } else if (k < drawn) {
          slots.push(charX(text.getStartPositionOfChar(first + k)))
        } else {
          slots.push(charX(text.getEndPositionOfChar(first + drawn - 1)))
        }
      }
      let baseline = Number.parseFloat(node.getAttribute('y'))
      if (drawn) baseline = safe(() => text.getStartPositionOfChar(first).y, baseline)
      if (!Number.isFinite(baseline)) baseline = Number.parseFloat(text.getAttribute('y')) || 0
      this.#lines.push({ start, end: start + length, slots, top: baseline - ascent, bottom: baseline + descent })
      start += length
      first += drawn
    })
    // An empty text alone is centered on its box, as it always was
    if (!elements && total === 0) {
      const box = utilsGetBBox(text)
      if (box) {
        this.#lines[0].slots = [box.x + box.width / 2]
        this.#lines[0].top = box.y
        this.#lines[0].bottom = box.y + box.height
      }
    }
    const length = this.#textinput.value.length
    this.#setSelection(Math.min(this.#textinput.selectionStart, length), Math.min(this.#textinput.selectionEnd, length), true)
  }
}

// Export singleton instance for backward compatibility
export const textActionsMethod = new TextActions()
