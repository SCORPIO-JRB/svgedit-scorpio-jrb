/**
 * Points of a path, as a geometry free of the DOM (lot Chemins): the path is
 * read into subpaths of absolute segments, changed, and written back.
 *
 * A subpath is `{ x, y, segs, closed }`: its start point, its segments and
 * whether it is closed. A segment is `{ type, x, y }` with its end point and,
 * by type: `x1, y1, x2, y2` for C, `x1, y1` for Q, `rx, ry, angle, large,
 * sweep` for A. H and V are read as L, S as C and T as Q, so that a segment
 * never depends on the one before it. A closed subpath ends, as everywhere
 * in the canvas (`fixEnd`), with a segment back to its start, then Z: each
 * node of the path is the end of one segment.
 * @module path-points
 */

const EPSILON = 1e-9

/**
 * Commands and values of a `d` attribute.
 * @param {string} d
 * @returns {{type: string, values: number[]}[]}
 */
export const parseD = (d) => {
  const commands = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g
  let current = null
  let m
  // Flags of arcs may be written without separator: "a5 5 0 1010 10".
  const text = String(d ?? '')
  while ((m = re.exec(text))) {
    if (m[1]) {
      current = { type: m[1], values: [] }
      commands.push(current)
    } else if (current) {
      const isFlag = /[Aa]/.test(current.type) && [3, 4].includes(current.values.length % 7)
      if (isFlag && m[2].length > 1 && /^[01]/.test(m[2])) {
        // "10" after the rotation of an arc: two flags.
        current.values.push(Number(m[2][0]))
        re.lastIndex = m.index + 1
      } else {
        current.values.push(Number(m[2]))
      }
    }
  }
  return commands
}

/** Number of values of each command. */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/**
 * Subpaths of absolute segments.
 * @param {string} d
 * @returns {object[]}
 */
export const readPath = (d) => {
  const subpaths = []
  let sub = null
  let cx = 0
  let cy = 0
  let lastCtrl = null // second control point of the last C, or control of Q
  let lastType = ''
  const start = (x, y) => {
    sub = { x, y, segs: [], closed: false }
    subpaths.push(sub)
  }
  const ensure = () => { if (!sub || sub.closed) start(cx, cy) }
  for (const { type, values } of parseD(d)) {
    const U = type.toUpperCase()
    const rel = type !== U
    const n = ARITY[U]
    if (U === 'Z') {
      if (sub && !sub.closed) {
        const last = sub.segs.at(-1)
        const end = last ?? sub
        if (Math.abs(end.x - sub.x) > EPSILON || Math.abs(end.y - sub.y) > EPSILON) {
          sub.segs.push({ type: 'L', x: sub.x, y: sub.y })
        }
        sub.closed = true
        cx = sub.x
        cy = sub.y
      }
      lastType = 'Z'
      continue
    }
    const count = Math.floor(values.length / n)
    for (let k = 0; k < count; k++) {
      const i = k * n
      const v = values.slice(i, i + n)
      const ox = rel ? cx : 0
      const oy = rel ? cy : 0
      let cmd = U
      // Pairs after a moveto are linetos.
      if (U === 'M' && i > 0) cmd = 'L'
      switch (cmd) {
        case 'M':
          cx = v[0] + ox
          cy = v[1] + oy
          start(cx, cy)
          break
        case 'L':
          ensure()
          cx = v[0] + ox
          cy = v[1] + oy
          sub.segs.push({ type: 'L', x: cx, y: cy })
          break
        case 'H':
          ensure()
          cx = v[0] + ox
          sub.segs.push({ type: 'L', x: cx, y: cy })
          break
        case 'V':
          ensure()
          cy = v[0] + oy
          sub.segs.push({ type: 'L', x: cx, y: cy })
          break
        case 'C':
        case 'S': {
          ensure()
          let x1, y1
          let k = 0
          if (cmd === 'C') {
            x1 = v[0] + ox
            y1 = v[1] + oy
            k = 2
          } else if (lastCtrl && /[CS]/.test(lastType)) {
            x1 = 2 * cx - lastCtrl[0]
            y1 = 2 * cy - lastCtrl[1]
          } else {
            x1 = cx
            y1 = cy
          }
          const seg = {
            type: 'C', x1, y1, x2: v[k] + ox, y2: v[k + 1] + oy, x: v[k + 2] + ox, y: v[k + 3] + oy
          }
          sub.segs.push(seg)
          lastCtrl = [seg.x2, seg.y2]
          cx = seg.x
          cy = seg.y
          break
        }
        case 'Q':
        case 'T': {
          ensure()
          let x1, y1
          if (cmd === 'Q') {
            x1 = v[0] + ox
            y1 = v[1] + oy
          } else if (lastCtrl && /[QT]/.test(lastType)) {
            x1 = 2 * cx - lastCtrl[0]
            y1 = 2 * cy - lastCtrl[1]
          } else {
            x1 = cx
            y1 = cy
          }
          const k = cmd === 'Q' ? 2 : 0
          const seg = { type: 'Q', x1, y1, x: v[k] + ox, y: v[k + 1] + oy }
          sub.segs.push(seg)
          lastCtrl = [x1, y1]
          cx = seg.x
          cy = seg.y
          break
        }
        case 'A':
          ensure()
          cx = v[5] + ox
          cy = v[6] + oy
          sub.segs.push({
            type: 'A', rx: Math.abs(v[0]), ry: Math.abs(v[1]), angle: v[2], large: v[3] ? 1 : 0, sweep: v[4] ? 1 : 0, x: cx, y: cy
          })
          break
      }
      lastType = cmd === 'M' ? 'M' : (cmd === 'S' ? 'S' : cmd === 'T' ? 'T' : cmd)
      if (!/[CSQT]/.test(lastType)) lastCtrl = null
    }
  }
  return subpaths
}

