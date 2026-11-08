/**
 * Colour arithmetic of the colour window (se-color-field, plan v2,
 * section 4.7): reading a CSS colour, the conversions between RGB, HSV and
 * HSL, and the hexadecimal written in the document.
 *
 * A colour is `{ r, g, b }` in 0–255 with, when it has one, `a` in 0–1.
 * Pure functions, without the DOM.
 * @module color
 */

/** CSS named colours (CSS Color 4), by name. */
const NAMED = Object.fromEntries([
  'aliceblue:f0f8ff antiquewhite:faebd7 aqua:00ffff aquamarine:7fffd4 azure:f0ffff beige:f5f5dc',
  'bisque:ffe4c4 black:000000 blanchedalmond:ffebcd blue:0000ff blueviolet:8a2be2 brown:a52a2a',
  'burlywood:deb887 cadetblue:5f9ea0 chartreuse:7fff00 chocolate:d2691e coral:ff7f50',
  'cornflowerblue:6495ed cornsilk:fff8dc crimson:dc143c cyan:00ffff darkblue:00008b darkcyan:008b8b',
  'darkgoldenrod:b8860b darkgray:a9a9a9 darkgreen:006400 darkgrey:a9a9a9 darkkhaki:bdb76b',
  'darkmagenta:8b008b darkolivegreen:556b2f darkorange:ff8c00 darkorchid:9932cc darkred:8b0000',
  'darksalmon:e9967a darkseagreen:8fbc8f darkslateblue:483d8b darkslategray:2f4f4f',
  'darkslategrey:2f4f4f darkturquoise:00ced1 darkviolet:9400d3 deeppink:ff1493 deepskyblue:00bfff',
  'dimgray:696969 dimgrey:696969 dodgerblue:1e90ff firebrick:b22222 floralwhite:fffaf0',
  'forestgreen:228b22 fuchsia:ff00ff gainsboro:dcdcdc ghostwhite:f8f8ff gold:ffd700',
  'goldenrod:daa520 gray:808080 green:008000 greenyellow:adff2f grey:808080 honeydew:f0fff0',
  'hotpink:ff69b4 indianred:cd5c5c indigo:4b0082 ivory:fffff0 khaki:f0e68c lavender:e6e6fa',
  'lavenderblush:fff0f5 lawngreen:7cfc00 lemonchiffon:fffacd lightblue:add8e6 lightcoral:f08080',
  'lightcyan:e0ffff lightgoldenrodyellow:fafad2 lightgray:d3d3d3 lightgreen:90ee90 lightgrey:d3d3d3',
  'lightpink:ffb6c1 lightsalmon:ffa07a lightseagreen:20b2aa lightskyblue:87cefa',
  'lightslategray:778899 lightslategrey:778899 lightsteelblue:b0c4de lightyellow:ffffe0 lime:00ff00',
  'limegreen:32cd32 linen:faf0e6 magenta:ff00ff maroon:800000 mediumaquamarine:66cdaa',
  'mediumblue:0000cd mediumorchid:ba55d3 mediumpurple:9370db mediumseagreen:3cb371',
  'mediumslateblue:7b68ee mediumspringgreen:00fa9a mediumturquoise:48d1cc mediumvioletred:c71585',
  'midnightblue:191970 mintcream:f5fffa mistyrose:ffe4e1 moccasin:ffe4b5 navajowhite:ffdead',
  'navy:000080 oldlace:fdf5e6 olive:808000 olivedrab:6b8e23 orange:ffa500 orangered:ff4500',
  'orchid:da70d6 palegoldenrod:eee8aa palegreen:98fb98 paleturquoise:afeeee palevioletred:db7093',
  'papayawhip:ffefd5 peachpuff:ffdab9 peru:cd853f pink:ffc0cb plum:dda0dd powderblue:b0e0e6',
  'purple:800080 rebeccapurple:663399 red:ff0000 rosybrown:bc8f8f royalblue:4169e1',
  'saddlebrown:8b4513 salmon:fa8072 sandybrown:f4a460 seagreen:2e8b57 seashell:fff5ee sienna:a0522d',
  'silver:c0c0c0 skyblue:87ceeb slateblue:6a5acd slategray:708090 slategrey:708090 snow:fffafa',
  'springgreen:00ff7f steelblue:4682b4 tan:d2b48c teal:008080 thistle:d8bfd8 tomato:ff6347',
  'turquoise:40e0d0 violet:ee82ee wheat:f5deb3 white:ffffff whitesmoke:f5f5f5 yellow:ffff00',
  'yellowgreen:9acd32'
].join(' ').split(' ').map((pair) => pair.split(':')))

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round = (value, digits = 0) => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

