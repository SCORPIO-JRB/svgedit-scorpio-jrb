/**
 * The real geometry of the objects, for the interaction layer (lot V4): the
 * outline drawn on hover, and the rubber band, which takes an object only
 * when its drawing, not its box, touches the band.
 * @module outline
 * @license MIT
 */

/** Elements whose outline is their own geometry. */
export const CONTOUR_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'])
/** Elements tested through their children. */
const CONTAINER_TAGS = new Set(['g', 'a', 'switch'])
/** Points of a full turn of a circle or an ellipse in the rubber band test. */
const TURN_POINTS = 72
/** Distance between two points of a sampled path, in screen pixels. */
const SAMPLE_STEP = 2
const MAX_SAMPLES = 2000

const num = (value) => Math.round(value * 1000) / 1000

/** A length attribute in user units. */
const length = (elem, name) => elem[name]?.baseVal?.value ?? (Number.parseFloat(elem.getAttribute(name)) || 0)

/**
 * Radii of the corners of a rectangle, as the browser draws them.
 * @param {SVGRectElement} elem
 * @returns {{rx: number, ry: number}}
 */
const cornerRadii = (elem) => {
  const read = (name) => {
    const value = elem.getAttribute(name)
    if (value === null || value === 'auto') { return null }
    const number = elem[name]?.baseVal?.value ?? Number.parseFloat(value)
    return Number.isFinite(number) && number > 0 ? number : 0
  }
  let rx = read('rx')
  let ry = read('ry')
  if (rx === null) { rx = ry ?? 0 }
  if (ry === null) { ry = rx }
  return { rx: Math.min(rx, length(elem, 'width') / 2), ry: Math.min(ry, length(elem, 'height') / 2) }
}

/**
 * The outline of a shape as path data, in its own user space.
 * @param {Element} elem - One of CONTOUR_TAGS
 * @returns {string|null} Null when the shape draws nothing
 */
export const contourPath = (elem) => {
  switch (elem.tagName) {
    case 'rect': {
      const x = length(elem, 'x')
      const y = length(elem, 'y')
      const w = length(elem, 'width')
      const h = length(elem, 'height')
      if (!(w > 0) || !(h > 0)) { return null }
      const { rx, ry } = cornerRadii(elem)
      if (!rx || !ry) {
        return `M${num(x)},${num(y)}H${num(x + w)}V${num(y + h)}H${num(x)}Z`
      }
      const arc = (ex, ey) => `A${num(rx)},${num(ry)} 0 0 1 ${num(ex)},${num(ey)}`
      return `M${num(x + rx)},${num(y)}H${num(x + w - rx)}${arc(x + w, y + ry)}V${num(y + h - ry)}${arc(x + w - rx, y + h)}` +
        `H${num(x + rx)}${arc(x, y + h - ry)}V${num(y + ry)}${arc(x + rx, y)}Z`
    }
    case 'circle':
    case 'ellipse': {
      const cx = length(elem, 'cx')
      const cy = length(elem, 'cy')
      const rx = elem.tagName === 'circle' ? length(elem, 'r') : length(elem, 'rx')
      const ry = elem.tagName === 'circle' ? rx : length(elem, 'ry')
      if (!(rx > 0) || !(ry > 0)) { return null }
      const arc = (ex) => `A${num(rx)},${num(ry)} 0 1 0 ${num(ex)},${num(cy)}`
      return `M${num(cx - rx)},${num(cy)}${arc(cx + rx)}${arc(cx - rx)}Z`
    }
    case 'line':
      return `M${num(length(elem, 'x1'))},${num(length(elem, 'y1'))}L${num(length(elem, 'x2'))},${num(length(elem, 'y2'))}`
    case 'polyline':
    case 'polygon': {
      const points = [...(elem.points ?? [])]
      if (!points.length) { return null }
      return 'M' + points.map((p) => `${num(p.x)},${num(p.y)}`).join('L') + (elem.tagName === 'polygon' ? 'Z' : '')
    }
    case 'path':
      return elem.getAttribute('d') || null
    default:
      return null
  }
}

/**
 * The baselines of the lines of a text, as path data in its user space: the
 * hover underlines a text instead of outlining its letters.
 * @param {SVGTextElement} elem
 * @param {number} [maxChars=4000] - Above, the text is read as one line
 * @returns {string|null}
 */
