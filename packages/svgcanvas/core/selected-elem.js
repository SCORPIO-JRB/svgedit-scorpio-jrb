/**
 * Tools for SVG selected element operation.
 * @module selected-elem
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { NS } from './namespaces.js'
import * as hstry from './history.js'
import * as pathModule from './path.js'
import { warn, error } from '../common/logger.js'
import {
  getStrokedBBoxDefaultVisible,
  setHref,
  getElement,
  getHref,
  getVisibleElements,
  findDefs,
  getRotationAngle,
  getRefElem,
  getBBox as utilsGetBBox,
  walkTreePost,
  assignAttributes,
  getFeGaussianBlur
} from './utilities.js'
import {
  transformPoint,
  matrixMultiply,
  transformListToTransform,
  getTransformList,
  getRotationCenterFromRotateTransform
} from './math.js'
import { recalculateDimensions, withStartTransform } from './recalculate.js'
import { isGecko } from '../common/browser.js'
import { getParents } from '../common/util.js'
import { createClipboardPayload } from './clipboard.js'
import { tidyUpLayout } from './tidy-up.js'

const {
  MoveElementCommand,
  BatchCommand,
  InsertElementCommand,
  RemoveElementCommand,
  ChangeElementCommand
} = hstry

let svgCanvas = null

/**
 * @function module:selected-elem.init
 * @param {module:selected-elem.elementContext} elementContext
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
  svgCanvas.copySelectedElements = copySelectedElements
  svgCanvas.groupSelectedElements = groupSelectedElements // Wraps all the selected elements in a group (`g`) element.
  svgCanvas.pushGroupProperties = pushGroupProperty // Pushes all appropriate parent group properties down to its children
  svgCanvas.ungroupSelectedElement = ungroupSelectedElement // Unwraps all the elements in a selected group (`g`) element
  svgCanvas.moveToTopSelectedElement = moveToTopSelectedElem // Repositions the selected element to the bottom in the DOM to appear on top
  svgCanvas.moveToBottomSelectedElement = moveToBottomSelectedElem // Repositions the selected element to the top in the DOM to appear under other elements
  svgCanvas.moveUpDownSelected = moveUpDownSelected // Moves the select element up or down the stack, based on the visibly
  svgCanvas.moveSelectedElements = moveSelectedElements // Moves selected elements on the X/Y axis.
  svgCanvas.cloneSelectedElements = cloneSelectedElements // Create deep DOM copies (clones) of all selected elements and move them slightly
  svgCanvas.duplicateSelectedElements = duplicateSelectedElements // Mod+D: clone the selection, repeating the last offset (M7)
  svgCanvas.getDuplicateOffset = getDuplicateOffset
  svgCanvas.rememberDuplicate = rememberDuplicate
  svgCanvas.alignSelectedElements = alignSelectedElements // Aligns selected elements.
  svgCanvas.tidyUpSelectedElements = tidyUpSelectedElements
  svgCanvas.updateCanvas = updateCanvas // Updates the editor canvas width/height/position after a zoom has occurred.
  svgCanvas.cycleElement = cycleElement // Select the next/previous element within the current layer.
  svgCanvas.deleteSelectedElements = deleteSelectedElements // Removes all selected elements from the DOM and adds the change to the history
  svgCanvas.flipSelectedElements = flipSelectedElements // Flips selected elements horizontally or vertically
}

/**
 * Returns the selected elements in document order.
 * @returns {Element[]}
 */
const getSelectedInDocumentOrder = () => {
  const elements = svgCanvas.getSelectedElements().filter(Boolean)
  return elements.sort((a, b) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1)
}

/**
 * Returns the first child of a container that the selection can be placed
 * before: layers start with their <title>, and possibly <defs>.
 * @param {Element} parent
 * @returns {Element|null}
 */
const getFirstStackedChild = (parent) => {
  let child = parent.firstElementChild
  while (child && ['title', 'defs'].includes(child.tagName)) {
    child = child.nextElementSibling
  }
  return child
}

/**
 * Applies a reordering to the selected elements as one undoable step.
 * @param {string} label - History label
 * @param {Element[]} elements - In the order the move must be applied
 * @param {(elem: Element) => void} move - Moves one element in the DOM
 * @returns {void}
 */
const reorderSelected = (label, elements, move) => {
  const batchCmd = new BatchCommand(label)
  const moved = []
  elements.forEach((elem) => {
    const oldParent = elem.parentNode
    const oldNextSibling = elem.nextSibling
    move(elem)
    if (oldNextSibling !== elem.nextSibling || oldParent !== elem.parentNode) {
      batchCmd.addSubCommand(new MoveElementCommand(elem, oldNextSibling, oldParent, label))
      moved.push(elem)
    }
  })
  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', moved)
  }
}

/**
 * Brings the selected elements to the front of their container, keeping
 * their relative order.
 * @function module:selected-elem.SvgCanvas#moveToTopSelectedElem
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
const moveToTopSelectedElem = () => {
  reorderSelected('top', getSelectedInDocumentOrder(), (elem) => {
    elem.parentNode.append(elem)
  })
}

/**
 * Sends the selected elements to the back of their container, keeping their
 * relative order.
 * @function module:selected-elem.SvgCanvas#moveToBottomSelectedElement
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
const moveToBottomSelectedElem = () => {
  // Last element first: each one goes before the previous, so the relative
  // order is kept.
  reorderSelected('bottom', getSelectedInDocumentOrder().reverse(), (elem) => {
    const first = getFirstStackedChild(elem.parentNode)
    if (first && first !== elem) {
      elem.parentNode.insertBefore(elem, first)
    }
  })
}

/**
 * Moves the select element up or down the stack, based on the visibly
 * intersecting elements.
 * @function module:selected-elem.SvgCanvas#moveUpDownSelected
 * @param {"Up"|"Down"} dir - String that's either 'Up' or 'Down'
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
const moveUpDownSelected = dir => {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (!selected) {
    return
  }

  // Several elements: move the whole selection one step among its siblings,
  // keeping the relative order (the overlap-based step below is defined for
  // a single element).
  if (selectedElements.filter(Boolean).length > 1) {
    const inSelection = new Set(selectedElements.filter(Boolean))
    const ordered = getSelectedInDocumentOrder()
    if (dir === 'Up') {
      reorderSelected(`Move ${dir}`, ordered.reverse(), (elem) => {
        let next = elem.nextElementSibling
        while (next && inSelection.has(next)) { next = next.nextElementSibling }
        if (next) { next.after(elem) }
      })
    } else {
      reorderSelected(`Move ${dir}`, ordered, (elem) => {
        let prev = elem.previousElementSibling
        while (prev && inSelection.has(prev)) { prev = prev.previousElementSibling }
        if (prev && !['title', 'defs'].includes(prev.tagName)) { prev.before(elem) }
      })
    }
    return
  }

  svgCanvas.setCurBBoxes([])
  let closest
  let foundCur
  // jQuery sorts this list
  const list = svgCanvas.getIntersectionList(
    getStrokedBBoxDefaultVisible([selected])
  )
  if (dir === 'Down') {
    list.reverse()
  }

  Array.prototype.forEach.call(list, el => {
    if (!foundCur) {
      if (el === selected) {
        foundCur = true
      }
      return true
    }
    if (closest === undefined) {
      closest = el
    }
    return false
  })
  if (!closest) {
    return
  }

  const t = selected
  const oldParent = t.parentNode
  const oldNextSibling = t.nextSibling
  if (dir === 'Down') {
    closest.insertAdjacentElement('beforebegin', t)
  } else {
    closest.insertAdjacentElement('afterend', t)
  }
  // If the element actually moved position, add the command and fire the changed
  // event handler.
  if (oldNextSibling !== t.nextSibling) {
    svgCanvas.addCommandToHistory(
      new MoveElementCommand(t, oldNextSibling, oldParent, `Move ${dir}`)
    )
    svgCanvas.call('changed', [t])
  }
}

/**
 * Moves selected elements on the X/Y axis.
 * @function module:selected-elem.SvgCanvas#moveSelectedElements
 * @param {Float} dx - Float with the distance to move on the x-axis
 * @param {Float} dy - Float with the distance to move on the y-axis
 * @param {boolean} undoable - Boolean indicating whether or not the action should be undoable
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {BatchCommand|void} Batch command for the move
 */

