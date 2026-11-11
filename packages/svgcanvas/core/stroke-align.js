/**
 * Position of the stroke (lot Propriétés), as in Figma: centred on the
 * outline, as SVG draws it, inside the shape or outside it.
 *
 * SVG has no such property: the stroke is drawn twice as wide and the half
 * that should not show is hidden. Inside, the shape clips it (`clip-path`).
 * Outside, it goes under the fill (`paint-order: stroke`); a shape without
 * fill has its inside cut out by a mask instead. Any software shows the same
 * drawing.
 *
 * The element keeps its position in `data-se-stroke-align` and twice its
 * weight in `stroke-width`, which the inspector halves. The clip and the mask
 * are copies of its outline in the defs, named after it: they are made again
 * whenever the element changes (move, resize, nodes, paint, undo, paste,
 * duplicate, opening a file), and go when no element uses them any more.
 * @module stroke-align
 */

import { BatchCommand, ChangeElementCommand } from './history.js'
import { NS } from './namespaces.js'
import { findDefs } from './utilities.js'

let svgCanvas = null

export const ALIGN_ATTR = 'data-se-stroke-align'
export const STROKE_ALIGNS = ['center', 'inside', 'outside']
/** Class of the clips and masks this module makes. */
export const DEF_CLASS = 'se-stroke-align'
const DEF_PREFIX = 'se_stroke_'

/** The shapes that have an inside, and the attributes of their outline. */
const OUTLINE = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  polygon: ['points'],
  polyline: ['points'],
  path: ['d']
}

/** Attributes whose change may change the clip or the mask. */
const WATCHED = [ALIGN_ATTR, 'id', 'fill', 'fill-opacity', 'fill-rule', 'style', 'stroke-width', 'clip-path', 'mask',
  'paint-order', 'transform', ...new Set(Object.values(OUTLINE).flat())]

/**
 * @param {Element} elem
 * @returns {boolean} Whether the stroke of the element can go inside or outside
 */
export const takesStrokeAlign = (elem) => Boolean(elem?.tagName && OUTLINE[elem.tagName])

/**
 * @param {Element} elem
 * @returns {"center"|"inside"|"outside"}
 */
export const getStrokeAlign = (elem) => {
  const value = elem?.getAttribute?.(ALIGN_ATTR)
  return value === 'inside' || value === 'outside' ? value : 'center'
}

/**
 * @param {Element} elem
 * @returns {string} The id of the clip or the mask of the element
 */
export const defIdOf = (elem) => `${DEF_PREFIX}${String(elem.id || '').replace(/[^\w-]/g, '_')}`

/**
 * @param {string|null} value A `clip-path` or `mask`
 * @param {Document} [doc]
 * @returns {boolean} Whether it is one of this module, or a copy of one (a
 *   duplicate takes a copy of the clip of its original)
 */
