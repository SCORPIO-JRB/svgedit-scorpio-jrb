/**
 * @module elem-get-set get and set methods.
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import Paint from './paint.js'
import { NS } from './namespaces.js'
import {
  getVisibleElements, getStrokedBBoxDefaultVisible, findDefs,
  walkTree, getHref, setHref, getElement, getBBox
} from './utilities.js'
import {
  convertToNum
} from './units.js'
import { getParents } from '../common/util.js'
import { isSafeHref } from './sanitize.js'
import { warn } from '../common/logger.js'
import { ChangeElementCommand, InsertElementCommand } from './history.js'
import { getStrokeAlign } from './stroke-align.js'
import { getTextSource, getLineHeight, getTextWidth, getTextHeight, getTextVerticalAlign } from './text-lines.js'
import { readStyleRules, findStyleSource, getStyledValue } from './style-rules.js'

let svgCanvas = null

/**
* @function module:elem-get-set.init
* @param {module:elem-get-set.elemContext} elemContext
* @returns {void}
*/
export const init = (canvas) => {
  svgCanvas = canvas
  svgCanvas.getBold = getBoldMethod // Check whether selected element is bold or not.
  svgCanvas.setBold = setBoldMethod // Make the selected element bold or normal.
  svgCanvas.getItalic = getItalicMethod // Check whether selected element is in italics or not.
  svgCanvas.setItalic = setItalicMethod // Make the selected element italic or normal.
  svgCanvas.hasTextDecoration = hasTextDecorationMethod // Check whether the selected element has the given text decoration or not.
  svgCanvas.addTextDecoration = addTextDecorationMethod // Adds the given value to the text decoration
  svgCanvas.removeTextDecoration = removeTextDecorationMethod // Removes the given value from the text decoration
  svgCanvas.setTextAnchor = setTextAnchorMethod // Set the new text anchor.
  svgCanvas.getLineHeight = getLineHeightMethod // The line height of the selected text
  svgCanvas.setLineHeight = setLineHeightMethod // Sets the line height of the selected texts
  svgCanvas.getTextWidth = getTextWidthMethod // The fixed width of the selected text, or 0
  svgCanvas.setTextWidth = setTextWidthMethod // Sets or removes the fixed width of the selected texts
  svgCanvas.getTextHeight = getTextHeightMethod // The fixed height of a text, or 0
  svgCanvas.getTextVerticalAlign = getTextVerticalAlignMethod // Where the lines of a text go in its box
  svgCanvas.setTextVerticalAlign = setTextVerticalAlignMethod // Places the lines of the selected texts in their boxes
  svgCanvas.getTextResizing = getTextResizingMethod // How a text is sized: auto-width, auto-height, fixed
  svgCanvas.setTextResizing = setTextResizingMethod // Sizes the selected texts so
  svgCanvas.setTextBox = setTextBoxMethod // The width or the height of the box of the selected text
  svgCanvas.setLetterSpacing = setLetterSpacingMethod // Set the new letter spacing.
  svgCanvas.setWordSpacing = setWordSpacingMethod // Set the new word spacing.
  svgCanvas.setTextLength = setTextLengthMethod // Set the new text length.
  svgCanvas.setLengthAdjust = setLengthAdjustMethod // Set the new length adjust.
  svgCanvas.getFontFamily = getFontFamilyMethod // The current font family
  svgCanvas.setFontFamily = setFontFamilyMethod // Set the new font family.
  svgCanvas.setFontColor = setFontColorMethod // Set the new font color.
  svgCanvas.getFontColor = getFontColorMethod // The current font color
  svgCanvas.getFontSize = getFontSizeMethod // The current font size
  svgCanvas.setFontSize = setFontSizeMethod // Applies the given font size to the selected element.
  svgCanvas.getText = getTextMethod // current text (`textContent`) of the selected element
  svgCanvas.setTextContent = setTextContentMethod // Updates the text element with the given string.
  svgCanvas.setImageURL = setImageURLMethod // Sets the new image URL for the selected image element
  svgCanvas.setLinkURL = setLinkURLMethod // Sets the new link URL for the selected anchor element.
  svgCanvas.setRectRadius = setRectRadiusMethod // Sets the `rx` and `ry` values to the selected `rect` element
  svgCanvas.makeHyperlink = makeHyperlinkMethod // Wraps the selected element(s) in an anchor element or converts group to one.
  svgCanvas.removeHyperlink = removeHyperlinkMethod
  svgCanvas.setSegType = setSegTypeMethod // Sets the new segment type to the selected segment(s).
  svgCanvas.setStrokeWidth = setStrokeWidthMethod // Sets the stroke width for the current selected elements.
  svgCanvas.getResolution = getResolutionMethod // The current dimensions and zoom level in an object
  // Where the page starts: the origin of the viewBox of the opened file (lot V5)
  svgCanvas.getPageOrigin = () => svgCanvas.getDataStorage().get(svgCanvas.getSvgContent(), 'viewBoxOrigin') ?? { x: 0, y: 0 }
  svgCanvas.getTitle = getTitleMethod // the current group/SVG's title contents or `undefined` if no element
  svgCanvas.setGroupTitle = setGroupTitleMethod // Sets the group/SVG's title content.
  svgCanvas.setStrokeAttr = setStrokeAttrMethod // Set the given stroke-related attribute the given value for selected elements.
  svgCanvas.setBackground = setBackgroundMethod // Set the background of the editor (NOT the actual document).
  svgCanvas.setDocumentTitle = setDocumentTitleMethod // Adds/updates a title element for the document with the given name.
  svgCanvas.getEditorNS = getEditorNSMethod // Returns the editor's namespace URL, optionally adding it to the root element.
  svgCanvas.setResolution = setResolutionMethod // Changes the document's dimensions to the given size.
  svgCanvas.setBBoxZoom = setBBoxZoomMethod // Sets the zoom level on the canvas-side based on the given value.
  svgCanvas.setCurrentZoom = setZoomMethod // Sets the zoom to the given level.
  svgCanvas.setColor = setColorMethod // Change the current stroke/fill color/gradien
  svgCanvas.setGradient = setGradientMethod // Apply the current gradient to selected element's fill or stroke.
  svgCanvas.setPaint = setPaintMethod // Set a color/gradient to a fill/stroke.
  svgCanvas.previewPaint = previewPaintMethod // Show a paint on the selection, outside the history.
  svgCanvas.cancelPaintPreview = cancelPaintPreviewMethod // Give back the paint a preview replaced.
  svgCanvas.setPaintVisible = setPaintVisibleMethod // Hide or show the fill or the stroke (the eye of the inspector).
  svgCanvas.isPaintHidden = isPaintHidden
}

/**
* @function module:elem-get-set.SvgCanvas#getResolution
* @returns {DimensionsAndZoom} The current dimensions and zoom level in an object
*/
const getResolutionMethod = () => {
  const zoom = svgCanvas.getZoom()
  const w = svgCanvas.getSvgContent().getAttribute('width') / zoom
  const h = svgCanvas.getSvgContent().getAttribute('height') / zoom

  return {
    w,
    h,
    zoom
  }
}