const moveSelectedElements = (dx, dy, undoable = true) => {
  const selectedElements = svgCanvas.getSelectedElements()
  const zoom = svgCanvas.getZoom()
  // if undoable is not sent, default to true
  // if single values, scale them to the zoom
  if (!Array.isArray(dx)) {
    dx /= zoom
    dy /= zoom
  }

  const batchCmd = new BatchCommand('position')
  const moved = []
  selectedElements.forEach((selected, i) => {
    if (selected) {
      moved.push(selected)
      // Store the existing transform before modifying
      const existingTransform = selected.getAttribute('transform') || ''

      const xform = svgCanvas.getSvgRoot().createSVGTransform()
      const tlist = getTransformList(selected)

      // dx and dy could be arrays
      if (Array.isArray(dx)) {
        xform.setTranslate(dx[i], dy[i])
      } else {
        xform.setTranslate(dx, dy)
      }

      if (tlist.numberOfItems) {
        tlist.insertItemBefore(xform, 0)
      } else {
        tlist.appendItem(xform)
      }

      const cmd = withStartTransform(
        svgCanvas,
        existingTransform,
        () => recalculateDimensions(selected)
      )
      if (cmd) {
        batchCmd.addSubCommand(cmd)
      } else if ((selected.getAttribute('transform') || '') !== existingTransform) {
        // For groups and other elements where recalculateDimensions returns null,
        // record the transform change directly
        batchCmd.addSubCommand(
          new ChangeElementCommand(selected, { transform: existingTransform })
        )
      }
    }
  })
  // The selection boxes follow once every element is written: all their
  // boxes are read, then all are drawn. Read between the writes, each box
  // forced a layout of the drawing (700 ms to align 2000 objects).
  const manager = svgCanvas.gettingSelectorManager()
  const measure = svgCanvas.getSelector?.()?.getSelectionBBox
  const boxes = moved.map((elem) => (measure ? measure(elem) : undefined))
  moved.forEach((elem, i) => {
    manager.requestSelector(elem).resize(boxes[i], Boolean(boxes[i]))
  })
  if (!batchCmd.isEmpty()) {
    if (undoable) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
    svgCanvas.call('changed', selectedElements)
    return batchCmd
  }
  return undefined
}

/**
 * Create deep DOM copies (clones) of all selected elements and move them slightly
 * from their originals.
 * @function module:selected-elem.SvgCanvas#cloneSelectedElements
 * @param {Float} x Float with the distance to move on the x-axis
 * @param {Float} y Float with the distance to move on the y-axis
 * @param {PlainObject} [options]
 * @param {boolean} [options.addToHistory=true] - False to let the caller record
 *   the returned command, for instance together with the move of an Alt+drag
 * @returns {module:history.BatchCommand|undefined} The insertion of the copies
 */
