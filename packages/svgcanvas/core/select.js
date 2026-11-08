/**
 * DOM element selection box tools.
 * @module select
 * @license MIT
 *
 * @copyright 2010 Alexis Deveria, 2010 Jeff Schiller
 */

import { isWebkit } from '../common/browser.js'
import { getRotationAngle, getBBox, getStrokedBBox } from './utilities.js'
import { transformListToTransform, transformBox, transformPoint, matrixMultiply, getTransformList } from './math.js'
import { NS } from './namespaces'
import { warn } from '../common/logger.js'
import { convertUnit } from './units.js'
import {
  CORNER_ANGLES, GRIP_ANGLES, formatAngle, formatLength, formatPosition, formatSize, gripLayout,
  namedResizeCursors, resizeCursor, rotateCursor
} from './feedback.js'

let svgCanvas
// change radius if touch screen
const gripRadius = window.ontouchstart ? 10 : 4
// Selection look: square grips with a white fill, a solid accent frame and a
// larger invisible area to grab each grip.
const SELECTION_COLOR = '#1e6fff'
const GRIP_SIZE = window.ontouchstart ? 20 : 8
const GRIP_HIT_SIZE = window.ontouchstart ? 32 : 16
// Depth of the rotation zone outside each corner, beyond the resize hit area.
const ROTATE_ZONE = window.ontouchstart ? 16 : 12
// Dimension label under the frame: gap, height and side padding, in pixels.
const LABEL_GAP = 10
const LABEL_HEIGHT = 18
const LABEL_PADDING = 6
const LABEL_FONT_SIZE = 11
const LABEL_FONT_FAMILY = 'sans-serif'
// Guides of the snapping and measures (lot V2): the colours of the editor's
// theme, with fallbacks for a canvas used alone.
const GUIDE_STROKE = 'stroke: var(--se-guide, #e0115f)'
const GUIDE_FILL = 'fill: var(--se-guide, #e0115f)'
const GUIDE_TEXT = 'fill: var(--se-guide-text, #fff)'
const GUIDE_TICK = 4

// Text width, measured on a detached canvas: measuring the SVG text itself
// would force a layout of the whole drawing during a gesture.
let measureContext
const measureText = (text) => {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement('canvas').getContext('2d')
    } catch (e) {
      measureContext = null
    }
    if (measureContext) { measureContext.font = `${LABEL_FONT_SIZE}px ${LABEL_FONT_FAMILY}` }
  }
  return measureContext ? measureContext.measureText(text).width : text.length * LABEL_FONT_SIZE * 0.6
}

// A detached <svg> used only to create SVGMatrix objects, instead of creating
// a new element on every selector resize.
let matrixFactory = null
const getMatrixFactory = () => {
  if (!matrixFactory) {
    matrixFactory = document.createElementNS(NS.SVG, 'svg')
  }
  return matrixFactory
}

/**
 * Private singleton manager for selector state
 */
class SelectModule {
  #selectorManager = null

  /**
   * Initialize the select module with canvas
   * @param {Object} canvas - The SVG canvas instance
   * @returns {void}
   */
  init (canvas) {
    svgCanvas = canvas
    this.#selectorManager = new SelectorManager()
  }

  /**
   * Get the singleton SelectorManager instance
   * @returns {SelectorManager} The SelectorManager instance
   */
  getSelectorManager () {
    return this.#selectorManager
  }
}

/**
 * Geometry of the frame drawn around an element, in screen coordinates: the
 * element's box, stroke included, turned like the element. The selection
 * frame and the hover outline both use it, so the outline shows exactly the
 * frame a click will draw.
 * @param {Element} selected
 * @param {module:utilities.BBoxObject} [bbox] - Read when not given
 * @param {boolean} [exactBBox=false] - The bbox already is the selection box
 *   (see `Selector.getSelectionBBox`), so groups are not measured again.
 * @returns {{d: string, transform: string, gripCoords: Object<string, number[]>,
 *   screenBox: module:utilities.BBoxObject}|null} Null without a box
 */
