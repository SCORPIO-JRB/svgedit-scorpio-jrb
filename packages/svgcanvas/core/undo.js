/**
 * Tools for undo.
 * @module undo
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */
import * as draw from './draw.js'
import { NS } from './namespaces.js'
import * as hstry from './history.js'
import { BBOX_AFFECTING_ATTRS } from './history.js'
import {
  getRotationAngle, getBBox as utilsGetBBox, setHref, getStrokedBBoxDefaultVisible, setStyleProperty
} from './utilities.js'
import {
  isGecko
} from '../common/browser.js'
import {
  getTextSource, setTextSource, changesLayout, pinLineHeight, layoutText, cloneContent, sameContent
} from './text-lines.js'
import {
  STYLED_PROPERTIES, readStyleRules, findStyleSource, elementsStyledBy, rewriteStyleSheet, cssValueOf, sameCssValue
} from './style-rules.js'
import {
  transformPoint, transformListToTransform, getTransformList
} from './math.js'

const {
  UndoManager, HistoryEventTypes, ChangeElementCommand, ChangeStyleSheetCommand, setStyleSheetText
} = hstry

let svgCanvas = null

/**
* @function module:undo.init
* @param {module:undo.undoContext} undoContext
* @returns {void}
*/
export const init = (canvas) => {
  svgCanvas = canvas
  canvas.undoMgr = getUndoManager()
}

