import { SnapIndex, spacingCandidates, snapMove, snapResize, snapPoint, SNAP_THRESHOLD } from '../../packages/svgcanvas/core/snap.js'

// Lot V2: snapping to the neighbours, the page, equal spacings, equal sizes
// and the grid, and the guides that say why.

const page = { x: 0, y: 0, width: 640, height: 480, page: true }
const A = { x: 100, y: 100, width: 80, height: 60 }
const B = { x: 300, y: 200, width: 40, height: 40 }
const options = { tolerance: SNAP_THRESHOLD, grid: 0, objects: true }

describe('snapping: alignment (V2)', () => {
  it('brings an edge or a middle to the very value of a neighbour', () => {
    const index = new SnapIndex([page, A, B])
    // The left edge of a box at x=10, dragged by 237: it lands at 247, 53
    // from B; dragged by 287 it is 3 from B's left edge, 300.
    const moving = { x: 10, y: 400, width: 20, height: 20 }
    const result = snapMove(index, moving, 287, 0, options)
    expect(result.dx).toBe(290)
    expect(moving.x + result.dx).toBe(300)
    // Its middle to the middle of A (140): from 107 + 20/2 → 140 asks 123.
    const middle = snapMove(index, moving, 123, 0, options)
    expect(moving.x + middle.dx + moving.width / 2).toBe(140)
  })

  it('leaves the move alone beyond 6 pixels, at any zoom', () => {
    const index = new SnapIndex([page, A])
    const moving = { x: 500, y: 400, width: 2, height: 2 }
    // 7 units from A's right edge (180) at 100 %: free.
    expect(snapMove(index, moving, -313, 0, options).dx).toBe(-313)
    // At 1 600 %, 6 pixels are 0.375 unit.
    expect(snapMove(index, moving, -320.3, 0, { ...options, tolerance: 6 / 16 }).dx).toBe(-320)
    expect(snapMove(index, moving, -320.5, 0, { ...options, tolerance: 6 / 16 }).dx).toBe(-320.5)
  })

  it('draws a guide through every neighbour on the line, and the box', () => {
    const C = { x: 100, y: 300, width: 30, height: 30 }
    const index = new SnapIndex([page, A, B, C])
    const moving = { x: 400, y: 380, width: 50, height: 20 }
    const result = snapMove(index, moving, -298, 0, options)
    expect(result.dx).toBe(-300)
    const line = result.guides.find((guide) => guide.type === 'line' && guide.axis === 'x' && guide.at === 100)
    // From the top of A to the bottom of the box.
    expect(line).toEqual({ type: 'line', axis: 'x', at: 100, from: 100, to: 400 })
  })

  it('snaps to the page: its edges and its middle', () => {
    const index = new SnapIndex([page])
    const moving = { x: 50, y: 50, width: 100, height: 100 }
    expect(snapMove(index, moving, 218, 0, options).dx).toBe(220)
    expect(snapMove(index, moving, 0, 137, options).dy).toBe(140)
  })
})

describe('snapping: spacings and sizes (V2)', () => {
  it('offers the spacing of two neighbours of the row, and the middle between two', () => {
    const left = { x: 0, y: 0, width: 100, height: 50 }
    const middle = { x: 150, y: 0, width: 100, height: 50 }
    const index = new SnapIndex([left, middle])
    const box = { x: 290, y: 10, width: 60, height: 20 }
    const starts = spacingCandidates(index, 'x', box).map((candidate) => candidate.start)
    // 50 apart from the box before it, like left and middle.
    expect(starts).toContain(300)
  })

  it('snaps to an equal spacing and shows both spacings', () => {
    const left = { x: 0, y: 0, width: 100, height: 50 }
    const middle = { x: 150, y: 0, width: 100, height: 50 }
    const index = new SnapIndex([left, middle])
    const moving = { x: 500, y: 10, width: 60, height: 20 }
    const result = snapMove(index, moving, -197, 0, options)
    expect(moving.x + result.dx).toBe(300)
    const gaps = result.guides.filter((guide) => guide.type === 'gap')
    expect(gaps.map((gap) => [gap.from, gap.to])).toEqual([[100, 150], [250, 300]])
  })

  it('centres a box between two neighbours', () => {
    const left = { x: 0, y: 0, width: 100, height: 50 }
    const right = { x: 300, y: 0, width: 100, height: 50 }
    const index = new SnapIndex([left, right])
    const moving = { x: 120, y: 10, width: 80, height: 20 }
    const result = snapMove(index, moving, 37, 0, options)
    expect(moving.x + result.dx).toBe(160)
  })

  it('resizes to the width of a neighbour, or to its edge', () => {
    const index = new SnapIndex([page, A])
    const moving = { x: 300, y: 300, width: 50, height: 40 }
    // East grip: width 50 + 27 = 77, 3 from the width of A (80).
    const wide = snapResize(index, moving, 'e', 27, 0, options)
    expect(moving.width + wide.dx).toBe(80)
    expect(wide.guides.filter((guide) => guide.type === 'size').length).toBe(2)
    // West grip: the left edge from 300 to 182, 2 from A's right edge.
    const west = snapResize(index, moving, 'w', -118, 0, options)
    expect(moving.x + west.dx).toBe(180)
    // From the middle (Alt): both edges move; the east one reaches the
    // middle of the page, 320.
    const centered = snapResize(index, { x: 200, y: 300, width: 50, height: 40 }, 'e', 67, 0, { ...options, centered: true })
    expect(200 + 50 + centered.dx).toBe(320)
  })

  it('with Shift, only the first axis snaps, the other follows it', () => {
    const index = new SnapIndex([page, A])
    const moving = { x: 300, y: 300, width: 50, height: 40 }
    const result = snapResize(index, moving, 'se', 27, 3, { ...options, proportional: true })
    expect(result.dx).toBe(30)
    expect(result.dy).toBe(3)
  })
})

