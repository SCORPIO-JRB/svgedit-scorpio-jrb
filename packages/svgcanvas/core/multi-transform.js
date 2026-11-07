/**
 * Transformations applied to a whole selection as if it were one object.
 *
 * A gesture computes one matrix M in the coordinate system of the drawing.
 * While the mouse moves, each element shows M through a temporary transform
 * (adjusted per element type, so that the preview is the result). When the
 * mouse is released, M is expressed in each element's parent coordinates and
 * applied with the rules used for a single element (recalculateDimensions),
 * plus two rules: a rotated rectangle, ellipse, image or foreignObject is
 * scaled along its own axes without shear, and a text gets a new font size
 * instead of a scale matrix. Nothing is added to the SVG: no group, no
 * attribute. The whole gesture is one undo step.
 * @module multi-transform
 * @license MIT
 */

import { BatchCommand, ChangeElementCommand } from './history.js'
import { getBBox, getRotationAngle } from './utilities.js'
import { getTransformList, transformListToTransform } from './math.js'
import { recalculateDimensions, withStartTransform } from './recalculate.js'

let svgCanvas = null

// Elements whose stroke width is kept by the rules: the preview must not
// scale their stroke either.
const KEEPS_STROKE = new Set([
  'circle', 'ellipse', 'foreignObject', 'image', 'line', 'path', 'polygon',
  'polyline', 'rect', 'text'
])
// Elements scaled along their own axes when they are rotated.
const ROTATED_BOX = new Set(['ellipse', 'foreignObject', 'image', 'rect'])
const EPSILON = 1e-9

/**
 * @function module:multi-transform.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  svgCanvas.scaleSelectedElements = scaleSelectedElements
}

// ---------------------------------------------------------------------------
// Plain 2D affine matrices {a, b, c, d, e, f}, as in SVG.

export const identity = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export const multiply = (...ms) => ms.reduce((m1, m2) => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f
}))

export const invert = (m) => {
  const det = m.a * m.d - m.b * m.c
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det
  }
}

export const apply = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })

export const translate = (x, y) => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y })

export const scale = (sx, sy) => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 })

export const rotate = (deg) => {
  const r = deg * Math.PI / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

const isIdentityMatrix = (m) =>
  Math.abs(m.a - 1) < EPSILON && Math.abs(m.b) < EPSILON && Math.abs(m.c) < EPSILON &&
  Math.abs(m.d - 1) < EPSILON && Math.abs(m.e) < EPSILON && Math.abs(m.f) < EPSILON

const toPlain = (m) => ({ a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f })

const toSVGTransform = (m) => {
  const svgRoot = svgCanvas.getSvgRoot()
  const matrix = svgRoot.createSVGMatrix()
  Object.assign(matrix, m)
  const transform = svgRoot.createSVGTransform()
  transform.setMatrix(matrix)
  return transform
}

// ---------------------------------------------------------------------------
// Geometry of the gesture.

/**
 * Scale of a resize grip drag, with the same rules as for a single element:
 * the opposite side stays in place, Alt resizes from the center, Shift keeps
 * the proportions (the horizontal factor wins at a corner).
 * @param {PlainObject} options
 * @param {module:utilities.BBoxObject} options.box - Frame at the start
 * @param {string} options.dir - Grip: n, ne, e, se, s, sw, w or nw
 * @param {number} options.dx - Pointer movement
 * @param {number} options.dy
 * @param {boolean} [options.alt]
 * @param {boolean} [options.shift]
 * @returns {{sx: number, sy: number, ox: number, oy: number}} Factors and fixed point
 */