export const getUndoManager = () => {
  // A batch command forwards the handler to each of its sub-commands, so one
  // undo of a multi-element move used to clear the selection and notify the
  // editor once per sub-command (thousands of full UI refreshes). The handler
  // now tracks the nesting depth: the selection is cleared when the outermost
  // command starts, per-command fix-ups still run for every sub-command, and a
  // single deduplicated `changed` notification is sent when it ends.
  let depth = 0
  let changedElems = null

  const flushChanged = () => {
    const elems = changedElems ? [...changedElems] : []
    changedElems = null
    svgCanvas.pathActions.clear()
    svgCanvas.call('changed', elems)
  }

  return new UndoManager({
    /**
     * Sends the pending `changed` notification if a command threw before
     * completing, so that the next undo or redo starts from a clean state.
     * @returns {void}
     */
    flushHistoryEvents () {
      if (depth === 0) return
      depth = 0
      flushChanged()
    },

    /**
     * @param {string} eventType One of the HistoryEvent types
     * @param {module:history.HistoryCommand} cmd Fulfills the HistoryCommand interface
     * @fires module:undo.SvgCanvas#event:changed
     * @returns {void}
     */
    handleHistoryEvent (eventType, cmd) {
      const EventTypes = HistoryEventTypes
      // TODO: handle setBlurOffsets.
      if (eventType === EventTypes.BEFORE_UNAPPLY || eventType === EventTypes.BEFORE_APPLY) {
        if (depth++ === 0) {
          changedElems = new Set()
          // A path being drawn with the pen is given up first: it is not in
          // the history, and the step may take its layer or group away.
          if (svgCanvas.getDrawnPath?.()) svgCanvas.pathActions.clear()
          // The nodes the pen showed of a shape the step may change (lot Plume).
          svgCanvas.pathActions.dropPenShape?.()
          svgCanvas.clearSelection()
        }
      } else if (eventType === EventTypes.AFTER_APPLY || eventType === EventTypes.AFTER_UNAPPLY) {
        const cmdType = cmd.type()
        const isApply = (eventType === EventTypes.AFTER_APPLY)
        if (cmdType === 'ChangeElementCommand' && cmd.elem === svgCanvas.getSvgContent()) {
          const values = isApply ? cmd.newValues : cmd.oldValues
          if (values.width !== null && values.width !== undefined && values.width !== '') {
            const newContentW = Number(values.width)
            if (Number.isFinite(newContentW) && newContentW > 0) {
              svgCanvas.contentW = newContentW
            }
          }
          if (values.height !== null && values.height !== undefined && values.height !== '') {
            const newContentH = Number(values.height)
            if (Number.isFinite(newContentH) && newContentH > 0) {
              svgCanvas.contentH = newContentH
            }
          }
        }
        // Sub-commands report their own elements, so a batch adds nothing new.
        if (cmdType !== 'BatchCommand') {
          if (!changedElems) changedElems = new Set()
          cmd.elements().forEach((elem) => changedElems.add(elem))
        }
        if (cmdType === 'BatchCommand' && cmd.refreshUseData) {
          svgCanvas.setUseData(svgCanvas.getSvgContent())
        } else if (cmdType === 'MoveElementCommand') {
          const parent = isApply ? cmd.newParent : cmd.oldParent
          if (parent === svgCanvas.getSvgContent()) {
            draw.identifyLayers()
          }
        } else if (cmdType === 'InsertElementCommand' || cmdType === 'RemoveElementCommand') {
          if (cmd.parent === svgCanvas.getSvgContent()) {
            draw.identifyLayers()
          }
          if (cmdType === 'InsertElementCommand') {
            if (isApply) {
              svgCanvas.restoreRefElements(cmd.elem)
            }
          } else if (!isApply) {
            svgCanvas.restoreRefElements(cmd.elem)
          }
          if (cmd.elem?.tagName === 'use') {
            svgCanvas.setUseData(cmd.elem)
          }
        } else if (cmdType === 'ChangeElementCommand') {
          // if we are changing layer names, re-identify all layers
          if (cmd.elem.tagName === 'title' &&
            cmd.elem.parentNode.parentNode === svgCanvas.getSvgContent()
          ) {
            draw.identifyLayers()
          }
          const values = isApply ? cmd.newValues : cmd.oldValues
          // If stdDeviation was changed, update the blur.
          if (values.stdDeviation) {
            svgCanvas.setBlurOffsets(cmd.elem.parentNode, values.stdDeviation)
          }
          // The spans of a text follow a change of its x or y; a step that
          // put back the content of the text (its lines) has nothing to move.
          const delta = (name) => {
            if (!(name in cmd.oldValues)) return 0
            const d = Number(cmd.newValues[name]) - Number(cmd.oldValues[name])
            return Number.isFinite(d) ? d : 0
          }
          const [dx, dy] = [delta('x'), delta('y')]
          if (cmd.elem.tagName === 'text' && !cmd.oldContent && (dx || dy)) {
            const tspans = cmd.elem.children

            const sign = eventType === EventTypes.AFTER_UNAPPLY ? -1 : 1
            for (const tspan of tspans) {
              // Only the places a span has (a span without x follows the text)
              for (const [name, d] of [['x', dx], ['y', dy]]) {
                const value = Number(tspan.getAttribute(name))
                if (d && tspan.hasAttribute(name) && Number.isFinite(value)) {
                  tspan.setAttribute(name, value + sign * d)
                }
              }
            }
          }
        }

        depth = Math.max(0, depth - 1)
        if (depth === 0) {
          flushChanged()
        }
      }
    }
  })
}

/**
* Hack for Firefox bugs where text element features aren't updated or get
* messed up. See issue 136 and issue 137.
* This function clones the element and re-selects it.
* @function module:svgcanvas~ffClone
* @todo Test for this bug on load and add it to "support" object instead of
* browser sniffing
* @param {Element} elem - The (text) DOM element to clone
* @returns {Element} Cloned element
*/
export const ffClone = (elem) => {
  if (!isGecko()) { return elem }
  const clone = elem.cloneNode(true)
  elem.before(clone)
  elem.remove()
  svgCanvas.selectorManager.releaseSelector(elem)
  svgCanvas.setSelectedElements(0, clone)
  svgCanvas.selectorManager.requestSelector(clone).showGrips(true)
  return clone
}

