/**
 * Snapping and guides (plan v2, section 4.3, lot V2).
 *
 * What is moved, resized or drawn comes to the edges and middles of the
 * visible objects and of the page, to equal spacings between neighbours, to
 * equal sizes, and to the grid, when it is within 6 pixels of the screen. The
 * guides show why, during the gesture only. Holding Ctrl suspends it.
 *
 * The boxes are those of the X, Y, W and H fields: in the coordinates of the
 * drawing, stroke excluded (see drawingBoxOf). A snapped position is the very
 * value of the neighbour, so a drag gives the same SVG as a typed value.
 *
 * The index sorts the lines of the boxes along each axis once, at the start
 * of a gesture; each move then searches it by bisection, in well under 2 ms
 * for 10 000 objects.
 * @module snap
 */

// Within this distance on the screen, in pixels, a line snaps.
export const SNAP_THRESHOLD = 6
// Two values closer than this, in units of the drawing, are the same line.
const SAME = 1e-6

const AXES = {
  x: { pos: 'x', size: 'width', cross: 'y', crossSize: 'height' },
  y: { pos: 'y', size: 'height', cross: 'x', crossSize: 'width' }
}

/**
 * @typedef {object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {boolean} [page] The page: its edges and middle count, not as a neighbour for spacings
 */

/**
 * @typedef {object} Guide
 * @property {"line"|"gap"|"size"} type A line through aligned edges or middles; a spacing; a size
 * @property {"x"|"y"} axis "x": a vertical line, or a horizontal spacing or width
 * @property {number} at For a line, where it is on its axis; else where the segment is on the other axis
 * @property {number} from
 * @property {number} to
 */

/**
 * @param {Float64Array} values Sorted
 * @param {number} value
 * @returns {number} The first index whose value is not below `value`
 */
const lowerBound = (values, value) => {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (values[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * The lines of the boxes along one axis: start, middle and end of each box,
 * sorted, with the box they belong to.
 * @param {Box[]} boxes
 * @param {"x"|"y"} axis
 * @returns {{values: Float64Array, owners: Int32Array}}
 */
const axisLines = (boxes, axis) => {
  const { pos, size } = AXES[axis]
  const entries = []
  boxes.forEach((box, i) => {
    entries.push([box[pos], i], [box[pos] + box[size] / 2, i], [box[pos] + box[size], i])
  })
  entries.sort((a, b) => a[0] - b[0])
  return {
    values: Float64Array.from(entries, (entry) => entry[0]),
    owners: Int32Array.from(entries, (entry) => entry[1])
  }
}

export class SnapIndex {
  /**
   * @param {Box[]} boxes The visible neighbours, and the page
   */
  constructor (boxes) {
    this.boxes = boxes.filter((box) => box && Number.isFinite(box.x) && Number.isFinite(box.y) &&
      Number.isFinite(box.width) && Number.isFinite(box.height))
    this.lines = { x: axisLines(this.boxes, 'x'), y: axisLines(this.boxes, 'y') }
    const objects = this.boxes.filter((box) => !box.page)
    this.sizes = {
      x: Float64Array.from(objects.map((box) => box.width)).sort(),
      y: Float64Array.from(objects.map((box) => box.height)).sort()
    }
    // The neighbours sorted by their start across each axis, for the rows
    // and columns of the spacings.
    this.across = {}
    for (const axis of ['x', 'y']) {
      const { cross, crossSize } = AXES[axis]
      const sorted = [...objects].sort((a, b) => a[cross] - b[cross])
      this.across[axis] = {
        boxes: sorted,
        starts: Float64Array.from(sorted, (box) => box[cross]),
        longest: sorted.reduce((max, box) => Math.max(max, box[crossSize]), 0)
      }
    }
  }

  /**
   * @param {"x"|"y"} axis
   * @param {number} value
   * @param {number} tolerance
   * @returns {number|null} The nearest line within the tolerance
   */
  nearest (axis, value, tolerance) {
    const { values } = this.lines[axis]
    const i = lowerBound(values, value)
    let best = null
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= values.length) continue
      const d = Math.abs(values[j] - value)
      if (d <= tolerance && (best === null || d < Math.abs(best - value))) best = values[j]
    }
    return best
  }

  /**
   * @param {"x"|"y"} axis
   * @param {number} value
   * @returns {Box[]} The boxes with a line at this value
   */
  boxesAt (axis, value) {
    const { values, owners } = this.lines[axis]
    const found = new Set()
    for (let i = lowerBound(values, value - SAME); i < values.length && values[i] <= value + SAME; i++) {
      found.add(this.boxes[owners[i]])
    }
    return [...found]
  }

  /**
   * @param {"x"|"y"} axis
   * @param {number} value
   * @param {number} tolerance
   * @returns {number|null} The nearest width ("x") or height ("y") of a neighbour within the tolerance
   */
  nearestSize (axis, value, tolerance) {
    const values = this.sizes[axis]
    const i = lowerBound(values, value)
    let best = null
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= values.length) continue
      const d = Math.abs(values[j] - value)
      if (d <= tolerance && (best === null || d < Math.abs(best - value))) best = values[j]
    }
    return best
  }

  /**
   * @param {"x"|"y"} axis
   * @param {Box} box
   * @returns {Box[]} The neighbours in the row ("x") or the column ("y") of a box
   */
  row (axis, box) {
    const { cross, crossSize } = AXES[axis]
    const lo = box[cross]
    const hi = box[cross] + box[crossSize]
    const { boxes, starts, longest } = this.across[axis]
    // Only the boxes that start less than the longest one before the row.
    const found = []
    for (let i = lowerBound(starts, lo - longest); i < starts.length && starts[i] < hi; i++) {
      const other = boxes[i]
      if (other[cross] + other[crossSize] > lo) found.push(other)
    }
    return found
  }
}