export const computeResizeScale = ({ box, dir, dx, dy, alt = false, shift = false }) => {
  const { x, y, width, height } = box
  if (!dir.includes('n') && !dir.includes('s')) { dy = 0 }
  if (!dir.includes('e') && !dir.includes('w')) { dx = 0 }
  let sx = width ? (width + dx) / width : 1
  let sy = height ? (height + dy) / height : 1
  let tx = 0
  let ty = 0
  if (dir.includes('n')) {
    sy = height ? (height - dy) / height : 1
    ty = height
  }
  if (dir.includes('w')) {
    sx = width ? (width - dx) / width : 1
    tx = width
  }
  if (alt) {
    if (dir.includes('e')) { sx = width ? (width + 2 * dx) / width : 1 }
    if (dir.includes('w')) { sx = width ? (width - 2 * dx) / width : 1 }
    if (dir.includes('s')) { sy = height ? (height + 2 * dy) / height : 1 }
    if (dir.includes('n')) { sy = height ? (height - 2 * dy) / height : 1 }
    tx = width / 2
    ty = height / 2
  }
  if (shift) {
    if (sx === 1) {
      sx = sy
    } else {
      sy = sx
    }
  }
  return { sx, sy, ox: x + tx, oy: y + ty }
}

/**
 * Scale factors along an element's own axes, rotated by `angle`, under the
 * linear part of `m`, and whether `m` shears these axes.
 * @param {PlainObject} m
 * @param {number} angle - Degrees
 * @returns {{ax: number, ay: number, det: number, shear: boolean}}
 */
export const axisScales = (m, angle) => {
  const r = angle * Math.PI / 180
  const ux = Math.cos(r)
  const uy = Math.sin(r)
  const u = { x: m.a * ux + m.c * uy, y: m.b * ux + m.d * uy }
  const v = { x: m.a * -uy + m.c * ux, y: m.b * -uy + m.d * ux }
  const ax = Math.hypot(u.x, u.y)
  const ay = Math.hypot(v.x, v.y)
  const det = m.a * m.d - m.b * m.c
  const shear = ax > EPSILON && ay > EPSILON && Math.abs(u.x * v.x + u.y * v.y) / (ax * ay) > 1e-9
  return { ax, ay, det, shear }
}

/**
 * Matrix that, applied on top of a rotated element, scales it along its own
 * axes instead of shearing it: the center moves as with `m`, the angle is
 * kept, and each side is scaled by the length of its axis under `m`.
 * @param {PlainObject} m - Matrix in the element's parent coordinates
 * @param {number} angle - The element's rotation, in degrees
 * @param {{x: number, y: number}} center - The element's visual center
 * @returns {PlainObject|null} Null when `m` does not shear the element or
 *   mirrors it; `m` itself is then the result.
 */
export const shearFreeMatrix = (m, angle, center) => {
  const { ax, ay, det, shear } = axisScales(m, angle)
  if (!shear || det <= 0) { return null }
  const target = apply(m, center.x, center.y)
  return multiply(
    translate(target.x, target.y),
    rotate(angle),
    scale(ax, ay),
    rotate(-angle),
    translate(-center.x, -center.y)
  )
}

/**
 * Transform from an element's parent coordinates to the coordinates of the
 * drawing (the layer), as the product of the ancestors' transforms.
 * @param {Element} elem
 * @returns {PlainObject}
 */
const parentToDrawing = (elem) => {
  let m = identity()
  const content = svgCanvas.getSvgContent()
  let node = elem.parentNode
  while (node && node !== content && node.nodeType === 1) {
    const tlist = node.transform?.baseVal
    if (tlist?.numberOfItems) {
      m = multiply(toPlain(transformListToTransform(tlist).matrix), m)
    }
    node = node.parentNode
  }
  return m
}

const singleRotation = (tlist) =>
  tlist?.numberOfItems === 1 && tlist.getItem(0).type === SVGTransform.SVG_TRANSFORM_ROTATE

// ---------------------------------------------------------------------------
// Text: a new font size instead of a scale matrix.

const splitNumbers = (value) => String(value).trim().split(/[\s,]+/).filter(Boolean)

const mapList = (value, fn) => splitNumbers(value).map((token) => {
  const n = Number.parseFloat(token)
  return Number.isNaN(n) ? token : fn(n)
}).join(' ')

const scaleLength = (value, s) => {
  // Lengths relative to the font size (em, %) follow the parent's size.
  const match = /^\s*(-?[\d.]+(?:e[-+]?\d+)?)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(String(value))
  if (!match) { return null }
  const n = Number.parseFloat(match[1]) * s
  return match[2] ? `${n}${match[2]}` : n
}

