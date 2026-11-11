import { jGraduate } from './jgraduate/jQuery.jGraduate.js'
import { parseColor, toHex } from '../color/color.js'

/**
 * A paint as the box shows it: a colour in six hexadecimal digits, `none` or
 * `url(#id)`, and its opacity in percent. The alpha a colour carries
 * (`rgba(255, 255, 255, .1)`, `#ff000080`, `transparent`) is part of the
 * opacity: an imported drawing writes its transparency so.
 * @param {string} value A fill or stroke value
 * @param {number} opacity In percent: the fill-opacity or stroke-opacity
 * @returns {{color: string, opacity: number}} An unknown value is given as
 *   written
 */
export const shownPaint = (value, opacity) => {
  const text = String(value).trim()
  const url = text.match(/^url\(\s*['"]?(#[^'")\s]+)['"]?\s*\)/i)
  if (url) return { color: `url(${url[1]})`, opacity }
  if (text === 'none') return { color: 'none', opacity }
  const parsed = parseColor(text)
  if (!parsed) return { color: text, opacity }
  return { color: `#${toHex(parsed)}`, opacity: Math.round(opacity * (parsed.a ?? 1) * 100) / 100 }
}

/**
 * The paint drawn, for a value the element does not write itself: inherited
 * from a group, or `currentColor`.
 * @param {Element} elem
 * @param {"fill"|"stroke"} type
 * @returns {{color: string|undefined, opacity: string|undefined}}
 */
const drawnPaint = (elem, type) => {
  const style = elem.ownerDocument?.defaultView?.getComputedStyle?.(elem)
  return { color: style?.[type] || undefined, opacity: style?.[`${type}Opacity`] || undefined }
}

/** Elements a group holds whose paint is that of their content. */
const GROUPS = new Set(['g', 'a', 'switch'])
/** Elements a group holds that are not drawn where they are. */
const UNDRAWN = new Set(['title', 'desc', 'metadata', 'defs', 'style', 'script', 'symbol', 'clipPath', 'mask',
  'marker', 'pattern', 'linearGradient', 'radialGradient', 'filter'])
/** Elements without fill or stroke of their own. */
const UNPAINTED = new Set(['use', 'image', 'foreignObject'])

const styleOf = (elem) => elem.ownerDocument?.defaultView?.getComputedStyle?.(elem)

/**
 * The shapes a group draws, its subgroups included: not its title, nor what
 * is hidden (an alarm marker waiting for its state), nor uses and images.
 * @param {Element} group
 * @returns {Element[]}
 */
const drawnShapes = (group) => {
  const shapes = []
  const walk = (parent) => {
    for (const child of parent.children) {
      const tag = child.localName
      if (UNDRAWN.has(tag) || child.getAttribute('display') === 'none' || styleOf(child)?.display === 'none') continue
      if (GROUPS.has(tag)) walk(child)
      else if (!UNPAINTED.has(tag) && styleOf(child)?.visibility !== 'hidden') shapes.push(child)
    }
  }
  walk(group)
  return shapes
}

/** A paint that draws nothing. */
const invisible = (painted) => painted.color === 'none' || painted.opacity === 0
/**
 *
 */
