import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'

// Bugs found by the audit of the code (November 2026), on the canvas: each
// test first showed the bug, then its correction.
const NS = 'http://www.w3.org/2000/svg'

describe('audit corrections (canvas)', () => {
  let svgCanvas

  const $ = (id) => document.getElementById(id)
  const drawing = (content, defs = '') =>
    `<svg xmlns="${NS}" width="640" height="480">${defs}<g class="layer"><title>Layer 1</title>${content}</g></svg>`
  const load = (svg) => {
    const loaded = svgCanvas.setSvgString(svg)
    svgCanvas.undoMgr.resetUndoStack()
    return loaded
  }
  const select = (...ids) => {
    svgCanvas.clearSelection()
    svgCanvas.addToSelection(ids.map($))
  }

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
  })

  describe('undo after a save', () => {
    // A save drops the definitions nothing uses any more, and remembers
    // them: the undo of a deletion must bring them back with the object.

    it('brings back the symbol of a deleted instance', () => {
      load(drawing(
        '<use id="u1" href="#pompe" x="100" y="100" width="40" height="40"/>',
        '<defs><symbol id="pompe" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/></symbol></defs>'
      ))
      select('u1')
      svgCanvas.deleteSelectedElements()
      expect(svgCanvas.getSvgString()).not.toContain('<symbol')

      svgCanvas.undoMgr.undo()

      const saved = svgCanvas.getSvgString()
      expect(saved).toContain('<use id="u1"')
      expect(saved).toContain('<symbol id="pompe"')
    })

    it('brings back a gradient and the one it takes its stops from', () => {
      load(drawing(
        '<rect id="r1" x="10" y="10" width="50" height="50" fill="url(#g2)"/>',
        '<defs><linearGradient id="g1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient>' +
        '<linearGradient id="g2" href="#g1" x1="0" y1="0" x2="0" y2="1"/></defs>'
      ))
      select('r1')
      svgCanvas.deleteSelectedElements()
      expect(svgCanvas.getSvgString()).not.toContain('linearGradient')

      svgCanvas.undoMgr.undo()

      const saved = svgCanvas.getSvgString()
      expect(saved).toContain('id="g2"')
      expect(saved).toContain('id="g1"')
    })

    it('writes nothing in the definitions for a reference that leads nowhere', () => {
      load(drawing('<rect id="r1" x="10" y="10" width="50" height="50" fill="url(#nowhere)"/>', '<defs/>'))
      select('r1')
      svgCanvas.deleteSelectedElements()

      svgCanvas.undoMgr.undo()

      expect(svgCanvas.getSvgString()).not.toContain('undefined')
    })
  })

  describe('a source that is not a drawing', () => {
    it('is refused without touching the current drawing', () => {
      load(drawing('<rect id="r1" x="10" y="10" width="50" height="50"/>'))
      const before = svgCanvas.getSvgString()

      for (const source of [`<g xmlns="${NS}"><rect width="5" height="5"/></g>`, '<html><body/></html>', 'not a file']) {
        expect(svgCanvas.setSvgString(source)).toBe(false)
        expect(svgCanvas.getSvgContent().localName).toBe('svg')
        expect(svgCanvas.getSvgString()).toBe(before)
        expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(0)
      }
    })
  })
})
