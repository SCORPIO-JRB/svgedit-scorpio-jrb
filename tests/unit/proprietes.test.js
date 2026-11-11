import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import Paint from '../../packages/svgcanvas/core/paint.js'
import { derivedOf, strokeWeightOf, hasFill, hasForeignClip, defIdOf } from '../../packages/svgcanvas/core/stroke-align.js'

// Lot Propriétés, after the panel of Figma: the position of the stroke
// (centre, inside, outside), the eye of a paint, the blend mode of an object
// and the radius of the corners of a path.
describe('properties of the Figma panel', () => {
  let svgCanvas

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
      initFill: { color: 'DCDCDF', opacity: 1 },
      initStroke: { width: 1, color: '000000', opacity: 1 },
      initOpacity: 1,
      imgPath: '../editor/images',
      langPath: 'locale/',
      extPath: 'extensions/',
      extensions: [],
      initTool: 'select',
      wireframe: false
    })
    svgCanvas.setSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>' +
      '<path id="t1" d="M200,100 L320,300 L80,300 Z" fill="#DCDCDF" stroke="#000" stroke-width="4"/>' +
      '<rect id="r1" x="400" y="100" width="120" height="80" fill="none" stroke="#000" stroke-width="6"/>' +
      '<polygon id="p1" points="100,350 200,350 150,450" fill="#ccc" stroke="#000"/>' +
      '<line id="l1" x1="0" y1="0" x2="50" y2="50" stroke="#000"/>' +
      '<ellipse id="e1" cx="50" cy="50" rx="20" ry="10" fill="#ccc" stroke="#000" clip-path="url(#mine)"/>' +
      '</g></svg>'
    )
  })

  const el = (id) => document.getElementById(id)
  const select = (...ids) => {
    svgCanvas.clearSelection()
    svgCanvas.addToSelection(ids.map(el))
  }
  const steps = () => svgCanvas.undoMgr.getUndoStackSize()
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  describe('position of the stroke', () => {
    it('inside: twice as wide, clipped by a copy of the outline, in one step', () => {
      select('t1')
      const before = steps()
      svgCanvas.setStrokeAlign('inside')
      expect(steps()).toBe(before + 1)
      const t1 = el('t1')
      expect(t1.getAttribute('data-se-stroke-align')).toBe('inside')
      expect(t1.getAttribute('stroke-width')).toBe('8')
      expect(t1.getAttribute('clip-path')).toBe(`url(#${defIdOf(t1)})`)
      const clip = el(defIdOf(t1))
      expect(clip.tagName).toBe('clipPath')
      expect(clip.getAttribute('clipPathUnits')).toBe('userSpaceOnUse')
      expect(clip.firstElementChild.getAttribute('d')).toBe(t1.getAttribute('d'))
      // The inspector shows the weight.
      expect(strokeWeightOf(t1)).toBe(4)
      svgCanvas.undoMgr.undo()
      expect(t1.hasAttribute('data-se-stroke-align')).toBe(false)
      expect(t1.getAttribute('stroke-width')).toBe('4')
      expect(t1.hasAttribute('clip-path')).toBe(false)
    })

    it('the copy follows the outline, and goes with the element', async () => {
      select('t1')
      svgCanvas.setStrokeAlign('inside')
      const t1 = el('t1')
      t1.setAttribute('d', 'M0,0 L10,0 L10,10 Z')
      await flush()
      expect(el(defIdOf(t1)).firstElementChild.getAttribute('d')).toBe('M0,0 L10,0 L10,10 Z')
      t1.remove()
      await flush()
      expect(el(defIdOf(t1))).toBeNull()
    })

    it('outside: under the fill, or a mask when the shape has no fill', async () => {
      select('r1', 'p1')
      svgCanvas.setStrokeAlign('outside')
      const r1 = el('r1')
      const p1 = el('p1')
      expect(r1.getAttribute('stroke-width')).toBe('12')
      expect(r1.getAttribute('mask')).toBe(`url(#${defIdOf(r1)})`)
      expect(el(defIdOf(r1)).tagName).toBe('mask')
      expect(p1.getAttribute('stroke-width')).toBe('2')
      expect(p1.getAttribute('paint-order')).toBe('stroke')
      expect(p1.hasAttribute('mask')).toBe(false)
      // The polygon loses its fill: a mask cuts its inside out.
      p1.setAttribute('fill', 'none')
      await flush()
      expect(p1.getAttribute('mask')).toBe(`url(#${defIdOf(p1)})`)
      expect(p1.hasAttribute('paint-order')).toBe(false)
    })

    it('the weight typed is doubled for a stroke inside or outside', () => {
      select('t1')
      svgCanvas.setStrokeAlign('inside')
      svgCanvas.setStrokeWidth(3)
      expect(el('t1').getAttribute('stroke-width')).toBe('6')
    })

    it('a line, and a shape with a clip of its own, keep the stroke centred', () => {
      select('l1', 'e1')
      expect(svgCanvas.setStrokeAlign('inside')).toBeNull()
      expect(svgCanvas.commonStrokeAlign([el('l1')])).toBeNull()
      expect(hasForeignClip(el('e1'))).toBe(true)
      expect(el('e1').getAttribute('clip-path')).toBe('url(#mine)')
    })

    it('says what the element needs', () => {
      const t1 = el('t1')
      expect(derivedOf(t1)).toEqual({ 'clip-path': null, mask: null, 'paint-order': null })
      t1.setAttribute('data-se-stroke-align', 'outside')
      expect(hasFill(t1)).toBe(true)
      expect(derivedOf(t1)).toEqual({ 'clip-path': null, mask: null, 'paint-order': 'stroke' })
      t1.setAttribute('fill-opacity', '0')
      expect(derivedOf(t1).mask).toBe(`url(#${defIdOf(t1)})`)
    })
  })

  describe('eye of a paint', () => {
    it('hides the fill and keeps it, in one step; shows it again', () => {
      select('t1')
      const before = steps()
      svgCanvas.setPaintVisible('fill', false)
      expect(steps()).toBe(before + 1)
      expect(el('t1').getAttribute('fill')).toBe('none')
      expect(el('t1').getAttribute('data-se-fill-hidden')).toBe('#DCDCDF')
      expect(svgCanvas.isPaintHidden(el('t1'), 'fill')).toBe(true)
      svgCanvas.setPaintVisible('fill', true)
      expect(el('t1').getAttribute('fill')).toBe('#DCDCDF')
      expect(el('t1').hasAttribute('data-se-fill-hidden')).toBe(false)
      svgCanvas.undoMgr.undo()
      expect(el('t1').getAttribute('fill')).toBe('none')
      svgCanvas.undoMgr.undo()
      expect(el('t1').getAttribute('fill')).toBe('#DCDCDF')
    })

    it('a new paint shows the paint again', () => {
      select('t1')
      svgCanvas.setPaintVisible('stroke', false)
      expect(el('t1').getAttribute('stroke')).toBe('none')
      svgCanvas.setPaint('stroke', new Paint({ solidColor: 'ff0000', alpha: 100 }))
      expect(el('t1').getAttribute('stroke')).toBe('#ff0000')
      expect(el('t1').hasAttribute('data-se-stroke-hidden')).toBe(false)
    })

    it('leaves a shape without the paint as it is', () => {
      select('r1')
      expect(svgCanvas.setPaintVisible('fill', false)).toBeNull()
    })
  })

  describe('blend mode and corners', () => {
    it('gives a blend mode in one step, normal leaving nothing', () => {
      const before = steps()
      svgCanvas.setBlendModes([el('t1'), el('r1')], 'multiply')
      expect(steps()).toBe(before + 1)
      expect(svgCanvas.getBlendMode(el('t1'))).toBe('multiply')
      svgCanvas.setBlendModes([el('t1'), el('r1')], 'normal')
      expect(el('t1').getAttribute('style') ?? '').not.toContain('mix-blend-mode')
    })

    it('rounds every corner of a path, a rectangle and a polygon in one step', () => {
      const corners = svgCanvas.cornerActions
      expect(corners.radiusOf(el('t1'))).toEqual({ radius: 0, mixed: false })
      expect(corners.radiusOf(el('l1'))).toBeNull()
      const before = steps()
      const result = corners.setRadius([el('t1'), el('r1'), el('p1')], 10)
      expect(steps()).toBe(before + 1)
      expect(el('t1').getAttribute('d')).toMatch(/A10,10/)
      expect(el('r1').getAttribute('rx')).toBe('10')
      // The polygon became a path.
      expect(result[2].tagName).toBe('path')
      expect(corners.radiusOf(result[2])).toEqual({ radius: 10, mixed: false })
      expect(corners.radiusOf(el('t1'))).toEqual({ radius: 10, mixed: false })
      corners.setRadius([el('t1')], 0)
      expect(el('t1').getAttribute('d')).not.toMatch(/A/)
    })
  })
})
