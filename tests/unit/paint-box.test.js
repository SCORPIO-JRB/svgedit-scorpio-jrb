import { describe, expect, it } from 'vitest'
import PaintBox, { shownPaint } from '../../src/editor/components/PaintBox.js'
import { lengthOf, strokeWidthOf } from '../../src/editor/panels/panelValues.js'

// The fill and stroke of a shape as the panel shows them, whatever way the
// file writes them (9 November: a floor plan whose shapes are filled with
// rgba(255, 255, 255, .1) showed opaque white).

const NS = 'http://www.w3.org/2000/svg'
const shape = (attrs) => {
  const elem = document.createElementNS(NS, 'rect')
  for (const [name, value] of Object.entries(attrs)) elem.setAttribute(name, value)
  document.body.append(elem)
  return elem
}

describe('Paint shown for a colour', () => {
  it('takes the alpha of the colour into its opacity', () => {
    expect(shownPaint('rgba(255, 255, 255, .1)', 100)).toEqual({ color: '#ffffff', opacity: 10 })
    expect(shownPaint('rgba(0, 0, 255, .3)', 50)).toEqual({ color: '#0000ff', opacity: 15 })
    expect(shownPaint('hsla(120, 100%, 25%, .25)', 100)).toEqual({ color: '#008000', opacity: 25 })
    expect(shownPaint('rgb(0 0 0 / 40%)', 100)).toEqual({ color: '#000000', opacity: 40 })
    expect(shownPaint('#ff000080', 100)).toEqual({ color: '#ff0000', opacity: 50.2 })
    expect(shownPaint('#0f08', 100)).toEqual({ color: '#00ff00', opacity: 53.3 })
    expect(shownPaint('transparent', 100)).toEqual({ color: '#000000', opacity: 0 })
  })

  it('writes an opaque colour in six digits, and keeps none, references and the unknown', () => {
    expect(shownPaint('#fff', 80)).toEqual({ color: '#ffffff', opacity: 80 })
    expect(shownPaint('navy', 100)).toEqual({ color: '#000080', opacity: 100 })
    expect(shownPaint('none', 100)).toEqual({ color: 'none', opacity: 100 })
    expect(shownPaint('url("#grad")', 100)).toEqual({ color: 'url(#grad)', opacity: 100 })
    expect(shownPaint('url(#grad) red', 100)).toEqual({ color: 'url(#grad)', opacity: 100 })
    expect(shownPaint('context-fill', 100)).toEqual({ color: 'context-fill', opacity: 100 })
  })
})

describe('Paint box', () => {
  const box = (type) => new PaintBox(document.createElement('div'), type)

  it('shows the fill of an imported shape with its transparency', () => {
    const fill = box('fill')
    const paint = fill.update({}, shape({ fill: 'rgba(255, 255, 255, .1)', stroke: '#fff' }))
    expect(paint.type).toBe('solidColor')
    expect(paint.solidColor).toBe('ffffff')
    expect(paint.alpha).toBe(10)
    expect(fill.rect.getAttribute('opacity')).toBe('0.1')
    const stroke = box('stroke').update({}, shape({ fill: 'rgba(255, 255, 255, .1)', stroke: '#fff' }))
    expect([stroke.solidColor, stroke.alpha]).toEqual(['ffffff', 100])
  })

  it('multiplies the alpha of the colour by the fill-opacity', () => {
    const paint = box('fill').update({}, shape({ fill: 'rgba(0, 0, 255, .3)', 'fill-opacity': '.5' }))
    expect([paint.solidColor, paint.alpha]).toEqual(['0000ff', 15])
  })

  it('shows an invisible stroke as such', () => {
    const paint = box('stroke').update({}, shape({ stroke: 'rgba(255, 255, 255, 0)' }))
    expect([paint.solidColor, paint.alpha]).toEqual(['ffffff', 0])
  })

  it('finds the same paint written two ways, not a mixed one', () => {
    const fill = box('fill')
    fill.updateMany({}, [shape({ fill: 'rgba(255, 255, 255, .5)' }), shape({ fill: '#fff', 'fill-opacity': '.5' })])
    expect(fill.mixed).toBe(false)
    expect([fill.paint.solidColor, fill.paint.alpha]).toEqual(['ffffff', 50])
    fill.updateMany({}, [shape({ fill: 'rgba(255, 255, 255, .5)' }), shape({ fill: 'rgba(255, 255, 255, .2)' })])
    expect(fill.mixed).toBe(true)
  })

  it('gives a paint for a functional colour', () => {
    const paint = PaintBox.getPaint({}, 'rgba(0, 0, 255, .3)', 50, 'fill')
    expect([paint.type, paint.solidColor, paint.alpha]).toEqual(['solidColor', '0000ff', 15])
    expect(PaintBox.getPaint({}, 'none', 100, 'fill').type).toBe('none')
  })
})