/**
* @function module:elem-get-set.SvgCanvas#getTitle
* @param {Element} [elem]
* @returns {string|void} the current group/SVG's title contents or
* `undefined` if no element is passed nd there are no selected elements.
*/
const getTitleMethod = (elem) => {
  const selectedElements = svgCanvas.getSelectedElements()
  const dataStorage = svgCanvas.getDataStorage()
  elem = elem || selectedElements[0]
  if (!elem) { return undefined }
  if (dataStorage.has(elem, 'gsvg')) {
    elem = dataStorage.get(elem, 'gsvg')
  } else if (dataStorage.has(elem, 'symbol')) {
    elem = dataStorage.get(elem, 'symbol')
  }
  const childs = elem.childNodes
  for (const child of childs) {
    if (child.nodeName === 'title') {
      return child.textContent
    }
  }
  return ''
}

/**
* Sets the group/SVG's title content.
* @function module:elem-get-set.SvgCanvas#setGroupTitle
* @param {string} val
* @todo Combine this with `setDocumentTitle`
* @returns {void}
*/
const setGroupTitleMethod = (val) => {
  const {
    InsertElementCommand, RemoveElementCommand,
    ChangeElementCommand, BatchCommand
  } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  const dataStorage = svgCanvas.getDataStorage()
  let elem = selectedElements[0]
  if (!elem) { return }
  if (dataStorage.has(elem, 'gsvg')) {
    elem = dataStorage.get(elem, 'gsvg')
  } else if (dataStorage.has(elem, 'symbol')) {
    elem = dataStorage.get(elem, 'symbol')
  }
  if (!elem) { return }

  const batchCmd = new BatchCommand('Set Label')

  let title = null
  for (const child of elem.childNodes) {
    if (child.nodeName === 'title') {
      title = child
      break
    }
  }

  if (val.length === 0) {
    if (!title) { return }
    // Remove title element
    const { nextSibling } = title
    title.remove()
    batchCmd.addSubCommand(new RemoveElementCommand(title, nextSibling, elem))
  } else if (title) {
    // Change title contents
    const oldText = title.textContent
    if (oldText === val) { return }
    title.textContent = val
    batchCmd.addSubCommand(new ChangeElementCommand(title, { '#text': oldText }))
  } else {
    // Add title element
    title = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'title')
    title.textContent = val
    elem.insertBefore(title, elem.firstChild)
    batchCmd.addSubCommand(new InsertElementCommand(title))
  }

  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
  }
}

/**
* Adds/updates a title element for the document with the given name.
* This is an undoable action.
* @function module:elem-get-set.SvgCanvas#setDocumentTitle
* @param {string} newTitle - String with the new title
* @returns {void}
*/
const setDocumentTitleMethod = (newTitle) => {
  const {
    InsertElementCommand, RemoveElementCommand,
    ChangeElementCommand, BatchCommand
  } = svgCanvas.history
  const svgContent = svgCanvas.getSvgContent()

  const batchCmd = new BatchCommand('Change Image Title')

  /** @type {Element|null} */
  let docTitle = null
  for (const child of svgContent.childNodes) {
    if (child.nodeName === 'title') {
      docTitle = child
      break
    }
  }

  if (!docTitle) {
    if (!newTitle.length) { return }
    docTitle = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'title')
    docTitle.textContent = newTitle
    svgContent.insertBefore(docTitle, svgContent.firstChild)
    batchCmd.addSubCommand(new InsertElementCommand(docTitle))
  } else if (newTitle.length) {
    const oldTitle = docTitle.textContent
    if (oldTitle === newTitle) { return }
    docTitle.textContent = newTitle
    batchCmd.addSubCommand(new ChangeElementCommand(docTitle, { '#text': oldTitle }))
  } else {
    // No title given, so element is not necessary
    const { nextSibling } = docTitle
    docTitle.remove()
    batchCmd.addSubCommand(new RemoveElementCommand(docTitle, nextSibling, svgContent))
  }

  if (!batchCmd.isEmpty()) {
    svgCanvas.addCommandToHistory(batchCmd)
  }
}

/**
* Changes the document's dimensions to the given size.
* @function module:elem-get-set.SvgCanvas#setResolution
* @param {Float|"fit"} x - Number with the width of the new dimensions in user units.
* Can also be the string "fit" to indicate "fit to content".
* @param {Float} y - Number with the height of the new dimensions in user units.
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {boolean} Indicates if resolution change was successful.
* It will fail on "fit to content" option with no content to fit to.
*/
const setResolutionMethod = (x, y) => {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const res = svgCanvas.getResolution()
  const { w, h } = res
  let batchCmd

  if (x === 'fit') {
    // Get bounding box
    const bbox = getStrokedBBoxDefaultVisible()

    if (bbox) {
      batchCmd = new BatchCommand('Fit Canvas to Content')
      const visEls = getVisibleElements()
      svgCanvas.addToSelection(visEls)
      const dx = []; const dy = []
      visEls.forEach((_item, _i) => {
        dx.push(bbox.x * -1)
        dy.push(bbox.y * -1)
      })

      const cmd = svgCanvas.moveSelectedElements(dx, dy, false)
      if (cmd) {
        batchCmd.addSubCommand(cmd)
      }
      svgCanvas.clearSelection()

      x = Math.round(bbox.width)
      y = Math.round(bbox.height)
      // The content now starts at 0, 0: so does the page.
      svgCanvas.getDataStorage().remove(svgCanvas.getSvgContent(), 'viewBoxOrigin')
    } else {
      return false
    }
  }
  const newW = convertToNum('width', x)
  const newH = convertToNum('height', y)
  if (newW !== w || newH !== h) {
    if (!batchCmd) {
      batchCmd = new BatchCommand('Change Image Dimensions')
    }
    const svgContent = svgCanvas.getSvgContent()
    const oldViewBox = svgContent.getAttribute('viewBox')

    svgContent.setAttribute('width', newW)
    svgContent.setAttribute('height', newH)

    svgCanvas.contentW = newW
    svgCanvas.contentH = newH
    svgContent.setAttribute('viewBox', [0, 0, newW, newH].join(' '))
    batchCmd.addSubCommand(new ChangeElementCommand(svgContent, { width: w, height: h, viewBox: oldViewBox }))

    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [svgContent])
  }
  return true
}

/**
* Returns the editor's namespace URL, optionally adding it to the root element.
* @function module:elem-get-set.SvgCanvas#getEditorNS
* @param {boolean} [add] - Indicates whether or not to add the namespace value
* @returns {string} The editor's namespace URL
*/
const getEditorNSMethod = (add) => {
  if (add) {
    svgCanvas.getSvgContent().setAttribute('xmlns:se', NS.SE)
  }
  return NS.SE
}

/**
 * @typedef {PlainObject} module:elem-get-set.ZoomAndBBox
 * @property {Float} zoom
 * @property {module:utilities.BBoxObject} bbox
 */
