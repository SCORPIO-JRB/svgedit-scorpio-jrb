import { describe, it, expect } from 'vitest'
import {
  cornerFrame, cornerCentre, radiusAt, clampRadius, rectRadius, rectCorners, rectSkeleton, RECT_VERTEX,
  pointsSkeleton, readPoints, skeletonCorners, flattenSubpath, roundSkeleton
} from '../../packages/svgcanvas/core/corners.js'
import { readPath, writePath, pointAt, nearestPoint } from '../../packages/svgcanvas/core/path-points.js'

const close = (a, b, eps = 1e-6) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps)
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps)
}

/** Distance from a point to the nearest point of a subpath. */
const gap = (sub, p) => nearestPoint([sub], p).distance

/** Points along a whole subpath. */
const sample = (sub, n = 16) => sub.segs.flatMap((seg, i) => {
  const p0 = i ? sub.segs[i - 1] : sub
  return Array.from({ length: n }, (_, k) => pointAt(p0, seg, k / n))
})

const radiiOf = (entries) => new Map(entries)

describe('corners: frame and drag', () => {
  it('gives the bisector and half angle of a right angle', () => {
    const f = cornerFrame({ x: 0, y: 1 }, { x: 1, y: 0 })
    close(f.bis, { x: Math.SQRT1_2, y: Math.SQRT1_2 })
    expect(f.sinHalf).toBeCloseTo(Math.SQRT1_2)
    expect(f.tanHalf).toBeCloseTo(1)
  })

  it('has no frame for a straight line or a spike', () => {
    expect(cornerFrame({ x: -1, y: 0 }, { x: 1, y: 0 })).toBeNull()
    expect(cornerFrame({ x: 1, y: 0 }, { x: 1, y: 0 })).toBeNull()
  })

  it('puts the handle at the centre of the arc and reads the radius back', () => {
    const [nw] = rectCorners(10, 20, 100, 50, 8)
    close(cornerCentre(nw), { x: 18, y: 28 })
    expect(radiusAt(nw, { x: 18, y: 28 })).toBeCloseTo(8)
    // Off the bisector, the point is projected on it.
    expect(radiusAt(nw, { x: 22, y: 24 })).toBeCloseTo(8)
  })

  it('keeps a radius between 0 and the largest', () => {
    expect(clampRadius(-3, 10)).toBe(0)
    expect(clampRadius(12, 10)).toBe(10)
    expect(clampRadius(Number.NaN, 10)).toBe(0)
  })
})

