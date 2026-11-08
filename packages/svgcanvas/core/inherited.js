/**
 * Properties an element takes from its groups by inheritance: the fill, the
 * stroke and the font. When an element leaves its groups (ungroup, group
 * across groups, copy), it must keep the look they gave it.
 * @module inherited
 * @license MIT
 */

/** Properties a group passes on to its children by inheritance. */
export const INHERITED_PROPERTIES = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-opacity', 'stroke-width', 'font-family', 'font-size', 'font-style',
  'font-weight', 'text-anchor', 'color', 'visibility'
]

/**
 * An element's own value of a presentation property: its style first, then
 * its attribute; null when it inherits the value.
 * @param {Element} elem
 * @param {string} prop
 * @returns {string|null}
 */
export const ownPresentationValue = (elem, prop) => {
  const style = elem.getAttribute('style') || ''
  for (const declaration of style.split(';')) {
    const i = declaration.indexOf(':')
    if (i > 0 && declaration.slice(0, i).trim().toLowerCase() === prop) {
      const value = declaration.slice(i + 1).trim()
      if (value && value !== 'inherit') { return value }
    }
  }
  const value = elem.getAttribute(prop)?.trim()
  return value && value !== 'inherit' ? value : null
}

/**
 * Values an element takes from its ancestors below `stop`, for the properties
 * it has no value of its own for, and the opacity of these ancestors, which
 * multiplies its own.
 * @param {Element} elem
 * @param {Element|null} stop - The ancestor that stays: its values and those
 *   above it still apply
 * @returns {{values: Object<string, string>, opacity: number}}
 */
export const inheritedFromAncestors = (elem, stop) => {
  const values = {}
  let opacity = 1
  const missing = new Set(INHERITED_PROPERTIES.filter((prop) => ownPresentationValue(elem, prop) === null))
  for (let node = elem.parentNode; node && node.nodeType === 1 && node !== stop; node = node.parentNode) {
    missing.forEach((prop) => {
      const value = ownPresentationValue(node, prop)
      if (value !== null) {
        values[prop] = value
        missing.delete(prop)
      }
    })
    const own = Number.parseFloat(ownPresentationValue(node, 'opacity') ?? '1')
    if (Number.isFinite(own)) { opacity *= own }
  }
  return { values, opacity }
}