class PaintBox {
  /**
     * @param {string|Element|external:jQuery} container
     * @param {"fill"} type
     */
  constructor (container, type) {
    // set up gradients to be used for the buttons
    const mixedId = `mixedbox_${PaintBox.ctr}`
    const svgdocbox = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14">
          <rect
            fill="#000000" opacity="1" width="14" height="14"/>
          <defs><linearGradient id="gradbox_${PaintBox.ctr++}"/>
          <pattern id="${mixedId}" width="4" height="4" patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"><rect width="4" height="4" fill="#fff"/>
          <rect width="2" height="4" fill="#888"/></pattern></defs>
        </svg>`,
      'text/xml'
    )

    let docElem = svgdocbox.documentElement
    docElem = document.importNode(docElem, true)
    container.appendChild(docElem)

    this.rect = docElem.firstElementChild
    this.defs = docElem.getElementsByTagName('defs')[0]
    this.grad = this.defs.firstElementChild
    this.mixedFill = `url(#${mixedId})`
    this.mixed = false
    // this.paint = new $.jGraduate.Paint({solidColor: color});
    this.type = type
  }

  /**
     * @param {module:jGraduate~Paint} paint
     * @returns {void}
     */
  setPaint (paint) {
    this.paint = paint
    this.mixed = false

    const ptype = paint.type
    const opac = paint.alpha / 100

    let fillAttr = 'none'
    switch (ptype) {
      case 'solidColor':
        fillAttr = (paint[ptype] !== 'none') ? '#' + paint[ptype] : paint[ptype]
        break
      case 'linearGradient':
      case 'radialGradient': {
        this.grad.remove()
        this.grad = paint[ptype]
        this.defs.appendChild(this.grad)
        const id = this.grad.id = 'gradbox_' + this.type
        fillAttr = 'url(#' + id + ')'
        break
      }
    }

    this.rect.setAttribute('fill', fillAttr)
    this.rect.setAttribute('opacity', opac)
    this.onchange?.()
  }

  /**
   * @param {PlainObject} svgCanvas
  * @param {string} color
  * @param {Float} opac
  * @param {string} type
  * @returns {module:jGraduate~Paint}
  */
  static getPaint (svgCanvas, color, opac, type) {
    // update the editor's fill paint
    const opts = { alpha: opac }
    if (color.startsWith('url(#')) {
      let refElem = svgCanvas.getRefElem(color)
      refElem = (refElem) ? refElem.cloneNode(true) : document.querySelectorAll('#' + type + '_color defs *')[0]
      if (!refElem) {
        console.error(`the color ${color} is referenced by an url that can't be identified - using 'none'`)
        opts.solidColor = 'none'
      } else {
        opts[refElem.tagName] = refElem
      }
    } else if (color !== 'none') {
      // A named or functional colour (red, rgb(…), hsl(…)) is shown too,
      // its alpha with the opacity.
      const shown = shownPaint(color, opac)
      if (shown.color.startsWith('#')) {
        opts.solidColor = shown.color.slice(1)
        opts.alpha = shown.opacity
      }
    }
    return new jGraduate.Paint(opts)
  }

  /**
   * Shows stripes instead of a paint: the selected elements have
   * different paints. Choosing a paint then applies it to all of them.
   * @returns {void}
   */
  setMixed () {
    this.mixed = true
    this.rect.setAttribute('fill', this.mixedFill)
    this.rect.setAttribute('opacity', 1)
    this.onchange?.()
  }

  /**
   * Paint of an element, as the box shows it. A group shows the paint its
   * shapes share: those it draws, its title and hidden markers left out,
   * and a shape that draws nothing (a transparent zone for the click) too,
   * unless all are so.
   * @param {Element} elem
   * @param {object} [svgcanvas] - Reads a paint that a rule gives
   * @returns {{color: string, opacity: number}|null|undefined} Undefined for
   *   an element without paint, null for a group whose shapes differ
   */
  paintOf (elem, svgcanvas) {
    const { type } = this
    if (UNPAINTED.has(elem.tagName)) return undefined
    if (!GROUPS.has(elem.tagName)) return PaintBox.shapePaint(elem, type, svgcanvas)
    const shapes = drawnShapes(elem)
    if (!shapes.length) return undefined
    const same = (a, b) => a.color === b.color && a.opacity === b.opacity
    let common = null
    const unseen = []
    for (const shape of shapes) {
      // A line has no inside: its fill is not drawn.
      if (type === 'fill' && shape.tagName === 'line') continue
      const painted = PaintBox.shapePaint(shape, type, svgcanvas)
      const other = () => shape.tagName === 'line' || invisible(PaintBox.shapePaint(shape, type === 'fill' ? 'stroke' : 'fill', svgcanvas))
      if (invisible(painted) && other()) {
        unseen.push(painted)
      } else if (!common) {
        common = painted
      } else if (!same(common, painted)) {
        return null
      }
    }
    if (common) return common
    if (!unseen.length) return shownPaint('none', 100)
    return unseen.every((painted) => same(painted, unseen[0])) ? unseen[0] : null
  }

  /**
   * Paint of a shape: its own value (a rule, its style attribute, its
   * attribute), or the one it is drawn with: inherited from a group,
   * currentColor.
   * @param {Element} elem
   * @param {"fill"|"stroke"} type
   * @param {object} [svgcanvas] - Reads a paint that a rule gives
   * @returns {{color: string, opacity: number}}
   */
  static shapePaint (elem, type, svgcanvas) {
    // As drawn: a rule of the style sheets, or the style attribute, can give
    // the paint (lot S2)
    const styled = (name) => svgcanvas?.getStyledValue?.(elem, name)?.value ?? elem.getAttribute(name)
    let drawn
    let color = styled(type)
    if (color === null || /^(?:inherit|currentcolor)$/i.test(color.trim())) {
      drawn = drawnPaint(elem, type)
      color = drawn.color ?? (type === 'fill' ? 'black' : 'none')
    }
    let opacity = Number.parseFloat(styled(type + '-opacity'))
    if (Number.isNaN(opacity)) {
      opacity = Number.parseFloat((drawn ?? drawnPaint(elem, type)).opacity)
    }
    if (Number.isNaN(opacity)) {
      opacity = 1.0
    }
    return shownPaint(color, opacity * 100)
  }

  /**
     * @param {PlainObject} svgcanvas
     * @param {PlainObject} selectedElement
     * @returns {any}
     */
  update (svgcanvas, selectedElement) {
    if (!selectedElement) { return null }
    const painted = this.paintOf(selectedElement, svgcanvas)
    if (painted === undefined) {
      // Don't change the current value; the stripes of a multi-selection go.
      if (this.mixed && this.paint) this.setPaint(this.paint)
      return null
    }
    if (painted === null) {
      // The shapes of the group differ: stripes, as for a multi-selection.
      this._paintColor = null
      this.setMixed()
      return null
    }
    this._paintColor = painted.color
    this._paintOpacity = painted.opacity

    const paint = PaintBox.getPaint(svgcanvas, this._paintColor, this._paintOpacity, this.type)
    // update the rect inside #fill_color/#stroke_color
    this.setPaint(paint)
    return (paint)
  }

  /**
   * Shows the paint that elements share, or stripes when they differ.
   * Elements without paint (images, uses) are left out.
   * @param {PlainObject} svgcanvas
   * @param {Element[]} elements
   * @returns {module:jGraduate~Paint|null} The common paint
   */
  updateMany (svgcanvas, elements) {
    let common
    for (const elem of elements) {
      if (!elem) { continue }
      const painted = this.paintOf(elem, svgcanvas)
      if (painted === undefined) { continue }
      if (painted === null || (common &&
        (common.color !== painted.color || common.opacity !== painted.opacity))) {
        this.setMixed()
        return null
      }
      common = painted
    }
    if (!common) { return null }
    this._paintColor = common.color
    this._paintOpacity = common.opacity
    const paint = PaintBox.getPaint(svgcanvas, common.color, common.opacity, this.type)
    this.setPaint(paint)
    return paint
  }
}
PaintBox.ctr = 0

export default PaintBox