/**
 * The `d` of subpaths, in absolute commands.
 * @param {object[]} subpaths
 * @param {(n: number) => number} [fmt] Rounding of the numbers
 * @returns {string}
 */
export const writePath = (subpaths, fmt = (n) => n) => {
  const p = (x, y) => `${fmt(x)},${fmt(y)}`
  const parts = []
  for (const sub of subpaths) {
    parts.push(`M${p(sub.x, sub.y)}`)
    for (const s of sub.segs) {
      if (s.type === 'L') parts.push(`L${p(s.x, s.y)}`)
      else if (s.type === 'C') parts.push(`C${p(s.x1, s.y1)} ${p(s.x2, s.y2)} ${p(s.x, s.y)}`)
      else if (s.type === 'Q') parts.push(`Q${p(s.x1, s.y1)} ${p(s.x, s.y)}`)
      else if (s.type === 'A') {
        parts.push(`A${fmt(s.rx)},${fmt(s.ry)} ${fmt(s.angle)} ${s.large} ${s.sweep} ${p(s.x, s.y)}`)
      }
    }
    if (sub.closed) parts.push('Z')
  }
  return parts.join(' ')
}

/**
 * Index, in the segment list of the path written by `writePath`, of the end
 * of a segment: what the grips of the canvas call a node.
 * @param {object[]} subpaths
 * @param {number} subIndex
 * @param {number} segIndex
 * @returns {number}
 */
export const nodeIndex = (subpaths, subIndex, segIndex) => {
  let index = 0
  for (let i = 0; i < subIndex; i++) {
    index += 1 + subpaths[i].segs.length + (subpaths[i].closed ? 1 : 0)
  }
  return index + 1 + segIndex
}

/**
 * The ellipse of an arc from its end points (SVG 1.1, appendix F.6.5), radii
 * enlarged when they cannot join the two points.
 * @param {{x: number, y: number}} p0
 * @param {object} seg
 * @returns {{cx: number, cy: number, rx: number, ry: number, phi: number, theta: number, delta: number}|null}
 */
