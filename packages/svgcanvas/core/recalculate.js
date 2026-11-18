/**
 * Recalculate dimensions and transformations of SVG elements.
 * @module recalculate
 * @license MIT
 */

import { convertToNum } from './units.js'
import {
  getRotationAngle,
  getBBox,
  getHref,
  getRefElem,
  getGradientAttribute,
  findDefs
} from './utilities.js'
import { BatchCommand, ChangeElementCommand, InsertElementCommand } from './history.js'
import { remapElement } from './coords.js'
import {
  isIdentity,
  matrixMultiply,
  transformPoint,
  transformListToTransform,
  getTransformList,
  NEAR_ZERO,
  MATRIX_TOLERANCE,
  getRotationTransformSummary
} from './math.js'
import { mergeDeep } from '../common/util.js'

let svgCanvas

// Elements for which `getBBox` always returns a box.
const ELEMENTS_WITH_BBOX = new Set([
  'a', 'circle', 'ellipse', 'foreignObject', 'g', 'image', 'line', 'path',
  'polygon', 'polyline', 'rect', 'svg', 'text', 'tspan', 'use'
])

const geometryLimitedElements = new Set([
  'circle',
  'ellipse',
  'foreignObject',
  'image',
  'rect'
])

/**
 * Whether the attributes of an element cannot follow a matrix that turns or
 * skews it: the shapes above, and a path that holds arcs, whose radii only
 * follow a scale.
 * @param {Element} selected
 * @returns {boolean}
 */
const isGeometryLimited = (selected) => geometryLimitedElements.has(selected.tagName) ||
  (selected.tagName === 'path' && /a/i.test(selected.getAttribute('d') ?? ''))

// A shear or a rotation left in the matrix, measured against its scale: the
// single precision noise of Firefox (2e-8 for a scale of 1.2) is not one.
const hasOffAxisTransform = (matrix) => {
  const limit = Math.max(NEAR_ZERO, MATRIX_TOLERANCE * Math.hypot(matrix.a, matrix.b, matrix.c, matrix.d))
  return Math.abs(matrix.b) > limit || Math.abs(matrix.c) > limit
}

const appendMatrixTransform = (tlist, svgroot, matrix) => {
  const transform = svgroot.createSVGTransform()
  transform.setMatrix(matrix)
  tlist.appendItem(transform)
}

const getNormalizedRotationCenter = (selected, summary, totalMatrix) => {
  return getTransformedBBoxCenter(selected, totalMatrix) ||
    summary.rotationCenter ||
    { x: 0, y: 0 }
}

const getTransformedBBoxCenter = (selected, totalMatrix) => {
  const box = getBBox(selected)
  if (!box) return null

  return transformPoint(
    box.x + box.width / 2,
    box.y + box.height / 2,
    totalMatrix
  )
}

const normalizeRetainedTransformList = (selected, tlist, svgroot) => {
  if (!tlist) return

  const totalMatrix = transformListToTransform(tlist).matrix
  const summary = getRotationTransformSummary(tlist)
  const { rotationAngle } = summary
  const rotationTransform = svgroot.createSVGTransform()
  let remainingMatrix = totalMatrix

  if (Math.abs(rotationAngle) >= NEAR_ZERO) {
    const center = getNormalizedRotationCenter(selected, summary, totalMatrix)
    rotationTransform.setRotate(rotationAngle, center.x, center.y)
    remainingMatrix = matrixMultiply(rotationTransform.matrix.inverse(), totalMatrix)
  }

  while (tlist.numberOfItems > 0) {
    tlist.removeItem(0)
  }

  if (Math.abs(rotationAngle) >= NEAR_ZERO) {
    tlist.appendItem(rotationTransform)
  }

  if (!isIdentity(remainingMatrix)) {
    appendMatrixTransform(tlist, svgroot, remainingMatrix)
  }
}

