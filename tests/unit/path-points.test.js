import { describe, it, expect } from 'vitest'
import {
  parseD, readPath, writePath, nodeIndex, pointAt, splitSegment, nearestPoint,
  insertNode, reverseSubpath, transformSubpath, openEnds, joinSubpaths, arcCenter
} from '../../packages/svgcanvas/core/path-points.js'

const close = (a, b, eps = 1e-6) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps)
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps)
}

/** Points along a whole subpath, to compare two shapes. */
const sample = (sub, n = 20) => sub.segs.flatMap((seg, i) => {
  const p0 = i ? sub.segs[i - 1] : sub
  return Array.from({ length: n }, (_, k) => pointAt(p0, seg, k / n))
})

/** Distance from a point to the nearest point of a subpath. */
const gap = (sub, p) => nearestPoint([sub], p).distance

describe('path-points: reading and writing', () => {
  it('reads arcs whose flags have no separator', () => {
    expect(parseD('M0 0a5 5 0 1010 10')[1].values).toEqual([5, 5, 0, 1, 0, 10, 10])
  })

  it('reads relative, H, V, S and T as absolute L, C and Q', () => {
    const [sub] = readPath('m10 10 h10 v10 s5 5 10 0 t10 0')
    expect(sub).toMatchObject({ x: 10, y: 10, closed: false })
    expect(sub.segs.map((s) => s.type)).toEqual(['L', 'L', 'C', 'Q'])
    expect(sub.segs[1]).toMatchObject({ x: 20, y: 20 })
    // S after a lineto: its first control point is the current point.
    expect(sub.segs[2]).toMatchObject({ x1: 20, y1: 20, x2: 25, y2: 25, x: 30, y: 20 })
    // T after a non-quadratic: its control point is the current point.
    expect(sub.segs[3]).toMatchObject({ x1: 30, y1: 20, x: 40, y: 20 })
  })

  it('reflects the control point of S after C', () => {
    const [sub] = readPath('M0,0 C0,10 10,10 10,0 S20,-10 20,0')
    expect(sub.segs[1]).toMatchObject({ x1: 10, y1: -10 })
  })

  it('ends a closed subpath with a segment back to its start, as fixEnd does', () => {
    const subs = readPath('M0,0 L10,0 L10,10 Z M20,20 L30,20')
    expect(subs[0].closed).toBe(true)
    expect(subs[0].segs.at(-1)).toMatchObject({ type: 'L', x: 0, y: 0 })
    expect(writePath(subs)).toBe('M0,0 L10,0 L10,10 L0,0 Z M20,20 L30,20')
    // Index of each node in the segment list of that d.
    expect(nodeIndex(subs, 0, 0)).toBe(1)
    expect(nodeIndex(subs, 1, 0)).toBe(6)
  })

  it('writes what it reads', () => {
    const d = 'M0,0 C1,2 3,4 5,6 Q7,8 9,10 A5,5 0 1 0 20,20'
    expect(writePath(readPath(d))).toBe(d)
  })
})

describe('path-points: splitting keeps the shape', () => {
  const cases = {
    line: 'M0,0 L100,0',
    cubic: 'M0,0 C0,100 100,100 100,0',
    quadratic: 'M0,0 Q50,100 100,0',
    arc: 'M0,0 A50,30 20 0 1 100,0',
    'large arc': 'M0,0 A50,50 0 1 0 60,0'
  }
  for (const [name, d] of Object.entries(cases)) {
    it(`a ${name}`, () => {
      const [before] = readPath(d)
      const subs = readPath(d)
      expect(insertNode(subs, 0, 0, 0.3)).toBe(true)
      const [after] = subs
      expect(after.segs).toHaveLength(2)
      // The new node is on the old shape, and the new shape on the old one.
      close(after.segs[0], pointAt(before, before.segs[0], 0.3), 1e-6)
      for (const p of sample(after)) expect(gap(before, p)).toBeLessThan(1e-6)
      for (const p of sample(before)) expect(gap(after, p)).toBeLessThan(1e-6)
    })
  }

  it('a large arc split in two gives the large flag to the larger part only', () => {
    const [sub] = readPath('M0,0 A50,50 0 1 0 60,0')
    const [a, b] = splitSegment(sub, sub.segs[0], 0.8)
    expect(a.large).toBe(1)
    expect(b.large).toBe(0)
  })

  it('no node at an end of a segment', () => {
    const subs = readPath('M0,0 L100,0')
    expect(insertNode(subs, 0, 0, 0)).toBe(false)
    expect(insertNode(subs, 0, 0, 1)).toBe(false)
  })

  it('arc radii too small to join the ends are enlarged', () => {
    const e = arcCenter({ x: 0, y: 0 }, { type: 'A', rx: 10, ry: 10, angle: 0, large: 0, sweep: 1, x: 100, y: 0 })
    expect(e.rx).toBeCloseTo(50)
    close({ x: e.cx, y: e.cy }, { x: 50, y: 0 })
  })
})

