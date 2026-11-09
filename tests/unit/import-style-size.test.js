/**
 * Importing an SVG file (lot 4): the size the file declares, its stylesheet
 * confined to it, the `style` attribute kept above the rules, and an import
 * that fails leaves the drawing as it was.
 */
import { vi } from 'vitest'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { inlineStyleSheets } from '../../packages/svgcanvas/core/svg-paste.js'

const DRAWING = `<svg xmlns="${NS.SVG}" width="640" height="480">` +
  '<style>@keyframes flux { to { opacity: 0 } }</style>' +
  '<g class="layer"><title>L</title><rect id="exist" class="a" width="10" height="10" fill="blue"/></g></svg>'

describe('Importing an SVG file (lot 4)', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const workarea = document.createElement('div')
    workarea.id = 'workarea'
    const svgcanvas = document.createElement('div')
    svgcanvas.id = 'svgcanvas'
    workarea.append(svgcanvas)
    svgEditor.append(workarea)
    document.body.append(svgEditor)
    svgCanvas = new SvgCanvas(svgcanvas, {
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
    svgCanvas.setSvgString(DRAWING)
  })

  const symbolOf = (use) => document.getElementById(svgCanvas.getHref(use).slice(1))
  const sizeOf = (use) => [use.getAttribute('width'), use.getAttribute('height')]

  it('gives the <use> the size the file declares, and the symbol keeps the view box', () => {
    const svg = (attributes) => `<svg xmlns="${NS.SVG}" ${attributes}><rect width="5" height="5"/></svg>`

    const mm = svgCanvas.importSvgString(svg('width="200mm" height="100mm" viewBox="0 0 200 100"'))
    assert.deepEqual(sizeOf(mm), ['755.91', '377.95'])
    assert.equal(mm.getAttribute('transform'), null)
    assert.equal(symbolOf(mm).getAttribute('viewBox'), '0 0 200 100')
    assert.equal(symbolOf(mm).getAttribute('width'), null)
    assert.deepEqual(sizeOf(svgCanvas.importSvgString(svg('viewBox="0 0 1920 1080"'))), ['1920', '1080'])
    assert.deepEqual(sizeOf(svgCanvas.importSvgString(svg('width="300" viewBox="0 0 200 100"'))), ['300', '150'])
    assert.deepEqual(sizeOf(svgCanvas.importSvgString(svg('width="100%" height="100%" viewBox="0 0 40 30"'))), ['40', '30'])
    assert.deepEqual(sizeOf(svgCanvas.importSvgString(svg('width="40" height="30"'))), ['40', '30'])
    // Nothing declared: the <use> shows the file as it is, at 100 %
    assert.deepEqual(sizeOf(svgCanvas.importSvgString(svg(''))), [null, null])
  })

  it('confines the stylesheet of the file to its symbol, and lists what it removed', () => {
    const removed = []
    svgCanvas.bind('contentRemoved', (win, report) => removed.push(report))
    const use = svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10">` +
      '<style>@namespace x "http://a"; .a { fill: red; animation: flux 1s } body { margin: 0 } @keyframes flux { to { opacity: 1 } }</style>' +
      '<rect class="a" width="5" height="5"/></svg>')
    const symbol = symbolOf(use)
    const css = symbol.querySelector('style').textContent

    assert.ok(css.includes(`#${symbol.id} .a, #${symbol.id}.a { fill: red; animation: flux-2 1s }`), css)
    assert.ok(css.includes('@keyframes flux-2 {'), css)
    assert.ok(!css.includes('body'), css)
    assert.deepEqual(removed, [{ action: 'import', items: ['@namespace x "http://a"', 'body'] }])
    // The animation of the drawing is untouched
    assert.equal(document.querySelector('#svgcontent > style').textContent, '@keyframes flux { to { opacity: 0 } }')
  })

  it('keeps in the style attribute what a rule of the stylesheet also sets, on import as on opening', () => {
    const file = `<svg xmlns="${NS.SVG}" width="10" height="10"><style>.a { fill: red }</style>` +
      '<rect id="t" class="a" style="fill: blue; stroke: green" width="5" height="5"/></svg>'

    // As the file wrote it, since V6 (option fidelity.styleProperties)
    const rect = symbolOf(svgCanvas.importSvgString(file)).querySelector('rect')
    assert.equal(rect.getAttribute('style'), 'fill: blue')
    assert.equal(rect.getAttribute('stroke'), 'green')

    svgCanvas.setSvgString(file)
    assert.equal(document.getElementById('t').getAttribute('style').replace(/;pointer-events:inherit$/, ''), 'fill: blue')
    // Without a rule for it, a property becomes an attribute, as before
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10"><rect id="t" style="fill: blue" width="5" height="5"/></svg>`)
    assert.equal(document.getElementById('t').getAttribute('style'), null)
    assert.equal(document.getElementById('t').getAttribute('fill'), 'blue')
  })

  it('puts the drawing back as it was when an import fails half-way', () => {
    const before = svgCanvas.getSvgString()
    const steps = svgCanvas.undoMgr.getUndoStackSize()
    const failure = vi.spyOn(svgCanvas, 'getCurrentGroup').mockImplementation(() => { throw new Error('failure') })
    const originalError = console.error
    console.error = () => {}
    try {
      assert.equal(svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10"><rect width="5" height="5"/></svg>`), null)
    } finally {
      console.error = originalError
      failure.mockRestore()
    }
    assert.equal(svgCanvas.getSvgString(), before)
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), steps)
    assert.equal(document.querySelectorAll('#svgcontent symbol, #svgcontent use').length, 0)
  })

  it('refuses what is not an SVG document, and changes nothing', () => {
    const before = svgCanvas.getSvgString()
    const originalError = console.error
    console.error = () => {}
    try {
      for (const text of ['', '<html><body/></html>', `<svg xmlns="${NS.SVG}"><rect width="5"`, `<foo xmlns="${NS.SVG}"/>`]) {
        assert.equal(svgCanvas.importSvgString(text), null, text)
      }
    } finally {
      console.error = originalError
    }
    assert.equal(svgCanvas.getSvgString(), before)
  })
})

describe('inlineStyleSheets', () => {
  it('lists what could not become attributes, with the selectors as the file wrote them', () => {
    const root = new DOMParser().parseFromString(`<svg xmlns="${NS.SVG}" id="s1">` +
      '<style>@keyframes k { to { opacity: 0 } } #s1 .a, #s1.a { fill: red; animation: k 1s } #s1 .b, #s1.b { fill: blue }</style>' +
      '<rect class="a"/></svg>', 'image/svg+xml').documentElement
    const lost = inlineStyleSheets(root, { original: (selector) => selector.replace(/^#s1 ?/, '') })

    assert.equal(root.querySelector('rect').getAttribute('fill'), 'red')
    assert.deepEqual(lost, ['@keyframes k', 'animation', '.b'])
  })
})