const bakeTransformsIntoAttributes = (selected, changes, tlist, svgroot) => {
  if (!tlist?.numberOfItems) return false

  const totalMatrix = transformListToTransform(tlist).matrix
  const summary = getRotationTransformSummary(tlist)
  const { rotationAngle } = summary
  let bakeMatrix = totalMatrix
  let rotationTransform = null

  if (Math.abs(rotationAngle) > NEAR_ZERO) {
    rotationTransform = svgroot.createSVGTransform()
    const center = getNormalizedRotationCenter(selected, summary, totalMatrix)
    rotationTransform.setRotate(rotationAngle, center.x, center.y)
    bakeMatrix = matrixMultiply(rotationTransform.matrix.inverse(), totalMatrix)
  }

  if (isGeometryLimited(selected) && hasOffAxisTransform(bakeMatrix)) {
    normalizeRetainedTransformList(selected, tlist, svgroot)
    return true
  }

  remapElement(selected, changes, bakeMatrix)
  tlist.clear()

  if (rotationTransform) {
    tlist.appendItem(rotationTransform)
  }

  return true
}

const transformListSignature = (tlist) => {
  if (!tlist) return ''
  const parts = []
  for (let i = 0; i < tlist.numberOfItems; i++) {
    const xform = tlist.getItem(i)
    const m = xform.matrix
    parts.push([
      xform.type,
      xform.angle,
      xform.cx,
      xform.cy,
      m.a,
      m.b,
      m.c,
      m.d,
      m.e,
      m.f
    ].map(value => Number.isFinite(value) ? Number(value).toFixed(8) : '').join(','))
  }
  return parts.join('|')
}

const elementTransformStateSignature = (selected, tlist, attributes) => {
  return JSON.stringify([
    transformListSignature(tlist),
    attributes.map(attribute => [attribute, selected.getAttribute(attribute)])
  ])
}

/**
 * Initialize the recalculate module with the SVG canvas.
 * @function module:recalculate.init
 * @param {Object} canvas - The SVG canvas object
 * @returns {void}
 */
export const init = canvas => {
  svgCanvas = canvas
}

export const withStartTransform = (canvas, transform, callback) => {
  const previousTransform = canvas.getStartTransform()
  canvas.setStartTransform(transform)
  try {
    return callback()
  } finally {
    canvas.setStartTransform(previousTransform)
  }
}

/**
 * Updates a `<clipPath>` element's values based on the given translation.
 * @function module:recalculate.updateClipPath
 * @param {string} attr - The clip-path attribute value containing the clipPath's ID
 * @param {number} tx - The translation's x value
 * @param {number} ty - The translation's y value
 * @param {Element} elem - The element referencing the clipPath
 * @returns {string|undefined} The clip-path attribute used after updates.
 */
export const updateClipPath = (attr, tx, ty, elem) => {
  const clipPath = getRefElem(attr)
  if (!clipPath) return undefined
  if (elem && clipPath.id) {
    const svgContent = svgCanvas.getSvgContent?.()
    if (svgContent) {
      const refSelector = `[clip-path="url(#${clipPath.id})"]`
      const users = svgContent.querySelectorAll(refSelector)
      if (users.length > 1) {
        const newClipPath = clipPath.cloneNode(true)
        newClipPath.id = svgCanvas.getNextId()
        findDefs().append(newClipPath)
        elem.setAttribute('clip-path', `url(#${newClipPath.id})`)
        return updateClipPath(`url(#${newClipPath.id})`, tx, ty)
      }
    }
  }
  const path = clipPath.firstElementChild
  if (!path) return attr
  const cpXform = getTransformList(path)
  if (!cpXform) {
    const tag = (path.tagName || '').toLowerCase()
    if (tag === 'rect') {
      const x = convertToNum('x', path.getAttribute('x') || 0) + tx
      const y = convertToNum('y', path.getAttribute('y') || 0) + ty
      path.setAttribute('x', x)
      path.setAttribute('y', y)
    } else if (tag === 'circle' || tag === 'ellipse') {
      const cx = convertToNum('cx', path.getAttribute('cx') || 0) + tx
      const cy = convertToNum('cy', path.getAttribute('cy') || 0) + ty
      path.setAttribute('cx', cx)
      path.setAttribute('cy', cy)
    } else if (tag === 'line') {
      path.setAttribute('x1', convertToNum('x1', path.getAttribute('x1') || 0) + tx)
      path.setAttribute('y1', convertToNum('y1', path.getAttribute('y1') || 0) + ty)
      path.setAttribute('x2', convertToNum('x2', path.getAttribute('x2') || 0) + tx)
      path.setAttribute('y2', convertToNum('y2', path.getAttribute('y2') || 0) + ty)
    } else if (tag === 'polyline' || tag === 'polygon') {
      const points = (path.getAttribute('points') || '').trim()
      if (points) {
        const updated = points.split(/\s+/).map((pair) => {
          const [x, y] = pair.split(',')
          const nx = Number(x) + tx
          const ny = Number(y) + ty
          return `${nx},${ny}`
        })
        path.setAttribute('points', updated.join(' '))
      }
    } else {
      path.setAttribute('transform', `translate(${tx},${ty})`)
    }
    return attr
  }
  if (cpXform.numberOfItems) {
    const translate = svgCanvas.getSvgRoot().createSVGMatrix()
    translate.e = tx
    translate.f = ty
    const combined = matrixMultiply(transformListToTransform(cpXform).matrix, translate)
    const merged = svgCanvas.getSvgRoot().createSVGTransform()
    merged.setMatrix(combined)
    cpXform.clear()
    cpXform.appendItem(merged)
    return attr
  }
  const tag = (path.tagName || '').toLowerCase()
  if ((tag === 'polyline' || tag === 'polygon') && !path.points?.numberOfItems) {
    const points = (path.getAttribute('points') || '').trim()
    if (points) {
      const updated = points.split(/\s+/).map((pair) => {
        const [x, y] = pair.split(',')
        const nx = Number(x) + tx
        const ny = Number(y) + ty
        return `${nx},${ny}`
      })
      path.setAttribute('points', updated.join(' '))
    }
    return
  }
  const newTranslate = svgCanvas.getSvgRoot().createSVGTransform()
  newTranslate.setTranslate(tx, ty)

  cpXform.appendItem(newTranslate)
  recalculateDimensions(path)
  return attr
}

