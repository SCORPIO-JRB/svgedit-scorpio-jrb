/**
 * Path functionality.
 * @module path
 * @license MIT
 *
 * @copyright 2011 Alexis Deveria, 2011 Jeff Schiller
 */

import { NS } from './namespaces.js'
import { shortFloat } from './units.js'
import { ChangeElementCommand, BatchCommand, RemoveElementCommand } from './history.js'
import {
  transformPoint, snapToAngle, rectsIntersect,
  transformListToTransform, getTransformList, getMatrix
} from './math.js'
import {
  readPath, writePath, nearestPoint, insertNode, nodeIndex, openEnds,
  transformSubpath, joinSubpaths, toCubic, bendCubic
} from './path-points.js'
import {
  assignAttributes, getElement, getRotationAngle, snapToGrid,
  getBBox, getPathDFromElement
} from './utilities.js'

let svgCanvas = null
let path = null

/**
 * Shift or Ctrl (Cmd on a Mac) add a node to the selection, or take it out
 * (lot Chemins, as in Vecta).
 * @param {MouseEvent} evt
 * @returns {boolean}
 */
const isAdditive = (evt) => Boolean(evt?.shiftKey || evt?.ctrlKey || evt?.metaKey)

/** Distance, in screen pixels, within which a click reaches a path or an end. */
const REACH = 6
/**
 * How far, in screen pixels, the pointer goes from a click of the pen before
 * the drag bends the segment: below, a hand that shakes leaves it straight.
 */
const BEND_AFTER = 4
/**
 * The shapes whose nodes the pen shows before they are paths (lot Plume):
 * the first change turns them into one.
 */
const PEN_SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])

/**
* @function module:path-actions.init
* @param {module:path-actions.svgCanvas} pathActionsContext
* @returns {void}
*/
export const init = (canvas) => {
  svgCanvas = canvas
}

/**
 * Convert a path to one with only absolute or relative values.
 * @todo move to pathActions.js
 * @function module:path.convertPath
 * @param {SVGPathElement} pth - the path to convert
 * @param {boolean} toRel - true of convert to relative
 * @returns {string}
 */
export const convertPath = (pth, toRel) => {
  const { pathSegList } = pth
  const len = pathSegList.numberOfItems
  let curx = 0; let cury = 0
  let d = ''
  let lastM = null

  for (let i = 0; i < len; ++i) {
    const seg = pathSegList.getItem(i)
    // if these properties are not in the segment, set them to zero
    let x = seg.x || 0
    let y = seg.y || 0
    let x1 = seg.x1 || 0
    let y1 = seg.y1 || 0
    let x2 = seg.x2 || 0
    let y2 = seg.y2 || 0

    // const type = seg.pathSegType;
    // const pathMap = svgCanvas.getPathMap();
    // let letter = pathMap[type][toRel ? 'toLowerCase' : 'toUpperCase']();
    let letter = seg.pathSegTypeAsLetter

    switch (letter) {
      case 'z': // z,Z closepath (Z/z)
      case 'Z':
        d += 'z'
        if (lastM) {
          curx = lastM[0]
          cury = lastM[1]
        }
        break
      case 'H': // absolute horizontal line (H)
        x -= curx
      // Fallthrough
      case 'h': // relative horizontal line (h)
        if (toRel) {
          y = 0
          curx += x
          letter = 'l'
        } else {
          y = cury
          x += curx
          curx = x
          letter = 'L'
        }
        // Convert to "line" for easier editing
        d += pathDSegment(letter, [[x, y]])
        break
      case 'V': // absolute vertical line (V)
        y -= cury
      // Fallthrough
      case 'v': // relative vertical line (v)
        if (toRel) {
          x = 0
          cury += y
          letter = 'l'
        } else {
          x = curx
          y += cury
          cury = y
          letter = 'L'
        }
        // Convert to "line" for easier editing
        d += pathDSegment(letter, [[x, y]])
        break
      case 'M': // absolute move (M)
      case 'L': // absolute line (L)
      case 'T': // absolute smooth quad (T)
        x -= curx
        y -= cury
      // Fallthrough
      case 'l': // relative line (l)
      case 'm': // relative move (m)
      case 't': // relative smooth quad (t)
        if (toRel) {
          curx += x
          cury += y
          letter = letter.toLowerCase()
        } else {
          x += curx
          y += cury
          curx = x
          cury = y
          letter = letter.toUpperCase()
        }
        if (letter === 'm' || letter === 'M') { lastM = [curx, cury] }

        d += pathDSegment(letter, [[x, y]])
        break
      case 'C': // absolute cubic (C)
        x -= curx; x1 -= curx; x2 -= curx
        y -= cury; y1 -= cury; y2 -= cury
      // Fallthrough
      case 'c': // relative cubic (c)
        if (toRel) {
          curx += x
          cury += y
          letter = 'c'
        } else {
          x += curx; x1 += curx; x2 += curx
          y += cury; y1 += cury; y2 += cury
          curx = x
          cury = y
          letter = 'C'
        }
        d += pathDSegment(letter, [[x1, y1], [x2, y2], [x, y]])
        break
      case 'Q': // absolute quad (Q)
        x -= curx; x1 -= curx
        y -= cury; y1 -= cury
      // Fallthrough
      case 'q': // relative quad (q)
        if (toRel) {
          curx += x
          cury += y
          letter = 'q'
        } else {
          x += curx; x1 += curx
          y += cury; y1 += cury
          curx = x
          cury = y
          letter = 'Q'
        }
        d += pathDSegment(letter, [[x1, y1], [x, y]])
        break
      case 'A':
        x -= curx
        y -= cury
      // fallthrough
      case 'a': // relative elliptical arc (a)
        if (toRel) {
          curx += x
          cury += y
          letter = 'a'
        } else {
          x += curx
          y += cury
          curx = x
          cury = y
          letter = 'A'
        }
        d += pathDSegment(letter, [[seg.r1, seg.r2]], [
          seg.angle,
          (seg.largeArcFlag ? 1 : 0),
          (seg.sweepFlag ? 1 : 0)
        ], [x, y])
        break
      case 'S': // absolute smooth cubic (S)
        x -= curx; x2 -= curx
        y -= cury; y2 -= cury
      // Fallthrough
      case 's': // relative smooth cubic (s)
        if (toRel) {
          curx += x
          cury += y
          letter = 's'
        } else {
          x += curx; x2 += curx
          y += cury; y2 += cury
          curx = x
          cury = y
          letter = 'S'
        }
        d += pathDSegment(letter, [[x2, y2], [x, y]])
        break
    } // switch on path segment type
  } // for each segment
  return d
}

/**
 * TODO: refactor callers in `convertPath` to use `getPathDFromSegments` instead of this function.
 * Legacy code refactored from `svgcanvas.pathActions.convertPath`.
 * @param {string} letter - path segment command (letter in potentially either case from {@link module:path.pathMap}; see [SVGPathSeg#pathSegTypeAsLetter]{@link https://www.w3.org/TR/SVG/single-page.html#paths-__svg__SVGPathSeg__pathSegTypeAsLetter})
 * @param {GenericArray<GenericArray<Integer>>} points - x,y points
 * @param {GenericArray<GenericArray<Integer>>} [morePoints] - x,y points
 * @param {Integer[]} [lastPoint] - x,y point
 * @returns {string}
 */
const pathDSegment = (letter, points, morePoints, lastPoint) => {
  const parts = [
    letter + points.map(pnt => shortFloat(pnt)).join(' '),
    morePoints ? morePoints.join(' ') : null,
    lastPoint ? shortFloat(lastPoint) : null
  ].filter(Boolean)
  return parts.join(' ')
}

/**
* Group: Path edit functions.
* Functions relating to editing path elements.
* @class PathActions
* @memberof module:path
*/
class PathActions {
  #subpath = false
  #newPoint = null
  #firstCtrl = null
  #currentPath = null
  #hasMoved = false
  /** A node was added by Alt+click at mouse down (lot Chemins). */
  #added = false
  /** Nodes kept selected by a rubber band drawn with Shift or Ctrl. */
  #rubberBase = null
  /** The end of an open path the drawing extends: {elem, sub, end}. */
  #extend = null
  /** The path the last drawing merged into, put in node editing at mouse up. */
  #merged = null
  /** The path a click of the pen has just ended, put in node editing at mouse up. */
  #finished = null
  /** Points of the drawing taken back by Ctrl+Z, that Ctrl+Y puts back. */
  #undonePoints = []
  /** Where the drag of a node started, for Shift (in screen units). */
  #dragOrigin = null
  /** Where the pen was pressed (screen units), and whether the drag bends. */
  #downAt = null
  #bending = false
  /**
   * The pen is the tool (lot Plume, as in Illustrator): in node editing, a
   * click deletes a node, adds one on a side, goes on from an end, or starts
   * a new path elsewhere; Alt bends a side.
   */
  #pen = false
  /** What the click of the pen in node editing does at mouse up. */
  #penGesture = null
  /** A shape whose nodes the pen shows: it becomes a path at the first change. */
  #penShape = null
  /** That conversion, recorded with the change that follows, as one step. */
  #conversion = null
  #convertedFrom = null
  /** The pointer last seen by the pen, for Alt pressed or released in place. */
  #penPointer = null
  #keysHeard = false