const frameGeometry = (selected, bbox, exactBBox = false) => {
  const dataStorage = svgCanvas.getDataStorage()
  const zoom = svgCanvas.getZoom()
  let offset = 1 / zoom
  const sw = selected.getAttribute('stroke-width')
  if (selected.getAttribute('stroke') !== 'none' && !isNaN(sw)) {
    offset += (sw / 2)
  }

  const { tagName } = selected
  if (tagName === 'text') {
    offset += 2 / zoom
  }

  // find the transformations applied to the parent of the selected element
  let parentTransformationMatrix = getMatrixFactory().createSVGMatrix()
  let currentElt = selected
  while (currentElt.parentNode) {
    if (currentElt.parentNode && currentElt.parentNode.tagName === 'g' && currentElt.parentNode.transform) {
      if (currentElt.parentNode.transform.baseVal.numberOfItems) {
        parentTransformationMatrix = matrixMultiply(transformListToTransform(getTransformList(currentElt.parentNode)).matrix, parentTransformationMatrix)
      }
    }
    currentElt = currentElt.parentNode
  }

  // loop and transform our bounding box until we reach our first rotation
  const tlist = getTransformList(selected)

  // combines the parent transformation with that of the selected element if necessary
  const m = parentTransformationMatrix ? matrixMultiply(parentTransformationMatrix, transformListToTransform(tlist).matrix) : transformListToTransform(tlist).matrix

  // This should probably be handled somewhere else, but for now
  // it keeps the selection box correctly positioned when zoomed
  m.e *= zoom
  m.f *= zoom

  if (!bbox) {
    bbox = getBBox(selected)
  }
  // TODO: getBBox (previous line) already knows to call getStrokedBBox when tagName === 'g'. Remove this?
  // TODO: getBBox doesn't exclude 'gsvg' and calls getStrokedBBox for any 'g'. Should getBBox be updated?
  if (!exactBBox && tagName === 'g' && !dataStorage.has(selected, 'gsvg')) {
    // The bbox for a group does not include stroke vals, so we
    // get the bbox based on its children.
    const strokedBbox = getStrokedBBox([selected.childNodes])
    if (strokedBbox) {
      bbox = strokedBbox
    }
  }

  if (!bbox) { return null }

  // apply the transforms
  const l = bbox.x; const t = bbox.y; const w = bbox.width; const h = bbox.height

  // we need to handle temporary transforms too
  // if skewed, get its transformed box, then find its axis-aligned bbox
  offset *= zoom

  const nbox = transformBox(l * zoom, t * zoom, w * zoom, h * zoom, m)
  const { aabox } = nbox
  let nbax = aabox.x - offset
  let nbay = aabox.y - offset
  let nbaw = aabox.width + (offset * 2)
  let nbah = aabox.height + (offset * 2)
  const screenBox = { x: nbax, y: nbay, width: nbaw, height: nbah }

  // now if the shape is rotated, un-rotate it
  const cx = nbax + nbaw / 2
  const cy = nbay + nbah / 2

  const angle = getRotationAngle(selected)
  if (angle) {
    const rot = svgCanvas.getSvgRoot().createSVGTransform()
    rot.setRotate(-angle, cx, cy)
    const rotm = rot.matrix
    nbox.tl = transformPoint(nbox.tl.x, nbox.tl.y, rotm)
    nbox.tr = transformPoint(nbox.tr.x, nbox.tr.y, rotm)
    nbox.bl = transformPoint(nbox.bl.x, nbox.bl.y, rotm)
    nbox.br = transformPoint(nbox.br.x, nbox.br.y, rotm)

    // calculate the axis-aligned bbox
    const { tl } = nbox
    let minx = tl.x
    let miny = tl.y
    let maxx = tl.x
    let maxy = tl.y

    const { min, max } = Math

    minx = min(minx, min(nbox.tr.x, min(nbox.bl.x, nbox.br.x))) - offset
    miny = min(miny, min(nbox.tr.y, min(nbox.bl.y, nbox.br.y))) - offset
    maxx = max(maxx, max(nbox.tr.x, max(nbox.bl.x, nbox.br.x))) + offset
    maxy = max(maxy, max(nbox.tr.y, max(nbox.bl.y, nbox.br.y))) + offset

    nbax = minx
    nbay = miny
    nbaw = (maxx - minx)
    nbah = (maxy - miny)
  }

  return {
    d: `M${nbax},${nbay} L${nbax + nbaw},${nbay} ${nbax + nbaw},${nbay + nbah} ${nbax},${nbay + nbah}z`,
    transform: angle ? 'rotate(' + [angle, cx, cy].join(',') + ')' : '',
    gripCoords: {
      nw: [nbax, nbay],
      ne: [nbax + nbaw, nbay],
      sw: [nbax, nbay + nbah],
      se: [nbax + nbaw, nbay + nbah],
      n: [nbax + (nbaw) / 2, nbay],
      w: [nbax, nbay + (nbah) / 2],
      e: [nbax + nbaw, nbay + (nbah) / 2],
      s: [nbax + (nbaw) / 2, nbay + nbah]
    },
    screenBox
  }
}

/**
* Private class for DOM element selection boxes.
*/
export class Selector {
  /**
  * @param {Integer} id - Internally identify the selector
  * @param {Element} elem - DOM element associated with this selector
  * @param {module:utilities.BBoxObject} [bbox] - Optional bbox to use for initialization (prevents duplicate `getBBox` call).
  */
  constructor (id, elem, bbox, exactBBox = false) {
    // this is the selector's unique number
    this.id = id

    // this holds a reference to the element for which this selector is being used
    this.selectedElement = elem

    // this is a flag used internally to track whether the selector is being used or not
    this.locked = true

    // this holds a reference to the <g> element that holds all visual elements of the selector
    this.selectorGroup = svgCanvas.createSVGElement({
      element: 'g',
      attr: { id: `selectorGroup${this.id}` }
    })

    // this holds a reference to the path rect
    this.selectorRect = svgCanvas.createSVGElement({
      element: 'path',
      attr: {
        id: `selectedBox${this.id}`,
        fill: 'none',
        stroke: SELECTION_COLOR,
        'stroke-width': '1',
        // need to specify this so that the rect is not selectable
        style: 'pointer-events:none'
      }
    })
    this.selectorGroup.append(this.selectorRect)

    // this holds a reference to the grip coordinates for this selector
    this.gripCoords = {
      nw: null,
      n: null,
      ne: null,
      e: null,
      se: null,
      s: null,
      sw: null,
      w: null
    }

    this.reset(this.selectedElement, bbox, exactBBox)
  }

  /**
  * Used to reset the id and element that the selector is attached to.
  * @param {Element} e - DOM element associated with this selector
  * @param {module:utilities.BBoxObject} bbox - Optional bbox to use for reset (prevents duplicate getBBox call).
  * @returns {void}
  */
  reset (e, bbox, exactBBox = false) {
    this.locked = true
    this.selectedElement = e
    this.resize(bbox, exactBBox)
    this.selectorGroup.setAttribute('display', 'inline')
  }

  /**
  * Returns the box the selector frames: the element's bounding box, or for a
  * group the stroked box of its children. Reading it forces a layout, so
  * callers handling many elements should read every box first, then resize.
  * @param {Element} elem
  * @returns {module:utilities.BBoxObject|null}
  */
  static getSelectionBBox (elem) {
    let bbox = getBBox(elem)
    if (elem.tagName === 'g' && !svgCanvas.getDataStorage().has(elem, 'gsvg')) {
      // The bbox for a group does not include stroke vals, so we
      // get the bbox based on its children.
      const strokedBbox = getStrokedBBox([elem.childNodes])
      if (strokedBbox) {
        bbox = strokedBbox
      }
    }
    return bbox
  }

