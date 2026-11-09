import {
  parseColor, parseHex, toHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb,
  channelsOf, colorOfChannels, documentColors, cssColor
} from '../../src/editor/color/color.js'
import {
  angleOfLine, lineOfAngle, setAngle, readStops, writeStops, colorAt,
  cssGradient, makeGradient, formatNumber, sortStops
} from '../../src/editor/color/gradient.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const svg = (markup) => {
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml')
  return doc.documentElement
}

describe('colour arithmetic (se-color-field)', () => {
  it('reads hexadecimal, functional and named colours', () => {
    expect(parseHex('#abc')).toEqual({ r: 170, g: 187, b: 204 })
    expect(parseHex('F08A62')).toEqual({ r: 240, g: 138, b: 98 })
    expect(parseHex('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 0.502 })
    expect(parseHex('#12')).toBeNull()
    expect(parseColor('red')).toEqual({ r: 255, g: 0, b: 0 })
    expect(parseColor('RebeccaPurple')).toEqual({ r: 102, g: 51, b: 153 })
    expect(parseColor('rgb(240, 138, 98)')).toEqual({ r: 240, g: 138, b: 98 })
    expect(parseColor('rgba(240,138,98,0.5)')).toEqual({ r: 240, g: 138, b: 98, a: 0.5 })
    expect(parseColor('rgb(100% 0% 0% / 25%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 })
    expect(parseColor('hsl(120, 100%, 50%)')).toEqual({ r: 0, g: 255, b: 0 })
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    for (const value of ['none', 'currentColor', 'url(#g)', '', 'rgb(1,2)', 'bleu']) {
      expect(parseColor(value)).toBeNull()
    }
  })

  it('converts between RGB, HSV and HSL and back', () => {
    const colors = [
      { r: 240, g: 138, b: 98 }, { r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 },
      { r: 22, g: 15, b: 35 }, { r: 206, g: 184, b: 255 }, { r: 76, g: 195, b: 138 }
    ]
    for (const color of colors) {
      expect(hsvToRgb(rgbToHsv(color))).toEqual(color)
      expect(hslToRgb(rgbToHsl(color))).toEqual(color)
    }
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 })
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(toHex({ r: 240, g: 138, b: 98 })).toBe('f08a62')
  })

  it('shows a colour in each format and reads it back', () => {
    const color = { r: 240, g: 138, b: 98 }
    expect(channelsOf(color, 'hex')).toEqual(['F08A62'])
    expect(channelsOf(color, 'rgb')).toEqual([240, 138, 98])
    expect(channelsOf(color, 'hsl')).toEqual([17, 83, 66])
    expect(colorOfChannels(['f08a62'], 'hex')).toEqual(color)
    expect(colorOfChannels(['#F08A62'], 'hex')).toEqual(color)
    expect(colorOfChannels([240, 138, 98], 'rgb')).toEqual(color)
    expect(colorOfChannels(['300', '-4', '12'], 'rgb')).toEqual({ r: 255, g: 0, b: 12 })
    expect(colorOfChannels(['a', '1', '2'], 'rgb')).toBeNull()
    expect(toHex(colorOfChannels([17, 83, 66], 'hsl'))).toBe('f08960')
    expect(cssColor(color)).toBe('#f08a62')
    expect(cssColor(color, 0.5)).toBe('rgb(240 138 98 / 50%)')
  })

  it('lists the colours of a document, most used first', () => {
    const root = svg(`
      <style>.a { fill: #F08A62; } .b { stroke: rgb(240, 138, 98) }</style>
      <rect fill="#160F23" stroke="red"/>
      <rect fill="#160f23" style="stroke: #4CC38A; fill-opacity: 0.5"/>
      <rect fill="none" stroke="url(#g)"/>
      <linearGradient id="g"><stop stop-color="#4cc38a"/><stop stop-color="transparent"/></linearGradient>
      <g id="selectorParentGroup"><rect fill="#22c"/></g>`)
    expect(documentColors(root)).toEqual(['160f23', '4cc38a', 'f08a62', 'ff0000'])
    expect(documentColors(root, 2)).toEqual(['160f23', '4cc38a'])
  })
})

describe('gradients (se-color-field)', () => {
  it('turns an angle into the line of a gradient and back', () => {
    expect(lineOfAngle(90)).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 })
    expect(lineOfAngle(180)).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 })
    expect(lineOfAngle(45)).toEqual({ x1: 0, y1: 1, x2: 1, y2: 0 })
    for (const deg of [0, 30, 45, 90, 135, 180, 225, 270, 315, 359]) {
      expect(angleOfLine(lineOfAngle(deg))).toBe(deg)
    }
    // The default line of SVG goes left to right.
    expect(angleOfLine({ x1: 0, y1: 0, x2: 1, y2: 0 })).toBe(90)
  })

  it('keeps the centre and the length of a gradient in user space', () => {
    const grad = svg('<linearGradient gradientUnits="userSpaceOnUse" x1="10" y1="50" x2="110" y2="50"/>').firstElementChild
    setAngle(grad, 180)
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => grad.getAttribute(a))).toEqual(['60', '0', '60', '100'])
    const box = svg('<linearGradient/>').firstElementChild
    setAngle(box, 180)
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => box.getAttribute(a))).toEqual(['0.5', '0', '0.5', '1'])
  })

  it('reads and writes stops', () => {
    const grad = svg(`<linearGradient>
      <stop offset="0" stop-color="#B6B0A7"/>
      <stop offset="40%" style="stop-color: rgb(40, 33, 26); stop-opacity: 0.5"/>
      <stop offset="0.2" stop-color="red"/>
    </linearGradient>`).firstElementChild
    expect(readStops(grad)).toEqual([
      { offset: 0, color: 'b6b0a7', opacity: 1 },
      { offset: 0.4, color: '28211a', opacity: 0.5 },
      // An offset below the one before renders at it.
      { offset: 0.4, color: 'ff0000', opacity: 1 }
    ])
    writeStops(grad, [
      { offset: 1, color: '28211a', opacity: 0.25 },
      { offset: 0, color: 'b6b0a7', opacity: 1 }
    ])
    expect(grad.innerHTML.replace(/ xmlns="[^"]+"/g, '')).toBe(
      '<stop offset="0" stop-color="#b6b0a7"/><stop offset="1" stop-color="#28211a" stop-opacity="0.25"/>'
    )
  })

  it('gives the colour between two stops and the CSS of the bar', () => {
    const stops = [{ offset: 0, color: '000000', opacity: 1 }, { offset: 1, color: 'ffffff', opacity: 0 }]
    expect(colorAt(stops, 0.5)).toEqual({ color: '808080', opacity: 0.5 })
    expect(colorAt(stops, -1)).toEqual({ color: '000000', opacity: 1 })
    expect(colorAt(stops, 2)).toEqual({ color: 'ffffff', opacity: 0 })
    expect(cssGradient(stops)).toBe('linear-gradient(90deg, #000000 0%, rgb(255 255 255 / 0%) 100%)')
    expect(cssGradient(stops, { type: 'linearGradient', angle: 180 })).toMatch(/^linear-gradient\(180deg/)
    expect(cssGradient(stops, { type: 'radialGradient' })).toMatch(/^radial-gradient\(circle closest-side/)
    expect(sortStops([{ offset: 0.5 }, { offset: 0.1 }])).toEqual([{ offset: 0.1 }, { offset: 0.5 }])
    expect(formatNumber(0.123456)).toBe('0.1235')
    expect(formatNumber(-0.00001)).toBe('0')
  })

  it('changes the style of a gradient, keeping what both styles share', () => {
    const linear = svg('<linearGradient id="g1" spreadMethod="reflect" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/></linearGradient>').firstElementChild
    const radial = makeGradient(document, 'radialGradient', readStops(linear), linear)
    expect(radial.localName).toBe('radialGradient')
    expect(radial.getAttribute('spreadMethod')).toBe('reflect')
    expect(radial.hasAttribute('x1')).toBe(false)
    expect(radial.querySelectorAll('stop')).toHaveLength(1)
    const back = makeGradient(document, 'linearGradient', readStops(radial), radial)
    expect(angleOfLine({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 })).toBe(90)
    expect(back.getAttribute('x1')).toBe('0')
    expect(back.getAttribute('y2')).toBe('0.5')
    const same = makeGradient(document, 'linearGradient', readStops(linear), linear)
    expect(same.getAttribute('y2')).toBe('1')
  })
})