/**
* Sets the zoom level on the canvas-side based on the given value.
* @function module:elem-get-set.SvgCanvas#setBBoxZoom
* @param {"selection"|"canvas"|"content"|"layer"|module:SVGEditor.BBoxObjectWithFactor} val - Bounding box object to zoom to or string indicating zoom option. Note: the object value type is defined in `svg-editor.js`
* @param {Integer} editorW - The editor's workarea box's width
* @param {Integer} editorH - The editor's workarea box's height
* @returns {module:elem-get-set.ZoomAndBBox|void}
*/
const setBBoxZoomMethod = (val, editorW, editorH) => {
  const zoom = svgCanvas.getZoom()
  const selectedElements = svgCanvas.getSelectedElements()
  let spacer = 0.85
  let bb
  const calcZoom = (bb) => {
    if (!bb) { return undefined }
    if (!Number.isFinite(editorW) || !Number.isFinite(editorH) || editorW <= 0 || editorH <= 0) {
      return undefined
    }
    if (!Number.isFinite(bb.width) || !Number.isFinite(bb.height) || bb.width <= 0 || bb.height <= 0) {
      return undefined
    }
    const wZoom = Math.round((editorW / bb.width) * 100 * spacer) / 100
    const hZoom = Math.round((editorH / bb.height) * 100 * spacer) / 100
    const zoom = Math.min(wZoom, hZoom)
    if (!Number.isFinite(zoom) || zoom <= 0) {
      return undefined
    }
    svgCanvas.setZoom(zoom)
    return { zoom, bbox: bb }
  }

  if (val && typeof val === 'object') {
    bb = val
    if (bb.width === 0 || bb.height === 0) {
      let newzoom = zoom
      if (Number.isFinite(bb.zoom) && bb.zoom > 0) {
        newzoom = bb.zoom
      } else if (Number.isFinite(bb.factor) && bb.factor > 0) {
        newzoom = zoom * bb.factor
      }
      if (Number.isFinite(newzoom) && newzoom > 0) {
        svgCanvas.setZoom(newzoom)
      }
      return { zoom: newzoom, bbox: bb }
    }
    return calcZoom(bb)
  }

  switch (val) {
    case 'selection': {
      if (!selectedElements[0]) { return undefined }
      const selectedElems = selectedElements.filter(Boolean)
      bb = getStrokedBBoxDefaultVisible(selectedElems)
      break
    } case 'canvas': {
      const res = svgCanvas.getResolution()
      const origin = svgCanvas.getPageOrigin()
      spacer = 0.95
      bb = { width: res.w, height: res.h, x: origin.x, y: origin.y }
      break
    } case 'content':
      bb = getStrokedBBoxDefaultVisible()
      break
    case 'layer':
      bb = getStrokedBBoxDefaultVisible(getVisibleElements(svgCanvas.getCurrentDrawing().getCurrentLayer()))
      break
    default:
      return undefined
  }
  return calcZoom(bb)
}

/**
* Sets the zoom to the given level.
* @function module:elem-get-set.SvgCanvas#setZoom
* @param {Float} zoomLevel - Float indicating the zoom level to change to
* @fires module:elem-get-set.SvgCanvas#event:ext_zoomChanged
* @returns {void}
*/
const setZoomMethod = (zoomLevel) => {
  if (!Number.isFinite(zoomLevel) || zoomLevel <= 0) {
    return
  }
  const selectedElements = svgCanvas.getSelectedElements()
  const res = svgCanvas.getResolution()
  const w = res.w / zoomLevel
  const h = res.h / zoomLevel
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return
  }
  svgCanvas.getSvgContent().setAttribute('viewBox', `0 0 ${w} ${h}`)
  svgCanvas.setZoom(zoomLevel)
  selectedElements.forEach((elem) => {
    if (!elem) { return }
    const selector = svgCanvas.selectorManager.requestSelector(elem)
    selector && selector.resize()
  })
  svgCanvas.pathActions.zoomChange()
  svgCanvas.runExtensions('zoomChanged', zoomLevel)
}

/**
* Whether a selected element takes a paint of this type. A line has no
* inside, and a connector, whatever element draws it, is a line between two
* objects: neither takes a fill. A filled polyline, as the rooms of an
* imported plan, does: it used to keep its colour while the opacity chosen
* went on it, which made a transparent colour twice as transparent.
* @param {Element} elem
* @param {"fill"|"stroke"} type
* @returns {boolean}
*/
const takesPaint = (elem, type) => type !== 'fill' ||
  (elem.tagName !== 'line' && !(elem.getAttributeNS(NS.SE, 'connector') ?? elem.getAttribute('se:connector')))

/**
* Change the current stroke/fill color/gradient value.
* @function module:elem-get-set.SvgCanvas#setColor
* @param {string} type - String indicating fill or stroke
* @param {string} val - The value to set the stroke attribute to
* @param {boolean} preventUndo - Boolean indicating whether or not svgCanvas should be an undoable option
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {void}
*/
const setColorMethod = (type, val, preventUndo) => {
  const selectedElements = svgCanvas.getSelectedElements()
  svgCanvas.setCurShape(type, val)
  svgCanvas.setCurProperties(`${type}_paint`, { type: 'solidColor' })
  const elems = []
  /**
*
* @param {Element} e
* @returns {void}
*/
  const addNonG = (e) => {
    if (e.nodeName !== 'g') {
      elems.push(e)
    }
  }
  let i = selectedElements.length
  while (i--) {
    const elem = selectedElements[i]
    if (elem) {
      if (elem.tagName === 'g') {
        walkTree(elem, addNonG)
      } else if (takesPaint(elem, type)) {
        elems.push(elem)
      }
    }
  }
  if (elems.length > 0) {
    if (!preventUndo) {
      svgCanvas.changeSelectedAttribute(type, val, elems)
      svgCanvas.call('changed', elems)
    } else {
      svgCanvas.changeSelectedAttributeNoUndo(type, val, elems)
    }
  }
}

/**
* Apply the current gradient to selected element's fill or stroke.
* @function module:elem-get-set.SvgCanvas#setGradient
* @param {"fill"|"stroke"} type - String indicating "fill" or "stroke" to apply to an element
* @returns {void}
*/
const setGradientMethod = (type) => {
  const found = gradientOfPaint(type)
  if (found) svgCanvas.setColor(type, `url(#${found.grad.id})`)
}

/**
* The gradient of the current paint in the defs: an equal one already there,
* or a copy appended with a new id.
* @param {"fill"|"stroke"} type
* @returns {{grad: Element, inserted: boolean}|null} null when the current
*   paint is not a gradient
*/
const gradientOfPaint = (type) => {
  if (!svgCanvas.getCurProperties(`${type}_paint`) ||
    svgCanvas.getCurProperties(`${type}_paint`).type === 'solidColor') { return null }
  const canvas = svgCanvas
  let grad = canvas[type + 'Grad']
  if (!grad) { return null }
  // find out if there is a duplicate gradient already in the defs
  const duplicateGrad = findDuplicateGradient(grad)
  const defs = findDefs()
  // no duplicate found, so import gradient into defs
  if (!duplicateGrad) {
    grad = svgCanvas.getDOMDocument().importNode(grad, true)
    defs.append(grad)
    // get next id and set it on the grad
    grad.id = svgCanvas.getNextId()
    return { grad, inserted: true }
  }
  return { grad: duplicateGrad, inserted: false }
}