  /**
  * Show the resize grips of this selector.
  * @param {boolean} show - Indicates whether grips should be shown or not
  * @returns {void}
  */
  showGrips (show) {
    const bShow = show ? 'inline' : 'none'
    selectModule.getSelectorManager().selectorGripsGroup.setAttribute('display', bShow)
    const elem = this.selectedElement
    this.hasGrips = show
    if (elem && show) {
      const mgr = selectModule.getSelectorManager()
      // The grips move to this selector: no other selector owns them anymore.
      mgr.selectors.forEach((selector) => {
        if (selector && selector !== this) { selector.hasGrips = false }
      })
      mgr.multiGrips = false
      mgr.showRotateGrip(true)
      mgr.selectorGripsGroup.removeAttribute('transform')
      this.selectorGroup.append(mgr.selectorGripsGroup)
      Selector.updateGripCursors(getRotationAngle(elem))
      this.updateGripPositions()
    }
  }

  /**
  * Moves the shared resize and rotate grips onto this selector's box.
  * @returns {void}
  */
  updateGripPositions () {
    selectModule.getSelectorManager().positionGrips(this.gripCoords)
  }

  /**
  * Updates the selector to match the element's size.
  * @param {module:utilities.BBoxObject} [bbox] - BBox to use for resize (prevents duplicate getBBox call).
  * @param {boolean} [exactBBox=false] - The bbox already is the selection box
  *   (see `Selector.getSelectionBBox`), so groups are not measured again.
  * @returns {void}
  */
  resize (bbox, exactBBox = false) {
    const frame = frameGeometry(this.selectedElement, bbox, exactBBox)
    if (!frame) { return }
    // Axis-aligned box on screen, used for the common frame of a
    // multi-selection and to place the dimension label.
    this.screenBox = frame.screenBox
    this.gripCoords = frame.gripCoords
    this.selectorRect.setAttribute('d', frame.d)
    // Unrotated selectors keep an empty transform: skip the redundant write.
    if (this.selectorGroup.getAttribute('transform') !== frame.transform) {
      this.selectorGroup.setAttribute('transform', frame.transform)
    }
    // The grips are shared by all selectors: only the selector that shows
    // them positions them (showGrips does it when they move to a selector).
    if (this.hasGrips) {
      this.updateGripPositions()
    }
    selectModule.getSelectorManager().scheduleFrameUpdate()
  }

  // STATIC methods
  /**
  * Updates cursors for corner grips on rotation so arrows point the right way.
  * @param {Float} angle - Current rotation angle in degrees
  * @returns {void}
  */
  static updateGripCursors (angle) {
    selectModule.getSelectorManager().applyGripCursors(angle)
  }
}

/**
* Manage all selector objects (selection boxes).
*/
export class SelectorManager {
  /**
   * Sets up properties and calls `initGroup`.
   */
  constructor () {
    // this will hold the <g> element that contains all selector rects/grips
    this.selectorParentGroup = null

    // this is a special rect that is used for multi-select
    this.rubberBandBox = null

    // this will hold objects of type Selector (see above)
    this.selectors = []

    // this holds a map of SVG elements to their Selector object
    this.selectorMap = {}

    // this holds a reference to the grip elements
    this.selectorGrips = {
      nw: null,
      n: null,
      ne: null,
      e: null,
      se: null,
      s: null,
      sw: null,
      w: null
    }

    this.selectorGripsGroup = null
    this.rotateGripConnector = null
    this.rotateGrip = null

    // Common frame of a multi-selection, and whether the grips are on it
    this.multiFrame = null
    this.multiGrips = false
    this.frameBox = null
    this.lockedFrame = null
    this.frameUpdatePending = false
    this.frameAngle = 0
    this.framePivot = null

    // Rotation zones outside the corners, angle the grip cursors follow, and
    // whether the frame the grips are on is small (see feedback.gripLayout)
    this.rotateZones = {}
    this.rotateFallbackCursor = 'auto'
    this.cursorAngle = 0
    this.cursorsApplied = false
    this.smallFrame = { width: false, height: false }

    // Outline of the element under the pointer, and the dimension label
    this.hoverOutline = null
    this.hoverTarget = null
    this.dimensionLabel = null
    this.dimensionText = null
    this.dimensionBack = null

    this.initGroup()
  }

