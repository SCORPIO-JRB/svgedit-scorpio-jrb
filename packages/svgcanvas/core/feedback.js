/**
 * Visual feedback of the selection: text of the live dimension label,
 * cursors that follow the frame's angle and layout of the grips on small
 * frames. Pure functions, used by the selector manager.
 * @module feedback
 * @license MIT
 */

// Below this size on screen, a frame side is "small": its side grips are
// hidden and the corner grips move outward, so that a drag inside moves the
// element instead of resizing it.
export const SMALL_FRAME = 24

/**
 * Rounds a number for display: at most two decimals, no trailing zeros, no
 * negative zero.
 * @param {number} value
 * @param {number} [digits=2]
 * @returns {string}
 */
export const formatNumber = (value, digits = 2) => {
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

const withUnit = (text, unit) => (unit && unit !== 'px' ? `${text} ${unit}` : text)

/**
 * Label of a resize: width × height, in the document's unit.
 * @param {number} width - Already converted to the unit
 * @param {number} height
 * @param {string} [unit='px'] - Shown after the values unless it is px
 * @returns {string}
 */
export const formatSize = (width, height, unit = 'px') =>
  withUnit(`${formatNumber(width)} × ${formatNumber(height)}`, unit)

/**
 * Label of a distance or a spacing (lot V2), in the document's unit.
 * @param {number} value - Already converted to the unit
 * @param {string} [unit='px']
 * @returns {string}
 */
export const formatLength = (value, unit = 'px') => withUnit(formatNumber(value), unit)

/**
 * Label of a move: X and Y of the top left corner, in the document's unit.
 * @param {number} x - Already converted to the unit
 * @param {number} y
 * @param {string} [unit='px']
 * @returns {string}
 */
export const formatPosition = (x, y, unit = 'px') =>
  // An en space: SVG text collapses ordinary spaces.
  withUnit(`X ${formatNumber(x)}\u2002Y ${formatNumber(y)}`, unit)

/**
 * Label of a rotation: the angle in degrees, in (-180, 180], one decimal.
 * @param {number} angle
 * @returns {string}
 */
export const formatAngle = (angle) => {
  let a = angle % 360
  if (a > 180) { a -= 360 }
  if (a <= -180) { a += 360 }
  return `${formatNumber(a, 1)}°`
}

// ---------------------------------------------------------------------------
// Cursors.

// Direction of each resize grip on an unrotated frame, in screen degrees
// (clockwise, 0 pointing right).
export const GRIP_ANGLES = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }

// Direction of each rotation zone, outside a corner.
export const CORNER_ANGLES = { ne: 0, se: 90, sw: 180, nw: 270 }

const svgCursor = (body, angle, fallback) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    `<g transform="rotate(${angle} 12 12)">${body}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, ${fallback}`
}

// A horizontal double arrow, black with a white outline.
const RESIZE_ARROW = '<path d="M2.5 12 7 7.5V10.5H17V7.5L21.5 12 17 16.5V13.5H7V16.5Z" ' +
  'fill="#000" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>'

// A quarter arc with an arrow at each end, bulging towards the top right.
const ROTATE_ARROW = '<path d="M6 8A10 10 0 0 1 16 18" fill="none" stroke="#fff" stroke-width="4"/>' +
  '<path d="M6 8A10 10 0 0 1 16 18" fill="none" stroke="#000" stroke-width="1.6"/>' +
  '<path d="M2 8 6.5 4V12ZM16 22 12 17.5H20Z" fill="#000" stroke="#fff" stroke-width="1.2" ' +
  'stroke-linejoin="round" paint-order="stroke"/>'

const cursorCache = new Map()

const cached = (key, build) => {
  if (!cursorCache.has(key)) { cursorCache.set(key, build()) }
  return cursorCache.get(key)
}

/**
 * CSS cursor of a resize grip: a double arrow at the exact angle, rounded to
 * the degree, then a standard cursor if the browser cannot show it.
 * @param {number} angle - Screen degrees
 * @param {string} fallback - A standard cursor, such as `ne-resize`
 * @returns {string}
 */