/**
 * Checks that a text can get a new font size instead of a matrix: its own
 * transform must be empty or a single rotation.
 * @param {Element} elem
 * @returns {boolean}
 */
export const isScalableText = (elem) => {
  if (elem?.tagName !== 'text') { return false }
  const tlist = getTransformList(elem)
  return !tlist?.numberOfItems || singleRotation(tlist)
}

/**
 * Describes a text for {@link scaleText}: its box, its rotation and its visual
 * center, read before anything is written.
 * @param {Element} text
 * @returns {PlainObject}
 */
export const describeText = (text) => {
  const box = text.getBBox()
  const tlist = getTransformList(text)
  const own = tlist?.numberOfItems ? toPlain(transformListToTransform(tlist).matrix) : identity()
  const local = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  let fontSize = null
  if (!text.hasAttribute('font-size')) {
    fontSize = Number.parseFloat(window.getComputedStyle(text).fontSize)
  }
  return {
    box,
    angle: getRotationAngle(text) || 0,
    local,
    visual: apply(own, local.x, local.y),
    computedFontSize: Number.isNaN(fontSize) ? null : fontSize
  }
}

/**
 * Matrix showing the result of {@link scaleText} on top of the text's current
 * transform: a uniform scale by the smaller factor about its center, which
 * moves as with `m`. Used for an exact preview.
 * @param {PlainObject} m - Matrix in the text's parent coordinates
 * @param {PlainObject} info - From {@link describeText}
 * @returns {PlainObject}
 */
export const textPreviewMatrix = (m, info) => {
  const { ax, ay, det } = axisScales(m, info.angle)
  const s = Math.min(ax, ay)
  const target = apply(m, info.visual.x, info.visual.y)
  const flipX = det < 0 && !info.angle ? Math.sign(m.a) || 1 : 1
  const flipY = det < 0 && !info.angle ? Math.sign(m.d) || 1 : 1
  if (det < 0 && info.angle) { return m }
  return multiply(
    translate(target.x, target.y),
    scale(s * flipX, s * flipY),
    translate(-info.visual.x, -info.visual.y)
  )
}

/**
 * Applies `m` to a text with a new font size instead of a scale matrix. The
 * size is multiplied by the smaller of the two scale factors, as the radius
 * of a circle, so that the text is never distorted; its center moves as with
 * `m`, and positions, offsets and sizes of its tspan follow.
 * @param {Element} text
 * @param {PlainObject} m - Matrix in the text's parent coordinates, applied on
 *   top of its current transform
 * @param {PlainObject} info - From {@link describeText}
 * @param {string} startTransform - Transform before the gesture, for undo
 * @returns {module:history.BatchCommand|null} Null when the rule does not apply
 *   (a rotated text mirrored by `m`): the caller keeps the matrix then.
 */
