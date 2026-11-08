/**
 * What the filter of an opened or imported file keeps (lot 5): animations
 * (SMIL) that stay safe, accessibility, the identifier of the root, the
 * data of other applications; and what it removes is listed for the user.
 */
import fs from 'node:fs'
import path from 'node:path'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { sanitizeSvg } from '../../packages/svgcanvas/core/sanitize.js'
import { remapTimingIds } from '../../packages/svgcanvas/core/utilities.js'

const parse = (markup) => new DOMParser().parseFromString(markup, 'image/svg+xml')
const svgOf = (content, attributes = '') => `<svg xmlns="${NS.SVG}" xmlns:xlink="${NS.XLINK}" ${attributes}>${content}</svg>`

describe('sanitizeSvg (lot 5)', () => {
  it('keeps the animations, with all their attributes', () => {
    const doc = parse(svgOf(
      '<path id="p" d="M0 0L10 10"/>' +
      '<rect width="5" height="5">' +
      '<animate id="a1" attributeName="opacity" from="1" to="0.125" begin="0s;a1.end+1s" dur="2s" calcMode="spline" keyTimes="0;1" keySplines="0.5 0 0.5 1" fill="freeze" repeatCount="indefinite"/>' +
      '<set attributeName="visibility" to="hidden" begin="a1.end"/>' +
      '<animateTransform attributeName="transform" type="rotate" from="0 5 5" to="360 5 5" dur="3s" additive="sum"/>' +
      '<animateMotion dur="4s" rotate="auto" keyPoints="0;1" keyTimes="0;1"><mpath xlink:href="#p"/></animateMotion>' +
      '</rect>'))
    const animations = () => [...doc.querySelectorAll('rect *')].map((elem) =>
      [elem.localName, ...[...elem.attributes].map(({ localName, value }) => `${localName}=${value}`)])
    const before = animations()
    const removed = sanitizeSvg(doc.documentElement)

    assert.deepEqual(removed, [])
    assert.deepEqual(animations(), before)
  })

  it('removes an animation that would change a link or a handler, run a script or load a resource', () => {
    const doc = parse(svgOf(
      '<a href="#x"><text>t<set attributeName="href" to="javascript:alert(1)"/></text>' +
      '<animate attributeName="xlink:href" values="#x;javascript:alert(2)"/></a>' +
      '<rect width="5" height="5"><set attributeName="onclick" to="alert(3)"/>' +
      '<animate attributeName="fill" values="red;url(https://example.com/p.svg#g)"/>' +
      '<animate attributeName="class" to="java&#9;script:x"/>' +
      '<animate attributeName="opacity" href="https://example.com/p.svg#r" to="0"/>' +
      '<animate attributeName="opacity" href="javascript:alert(4)" to="0"/>' +
      '<animate attributeName="opacity" to="0"/></rect>'))
    const removed = sanitizeSvg(doc.documentElement)

    assert.equal(doc.querySelectorAll('animate, set').length, 1)
    assert.deepEqual(removed, [
      '<animate href="javascript:alert(4)">',
      '<animate href="https://example.com/p.svg#r">',
      '<animate to="java\tscript:x">',
      '<animate values="red;url(https://example.com/p.svg#g)">',
      '<set attributeName="onclick">',
      '<animate attributeName="xlink:href">',
      '<set attributeName="href">'
    ])
  })

  it('keeps accessibility, the language, and the data of other applications', () => {
    const doc = parse(`<svg xmlns="${NS.SVG}" xmlns:xlink="${NS.XLINK}" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" role="img" aria-labelledby="t" xml:lang="fr">` +
      '<title id="t">T</title><g inkscape:label="Calque" inkscape:groupmode="layer" aria-hidden="true" lang="en">' +
      '<image xlink:href="#i" xlink:type="simple" xlink:show="embed" xml:base="https://example.com/"/></g></svg>')
    const removed = sanitizeSvg(doc.documentElement)
    const root = doc.documentElement
    const g = root.querySelector('g')
    const image = root.querySelector('image')

    assert.deepEqual([root.getAttribute('role'), root.getAttribute('aria-labelledby'), root.getAttributeNS(NS.XML, 'lang')], ['img', 't', 'fr'])
    assert.deepEqual([g.getAttribute('inkscape:label'), g.getAttribute('aria-hidden'), g.getAttribute('lang')], ['Calque', 'true', 'en'])
    assert.equal(image.getAttributeNS(NS.XLINK, 'show'), 'embed')
    // xml:base changes where links lead
    assert.equal(image.getAttributeNS(NS.XML, 'base'), null)
    assert.deepEqual(removed, ['xml:base'])
  })

  it('keeps the metadata, and lists the elements it removes, outside of it', () => {
    const rdf = '<rdf:RDF><cc:Work rdf:about=""><dc:title>Pompe</dc:title></cc:Work></rdf:RDF>'
    const doc = parse(`<svg xmlns="${NS.SVG}" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:cc="http://creativecommons.org/ns#" ` +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd">' +
      `<metadata>${rdf}</metadata><sodipodi:namedview/><script>alert(1)</script>` +
      '<rect width="5" height="5" onclick="alert(2)" style="fill:red;-inkscape-stroke:none;paint-order:stroke"/></svg>')
    const removed = sanitizeSvg(doc.documentElement)

    assert.equal(doc.querySelector('metadata').innerHTML.replace(/ xmlns:\w+="[^"]*"/g, ''), rdf)
    assert.deepEqual(removed, ['paint-order', 'onclick', '<script>', '<sodipodi:namedview>'])
  })

  it('lists what it removes from a stylesheet', () => {
    const doc = parse(svgOf('<style>@import url(https://example.com/a.css); .a { fill: url(https://example.com/p.svg#g) }</style>'))
    assert.deepEqual(sanitizeSvg(doc.documentElement), ['@import url(https://example.com/a.css);', 'url(https://example.com/p.svg#g)'])
  })
})

describe('remapTimingIds', () => {
  it('points the identifiers of begin and end values to their new names', () => {
    const ids = new Map([['a1', 'svg_9'], ['b.2', 'svg_10']])
    assert.equal(remapTimingIds('0s; a1.end+1s;b\\.2.click; 1.5s;indefinite;a10.begin', (id) => ids.get(id)), '0s; svg_9.end+1s;svg_10.click; 1.5s;indefinite;a10.begin')
  })
})

describe('Opening, saving and importing (lot 5)', () => {
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

  const saved = () => parse(svgCanvas.getSvgString()).documentElement
  const symbolOf = (use) => document.getElementById(svgCanvas.getHref(use).slice(1))

  it('saves the identifier, the role and the aria attributes of the root', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" id="synoptique" role="img" aria-labelledby="t d" viewBox="0 0 100 50">` +
      '<title id="t">T</title><desc id="d">D</desc><g class="layer"><title>L</title><rect id="r" width="5" height="5"/></g></svg>')
    const root = saved()

    assert.deepEqual(['id', 'role', 'aria-labelledby'].map((name) => root.getAttribute(name)), ['synoptique', 'img', 't d'])
    assert.equal(document.getElementById('svgcontent').getAttribute('role'), 'img')
    assert.deepEqual(reports, [])
  })

  it('forgets the root of the previous drawing when a new one starts', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" id="synoptique" viewBox="0 0 100 50"><g class="layer"><title>L</title></g></svg>`)
    svgCanvas.clear()
    const root = saved()
    assert.deepEqual(['id', 'width', 'height', 'viewBox'].map((name) => root.getAttribute(name)), [null, '640', '480', null])
  })

  it('does not write the identifier of the root twice', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" id="s1" width="100" height="50"><g class="layer"><title>L</title></g></svg>`)
    // A file whose root has the same identifier, imported in the drawing
    const use = svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" id="s1" width="10" height="10"><rect width="5" height="5"/></svg>`)
    assert.notEqual(symbolOf(use).id, 's1')
    assert.equal(saved().getAttribute('id'), 's1')

    // An element that took it since keeps it
    use.id = 's1'
    assert.equal(saved().getAttribute('id'), null)
  })

  it('saves the data of other applications with their namespaces, and the metadata', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:se="http://example.com/not-svg-edit" ` +
      'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" width="100" height="50">' +
      '<metadata><rdf:RDF><dc:title>Pompe</dc:title></rdf:RDF></metadata>' +
      '<g class="layer" inkscape:label="Calque"><title>L</title><rect id="r" width="5" height="5" se:x="1"/></g></svg>')
    const root = saved()

    assert.equal(root.querySelector('g').getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label'), 'Calque')
    // A prefix that the drawing uses for another namespace gets a new one
    assert.equal(root.querySelector('rect').getAttributeNS('http://example.com/not-svg-edit', 'x'), '1')
    const title = root.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]
    assert.equal(title.textContent, 'Pompe')
    assert.equal(title.parentNode.namespaceURI, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#')
  })

  it('saves the animations as written, and the paint they use', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="100" height="50" fill="none">` +
      '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient>' +
      '<linearGradient id="g2"><stop offset="0" stop-color="blue"/></linearGradient></defs>' +
      '<g class="layer"><title>L</title><rect id="r" width="5" height="5" fill="url(#g1)">' +
      '<animate attributeName="fill" values="url(#g1);url(#g2)" dur="1.125s"/><animate attributeName="opacity" from="1" to="0.125"/></rect></g></svg>')
    const root = saved()

    assert.equal(root.getAttribute('fill'), 'none')
    assert.ok(root.querySelector('#g2'), 'the gradient that only the animation uses is kept')
    assert.deepEqual([...root.querySelectorAll('animate')].map((animate) => animate.getAttribute('to') || animate.getAttribute('dur')), ['1.125s', '0.125'])
  })

  it('opens and imports the files of the platform without removing anything', () => {
    const dir = path.join(process.cwd(), 'tests/fixtures/import/scorpio')
    for (const name of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, name), 'utf8')
      svgCanvas.setSvgString(text)
      assert.ok(svgCanvas.importSvgString(text), name)
    }
    assert.deepEqual(reports, [])
  })

  it('says what an opened file lost, in one message', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="100" height="50"><script>alert(1)</script><g class="layer"><title>L</title>` +
      '<rect id="r" width="5" height="5" onclick="alert(2)"/></g></svg>')
    assert.deepEqual(reports, [{ action: 'open', items: ['onclick', '<script>'] }])
  })

  it('imports the animations, and the identity of the root, in the symbol of the file', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title><rect id="a1" width="10" height="10"/></g></svg>`)
    const use = svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" id="pompe" role="img" aria-label="Pompe" inkscape:version="1.3" width="10" height="10">` +
      '<rect id="a1" width="5" height="5"><animate id="blink" attributeName="opacity" to="0" begin="a1.click" dur="1s"/></rect>' +
      '<circle r="2"><set attributeName="fill" to="red" begin="blink.end"/></circle></svg>')
    const symbol = symbolOf(use)
    const rect = symbol.querySelector('rect')

    assert.deepEqual([symbol.id, symbol.getAttribute('role'), symbol.getAttribute('aria-label')], ['pompe', 'img', 'Pompe'])
    assert.equal(symbol.getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'version'), '1.3')
    // a1 is taken in the drawing: the import renames its own, and the
    // animation follows
    assert.notEqual(rect.id, 'a1')
    assert.equal(symbol.querySelector('animate').getAttribute('begin'), `${rect.id}.click`)
    assert.equal(symbol.querySelector('set').getAttribute('begin'), 'blink.end')
    assert.deepEqual(reports, [])
    assert.ok(parse(svgCanvas.getSvgString()).querySelector('symbol animate'), 'well-formed when saved')
  })

  it('removes an imported animation that aims at the drawing, and lists all it removed in one message', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title><rect id="exist" width="10" height="10"/></g></svg>`)
    svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10"><style>body { margin: 0 }</style>` +
      '<animate href="#exist" attributeName="fill" to="red"/><rect width="5" height="5" onclick="alert(1)"/></svg>')

    assert.equal(document.getElementById('exist').parentNode.querySelectorAll('animate').length, 0)
    assert.equal(document.querySelectorAll('#svgcontent animate').length, 0)
    assert.deepEqual(reports, [{ action: 'import', items: ['onclick', '<animate href="#exist">', 'body'] }])
  })

  it('removes a pasted animation that aims at the drawing', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title><rect id="exist" width="10" height="10"/></g></svg>`)
    svgCanvas.pasteSvgString(`<svg xmlns="${NS.SVG}"><rect width="5" height="5"><animate attributeName="opacity" to="0"/></rect>` +
      '<set href="#exist" attributeName="fill" to="red"/></svg>', 'in_place')

    assert.equal(document.querySelectorAll('#svgcontent set').length, 0)
    assert.equal(document.querySelectorAll('#svgcontent animate').length, 1)
  })

  const pauses = () => [...document.querySelectorAll('#svgcontent animate, #svgcontent animateMotion, #svgcontent animateTransform, #svgcontent set')]
    .map((animation) => animation.getAttribute('requiredExtensions'))

  it('turns off the animations in the editor, and saves them without the pause', () => {
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="100" height="50"><g class="layer"><title>L</title>` +
      '<rect id="r" width="5" height="5"><set attributeName="width" to="9" begin="r.click"/>' +
      '<animate attributeName="opacity" to="0" dur="1s" systemLanguage="fr"/>' +
      '<animateTransform attributeName="transform" type="rotate" to="90" dur="1s"/>' +
      '<animateMotion path="M0 0L9 9" dur="1s"/></rect></g></svg>')
    assert.deepEqual(pauses(), Array(4).fill('urn:svgedit:paused'))

    const text = svgCanvas.getSvgString()
    assert.ok(!text.includes('requiredExtensions'), text)
    assert.ok(text.includes('<set attributeName="width" to="9" begin="r.click"/>'), text)
    assert.ok(text.includes('<animate attributeName="opacity" to="0" dur="1s" systemLanguage="fr"/>'), text)
    // The saved drawing, opened again, is paused again
    svgCanvas.setSvgString(text)
    assert.deepEqual(pauses(), Array(4).fill('urn:svgedit:paused'))
    assert.deepEqual(reports, [])
  })

  it('turns off the animations of an imported or a pasted file, and of a copy', async () => {
    sessionStorage.clear()
    svgCanvas.setSvgString(`<svg xmlns="${NS.SVG}" width="640" height="480"><g class="layer"><title>L</title></g></svg>`)
    svgCanvas.importSvgString(`<svg xmlns="${NS.SVG}" width="10" height="10"><rect width="5" height="5"><animate attributeName="opacity" to="0" dur="1s"/></rect></svg>`)
    svgCanvas.pasteSvgString(`<svg xmlns="${NS.SVG}"><rect width="5" height="5"><set attributeName="fill" to="red"/></rect></svg>`, 'in_place')
    assert.deepEqual(pauses(), Array(2).fill('urn:svgedit:paused'))

    svgCanvas.selectOnly([document.querySelector('#svgcontent set').parentNode])
    svgCanvas.copySelectedElements()
    await svgCanvas.pasteElements('in_place')
    assert.deepEqual(pauses(), Array(3).fill('urn:svgedit:paused'))
    // Another application gets the animation as it is saved
    assert.ok(svgCanvas.getClipboardSvg().includes('<set attributeName="fill" to="red"/>'), svgCanvas.getClipboardSvg())
  })
})
