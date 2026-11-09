import {
  route, simplify, isOrthogonal, followEnds, moveSegment, movableSegments, parsePoints, formatPoints, STUB
} from '../../packages/svgcanvas/core/orthogonal.js'
import { parsePorts, formatPorts, viewportMatrix, directionOf } from '../../packages/svgcanvas/core/ports.js'
import { snapPorts } from '../../packages/svgcanvas/core/snap.js'
import { DEFAULT_SYMBOL_LIBRARIES } from '../../src/editor/gtb-symbols.js'
import { fold, safeMarkup } from '../../src/editor/symbols.js'

// Lot V7 (plan v2, section 2.11): the orthogonal router, the ports of the
// symbols and the GTB library, without the browser.

/** The box of a point list. */
const segments = (points) => points.slice(1).map((p, i) => [points[i], p])
/** Whether a horizontal or vertical segment goes through the inside of a box. */
const through = ([a, b], box) => {
  const left = box.x
  const right = box.x + box.width
  const top = box.y
  const bottom = box.y + box.height
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
}
const bends = (points) => points.length - 2

describe('orthogonal router (V7)', () => {
  it('joins two facing ports with a straight line', () => {
    const points = route({ x: 40, y: 20, dir: 'right' }, { x: 200, y: 20, dir: 'left' })
    expect(points).toEqual([{ x: 40, y: 20 }, { x: 200, y: 20 }])
  })

  it('joins two facing ports at different heights with two bends, in the middle', () => {
    const points = route({ x: 40, y: 20, dir: 'right' }, { x: 200, y: 100, dir: 'left' })
    expect(isOrthogonal(points)).toBe(true)
    expect(bends(points)).toBe(2)
    expect(points[1].x).toBe(120)
  })

  it('leaves each port in its direction, for a stub at least', () => {
    const start = { x: 100, y: 100, dir: 'up', box: { x: 80, y: 100, width: 40, height: 40 } }
    const end = { x: 300, y: 260, dir: 'left', box: { x: 300, y: 240, width: 40, height: 40 } }
    const points = route(start, end)
    expect(isOrthogonal(points)).toBe(true)
    expect(points[1].x).toBe(100)
    expect(points[1].y).toBeLessThanOrEqual(100 - STUB)
    const last = points[points.length - 2]
    expect(last.y).toBe(260)
    expect(last.x).toBeLessThanOrEqual(300 - STUB)
  })

  it('goes round the boxes of the two equipments', () => {
    // Out on the right of A, in on the right of B, which lies to the right of A:
    // the route must go round B to reach its right side.
    const a = { x: 0, y: 0, width: 40, height: 40 }
    const b = { x: 200, y: 0, width: 40, height: 40 }
    const points = route({ x: 40, y: 20, dir: 'right', box: a }, { x: 240, y: 20, dir: 'right', box: b })
    expect(isOrthogonal(points)).toBe(true)
    for (const segment of segments(points)) {
      expect(through(segment, a)).toBe(false)
      expect(through(segment, b)).toBe(false)
    }
    expect(points[points.length - 2].x).toBeGreaterThanOrEqual(240 + STUB)
  })

  it('goes round another obstacle in the way', () => {
    const wall = { x: 100, y: -100, width: 20, height: 240 }
    const points = route({ x: 40, y: 20, dir: 'right' }, { x: 200, y: 20, dir: 'left' }, { obstacles: [wall] })
    expect(isOrthogonal(points)).toBe(true)
    for (const segment of segments(points)) expect(through(segment, wall)).toBe(false)
  })

  it('rounds the free coordinates to the grid when it snaps', () => {
    const points = route({ x: 40, y: 20, dir: 'right' }, { x: 207, y: 103, dir: 'left' }, { grid: 10 })
    expect(points[1].x % 10).toBe(0)
  })

  it('falls back on a route with a middle bend when the stubs are inside the other box', () => {
    const a = { x: 0, y: 0, width: 40, height: 40 }
    const b = { x: 50, y: 0, width: 40, height: 40 }
    const points = route({ x: 40, y: 20, dir: 'right', box: a }, { x: 50, y: 30, dir: 'left', box: b })
    expect(isOrthogonal(points)).toBe(true)
    expect(points[0]).toEqual({ x: 40, y: 20 })
    expect(points[points.length - 1]).toEqual({ x: 50, y: 30 })
  })

  it('a shaped route follows its ends, keeping its middle', () => {
    const shaped = [{ x: 40, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 200 }, { x: 160, y: 200 }, { x: 160, y: 60 }, { x: 200, y: 60 }]
    const moved = followEnds(shaped, { x: 40, y: 30, dir: 'right' }, { x: 200, y: 70, dir: 'left' })
    expect(moved).toEqual([{ x: 40, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 200 }, { x: 160, y: 200 }, { x: 160, y: 70 }, { x: 200, y: 70 }])
    // Its end now leaves upwards: the shape cannot be kept.
    expect(followEnds(shaped, { x: 40, y: 30, dir: 'up' }, { x: 200, y: 70, dir: 'left' })).toBe(null)
  })

  it('a middle segment moves across, the elbows follow; the first and last do not', () => {
    const points = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 120, y: 100 }]
    expect(movableSegments(points)).toEqual([{ index: 1, x: 50, y: 50, vertical: true }])
    expect(moveSegment(points, 1, 70)).toEqual([{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 100 }, { x: 120, y: 100 }])
    expect(moveSegment(points, 0, 70)).toBe(null)
    expect(moveSegment(points, 2, 70)).toBe(null)
  })

  it('reads and writes the points of a polyline, and simplifies them', () => {
    expect(parsePoints('0,0 10,0 20,0 20,5')).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 5 }])
    expect(simplify(parsePoints('0,0 10,0 10,0 20,0 20,5'))).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 5 }])
    expect(formatPoints([{ x: 1.234, y: 5 }, { x: 2, y: 3.456 }])).toBe('1.23,5 2,3.46')
  })

  it('routes a hundred connectors in a few milliseconds each', () => {
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) {
      route({ x: i, y: 20, dir: 'right', box: { x: i - 40, y: 0, width: 40, height: 40 } },
        { x: 300 + i, y: 200 - i, dir: i % 2 ? 'up' : 'left', box: { x: 300 + i, y: 180 - i, width: 40, height: 40 } })
    }
    expect((performance.now() - t0) / 100).toBeLessThan(5)
  })
})