export const baselinesPath = (elem, maxChars = 4000) => {
  const count = elem.getNumberOfChars?.() ?? 0
  if (!count) { return null }
  const lines = []
  if (count > maxChars) {
    const box = elem.getBBox()
    lines.push({ y: box.y + box.height, x1: box.x, x2: box.x + box.width })
  } else {
    let line = null
    for (let i = 0; i < count; i++) {
      let start
      let end
      try {
        start = elem.getStartPositionOfChar(i)
        end = elem.getEndPositionOfChar(i)
      } catch (e) {
        continue
      }
      // A new line begins where the baseline moves.
      if (!line || Math.abs(start.y - line.y) > 0.01) {
        line = { y: start.y, x1: Math.min(start.x, end.x), x2: Math.max(start.x, end.x) }
        lines.push(line)
      } else {
        line.x1 = Math.min(line.x1, start.x, end.x)
        line.x2 = Math.max(line.x2, start.x, end.x)
      }
    }
  }
  const drawn = lines.filter((line) => line.x2 > line.x1)
  if (!drawn.length) { return null }
  return drawn.map((line) => `M${num(line.x1)},${num(line.y)}H${num(line.x2)}`).join('')
}

/**
 * The matrix from the user space of an element to that of another one.
 * @param {Element} elem
 * @param {Element} target
 * @returns {DOMMatrix|SVGMatrix|null}
 */
export const matrixBetween = (elem, target) => {
  const from = elem.getScreenCTM?.()
  const to = target.getScreenCTM?.()
  if (!from || !to) { return null }
  return to.inverse().multiply(from)
}

/**
 * @param {DOMMatrix|SVGMatrix} m
 * @returns {string} The matrix as a transform attribute
 */
export const matrixAttribute = (m) => `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.round(v * 1e6) / 1e6).join(',')})`

const scaleOf = (m) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1

const isPainted = (value) => Boolean(value) && value !== 'none'

/**
 * Lines of the outline of a shape, in its user space.
 * @param {Element} elem
 * @param {number} step - Sampling step of a path, in user units
 * @returns {{lines: number[][][], closed: boolean}|null}
 */
const shapeLines = (elem, step) => {
  switch (elem.tagName) {
    case 'rect': {
      const x = length(elem, 'x')
      const y = length(elem, 'y')
      const w = length(elem, 'width')
      const h = length(elem, 'height')
      if (!(w > 0) || !(h > 0)) { return null }
      const { rx, ry } = cornerRadii(elem)
      if (!rx || !ry) {
        return { lines: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]], closed: true }
      }
      const points = []
      const corner = (cx, cy, from) => {
        for (let i = 0; i <= 8; i++) {
          const angle = (from + i * 90 / 8) * Math.PI / 180
          points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)])
        }
      }
      corner(x + w - rx, y + ry, -90)
      corner(x + w - rx, y + h - ry, 0)
      corner(x + rx, y + h - ry, 90)
      corner(x + rx, y + ry, 180)
      points.push(points[0])
      return { lines: [points], closed: true }
    }
    case 'circle':
    case 'ellipse': {
      const cx = length(elem, 'cx')
      const cy = length(elem, 'cy')
      const rx = elem.tagName === 'circle' ? length(elem, 'r') : length(elem, 'rx')
      const ry = elem.tagName === 'circle' ? rx : length(elem, 'ry')
      if (!(rx > 0) || !(ry > 0)) { return null }
      const points = []
      for (let i = 0; i <= TURN_POINTS; i++) {
        const angle = i * 2 * Math.PI / TURN_POINTS
        points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)])
      }
      return { lines: [points], closed: true }
    }
    case 'line':
      return {
        lines: [[[length(elem, 'x1'), length(elem, 'y1')], [length(elem, 'x2'), length(elem, 'y2')]]],
        closed: false
      }
    case 'polyline':
    case 'polygon': {
      const points = [...(elem.points ?? [])].map((p) => [p.x, p.y])
      if (!points.length) { return null }
      if (elem.tagName === 'polygon') { points.push(points[0]) }
      return { lines: [points], closed: elem.tagName === 'polygon' }
    }
    case 'path': {
      const total = elem.getTotalLength?.()
      if (!(total > 0)) { return null }
      const count = Math.min(MAX_SAMPLES, Math.max(8, Math.ceil(total / step)))
      const gap = total / count
      const lines = []
      let line = []
      let previous = null
      for (let i = 0; i <= count; i++) {
        const point = elem.getPointAtLength(i * gap)
        // A jump longer than the step is a move to another subpath, not a line.
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) > gap * 1.5 + 1e-9) {
          lines.push(line)
          line = []
        }
        line.push([point.x, point.y])
        previous = point
      }
      lines.push(line)
      return { lines, closed: /z\s*$/i.test(elem.getAttribute('d') || '') }
    }
    default:
      return null
  }
}

