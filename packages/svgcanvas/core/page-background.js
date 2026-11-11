/**
 * The background of the page (lot Fond, after the Page section of Figma):
 * a rectangle of the size of the page, in a locked layer under the others,
 * as the template "Synoptic 1 920 × 1 080" made it. It is in the file, so
 * the page has its colour in every viewer, in the PDF and the images too.
 *
 * - The rectangle is marked `data-se-background`; its layer is locked, so a
 *   click on the page does not select it.
 * - It follows the size of the page (setResolution), in the same undo step.
 * - "Fit to content" leaves it out, then gives it the new size.
 * @module page-background
 */

import { BatchCommand, ChangeElementCommand, InsertElementCommand, RemoveElementCommand } from './history.js'
import { NS } from './namespaces.js'

/** The attribute that marks the rectangle of the background. */
export const BACKGROUND_ATTR = 'data-se-background'

let svgCanvas = null

/**
 * @param {Element} [root] The drawing
 * @returns {SVGRectElement|null} The rectangle of the background, in a layer
 */
export const getPageBackground = (root = svgCanvas?.getSvgContent()) =>
  root?.querySelector(`:scope > g > rect[${BACKGROUND_ATTR}]`) ?? null

/**
 * @param {Element|null} elem
 * @returns {boolean} Whether this is the rectangle of the background
 */
export const isPageBackground = (elem) => Boolean(elem?.nodeType === 1 && elem.hasAttribute(BACKGROUND_ATTR))

/**
 * @param {Element} [root]
 * @returns {{color: string, opacity: number}|null} The colour of the
 *   background ('#rrggbb' as written) and its opacity, 0–1
 */
export const getPageBackgroundColor = (root) => {
  const rect = getPageBackground(root)
  if (!rect) return null
  const opacity = Number.parseFloat(rect.getAttribute('fill-opacity') ?? '1')
  return { color: rect.getAttribute('fill') || '#000000', opacity: Number.isFinite(opacity) ? opacity : 1 }
}

/**
 * The box of the page: it starts at the origin of the viewBox of the file
 * opened (lot V5).
 * @param {number} [width]
 * @param {number} [height]
 * @returns {{x: number, y: number, width: number, height: number}}
 */
const pageBox = (width, height) => {
  const { w, h } = width === undefined ? svgCanvas.getResolution() : { w: width, h: height }
  const origin = svgCanvas.getPageOrigin?.() ?? { x: 0, y: 0 }
  return { x: origin.x, y: origin.y, width: w, height: h }
}

/**
 * Writes the colour and the opacity; 1 writes no fill-opacity.
 * @param {Element} rect
 * @param {string} color
 * @param {number} opacity
 * @returns {void}
 */
const paint = (rect, color, opacity) => {
  rect.setAttribute('fill', color)
  if (opacity < 1) rect.setAttribute('fill-opacity', String(Math.round(opacity * 1000) / 1000))
  else rect.removeAttribute('fill-opacity')
}

/**
 * Runs a change of the layers and gives back the current layer, which
 * identifyLayers sets to the top one.
 * @param {() => void} change
 * @returns {void}
 */
const keepCurrentLayer = (change) => {
  const drawing = svgCanvas.getCurrentDrawing()
  const group = drawing.getCurrentLayer()
  change()
  const index = drawing.all_layers.findIndex((layer) => layer.getGroup() === group)
  if (index >= 0) drawing.setCurrentLayer(drawing.getLayerName(index))
}

/** The preview of a colour, outside the history. */
let preview = null

/**
 * Shows a colour on the background while it is being chosen (a drag in the
 * colour window), outside the history. setPageBackground, or
 * cancelPageBackgroundPreview, gives the background back its colour first.
 * @param {string} color
 * @param {number} [opacity]
 * @returns {void}
 */
export const previewPageBackground = (color, opacity = 1) => {
  const rect = getPageBackground()
  if (!rect) return
  if (!preview) preview = { rect, fill: rect.getAttribute('fill'), opacity: rect.getAttribute('fill-opacity') }
  paint(rect, color, opacity)
}

/**
 * @returns {boolean} Whether a preview was shown
 */