const cloneSelectedElements = (x, y, { addToHistory = true } = {}) => {
  const selectedElements = svgCanvas.getSelectedElements()
  const currentGroup = svgCanvas.getCurrentGroup()
  let i
  let elem
  const batchCmd = new BatchCommand('Clone Elements')
  // find all the elements selected (stop at first null)
  const len = selectedElements.length

  const index = el => {
    if (!el) return -1
    let i = 0
    let current = el
    do {
      i++
      current = current.previousElementSibling
    } while (current)
    return i
  }

  /**
   * Sorts an array numerically and ascending.
   * @param {Element} a
   * @param {Element} b
   * @returns {Integer}
   */
  const sortfunction = (a, b) => {
    return index(b) - index(a)
  }
  selectedElements.sort(sortfunction)
  for (i = 0; i < len; ++i) {
    elem = selectedElements[i]
    if (!elem) {
      break
    }
  }
  // use slice to quickly get the subset of elements we need
  const copiedElements = selectedElements.slice(0, i)
  svgCanvas.clearSelection(true)
  // note that we loop in the reverse way because of the way elements are added
  // to the selectedElements array (top-first)
  const drawing = svgCanvas.getDrawing()
  i = copiedElements.length
  while (i--) {
    // clone each element and replace it within copiedElements
    elem = copiedElements[i] = drawing.copyElem(copiedElements[i])
    ;(currentGroup || drawing.getCurrentLayer()).append(elem)
    batchCmd.addSubCommand(new InsertElementCommand(elem))
  }

  if (!batchCmd.isEmpty()) {
    svgCanvas.addToSelection(copiedElements.reverse()) // Need to reverse for correct selection-adding
    moveSelectedElements(x, y, false)
    if (addToHistory) {
      svgCanvas.addCommandToHistory(batchCmd)
    }
    return batchCmd
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Duplication that repeats its offset (M7).

/** Offset of a first copy: Mod+D, the D and C keys and buttons. */
const DUPLICATE_OFFSET = 20
/** Below this, an offset is zero: the copies would hide the originals. */
const DUPLICATE_EPSILON = 1e-9

/**
 * The last duplication: its copies, the offset they were made with, and the
 * box they had then, to tell how far they have been moved since.
 * @type {{copies: Set<Element>, offset: {x: number, y: number}, box: module:utilities.BBoxObject}|null}
 */
let lastDuplicate = null

/**
 * Rounds a distance measured on boxes. Boxes are read in single precision
 * (77.1 reads 77.09999847): the document's number of decimals, the one of the
 * saved file, removes that noise.
 * @param {number} value
 * @returns {number}
 */
const roundDistance = (value) => {
  const digits = svgCanvas.getRoundDigits?.() ?? 2
  return Number(value.toFixed(Math.max(0, Math.min(digits, 10))))
}

/**
 * Remembers a duplication so that Mod+D can repeat its offset. Copies made at
 * the place of their originals are not remembered: repeating a zero offset
 * would pile up copies the user cannot see.
 * @function module:selected-elem.SvgCanvas#rememberDuplicate
 * @param {Element[]} copies - The copies, as selected after the duplication
 * @param {{x: number, y: number}|Element[]} offsetOrOriginals - The offset of
 *   the copies, or the originals to measure it on (after an Alt+drag)
 * @returns {void}
 */
const rememberDuplicate = (copies, offsetOrOriginals) => {
  const elements = copies.filter(Boolean)
  const box = elements.length ? svgCanvas.getSelectionBox(elements) : null
  let offset = offsetOrOriginals
  if (Array.isArray(offsetOrOriginals)) {
    const from = svgCanvas.getSelectionBox(offsetOrOriginals.filter(Boolean))
    offset = from && box
      ? { x: roundDistance(box.x - from.x), y: roundDistance(box.y - from.y) }
      : null
  }
  const isZero = !offset ||
    (Math.abs(offset.x) < DUPLICATE_EPSILON && Math.abs(offset.y) < DUPLICATE_EPSILON)
  lastDuplicate = box && !isZero ? { copies: new Set(elements), offset, box } : null
}

/**
 * The offset Mod+D gives to copies of the given elements. When they are the
 * copies of the last duplication, it is the offset of that duplication plus
 * the distance they were moved since: duplicate, move the copy, then Mod+D
 * makes a regular series. Otherwise, 20 to the right and 20 down.
 * @function module:selected-elem.SvgCanvas#getDuplicateOffset
 * @param {Element[]} [elements] - The selected elements by default
 * @returns {{x: number, y: number}}
 */
const getDuplicateOffset = (elements) => {
  const fallback = { x: DUPLICATE_OFFSET, y: DUPLICATE_OFFSET }
  const current = (elements || svgCanvas.getSelectedElements()).filter(Boolean)
  const last = lastDuplicate
  if (
    !last ||
    current.length !== last.copies.size ||
    !current.every((elem) => last.copies.has(elem) && elem.isConnected)
  ) {
    return fallback
  }
  const box = svgCanvas.getSelectionBox(current)
  if (!box) { return fallback }
  // Unmoved copies give exactly the remembered offset, with no rounding.
  const dx = box.x === last.box.x ? 0 : roundDistance(box.x - last.box.x)
  const dy = box.y === last.box.y ? 0 : roundDistance(box.y - last.box.y)
  const offset = { x: last.offset.x + dx, y: last.offset.y + dy }
  if (Math.abs(offset.x) < DUPLICATE_EPSILON && Math.abs(offset.y) < DUPLICATE_EPSILON) {
    return fallback
  }
  return offset
}

/**
 * Duplicates the selection, as one undo step, and selects the copies: Mod+D,
 * the D and C keys and buttons, Alt+arrows. Without an offset, the copies go
 * where getDuplicateOffset() says, so that repeating Mod+D after moving a copy
 * continues the series.
 * @function module:selected-elem.SvgCanvas#duplicateSelectedElements
 * @param {{x: number, y: number}} [offset] - A fixed offset (Alt+arrows)
 * @returns {module:history.BatchCommand|undefined}
 */
const duplicateSelectedElements = (offset) => {
  const elements = svgCanvas.getSelectedElements().filter(Boolean)
  if (!elements.length) { return undefined }
  const { x, y } = offset || getDuplicateOffset(elements)
  const cmd = cloneSelectedElements(x, y)
  if (cmd) {
    rememberDuplicate(svgCanvas.getSelectedElements(), { x, y })
  }
  return cmd
}

/**
 * Aligns selected elements.
 * @function module:selected-elem.SvgCanvas#alignSelectedElements
 * @param {string} type - String with single character indicating the alignment type
 * @param {"selected"|"largest"|"smallest"|"page"} relativeTo
 * @param {PlainObject} [options]
 * @param {number} [options.spacing] - Gap imposed by a distribution: the
 *   first object stays in place and each next one follows the previous one
 *   at this distance, whatever the reference (M9)
 * @returns {void}
 */
const alignSelectedElements = (type, relativeTo, { spacing } = {}) => {
  const selectedElements = svgCanvas.getSelectedElements()
  const bboxes = [] // angles = [];
  const len = selectedElements.length
  if (!len) {
    return
  }
  let minx = Number.MAX_VALUE
  let maxx = Number.MIN_VALUE
  let miny = Number.MAX_VALUE
  let maxy = Number.MIN_VALUE

  // "Largest" and "smallest" compare areas: comparing widths only picked a
  // wide, flat object as the largest one, even for a vertical alignment.
  const byArea = (a, b) => a.width * a.height - b.width * b.height
  const isHorizontalAlign = (type) => ['l', 'c', 'r', 'left', 'center', 'right'].includes(type)
  const isVerticalAlign = (type) => ['t', 'm', 'b', 'top', 'middle', 'bottom'].includes(type)

  for (let i = 0; i < len; ++i) {
    if (!selectedElements[i]) {
      break
    }
    const elem = selectedElements[i]
    bboxes[i] = getStrokedBBoxDefaultVisible([elem])
  }

  // distribute horizontal and vertical align is not support smallest and largest
  if (['smallest', 'largest'].includes(relativeTo) && ['dh', 'distrib_horiz', 'dv', 'distrib_verti'].includes(type)) {
    relativeTo = 'selected'
  }
  // An imposed spacing starts from the first object.
  const imposed = Number.isFinite(spacing) ? spacing : null
  if (imposed !== null && ['dh', 'distrib_horiz', 'dv', 'distrib_verti'].includes(type)) {
    relativeTo = 'selected'
  }

  switch (relativeTo) {
    case 'smallest':
      if (isHorizontalAlign(type) || isVerticalAlign(type)) {
        const sortedBboxes = bboxes.slice().sort(byArea)
        const minBbox = sortedBboxes[0]
        minx = minBbox.x
        miny = minBbox.y
        maxx = minBbox.x + minBbox.width
        maxy = minBbox.y + minBbox.height
      }
      break
    case 'largest':
      if (isHorizontalAlign(type) || isVerticalAlign(type)) {
        const sortedBboxes = bboxes.slice().sort(byArea)
        const maxBbox = sortedBboxes[bboxes.length - 1]
        minx = maxBbox.x
        miny = maxBbox.y
        maxx = maxBbox.x + maxBbox.width
        maxy = maxBbox.y + maxBbox.height
      }
      break
    case 'page':
      minx = 0
      miny = 0
      maxx = svgCanvas.getContentW()
      maxy = svgCanvas.getContentH()
      break
    default:
      // 'selected'
      minx = Math.min(...bboxes.map(box => box.x))
      miny = Math.min(...bboxes.map(box => box.y))
      maxx = Math.max(...bboxes.map(box => box.x + box.width))
      maxy = Math.max(...bboxes.map(box => box.y + box.height))
      break
  } // adjust min/max

  let dx = []
  let dy = []

  if (['dh', 'distrib_horiz'].includes(type)) { // distribute horizontal align
    [dx, dy] = _getDistributeHorizontalDistances(relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy, imposed)
  } else if (['dv', 'distrib_verti'].includes(type)) { // distribute vertical align
    [dx, dy] = _getDistributeVerticalDistances(relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy, imposed)
  } else { // normal align (top, left, right, ...)
    [dx, dy] = _getNormalDistances(type, selectedElements, bboxes, minx, maxx, miny, maxy)
  }

  moveSelectedElements(dx, dy)
}

/**
 * Tidies the selection up into a regular row, column or grid (see
 * tidy-up.js), as one undo step: objects keep their size and their order,
 * the top left corner of the selection stays in place, and the gaps are the
 * most frequent gap between neighbors, or the spacing given.
 * @function module:selected-elem.SvgCanvas#tidyUpSelectedElements
 * @param {PlainObject} [options]
 * @param {number|null} [options.spacing] - Gap between neighbors
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {BatchCommand|null} Null when nothing moved
 */
const tidyUpSelectedElements = ({ spacing = null } = {}) => {
  const selectedElements = svgCanvas.getSelectedElements()
  const count = selectedElements.findIndex((elem) => !elem)
  const elements = count === -1 ? selectedElements : selectedElements.slice(0, count)
  if (elements.length < 2) { return null }
  const boxes = elements.map((elem) => getStrokedBBoxDefaultVisible([elem]))
  if (boxes.some((box) => !box)) { return null }
  const { positions } = tidyUpLayout(boxes, { spacing })
  const dx = positions.map((p, i) => p.x - boxes[i].x)
  const dy = positions.map((p, i) => p.y - boxes[i].y)
  if (dx.every((d) => Math.abs(d) < 1e-9) && dy.every((d) => Math.abs(d) < 1e-9)) { return null }
  return moveSelectedElements(dx, dy) || null
}

/**
 * get distribution horizontal distances.
 * (internal call only)
 *
 * @param {string} relativeTo
 * @param {Element[]} selectedElements - the array with selected DOM elements
 * @param {module:utilities.BBoxObject} bboxes - bounding box objects
 * @param {Float} minx - selected area min-x
 * @param {Float} maxx - selected area max-x
 * @param {Float} miny - selected area min-y
 * @param {Float} maxy - selected area max-y
 * @param {number|null} [imposed] - Imposed gap, instead of an even one
 * @returns {Array.Float[]} x and y distances array
 * @private
 */
const _getDistributeHorizontalDistances = (relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy, imposed = null) => {
  const dx = []
  const dy = []

  for (let i = 0; i < selectedElements.length; i++) {
    dy[i] = 0
  }

  const bboxesSortedClone = bboxes
    .slice()
    // Sorted by left edge, so that the leftmost object keeps its place: sorting
    // by right edge moved it when a narrower object ended before it did.
    .sort((firstBox, secondBox) => firstBox.x - secondBox.x)

  if (relativeTo === 'page') {
    bboxesSortedClone.unshift({ x: 0, y: 0, width: 0, height: maxy }) // virtual left box
    bboxesSortedClone.push({ x: maxx, y: 0, width: 0, height: maxy }) // virtual right box
  }

  const totalWidth = maxx - minx
  const totalBoxWidth = bboxesSortedClone.map(b => b.width).reduce((w1, w2) => w1 + w2, 0)
  const space = imposed ?? (totalWidth - totalBoxWidth) / (bboxesSortedClone.length - 1)
  const _dx = []

  for (let i = 0; i < bboxesSortedClone.length; ++i) {
    _dx[i] = 0

    if (i === 0) { continue }

    const orgX = bboxesSortedClone[i].x
    bboxesSortedClone[i].x = bboxesSortedClone[i - 1].x + bboxesSortedClone[i - 1].width + space
    _dx[i] = bboxesSortedClone[i].x - orgX
  }

  bboxesSortedClone.forEach((boxClone, idx) => {
    const orgIdx = bboxes.findIndex(box => box === boxClone)
    if (orgIdx !== -1) {
      dx[orgIdx] = _dx[idx]
    }
  })

  return [dx, dy]
}

/**
 * get distribution vertical distances.
 * (internal call only)
 *
 * @param {string} relativeTo
 * @param {Element[]} selectedElements - the array with selected DOM elements
 * @param {module:utilities.BBoxObject} bboxes - bounding box objects
 * @param {Float} minx - selected area min-x
 * @param {Float} maxx - selected area max-x
 * @param {Float} miny - selected area min-y
 * @param {Float} maxy - selected area max-y
 * @param {number|null} [imposed] - Imposed gap, instead of an even one
 * @returns {Array.Float[]}} x and y distances array
 * @private
 */
const _getDistributeVerticalDistances = (relativeTo, selectedElements, bboxes, minx, maxx, miny, maxy, imposed = null) => {
  const dx = []
  const dy = []

  for (let i = 0; i < selectedElements.length; i++) {
    dx[i] = 0
  }

  const bboxesSortedClone = bboxes
    .slice()
    // Sorted by top edge, for the same reason as the horizontal distribution.
    .sort((firstBox, secondBox) => firstBox.y - secondBox.y)

  if (relativeTo === 'page') {
    bboxesSortedClone.unshift({ x: 0, y: 0, width: maxx, height: 0 }) // virtual top box
    bboxesSortedClone.push({ x: 0, y: maxy, width: maxx, height: 0 }) // virtual bottom box
  }

  const totalHeight = maxy - miny
  const totalBoxHeight = bboxesSortedClone.map(b => b.height).reduce((h1, h2) => h1 + h2, 0)
  const space = imposed ?? (totalHeight - totalBoxHeight) / (bboxesSortedClone.length - 1)
  const _dy = []

  for (let i = 0; i < bboxesSortedClone.length; ++i) {
    _dy[i] = 0

    if (i === 0) { continue }

    const orgY = bboxesSortedClone[i].y
    bboxesSortedClone[i].y = bboxesSortedClone[i - 1].y + bboxesSortedClone[i - 1].height + space
    _dy[i] = bboxesSortedClone[i].y - orgY
  }

  bboxesSortedClone.forEach((boxClone, idx) => {
    const orgIdx = bboxes.findIndex(box => box === boxClone)
    if (orgIdx !== -1) {
      dy[orgIdx] = _dy[idx]
    }
  })

  return [dx, dy]
}

/**
 * get normal align distances.
 * (internal call only)
 *
 * @param {string} type
 * @param {Element[]} selectedElements - the array with selected DOM elements
 * @param {module:utilities.BBoxObject} bboxes - bounding box objects
 * @param {Float} minx - selected area min-x
 * @param {Float} maxx - selected area max-x
 * @param {Float} miny - selected area min-y
 * @param {Float} maxy - selected area max-y
 * @returns {Array.Float[]} x and y distances array
 * @private
 */
const _getNormalDistances = (type, selectedElements, bboxes, minx, maxx, miny, maxy) => {
  const len = selectedElements.length
  const dx = new Array(len)
  const dy = new Array(len)

  for (let i = 0; i < len; ++i) {
    if (!selectedElements[i]) {
      break
    }
    // const elem = selectedElements[i];
    const bbox = bboxes[i]
    dx[i] = 0
    dy[i] = 0

    switch (type) {
      case 'l': // left (horizontal)
      case 'left': // left (horizontal)
        dx[i] = minx - bbox.x
        break
      case 'c': // center (horizontal)
      case 'center': // center (horizontal)
        dx[i] = (minx + maxx) / 2 - (bbox.x + bbox.width / 2)
        break
      case 'r': // right (horizontal)
      case 'right': // right (horizontal)
        dx[i] = maxx - (bbox.x + bbox.width)
        break
      case 't': // top (vertical)
      case 'top': // top (vertical)
        dy[i] = miny - bbox.y
        break
      case 'm': // middle (vertical)
      case 'middle': // middle (vertical)
        dy[i] = (miny + maxy) / 2 - (bbox.y + bbox.height / 2)
        break
      case 'b': // bottom (vertical)
      case 'bottom': // bottom (vertical)
        dy[i] = maxy - (bbox.y + bbox.height)
        break
    }
  }

  return [dx, dy]
}

/**
 * Removes all selected elements from the DOM and adds the change to the
 * history stack.
 * @function module:selected-elem.SvgCanvas#deleteSelectedElements
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
const deleteSelectedElements = () => {
  const selectedElements = svgCanvas.getSelectedElements()
  const batchCmd = new BatchCommand('Delete Elements')
  const selectedCopy = [] // selectedElements is being deleted

  selectedElements.forEach(selected => {
    if (selected) {
      let parent = selected.parentNode
      let t = selected
      // this will unselect the element and remove the selectedOutline
      svgCanvas.gettingSelectorManager().releaseSelector(t)
      // Remove the path if present.
      pathModule.removePath_(t.id)
      // Get the parent if it's a single-child anchor
      if (parent.tagName === 'a' && parent.childNodes.length === 1) {
        t = parent
        parent = parent.parentNode
      }
      const { nextSibling } = t
      t.remove()
      const elem = t
      selectedCopy.push(selected) // for the copy
      batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, parent))
    }
  })
  svgCanvas.setEmptySelectedElements()

  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
  }
  svgCanvas.call('changed', selectedCopy)
  svgCanvas.clearSelection()
}

/**
 * Flips selected elements horizontally or vertically by transforming actual coordinates.
 * @function module:selected-elem.SvgCanvas#flipSelectedElements
 * @param {number} scaleX - Scale factor for X axis (-1 for horizontal flip, 1 for no flip)
 * @param {number} scaleY - Scale factor for Y axis (1 for no flip, -1 for vertical flip)
 * @fires module:selected-elem.SvgCanvas#event:changed
 * @returns {void}
 */
const flipSelectedElements = (scaleX, scaleY) => {
  const selectedElements = svgCanvas.getSelectedElements()
  const batchCmd = new BatchCommand('Flip Elements')
  const svgRoot = svgCanvas.getSvgRoot()

  // The whole selection flips around the centre of its common box, like a
  // single object: relative positions are mirrored too. For one element the
  // common box is its own box, so the result is unchanged. The boxes are in
  // the parent's user space, which the elements of a selection share.
  const elements = selectedElements.filter(Boolean)
  const commonBox = elements.length > 1
    ? getStrokedBBoxDefaultVisible(elements)
    : null

  selectedElements.forEach(selected => {
    if (!selected) return

    const bbox = commonBox || getStrokedBBoxDefaultVisible([selected])
    if (!bbox) return

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2
    const existingTransform = selected.getAttribute('transform') || ''

    const flipMatrix = svgRoot
      .createSVGMatrix()
      .translate(cx, cy)
      .scaleNonUniform(scaleX, scaleY)
      .translate(-cx, -cy)

    const tlist = getTransformList(selected)
    const combinedMatrix = matrixMultiply(
      flipMatrix,
      transformListToTransform(tlist).matrix
    )

    const flipTransform = svgRoot.createSVGTransform()
    flipTransform.setMatrix(combinedMatrix)

    tlist.clear()
    tlist.appendItem(flipTransform)

    const cmd = withStartTransform(
      svgCanvas,
      existingTransform,
      () => recalculateDimensions(selected)
    )

    if (cmd) {
      batchCmd.addSubCommand(cmd)
    } else if ((selected.getAttribute('transform') || '') !== existingTransform) {
      batchCmd.addSubCommand(
        new ChangeElementCommand(selected, { transform: existingTransform })
      )
    }

    svgCanvas
      .gettingSelectorManager()
      .requestSelector(selected)
      .resize()
  })

  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', selectedElements.filter(Boolean))
  }
}

/**
 * Remembers the current selected elements on the clipboard.
 * @function module:selected-elem.SvgCanvas#copySelectedElements
 * @returns {void}
 */
const copySelectedElements = () => {
  const selectedElements = svgCanvas.getSelectedElements().filter(Boolean)
  const payload = createClipboardPayload(svgCanvas, selectedElements)
  // Use sessionStorage for the clipboard data.
  try {
    sessionStorage.setItem(svgCanvas.getClipboardID(), JSON.stringify(payload))
  } catch (err) {
    // The SVG text for the system clipboard (M7) doubles the size of the
    // data: when the storage is full, keep the copy without it.
    if (!payload.svg) throw err
    delete payload.svg
    sessionStorage.setItem(svgCanvas.getClipboardID(), JSON.stringify(payload))
  }
  svgCanvas.call('clipboardChanged')
  svgCanvas.flashStorage()
}

/**
 * Wraps all the selected elements in a group (`g`) element.
 * @function module:selected-elem.SvgCanvas#groupSelectedElements
 * @param {"a"|"g"} [type="g"] - type of element to group into, defaults to `<g>`
 * @param {string} [urlArg]
 * @returns {void}
 */
const groupSelectedElements = (type, urlArg) => {
  const selectedElements = svgCanvas.getSelectedElements()
  if (!type) {
    type = 'g'
  }
  let cmdStr = ''
  let url

  switch (type) {
    case 'a': {
      cmdStr = 'Make hyperlink'
      url = urlArg || ''
      break
    }
    default: {
      type = 'g'
      cmdStr = 'Group Elements'
      break
    }
  }

  const batchCmd = new BatchCommand(cmdStr)

  // create and insert the group element
  const g = svgCanvas.addSVGElementsFromJson({
    element: type,
    attr: {
      id: svgCanvas.getNextId()
    }
  })
  if (type === 'a') {
    setHref(g, url)
  }
  batchCmd.addSubCommand(new InsertElementCommand(g))

  // now move all children into the group
  let i = selectedElements.length
  while (i--) {
    let elem = selectedElements[i]
    if (!elem) {
      continue
    }

    if (
      elem.parentNode.tagName === 'a' &&
      elem.parentNode.childNodes.length === 1
    ) {
      elem = elem.parentNode
    }

    const oldNextSibling = elem.nextSibling
    const oldParent = elem.parentNode
    g.append(elem)
    batchCmd.addSubCommand(
      new MoveElementCommand(elem, oldNextSibling, oldParent)
    )
  }
  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
  }

  // update selection
  svgCanvas.selectOnly([g], true)
}

