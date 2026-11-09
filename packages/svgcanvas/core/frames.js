/**
 * Export frames (lot V5; plan v2, section 4.3, decision D7): named zones of
 * the drawing, one per supervision screen, each exported as an SVG of its
 * own whose viewBox is the frame.
 *
 * A frame is editor data that must survive the save without being part of
 * the drawing: an `<se:frame>` element in the editor namespace, inside a
 * `<metadata>` at the root, which no renderer shows.
 *
 *   <metadata><se:frame name="Chaufferie" x="0" y="0" width="1920" height="1080"/></metadata>
 *
 * Its changes go through the history like any other. The save keeps the
 * frames; the export of a frame leaves them out, with the objects that lie
 * wholly outside it. A document without frames is written as before, byte
 * for byte.
 * @module frames
 */
import { NS } from './namespaces.js'
import { InsertElementCommand, RemoveElementCommand, ChangeElementCommand, BatchCommand } from './history.js'
import { drawingBoxOf } from './multi-transform.js'
import { shortFloat } from './units.js'

/**
 * Formats of a new frame, in pixels of the drawing (96 per inch).
 * @type {Object<string, [number, number]>}
 */
export const FRAME_PRESETS = {
  hd: [1920, 1080],
  sxga: [1280, 1024],
  a4: [794, 1123],
  a3_landscape: [1587, 1123]
}

/** The format of a frame drawn with a click rather than a drag. */
export const DEFAULT_PRESET = 'hd'

/** Margin around the content exported without a frame, in units of the drawing. */
export const CONTENT_MARGIN = 20

/** The attributes a frame holds. */
export const FRAME_ATTRIBUTES = ['name', 'x', 'y', 'width', 'height']

let svgCanvas = null

/**
 * @param {Element} elem
 * @returns {boolean} An `<se:frame>`
 */
export const isFrame = (elem) => elem?.nodeType === 1 && elem.namespaceURI === NS.SE && elem.localName === 'frame'

/**
 * @typedef {object} Frame
 * @property {Element} element - The `<se:frame>`
 * @property {string} name
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @param {Element} element
 * @returns {Frame}
 */
export const frameOf = (element) => {
  const number = (name) => {
    const value = Number.parseFloat(element.getAttribute(name))
    return Number.isFinite(value) ? value : 0
  }
  return {
    element,
    name: element.getAttribute('name') || '',
    x: number('x'),
    y: number('y'),
    width: Math.max(0, number('width')),
    height: Math.max(0, number('height'))
  }
}

/**
 * The frames of the document, in their order.
 * @returns {Frame[]}
 */
export const getFrames = () => {
  const content = svgCanvas.getSvgContent()
  const frames = []
  for (const child of content.children) {
    if (child.localName !== 'metadata' || child.namespaceURI !== NS.SVG) continue
    for (const elem of child.children) {
      if (isFrame(elem)) frames.push(frameOf(elem))
    }
  }
  return frames
}

/**
 * A name no frame has: « Cadre 3 ».
 * @param {string} base - Translated, such as "Frame"
 * @returns {string}
 */
