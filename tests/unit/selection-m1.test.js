import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// M1: flip, align and distribute applied to a multi-selection.

describe('selection commands (M1)', () => {
  let svgCanvas

  const createSvgCanvas = () => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    const toolsLeft = document.createElement('div')
    toolsLeft.id = 'tools_left'
    svgEditor.append(workarea, toolsLeft)
    document.body.append(svgEditor)

    svgCanvas = new SvgCanvas(document.getElementById('svgcanvas'), {
      canvas_expansion: 3,
      dimensions: [640, 480],
      initFill: { color: 'FF0000', opacity: 1 },
      initStroke: { width: 5, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
  }

  const rect = (id, x, y, width, height) => svgCanvas.addSVGElementsFromJson({
    element: 'rect',
    attr: { id, x, y, width, height, stroke: 'none' }
  })

  const line = (id, x1, y1, x2, y2) => svgCanvas.addSVGElementsFromJson({
    element: 'line',
    attr: { id, x1, y1, x2, y2, stroke: 'none' }
  })

  const num = (elem, name) => Number(elem.getAttribute(name))

  beforeEach(() => {
    createSvgCanvas()
  })

  afterEach(() => {
    document.body.textContent = ''
  })

  describe('flip', () => {
    it('flips a multi-selection around the centre of its common box', () => {
      // Common box from x = 10 to x = 70: the axis is x = 40.
      const a = line('a', 10, 20, 30, 20)
      const b = line('b', 50, 60, 70, 60)
      svgCanvas.selectOnly([a, b], true)
      const undoSize = svgCanvas.undoMgr.getUndoStackSize()

      svgCanvas.flipSelectedElements(-1, 1)

      expect([num(a, 'x1'), num(a, 'x2')]).toEqual([70, 50])
      expect([num(b, 'x1'), num(b, 'x2')]).toEqual([30, 10])
      // Vertical positions do not move in a horizontal flip.
      expect([num(a, 'y1'), num(b, 'y1')]).toEqual([20, 60])
      expect(a.hasAttribute('transform')).toBe(false)
      expect(b.hasAttribute('transform')).toBe(false)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)
    })

    it('restores every element with a single undo', () => {
      const a = rect('a', 0, 0, 20, 10)
      const b = rect('b', 100, 50, 40, 30)
      svgCanvas.selectOnly([a, b], true)

      svgCanvas.flipSelectedElements(1, -1)
      // Common box from y = 0 to y = 80: the axis is y = 40.
      expect(num(a, 'y')).toBe(70)
      expect(num(b, 'y')).toBe(0)

      svgCanvas.undoMgr.undo()
      expect([num(a, 'x'), num(a, 'y')]).toEqual([0, 0])
      expect([num(b, 'x'), num(b, 'y')]).toEqual([100, 50])
    })

    it('still flips a single element around its own centre', () => {
      const a = rect('a', 100, 100, 40, 20)
      svgCanvas.selectOnly([a], true)
      svgCanvas.flipSelectedElements(-1, 1)
      expect([num(a, 'x'), num(a, 'y'), num(a, 'width')]).toEqual([100, 100, 40])
    })
  })

  describe('align relative to the largest or smallest object', () => {
    // Areas: wide 2 000, square 10 000, tall 3 000. By width alone the wide
    // rectangle was the largest and the tall one the smallest.
    let wide
    let square
    let tall
    beforeEach(() => {
      wide = rect('wide', 0, 0, 200, 10)
      square = rect('square', 300, 200, 100, 100)
      tall = rect('tall', 500, 50, 10, 300)
      svgCanvas.selectOnly([wide, square, tall], true)
    })

    it('uses the object with the largest area', () => {
      svgCanvas.alignSelectedElements('t', 'largest')
      expect([num(wide, 'y'), num(square, 'y'), num(tall, 'y')]).toEqual([200, 200, 200])
    })

    it('uses the object with the smallest area', () => {
      svgCanvas.alignSelectedElements('l', 'smallest')
      expect([num(wide, 'x'), num(square, 'x'), num(tall, 'x')]).toEqual([0, 0, 0])
    })
  })

  describe('distribute', () => {
    it('sorts by left edge and keeps the leftmost object in place', () => {
      // The wide rectangle starts first but ends after the narrow one.
      const wideBox = rect('wide', 0, 0, 300, 20)
      const narrow1 = rect('n1', 100, 40, 20, 20)
      const narrow2 = rect('n2', 400, 80, 20, 20)
      svgCanvas.selectOnly([wideBox, narrow1, narrow2], true)

      svgCanvas.alignSelectedElements('dh', 'selected')

      // Span 0 to 420, widths 340: two gaps of 40.
      expect(num(wideBox, 'x')).toBe(0)
      expect(num(narrow1, 'x')).toBe(340)
      expect(num(narrow2, 'x')).toBe(400)
    })

    it('sorts by top edge for a vertical distribution', () => {
      const tallBox = rect('tall', 0, 0, 20, 300)
      const small1 = rect('s1', 40, 100, 20, 20)
      const small2 = rect('s2', 80, 400, 20, 20)
      svgCanvas.selectOnly([tallBox, small1, small2], true)

      svgCanvas.alignSelectedElements('dv', 'selected')

      expect(num(tallBox, 'y')).toBe(0)
      expect(num(small1, 'y')).toBe(340)
      expect(num(small2, 'y')).toBe(400)
    })
  })

  describe('cloneSelectedElements', () => {
    it('can return the insertion without recording it', () => {
      const a = rect('a', 10, 10, 20, 20)
      svgCanvas.selectOnly([a], true)
      const undoSize = svgCanvas.undoMgr.getUndoStackSize()

      const cmd = svgCanvas.cloneSelectedElements(0, 0, { addToHistory: false })

      expect(cmd.elements()).toHaveLength(1)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize)
    })

    it('records the insertion by default', () => {
      const a = rect('a', 10, 10, 20, 20)
      svgCanvas.selectOnly([a], true)
      const undoSize = svgCanvas.undoMgr.getUndoStackSize()
      svgCanvas.cloneSelectedElements(20, 20)
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(undoSize + 1)
    })
  })
})