/**
 * Recalculates the dimensions and transformations of a selected element,
 * without its clip path or mask (see recalculateDimensions).
 * @param {Element} selected - The DOM element to recalculate
 * @returns {Command|null} Undo command object with the resulting change, or null if no change
 */
const recalculateGeometry = selected => {
  if (!selected) return null

  if (selected.tagName === 'g' || selected.tagName === 'a') {
    const tlist = getTransformList(selected)
    if (!tlist?.numberOfItems) return null

    const summary = getRotationTransformSummary(tlist)
    if (
      Math.abs(summary.rotationAngle) < NEAR_ZERO &&
      tlist.numberOfItems === 1 &&
      tlist.getItem(0).type === SVGTransform.SVG_TRANSFORM_MATRIX
    ) {
      return null
    }

    const before = transformListSignature(tlist)
    const initial = { transform: svgCanvas.getStartTransform() || '' }
    normalizeRetainedTransformList(selected, tlist, svgCanvas.getSvgRoot())
    if (tlist.numberOfItems === 0) {
      selected.removeAttribute('transform')
    }
    if (transformListSignature(tlist) !== before) {
      const batchCmd = new BatchCommand('Transform')
      batchCmd.addSubCommand(new ChangeElementCommand(selected, initial))
      return batchCmd
    }
    return null
  }

  if (
    (selected.getAttribute?.('clip-path')) &&
    selected.querySelector?.('[clip-path]')
  ) {
    // Keep transforms when clip-paths are present to avoid mutating defs.
    return null
  }
  const svgroot = svgCanvas.getSvgRoot()
  const tlist = getTransformList(selected)

  // Remove any unnecessary transforms (identity matrices, zero-degree rotations)
  if (tlist?.numberOfItems > 0) {
    let k = tlist.numberOfItems
    const noi = k
    while (k--) {
      const xform = tlist.getItem(k)
      if (xform.type === SVGTransform.SVG_TRANSFORM_MATRIX) {
        if (isIdentity(xform.matrix)) {
          if (noi === 1) {
            // Remove the 'transform' attribute if only identity matrix remains
            selected.removeAttribute('transform')
            return null
          }
          tlist.removeItem(k)
        }
      } else if (
        xform.type === SVGTransform.SVG_TRANSFORM_ROTATE &&
        xform.angle === 0
      ) {
        tlist.removeItem(k) // Remove zero-degree rotations
      } else if (
        xform.type === SVGTransform.SVG_TRANSFORM_TRANSLATE &&
        xform.matrix.e === 0 &&
        xform.matrix.f === 0
      ) {
        tlist.removeItem(k) // Remove zero translations
      }
    }

    // End here if all it has is a rotation
    if (tlist.numberOfItems === 1 && getRotationAngle(selected)) {
      return null
    }
  }

  // If this element had no transforms, we are done
  if (!tlist || tlist.numberOfItems === 0) {
    selected.removeAttribute('transform')
    return null
  }

  // Set up undo command
  const batchCmd = new BatchCommand('Transform')

  // Store initial values affected by reducing the transform list
  const changes = {}
  let initial = null
  let attrs = []

  // Determine which attributes to adjust based on element type
  switch (selected.tagName) {
    case 'line':
      attrs = ['x1', 'y1', 'x2', 'y2']
      break
    case 'circle':
      attrs = ['cx', 'cy', 'r']
      break
    case 'ellipse':
      attrs = ['cx', 'cy', 'rx', 'ry']
      break
    case 'foreignObject':
    case 'rect':
    case 'image':
      attrs = ['width', 'height', 'x', 'y']
      break
    case 'text':
    case 'tspan':
      attrs = ['x', 'y']
      break
    case 'polygon':
    case 'polyline': {
      initial = {}
      initial.points = selected.getAttribute('points')
      const list = selected.points
      const len = list.numberOfItems
      changes.points = new Array(len)
      for (let i = 0; i < len; ++i) {
        const pt = list.getItem(i)
        changes.points[i] = { x: pt.x, y: pt.y }
      }
      break
    }
    case 'path':
      initial = {}
      initial.d = selected.getAttribute('d')
      changes.d = selected.getAttribute('d')
      break
  }

  // Collect initial attribute values
  if (attrs.length) {
    attrs.forEach(attr => {
      changes[attr] = convertToNum(attr, selected.getAttribute(attr))
    })
  }

  // If initial values were not set for polygon/polyline/path, create a copy
  if (!initial) {
    initial = mergeDeep({}, changes)
    for (const [attr, val] of Object.entries(initial)) {
      initial[attr] = convertToNum(attr, val)
    }
  }
  // Save the start transform value
  initial.transform = svgCanvas.getStartTransform() || ''

  if (['text', 'tspan', 'use'].includes(selected.tagName)) {
    const before = transformListSignature(tlist)
    normalizeRetainedTransformList(selected, tlist, svgroot)
    if (tlist.numberOfItems === 0) {
      selected.removeAttribute('transform')
    }
    if (transformListSignature(tlist) !== before) {
      batchCmd.addSubCommand(new ChangeElementCommand(selected, initial))
      return batchCmd
    }
    return null
  }

  // Get the bounding box of the element. It is only needed to find the
  // rotation center, or to detect elements without a box (<defs>,
  // <metadata>…). Reading it for every element of a large unrotated
  // selection forced one layout per element, so it is read only then.
  if (getRotationAngle(selected) || !ELEMENTS_WITH_BBOX.has(selected.tagName)) {
    const box = getBBox(selected)
    // Handle elements without a bounding box (e.g., <defs>, <metadata>)
    if (!box && selected.tagName !== 'path') return null
  }

  const geometryAttributes = Object.keys(initial).filter(attribute => attribute !== 'transform')
  const before = elementTransformStateSignature(selected, tlist, geometryAttributes)
  // A flip gives the element a mirrored copy of its gradient (remapElement)
  const paints = { fill: selected.getAttribute('fill'), stroke: selected.getAttribute('stroke') }

  // The list is not empty here: the transforms always go into the attributes
  bakeTransformsIntoAttributes(selected, changes, tlist, svgroot)
  if (tlist.numberOfItems === 0) {
    selected.removeAttribute('transform')
  }
  const after = elementTransformStateSignature(selected, tlist, geometryAttributes)
  if (after === before) {
    return null
  }
  for (const [type, paint] of Object.entries(paints)) {
    const mirrored = selected.getAttribute(type)
    if (mirrored === paint) continue
    // The undo puts the paint back and removes the copy of the gradient
    initial[type] = paint
    batchCmd.addSubCommand(new InsertElementCommand(getRefElem(mirrored)))
  }
  batchCmd.addSubCommand(new ChangeElementCommand(selected, initial))
  return batchCmd
}