export const scaleText = (text, m, info, startTransform) => {
  const { ax, ay, det } = axisScales(m, info.angle)
  if (det < 0 && info.angle) { return null }
  const s = Math.min(ax, ay)
  const target = apply(m, info.visual.x, info.visual.y)
  const mapX = (x) => target.x + s * (x - info.local.x)
  const mapY = (y) => target.y + s * (y - info.local.y)

  const batch = new BatchCommand('Scale text')
  const written = []
  // Old values are read, then every attribute is written; each command is
  // created last, since it reads the new values when it is created.
  const write = (elem, changes, oldTransform) => {
    const old = {}
    Object.keys(changes).forEach((name) => { old[name] = elem.getAttribute(name) })
    if (oldTransform !== undefined) { old.transform = oldTransform }
    Object.entries(changes).forEach(([name, value]) => {
      if (value === null) {
        elem.removeAttribute(name)
      } else {
        elem.setAttribute(name, value)
      }
    })
    written.push([elem, old])
  }

  const changesFor = (elem, isRoot) => {
    const changes = {}
    if (elem.hasAttribute('x')) { changes.x = mapList(elem.getAttribute('x'), mapX) }
    if (elem.hasAttribute('y')) { changes.y = mapList(elem.getAttribute('y'), mapY) }
    ;['dx', 'dy'].forEach((name) => {
      if (elem.hasAttribute(name)) { changes[name] = mapList(elem.getAttribute(name), (n) => n * s) }
    })
    ;['font-size', 'textLength', 'letter-spacing', 'word-spacing'].forEach((name) => {
      if (!elem.hasAttribute(name)) { return }
      const scaled = scaleLength(elem.getAttribute(name), s)
      if (scaled !== null) { changes[name] = scaled }
    })
    if (isRoot && !elem.hasAttribute('font-size') && info.computedFontSize) {
      changes['font-size'] = info.computedFontSize * s
    }
    if (isRoot && !elem.hasAttribute('x')) { changes.x = mapX(0) }
    if (isRoot && !elem.hasAttribute('y')) { changes.y = mapY(0) }
    return changes
  }

  // The rotation stays, about the new center; a mirror stays as a matrix.
  let transform = null
  if (info.angle) {
    transform = `rotate(${info.angle} ${target.x} ${target.y})`
  } else if (det < 0) {
    const fx = Math.sign(m.a) || 1
    const fy = Math.sign(m.d) || 1
    transform = `matrix(${fx} 0 0 ${fy} ${target.x * (1 - fx)} ${target.y * (1 - fy)})`
  }

  // Changes of the children first: the root's font size may be read by them.
  const childChanges = []
  text.querySelectorAll('tspan, textPath, tref').forEach((child) => {
    const changes = changesFor(child, false)
    if (Object.keys(changes).length) { childChanges.push([child, changes]) }
  })
  const rootChanges = changesFor(text, true)
  // The transform list may have been edited through the SVG DOM: read the
  // attribute so that the browser writes it before it is replaced.
  text.getAttribute('transform')
  rootChanges.transform = transform
  write(text, rootChanges, startTransform || null)
  childChanges.forEach(([child, changes]) => write(child, changes))
  written.forEach(([elem, old]) => batch.addSubCommand(new ChangeElementCommand(elem, old)))
  return batch
}

/**
 * Ends the resize of a single text by one of its grips: the scale drawn
 * during the gesture becomes a new font size.
 * @param {Element} text
 * @param {string} startTransform - Transform before the gesture
 * @returns {module:history.BatchCommand|null} Null when the rule does not
 *   apply; the gesture's transforms are then left for recalculateDimensions.
 */
export const commitSingleTextResize = (text, startTransform) => {
  const tlist = getTransformList(text)
  const N = tlist?.numberOfItems || 0
  if (N < 3) { return null }
  const total = toPlain(transformListToTransform(tlist).matrix)
  const own = N > 3 ? toPlain(transformListToTransform(tlist, 0, N - 4).matrix) : identity()
  const m = multiply(total, invert(own))
  const angle = getRotationAngle(text) || 0
  if (axisScales(m, angle).det < 0 && angle) { return null }
  // Back to the transform before the gesture, then the rule.
  text.getAttribute('transform')
  if (startTransform) {
    text.setAttribute('transform', startTransform)
  } else {
    text.removeAttribute('transform')
  }
  return scaleText(text, m, describeText(text), startTransform)
}

/**
 * Scale for the preview of a single text resized by a grip: uniform, by the
 * smaller factor, about its center moved as the frame's scale moves it.
 * @param {module:utilities.BBoxObject} box - The text's box
 * @param {number} sx - Factors of the frame
 * @param {number} sy
 * @param {number} ox - Fixed point of the frame
 * @param {number} oy
 * @returns {{origin: {x: number, y: number}, sx: number, sy: number, target: {x: number, y: number}}}
 */
export const singleTextPreview = (box, sx, sy, ox, oy) => {
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const s = Math.min(Math.abs(sx), Math.abs(sy))
  return {
    origin: c,
    sx: s * (Math.sign(sx) || 1),
    sy: s * (Math.sign(sy) || 1),
    target: { x: ox + sx * (c.x - ox), y: oy + sy * (c.y - oy) }
  }
}

