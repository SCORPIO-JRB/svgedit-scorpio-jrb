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
   * Paint of an element, as the box shows it.
   * @param {Element} elem
   * @param {object} [svgcanvas] - Reads a paint that a rule gives
   * @returns {{color: string, opacity: number}|null|undefined} Undefined for
   *   an element without paint, null for a group whose children differ
   */
  paintOf (elem, svgcanvas) {
    const { type } = this
    // As drawn: a rule of the style sheets, or the style attribute, can give
    // the paint (lot S2)
    const styled = (el, name) => svgcanvas?.getStyledValue?.(el, name)?.value ?? el.getAttribute(name)
    switch (elem.tagName) {
      case 'use':
      case 'image':
      case 'foreignObject':
        // These elements don't have fill or stroke.
        return undefined
      case 'g':
      case 'a': {
        const childs = elem.getElementsByTagName('*')
        let gPaint = null
        for (let i = 0, len = childs.length; i < len; i++) {
          const p = styled(childs[i], type)
          if (i === 0) {
            gPaint = p
          } else if (gPaint !== p) {
            return null
          }
        }
        return gPaint === null ? null : shownPaint(gPaint, 100)
      }
      default: {
        // Its own value (a rule, its style attribute, its attribute), or the
        // one it is drawn with: inherited from a group, currentColor.
        let drawn
        let color = styled(elem, type)
        if (color === null || /^(?:inherit|currentcolor)$/i.test(color.trim())) {
          drawn = drawnPaint(elem, type)
          color = drawn.color ?? (type === 'fill' ? 'black' : 'none')
        }
        let opacity = Number.parseFloat(styled(elem, type + '-opacity'))
        if (Number.isNaN(opacity)) {
          opacity = Number.parseFloat((drawn ?? drawnPaint(elem, type)).opacity)
        }
        if (Number.isNaN(opacity)) {
          opacity = 1.0
        }
        return shownPaint(color, opacity * 100)
      }
    }
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
      // Don't change the current value
      return null
    }
    if (painted === null) {
      // No common color, don't update anything
      this._paintColor = null
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