/**
 * @param {string} hex Three, four, six or eight hexadecimal digits, with or
 *   without "#"
 * @returns {{r: number, g: number, b: number, a?: number}|null}
 */
export const parseHex = (hex) => {
  let h = String(hex ?? '').trim().replace(/^#/, '')
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  const n = (i) => Number.parseInt(h.slice(i, i + 2), 16)
  const color = { r: n(0), g: n(2), b: n(4) }
  if (h.length === 8) color.a = round(n(6) / 255, 3)
  return color
}

/**
 * A number of a functional notation: "50%" is a fraction of `full`.
 * @param {string} token
 * @param {number} full
 * @returns {number}
 */
const channel = (token, full) => {
  const text = String(token).trim()
  const value = Number.parseFloat(text)
  if (!Number.isFinite(value)) return Number.NaN
  return text.endsWith('%') ? (value / 100) * full : value
}

/**
 * The alpha of a functional notation: 0–1 or a percentage.
 * @param {string|undefined} token
 * @returns {number|undefined}
 */
const alphaOf = (token) => {
  if (token === undefined || token === '') return undefined
  return clamp(channel(token, 1), 0, 1)
}

/**
 * Reads a CSS colour: hexadecimal, rgb(), rgba(), hsl(), hsla(), a named
 * colour or "transparent". Hexadecimal digits alone ("f08a62") are read too:
 * it is what a field shows and what a person types.
 * @param {string} text
 * @returns {{r: number, g: number, b: number, a?: number}|null} null when it
 *   is not a colour (none, currentColor, url(...), a typo)
 */
export const parseColor = (text) => {
  const value = String(text ?? '').trim().toLowerCase()
  if (!value) return null
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  if (NAMED[value]) return parseHex(NAMED[value])
  const hex = parseHex(value)
  if (hex) return hex
  const fn = value.match(/^(rgba?|hsla?)\(\s*([^)]*)\)$/)
  if (!fn) return null
  // Comma or space syntax, with an optional "/ alpha".
  const [main, slash] = fn[2].split('/')
  const parts = main.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 3) return null
  const a = alphaOf(slash !== undefined ? slash : parts[3])
  let color
  if (fn[1].startsWith('rgb')) {
    color = {
      r: clamp(Math.round(channel(parts[0], 255)), 0, 255),
      g: clamp(Math.round(channel(parts[1], 255)), 0, 255),
      b: clamp(Math.round(channel(parts[2], 255)), 0, 255)
    }
  } else {
    color = hslToRgb({
      h: Number.parseFloat(parts[0]),
      s: clamp(Number.parseFloat(parts[1]), 0, 100),
      l: clamp(Number.parseFloat(parts[2]), 0, 100)
    })
  }
  if ([color.r, color.g, color.b].some((c) => !Number.isFinite(c))) return null
  if (a !== undefined && Number.isFinite(a)) color.a = round(a, 3)
  return color
}

/**
 * @param {{r: number, g: number, b: number}} color
 * @returns {string} Six lower-case hexadecimal digits, without "#": the form
 *   of `Paint.solidColor`
 */
export const toHex = ({ r, g, b }) =>
  [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('')

/**
 * @param {{r: number, g: number, b: number}} color
 * @returns {{h: number, s: number, v: number}} Hue in 0–360, saturation and
 *   value in 0–100
 */
export const rgbToHsv = ({ r, g, b }) => {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? (d / max) * 100 : 0, v: max * 100 }
}

/**
 * @param {{h: number, s: number, v: number}} hsv
 * @returns {{r: number, g: number, b: number}}
 */