// 11 November: a group of the synoptic library (its title, a transparent
// zone for the click, its body, alarm markers hidden until their state)
// kept the paint of the previous selection, black or red: its title, which
// has no paint, made it "mixed", and nothing was shown.
describe('Paint of a group', () => {
  const box = (type) => new PaintBox(document.createElement('div'), type)
  const make = (tag, attrs = {}, children = []) => {
    const elem = document.createElementNS(NS, tag)
    for (const [name, value] of Object.entries(attrs)) elem.setAttribute(name, value)
    elem.append(...children)
    return elem
  }
  const group = (...children) => {
    const g = make('g', {}, children)
    document.body.append(g)
    return g
  }
  const title = () => make('title', {}, ['Bouteille de découplage'])

  it('shows the paint of its body, its title left out', () => {
    const g = group(title(), make('rect', { fill: '#1f1638', stroke: '#9b92aa' }))
    expect(box('fill').paintOf(g)).toEqual({ color: '#1f1638', opacity: 100 })
    expect(box('stroke').paintOf(g)).toEqual({ color: '#9b92aa', opacity: 100 })
  })

  it('leaves out a hidden marker and a zone that draws nothing', () => {
    const marker = make('g', { display: 'none' }, [make('circle', { fill: '#ef4444', stroke: '#160f23' })])
    const g = group(title(), make('rect', { fill: 'transparent', stroke: 'none' }),
      make('rect', { fill: 'rgba(255, 255, 255, .05)', stroke: '#766d85' }), marker)
    expect(box('fill').paintOf(g)).toEqual({ color: '#ffffff', opacity: 5 })
    expect(box('stroke').paintOf(g)).toEqual({ color: '#766d85', opacity: 100 })
  })

  it('reads the shapes of its subgroups, and a line has no fill', () => {
    const g = group(make('g', {}, [make('rect', { fill: '#00f', stroke: '#000' })]), make('line', { stroke: '#000' }))
    expect(box('fill').paintOf(g)).toEqual({ color: '#0000ff', opacity: 100 })
    expect(box('stroke').paintOf(g)).toEqual({ color: '#000000', opacity: 100 })
    expect(box('fill').paintOf(group(make('line', { stroke: '#000' })))).toEqual({ color: 'none', opacity: 100 })
  })

  it('shows stripes when its shapes differ, and the paint again for a shape', () => {
    const fill = box('fill')
    expect(fill.update({}, group(title(), make('rect', { fill: '#f00' }), make('text', { fill: '#fff' })))).toBeNull()
    expect(fill.mixed).toBe(true)
    expect(fill.rect.getAttribute('fill')).toBe(fill.mixedFill)
    fill.update({}, shape({ fill: '#0f0' }))
    expect(fill.mixed).toBe(false)
    expect(fill.rect.getAttribute('fill')).toBe('#00ff00')
  })

  it('without a shape, keeps the paint shown', () => {
    const fill = box('fill')
    fill.update({}, shape({ fill: '#0f0' }))
    expect(fill.update({}, group(title(), make('image')))).toBeNull()
    expect([fill.mixed, fill.rect.getAttribute('fill')]).toEqual([false, '#00ff00'])
  })

  it('is one paint in a multi-selection with a shape of the same colour', () => {
    const fill = box('fill')
    fill.updateMany({}, [group(title(), make('rect', { fill: '#c00' })), shape({ fill: '#cc0000' })])
    expect(fill.mixed).toBe(false)
    expect(fill.paint.solidColor).toBe('cc0000')
  })
})

describe('Stroke width shown', () => {
  it('is a number of user units, without its unit', () => {
    expect(lengthOf('5px')).toBe('5')
    expect(lengthOf('0.5mm')).toBe('1.89')
    expect(lengthOf('1in')).toBe('96')
    expect(lengthOf('.5PX')).toBe('0.5')
    expect(lengthOf('2')).toBe('2')
    expect(lengthOf(3)).toBe(3)
  })

  it('keeps what it cannot show as a number', () => {
    expect(lengthOf('50%')).toBe('50%')
    expect(lengthOf('2em')).toBe('2em')
    expect(lengthOf(null)).toBeNull()
  })

  it('is the shape\'s own width, or 1', () => {
    expect(strokeWidthOf({}, shape({ 'stroke-width': '5px' }))).toBe('5')
    expect(strokeWidthOf({}, shape({}))).toBe('1')
    // A rule of the style sheets gives it (lot S2)
    const styled = { getStyledValue: (elem, name) => name === 'stroke-width' ? { value: '0.5mm' } : null }
    expect(strokeWidthOf(styled, shape({ 'stroke-width': '5px' }))).toBe('1.89')
  })
})