/**
* Changes a property where its value comes from (lot S2 of the
* simplification audit): in the `style` attribute of an element that sets it
* there, in the rule of a style sheet that gives it. An attribute would
* change nothing on screen, as both win over it. A value the element only
* inherits stays written as its attribute.
* This happens while a change is recorded (changeSelectedAttribute): the
* changes join it, and so make one step. The texts that a rule lays out
* again (several lines, a fixed width) are laid out, whichever they are.
* The editor is told which rules changed (`styleRulesChanged`), to have them
* confirmed.
* A change that makes its own step ("Paste properties", the eyedropper) gives
* `record`, which receives the commands instead (lot S4).
* @function module:svgcanvas.SvgCanvas#changeStyledProperty
* @param {string} attr
* @param {string|Float} newValue
* @param {Element[]} elems
* @param {(cmd: module:history.Command) => void} [record] - The change being
*   recorded by default
* @fires module:svgcanvas.SvgCanvas#event:styleRulesChanged
* @returns {Element[]} The elements whose attribute is still to be written
*/
export const changeStyledProperty = (attr, newValue, elems, record) => {
  const { undoMgr } = svgCanvas
  if (!STYLED_PROPERTIES.has(attr) || (!record && !undoMgr.isRecordingChange()) ||
    newValue === '' || newValue === null || newValue === undefined) return elems
  record ??= (cmd) => undoMgr.recordInChange(cmd)
  const content = svgCanvas.getSvgContent()
  const rules = readStyleRules(content)
  if (!rules.length && !elems.some((elem) => elem?.hasAttribute?.('style'))) return elems
  const rest = []
  const ruled = new Map()
  for (const elem of elems) {
    const source = elem && findStyleSource(elem, attr, rules)
    if (!source) {
      rest.push(elem)
    } else if (source.kind === 'style') {
      if (!source.shorthand && sameCssValue(attr, source.value, newValue)) continue
      const old = elem.getAttribute('style')
      setStyleProperty(elem, attr, cssValueOf(attr, newValue) + (source.important ? ' !important' : ''))
      if (elem.getAttribute('style') !== old) record(new ChangeElementCommand(elem, { style: old }, 'style'))
    } else if (source.shorthand || !sameCssValue(attr, source.value, newValue)) {
      if (!ruled.has(source.rule)) ruled.set(source.rule, source.selector)
    }
  }
  if (!ruled.size) return rest
  const edited = [...ruled.keys()]
  const styled = new Map(edited.map((rule) => [rule, elementsStyledBy(rule, attr, content, rules)]))
  const texts = [...new Set([...styled.values()].flat())].filter((elem) => changesLayout(elem, attr))
  const contents = texts.map((text) => {
    const before = cloneContent(text)
    pinLineHeight(text)
    return before
  })
  const commands = []
  for (const style of new Set(edited.map((rule) => rule.style))) {
    const oldText = style.textContent
    const edits = edited.filter((rule) => rule.style === style).map((rule) => ({ rule, prop: attr, value: newValue }))
    const text = rewriteStyleSheet(oldText, edits)
    if (text === oldText) continue
    setStyleSheetText(style, text)
    const cmd = new ChangeStyleSheetCommand(style, oldText, `Change ${attr}`)
    record(cmd)
    commands.push(cmd)
  }
  texts.forEach((text, i) => {
    layoutText(text)
    if (!sameContent(contents[i], text)) record(new ChangeElementCommand(text, {}, attr, contents[i]))
  })
  const selected = svgCanvas.getSelectedElements().filter(Boolean)
  setTimeout(() => {
    selected.forEach((elem) => { if (elem.parentNode) svgCanvas.selectorManager.requestSelector(elem).resize() })
  }, 0)
  if (commands.length) {
    /**
     * Rules of the style sheets were rewritten instead of attributes.
     * @event module:svgcanvas.SvgCanvas#event:styleRulesChanged
     * @type {{property: string, value: string, rules: Array<{selector: string, count: Integer}>, commands: module:history.ChangeStyleSheetCommand[]}}
     */
    svgCanvas.call('styleRulesChanged', {
      property: attr,
      value: String(newValue),
      rules: edited.map((rule) => ({ selector: ruled.get(rule), count: styled.get(rule).length })),
      commands
    })
  }
  return rest
}