describe('colour window helpers (se-color-field)', async () => {
  const { pushRecent, searchLibrary, placePicker, signatureOf, fold, RECENT_MAX } = await import('../../src/editor/panels/PaintPicker.js')
  const { DEFAULT_COLOR_LIBRARIES } = await import('../../src/editor/color-libraries.js')

  it('keeps the recent colours, most recent first, without repeats', () => {
    expect(pushRecent(['aaaaaa', 'bbbbbb'], 'bbbbbb')).toEqual(['bbbbbb', 'aaaaaa'])
    const full = Array.from({ length: RECENT_MAX }, (_, i) => i.toString(16).padStart(6, '0'))
    expect(pushRecent(full, 'ffffff')).toHaveLength(RECENT_MAX)
    expect(pushRecent(full, 'ffffff')[0]).toBe('ffffff')
  })

  it('searches a library by name, group or hexadecimal, without accents', () => {
    const names = {
      'color.group_fluids': 'Fluides',
      'color.c_hot_supply': 'Chaud, départ',
      'color.c_hot_return': 'Chaud, retour',
      'color.group_nuit': 'Nuit'
    }
    const label = (key) => names[key] ?? key
    const [synoptics, scorpio] = DEFAULT_COLOR_LIBRARIES
    expect(searchLibrary(synoptics, 'depart', label).flatMap((g) => g.colors.map((c) => c.value))).toContain('#F08A62')
    expect(searchLibrary(synoptics, 'fluides', label)[0].colors).toHaveLength(4)
    expect(searchLibrary(synoptics, '#f08a', label).flatMap((g) => g.colors)).toHaveLength(1)
    expect(searchLibrary(scorpio, 'nuit 70', label)).toEqual([{ name: 'Nuit', colors: [{ value: '#160F23', label: 'Nuit 70' }] }])
    expect(searchLibrary(scorpio, 'nothing here', label)).toEqual([])
    expect(fold('Équipement')).toBe('equipement')
  })

  it('goes beside the panel, else over or under its anchor, inside the window', () => {
    const viewport = { width: 1440, height: 900 }
    const size = { width: 256, height: 400 }
    const anchor = { left: 1180, top: 430, right: 1420, bottom: 458 }
    expect(placePicker({ anchor, size, viewport, panel: { left: 1160 } })).toEqual({ x: 896, y: 430 })
    // Low in the panel: moved up to stay inside.
    expect(placePicker({ anchor: { ...anchor, top: 800, bottom: 828 }, size, viewport, panel: { left: 1160 } }).y).toBe(492)
    // A bar: above it when there is room, else under it.
    const bar = { left: 340, top: 600, right: 780, bottom: 640 }
    expect(placePicker({ anchor: bar, size, viewport })).toEqual({ x: 340, y: 192 })
    expect(placePicker({ anchor: { ...bar, top: 120, bottom: 160 }, size, viewport })).toEqual({ x: 340, y: 168 })
  })

  it('tells paints apart', () => {
    expect(signatureOf(null)).toBe('none')
    expect(signatureOf({ type: 'solidColor', solidColor: 'none', alpha: 100 })).toBe('none')
    expect(signatureOf({ type: 'solidColor', solidColor: 'F08A62', alpha: 37.00000000000001 })).toBe('solid:f08a62:37')
    expect(signatureOf({ type: 'solidColor', solidColor: 'f08a62', alpha: 100 }, true)).toBe('mixed')
  })
})
