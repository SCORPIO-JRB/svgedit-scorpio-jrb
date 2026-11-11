/**
 * Rounded corners (lot Coins), as a geometry free of the DOM.
 *
 * A corner is a vertex between two straight sides: `vertex`, the unit
 * vectors `a` and `b` from the vertex toward the two sides, its `radius` and
 * the largest radius it takes, `max`. Rounding it replaces the vertex by an
 * arc of circle tangent to both sides (a fillet): the sides are cut at the
 * distance `radius / tan(θ/2)` from the vertex, θ being the angle of the
 * corner, and the centre of the arc is on the bisector at
 * `radius / sin(θ/2)`.
 *
 * A path is read into a skeleton: each fillet already in it (an arc of circle
 * between two lines that it is tangent to) is folded back into the vertex it
 * rounds, with its radius. The skeleton is then unfolded with new radii, so
 * that a corner rounded once can be rounded again, or made sharp.
 * @module corners
 */

import { arcCenter } from './path-points.js'

const EPSILON = 1e-9
// A corner flatter than this (|a + b|) is no corner, a spike sharper than
// this (|a - b|) cannot be rounded: about 1° either way.
const FLAT = 0.02
// Tolerance on the direction of a side along the tangent of a fillet (cosine).
const ALIGNED = 0.9995

const minus = (p, q) => ({ x: p.x - q.x, y: p.y - q.y })
const length = (v) => Math.hypot(v.x, v.y)
const unit = (v) => {
  const l = length(v)
  return l < EPSILON ? null : { x: v.x / l, y: v.y / l }
}
const cross = (u, v) => u.x * v.y - u.y * v.x
const dot = (u, v) => u.x * v.x + u.y * v.y
const along = (p, v, t) => ({ x: p.x + v.x * t, y: p.y + v.y * t })

/**
 * Bisector and half angle of a corner.
 * @param {{x: number, y: number}} a Unit vector toward one side
 * @param {{x: number, y: number}} b Unit vector toward the other
 * @returns {{bis: {x: number, y: number}, sinHalf: number, tanHalf: number}|null}
 *   Null for a straight line or a spike
 */
export const cornerFrame = (a, b) => {
  const sum = { x: a.x + b.x, y: a.y + b.y }
  const diff = { x: a.x - b.x, y: a.y - b.y }
  const s = length(sum)
  const d = length(diff)
  if (s < FLAT || d < FLAT) return null
  return { bis: { x: sum.x / s, y: sum.y / s }, sinHalf: d / 2, tanHalf: d / s }
}

/**
 * Centre of the arc of a corner of a radius: where its handle is drawn.
 * @param {object} corner
 * @param {number} [radius=corner.radius]
 * @returns {{x: number, y: number}}
 */
export const cornerCentre = (corner, radius = corner.radius) =>
  along(corner.vertex, corner.frame.bis, radius / corner.frame.sinHalf)

/**
 * The radius a point stands for: that of the arc whose centre is the point
 * projected on the bisector. A drag adds the difference of two of them.
 * @param {object} corner
 * @param {{x: number, y: number}} p
 * @returns {number}
 */
export const radiusAt = (corner, p) => dot(minus(p, corner.vertex), corner.frame.bis) * corner.frame.sinHalf

/**
 * A radius kept between 0 and the largest of a corner.
 * @param {number} radius
 * @param {number} max
 * @returns {number}
 */
export const clampRadius = (radius, max) => Math.max(0, Math.min(Number.isFinite(radius) ? radius : 0, max))

/**
 * The radius of the corners of a rectangle as drawn: one radius for the
 * four of them (an elliptical corner gives its smaller radius), no larger
 * than half the smaller side.
 * @param {number} width
 * @param {number} height
 * @param {string|null} rx The attribute
 * @param {string|null} ry
 * @returns {number}
 */
export const rectRadius = (width, height, rx, ry) => {
  const read = (v) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  let x = read(rx)
  let y = read(ry)
  if (x === null) x = y
  if (y === null) y = x
  if (x === null) return 0
  return Math.max(0, Math.min(x, y, width / 2, height / 2))
}

/**
 * The four corners of a rectangle, clockwise from the top left.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 * @returns {object[]} Corners keyed nw, ne, se, sw
 */
export const rectCorners = (x, y, width, height, radius) => {
  const max = Math.max(0, Math.min(width, height) / 2)
  const make = (key, vx, vy, a, b) => ({
    key,
    vertex: { x: vx, y: vy },
    a,
    b,
    frame: cornerFrame(a, b),
    radius: clampRadius(radius, max),
    max
  })
  return [
    make('nw', x, y, { x: 0, y: 1 }, { x: 1, y: 0 }),
    make('ne', x + width, y, { x: -1, y: 0 }, { x: 0, y: 1 }),
    make('se', x + width, y + height, { x: 0, y: -1 }, { x: -1, y: 0 }),
    make('sw', x, y + height, { x: 1, y: 0 }, { x: 0, y: -1 })
  ]
}

/**
 * Skeleton of a rectangle: a closed subpath from its top left corner, whose
 * vertices are, in order, the top right, bottom right, bottom left and top
 * left corners.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @returns {object}
 */
