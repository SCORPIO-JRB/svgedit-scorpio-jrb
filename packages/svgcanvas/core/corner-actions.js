/**
 * Handles of the corners (lot Coins), as in Illustrator: a small disc inside
 * each corner that a drag rounds.
 *
 * - A rectangle shows four: a drag changes the radius of its four corners
 *   (`rx`, `ry`), Alt+drag rounds that corner alone and makes the rectangle
 *   a path.
 * - A polygon or a polyline shows one at each corner: a drag rounds them all,
 *   Alt+drag that one, and the shape becomes a path.
 * - A path shows one at each corner it has rounded: a drag changes them all,
 *   Alt+drag that one. In node editing, the corners of the selected nodes
 *   show theirs, rounded or not, and a drag rounds them.
 *
 * Each drag is one undo step. The Rectangle tool draws with the last radius
 * given to a rectangle; during the drawing, ↑ and ↓ change it, ← makes the
 * corners sharp and → as round as they get.
 * @module corner-actions
 */

import { BatchCommand, ChangeElementCommand } from './history.js'
import { readPath, writePath, nodeIndex, transformSubpath } from './path-points.js'
import { shortFloat } from './units.js'
import { matrixBetween } from './outline.js'
import { getElement } from './utilities.js'
import {
  cornerCentre, radiusAt, clampRadius, rectRadius, rectCorners, rectSkeleton, RECT_VERTEX,
  pointsSkeleton, readPoints, skeletonCorner, skeletonCorners, flattenSubpath, roundSkeleton
} from './corners.js'

let svgCanvas = null

// Distance on the screen from a vertex to its handle, at least.
const HANDLE_DISTANCE = 22
// A rectangle smaller on the screen shows no handle.
const RECT_MIN_SIDE = 48
// Around a corner of a polygon or a path, sides shorter on the screen hide its handle.
const SIDE_MIN = 32
// Most handles on one element.
const MAX_HANDLES = 48
// Travel of the pointer, in screen pixels, before a drag changes anything.
const DRAG_START = 2

const isConnector = (el) => Boolean(el?.getAttribute?.('se:connector') ||
  el?.getAttributeNS?.('http://svg-edit.googlecode.com', 'connector'))

/**
 * A point of the screen in the user space of an element.
 * @param {{x: number, y: number}} client
 * @param {Element} elem
 * @returns {{x: number, y: number}|null}
 */
const toLocal = (client, elem) => {
  const m = elem.getScreenCTM?.()
  if (!m) return null
  const p = new DOMPoint(client.x, client.y).matrixTransform(m.inverse())
  return { x: p.x, y: p.y }
}

const apply = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
const gap = (p, q) => Math.hypot(p.x - q.x, p.y - q.y)

/**
 * A radius rounded to what the zoom lets the pointer give.
 * @param {number} radius
 * @returns {number}
 */
const roundRadius = (radius) => {
  const factor = svgCanvas.getZoom() >= 2 ? 10 : 1
  return Math.max(0, Math.round(radius * factor) / factor)
}

/**
 * Geometry of a rectangle in its user space.
 * @param {SVGRectElement} elem
 * @returns {{x: number, y: number, width: number, height: number}}
 */
const rectBox = (elem) => ({
  x: elem.x.baseVal.value,
  y: elem.y.baseVal.value,
  width: elem.width.baseVal.value,
  height: elem.height.baseVal.value
})

/**
 * The skeletons of the subpaths of a path, and its corners keyed
 * "subpath:vertex", with the nodes of the canvas that make each one.
 * @param {SVGPathElement} elem
 * @returns {{subpaths: object[], skel: object[], corners: object[]}}
 */
