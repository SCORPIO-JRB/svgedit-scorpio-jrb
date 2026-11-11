/**
 * Values shown by the fields of the panel for a selection.
 * @module panelValues
 * @license MIT
 */

/**
 * Value the elements share, or `undefined` when they differ: the field then
 * shows "Mixed". Numbers written differently ("2" and "2.0") are the same.
 * @param {Array<string|number|null>} values
 * @returns {string|number|null|undefined}
 */
export const commonValue = (values) => commonValueOf(values, (value) => value)

const isNumber = (value) => value !== null && value !== '' && Number.isFinite(Number(value))

/**
 * Value that items share, read from each one until two differ.
 * @param {Array<any>} items
 * @param {(item: any) => (string|number|null)} read
 * @returns {string|number|null|undefined} Undefined when they differ, or
 *   when there is no item
 */
export const commonValueOf = (items, read) => {
  if (!items.length) { return undefined }
  const first = read(items[0])
  const firstIsNumber = isNumber(first)
  for (let i = 1; i < items.length; i++) {
    const value = read(items[i])
    if (value !== first && !(firstIsNumber && isNumber(value) && Number(value) === Number(first))) {
      return undefined
    }
  }
  return first
}

/**
 * Rounds a value for a field: at most two decimals, no negative zero.
 * @param {number} value
 * @returns {number}
 */
export const roundForField = (value) => {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

// CSS absolute lengths, in user units
const LENGTHS = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 }

/**
 * A length as a field shows it: a number of user units, without its unit
 * ("5px" is 5, "0.5mm" is 1.89). A length a field cannot show so (a
 * percentage, em) is given as written.
 * @param {string|number|null} value
 * @returns {string|number|null}
 */
export const lengthOf = (value) => {
  if (value === null || value === undefined) return value
  const match = String(value).trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)([a-z]*)$/i)
  const factor = match && (match[2] ? LENGTHS[match[2].toLowerCase()] : 1)
  if (!factor) return value
  return match[2] ? String(roundForField(Number(match[1]) * factor)) : value
}

/**
 * The stroke width of a shape, as its field shows it: its own (a rule, its
 * style attribute, its attribute), or the one it is drawn with (inherited
 * from a group).
 * @param {object} svgCanvas
 * @param {Element} elem
 * @returns {string|number}
 */
export const strokeWidthOf = (svgCanvas, elem) => {
  const own = styledAttribute(svgCanvas, elem, 'stroke-width')
  // A stroke inside or outside its shape is drawn twice as wide: the field
  // gives its weight (lot Propriétés).
  if (own !== null && (svgCanvas?.getStrokeAlign?.(elem) ?? 'center') !== 'center') {
    const width = Number.parseFloat(lengthOf(own))
    if (Number.isFinite(width)) return String(roundForField(width / 2))
  }
  if (own !== null) return lengthOf(own)
  const drawn = elem.ownerDocument?.defaultView?.getComputedStyle?.(elem)?.strokeWidth
  return drawn ? lengthOf(drawn) : '1'
}

// Elements that carry a stroke and a fill of their own.
const SHAPES = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text'])

/**
 * Shapes of a selection, the shapes inside its groups included: the elements
 * whose stroke the stroke width field shows and changes.
 * @param {Element[]} elements
 * @returns {Element[]}
 */
export const shapesOf = (elements) => elements.flatMap((elem) => {
  if (!elem) { return [] }
  if (elem.tagName === 'g' || elem.tagName === 'a') {
    return [...elem.querySelectorAll('*')].filter((child) => SHAPES.has(child.tagName))
  }
  return SHAPES.has(elem.tagName) ? [elem] : []
})

/**
 * The value of a property of an element as it is drawn when a rule of the
 * style sheets or its `style` attribute gives it (lot S2), else its
 * attribute. A field showed the attribute, which these two override: on an
 * object styled by a class, the fill read black.
 * @param {object} svgCanvas
 * @param {Element} elem
 * @param {string} name - A property, in lower case
 * @returns {string|null}
 */
export const styledAttribute = (svgCanvas, elem, name) =>
  svgCanvas?.getStyledValue?.(elem, name)?.value ?? elem.getAttribute(name)
