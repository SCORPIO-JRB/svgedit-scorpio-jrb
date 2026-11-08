import { describe, it, expect, beforeEach } from 'vitest'

import { init as initUnits } from '../../packages/svgcanvas/core/units.js'
import {
  init as initUtilities,
  findDefs,
  assignAttributes,
  snapToGrid,
  getHref,
  setHref,
  dropXMLInternalSubset,
  encodeUTF8,
  decodeUTF8,
  cleanupElement,
  isRemovableDefault
} from '../../packages/svgcanvas/core/utilities.js'

describe('utilities extra coverage', () => {
  let svg

  beforeEach(() => {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.innerHTML = ''
    document.body.append(svg)

    // Initialize units and utilities with a minimal canvas/context stub
    initUnits({
      getBaseUnit: () => 'px',
      getWidth: () => 200,
      getHeight: () => 100,
      getRoundDigits: () => 2
    })
    initUtilities({
      getSvgRoot: () => svg,
      getSvgContent: () => svg,
      getDOMDocument: () => document,
      getDOMContainer: () => svg,
      getBaseUnit: () => 'cm',
      getSnappingStep: () => 0.5
    })
  })

  it('creates defs and removes namespaced attributes via assignAttributes', () => {
    const defs = findDefs()
    expect(defs.tagName).toBe('defs')
    expect(svg.querySelectorAll('defs').length).toBe(1)

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
    assignAttributes(rect, { width: '10', height: '5', 'xml:space': undefined }, 0, true)
    expect(rect.getAttribute('width')).toBe('10')
    expect(rect.getAttribute('height')).toBe('5')
  })

  it('assignAttributes removes an attribute given null instead of writing "null"', () => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.setAttribute('stroke', '#000')
    assignAttributes(rect, { fill: null, stroke: null, 'xlink:href': null, width: '10' })
    expect(rect.hasAttribute('fill')).toBe(false)
    expect(rect.hasAttribute('stroke')).toBe(false)
    expect(rect.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(false)
    expect(rect.getAttribute('width')).toBe('10')
  })

  it('snaps to grid with unit conversion and handles href helpers', () => {
    const value = snapToGrid(2.3)
    expect(value).toBe(0)

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
    setHref(use, '#ref')
    expect(getHref(use)).toBe('#ref')
  })

  it('drops XML internal subsets and round trips UTF8 helpers', () => {
    const doc = '<!DOCTYPE svg [<!ENTITY test "x">]><svg/>'
    expect(dropXMLInternalSubset(doc)).toContain('<!DOCTYPE svg')

    const mixed = 'äöü & < >'
    const encoded = encodeUTF8(mixed)
    expect(decodeUTF8(encoded)).toBe(mixed)
  })
  describe('default values (question 10)', () => {
    const NS_SVG = 'http://www.w3.org/2000/svg'
    const make = (markup) => {
      svg.innerHTML = markup
      return (id) => svg.querySelector(`#${id}`)
    }

    it('removes a default nothing overrides, as before', () => {
      const get = make('<g id="g"><rect id="r" stroke-width="1" fill-opacity="1" opacity="1" stroke="none"/></g>')
      cleanupElement(get('r'))
      expect([...get('r').attributes].map((a) => a.name)).toEqual(['id'])
    })

    it('keeps an inherited default a group would override, by attribute, style or style sheet', () => {
      const get = make(`<style>.thick { stroke-linecap: round }</style>
        <g stroke-width="5" style="stroke: #000" class="thick" fill-opacity="0.3">
          <g id="inner"><rect id="r" stroke-width="1" stroke="none" stroke-linecap="butt" fill-opacity="1" opacity="1" stroke-opacity="1"/></g>
        </g>`)
      const sheet = svg.querySelector('style').sheet
      cleanupElement(get('r'))
      const kept = [...get('r').attributes].map((a) => a.name)
      expect(kept).toEqual(expect.arrayContaining(['stroke-width', 'stroke', 'fill-opacity']))
      expect(kept).not.toContain('opacity')
      expect(kept).not.toContain('stroke-opacity')
      if (sheet?.cssRules?.length) {
        expect(kept).toContain('stroke-linecap')
      }
    })

    it('removes a default when the group gives the initial value too', () => {
      const get = make('<g stroke-width="1px" stroke="none"><rect id="r" stroke-width="1" stroke="none"/></g>')
      cleanupElement(get('r'))
      expect(get('r').hasAttribute('stroke-width')).toBe(false)
      expect(get('r').hasAttribute('stroke')).toBe(false)
    })

    it('keeps an inherited default on an element a <use> reuses, or inside one', () => {
      const get = make('<g id="base"><rect id="r" stroke-width="1"/></g><use href="#base"/>')
      expect(isRemovableDefault(get('r'), 'stroke-width')).toBe(false)
      get('base').removeAttribute('id')
      expect(isRemovableDefault(get('r'), 'stroke-width')).toBe(true)
    })

    it('keeps rx="0" when ry is not 0, and both on an ellipse', () => {
      const get = make('<rect id="a" rx="0" ry="10"/><rect id="b" rx="0" ry="0"/><ellipse id="e" rx="0" ry="0"/>')
      cleanupElement(get('a'))
      cleanupElement(get('b'))
      cleanupElement(get('e'))
      expect(get('a').getAttribute('rx')).toBe('0')
      expect(get('b').hasAttribute('rx') || get('b').hasAttribute('ry')).toBe(false)
      expect(get('e').getAttribute('rx')).toBe('0')
      expect(get('e').getAttribute('ry')).toBe('0')
    })

    it('treats a detached element as having nothing to inherit from', () => {
      const rect = document.createElementNS(NS_SVG, 'rect')
      rect.setAttribute('stroke-width', '1')
      expect(isRemovableDefault(rect, 'stroke-width')).toBe(true)
      expect(isRemovableDefault(rect, 'width')).toBe(false)
    })
  })
})
