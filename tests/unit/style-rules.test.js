/**
 * Where the value of a property comes from, and its rewriting in its rule
 * (lot S2 of the simplification audit). The rules are those of
 * tests/fixtures/import/scorpio/synoptique-chaufferie.svg.
 */
import {
  findStyleSource, readStyleRules, elementsStyledBy, rewriteStyleSheet, parseStyleSheet,
  specificity, cssValueOf, getStyledValue
} from '../../packages/svgcanvas/core/style-rules.js'
import { scopeStyleSheet } from '../../packages/svgcanvas/core/css-scope.js'
import SvgCanvas from '../../packages/svgcanvas/svgcanvas.js'
import Paint from '../../packages/svgcanvas/core/paint.js'

const NS = 'http://www.w3.org/2000/svg'

const SHEET = `
    svg.synoptique { font-family: 'Roboto Flex', Roboto, sans-serif; }
    .fond { fill: #160F23; }
    .titre { font-family: 'Space Grotesk', Helvetica, sans-serif; fill: #CEB8FF; font-weight: 500; }
    .titre-page { font-size: 34px; }
    .tuyau { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .tuyau.arret { stroke: #4F465F; stroke-width: 1.5; }
    .tuyau.en-marche { stroke-width: 3; }
    .tuyau.en-marche.chaud.depart { stroke: #F08A62; }
    svg.synoptique text.mesure { fill: #9B92AA; }
    .alarme { stroke: red !important; }
`

/** A drawing of the synoptic: the content of the canvas holds the sheet. */
const drawing = (sheet, body) => {
  document.body.innerHTML = `<svg xmlns="${NS}"><svg id="svgcontent" class="synoptique"><style>${sheet}</style>` +
    `<g class="layer">${body}</g></svg></svg>`
  return document.getElementById('svgcontent')
}

const $ = (id) => document.getElementById(id)

describe('findStyleSource', () => {
  let content
  beforeEach(() => {
    content = drawing(SHEET, `
      <rect id="fond" class="fond" fill="#000"/>
      <text id="titre" class="titre titre-page">Chaufferie</text>
      <path id="d1" class="tuyau chaud depart arret"/>
      <path id="d2" class="tuyau chaud depart en-marche"/>
      <path id="d3" class="tuyau froid retour arret"/>
      <text id="m1" class="mesure">21 °C</text>
      <g id="libelles" fill="#9B92AA"><text id="l1">Pompe</text></g>
      <rect id="vanne" style="fill: #00ff00"/>
      <rect id="alarme" class="alarme" style="stroke: blue"/>
      <rect id="imp" class="fond" style="fill: #123456 !important"/>`)
  })

  it('finds the rule of one class', () => {
    const source = findStyleSource($('fond'), 'fill')
    assert.equal(source.kind, 'rule')
    assert.equal(source.selector, '.fond')
    assert.equal(source.value, '#160F23')
    assert.equal(source.style, content.querySelector('style'))
  })

  it('takes each property of several classes from its own rule', () => {
    assert.equal(findStyleSource($('titre'), 'font-size').selector, '.titre-page')
    assert.equal(findStyleSource($('titre'), 'font-family').selector, '.titre')
    assert.equal(findStyleSource($('titre'), 'font-family').value, "'Space Grotesk', Helvetica, sans-serif")
  })

  it('takes the rule of a state, more specific than that of the class', () => {
    const stroke = findStyleSource($('d1'), 'stroke')
    assert.equal(stroke.selector, '.tuyau.arret')
    assert.equal(stroke.value, '#4F465F')
    assert.equal(findStyleSource($('d1'), 'stroke-width').value, '1.5')
    // The most specific rule wins: four classes over two.
    assert.equal(findStyleSource($('d2'), 'stroke').selector, '.tuyau.en-marche.chaud.depart')
    assert.equal(findStyleSource($('d2'), 'stroke-width').selector, '.tuyau.en-marche')
    assert.equal(findStyleSource($('d1'), 'stroke-linecap').selector, '.tuyau')
  })

  it('reads a selector that is not a class alone', () => {
    const source = findStyleSource($('m1'), 'fill')
    assert.equal(source.selector, 'svg.synoptique text.mesure')
    assert.deepEqual(specificity('svg.synoptique text.mesure'), [0, 2, 2])
  })

  it('leaves a value inherited from a parent to the attribute', () => {
    // The root sets the family of the texts, a group the fill of its texts:
    // neither gives it to the text itself.
    assert.equal(findStyleSource($('m1'), 'font-family'), null)
    assert.equal(findStyleSource($('l1'), 'fill'), null)
    assert.equal(findStyleSource($('libelles'), 'fill'), null)
  })

  it('gives the style attribute over a rule, and !important over both', () => {
    assert.deepEqual(findStyleSource($('vanne'), 'fill'), { kind: 'style', value: '#00ff00', shorthand: false, important: false })
    const alarm = findStyleSource($('alarme'), 'stroke')
    assert.equal(alarm.kind, 'rule')
    assert.equal(alarm.selector, '.alarme')
    assert.equal(alarm.important, true)
    assert.deepEqual(findStyleSource($('imp'), 'fill'), { kind: 'style', value: '#123456', shorthand: false, important: true })
  })

  it('takes the last of two rules as specific, and a shorthand', () => {
    drawing('.a { fill: red } .b { fill: blue } .c { font: italic 500 20px Serif }',
      '<rect id="ab" class="a b"/><rect id="ba" class="b a"/><text id="c" class="c">x</text>')
    assert.equal(findStyleSource($('ab'), 'fill').selector, '.b')
    assert.equal(findStyleSource($('ba'), 'fill').selector, '.b')
    const size = findStyleSource($('c'), 'font-size')
    assert.equal(size.selector, '.c')
    assert.equal(size.shorthand, true)
  })

  it('reads the sheet of an imported file confined to its symbol, and shows the selector as written', () => {
    const css = scopeStyleSheet('.cls-1 { fill: #e30613 } svg.x rect { stroke: #333 }', { id: 'svg_7', tag: 'symbol' }).css
    drawing('', `<symbol id="svg_7" class="x"><style>${css}</style><rect id="r" class="cls-1"/></symbol>`)
    const fill = findStyleSource($('r'), 'fill')
    assert.equal(fill.selector, '.cls-1')
    assert.equal(fill.value, '#e30613')
    assert.equal(findStyleSource($('r'), 'stroke').selector, 'svg.x rect')
  })

  it('leaves out a rule the browser cannot read, and the rules of a medium that does not apply', () => {
    drawing('.a:unknown-state, .a { fill: red } @media print { .a { fill: blue } } @media all { .b { fill: green } }',
      '<rect id="a" class="a"/><rect id="b" class="b"/>')
    assert.equal(findStyleSource($('a'), 'fill'), null)
    assert.equal(findStyleSource($('b'), 'fill').value, 'green')
  })
})

