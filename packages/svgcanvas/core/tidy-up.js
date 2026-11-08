/**
 * Tidy up ("Ranger"): a selection laid out roughly in a row, a column or a
 * grid becomes a regular one. The gaps are the most frequent gap between
 * neighbors, or a spacing given by the user; objects keep their size and
 * their order, and the top left corner of the selection stays in place.
 * Within a row, objects are aligned on their top; within a column, on their
 * left; in a grid, each object takes the top left corner of its cell.
 * @module tidy-up
 * @license MIT
 */

/**
 * @typedef {object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

const AXES = {
  x: { pos: 'x', size: 'width' },
  y: { pos: 'y', size: 'height' }
}

/**
 * Groups boxes into bands along an axis: rows for `y`, columns for `x`. Taken
 * in the order of their start, a box joins the current band when it overlaps
 * every box of that band; so a tall box does not merge two rows.
 * @param {Box[]} boxes
 * @param {"x"|"y"} axis
 * @returns {number[][]} Indexes of the boxes of each band, bands in order
 */
export const bandsOf = (boxes, axis) => {
  const { pos, size } = AXES[axis]
  const order = boxes.map((box, i) => i).sort((i, j) => boxes[i][pos] - boxes[j][pos] || i - j)
  const bands = []
  let band = null
  let coreEnd = -Infinity
  order.forEach((i) => {
    const start = boxes[i][pos]
    const end = start + boxes[i][size]
    // The boxes are taken by start: the box overlaps the common part of the
    // band when it starts before that part ends.
    if (band && start < coreEnd) {
      band.push(i)
      coreEnd = Math.min(coreEnd, end)
    } else {
      band = [i]
      bands.push(band)
      coreEnd = end
    }
  })
  return bands
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Most frequent gap: the gaps are counted to the nearest unit, and the
 * median of the most frequent ones is kept, so that equal gaps come back
 * unchanged. The median of all the gaps when none repeats. Never negative:
 * tidied objects do not overlap.
 * @param {number[]} gaps
 * @returns {number}
 */
export const usualGap = (gaps) => {
  if (!gaps.length) { return 0 }
  const buckets = new Map()
  gaps.forEach((gap) => {
    const key = Math.round(gap)
    if (!buckets.has(key)) { buckets.set(key, []) }
    buckets.get(key).push(gap)
  })
  let best = null
  let bestKey = null
  buckets.forEach((bucket, key) => {
    // Ties go to the smaller gap.
    if (!best || bucket.length > best.length || (bucket.length === best.length && key < bestKey)) {
      best = bucket
      bestKey = key
    }
  })
  return Math.max(0, best.length < 2 ? median(gaps) : median(best))
}

/**
 * Gaps between neighbors along an axis, within each band.
 * @param {Box[]} boxes
 * @param {number[][]} bands
 * @param {"x"|"y"} axis - Axis along which the neighbors follow each other
 * @returns {number[]}
 */
const gapsWithin = (boxes, bands, axis) => {
  const { pos, size } = AXES[axis]
  const gaps = []
  bands.forEach((band) => {
    const sorted = [...band].sort((i, j) => boxes[i][pos] - boxes[j][pos])
    for (let n = 1; n < sorted.length; n++) {
      const previous = boxes[sorted[n - 1]]
      gaps.push(boxes[sorted[n]][pos] - (previous[pos] + previous[size]))
    }
  })
  return gaps
}

/**
 * Cell of each box in a grid: its row and its column. When two boxes fall in
 * the same cell, columns follow the order of the boxes within their row.
 * @param {Box[]} boxes
 * @param {number[][]} rows
 * @param {number[][]} columns
 * @returns {{row: number[], col: number[], cols: number}}
 */
const cellsOf = (boxes, rows, columns) => {
  const row = []
  const col = []
  rows.forEach((band, r) => band.forEach((i) => { row[i] = r }))
  columns.forEach((band, c) => band.forEach((i) => { col[i] = c }))
  const taken = new Set()
  const clash = boxes.some((box, i) => {
    const key = `${row[i]},${col[i]}`
    if (taken.has(key)) { return true }
    taken.add(key)
    return false
  })
  if (!clash) { return { row, col, cols: columns.length } }
  let cols = 0
  rows.forEach((band) => {
    const sorted = [...band].sort((i, j) => boxes[i].x - boxes[j].x)
    sorted.forEach((i, c) => { col[i] = c })
    cols = Math.max(cols, sorted.length)
  })
  return { row, col, cols }
}

/**
 * Places boxes in a regular row, column or grid.
 * @param {Box[]} boxes
 * @param {PlainObject} [options]
 * @param {number|null} [options.spacing] - Gap between neighbors; the most
 *   frequent gap of each axis when missing
 * @returns {{layout: "row"|"column"|"grid"|"none", positions: Array<{x: number, y: number}>}}
 *   The new top left corner of each box
 */
export const tidyUpLayout = (boxes, { spacing = null } = {}) => {
  if (boxes.length < 2) {
    return { layout: 'none', positions: boxes.map(({ x, y }) => ({ x, y })) }
  }
  const imposed = Number.isFinite(spacing) ? spacing : null
  const rows = bandsOf(boxes, 'y')
  const columns = bandsOf(boxes, 'x')
  const originX = Math.min(...boxes.map((box) => box.x))
  const originY = Math.min(...boxes.map((box) => box.y))
  const positions = []

  if (rows.length === 1 || columns.length === 1) {
    // A row, or a column: one axis of neighbors, aligned on the other.
    // Boxes that all overlap each other follow their widest spread.
    const spread = (axis) => {
      const { pos, size } = AXES[axis]
      const centers = boxes.map((box) => box[pos] + box[size] / 2)
      return Math.max(...centers) - Math.min(...centers)
    }
    const isRow = rows.length === 1 && (columns.length > 1 || spread('x') >= spread('y'))
    const axis = isRow ? 'x' : 'y'
    const { pos, size } = AXES[axis]
    const gap = imposed ?? usualGap(gapsWithin(boxes, [boxes.map((box, i) => i)], axis))
    const order = boxes.map((box, i) => i).sort((i, j) => boxes[i][pos] - boxes[j][pos] || i - j)
    let next = isRow ? originX : originY
    order.forEach((i) => {
      positions[i] = isRow ? { x: next, y: originY } : { x: originX, y: next }
      next += boxes[i][size] + gap
    })
    return { layout: isRow ? 'row' : 'column', positions }
  }

  const { row, col, cols } = cellsOf(boxes, rows, columns)
  const colWidths = Array(cols).fill(0)
  const rowHeights = Array(rows.length).fill(0)
  boxes.forEach((box, i) => {
    colWidths[col[i]] = Math.max(colWidths[col[i]], box.width)
    rowHeights[row[i]] = Math.max(rowHeights[row[i]], box.height)
  })
  // A gap runs from the end of a cell to the next object of its row (or of
  // its column): a narrow object in a wide column does not widen it.
  const cellGaps = (axis) => {
    const index = axis === 'x' ? col : row
    const sizes = axis === 'x' ? colWidths : rowHeights
    const { pos } = AXES[axis]
    const gaps = []
    const lines = new Map()
    boxes.forEach((box, i) => {
      const line = axis === 'x' ? row[i] : col[i]
      if (!lines.has(line)) { lines.set(line, []) }
      lines.get(line).push(i)
    })
    lines.forEach((items) => {
      items.sort((i, j) => index[i] - index[j])
      for (let n = 1; n < items.length; n++) {
        const previous = items[n - 1]
        const current = items[n]
        if (index[current] !== index[previous] + 1) { continue }
        gaps.push(boxes[current][pos] - (boxes[previous][pos] + sizes[index[previous]]))
      }
    })
    return gaps
  }
  const gapX = imposed ?? usualGap(cellGaps('x'))
  const gapY = imposed ?? usualGap(cellGaps('y'))
  const cellX = []
  const cellY = []
  colWidths.reduce((x, width, c) => { cellX[c] = x; return x + width + gapX }, originX)
  rowHeights.reduce((y, height, r) => { cellY[r] = y; return y + height + gapY }, originY)
  boxes.forEach((box, i) => {
    positions[i] = { x: cellX[col[i]], y: cellY[row[i]] }
  })
  return { layout: 'grid', positions }
}