  /**
  * Moves the shared resize and rotate grips onto a box.
  * @param {Object<string, number[]>} gripCoords - Position of each grip
  * @returns {void}
  */
  positionGrips (gripCoords) {
    const { nw, n } = gripCoords
    if (!nw || !n) { return }
    // On a small frame, side grips hide and corner hit areas move outward,
    // so that a drag inside the frame moves the selection.
    const layout = gripLayout(gripCoords, { grip: GRIP_SIZE, hit: GRIP_HIT_SIZE, zone: ROTATE_ZONE })
    this.smallFrame = layout.small
    Object.entries(gripCoords).forEach(([dir, [x, y]]) => {
      const grip = this.selectorGrips[dir]
      const hit = this.selectorGripHits?.[dir]
      grip.setAttribute('x', x - GRIP_SIZE / 2)
      grip.setAttribute('y', y - GRIP_SIZE / 2)
      if (hit) {
        const [hx, hy] = layout.hits[dir]
        hit.setAttribute('x', hx)
        hit.setAttribute('y', hy)
      }
      const hidden = layout.hidden.has(dir)
      ;[grip, hit].forEach((element) => {
        if (!element) { return }
        if (hidden) {
          element.setAttribute('display', 'none')
        } else if (element.hasAttribute('display')) {
          element.removeAttribute('display')
        }
      })
    })
    Object.entries(layout.zones).forEach(([dir, [x, y, width, height]]) => {
      const zone = this.rotateZones[dir]
      if (!zone) { return }
      zone.setAttribute('x', x)
      zone.setAttribute('y', y)
      zone.setAttribute('width', width)
      zone.setAttribute('height', height)
    })
    // we want to go 20 pixels in the negative transformed y direction, ignoring scale
    const [topX, topY] = n
    const rotateY = topY - (gripRadius * 5)
    this.rotateGripConnector.setAttribute('x1', topX)
    this.rotateGripConnector.setAttribute('y1', topY)
    this.rotateGripConnector.setAttribute('x2', topX)
    this.rotateGripConnector.setAttribute('y2', rotateY)
    this.rotateGrip.setAttribute('cx', topX)
    this.rotateGrip.setAttribute('cy', rotateY)
    this.rotateGripHit?.setAttribute('cx', topX)
    this.rotateGripHit?.setAttribute('cy', rotateY)
  }

  /**
  * Shows or hides the rotation grip.
  * @param {boolean} show
  * @returns {void}
  */
  showRotateGrip (show) {
    ;[this.rotateGrip, this.rotateGripHit, this.rotateGripConnector, ...Object.values(this.rotateZones)].forEach((element) => {
      if (!element) { return }
      if (show) {
        element.removeAttribute('display')
      } else {
        element.setAttribute('display', 'none')
      }
    })
  }

  /**
  * Sets the cursors of the resize grips and of the rotation zones for a
  * frame turned by `angle`.
  * @param {number} angle - Degrees
  * @returns {void}
  */
  applyGripCursors (angle) {
    angle = Number(angle) || 0
    // Cursors are drawn to the degree: nothing to do for a smaller change.
    if (this.cursorsApplied && Math.round(angle) === Math.round(this.cursorAngle)) { return }
    this.cursorsApplied = true
    this.cursorAngle = angle
    const dirs = Object.keys(this.selectorGrips)
    const named = namedResizeCursors(dirs, angle)
    dirs.forEach((dir) => {
      const style = `cursor:${resizeCursor(GRIP_ANGLES[dir] + angle, `${named[dir]}-resize`)}`
      this.selectorGrips[dir]?.setAttribute('style', style)
      this.selectorGripHits?.[dir]?.setAttribute('style', style)
    })
    Object.entries(this.rotateZones).forEach(([dir, zone]) => {
      zone.setAttribute('style', `cursor:${rotateCursor(CORNER_ANGLES[dir] + angle, this.rotateFallbackCursor)}`)
    })
  }

  /**
  * Outlines the element a click would select, with the frame that click
  * would draw. Null hides the outline.
  * @param {Element|null} elem
  * @returns {void}
  */
  showHover (elem) {
    const outline = this.hoverOutline
    if (!outline) { return }
    if (!elem) {
      this.hideHover()
      return
    }
    // Same element: its outline is already drawn.
    if (elem === this.hoverTarget && !outline.hasAttribute('display')) { return }
    let frame = null
    try {
      frame = frameGeometry(elem)
    } catch (e) {
      frame = null
    }
    if (!frame) {
      this.hideHover()
      return
    }
    this.hoverTarget = elem
    outline.setAttribute('d', frame.d)
    if (frame.transform) {
      outline.setAttribute('transform', frame.transform)
    } else {
      outline.removeAttribute('transform')
    }
    outline.removeAttribute('display')
  }

  /**
  * Hides the hover outline.
  * @returns {void}
  */
  hideHover () {
    this.hoverTarget = null
    if (this.hoverOutline && !this.hoverOutline.hasAttribute('display')) {
      this.hoverOutline.setAttribute('display', 'none')
    }
  }

  /**
  * Box the dimension label goes under, in screen coordinates: the common
  * frame during a gesture on it, turned frame included; otherwise the union
  * of the selectors' boxes, which are up to date after each move.
  * @returns {module:utilities.BBoxObject|null}
  */
  labelAnchor () {
    if (this.multiGrips && this.lockedFrame && this.frameBox) {
      const { x, y, width, height } = this.frameBox
      if (!this.frameAngle || !this.framePivot) { return this.frameBox }
      const rad = this.frameAngle * Math.PI / 180
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const { x: px, y: py } = this.framePivot
      const xs = []
      const ys = []
      ;[[x, y], [x + width, y], [x, y + height], [x + width, y + height]].forEach(([cx, cy]) => {
        xs.push(px + (cx - px) * cos - (cy - py) * sin)
        ys.push(py + (cx - px) * sin + (cy - py) * cos)
      })
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
    }
    const selected = svgCanvas.getSelectedElements?.() || []
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const elem of selected) {
      if (!elem) { continue }
      const sb = this.selectorMap[elem.id]?.screenBox
      if (!sb) { continue }
      if (sb.x < minX) { minX = sb.x }
      if (sb.y < minY) { minY = sb.y }
      if (sb.x + sb.width > maxX) { maxX = sb.x + sb.width }
      if (sb.y + sb.height > maxY) { maxY = sb.y + sb.height }
    }
    if (minX === Infinity) { return null }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  /**
  * Shows a text in the dimension label, centred under the selection.
  * @param {string} text
  * @returns {void}
  */
  showDimension (text) {
    const label = this.dimensionLabel
    if (!label) { return }
    const anchor = this.labelAnchor()
    if (!anchor) {
      this.hideDimension()
      return
    }
    if (this.dimensionText.textContent !== text) {
      this.dimensionText.textContent = text
      this.dimensionWidth = Math.ceil(measureText(text)) + 2 * LABEL_PADDING
    }
    const width = this.dimensionWidth
    const x = anchor.x + anchor.width / 2
    const y = anchor.y + anchor.height + LABEL_GAP
    this.dimensionBack.setAttribute('x', x - width / 2)
    this.dimensionBack.setAttribute('y', y)
    this.dimensionBack.setAttribute('width', width)
    this.dimensionText.setAttribute('x', x)
    this.dimensionText.setAttribute('y', y + LABEL_HEIGHT / 2)
    // Above every selector, including those added since.
    if (label.parentNode !== this.selectorParentGroup || label.nextSibling) {
      this.selectorParentGroup.append(label)
    }
    label.removeAttribute('display')
  }