export const rectSkeleton = (x, y, width, height) => ({
  x,
  y,
  segs: [
    { type: 'L', x: x + width, y },
    { type: 'L', x: x + width, y: y + height },
    { type: 'L', x, y: y + height },
    { type: 'L', x, y }
  ],
  closed: true
})

/** Vertex of the rectangle skeleton of each corner. */
export const RECT_VERTEX = { ne: 0, se: 1, sw: 2, nw: 3 }

/**
 * Skeleton of a polygon or a polyline from its points.
 * @param {{x: number, y: number}[]} points
 * @param {boolean} closed
 * @returns {object|null}
 */
export const pointsSkeleton = (points, closed) => {
  if (points.length < 2) return null
  const [first, ...rest] = points
  const segs = rest.map(({ x, y }) => ({ type: 'L', x, y }))
  const last = points.at(-1)
  if (closed && (Math.abs(last.x - first.x) > EPSILON || Math.abs(last.y - first.y) > EPSILON)) {
    segs.push({ type: 'L', x: first.x, y: first.y })
  }
  return { x: first.x, y: first.y, segs, closed }
}

/**
 * Points of a `points` attribute.
 * @param {string} value
 * @returns {{x: number, y: number}[]}
 */
export const readPoints = (value) => {
  const n = String(value ?? '').match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g)?.map(Number) ?? []
  const points = []
  for (let i = 0; i + 1 < n.length; i += 2) points.push({ x: n[i], y: n[i + 1] })
  return points
}

/**
 * End of a segment of a subpath; -1 is its start.
 * @param {object} sub
 * @param {number} i
 * @returns {{x: number, y: number}}
 */
const endAt = (sub, i) => (i < 0 ? sub : sub.segs[i])

/**
 * The corner at the end of segment k of a skeleton: between two lines.
 * @param {object} flat
 * @param {number} k
 * @returns {object|null}
 */
export const skeletonCorner = (flat, k) => {
  const { segs, closed } = flat
  const n = segs.length
  const next = k + 1 < n ? k + 1 : (closed ? 0 : -1)
  if (next < 0 || next === k) return null
  if (segs[k]?.type !== 'L' || segs[next].type !== 'L') return null
  const vertex = { x: segs[k].x, y: segs[k].y }
  const prev = endAt(flat, k - 1)
  const toPrev = minus(prev, vertex)
  const toNext = minus(segs[next], vertex)
  const a = unit(toPrev)
  const b = unit(toNext)
  if (!a || !b) return null
  const frame = cornerFrame(a, b)
  if (!frame) return null
  const lenIn = length(toPrev)
  const lenOut = length(toNext)
  // The largest radius when both ends of its sides are rounded.
  return { k, vertex, a, b, frame, lenIn, lenOut, max: Math.min(lenIn, lenOut) / 2 * frame.tanHalf }
}

/**
 * The corners of a skeleton, with their radius.
 * @param {object} flat
 * @param {Map<number, number>} [radii]
 * @returns {object[]}
 */
export const skeletonCorners = (flat, radii = new Map()) => {
  const corners = []
  flat.segs.forEach((seg, k) => {
    const corner = skeletonCorner(flat, k)
    if (corner) corners.push({ ...corner, radius: radii.get(k) ?? 0 })
  })
  return corners
}

/**
 * Direction in which an arc runs at one of its points.
 * @param {{cx: number, cy: number}} centre
 * @param {{x: number, y: number}} p
 * @param {number} sweep
 * @returns {{x: number, y: number}|null}
 */
const tangentAt = (centre, p, sweep) => {
  const r = { x: p.x - centre.cx, y: p.y - centre.cy }
  return unit(sweep ? { x: -r.y, y: r.x } : { x: r.y, y: -r.x })
}

/**
 * Whether a side runs along a direction; a side of no length does.
 * @param {{x: number, y: number}} v
 * @param {{x: number, y: number}} d
 * @returns {boolean}
 */
const runsAlong = (v, d) => {
  const u = unit(v)
  return !u || dot(u, d) > ALIGNED
}

/**
 * The fillet that segment j of a subpath is: an arc of circle between two
 * lines that it is tangent to.
 * @param {object} sub With `x, y` its start
 * @param {number} j
 * @returns {{vertex: {x: number, y: number}, radius: number}|null}
 */
const filletAt = (sub, j) => {
  const { segs, closed } = sub
  const seg = segs[j]
  const n = segs.length
  if (seg?.type !== 'A' || seg.large || j < 1) return null
  if (Math.abs(seg.rx - seg.ry) > 0.01 * Math.max(seg.rx, seg.ry) + 0.01) return null
  const next = j + 1 < n ? j + 1 : (closed ? 0 : -1)
  if (next < 0 || next === j - 1) return null
  if (segs[j - 1].type !== 'L' || segs[next].type !== 'L') return null
  const start = endAt(sub, j - 1)
  const end = seg
  const centre = arcCenter(start, seg)
  if (!centre) return null
  const dIn = tangentAt(centre, start, seg.sweep)
  const dOut = tangentAt(centre, end, seg.sweep)
  if (!dIn || !dOut) return null
  if (!runsAlong(minus(start, endAt(sub, j - 2)), dIn)) return null
  if (!runsAlong(minus(segs[next], end), dOut)) return null
  const k = cross(dIn, dOut)
  if (Math.abs(k) < FLAT) return null
  const w = minus(end, start)
  const s = cross(w, dOut) / k
  const u = cross(dIn, w) / k
  if (s <= EPSILON || u <= EPSILON) return null
  return { vertex: along(start, dIn, s), radius: centre.rx }
}