// ---------------------------------------------------------------------------
// Applying a matrix to elements.

/**
 * Describes how an element takes a transformation of the selection.
 * @param {Element} elem
 * @returns {PlainObject}
 */
const describe = (elem) => {
  const tlist = getTransformList(elem)
  const P = parentToDrawing(elem)
  const info = {
    elem,
    P,
    Pinv: isIdentityMatrix(P) ? null : invert(P),
    startTransform: elem.getAttribute('transform') || '',
    kind: 'matrix'
  }
  if (isScalableText(elem)) {
    info.kind = 'text'
    info.text = describeText(elem)
  } else if (ROTATED_BOX.has(elem.tagName) && singleRotation(tlist)) {
    const box = getBBox(elem)
    const own = toPlain(transformListToTransform(tlist).matrix)
    info.kind = 'rotated'
    info.angle = getRotationAngle(elem)
    info.center = apply(own, box.x + box.width / 2, box.y + box.height / 2)
  } else if (elem.tagName === 'circle' && !tlist?.numberOfItems) {
    const r = Number.parseFloat(elem.getAttribute('r')) || 0
    info.kind = 'circle'
    info.center = {
      x: Number.parseFloat(elem.getAttribute('cx')) || 0,
      y: Number.parseFloat(elem.getAttribute('cy')) || 0
    }
    info.r = r
  }
  return info
}

/**
 * Expresses a matrix of the drawing in an element's parent coordinates.
 * @param {PlainObject} M
 * @param {PlainObject} info
 * @returns {PlainObject}
 */
const inParent = (M, info) => (info.Pinv ? multiply(info.Pinv, M, info.P) : M)

/**
 * Matrix showing, on top of the element's transform, what the rules will
 * write for it.
 * @param {PlainObject} Mp - Matrix in the parent's coordinates
 * @param {PlainObject} info
 * @returns {PlainObject}
 */
const previewMatrix = (Mp, info) => {
  switch (info.kind) {
    case 'text':
      return textPreviewMatrix(Mp, info.text)
    case 'rotated':
      return shearFreeMatrix(Mp, info.angle, info.center) || Mp
    case 'circle': {
      // A circle stays a circle: its radius takes the smaller factor.
      const { ax, ay } = axisScales(Mp, 0)
      const s = Math.min(ax, ay)
      const target = apply(Mp, info.center.x, info.center.y)
      return multiply(translate(target.x, target.y), scale(s, s), translate(-info.center.x, -info.center.y))
    }
    default:
      return Mp
  }
}

/**
 * Writes a matrix into an element with the rules of its type.
 * @param {PlainObject} info
 * @param {PlainObject} Mp - Matrix in the parent's coordinates
 * @returns {module:history.Command|null}
 */
const commitElement = (info, Mp) => {
  const { elem, startTransform } = info
  if (info.kind === 'text') {
    const cmd = scaleText(elem, Mp, info.text, startTransform)
    if (cmd) { return cmd }
  }
  const matrix = (info.kind === 'rotated' && shearFreeMatrix(Mp, info.angle, info.center)) || Mp
  const tlist = getTransformList(elem)
  if (!tlist) { return null }
  const xform = toSVGTransform(matrix)
  if (tlist.numberOfItems) {
    tlist.insertItemBefore(xform, 0)
  } else {
    tlist.appendItem(xform)
  }
  const cmd = withStartTransform(svgCanvas, startTransform, () => recalculateDimensions(elem))
  if (cmd) { return cmd }
  if ((elem.getAttribute('transform') || '') !== startTransform) {
    return new ChangeElementCommand(elem, { transform: startTransform })
  }
  return null
}

/**
 * Applies a matrix of the drawing to elements, as one undo step.
 * @param {Element[]} elements
 * @param {PlainObject} M
 * @param {PlainObject[]} [infos] - Descriptions read beforehand
 * @returns {module:history.BatchCommand}
 */