  /**
  * This function converts a polyline (created by the fh_path tool) into
  * a path element and coverts every three line segments into a single bezier
  * curve in an attempt to smooth out the free-hand.
  * @function smoothPolylineIntoPath
  * @param {Element} element
  * @returns {Element}
  * @private
  */
  #smoothPolylineIntoPath = (element) => {
    const { points } = element
    const N = points.numberOfItems
    if (N >= 4) {
      // loop through every 3 points and convert to a cubic bezier curve segment
      //
      // NOTE: this is cheating, it means that every 3 points has the potential to
      // be a corner instead of treating each point in an equal manner. In general,
      // this technique does not look that good.
      //
      // I am open to better ideas!
      //
      // Reading:
      // - http://www.efg2.com/Lab/Graphics/Jean-YvesQueinecBezierCurves.htm
      // - https://www.codeproject.com/KB/graphics/BezierSpline.aspx?msg=2956963
      // - https://www.ian-ko.com/ET_GeoWizards/UserGuide/smooth.htm
      // - https://www.cs.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/Bezier/bezier-der.html
      let curpos = points.getItem(0)
      let prevCtlPt = null
      let d = []
      d.push(`M${curpos.x},${curpos.y} C`)
      let i
      for (i = 1; i <= (N - 4); i += 3) {
        let ct1 = points.getItem(i)
        const ct2 = points.getItem(i + 1)
        const end = points.getItem(i + 2)

        // if the previous segment had a control point, we want to smooth out
        // the control points on both sides
        if (prevCtlPt) {
          const newpts = svgCanvas.smoothControlPoints(prevCtlPt, ct1, curpos)
          if (newpts?.length === 2) {
            const prevArr = d[d.length - 1].split(',')
            prevArr[2] = newpts[0].x
            prevArr[3] = newpts[0].y
            d[d.length - 1] = prevArr.join(',')
            ct1 = newpts[1]
          }
        }

        d.push([ct1.x, ct1.y, ct2.x, ct2.y, end.x, end.y].join(','))

        curpos = end
        prevCtlPt = ct2
      }
      // handle remaining line segments
      d.push('L')
      while (i < N) {
        const pt = points.getItem(i)
        d.push([pt.x, pt.y].join(','))
        i++
      }
      d = d.join(' ')

      element = svgCanvas.addSVGElementsFromJson({
        element: 'path',
        curStyles: true,
        attr: {
          id: svgCanvas.getId(),
          d,
          fill: 'none'
        }
      })
      // No need to call "changed", as this is already done under mouseUp
    }
    return element
  }

  /** Open ends of each path, read again only when its d or transform change. */
  #endsCache = new WeakMap()

  /**
   * The end of an open path within reach of a point, that the pen can extend
   * or join (lot Chemins): a path of the layer or group being edited, shown,
   * not locked and not a connector.
   * @param {Float} x In user units of the drawing
   * @param {Float} y
   * @param {{elem: Element, sub: Integer, end: string}} [skip] An end not to
   *   find, the one the drawing starts from
   * @returns {{elem: SVGPathElement, sub: Integer, end: 'start'|'end', x: Float, y: Float}|null}
   */
  #openEndAt (x, y, skip) {
    const context = svgCanvas.getCurrentGroup?.() || svgCanvas.getCurrentDrawing?.()?.getCurrentLayer?.()
    if (!context?.children) return null
    const reach = (REACH + 2) / svgCanvas.getZoom()
    const drawn = svgCanvas.getDrawnPath?.()
    let best = null
    for (const elem of context.children) {
      if (elem.tagName !== 'path' || elem === drawn || elem.getAttribute('display') === 'none') continue
      if (svgCanvas.isLocked?.(elem) || elem.hasAttributeNS(NS.SE, 'connector')) continue
      const d = elem.getAttribute('d')
      const transform = elem.getAttribute('transform')
      let cached = this.#endsCache.get(elem)
      if (cached?.d !== d || cached?.transform !== transform) {
        const m = getMatrix(elem)
        const ends = openEnds(readPath(d)).map((end) => ({ ...end, ...transformPoint(end.x, end.y, m) }))
        cached = { d, transform, ends }
        this.#endsCache.set(elem, cached)
      }
      for (const end of cached.ends) {
        if (skip?.elem === elem && skip.sub === end.sub && skip.end === end.end) continue
        const distance = Math.hypot(end.x - x, end.y - y)
        if (distance <= reach && (!best || distance < best.distance)) best = { elem, ...end, distance }
      }
    }
    return best
  }

  /**
   * Shows, in the pen tool, the end of an open path that a click there
   * would extend or join, and returns it (lot Chemins).
   * @param {Float} x In user units of the drawing
   * @param {Float} y
   * @returns {{elem: SVGPathElement, sub: Integer, end: string, x: Float, y: Float}|null}
   */
  showEndAt (x, y) {
    const hit = svgCanvas.getCurrentMode() === 'path' && !this.#subpath
      ? this.#openEndAt(x, y, this.#extend)
      : null
    let hint = getElement('path_end_hint')
    if (!hit) {
      hint?.setAttribute('display', 'none')
      return null
    }
    if (!hint) {
      hint = document.createElementNS(NS.SVG, 'circle')
      assignAttributes(hint, {
        id: 'path_end_hint',
        r: 7,
        fill: 'none',
        'stroke-width': 2,
        style: 'stroke: var(--se-guide, #e0115f); pointer-events: none'
      })
      getElement('selectorParentGroup').append(hint)
    }
    const zoom = svgCanvas.getZoom()
    assignAttributes(hint, { cx: hit.x * zoom, cy: hit.y * zoom, display: 'inline' })
    return hit
  }

  /**
   * Puts the drawing in the path it extends, or joins with the end it ends
   * on, in one undo step (lot Chemins). The drawing itself is removed: it
   * never entered the history.
   * @param {SVGPathElement} drawnElem The drawing, in user units
   * @param {{elem: SVGPathElement, sub: Integer, end: string}|null} target
   *   The end of an open path the drawing ends on
   * @returns {SVGPathElement} The path that holds the result
   */
  #commitJoin (drawnElem, target) {
    const source = this.#extend
    this.#extend = null
    const survivor = source?.elem ?? target.elem
    const toLocal = getMatrix(survivor).inverse()
    const [drawnInUser] = readPath(drawnElem.getAttribute('d'))
    const drawn = transformSubpath(drawnInUser, toLocal)
    const subpaths = readPath(survivor.getAttribute('d'))
    // Ending on the other end of the path it extends closes it.
    const close = Boolean(source && target && target.elem === source.elem && target.sub === source.sub)
    let targetSub = null
    let targetSubpaths = null
    if (target && !close) {
      if (target.elem === survivor) {
        targetSub = subpaths[target.sub]
      } else {
        targetSubpaths = readPath(target.elem.getAttribute('d'))
        targetSub = transformSubpath(targetSubpaths[target.sub], toLocal.multiply(getMatrix(target.elem)))
      }
    }
    const own = source ? source.sub : target.sub
    subpaths[own] = joinSubpaths({
      drawn,
      source: source ? subpaths[source.sub] : null,
      sourceEnd: source?.end,
      target: targetSub,
      targetEnd: target?.end,
      close
    })
    // Another subpath of the same path, now inside the joined one.
    if (source && targetSub && target.elem === survivor) subpaths.splice(target.sub, 1)

    // Two paths, or two parts of one, become one; otherwise a path grows.
    const batch = new BatchCommand(source && targetSub ? 'Join paths' : 'Extend path')
    const oldD = survivor.getAttribute('d')
    survivor.setAttribute('d', writePath(subpaths, shortFloat))
    batch.addSubCommand(new ChangeElementCommand(survivor, { d: oldD }))
    if (targetSubpaths) {
      const other = target.elem
      targetSubpaths.splice(target.sub, 1)
      if (targetSubpaths.length) {
        const otherD = other.getAttribute('d')
        other.setAttribute('d', writePath(targetSubpaths, shortFloat))
        batch.addSubCommand(new ChangeElementCommand(other, { d: otherD }))
      } else {
        const { nextSibling, parentNode } = other
        svgCanvas.removePath_(other.id)
        other.remove()
        batch.addSubCommand(new RemoveElementCommand(other, nextSibling, parentNode))
      }
    }

    getElement('path_stretch_line')?.remove()
    getElement('path_end_hint')?.setAttribute('display', 'none')
    svgCanvas.getCurrentDrawing?.()?.releaseId?.(drawnElem.id)
    svgCanvas.removePath_(drawnElem.id)
    drawnElem.remove()
    svgCanvas.setDrawnPath(null)
    svgCanvas.setStarted(false)
    this.#firstCtrl = null
    // Its nodes changed: the next node editing reads them again.
    svgCanvas.removePath_(survivor.id)
    svgCanvas.addCommandToHistory(batch)
    svgCanvas.call('changed', [survivor])
    this.#merged = survivor
    return survivor
  }

  /**
  * @param {MouseEvent} evt
  * @param {Element} mouseTarget
  * @param {Float} startX
  * @param {Float} startY
  * @returns {boolean|void}
  */
  mouseDown (evt, mouseTarget, startX, startY) {
    let id
    // A shape whose nodes the pen shows: a click on one of them, or on a
    // side, makes it a path and works on it (lot Plume).
    if (svgCanvas.getCurrentMode() === 'path' && this.#penShape && !svgCanvas.getDrawnPath() &&
      this.#shapeDown(evt, mouseTarget, startX, startY)) {
      return undefined
    }
    if (svgCanvas.getCurrentMode() === 'path') {
      if (this.#pen) this.#setCursor('draw')
      let mouseX = startX // Was this meant to work with the other `mouseX`? (was defined globally so adding `let` to at least avoid a global)
      let mouseY = startY // Was this meant to work with the other `mouseY`? (was defined globally so adding `let` to at least avoid a global)

      const zoom = svgCanvas.getZoom()
      let x = mouseX / zoom
      let y = mouseY / zoom
      let stretchy = getElement('path_stretch_line')
      // Shift keeps the new segment at a multiple of 45°: the angle then wins
      // over the ends of paths.
      const angled = evt.shiftKey && Boolean(svgCanvas.getDrawnPath())
      // The end of an open path under the pointer (lot Chemins): a drawing
      // started there extends that path; one ended there joins it.
      const end = this.#subpath || angled ? null : this.#openEndAt(x, y, this.#extend)

      if (svgCanvas.getGridSnapping()) {
        x = snapToGrid(x)
        y = snapToGrid(y)
        mouseX = snapToGrid(mouseX)
        mouseY = snapToGrid(mouseY)
      }
      // The point a drag from here bends the segment to: the one placed, so
      // after the grid and the angle (else a slight drag during the click
      // bent the segment to the raw point, off the angle).
      this.#newPoint = [x, y]
      if (!svgCanvas.getDrawnPath()) {
        this.#extend = end ? { elem: end.elem, sub: end.sub, end: end.end } : null
      }
      if (end) {
        // Exactly on the end.
        x = end.x
        y = end.y
        mouseX = x * zoom
        mouseY = y * zoom
        this.#newPoint = [x, y]
        getElement('path_end_hint')?.setAttribute('display', 'none')
      }

      if (!stretchy) {
        stretchy = document.createElementNS(NS.SVG, 'path')
        // The segment that follows the pointer, in the blue of the nodes.
        assignAttributes(stretchy, {
          id: 'path_stretch_line',
          class: 'se-pen-line',
          stroke: '#1e66b6',
          'stroke-width': 1,
          fill: 'none',
          style: 'pointer-events:none'
        })
        getElement('selectorParentGroup').append(stretchy)
      }
      stretchy.setAttribute('display', 'inline')
      this.#downAt = [mouseX, mouseY]
      this.#bending = false

      let keep = null
      let index
      // if pts array is empty, create path element with M at current point
      const drawnPath = svgCanvas.getDrawnPath()
      if (!drawnPath) {
        const dAttr = `M${x},${y} `
        this.#undonePoints = []
        /* drawnPath = */ svgCanvas.setDrawnPath(svgCanvas.addSVGElementsFromJson({
          element: 'path',
          curStyles: true,
          attr: {
            d: dAttr,
            id: svgCanvas.getNextId(),
            opacity: svgCanvas.getOpacity() / 2
          }
        }))
        if (this.#extend) {
          // The drawing looks like the path it extends, which it joins.
          const style = globalThis.getComputedStyle?.(this.#extend.elem)
          if (style) {
            assignAttributes(svgCanvas.getDrawnPath(), {
              stroke: style.stroke, 'stroke-width': style.strokeWidth, fill: 'none'
            })
          }
        }
        // set stretchy line to first point
        stretchy.setAttribute('d', `M${mouseX} ${mouseY} ${mouseX} ${mouseY}`)
        index = this.#subpath ? path.segs.length : 0
        svgCanvas.addPointGrip(index, mouseX, mouseY)
      } else if (end) {
        // The drawing ends on the end of an open path: a last segment to it,
        // as the stretchy line draws it, then the two are joined.
        const seglist = drawnPath.pathSegList
        const sSeg = stretchy.pathSegList.getItem(1)
        seglist.appendItem(sSeg.pathSegType === 4
          ? drawnPath.createSVGPathSegLinetoAbs(end.x, end.y)
          : drawnPath.createSVGPathSegCurvetoCubicAbs(end.x, end.y, sSeg.x1 / zoom, sSeg.y1 / zoom, end.x, end.y))
        this.#commitJoin(drawnPath, end)
        return false
      } else {
        // determine if we clicked on an existing point
        const seglist = drawnPath.pathSegList
        let i = seglist.numberOfItems
        const FUZZ = 6 / zoom
        let clickOnPoint = false
        while (i) {
          i--
          const item = seglist.getItem(i)
          const px = item.x; const py = item.y
          // found a matching point
          if (x >= (px - FUZZ) && x <= (px + FUZZ) &&
              y >= (py - FUZZ) && y <= (py + FUZZ)
          ) {
            clickOnPoint = true
            break
          }
        }

        // The path element being created: the drawing itself, not the
        // element of the latest id, which a reused id makes another one.
        const newpath = drawnPath
        id = newpath.id

        // Remove previous path object if previously created
        svgCanvas.removePath_(id)
        let newseg
        let sSeg
        const len = seglist.numberOfItems
        // if we clicked on an existing point, then we are done this path, commit it
        // (i, i+1) are the x,y that were clicked on
        if (clickOnPoint) {
          // No segment to bend by dragging from here.
          this.#newPoint = null
          // if clicked on any other point but the first OR
          // the first point was clicked on and there are less than 3 points
          // then leave the path open
          // otherwise, close the path
          if (this.#extend) {
            // A click on a point of the drawing ends the extension, open.
            if (len < 2) { return false }
            stretchy.remove()
            this.#commitJoin(drawnPath, null)
            return false
          } else if (i === 0 && len >= 3) {
            // Create end segment
            const absX = seglist.getItem(0).x
            const absY = seglist.getItem(0).y

            sSeg = stretchy.pathSegList.getItem(1)
            newseg = sSeg.pathSegType === 4
              ? drawnPath.createSVGPathSegLinetoAbs(absX, absY)
              : drawnPath.createSVGPathSegCurvetoCubicAbs(absX, absY, sSeg.x1 / zoom, sSeg.y1 / zoom, absX, absY)

            const endseg = drawnPath.createSVGPathSegClosePath()
            seglist.appendItem(newseg)
            seglist.appendItem(endseg)
          } else if (len < 2) {
            keep = false
            return keep
          }
          stretchy.remove()

          // This will signal to commit the path
          // const element = newpath; // Other event handlers define own `element`, so this was probably not meant to interact with them or one which shares state (as there were none); I therefore adding a missing `var` to avoid a global
          this.#undonePoints = []
          /* drawnPath = */ svgCanvas.setDrawnPath(null)
          svgCanvas.setStarted(false)

          if (this.#subpath) {
            if (path.matrix) {
              svgCanvas.remapElement(newpath, {}, path.matrix.inverse())
            }

            const newD = newpath.getAttribute('d')
            const origD = path.elem.getAttribute('d')
            path.elem.setAttribute('d', origD + newD)
            newpath.parentNode.removeChild(newpath)
            if (path.matrix) {
              svgCanvas.recalcRotatedPath()
            }
            pathActionsMethod.toEditMode(path.elem)
            path.selectPt()
            return false
          }
          // The path ended: the mouse up puts it in node editing.
          this.#finished = newpath
          // else, create a new point, update path element
        } else {
          // Checks if current target or parents are #svgcontent
          if (!(svgCanvas.getContainer() !== svgCanvas.getMouseTarget(evt) && svgCanvas.getContainer().contains(
            svgCanvas.getMouseTarget(evt)
          ))) {
            // Clicked outside canvas, so don't make point
            this.#newPoint = null
            return false
          }

          const num = drawnPath.pathSegList.numberOfItems
          const last = drawnPath.pathSegList.getItem(num - 1)
          const lastx = last.x; const lasty = last.y

          if (evt.shiftKey) {
            const xya = snapToAngle(lastx, lasty, x, y);
            ({ x, y } = xya)
          }

          // Use the segment defined by stretchy
          sSeg = stretchy.pathSegList.getItem(1)
          newseg = sSeg.pathSegType === 4
            ? drawnPath.createSVGPathSegLinetoAbs(svgCanvas.round(x), svgCanvas.round(y))
            : drawnPath.createSVGPathSegCurvetoCubicAbs(
              svgCanvas.round(x),
              svgCanvas.round(y),
              sSeg.x1 / zoom,
              sSeg.y1 / zoom,
              sSeg.x2 / zoom,
              sSeg.y2 / zoom
            )

          drawnPath.pathSegList.appendItem(newseg)
          this.#undonePoints = []
          this.#newPoint = [svgCanvas.round(x), svgCanvas.round(y)]

          x *= zoom
          y *= zoom

          // set stretchy line to latest point
          stretchy.setAttribute('d', ['M', x, y, x, y].join(' '))
          index = num
          if (this.#subpath) { index += path.segs.length }
          svgCanvas.addPointGrip(index, x, y)
        }
        // keep = true;
      }

      return undefined
    }

    // TODO: Make sure currentPath isn't null at this point
    if (!path) { return undefined }

    path.storeD()
    const additive = isAdditive(evt)
    this.#added = false
    this.#rubberBase = null
    this.#dragOrigin = [startX, startY]
    this.#penGesture = null
    // The pen (lot Plume): Ctrl or Cmd leave the nodes to be selected and
    // moved as without it.
    if (this.#pen && !evt.ctrlKey && !evt.metaKey && this.#penDown(evt, mouseTarget, startX, startY)) {
      return undefined
    }

    ({ id } = evt.target)
    let curPt
    if (id.startsWith('pathpointgrip_')) {
      // Select this point
      curPt = path.cur_pt = Number.parseInt(id.slice(14))
      path.dragging = [startX, startY]
      const seg = path.segs[curPt]

      // only clear selection if neither Shift nor Ctrl is pressed
      // (otherwise, add node to selection or take it out)
      if (!additive) {
        if (path.selected_pts.length <= 1 || !seg.selected) {
          path.clearSelection()
        }
        path.addPtsToSelection(curPt)
      } else if (seg.selected) {
        path.removePtFromSelection(curPt)
      } else {
        path.addPtsToSelection(curPt)
      }
    } else if (id.startsWith('ctrlpointgrip_')) {
      path.dragging = [startX, startY]

      const parts = id.split('_')[1].split('c')
      curPt = Number(parts[0])
      const ctrlNum = Number(parts[1])
      path.selectPt(curPt, ctrlNum)
    } else if (evt.altKey) {
      // Alt+click on the outline adds a node there, the shape unchanged; it
      // can be dragged at once (lot Chemins).
      const zoom = svgCanvas.getZoom()
      const index = this.addPointAt(startX / zoom, startY / zoom, { record: false })
      if (index !== null) {
        this.#added = true
        path.cur_pt = index
        path.dragging = [startX, startY]
      }
    }

    // Start selection box
    if (!path.dragging) {
      // With Shift or Ctrl, the band adds to the nodes already selected.
      this.#rubberBase = additive ? [...path.selected_pts] : null
      let rubberBox = svgCanvas.getRubberBox()
      if (!rubberBox) {
        rubberBox = svgCanvas.setRubberBox(
          svgCanvas.selectorManager.getRubberBandBox()
        )
      }
      const zoom = svgCanvas.getZoom()
      assignAttributes(rubberBox, {
        x: startX * zoom,
        y: startY * zoom,
        width: 0,
        height: 0,
        display: 'inline'
      }, 100)
    }
    return undefined
  }

  /**
    * @param {Float} mouseX
    * @param {Float} mouseY
    * @returns {void}
    */
  mouseMove (mouseX, mouseY, { shift = false } = {}) {
    const rawX = mouseX
    const rawY = mouseY
    const zoom = svgCanvas.getZoom()
    this.#hasMoved = true
    const drawnPath = svgCanvas.getDrawnPath()
    if (svgCanvas.getCurrentMode() === 'path') {
      const seglist = drawnPath?.pathSegList
      const index = drawnPath ? seglist.numberOfItems - 1 : -1
      // Shift: the line from the last point, or the handle being pulled
      // from the point just placed, keeps a multiple of 45°, as the click
      // will place it.
      const origin = !shift || !drawnPath
        ? null
        : this.#newPoint ?? [seglist.getItem(index).x, seglist.getItem(index).y]
      if (origin) {
        ({ x: mouseX, y: mouseY } = snapToAngle(origin[0] * zoom, origin[1] * zoom, mouseX, mouseY))
      }
      // The end of an open path within reach attracts the line (lot Chemins).
      const end = this.#newPoint || origin ? null : this.showEndAt(mouseX / zoom, mouseY / zoom)
      if (origin) getElement('path_end_hint')?.setAttribute('display', 'none')
      if (end) {
        mouseX = end.x * zoom
        mouseY = end.y * zoom
      }
      if (!drawnPath) { return }

      if (this.#newPoint) {
        // A slight move during the click leaves the segment straight: the
        // handles come out once the pointer is a few pixels away.
        if (!this.#bending) {
          if (this.#downAt && Math.hypot(rawX - this.#downAt[0], rawY - this.#downAt[1]) < BEND_AFTER) return
          this.#bending = true
        }
        // First point
        // if (!index) { return; }

        // Set control points
        const pointGrip1 = svgCanvas.addCtrlGrip('1c1')
        const pointGrip2 = svgCanvas.addCtrlGrip('0c2')

        // dragging pointGrip1
        pointGrip1.setAttribute('cx', mouseX)
        pointGrip1.setAttribute('cy', mouseY)
        pointGrip1.setAttribute('display', 'inline')

        const ptX = this.#newPoint[0]
        const ptY = this.#newPoint[1]

        // set curve
        // const seg = seglist.getItem(index);
        const curX = mouseX / zoom
        const curY = mouseY / zoom
        const altX = (ptX + (ptX - curX))
        const altY = (ptY + (ptY - curY))

        pointGrip2.setAttribute('cx', altX * zoom)
        pointGrip2.setAttribute('cy', altY * zoom)
        pointGrip2.setAttribute('display', 'inline')

        const ctrlLine = svgCanvas.getCtrlLine(1)
        assignAttributes(ctrlLine, {
          x1: mouseX,
          y1: mouseY,
          x2: altX * zoom,
          y2: altY * zoom,
          display: 'inline'
        })

        if (index === 0) {
          this.#firstCtrl = [mouseX, mouseY]
        } else {
          const last = seglist.getItem(index - 1)
          let lastX = last.x
          let lastY = last.y

          if (last.pathSegType === 6) {
            lastX += (lastX - last.x2)
            lastY += (lastY - last.y2)
          } else if (this.#firstCtrl) {
            lastX = this.#firstCtrl[0] / zoom
            lastY = this.#firstCtrl[1] / zoom
          }
          svgCanvas.replacePathSeg(6, index, [ptX, ptY, lastX, lastY, altX, altY], drawnPath)
        }
      } else {
        const stretchy = getElement('path_stretch_line')
        if (stretchy) {
          const prev = seglist.getItem(index)
          if (prev.pathSegType === 6) {
            const prevX = prev.x + (prev.x - prev.x2)
            const prevY = prev.y + (prev.y - prev.y2)
            svgCanvas.replacePathSeg(
              6,
              1,
              [mouseX, mouseY, prevX * zoom, prevY * zoom, mouseX, mouseY],
              stretchy
            )
          } else if (this.#firstCtrl) {
            svgCanvas.replacePathSeg(6, 1, [mouseX, mouseY, this.#firstCtrl[0], this.#firstCtrl[1], mouseX, mouseY], stretchy)
          } else {
            svgCanvas.replacePathSeg(4, 1, [mouseX, mouseY], stretchy)
          }
        }
      }
      return
    }
    // Alt and the pen bend a side (lot Plume).
    if (this.#penGesture?.kind === 'bend') {
      this.#bendTo(mouseX, mouseY)
      return
    }
    // if we are dragging a point, let's move it
    if (path.dragging) {
      if (shift && this.#dragOrigin) {
        // Shift: the move from where the drag started keeps 45° steps.
        ({ x: mouseX, y: mouseY } = snapToAngle(this.#dragOrigin[0], this.#dragOrigin[1], mouseX, mouseY))
      }
      const pt = svgCanvas.getPointFromGrip({
        x: path.dragging[0],
        y: path.dragging[1]
      }, path)
      const mpt = svgCanvas.getPointFromGrip({
        x: mouseX,
        y: mouseY
      }, path)
      const diffX = mpt.x - pt.x
      const diffY = mpt.y - pt.y
      path.dragging = [mouseX, mouseY]

      if (path.dragctrl) {
        path.moveCtrl(diffX, diffY)
      } else {
        path.movePts(diffX, diffY)
      }
    } else {
      const base = this.#rubberBase ?? []
      path.selected_pts = []
      path.eachSeg(function (_i) {
        const seg = this
        if (!seg.next && !seg.prev) return

        // const {item} = seg;
        const rubberBox = svgCanvas.getRubberBox()
        const rbb = getBBox(rubberBox)

        const pt = svgCanvas.getGripPt(seg)
        const ptBb = {
          x: pt.x,
          y: pt.y,
          width: 0,
          height: 0
        }

        const sel = rectsIntersect(rbb, ptBb) || base.includes(seg.index)

        this.select(sel)
        // Note that addPtsToSelection is not being run
        if (sel) { path.selected_pts.push(seg.index) }
      })
    }
  }

  /**
     * @typedef module:path.keepElement
     * @type {PlainObject}
     * @property {boolean} keep
     * @property {Element} element
     */
  /**
    * @param {Event} evt
    * @param {Element} element
    * @param {Float} _mouseX
    * @param {Float} _mouseY
    * @returns {module:path.keepElement|void}
    */
  mouseUp (evt, element, _mouseX, _mouseY) {
    const drawnPath = svgCanvas.getDrawnPath()
    // Create mode
    if (svgCanvas.getCurrentMode() === 'path') {
      this.#newPoint = null
      if (this.#merged) {
        // As after a drawing, the nodes of the result are edited.
        const merged = this.#merged
        this.#merged = null
        svgCanvas.setStarted(false)
        pathActionsMethod.toEditMode(merged)
        return { keep: false, element: null }
      }
      if (!drawnPath) {
        element = this.#finished ?? getElement(svgCanvas.getId())
        svgCanvas.setStarted(false)
        this.#firstCtrl = null
      }
      this.#finished = null

      return {
        keep: true,
        element
      }
    }

    // Edit mode. A shape the pen made a path at mouse down: its conversion
    // and the change make one undo step (lot Plume).
    if (this.#conversion) {
      this.#withConversion(() => this.#editUp(evt))
    } else {
      this.#editUp(evt)
    }
    return undefined
  }

  /**
   * The mouse up of node editing.
   * @param {MouseEvent} evt
   * @returns {void}
   */
  #editUp (evt) {
    // The click of the pen (lot Plume).
    const gesture = this.#penGesture
    this.#penGesture = null
    if (gesture) {
      this.#hasMoved = false
      if (gesture.kind === 'delete') this.#deleteNode(gesture.index)
      else if (gesture.kind === 'bend') this.#bendEnd(gesture)
      return
    }
    const rubberBox = svgCanvas.getRubberBox()
    if (path.dragging) {
      const lastPt = path.cur_pt

      path.dragging = false
      path.dragctrl = false
      path.update()

      if (this.#hasMoved || this.#added) {
        path.endChanges(this.#added ? 'Add path point' : 'Move path point(s)')
      }

      if (!isAdditive(evt) && !this.#hasMoved) {
        path.selectPt(lastPt)
      }
      this.#added = false
    } else if (rubberBox?.getAttribute('display') !== 'none') {
      // Done with multi-node-select
      rubberBox.setAttribute('display', 'none')

      if (rubberBox.getAttribute('width') <= 2 && rubberBox.getAttribute('height') <= 2) {
        if (evt.target === path.elem) {
          // A click on the path edited keeps the editing of its nodes: it
          // only unselects them, as the stroke itself is not selected here
          // (lot Chemins). Shift or Ctrl keep them.
          if (!this.#rubberBase) {
            path.clearSelection()
            path.addPtsToSelection([])
          }
        } else if (!this.#rubberBase) {
          // A click beside the path leaves node editing, unless Shift or
          // Ctrl ask to keep the selection of nodes.
          pathActionsMethod.toSelectMode(evt.target)
        }
      } else {
        // The editor learns which nodes the band selected.
        path.addPtsToSelection([])
      }
      this.#rubberBase = null

      // else, move back to select mode
    } else {
      pathActionsMethod.toSelectMode(evt.target)
    }
    this.#hasMoved = false
  }

  /**
    * @param {Element} element
    * @returns {void}
    */
  toEditMode (element) {
    path = svgCanvas.getPath_(element)
    svgCanvas.setCurrentMode('pathedit')
    svgCanvas.clearSelection()
    path.setPathContext()
    path.show(true).update()
    path.oldbbox = getBBox(path.elem)
    this.#subpath = false
  }

  /**
    * @param {Element} elem
    * @fires module:svgcanvas.SvgCanvas#event:selected
    * @returns {void}
    */
  toSelectMode (elem) {
    const selPath = (elem === path.elem)
    svgCanvas.setCurrentMode('select')
    path.setPathContext()
    path.show(false)
    this.#currentPath = false
    svgCanvas.clearSelection()

    if (path.matrix) {
      // Rotated, so may need to re-calculate the center
      svgCanvas.recalcRotatedPath()
    }

    if (selPath) {
      svgCanvas.call('selected', [elem])
      svgCanvas.addToSelection([elem], true)
    }
  }

  // -------------------------------------------------------------------------
  // The pen on a path or a shape (lot Plume, as in Illustrator)

  /**
   * The pen is chosen: the path selected, or the one whose nodes were being
   * edited, goes to node editing; a shape shows the nodes it would have as a
   * path. Elsewhere the pen draws, as before.
   * @param {Element|null} [edited] The path whose nodes were being edited
   * @returns {void}
   */
  penChosen (edited) {
    this.#pen = true
    this.#listenToKeys()
    this.#dropShape()
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    const elem = edited ?? (selected.length === 1 ? selected[0] : null)
    if (elem && this.#penEditable(elem)) {
      if (elem.tagName === 'path') {
        this.#penEdit(elem)
      } else {
        svgCanvas.clearSelection()
        this.#penShape = elem
        this.#drawShape()
      }
    }
    this.#setCursor('draw')
  }

  /**
   * Another tool than the pen.
   * @returns {void}
   */
  penLeft () {
    this.#pen = false
    this.#penGesture = null
    this.#dropShape()
    this.#setCursor(null)
  }

  /**
   * @returns {boolean} Whether the pen is the tool
   */
  isPen () {
    return this.#pen
  }

  /**
   * Ends node editing without the selection mode, for another tool, and
   * gives the path edited (lot Plume). Going through the selection mode
   * chose the Select tool back, over the one clicked.
   * @returns {SVGPathElement|null}
   */
  endNodeEditing () {
    if (svgCanvas.getCurrentMode() !== 'pathedit' || !path) return null
    path.setPathContext()
    path.show(false)
    if (path.matrix) svgCanvas.recalcRotatedPath()
    this.#currentPath = false
    return path.elem?.isConnected ? path.elem : null
  }

  /**
   * Escape with the pen: node editing ends, or the nodes of a shape go away;
   * the pen stays the tool (lot Plume).
   * @returns {boolean} Whether there was something to leave
   */
  leaveNodes () {
    if (!this.#pen) return false
    if (svgCanvas.getCurrentMode() === 'pathedit') {
      this.#leaveNodes()
      return true
    }
    if (this.#penShape) {
      this.#dropShape()
      return true
    }
    return false
  }

  /**
   * Undo or redo: the nodes of a shape are no longer shown, as the step may
   * change or remove it (lot Plume).
   * @returns {void}
   */
  dropPenShape () {
    this.#dropShape()
  }

  /**
   * After an undo or redo with the pen: the nodes of the path or shape the
   * step changed are shown again, the pen still the tool (lot Plume).
   * @param {Element[]} targets The elements of the step
   * @returns {boolean} Whether the pen is the tool
   */
  penAfterHistory (targets) {
    if (!this.#pen) return false
    if (svgCanvas.getCurrentMode() === 'pathedit') this.endNodeEditing()
    svgCanvas.setCurrentMode('path')
    this.#dropShape()
    const elem = targets.length === 1 ? targets[0] : null
    if (elem && this.#penEditable(elem)) {
      if (elem.tagName === 'path') {
        this.#penEdit(elem)
      } else {
        svgCanvas.clearSelection()
        this.#penShape = elem
        this.#drawShape()
      }
    } else {
      svgCanvas.clearSelection()
    }
    this.#setCursor('draw')
    return true
  }

  /**
   * Shows with the cursor what a click of the pen does there (lot Plume): a
   * minus on a node, a plus on a side, the bend of the side with Alt.
   * @param {MouseEvent|object} evt
   * @returns {void}
   */
  penHover (evt) {
    if (!this.#pen) return
    const { clientX, clientY, target, ctrlKey, metaKey } = evt
    this.#penPointer = { clientX, clientY, target, ctrlKey, metaKey }
    let kind = 'draw'
    if (svgCanvas.getCurrentMode() === 'pathedit' && (ctrlKey || metaKey)) {
      // Ctrl or Cmd: the nodes are selected and moved as without the pen.
      kind = 'handle'
    } else {
      const hit = this.#penHit(evt)
      if (hit?.kind === 'node') kind = 'remove'
      else if (hit?.kind === 'side') kind = evt.altKey ? 'bend' : 'add'
      else if (hit?.kind === 'handle') kind = 'handle'
    }
    this.#setCursor(kind)
  }

  /**
   * Escape during a click of the pen: the path as it was, and a shape made a
   * path for the click a shape again (lot Plume).
   * @returns {boolean} Whether there was such a click
   */
  cancelPen () {
    if (!this.#pen || svgCanvas.getCurrentMode() !== 'pathedit' || !path) return false
    const gesture = this.#penGesture
    if (!gesture && !this.#added) return false
    this.#penGesture = null
    if (gesture?.kind !== 'delete') {
      path.dragging = false
      this.#added = false
      path.elem.setAttribute('d', path.last_d)
      path.init().update()
    }
    this.#hasMoved = false
    const conversion = this.#conversion
    if (conversion) {
      const shape = this.#convertedFrom
      this.#conversion = null
      this.#convertedFrom = null
      const { id } = path.elem
      this.#leaveNodes()
      conversion.unapply()
      svgCanvas.removePath_(id)
      if (shape?.isConnected) {
        this.#penShape = shape
        this.#drawShape()
      }
    }
    return true
  }

  /**
   * The path whose last segment the pen deleted goes, in the same undo step
   * as its nodes; the pen stays the tool (lot Plume).
   * @returns {void}
   */
  removeEditedPath () {
    const { elem } = path
    const batch = new BatchCommand('Delete path node(s)')
    batch.addSubCommand(new ChangeElementCommand(elem, { d: path.last_d }))
    path.show(false)
    const { nextSibling, parentNode } = elem
    svgCanvas.removePath_(elem.id)
    elem.remove()
    batch.addSubCommand(new RemoveElementCommand(elem, nextSibling, parentNode))
    this.#currentPath = false
    svgCanvas.setCurrentMode('path')
    svgCanvas.clearSelection()
    this.#setCursor('draw')
    svgCanvas.addCommandToHistory(batch)
    svgCanvas.call('changed', [elem])
  }

  /**
   * Whether the pen shows the nodes of an element when chosen with it.
   * @param {Element} elem
   * @returns {boolean}
   */
  #penEditable (elem) {
    if (!elem?.isConnected || elem.getAttribute('display') === 'none') return false
    if (svgCanvas.isLocked?.(elem) || elem.hasAttributeNS(NS.SE, 'connector')) return false
    return elem.tagName === 'path' || PEN_SHAPES.has(elem.tagName)
  }

  /**
   * Node editing of a path with the pen, no node selected: a click works on
   * the node or side under it.
   * @param {SVGPathElement} elem
   * @returns {void}
   */
  #penEdit (elem) {
    svgCanvas.removePath_(elem.id)
    this.toEditMode(elem)
    path.clearSelection()
    path.addPtsToSelection([])
  }

  /**
   * Node editing ends, the pen ready for a new path.
   * @returns {void}
   */
  #leaveNodes () {
    this.endNodeEditing()
    svgCanvas.setCurrentMode('path')
    svgCanvas.clearSelection()
    this.#setCursor('draw')
  }

  /**
   * Alt pressed or released with the pointer still: the cursor follows.
   * @returns {void}
   */
  #listenToKeys () {
    if (this.#keysHeard) return
    this.#keysHeard = true
    const onKey = (e) => {
      // Escape with Alt still held during a bend: the editor hears Alt+Escape,
      // a key of no command.
      if (e.key === 'Escape' && e.type === 'keydown' && this.#penGesture && svgCanvas.getStarted()) {
        svgCanvas.cancelGesture?.()
        return
      }
      if (e.key !== 'Alt' || !this.#pen || !this.#penPointer || svgCanvas.getStarted()) return
      this.penHover({ ...this.#penPointer, altKey: e.type === 'keydown' })
    }
    globalThis.addEventListener?.('keydown', onKey)
    globalThis.addEventListener?.('keyup', onKey)
  }

  /**
   * The cursor of the pen, drawn by the editor's style sheet.
   * @param {'draw'|'add'|'remove'|'bend'|'handle'|null} kind
   * @returns {void}
   */
  #setCursor (kind) {
    const container = svgCanvas.getContainer?.()
    if (!container?.dataset) return
    if (kind) container.dataset.pen = kind
    else delete container.dataset.pen
  }

  /**
   * The point of the drawing under the pointer.
   * @param {MouseEvent|object} evt
   * @returns {{x: Float, y: Float}|null}
   */
  #userPoint (evt) {
    const m = getElement('svgcontent')?.querySelector('g')?.getScreenCTM?.()
    return m ? transformPoint(evt.clientX, evt.clientY, m.inverse()) : null
  }

  /**
   * What the pen is over: a node of the path in node editing, or of the
   * shape shown, an end of an open one, a handle, or a side.
   * @param {MouseEvent|object} evt
   * @returns {{kind: 'node'|'end'|'handle'|'side', index?: Integer, x: Float, y: Float}|null}
   */
  #penHit (evt) {
    if (svgCanvas.getDrawnPath()) return null
    const pt = this.#userPoint(evt)
    if (!pt) return null
    // The handle of a corner (lot Coins) rounds it, as without the pen.
    if (evt.target?.closest?.('#selectorCornerGrips')) return { kind: 'handle', x: pt.x, y: pt.y }
    const mode = svgCanvas.getCurrentMode()
    if (mode === 'pathedit') {
      if (!path?.elem?.isConnected) return null
      const id = evt.target?.id ?? ''
      if (id.startsWith('ctrlpointgrip_')) return { kind: 'handle', x: pt.x, y: pt.y }
      const index = id.startsWith('pathpointgrip_') ? Number(id.slice(14)) : this.#gripAt(pt)
      const seg = index === null ? null : path.segs[index]
      if (seg?.ptgrip) return { kind: seg.prev && seg.next ? 'node' : 'end', index, x: pt.x, y: pt.y }
      return this.#outlineAt(path.elem, pt.x, pt.y) ? { kind: 'side', x: pt.x, y: pt.y } : null
    }
    if (mode === 'path' && this.#penShape) {
      if (!this.#penShape.isConnected) {
        this.#dropShape()
        return null
      }
      const node = this.#shapeNodeAt(pt)
      if (node) return { kind: node.end ? 'end' : 'node', x: pt.x, y: pt.y }
      const d = getPathDFromElement(this.#penShape)
      return d && this.#outlineAt(this.#penShape, pt.x, pt.y, d) ? { kind: 'side', x: pt.x, y: pt.y } : null
    }
    return null
  }

  /**
   * The node of the path in node editing within reach of a point.
   * @param {{x: Float, y: Float}} pt In user units of the drawing
   * @returns {Integer|null}
   */
  #gripAt (pt) {
    const zoom = svgCanvas.getZoom()
    let best = null
    path.segs.forEach((seg, i) => {
      if (!seg.ptgrip || seg.ptgrip.getAttribute('display') === 'none') return
      const g = svgCanvas.getGripPt(seg)
      const distance = Math.hypot(g.x - pt.x * zoom, g.y - pt.y * zoom)
      if (distance <= REACH + 2 && (!best || distance < best.distance)) best = { i, distance }
    })
    return best?.i ?? null
  }

  /**
   * The nodes the shape shown would have as a path, in user units.
   * @returns {{x: Float, y: Float, end: boolean}[]}
   */
  #shapeNodes () {
    const elem = this.#penShape
    const d = elem && getPathDFromElement(elem)
    if (!d) return []
    const m = getMatrix(elem)
    const nodes = []
    for (const sub of readPath(d)) {
      // A closed subpath ends on its start: one node there.
      const points = sub.closed ? sub.segs : [sub, ...sub.segs]
      points.forEach((p, i) => {
        const end = !sub.closed && (i === 0 || i === points.length - 1)
        nodes.push({ ...transformPoint(p.x, p.y, m), end })
      })
    }
    return nodes
  }

  /**
   * The node of the shape shown within reach of a point.
   * @param {{x: Float, y: Float}} pt In user units of the drawing
   * @returns {{x: Float, y: Float, end: boolean}|null}
   */
  #shapeNodeAt (pt) {
    const zoom = svgCanvas.getZoom()
    let best = null
    for (const node of this.#shapeNodes()) {
      const distance = Math.hypot(node.x - pt.x, node.y - pt.y) * zoom
      if (distance <= REACH + 2 && (!best || distance < best.distance)) best = { ...node, distance }
    }
    return best
  }

  /**
   * Draws the nodes of the shape shown, as those of node editing.
   * @returns {void}
   */
  #drawShape () {
    let group = getElement('pen_shape_nodes')
    if (!this.#penShape) {
      group?.remove()
      return
    }
    if (!group) {
      group = document.createElementNS(NS.SVG, 'g')
      assignAttributes(group, { id: 'pen_shape_nodes', style: 'pointer-events:none' })
      getElement('selectorParentGroup').append(group)
    }
    const zoom = svgCanvas.getZoom()
    group.replaceChildren(...this.#shapeNodes().map((node) => {
      const circle = document.createElementNS(NS.SVG, 'circle')
      assignAttributes(circle, {
        class: 'se-node',
        cx: node.x * zoom,
        cy: node.y * zoom,
        r: 4,
        fill: '#fff',
        stroke: '#1e66b6',
        'stroke-width': 1.5
      })
      return circle
    }))
  }

  /**
   * The shape no longer shows its nodes.
   * @returns {void}
   */
  #dropShape () {
    this.#penShape = null
    getElement('pen_shape_nodes')?.remove()
  }

  /**
   * A click of the pen on the shape shown: on a node or a side, the shape
   * becomes a path, in node editing, and the click works on it. Elsewhere,
   * a new path starts.
   * @param {MouseEvent} evt
   * @param {Element} mouseTarget
   * @param {Float} startX
   * @param {Float} startY
   * @returns {boolean} Whether the click was taken
   */
  #shapeDown (evt, mouseTarget, startX, startY) {
    const hit = evt.ctrlKey || evt.metaKey ? null : this.#penHit(evt)
    const shape = this.#penShape
    this.#dropShape()
    if (!hit) return false
    const converted = this.#convertShape(shape)
    if (!converted) return false
    svgCanvas.removePath_(converted.id)
    this.toEditMode(converted)
    this.mouseDown(evt, mouseTarget, startX, startY)
    return true
  }

  /**
   * Turns a shape into a path, the step kept until the change that follows.
   * @param {Element} shape
   * @returns {SVGPathElement|null}
   */
  #convertShape (shape) {
    let captured = null
    const own = Object.prototype.hasOwnProperty.call(svgCanvas, 'addCommandToHistory')
    const add = svgCanvas.addCommandToHistory
    let converted = null
    svgCanvas.addCommandToHistory = (cmd) => { captured = cmd }
    try {
      converted = svgCanvas.convertToPath(shape)
    } finally {
      if (own) svgCanvas.addCommandToHistory = add
      else delete svgCanvas.addCommandToHistory
    }
    if (!converted || !captured) {
      captured?.unapply()
      return null
    }
    this.#conversion = captured
    this.#convertedFrom = shape
    return converted
  }

  /**
   * The conversion of a shape, recorded alone.
   * @returns {void}
   */
  #flushConversion () {
    const conversion = this.#conversion
    this.#conversion = null
    this.#convertedFrom = null
    if (!conversion) return
    svgCanvas.addCommandToHistory(conversion)
    svgCanvas.call('changed', conversion.elements())
  }

  /**
   * Runs a change, recorded with the conversion of the shape it works on as
   * one undo step, named after the change.
   * @param {() => void} fn
   * @returns {void}
   */
  #withConversion (fn) {
    const conversion = this.#conversion
    this.#conversion = null
    this.#convertedFrom = null
    const steps = []
    const own = Object.prototype.hasOwnProperty.call(svgCanvas, 'addCommandToHistory')
    const add = svgCanvas.addCommandToHistory
    svgCanvas.addCommandToHistory = (cmd) => { steps.push(cmd) }
    try {
      fn()
    } finally {
      if (own) svgCanvas.addCommandToHistory = add
      else delete svgCanvas.addCommandToHistory
    }
    if (!steps.length) {
      svgCanvas.addCommandToHistory(conversion)
      svgCanvas.call('changed', conversion.elements())
      return
    }
    const batch = new BatchCommand(steps.at(-1).getText())
    batch.addSubCommand(conversion)
    steps.forEach((cmd) => batch.addSubCommand(cmd))
    svgCanvas.addCommandToHistory(batch)
    // The editor learns of the step: the change was told before it was in
    // the history.
    svgCanvas.call('changed', batch.elements())
  }

  /**
   * A click of the pen in node editing: a node is deleted at mouse up, a
   * side gets a node (that a drag moves) or, with Alt, bends; an end goes
   * on; elsewhere a new path starts.
   * @param {MouseEvent} evt
   * @param {Element} mouseTarget
   * @param {Float} startX
   * @param {Float} startY
   * @returns {boolean} Whether the pen took the click
   */
  #penDown (evt, mouseTarget, startX, startY) {
    const hit = this.#penHit(evt)
    switch (hit?.kind) {
      case 'handle':
        return false
      case 'node':
        this.#penGesture = { kind: 'delete', index: hit.index }
        return true
      case 'side': {
        if (evt.altKey) {
          if (!this.#bendStart(hit, startX, startY)) this.#penGesture = { kind: 'none' }
          return true
        }
        const index = this.addPointAt(hit.x, hit.y, { record: false })
        if (index === null) {
          this.#penGesture = { kind: 'none' }
          return true
        }
        this.#added = true
        path.cur_pt = index
        path.dragging = [startX, startY]
        return true
      }
      default:
        // An end goes on, as the pen extends a path; elsewhere, a new path.
        // A shape made a path for the click stays one, a step of its own.
        this.#flushConversion()
        this.#leaveNodes()
        this.mouseDown(evt, mouseTarget, startX, startY)
        return true
    }
  }

  /**
   * Deletes a node clicked with the pen.
   * @param {Integer} index
   * @returns {void}
   */
  #deleteNode (index) {
    if (!path?.segs[index]) return
    path.clearSelection()
    path.addPtsToSelection(index)
    this.deletePathNode()
  }

  /**
   * Alt and the pen on a side: the side becomes a cubic curve, which the
   * drag bends through the pointer.
   * @param {{x: Float, y: Float}} hit In user units of the drawing
   * @param {Float} startX In screen units
   * @param {Float} startY
   * @returns {boolean} False when the point is not on the outline
   */
  #bendStart (hit, startX, startY) {
    const { elem } = path
    const found = this.#outlineAt(elem, hit.x, hit.y)
    if (!found) return false
    const { subpaths, hit: at } = found
    const sub = subpaths[at.sub]
    const p0 = at.seg ? sub.segs[at.seg - 1] : sub
    const curved = sub.segs[at.seg].type === 'C'
    const cubic = toCubic(p0, sub.segs[at.seg])
    sub.segs[at.seg] = cubic
    elem.setAttribute('d', writePath(subpaths, shortFloat))
    const index = nodeIndex(subpaths, at.sub, at.seg)
    path.init().update()
    if (path.segs[index]?.ptgrip) path.addPtsToSelection(index)
    const im = getMatrix(elem).inverse()
    const zoom = svgCanvas.getZoom()
    const from = transformPoint(startX / zoom, startY / zoom, im)
    this.#penGesture = { kind: 'bend', subpaths, sub: at.sub, seg: at.seg, t: at.t, p0, cubic, im, from, index, curved, moved: false }
    return true
  }

  /**
   * The side bent through the pointer.
   * @param {Float} mouseX In screen units
   * @param {Float} mouseY
   * @returns {void}
   */
  #bendTo (mouseX, mouseY) {
    const g = this.#penGesture
    const zoom = svgCanvas.getZoom()
    const p = transformPoint(mouseX / zoom, mouseY / zoom, g.im)
    g.subpaths[g.sub].segs[g.seg] = bendCubic(g.p0, g.cubic, g.t, p.x - g.from.x, p.y - g.from.y)
    path.elem.setAttribute('d', writePath(g.subpaths, shortFloat))
    path.init().update()
    if (path.segs[g.index]?.ptgrip) path.addPtsToSelection(g.index)
    g.moved = true
  }

  /**
   * The end of the bend: one undo step. A click that did not drag makes a
   * straight side a curve all the same, its course unchanged, with its two
   * handles to pull; a side already curved stays as it was.
   * @param {object} g
   * @returns {void}
   */
  #bendEnd (g) {
    const unchanged = !g.moved && g.curved
    if (unchanged) path.elem.setAttribute('d', path.last_d)
    path.init().update()
    if (unchanged) return
    if (path.segs[g.index]?.ptgrip) path.addPtsToSelection(g.index)
    path.endChanges('Bend segment')
  }

  /**
    * @param {boolean} on
    * @returns {void}
    */
  addSubPath (on) {
    if (on) {
      // Internally we go into "path" mode, but in the UI it will
      // still appear as if in "pathedit" mode.
      svgCanvas.setCurrentMode('path')
      this.#subpath = true
    } else {
      pathActionsMethod.clear(true)
      pathActionsMethod.toEditMode(path.elem)
    }
  }

  /**
    * @param {Element} target
    * @returns {void}
    */
  select (target) {
    if (this.#currentPath === target) {
      pathActionsMethod.toEditMode(target)
      svgCanvas.setCurrentMode('pathedit')
      // going into pathedit mode
    } else {
      this.#currentPath = target
    }
  }

  /**
    * @fires module:svgcanvas.SvgCanvas#event:changed
    * @returns {void}
    */
  reorient () {
    const elem = svgCanvas.getSelectedElements()[0]
    if (!elem) { return }
    if (elem.nodeName !== 'path') { return }
    const angl = getRotationAngle(elem)
    if (angl === 0) { return }

    const batchCmd = new BatchCommand('Reorient path')
    const changes = {
      d: elem.getAttribute('d'),
      transform: elem.getAttribute('transform')
    }
    batchCmd.addSubCommand(new ChangeElementCommand(elem, changes))
    svgCanvas.clearSelection()
    this.resetOrientation(elem)

    svgCanvas.addCommandToHistory(batchCmd)

    // Set matrix to null
    svgCanvas.getPath_(elem).show(false).matrix = null

    this.clear()

    svgCanvas.addToSelection([elem], true)
    svgCanvas.call('changed', svgCanvas.getSelectedElements())
  }

  /**
    * @param {boolean} remove Not in use
    * @returns {void}
    */
  clear () {
    const drawnPath = svgCanvas.getDrawnPath()
    this.#currentPath = null
    this.#extend = null
    this.#merged = null
    this.#finished = null
    this.#undonePoints = []
    getElement('path_end_hint')?.setAttribute('display', 'none')
    if (drawnPath) {
      // The drawing itself: the element of the latest id may be another one
      // (a reused id), and an undo may have taken the drawing out of the
      // document with its layer or group. Either made this throw.
      getElement('path_stretch_line')?.remove()
      drawnPath.remove()
      const pathpointgripContainer = getElement('pathpointgrip_container')
      for (const el of pathpointgripContainer?.querySelectorAll('*') ?? []) {
        el.setAttribute('display', 'none')
      }
      this.#firstCtrl = null
      this.#newPoint = null
      svgCanvas.setDrawnPath(null)
      svgCanvas.setStarted(false)
    } else if (svgCanvas.getCurrentMode() === 'pathedit') {
      // With the pen, node editing ends and the pen stays the tool, after an
      // undo too (lot Plume).
      if (this.#pen) this.#leaveNodes()
      else this.toSelectMode()
    }
    if (path) { path.init().show(false) }
  }

  /**
   * Whether a path is being drawn with the pen.
   * @returns {boolean}
   */
  isDrawing () {
    return svgCanvas.getCurrentMode() === 'path' && Boolean(svgCanvas.getDrawnPath())
  }

  /**
   * Hides the handles of the point last placed, and puts the line that
   * follows the pointer back on the last point of the drawing.
   * @param {SVGPathElement} drawnPath
   * @returns {void}
   */
  #afterPointChange (drawnPath) {
    const zoom = svgCanvas.getZoom()
    for (const id of ['ctrlpointgrip_1c1', 'ctrlpointgrip_0c2', 'ctrlLine_1']) {
      getElement(id)?.setAttribute('display', 'none')
    }
    const seglist = drawnPath.pathSegList
    const last = seglist.getItem(seglist.numberOfItems - 1)
    const x = last.x * zoom
    const y = last.y * zoom
    getElement('path_stretch_line')?.setAttribute('d', `M${x} ${y} ${x} ${y}`)
    svgCanvas.removePath_(drawnPath.id)
  }

  /**
   * Takes back the last point of the path being drawn, or the drawing itself
   * when only its first point is left (lot Chemins). The history is left as
   * it is: the drawing enters it only when it ends.
   * @returns {boolean} Whether a drawing was in progress
   */
  undoDrawnPoint () {
    if (!this.isDrawing()) return false
    const drawnPath = svgCanvas.getDrawnPath()
    const seglist = drawnPath.pathSegList
    const count = seglist.numberOfItems
    // Adding a subpath, the grips of the path edited come first.
    const offset = this.#subpath && path ? path.segs.length : 0
    if (count <= 1) {
      getElement('path_stretch_line')?.remove()
      getElement('path_end_hint')?.setAttribute('display', 'none')
      for (const id of [`pathpointgrip_${offset}`, 'ctrlpointgrip_1c1', 'ctrlpointgrip_0c2', 'ctrlLine_1']) {
        getElement(id)?.setAttribute('display', 'none')
      }
      svgCanvas.removePath_(drawnPath.id)
      drawnPath.remove()
      this.#firstCtrl = null
      this.#newPoint = null
      this.#extend = null
      this.#undonePoints = []
      svgCanvas.setDrawnPath(null)
      svgCanvas.setStarted(false)
      return true
    }
    this.#undonePoints.push(seglist.getItem(count - 1))
    seglist.removeItem(count - 1)
    getElement(`pathpointgrip_${count - 1 + offset}`)?.setAttribute('display', 'none')
    this.#afterPointChange(drawnPath)
    return true
  }

  /**
   * Puts back the last point Ctrl+Z took back from the drawing.
   * @returns {boolean} Whether a drawing was in progress
   */
  redoDrawnPoint () {
    if (!this.isDrawing()) return false
    const seg = this.#undonePoints.pop()
    if (!seg) return true
    const drawnPath = svgCanvas.getDrawnPath()
    const seglist = drawnPath.pathSegList
    const offset = this.#subpath && path ? path.segs.length : 0
    const zoom = svgCanvas.getZoom()
    svgCanvas.addPointGrip(seglist.numberOfItems + offset, seg.x * zoom, seg.y * zoom)
    seglist.appendItem(seg)
    this.#afterPointChange(drawnPath)
    return true
  }

  /**
    * @param {?(Element|SVGPathElement)} pth
    * @returns {false|void}
    */
  resetOrientation (pth) {
    if (pth?.nodeName !== 'path') { return false }
    const tlist = getTransformList(pth)
    const m = transformListToTransform(tlist).matrix
    tlist.clear()
    pth.removeAttribute('transform')
    const segList = pth.pathSegList

    // Opera/win/non-EN throws an error here.
    // TODO: Find out why!
    // Presumed fixed in Opera 10.5, so commented out for now

    // try {
    const len = segList.numberOfItems
    // } catch(err) {
    //   const fixed_d = pathActions.convertPath(pth);
    //   pth.setAttribute('d', fixed_d);
    //   segList = pth.pathSegList;
    //   const len = segList.numberOfItems;
    // }
    // let lastX, lastY;
    for (let i = 0; i < len; ++i) {
      const seg = segList.getItem(i)
      const type = seg.pathSegType
      if (type === 1) { continue }
      const pts = []
      for (const n of ['', 1, 2]) {
        const x = seg['x' + n]
        const y = seg['y' + n]
        if (x !== undefined && y !== undefined) {
          const pt = transformPoint(x, y, m)
          pts.push(pt.x, pt.y)
        }
      }
      svgCanvas.replacePathSeg(type, i, pts, pth)
    }

    svgCanvas.reorientGrads(pth, m)
    return undefined
  }

  /**
    * @returns {void}
    */
  zoomChange () {
    if (svgCanvas.getCurrentMode() === 'pathedit') {
      path.update()
    }
    // The nodes of a shape the pen shows (lot Plume).
    if (this.#penShape) this.#drawShape()
  }

  /**
    * @typedef {PlainObject} module:path.NodePoint
    * @property {Float} x
    * @property {Float} y
    * @property {Integer} type
    */
  /**
    * @returns {module:path.NodePoint}
    */
  getNodePoint () {
    const selPt = path.selected_pts.length ? path.selected_pts[0] : 1

    const seg = path.segs[selPt]
    return {
      x: seg.item.x,
      y: seg.item.y,
      type: seg.type
    }
  }

  /**
    * @param {boolean} linkPoints
    * @returns {void}
    */
  linkControlPoints (linkPoints) {
    svgCanvas.setLinkControlPoints(linkPoints)
  }

  /**
   * Adds a node to the path in node editing where its outline passes near a
   * point, the shape unchanged (Alt+click, lot Chemins). The new node is the
   * only one selected.
   * @param {Float} x In user units of the drawing
   * @param {Float} y
   * @param {object} [options]
   * @param {boolean} [options.record=true] Add the step to the history; at
   *   mouse down, the mouse up records it with the drag that may follow
   * @returns {Integer|null} Index of the new node, null when the point is
   *   not on the outline or is on a node already
   */
  addPointAt (x, y, { record = true } = {}) {
    const elem = path?.elem
    const found = elem && this.#outlineAt(elem, x, y)
    if (!found) return null
    const { subpaths, hit } = found
    if (!insertNode(subpaths, hit.sub, hit.seg, hit.t)) return null
    if (record) path.storeD()
    elem.setAttribute('d', writePath(subpaths, shortFloat))
    const index = nodeIndex(subpaths, hit.sub, hit.seg)
    path.init().update()
    path.clearSelection()
    path.addPtsToSelection(index)
    if (record) path.endChanges('Add path point')
    return index
  }

  /**
   * The point of the outline of a path within reach of a point.
   * @param {SVGPathElement} elem
   * @param {Float} x In user units of the drawing
   * @param {Float} y
   * @param {string} [d] Its outline, for a shape that is not yet a path
   * @returns {{subpaths: object[], hit: object}|null}
   */
  #outlineAt (elem, x, y, d = elem.getAttribute('d')) {
    const m = getMatrix(elem)
    const local = transformPoint(x, y, m.inverse())
    const subpaths = readPath(d)
    const hit = nearestPoint(subpaths, local)
    if (!hit) return null
    const onCanvas = transformPoint(hit.x, hit.y, m)
    const zoom = svgCanvas.getZoom()
    const stroke = Number.parseFloat(globalThis.getComputedStyle?.(elem).strokeWidth) || 0
    const reach = Math.max(REACH / zoom, stroke / 2 + 2 / zoom)
    return Math.hypot(onCanvas.x - x, onCanvas.y - y) <= reach ? { subpaths, hit } : null
  }

  /**
   * Alt+click on a selected path: node editing, with a node added where the
   * click is (lot Chemins).
   * @param {SVGPathElement} elem
   * @param {Float} x In user units of the drawing
   * @param {Float} y
   * @returns {boolean} False when the click is not on the outline
   */
  addPointOnPath (elem, x, y) {
    if (!this.#outlineAt(elem, x, y)) return false
    svgCanvas.removePath_(elem.id)
    this.toEditMode(elem)
    return this.addPointAt(x, y) !== null
  }

  /**
   * Moves the selected nodes, as the arrow keys do (lot Chemins).
   * @param {Float} dx In user units of the drawing
   * @param {Float} dy
   * @returns {boolean} Whether there were nodes to move
   */
  moveSelectedPoints (dx, dy) {
    if (!path?.selected_pts.length) return false
    path.storeD()
    // A turned path moves its nodes along the axes of the drawing.
    const im = getMatrix(path.elem).inverse()
    path.movePts(im.a * dx + im.c * dy, im.b * dx + im.d * dy)
    path.update()
    path.endChanges('Move path point(s)')
    return true
  }

  /**
    * @returns {void}
    */
  clonePathNode () {
    path.storeD()

    const selPts = path.selected_pts
    // const {segs} = path;

    let i = selPts.length
    const nums = []

    while (i--) {
      const pt = selPts[i]
      path.addSeg(pt)

      nums.push(pt + i)
      nums.push(pt + i + 1)
    }
    path.init().addPtsToSelection(nums)

    path.endChanges('Clone path node(s)')
  }

  /**
    * @returns {void}
    */
  opencloseSubPath () {
    const selPts = path.selected_pts
    // Only allow one selected node for now
    if (selPts.length !== 1) { return }

    const { elem } = path
    const list = elem.pathSegList

    // const len = list.numberOfItems;

    const index = selPts[0]

    let openPt = null
    let startItem = null

    // Check if subpath is already open
    path.eachSeg(function (i) {
      if (this.type === 2 && i <= index) {
        startItem = this.item
      }
      if (i <= index) return true
      if (this.type === 2) {
        // Found M first, so open
        openPt = i
        return false
      }
      if (this.type === 1) {
        // Found Z first, so closed
        openPt = false
        return false
      }
      return true
    })

    if (!openPt) {
      // Single path, so close last seg
      openPt = path.segs.length - 1
    }

    if (openPt !== false) {
      // Close this path

      // Create a line going to the previous "M"
      const newseg = elem.createSVGPathSegLinetoAbs(startItem.x, startItem.y)

      const closer = elem.createSVGPathSegClosePath()
      if (openPt === path.segs.length - 1) {
        list.appendItem(newseg)
        list.appendItem(closer)
      } else {
        list.insertItemBefore(closer, openPt)
        list.insertItemBefore(newseg, openPt)
      }

      path.init().selectPt(openPt + 1)
      return
    }

    // M 1,1 L 2,2 L 3,3 L 1,1 z // open at 2,2
    // M 2,2 L 3,3 L 1,1

    // M 1,1 L 2,2 L 1,1 z M 4,4 L 5,5 L6,6 L 5,5 z
    // M 1,1 L 2,2 L 1,1 z [M 4,4] L 5,5 L(M)6,6 L 5,5 z

    const seg = path.segs[index]

    if (seg.mate) {
      list.removeItem(index) // Removes last "L"
      list.removeItem(index) // Removes the "Z"
      path.init().selectPt(index - 1)
      return
    }

    let lastM; let zSeg

    // Find this sub-path's closing point and remove
    for (let i = 0; i < list.numberOfItems; i++) {
      const item = list.getItem(i)

      if (item.pathSegType === 2) {
        // Find the preceding M
        lastM = i
      } else if (i === index) {
        // Remove it
        list.removeItem(lastM)
        // index--;
      } else if (item.pathSegType === 1 && index < i) {
        // Remove the closing seg of this subpath
        zSeg = i - 1
        list.removeItem(i)
        break
      }
    }

    let num = (index - lastM) - 1

    while (num--) {
      list.insertItemBefore(list.getItem(lastM), zSeg)
    }

    const pt = list.getItem(lastM)

    // Make this point the new "M"
    svgCanvas.replacePathSeg(2, lastM, [pt.x, pt.y])

    // i = index; // i is local here, so has no effect; what was the intent for this?

    path.init().selectPt(0)
  }

  /**
    * @returns {void}
    */
  deletePathNode () {
    if (!pathActionsMethod.canDeleteNodes || !path?.selected_pts.length) { return }
    path.storeD()

    const selPts = path.selected_pts

    let i = selPts.length
    while (i--) {
      const pt = selPts[i]
      path.deleteSeg(pt)
    }

    // Cleanup
    const cleanup = () => {
      const segList = path.elem.pathSegList
      let len = segList.numberOfItems

      const remItems = (pos, count) => {
        while (count--) {
          segList.removeItem(pos)
        }
      }

      if (len <= 1) { return true }

      while (len--) {
        const item = segList.getItem(len)
        if (item.pathSegType === 1) {
          const prev = segList.getItem(len - 1)
          const nprev = segList.getItem(len - 2)
          if (prev.pathSegType === 2) {
            remItems(len - 1, 2)
            cleanup()
            break
          } else if (nprev.pathSegType === 2) {
            remItems(len - 2, 3)
            cleanup()
            break
          }
        } else if (item.pathSegType === 2 && len > 0) {
          const prevType = segList.getItem(len - 1).pathSegType
          // Path has M M
          if (prevType === 2) {
            remItems(len - 1, 1)
            cleanup()
            break
            // Entire path ends with Z M
          } else if (prevType === 1 && segList.numberOfItems - 1 === len) {
            remItems(len, 1)
            cleanup()
            break
          }
        }
      }
      return false
    }

    cleanup()

    // Completely delete a path with 1 or 0 segments
    if (path.elem.pathSegList.numberOfItems <= 1) {
      // The pen stays the tool, ready for the next path (lot Plume).
      if (pathActionsMethod.isPen()) {
        pathActionsMethod.removeEditedPath()
        return
      }
      pathActionsMethod.toSelectMode(path.elem)
      svgCanvas.canvas.deleteSelectedElements()
      return
    }

    path.init()
    path.clearSelection()

    // TODO: Find right way to select point now
    // path.selectPt(selPt);
    if (window.opera) { // Opera repaints incorrectly
      path.elem.setAttribute('d', path.elem.getAttribute('d'))
    }
    path.endChanges('Delete path node(s)')
  }

  // Can't seem to use `@borrows` here, so using `@see`
  /**
  * Smooth polyline into path.
  * @function module:path.pathActions.smoothPolylineIntoPath
  * @see module:path~smoothPolylineIntoPath
  */
  smoothPolylineIntoPath (element) {
    return this.#smoothPolylineIntoPath(element)
  }

  /* eslint-enable  */
  /**
  * @param {?Integer} v See {@link https://www.w3.org/TR/SVG/single-page.html#paths-InterfaceSVGPathSeg}
  * @returns {void}
  */
  setSegType (v) {
    path?.setSegType(v)
  }

  /**
  * @param {string} attr
  * @param {Float} newValue
  * @returns {void}
  */
  moveNode (attr, newValue) {
    const selPts = path.selected_pts
    if (!selPts.length) { return }

    path.storeD()

    // Get first selected point
    const seg = path.segs[selPts[0]]
    const diff = { x: 0, y: 0 }
    diff[attr] = newValue - seg.item[attr]

    seg.move(diff.x, diff.y)
    path.endChanges('Move path point')
  }

  /**
  * @param {Element} elem
  * @returns {void}
  */
  fixEnd (elem) {
    // Adds an extra segment if the last seg before a Z doesn't end
    // at its M point
    // M0,0 L0,100 L100,100 z
    const segList = elem.pathSegList
    const len = segList.numberOfItems
    let lastM
    for (let i = 0; i < len; ++i) {
      const item = segList.getItem(i)
      if (item.pathSegType === 2) { // 2 => M segment type (move to)
        lastM = item
      }

      if (item.pathSegType === 1) { // 1 => Z segment type (close path)
        const prev = segList.getItem(i - 1)
        if (prev.x !== lastM.x || prev.y !== lastM.y) {
          // Add an L segment here
          const newseg = elem.createSVGPathSegLinetoAbs(lastM.x, lastM.y)
          segList.insertItemBefore(newseg, i)
          // Can this be done better?
          pathActionsMethod.fixEnd(elem)
          break
        }
      }
    }
  }

  // Can't seem to use `@borrows` here, so using `@see`
  /**
  * Convert a path to one with only absolute or relative values.
  * @function module:path.pathActions.convertPath
  * @see module:path.convertPath
  */
  convertPath (pth, toRel) {
    return convertPath(pth, toRel)
  }
}

// Export singleton instance for backward compatibility
export const pathActionsMethod = new PathActions()
// end pathActions