/**
 * Middle of the overlap of boxes across an axis: where a spacing is drawn.
 * @param {"x"|"y"} axis
 * @param {Box[]} boxes
 * @returns {number}
 */
const crossMiddle = (axis, boxes) => {
  const { cross, crossSize } = AXES[axis]
  const lo = Math.max(...boxes.map((box) => box[cross]))
  const hi = Math.min(...boxes.map((box) => box[cross] + box[crossSize]))
  return lo <= hi ? (lo + hi) / 2 : (Math.min(...boxes.map((box) => box[cross])) + Math.max(...boxes.map((box) => box[cross] + box[crossSize]))) / 2
}

/**
 * Positions of a moved box that give it the same spacing as other
 * neighbours of its row, or the same spacing on both sides. The guides of a
 * position are only drawn up for the one retained.
 * @param {SnapIndex} index
 * @param {"x"|"y"} axis
 * @param {Box} box
 * @returns {{start: number, guides: () => Guide[]}[]}
 */
export const spacingCandidates = (index, axis, box) => {
  const { pos, size } = AXES[axis]
  const row = index.row(axis, box).sort((a, b) => a[pos] - b[pos])
  if (!row.length) return []
  const start = box[pos]
  const end = start + box[size]
  const middle = (start + end) / 2
  let left = null
  let right = null
  for (const other of row) {
    const otherEnd = other[pos] + other[size]
    if (otherEnd <= middle && other[pos] < start && (!left || otherEnd > left[pos] + left[size])) left = other
    if (other[pos] >= middle && otherEnd > end && (!right || other[pos] < right[pos])) right = other
  }
  const gap = (a, b) => ({ type: 'gap', axis, from: a[pos] + a[size], to: b[pos], at: crossMiddle(axis, [a, b]) })
  const candidates = []
  const moved = (at) => ({ ...box, [pos]: at })
  // The same spacing on both sides.
  if (left && right) {
    const room = right[pos] - (left[pos] + left[size]) - box[size]
    if (room > 0) {
      const at = left[pos] + left[size] + room / 2
      candidates.push({ start: at, guides: () => [gap(left, moved(at)), gap(moved(at), right)] })
    }
  }
  // The spacing of two other neighbours of the row, after the left
  // neighbour or before the right one. Not after the first of the pair, nor
  // before the second: the box would be on the other.
  for (let i = 0; i + 1 < row.length; i++) {
    const a = row[i]
    const b = row[i + 1]
    const spacing = b[pos] - (a[pos] + a[size])
    if (spacing <= 0) continue
    if (left && left !== a) {
      const at = left[pos] + left[size] + spacing
      candidates.push({ start: at, guides: () => [gap(a, b), gap(left, moved(at))] })
    }
    if (right && right !== b) {
      const at = right[pos] - spacing - box[size]
      candidates.push({ start: at, guides: () => [gap(a, b), gap(moved(at), right)] })
    }
  }
  return candidates
}

