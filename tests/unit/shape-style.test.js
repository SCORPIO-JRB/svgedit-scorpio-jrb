import { describe, it, expect } from 'vitest'
import { copyShapeStyle, SHAPE_STYLE } from '../../packages/svgcanvas/core/shape-style.js'

// A click on a shape alone copies its style into the current style: the
// attributes it does not have give their SVG initial value, never null,
// which new shapes and converted paths used to write as "null".

const NS = 'http://www.w3.org/2000/svg'
const make = (tag, attrs) => {
  const elem = document.createElementNS(NS, tag)
  Object.entries(attrs).forEach(([name, value]) => elem.setAttribute(name, value))
  return elem
}
const fakeCanvas = (text = { font_size: 24, font_family: 'serif' }) => {
  const props = {}
  return {
    props,
    text,
    setCurProperties: (key, value) => { props[key] = value },
    setCurText: (key, value) => { text[key] = value }
  }
}

describe('copyShapeStyle', () => {
  it('copies the attributes the shape has', () => {
    const canvas = fakeCanvas()
    copyShapeStyle(canvas, make('ellipse', {
      fill: '#a63',
      'fill-opacity': '0.5',
      stroke: '#00f',
      'stroke-width': '3',
      'stroke-dasharray': '5,5',
      'stroke-linejoin': 'round',
      'stroke-linecap': 'square',
      'stroke-opacity': '0.25'
    }))
    expect(canvas.props).toEqual({
      fill: '#a63',
      fill_opacity: '0.5',
      stroke: '#00f',
      stroke_width: '3',
      stroke_dasharray: '5,5',
      stroke_linejoin: 'round',
      stroke_linecap: 'square',
      stroke_opacity: '0.25'
    })
  })

  it('gives the SVG initial value of the attributes the shape does not have, never null', () => {
    const canvas = fakeCanvas()
    copyShapeStyle(canvas, make('ellipse', { fill: '#a63', stroke: '#00f', 'stroke-width': '3' }))
    expect(Object.values(canvas.props)).not.toContain(null)
    expect(canvas.props).toEqual({
      fill: '#a63',
      fill_opacity: 1,
      stroke: '#00f',
      stroke_width: '3',
      stroke_dasharray: 'none',
      stroke_linejoin: 'miter',
      stroke_linecap: 'butt',
      stroke_opacity: 1
    })
    const bare = fakeCanvas()
    copyShapeStyle(bare, make('rect', {}))
    expect(bare.props.fill).toBe('#000000')
    expect(bare.props.stroke).toBe('none')
    expect(Object.keys(bare.props)).toEqual(SHAPE_STYLE.map(([key]) => key))
  })

  it('copies the font of a text, and keeps the current font for what the text does not set', () => {
    const canvas = fakeCanvas()
    copyShapeStyle(canvas, make('text', { 'font-family': 'Arial', fill: '#000' }))
    expect(canvas.text).toEqual({ font_size: 24, font_family: 'Arial' })
    copyShapeStyle(canvas, make('text', { 'font-size': '12' }))
    expect(canvas.text).toEqual({ font_size: '12', font_family: 'Arial' })
    // Only a text sets the font.
    copyShapeStyle(canvas, make('rect', { 'font-size': '40' }))
    expect(canvas.text.font_size).toBe('12')
  })
})