export const nextFrameName = (base = 'Frame') => {
  const names = new Set(getFrames().map((frame) => frame.name))
  let i = names.size + 1
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

/**
 * @param {number} value
 * @returns {string}
 */
const format = (value) => String(shortFloat(Number(value) || 0))

/**
 * Adds a frame, as one undo step.
 * @param {{name?: string, x: number, y: number, width: number, height: number}} spec
 * @returns {Frame}
 */
export const addFrame = ({ name, x, y, width, height }) => {
  const content = svgCanvas.getSvgContent()
  const frame = document.createElementNS(NS.SE, 'se:frame')
  frame.setAttribute('name', name || nextFrameName())
  frame.setAttribute('x', format(x))
  frame.setAttribute('y', format(y))
  frame.setAttribute('width', format(Math.abs(width)))
  frame.setAttribute('height', format(Math.abs(height)))
  // The frames go with the other ones; the first one opens a metadata of the
  // editor at the start of the document.
  const last = getFrames().at(-1)?.element
  let cmd
  if (last) {
    last.after(frame)
    cmd = new InsertElementCommand(frame)
  } else {
    const metadata = document.createElementNS(NS.SVG, 'metadata')
    metadata.append(frame)
    const before = [...content.children].find((child) => child.localName !== 'title')
    content.insertBefore(metadata, before ?? null)
    cmd = new InsertElementCommand(metadata)
  }
  cmd.text = 'Add frame'
  svgCanvas.addCommandToHistory(cmd)
  svgCanvas.call('changed', [frame])
  return frameOf(frame)
}

/**
 * Changes a frame, as one undo step.
 * @param {Element} element - The `<se:frame>`
 * @param {Partial<{name: string, x: number, y: number, width: number, height: number}>} attrs
 * @param {object} [options]
 * @param {Object<string, string>} [options.from] - The values before, when
 *   a gesture already wrote the new ones
 * @returns {boolean} Whether something changed
 */
export const changeFrame = (element, attrs, { from } = {}) => {
  if (!isFrame(element)) return false
  const old = {}
  for (const [name, value] of Object.entries(attrs)) {
    if (!FRAME_ATTRIBUTES.includes(name)) continue
    const before = from && name in from ? from[name] : element.getAttribute(name)
    const next = name === 'name' ? String(value) : format(name === 'width' || name === 'height' ? Math.abs(value) : value)
    element.setAttribute(name, next)
    if (before !== next) old[name] = before
  }
  if (!Object.keys(old).length) return false
  const cmd = new ChangeElementCommand(element, old)
  cmd.text = 'Change frame'
  svgCanvas.addCommandToHistory(cmd)
  svgCanvas.call('changed', [element])
  return true
}

/**
 * Removes a frame, as one undo step; the metadata it leaves empty goes with
 * it.
 * @param {Element} element
 * @returns {void}
 */
export const removeFrame = (element) => {
  if (!isFrame(element)) return
  const metadata = element.parentNode
  const others = [...metadata.childNodes].filter((node) => node !== element &&
    (node.nodeType !== 3 || node.data.trim()))
  let cmd
  if (!others.length && !metadata.attributes.length) {
    cmd = new RemoveElementCommand(metadata, metadata.nextSibling, metadata.parentNode)
    metadata.remove()
  } else {
    cmd = new RemoveElementCommand(element, element.nextSibling, metadata)
    element.remove()
  }
  const batch = new BatchCommand('Delete frame')
  batch.addSubCommand(cmd)
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [element])
}

/**
 * The objects of the drawing: the children of the layers, and those at the
 * root that are drawn.
 * @returns {Element[]}
 */
const drawingObjects = () => {
  const content = svgCanvas.getSvgContent()
  const objects = []
  const skipped = new Set(['title', 'desc', 'defs', 'metadata', 'style', 'script'])
  for (const child of content.children) {
    if (skipped.has(child.localName) || child.namespaceURI !== NS.SVG) continue
    if (child.localName === 'g' && child.classList.contains('layer')) {
      for (const elem of child.children) {
        if (!skipped.has(elem.localName) && elem.namespaceURI === NS.SVG) objects.push(elem)
      }
    } else {
      objects.push(child)
    }
  }
  return objects
}

/**
 * @param {{x: number, y: number, width: number, height: number}} a
 * @param {{x: number, y: number, width: number, height: number}} b
 * @returns {boolean} The two boxes share some area
 */
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height

/** Marks the objects an export leaves out, in the saved string. */
const OUTSIDE = 'data-se-export-outside'

/**
 * The document as an SVG of its own on `box`: its viewBox, width and height
 * are the box; the frames, and the objects wholly outside the box when
 * `crop` is set, are left out.
 * @param {{x: number, y: number, width: number, height: number}} box
 * @param {{crop?: boolean}} [options]
 * @returns {string}
 */
