import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { BACKGROUND_ATTR, getPageBackgroundColor } from '../../packages/svgcanvas/core/page-background.js'
import { backgroundPaint, UNPAINTED_MODES } from '../../src/editor/panels/Inspector.js'

// Lot Fond, after the Page section of Figma: the background of the page is a
// rectangle of its size, in a locked layer under the others, in the file.
describe('the background of the page', () => {
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
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">' +
      '<g class="layer"><title>Réseaux</title><rect id="r1" x="100" y="120" width="200" height="100" fill="#f00"/></g>' +
      '<g class="layer"><title>Équipements</title><circle id="c1" cx="400" cy="300" r="20"/></g>' +
      '</svg>'
    )
    svgCanvas.setCurrentLayer('Réseaux')
  })

  const content = () => svgCanvas.getSvgContent()
  const layers = () => [...content().querySelectorAll(':scope > g')].map((g) => g.querySelector('title').textContent)
  const steps = () => svgCanvas.undoMgr.getUndoStackSize()
  const current = () => svgCanvas.getCurrentDrawing().getCurrentLayerName()

  it('is made, in one step, in a locked layer under the others; the current layer stays', () => {
    expect(svgCanvas.getPageBackground()).toBeNull()
    const before = steps()
    svgCanvas.setPageBackground('#160F23', 1, 'Fond')
    expect(steps()).toBe(before + 1)
    expect(layers()).toEqual(['Fond', 'Réseaux', 'Équipements'])
    expect(current()).toBe('Réseaux')
    const rect = svgCanvas.getPageBackground()
    expect(rect.getAttribute(BACKGROUND_ATTR)).toBe('true')
    expect(['x', 'y', 'width', 'height'].map((name) => rect.getAttribute(name))).toEqual(['0', '0', '640', '480'])
    expect(svgCanvas.isLockedSelf(rect.parentNode)).toBe(true)
    expect(getPageBackgroundColor()).toEqual({ color: '#160F23', opacity: 1 })
    svgCanvas.undoMgr.undo()
    expect(svgCanvas.getPageBackground()).toBeNull()
    expect(layers()).toEqual(['Réseaux', 'Équipements'])
  })

  it('changes its colour and opacity in one step, and goes with its layer', () => {
    svgCanvas.setPageBackground('#ffffff', 1, 'Fond')
    const before = steps()
    svgCanvas.setPageBackground('#3a2c5a', 0.5)
    expect(steps()).toBe(before + 1)
    expect(svgCanvas.getPageBackground().getAttribute('fill-opacity')).toBe('0.5')
    // The same colour again makes no step.
    expect(svgCanvas.setPageBackground('#3a2c5a', 0.5)).toBeNull()
    svgCanvas.setPageBackground(null)
    expect(svgCanvas.getPageBackground()).toBeNull()
    expect(layers()).toEqual(['Réseaux', 'Équipements'])
    expect(current()).toBe('Réseaux')
    svgCanvas.undoMgr.undo()
    expect(getPageBackgroundColor()).toEqual({ color: '#3a2c5a', opacity: 0.5 })
  })

  it('shows a colour being chosen outside the history, and gives it back', () => {
    svgCanvas.setPageBackground('#ffffff', 1, 'Fond')
    const before = steps()
    svgCanvas.previewPageBackground('#00ff00', 0.25)
    expect(svgCanvas.getPageBackground().getAttribute('fill')).toBe('#00ff00')
    expect(steps()).toBe(before)
    svgCanvas.cancelPageBackgroundPreview()
    expect(getPageBackgroundColor()).toEqual({ color: '#ffffff', opacity: 1 })
    // The step of a colour chosen after a preview gives back the colour before.
    svgCanvas.previewPageBackground('#00ff00')
    svgCanvas.setPageBackground('#0000ff')
    svgCanvas.undoMgr.undo()
    expect(getPageBackgroundColor()).toEqual({ color: '#ffffff', opacity: 1 })
  })

  it('follows the size of the page, in the same step', () => {
    svgCanvas.setPageBackground('#ffffff', 1, 'Fond')
    const before = steps()
    svgCanvas.setResolution(800, 600)
    expect(steps()).toBe(before + 1)
    const rect = svgCanvas.getPageBackground()
    expect([rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['800', '600'])
    svgCanvas.undoMgr.undo()
    expect([rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['640', '480'])
  })

  it('is not content: the content looked at is that of the first layer with something else', () => {
    // jsdom has no layout: the layers and the shapes are given a box.
    const boxed = (elem) => { elem.getBBox = () => ({ x: 0, y: 0, width: 10, height: 10 }) }
    svgCanvas.setPageBackground('#ffffff', 1, 'Fond')
    for (const elem of content().querySelectorAll(':scope > g, g > rect, g > circle')) boxed(elem)
    // (jsdom gives <title> a getBBox too, which a browser does not.)
    const ids = (elems) => elems.filter((elem) => elem.tagName !== 'title').map((elem) => elem.id)
    expect(ids(svgCanvas.getVisibleElements())).toEqual(['r1'])
    // In the layer of the background, the other objects are content.
    const layer = svgCanvas.getPageBackground().parentNode
    const extra = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    extra.id = 'extra'
    boxed(extra)
    layer.append(extra)
    expect(ids(svgCanvas.getVisibleElements(layer))).toEqual(['extra'])
  })

  it('is written in the file', () => {
    svgCanvas.setPageBackground('#160F23', 1, 'Fond')
    const svg = svgCanvas.getSvgString()
    expect(svg).toMatch(/<g class="layer" se:locked="true">\s*<title>Fond<\/title>\s*<rect id="[^"]+" data-se-background="true" x="0" y="0" width="640" height="480" fill="#160F23"\/>/)
  })
})

describe('the field of the background and the paint of the next shape', () => {
  it('shows the colour of the background, or none', () => {
    expect(backgroundPaint({ color: '#160F23', opacity: 0.5 })).toMatchObject({ type: 'solidColor', solidColor: '160f23', alpha: 50 })
    expect(backgroundPaint({ color: 'white', opacity: 1 })).toMatchObject({ solidColor: 'ffffff', alpha: 100 })
    expect(backgroundPaint(null)).toMatchObject({ type: 'solidColor', solidColor: 'none' })
  })

  it('shows Fill and Stroke without a selection only with a drawing tool', () => {
    expect(UNPAINTED_MODES.has('select')).toBe(true)
    expect(UNPAINTED_MODES.has('frame')).toBe(true)
    expect(UNPAINTED_MODES.has('rect')).toBe(false)
    expect(UNPAINTED_MODES.has('text')).toBe(false)
  })
})
