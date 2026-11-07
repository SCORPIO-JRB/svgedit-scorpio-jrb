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

let svgCanvas
// change radius if touch screen
const gripRadius = window.ontouchstart ? 10 : 4
// Selection look: square grips with a white fill, a solid accent frame and a
// larger invisible area to grab each grip.
const SELECTION_COLOR = '#1e6fff'
const GRIP_SIZE = window.ontouchstart ? 20 : 8
const GRIP_HIT_SIZE = window.ontouchstart ? 32 : 16

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
    const dataStorage = svgCanvas.getDataStorage()
    const selectedBox = this.selectorRect
    const selected = this.selectedElement
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

    if (bbox) {
      // apply the transforms
      const l = bbox.x; const t = bbox.y; const w = bbox.width; const h = bbox.height
      // bbox = {x: l, y: t, width: w, height: h}; // Not in use

      // we need to handle temporary transforms too
      // if skewed, get its transformed box, then find its axis-aligned bbox

      // *
      offset *= zoom

      const nbox = transformBox(l * zoom, t * zoom, w * zoom, h * zoom, m)
      const { aabox } = nbox
      let nbax = aabox.x - offset
      let nbay = aabox.y - offset
      let nbaw = aabox.width + (offset * 2)
      let nbah = aabox.height + (offset * 2)
      // Axis-aligned box on screen, used for the common frame of a
      // multi-selection.
      this.screenBox = { x: nbax, y: nbay, width: nbaw, height: nbah }

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

      const dstr = `M${nbax},${nbay} L${nbax + nbaw},${nbay} ${nbax + nbaw},${nbay + nbah} ${nbax},${nbay + nbah}z`

      const xform = angle ? 'rotate(' + [angle, cx, cy].join(',') + ')' : ''

      // TODO(codedread): Is this needed?
      //  if (selected === selectedElements[0]) {
      this.gripCoords = {
        nw: [nbax, nbay],
        ne: [nbax + nbaw, nbay],
        sw: [nbax, nbay + nbah],
        se: [nbax + nbaw, nbay + nbah],
        n: [nbax + (nbaw) / 2, nbay],
        w: [nbax, nbay + (nbah) / 2],
        e: [nbax + nbaw, nbay + (nbah) / 2],
        s: [nbax + (nbaw) / 2, nbay + nbah]
      }
      selectedBox.setAttribute('d', dstr)
      // Unrotated selectors keep an empty transform: skip the redundant write.
      if (this.selectorGroup.getAttribute('transform') !== xform) {
        this.selectorGroup.setAttribute('transform', xform)
      }
      // The grips are shared by all selectors: only the selector that shows
      // them positions them (showGrips does it when they move to a selector).
      if (this.hasGrips) {
        this.updateGripPositions()
      }
      selectModule.getSelectorManager().scheduleFrameUpdate()
    }
  }

  // STATIC methods
  /**
  * Updates cursors for corner grips on rotation so arrows point the right way.
  * @param {Float} angle - Current rotation angle in degrees
  * @returns {void}
  */
  static updateGripCursors (angle) {
    const dirArr = Object.keys(selectModule.getSelectorManager().selectorGrips)
    let steps = Math.round(angle / 45)
    if (steps < 0) { steps += 8 }
    while (steps > 0) {
      dirArr.push(dirArr.shift())
      steps--
    }
    const mgr = selectModule.getSelectorManager()
    Object.keys(mgr.selectorGrips).forEach((dir, i) => {
      const style = `cursor:${dirArr[i]}-resize`
      mgr.selectorGrips[dir].setAttribute('style', style)
      mgr.selectorGripHits?.[dir]?.setAttribute('style', style)
    })
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
    Object.entries(gripCoords).forEach(([dir, [x, y]]) => {
      this.selectorGrips[dir].setAttribute('x', x - GRIP_SIZE / 2)
      this.selectorGrips[dir].setAttribute('y', y - GRIP_SIZE / 2)
      const hit = this.selectorGripHits?.[dir]
      if (hit) {
        hit.setAttribute('x', x - GRIP_HIT_SIZE / 2)
        hit.setAttribute('y', y - GRIP_HIT_SIZE / 2)
      }
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
  * Shows or hides the rotation grip, which a multi-selection does not have
  * yet (rotation of the whole selection comes with M3).
  * @param {boolean} show
  * @returns {void}
  */
  showRotateGrip (show) {
    ;[this.rotateGrip, this.rotateGripHit, this.rotateGripConnector].forEach((element) => {
      if (!element) { return }
      if (show) {
        element.removeAttribute('display')
      } else {
        element.setAttribute('display', 'none')
      }
    })
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
    this.showRotateGrip(false)
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
    this.selectorParentGroup.append(this.multiFrame, this.selectorGripsGroup)
    svgCanvas.getSvgRoot().append(this.selectorParentGroup)
    this.multiGrips = false
    this.frameBox = null

    this.selectorMap = {}
    this.selectors = []
    this.rubberBandBox = null

    // add the corner grips: a visible square and, on top of it, a larger
    // transparent square that receives the pointer
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
          'pointer-events': 'all'
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
