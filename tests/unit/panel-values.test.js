import { describe, expect, it } from 'vitest'
import { commonValue, commonValueOf, roundForField, shapesOf } from '../../src/editor/panels/panelValues.js'

// M4: values the panel shows for a multi-selection.

describe('Panel values (M4)', () => {
  it('gives the value elements share, or undefined for "Mixed"', () => {
    expect(commonValue(['2', '2', '2'])).toBe('2')
    expect(commonValue(['2', '2.0', 2])).toBe('2')
    expect(commonValue(['2', '3'])).toBeUndefined()
    expect(commonValue(['none', 'none'])).toBe('none')
    expect(commonValue(['none', '5,5'])).toBeUndefined()
    expect(commonValue([null, null])).toBeNull()
    expect(commonValue([null, '0'])).toBeUndefined()
    expect(commonValue([])).toBeUndefined()
  })

  it('stops reading at the first difference', () => {
    const read = []
    expect(commonValueOf([1, 2, 3, 4], (v) => { read.push(v); return v })).toBeUndefined()
    expect(read).toEqual([1, 2])
  })

  it('rounds a field to two decimals, without negative zero', () => {
    expect(roundForField(26.4583333)).toBe(26.46)
    expect(roundForField(-0.001)).toBe(0)
    expect(roundForField(100)).toBe(100)
  })

  it('finds the shapes of a selection, inside its groups too', () => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect id="r"/><g id="g"><title>t</title><circle id="c"/><g><path id="p"/></g></g>
      <image id="i"/><use id="u"/></svg>`
    const byId = (id) => document.getElementById(id)
    expect(shapesOf([byId('r'), byId('g'), byId('i'), byId('u'), null]).map((el) => el.id))
      .toEqual(['r', 'c', 'p'])
  })
})
