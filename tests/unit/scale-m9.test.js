import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import {
  anchorOfGrip,
  boxPoint,
  dragFactor,
  scaleNumbers,
  MIN_SCALE
} from '../../packages/svgcanvas/core/scale-tool.js'

// M9: the Scale tool.
describe('Scale tool geometry (M9)', () => {
  const box = { x: 100, y: 100, width: 200, height: 100 }

  it('places the nine anchor points', () => {
    expect(boxPoint(box, 'nw')).toEqual({ x: 100, y: 100 })
    expect(boxPoint(box, 'c')).toEqual({ x: 200, y: 150 })
    expect(boxPoint(box, 'se')).toEqual({ x: 300, y: 200 })
    expect(boxPoint(box, 'e')).toEqual({ x: 300, y: 150 })
    expect(boxPoint(box, 's')).toEqual({ x: 200, y: 200 })
  })

  it('fixes the opposite grip, or the center with Alt', () => {
    expect(anchorOfGrip('se')).toBe('nw')
    expect(anchorOfGrip('e')).toBe('w')
    expect(anchorOfGrip('n')).toBe('s')
    expect(anchorOfGrip('se', true)).toBe('c')
  })

  it('measures the factor along the line from the fixed point to the grip', () => {
    const anchor = { x: 100, y: 100 }
    const grip = { x: 300, y: 200 }
    // The pointer starts a little outside the grip: the factor is 1 there.
    const start = { x: 304, y: 202 }
    expect(dragFactor({ anchor, grip, start, pointer: start })).toBe(1)
    expect(dragFactor({ anchor, grip, start, pointer: { x: 508, y: 304 } })).toBeCloseTo(2, 9)
    // Moving across the line does not change the factor.
    const across = dragFactor({ anchor, grip, start, pointer: { x: 304 - 10, y: 202 + 20 } })
    expect(across).toBeCloseTo(1, 9)
    // The selection never collapses or turns over.
    expect(dragFactor({ anchor, grip, start, pointer: { x: 0, y: 0 } })).toBe(MIN_SCALE)
  })

  it('scales every number of a value and keeps the rest', () => {
    expect(scaleNumbers('2', 1.5)).toBe('3')
    expect(scaleNumbers('5,3', 2)).toBe('10,6')
    expect(scaleNumbers('5 3', 0.5)).toBe('2.5 1.5')
    expect(scaleNumbers('2px', 3)).toBe('6px')
    expect(scaleNumbers('none', 3)).toBe('none')
    expect(scaleNumbers('0.1', 3)).toBe('0.3')
  })
})