const pathCorners = (elem) => {
  const subpaths = readPath(elem.getAttribute('d'))
  const skel = subpaths.map((sub) => flattenSubpath(sub))
  const corners = []
  skel.forEach(({ flat, radii, nodes }, s) => {
    skeletonCorners(flat, radii).forEach((corner) => {
      corners.push({
        key: `${s}:${corner.k}`,
        corner,
        nodes: (nodes.get(corner.k) || []).map((j) => nodeIndex(subpaths, s, j))
      })
    })
  })
  return { subpaths, skel, corners }
}

/**
 * Index of the vertex of a skeleton that holds each node of a path.
 * @param {object[]} subpaths
 * @param {object[]} skel
 * @returns {Map<number, {s: number, k: number|null}>} By node of the canvas;
 *   a start of an open subpath is no vertex (k null)
 */
const vertexOfNodes = (subpaths, skel) => {
  const map = new Map()
  skel.forEach(({ nodes }, s) => {
    map.set(nodeIndex(subpaths, s, -1), { s, k: null })
    nodes.forEach((segs, k) => segs.forEach((j) => map.set(nodeIndex(subpaths, s, j), { s, k })))
  })
  return map
}

class CornerActions {
  #scheduled = false
  #drag = null
  #radius = 0

  /**
   * Draws the handles again once the current task has finished: the
   * selection, its frames and the nodes may change several times in a row.
   * @returns {void}
   */
  schedule () {
    if (this.#scheduled) return
    this.#scheduled = true
    queueMicrotask(() => {
      this.#scheduled = false
      this.refresh()
    })
  }

  /**
   * @returns {boolean} Whether a handle is being dragged
   */
  isDragging () {
    return Boolean(this.#drag)
  }

  /**
   * The radius the next rectangle is drawn with.
   * @returns {number}
   */
  rememberedRadius () {
    return this.#radius
  }

  /**
   * Keeps the radius given to a rectangle for the next one.
   * @param {number} radius
   * @returns {void}
   */
  remember (radius) {
    const r = Number(radius)
    if (Number.isFinite(r) && r >= 0) this.#radius = r
  }

  /**
   * The element whose corners show their handles, and these corners.
   * @returns {{elem: Element, kind: string, corners: object[], subpaths?: object[], skel?: object[]}|null}
   */
  #target () {
    const mode = svgCanvas.getCurrentMode()
    if (mode === 'pathedit') {
      const path = svgCanvas.getPathObj?.()
      const elem = path?.elem
      if (!elem?.parentNode || !path.selected_pts?.length) return null
      const selected = new Set(path.selected_pts)
      const found = pathCorners(elem)
      const corners = found.corners.filter((c) => c.nodes.some((n) => selected.has(n)))
      return { elem, kind: 'nodes', path, ...found, corners }
    }
    if (mode !== 'select') return null
    const selected = svgCanvas.getSelectedElements().filter(Boolean)
    if (selected.length !== 1) return null
    const [elem] = selected
    const selector = svgCanvas.selectorManager.selectorMap?.[elem.id]
    if (!selector?.hasGrips || isConnector(elem) || svgCanvas.isLocked?.(elem)) return null
    switch (elem.tagName) {
      case 'rect': {
        const { x, y, width, height } = rectBox(elem)
        if (!(width > 0 && height > 0)) return null
        const radius = rectRadius(width, height, elem.getAttribute('rx'), elem.getAttribute('ry'))
        return {
          elem,
          kind: 'rect',
          corners: rectCorners(x, y, width, height, radius).map((corner) => ({ key: corner.key, corner }))
        }
      }
      case 'polygon':
      case 'polyline': {
        const flat = pointsSkeleton(readPoints(elem.getAttribute('points')), elem.tagName === 'polygon')
        if (!flat) return null
        const corners = skeletonCorners(flat).map((corner) => ({ key: `0:${corner.k}`, corner }))
        return { elem, kind: 'points', flat, corners }
      }
      case 'path': {
        const found = pathCorners(elem)
        return { elem, kind: 'path', ...found, corners: found.corners.filter((c) => c.corner.radius > 0) }
      }
      default:
        return null
    }
  }

  /**
   * Where the handles of the corners go, in the coordinates of the
   * selection layer.
   * @param {Element} elem
   * @param {object[]} corners
   * @param {string} kind
   * @returns {{key: string, x: number, y: number}[]}
   */
  #handles (elem, corners, kind) {
    const mgr = svgCanvas.selectorManager
    const m = matrixBetween(elem, mgr.selectorParentGroup)
    if (!m || corners.length > MAX_HANDLES) return []
    if (kind === 'rect' && corners.length === 4) {
      const [nw, ne, , sw] = corners.map(({ corner }) => apply(m, corner.vertex))
      if (gap(nw, ne) < RECT_MIN_SIDE || gap(nw, sw) < RECT_MIN_SIDE) return []
    }
    const handles = []
    corners.forEach(({ key, corner, radius }) => {
      const vertex = apply(m, corner.vertex)
      if (kind === 'points' || kind === 'path' || kind === 'nodes') {
        const prev = apply(m, { x: corner.vertex.x + corner.a.x * corner.lenIn, y: corner.vertex.y + corner.a.y * corner.lenIn })
        const next = apply(m, { x: corner.vertex.x + corner.b.x * corner.lenOut, y: corner.vertex.y + corner.b.y * corner.lenOut })
        if (gap(prev, vertex) < SIDE_MIN || gap(next, vertex) < SIDE_MIN) return
      }
      const centre = apply(m, cornerCentre(corner, radius ?? corner.radius))
      let at = centre
      if (gap(centre, vertex) < HANDLE_DISTANCE) {
        const tip = apply(m, { x: corner.vertex.x + corner.frame.bis.x, y: corner.vertex.y + corner.frame.bis.y })
        const d = gap(tip, vertex) || 1
        at = {
          x: vertex.x + (tip.x - vertex.x) / d * HANDLE_DISTANCE,
          y: vertex.y + (tip.y - vertex.y) / d * HANDLE_DISTANCE
        }
      }
      handles.push({ key, x: at.x, y: at.y })
    })
    return handles
  }

