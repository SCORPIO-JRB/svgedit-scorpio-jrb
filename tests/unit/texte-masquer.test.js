import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import { startTextBoxResize, resizeTextBox, wrapLine } from '../../packages/svgcanvas/core/text-lines.js'
import { isAllHidden } from '../../src/editor/structure.js'

// The grips of a text set its box, as the Resizing of Figma; the eye of
// Appearance shows a selection that is all hidden. Without the browser:
// jsdom has no layout, so the box of the glyphs is given and the line
// metrics are those of the fallback (ascent 0.9 font size).

const text = (attrs = 'x="100" y="50" font-size="20"') => {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="${NS.SE}"><text ${attrs}>Vanne trois voies</text></svg>`,
    'image/svg+xml'
  )
  document.body.append(document.importNode(svg.documentElement, true))
  const elem = document.body.lastElementChild.firstElementChild
  // The glyphs: from the top of the line (y - ascent) for one line.
  elem.getBBox = () => ({ x: 100, y: 32, width: 200, height: 23 })
  return elem
}
const box = (elem) => ({
  x: Number(elem.getAttribute('x')),
  y: Number(elem.getAttribute('y')),
  width: Number(elem.getAttributeNS(NS.SE, 'width') || 0),
  height: Number(elem.getAttributeNS(NS.SE, 'height') || 0)
})

describe('the grips of a text set its box', () => {
  afterEach(() => { document.body.replaceChildren() })

  it('a side grip gives a width: the text keeps its height as its lines have it', () => {
    const elem = text()
    resizeTextBox(startTextBoxResize(elem), -50, 0, 'e')
    expect(box(elem)).toEqual({ x: 100, y: 50, width: 150, height: 0 })
    resizeTextBox(startTextBoxResize(elem), -30, 0, 'w')
    expect(box(elem)).toEqual({ x: 70, y: 50, width: 180, height: 0 })
  })

  it('the bottom grip gives a fixed size, the width being that of the lines', () => {
    const elem = text()
    resizeTextBox(startTextBoxResize(elem), 0, 40, 's')
    expect(box(elem)).toEqual({ x: 100, y: 50, width: 200, height: 63 })
  })

  it('the top grip moves the top: the first line goes down with it, the bottom stays', () => {
    const elem = text('x="100" y="50" font-size="20" se:width="200" se:height="60"')
    resizeTextBox(startTextBoxResize(elem), 0, -30, 'n')
    expect(box(elem)).toEqual({ x: 100, y: 20, width: 200, height: 90 })
    resizeTextBox(startTextBoxResize(elem), 0, 500, 'n')
    // Never less than 1 unit high: the bottom stays where it was.
    expect(box(elem)).toMatchObject({ height: 1, y: 20 + 89 })
  })

  it('a corner gives both; Alt moves the opposite sides, Shift keeps the proportions', () => {
    const elem = text('x="100" y="50" font-size="20" se:width="200" se:height="100"')
    resizeTextBox(startTextBoxResize(elem), 20, 10, 'se', { symmetric: true })
    expect(box(elem)).toEqual({ x: 80, y: 40, width: 240, height: 120 })
    resizeTextBox(startTextBoxResize(elem), 120, 0, 'se', { proportional: true })
    expect(box(elem)).toEqual({ x: 80, y: 40, width: 360, height: 180 })
  })

  it('a width rounded in the file does not break the line it was measured on', () => {
    const measure = (s) => s.length * 10 + 0.004
    expect(wrapLine('ab cd', 50, measure)).toEqual(['ab cd'])
    expect(wrapLine('ab cd', 49.9, measure)).toEqual(['ab', 'cd'])
  })
})

describe('the eye of a selection', () => {
  const elem = (display) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    if (display) el.setAttribute('display', display)
    return el
  }

  it('shows it again only when all of it is hidden', () => {
    expect(isAllHidden([elem('none'), elem('none')])).toBe(true)
    expect(isAllHidden([elem('none'), elem()])).toBe(false)
    expect(isAllHidden([])).toBe(false)
  })
})
