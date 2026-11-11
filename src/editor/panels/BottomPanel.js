import SvgCanvas from '@svgedit/svgcanvas'
import { jGraduate } from '../components/jgraduate/jQuery.jGraduate.js'
import BottomPanelHtml from './BottomPanel.html'
import { commonValueOf, shapesOf, strokeWidthOf, styledAttribute } from './panelValues.js'

const { $id } = SvgCanvas

/*
 * register actions for left panel
 */
/**
 * @type {module}
 */
class BottomPanel {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
  }

  /**
   * @type {module}
   */
  get selectedElement () {
    return this.editor.selectedElement
  }

  /**
   * @type {module}
   */
  get multiselected () {
    return this.editor.multiselected
  }

  /**
   * @type {module}
   */
  changeStrokeWidth (e) {
    if (e.detail?.relative) {
      // A field showing "Mixed": each shape's own width changes.
      const { relative } = e.detail
      const shapes = shapesOf(this.editor.svgCanvas.getSelectedElements())
      this.editor.svgCanvas.changeSelectedAttributeEach('stroke-width', (elem) => {
        const current = Number(strokeWidthOf(this.editor.svgCanvas, elem))
        if (!Number.isFinite(current)) return undefined
        // A weight: the stroke inside or outside is drawn twice as wide.
        const doubled = (this.editor.svgCanvas.getStrokeAlign?.(elem) ?? 'center') !== 'center'
        return doubled ? relative(current) * 2 : relative(current)
      }, shapes)
      return
    }
    let val = e.target.value
    if (
      val === 0 &&
      this.editor.selectedElement &&
      ['line', 'polyline'].includes(this.editor.selectedElement.nodeName)
    ) {
      val = 1
    }
    this.editor.svgCanvas.setStrokeWidth(val)
  }

  /**
   * @type {module}
   */
  changeZoom (value) {
    switch (value) {
      case 'canvas':
      case 'selection':
      case 'layer':
      case 'content':
        this.editor.zoomChanged(window, value)
        break
      default: {
        const newZoom = Number(value) > 0.1 ? Number(value) * 0.01 : 0.1
        const zoom = this.editor.svgCanvas.getZoom()
        if (this.editor.svgCanvas.getMode() === 'pathedit') {
          // In pathedit mode, use zoomImage to update path points correctly.
          this.editor.zoomImage(newZoom / zoom)
        } else {
          const center = this.editor.view.center
          this.editor.zoomChanged(
            window,
            {
              width: 0,
              height: 0,
              x: center.x,
              y: center.y,
              zoom: newZoom
            },
            true
          )
        }
      }
    }
  }

  /**
   * @fires module:svgcanvas.SvgCanvas#event:ext_toolButtonStateUpdate
   * @returns {void}
   */
  updateToolButtonState () {
    const bNoFill = this.editor.svgCanvas.getColor('fill') === 'none'
    const bNoStroke = this.editor.svgCanvas.getColor('stroke') === 'none'
    // The rectangle and ellipse groups exist in the classic layout only;
    // the canvas layout has their tools in its Shapes menu (lot V3).
    const present = (ids) => ids.filter((id) => $id(id))
    const buttonsNeedingStroke = present(['tool_fhpath', 'tool_line'])
    const buttonsNeedingFillAndStroke = present($id('tools_rect')
      ? ['tools_rect', 'tools_ellipse', 'tool_text', 'tool_path']
      : ['tool_rect', 'tool_square', 'tool_fhrect', 'tool_ellipse', 'tool_circle', 'tool_fhellipse', 'tool_text', 'tool_path'])

    if (bNoStroke) {
      buttonsNeedingStroke.forEach(btn => {
        // if btn is pressed, change to select button
        if ($id(btn).pressed) {
          this.editor.leftPanel.clickSelect()
        }
        $id(btn).disabled = true
      })
    } else {
      buttonsNeedingStroke.forEach(btn => {
        $id(btn).disabled = false
      })
    }
    if (bNoStroke && bNoFill) {
      buttonsNeedingFillAndStroke.forEach(btn => {
        // if btn is pressed, change to select button
        if ($id(btn).pressed) {
          this.editor.leftPanel.clickSelect()
        }
        $id(btn).disabled = true
      })
    } else {
      buttonsNeedingFillAndStroke.forEach(btn => {
        $id(btn).disabled = false
      })
    }
    this.editor.svgCanvas.runExtensions(
      'toolButtonStateUpdate',
      /** @type {module:svgcanvas.SvgCanvas#event:ext_toolButtonStateUpdate} */ {
        nofill: bNoFill,
        nostroke: bNoStroke
      }
    )
  }

  /**
   * @type {module}
   */
  handleColorPicker (type, evt) {
    const { paint } = evt.detail
    this.editor.svgCanvas.setPaint(type, paint)
    this.updateToolButtonState()
  }

  /**
   * @type {module}
   */
  handleStrokeAttr (type, evt) {
    this.editor.svgCanvas.setStrokeAttr(type, evt.detail.value)
  }

  /**
   * @type {module}
   */
  handleOpacity (evt) {
    if (evt.detail?.relative) {
      // A field showing "Mixed": each element's own opacity changes, in percent.
      const { relative } = evt.detail
      this.editor.svgCanvas.changeSelectedAttributeEach('opacity', (elem) => {
        const current = Number.parseFloat(styledAttribute(this.editor.svgCanvas, elem, 'opacity') ?? 1)
        return Number.isFinite(current) ? relative(current * 100) / 100 : undefined
      })
      return
    }
    const val = Number.parseInt(evt.currentTarget.value.split('%')[0])
    this.editor.svgCanvas.setOpacity(val / 100)
  }

  /**
   * @type {module}
   */
  handlePalette (e) {
    e.preventDefault()
    // shift key or right click for stroke
    const { picker, color } = e.detail
    // Webkit-based browsers returned 'initial' here for no stroke
    const paint =
      color === 'none'
        ? new jGraduate.Paint()
        : new jGraduate.Paint({ alpha: 100, solidColor: color.substr(1) })
    if (picker === 'fill') {
      $id('fill_color').setPaint(paint)
    } else {
      $id('stroke_color').setPaint(paint)
    }
    this.editor.svgCanvas.setColor(picker, color)
    if (
      color !== 'none' &&
      this.editor.svgCanvas.getPaintOpacity(picker) !== 1
    ) {
      this.editor.svgCanvas.setPaintOpacity(picker, 1.0)
    }
    this.updateToolButtonState()
  }

  /**
   * @type {module}
   */
  init () {
    // register actions for Bottom panel
    const template = document.createElement('template')
    const { i18next } = this.editor

    template.innerHTML = BottomPanelHtml
    // Each control in its zone of the layout (lot V3).
    if (this.editor.layout) this.editor.layout.attach(template.content.cloneNode(true), 'bottom')
    else this.editor.$svgEditor.append(template.content.cloneNode(true))
    $id('palette').addEventListener('change', this.handlePalette.bind(this))
    $id('palette').init(i18next)
    const { curConfig } = this.editor.configObj
    $id('fill_color').setPaint(
      new jGraduate.Paint({ alpha: 100, solidColor: curConfig.initFill.color })
    )
    $id('stroke_color').setPaint(
      new jGraduate.Paint({
        alpha: 100,
        solidColor: curConfig.initStroke.color
      })
    )
    // The zoom field of the classic layout; the canvas layout has the zoom
    // menu of its view group instead.
    $id('zoom')?.addEventListener('change', e =>
      this.changeZoom.bind(this)(e.detail.value)
    )
    $id('stroke_color').addEventListener('change', evt =>
      this.handleColorPicker.bind(this)('stroke', evt)
    )
    $id('fill_color').addEventListener('change', evt =>
      this.handleColorPicker.bind(this)('fill', evt)
    )
    // While a colour is chosen in the window of the canvas layout: shown on
    // the drawing, outside the history, until it is applied.
    for (const type of ['fill', 'stroke']) {
      $id(`${type}_color`).addEventListener('input', (evt) => {
        if (evt.detail?.paint) this.editor.svgCanvas.previewPaint(type, evt.detail.paint)
      })
    }
    $id('stroke_width').addEventListener(
      'change',
      this.changeStrokeWidth.bind(this)
    )
    $id('stroke_style').addEventListener('change', evt =>
      this.handleStrokeAttr.bind(this)('stroke-dasharray', evt)
    )
    $id('stroke_linejoin').addEventListener('change', evt =>
      this.handleStrokeAttr.bind(this)('stroke-linejoin', evt)
    )
    $id('stroke_linecap').addEventListener('change', evt =>
      this.handleStrokeAttr.bind(this)('stroke-linecap', evt)
    )
    $id('opacity').addEventListener('change', this.handleOpacity.bind(this))
    $id('fill_color').init(i18next)
    $id('stroke_color').init(i18next)
  }

  /**
   * Shows the stroke, fill and opacity that the elements of a multi-selection
   * share, or "Mixed".
   * @param {Element[]} elements
   * @returns {void}
   */
  showCommonValues (elements) {
    const { svgCanvas } = this.editor
    const shapes = shapesOf(elements)
    const styled = (elem, name) => styledAttribute(svgCanvas, elem, name)
    const width = commonValueOf(shapes, (elem) => strokeWidthOf(svgCanvas, elem))
    if (width === undefined) {
      $id('stroke_width').mixed = true
    } else {
      $id('stroke_width').value = width
    }
    const dash = commonValueOf(shapes, (elem) => styled(elem, 'stroke-dasharray') || 'none')
    if (dash === undefined) {
      $id('stroke_style').mixed = true
    } else {
      $id('stroke_style').value = dash
    }
    const opacity = commonValueOf(elements, (elem) => styled(elem, 'opacity') ?? '1')
    if (opacity === undefined) {
      $id('opacity').mixed = true
    } else {
      $id('opacity').value = Number(opacity) * 100
    }
    $id('fill_color').updateMany(svgCanvas, elements)
    $id('stroke_color').updateMany(svgCanvas, elements)
  }

  /**
   * @type {module}
   */
  updateColorpickers (apply) {
    $id('fill_color').update(
      this.editor.svgCanvas,
      this.editor.selectedElement,
      apply
    )
    $id('stroke_color').update(
      this.editor.svgCanvas,
      this.editor.selectedElement,
      apply
    )
  }
}

export default BottomPanel
