import { NS } from '../../packages/svgcanvas/core/namespaces.js'
import {
  setTextSource, lineElements, getTextHeight, getTextVerticalAlign, changesLayout, layoutText
} from '../../packages/svgcanvas/core/text-lines.js'
import { placePopover } from '../../src/editor/components/sePopover.js'
import {
  miterAngleOf, miterLimitOf, fontStyleValue, fontStyleAttributes, FONT_WEIGHTS, SECTIONS
} from '../../src/editor/panels/Inspector.js'

// Lot Texte, after the panel of Figma: Typography (style, sizes, alignments),
// the Resizing of a text (a box of fixed size, its lines placed in it), the
// window "Stroke settings" (the miter angle).

const text = (markup, attrs) => {
  const svg = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="${NS.SE}"><text ${attrs}>${markup}</text></svg>`,
    'image/svg+xml'
  )
  document.body.append(document.importNode(svg.documentElement, true))
  return document.body.lastElementChild.firstElementChild
}
const ys = (elem) => lineElements(elem)?.map((tspan) => Number(tspan.getAttribute('y')))

describe('the miter angle of Figma and the stroke-miterlimit of SVG', () => {
  it('reads the default limit of SVG, 4, as 28.96°', () => {
    expect(miterAngleOf(null)).toBe(28.96)
    expect(miterAngleOf('4')).toBe(28.96)
    expect(miterAngleOf(2)).toBe(60)
    expect(miterAngleOf(10)).toBe(11.48)
    // Under 1, SVG takes no such limit: the default.
    expect(miterAngleOf('0.5')).toBe(28.96)
  })

  it('writes back the whole limit an angle shown with two decimals stands for', () => {
    expect(miterLimitOf(28.96)).toBe(4)
    expect(miterLimitOf(60)).toBe(2)
    expect(miterLimitOf(11.48)).toBe(10)
    expect(miterLimitOf(29)).toBe(3.9939)
    expect(miterAngleOf(miterLimitOf(29))).toBe(29)
    expect(miterLimitOf(180)).toBe(1)
    expect(miterLimitOf(0)).toBeGreaterThan(100)
  })
})

describe('the Style list of Typography', () => {
  it('reads a weight and an italic as one value, at the nearest weight of the list', () => {
    expect(FONT_WEIGHTS).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
    expect(fontStyleValue(null, null)).toBe('400')
    expect(fontStyleValue('bold', 'italic')).toBe('700 italic')
    expect(fontStyleValue('normal', 'oblique')).toBe('400 italic')
    expect(fontStyleValue('300', 'normal')).toBe('300')
    expect(fontStyleValue('650', null)).toBe('600')
  })

  it('writes 400 and 700 as "normal" and "bold", as SVG-Edit always did', () => {
    expect(fontStyleAttributes('700 italic')).toEqual({ weight: 'bold', italic: true })
    expect(fontStyleAttributes('400')).toEqual({ weight: 'normal', italic: false })
    expect(fontStyleAttributes('300')).toEqual({ weight: '300', italic: false })
  })

  it('puts Typography after Appearance, as in Figma', () => {
    expect(SECTIONS.indexOf('text')).toBe(SECTIONS.indexOf('appearance') + 1)
    expect(SECTIONS.indexOf('text')).toBeLessThan(SECTIONS.indexOf('fill'))
  })
})

describe('a text of fixed size', () => {
  afterEach(() => { document.body.replaceChildren() })

  // Without layout (jsdom), a line is 0.9 font size above its baseline and
  // 0.25 under it: 23 for a font of 20.
  const attrs = (more) => `x="100" y="50" font-size="20" se:width="200" se:height="100" ${more}`

  it('reads its height and its vertical alignment', () => {
    const elem = text('Pompe', attrs('se:valign="bottom"'))
    expect(getTextHeight(elem)).toBe(100)
    expect(getTextVerticalAlign(elem)).toBe('bottom')
    expect(getTextVerticalAlign(text('Pompe', attrs('se:valign="sideways"')))).toBe('top')
    expect(getTextHeight(text('Pompe', 'x="0" y="0"'))).toBe(0)
  })

  it('keeps a line at the top as it is; in the middle or at the bottom, a line is a tspan moved down', () => {
    const top = text('Pompe', attrs(''))
    setTextSource(top, 'Pompe')
    expect(lineElements(top)).toBeNull()

    const middle = text('Pompe', attrs('se:valign="middle"'))
    setTextSource(middle, 'Pompe')
    // (100 - 23) / 2
    expect(ys(middle)).toEqual([88.5])
    // The text's y stays the baseline of a line at the top of the box.
    expect(middle.getAttribute('y')).toBe('50')

    const bottom = text('Pompe', attrs('se:valign="bottom"'))
    setTextSource(bottom, 'Pompe\nP2')
    // 100 - (23 + 24)
    expect(ys(bottom)).toEqual([103, 127])
  })

  it('keeps its box when lines come and go: they move about its middle', () => {
    const elem = text('Pompe', attrs('se:valign="middle"'))
    setTextSource(elem, 'Un')
    setTextSource(elem, 'Un\nDeux\nTrois')
    // (100 - (23 + 48)) / 2
    expect(ys(elem)).toEqual([64.5, 88.5, 112.5])
    expect(elem.getAttribute('y')).toBe('50')
    // Back to the top, a line is its characters again.
    elem.removeAttributeNS(NS.SE, 'valign')
    setTextSource(elem, 'Un')
    expect(lineElements(elem)).toBeNull()
    expect(elem.textContent).toBe('Un')
  })

  it('is laid out again after a change of its box, even of one line', () => {
    const elem = text('Pompe', 'x="100" y="50" font-size="20"')
    expect(changesLayout(elem, 'se:height')).toBe(true)
    expect(changesLayout(elem, 'se:valign')).toBe(true)
    expect(changesLayout(elem, 'font-size')).toBe(false)
    elem.setAttributeNS(NS.SE, 'se:height', '100')
    elem.setAttributeNS(NS.SE, 'se:valign', 'bottom')
    expect(layoutText(elem)).toBe(true)
    expect(ys(elem)).toEqual([127])
  })
})

describe('a window of settings at the left of the panel', () => {
  it('opens at the left of the panel, its top at the top of its icon, inside the window', () => {
    const viewport = { width: 1440, height: 900 }
    const size = { width: 264, height: 300 }
    const anchor = { left: 1100, right: 1440, top: 500, bottom: 532 }
    expect(placePopover(anchor, size, viewport, 'left-start')).toEqual({ x: 832, y: 500, side: 'left' })
    // Too low: moved up into the window.
    expect(placePopover({ ...anchor, top: 800, bottom: 832 }, size, viewport, 'left-start')).toEqual({ x: 832, y: 592, side: 'left' })
  })
})