// ---------------------------------------------------------------------------
// Clip paths and masks follow their element (decision of 8 November).

// Attributes referencing content drawn in the element's user space.
const CUT_REFERENCES = [
  ['clip-path', 'clipPath', 'clipPathUnits'],
  ['mask', 'mask', 'maskContentUnits']
]

// A gradient in user units follows its element the same way, through its
// gradientTransform; one in bounding box units follows by itself. The
// gradients of a file are not converted to bounding box units any more when
// it is opened: that conversion changed how they look.
const PAINT_ATTRIBUTES = ['fill', 'stroke']
const GRADIENTS = new Set(['linearGradient', 'radialGradient'])

const cleanNumber = (n) => Number(n.toPrecision(12))

/**
 * Writes a matrix as a transform attribute value: a translation when it
 * only moves.
 * @param {SVGMatrix} m
 * @returns {string}
 */
const transformValue = (m) => {
  const [a, b, c, d, e, f] = [m.a, m.b, m.c, m.d, m.e, m.f].map(cleanNumber)
  if (a === 1 && b === 0 && c === 0 && d === 1) { return `translate(${e} ${f})` }
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`
}

/**
 * Puts a matrix in front of an element's transform, or of a gradient's
 * gradientTransform, as one undoable change.
 * @param {Element} elem
 * @param {SVGMatrix} m
 * @param {BatchCommand} batch
 * @returns {void}
 */
const prependTransform = (elem, m, batch) => {
  const name = GRADIENTS.has(elem.tagName) ? 'gradientTransform' : 'transform'
  const old = elem.getAttribute(name)
  if (name === 'gradientTransform' && old === null) {
    // Taken from the gradient it refers to: it becomes its own
    const inherited = getGradientAttribute(elem, name)
    if (inherited !== null) { elem.setAttribute(name, inherited) }
  }
  const tlist = name === 'gradientTransform' ? elem.gradientTransform?.baseVal : getTransformList(elem)
  const current = tlist?.numberOfItems ? transformListToTransform(tlist).matrix : null
  elem.setAttribute(name, transformValue(current ? matrixMultiply(m, current) : m))
  batch.addSubCommand(new ChangeElementCommand(elem, { [name]: old }))
}

/**
 * Whether a gradient that an element paints with is used by anything else:
 * another element, a gradient made from it (href), a stylesheet or an
 * animation. It is then copied before it follows the element.
 * @param {Element} grad
 * @param {Element} elem
 * @returns {boolean}
 */
const isGradientShared = (grad, elem) => {
  const content = svgCanvas.getSvgContent()
  const hash = `#${grad.id}`
  const quoted = hash.replace(/["\\]/g, '\\$&')
  const painters = content.querySelectorAll(`[fill*="${quoted}"],[stroke*="${quoted}"]`)
  if ([...painters].some((other) => other !== elem &&
    PAINT_ATTRIBUTES.some((attr) => getRefElem(other.getAttribute(attr)) === grad))) {
    return true
  }
  if ([...content.querySelectorAll('linearGradient,radialGradient')].some((other) => getHref(other) === hash)) {
    return true
  }
  if ([...content.querySelectorAll('style')].some((style) => style.textContent.includes(hash))) {
    return true
  }
  return Boolean(content.querySelector(`[values*="${quoted}"],[from*="${quoted}"],[to*="${quoted}"],[by*="${quoted}"]`))
}

/**
 * Clip paths and masks of an element whose content is drawn in its user
 * space, read before the element is recalculated. A group keeps its matrix,
 * and a reference in bounding box units follows by itself.
 * @param {Element} elem
 * @returns {{refs: Array<{attr: string, ref: Element}>, before: SVGMatrix}|null}
 */
export const readCutReferences = (elem) => {
  if (!elem?.getAttribute || elem.tagName === 'g' || elem.tagName === 'a') { return null }
  const refs = []
  CUT_REFERENCES.forEach(([attr, tag, units]) => {
    const value = elem.getAttribute(attr)
    if (!value) { return }
    const ref = getRefElem(value)
    if (!ref || ref.tagName !== tag || ref.getAttribute(units) === 'objectBoundingBox') { return }
    refs.push({ attr, ref })
  })
  PAINT_ATTRIBUTES.forEach((attr) => {
    const ref = getRefElem(elem.getAttribute(attr))
    // Fill and stroke with the same gradient: it follows once
    if (!ref || !GRADIENTS.has(ref.tagName) || refs.some((other) => other.ref === ref)) { return }
    if (getGradientAttribute(ref, 'gradientUnits') !== 'userSpaceOnUse') { return }
    refs.push({ attr, ref })
  })
  if (!refs.length) { return null }
  const tlist = getTransformList(elem)
  const before = tlist?.numberOfItems
    ? transformListToTransform(tlist).matrix
    : svgCanvas.getSvgRoot().createSVGMatrix()
  return { refs, before }
}

/**
 * Gives a clip path, a mask or a gradient in user units the change its
 * element took: what the element's transform drew before, its new geometry
 * and transform draw now, and the reference follows the same way. A
 * reference shared with other elements is copied first, so that they keep
 * theirs.
 * @param {Element} elem
 * @param {{refs: Array<{attr: string, ref: Element}>, before: SVGMatrix}} cut
 * @param {module:history.Command|null} cmd - The element's own change
 * @returns {module:history.Command|null}
 */
export const followCutReferences = (elem, cut, cmd) => {
  const tlist = getTransformList(elem)
  const after = tlist?.numberOfItems
    ? transformListToTransform(tlist).matrix
    : svgCanvas.getSvgRoot().createSVGMatrix()
  const change = matrixMultiply(after.inverse(), cut.before)
  if (isIdentity(change)) { return cmd }
  const batch = new BatchCommand('Follow clip path')
  if (cmd) { batch.addSubCommand(cmd) }
  const content = svgCanvas.getSvgContent()
  cut.refs.forEach(({ attr, ref }) => {
    let target = ref
    const gradient = GRADIENTS.has(ref.tagName)
    const shared = gradient
      ? isGradientShared(ref, elem)
      : content.querySelectorAll(`[${attr}="url(#${ref.id})"]`).length > 1
    if (ref.id && shared) {
      target = ref.cloneNode(true)
      target.id = svgCanvas.getNextId()
      target.querySelectorAll('[id]').forEach((child) => { child.id = svgCanvas.getNextId() })
      findDefs().append(target)
      batch.addSubCommand(new InsertElementCommand(target))
      // The fill and the stroke of the element may both use the gradient
      const attrs = gradient
        ? PAINT_ATTRIBUTES.filter((name) => getRefElem(elem.getAttribute(name)) === ref)
        : [attr]
      attrs.forEach((name) => {
        const old = elem.getAttribute(name)
        elem.setAttribute(name, `url(#${target.id})`)
        batch.addSubCommand(new ChangeElementCommand(elem, { [name]: old }))
      })
    }
    if (target.tagName === 'clipPath' || gradient) {
      prependTransform(target, change, batch)
      return
    }
    // A mask has no transform of its own: its content takes the change, and
    // a region given in user units is replaced by the box it now covers.
    Array.from(target.children).forEach((child) => prependTransform(child, change, batch))
    if (target.getAttribute('maskUnits') === 'userSpaceOnUse' && target.hasAttribute('width')) {
      const x = convertToNum('x', target.getAttribute('x') || 0)
      const y = convertToNum('y', target.getAttribute('y') || 0)
      const w = convertToNum('width', target.getAttribute('width'))
      const h = convertToNum('height', target.getAttribute('height'))
      const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) =>
        transformPoint(px, py, change))
      const xs = corners.map((p) => p.x)
      const ys = corners.map((p) => p.y)
      const old = ['x', 'y', 'width', 'height'].reduce((o, name) => ({ ...o, [name]: target.getAttribute(name) }), {})
      target.setAttribute('x', cleanNumber(Math.min(...xs)))
      target.setAttribute('y', cleanNumber(Math.min(...ys)))
      target.setAttribute('width', cleanNumber(Math.max(...xs) - Math.min(...xs)))
      target.setAttribute('height', cleanNumber(Math.max(...ys) - Math.min(...ys)))
      batch.addSubCommand(new ChangeElementCommand(target, old))
    }
  })
  return batch
}

/**
 * Decides how to recalculate the dimensions of a selected element and
 * performs all the necessary steps; a clip path or a mask of the element
 * follows the change of its geometry.
 * @function module:recalculate.recalculateDimensions
 * @param {Element} selected - The DOM element to recalculate
 * @returns {Command|null} Undo command object with the resulting change, or null if no change
 */
export const recalculateDimensions = selected => {
  const cut = readCutReferences(selected)
  const cmd = recalculateGeometry(selected)
  return cut ? followCutReferences(selected, cut, cmd) : cmd
}