/**
* Check if exact gradient already exists.
* @function module:svgcanvas~findDuplicateGradient
* @param {SVGGradientElement} grad - The gradient DOM element to compare to others
* @returns {SVGGradientElement} The existing gradient if found, `null` if not
*/
const findDuplicateGradient = (grad) => {
  if (!grad) {
    return null
  }
  if (!['linearGradient', 'radialGradient'].includes(grad.tagName)) {
    return null
  }
  const defs = findDefs()
  const existingGrads = defs.querySelectorAll('linearGradient, radialGradient')
  let i = existingGrads.length
  const radAttrs = ['r', 'cx', 'cy', 'fx', 'fy']
  while (i--) {
    const og = existingGrads[i]
    if (og.tagName !== grad.tagName) {
      continue
    }
    if (grad.tagName === 'linearGradient') {
      if (grad.getAttribute('x1') !== og.getAttribute('x1') ||
        grad.getAttribute('y1') !== og.getAttribute('y1') ||
        grad.getAttribute('x2') !== og.getAttribute('x2') ||
        grad.getAttribute('y2') !== og.getAttribute('y2')
      ) {
        continue
      }
    } else {
      const gradAttrs = {
        r: Number(grad.getAttribute('r')),
        cx: Number(grad.getAttribute('cx')),
        cy: Number(grad.getAttribute('cy')),
        fx: Number(grad.getAttribute('fx')),
        fy: Number(grad.getAttribute('fy'))
      }
      const ogAttrs = {
        r: Number(og.getAttribute('r')),
        cx: Number(og.getAttribute('cx')),
        cy: Number(og.getAttribute('cy')),
        fx: Number(og.getAttribute('fx')),
        fy: Number(og.getAttribute('fy'))
      }

      let diff = false
      radAttrs.forEach((attr) => {
        if (gradAttrs[attr] !== ogAttrs[attr]) { diff = true }
      })

      if (diff) { continue }
    }

    // else could be a duplicate, iterate through stops
    const stops = grad.getElementsByTagNameNS(NS.SVG, 'stop')
    const ostops = og.getElementsByTagNameNS(NS.SVG, 'stop')

    if (stops.length !== ostops.length) {
      continue
    }

    let j = stops.length
    while (j--) {
      const stop = stops[j]
      const ostop = ostops[j]

      if (stop.getAttribute('offset') !== ostop.getAttribute('offset') ||
        stop.getAttribute('stop-opacity') !== ostop.getAttribute('stop-opacity') ||
        stop.getAttribute('stop-color') !== ostop.getAttribute('stop-color')) {
        break
      }
    }

    if (j === -1) {
      return og
    }
  } // for each gradient in defs

  return null
}

/**
* Set a color/gradient to a fill/stroke, as one undo step: its opacity, its
* colour and the gradient it adds to the defs are undone together.
* @function module:elem-get-set.SvgCanvas#setPaint
* @param {"fill"|"stroke"} type - String with "fill" or "stroke"
* @param {} paint - The paint object to apply
* @returns {void}
*/
const setPaintMethod = (type, paint) => {
  // A preview gives the elements back first: the step records their paint.
  cancelPaintPreviewMethod()
  // make a copy
  const p = new Paint(paint)
  svgCanvas.groupHistory(`Change ${type}`, (batch) => {
    svgCanvas.setPaintOpacity(type, p.alpha / 100)

    // now set the current paint object
    svgCanvas.setCurProperties(`${type}_paint`, p)
    // A paint hidden by the eye of the inspector shows again with the new one.
    const hidden = hiddenPaintAttr(type)
    for (const elem of paintTargets(type).colored) {
      if (!elem.hasAttribute(hidden)) continue
      batch.addSubCommand(new ChangeElementCommand(elem, { [hidden]: elem.getAttribute(hidden) }))
      elem.removeAttribute(hidden)
    }
    switch (p.type) {
      case 'solidColor':
        svgCanvas.setColor(type, p.solidColor !== 'none' ? `#${p.solidColor}` : 'none')
        break
      case 'linearGradient':
      case 'radialGradient': {
        svgCanvas.setCanvas(type + 'Grad', p[p.type])
        const found = gradientOfPaint(type)
        if (!found) break
        if (found.inserted) batch.addSubCommand(new InsertElementCommand(found.grad))
        svgCanvas.setColor(type, `url(#${found.grad.id})`)
        break
      }
    }
  })
}

/**
* The elements a paint changes: its opacity goes on the selected elements,
* its colour on the shapes, those of a group included (as setColor does).
* @param {"fill"|"stroke"} type
* @returns {{selected: Element[], colored: Element[]}}
*/
const paintTargets = (type) => {
  const selected = svgCanvas.getSelectedElements().filter(Boolean)
  const colored = []
  for (let i = selected.length - 1; i >= 0; i--) {
    const elem = selected[i]
    if (elem.tagName === 'g') {
      walkTree(elem, (e) => { if (e.nodeName !== 'g') colored.push(e) })
    } else if (takesPaint(elem, type)) {
      colored.push(elem)
    }
  }
  return { selected, colored }
}

/**
* The attribute where a hidden fill or stroke waits (lot Propriétés).
* @param {"fill"|"stroke"} type
* @returns {string}
*/
export const hiddenPaintAttr = (type) => `data-se-${type}-hidden`

/**
* @param {Element} elem
* @param {"fill"|"stroke"} type
* @returns {boolean} Whether the eye of the inspector hid this paint
*/
export const isPaintHidden = (elem, type) => Boolean(elem?.hasAttribute?.(hiddenPaintAttr(type)))

/**
* Hides or shows the fill or the stroke of the selected shapes, as the eye of
* the inspector does (lot Propriétés): a hidden paint is `none`, and the paint
* it had waits in `data-se-fill-hidden` or `data-se-stroke-hidden`, in the
* file too. One undo step. A shape without this paint is left as it is.
* @function module:elem-get-set.SvgCanvas#setPaintVisible
* @param {"fill"|"stroke"} type
* @param {boolean} visible
* @returns {BatchCommand|null}
*/
const setPaintVisibleMethod = (type, visible) => {
  cancelPaintPreviewMethod()
  const attr = hiddenPaintAttr(type)
  const rules = readStyleRules(svgCanvas.getSvgContent())
  const paintOf = (elem) => getStyledValue(elem, type, rules)?.value ?? elem.getAttribute(type)
  const { colored } = paintTargets(type)
  const targets = colored.filter((elem) => visible
    ? elem.hasAttribute(attr)
    : !elem.hasAttribute(attr) && (paintOf(elem) ?? (type === 'fill' ? 'black' : 'none')).trim() !== 'none')
  if (!targets.length) return null
  const batch = svgCanvas.groupHistory(`${visible ? 'Show' : 'Hide'} ${type}`, (step) => {
    for (const elem of targets) {
      const old = { [attr]: elem.getAttribute(attr), [type]: elem.getAttribute(type), style: elem.getAttribute('style') }
      if (visible) {
        const value = elem.getAttribute(attr)
        elem.removeAttribute(attr)
        svgCanvas.changeSelectedAttributeNoUndo(type, value || (type === 'fill' ? 'black' : 'none'), [elem])
      } else {
        elem.setAttribute(attr, paintOf(elem) ?? 'black')
        svgCanvas.changeSelectedAttributeNoUndo(type, 'none', [elem])
      }
      const changed = Object.keys(old).filter((name) => elem.getAttribute(name) !== old[name])
      step.addSubCommand(new ChangeElementCommand(elem, Object.fromEntries(changed.map((name) => [name, old[name]]))))
    }
  })
  svgCanvas.call('changed', targets)
  return batch.isEmpty() ? null : batch
}

