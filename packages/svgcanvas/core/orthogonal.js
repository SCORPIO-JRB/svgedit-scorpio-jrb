/**
 * Orthogonal routing (lot V7; plan v2, section 2.11, OrthogonalRouter): the
 * path at right angles of a connector between two ports. Pure functions,
 * without the DOM.
 *
 * The route leaves each port in its direction for a stub, then joins the two
 * stubs by horizontal and vertical segments that go round the boxes of the
 * two equipments (and of other obstacles), with as few bends as possible:
 * a search (A*) on the sparse grid of the coordinates that matter (ports,
 * stubs, sides of the boxes widened by a margin, middles between them).
 * When nothing can go round, it falls back on a route with a middle bend.
 *
 * A route the user has shaped (by dragging a segment) is kept: when an end
 * moves, only the segments next to it follow (see followEnds).
 * @module orthogonal
 */

/** Unit vectors of the directions. */
const VECTORS = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1]
}

/** Length of the stub that leaves a port, in units of the drawing. */
export const STUB = 20
/** Space kept around the boxes. */
export const MARGIN = 10
/** Cost of a bend, in units of length. */
const BEND = 40

const EPSILON = 1e-6
const same = (a, b) => Math.abs(a - b) < EPSILON

/**
 * @typedef {object} End
 * @property {number} x
 * @property {number} y
 * @property {"left"|"right"|"up"|"down"} dir The direction a pipe leaves it in
 * @property {{x: number, y: number, width: number, height: number}|null} [box]
 *   The box of its equipment, which the route goes round
 */

/**
 * @param {{x: number, y: number}[]} points
 * @returns {{x: number, y: number}[]} The points, without repeats nor points
 *   in the middle of a straight line
 */
export const simplify = (points) => {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && same(last.x, p.x) && same(last.y, p.y)) continue
    out.push({ x: p.x, y: p.y })
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3)
      const collinear = (same(a.x, b.x) && same(b.x, c.x)) || (same(a.y, b.y) && same(b.y, c.y))
      if (!collinear) break
      out.splice(out.length - 2, 1)
    }
  }
  return out
}

/**
 * @param {{x: number, y: number}[]} points
 * @returns {boolean} Whether every segment is horizontal or vertical
 */
export const isOrthogonal = (points) => points.every((p, i) => i === 0 ||
  same(p.x, points[i - 1].x) || same(p.y, points[i - 1].y))

/**
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {number} margin
 * @returns {{left: number, top: number, right: number, bottom: number}}
 */
const widen = (box, margin) => ({
  left: box.x - margin,
  top: box.y - margin,
  right: box.x + box.width + margin,
  bottom: box.y + box.height + margin
})

/**
 * Whether a horizontal or vertical segment goes through the inside of a box
 * (its edges are allowed).
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {{left: number, top: number, right: number, bottom: number}} r
 * @returns {boolean}
 */
const crosses = (x1, y1, x2, y2, r) => {
  if (same(y1, y2)) {
    if (y1 <= r.top + EPSILON || y1 >= r.bottom - EPSILON) return false
    return Math.max(x1, x2) > r.left + EPSILON && Math.min(x1, x2) < r.right - EPSILON
  }
  if (x1 <= r.left + EPSILON || x1 >= r.right - EPSILON) return false
  return Math.max(y1, y2) > r.top + EPSILON && Math.min(y1, y2) < r.bottom - EPSILON
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{left: number, top: number, right: number, bottom: number}} r
 * @returns {boolean} Strictly inside
 */
const inside = (x, y, r) => x > r.left + EPSILON && x < r.right - EPSILON && y > r.top + EPSILON && y < r.bottom - EPSILON

/**
 * @param {End} end
 * @param {number} stub
 * @returns {{x: number, y: number}} The end of the stub
 */
const stubOf = (end, stub) => {
  const [vx, vy] = VECTORS[end.dir] ?? [0, 0]
  return { x: end.x + vx * stub, y: end.y + vy * stub }
}

/**
 * A route with one or two bends between the ends of two stubs, when the
 * search finds nothing.
 * @param {{x: number, y: number}} a
 * @param {string} dirA
 * @param {{x: number, y: number}} b
 * @param {(v: number) => number} round
 * @returns {{x: number, y: number}[]}
 */
const fallback = (a, dirA, b, round) => {
  if (dirA === 'left' || dirA === 'right') {
    const mx = round((a.x + b.x) / 2)
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b]
  }
  const my = round((a.y + b.y) / 2)
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b]
}