/**
 * The guides of the lines of a box that fall on lines of neighbours.
 * @param {SnapIndex} index
 * @param {"x"|"y"} axis
 * @param {Box} box
 * @param {number[]} values The lines of the box to look at
 * @returns {Guide[]}
 */
export const alignmentGuides = (index, axis, box, values) => {
  const { cross, crossSize } = AXES[axis]
  const guides = []
  const seen = new Set()
  for (const value of values) {
    const others = index.boxesAt(axis, value)
    if (!others.length) continue
    const key = Math.round(value / SAME)
    if (seen.has(key)) continue
    seen.add(key)
    const all = [box, ...others]
    guides.push({
      type: 'line',
      axis,
      at: value,
      from: Math.min(...all.map((b) => b[cross])),
      to: Math.max(...all.map((b) => b[cross] + b[crossSize]))
    })
  }
  return guides
}

/**
 * @param {number} value
 * @param {number} step
 * @returns {number} The nearest line of the grid
 */
const onGrid = (value, step) => Math.round(value / step) * step

/**
 * Snaps one axis of a moved box.
 * @param {SnapIndex} index
 * @param {"x"|"y"} axis
 * @param {Box} frame The box at the start of the gesture
 * @param {number} delta The move asked by the pointer
 * @param {object} options
 * @returns {{delta: number, guides: Guide[]}}
 */
const snapMoveAxis = (index, axis, frame, delta, { tolerance, grid, objects, spacing = true }) => {
  const { pos, size } = AXES[axis]
  // The lines of the box at the start, and where the pointer puts them.
  const lines = [frame[pos], frame[pos] + frame[size] / 2, frame[pos] + frame[size]]
  let best = null
  // `target - origin` is the move: one subtraction, so that the snapped line
  // lands on the very value of its neighbour.
  const consider = (target, origin, rank, guides) => {
    const move = target - origin
    const d = Math.abs(move - delta)
    if (d > tolerance) return
    if (!best || d < best.d - SAME || (Math.abs(d - best.d) <= SAME && rank < best.rank)) {
      best = { d, move, rank, guides }
    }
  }
  if (objects) {
    for (const origin of lines) {
      const target = index.nearest(axis, origin + delta, tolerance)
      if (target !== null) consider(target, origin, 0)
    }
    if (spacing) {
      const box = { ...frame, [pos]: frame[pos] + delta }
      for (const candidate of spacingCandidates(index, axis, box)) {
        consider(candidate.start, frame[pos], 1, candidate.guides)
      }
    }
  }
  if (grid > 0) {
    for (const origin of lines) consider(onGrid(origin + delta, grid), origin, 2)
  }
  const move = best ? best.move : delta
  const box = { ...frame, [pos]: frame[pos] + move }
  const guides = objects
    ? [...alignmentGuides(index, axis, box, lines.map((line) => line + move)), ...(best?.guides?.() ?? [])]
    : []
  return { delta: move, guides }
}

/**
 * Snaps a move.
 * @param {SnapIndex} index
 * @param {Box} frame The box of what is moved, at the start of the gesture
 * @param {number} dx The move asked by the pointer, in units of the drawing
 * @param {number} dy
 * @param {object} options
 * @param {number} options.tolerance In units of the drawing: 6 pixels divided by the zoom
 * @param {number} [options.grid=0] The step of the grid to snap to; 0 for none
 * @param {boolean} [options.objects=true] Snap to the neighbours and the page
 * @returns {{dx: number, dy: number, guides: Guide[]}}
 */
export const snapMove = (index, frame, dx, dy, { tolerance, grid = 0, objects = true, spacing = true }) => {
  // Each axis sees the box where the other axis puts it: its row, its
  // column and its guides are those of where it is now.
  const x = snapMoveAxis(index, 'x', { ...frame, y: frame.y + dy }, dx, { tolerance, grid, objects, spacing })
  const y = snapMoveAxis(index, 'y', { ...frame, x: frame.x + x.delta }, dy, { tolerance, grid, objects, spacing })
  if (y.delta !== dy && x.guides.length) {
    // The guides of x reach the box where y snapped it.
    const again = snapMoveAxis(index, 'x', { ...frame, y: frame.y + y.delta }, dx, { tolerance, grid, objects, spacing })
    return { dx: again.delta, dy: y.delta, guides: [...again.guides, ...y.guides] }
  }
  return { dx: x.delta, dy: y.delta, guides: [...x.guides, ...y.guides] }
}