const applyToElements = (elements, M, infos) => {
  // Every description (and so every geometry read) comes before any write.
  const described = infos || elements.map(describe)
  const batch = new BatchCommand('Resize Elements')
  described.forEach((info) => {
    const cmd = commitElement(info, inParent(M, info))
    if (cmd) { batch.addSubCommand(cmd) }
  })
  return batch
}

/**
 * Scales the selection about a point, as one undo step: the whole selection
 * behaves as a single object, with the rules of each element type.
 * @function module:svgcanvas.SvgCanvas#scaleSelectedElements
 * @param {number} sx
 * @param {number} sy
 * @param {number} [ox] - Fixed point, the top left corner of the selection's
 *   frame by default
 * @param {number} [oy]
 * @returns {module:history.BatchCommand|null}
 */
export const scaleSelectedElements = (sx, sy, ox, oy) => {
  const elements = svgCanvas.getSelectedElements().filter(Boolean)
  if (!elements.length || (sx === 1 && sy === 1)) { return null }
  const infos = elements.map(describe)
  if (ox === undefined || oy === undefined) {
    const frame = frameOf(elements, infos)
    ox = frame.x
    oy = frame.y
  }
  const M = multiply(translate(ox, oy), scale(sx, sy), translate(-ox, -oy))
  const batch = applyToElements(elements, M, infos)
  if (!batch.isEmpty()) {
    svgCanvas.addCommandToHistory(batch)
    svgCanvas.call('changed', elements)
  }
  // Every box is read, then every selector is written: one layout.
  const measure = svgCanvas.getSelector?.()?.getSelectionBBox
  const boxes = elements.map((elem) => (measure ? measure(elem) : undefined))
  elements.forEach((elem, i) => {
    svgCanvas.selectorManager.requestSelector(elem).resize(boxes[i], Boolean(boxes[i]))
  })
  return batch
}

/**
 * Frame of elements in the drawing's coordinates: the union of their boxes,
 * transforms and stroke included, as the selection boxes show them.
 * @param {Element[]} elements
 * @param {PlainObject[]} infos
 * @returns {module:utilities.BBoxObject}
 */
