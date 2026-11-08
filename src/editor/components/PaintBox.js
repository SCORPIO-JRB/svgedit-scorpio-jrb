import { jGraduate } from './jgraduate/jQuery.jGraduate.js'
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
    } else if (color.startsWith('#')) {
      opts.solidColor = color.substr(1)
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
  }

  /**
   * Paint of an element, as the box shows it.
   * @param {Element} elem
   * @returns {{color: string, opacity: number}|null|undefined} Undefined for
   *   an element without paint, null for a group whose children differ
   */
  paintOf (elem) {
    const { type } = this
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
          const p = childs[i].getAttribute(type)
          if (i === 0) {
            gPaint = p
          } else if (gPaint !== p) {
            return null
          }
        }
        return gPaint === null ? null : { color: gPaint, opacity: 100 }
      }
      default: {
        let opacity = Number.parseFloat(elem.getAttribute(type + '-opacity'))
        if (Number.isNaN(opacity)) {
          opacity = 1.0
        }
        const defColor = type === 'fill' ? 'black' : 'none'
        return { color: elem.getAttribute(type) || defColor, opacity: opacity * 100 }
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
    const painted = this.paintOf(selectedElement)
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
      const painted = this.paintOf(elem)
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
