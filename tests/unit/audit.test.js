import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import en from '../../src/editor/locale/lang.en.js'
import fr from '../../src/editor/locale/lang.fr.js'

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

  describe('Mod+D at a zoom other than 100 %', () => {
    const xOf = (elem) => Number(elem.getAttribute('x'))
    const yOf = (elem) => Number(elem.getAttribute('y'))
    const copy = () => svgCanvas.getSelectedElements()[0]

    beforeEach(() => {
      load(drawing('<rect id="r1" x="100" y="100" width="40" height="30"/>'))
      svgCanvas.setZoom(2)
      select('r1')
    })

    it('continues the series of a copy that was moved', () => {
      svgCanvas.duplicateSelectedElements()
      // 20 pixels of the screen, as before: 10 in the drawing at 200 %
      expect(xOf(copy())).toBe(110)
      // Moved by 100 in the drawing (the function takes pixels of the screen)
      svgCanvas.moveSelectedElements(200, 0, true)
      expect(xOf(copy())).toBe(210)

      svgCanvas.duplicateSelectedElements()
      expect([xOf(copy()), yOf(copy())]).toEqual([320, 120])

      // The series is in the units of the drawing: another zoom keeps it
      svgCanvas.setZoom(1)
      svgCanvas.duplicateSelectedElements()
      expect([xOf(copy()), yOf(copy())]).toEqual([430, 130])
    })

    it('continues the series of an Alt+drag', () => {
      // Alt+drag: copies made in place, then moved; the offset is measured
      svgCanvas.cloneSelectedElements(0, 0)
      svgCanvas.moveSelectedElements(0, 70, true)
      svgCanvas.rememberDuplicate(svgCanvas.getSelectedElements(), [$('r1')])
      expect(yOf(copy())).toBe(135)

      svgCanvas.duplicateSelectedElements()
      expect(yOf(copy())).toBe(170)
    })

    it('repeats a fixed offset (Alt+arrows) as before', () => {
      svgCanvas.duplicateSelectedElements({ x: 10, y: 0 })
      expect(xOf(copy())).toBe(105)
      svgCanvas.duplicateSelectedElements()
      expect(xOf(copy())).toBe(110)
    })
  })

  describe('ungrouping a group that has an opacity', () => {
    beforeEach(() => {
      load(drawing(
        '<g id="g1" opacity="0.5"><rect id="a" x="10" y="10" width="50" height="50"/>' +
        '<rect id="b" x="100" y="10" width="50" height="50" opacity="0.5"/></g>'
      ))
      select('g1')
    })

    it('gives the opacity to the objects, as before', () => {
      svgCanvas.ungroupSelectedElement()

      expect($('g1')).toBeNull()
      expect($('a').getAttribute('opacity')).toBe('0.5')
      expect($('b').getAttribute('opacity')).toBe('0.25')
    })

    it('is one undo step, which puts back the group and the opacities', () => {
      svgCanvas.ungroupSelectedElement()
      expect(svgCanvas.undoMgr.getUndoStackSize()).toBe(1)

      svgCanvas.undoMgr.undo()

      expect($('g1').getAttribute('opacity')).toBe('0.5')
      expect($('a').parentNode).toBe($('g1'))
      // Left at 0.5 under a group at 0.5, the object showed at 25 %
      expect($('a').hasAttribute('opacity')).toBe(false)
      expect($('b').getAttribute('opacity')).toBe('0.5')

      svgCanvas.undoMgr.redo()
      expect($('g1')).toBeNull()
      expect($('a').getAttribute('opacity')).toBe('0.5')
      expect($('b').getAttribute('opacity')).toBe('0.25')
    })
  })

  describe('flipping a shape filled with a gradient', () => {
    // The flip gives the shape a mirrored copy of its gradient
    const GRADIENT = '<defs><linearGradient id="lg" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs>'
    const gradients = () => [...svgCanvas.getSvgContent().querySelectorAll('linearGradient')].map((gradient) => gradient.id)

    beforeEach(() => {
      load(drawing('<rect id="r1" x="100" y="100" width="120" height="60" fill="url(#lg)"/>', GRADIENT))
      select('r1')
    })

    it('mirrors the gradient, as before', () => {
      svgCanvas.flipSelectedElements(-1, 1)

      const fill = $('r1').getAttribute('fill')
      expect(fill).not.toBe('url(#lg)')
      expect(gradients()).toHaveLength(2)
      const mirrored = svgCanvas.getSvgContent().querySelector(`#${fill.slice(5, -1)}`)
      expect([mirrored.getAttribute('x1'), mirrored.getAttribute('x2')]).toEqual(['1', '0'])
    })

    it('is undone with its gradient: the fill comes back, the copy goes', () => {
      svgCanvas.flipSelectedElements(-1, 1)
      const flipped = $('r1').getAttribute('fill')

      svgCanvas.undoMgr.undo()
      expect($('r1').getAttribute('fill')).toBe('url(#lg)')
      expect(gradients()).toEqual(['lg'])

      svgCanvas.undoMgr.redo()
      expect($('r1').getAttribute('fill')).toBe(flipped)
      expect(gradients()).toHaveLength(2)
    })
  })

  describe('flipping a rotated path that has rounded corners', () => {
    // The radii of an arc only follow a scale: under a matrix that turns
    // the path, they were written as 0 and the corners became sharp.
    const ROUNDED = 'M110,100 L190,100 A10,10 0 0 1 200,110 L200,150 A10,10 0 0 1 190,160 L110,160 A10,10 0 0 1 100,150 L100,110 A10,10 0 0 1 110,100 Z'
    const radii = () => [...$('p1').getAttribute('d').matchAll(/A\s*([\d.]+)[\s,]+([\d.]+)/g)].map(([, rx, ry]) => [Number(rx), Number(ry)])

    it('keeps the radii of the corners', () => {
      load(drawing(`<path id="p1" d="${ROUNDED}" transform="rotate(90 150 130)"/>`))
      select('p1')

      svgCanvas.flipSelectedElements(-1, 1)

      expect(radii()).toEqual([[10, 10], [10, 10], [10, 10], [10, 10]])
    })

    it('still writes the flip into a path without arcs', () => {
      load(drawing('<path id="p1" d="M100,100 L200,100 L200,160 L100,160 Z" transform="rotate(90 150 130)"/>'))
      select('p1')

      svgCanvas.flipSelectedElements(-1, 1)

      expect($('p1').hasAttribute('transform')).toBe(false)
    })
  })
})

describe('audit corrections (translations)', () => {
  it('the French file has the texts of the paste conflict dialog', () => {
    const keys = ['clipboardDefsConflict', 'clipboardUseExisting', 'clipboardReplaceExisting', 'clipboardKeepBoth']
    for (const key of keys) {
      expect(fr.notification[key], key).toBeTruthy()
      expect(fr.notification[key], key).not.toBe(en.notification[key])
    }
    expect(fr.notification.clipboardDefsConflict).toContain('{{ids}}')
    // The editor tells the answer by its text: the three must differ
    expect(new Set(keys.slice(1).map((key) => fr.notification[key])).size).toBe(3)
  })
})