/**
 * The orthogonal route between two ports.
 * @param {End} start
 * @param {End} end
 * @param {object} [options]
 * @param {number} [options.stub=STUB]
 * @param {number} [options.margin=MARGIN]
 * @param {number} [options.grid=0] The step of the grid the free coordinates
 *   are rounded to, 0 for none
 * @param {Array<{x: number, y: number, width: number, height: number}>} [options.obstacles]
 *   Other boxes not to cross (their edges may be followed)
 * @returns {{x: number, y: number}[]} From the start to the end
 */
export const route = (start, end, { stub = STUB, margin = MARGIN, grid = 0, obstacles = [] } = {}) => {
  const round = (v) => (grid > 0 ? Math.round(v / grid) * grid : Math.round(v * 2) / 2)
  const s0 = stubOf(start, stub)
  const e0 = stubOf(end, stub)
  // The two equipments are gone round at a distance; the others only not
  // crossed (a probe sits on its pipe, against the edge of its box).
  const boxes = [
    ...[start.box, end.box].filter(Boolean).map((box) => widen(box, margin)),
    ...obstacles.filter(Boolean).map((box) => widen(box, 0))
  ]
  // A stub that ends inside a box (equipments too close): no search.
  const blocked = (p) => boxes.some((r) => inside(p.x, p.y, r))

  const xs = new Set([s0.x, e0.x, round((s0.x + e0.x) / 2)])
  const ys = new Set([s0.y, e0.y, round((s0.y + e0.y) / 2)])
  for (const r of boxes) {
    xs.add(r.left)
    xs.add(r.right)
    ys.add(r.top)
    ys.add(r.bottom)
  }
  // Between two boxes, the middle of the gap.
  const sortedX = [...xs].sort((a, b) => a - b)
  const sortedY = [...ys].sort((a, b) => a - b)
  for (let i = 1; i < sortedX.length; i++) xs.add(round((sortedX[i - 1] + sortedX[i]) / 2))
  for (let i = 1; i < sortedY.length; i++) ys.add(round((sortedY[i - 1] + sortedY[i]) / 2))
  const X = [...xs].sort((a, b) => a - b)
  const Y = [...ys].sort((a, b) => a - b)

  let path = null
  if (!blocked(s0) && !blocked(e0)) path = search(X, Y, s0, start.dir, e0, end.dir, boxes)
  const middle = path ?? fallback(s0, start.dir, e0, round)
  return simplify([{ x: start.x, y: start.y }, ...middle, { x: end.x, y: end.y }])
}

/** Direction of a move between two points of the grid. */
const DIRS = ['left', 'right', 'up', 'down']
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' }

/**
 * A* on the grid X × Y, from s0 (reached going `dirIn`) to e0 (left going
 * towards the end port, against `endDir`). State: a node and the direction
 * it was reached in; a turn costs BEND, a U-turn is not allowed.
 * @param {number[]} X
 * @param {number[]} Y
 * @param {{x: number, y: number}} s0
 * @param {string} dirIn
 * @param {{x: number, y: number}} e0
 * @param {string} endDir
 * @param {Array<{left: number, top: number, right: number, bottom: number}>} boxes
 * @returns {{x: number, y: number}[]|null}
 */
const search = (X, Y, s0, dirIn, e0, endDir, boxes) => {
  const ix = new Map(X.map((v, i) => [v, i]))
  const iy = new Map(Y.map((v, i) => [v, i]))
  const free = (i, j) => !boxes.some((r) => inside(X[i], Y[j], r))
  const start = [ix.get(s0.x), iy.get(s0.y)]
  const goal = [ix.get(e0.x), iy.get(e0.y)]
  if (start.includes(undefined) || goal.includes(undefined)) return null
  // The last move, from e0 to the end port, goes against endDir.
  const lastMove = OPPOSITE[endDir]
  const midX = (s0.x + e0.x) / 2
  const midY = (s0.y + e0.y) / 2
  const key = (i, j, d) => `${i},${j},${d}`
  const h = (i, j) => Math.abs(X[i] - X[goal[0]]) + Math.abs(Y[j] - Y[goal[1]])
  const open = [{ i: start[0], j: start[1], d: dirIn, g: 0, f: h(start[0], start[1]), prev: null }]
  const best = new Map([[key(start[0], start[1], dirIn), 0]])
  let guard = 0
  while (open.length && guard++ < 20000) {
    // The open list is small: a linear search for the lowest f is enough.
    let k = 0
    for (let n = 1; n < open.length; n++) if (open[n].f < open[k].f) k = n
    const node = open.splice(k, 1)[0]
    if (node.final) {
      const points = []
      for (let n = node.prev; n; n = n.prev) points.unshift({ x: X[n.i], y: Y[n.j] })
      return points
    }
    if (node.i === goal[0] && node.j === goal[1] && node.d !== OPPOSITE[lastMove]) {
      // The way to the end port: straight on, or one more bend.
      const total = node.g + (node.d === lastMove ? 0 : BEND)
      open.push({ final: true, f: total, prev: node })
    }
    for (const d of DIRS) {
      if (d === OPPOSITE[node.d]) continue
      const [vx, vy] = VECTORS[d]
      const ni = node.i + vx
      const nj = node.j + vy
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue
      if (!free(ni, nj) && !(ni === goal[0] && nj === goal[1])) continue
      if (boxes.some((r) => crosses(X[node.i], Y[node.j], X[ni], Y[nj], r))) continue
      // A bend costs BEND, and a little more far from the middle of the two
      // stubs: of two routes alike, the one that bends in the middle wins.
      const turn = d === node.d ? 0 : BEND + 0.001 * (Math.abs(X[node.i] - midX) + Math.abs(Y[node.j] - midY))
      const g = node.g + Math.abs(X[ni] - X[node.i]) + Math.abs(Y[nj] - Y[node.j]) + turn
      const k2 = key(ni, nj, d)
      if (best.has(k2) && best.get(k2) <= g) continue
      best.set(k2, g)
      open.push({ i: ni, j: nj, d, g, f: g + h(ni, nj), prev: node })
    }
  }
  return null
}