describe('corners: rectangles', () => {
  it('reads the radius as drawn', () => {
    expect(rectRadius(100, 50, null, null)).toBe(0)
    expect(rectRadius(100, 50, '10', null)).toBe(10)
    expect(rectRadius(100, 50, null, '12')).toBe(12)
    expect(rectRadius(100, 50, '10', '6')).toBe(6)
    expect(rectRadius(100, 50, '80', '80')).toBe(25)
  })

  it('gives four corners limited by half the smaller side', () => {
    const corners = rectCorners(0, 0, 100, 40, 30)
    expect(corners.map((c) => c.key)).toEqual(['nw', 'ne', 'se', 'sw'])
    corners.forEach((c) => {
      expect(c.max).toBe(20)
      expect(c.radius).toBe(20)
    })
    close(corners[2].vertex, { x: 100, y: 40 })
    // Every handle goes inside the rectangle.
    corners.forEach((c) => {
      const p = cornerCentre(c, 10)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(100)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(40)
    })
  })

  it('rounds one corner of a rectangle only', () => {
    const flat = rectSkeleton(0, 0, 100, 50)
    const { sub } = roundSkeleton(flat, radiiOf([[RECT_VERTEX.ne, 10]]))
    expect(sub.segs.map((s) => s.type)).toEqual(['L', 'A', 'L', 'L', 'L'])
    close(sub.segs[0], { x: 90, y: 0 })
    expect(sub.segs[1]).toMatchObject({ rx: 10, ry: 10, sweep: 1, large: 0 })
    close(sub.segs[1], { x: 100, y: 10 })
    // The arc is the quarter circle about (90, 10).
    sample({ x: 90, y: 0, segs: [sub.segs[1]] }, 8).forEach((p) => {
      expect(Math.hypot(p.x - 90, p.y - 10)).toBeCloseTo(10, 5)
    })
  })

  it('rounds the start of a closed subpath: the last arc ends at it', () => {
    const flat = rectSkeleton(0, 0, 100, 50)
    const { sub } = roundSkeleton(flat, radiiOf([[RECT_VERTEX.nw, 5]]))
    close(sub, { x: 5, y: 0 })
    const last = sub.segs.at(-1)
    expect(last.type).toBe('A')
    close(last, { x: 5, y: 0 })
    close(sub.segs.at(-2), { x: 0, y: 5 })
  })

  it('lets a corner take the whole side next to a sharp one', () => {
    const flat = rectSkeleton(0, 0, 100, 40)
    const { radii } = roundSkeleton(flat, radiiOf([[RECT_VERTEX.ne, 90]]))
    // Its sides are 100 and 40 long, the other corners sharp.
    expect(radii.get(RECT_VERTEX.ne)).toBeCloseTo(40)
  })

  it('keeps two unequal fillets of a side as they are', () => {
    // On the top side (100 long), a fillet of 70 and one of 20.
    const flat = rectSkeleton(0, 0, 100, 200)
    const { radii } = roundSkeleton(flat, radiiOf([[RECT_VERTEX.nw, 70], [RECT_VERTEX.ne, 20]]))
    expect(radii.get(RECT_VERTEX.nw)).toBeCloseTo(70)
    expect(radii.get(RECT_VERTEX.ne)).toBeCloseTo(20)
  })

  it('stops each cut at the middle of its sides', () => {
    const flat = rectSkeleton(0, 0, 100, 40)
    const { sub, radii } = roundSkeleton(flat, radiiOf([[0, 90], [1, 90], [2, 90], [3, 90]]))
    expect([...radii.values()]).toEqual([20, 20, 20, 20])
    // The vertical sides are gone: lines of no length between the arcs.
    expect(sub.segs.filter((s) => s.type === 'A')).toHaveLength(4)
  })
})