export const cancelPageBackgroundPreview = () => {
  if (!preview) return false
  const { rect, fill, opacity } = preview
  preview = null
  if (fill === null) rect.removeAttribute('fill')
  else rect.setAttribute('fill', fill)
  if (opacity === null) rect.removeAttribute('fill-opacity')
  else rect.setAttribute('fill-opacity', opacity)
  return true
}

/**
 * Gives the page a background of this colour, or removes it (null), as one
 * undo step. The first colour makes the rectangle and its locked layer,
 * under the others; the current layer stays. Removed, the layer goes with
 * it when it holds nothing else.
 * @param {string|null} color '#rrggbb', or null to remove the background
 * @param {number} [opacity] 0–1
 * @param {string} [layerName] Of the layer made for it
 * @returns {BatchCommand|null}
 */
export const setPageBackground = (color, opacity = 1, layerName = 'Background') => {
  cancelPageBackgroundPreview()
  const rect = getPageBackground()
  const content = svgCanvas.getSvgContent()
  let batch
  if (!color) {
    if (!rect) return null
    batch = new BatchCommand('Remove background')
    const layer = rect.parentNode
    const alone = [...layer.children].every((child) => child === rect || child.tagName === 'title')
    const gone = alone ? layer : rect
    const { nextSibling, parentNode } = gone
    gone.remove()
    batch.addSubCommand(new RemoveElementCommand(gone, nextSibling, parentNode))
    if (alone) keepCurrentLayer(() => svgCanvas.getCurrentDrawing().identifyLayers())
  } else if (rect) {
    const old = { fill: rect.getAttribute('fill'), 'fill-opacity': rect.getAttribute('fill-opacity') }
    paint(rect, color, opacity)
    if (old.fill === rect.getAttribute('fill') && old['fill-opacity'] === rect.getAttribute('fill-opacity')) return null
    batch = new BatchCommand('Change background')
    batch.addSubCommand(new ChangeElementCommand(rect, old))
  } else {
    batch = new BatchCommand('Add background')
    const doc = svgCanvas.getDOMDocument()
    const drawing = svgCanvas.getCurrentDrawing()
    let name = layerName
    for (let i = 2; drawing.hasLayer(name); i++) name = `${layerName} ${i}`
    const layer = doc.createElementNS(NS.SVG, 'g')
    layer.setAttribute('class', 'layer')
    layer.setAttributeNS(NS.SE, 'se:locked', 'true')
    const title = doc.createElementNS(NS.SVG, 'title')
    title.textContent = name
    const made = doc.createElementNS(NS.SVG, 'rect')
    made.setAttribute('id', svgCanvas.getNextId())
    made.setAttribute(BACKGROUND_ATTR, 'true')
    for (const [attr, value] of Object.entries(pageBox())) made.setAttribute(attr, String(value))
    paint(made, color, opacity)
    layer.append(title, made)
    // Under the layers: before the first one, or at the end of an empty drawing.
    const first = drawing.all_layers[0]?.getGroup()
    if (first) content.insertBefore(layer, first)
    else content.append(layer)
    batch.addSubCommand(new InsertElementCommand(layer))
    keepCurrentLayer(() => drawing.identifyLayers())
  }
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [content])
  return batch
}

/**
 * Gives the background the new size of the page: the change is added to the
 * batch of the page. The size is given, as the page, being changed, does not
 * give it yet at the zoom of the view.
 * @param {BatchCommand} batch
 * @param {number} width
 * @param {number} height
 * @returns {void}
 */
export const fitPageBackground = (batch, width, height) => {
  const rect = getPageBackground()
  if (!rect) return
  const old = {}
  for (const [attr, value] of Object.entries(pageBox(width, height))) {
    if (rect.getAttribute(attr) === String(value)) continue
    old[attr] = rect.getAttribute(attr)
    rect.setAttribute(attr, String(value))
  }
  if (Object.keys(old).length) batch.addSubCommand(new ChangeElementCommand(rect, old))
}

/**
 * @param {object} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.getPageBackground = getPageBackground
  canvas.getPageBackgroundColor = getPageBackgroundColor
  canvas.setPageBackground = setPageBackground
  canvas.previewPageBackground = previewPageBackground
  canvas.cancelPageBackgroundPreview = cancelPageBackgroundPreview
  canvas.isPageBackground = isPageBackground
}
