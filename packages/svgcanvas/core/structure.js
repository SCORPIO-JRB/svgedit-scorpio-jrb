/**
 * Structure of the drawing (lot V7; plan v2, sections 2.6 and 4.5): what the
 * full tree of the Layers tab does to the document.
 *
 * - Lock: an object or a layer carries `se:locked="true"`, in the editor
 *   namespace (the export keeps it out of the drawing's meaning: no renderer
 *   reads it). A locked object, or one inside a locked group or layer, is
 *   never selected, from the canvas or from the tree, and the pointer goes
 *   through it to what lies below. Nothing is drawn into a locked layer.
 * - Visibility: `display="none"`, as the eye of the tree always did.
 * - Name: the `<title>` of the object, as for a layer.
 * - Order and parent: the objects move among their siblings or into another
 *   group or layer, and keep their place on the page.
 *
 * Each change is one step of the history.
 * @module structure
 */
import { NS } from './namespaces.js'
import {
  BatchCommand, ChangeElementCommand, InsertElementCommand,
  MoveElementCommand, RemoveElementCommand
} from './history.js'
import { getTransformList, transformListToTransform, matrixMultiply, isIdentity } from './math.js'
import { setStyleProperty } from './utilities.js'

let svgCanvas = null

/** The attribute of the lock, in the editor namespace. */
export const LOCK_ATTRIBUTE = 'se:locked'

/**
 * @param {Element} elem
 * @returns {boolean} Whether the element itself carries the lock
 */
export const isLockedSelf = (elem) => elem?.nodeType === 1 &&
  (elem.getAttributeNS(NS.SE, 'locked') === 'true' || elem.getAttribute(LOCK_ATTRIBUTE) === 'true')

/**
 * @param {Element} elem
 * @param {Element} [content] Where to stop: the root of the drawing
 * @returns {boolean} Whether the element, or a group or layer that holds it,
 *   is locked
 */
export const isLocked = (elem, content = svgCanvas?.getSvgContent()) => {
  for (let node = elem; node && node.nodeType === 1 && node !== content; node = node.parentNode) {
    if (isLockedSelf(node)) return true
  }
  return false
}

/**
 * Locks or unlocks objects or layers; a locked object leaves the selection.
 * @param {Element[]} elems
 * @param {boolean} locked
 * @returns {BatchCommand|null}
 */
export const setLocked = (elems, locked) => {
  const changed = elems.filter((elem) => elem?.nodeType === 1 && isLockedSelf(elem) !== locked)
  if (!changed.length) return null
  const batch = new BatchCommand(locked ? 'Lock' : 'Unlock')
  for (const elem of changed) {
    const old = elem.getAttribute(LOCK_ATTRIBUTE)
    if (locked) elem.setAttributeNS(NS.SE, LOCK_ATTRIBUTE, 'true')
    else elem.removeAttributeNS(NS.SE, 'locked')
    batch.addSubCommand(new ChangeElementCommand(elem, { [LOCK_ATTRIBUTE]: old }))
  }
  if (locked) {
    const selected = svgCanvas.getSelectedElements().filter((elem) => elem && isLocked(elem))
    if (selected.length) svgCanvas.removeFromSelection(selected)
  }
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', changed)
  return batch
}

/**
 * Shows or hides objects (`display="none"`); a hidden object leaves the
 * selection.
 * @param {Element[]} elems
 * @param {boolean} visible
 * @returns {BatchCommand|null}
 */
export const setVisible = (elems, visible) => {
  const changed = elems.filter((elem) => elem?.nodeType === 1 &&
    (elem.getAttribute('display') === 'none') === visible)
  if (!changed.length) return null
  const batch = new BatchCommand(visible ? 'Show' : 'Hide')
  for (const elem of changed) {
    const old = elem.getAttribute('display')
    if (visible) elem.removeAttribute('display')
    else elem.setAttribute('display', 'none')
    batch.addSubCommand(new ChangeElementCommand(elem, { display: old }))
  }
  if (!visible) {
    const selected = svgCanvas.getSelectedElements().filter((elem) => elem && changed.includes(elem))
    if (selected.length) svgCanvas.removeFromSelection(selected)
  }
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', changed)
  return batch
}