describe('corners: skeletons', () => {
  it('folds the fillets of a path back into their vertices', () => {
    const flat = rectSkeleton(0, 0, 100, 50)
    const rounded = roundSkeleton(flat, radiiOf([[0, 10], [1, 4], [3, 7]])).sub
    const [read] = readPath(writePath([rounded]))
    const { flat: back, radii, nodes } = flattenSubpath(read)
    expect(back.segs).toHaveLength(4)
    close(back, { x: 0, y: 0 })
    back.segs.forEach((seg, i) => close(seg, flat.segs[i], 1e-6))
    expect(radii.get(0)).toBeCloseTo(10)
    expect(radii.get(1)).toBeCloseTo(4)
    expect(radii.has(2)).toBe(false)
    expect(radii.get(3)).toBeCloseTo(7)
    // A fillet is made of the nodes at both ends of its arc.
    expect(nodes.get(0)).toEqual([0, 1])
    expect(nodes.get(2)).toEqual([4])
    expect(nodes.get(3)).toEqual([5, 6])
  })

  it('folds the fillets of a circle-like shape (sides of no length)', () => {
    const flat = rectSkeleton(0, 0, 40, 40)
    const round = roundSkeleton(flat, radiiOf([[0, 20], [1, 20], [2, 20], [3, 20]])).sub
    const [read] = readPath(writePath([round]))
    const { flat: back, radii } = flattenSubpath(read)
    expect(back.segs).toHaveLength(4)
    expect([...radii.values()].map((r) => Math.round(r))).toEqual([20, 20, 20, 20])
  })

  it('reads a closed subpath that starts with a fillet', () => {
    const [sub] = readPath('M10,0 A10,10 0 0 1 0,10 L0,50 L100,50 L100,0 Z')
    // Reversed rectangle whose top left corner is rounded: the arc runs
    // from (10, 0) to (0, 10), turning anticlockwise.
    const { flat, radii } = flattenSubpath({ ...sub, segs: sub.segs.map((s) => (s.type === 'A' ? { ...s, sweep: 0 } : s)) })
    expect(flat.segs).toHaveLength(4)
    expect([...radii.values()].map((r) => Math.round(r))).toEqual([10])
    close(flat.segs.at(-1), { x: 0, y: 0 }, 1e-6)
  })

  it('leaves alone an arc that is no fillet', () => {
    // A half circle between two lines: tangent, but no vertex to fold to.
    const [sub] = readPath('M0,0 L10,0 A5,5 0 0 1 10,10 L0,10')
    const { flat, radii } = flattenSubpath(sub)
    expect(flat.segs).toHaveLength(3)
    expect(radii.size).toBe(0)
    // An arc that does not follow the lines.
    const [bent] = readPath('M0,0 L10,0 A10,10 0 0 0 20,10 L20,20')
    expect(flattenSubpath(bent).radii.size).toBe(0)
  })

  it('finds the corners between two lines only', () => {
    const [sub] = readPath('M0,0 L50,0 L50,50 C50,80 0,80 0,50 Z')
    const { flat, radii } = flattenSubpath(sub)
    const corners = skeletonCorners(flat, radii)
    // (50, 0) only: (50, 50) and (0, 50) touch the curve, (0, 0) closes it
    // between the curve's closing line and the first line.
    expect(corners.map((c) => [c.vertex.x, c.vertex.y])).toEqual([[50, 0], [0, 0]])
    expect(corners[0].radius).toBe(0)
    expect(corners[0].max).toBeCloseTo(25)
  })

  it('rounds the corners of a polygon and keeps them on its outline', () => {
    const points = readPoints('50,0 100,80 0,80')
    const flat = pointsSkeleton(points, true)
    expect(flat.segs).toHaveLength(3)
    const corners = skeletonCorners(flat)
    expect(corners).toHaveLength(3)
    const radii = radiiOf(corners.map((c) => [c.k, 6]))
    const { sub } = roundSkeleton(flat, radii)
    expect(sub.segs.filter((s) => s.type === 'A')).toHaveLength(3)
    // Each arc is tangent to its sides: its ends lie on the triangle.
    const triangle = { ...flat }
    sub.segs.filter((s) => s.type === 'A').forEach((arc) => {
      expect(gap(triangle, arc)).toBeLessThan(1e-6)
    })
    // And read back, the same radii.
    const back = flattenSubpath(readPath(writePath([sub]))[0])
    expect([...back.radii.values()].map((r) => Math.round(r * 1000) / 1000)).toEqual([6, 6, 6])
  })

  it('makes a rounded corner sharp again', () => {
    const flat = rectSkeleton(0, 0, 100, 50)
    const rounded = flattenSubpath(roundSkeleton(flat, radiiOf([[0, 10]])).sub)
    const { sub } = roundSkeleton(rounded.flat, radiiOf([[0, 0]]))
    expect(sub.segs.map((s) => s.type)).toEqual(['L', 'L', 'L', 'L'])
  })

  it('keeps an open subpath open, without corners at its ends', () => {
    const flat = pointsSkeleton(readPoints('0,0 50,0 50,50'), false)
    const corners = skeletonCorners(flat)
    expect(corners.map((c) => c.k)).toEqual([0])
    const { sub } = roundSkeleton(flat, radiiOf([[0, 5]]))
    expect(sub.closed).toBe(false)
    close(sub, { x: 0, y: 0 })
    close(sub.segs.at(-1), { x: 50, y: 50 })
  })
})