/**
 * Normalizes a child after a parent group's transform has been pushed onto it.
 * @param {Element} elem
 * @param {string|null} oldTransform
 * @param {BatchCommand} batchCmd
 * @param {boolean} undoable
 * @returns {void}
 */
const normalizePushedGroupChild = (elem, oldTransform, batchCmd, undoable) => {
  const oldTransformValue = oldTransform || ''
  let cmd = withStartTransform(
    svgCanvas,
    oldTransformValue,
    () => recalculateDimensions(elem)
  )

  if (!cmd && (elem.getAttribute('transform') || '') !== oldTransformValue) {
    cmd = new ChangeElementCommand(elem, { transform: oldTransformValue })
  }

  if (undoable && cmd) {
    batchCmd.addSubCommand(cmd)
  }
}

const clonePushedGroupTransform = xform => {
  const clone = svgCanvas.getSvgRoot().createSVGTransform()

  if (xform.type === SVGTransform.SVG_TRANSFORM_ROTATE) {
    const { x, y } = getRotationCenterFromRotateTransform(xform)
    clone.setRotate(xform.angle, x, y)
  } else {
    clone.setMatrix(xform.matrix)
  }

  return clone
}

/**
 * Pushes all appropriate parent group properties down to its children, then
 * removes them from the group.
 * @function module:selected-elem.SvgCanvas#pushGroupProperty
 * @param {SVGAElement|SVGGElement} g
 * @param {boolean} undoable
 * @returns {BatchCommand|void}
 */