  /**
  * Converts a length of the drawing to the document's unit.
  * @param {number} value
  * @returns {{value: number, unit: string}}
  */
  #inDocumentUnit (value) {
    const unit = svgCanvas.getCurConfig?.()?.baseUnit || svgCanvas.curConfig?.baseUnit || 'px'
    return { value: unit === 'px' ? value : convertUnit(value, unit), unit }
  }

  /**
  * Dimension label of a resize.
  * @param {number} width - In the drawing's coordinates
  * @param {number} height
  * @returns {void}
  */
  showSize (width, height) {
    const w = this.#inDocumentUnit(width)
    const h = this.#inDocumentUnit(height)
    this.showDimension(formatSize(w.value, h.value, w.unit))
  }

  /**
  * Dimension label of a move: the top left corner of the selection.
  * @param {number} x - In the drawing's coordinates
  * @param {number} y
  * @returns {void}
  */
  showPosition (x, y) {
    const px = this.#inDocumentUnit(x)
    const py = this.#inDocumentUnit(y)
    this.showDimension(formatPosition(px.value, py.value, px.unit))
  }

  /**
  * Dimension label of a rotation.
  * @param {number} angle - Degrees
  * @returns {void}
  */
  showAngle (angle) {
    this.showDimension(formatAngle(angle))
  }

  /**
  * Draws the guides of a snapping or of a measure (lot V2): lines through
  * aligned edges and middles, spacings and sizes with their value. They are
  * in the screen's pixels, whatever the zoom.
  * @param {module:snap.Guide[]} guides - In the drawing's coordinates
  * @returns {void}
  */
  showGuides (guides) {
    if (!guides?.length) {
      this.hideGuides()
      return
    }
    if (!this.guidesGroup) {
      this.guidesGroup = svgCanvas.createSVGElement({
        element: 'g',
        attr: { id: 'selectorGuides', style: 'pointer-events:none' }
      })
      this.guidesPath = svgCanvas.createSVGElement({
        element: 'path',
        attr: { fill: 'none', 'stroke-width': 1, 'shape-rendering': 'crispEdges', style: GUIDE_STROKE }
      })
      this.guidesLabels = svgCanvas.createSVGElement({ element: 'g', attr: {} })
      this.guidesGroup.append(this.guidesPath, this.guidesLabels)
    }
    if (this.guidesGroup.parentNode !== this.selectorParentGroup || this.guidesGroup.nextSibling) {
      this.selectorParentGroup.append(this.guidesGroup)
    }
    const zoom = svgCanvas.getZoom()
    const z = (value) => Math.round(value * zoom) + 0.5
    const unit = svgCanvas.getCurConfig?.()?.baseUnit || 'px'
    let d = ''
    const labels = []
    for (const guide of guides) {
      const vertical = guide.axis === 'x'
      // A line on x is vertical; a spacing or a size on x is horizontal.
      const alongX = guide.type === 'line' ? !vertical : vertical
      const segment = (from, to, at) => alongX
        ? `M${z(from)} ${z(at)}H${z(to)}`
        : `M${z(at)} ${z(from)}V${z(to)}`
      const ticks = (from, to, at) => {
        const c = z(at)
        return vertical
          ? `M${z(from)} ${c - GUIDE_TICK}V${c + GUIDE_TICK}M${z(to)} ${c - GUIDE_TICK}V${c + GUIDE_TICK}`
          : `M${c - GUIDE_TICK} ${z(from)}H${c + GUIDE_TICK}M${c - GUIDE_TICK} ${z(to)}H${c + GUIDE_TICK}`
      }
      if (guide.type === 'line') {
        d += segment(guide.from, guide.to, guide.at)
        continue
      }
      // Spacings and measures at their place, sizes a little outside the box.
      const at = guide.type === 'size' ? guide.at - (GUIDE_TICK * 2) / zoom : guide.at
      d += segment(guide.from, guide.to, at) + ticks(guide.from, guide.to, at)
      if (guide.type !== 'size') {
        const middle = (guide.from + guide.to) / 2
        const length = Math.abs(guide.to - guide.from)
        const value = unit === 'px' ? length : convertUnit(length, unit)
        // Under a horizontal segment, right of a vertical one.
        labels.push(vertical
          ? { text: formatLength(value, unit), x: middle * zoom, y: at * zoom + LABEL_GAP + LABEL_HEIGHT / 2 }
          : { text: formatLength(value, unit), x: at * zoom + LABEL_GAP, y: middle * zoom, start: true })
      }
    }
    this.guidesPath.setAttribute('d', d)
    this.#drawGuideLabels(labels)
    this.guidesGroup.removeAttribute('display')
  }

  /**
  * @param {{text: string, x: number, y: number}[]} labels - In the screen's pixels
  * @returns {void}
  */
  #drawGuideLabels (labels) {
    const pool = this.guidesLabels
    while (pool.childNodes.length < labels.length) {
      const label = svgCanvas.createSVGElement({ element: 'g', attr: {} })
      label.append(
        svgCanvas.createSVGElement({ element: 'rect', attr: { height: LABEL_HEIGHT, rx: 3, ry: 3, style: GUIDE_FILL } }),
        svgCanvas.createSVGElement({
          element: 'text',
          attr: {
            'font-size': LABEL_FONT_SIZE,
            'font-family': LABEL_FONT_FAMILY,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            style: GUIDE_TEXT
          }
        })
      )
      pool.append(label)
    }
    Array.from(pool.childNodes).forEach((label, i) => {
      const item = labels[i]
      if (!item) {
        label.setAttribute('display', 'none')
        return
      }
      const [back, text] = label.childNodes
      if (text.textContent !== item.text) { text.textContent = item.text }
      const width = Math.ceil(measureText(item.text)) + 2 * LABEL_PADDING
      const center = item.start ? item.x + width / 2 : item.x
      back.setAttribute('x', center - width / 2)
      back.setAttribute('y', item.y - LABEL_HEIGHT / 2)
      back.setAttribute('width', width)
      text.setAttribute('x', center)
      text.setAttribute('y', item.y)
      label.removeAttribute('display')
    })
  }

  /**
  * Takes the guides away, at the end of a gesture or a measure.
  * @returns {void}
  */
  hideGuides () {
    if (this.guidesGroup && !this.guidesGroup.hasAttribute('display')) {
      this.guidesGroup.setAttribute('display', 'none')
    }
  }

  /**
  * Hides the dimension label.
  * @returns {void}
  */
  hideDimension () {
    if (this.dimensionLabel && !this.dimensionLabel.hasAttribute('display')) {
      this.dimensionLabel.setAttribute('display', 'none')
    }
  }

  /**
  * Keeps the common frame on a box during a gesture on the whole selection,
  * whatever the selectors' boxes; null releases it.
  * @param {module:utilities.BBoxObject|null} box - Screen coordinates
  * @returns {void}
  */
  lockFrame (box) {
    this.lockedFrame = box
  }

  /**
  * Turns the common frame and its grips during a rotation of the whole
  * selection; 0 puts them back on the axes.
  * @param {number} angle - Degrees
  * @param {{x: number, y: number}} [pivot] - Screen coordinates
  * @returns {void}
  */
  setFrameRotation (angle, pivot) {
    this.frameAngle = angle || 0
    this.framePivot = this.frameAngle ? pivot : null
    if (!this.frameAngle) {
      this.multiFrame?.removeAttribute('transform')
      if (this.multiGrips) {
        this.selectorGripsGroup?.removeAttribute('transform')
        Selector.updateGripCursors(0)
      }
    }
  }

  /**
  * Updates the common frame once the current task has finished: selectors are
  * resized one by one, the frame needs their union only once.
  * @returns {void}
  */
  scheduleFrameUpdate () {
    if (this.frameUpdatePending) { return }
    this.frameUpdatePending = true
    queueMicrotask(() => {
      this.frameUpdatePending = false
      this.updateMultiFrame()
    })
  }

  /**
  * Draws the common frame of a multi-selection and puts the resize grips on
  * it. Without a box, the frame is the union of the selectors' boxes, which
  * are already known: no geometry is read.
  * @param {module:utilities.BBoxObject} [box] - Frame in screen coordinates
  * @returns {void}
  */
  updateMultiFrame (box) {
    if (!this.multiFrame) { return }
    const selected = svgCanvas.getSelectedElements?.()?.filter(Boolean) || []
    if (selected.length < 2) {
      this.multiFrame.setAttribute('display', 'none')
      this.frameBox = null
      this.multiGrips = false
      return
    }
    if (!box && this.lockedFrame) {
      box = this.lockedFrame
    }
    if (!box) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      selected.forEach((elem) => {
        const sb = this.selectorMap[elem.id]?.screenBox
        if (!sb) { return }
        minX = Math.min(minX, sb.x)
        minY = Math.min(minY, sb.y)
        maxX = Math.max(maxX, sb.x + sb.width)
        maxY = Math.max(maxY, sb.y + sb.height)
      })
      if (minX === Infinity) { return }
      box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    this.frameBox = box
    const { x, y, width: w, height: h } = box
    this.multiFrame.setAttribute('d', `M${x},${y} L${x + w},${y} ${x + w},${y + h} ${x},${y + h}z`)
    this.multiFrame.removeAttribute('display')

    // The grips leave the selector that had them and go on the frame.
    this.selectors.forEach((selector) => {
      if (selector) { selector.hasGrips = false }
    })
    this.multiGrips = true
    if (this.selectorGripsGroup.parentNode !== this.selectorParentGroup) {
      this.selectorParentGroup.append(this.selectorGripsGroup)
      Selector.updateGripCursors(0)
    }
    this.showRotateGrip(true)
    // During a rotation, the frame and its grips turn about the pivot.
    const transform = this.frameAngle && this.framePivot
      ? `rotate(${this.frameAngle} ${this.framePivot.x} ${this.framePivot.y})`
      : null
    ;[this.multiFrame, this.selectorGripsGroup].forEach((element) => {
      if (transform) {
        element.setAttribute('transform', transform)
      } else {
        element.removeAttribute('transform')
      }
    })
    // The grip cursors stay as they are while the frame turns: the button is
    // down, and the frame is back on the axes once released.
    this.positionGrips({
      nw: [x, y],
      ne: [x + w, y],
      sw: [x, y + h],
      se: [x + w, y + h],
      n: [x + w / 2, y],
      w: [x, y + h / 2],
      e: [x + w, y + h / 2],
      s: [x + w / 2, y + h]
    })
    this.selectorGripsGroup.setAttribute('display', 'inline')
  }

  /**
  * Resets the parent selector group element.
  * @returns {void}
  */
  initGroup () {
    const dataStorage = svgCanvas.getDataStorage()
    // remove old selector parent group if it existed
    if (this.selectorParentGroup?.parentNode) {
      this.selectorParentGroup.remove()
    }

    // create parent selector group and add it to svgroot
    this.selectorParentGroup = svgCanvas.createSVGElement({
      element: 'g',
      attr: { id: 'selectorParentGroup' }
    })
    this.selectorGripsGroup = svgCanvas.createSVGElement({
      element: 'g',
      attr: { display: 'none' }
    })
    this.multiFrame = svgCanvas.createSVGElement({
      element: 'path',
      attr: {
        id: 'selectorMultiFrame',
        fill: 'none',
        stroke: SELECTION_COLOR,
        'stroke-width': 1,
        display: 'none',
        style: 'pointer-events:none'
      }
    })
    // Outline of the element a click would select (see showHover)
    this.hoverOutline = svgCanvas.createSVGElement({
      element: 'path',
      attr: {
        id: 'selectorHover',
        fill: 'none',
        stroke: SELECTION_COLOR,
        'stroke-width': 1,
        display: 'none',
        style: 'pointer-events:none'
      }
    })
    this.hoverTarget = null
    // Dimension label under the selection during a gesture (see showDimension)
    this.dimensionLabel = svgCanvas.createSVGElement({
      element: 'g',
      attr: { id: 'selectorDimension', display: 'none', style: 'pointer-events:none' }
    })
    this.dimensionBack = svgCanvas.createSVGElement({
      element: 'rect',
      attr: { height: LABEL_HEIGHT, rx: 3, ry: 3, fill: SELECTION_COLOR }
    })
    this.dimensionText = svgCanvas.createSVGElement({
      element: 'text',
      attr: {
        fill: '#fff',
        'font-size': LABEL_FONT_SIZE,
        'font-family': LABEL_FONT_FAMILY,
        'text-anchor': 'middle',
        'dominant-baseline': 'central'
      }
    })
    this.dimensionLabel.append(this.dimensionBack, this.dimensionText)
    this.selectorParentGroup.append(this.hoverOutline, this.multiFrame, this.selectorGripsGroup, this.dimensionLabel)
    svgCanvas.getSvgRoot().append(this.selectorParentGroup)
    this.multiGrips = false
    this.frameBox = null

    this.selectorMap = {}
    this.selectors = []
    this.rubberBandBox = null

    // Rotation zones just outside the four corners, below the resize hit
    // areas so that these win where both overlap.
    this.rotateFallbackCursor = `url(${svgCanvas.curConfig.imgPath}/rotate.svg) 12 12, auto`
    this.rotateZones = {}
    ;['nw', 'ne', 'se', 'sw'].forEach((dir) => {
      const zone = svgCanvas.createSVGElement({
        element: 'rect',
        attr: {
          id: `selectorGripZone_rotate_${dir}`,
          width: 0,
          height: 0,
          fill: 'none',
          'pointer-events': 'all'
        }
      })
      dataStorage.put(zone, 'dir', dir)
      dataStorage.put(zone, 'type', 'rotate')
      this.rotateZones[dir] = zone
      this.selectorGripsGroup.append(zone)
    })

    // add the corner grips: a visible square and, on top of it, a larger
    // transparent square that receives the pointer. Only the hit area takes
    // the pointer: on a small frame it moves outward (see positionGrips).
    this.selectorGripHits = {}
    Object.keys(this.selectorGrips).forEach((dir) => {
      const grip = svgCanvas.createSVGElement({
        element: 'rect',
        attr: {
          id: `selectorGrip_resize_${dir}`,
          width: GRIP_SIZE,
          height: GRIP_SIZE,
          fill: '#fff',
          stroke: SELECTION_COLOR,
          'stroke-width': 1,
          style: `cursor:${dir}-resize`,
          'pointer-events': 'none'
        }
      })
      const hit = svgCanvas.createSVGElement({
        element: 'rect',
        attr: {
          id: `selectorGripHit_resize_${dir}`,
          width: GRIP_HIT_SIZE,
          height: GRIP_HIT_SIZE,
          fill: 'none',
          style: `cursor:${dir}-resize`,
          'pointer-events': 'all'
        }
      })

      ;[grip, hit].forEach((element) => {
        dataStorage.put(element, 'dir', dir)
        dataStorage.put(element, 'type', 'resize')
      })
      this.selectorGrips[dir] = grip
      this.selectorGripHits[dir] = hit
      this.selectorGripsGroup.append(grip, hit)
    })

    // add rotator elems
    this.rotateGripConnector =
      svgCanvas.createSVGElement({
        element: 'line',
        attr: {
          id: ('selectorGrip_rotateconnector'),
          stroke: SELECTION_COLOR,
          'stroke-width': '1'
        }
      })
    this.selectorGripsGroup.append(this.rotateGripConnector)

    const rotateCursor = `cursor:url(${svgCanvas.curConfig.imgPath}/rotate.svg) 12 12, auto;`
    this.rotateGrip =
      svgCanvas.createSVGElement({
        element: 'circle',
        attr: {
          id: 'selectorGrip_rotate',
          fill: '#fff',
          r: gripRadius + 0.5,
          stroke: SELECTION_COLOR,
          'stroke-width': 1,
          style: rotateCursor
        }
      })
    this.rotateGripHit =
      svgCanvas.createSVGElement({
        element: 'circle',
        attr: {
          id: 'selectorGripHit_rotate',
          fill: 'none',
          r: GRIP_HIT_SIZE / 2,
          style: rotateCursor,
          'pointer-events': 'all'
        }
      })
    this.selectorGripsGroup.append(this.rotateGrip, this.rotateGripHit)
    dataStorage.put(this.rotateGrip, 'type', 'rotate')
    dataStorage.put(this.rotateGripHit, 'type', 'rotate')
    // New grips: their cursors are not set yet.
    this.cursorsApplied = false
    this.applyGripCursors(0)

    if (document.getElementById('canvasBackground')) { return }

    const [width, height] = svgCanvas.curConfig.dimensions
    const canvasbg = svgCanvas.createSVGElement({
      element: 'svg',
      attr: {
        id: 'canvasBackground',
        width,
        height,
        x: 0,
        y: 0,
        overflow: (isWebkit() ? 'none' : 'visible'), // Chrome 7 has a problem with this when zooming out
        style: 'pointer-events:none'
      }
    })

    const rect = svgCanvas.createSVGElement({
      element: 'rect',
      attr: {
        width: '100%',
        height: '100%',
        x: 0,
        y: 0,
        'stroke-width': 1,
        stroke: '#000',
        fill: '#FFF',
        style: 'pointer-events:none'
      }
    })
    canvasbg.append(rect)
    svgCanvas.getSvgRoot().insertBefore(canvasbg, svgCanvas.getSvgContent())
  }

  /**
  *
  * @param {Element} elem - DOM element to get the selector for
  * @param {module:utilities.BBoxObject} [bbox] - Optional bbox to use for reset (prevents duplicate getBBox call).
  * @param {boolean} [exactBBox=false] - The bbox comes from `Selector.getSelectionBBox`.
  * @returns {Selector} The selector based on the given element
  */
  requestSelector (elem, bbox, exactBBox = false) {
    if (!elem) { return null }

    const N = this.selectors.length
    // If we've already acquired one for this element, return it.
    if (typeof this.selectorMap[elem.id] === 'object') {
      this.selectorMap[elem.id].locked = true
      return this.selectorMap[elem.id]
    }
    for (let i = 0; i < N; ++i) {
      if (!this.selectors[i]?.locked) {
        this.selectors[i].locked = true
        this.selectors[i].reset(elem, bbox, exactBBox)
        this.selectorMap[elem.id] = this.selectors[i]
        return this.selectors[i]
      }
    }
    // if we reached here, no available selectors were found, we create one
    this.selectors[N] = new Selector(N, elem, bbox, exactBBox)
    this.selectorParentGroup.append(this.selectors[N].selectorGroup)
    this.selectorMap[elem.id] = this.selectors[N]
    return this.selectors[N]
  }

  /**
  * Removes the selector of the given element (hides selection box).
  *
  * @param {Element} elem - DOM element to remove the selector for
  * @returns {void}
  */
  releaseSelector (elem) {
    if (!elem) { return }
    const N = this.selectors.length
    const sel = this.selectorMap[elem.id]
    if (!sel?.locked) {
      // TODO(codedread): Ensure this exists in this module.
      warn('WARNING! selector was released but was already unlocked', null, 'select')
    }
    for (let i = 0; i < N; ++i) {
      if (this.selectors[i] && this.selectors[i] === sel) {
        delete this.selectorMap[elem.id]
        sel.locked = false
        sel.selectedElement = null
        sel.screenBox = null
        sel.showGrips(false)
        this.scheduleFrameUpdate()

        // remove from DOM and store reference in JS but only if it exists in the DOM
        try {
          sel.selectorGroup.setAttribute('display', 'none')
        } catch (e) { /* empty fn */ }

        break
      }
    }
  }

  /**
  * @returns {SVGRectElement} The rubberBandBox DOM element. This is the rectangle drawn by
  * the user for selecting/zooming
  */
  getRubberBandBox () {
    if (!this.rubberBandBox) {
      this.rubberBandBox =
        svgCanvas.createSVGElement({
          element: 'rect',
          attr: {
            id: 'selectorRubberBand',
            fill: SELECTION_COLOR,
            'fill-opacity': 0.08,
            stroke: SELECTION_COLOR,
            'stroke-width': 1,
            display: 'none',
            style: 'pointer-events:none'
          }
        })
      this.selectorParentGroup.append(this.rubberBandBox)
    }
    return this.rubberBandBox
  }
}