describe('snapping: grid, points and suspension (V2)', () => {
  it('snaps an edge or a middle to the grid, after the neighbours', () => {
    const index = new SnapIndex([])
    const moving = { x: 3, y: 3, width: 24, height: 24 }
    // Left edge at 3 + 18 = 21 → 20; or right edge at 45 → 50: the nearest.
    expect(snapMove(index, moving, 18, 0, { ...options, grid: 10 }).dx).toBe(17)
    // A neighbour as near as the grid wins.
    const near = new SnapIndex([{ x: 22, y: 100, width: 10, height: 10 }])
    expect(snapMove(near, moving, 18, 0, { ...options, grid: 10, objects: true }).dx).toBe(19)
  })

  it('snaps a point being drawn, without spacings', () => {
    const index = new SnapIndex([page, A])
    expect(snapPoint(index, 178, 97, options)).toMatchObject({ x: 180, y: 100 })
    // Between A and a box at 260…300: the middle (220) is no snap for a point.
    const row = new SnapIndex([A, { x: 260, y: 100, width: 40, height: 60 }])
    expect(snapPoint(row, 218, 130, options).x).toBe(218)
  })

  it('finds a line among 10 000 objects in well under 2 ms per move', () => {
    const boxes = []
    for (let i = 0; i < 10000; i++) {
      boxes.push({ x: (i % 100) * 37.3, y: Math.floor(i / 100) * 29.1, width: 20 + (i % 7), height: 15 + (i % 5) })
    }
    const index = new SnapIndex([page, ...boxes])
    const moving = { x: 1000.4, y: 1000.7, width: 33, height: 21 }
    const moves = 200
    const start = performance.now()
    for (let i = 0; i < moves; i++) snapMove(index, moving, i * 0.71, i * 0.53, options)
    const perMove = (performance.now() - start) / moves
    expect(perMove).toBeLessThan(2)
  })
})

describe('measures with Alt (V2)', () => {
  it('gives the gaps between two boxes apart, on each axis', async () => {
    const { measureGuides } = await import('../../packages/svgcanvas/core/snap.js')
    const guides = measureGuides(A, B)
    expect(guides.map(({ axis, from, to }) => [axis, from, to])).toEqual([['x', 180, 300], ['y', 160, 200]])
  })

  it('gives the distances to the edges of a box around, at the middle of the selection', async () => {
    const { measureGuides } = await import('../../packages/svgcanvas/core/snap.js')
    const guides = measureGuides(A, page)
    expect(guides).toEqual([
      { type: 'measure', axis: 'x', from: 0, to: 100, at: 130 },
      { type: 'measure', axis: 'x', from: 180, to: 640, at: 130 },
      { type: 'measure', axis: 'y', from: 0, to: 100, at: 140 },
      { type: 'measure', axis: 'y', from: 160, to: 480, at: 140 }
    ])
  })
})

describe('snapping: the row where the box is now (V2)', () => {
  it('takes the spacings and the guides of the row a diagonal drag brings the box to', () => {
    const a = { x: 80, y: 80, width: 120, height: 80 }
    const c = { x: 260, y: 80, width: 120, height: 80 }
    const index = new SnapIndex([a, c])
    const moving = { x: 420, y: 300, width: 120, height: 80 }
    // Up into the row of a and c, 2 short of the spacing of a and c (60).
    const result = snapMove(index, moving, 18, -218, options)
    expect([moving.x + result.dx, moving.y + result.dy]).toEqual([440, 80])
    expect(result.guides.filter((guide) => guide.type === 'gap').map((gap) => [gap.from, gap.to])).toEqual([[200, 260], [380, 440]])
    // The line of the tops reaches the box where it is.
    const top = result.guides.find((guide) => guide.type === 'line' && guide.axis === 'y' && guide.at === 80)
    expect([top.from, top.to]).toEqual([80, 560])
  })
})