/**
 * The skeleton of a subpath: its fillets folded back into their vertices.
 * @param {object} sub
 * @returns {{flat: object, radii: Map<number, number>, nodes: Map<number, number[]>}}
 *   `radii` gives the radius of each rounded vertex of the skeleton, by the
 *   index of the segment it ends; `nodes`, for each segment of the skeleton,
 *   the segments of the subpath whose ends make its vertex (two for a
 *   fillet, its ends).
 */
export const flattenSubpath = (sub) => {
  let { segs } = sub
  const n = segs.length
  let start = { x: sub.x, y: sub.y }
  let shift = 0
  // A closed subpath that starts with an arc is read from the arc's end.
  if (sub.closed && n > 2 && segs[0].type === 'A') {
    start = { x: segs[0].x, y: segs[0].y }
    segs = [...segs.slice(1), segs[0]]
    shift = 1
  }
  const view = { x: start.x, y: start.y, segs, closed: sub.closed }
  const original = (j) => (j + shift) % n
  const flatSegs = []
  const radii = new Map()
  const nodes = new Map()
  for (let j = 0; j < n; j++) {
    const fillet = filletAt(view, j)
    const k = flatSegs.length - 1
    if (fillet && k >= 0 && flatSegs[k].type === 'L' && !radii.has(k)) {
      flatSegs[k] = { type: 'L', x: fillet.vertex.x, y: fillet.vertex.y }
      radii.set(k, fillet.radius)
      nodes.set(k, [original(j - 1), original(j)])
      // The arc back to the start: the start is the vertex.
      if (sub.closed && j === n - 1) start = { ...fillet.vertex }
      continue
    }
    flatSegs.push({ ...segs[j] })
    nodes.set(flatSegs.length - 1, [original(j)])
  }
  return { flat: { x: start.x, y: start.y, segs: flatSegs, closed: sub.closed }, radii, nodes }
}

/**
 * A skeleton with its vertices rounded.
 * @param {object} flat
 * @param {Map<number, number>} radii Radius of the vertices to round, by
 *   the index of the segment they end
 * @returns {{sub: object, nodes: Map<number, number[]>, radii: Map<number, number>}}
 *   The subpath; for each segment of the skeleton, the segments of the
 *   subpath whose ends make its vertex; the radius each vertex got.
 */
export const roundSkeleton = (flat, radii) => {
  const { segs, closed } = flat
  const n = segs.length
  // How far each vertex wants to cut its sides.
  const wanted = new Map()
  for (const [k, radius] of radii) {
    if (!(radius > 0)) continue
    const corner = skeletonCorner(flat, k)
    if (corner) wanted.set(k, { corner, t: radius / corner.frame.tanHalf })
  }
  const prevOf = (k) => (k > 0 ? k - 1 : (closed ? n - 1 : -1))
  const nextOf = (k) => (k + 1 < n ? k + 1 : (closed ? 0 : -1))
  // A side gives each end what the other end leaves, and at least half:
  // next to a sharp vertex, a cut may take the whole side.
  const other = (j, side) => {
    const o = wanted.get(j)
    return o ? Math.min(o.t, side / 2) : 0
  }
  const cuts = new Map()
  for (const [k, { corner, t: want }] of wanted) {
    const t = Math.min(want, corner.lenIn - other(prevOf(k), corner.lenIn), corner.lenOut - other(nextOf(k), corner.lenOut))
    if (t < EPSILON) continue
    cuts.set(k, {
      radius: t * corner.frame.tanHalf,
      in: along(corner.vertex, corner.a, t),
      out: along(corner.vertex, corner.b, t),
      sweep: cross({ x: -corner.a.x, y: -corner.a.y }, corner.b) > 0 ? 1 : 0
    })
  }
  const start = closed && cuts.has(n - 1) ? cuts.get(n - 1).out : { x: flat.x, y: flat.y }
  const out = []
  const nodes = new Map()
  const given = new Map()
  segs.forEach((seg, k) => {
    const cut = cuts.get(k)
    if (cut) {
      out.push({ type: 'L', x: cut.in.x, y: cut.in.y })
      out.push({ type: 'A', rx: cut.radius, ry: cut.radius, angle: 0, large: 0, sweep: cut.sweep, x: cut.out.x, y: cut.out.y })
      nodes.set(k, [out.length - 2, out.length - 1])
      given.set(k, cut.radius)
    } else {
      out.push({ ...seg })
      nodes.set(k, [out.length - 1])
    }
  })
  return { sub: { x: start.x, y: start.y, segs: out, closed }, nodes, radii: given }
}