/**
 * A box after one of its edges moved, or both from the middle.
 * @param {Box} frame
 * @param {"x"|"y"} axis
 * @param {number} move The move of the dragged edge
 * @param {1|-1} side 1: the end edge; -1: the start edge
 * @param {boolean} centered
 * @returns {Box}
 */
const resizeBox = (frame, axis, move, side, centered) => {
  const { pos, size } = AXES[axis]
  const start = frame[pos]
  const end = start + frame[size]
  const s = side > 0 ? start - (centered ? move : 0) : start + move
  const e = side > 0 ? end + move : end - (centered ? move : 0)
  return { ...frame, [pos]: Math.min(s, e), [size]: Math.abs(e - s) }
}

/**
 * Snaps one axis of a resize: the dragged edge, or both edges from the
 * middle, to the lines of the neighbours, to their sizes and to the grid.
 * @param {SnapIndex} index
 * @param {"x"|"y"} axis
 * @param {Box} frame
 * @param {number} delta The move of the dragged edge asked by the pointer
 * @param {1|-1} side 1: the end edge is dragged (east, south); -1: the start edge
 * @param {object} options
 * @returns {{delta: number, guides: Guide[]}}
 */
const snapResizeAxis = (index, axis, frame, delta, side, { tolerance, grid, objects, centered }) => {
  const { pos, size } = AXES[axis]
  const start = frame[pos]
  const end = start + frame[size]
  // Each moving edge, and how it follows the pointer.
  const edges = side > 0 ? [{ origin: end, factor: 1 }] : [{ origin: start, factor: 1 }]
  if (centered) edges.push(side > 0 ? { origin: start, factor: -1 } : { origin: end, factor: -1 })
  const resized = (move) => resizeBox(frame, axis, move, side, centered)
  let best = null
  const consider = (move, rank, guides) => {
    const d = Math.abs(move - delta)
    if (d > tolerance) return
    if (!best || d < best.d - SAME || (Math.abs(d - best.d) <= SAME && rank < best.rank)) {
      best = { d, move, rank, guides }
    }
  }
  for (const { origin, factor } of edges) {
    if (objects) {
      const target = index.nearest(axis, origin + factor * delta, tolerance * Math.abs(factor))
      if (target !== null) consider((target - origin) * factor, 0)
    }
    if (grid > 0) consider((onGrid(origin + factor * delta, grid) - origin) * factor, 2)
  }
  if (objects) {
    // The size of a neighbour.
    const growth = centered ? 2 : 1
    const wanted = frame[size] + growth * delta * (side > 0 ? 1 : -1)
    const same = index.nearestSize(axis, wanted, tolerance * growth)
    if (same !== null) {
      const move = (same - frame[size]) / growth * (side > 0 ? 1 : -1)
      consider(move, 1, () => sizeGuides(index, axis, resized(move), same))
    }
  }
  const move = best ? best.move : delta
  const box = resized(move)
  const guides = objects
    ? [...alignmentGuides(index, axis, box, edges.map(({ origin, factor }) => origin + factor * move)), ...(best?.guides?.() ?? [])]
    : []
  return { delta: move, guides }
}

/**
 * The guides of a size equal to the size of neighbours: the box and each
 * neighbour of that size get a size mark.
 * @param {SnapIndex} index
 * @param {"x"|"y"} axis
 * @param {Box} box
 * @param {number} value
 * @returns {Guide[]}
 */
const sizeGuides = (index, axis, box, value) => {
  const { pos, size, cross } = AXES[axis]
  const mark = (b) => ({ type: 'size', axis, from: b[pos], to: b[pos] + b[size], at: b[cross] })
  return [mark(box), ...index.boxes.filter((b) => !b.page && Math.abs(b[size] - value) <= SAME).map(mark)]
}

/**
 * Snaps a resize by a grip.
 * @param {SnapIndex} index
 * @param {Box} frame The box at the start of the gesture
 * @param {string} mode The grip: "n", "se", "w"...
 * @param {number} dx The move of the pointer, in units of the drawing
 * @param {number} dy
 * @param {object} options
 * @param {number} options.tolerance
 * @param {number} [options.grid=0]
 * @param {boolean} [options.objects=true]
 * @param {boolean} [options.centered=false] Alt: from the middle
 * @param {boolean} [options.proportional=false] Shift: only the first axis snaps, the other follows
 * @returns {{dx: number, dy: number, guides: Guide[]}}
 */