/** Whether the segment ab meets the rectangle (Liang-Barsky clipping). */
const segmentMeetsRect = (ax, ay, bx, by, rect) => {
  const { x, y, width, height } = rect
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay
  const edges = [[-dx, ax - x], [dx, x + width - ax], [-dy, ay - y], [dy, y + height - ay]]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) { return false }
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) { return false }
        if (t > t0) { t0 = t }
      } else {
        if (t < t0) { return false }
        if (t < t1) { t1 = t }
      }
    }
  }
  return true
}

/**
 * Whether the drawing of an element meets a rectangle: its outline crosses
 * the rectangle, or its fill holds it. Containers are tested through their
 * children; texts, images, symbols and foreign objects through their box.
 * @function module:outline.geometryMeetsRect
 * @param {Element} elem
 * @param {{x: number, y: number, width: number, height: number}} rect - In
 *   the user space of `space`
 * @param {Element} space - The element whose user space the rectangle is in
 * @param {Map<Element, Object>} [cache] - Outlines already read, kept for
 *   the length of a gesture
 * @returns {boolean}
 */
export const geometryMeetsRect = (elem, rect, space, cache = new Map()) => {
  if (elem.nodeType !== 1) { return false }
  if (CONTAINER_TAGS.has(elem.tagName)) {
    return [...elem.children].some((child) => child.getBBox && geometryMeetsRect(child, rect, space, cache))
  }
  if (typeof elem.getBBox !== 'function' || ['title', 'desc', 'defs', 'metadata', 'style', 'script'].includes(elem.tagName)) {
    return false
  }
  let entry = cache.get(elem)
  if (!entry) {
    entry = readOutline(elem, space)
    cache.set(elem, entry)
  }
  if (!entry) { return false }
  const zone = entry.pad
    ? { x: rect.x - entry.pad, y: rect.y - entry.pad, width: rect.width + 2 * entry.pad, height: rect.height + 2 * entry.pad }
    : rect
  for (const line of entry.lines) {
    if (line.length === 1 && segmentMeetsRect(line[0][0], line[0][1], line[0][0], line[0][1], zone)) { return true }
    for (let i = 1; i < line.length; i++) {
      if (segmentMeetsRect(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], zone)) { return true }
    }
  }
  // No outline crosses it: the rectangle may still lie inside the fill.
  if (entry.filled) {
    const center = new DOMPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).matrixTransform(entry.inverse)
    if (entry.box) {
      const { x, y, width, height } = entry.box
      return center.x >= x && center.x <= x + width && center.y >= y && center.y <= y + height
    }
    try {
      return elem.isPointInFill(center)
    } catch (e) {
      return false
    }
  }
  return false
}

/**
 * The outline of an element in the user space of `space`.
 * @param {Element} elem
 * @param {Element} space
 * @returns {{lines: number[][][], filled: boolean, pad: number, inverse: DOMMatrix, box?: Object}|null}
 */
const readOutline = (elem, space) => {
  const m = matrixBetween(elem, space)
  if (!m) { return null }
  const scale = scaleOf(m)
  const toSpace = (points) => points.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f])
  let shape = null
  let box = null
  if (CONTOUR_TAGS.has(elem.tagName)) {
    // Steps of about two pixels on the screen.
    const screen = scaleOf(elem.getScreenCTM())
    shape = shapeLines(elem, SAMPLE_STEP / (screen || 1))
  }
  if (!shape) {
    const bbox = elem.getBBox()
    if (!bbox || (!bbox.width && !bbox.height)) { return null }
    box = { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height }
    const { x, y, width, height } = box
    shape = { lines: [[[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]]], closed: true }
  }
  let filled = Boolean(box)
  let pad = 0
  if (!box) {
    const style = getComputedStyle(elem)
    filled = shape.closed || elem.tagName === 'path' || elem.tagName === 'polyline'
    filled = filled && isPainted(style.fill)
    if (isPainted(style.stroke)) {
      const width = Number.parseFloat(style.strokeWidth)
      if (width > 0) { pad = width / 2 * scale }
    }
  }
  return { lines: shape.lines.map(toSpace), filled, pad, inverse: m.inverse(), box }
}