const pushGroupProperty = (g, undoable) => {
  const children = g.childNodes
  const len = children.length
  const xform = g.getAttribute('transform')

  const glist = getTransformList(g)

  const batchCmd = new BatchCommand('Push group properties')

  // TODO: get all fill/stroke properties from the group that we are about to destroy
  // "fill", "fill-opacity", "fill-rule", "stroke", "stroke-dasharray", "stroke-dashoffset",
  // "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity",
  // "stroke-width"
  // and then for each child, if they do not have the attribute (or the value is 'inherit')
  // then set the child's attribute

  const gangle = getRotationAngle(g)

  const gattrs = {
    filter: g.getAttribute('filter'),
    opacity: g.getAttribute('opacity')
  }
  let gfilter
  let gblur
  let changes
  const drawing = svgCanvas.getDrawing()

  for (let i = 0; i < len; i++) {
    const elem = children[i]

    if (elem.nodeType !== 1) {
      continue
    }

    if (gattrs.opacity !== null && gattrs.opacity !== 1) {
      // const c_opac = elem.getAttribute('opacity') || 1;
      const newOpac =
        Math.round((elem.getAttribute('opacity') || 1) * gattrs.opacity * 100) /
        100
      svgCanvas.changeSelectedAttribute('opacity', newOpac, [elem])
    }

    if (gattrs.filter) {
      let cblur = svgCanvas.getBlur(elem)
      const origCblur = cblur
      if (!gblur) {
        gblur = svgCanvas.getBlur(g)
      }
      if (cblur) {
        // Is this formula correct?
        cblur = Number(gblur) + Number(cblur)
      } else if (cblur === 0) {
        cblur = gblur
      }

      // If child has no current filter, get group's filter or clone it.
      if (!origCblur) {
        // Set group's filter to use first child's ID
        if (!gfilter) {
          gfilter = getRefElem(gattrs.filter)
        } else {
          // Clone the group's filter
          gfilter = drawing.copyElem(gfilter)
          findDefs().append(gfilter)

          // const filterElem = getRefElem(gfilter);
          const blurElem = getFeGaussianBlur(gfilter)
          // Change this in future for different filters
          const suffix =
            blurElem?.tagName === 'feGaussianBlur' ? 'blur' : 'filter'
          gfilter.id = `${elem.id}_${suffix}`
          svgCanvas.changeSelectedAttribute(
            'filter',
            `url(#${gfilter.id})`,
            [elem]
          )
        }
      } else {
        gfilter = getRefElem(elem.getAttribute('filter'))
      }
      // const filterElem = getRefElem(gfilter);
      const blurElem = getFeGaussianBlur(gfilter)

      // Update blur value
      if (cblur) {
        svgCanvas.changeSelectedAttribute('stdDeviation', cblur, [blurElem])
        svgCanvas.setBlurOffsets(gfilter, cblur)
      }
    }

    let chtlist = getTransformList(elem)

    // Don't process gradient transforms
    if (elem.tagName.includes('Gradient')) {
      chtlist = null
    }

    // Hopefully not a problem to add this. Necessary for elements like <desc/>
    if (!chtlist) {
      continue
    }

    // Apparently <defs> can get get a transformlist, but we don't want it to have one!
    if (elem.tagName === 'defs') {
      continue
    }

    if (glist.numberOfItems) {
      const oldxform = elem.getAttribute('transform')

      // TODO: if the group's transform is just a rotate, we can always transfer the
      // rotate() down to the children (collapsing consecutive rotates and factoring
      // out any translates)
      if (gangle && glist.numberOfItems === 1) {
        // [Rg] [Rc] [Mc]
        // we want [Tr] [Rc2] [Mc] where:
        //  - [Rc2] is at the child's current center but has the
        // sum of the group and child's rotation angles
        //  - [Tr] is the equivalent translation that this child
        // undergoes if the group wasn't there

        // [Tr] = [Rg] [Rc] [Rc2_inv]

        // get group's rotation matrix (Rg)
        const rgm = glist.getItem(0).matrix

        // get child's rotation matrix (Rc)
        let rcm = svgCanvas.getSvgRoot().createSVGMatrix()
        const cangle = getRotationAngle(elem)
        if (cangle) {
          rcm = chtlist.getItem(0).matrix
        }

        // get child's old center of rotation
        const cbox = utilsGetBBox(elem)
        const ceqm = transformListToTransform(chtlist).matrix
        const coldc = transformPoint(
          cbox.x + cbox.width / 2,
          cbox.y + cbox.height / 2,
          ceqm
        )

        // sum group and child's angles
        const sangle = gangle + cangle

        // get child's rotation at the old center (Rc2_inv)
        const r2 = svgCanvas.getSvgRoot().createSVGTransform()
        r2.setRotate(sangle, coldc.x, coldc.y)

        // calculate equivalent translate
        const trm = matrixMultiply(rgm, rcm, r2.matrix.inverse())

        // set up tlist
        if (cangle) {
          chtlist.removeItem(0)
        }

        if (sangle) {
          if (chtlist.numberOfItems) {
            chtlist.insertItemBefore(r2, 0)
          } else {
            chtlist.appendItem(r2)
          }
        }

        if (trm.e || trm.f) {
          const tr = svgCanvas.getSvgRoot().createSVGTransform()
          tr.setTranslate(trm.e, trm.f)
          if (chtlist.numberOfItems) {
            chtlist.insertItemBefore(tr, 0)
          } else {
            chtlist.appendItem(tr)
          }
        }
      } else {
        // more complicated than just a rotate
        // transfer the group's transform down to each child

        // Prepend the group's transform items to the child's transform list
        // New transform = [group transform] [child transform]
        // This preserves the correct application order and keeps rotate typed.
        for (let j = glist.numberOfItems - 1; j >= 0; j--) {
          const newxform = clonePushedGroupTransform(glist.getItem(j))
          if (chtlist.numberOfItems) {
            chtlist.insertItemBefore(newxform, 0)
          } else {
            chtlist.appendItem(newxform)
          }
        }
      }
      normalizePushedGroupChild(elem, oldxform, batchCmd, undoable)
    }
  }

  // remove transform and make it undo-able
  if (xform) {
    changes = {}
    changes.transform = xform
    g.setAttribute('transform', '')
    g.removeAttribute('transform')
    batchCmd.addSubCommand(new ChangeElementCommand(g, changes))
  }

  if (undoable && !batchCmd.isEmpty()) {
    return batchCmd
  }
  return undefined
}

