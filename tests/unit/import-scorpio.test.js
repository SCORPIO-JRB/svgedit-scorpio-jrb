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

  it('saves the spaces of the tspans of a text', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title>
      <text id="t" x="10" y="20"><tspan>Hello </tspan><tspan>world</tspan></text></g></svg>`)
    assert.equal(document.getElementById('t').textContent, 'Hello world')
    assert.match(svgCanvas.getSvgString(), /<tspan[^>]*>Hello <\/tspan>/)
  })
})
