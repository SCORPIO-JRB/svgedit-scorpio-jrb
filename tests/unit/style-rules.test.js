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

  // Lot S4: "Copy / Paste properties" read and write as the panel does.
  describe('copy and paste properties (lot S4)', () => {
    beforeEach(() => sessionStorage.clear())

    it('copies the values of the rules, not the attributes they hide', () => {
      $('d1').setAttribute('stroke', '#000000')
      select('d1')
      assert.equal(svgCanvas.copySelectedProperties(), true)
      const { fill, stroke } = svgCanvas.getCopiedProperties()
      assert.equal(fill.fill, 'none')
      assert.equal(stroke.stroke, '#4F465F')
      assert.equal(stroke['stroke-width'], '1.5')
      assert.equal(stroke['stroke-linecap'], 'round')
    })

    it('changes the rule of a target, the attribute of the others, in one step', () => {
      $('libre').setAttribute('fill', '#123456')
      select('libre')
      svgCanvas.copySelectedProperties()
      const before = sheet()
      const steps = svgCanvas.undoMgr.getUndoStackSize()
      $('fond').insertAdjacentHTML('afterend', '<rect id="autre" width="10" height="10" fill="#ffffff"/>')
      select('fond', 'autre')
      assert.ok(svgCanvas.pasteProperties())
      assert.ok(sheet().includes('.fond { fill: #123456; }'))
      assert.equal($('fond').hasAttribute('fill'), false)
      assert.equal($('autre').getAttribute('fill'), '#123456')
      assert.equal(svgCanvas.undoMgr.getUndoStackSize(), steps + 1)
      assert.deepEqual(notices.map(({ property, rules }) => ({ property, rules })),
        [{ property: 'fill', rules: [{ selector: '.fond', count: 1 }] }])
      svgCanvas.undoMgr.undo()
      assert.equal(sheet(), before)
      assert.equal($('autre').getAttribute('fill'), '#ffffff')
      svgCanvas.undoMgr.redo()
      assert.ok(sheet().includes('.fond { fill: #123456; }'))
      // The step that was not confirmed goes, the attributes with it.
      assert.equal(svgCanvas.undoMgr.withdraw(notices[0].commands[0]), true)
      assert.equal(sheet(), before)
      assert.equal($('autre').getAttribute('fill'), '#ffffff')
    })

    it('writes in the style attribute of a target that has the value there, without a notice', () => {
      $('libre').setAttribute('fill', '#123456')
      select('libre')
      svgCanvas.copySelectedProperties()
      select('vanne')
      svgCanvas.pasteProperties()
      const style = $('vanne').getAttribute('style')
      assert.ok(style.includes('fill:#123456') && !style.includes('#00ff00'), style)
      assert.equal($('vanne').hasAttribute('fill'), false)
      assert.deepEqual(notices, [])
    })

    it('reads the rule of a group, and a property written as an attribute, which it writes so', () => {
      svgCanvas.setSvgString(`<svg xmlns="${NS}" width="640" height="480">` +
        '<style>.centre { text-anchor: middle; } .libelles { fill: #9B92AA; font-size: 15px; }</style>' +
        '<g class="layer"><title>Calque</title><text id="s" class="centre" x="0" y="10">A</text>' +
        '<g class="libelles"><text id="u" x="0" y="50">C</text></g>' +
        '<text id="t" x="0" y="30">B</text></g></svg>')
      select('s')
      svgCanvas.copySelectedProperties()
      select('t')
      svgCanvas.pasteProperties()
      assert.equal($('t').getAttribute('text-anchor'), 'middle')
      assert.ok(sheet().includes('.centre { text-anchor: middle; }'))
      // A text of a group styled by a class
      select('u')
      svgCanvas.copySelectedProperties()
      select('t')
      svgCanvas.pasteProperties()
      assert.deepEqual([$('t').getAttribute('fill'), $('t').getAttribute('font-size')], ['#9B92AA', '15'])
      assert.deepEqual(notices, [])
    })

    it('leaves a drawing without rules as before', () => {
      svgCanvas.setSvgString(`<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>Calque</title>` +
        '<g fill="#00ff00"><rect id="a" width="10" height="10" stroke="#000"/></g>' +
        '<rect id="b" width="10" height="10" fill="#fff" stroke="#f00" stroke-width="4"/></g></svg>')
      select('a')
      svgCanvas.copySelectedProperties()
      select('b')
      svgCanvas.pasteProperties()
      const attributes = [...$('b').attributes].filter(({ name }) => name !== 'style').map(({ name, value }) => `${name}=${value}`)
      assert.deepEqual(attributes, ['id=b', 'width=10', 'height=10', 'fill=#00ff00', 'stroke=#000'])
    })
  })
})