/** The paint a preview replaced, to give it back. */
let preview = null

/**
* Shows a paint on the selected elements while it is being chosen (a drag in
* the colour window), outside the history. setPaint, or cancelPaintPreview,
* gives the elements back their paint first.
* @function module:elem-get-set.SvgCanvas#previewPaint
* @param {"fill"|"stroke"} type
* @param {} paint
* @returns {void}
*/
const previewPaintMethod = (type, paint) => {
  const p = new Paint(paint)
  if (preview && preview.type !== type) cancelPaintPreviewMethod()
  if (!preview) {
    const { selected, colored } = paintTargets(type)
    const opacity = `${type}-opacity`
    // An element whose paint a rule or its style attribute gives shows the
    // preview by its style attribute, which wins over both (lot S2).
    const rules = readStyleRules(svgCanvas.getSvgContent())
    const styledBy = (name) => (elem) => Boolean(findStyleSource(elem, name, rules))
    const styled = {
      opacity: selected.filter(styledBy(opacity)),
      paint: colored.filter(styledBy(type))
    }
    preview = {
      type,
      selected,
      colored,
      styled,
      saved: [
        ...selected.map((elem) => ({ elem, name: opacity, value: elem.getAttribute(opacity) })),
        ...colored.map((elem) => ({ elem, name: type, value: elem.getAttribute(type) })),
        ...[...new Set([...styled.opacity, ...styled.paint])].map((elem) => ({ elem, name: 'style', value: elem.getAttribute('style') }))
      ],
      grad: null,
      defs: svgCanvas.getSvgContent().getElementsByTagNameNS(NS.SVG, 'defs')[0] ?? null
    }
  }
  for (const elem of preview.selected) elem.setAttribute(`${type}-opacity`, String(p.alpha / 100))
  for (const elem of preview.styled.opacity) elem.style.setProperty(`${type}-opacity`, String(p.alpha / 100), 'important')
  let value = 'none'
  if (p.type === 'solidColor' && p.solidColor && p.solidColor !== 'none') {
    value = `#${p.solidColor}`
  } else if ((p.type === 'linearGradient' || p.type === 'radialGradient') && p[p.type]) {
    const grad = svgCanvas.getDOMDocument().importNode(p[p.type], true)
    grad.id = `se_paint_preview_${type}`
    preview.grad?.remove()
    findDefs().append(grad)
    preview.grad = grad
    value = `url(#${grad.id})`
  }
  for (const elem of preview.colored) elem.setAttribute(type, value)
  for (const elem of preview.styled.paint) elem.style.setProperty(type, value, 'important')
}

/**
* Gives back the paint a preview replaced.
* @function module:elem-get-set.SvgCanvas#cancelPaintPreview
* @returns {boolean} Whether a preview was shown
*/
const cancelPaintPreviewMethod = () => {
  if (!preview) return false
  for (const { elem, name, value } of preview.saved) {
    if (value === null) elem.removeAttribute(name)
    else elem.setAttribute(name, value)
  }
  if (preview.grad) {
    const defs = preview.grad.parentNode
    preview.grad.remove()
    // The defs a gradient preview made go with it.
    if (!preview.defs && defs && !defs.firstElementChild) defs.remove()
  }
  preview = null
  return true
}

/**
* Sets the stroke width for the current selected elements.
* When attempting to set a line's width to 0, this changes it to 1 instead.
* @function module:elem-get-set.SvgCanvas#setStrokeWidth
* @param {Float} val - A Float indicating the new stroke width value
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {void}
*/
const setStrokeWidthMethod = (val) => {
  const selectedElements = svgCanvas.getSelectedElements()
  if (val === 0 && ['line', 'path'].includes(svgCanvas.getMode())) {
    svgCanvas.setStrokeWidth(1)
    return
  }
  svgCanvas.setCurProperties('stroke_width', val)

  const elems = []
  /**
*
* @param {Element} e
* @returns {void}
*/
  const addNonG = (e) => {
    if (e.nodeName !== 'g') {
      elems.push(e)
    }
  }
  let i = selectedElements.length
  while (i--) {
    const elem = selectedElements[i]
    if (elem) {
      if (elem.tagName === 'g') {
        walkTree(elem, addNonG)
      } else {
        elems.push(elem)
      }
    }
  }
  if (elems.length > 0) {
    // A stroke inside or outside its shape is drawn twice as wide (lot
    // Propriétés): the value is its weight.
    if (elems.some((elem) => getStrokeAlign(elem) !== 'center')) {
      const number = Number(val)
      svgCanvas.changeSelectedAttributeEach('stroke-width', (elem) =>
        getStrokeAlign(elem) !== 'center' && Number.isFinite(number) ? String(Math.round(number * 2000) / 1000) : val, elems)
    } else {
      svgCanvas.changeSelectedAttribute('stroke-width', val, elems)
    }
    svgCanvas.call('changed', selectedElements)
  }
}

/**
* Set the given stroke-related attribute the given value for selected elements.
* @function module:elem-get-set.SvgCanvas#setStrokeAttr
* @param {string} attr - String with the attribute name
* @param {string|Float} val - String or number with the attribute value
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {void}
*/
const setStrokeAttrMethod = (attr, val) => {
  const selectedElements = svgCanvas.getSelectedElements()
  svgCanvas.setCurShape(attr.replace('-', '_'), val)
  const elems = []

  let i = selectedElements.length
  while (i--) {
    const elem = selectedElements[i]
    if (elem) {
      if (elem.tagName === 'g') {
        walkTree(elem, (e) => { if (e.nodeName !== 'g') { elems.push(e) } })
      } else {
        elems.push(elem)
      }
    }
  }
  if (elems.length > 0) {
    svgCanvas.changeSelectedAttribute(attr, val, elems)
    svgCanvas.call('changed', selectedElements)
  }
}

/**
 * The value of a property of an element: from the rule or the style
 * attribute that gives it, else its attribute (lot S2).
 * @param {Element} elem
 * @param {string} name
 * @returns {string|null}
 */
const styledAttribute = (elem, name) => getStyledValue(elem, name)?.value ?? elem.getAttribute(name)

const getSelectedTextElements = () => {
  return svgCanvas.getSelectedElements().filter(el => el?.tagName === 'text')
}

const getChangedTextElements = (textElements, attr, newValue) => {
  const normalizedValue = String(newValue)
  return textElements.filter((elem) => {
    const oldValue = attr === '#text' ? getTextSource(elem) : elem.getAttribute(attr)
    return (oldValue || '') !== normalizedValue
  })
}

const notifyTextChange = (textElements) => {
  if (textElements.length > 0) {
    svgCanvas.call('changed', textElements)
  }
}

/**
 * Check if all selected text elements are in bold.
 * @function module:svgcanvas.SvgCanvas#getBold
 * @returns {boolean} `true` if all selected elements are bold, `false` otherwise.
 */
const getBoldMethod = () => {
  const textElements = getSelectedTextElements()
  return textElements.every(el => styledAttribute(el, 'font-weight') === 'bold')
}

