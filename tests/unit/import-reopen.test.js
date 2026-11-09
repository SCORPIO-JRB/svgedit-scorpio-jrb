/**
 * What the tests of 8 November with five real files found around the import
 * (lot 6): a drawing saved with an import, then opened again, is unchanged;
 * the gradients of a file keep their units; ungrouping an import is one undo
 * step.
 */
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'

const parse = (markup) => new DOMParser().parseFromString(markup, 'image/svg+xml')

// The gradients the conversion to bounding box units drew differently: one
// shared by two shapes, one taking its units and stops from another (href),
// a slanted one on a shape that is not square, a radial one.
const GRADIENTS = '<defs>' +
  '<linearGradient id="shared" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="200" y2="0"><stop offset="0" stop-color="#f60"/><stop offset="1" stop-color="#fc0"/></linearGradient>' +
  '<linearGradient id="base" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="90" y2="0"><stop offset="0" stop-color="#cdb081"/><stop offset="1" stop-color="#e4c595"/></linearGradient>' +
  '<linearGradient id="inherits" x1="20" y1="100" x2="120" y2="100" xlink:href="#base"/>' +
  '<linearGradient id="slanted" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="40" y2="240" gradientTransform="rotate(10)"><stop offset="0" stop-color="#36a"/><stop offset="1" stop-color="#6af"/></linearGradient>' +
  '<radialGradient id="round" gradientUnits="userSpaceOnUse" cx="250" cy="250" r="30"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>' +
  '</defs>'
const SHAPES = '<rect id="s1" x="0" y="0" width="60" height="40" fill="url(#shared)"/>' +
  '<rect id="s2" x="100" y="0" width="60" height="40" fill="url(#shared)"/>' +
  '<rect id="i1" x="20" y="80" width="100" height="40" fill="url(#inherits)"/>' +
  '<rect id="sl" x="0" y="200" width="160" height="30" fill="url(#slanted)"/>' +
  '<ellipse id="ro" cx="250" cy="250" rx="60" ry="20" fill="url(#round)"/>'

describe('Opening and saving again (lot 6)', () => {
  let svgCanvas
  let reports

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
    reports = []
    svgCanvas.bind('contentRemoved', (win, report) => reports.push(report))
  })

  const attributesOf = (root, selector) => [...root.querySelectorAll(selector)].map((elem) =>
    [elem.id, ...[...elem.attributes].filter((a) => a.localName !== 'id').map((a) => `${a.localName}=${a.value}`).sort()])

  it('keeps the units and the coordinates of the gradients of an opened file', () => {
    const file = `<svg xmlns="${NS.SVG}" xmlns:xlink="${NS.XLINK}" width="640" height="480">${GRADIENTS}` +
      `<g class="layer"><title>L</title>${SHAPES}</g></svg>`
    const before = attributesOf(parse(file).documentElement, 'linearGradient, radialGradient')
    svgCanvas.setSvgString(file)
    const after = attributesOf(parse(svgCanvas.getSvgString()).documentElement, 'linearGradient, radialGradient')

    assert.deepEqual(after, before)
    // Each shape still paints with its own gradient
    assert.deepEqual(['s1', 's2', 'i1', 'sl', 'ro'].map((id) => document.getElementById(id).getAttribute('fill')),
      ['url(#shared)', 'url(#shared)', 'url(#inherits)', 'url(#slanted)', 'url(#round)'])
  })

  it('saves a drawing with an import, then opens it again without changing it', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title>` +
      '<rect id="mine" x="5" y="5" width="20" height="20"/></g></svg>')
    // A file such as Inkscape or Illustrator writes: a version, objects
    // without identifiers, gradients made from others, root attributes that
    // apply to its objects.
    svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" xmlns:xlink="${NS.XLINK}" version="1.1" enable-background="new 0 0 400 300" ` +
      `viewBox="0 0 400 300" text-anchor="middle" font-family="Arial" clip-path="url(#cadre)">${GRADIENTS}` +
      '<defs><clipPath id="cadre"><rect width="400" height="300"/></clipPath></defs>' +
      `<g class="layer"><title>Layer 1</title>${SHAPES}<text x="200" y="150">Pompe</text><g><rect width="5" height="5"/></g></g></svg>`)
    const saved = svgCanvas.getSvgString()
    const symbol = parse(saved).querySelector('symbol')

    // What applies to the objects is kept; what only a root has is not taken
    assert.deepEqual(['text-anchor', 'font-family', 'clip-path', 'version', 'enable-background'].map((name) => symbol.getAttribute(name)),
      ['middle', 'Arial', 'url(#cadre)', null, null])

    reports.length = 0
    svgCanvas.setSvgString(saved)
    assert.equal(svgCanvas.getSvgString(), saved)
    assert.deepEqual(reports, [])
  })

  it('gives an identifier to the objects of the drawing, not to the content of a definition', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480">` +
      '<defs><clipPath id="c"><rect width="5" height="5"/></clipPath><symbol id="sym"><g><circle r="3"/></g></symbol>' +
      '<pattern id="p" width="4" height="4"><rect width="2" height="2"/></pattern></defs>' +
      '<g class="layer"><title>L</title><rect width="9" height="9"/><g><ellipse rx="2" ry="1"/></g>' +
      '<mask id="m"><rect width="5" height="5"/></mask></g></svg>')
    const content = document.getElementById('svgcontent')
    const layer = content.querySelector('g.layer')

    assert.deepEqual([layer.querySelector(':scope > rect'), layer.querySelector(':scope > g'), layer.querySelector('ellipse')].map((elem) => Boolean(elem.id)),
      [true, true, true])
    assert.deepEqual(['#c rect', '#sym g', '#sym circle', '#p rect', '#m rect'].map((selector) => content.querySelector(selector).id),
      ['', '', '', '', ''])
  })

  it('ungroups an import in one undo step, which puts it back', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title></g></svg>`)
    const use = svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="100" height="50">` +
      '<g id="pompe"><rect id="corps" width="40" height="20" fill="#36a"/><circle id="roue" cx="60" cy="10" r="8"/></g></svg>')
    const imported = svgCanvas.getSvgString()
    const steps = svgCanvas.undoMgr.getUndoStackSize()

    svgCanvas.selectOnly([use])
    svgCanvas.ungroupSelectedElement()
    const ungrouped = svgCanvas.getSvgString()

    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), steps + 1)
    assert.ok(document.getElementById('corps') && !document.querySelector('#svgcontent use, #svgcontent symbol'))
    svgCanvas.undoMgr.undo()
    assert.equal(svgCanvas.getSvgString(), imported)
    svgCanvas.undoMgr.redo()
    assert.equal(svgCanvas.getSvgString(), ungrouped)
  })
})