/**
 * Converts selected/given `<use>` or child SVG element to a group.
 * @function module:selected-elem.SvgCanvas#convertToGroup
 * @param {Element} elem
 * @fires module:selected-elem.SvgCanvas#event:selected
 * @returns {void}
 */
const convertToGroup = elem => {
  const selectedElements = svgCanvas.getSelectedElements()
  if (!elem) {
    elem = selectedElements[0]
  }
  const $elem = elem
  const batchCmd = new BatchCommand()
  let ts
  const dataStorage = svgCanvas.getDataStorage()
  if (dataStorage.has($elem, 'gsvg')) {
    // Use the gsvg as the new group
    const svg = elem.firstChild
    const pt = {
      x: Number(svg.getAttribute('x')),
      y: Number(svg.getAttribute('y'))
    }

    // $(elem.firstChild.firstChild).unwrap();
    const firstChild = elem.firstChild.firstChild
    if (firstChild) {
      // Move the nodes instead of re-serializing them: re-parsing imported
      // markup with the HTML parser could turn inert content into live markup.
      firstChild.replaceWith(...firstChild.childNodes)
    }
    dataStorage.remove(elem, 'gsvg')

    const tlist = getTransformList(elem)
    const xform = svgCanvas.getSvgRoot().createSVGTransform()
    xform.setTranslate(pt.x, pt.y)
    tlist.appendItem(xform)
    recalculateDimensions(elem)
    svgCanvas.call('selected', [elem])
    return elem
  } else if (dataStorage.has($elem, 'symbol')) {
    elem = dataStorage.get($elem, 'symbol')
    if (!elem) {
      warn('Unable to convert <use>: missing symbol reference', null, 'selected-elem')
      return
    }

    ts = $elem.getAttribute('transform') || ''
    const pos = {
      x: Number($elem.getAttribute('x')),
      y: Number($elem.getAttribute('y'))
    }

    const vb = elem.getAttribute('viewBox')

    if (vb) {
      const nums = vb.split(/[ ,]+/)
      pos.x -= Number(nums[0])
      pos.y -= Number(nums[1])
    }

    // Not ideal, but works
    ts += ' translate(' + (pos.x || 0) + ',' + (pos.y || 0) + ')'

    const useParent = $elem.parentNode
    const useNextSibling = $elem.nextSibling

    // Remove <use> element
    batchCmd.addSubCommand(
      new RemoveElementCommand(
        $elem,
        useNextSibling,
        useParent
      )
    )
    $elem.remove()

    // See if other elements reference this symbol
    const svgContent = svgCanvas.getSvgContent()
    // const hasMore = svgContent.querySelectorAll('use:data(symbol)').length;
    // @todo review this logic
    const hasMore = svgContent.querySelectorAll('use').length

    const g = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'g')
    const childs = elem.childNodes

    let i
    for (i = 0; i < childs.length; i++) {
      g.append(childs[i].cloneNode(true))
    }

    // Duplicate the gradients for Gecko, since they weren't included in the <symbol>
    if (isGecko()) {
      const svgElement = findDefs()
      const gradients = svgElement.querySelectorAll(
        'linearGradient,radialGradient,pattern'
      )
      for (let i = 0, im = gradients.length; im > i; i++) {
        g.appendChild(gradients[i].cloneNode(true))
      }
    }

    if (ts) {
      g.setAttribute('transform', ts)
    }

    const parent = elem.parentNode

    svgCanvas.uniquifyElems(g)

    // Put the dupe gradients back into <defs> (after uniquifying them)
    if (isGecko()) {
      const svgElement = findDefs()
      const elements = g.querySelectorAll(
        'linearGradient,radialGradient,pattern'
      )
      for (let i = 0, im = elements.length; im > i; i++) {
        svgElement.appendChild(elements[i])
      }
    }

    // now give the g itself a new id
    g.id = svgCanvas.getNextId()

    if (useParent) {
      useParent.insertBefore(g, useNextSibling)
    }

    if (parent) {
      if (!hasMore) {
        // remove symbol/svg element
        const { nextSibling } = elem
        elem.remove()
        batchCmd.addSubCommand(
          new RemoveElementCommand(elem, nextSibling, parent)
        )
      }
      batchCmd.addSubCommand(new InsertElementCommand(g))
    }

    svgCanvas.setUseData(g)

    if (isGecko()) {
      svgCanvas.convertGradients(findDefs())
    } else {
      svgCanvas.convertGradients(g)
    }

    // recalculate dimensions on the top-level children so that unnecessary transforms
    // are removed
    walkTreePost(g, n => {
      try {
        recalculateDimensions(n)
      } catch (e) {
        error('Error recalculating dimensions', e, 'selected-elem')
      }
    })

    // Give ID for any visible element missing one
    const visElems = g.querySelectorAll(svgCanvas.getVisElems())
    Array.prototype.forEach.call(visElems, el => {
      if (!el.id) {
        el.id = svgCanvas.getNextId()
      }
    })

    svgCanvas.selectOnly([g])

    const cm = pushGroupProperty(g, true)
    if (cm) {
      batchCmd.addSubCommand(cm)
    }

    svgCanvas.addCommandToHistory(batchCmd)
    return g
  } else {
    warn('Unexpected element to ungroup:', elem, 'selected-elem')
    return null
  }
}

