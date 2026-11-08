/**
 * Opening and importing SCorp-io drawings: the attributes that bind a drawing
 * to real-time data must survive, and so must the references between
 * elements. The fixtures come from real SCorp-io files (the synoptique is an
 * extract of a 2990 × 1639 drawing).
 */
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import * as sanitize from '../../packages/svgcanvas/core/sanitize.js'
import * as utilities from '../../packages/svgcanvas/core/utilities.js'
import synoptique from '../fixtures/import/scorpio/synoptique-extrait.svg?raw'
import reprTemp from '../fixtures/import/scorpio/repr-temp.svg?raw'
import reprX from '../fixtures/import/scorpio/repr-x.svg?raw'
import chaufferie from '../fixtures/import/scorpio/synoptique-chaufferie.svg?raw'

const BINDING = ['scorp_id', 'scorp_name', 'instanceId', 'representationId']

/** Number of elements carrying each attribute, the root included. */
const countAttributes = (root, names = BINDING) => Object.fromEntries(names.map((name) => [
  name,
  root.querySelectorAll(`[${name}]`).length + (root.hasAttribute(name) ? 1 : 0)
]))

const parse = (text) => new DOMParser().parseFromString(text, 'image/svg+xml').documentElement

describe('sanitizeSvg and the SCorp-io binding', () => {
  let svg
  let originalWarn

  beforeEach(() => {
    originalWarn = console.warn
    console.warn = () => {}
    svg = document.createElementNS(NS.SVG, 'svg')
    document.body.append(svg)
    utilities.init({ getSvgRoot: () => svg })
  })

  afterEach(() => {
    svg.remove()
    console.warn = originalWarn
  })

  it('keeps the binding attributes and visibility, and still removes event handlers', () => {
    const use = document.createElementNS(NS.SVG, 'use')
    use.setAttribute('href', '#sym')
    use.setAttribute('instanceId', 'b9e00faa')
    use.setAttribute('representationId', '9716d7cf')
    use.setAttribute('scorp_name', 'Circuit - Salle Claire')
    use.setAttribute('onclick', 'alert(1)')
    const g = document.createElementNS(NS.SVG, 'g')
    g.setAttribute('scorp_id', '1743344517147fccf1a4f')
    g.setAttribute('scorp_future', 'x')
    g.setAttribute('visibility', 'hidden')
    svg.append(use, g)

    sanitize.sanitizeSvg(use)
    sanitize.sanitizeSvg(g)

    assert.equal(use.getAttribute('instanceId'), 'b9e00faa')
    assert.equal(use.getAttribute('representationId'), '9716d7cf')
    assert.equal(use.getAttribute('scorp_name'), 'Circuit - Salle Claire')
    assert.equal(use.hasAttribute('onclick'), false)
    assert.equal(g.getAttribute('scorp_id'), '1743344517147fccf1a4f')
    assert.equal(g.getAttribute('scorp_future'), 'x')
    assert.equal(g.getAttribute('visibility'), 'hidden')
  })

  it('keeps the spaces of the tspans of a text', () => {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="${NS.SVG}"><text><tspan>Hello </tspan><tspan> world</tspan></text><title> T </title></svg>`,
      'image/svg+xml'
    )
    sanitize.sanitizeSvg(doc.documentElement)
    assert.equal(doc.querySelector('text').textContent, 'Hello  world')
    assert.equal(doc.querySelector('title').textContent, 'T')
  })
})

describe('Opening and importing SCorp-io drawings', () => {
  let svgCanvas

  beforeEach(() => {
    document.body.textContent = ''
    const svgEditor = document.createElement('div')
    svgEditor.id = 'svg_editor'
    const svgcanvas = document.createElement('div')
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

  it('keeps every binding attribute when a synoptique is opened and saved', () => {
    const source = countAttributes(parse(synoptique))
    assert.equal(svgCanvas.setSvgString(synoptique), true)

    assert.deepEqual(countAttributes(document.getElementById('svgcontent')), source)
    assert.deepEqual(countAttributes(parse(svgCanvas.getSvgString())), source)
  })

  it('keeps the binding attributes and the hidden state of an imported representation', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title></g></svg>`)
    const use = svgCanvas.importSvgString(reprTemp, true)
    const symbol = document.getElementById(svgCanvas.getHref(use).slice(1))

    // The scorp_id of the root goes to the symbol, those of the objects stay on them
    assert.deepEqual(countAttributes(symbol, ['scorp_id']), countAttributes(parse(reprTemp), ['scorp_id']))
    assert.equal(symbol.querySelector('[visibility]').getAttribute('visibility'), 'hidden')
    assert.equal(symbol.querySelector('[visibility]').getAttribute('scorp_id'), '1743344517147fccf1a4f-07a1-4c5f-a5c0-26945b621efb')
  })

  it('keeps the binding attributes of a representation imported twice', () => {
    svgCanvas.setSvgString(synoptique)
    const first = svgCanvas.importSvgString(reprX, true, true)
    const second = svgCanvas.importSvgString(reprX, true, true)
    const ids = [...document.querySelectorAll('#svgcontent [id]')].map((elem) => elem.id)

    assert.equal(new Set(ids).size, ids.length, 'No identifier is duplicated')
    ;[first, second].forEach((use) => {
      const symbol = document.getElementById(svgCanvas.getHref(use).slice(1))
      assert.equal(symbol.querySelectorAll('[scorp_id]').length + 1, 3)
    })
  })

  it('renames duplicate identifiers without breaking references when a drawing is opened', () => {
    // Two representations inserted with the same inner identifiers: the
    // clipPath of the first one has the identifier of the second symbol, and
    // both symbols define a gradient "g".
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="400" height="200"><defs>
      <symbol id="sym_a"><defs><clipPath id="svg_65"><rect width="100" height="50"/></clipPath></defs>
        <rect id="ra" width="100" height="50" clip-path="url(#svg_65)"/></symbol>
      <symbol id="svg_65"><rect id="rb" fill="green" width="100" height="50"/></symbol>
      <symbol id="sym_c"><linearGradient id="g"><stop offset="0" stop-color="blue"/></linearGradient>
        <rect id="rc" fill="url(#g)" width="100" height="50"/></symbol>
      <symbol id="sym_d"><linearGradient id="g"><stop offset="0" stop-color="orange"/></linearGradient>
        <rect id="rd" fill="url(#g)" width="100" height="50"/></symbol>
    </defs><g class="layer"><title>L</title>
      <use id="u1" href="#sym_a"/><use id="u2" href="#svg_65" x="120"/>
      <use id="u3" href="#sym_c" y="100"/><use id="u4" href="#sym_d" x="120" y="100"/>
    </g></svg>`)
    const target = (id) => document.getElementById(svgCanvas.getHref(document.getElementById(id)).slice(1))
    const fillOf = (id) => document.getElementById(utilities.getUrlFromAttr(document.getElementById(id).getAttribute('fill')).slice(1))
    const clipOf = (id) => document.getElementById(utilities.getUrlFromAttr(document.getElementById(id).getAttribute('clip-path')).slice(1))

    // The <use> still draws the symbol, not the clipPath of the other symbol
    assert.equal(target('u2').localName, 'symbol')
    assert.equal(clipOf('ra').localName, 'clipPath')
    assert.equal(clipOf('ra').parentNode.parentNode.id, 'sym_a')
    // Each symbol keeps its own gradient
    assert.equal(fillOf('rc').firstElementChild.getAttribute('stop-color'), 'blue')
    assert.equal(fillOf('rd').firstElementChild.getAttribute('stop-color'), 'orange')
    const ids = [...document.querySelectorAll('#svgcontent [id]')].map((elem) => elem.id)
    assert.equal(new Set(ids).size, ids.length, 'No identifier is duplicated')
  })

  describe('identifiers of an imported file (lot 3)', () => {
    const drawingIds = () => [...document.querySelectorAll('[id]')].map((elem) => elem.id)
    const symbolOf = (use) => document.getElementById(svgCanvas.getHref(use).slice(1))
    const refOf = (elem, name) => utilities.getUrlFromAttr(elem.getAttribute(name)).slice(1)

    beforeEach(() => {
      svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480">` +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
        '<g class="layer"><title>L</title><rect id="r" fill="url(#g)" width="10" height="10"/></g></svg>')
    })

    it('keeps the identifiers that are free, so the platform finds its texts', () => {
      const symbol = symbolOf(svgCanvas.importSvgString(chaufferie))
      const live = symbol.querySelectorAll('[id^="mesure-"], [id^="synthese-"], [id^="etat-"]')

      assert.equal(live.length, 30)
      assert.equal(symbol.id, 'synoptique-chaufferie')
      assert.equal(symbol.querySelector('#mesures-detail').localName, 'g')
    })

    it('renames only the identifiers already used, and their references follow', () => {
      const symbol = symbolOf(svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="100" height="100">` +
        '<style>#r { stroke: black } .x #keep { fill: #abc; }</style>' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="blue"/></linearGradient>' +
        '<clipPath id="c"><rect width="5" height="5"/></clipPath></defs>' +
        '<rect id="r" fill="url(#g)" clip-path="url(#c)" width="10" height="10"/>' +
        '<use id="u" href="#r"/><g id="keep"/></svg>'))
      const rect = symbol.querySelector('rect[fill]')
      const style = symbol.querySelector('style').textContent

      // The drawing is untouched
      assert.equal(document.getElementById('r').parentNode.localName, 'g')
      assert.equal(refOf(document.getElementById('r'), 'fill'), 'g')
      assert.equal(document.getElementById('g').firstElementChild.getAttribute('stop-color'), 'red')
      // The imported objects keep their own resources
      assert.notEqual(rect.id, 'r')
      assert.equal(document.getElementById(refOf(rect, 'fill')).firstElementChild.getAttribute('stop-color'), 'blue')
      assert.equal(refOf(rect, 'clip-path'), 'c')
      assert.equal(svgCanvas.getHref(symbol.querySelector('use')), `#${rect.id}`)
      // Confined to the symbol (lot 4)
      const scope = `#${symbol.id}`
      assert.equal(style, `${scope} #${rect.id} { stroke: black } ${scope} .x #keep, ${scope}.x #keep { fill: #abc; }`)
      assert.ok(symbol.querySelector('#u') && symbol.querySelector('#keep'))
      assert.equal(new Set(drawingIds()).size, drawingIds().length, 'No identifier is duplicated')
    })

    it('never gives a new element an identifier that the file keeps', () => {
      const use = svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10">` +
        '<rect id="r"/><rect id="svg_1"/><rect id="svg_2"/><rect id="svg_3"/><rect id="svg_4"/></svg>')

      assert.ok(['svg_1', 'svg_2', 'svg_3', 'svg_4'].every((id) => symbolOf(use).querySelector(`#${id}`)))
      assert.equal(new Set(drawingIds()).size, drawingIds().length, 'No identifier is duplicated')
    })

    it('keeps the first of two equal identifiers of the file, which its references mean', () => {
      const symbol = symbolOf(svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10">` +
        '<linearGradient id="k"><stop offset="0" stop-color="blue"/></linearGradient>' +
        '<linearGradient id="k"><stop offset="0" stop-color="orange"/></linearGradient>' +
        '<rect fill="url(#k)" width="5" height="5"/></svg>'))
      const rect = symbol.querySelector('rect')

      assert.equal(refOf(rect, 'fill'), 'k')
      assert.equal(document.getElementById('k').firstElementChild.getAttribute('stop-color'), 'blue')
      assert.equal(new Set(drawingIds()).size, drawingIds().length, 'No identifier is duplicated')
    })

    it('renames an identifier of the editor itself', () => {
      svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10"><rect id="svgroot"/></svg>`)
      assert.equal(document.getElementById('svgroot').localName, 'svg')
      assert.equal(new Set(drawingIds()).size, drawingIds().length, 'No identifier is duplicated')
    })

    it('gives each import of the same file its own symbol', () => {
      const first = svgCanvas.importSvgString(reprX)
      const before = symbolOf(first).outerHTML
      const second = svgCanvas.importSvgString(reprX)

      assert.notEqual(symbolOf(first), symbolOf(second))
      assert.equal(symbolOf(first).outerHTML, before)
      assert.equal(symbolOf(second).querySelectorAll('[scorp_id]').length, 2)
      assert.equal(new Set(drawingIds()).size, drawingIds().length, 'No identifier is duplicated')
    })

    it('keeps the free identifiers of pasted SVG text', () => {
      const [rect] = svgCanvas.pasteSvgString(`<svg xmlns="${NS.SVG}"><rect id="pompe_1" width="5" height="5"/></svg>`, 'in_place')
      assert.equal(rect.id, 'pompe_1')
    })
  })

  it('saves the size attributes the opened file declares, a viewBox included', () => {
    const rootOf = (text) => {
      svgCanvas.setSvgString(text)
      const root = parse(svgCanvas.getSvgString())
      return ['width', 'height', 'viewBox'].map((name) => root.getAttribute(name))
    }
    const layer = '<g class="layer"><title>L</title></g>'

    assert.deepEqual(rootOf(`<svg xmlns="${NS.SVG}" viewBox="0 0 200 100">${layer}</svg>`), [null, null, '0 0 200 100'])
    assert.deepEqual(rootOf(`<svg xmlns="${NS.SVG}" width="200" height="100">${layer}</svg>`), ['200', '100', null])
    assert.deepEqual(rootOf(`<svg xmlns="${NS.SVG}" width="200" height="100" viewBox="0 0 200 100">${layer}</svg>`), ['200', '100', '0 0 200 100'])
    // A new size of the document goes to its viewBox
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" viewBox="0 0 200 100">${layer}</svg>`)
    svgCanvas.setResolution(300, 150)
    assert.equal(parse(svgCanvas.getSvgString()).getAttribute('viewBox'), '0 0 300 150')
  })

  it('saves the spaces of the tspans of a text', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title>
      <text id="t" x="10" y="20"><tspan>Hello </tspan><tspan>world</tspan></text></g></svg>`)
    assert.equal(document.getElementById('t').textContent, 'Hello world')
    assert.match(svgCanvas.getSvgString(), /<tspan[^>]*>Hello <\/tspan>/)
  })
})