/**
* This function makes the changes to the elements. It does not add the change
* to the history stack.
* @param {string} attr - Attribute name
* @param {string|Float} newValue - String or number with the new attribute value
* @param {Element[]} elems - The DOM elements to apply the change to
* @returns {void}
*/
export const changeSelectedAttributeNoUndoMethod = (attr, newValue, elems) => {
  if (attr === 'id') {
    // if the user is changing the id, then de-select the element first
    // change the ID, then re-select it with the new ID
    // as this change can impact other extensions, a 'renamedElement' event is thrown
    const elem = elems[0]
    const oldId = elem.id
    if (oldId !== newValue) {
      svgCanvas.clearSelection()
      elem.id = newValue
      svgCanvas.addToSelection([elem], true)
      svgCanvas.call('elementRenamed', { elem, oldId, newId: newValue })
    }
    return
  }
  const selectedElements = svgCanvas.getSelectedElements()
  const zoom = svgCanvas.getZoom()
  if (svgCanvas.getCurrentMode() === 'pathedit') {
    // Editing node
    svgCanvas.pathActions.moveNode(attr, newValue)
  }
  elems = changeStyledProperty(attr, newValue, elems ?? selectedElements)
  let i = elems.length
  const noXYElems = ['g', 'polyline', 'path']

  while (i--) {
    let elem = elems[i]
    if (!elem) { continue }

    // Set x,y vals on elements that don't have them
    if ((attr === 'x' || attr === 'y') && noXYElems.includes(elem.tagName)) {
      const bbox = getStrokedBBoxDefaultVisible([elem])
      const diffX = attr === 'x' ? parseFloat(newValue) - bbox.x : 0
      const diffY = attr === 'y' ? parseFloat(newValue) - bbox.y : 0
      svgCanvas.moveSelectedElements(diffX * zoom, diffY * zoom, true)
      continue
    }

    let oldval = attr === '#text' ? getTextSource(elem) : elem.getAttribute(attr)
    if (!oldval) { oldval = '' }
    if (oldval !== String(newValue)) {
      // A text of several lines, or of a fixed width, is laid out again after
      // a change of its font, place or width: its line height is read from
      // its lines before (texts of several lines).
      const relayout = changesLayout(elem, attr)
      if (relayout) pinLineHeight(elem)
      if (attr === '#text') {
        // const oldW = utilsGetBBox(elem).width;
        if (elem.localName === 'text') {
          setTextSource(elem, newValue)
        } else {
          elem.textContent = newValue
        }

        // FF bug occurs on on rotated elements
        if ((/rotate/).test(elem.getAttribute('transform'))) {
          elem = ffClone(elem)
        }
        // Hoped to solve the issue of moving text with text-anchor="start",
        // but this doesn't actually fix it. Hopefully on the right track, though. -Fyrd
      } else if (attr === '#href') {
        setHref(elem, newValue)
      } else if (attr.startsWith('se:')) {
        // An attribute of the editor (the width of a text, its line height)
        if (newValue || typeof newValue === 'number') {
          elem.setAttributeNS(NS.SE, attr, String(newValue))
        } else {
          elem.removeAttributeNS(NS.SE, attr.slice(3))
        }
      } else if (newValue) {
        // Number(), unlike parseFloat(), rejects a value with a trailing unit suffix
        // (e.g. "10pt", "2px") instead of silently truncating it to a bare number.
        const asNumber = Number(newValue)
        elem.setAttribute(attr, Number.isNaN(asNumber) ? newValue : asNumber)
      } else if (typeof newValue === 'number') {
        elem.setAttribute(attr, newValue)
      } else {
        elem.removeAttribute(attr)
      }
      if (relayout && attr !== '#text') layoutText(elem)

      // Go into "select" mode for text changes
      // NOTE: Important that this happens AFTER elem.setAttribute() or else attributes like
      // font-size can get reset to their old value, ultimately by svgEditor.updateContextPanel(),
      // after calling textActions.toSelectMode() below
      if (svgCanvas.getCurrentMode() === 'textedit' && attr !== '#text' && elem.textContent.length) {
        svgCanvas.textActions.toSelectMode(elem)
      }

      // Use the Firefox ffClone hack for text elements with gradients or
      // where other text attributes are changed.
      if (isGecko() &&
        elem.nodeName === 'text' &&
        (/rotate/).test(elem.getAttribute('transform')) &&
        (String(newValue).startsWith('url') || (['font-size', 'font-family', 'x', 'y'].includes(attr) && elem.textContent))) {
        elem = ffClone(elem)
      }
      // Timeout needed for Opera & Firefox
      // codedread: it is now possible for this to be called with elements
      // that are not in the selectedElements array, we need to only request a
      // selector if the element is in that array
      if (selectedElements.includes(elem)) {
        setTimeout(function () {
          // Due to element replacement, this element may no longer
          // be part of the DOM
          if (!elem.parentNode) { return }
          svgCanvas.selectorManager.requestSelector(elem).resize()
        }, 0)
      }
      // Only recalculate rotation center for attributes that change element geometry.
      // Non-geometric attributes (stroke-width, fill, opacity, etc.) don't affect
      // the bbox center, so the rotation is already correct and must not be touched.
      // BBOX_AFFECTING_ATTRS is imported from history.js to keep the list in one place.
      const angle = getRotationAngle(elem)
      if (angle !== 0 && attr !== 'transform' && BBOX_AFFECTING_ATTRS.has(attr)) {
        const tlist = getTransformList(elem)
        let n = tlist.numberOfItems
        while (n--) {
          const xform = tlist.getItem(n)
          if (xform.type === 4) {
            // Compute bbox BEFORE removing the rotation so we can bail out
            // safely if getBBox returns nothing (avoids losing the rotation).
            const box = utilsGetBBox(elem)
            if (!box) break

            tlist.removeItem(n)

            // Transform bbox center through only the transforms that come
            // AFTER the rotation in the list (not the pre-rotation transforms).
            // After removeItem(n), what was at n+1 is now at n.
            let centerMatrix
            if (n < tlist.numberOfItems) {
              centerMatrix = transformListToTransform(tlist, n, tlist.numberOfItems - 1).matrix
            } else {
              centerMatrix = svgCanvas.getSvgRoot().createSVGMatrix() // identity
            }
            const center = transformPoint(
              box.x + box.width / 2, box.y + box.height / 2, centerMatrix
            )

            const newrot = svgCanvas.getSvgRoot().createSVGTransform()
            newrot.setRotate(angle, center.x, center.y)
            tlist.insertItemBefore(newrot, n)
            break
          }
        }
      }
    } // if oldValue != newValue
  } // for each elem
}