const exportOn = (box, { crop = true } = {}) => {
  const marked = []
  if (crop) {
    for (const elem of drawingObjects()) {
      let bbox = null
      try { bbox = drawingBoxOf([elem]) } catch (err) { bbox = null }
      // An object without a box (an empty group) stays.
      if (bbox && !overlaps(bbox, box) && !(bbox.width === 0 && bbox.height === 0 &&
        bbox.x >= box.x && bbox.x <= box.x + box.width && bbox.y >= box.y && bbox.y <= box.y + box.height)) {
        elem.setAttribute(OUTSIDE, '')
        marked.push(elem)
      }
    }
  }
  let source
  try {
    source = svgCanvas.svgCanvasToString()
  } finally {
    marked.forEach((elem) => elem.removeAttribute(OUTSIDE))
  }
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = doc.documentElement
  const removeWithSpace = (node) => {
    const before = node.previousSibling
    if (before?.nodeType === 3 && !before.data.trim()) before.remove()
    node.remove()
  }
  for (const node of [...root.querySelectorAll(`[${OUTSIDE}]`)]) removeWithSpace(node)
  for (const node of [...root.getElementsByTagNameNS(NS.SE, 'frame')]) removeWithSpace(node)
  for (const node of [...root.getElementsByTagNameNS(NS.SVG, 'metadata')]) {
    if (![...node.childNodes].some((child) => child.nodeType !== 3 || child.data.trim())) removeWithSpace(node)
  }
  // The editor namespace goes with the frames, unless something still uses it.
  const usesEditorNS = [root, ...root.querySelectorAll('*')].some((el) => el.namespaceURI === NS.SE ||
    [...el.attributes].some((attr) => attr.namespaceURI === NS.SE))
  if (!usesEditorNS) root.removeAttributeNS('http://www.w3.org/2000/xmlns/', 'se')
  root.setAttribute('width', format(box.width))
  root.setAttribute('height', format(box.height))
  root.setAttribute('viewBox', [box.x, box.y, box.width, box.height].map(format).join(' '))
  return new XMLSerializer().serializeToString(doc)
}

/**
 * The SVG of a frame: the document seen through the frame.
 * @param {Element} element - The `<se:frame>`
 * @returns {string}
 */
export const getFrameSvgString = (element) => {
  const { x, y, width, height } = frameOf(element)
  return exportOn({ x, y, width, height })
}

/**
 * The box of the visible objects, without frames to export.
 * @param {number} [margin=CONTENT_MARGIN]
 * @returns {{x: number, y: number, width: number, height: number}|null}
 */
export const getContentBox = (margin = CONTENT_MARGIN) => {
  const visible = drawingObjects().filter((elem) => elem.getAttribute('display') !== 'none' &&
    elem.parentNode?.getAttribute?.('display') !== 'none')
  let box = null
  try { box = drawingBoxOf(visible) } catch (err) { box = null }
  if (!box) return null
  return { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin }
}

/**
 * The SVG of the visible objects and a margin, for a document without
 * frames.
 * @param {number} [margin=CONTENT_MARGIN]
 * @returns {string|null} Null for an empty drawing
 */
export const getContentSvgString = (margin = CONTENT_MARGIN) => {
  const box = getContentBox(margin)
  return box ? exportOn(box, { crop: false }) : null
}

/**
 * The frames a gesture snaps to, as the page: their edges and middles.
 * @returns {Array<{x: number, y: number, width: number, height: number, page: true}>}
 */
export const frameSnapBoxes = () => getFrames().map(({ x, y, width, height }) => ({ x, y, width, height, page: true }))

/**
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.getFrames = getFrames
  canvas.getFramePresets = () => FRAME_PRESETS
  canvas.addFrame = addFrame
  canvas.changeFrame = changeFrame
  canvas.removeFrame = removeFrame
  canvas.nextFrameName = nextFrameName
  canvas.getFrameSvgString = getFrameSvgString
  canvas.getContentBox = getContentBox
  canvas.getContentSvgString = getContentSvgString
}