/**
 * A route the user has shaped follows its ends: the first and the last
 * point take the new ports, and the point after (before) them moves on the
 * axis of the stub so that the segments stay at right angles. When an end
 * now leaves on the other axis (the equipment turned), the shape cannot be
 * kept: null, for a new automatic route.
 * @param {{x: number, y: number}[]} points The current route
 * @param {End} start
 * @param {End} end
 * @returns {{x: number, y: number}[]|null}
 */
export const followEnds = (points, start, end) => {
  const pts = simplify(points)
  if (pts.length < 4) return null
  const horizontal = (dir) => dir === 'left' || dir === 'right'
  const firstHorizontal = same(pts[0].y, pts[1].y) && !same(pts[0].x, pts[1].x)
  const lastHorizontal = same(pts[pts.length - 1].y, pts[pts.length - 2].y) && !same(pts[pts.length - 1].x, pts[pts.length - 2].x)
  if (firstHorizontal !== horizontal(start.dir) || lastHorizontal !== horizontal(end.dir)) return null
  const out = pts.map((p) => ({ ...p }))
  out[0] = { x: start.x, y: start.y }
  if (horizontal(start.dir)) out[1].y = start.y
  else out[1].x = start.x
  const n = out.length - 1
  out[n] = { x: end.x, y: end.y }
  if (horizontal(end.dir)) out[n - 1].y = end.y
  else out[n - 1].x = end.x
  return isOrthogonal(out) ? simplify(out) : null
}

/**
 * Moves one segment of a route across its direction (the elbows on either
 * side follow). The first and the last segment, which hold the ports, do
 * not move.
 * @param {{x: number, y: number}[]} points
 * @param {number} index Of the segment, from points[index] to points[index + 1]
 * @param {number} to The new x of a vertical segment, y of a horizontal one
 * @returns {{x: number, y: number}[]|null} Null when the segment cannot move
 */
export const moveSegment = (points, index, to) => {
  if (index <= 0 || index >= points.length - 2) return null
  const out = points.map((p) => ({ ...p }))
  const a = out[index]
  const b = out[index + 1]
  if (same(a.x, b.x)) {
    a.x = to
    b.x = to
  } else {
    a.y = to
    b.y = to
  }
  return out
}

/**
 * @param {{x: number, y: number}[]} points
 * @returns {Array<{index: number, x: number, y: number, vertical: boolean}>}
 *   The middle of each segment that can move (not the first nor the last)
 */
export const movableSegments = (points) => {
  const out = []
  for (let i = 1; i < points.length - 2; i++) {
    const a = points[i]
    const b = points[i + 1]
    out.push({ index: i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, vertical: same(a.x, b.x) })
  }
  return out
}

/**
 * @param {string} text The `points` of a polyline
 * @returns {{x: number, y: number}[]}
 */
export const parsePoints = (text) => {
  const nums = String(text ?? '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite)
  const out = []
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] })
  return out
}

/**
 * @param {{x: number, y: number}[]} points
 * @returns {string} The `points` of a polyline, two decimals at most
 */
export const formatPoints = (points) => points
  .map((p) => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`)
  .join(' ')