/**
 * Make the selected element(s) bold or normal.
 * @function module:svgcanvas.SvgCanvas#setBold
 * @param {boolean} b - Indicates bold (`true`) or normal (`false`)
 * @returns {void}
 */
const setBoldMethod = (b) => {
  const textElements = getSelectedTextElements()
  const value = b ? 'bold' : 'normal'
  const changedTextElements = getChangedTextElements(textElements, 'font-weight', value)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('font-weight', value, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
 * Check if all selected text elements have the given text decoration value or not.
 * @returns {boolean} Indicates whether or not elements have the text decoration value
 */
const hasTextDecorationMethod = (value) => {
  const textElements = getSelectedTextElements()
  return textElements.every(el => (el.getAttribute('text-decoration') || '').includes(value))
}

/**
 * Adds the given text decoration value
 * @param value The text decoration value
 * @returns {void}
 */
const addTextDecorationMethod = (value) => {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const textElements = getSelectedTextElements()

  const batchCmd = new BatchCommand()
  textElements.forEach(elem => {
    const oldValue = elem.getAttribute('text-decoration') || ''
    // Add the new text decoration value if it did not exist
    if (!oldValue.includes(value)) {
      batchCmd.addSubCommand(new ChangeElementCommand(elem, { 'text-decoration': oldValue }))
      svgCanvas.changeSelectedAttributeNoUndo('text-decoration', `${oldValue} ${value}`.trim(), [elem])
    }
  })
  if (!batchCmd.isEmpty()) {
    svgCanvas.undoMgr.addCommandToHistory(batchCmd)
  }

  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
}

/**
 * Removes the given text decoration value
 * @param value The text decoration value
 * @returns {void}
 */
const removeTextDecorationMethod = (value) => {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const textElements = getSelectedTextElements()

  const batchCmd = new BatchCommand()
  textElements.forEach(elem => {
    const actualValues = elem.getAttribute('text-decoration') || ''
    batchCmd.addSubCommand(new ChangeElementCommand(elem, { 'text-decoration': actualValues }))
    svgCanvas.changeSelectedAttributeNoUndo('text-decoration', actualValues.replace(value, '').trim(), [elem])
  })
  if (!batchCmd.isEmpty()) {
    svgCanvas.undoMgr.addCommandToHistory(batchCmd)
  }

  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
}

/**
 * Check if all selected elements have an italic font style.
 * @function module:svgcanvas.SvgCanvas#getItalic
 * @returns {boolean} `true` if all selected elements are in italics, `false` otherwise.
 */
const getItalicMethod = () => {
  const textElements = getSelectedTextElements()
  return textElements.every(el => styledAttribute(el, 'font-style') === 'italic')
}

/**
 * Make the selected element(s) italic or normal.
 * @function module:svgcanvas.SvgCanvas#setItalic
 * @param {boolean} i - Indicates italic (`true`) or normal (`false`)
 * @returns {void}
 */
const setItalicMethod = (i) => {
  const textElements = getSelectedTextElements()
  const value = i ? 'italic' : 'normal'
  const changedTextElements = getChangedTextElements(textElements, 'font-style', value)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('font-style', value, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
 * @function module:svgcanvas.SvgCanvas#setTextAnchorMethod Set the new text anchor
 * @param {string} value - The text anchor value (start, middle or end)
 * @returns {void}
 */
const setTextAnchorMethod = (value) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'text-anchor', value)
  if (changedTextElements.length > 0) {
    // The block stays where it is and its lines align in it: its anchor,
    // `x`, moves to its left side, its middle or its right side.
    const { undoMgr } = svgCanvas
    const moves = changedTextElements.map((elem) => {
      const x = elem.getAttribute('x')
      if (x === null || !/^\s*-?[\d.]+(e-?\d+)?\s*$/i.test(x)) return null
      const width = getTextWidth(elem) || elem.getBBox?.().width || 0
      const from = ANCHOR_FACTORS[window.getComputedStyle(elem).textAnchor] ?? 0
      const to = ANCHOR_FACTORS[value] ?? 0
      return width ? [elem, Math.round((Number(x) + (to - from) * width) * 1000) / 1000] : null
    }).filter(Boolean)
    // One step, named by its alignment: the moves of the anchors join it.
    undoMgr.beginUndoableChange('text-anchor', changedTextElements)
    svgCanvas.changeSelectedAttributeNoUndo('text-anchor', value, changedTextElements)
    const batch = undoMgr.finishUndoableChange()
    moves.forEach(([elem, x]) => {
      undoMgr.beginUndoableChange('x', [elem])
      svgCanvas.changeSelectedAttributeNoUndo('x', x, [elem])
      batch.addSubCommand(undoMgr.finishUndoableChange())
    })
    if (!batch.isEmpty()) svgCanvas.addCommandToHistory(batch)
  }
  notifyTextChange(changedTextElements)
}

const ANCHOR_FACTORS = { start: 0, middle: 0.5, end: 1 }

/**
 * @function module:svgcanvas.SvgCanvas#getLineHeight
 * @returns {number} The line height of the selected text, in font sizes
 */
const getLineHeightMethod = () => {
  const [text] = getSelectedTextElements()
  return text ? getLineHeight(text) : 1.2
}

/**
 * Sets the line height of the selected texts, in font sizes.
 * @function module:svgcanvas.SvgCanvas#setLineHeight
 * @param {number|string} value
 * @returns {void}
 */
const setLineHeightMethod = (value) => {
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n) || n <= 0) return
  const textElements = getSelectedTextElements()
  const changedTextElements = textElements.filter((elem) => getLineHeight(elem) !== n || !elem.hasAttributeNS(NS.SE, 'line-height'))
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('se:line-height', String(n), changedTextElements)
  }
  notifyTextChange(changedTextElements)
}

/**
 * @function module:svgcanvas.SvgCanvas#getTextWidth
 * @returns {number} The fixed width of the selected text, or 0 for a text
 *   as wide as its lines
 */
const getTextWidthMethod = () => {
  const [text] = getSelectedTextElements()
  return text ? getTextWidth(text) : 0
}

/**
 * Gives the selected texts a fixed width, their lines breaking to fit in
 * it, or (0, null) takes it away.
 * @function module:svgcanvas.SvgCanvas#setTextWidth
 * @param {number|null} value
 * @returns {void}
 */
const setTextWidthMethod = (value) => {
  const n = Number.parseFloat(value)
  const width = Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : ''
  const textElements = getSelectedTextElements()
  const changedTextElements = textElements.filter((elem) => (elem.getAttribute('se:width') || '') !== width)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('se:width', width, changedTextElements)
  }
  notifyTextChange(changedTextElements)
}

const roundBox = (n) => String(Math.round(n * 100) / 100)

/**
 * @function module:svgcanvas.SvgCanvas#getTextHeight
 * @param {Element} [elem] - The selected text when absent
 * @returns {number} The fixed height of the text, or 0
 */
const getTextHeightMethod = (elem) => {
  const text = elem ?? getSelectedTextElements()[0]
  return text ? getTextHeight(text) : 0
}

/**
 * @function module:svgcanvas.SvgCanvas#getTextVerticalAlign
 * @param {Element} [elem] - The selected text when absent
 * @returns {"top"|"middle"|"bottom"}
 */
