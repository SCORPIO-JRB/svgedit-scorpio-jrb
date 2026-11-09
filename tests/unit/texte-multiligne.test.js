import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import {
  wrapLine, getTextSource, setTextSource, lineElements, getLineHeight, getTextWidth,
  cloneContent, restoreContent, sameContent, changesLayout
} from '../../packages/svgcanvas/core/text-lines.js'
import * as history from '../../packages/svgcanvas/core/history.js'

// Texts of several lines: one <tspan> per line at an absolute x and y, the
// content as typed with its lines separated by "\n" (without the browser:
// jsdom has no layout, so the measures are those of an average glyph).

const text = (markup, attrs = 'x="100" y="50" font-size="20"') => {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="${NS.SE}"><text ${attrs}>${markup}</text></svg>`,
    'image/svg+xml'
  )
  const elem = svg.documentElement.firstElementChild
  document.body.append(document.importNode(svg.documentElement, true))
  return document.body.lastElementChild.firstElementChild ?? elem
}
const lines = (elem) => lineElements(elem)?.map((tspan) => [tspan.getAttribute('x'), tspan.getAttribute('y'), tspan.textContent])

describe('texts of several lines', () => {
  afterEach(() => { document.body.replaceChildren() })

  it('keeps a text of one line as it is: its characters alone', () => {
    const elem = text('Pompe')
    setTextSource(elem, 'Pompe 12')
    expect(elem.innerHTML).toBe('Pompe 12')
    expect(lineElements(elem)).toBeNull()
    expect(elem.hasAttributeNS(NS.SE, 'line-height')).toBe(false)
  })

  it('writes one tspan per line, at x and at y plus a line height each, an empty line keeping its place', () => {
    const elem = text('Pompe')
    setTextSource(elem, 'Ligne un\nLigne deux\n\nFin')
    expect(lines(elem)).toEqual([
      ['100', '50', 'Ligne un'],
      ['100', '74', 'Ligne deux'],
      ['100', '98', ''],
      ['100', '122', 'Fin']
    ])
    expect(elem.getAttributeNS(NS.SE, 'line-height')).toBe('1.2')
    expect(getTextSource(elem)).toBe('Ligne un\nLigne deux\n\nFin')
  })

  it('goes back to characters alone when one line is left', () => {
    const elem = text('Pompe')
    setTextSource(elem, 'A\nB')
    setTextSource(elem, 'AB')
    expect(elem.innerHTML).toBe('AB')
  })

  it('keeps the spans of the lines that stay, with their attributes', () => {
    const elem = text('<tspan id="l1" x="100" y="50" fill="red">A</tspan><tspan id="l2" x="100" y="80">B</tspan>')
    setTextSource(elem, 'A\nB modifiée\nC')
    const [first, second, third] = lineElements(elem)
    expect(first.id).toBe('l1')
    expect(first.getAttribute('fill')).toBe('red')
    expect(second.id).toBe('l2')
    expect(third.id).toBe('')
    // The spacing of the file (30 for 20, 1.5) is kept and written
    expect(elem.getAttributeNS(NS.SE, 'line-height')).toBe('1.5')
    expect(lines(elem).map(([, y]) => y)).toEqual(['50', '80', '110'])
  })

  it('reads a text of characters alone as one line, its line breaks drawn as spaces', () => {
    expect(getTextSource(text('\n  Pompe\n'))).toBe('   Pompe ')
    expect(getTextSource(text('Temp <tspan fill="red">20</tspan> °C'))).toBe('Temp 20 °C')
    expect(lineElements(text('Temp <tspan fill="red">20</tspan> °C'))).toBeNull()
  })

  it('reads the line height of the lines of a file: y, or dy in em or in units', () => {
    expect(getLineHeight(text('<tspan x="0" y="50">A</tspan><tspan x="0" y="75">B</tspan>'))).toBe(1.25)
    expect(getLineHeight(text('<tspan x="0" y="50">A</tspan><tspan x="0" dy="1.4em">B</tspan>'))).toBe(1.4)
    expect(getLineHeight(text('<tspan x="0" y="50">A</tspan><tspan x="0" dy="30">B</tspan>'))).toBe(1.5)
    expect(getLineHeight(text('A'))).toBe(1.2)
  })

  it('writes xml:space="preserve" when the spaces typed would be merged', () => {
    const elem = text('A')
    setTextSource(elem, 'A  B')
    expect(elem.getAttributeNS(NS.XML, 'space')).toBe('preserve')
    const other = text('A')
    setTextSource(other, 'A B\nC')
    expect(other.hasAttributeNS(NS.XML, 'space')).toBe(false)
  })
})

describe('fixed width', () => {
  afterEach(() => { document.body.replaceChildren() })

  // One unit per character
  const measure = (s) => s.length

  it('breaks a line at its spaces to fit, a word wider than the width staying whole', () => {
    expect(wrapLine('un deux trois quatre', 9, measure)).toEqual(['un deux', 'trois', 'quatre'])
    expect(wrapLine('anticonstitutionnellement ok', 9, measure)).toEqual(['anticonstitutionnellement', 'ok'])
    expect(wrapLine('', 9, measure)).toEqual([''])
  })

  it('gives the line back when its parts are joined with one space', () => {
    const line = 'a  b c   d efgh  ij'
    expect(wrapLine(line, 4, measure).join(' ')).toBe(line)
  })

  it('marks the lines it made, and keeps the lines typed when the width changes', () => {
    // 20 × 0.55 = 11 per character in jsdom
    const elem = text('A', 'x="0" y="20" font-size="20" se:width="80"')
    expect(getTextWidth(elem)).toBe(80)
    setTextSource(elem, 'un deux trois\nfin')
    const wrapped = lineElements(elem).map((tspan) => [tspan.textContent, tspan.getAttributeNS(NS.SE, 'wrapped')])
    // "un deux" is 77 wide, "un deux trois" 143
    expect(wrapped).toEqual([['un deux', null], ['trois', 'true'], ['fin', null]])
    expect(getTextSource(elem)).toBe('un deux trois\nfin')
    elem.setAttributeNS(NS.SE, 'se:width', '400')
    setTextSource(elem)
    expect(lines(elem).map(([, , s]) => s)).toEqual(['un deux trois', 'fin'])
  })

  it('lays out again after a change of its font, place or width only', () => {
    const plain = text('A')
    const several = text('<tspan x="0" y="10">A</tspan><tspan x="0" y="34">B</tspan>')
    const fixed = text('A', 'x="0" y="20" se:width="80"')
    expect(changesLayout(plain, 'font-size')).toBe(false)
    expect(changesLayout(several, 'font-size')).toBe(true)
    expect(changesLayout(several, 'fill')).toBe(false)
    expect(changesLayout(fixed, 'font-family')).toBe(true)
  })
})

describe('history of a text of several lines', () => {
  afterEach(() => { document.body.replaceChildren() })

  it('puts back the content and the attributes its layout wrote', () => {
    const elem = text('Pompe')
    const before = cloneContent(elem)
    setTextSource(elem, 'A\nB')
    expect(sameContent(before, elem)).toBe(false)
    restoreContent(elem, before)
    expect(elem.innerHTML).toBe('Pompe')
    expect(elem.hasAttributeNS(NS.SE, 'line-height')).toBe(false)
    expect(sameContent(before, elem)).toBe(true)
  })

  it('undoes and redoes a typing exactly, any number of times', () => {
    const elem = text('<tspan id="keep" x="100" y="50">A</tspan><tspan x="100" y="77">B</tspan>')
    const original = elem.outerHTML
    const content = cloneContent(elem)
    const old = getTextSource(elem)
    setTextSource(elem, 'A\nB\nC')
    const typed = elem.outerHTML
    const cmd = new history.ChangeElementCommand(elem, { '#text': old }, 'text', content)
    expect(cmd.newValues['#text']).toBe('A\nB\nC')
    for (let i = 0; i < 2; i++) {
      cmd.unapply()
      expect(elem.outerHTML).toBe(original)
      cmd.apply()
      expect(elem.outerHTML).toBe(typed)
    }
  })

  it('lays the source out when a step has no copy of the content', () => {
    const elem = text('Pompe')
    const cmd = new history.ChangeElementCommand(elem, { '#text': 'A\nB' })
    cmd.unapply()
    expect(getTextSource(elem)).toBe('A\nB')
    expect(lineElements(elem)).toHaveLength(2)
  })

  it('records the content when an undoable change lays the text out', () => {
    const undoMgr = new history.UndoManager()
    const elem = text('<tspan x="100" y="50">A</tspan><tspan x="100" y="74">B</tspan>', 'x="100" y="50" font-size="20" se:line-height="1.2"')
    const original = elem.outerHTML
    undoMgr.beginUndoableChange('font-size', [elem])
    elem.setAttribute('font-size', '40')
    setTextSource(elem)
    const batch = undoMgr.finishUndoableChange()
    const [cmd] = batch.stack
    expect(cmd.oldContent).toBeTruthy()
    expect(lines(elem)[1][1]).toBe('98')
    batch.unapply()
    expect(elem.outerHTML).toBe(original)
  })
})
