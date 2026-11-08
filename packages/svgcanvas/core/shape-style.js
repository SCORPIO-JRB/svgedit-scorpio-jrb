/**
 * The style a click on a shape alone copies into the current style, which
 * the shapes drawn next take.
 * @module shape-style
 * @license MIT
 */

/**
 * Keys of the current style, the attribute each one comes from, and the SVG
 * initial value of that attribute: an element without it is drawn with this
 * value. New shapes leave out every initial value but the fill's (see
 * cleanupElement).
 * @type {Array<[string, string, string|number]>}
 */
export const SHAPE_STYLE = [
  ['fill', 'fill', '#000000'],
  ['fill_opacity', 'fill-opacity', 1],
  ['stroke', 'stroke', 'none'],
  ['stroke_opacity', 'stroke-opacity', 1],
  ['stroke_width', 'stroke-width', 1],
  ['stroke_dasharray', 'stroke-dasharray', 'none'],
  ['stroke_linejoin', 'stroke-linejoin', 'miter'],
  ['stroke_linecap', 'stroke-linecap', 'butt']
]

/** Font of the current text style and the attribute each key comes from. */
const TEXT_STYLE = [['font_size', 'font-size'], ['font_family', 'font-family']]

/**
 * Copies the style of an element into the current style, as a click on the
 * element alone does. An attribute the element does not have gives its SVG
 * initial value, never null, which new shapes would write as "null". A font
 * attribute a text does not have leaves the current font as it is, because
 * its initial value depends on the browser.
 * @param {module:svgcanvas.SvgCanvas} svgCanvas
 * @param {Element} elem
 * @returns {void}
 */
export const copyShapeStyle = (svgCanvas, elem) => {
  if (elem.tagName === 'text') {
    TEXT_STYLE.forEach(([key, attr]) => {
      const value = elem.getAttribute(attr)
      if (value !== null) { svgCanvas.setCurText(key, value) }
    })
  }
  SHAPE_STYLE.forEach(([key, attr, initial]) => {
    svgCanvas.setCurProperties(key, elem.getAttribute(attr) ?? initial)
  })
}