const isOwn = (value, doc = svgCanvas?.getSvgContent?.()?.ownerDocument) => {
  const match = /^url\(\s*#([^)\s]+)\s*\)$/.exec(String(value ?? '').trim())
  if (!match) return false
  return match[1].startsWith(DEF_PREFIX) || Boolean(doc?.getElementById(match[1])?.classList?.contains(DEF_CLASS))
}

/**
 * @param {Element} elem
 * @param {string} name
 * @returns {string|null} The value as drawn: a rule, the style attribute or
 *   the attribute
 */
const styled = (elem, name) => svgCanvas?.getStyledValue?.(elem, name)?.value ?? elem.getAttribute(name)

/**
 * @param {Element} elem
 * @returns {boolean} Whether the element shows a fill
 */
export const hasFill = (elem) => {
  const fill = (styled(elem, 'fill') ?? '').trim()
  if (fill === 'none' || fill === 'transparent') return false
  const opacity = Number.parseFloat(styled(elem, 'fill-opacity'))
  return !(Number.isFinite(opacity) && opacity <= 0)
}

/**
 * Whether the element has a clip or a mask of its own, which the position of
 * the stroke must not replace.
 * @param {Element} elem
 * @returns {boolean}
 */
export const hasForeignClip = (elem) => ['clip-path', 'mask'].some((name) => {
  const value = elem.getAttribute(name)
  return value !== null && value !== '' && value !== 'none' && !isOwn(value)
})

/**
 * The weight of the stroke, as the inspector shows it: its width, halved
 * when the stroke is inside or outside.
 * @param {Element} elem
 * @returns {number}
 */
export const strokeWeightOf = (elem) => {
  const width = Number.parseFloat(styled(elem, 'stroke-width'))
  const drawn = Number.isFinite(width) ? width : 1
  return getStrokeAlign(elem) === 'center' ? drawn : drawn / 2
}

/**
 * What the element needs to show its stroke where it goes.
 * @param {Element} elem
 * @returns {{"clip-path": string|null, mask: string|null, "paint-order": string|null}}
 */
export const derivedOf = (elem) => {
  const align = takesStrokeAlign(elem) ? getStrokeAlign(elem) : 'center'
  const url = `url(#${defIdOf(elem)})`
  const filled = hasFill(elem)
  return {
    'clip-path': align === 'inside' ? url : null,
    mask: align === 'outside' && !filled ? url : null,
    'paint-order': align === 'outside' && filled ? 'stroke' : null
  }
}

/**
 * Gives an element exactly these attributes: the others go (svgedit
 * translates the clips of a group it moves, which the copy must not keep).
 * @param {Element} el
 * @param {Record<string, string|null>} attrs
 * @returns {void}
 */
const assign = (el, attrs) => {
  for (const { name } of [...el.attributes]) {
    if (!(name in attrs) || attrs[name] === null) el.removeAttribute(name)
  }
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== null && el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value))
  }
}

/**
 * A copy of the outline of the element, for a clip or a mask.
 * @param {Element} elem
 * @param {Element|null} copy The copy to update, if it has the same tag
 * @param {Record<string, string|null>} extra Its other attributes
 * @returns {Element}
 */
const outlineOf = (elem, copy, extra) => {
  const out = copy?.tagName === elem.tagName ? copy : elem.ownerDocument.createElementNS(NS.SVG, elem.tagName)
  assign(out, { ...Object.fromEntries(OUTLINE[elem.tagName].map((name) => [name, elem.getAttribute(name)])), ...extra })
  return out
}

/**
 * The area of a mask: the box of the element, and the stroke around it.
 * @param {Element} elem
 * @returns {{x: number, y: number, width: number, height: number}}
 */
const maskArea = (elem) => {
  let box = null
  try {
    box = elem.getBBox?.()
  } catch (e) {
    box = null
  }
  const width = Number.parseFloat(styled(elem, 'stroke-width'))
  const margin = (Number.isFinite(width) ? width : 1) + 1
  if (!box || !Number.isFinite(box.width) || !Number.isFinite(box.height) || (box.width === 0 && box.height === 0 && box.x === 0 && box.y === 0)) {
    return { x: -1e5, y: -1e5, width: 2e5, height: 2e5 }
  }
  const round = (v) => Math.round(v * 1000) / 1000
  return {
    x: round(box.x - margin),
    y: round(box.y - margin),
    width: round(box.width + 2 * margin),
    height: round(box.height + 2 * margin)
  }
}

/**
 * Makes or updates the clip or the mask of an element, and the attributes
 * that use it; an element whose stroke is centred loses those of this
 * module. Changes nothing that is already right.
 * @param {Element} elem
 * @returns {void}
 */