/**
 * Every object or layer of the drawing that carries a lock, or is hidden.
 * @param {"locked"|"hidden"} what
 * @returns {Element[]}
 */
export const findMarked = (what) => {
  const content = svgCanvas.getSvgContent()
  const all = [...content.querySelectorAll('*')].filter((elem) => elem.namespaceURI === NS.SVG &&
    !elem.closest('defs') && elem.closest('#svgcontent') === content)
  if (what === 'locked') return all.filter(isLockedSelf)
  const layers = new Set(svgCanvas.getCurrentDrawing().all_layers.map((layer) => layer.getGroup()))
  // A hidden layer is shown by its own command (see setLayerVisibility).
  return all.filter((elem) => elem.getAttribute('display') === 'none' && !layers.has(elem))
}

/**
 * @param {Element} elem
 * @returns {Element|null} The `<title>` child of the element
 */
const titleOf = (elem) => [...elem.children].find((child) => child.localName === 'title' && child.namespaceURI === NS.SVG) ?? null

/**
 * @param {Element} elem
 * @returns {string} The title of the element, trimmed
 */
export const getTitle = (elem) => titleOf(elem)?.textContent.trim() ?? ''

/**
 * Names an object: its `<title>`, which an empty name removes. The id is not
 * touched: the supervision may bind values to it (D4).
 * @param {Element} elem
 * @param {string} name
 * @returns {import('./history.js').Command|null}
 */
export const setTitle = (elem, name) => {
  const text = String(name ?? '').trim()
  const title = titleOf(elem)
  let cmd = null
  if (!text) {
    if (!title) return null
    const { nextSibling, parentNode } = title
    title.remove()
    cmd = new RemoveElementCommand(title, nextSibling, parentNode)
  } else if (title) {
    if (title.textContent === text) return null
    const old = title.textContent
    title.textContent = text
    cmd = new ChangeElementCommand(title, { '#text': old }, 'title')
  } else {
    const created = elem.ownerDocument.createElementNS(NS.SVG, 'title')
    created.textContent = text
    elem.prepend(created)
    cmd = new InsertElementCommand(created)
  }
  const batch = new BatchCommand('Rename')
  batch.addSubCommand(cmd)
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [elem])
  return batch
}

/**
 * The matrix from the user space of an element to that of the drawing.
 * @param {Element} elem
 * @param {Element} content
 * @returns {SVGMatrix}
 */
const toDrawing = (elem, content) => {
  const chain = []
  for (let node = elem; node && node !== content; node = node.parentNode) chain.unshift(node)
  const matrices = chain.map((node) => transformListToTransform(getTransformList(node)).matrix)
  return matrices.length ? matrixMultiply(...matrices) : svgCanvas.getSvgRoot().createSVGMatrix()
}

/**
 * Moves objects to a new place in the drawing: among the children of
 * `parent`, before `before` (null: at the end, so on top). Each object keeps
 * its place on the page: when the transforms of the old and new parents
 * differ, its own transform makes up for it. The objects keep their
 * relative order; an object cannot go into itself.
 * @param {Element[]} elems In document order
 * @param {Element} parent A layer, or a group
 * @param {Element|null} before
 * @returns {BatchCommand|null}
 */
export const moveElementsTo = (elems, parent, before = null) => {
  const content = svgCanvas.getSvgContent()
  const list = elems.filter((elem) => elem?.parentNode && elem !== parent && !elem.contains(parent) &&
    elem !== before)
  if (!list.length || !parent) return null
  const target = toDrawing(parent, content)
  const batch = new BatchCommand('Reorder')
  for (const elem of list) {
    const oldParent = elem.parentNode
    const oldNext = elem.nextSibling
    // Already in place
    if (oldParent === parent && (before === null ? !elem.nextElementSibling : elem.nextElementSibling === before)) {
      continue
    }
    if (oldParent !== parent) {
      // The place on the page: M(new parent) · T' = M(old parent) · T
      const source = toDrawing(oldParent, content)
      const inverse = target.inverse()
      const fix = matrixMultiply(inverse, source)
      if (!isIdentity(fix)) {
        const own = transformListToTransform(getTransformList(elem)).matrix
        const m = matrixMultiply(fix, own)
        const old = elem.getAttribute('transform')
        const round = (v) => Math.round(v * 1e6) / 1e6
        const translation = Math.abs(m.a - 1) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9
        elem.setAttribute('transform', translation
          ? `translate(${round(m.e)},${round(m.f)})`
          : `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(round).join(',')})`)
        batch.addSubCommand(new ChangeElementCommand(elem, { transform: old }))
      }
    }
    parent.insertBefore(elem, before)
    batch.addSubCommand(new MoveElementCommand(elem, oldNext, oldParent))
  }
  if (batch.isEmpty()) return null
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', list)
  return batch
}