  /**
   * Draws the handles of the element whose corners show them, or of the
   * corner being dragged.
   * @returns {void}
   */
  refresh () {
    const mgr = svgCanvas?.selectorManager
    if (!mgr?.showCornerGrips) return
    const drag = this.#drag
    if (drag) {
      if (!drag.corner || !drag.elem.parentNode) {
        mgr.showCornerGrips(null)
        return
      }
      if (drag.kind === 'rect') {
        // The four corners share the radius: their handles move together.
        const { x, y, width, height } = rectBox(drag.elem)
        const corners = rectCorners(x, y, width, height, drag.shown).map((corner) => ({ key: corner.key, corner }))
        mgr.showCornerGrips(this.#handles(drag.elem, corners, 'rect').map((h) => ({ ...h, active: h.key === drag.key })))
        return
      }
      mgr.showCornerGrips(this.#handles(drag.elem, [{ key: drag.key, corner: drag.corner, radius: drag.shown }], 'drag')
        .map((h) => ({ ...h, active: true })))
      return
    }
    let target = null
    try {
      target = this.#target()
    } catch (e) {
      target = null
    }
    mgr.showCornerGrips(target ? this.#handles(target.elem, target.corners, target.kind) : null)
  }

  /**
   * Starts the drag of a handle.
   * @param {MouseEvent} evt
   * @param {string} key The corner of the handle
   * @returns {boolean} False when the handle is not one of the current corners
   */
  begin (evt, key) {
    const target = this.#target()
    const item = target?.corners.find((c) => c.key === key)
    if (!item) return false
    const client = { x: evt.clientX, y: evt.clientY }
    const alt = evt.altKey
    const { elem } = target
    const drag = { key, alt, client, moved: false, elem, corner: item.corner, r0: item.corner.radius, shown: item.corner.radius }
    switch (target.kind) {
      case 'rect': {
        const { x, y, width, height } = rectBox(elem)
        if (alt) {
          // One corner: the rectangle becomes a path at the first move.
          const r = item.corner.radius
          Object.assign(drag, {
            kind: 'convert',
            flat: rectSkeleton(x, y, width, height),
            radii: new Map(Object.values(RECT_VERTEX).map((k) => [k, r])),
            k: RECT_VERTEX[key]
          })
        } else {
          Object.assign(drag, { kind: 'rect', oldRx: elem.getAttribute('rx'), oldRy: elem.getAttribute('ry') })
        }
        break
      }
      case 'points':
        Object.assign(drag, {
          kind: 'convert',
          flat: target.flat,
          radii: new Map(),
          k: item.corner.k,
          active: alt ? [item.corner.k] : target.corners.map((c) => c.corner.k)
        })
        break
      case 'path':
      case 'nodes':
        Object.assign(drag, {
          kind: target.kind,
          oldD: elem.getAttribute('d'),
          subpaths: target.subpaths,
          skel: target.skel,
          active: alt ? [key] : target.corners.map((c) => c.key),
          path: target.path,
          selected: target.path ? [...target.path.selected_pts] : null
        })
        break
      default:
        return false
    }
    if (drag.kind === 'convert' && !drag.active) drag.active = [drag.k]
    drag.p0 = toLocal(client, elem)
    if (!drag.p0) return false
    this.#drag = drag
    this.refresh()
    return true
  }

  /**
   * Turns the rectangle or polygon of a drag into a path, its corners as
   * they are, and goes on with the path.
   * @param {object} drag
   * @returns {boolean}
   */
  #convert (drag) {
    const { elem } = drag
    const before = elem.getScreenCTM()
    const batch = new BatchCommand('Round corners')
    const own = Object.prototype.hasOwnProperty.call(svgCanvas, 'addCommandToHistory')
    const add = svgCanvas.addCommandToHistory
    let path = null
    svgCanvas.addCommandToHistory = (cmd) => batch.addSubCommand(cmd)
    try {
      path = svgCanvas.convertToPath(elem)
    } finally {
      if (own) svgCanvas.addCommandToHistory = add
      else delete svgCanvas.addCommandToHistory
    }
    const after = path?.getScreenCTM()
    if (!path || !before || !after) {
      if (!batch.isEmpty()) batch.unapply()
      return false
    }
    // The path may have its own matrix (a skewed shape is reoriented).
    const m = after.inverse().multiply(before)
    const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1
    const flat = transformSubpath(drag.flat, m)
    const radii = new Map([...drag.radii].map(([k, r]) => [k, r * scale]))
    const corner = skeletonCorner(flat, drag.k)
    if (!corner) {
      batch.unapply()
      return false
    }
    corner.radius = radii.get(drag.k) ?? 0
    Object.assign(drag, {
      kind: 'path',
      original: elem,
      elem: path,
      batch,
      oldD: path.getAttribute('d'),
      subpaths: [flat],
      skel: [{ flat, radii, nodes: new Map(flat.segs.map((seg, k) => [k, [k]])) }],
      active: drag.active.map((k) => `0:${k}`),
      key: `0:${drag.k}`,
      corner,
      r0: corner.radius,
      p0: toLocal(drag.client, path)
    })
    return Boolean(drag.p0)
  }

  /**
   * Follows the pointer during the drag of a handle.
   * @param {MouseEvent} evt
   * @returns {void}
   */
  move (evt) {
    const drag = this.#drag
    if (!drag) return
    const client = { x: evt.clientX, y: evt.clientY }
    if (!drag.moved) {
      if (gap(client, drag.client) < DRAG_START) return
      drag.moved = true
      if (drag.kind === 'convert' && !this.#convert(drag)) {
        this.#drag = null
        this.refresh()
        return
      }
    }
    const p = toLocal(client, drag.elem)
    if (!p) return
    let radius = drag.r0 + radiusAt(drag.corner, p) - radiusAt(drag.corner, drag.p0)
    radius = roundRadius(drag.kind === 'rect' ? clampRadius(radius, drag.corner.max) : Math.max(0, radius))
    drag.radius = radius
    if (drag.kind === 'rect') {
      drag.elem.setAttribute('rx', radius)
      drag.elem.setAttribute('ry', radius)
      drag.shown = radius
    } else {
      drag.shown = this.#round(drag, radius)
    }
    this.#label(drag)
    this.refresh()
  }

  /**
   * Gives a radius to the corners of a drag on a path.
   * @param {object} drag
   * @param {number} radius
   * @returns {number} The radius the dragged corner got
   */
  #round (drag, radius) {
    const active = new Set(drag.active)
    const touched = new Set(drag.active.map((key) => Number(key.split(':')[0])))
    const results = new Map()
    const subpaths = drag.skel.map(({ flat, radii }, s) => {
      if (!touched.has(s)) return drag.subpaths[s]
      const next = new Map(radii)
      flat.segs.forEach((seg, k) => {
        if (active.has(`${s}:${k}`)) next.set(k, radius)
      })
      const result = roundSkeleton(flat, next)
      results.set(s, result)
      return result.sub
    })
    drag.elem.setAttribute('d', writePath(subpaths, shortFloat))
    if (drag.kind === 'nodes') this.#reselect(drag, subpaths, results)
    const [s, k] = drag.key.split(':').map(Number)
    return results.get(s)?.radii.get(k) ?? 0
  }