export const arcCenter = (p0, seg) => {
  let { rx, ry } = seg
  if (rx < EPSILON || ry < EPSILON) return null
  if (Math.abs(p0.x - seg.x) < EPSILON && Math.abs(p0.y - seg.y) < EPSILON) return null
  const phi = (seg.angle * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (p0.x - seg.x) / 2
  const dy = (p0.y - seg.y) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  let coef = Math.sqrt(Math.max(0, num / den))
  if (seg.large === seg.sweep) coef = -coef
  const cxp = (coef * rx * y1) / ry
  const cyp = (-coef * ry * x1) / rx
  const cx = cos * cxp - sin * cyp + (p0.x + seg.x) / 2
  const cy = sin * cxp + cos * cyp + (p0.y + seg.y) / 2
  const angle = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const theta = angle(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
  let delta = angle((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
  if (!seg.sweep && delta > 0) delta -= 2 * Math.PI
  if (seg.sweep && delta < 0) delta += 2 * Math.PI
  return { cx, cy, rx, ry, phi, theta, delta }
}

const ellipsePoint = (e, a) => ({
  x: e.cx + e.rx * Math.cos(a) * Math.cos(e.phi) - e.ry * Math.sin(a) * Math.sin(e.phi),
  y: e.cy + e.rx * Math.cos(a) * Math.sin(e.phi) + e.ry * Math.sin(a) * Math.cos(e.phi)
})

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * Point of a segment at `t`, from 0 at its start to 1 at its end.
 * @param {{x: number, y: number}} p0 Start of the segment
 * @param {object} seg
 * @param {number} t
 * @returns {{x: number, y: number}}
 */
export const pointAt = (p0, seg, t) => {
  const u = 1 - t
  switch (seg.type) {
    case 'C':
      return {
        x: u * u * u * p0.x + 3 * u * u * t * seg.x1 + 3 * u * t * t * seg.x2 + t * t * t * seg.x,
        y: u * u * u * p0.y + 3 * u * u * t * seg.y1 + 3 * u * t * t * seg.y2 + t * t * t * seg.y
      }
    case 'Q':
      return {
        x: u * u * p0.x + 2 * u * t * seg.x1 + t * t * seg.x,
        y: u * u * p0.y + 2 * u * t * seg.y1 + t * t * seg.y
      }
    case 'A': {
      const e = arcCenter(p0, seg)
      if (e) return ellipsePoint(e, e.theta + e.delta * t)
      return lerp(p0, seg, t)
    }
    default:
      return lerp(p0, seg, t)
  }
}

/**
 * Splits a segment at `t` without changing its shape.
 * @param {{x: number, y: number}} p0 Start of the segment
 * @param {object} seg
 * @param {number} t
 * @returns {[object, object]}
 */
export const splitSegment = (p0, seg, t) => {
  switch (seg.type) {
    case 'C': {
      const p1 = { x: seg.x1, y: seg.y1 }
      const p2 = { x: seg.x2, y: seg.y2 }
      const a = lerp(p0, p1, t)
      const b = lerp(p1, p2, t)
      const c = lerp(p2, seg, t)
      const ab = lerp(a, b, t)
      const bc = lerp(b, c, t)
      const m = lerp(ab, bc, t)
      return [
        { type: 'C', x1: a.x, y1: a.y, x2: ab.x, y2: ab.y, x: m.x, y: m.y },
        { type: 'C', x1: bc.x, y1: bc.y, x2: c.x, y2: c.y, x: seg.x, y: seg.y }
      ]
    }
    case 'Q': {
      const p1 = { x: seg.x1, y: seg.y1 }
      const a = lerp(p0, p1, t)
      const b = lerp(p1, seg, t)
      const m = lerp(a, b, t)
      return [
        { type: 'Q', x1: a.x, y1: a.y, x: m.x, y: m.y },
        { type: 'Q', x1: b.x, y1: b.y, x: seg.x, y: seg.y }
      ]
    }
    case 'A': {
      const e = arcCenter(p0, seg)
      if (!e) break
      const m = ellipsePoint(e, e.theta + e.delta * t)
      const arc = (part, to) => ({
        type: 'A',
        rx: e.rx,
        ry: e.ry,
        angle: seg.angle,
        large: Math.abs(e.delta * part) > Math.PI ? 1 : 0,
        sweep: seg.sweep,
        x: to.x,
        y: to.y
      })
      return [arc(t, m), arc(1 - t, seg)]
    }
  }
  const m = lerp(p0, seg, t)
  return [{ type: 'L', x: m.x, y: m.y }, { type: 'L', x: seg.x, y: seg.y }]
}

/**
 * Start point of each segment of a subpath.
 * @param {object} sub
 * @param {number} i
 * @returns {{x: number, y: number}}
 */
const startOf = (sub, i) => (i ? sub.segs[i - 1] : sub)

/**
 * The point of the path nearest to a point.
 * @param {object[]} subpaths
 * @param {{x: number, y: number}} p
 * @returns {{sub: number, seg: number, t: number, x: number, y: number, distance: number}|null}
 */
export const nearestPoint = (subpaths, p) => {
  let best = null
  const dist = (q) => Math.hypot(q.x - p.x, q.y - p.y)
  subpaths.forEach((sub, s) => {
    sub.segs.forEach((seg, i) => {
      const p0 = startOf(sub, i)
      let t
      if (seg.type === 'L' || (seg.type === 'A' && !arcCenter(p0, seg))) {
        const dx = seg.x - p0.x
        const dy = seg.y - p0.y
        const len = dx * dx + dy * dy
        t = len ? Math.min(1, Math.max(0, ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / len)) : 0
      } else {
        // Samples, then a narrower search around the nearest one.
        const N = 48
        let bt = 0
        let bd = Infinity
        for (let k = 0; k <= N; k++) {
          const d = dist(pointAt(p0, seg, k / N))
          if (d < bd) { bd = d; bt = k / N }
        }
        let lo = Math.max(0, bt - 1 / N)
        let hi = Math.min(1, bt + 1 / N)
        for (let k = 0; k < 40; k++) {
          const a = lo + (hi - lo) / 3
          const b = hi - (hi - lo) / 3
          if (dist(pointAt(p0, seg, a)) < dist(pointAt(p0, seg, b))) hi = b
          else lo = a
        }
        t = (lo + hi) / 2
      }
      const q = pointAt(p0, seg, t)
      const d = dist(q)
      if (!best || d < best.distance) best = { sub: s, seg: i, t, x: q.x, y: q.y, distance: d }
    })
  })
  return best
}

/**
 * Adds a node on a segment, the shape unchanged.
 * @param {object[]} subpaths Changed in place
 * @param {number} subIndex
 * @param {number} segIndex
 * @param {number} t
 * @returns {boolean} False when `t` is at an end of the segment
 */
export const insertNode = (subpaths, subIndex, segIndex, t) => {
  if (t <= 1e-6 || t >= 1 - 1e-6) return false
  const sub = subpaths[subIndex]
  const seg = sub.segs[segIndex]
  const parts = splitSegment(startOf(sub, segIndex), seg, t)
  sub.segs.splice(segIndex, 1, ...parts)
  return true
}

/**
 * End point of a subpath.
 * @param {object} sub
 * @returns {{x: number, y: number}}
 */
export const endOf = (sub) => sub.segs.at(-1) ?? sub

/**
 * The same segment as a cubic Bézier curve (lot Plume): a line has its
 * handles at a third and two thirds of it, a quadratic curve is raised to a
 * cubic one, the same curve, and an arc becomes the cubic curve that leaves
 * and reaches its ends along it, close to it for an arc up to a half turn.
 * @param {{x: number, y: number}} p0 Start of the segment
 * @param {object} seg
 * @returns {object} A segment of type C
 */
export const toCubic = (p0, seg) => {
  switch (seg.type) {
    case 'C':
      return { ...seg }
    case 'Q':
      return {
        type: 'C',
        x1: p0.x + (2 / 3) * (seg.x1 - p0.x),
        y1: p0.y + (2 / 3) * (seg.y1 - p0.y),
        x2: seg.x + (2 / 3) * (seg.x1 - seg.x),
        y2: seg.y + (2 / 3) * (seg.y1 - seg.y),
        x: seg.x,
        y: seg.y
      }
    case 'A': {
      const e = arcCenter(p0, seg)
      if (!e) break
      // Tangent of the ellipse at an angle, and the length of the handles
      // of the unit circle for the angle swept.
      const tangent = (a) => ({
        x: -e.rx * Math.sin(a) * Math.cos(e.phi) - e.ry * Math.cos(a) * Math.sin(e.phi),
        y: -e.rx * Math.sin(a) * Math.sin(e.phi) + e.ry * Math.cos(a) * Math.cos(e.phi)
      })
      const k = (4 / 3) * Math.tan(e.delta / 4)
      const t0 = tangent(e.theta)
      const t1 = tangent(e.theta + e.delta)
      return {
        type: 'C',
        x1: p0.x + k * t0.x,
        y1: p0.y + k * t0.y,
        x2: seg.x - k * t1.x,
        y2: seg.y - k * t1.y,
        x: seg.x,
        y: seg.y
      }
    }
  }
  return {
    type: 'C',
    x1: p0.x + (seg.x - p0.x) / 3,
    y1: p0.y + (seg.y - p0.y) / 3,
    x2: p0.x + (2 * (seg.x - p0.x)) / 3,
    y2: p0.y + (2 * (seg.y - p0.y)) / 3,
    x: seg.x,
    y: seg.y
  }
}

/**
 * Bends a cubic curve so that its point at `t` moves by (dx, dy), its ends
 * in place (lot Plume): both handles move, the nearer one more, with the
 * weights Inkscape gives the drag of a curve. `t` is kept away from the ends,
 * where a handle would have to go very far.
 * @param {{x: number, y: number}} p0 Start of the segment
 * @param {object} cubic A segment of type C
 * @param {number} t Where the curve was taken, from 0 to 1
 * @param {number} dx
 * @param {number} dy
 * @returns {object} The bent segment, of type C
 */
export const bendCubic = (p0, cubic, t, dx, dy) => {
  t = Math.min(0.9, Math.max(0.1, t))
  let weight
  if (t <= 1 / 6) weight = 0
  else if (t <= 0.5) weight = ((6 * t - 1) / 2) ** 3 / 2
  else if (t <= 5 / 6) weight = (1 - ((6 * (1 - t) - 1) / 2) ** 3) / 2 + 0.5
  else weight = 1
  const u = 1 - t
  const k1 = (1 - weight) / (3 * t * u * u)
  const k2 = weight / (3 * t * t * u)
  return {
    ...cubic,
    x1: cubic.x1 + k1 * dx,
    y1: cubic.y1 + k1 * dy,
    x2: cubic.x2 + k2 * dx,
    y2: cubic.y2 + k2 * dy
  }
}

/**
 * The same subpath, run from its end to its start.
 * @param {object} sub
 * @returns {object}
 */
export const reverseSubpath = (sub) => {
  const end = endOf(sub)
  const segs = []
  for (let i = sub.segs.length - 1; i >= 0; i--) {
    const seg = sub.segs[i]
    const to = startOf(sub, i)
    if (seg.type === 'C') segs.push({ type: 'C', x1: seg.x2, y1: seg.y2, x2: seg.x1, y2: seg.y1, x: to.x, y: to.y })
    else if (seg.type === 'Q') segs.push({ type: 'Q', x1: seg.x1, y1: seg.y1, x: to.x, y: to.y })
    else if (seg.type === 'A') segs.push({ ...seg, sweep: seg.sweep ? 0 : 1, x: to.x, y: to.y })
    else segs.push({ type: 'L', x: to.x, y: to.y })
  }
  return { x: end.x, y: end.y, segs, closed: sub.closed }
}

/**
 * A subpath through an affine matrix `{a, b, c, d, e, f}`.
 * @param {object} sub
 * @param {{a: number, b: number, c: number, d: number, e: number, f: number}} m
 * @returns {object}
 */
export const transformSubpath = (sub, m) => {
  const tp = (x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })
  const start = tp(sub.x, sub.y)
  const det = m.a * m.d - m.b * m.c
  const segs = sub.segs.map((seg) => {
    const to = tp(seg.x, seg.y)
    if (seg.type === 'C') {
      const c1 = tp(seg.x1, seg.y1)
      const c2 = tp(seg.x2, seg.y2)
      return { type: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: to.x, y: to.y }
    }
    if (seg.type === 'Q') {
      const c1 = tp(seg.x1, seg.y1)
      return { type: 'Q', x1: c1.x, y1: c1.y, x: to.x, y: to.y }
    }
    if (seg.type === 'A') {
      // The ellipse is the image of the unit circle by R(phi)·diag(rx, ry);
      // its image by the matrix gives the new radii and rotation.
      const phi = (seg.angle * Math.PI) / 180
      const p = (m.a * Math.cos(phi) + m.c * Math.sin(phi)) * seg.rx
      const r = (m.b * Math.cos(phi) + m.d * Math.sin(phi)) * seg.rx
      const q = (-m.a * Math.sin(phi) + m.c * Math.cos(phi)) * seg.ry
      const s = (-m.b * Math.sin(phi) + m.d * Math.cos(phi)) * seg.ry
      const A = p * p + q * q
      const B = p * r + q * s
      const C = r * r + s * s
      const mid = (A + C) / 2
      const rad = Math.sqrt(((A - C) / 2) ** 2 + B * B)
      const angle = (0.5 * Math.atan2(2 * B, A - C) * 180) / Math.PI
      return {
        type: 'A',
        rx: Math.sqrt(mid + rad),
        ry: Math.sqrt(Math.max(0, mid - rad)),
        angle,
        large: seg.large,
        sweep: det < 0 ? (seg.sweep ? 0 : 1) : seg.sweep,
        x: to.x,
        y: to.y
      }
    }
    return { type: 'L', x: to.x, y: to.y }
  })
  return { x: start.x, y: start.y, segs, closed: sub.closed }
}

/**
 * The ends of the open subpaths, that a drawing can extend or join.
 * @param {object[]} subpaths
 * @returns {{sub: number, end: 'start'|'end', x: number, y: number}[]}
 */
export const openEnds = (subpaths) => subpaths.flatMap((sub, i) => {
  if (sub.closed || !sub.segs.length) return []
  const end = endOf(sub)
  return [{ sub: i, end: 'start', x: sub.x, y: sub.y }, { sub: i, end: 'end', x: end.x, y: end.y }]
})

/** Two chains end to end; `b` starts where `a` ends. */
const concat = (a, b) => ({ x: a.x, y: a.y, segs: [...a.segs, ...b.segs], closed: false })

/**
 * The subpath made by a drawing that extends `source` from one of its ends
 * and, or, ends on an end of `target`. The source keeps its direction, and
 * so does the target when there is no source.
 * @param {object} options
 * @param {object} options.drawn Drawn subpath, starting on the end of the
 *   source when there is one
 * @param {object} [options.source]
 * @param {'start'|'end'} [options.sourceEnd]
 * @param {object} [options.target] Subpath the drawing ends on
 * @param {'start'|'end'} [options.targetEnd]
 * @param {boolean} [options.close] The drawing ends on the other end of the
 *   source: the subpath closes
 * @returns {object}
 */
export const joinSubpaths = ({ drawn, source, sourceEnd, target, targetEnd, close }) => {
  if (!source) {
    if (!target) return { ...drawn, closed: false }
    return targetEnd === 'start'
      ? concat(drawn, target)
      : concat(target, reverseSubpath(drawn))
  }
  // From the end of the source, the drawing follows it; from its start, the
  // drawing, run backwards, comes before it.
  const fromEnd = sourceEnd === 'end'
  let chain = fromEnd ? concat(source, drawn) : concat(reverseSubpath(drawn), source)
  if (close) {
    // The last node is the first one: as `fixEnd` writes it, a segment back
    // to the start, then Z.
    return { ...chain, closed: true }
  }
  if (target) {
    chain = fromEnd
      ? concat(chain, targetEnd === 'start' ? target : reverseSubpath(target))
      : concat(targetEnd === 'end' ? target : reverseSubpath(target), chain)
  }
  return chain
}