/**
 * Unwraps all the elements in a selected group (`g`) element. This requires
 * significant recalculations to apply group's transforms, etc. to its children.
 * @function module:selected-elem.SvgCanvas#ungroupSelectedElement
 * @returns {void}
 */
const ungroupSelectedElement = () => {
  const selectedElements = svgCanvas.getSelectedElements()
  const dataStorage = svgCanvas.getDataStorage()
  let g = selectedElements[0]
  if (!g) {
    return
  }
  if (dataStorage.has(g, 'gsvg') || dataStorage.has(g, 'symbol')) {
    // Is svg (e.g. imported content), so convert to a real group first, then
    // fall through below to actually ungroup/flatten that new group - a
    // single Ungroup action on imported content should ungroup it, not just
    // silently swap its <use>/gsvg wrapper for a <g> that still needs a
    // second Ungroup to do anything.
    g = convertToGroup(g)
    if (!g) { return }
  } else if (g.tagName === 'use') {
    // Somehow doesn't have data set, so retrieve
    const href = getHref(g)
    if (!href || !href.startsWith('#')) {
      warn('Unexpected <use> without local reference:', g, 'selected-elem')
      return
    }
    const symbol = getElement(href.slice(1))
    if (!symbol) {
      warn('Unexpected <use> without resolved reference:', g, 'selected-elem')
      return
    }
    dataStorage.put(g, 'symbol', symbol)
    dataStorage.put(g, 'ref', symbol)
    g = convertToGroup(g)
    if (!g) { return }
  }
  const parentsA = getParents(g.parentNode, 'a')
  if (parentsA?.length) {
    g = parentsA[0]
  }

  // Look for parent "a"
  if (g.tagName === 'g' || g.tagName === 'a') {
    const batchCmd = new BatchCommand('Ungroup Elements')
    const cmd = pushGroupProperty(g, true)
    if (cmd) {
      batchCmd.addSubCommand(cmd)
    }

    const parent = g.parentNode
    const anchor = g.nextSibling
    const children = new Array(g.childNodes.length)

    let i = 0
    while (g.firstChild) {
      const elem = g.firstChild
      const oldNextSibling = elem.nextSibling
      const oldParent = elem.parentNode

      // Remove child title elements
      if (elem.tagName === 'title') {
        const { nextSibling } = elem
        batchCmd.addSubCommand(
          new RemoveElementCommand(elem, nextSibling, oldParent)
        )
        elem.remove()
        continue
      }

      children[i++] = parent.insertBefore(elem, anchor)
      batchCmd.addSubCommand(
        new MoveElementCommand(elem, oldNextSibling, oldParent)
      )
    }

    // remove the group from the selection
    svgCanvas.clearSelection()

    // delete the group element (but make undo-able)
    const gNextSibling = g.nextSibling
    g.remove()
    batchCmd.addSubCommand(new RemoveElementCommand(g, gNextSibling, parent))

    if (!batchCmd.isEmpty()) {
      svgCanvas.addCommandToHistory(batchCmd)
    }

    // update selection
    svgCanvas.addToSelection(children)
  }
}
/**
 * Updates the editor canvas width/height/position after a zoom has occurred.
 * @function module:svgcanvas.SvgCanvas#updateCanvas
 * @param {Float} w - Float with the new width
 * @param {Float} h - Float with the new height
 * @fires module:svgcanvas.SvgCanvas#event:ext_canvasUpdated
 * @returns {module:svgcanvas.CanvasInfo}
 */