describe('elementsStyledBy', () => {
  it('counts the objects whose value the rule gives', () => {
    const content = drawing(SHEET, `
      <path id="d1" class="tuyau chaud depart arret"/>
      <path id="d3" class="tuyau froid retour arret"/>
      <path id="d4" class="tuyau arret" style="stroke: #fff"/>
      <path id="d2" class="tuyau chaud depart en-marche"/>`)
    const { rule } = findStyleSource($('d1'), 'stroke')
    assert.deepEqual(elementsStyledBy(rule, 'stroke', content).map((elem) => elem.id), ['d1', 'd3'])
  })
})

describe('rewriteStyleSheet', () => {
  const rewrite = (sheet, id, prop, value) => {
    const content = drawing(sheet, `<rect id="${id}" class="${id}"/>`)
    const { rule } = findStyleSource($(id), prop, readStyleRules(content))
    return rewriteStyleSheet(content.querySelector('style').textContent, [{ rule, prop, value }])
  }

  it('replaces the value alone, the rest as written', () => {
    const sheet = '/* fond */ .fond { fill: #160F23; } .x { fill: red }'
    assert.equal(rewrite(sheet, 'fond', 'fill', '#00ff00'), '/* fond */ .fond { fill: #00ff00; } .x { fill: red }')
  })

  it('keeps !important, and adds a unit CSS needs', () => {
    assert.equal(rewrite('.t { font-size: 34px  !important }', 't', 'font-size', 48), '.t { font-size: 48px  !important }')
    assert.equal(cssValueOf('stroke-width', 3), '3')
  })

  it('adds a declaration after a shorthand, which it then wins over', () => {
    assert.equal(rewrite('.t { font: 500 34px X }', 't', 'font-size', 48), '.t { font: 500 34px X; font-size: 48px }')
    assert.equal(rewrite('.t { font: 500 34px X; }', 't', 'font-family', 'Y'), '.t { font: 500 34px X; font-family: Y; }')
  })

  it('rewrites several rules of one sheet, those of @media included', () => {
    const text = '.a { fill: red } @media all { .b { stroke: blue; } }'
    const [a, b] = parseStyleSheet(text)
    assert.equal(rewriteStyleSheet(text, [{ rule: a, prop: 'fill', value: 'green' }, { rule: b, prop: 'stroke', value: 'black' }]),
      '.a { fill: green } @media all { .b { stroke: black; } }')
  })
})