  /**
   * Node editing: the grips follow the new path, and the selected nodes stay
   * selected, a rounded corner by the two ends of its arc.
   * @param {object} drag
   * @param {object[]} subpaths
   * @param {Map<number, object>} results
   * @returns {void}
   */
  #reselect (drag, subpaths, results) {
    const { path } = drag
    const vertices = vertexOfNodes(drag.subpaths, drag.skel)
    const nodes = new Set()
    drag.selected.forEach((n) => {
      const at = vertices.get(n)
      if (!at) return
      if (at.k === null) {
        nodes.add(nodeIndex(subpaths, at.s, -1))
        return
      }
      const segs = results.has(at.s) ? results.get(at.s).nodes.get(at.k) : drag.skel[at.s].nodes.get(at.k)
      segs?.forEach((j) => nodes.add(nodeIndex(subpaths, at.s, j)))
    })
    path.init().update()
    path.clearSelection()
    path.addPtsToSelection([...nodes])
  }

  /**
   * The radius under the selection while dragging.
   * @param {object} drag
   * @returns {void}
   */
  #label (drag) {
    const mgr = svgCanvas.selectorManager
    const m = matrixBetween(drag.elem, mgr.selectorParentGroup)
    let anchor
    try {
      const b = drag.elem.getBBox()
      if (m) {
        const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
          .map(([x, y]) => apply(m, { x, y }))
        const xs = pts.map((p) => p.x)
        const ys = pts.map((p) => p.y)
        anchor = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
      }
    } catch (e) {
      anchor = undefined
    }
    mgr.showRadius?.(drag.shown, anchor)
  }

  /**
   * Ends the drag of a handle: one undo step.
   * @returns {void}
   */
  end () {
    const drag = this.#drag
    this.#drag = null
    svgCanvas.selectorManager.hideDimension?.()
    if (!drag?.moved) {
      this.refresh()
      return
    }
    const { elem } = drag
    if (drag.kind === 'rect') {
      if (drag.radius === 0 && drag.oldRx === null && drag.oldRy === null) {
        elem.removeAttribute('rx')
        elem.removeAttribute('ry')
      }
      if (elem.getAttribute('rx') !== drag.oldRx || elem.getAttribute('ry') !== drag.oldRy) {
        svgCanvas.addCommandToHistory(new ChangeElementCommand(elem, { rx: drag.oldRx, ry: drag.oldRy }, 'Radius'))
        this.remember(drag.radius)
        svgCanvas.call('changed', [elem])
      }
    } else if (drag.kind === 'nodes') {
      if (elem.getAttribute('d') !== drag.oldD) {
        drag.path.last_d = drag.oldD
        drag.path.endChanges('Round corners')
      }
    } else if (drag.kind === 'path') {
      const cmd = new ChangeElementCommand(elem, { d: drag.oldD }, 'Round corners')
      const changed = elem.getAttribute('d') !== drag.oldD
      if (drag.batch) {
        if (changed) drag.batch.addSubCommand(cmd)
        svgCanvas.addCommandToHistory(drag.batch)
      } else if (changed) {
        svgCanvas.addCommandToHistory(cmd)
      }
      if (changed || drag.batch) {
        svgCanvas.selectorManager.requestSelector(elem)?.resize()
        svgCanvas.call('changed', [elem])
      }
    }
    this.refresh()
  }

  /**
   * Escape during the drag of a handle: everything as it was.
   * @returns {void}
   */
  cancel () {
    const drag = this.#drag
    this.#drag = null
    svgCanvas.selectorManager.hideDimension?.()
    if (drag?.moved) {
      const { elem } = drag
      if (drag.kind === 'rect') {
        ;[['rx', drag.oldRx], ['ry', drag.oldRy]].forEach(([name, value]) => {
          if (value === null) elem.removeAttribute(name)
          else elem.setAttribute(name, value)
        })
      } else if (drag.kind === 'path' || drag.kind === 'nodes') {
        elem.setAttribute('d', drag.oldD)
        if (drag.batch) {
          drag.batch.unapply()
          svgCanvas.clearSelection()
          svgCanvas.addToSelection([drag.original], true)
        }
        if (drag.kind === 'nodes') {
          drag.path.init().update()
          drag.path.clearSelection()
          drag.path.addPtsToSelection(drag.selected)
        }
      }
    }
    this.refresh()
  }

  /**
   * Arrow keys while a rectangle is drawn: ↑ and ↓ change its radius, ←
   * makes its corners sharp and → as round as they get (Maj: ten times
   * more).
   * @param {string} key `KeyboardEvent.key`
   * @param {boolean} [shift=false]
   * @returns {boolean} Whether the key was used
   */
  drawingKey (key, shift = false) {
    if (!svgCanvas.getStarted() || !['rect', 'square'].includes(svgCanvas.getCurrentMode())) return false
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return false
    const shape = getElement(svgCanvas.getId())
    if (shape?.tagName !== 'rect') return false
    const { width, height } = rectBox(shape)
    const max = Math.min(width, height) / 2
    const current = Number.parseFloat(shape.getAttribute('rx')) || 0
    const step = shift ? 10 : 1
    let radius
    switch (key) {
      case 'ArrowUp': radius = current + step; break
      case 'ArrowDown': radius = Math.max(0, current - step); break
      case 'ArrowLeft': radius = 0; break
      default: radius = Math.round(max * 100) / 100
    }
    this.setDrawingRadius(shape, radius)
    const mgr = svgCanvas.selectorManager
    const zoom = svgCanvas.getZoom()
    mgr.showRadius?.(Math.min(radius, max), { x: shape.x.baseVal.value * zoom, y: shape.y.baseVal.value * zoom, width: width * zoom, height: height * zoom })
    return true
  }

  /**
   * Gives its radius to the rectangle being drawn and keeps it for the next.
   * @param {SVGRectElement} shape
   * @param {number} radius
   * @returns {void}
   */
  setDrawingRadius (shape, radius) {
    this.remember(radius)
    if (radius > 0) {
      shape.setAttribute('rx', radius)
      shape.setAttribute('ry', radius)
    } else {
      shape.removeAttribute('rx')
      shape.removeAttribute('ry')
    }
  }
}

const cornerActions = new CornerActions()

/**
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.cornerActions = cornerActions
}

export { cornerActions }