/** The blend modes a layer offers (CSS Compositing, `mix-blend-mode`). */
export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference']

/**
 * @param {Element} group A layer
 * @returns {string} Its blend mode, `normal` when it has none
 */
export const getBlendMode = (group) => {
  const match = /(?:^|;)\s*mix-blend-mode\s*:\s*([\w-]+)/.exec(group?.getAttribute('style') ?? '')
  return match ? match[1] : 'normal'
}

/**
 * Sets the opacity or the blend mode of a layer (plan v2, 2.6): one undo
 * step. An opacity of 1 and the normal mode leave nothing in the file.
 * @param {Element} group A layer
 * @param {{opacity?: number, blend?: string}} values
 * @returns {BatchCommand|null}
 */
export const setLayerStyle = (group, { opacity, blend } = {}) => {
  const old = { opacity: group.getAttribute('opacity'), style: group.getAttribute('style') }
  if (opacity !== undefined && Number.isFinite(opacity)) {
    const value = Math.min(1, Math.max(0, opacity))
    if (value >= 1) group.removeAttribute('opacity')
    else group.setAttribute('opacity', String(Math.round(value * 1000) / 1000))
  }
  if (blend !== undefined && BLEND_MODES.includes(blend)) {
    setStyleProperty(group, 'mix-blend-mode', blend === 'normal' ? null : blend)
  }
  const changed = Object.keys(old).filter((name) => group.getAttribute(name) !== old[name])
  if (!changed.length) return null
  const batch = new BatchCommand('Layer style')
  batch.addSubCommand(new ChangeElementCommand(group, Object.fromEntries(changed.map((name) => [name, old[name]]))))
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', [group])
  return batch
}

/**
 * Sets the blend mode of elements (lot Propriétés), as the drop of the
 * Appearance section does: one undo step; the normal mode leaves nothing in
 * the file.
 * @param {Element[]} elems
 * @param {string} blend One of BLEND_MODES
 * @returns {BatchCommand|null}
 */
export const setBlendModes = (elems, blend) => {
  if (!BLEND_MODES.includes(blend)) return null
  const batch = new BatchCommand('Blend mode')
  const changed = []
  for (const elem of (elems ?? []).filter(Boolean)) {
    const old = elem.getAttribute('style')
    setStyleProperty(elem, 'mix-blend-mode', blend === 'normal' ? null : blend)
    if (elem.getAttribute('style') === old) continue
    batch.addSubCommand(new ChangeElementCommand(elem, { style: old }))
    changed.push(elem)
  }
  if (batch.isEmpty()) return null
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', changed)
  return batch
}

/**
 * The layer, or the group being edited, where new objects go, when it is
 * locked: nothing is drawn into it.
 * @returns {Element|null}
 */
export const lockedDrawingTarget = () => {
  const target = svgCanvas.getCurrentGroup?.() || svgCanvas.getCurrentDrawing().getCurrentLayer()
  return target && isLocked(target) ? target : null
}

/**
 * @function module:structure.init
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.isLocked = isLocked
  canvas.isLockedSelf = isLockedSelf
  canvas.setLocked = setLocked
  canvas.setElementsVisible = setVisible
  canvas.findMarked = findMarked
  canvas.getElementTitle = getTitle
  canvas.setElementTitle = setTitle
  canvas.moveElementsTo = moveElementsTo
  canvas.lockedDrawingTarget = lockedDrawingTarget
  canvas.getBlendMode = getBlendMode
  canvas.setLayerStyle = setLayerStyle
  canvas.setBlendModes = setBlendModes
}