export const syncStrokeAlign = (elem) => {
  if (!elem?.isConnected || !elem.id) return
  const derived = derivedOf(elem)
  // A clip or a mask of its own wins: the stroke stays as it is drawn.
  if (hasForeignClip(elem)) return
  for (const [name, value] of Object.entries(derived)) {
    const current = elem.getAttribute(name)
    if (value === null) {
      // Only what this module gave goes: its clip, its mask, the stroke
      // under the fill.
      const own = name === 'paint-order' ? current === 'stroke' : isOwn(current)
      if (own) elem.removeAttribute(name)
    } else if (current !== value) {
      elem.setAttribute(name, value)
    }
  }
  const kind = derived['clip-path'] ? 'clipPath' : derived.mask ? 'mask' : null
  const id = defIdOf(elem)
  const doc = elem.ownerDocument
  let def = doc.getElementById(id)
  if (def && !def.classList.contains(DEF_CLASS)) return
  if (!kind) {
    def?.remove()
    return
  }
  if (def && def.tagName !== kind) {
    def.remove()
    def = null
  }
  if (!def) {
    def = doc.createElementNS(NS.SVG, kind)
    def.id = id
    findDefs().append(def)
  }
  const evenodd = styled(elem, 'fill-rule') === 'evenodd' ? 'evenodd' : null
  if (kind === 'clipPath') {
    assign(def, { id, class: DEF_CLASS, clipPathUnits: 'userSpaceOnUse' })
    const old = def.firstElementChild
    const out = outlineOf(elem, old, { 'clip-rule': evenodd })
    if (out !== old || def.children.length !== 1) def.replaceChildren(out)
    return
  }
  const area = maskArea(elem)
  assign(def, { id, class: DEF_CLASS, maskUnits: 'userSpaceOnUse', ...area })
  let ground = def.firstElementChild
  if (ground?.tagName !== 'rect') ground = doc.createElementNS(NS.SVG, 'rect')
  assign(ground, { fill: '#fff', ...area })
  const old = def.children[1] ?? null
  const out = outlineOf(elem, old, { fill: '#000', 'fill-rule': evenodd })
  if (def.firstElementChild !== ground || def.children[1] !== out || def.children.length !== 2) {
    def.replaceChildren(ground, out)
  }
}

/**
 * Removes the clips and masks of this module that no element uses.
 * @param {Element} content The `svgcontent` element
 * @returns {number} How many went
 */