/**
* Change the given/selected element and add the original value to the history stack.
* If you want to change all `selectedElements`, ignore the `elems` argument.
* If you want to change only a subset of `selectedElements`, then send the
* subset to this function in the `elems` argument.
* @function module:svgcanvas.SvgCanvas#changeSelectedAttribute
* @param {string} attr - String with the attribute name
* @param {string|Float} val - String or number with the new attribute value
* @param {Element[]} elems - The DOM elements to apply the change to
* @returns {void}
*/
export const changeSelectedAttributeMethod = (attr, val, elems) => {
  const selectedElements = svgCanvas.getSelectedElements()
  elems = elems || selectedElements
  svgCanvas.undoMgr.beginUndoableChange(attr, elems)

  changeSelectedAttributeNoUndoMethod(attr, val, elems)

  const batchCmd = svgCanvas.undoMgr.finishUndoableChange()
  if (!batchCmd.isEmpty()) {
    // svgCanvas.addCommandToHistory(batchCmd);
    svgCanvas.undoMgr.addCommandToHistory(batchCmd)
  }
}

/**
 * Changes several attributes of the given or selected elements as one undo
 * step: a text style (lot V4) writes its font, size, weight and fill at once.
 * @function module:svgcanvas.SvgCanvas#changeSelectedAttributes
 * @param {Object<string, string|number>} attrs - New values by attribute
 * @param {Element[]} [elems] - The selected elements by default
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {void}
 */