export const hsvToRgb = ({ h, s, v }) => {
  const S = clamp(s, 0, 100) / 100
  const V = clamp(v, 0, 100) / 100
  const H = (((h % 360) + 360) % 360) / 60
  const c = V * S
  const x = c * (1 - Math.abs((H % 2) - 1))
  const m = V - c
  const [r, g, b] = H < 1
    ? [c, x, 0]
    : H < 2
      ? [x, c, 0]
      : H < 3
        ? [0, c, x]
        : H < 4
          ? [0, x, c]
          : H < 5 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/**
 * @param {{r: number, g: number, b: number}} color
 * @returns {{h: number, s: number, l: number}} Hue in 0–360, saturation and
 *   lightness in 0–100
 */
export const rgbToHsl = ({ r, g, b }) => {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const l = (max + min) / 2
  const d = max - min
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  const { h } = rgbToHsv({ r, g, b })
  return { h, s: s * 100, l: l * 100 }
}

/**
 * @param {{h: number, s: number, l: number}} hsl
 * @returns {{r: number, g: number, b: number}}
 */
export const hslToRgb = ({ h, s, l }) => {
  const S = clamp(s, 0, 100) / 100
  const L = clamp(l, 0, 100) / 100
  const v = L + S * Math.min(L, 1 - L)
  const sv = v ? 2 * (1 - L / v) : 0
  return hsvToRgb({ h, s: sv * 100, v: v * 100 })
}

/** Formats offered by the colour window. */
export const FORMATS = ['hex', 'rgb', 'hsl']

/**
 * The values a format shows of a colour.
 * @param {{r: number, g: number, b: number}} color
 * @param {"hex"|"rgb"|"hsl"} format
 * @returns {Array<string|number>} One value for hex ("F08A62"), three for
 *   rgb and hsl
 */
export const channelsOf = (color, format) => {
  switch (format) {
    case 'rgb':
      return [color.r, color.g, color.b].map((c) => Math.round(c))
    case 'hsl': {
      const { h, s, l } = rgbToHsl(color)
      return [Math.round(h) % 360, Math.round(s), Math.round(l)]
    }
    default:
      return [toHex(color).toUpperCase()]
  }
}

/**
 * The colour given by the fields of a format, or null when a field is not a
 * number in its range.
 * @param {Array<string|number>} values
 * @param {"hex"|"rgb"|"hsl"} format
 * @returns {{r: number, g: number, b: number, a?: number}|null}
 */
export const colorOfChannels = (values, format) => {
  if (format === 'hex') return parseColor(values[0])
  const n = values.map((v) => Number.parseFloat(v))
  if (n.length < 3 || n.slice(0, 3).some((v) => !Number.isFinite(v))) return null
  if (format === 'rgb') {
    return { r: clamp(Math.round(n[0]), 0, 255), g: clamp(Math.round(n[1]), 0, 255), b: clamp(Math.round(n[2]), 0, 255) }
  }
  return hslToRgb({ h: n[0], s: n[1], l: n[2] })
}

/**
 * Relative luminance (WCAG), to draw a mark that stays visible on a swatch.
 * @param {{r: number, g: number, b: number}} color
 * @returns {number} 0 for black, 1 for white
 */
export const luminance = ({ r, g, b }) => {
  const lin = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * A colour as CSS, for the swatches and the tracks of the window.
 * @param {{r: number, g: number, b: number}} color
 * @param {number} [alpha=1] 0–1
 * @returns {string}
 */
export const cssColor = ({ r, g, b }, alpha = 1) =>
  alpha >= 1 ? `#${toHex({ r, g, b })}` : `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)} / ${round(alpha * 100, 1)}%)`

/**
 * The track of the hue slider: the hues from 0 to 360°, left to right.
 * @returns {string} A CSS linear gradient
 */
export const hueTrack = () => {
  const stops = [0, 60, 120, 180, 240, 300, 360]
    .map((h) => `${cssColor(hsvToRgb({ h, s: 100, v: 100 }))} ${Math.round((h / 360) * 10000) / 100}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * The colours a document uses, most used first: in the fill, stroke,
 * stop-color, flood-color, lighting-color and color attributes, in style
 * attributes and in style sheets.
 * @param {Element} root The svg content
 * @param {number} [max=48]
 * @returns {string[]} Six lower-case hexadecimal digits each
 */
export const documentColors = (root, max = 48) => {
  const counts = new Map()
  const count = (value) => {
    const color = parseColor(value)
    if (!color || color.a === 0) return
    const hex = toHex(color)
    counts.set(hex, (counts.get(hex) ?? 0) + 1)
  }
  const ATTRS = ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']
  const DECL = /(?:^|[;{\s])(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*([^;}!]+)/gi
  const readDeclarations = (text) => {
    for (const match of String(text).matchAll(DECL)) count(match[1].trim())
  }
  for (const el of root?.querySelectorAll?.('*') ?? []) {
    // The editor's own elements are not the document.
    if (el.closest?.('[id^="selectorParent"], #canvasBackground')) continue
    if (el.localName === 'style') {
      readDeclarations(el.textContent)
      continue
    }
    for (const attr of ATTRS) {
      const value = el.getAttribute(attr)
      if (value) count(value)
    }
    const style = el.getAttribute('style')
    if (style) readDeclarations(style)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([hex]) => hex)
}