const getTextVerticalAlignMethod = (elem) => {
  const text = elem ?? getSelectedTextElements()[0]
  return text ? getTextVerticalAlign(text) : 'top'
}

/**
 * How a text is sized, as the Resizing of Figma: as wide as its lines
 * ("auto-width"), of a fixed width and as high as its lines
 * ("auto-height"), or of a fixed width and height ("fixed").
 * @function module:svgcanvas.SvgCanvas#getTextResizing
 * @param {Element} [elem] - The selected text when absent
 * @returns {"auto-width"|"auto-height"|"fixed"}
 */
const getTextResizingMethod = (elem) => {
  const text = elem ?? getSelectedTextElements()[0]
  if (text && getTextHeight(text)) return 'fixed'
  return text && getTextWidth(text) ? 'auto-height' : 'auto-width'
}

/**
 * Writes the attributes of the box of a text that differ, each a step of
 * the history (a group gathers them).
 * @param {Element} elem
 * @param {Object<string, string>} values
 * @returns {void}
 */
const writeBox = (elem, values) => {
  for (const [attr, value] of Object.entries(values)) {
    if ((elem.getAttribute(attr) || '') !== value) svgCanvas.changeSelectedAttribute(attr, value, [elem])
  }
}

/**
 * Sizes the selected texts as the Resizing of Figma, in one undo step: a
 * fixed width and height are those of their boxes now. The vertical
 * alignment goes with the fixed height.
 * @function module:svgcanvas.SvgCanvas#setTextResizing
 * @param {"auto-width"|"auto-height"|"fixed"} mode
 * @returns {void}
 */
const setTextResizingMethod = (mode) => {
  const textElements = getSelectedTextElements().filter((elem) => getTextResizingMethod(elem) !== mode)
  if (!textElements.length) return
  svgCanvas.groupHistory('Text resizing', () => {
    textElements.forEach((elem) => {
      const box = getBBox(elem)
      const width = roundBox(getTextWidth(elem) || box?.width || 0)
      if (mode === 'auto-width') {
        writeBox(elem, { 'se:valign': '', 'se:height': '', 'se:width': '' })
      } else if (mode === 'auto-height') {
        writeBox(elem, { 'se:valign': '', 'se:height': '', 'se:width': width })
      } else {
        writeBox(elem, { 'se:width': width, 'se:height': roundBox(getTextHeight(elem) || box?.height || 0) })
      }
    })
  })
  notifyTextChange(textElements)
}

/**
 * Gives the selected texts a width (their lines break in it) or a height
 * (their boxes become of fixed size), as the W and H fields of Figma.
 * @function module:svgcanvas.SvgCanvas#setTextBox
 * @param {number|null} width
 * @param {number|null} height
 * @returns {void}
 */
const setTextBoxMethod = (width, height) => {
  const textElements = getSelectedTextElements()
  const w = Number.parseFloat(width)
  const h = Number.parseFloat(height)
  if (!textElements.length || (!(w > 0) && !(h > 0))) return
  svgCanvas.groupHistory('Text box', () => {
    textElements.forEach((elem) => {
      const values = {}
      if (w > 0) values['se:width'] = roundBox(w)
      if (h > 0) {
        if (!values['se:width']) values['se:width'] = roundBox(getTextWidth(elem) || getBBox(elem)?.width || 0)
        values['se:height'] = roundBox(h)
      }
      writeBox(elem, values)
    })
  })
  notifyTextChange(textElements)
}

/**
 * Places the lines of the selected texts of fixed height in their boxes.
 * @function module:svgcanvas.SvgCanvas#setTextVerticalAlign
 * @param {"top"|"middle"|"bottom"} value
 * @returns {void}
 */
const setTextVerticalAlignMethod = (value) => {
  const written = value === 'middle' || value === 'bottom' ? value : ''
  const textElements = getSelectedTextElements()
    .filter((elem) => getTextHeight(elem) && (elem.getAttribute('se:valign') || '') !== written)
  if (textElements.length > 0) {
    svgCanvas.changeSelectedAttribute('se:valign', written, textElements)
  }
  notifyTextChange(textElements)
}

/**
 * @function module:svgcanvas.SvgCanvas#setLetterSpacingMethod Set the new letter spacing
 * @param {string} value - The letter spacing value
 * @returns {void}
 */
const setLetterSpacingMethod = (value) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'letter-spacing', value)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('letter-spacing', value, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
 * @function module:svgcanvas.SvgCanvas#setWordSpacingMethod Set the new word spacing
 * @param {string} value - The word spacing value
 * @returns {void}
 */
const setWordSpacingMethod = (value) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'word-spacing', value)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('word-spacing', value, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
 * @function module:svgcanvas.SvgCanvas#setTextLengthMethod Set the new text length
 * @param {string} value - The text length value
 * @returns {void}
 */
const setTextLengthMethod = (value) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'textLength', value)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('textLength', value, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
 * @function module:svgcanvas.SvgCanvas#setLengthAdjustMethod Set the new length adjust
 * @param {string} value - The length adjust value
 * @returns {void}
 */
const setLengthAdjustMethod = (value) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'lengthAdjust', value)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('lengthAdjust', value, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
* @function module:svgcanvas.SvgCanvas#getFontFamily
* @returns {string} The current font family
*/
const getFontFamilyMethod = () => {
  return svgCanvas.getCurText('font_family')
}

/**
* Set the new font family.
* @function module:svgcanvas.SvgCanvas#setFontFamily
* @param {string} val - String with the new font family
* @returns {void}
*/
const setFontFamilyMethod = (val) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'font-family', val)
  svgCanvas.setCurText('font_family', val)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('font-family', val, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
* Set the new font color.
* @function module:svgcanvas.SvgCanvas#setFontColor
* @param {string} val - String with the new font color
* @returns {void}
*/
const setFontColorMethod = (val) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'fill', val)
  svgCanvas.setCurText('fill', val)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('fill', val, changedTextElements)
  }
  notifyTextChange(changedTextElements)
}

/**
* @function module:svgcanvas.SvgCanvas#getFontColor
* @returns {string} The current font color
*/
const getFontColorMethod = () => {
  return svgCanvas.getCurText('fill')
}

/**
* @function module:svgcanvas.SvgCanvas#getFontSize
* @returns {Float} The current font size
*/
const getFontSizeMethod = () => {
  return svgCanvas.getCurText('font_size')
}

/**
* Applies the given font size to the selected element.
* @function module:svgcanvas.SvgCanvas#setFontSize
* @param {Float} val - Float with the new font size
* @returns {void}
*/
const setFontSizeMethod = (val) => {
  const textElements = getSelectedTextElements()
  const changedTextElements = getChangedTextElements(textElements, 'font-size', val)
  svgCanvas.setCurText('font_size', val)
  if (changedTextElements.length > 0) {
    svgCanvas.changeSelectedAttribute('font-size', val, changedTextElements)
  }
  if (!textElements.some(el => el.textContent)) {
    svgCanvas.textActions.setCursor()
  }
  notifyTextChange(changedTextElements)
}

/**
* @function module:svgcanvas.SvgCanvas#getText
* @returns {string} The current text (`textContent`) of the selected element
*/
const getTextMethod = () => {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  return (selected) ? getTextSource(selected) : ''
}

