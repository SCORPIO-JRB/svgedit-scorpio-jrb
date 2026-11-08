import { describe, it, expect } from 'vitest'
import {
  SMALL_FRAME, formatAngle, formatNumber, formatPosition, formatSize, gripLayout,
  namedResizeCursors, resizeCursor, rotateCursor
} from '../../packages/svgcanvas/core/feedback.js'

// M5: text of the dimension label, oriented cursors, grips of small frames.

const SIZES = { grip: 8, hit: 16, zone: 12 }

const coordsOf = (x, y, w, h) => ({
  nw: [x, y],
  n: [x + w / 2, y],
  ne: [x + w, y],
  e: [x + w, y + h / 2],
  se: [x + w, y + h],
  s: [x + w / 2, y + h],
  sw: [x, y + h],
  w: [x, y + h / 2]
})

// Decodes the rotation of a cursor drawn by feedback.js.
const cursorAngle = (css) => Number(decodeURIComponent(css).match(/rotate\((-?[\d.]+) 12 12\)/)[1])

describe('Dimension label', () => {
  it('rounds to two decimals, without trailing zeros or negative zero', () => {
    expect(formatNumber(120)).toBe('120')
    expect(formatNumber(37.5)).toBe('37.5')
    expect(formatNumber(80.00000238418579)).toBe('80')
    expect(formatNumber(1 / 3)).toBe('0.33')
    expect(formatNumber(-0.001)).toBe('0')
  })

  it('shows width × height, with the unit unless it is px', () => {
    expect(formatSize(100, 80)).toBe('100 × 80')
    expect(formatSize(26.458, 21.1667, 'mm')).toBe('26.46 × 21.17 mm')
  })

  it('shows X and Y separated by a space that SVG text keeps', () => {
    expect(formatPosition(120, 110)).toBe('X 120 Y 110')
    expect(formatPosition(10, -5.5, 'cm')).toBe('X 10 Y -5.5 cm')
  })

  it('shows an angle in (-180, 180], one decimal', () => {
    expect(formatAngle(55.00798)).toBe('55°')
    expect(formatAngle(72.06)).toBe('72.1°')
    expect(formatAngle(270)).toBe('-90°')
    expect(formatAngle(-180)).toBe('180°')
    expect(formatAngle(-0.01)).toBe('0°')
  })
})

describe('Oriented cursors', () => {
  it('draws the resize arrow at the angle, to the degree, with a standard fallback', () => {
    const css = resizeCursor(30.4, 'e-resize')
    expect(css).toMatch(/^url\("data:image\/svg\+xml,/)
    expect(css).toMatch(/12 12, e-resize$/)
    expect(cursorAngle(css)).toBe(30)
  })

  it('draws the same arrow half a turn later, and reuses it', () => {
    expect(resizeCursor(225, 'nw-resize')).toBe(resizeCursor(45, 'nw-resize'))
    expect(cursorAngle(resizeCursor(-30, 'n-resize'))).toBe(150)
  })

  it('draws the rotation arrow facing its corner', () => {
    expect(cursorAngle(rotateCursor(90 + 30, 'auto'))).toBe(120)
    expect(cursorAngle(rotateCursor(-90, 'auto'))).toBe(270)
    expect(rotateCursor(0, 'url(rotate.svg) 12 12, auto')).toMatch(/12 12, url\(rotate\.svg\) 12 12, auto$/)
  })

  it('turns the standard cursor names by steps of 45 degrees', () => {
    const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
    expect(namedResizeCursors(dirs, 0).nw).toBe('nw')
    expect(namedResizeCursors(dirs, 45).nw).toBe('n')
    expect(namedResizeCursors(dirs, -45).nw).toBe('w')
    expect(namedResizeCursors(dirs, 360).e).toBe('e')
  })
})

describe('Grips of small frames', () => {
  it('keeps every grip on a large frame, hit areas centred on the grips', () => {
    const layout = gripLayout(coordsOf(100, 100, 80, 60), SIZES)
    expect(layout.small).toEqual({ width: false, height: false })
    expect(layout.hidden.size).toBe(0)
    expect(layout.hits.nw).toEqual([92, 92, 16, 16])
    expect(layout.hits.e).toEqual([172, 122, 16, 16])
  })

  it('puts a rotation zone outside each corner, beyond its hit area', () => {
    const { zones } = gripLayout(coordsOf(100, 100, 80, 60), SIZES)
    expect(zones.nw).toEqual([80, 80, 20, 20])
    expect(zones.se).toEqual([180, 160, 20, 20])
    expect(Object.keys(zones).sort()).toEqual(['ne', 'nw', 'se', 'sw'])
  })

  it(`below ${SMALL_FRAME} pixels, hides the side grips of that dimension`, () => {
    // A thin horizontal line: its top and bottom grips would cover it.
    expect([...gripLayout(coordsOf(0, 0, 200, 6), SIZES).hidden].sort()).toEqual(['n', 's'])
    expect([...gripLayout(coordsOf(0, 0, 6, 200), SIZES).hidden].sort()).toEqual(['e', 'w'])
    expect(gripLayout(coordsOf(0, 0, 12, 12), SIZES).hidden.size).toBe(4)
  })

  it('moves the corner hit areas outward, leaving the inside free to drag', () => {
    const { hits, zones } = gripLayout(coordsOf(100, 100, 12, 12), SIZES)
    // 3 pixels inside: half the visible grip, less one.
    expect(hits.nw).toEqual([87, 87, 16, 16])
    expect(hits.se).toEqual([109, 109, 16, 16])
    // The free part of the frame, between the hit areas.
    expect(hits.se[0] - (hits.nw[0] + 16)).toBe(6)
    // The rotation zone still reaches beyond the hit area.
    expect(zones.nw).toEqual([75, 75, 25, 25])
  })

  it('on a tiny frame, keeps the hit areas within a quarter of each side', () => {
    const { hits } = gripLayout(coordsOf(0, 0, 4, 4), SIZES)
    expect(hits.nw).toEqual([-15, -15, 16, 16])
    expect(hits.se).toEqual([3, 3, 16, 16])
  })
})