/**
 * An object that creates SVG elements for the canvas.
 *
 * @interface module:select.SVGFactory
 */
/**
 * @function module:select.SVGFactory#createSVGElement
 * @param {module:utilities.EditorContext#addSVGElementsFromJson} jsonMap
 * @returns {SVGElement}
 */
/**
 * @function module:select.SVGFactory#svgRoot
 * @returns {SVGSVGElement}
 */
/**
 * @function module:select.SVGFactory#svgContent
 * @returns {SVGSVGElement}
 */
/**
 * @function module:select.SVGFactory#getZoom
 * @returns {Float} The current zoom level
 */

/**
 * @typedef {GenericArray} module:select.Dimensions
 * @property {Integer} length 2
 * @property {Float} 0 Width
 * @property {Float} 1 Height
 */
/**
 * @typedef {PlainObject} module:select.Config
 * @property {string} imgPath
 * @property {module:select.Dimensions} dimensions
 */

// Export singleton instance for backward compatibility
const selectModule = new SelectModule()

/**
 * Initializes this module.
 * @function module:select.init
 * @param {module:select.Config} config - An object containing configurable parameters (imgPath)
 * @param {module:select.SVGFactory} svgFactory - An object implementing the SVGFactory interface.
 * @returns {void}
 */
export const init = (canvas) => {
  selectModule.init(canvas)
}

/**
 * @function module:select.getSelectorManager
 * @returns {module:select.SelectorManager} The SelectorManager instance.
 */
export const getSelectorManager = () => selectModule.getSelectorManager()
