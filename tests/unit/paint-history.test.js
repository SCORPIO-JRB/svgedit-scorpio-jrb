import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import Paint from '../../packages/svgcanvas/core/paint.js'

// The colour window (se-color-field): a paint is one undo step, and a
// preview shows a paint without touching the history.
describe('paint history and preview', () => {
  let svgCanvas

  afterEach(() => svgCanvas?.cancelPaintPreview())

  beforeEach(() => {
    document.body.textContent = ''
    const editor = document.createElement('div')
    editor.id = 'svg_editor'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const canvas = document.createElement('div')
    canvas.id = 'svgcanvas'
    workarea.append(canvas)
    editor.append(workarea)
    document.body.append(editor)
    svgCanvas = new SvgCanvas(canvas, {
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
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
      '<rect id="r1" x="10" y="10" width="50" height="50" fill="#160f23"/>' +
      '<g id="g1"><rect id="r2" fill="#4cc38a"/><line id="l1" stroke="#000"/></g></svg>'
    )
  })

  const select = (...ids) => {
    svgCanvas.clearSelection()
    svgCanvas.addToSelection(ids.map((id) => document.getElementById(id)))
  }
  const steps = () => svgCanvas.undoMgr.getUndoStackSize()
  const gradient = (stops) => {
    const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
    for (const [offset, color] of stops) {
      const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      stop.setAttribute('offset', offset)
      stop.setAttribute('stop-color', color)
      grad.append(stop)
    }
    return grad
  }

  it('changes the colour and the opacity in one step', () => {
    select('r1')
    const before = steps()
    svgCanvas.setPaint('fill', new Paint({ solidColor: 'f08a62', alpha: 50 }))
    const rect = document.getElementById('r1')
    expect(rect.getAttribute('fill')).toBe('#f08a62')
    expect(rect.getAttribute('fill-opacity')).toBe('0.5')
    expect(steps()).toBe(before + 1)
    svgCanvas.undoMgr.undo()
    expect(rect.getAttribute('fill')).toBe('#160f23')
    expect(rect.hasAttribute('fill-opacity')).toBe(false)
    svgCanvas.undoMgr.redo()
    expect(rect.getAttribute('fill')).toBe('#f08a62')
    expect(rect.getAttribute('fill-opacity')).toBe('0.5')
  })

  it('adds a gradient to the defs and takes it back in the same step', () => {
    select('r1')
    const before = steps()
    svgCanvas.setPaint('fill', new Paint({ linearGradient: gradient([['0', '#000'], ['1', '#fff']]) }))
    const rect = document.getElementById('r1')
    const id = rect.getAttribute('fill').match(/^url\(#(.+)\)$/)[1]
    expect(document.getElementById(id).localName).toBe('linearGradient')
    expect(steps()).toBe(before + 1)
    svgCanvas.undoMgr.undo()
    expect(rect.getAttribute('fill')).toBe('#160f23')
    expect(document.getElementById(id)).toBeNull()
    svgCanvas.undoMgr.redo()
    expect(document.getElementById(id).localName).toBe('linearGradient')
    expect(rect.getAttribute('fill')).toBe(`url(#${id})`)
    // The same gradient again is the one already in the defs.
    select('r2')
    svgCanvas.setPaint('fill', new Paint({ linearGradient: gradient([['0', '#000'], ['1', '#fff']]) }))
    expect(document.getElementById('r2').getAttribute('fill')).toBe(`url(#${id})`)
  })

  it('previews a paint outside the history and gives the elements back', () => {
    select('g1', 'r1')
    const before = steps()
    const r1 = document.getElementById('r1')
    const r2 = document.getElementById('r2')
    const line = document.getElementById('l1')
    svgCanvas.previewPaint('fill', new Paint({ solidColor: 'ff0000', alpha: 40 }))
    svgCanvas.previewPaint('fill', new Paint({ solidColor: '00ff00', alpha: 30 }))
    expect(r1.getAttribute('fill')).toBe('#00ff00')
    expect(r2.getAttribute('fill')).toBe('#00ff00')
    // The shapes of a group take it, as with setColor.
    expect(line.getAttribute('fill')).toBe('#00ff00')
    expect(r1.getAttribute('fill-opacity')).toBe('0.3')
    expect(steps()).toBe(before)
    expect(svgCanvas.cancelPaintPreview()).toBe(true)
    expect(r1.getAttribute('fill')).toBe('#160f23')
    expect(r1.hasAttribute('fill-opacity')).toBe(false)
    expect(r2.getAttribute('fill')).toBe('#4cc38a')
    expect(line.hasAttribute('fill')).toBe(false)
    expect(svgCanvas.cancelPaintPreview()).toBe(false)
  })

  it('gives a filled polyline its new fill, not a line or a connector', () => {
    svgCanvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480">' +
      '<polyline id="room" points="0,0 50,0 50,40" fill="rgba(255, 255, 255, .1)"/>' +
      '<line id="ln" x1="0" y1="0" x2="9" y2="9" stroke="#000"/>' +
      '<polyline id="conn" points="0,0 9,9" fill="none" stroke="#000" se:connector="a b"/></svg>')
    const [room, line, conn] = ['room', 'ln', 'conn'].map((id) => document.getElementById(id))
    select('room', 'ln', 'conn')
    svgCanvas.previewPaint('fill', new Paint({ solidColor: 'ff0000', alpha: 10 }))
    expect([room.getAttribute('fill'), line.getAttribute('fill'), conn.getAttribute('fill')]).toEqual(['#ff0000', null, 'none'])
    svgCanvas.setPaint('fill', new Paint({ solidColor: 'ff0000', alpha: 10 }))
    // The transparency of the old colour does not stay under the new opacity.
    expect([room.getAttribute('fill'), room.getAttribute('fill-opacity')]).toEqual(['#ff0000', '0.1'])
    expect([line.getAttribute('fill'), conn.getAttribute('fill')]).toEqual([null, 'none'])
    svgCanvas.undoMgr.undo()
    expect([room.getAttribute('fill'), room.getAttribute('fill-opacity')]).toEqual(['rgba(255, 255, 255, .1)', null])
  })

  it('records a previewed paint against the paint before the preview', () => {
    select('r1')
    const r1 = document.getElementById('r1')
    svgCanvas.previewPaint('fill', new Paint({ linearGradient: gradient([['0', '#f00'], ['1', '#00f']]) }))
    expect(r1.getAttribute('fill')).toBe('url(#se_paint_preview_fill)')
    svgCanvas.setPaint('fill', new Paint({ solidColor: 'f08a62' }))
    expect(document.getElementById('se_paint_preview_fill')).toBeNull()
    svgCanvas.undoMgr.undo()
    expect(r1.getAttribute('fill')).toBe('#160f23')
  })

  it('removes the defs a gradient preview made', () => {
    svgCanvas.setSvgString('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect id="r3" fill="#000"/></svg>')
    select('r3')
    const content = svgCanvas.getSvgContent()
    expect(content.querySelector('defs')).toBeNull()
    svgCanvas.previewPaint('fill', new Paint({ linearGradient: gradient([['0', '#f00'], ['1', '#00f']]) }))
    expect(content.querySelector('defs')).not.toBeNull()
    svgCanvas.cancelPaintPreview()
    expect(content.querySelector('defs')).toBeNull()
  })

  it('groups the history of a function and nests', () => {
    select('r1')
    const before = steps()
    svgCanvas.groupHistory('outer', () => {
      svgCanvas.changeSelectedAttribute('x', 20)
      svgCanvas.groupHistory('inner', () => {
        svgCanvas.changeSelectedAttribute('y', 30)
      })
    })
    expect(steps()).toBe(before + 1)
    expect(Object.prototype.hasOwnProperty.call(svgCanvas.undoMgr, 'addCommandToHistory')).toBe(false)
    svgCanvas.undoMgr.undo()
    const r1 = document.getElementById('r1')
    expect([r1.getAttribute('x'), r1.getAttribute('y')]).toEqual(['10', '10'])
  })
})
