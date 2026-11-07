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