describe('getStyledValue', () => {
  it('writes the value as an attribute would be', () => {
    drawing(SHEET, '<text id="titre" class="titre titre-page">x</text><rect id="fond" class="fond"/>')
    assert.equal(getStyledValue($('titre'), 'font-size').value, '34')
    assert.equal(getStyledValue($('fond'), 'fill').value, '#160F23')
    assert.equal(getStyledValue($('fond'), 'stroke'), null)
  })
})

describe('a change of the canvas goes to the rule', () => {
  let svgCanvas
  let notices

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
    svgCanvas.setSvgString(`<svg xmlns="${NS}" width="640" height="480"><style>${SHEET}</style>` +
      '<g class="layer"><title>Calque</title>' +
      '<rect id="fond" class="fond" width="640" height="480"/>' +
      '<path id="d1" class="tuyau chaud depart arret" d="M0 0L10 0"/>' +
      '<path id="d3" class="tuyau froid retour arret" d="M0 10L10 10"/>' +
      '<rect id="libre" width="10" height="10"/>' +
      '<rect id="vanne" style="fill: #00ff00; stroke: none" width="10" height="10"/></g></svg>')
    notices = []
    svgCanvas.bind('styleRulesChanged', (win, notice) => notices.push(notice))
  })

  const select = (...ids) => {
    svgCanvas.clearSelection()
    svgCanvas.addToSelection(ids.map((id) => document.getElementById(id)))
  }
  const sheet = () => svgCanvas.getSvgContent().querySelector('style').textContent

  it('rewrites the rule in one step, without an attribute, and undoes it', () => {
    const before = sheet()
    const steps = svgCanvas.undoMgr.getUndoStackSize()
    select('d1', 'libre')
    svgCanvas.setColor('stroke', '#F08A62')
    assert.ok(sheet().includes('.tuyau.arret { stroke: #F08A62; stroke-width: 1.5; }'))
    assert.equal($('d1').hasAttribute('stroke'), false)
    // The object a rule does not style takes the attribute.
    assert.equal($('libre').getAttribute('stroke'), '#F08A62')
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), steps + 1)
    assert.deepEqual(notices.map(({ property, rules }) => ({ property, rules })),
      [{ property: 'stroke', rules: [{ selector: '.tuyau.arret', count: 2 }] }])
    svgCanvas.undoMgr.undo()
    assert.equal(sheet(), before)
    assert.equal($('libre').hasAttribute('stroke'), false)
    svgCanvas.undoMgr.redo()
    assert.ok(sheet().includes('stroke: #F08A62'))
  })

  it('writes in the style attribute an object that has the value there', () => {
    const before = $('vanne').getAttribute('style')
    select('vanne')
    svgCanvas.setColor('fill', '#0000ff')
    const style = $('vanne').getAttribute('style')
    assert.ok(style.includes('fill:#0000ff') && !style.includes('#00ff00') && style.includes('stroke: none'), style)
    assert.equal($('vanne').hasAttribute('fill'), false)
    assert.deepEqual(notices, [])
    svgCanvas.undoMgr.undo()
    assert.equal($('vanne').getAttribute('style'), before)
  })

  it('does nothing when the rule already has the value', () => {
    select('fond')
    const steps = svgCanvas.undoMgr.getUndoStackSize()
    svgCanvas.setColor('fill', '#160f23')
    assert.equal(svgCanvas.undoMgr.getUndoStackSize(), steps)
    assert.equal($('fond').hasAttribute('fill'), false)
  })

  it('withdraws a step that was not confirmed, the selection kept', () => {
    const before = sheet()
    select('fond')
    svgCanvas.setPaint('fill', new Paint({ solidColor: '00ff00', alpha: 100 }))
    assert.ok(sheet().includes('.fond { fill: #00ff00; }'))
    assert.equal(svgCanvas.undoMgr.withdraw(notices[0].commands[0]), true)
    assert.equal(sheet(), before)
    assert.equal(svgCanvas.undoMgr.getRedoStackSize(), 0)
    assert.deepEqual(svgCanvas.getSelectedElements().filter(Boolean).map((elem) => elem.id), ['fond'])
    assert.equal(svgCanvas.undoMgr.withdraw(notices[0].commands[0]), false)
  })
})