export const resizeCursor = (angle, fallback) => {
  // A double arrow looks the same half a turn later.
  const a = ((Math.round(angle) % 180) + 180) % 180
  return cached(`resize:${a}:${fallback}`, () => svgCursor(RESIZE_ARROW, a, fallback))
}

/**
 * CSS cursor of a rotation zone: a curved double arrow facing the corner.
 * @param {number} angle - Screen degrees; 0 faces the top right
 * @param {string} fallback - Cursor list used if the browser cannot show it
 * @returns {string}
 */
export const rotateCursor = (angle, fallback) => {
  const a = ((Math.round(angle) % 360) + 360) % 360
  return cached(`rotate:${a}:${fallback}`, () => svgCursor(ROTATE_ARROW, a, fallback))
}

/**
 * Standard cursor names for the grips of a frame turned by `angle`: the
 * names turn by steps of 45 degrees.
 * @param {string[]} dirs - Grips in clockwise order from nw
 * @param {number} angle
 * @returns {Object<string, string>} Name of each grip's cursor, without `-resize`
 */
export const namedResizeCursors = (dirs, angle) => {
  const turned = [...dirs]
  let steps = Math.round(angle / 45) % 8
  if (steps < 0) { steps += 8 }
  while (steps > 0) {
    turned.push(turned.shift())
    steps--
  }
  return Object.fromEntries(dirs.map((dir, i) => [dir, turned[i]]))
}

// ---------------------------------------------------------------------------
// Grips of small frames.

/**
 * Where the grips go on a frame, in the frame's own axes: the resize hit
 * areas, which side grips are shown, and the rotation zones outside the
 * corners.
 *
 * On a side smaller than SMALL_FRAME, the side grips of that dimension are
 * hidden and the corner hit areas move outward, keeping only a thin strip
 * inside the frame: a drag inside then moves the element.
 * @param {Object<string, number[]>} coords - Grip positions, nw to w
 * @param {PlainObject} sizes
 * @param {number} sizes.grip - Visible grip side
 * @param {number} sizes.hit - Hit area side
 * @param {number} sizes.zone - Depth of a rotation zone beyond a hit area
 * @returns {{small: {width: boolean, height: boolean}, hidden: Set<string>,
 *   hits: Object<string, number[]>, zones: Object<string, number[]>}}
 *   Hit areas and zones as [x, y, width, height]
 */
export const gripLayout = (coords, { grip, hit, zone }) => {
  const [left, top] = coords.nw
  const [right, bottom] = coords.se
  const width = right - left
  const height = bottom - top
  const small = { width: width < SMALL_FRAME, height: height < SMALL_FRAME }
  const hidden = new Set()
  if (small.width) { hidden.add('e').add('w') }
  if (small.height) { hidden.add('n').add('s') }

  // Depth of a corner hit area inside the frame, per axis.
  const inside = (isSmall, size) => (isSmall ? Math.max(0, Math.min(grip / 2 - 1, size / 4)) : hit / 2)
  const inX = inside(small.width, width)
  const inY = inside(small.height, height)

  const hits = {}
  const zones = {}
  Object.entries(coords).forEach(([dir, [x, y]]) => {
    const sx = dir.includes('e') ? 1 : dir.includes('w') ? -1 : 0
    const sy = dir.includes('s') ? 1 : dir.includes('n') ? -1 : 0
    if (!sx || !sy) {
      hits[dir] = [x - hit / 2, y - hit / 2, hit, hit]
      return
    }
    // A corner: the hit area reaches `inX`, `inY` inside the frame.
    const hx = sx > 0 ? x - inX : x - (hit - inX)
    const hy = sy > 0 ? y - inY : y - (hit - inY)
    hits[dir] = [hx, hy, hit, hit]
    // The rotation zone starts at the corner and goes outward, beyond the
    // hit area, which is drawn above it.
    const zx = hit - inX + zone
    const zy = hit - inY + zone
    zones[dir] = [sx > 0 ? x : x - zx, sy > 0 ? y : y - zy, zx, zy]
  })
  return { small, hidden, hits, zones }
}