const updateCanvas = (w, h) => {
  svgCanvas.getSvgRoot().setAttribute('width', w)
  svgCanvas.getSvgRoot().setAttribute('height', h)
  const zoom = svgCanvas.getZoom()
  const bg = document.getElementById('canvasBackground')
  const oldX = Number(svgCanvas.getSvgContent().getAttribute('x'))
  const oldY = Number(svgCanvas.getSvgContent().getAttribute('y'))
  const x = (w - svgCanvas.contentW * zoom) / 2
  const y = (h - svgCanvas.contentH * zoom) / 2

  assignAttributes(svgCanvas.getSvgContent(), {
    width: svgCanvas.contentW * zoom,
    height: svgCanvas.contentH * zoom,
    x,
    y,
    viewBox: `0 0 ${svgCanvas.contentW} ${svgCanvas.contentH}`
  })

  assignAttributes(bg, {
    width: svgCanvas.getSvgContent().getAttribute('width'),
    height: svgCanvas.getSvgContent().getAttribute('height'),
    x,
    y
  })

  const bgImg = getElement('background_image')
  if (bgImg) {
    assignAttributes(bgImg, {
      width: '100%',
      height: '100%'
    })
  }

  svgCanvas.selectorManager.selectorParentGroup.setAttribute(
    'transform',
    `translate(${x},${y})`
  )
  // The hover outline was drawn for the previous zoom.
  svgCanvas.selectorManager.hideHover?.()

  /**
   * Invoked upon updates to the canvas.
   * @event module:svgcanvas.SvgCanvas#event:ext_canvasUpdated
   * @type {PlainObject}
   * @property {Integer} new_x
   * @property {Integer} new_y
   * @property {string} old_x (Of Integer)
   * @property {string} old_y (Of Integer)
   * @property {Integer} d_x
   * @property {Integer} d_y
   */
  svgCanvas.runExtensions(
    'canvasUpdated',
    /**
     * @type {module:svgcanvas.SvgCanvas#event:ext_canvasUpdated}
     */
    {
      new_x: x,
      new_y: y,
      old_x: oldX,
      old_y: oldY,
      d_x: x - oldX,
      d_y: y - oldY
    }
  )
  return { x, y, old_x: oldX, old_y: oldY, d_x: x - oldX, d_y: y - oldY }
}
/**
 * Select the next/previous element within the current layer.
 * @function module:svgcanvas.SvgCanvas#cycleElement
 * @param {boolean} next - true = next and false = previous element
 * @fires module:svgcanvas.SvgCanvas#event:selected
 * @returns {void}
 */
const cycleElement = next => {
  const selectedElements = svgCanvas.getSelectedElements()
  const currentGroup = svgCanvas.getCurrentGroup()
  let num
  const curElem = selectedElements[0]
  let elem = false
  const allElems = getVisibleElements(
    currentGroup || svgCanvas.getCurrentDrawing().getCurrentLayer()
  )
  if (!allElems.length) {
    return
  }
  if (!curElem) {
    num = next ? allElems.length - 1 : 0
    elem = allElems[num]
  } else {
    let i = allElems.length
    while (i--) {
      if (allElems[i] === curElem) {
        num = next ? i - 1 : i + 1
        if (num >= allElems.length) {
          num = 0
        } else if (num < 0) {
          num = allElems.length - 1
        }
        elem = allElems[num]
        break
      }
    }
  }
  svgCanvas.selectOnly([elem], true)
  svgCanvas.call('selected', selectedElements)
}