describe('path-points: nearest point', () => {
  it('on the nearest segment, with its parameter', () => {
    const subs = readPath('M0,0 L100,0 L100,100')
    const hit = nearestPoint(subs, { x: 103, y: 40 })
    expect(hit).toMatchObject({ sub: 0, seg: 1 })
    expect(hit.t).toBeCloseTo(0.4)
    expect(hit.distance).toBeCloseTo(3)
  })

  it('on a curve', () => {
    const subs = readPath('M0,0 C0,100 100,100 100,0')
    const top = pointAt(subs[0], subs[0].segs[0], 0.5)
    const hit = nearestPoint(subs, { x: top.x, y: top.y + 5 })
    expect(hit.t).toBeCloseTo(0.5, 3)
    expect(hit.distance).toBeCloseTo(5, 3)
  })
})

describe('path-points: reversing and transforming', () => {
  it('a reversed subpath has the same shape, run backwards', () => {
    const [sub] = readPath('M0,0 L10,0 C20,0 30,10 30,20 Q30,40 10,40 A10,10 0 0 1 0,30')
    const rev = reverseSubpath(sub)
    close(rev, { x: 0, y: 30 })
    close(rev.segs.at(-1), { x: 0, y: 0 })
    for (const p of sample(rev)) expect(gap(sub, p)).toBeLessThan(1e-6)
    for (const p of sample(sub)) expect(gap(rev, p)).toBeLessThan(1e-6)
  })

  it('an arc through a rotation and a non-uniform scale stays on the image of the ellipse', () => {
    const [sub] = readPath('M0,0 A40,20 30 0 1 60,10')
    const rad = (25 * Math.PI) / 180
    const m = { a: 2 * Math.cos(rad), b: 2 * Math.sin(rad), c: -0.5 * Math.sin(rad), d: 0.5 * Math.cos(rad), e: 7, f: -3 }
    const out = transformSubpath(sub, m)
    const tp = (p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f })
    for (const p of sample(sub)) expect(gap(out, tp(p))).toBeLessThan(1e-6)
  })

  it('a mirror swaps the sweep of an arc', () => {
    const [sub] = readPath('M0,0 A10,10 0 0 1 20,0')
    const out = transformSubpath(sub, { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    expect(out.segs[0].sweep).toBe(0)
  })
})

describe('path-points: extending and joining', () => {
  const [line] = readPath('M0,0 L10,0') // source: 0,0 -> 10,0
  const [other] = readPath('M50,0 L60,0') // target: 50,0 -> 60,0

  it('only open subpaths have ends', () => {
    expect(openEnds(readPath('M0,0 L1,1 Z M5,5 L6,6'))).toEqual([
      { sub: 1, end: 'start', x: 5, y: 5 },
      { sub: 1, end: 'end', x: 6, y: 6 }
    ])
  })

  it('from the end of the source, the drawing follows it', () => {
    const [drawn] = readPath('M10,0 L20,10')
    expect(writePath([joinSubpaths({ drawn, source: line, sourceEnd: 'end' })])).toBe('M0,0 L10,0 L20,10')
  })

  it('from the start of the source, the drawing comes before it and the source keeps its direction', () => {
    const [drawn] = readPath('M0,0 L-10,10')
    expect(writePath([joinSubpaths({ drawn, source: line, sourceEnd: 'start' })])).toBe('M-10,10 L0,0 L10,0')
  })

  it('ending on the other end of the source closes it', () => {
    const [drawn] = readPath('M10,0 L5,10 L0,0')
    const out = joinSubpaths({ drawn, source: line, sourceEnd: 'end', close: true })
    expect(writePath([out])).toBe('M0,0 L10,0 L5,10 L0,0 Z')
    const [back] = readPath('M0,0 L5,10 L10,0')
    expect(writePath([joinSubpaths({ drawn: back, source: line, sourceEnd: 'start', close: true })]))
      .toBe('M10,0 L5,10 L0,0 L10,0 Z')
  })

  it('joins two paths through the drawing, whichever ends', () => {
    const [drawn] = readPath('M10,0 L50,0')
    expect(writePath([joinSubpaths({ drawn, source: line, sourceEnd: 'end', target: other, targetEnd: 'start' })]))
      .toBe('M0,0 L10,0 L50,0 L60,0')
    const [toEnd] = readPath('M10,0 L60,0')
    expect(writePath([joinSubpaths({ drawn: toEnd, source: line, sourceEnd: 'end', target: other, targetEnd: 'end' })]))
      .toBe('M0,0 L10,0 L60,0 L50,0')
    const [fromStart] = readPath('M0,0 L60,0')
    expect(writePath([joinSubpaths({ drawn: fromStart, source: line, sourceEnd: 'start', target: other, targetEnd: 'end' })]))
      .toBe('M50,0 L60,0 L0,0 L10,0')
  })

  it('a new drawing ending on a path joins it, the path keeping its direction', () => {
    const [drawn] = readPath('M30,30 L50,0')
    expect(writePath([joinSubpaths({ drawn, target: other, targetEnd: 'start' })])).toBe('M30,30 L50,0 L60,0')
    const [toEnd] = readPath('M30,30 L60,0')
    expect(writePath([joinSubpaths({ drawn: toEnd, target: other, targetEnd: 'end' })])).toBe('M50,0 L60,0 L30,30')
  })
})