export const snapResize = (index, frame, mode, dx, dy, { tolerance, grid = 0, objects = true, centered = false, proportional = false }) => {
  const options = { tolerance, grid, objects, centered }
  const result = { dx, dy, guides: [] }
  const horizontal = mode.includes('e') ? 1 : (mode.includes('w') ? -1 : 0)
  const vertical = mode.includes('s') ? 1 : (mode.includes('n') ? -1 : 0)
  // As for a move, each axis sees the box resized on the other one.
  const across = vertical ? resizeBox(frame, 'y', dy, vertical, centered) : frame
  if (horizontal) {
    const x = snapResizeAxis(index, 'x', across, dx, horizontal, options)
    result.dx = x.delta
    result.guides.push(...x.guides)
  }
  if (vertical && !(proportional && horizontal)) {
    const along = horizontal ? resizeBox(frame, 'x', result.dx, horizontal, centered) : frame
    const y = snapResizeAxis(index, 'y', along, dy, vertical, options)
    result.dy = y.delta
    result.guides.push(...y.guides)
  }
  return result
}

/**
 * The distances from a selection to another box (lot V2, Alt held over an
 * object): the gaps between them, or, where they overlap, between the edges
 * that face each other. Boxes are stroke excluded, so the distances are
 * those of the X, Y, W and H fields.
 * @param {Box} a The selection
 * @param {Box} b The object under the pointer, or the page
 * @returns {Guide[]}
 */
export const measureGuides = (a, b) => {
  const guides = []
  for (const axis of ['x', 'y']) {
    const { pos, size, cross, crossSize } = AXES[axis]
    const a0 = a[pos]
    const a1 = a0 + a[size]
    const b0 = b[pos]
    const b1 = b0 + b[size]
    const middle = a[cross] + a[crossSize] / 2
    const lo = Math.max(a[cross], b[cross])
    const hi = Math.min(a[cross] + a[crossSize], b[cross] + b[crossSize])
    const between = lo <= hi ? (lo + hi) / 2 : middle
    const add = (from, to, at) => {
      if (to - from > SAME) guides.push({ type: 'measure', axis, from, to, at })
    }
    if (a1 <= b0) {
      add(a1, b0, between)
    } else if (b1 <= a0) {
      add(b1, a0, between)
    } else {
      add(Math.min(a0, b0), Math.max(a0, b0), middle)
      add(Math.min(a1, b1), Math.max(a1, b1), middle)
    }
  }
  return guides
}

/**
 * Snaps a point: a corner of a shape being drawn, a point of a line.
 * @param {SnapIndex} index
 * @param {number} x
 * @param {number} y
 * @param {object} options
 * @returns {{x: number, y: number, guides: Guide[]}}
 */
export const snapPoint = (index, x, y, options) => {
  const frame = { x, y, width: 0, height: 0 }
  // A point has no spacing.
  const result = snapMove(index, frame, 0, 0, { ...options, spacing: false })
  return { x: x + result.dx, y: y + result.dy, guides: result.guides }
}

/**
 * Ports are magnets first (lot V7; plan v2, 2.11): when a port of what moves
 * comes within reach of a port of a symbol that does not, the move puts one
 * on the other, whatever the alignments and the grid would give.
 * @param {Array<{x: number, y: number}>} moving The ports of what moves, at
 *   the start of the gesture
 * @param {Array<{x: number, y: number}>} targets The ports of the other symbols
 * @param {number} dx The move asked by the pointer
 * @param {number} dy
 * @param {number} tolerance In units of the drawing
 * @returns {{dx: number, dy: number, guides: Guide[]}|null} Null when no
 *   port is within reach
 */
export const snapPorts = (moving, targets, dx, dy, tolerance) => {
  let best = null
  for (const p of moving) {
    const x = p.x + dx
    const y = p.y + dy
    for (const t of targets) {
      const d = Math.hypot(t.x - x, t.y - y)
      if (d <= tolerance && (!best || d < best.d)) best = { d, dx: t.x - p.x, dy: t.y - p.y, at: t }
    }
  }
  if (!best) return null
  const { at } = best
  // A cross on the port reached
  const arm = tolerance * 2
  return {
    dx: best.dx,
    dy: best.dy,
    guides: [
      { type: 'line', axis: 'x', at: at.x, from: at.y - arm, to: at.y + arm },
      { type: 'line', axis: 'y', at: at.y, from: at.x - arm, to: at.x + arm }
    ]
  }
}