export const changeSelectedAttributesMethod = (attrs, elems) => {
  elems = (elems || svgCanvas.getSelectedElements()).filter(Boolean)
  const entries = Object.entries(attrs ?? {})
  if (!elems.length || !entries.length) { return }
  const batchCmd = new hstry.BatchCommand('Change attributes')
  for (const [attr, val] of entries) {
    svgCanvas.undoMgr.beginUndoableChange(attr, elems)
    changeSelectedAttributeNoUndoMethod(attr, val, elems)
    const cmd = svgCanvas.undoMgr.finishUndoableChange()
    if (!cmd.isEmpty()) { batchCmd.addSubCommand(cmd) }
  }
  if (!batchCmd.isEmpty()) {
    svgCanvas.undoMgr.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', elems)
  }
}

/**
 * Runs a function whose changes go to the history as one step: every command
 * it adds becomes a sub-command of a single batch. A paint (colour, opacity
 * and new gradient) is undone at once this way.
 * @function module:svgcanvas.SvgCanvas#groupHistory
 * @param {string} label - Text of the step
 * @param {(batch: BatchCommand) => void} fn - Its changes; it may also add
 *   commands to the batch itself
 * @returns {BatchCommand} The batch, added to the history unless empty
 */
export const groupHistoryMethod = (label, fn) => {
  const undoMgr = svgCanvas.undoMgr
  const batch = new hstry.BatchCommand(label)
  const own = Object.prototype.hasOwnProperty.call(undoMgr, 'addCommandToHistory')
  const add = undoMgr.addCommandToHistory
  undoMgr.addCommandToHistory = (cmd) => { batch.addSubCommand(cmd) }
  try {
    fn(batch)
  } finally {
    if (own) undoMgr.addCommandToHistory = add
    else delete undoMgr.addCommandToHistory
  }
  if (!batch.isEmpty()) undoMgr.addCommandToHistory(batch)
  return batch
}

/**
 * Gives each element its own new value of an attribute, as one undo step:
 * the change a field showing "Mixed" makes with an expression such as +10.
 * @function module:svgcanvas.SvgCanvas#changeSelectedAttributeEach
 * @param {string} attr - Attribute name
 * @param {(elem: Element) => (string|number|null|undefined)} valueOf - New
 *   value of an element; null or undefined leaves it unchanged
 * @param {Element[]} [elems] - The selected elements by default
 * @fires module:svgcanvas.SvgCanvas#event:changed
 * @returns {void}
 */
export const changeSelectedAttributeEachMethod = (attr, valueOf, elems) => {
  elems = (elems || svgCanvas.getSelectedElements()).filter(Boolean)
  // Every value is computed before any write.
  const values = elems.map((elem) => valueOf(elem))
  const changed = elems.filter((elem, i) => values[i] !== undefined && values[i] !== null)
  if (!changed.length) { return }
  svgCanvas.undoMgr.beginUndoableChange(attr, changed)
  elems.forEach((elem, i) => {
    if (values[i] !== undefined && values[i] !== null) {
      changeSelectedAttributeNoUndoMethod(attr, values[i], [elem])
    }
  })
  const batchCmd = svgCanvas.undoMgr.finishUndoableChange()
  if (!batchCmd.isEmpty()) {
    svgCanvas.undoMgr.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', changed)
  }
}