/**
* Updates the text element with the given string.
* @function module:svgcanvas.SvgCanvas#setTextContent
* @param {string} val - String with the new text
* @returns {void}
*/
const setTextContentMethod = (val) => {
  svgCanvas.changeSelectedAttribute('#text', val)
  svgCanvas.textActions.init(val)
  svgCanvas.textActions.setCursor()
}

/**
* Sets the new image URL for the selected image element. Updates its size if
* a new URL is given.
* @function module:svgcanvas.SvgCanvas#setImageURL
* @param {string} val - String with the image URL/path
* @fires module:svgcanvas.SvgCanvas#event:changed
* @returns {void}
*/
const setImageURLMethod = (val) => {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  const elem = selectedElements[0]
  if (!elem) { return }

  const attrs = {
    width: elem.getAttribute('width'),
    height: elem.getAttribute('height')
  }
  const setsize = (!attrs.width || !attrs.height)

  const curHref = getHref(elem)
  const hrefChanged = curHref !== val

  // Do nothing if no URL change or size change
  if (!hrefChanged && !setsize) {
    return
  }

  const batchCmd = new BatchCommand('Change Image URL')

  if (hrefChanged) {
    setHref(elem, val)
    batchCmd.addSubCommand(new ChangeElementCommand(elem, {
      '#href': curHref
    }))
  }

  let finalized = false
  const finalize = () => {
    if (finalized) { return }
    finalized = true
    if (batchCmd.isEmpty()) { return }
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [elem])
  }

  const img = new Image()
  img.onload = () => {
    const changes = {
      width: elem.getAttribute('width'),
      height: elem.getAttribute('height')
    }
    elem.setAttribute('width', img.width)
    elem.setAttribute('height', img.height)

    const selector = svgCanvas.selectorManager.requestSelector(elem)
    selector && selector.resize()

    batchCmd.addSubCommand(new ChangeElementCommand(elem, changes))
    finalize()
  }
  img.onerror = () => {
    finalize()
  }
  img.src = val
}

/**
* Sets the new link URL for the selected anchor element.
* @function module:svgcanvas.SvgCanvas#setLinkURL
* @param {string} val - String with the link URL/path
* @returns {void}
*/
const setLinkURLMethod = (val) => {
  if (!isSafeHref('a', val)) {
    warn('Refusing a link URL with a script-capable scheme', null, 'elem-get-set')
    return
  }
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  let elem = selectedElements[0]
  if (!elem) { return }
  if (elem.tagName !== 'a') {
    // See if parent is an anchor
    const parentsA = getParents(elem.parentNode, 'a')
    if (parentsA?.length) {
      elem = parentsA[0]
    } else {
      return
    }
  }

  const curHref = getHref(elem)

  if (curHref === val) { return }

  const batchCmd = new BatchCommand('Change Link URL')

  setHref(elem, val)
  batchCmd.addSubCommand(new ChangeElementCommand(elem, {
    '#href': curHref
  }))

  svgCanvas.addCommandToHistory(batchCmd)
}

/**
* Sets the `rx` and `ry` values to the selected `rect` element
* to change its corner radius.
* @function module:svgcanvas.SvgCanvas#setRectRadius
* @param {string|Float} val - The new radius
* @fires module:svgcanvas.SvgCanvas#event:changed
* @returns {void}
*/
const setRectRadiusMethod = (val) => {
  const { ChangeElementCommand } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (selected?.tagName !== 'rect') { return }

  const radius = Number(val)
  if (!Number.isFinite(radius) || radius < 0) {
    return
  }
  // The next rectangle is drawn with it (lot Coins).
  svgCanvas.cornerActions?.remember(radius)

  const oldRx = selected.getAttribute('rx')
  const oldRy = selected.getAttribute('ry')
  const currentRx = Number(oldRx)
  const currentRy = Number(oldRy)
  const hasCurrentRx = oldRx !== null && Number.isFinite(currentRx)
  const hasCurrentRy = oldRy !== null && Number.isFinite(currentRy)
  const already = (radius === 0 && oldRx === null && oldRy === null) ||
    (hasCurrentRx && hasCurrentRy && currentRx === radius && currentRy === radius)
  if (already) { return }

  selected.setAttribute('rx', radius)
  selected.setAttribute('ry', radius)
  svgCanvas.addCommandToHistory(new ChangeElementCommand(selected, { rx: oldRx, ry: oldRy }, 'Radius'))
  svgCanvas.call('changed', [selected])
}

/**
* Wraps the selected element(s) in an anchor element or converts group to one.
* @function module:svgcanvas.SvgCanvas#makeHyperlink
* @param {string} url
* @returns {void}
*/
const makeHyperlinkMethod = (url) => {
  if (!isSafeHref('a', url)) {
    warn('Refusing a link URL with a script-capable scheme', null, 'elem-get-set')
    return
  }
  svgCanvas.groupSelectedElements('a', url)
}

/**
* @function module:svgcanvas.SvgCanvas#removeHyperlink
* @returns {void}
*/
const removeHyperlinkMethod = () => {
  svgCanvas.ungroupSelectedElement()
}

/**
* Group: Element manipulation.
*/

/**
* Sets the new segment type to the selected segment(s).
* @function module:svgcanvas.SvgCanvas#setSegType
* @param {Integer} newType - New segment type. See {@link https://www.w3.org/TR/SVG/paths.html#InterfaceSVGPathSeg} for list
* @returns {void}
*/
const setSegTypeMethod = (newType) => {
  svgCanvas.pathActions.setSegType(newType)
}

/**
* Set the background of the editor (NOT the actual document).
* @function module:svgcanvas.SvgCanvas#setBackground
* @param {string} color - String with fill color to apply
* @param {string} url - URL or path to image to use
* @returns {void}
*/
const setBackgroundMethod = (color, url) => {
  const bg = getElement('canvasBackground')
  if (!bg) { return }
  const border = bg.querySelector('rect')
  if (!border) { return }
  let bgImg = getElement('background_image')
  let bgPattern = getElement('background_pattern')
  border.setAttribute('fill', color === 'chessboard' ? '#fff' : color)
  if (color === 'chessboard') {
    if (!bgPattern) {
      bgPattern = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'foreignObject')
      svgCanvas.assignAttributes(bgPattern, {
        id: 'background_pattern',
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'xMinYMin',
        style: 'pointer-events:none'
      })
      const div = document.createElement('div')
      svgCanvas.assignAttributes(div, {
        style: 'pointer-events:none;width:100%;height:100%;' +
          'background-image:url(data:image/gif;base64,' +
          'R0lGODlhEAAQAIAAAP///9bW1iH5BAAAAAAALAAAAAAQABAAAAIfjG+' +
          'gq4jM3IFLJgpswNly/XkcBpIiVaInlLJr9FZWAQA7);'
      })
      bgPattern.append(div)
      bg.append(bgPattern)
    }
  } else if (bgPattern) {
    bgPattern.remove()
  }
  if (url) {
    if (!bgImg) {
      bgImg = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'image')
      svgCanvas.assignAttributes(bgImg, {
        id: 'background_image',
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'xMinYMin',
        style: 'pointer-events:none'
      })
    }
    setHref(bgImg, url)
    bg.append(bgImg)
  } else if (bgImg) {
    bgImg.remove()
  }
}