describe('ports (V7)', () => {
  it('reads and writes the ports of a symbol; what cannot be read is left out', () => {
    const ports = parsePorts('in 0 20 left in; out 40 20 right out; bad x y; p 1 2 sideways')
    expect(ports).toEqual([
      { id: 'in', x: 0, y: 20, dir: 'left', kind: 'in' },
      { id: 'out', x: 40, y: 20, dir: 'right', kind: 'out' }
    ])
    expect(formatPorts(ports)).toBe('in 0 20 left in; out 40 20 right out')
  })

  it('places the viewBox of a symbol in the viewport of its use, as preserveAspectRatio says', () => {
    expect(viewportMatrix({ x: 10, y: 20, width: 80, height: 80 }, [0, 0, 40, 40])).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 })
    // Meet, centred: a wide viewport keeps the proportions.
    expect(viewportMatrix({ x: 0, y: 0, width: 80, height: 40 }, [0, 0, 40, 40])).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 20, f: 0 })
    expect(viewportMatrix({ x: 0, y: 0, width: 80, height: 40 }, [0, 0, 40, 40], 'none')).toEqual({ a: 2, b: 0, c: 0, d: 1, e: 0, f: 0 })
  })

  it('a port within reach of another is a magnet first: the move puts one on the other', () => {
    const moving = [{ x: 20, y: 40 }]
    const targets = [{ x: 100, y: 120 }, { x: 300, y: 300 }]
    const snapped = snapPorts(moving, targets, 77, 83, 9)
    expect([snapped.dx, snapped.dy]).toEqual([80, 80])
    expect(snapped.guides.map((g) => g.axis)).toEqual(['x', 'y'])
    expect(snapPorts(moving, targets, 60, 60, 9)).toBe(null)
  })

  it('the direction nearest a vector', () => {
    expect([directionOf(1, 0.2), directionOf(-3, 1), directionOf(0.1, -2), directionOf(0, 1)]).toEqual(['right', 'left', 'up', 'down'])
  })
})

describe('GTB symbols (V7)', () => {
  const symbols = DEFAULT_SYMBOL_LIBRARIES.flatMap((library) => library.symbols)

  it('18 symbols, each with a key, a version, a drawing and ports on the edge of its box, on the grid of 10', () => {
    expect(symbols).toHaveLength(18)
    expect(new Set(symbols.map((s) => s.id)).size).toBe(18)
    for (const s of symbols) {
      const [, , w, h] = s.viewBox.split(' ').map(Number)
      expect(s.version).toBeGreaterThanOrEqual(1)
      expect(s.width % 10).toBe(0)
      expect(s.height % 10).toBe(0)
      expect(s.ports.length).toBeGreaterThan(0)
      for (const port of s.ports) {
        expect(port.x % 10).toBe(0)
        expect(port.y % 10).toBe(0)
        const onEdge = port.x === 0 || port.y === 0 || port.x === w || port.y === h
        expect(onEdge).toBe(true)
        // The port leaves its box outwards.
        const out = { left: port.x === 0, right: port.x === w, up: port.y === 0, down: port.y === h }
        expect(out[port.dir]).toBe(true)
      }
    }
  })

  it('the body takes the colours of its instance: no fill nor stroke on the first shape', () => {
    for (const s of symbols) {
      const first = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${s.body}</svg>`, 'image/svg+xml')
        .documentElement.firstElementChild
      expect(first.hasAttribute('stroke')).toBe(false)
      expect(s.attributes.fill).toMatch(/^#/)
      expect(s.attributes.stroke).toMatch(/^#/)
      expect(s.attributes.class).toMatch(/^equipement /)
    }
  })

  it('folds case and accents for the search; the preview of a symbol runs nothing', () => {
    expect(fold('Échangeur À Plaques')).toBe('echangeur a plaques')
    const safe = safeMarkup('<circle r="2" onload="alert(1)"/><script>alert(2)</script><a href="javascript:x()"><rect/></a>')
    expect(safe).not.toMatch(/onload|script|javascript/)
    expect(safe).toContain('circle')
  })
})