describe('Scale tool on the canvas (M9)', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
    svgcanvas.style.visibility = 'hidden'
    svgcanvas.id = 'svgcanvas'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    workarea.append(svgcanvas)
    svgEditor.append(workarea)
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
  })

  const byId = (id) => document.getElementById(id)
  const load = (content) => svgCanvas.setSvgString(
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">' +
    `<g class="layer"><title>L</title>${content}</g></svg>`
  )

  it('is turned off by another mode', () => {
    svgCanvas.setMode('select')
    svgCanvas.setScaleTool(true)
    expect(svgCanvas.isScaleTool()).toBe(true)
    svgCanvas.setMode('select')
    expect(svgCanvas.isScaleTool()).toBe(true)
    svgCanvas.setMode('rect')
    expect(svgCanvas.isScaleTool()).toBe(false)
  })

  it('scales the geometry, the stroke and the dashes, as one undo step', () => {
    load('<rect id="a" x="10" y="10" width="20" height="10" stroke="#000" stroke-width="2" stroke-dasharray="4,2"/>')
    svgCanvas.selectOnly([byId('a')])
    const before = svgCanvas.undoMgr.getUndoStackSize()
    const original = svgCanvas.getSvgString()
    svgCanvas.scaleSelectionBy(2, { anchor: 'nw' })
    const a = byId('a')
    expect(['x', 'y', 'width', 'height', 'stroke-width', 'stroke-dasharray'].map((n) => a.getAttribute(n)))
      .toEqual(['10', '10', '40', '20', '4', '8,4'])
    expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(before + 1)
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getSvgString()).toBe(original)
  })
  it('gives its own width to a shape whose inherited width no longer fits', () => {
    // The rectangle draws a stroke of 1, the default: it gets 2.
    load('<rect id="a" x="10" y="10" width="10" height="10" stroke="#000"/>' +
      '<rect id="b" x="40" y="10" width="10" height="10" fill="#f00"/>')
    svgCanvas.selectOnly([byId('a'), byId('b')])
    svgCanvas.scaleSelectionBy(2)
    expect(byId('a').getAttribute('stroke-width')).toBe('2')
    // Without a stroke, nothing is added.
    expect(byId('b').hasAttribute('stroke-width')).toBe(false)
  })

  it('scales widths and dashes written in a style attribute', () => {
    load('<path id="p" d="M10,10 L50,10"/>')
    // Pasted content may keep its stroke in a style attribute.
    byId('p').setAttribute('style', 'stroke:#000;stroke-width:2;stroke-dasharray:4 2')
    svgCanvas.selectOnly([byId('p')])
    svgCanvas.scaleSelectionBy(1.5)
    expect(byId('p').getAttribute('style')).toBe('stroke:#000;stroke-width:3;stroke-dasharray:6 3')
  })

  it('scales the font size and the stroke of a text', () => {
    load('<text id="t" x="10" y="30" font-size="20" stroke="#000" stroke-width="1">Hi</text>')
    svgCanvas.selectOnly([byId('t')])
    svgCanvas.scaleSelectionBy(2)
    expect(byId('t').getAttribute('font-size')).toBe('40')
    expect(byId('t').getAttribute('stroke-width')).toBe('2')
    expect(byId('t').hasAttribute('transform')).toBe(false)
  })

  it("scales the editor's blur and widens its region when needed", () => {
    load('<defs><filter id="a_blur"><feGaussianBlur stdDeviation="2"/></filter></defs>' +
      '<rect id="a" x="10" y="10" width="10" height="10" filter="url(#a_blur)"/>')
    svgCanvas.selectOnly([byId('a')])
    svgCanvas.scaleSelectionBy(2)
    const filter = byId('a_blur')
    expect(filter.firstElementChild.getAttribute('stdDeviation')).toBe('4')
    expect(filter.getAttribute('x')).toBe('-50%')
    svgCanvas.undoMgr.undo()
    expect(filter.firstElementChild.getAttribute('stdDeviation')).toBe('2')
    expect(filter.hasAttribute('x')).toBe(false)
  })

  it('keeps the chosen anchor in place', () => {
    load('<rect id="a" x="10" y="10" width="20" height="10"/>')
    svgCanvas.selectOnly([byId('a')])
    svgCanvas.scaleSelectionBy(2, { anchor: 'se' })
    expect(['x', 'y', 'width', 'height'].map((n) => byId('a').getAttribute(n))).toEqual(['-10', '0', '40', '20'])
    svgCanvas.scaleSelectionBy(0.5, { anchor: 'c' })
    expect(['x', 'y', 'width', 'height'].map((n) => byId('a').getAttribute(n))).toEqual(['0', '5', '20', '10'])
  })

  it('ignores a factor that is not positive', () => {
    load('<rect id="a" x="10" y="10" width="20" height="10"/>')
    svgCanvas.selectOnly([byId('a')])
    expect(svgCanvas.scaleSelectionBy(0)).toBeNull()
    expect(svgCanvas.scaleSelectionBy(-2)).toBeNull()
    expect(svgCanvas.scaleSelectionBy(1)).toBeNull()
  })

  it('distributes with an imposed spacing from the first object', () => {
    load('<rect id="a" x="0" y="0" width="10" height="10"/>' +
      '<rect id="b" x="15" y="0" width="20" height="10"/>' +
      '<rect id="c" x="100" y="0" width="10" height="10"/>')
    svgCanvas.selectOnly([byId('c'), byId('a'), byId('b')])
    svgCanvas.alignSelectedElements('distrib_horiz', 'page', { spacing: 5 })
    expect(['a', 'b', 'c'].map((id) => byId(id).getAttribute('x'))).toEqual(['0', '15', '40'])
  })
})