const frameOf = (elements, infos) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const measure = svgCanvas.getSelector?.()?.getSelectionBBox || getBBox
  elements.forEach((elem, i) => {
    const box = measure(elem)
    if (!box) { return }
    const tlist = getTransformList(elem)
    const own = tlist?.numberOfItems ? toPlain(transformListToTransform(tlist).matrix) : identity()
    const m = multiply(infos[i].P, own)
    let offset = 0
    const sw = Number.parseFloat(elem.getAttribute('stroke-width'))
    if (elem.getAttribute('stroke') !== 'none' && !Number.isNaN(sw)) { offset = sw / 2 }
    ;[[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height]].forEach(([x, y]) => {
      const p = apply(m, x, y)
      minX = Math.min(minX, p.x - offset)
      minY = Math.min(minY, p.y - offset)
      maxX = Math.max(maxX, p.x + offset)
      maxY = Math.max(maxY, p.y + offset)
    })
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// ---------------------------------------------------------------------------
// The resize gesture.

let gesture = null

/**
 * @returns {boolean} True while the frame of a multi-selection is resized
 */
export const isGroupResizing = () => Boolean(gesture)

/**
 * Starts resizing the selection by a grip of its common frame. Every box is
 * read here, once: the gesture itself reads no geometry.
 * @param {Element[]} elements
 * @param {string} dir - The grip
 * @param {number} startX - Pointer, in the drawing's coordinates
 * @param {number} startY
 * @returns {void}
 */
export const beginGroupResize = (elements, dir, startX, startY) => {
  const infos = elements.map(describe)
  const measure = svgCanvas.getSelector?.()?.getSelectionBBox
  const boxes = elements.map((elem) => (measure ? measure(elem) : undefined))
  const frame = frameOf(elements, infos)
  const mgr = svgCanvas.selectorManager
  // Temporary transforms, and strokes that keep their width in the preview
  // as they will in the result.
  infos.forEach((info) => {
    const tlist = getTransformList(info.elem)
    if (!tlist) { return }
    const xform = svgCanvas.getSvgRoot().createSVGTransform()
    if (tlist.numberOfItems) {
      tlist.insertItemBefore(xform, 0)
    } else {
      tlist.appendItem(xform)
    }
    if (KEEPS_STROKE.has(info.elem.tagName) && !info.elem.hasAttribute('vector-effect')) {
      info.elem.setAttribute('vector-effect', 'non-scaling-stroke')
      info.addedVectorEffect = true
    }
  })
  gesture = {
    elements,
    infos,
    boxes,
    dir,
    startX,
    startY,
    frame,
    screenFrame: mgr.frameBox ? { ...mgr.frameBox } : null,
    M: identity()
  }
}

/**
 * Follows the pointer: one matrix, one write per element.
 * @param {number} x - Pointer, in the drawing's coordinates
 * @param {number} y
 * @param {PlainObject} [modifiers]
 * @param {boolean} [modifiers.alt]
 * @param {boolean} [modifiers.shift]
 * @param {Function} [modifiers.snap] - Rounds a distance to the grid
 * @returns {void}
 */
export const updateGroupResize = (x, y, { alt = false, shift = false, snap } = {}) => {
  if (!gesture) { return }
  let dx = x - gesture.startX
  let dy = y - gesture.startY
  if (snap) {
    dx = snap(dx)
    dy = snap(dy)
  }
  const { sx, sy, ox, oy } = computeResizeScale({ box: gesture.frame, dir: gesture.dir, dx, dy, alt, shift })
  const M = multiply(translate(ox, oy), scale(sx, sy), translate(-ox, -oy))
  gesture.M = M
  gesture.infos.forEach((info, i) => {
    const tlist = getTransformList(info.elem)
    if (!tlist?.numberOfItems) { return }
    const xform = toSVGTransform(previewMatrix(inParent(M, info), info))
    tlist.replaceItem(xform, 0)
    svgCanvas.selectorManager.requestSelector(info.elem).resize(gesture.boxes[i], Boolean(gesture.boxes[i]))
  })
  // The frame follows the matrix exactly.
  if (gesture.screenFrame) {
    const zoom = svgCanvas.getZoom()
    const { x: fx, y: fy, width: fw, height: fh } = gesture.screenFrame
    const Ms = multiply(scale(zoom, zoom), M, scale(1 / zoom, 1 / zoom))
    const p1 = apply(Ms, fx, fy)
    const p2 = apply(Ms, fx + fw, fy + fh)
    const box = {
      x: Math.min(p1.x, p2.x),
      y: Math.min(p1.y, p2.y),
      width: Math.abs(p2.x - p1.x),
      height: Math.abs(p2.y - p1.y)
    }
    svgCanvas.selectorManager.lockFrame(box)
    svgCanvas.selectorManager.updateMultiFrame(box)
  }
}

/**
 * Removes the temporary transforms and preview attributes.
 * @returns {void}
 */
const restoreElements = () => {
  gesture.infos.forEach((info) => {
    // The list was edited through the SVG DOM: read the attribute so that the
    // browser writes it before it is replaced or removed.
    info.elem.getAttribute('transform')
    if (info.startTransform) {
      info.elem.setAttribute('transform', info.startTransform)
    } else {
      info.elem.removeAttribute('transform')
    }
    if (info.addedVectorEffect) { info.elem.removeAttribute('vector-effect') }
  })
  svgCanvas.selectorManager.lockFrame(null)
}

/**
 * Ends the gesture and writes the result, as one undo step.
 * @returns {module:history.BatchCommand|null} Null when nothing changed
 */
export const commitGroupResize = () => {
  if (!gesture) { return null }
  const { elements, infos, M } = gesture
  restoreElements()
  gesture = null
  if (isIdentityMatrix(M)) { return null }
  const batch = applyToElements(elements, M, infos)
  return batch.isEmpty() ? null : batch
}

/**
 * Ends the gesture and puts every element back, without history.
 * @returns {void}
 */
export const cancelGroupResize = () => {
  if (!gesture) { return }
  restoreElements()
  gesture = null
}