export const cleanupStrokeDefs = (content) => {
  if (!content) return 0
  const defs = [...content.querySelectorAll(`.${DEF_CLASS}`)].filter((def) => def.localName === 'clipPath' || def.localName === 'mask')
  if (!defs.length) return 0
  const used = new Set()
  for (const elem of content.querySelectorAll('[clip-path], [mask]')) {
    for (const name of ['clip-path', 'mask']) {
      const match = /url\(\s*#([^)\s]+)\s*\)/.exec(elem.getAttribute(name) ?? '')
      if (match) used.add(match[1])
    }
  }
  let removed = 0
  for (const def of defs) {
    if (!used.has(def.id)) {
      def.remove()
      removed++
    }
  }
  return removed
}

/**
 * Makes again the clips and masks of every element of the drawing whose
 * stroke is inside or outside.
 * @param {Element} content The `svgcontent` element
 * @returns {void}
 */
export const syncAllStrokeAligns = (content) => {
  if (!content) return
  for (const elem of content.querySelectorAll(`[${ALIGN_ATTR}]`)) {
    if (!elem.closest('defs')) syncStrokeAlign(elem)
  }
  cleanupStrokeDefs(content)
}

/**
 * The elements a change of the position of the stroke applies to: the
 * shapes selected, those of the selected groups included.
 * @param {Element[]} elems
 * @returns {Element[]}
 */
const shapesOf = (elems) => elems.filter(Boolean).flatMap((elem) => {
  if (elem.tagName === 'g' || elem.tagName === 'a') return [...elem.querySelectorAll('*')].filter(takesStrokeAlign)
  return takesStrokeAlign(elem) ? [elem] : []
})

/**
 * The position the stroke of the elements shares.
 * @param {Element[]} elems
 * @returns {"center"|"inside"|"outside"|"mixed"|null} null when none can take one
 */
export const commonStrokeAlign = (elems) => {
  const shapes = shapesOf(elems)
  if (!shapes.length) return null
  const aligns = new Set(shapes.map(getStrokeAlign))
  return aligns.size === 1 ? [...aligns][0] : 'mixed'
}

const format = (value) => String(Math.round(value * 1000) / 1000)

/**
 * Puts the stroke of the selected shapes inside, outside or on the outline,
 * keeping its weight: one undo step. A shape with a clip or a mask of its
 * own keeps its stroke centred.
 * @param {"center"|"inside"|"outside"} align
 * @param {Element[]} [elems] The selected elements by default
 * @returns {BatchCommand|null}
 */
export const setStrokeAlign = (align, elems) => {
  if (!STROKE_ALIGNS.includes(align)) return null
  const targets = shapesOf(elems ?? svgCanvas.getSelectedElements())
    .filter((elem) => getStrokeAlign(elem) !== align && !hasForeignClip(elem))
  if (!targets.length) return null
  const batch = new BatchCommand('Stroke position')
  const names = [ALIGN_ATTR, 'stroke-width', 'clip-path', 'mask', 'paint-order', 'style']
  for (const elem of targets) {
    const old = Object.fromEntries(names.map((name) => [name, elem.getAttribute(name)]))
    const weight = strokeWeightOf(elem)
    if (align === 'center') elem.removeAttribute(ALIGN_ATTR)
    else elem.setAttribute(ALIGN_ATTR, align)
    svgCanvas.changeSelectedAttributeNoUndo('stroke-width', format(align === 'center' ? weight : weight * 2), [elem])
    syncStrokeAlign(elem)
    const changed = names.filter((name) => elem.getAttribute(name) !== old[name])
    if (changed.length) batch.addSubCommand(new ChangeElementCommand(elem, Object.fromEntries(changed.map((name) => [name, old[name]]))))
  }
  cleanupStrokeDefs(svgCanvas.getSvgContent())
  if (batch.isEmpty()) return null
  svgCanvas.addCommandToHistory(batch)
  svgCanvas.call('changed', targets)
  return batch
}

let observer = null

/**
 * Watches the drawing: an element whose stroke is inside or outside has its
 * clip or its mask made again after each change, in the same task.
 * @param {Element} content The `svgcontent` element
 * @returns {void}
 */
const watch = (content) => {
  observer?.disconnect()
  if (!content || typeof MutationObserver === 'undefined') return
  observer = new MutationObserver((records) => {
    const elems = new Set()
    let removed = false
    for (const record of records) {
      if (record.type === 'attributes') {
        const { target } = record
        if (target.closest?.('defs')) continue
        if (target.hasAttribute(ALIGN_ATTR) || record.attributeName === ALIGN_ATTR) elems.add(target)
      } else {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || node.closest?.('defs')) continue
          if (node.hasAttribute(ALIGN_ATTR)) elems.add(node)
          for (const child of node.querySelectorAll?.(`[${ALIGN_ATTR}]`) ?? []) elems.add(child)
        }
        if ([...record.removedNodes].some((node) => node.nodeType === 1 && !node.classList?.contains(DEF_CLASS))) removed = true
      }
    }
    for (const elem of elems) syncStrokeAlign(elem)
    if (removed || elems.size) cleanupStrokeDefs(content)
  })
  observer.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED })
  syncAllStrokeAligns(content)
}

/**
 * @param {module:svgcanvas.SvgCanvas} canvas
 * @returns {void}
 */
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.getStrokeAlign = getStrokeAlign
  canvas.commonStrokeAlign = commonStrokeAlign
  canvas.setStrokeAlign = setStrokeAlign
  canvas.strokeWeightOf = strokeWeightOf
  canvas.takesStrokeAlign = takesStrokeAlign
  canvas.hasForeignClip = hasForeignClip
  // A file opened replaces the drawing: the new one is watched.
  const setContent = canvas.setSvgContent
  canvas.setSvgContent = function (value) {
    const result = setContent.call(this, value)
    watch(value)
    return result
  }
  watch(canvas.getSvgContent?.())
}
