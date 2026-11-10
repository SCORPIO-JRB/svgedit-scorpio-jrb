/* eslint-disable max-len */
/* globals seAlert */

import SvgCanvas from '@svgedit/svgcanvas'
import topPanelHTML from './TopPanel.html'
import { commonValueOf, lengthOf, roundForField, strokeWidthOf, styledAttribute } from './panelValues.js'
import { askText } from '../components/askText.js'
import { stepTargets } from '../history-steps.js'
import { renameId, ungroupSelected } from '../binding.js'
import { controlTitle } from '../commands.js'

const { $qa, $id, $click, isValidUnit, getTypeMap, convertUnit } = SvgCanvas

/** Criteria of the "select same" entries of the context menu (M6). */
const SIMILAR_CRITERIA = ['symbol', 'fill', 'stroke']
// Elements alone whose box has W and H fields: they are scaled from its top
// left corner, as by a grip. A text always keeps its proportions. An
// imported file (<use>) is placed and sized by its transform.
const SIZED_ALONE = new Set(['path', 'polyline', 'g', 'text', 'use'])
// Elements alone whose X and Y fields describe their box without the stroke,
// as for a multi-selection and the dimension label: they have no x or y,
// or, for a <use>, an x and a y that its transform moves (the fields showed
// "null" for an import, placed by its transform only).
const POSITIONED_BY_BOX = new Set(['path', 'polyline', 'g', 'use'])
/**
 * The kind of an element for its geometry fields. A polygon of a file is
 * placed and sized by its box, as a polyline (lot S2: it had the angle
 * alone); one of the star and polygon tool, which has its `shape`, keeps
 * the panel of the tool.
 * @param {Element} elem
 * @returns {string|undefined}
 */
const geometryKind = (elem) => elem?.nodeName === 'polygon' && !elem.hasAttribute('shape') ? 'polyline' : elem?.nodeName
// Shapes that can be converted to a path.
const CONVERTIBLE = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
// Text fields of the panel, the attribute each one shows and its default.
const TEXT_FIELDS = [
  ['font_size', 'font-size', null],
  ['tool_letter_spacing', 'letter-spacing', 0],
  ['tool_word_spacing', 'word-spacing', 0],
  ['tool_text_length', 'textLength', 0]
]

/*
 * register actions for left panel
 */
/**
 *
 */
class TopPanel {
  /**
   * @param {PlainObject} editor svgedit handler
   */
  constructor (editor) {
    this.editor = editor
  }

  /**
   * @type {module}
   */
  displayTool (className) {
    // default display is 'none' so removing the property will make the panel visible
    this.getTools(className).forEach(el => el.style.removeProperty('display'))
  }

  /**
   * @type {module}
   */
  hideTool (className) {
    this.getTools(className).forEach(el => {
      el.style.display = 'none'
    })
  }

  /**
   * Returns the top panel elements that carry a class. The search is limited to
   * the top panel and the live collection is cached: the context panel used to
   * scan the whole document, drawing included, about twenty times per update.
   * @param {string} className
   * @returns {Element[]}
   */
  getTools (className) {
    const root = $id('tools_top')
    if (!root) {
      return $qa(`.${className}`)
    }
    if (this.toolsRoot !== root) {
      this.toolsRoot = root
      this.toolCollections = new Map()
    }
    let collection = this.toolCollections.get(className)
    if (!collection) {
      collection = root.getElementsByClassName(className)
      this.toolCollections.set(className, collection)
    }
    // Some callers pass an element id (tool_topath, tool_reorient, image_url,
    // tool_make_link…): they were never hidden or shown before.
    const byId = $id(className)
    return byId && root.contains(byId) && !byId.classList.contains(className)
      ? [...collection, byId]
      : [...collection]
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
  get path () {
    return this.editor.svgCanvas.pathActions
  }

  /**
   *
   * @param {Element} opt
   * @param {boolean} changeElem
   * @returns {void}
   */
  setStrokeOpt (opt, changeElem) {
    const { id } = opt
    const bits = id.split('_')
    const [pre, val] = bits

    if (changeElem) {
      this.svgCanvas.setStrokeAttr('stroke-' + pre, val)
    }
    opt.classList.add('current')
    const elements = Array.prototype.filter.call(
      opt.parentNode.children,
      function (child) {
        return child !== opt
      }
    )
    Array.from(elements).forEach(function (element) {
      element.classList.remove('current')
    })
  }

  /**
   * Updates the toolbar (colors, opacity, etc) based on the selected element.
   * This function also updates the opacity and id elements that are in the
   * context panel.
   * @returns {void}
   */
  update () {
    let i
    let len
    // set title
    this.updateTitle()
    if (this.selectedElement) {
      switch (this.selectedElement.tagName) {
        case 'use':
        case 'image':
        case 'foreignObject':
          break
        case 'g':
        case 'a': {
          // Look for common styles
          const childs = this.selectedElement.getElementsByTagName('*')
          let gWidth = null
          for (i = 0, len = childs.length; i < len; i++) {
            const swidth = lengthOf(styledAttribute(this.editor.svgCanvas, childs[i], 'stroke-width'))

            if (i === 0) {
              gWidth = swidth
            } else if (gWidth !== swidth) {
              gWidth = null
            }
          }

          $id('stroke_width').value = gWidth === null ? '' : gWidth
          this.editor.bottomPanel.updateColorpickers(false)
          break
        }
        default: {
          this.editor.bottomPanel.updateColorpickers(false)

          // As drawn: a rule of the style sheets can give these (lot S2)
          const styled = (name) => styledAttribute(this.editor.svgCanvas, this.selectedElement, name)
          $id('stroke_width').value = strokeWidthOf(this.editor.svgCanvas, this.selectedElement)
          $id('stroke_style').value = styled('stroke-dasharray') || 'none'
          $id('stroke_style').setAttribute('value', $id('stroke_style').value)

          let attr = styled('stroke-linejoin') || 'miter'

          if ($id('linejoin_' + attr)) {
            this.setStrokeOpt($id('linejoin_' + attr))
            $id('stroke_linejoin').setAttribute('value', attr)
          }

          attr = styled('stroke-linecap') || 'butt'
          if ($id('linecap_' + attr)) {
            this.setStrokeOpt($id('linecap_' + attr))
            $id('stroke_linecap').setAttribute('value', attr)
          }
        }
      }
    }

    // All elements including image and group have opacity
    if (this.selectedElement) {
      const opacPerc =
        (styledAttribute(this.editor.svgCanvas, this.selectedElement, 'opacity') || 1.0) * 100
      $id('opacity').value = opacPerc
      $id('elem_id').value = this.selectedElement.id
      $id('elem_class').value = this.selectedElement.getAttribute('class') ?? ''
    }

    this.editor.bottomPanel.updateToolButtonState()
  }

  /**
   * @param {PlainObject} [opts={}]
   * @param {boolean} [opts.cancelDeletes=false]
   * @returns {void} Resolves to `undefined`
   */
  async promptImgURL ({ cancelDeletes = false } = {}) {
    const image = this.editor.selectedElement
    let curhref = this.editor.svgCanvas.getHref(image)
    curhref = curhref.startsWith('data:') ? '' : curhref
    // Asked in place, under the image tool (lot V3: no more prompt()).
    const url = await askText(this.editor, {
      label: this.editor.i18next.t('notification.enterNewImgURL'),
      value: curhref,
      anchor: $id('image_url')?.offsetParent ? $id('image_url') : $id('tool_image'),
      inputType: 'url'
    })
    if (url) {
      if (this.editor.selectedElement !== image && image?.isConnected) {
        this.editor.svgCanvas.selectOnly([image], true)
      }
      this.setImageURL(url)
    } else if (cancelDeletes && image?.isConnected) {
      this.editor.svgCanvas.selectOnly([image], true)
      this.editor.svgCanvas.deleteSelectedElements()
    }
  }

  /**
   * Updates the context panel tools based on the selected element.
   * @returns {void}
   */
  updateContextPanel () {
    let elem = this.editor.selectedElement
    // If element has just been deleted, consider it null
    if (!elem?.parentNode) {
      elem = null
    }
    const currentLayerName = this.editor.svgCanvas
      .getCurrentDrawing()
      .getCurrentLayerName()
    const currentMode = this.editor.svgCanvas.getMode()
    const unit =
      this.editor.configObj.curConfig.baseUnit !== 'px'
        ? this.editor.configObj.curConfig.baseUnit
        : null

    const isNode = currentMode === 'pathedit'
    const menuItems = document.getElementById('se-cmenu_canvas')
    this.hideTool('selected_panel')
    this.hideTool('angle_panel')
    this.hideTool('multiselected_panel')
    // The Align menu of the canvas layout takes one object too (lot S1): it
    // stays open while that object is aligned.
    if (!this.multiselected && !(elem && this.editor.layout?.canvas)) { this.setAlignMenu(false) }
    this.hideTool('g_panel')
    this.hideTool('rect_panel')
    this.hideTool('circle_panel')
    this.hideTool('ellipse_panel')
    this.hideTool('line_panel')
    this.hideTool('text_panel')
    this.hideTool('image_panel')
    this.hideTool('container_panel')
    this.hideTool('use_panel')
    this.hideTool('a_panel')
    this.hideTool('xy_panel')
    this.hideTool('wh_panel')
    this.hideTool('scale_panel')
    if (elem) {
      const elname = elem.nodeName
      const kind = geometryKind(elem)

      const angle = this.editor.svgCanvas.getRotationAngle(elem)
      $id('angle').value = angle

      const blurval = this.editor.svgCanvas.getBlur(elem) * 10
      $id('blur').value = blurval

      if (
        this.editor.svgCanvas.addedNew &&
        elname === 'image' &&
        this.editor.svgCanvas.getMode() === 'image' &&
        !this.editor.svgCanvas.getHref(elem).startsWith('data:')
      ) {
        /* await */ this.promptImgURL({ cancelDeletes: true })
      }

      if (!isNode && currentMode !== 'pathedit') {
        this.displayTool('selected_panel')
        this.displayTool('angle_panel')
        // Elements in this array already have coord fields
        if (['line', 'circle', 'ellipse', 'polygon'].includes(kind)) {
          this.hideTool('xy_panel')
        } else if (POSITIONED_BY_BOX.has(kind)) {
          // The box without the stroke, as for a multi-selection.
          this.showSelectionPosition(this.editor.svgCanvas.getSelectionBox?.([elem]))
        } else {
          let x
          let y

          x = elem.getAttribute('x')
          y = elem.getAttribute('y')

          if (unit) {
            x = convertUnit(x)
            y = convertUnit(y)
          }
          /**
           * Updates the value of an input field if needed
           * @param {string} id - The ID of the input element to be updated.
           * @param {number} newValue - The new numeric value to set in the input field.
           */
          const updateValue = (id, newValue) => {
            const currentValue = $id(id).value // Get current value from the field
            // do nothing if nothing changed...
            if (parseFloat(currentValue) === newValue) {
              return
            }
            $id(id).value = newValue
          }

          updateValue('selected_x', x)
          updateValue('selected_y', y)

          this.displayTool('xy_panel')
        }
        // W and H of a path, a group or a text alone.
        if (SIZED_ALONE.has(kind)) {
          this.showSelectionSize(this.editor.svgCanvas.getSelectionBox?.([elem]), elname === 'text')
        }

        // Elements in this array cannot be converted to a path
        if (['image', 'text', 'path', 'g', 'use'].includes(elname)) {
          this.hideTool('tool_topath')
        } else {
          this.displayTool('tool_topath')
        }
        if (elname === 'path') {
          this.displayTool('tool_reorient')
        } else {
          this.hideTool('tool_reorient')
        }
        $id('tool_reorient').disabled = angle === 0
      } else {
        const point = this.path.getNodePoint()
        $id('tool_add_subpath').pressed = false
        !this.path.canDeleteNodes
          ? $id('tool_node_delete').classList.add('disabled')
          : $id('tool_node_delete').classList.remove('disabled')

        // Show open/close button based on selected point
        // setIcon('#tool_openclose_path', path.closed_subpath ? 'open_path' : 'close_path');

        if (point) {
          const segType = $id('seg_type')
          if (unit) {
            point.x = convertUnit(point.x)
            point.y = convertUnit(point.y)
          }
          $id('path_node_x').value = point.x
          $id('path_node_y').value = point.y
          if (point.type) {
            segType.value = point.type
            segType.removeAttribute('disabled')
          } else {
            segType.value = 4
            segType.setAttribute('disabled', 'disabled')
          }
        }
        return
      }

      // update contextual tools here
      const panels = {
        g: [],
        a: [],
        rect: ['rx', 'width', 'height'],
        image: ['width', 'height'],
        circle: ['cx', 'cy', 'r'],
        ellipse: ['cx', 'cy', 'rx', 'ry'],
        line: ['x1', 'y1', 'x2', 'y2'],
        text: [],
        use: []
      }

      const { tagName } = elem

      let linkHref = null
      if (tagName === 'a') {
        linkHref = this.editor.svgCanvas.getHref(elem)
        this.displayTool('g_panel')
      }
      // siblings
      if (elem.parentNode) {
        const selements = Array.prototype.filter.call(
          elem.parentNode.children,
          function (child) {
            return child !== elem
          }
        )
        if (elem.parentNode.tagName === 'a' && !selements.length) {
          this.displayTool('a_panel')
          linkHref = this.editor.svgCanvas.getHref(elem.parentNode)
        }
      }

      // Hide/show the make_link buttons
      if (linkHref) {
        this.displayTool('tool_make_link')
        this.displayTool('tool_make_link_multi')
        $id('link_url').value = linkHref
      } else {
        this.hideTool('tool_make_link')
        this.hideTool('tool_make_link_multi')
      }

      if (panels[tagName]) {
        const curPanel = panels[tagName]
        this.displayTool(tagName + '_panel')

        curPanel.forEach(item => {
          let attrVal = elem.getAttribute(item)
          if (this.editor.configObj.curConfig.baseUnit !== 'px' && elem[item]) {
            const bv = elem[item].baseVal.value
            attrVal = convertUnit(bv)
          }
          $id(`${tagName}_${item}`).value = attrVal || 0
        })

        if (tagName === 'text') {
          this.displayTool('text_panel')
          $id('tool_italic').pressed = this.editor.svgCanvas.getItalic()
          $id('tool_bold').pressed = this.editor.svgCanvas.getBold()
          $id('tool_text_decoration_underline').pressed =
            this.editor.svgCanvas.hasTextDecoration('underline')
          $id('tool_text_decoration_linethrough').pressed =
            this.editor.svgCanvas.hasTextDecoration('line-through')
          $id('tool_text_decoration_overline').pressed =
            this.editor.svgCanvas.hasTextDecoration('overline')
          const styled = (name) => styledAttribute(this.editor.svgCanvas, elem, name)
          $id('tool_font_family').value = styled('font-family')
          $id('tool_text_anchor').setAttribute(
            'value',
            elem.getAttribute('text-anchor')
          )
          $id('font_size').value = styled('font-size')
          $id('tool_letter_spacing').value = styled('letter-spacing') ?? 0
          $id('tool_word_spacing').value = styled('word-spacing') ?? 0
          $id('tool_line_height').value = this.editor.svgCanvas.getLineHeight()
          // A text of fixed width can become as wide as its lines again
          $id('tool_text_auto_width').disabled = !this.editor.svgCanvas.getTextWidth()
          $id('tool_text_length').value = elem.getAttribute('textLength') ?? 0
          $id('tool_length_adjust').value =
            elem.getAttribute('lengthAdjust') ?? 0
          // The lines of the text, separated by "\n"
          $id('text').value = this.editor.svgCanvas.getText()
          if (this.editor.svgCanvas.addedNew) {
            // Timeout needed for IE9
            setTimeout(() => {
              $id('text').focus()
              $id('text').select()
            }, 100)
          }
          // text
        } else if (
          tagName === 'image' &&
          this.editor.svgCanvas.getMode() === 'image'
        ) {
          this.editor.svgCanvas.setImageURL(this.editor.svgCanvas.getHref(elem))
          // image
        } else if (tagName === 'g' || tagName === 'use') {
          this.displayTool('container_panel')
          const title = this.editor.svgCanvas.getTitle()
          const label = $id('g_title')
          label.value = title
          $id('g_title').disabled = tagName === 'use'
        }
      }
      menuItems.setAttribute(
        // A <use> referencing a local <symbol> is how imported SVG content
        // is represented, and is ungroupable just like a <g> (see
        // ungroupSelectedElement()); it shouldn't be locked out of the menu.
        (tagName === 'g' || tagName === 'use' ? 'en' : 'dis') + 'ablemenuitems',
        '#ungroup'
      )
      menuItems.setAttribute(
        (tagName === 'g' || !this.multiselected ? 'dis' : 'en') +
          'ablemenuitems',
        '#group'
      )

      // if (elem)
    } else if (this.multiselected && this.editor.svgCanvas.getSelectedElements().filter(Boolean).length > 1) {
      const selElems = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
      // Check if all selected elements are 'text' nodes, if yes enable text panel
      if (selElems.every(elem => elem.tagName === 'text')) {
        this.displayTool('text_panel')
      }

      this.displayTool('multiselected_panel')
      // The angle of the frame: a value typed turns the whole selection
      // about its center.
      this.displayTool('angle_panel')
      this.updateSelectionAngle()
      // X, Y, W and H of the box of the whole selection, and the values
      // the elements share.
      this.displayTool('xy_panel')
      this.displayTool('wh_panel')
      this.scheduleSelectionFields()
      if (selElems.some(elem => CONVERTIBLE.has(elem.tagName))) {
        this.displayTool('tool_topath_multi')
      } else {
        this.hideTool('tool_topath_multi')
      }
      menuItems.setAttribute('enablemenuitems', '#group')
      menuItems.setAttribute('disablemenuitems', '#ungroup')
    } else {
      menuItems.setAttribute(
        'disablemenuitems',
        '#delete,#cut,#copy,#group,#ungroup,#move_front,#move_up,#move_down,#move_back'
      )
    }
    // The Scale tool (K): its panel takes the place of the W and H fields.
    if (this.editor.svgCanvas.isScaleTool?.() && (elem || this.multiselected) && !isNode) {
      this.hideTool('wh_panel')
      this.displayTool('scale_panel')
      this.scheduleScaleFields()
    } else {
      this.scaleBase = null
    }
    // Objects that look the same as the selection: same symbol for a <use>,
    // same fill or stroke for a shape or a text.
    SIMILAR_CRITERIA.forEach((criterion) => {
      menuItems.setItemEnabled?.(
        `select_same_${criterion}`,
        !isNode && this.editor.svgCanvas.canSelectSimilar(criterion)
      )
    })
    // Copy and paste properties (M7)
    this.editor.updatePropertiesMenu?.()

    // update history buttons
    $id('tool_undo').disabled =
      this.editor.svgCanvas.undoMgr.getUndoStackSize() === 0
    $id('tool_redo').disabled =
      this.editor.svgCanvas.undoMgr.getRedoStackSize() === 0

    this.editor.svgCanvas.addedNew = false

    if ((elem && !isNode) || this.multiselected) {
      // update the selected elements' layer
      $id('selLayerNames').removeAttribute('disabled')
      $id('selLayerNames').value = currentLayerName
      $id('selLayerNames').setAttribute('value', currentLayerName)

      // Enable regular menu options
      const canCMenu = document.getElementById('se-cmenu_canvas')
      canCMenu.setAttribute(
        'enablemenuitems',
        '#delete,#cut,#copy,#move_front,#move_up,#move_down,#move_back'
      )
    } else {
      $id('selLayerNames').setAttribute('disabled', 'disabled')
    }
    // The inspector of the canvas layout hides the sections where nothing
    // applies (lot V3).
    this.editor.layout?.selectionChanged()
  }

  /**
   * @param {Event} [e] Not used.
   * @param {boolean} forSaving
   * @returns {void}
   */
  showSourceEditor (e, forSaving) {
    const $editorDialog = document.getElementById('se-svg-editor-dialog')
    if ($editorDialog.getAttribute('dialog') === 'open') return
    const origSource = this.editor.svgCanvas.getSvgString()
    $editorDialog.setAttribute('dialog', 'open')
    $editorDialog.setAttribute('value', origSource)
    $editorDialog.setAttribute('copysec', Boolean(forSaving))
    $editorDialog.setAttribute('applysec', !forSaving)
  }

  /**
   *
   * @returns {void}
   */
  clickWireframe () {
    $id('tool_wireframe').pressed = !$id('tool_wireframe').pressed
    this.editor.workarea.classList.toggle('wireframe')

    const wfRules = $id('wireframe_rules')
    if (!wfRules) {
      const fcRules = document.createElement('style')
      fcRules.setAttribute('id', 'wireframe_rules')
      document.getElementsByTagName('head')[0].appendChild(fcRules)
    } else {
      while (wfRules.firstChild) {
        wfRules.removeChild(wfRules.firstChild)
      }
    }
    this.editor.updateWireFrame()
  }

  /**
   *
   * @returns {void}
   */
  clickUndo () {
    const { undoMgr } = this.editor.svgCanvas
    if (undoMgr.getUndoStackSize() > 0) {
      this.goToHistory(undoMgr.getUndoStackSize() - 1)
    }
  }

  /**
   *
   * @returns {void}
   */
  clickRedo () {
    const { undoMgr } = this.editor.svgCanvas
    if (undoMgr.getRedoStackSize() > 0) {
      this.goToHistory(undoMgr.getUndoStackSize() + 1)
    }
  }

  /**
   * Undoes or redoes steps until `index` of them are applied (the History
   * menu of lot V5). In the canvas layout, the objects of the last step
   * undone or redone that are still in the drawing are then selected.
   * @param {number} index - 0 for the document as opened
   * @returns {void}
   */
  goToHistory (index) {
    const { svgCanvas } = this.editor
    const { undoMgr, textActions } = svgCanvas
    const steps = undoMgr.getSteps()
    const target = Math.max(0, Math.min(index, steps.length))
    let last = null
    while (undoMgr.getUndoStackSize() > target) {
      last = steps[undoMgr.getUndoStackSize() - 1]
      undoMgr.undo()
    }
    while (undoMgr.getUndoStackSize() < target) {
      last = steps[undoMgr.getUndoStackSize()]
      undoMgr.redo()
    }
    if (!last) return
    this.editor.layersPanel.populateLayers()
    if (svgCanvas.getMode() === 'textedit') {
      textActions.clear()
    }
    if (this.editor.layout?.canvas) {
      const targets = stepTargets(last)
      if (targets.length) svgCanvas.selectElements(targets)
    }
  }

  /**
   * @type {module}
   */
  changeRectRadius (e) {
    this.editor.svgCanvas.setRectRadius(e.target.value)
  }

  /**
   * @type {module}
   */
  changeFontSize (e) {
    if (e.detail?.relative) {
      this.changeEachAttribute(e.detail.relative, 'font-size', this.selectedTexts(), null)
      return
    }
    this.editor.svgCanvas.setFontSize(e.target.value)
  }

  /**
   * @returns {Element[]} The selected texts
   */
  selectedTexts () {
    return this.editor.svgCanvas.getSelectedElements().filter(el => el?.tagName === 'text')
  }

  /**
   * Shows in the angle field the angle of the frame of a multi-selection: the
   * angle its elements share, otherwise the rotations applied since it was
   * selected, or "Mixed".
   * @returns {void}
   */
  updateSelectionAngle () {
    const angle = this.editor.svgCanvas.getSelectionAngle?.()
    if (angle === null || angle === undefined) {
      $id('angle').mixed = true
    } else {
      $id('angle').value = angle
    }
  }

  /**
   * Value of a length shown in a field: in the document's unit, rounded.
   * @param {number} px
   * @returns {number}
   */
  toField (px) {
    return roundForField(this.inUnit(px))
  }

  /**
   * Length in the document's unit, not rounded.
   * @param {number} px
   * @returns {number}
   */
  inUnit (px) {
    const { baseUnit } = this.editor.configObj.curConfig
    return baseUnit !== 'px' ? px / getTypeMap()[baseUnit] : px
  }

  /**
   * Length typed in a field, in the drawing's units.
   * @param {string|number} value - In the document's unit
   * @returns {number}
   */
  fromField (value) {
    const { baseUnit } = this.editor.configObj.curConfig
    const number = Number(value)
    return baseUnit !== 'px' ? number * getTypeMap()[baseUnit] : number
  }

  /**
   * Fills the fields of a multi-selection (X, Y, W and H of its box, and
   * the values its elements share) once the next frame is drawn and the
   * browser is idle, once for all the changes of this frame. The boxes of
   * the elements are then read from a layout already done: read between the
   * writes of a selection change, they would force a layout of the whole
   * drawing (a rectangle selection changes the selection at each move). The
   * fields never delay what the canvas shows.
   * @returns {void}
   */
  scheduleSelectionFields () {
    if (this.selectionFieldsPending) { return }
    this.selectionFieldsPending = true
    const run = () => {
      this.selectionFieldsPending = false
      this.showSelectionFields()
    }
    requestAnimationFrame(() => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 100 })
      } else {
        setTimeout(run, 0)
      }
    })
  }

  /**
   * Fills the fields of a multi-selection now (see scheduleSelectionFields).
   * @returns {void}
   */
  showSelectionFields () {
    if (!this.multiselected) { return }
    const elements = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    if (elements.length < 2) { return }
    // Read once for the four fields.
    const box = this.editor.svgCanvas.getSelectionBox?.(elements)
    this.showSelectionPosition(box)
    this.showSelectionSize(box, false)
    this.editor.bottomPanel.showCommonValues(elements)
    if (elements.every(elem => elem.tagName === 'text')) {
      this.showCommonTextValues(elements)
    }
  }

  /**
   * Shows X and Y of the box of a multi-selection, stroke excluded.
   * @param {module:utilities.BBoxObject|null} box - From getSelectionBox
   * @returns {void}
   */
  showSelectionPosition (box) {
    if (!box) { return }
    this.shownPosition = { x: String(this.toField(box.x)), y: String(this.toField(box.y)) }
    $id('selected_x').value = this.shownPosition.x
    $id('selected_y').value = this.shownPosition.y
    // Expressions such as +10 apply to the exact values.
    $id('selected_x').preciseValue = this.inUnit(box.x)
    $id('selected_y').preciseValue = this.inUnit(box.y)
    this.displayTool('xy_panel')
  }

  /**
   * Shows W and H of the box of a multi-selection, or of a path, a group or
   * a text alone, and the proportion lock.
   * @param {module:utilities.BBoxObject|null} box - From getSelectionBox
   * @param {boolean} ratioForced - The proportions are always kept (a text)
   * @returns {void}
   */
  showSelectionSize (box, ratioForced) {
    if (!box) { return }
    this.shownSize = { w: String(this.toField(box.width)), h: String(this.toField(box.height)) }
    $id('selected_w').value = this.shownSize.w
    $id('selected_h').value = this.shownSize.h
    $id('selected_w').preciseValue = this.inUnit(box.width)
    $id('selected_h').preciseValue = this.inUnit(box.height)
    this.ratioForced = ratioForced
    const lock = $id('tool_ratio_lock')
    lock.pressed = ratioForced || Boolean(this.keepRatio)
    lock.disabled = ratioForced
    // The Scale tool's panel has its own W and H.
    if (!this.editor.svgCanvas.isScaleTool?.()) { this.displayTool('wh_panel') }
  }

  /**
   * Fills the fields of the Scale tool once the next frame is drawn, as for
   * the fields of a multi-selection (see scheduleSelectionFields).
   * @returns {void}
   */
  scheduleScaleFields () {
    if (this.scaleFieldsPending) { return }
    this.scaleFieldsPending = true
    requestAnimationFrame(() => {
      const run = () => {
        this.scaleFieldsPending = false
        this.showScaleFields()
      }
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 100 })
      } else {
        setTimeout(run, 0)
      }
    })
  }

  /**
   * Shows the factor of the selection since it was selected with the Scale
   * tool on, and the W and H of its box, stroke excluded.
   * @returns {void}
   */
  showScaleFields () {
    if (!this.editor.svgCanvas.isScaleTool?.()) { return }
    const elements = this.editor.svgCanvas.getSelectedElements().filter(Boolean)
    const box = elements.length ? this.editor.svgCanvas.getSelectionBox?.(elements) : null
    if (!box) { return }
    const base = this.scaleBase
    if (!base || base.elements.length !== elements.length ||
      base.elements.some((elem, i) => elem !== elements[i])) {
      // The factor counts from the size the selection had when it was taken.
      this.scaleBase = { elements: [...elements], width: box.width, height: box.height }
    }
    const factor = this.scaleFactorOf(box)
    this.shownScale = {
      factor: String(Math.round(factor * 1000) / 1000),
      w: String(this.toField(box.width)),
      h: String(this.toField(box.height))
    }
    $id('scale_factor').value = this.shownScale.factor
    $id('scale_factor').preciseValue = factor
    $id('scale_w').value = this.shownScale.w
    $id('scale_h').value = this.shownScale.h
    $id('scale_w').preciseValue = this.inUnit(box.width)
    $id('scale_h').preciseValue = this.inUnit(box.height)
  }

  /**
   * Factor of the selection's box compared with its size when it was taken.
   * @param {module:utilities.BBoxObject} box
   * @returns {number}
   */
  scaleFactorOf (box) {
    const base = this.scaleBase
    if (base?.width > 1e-9) { return box.width / base.width }
    if (base?.height > 1e-9) { return box.height / base.height }
    return 1
  }

  /**
   * Scales the selection with the Scale tool by its factor, W or H field,
   * about the chosen anchor: proportions kept, strokes included.
   * @param {Event} e
   * @returns {void}
   */
  changeScaleField (e) {
    const field = { scale_factor: 'factor', scale_w: 'w', scale_h: 'h' }[e.target.id]
    if (e.target.value === this.shownScale?.[field]) { return }
    const { svgCanvas } = this.editor
    const box = svgCanvas.getSelectionBox?.()
    const value = Number(e.target.value)
    let k = NaN
    if (box && field === 'factor') {
      k = value / this.scaleFactorOf(box)
    } else if (box && field === 'w') {
      k = this.fromField(value) / box.width
    } else if (box) {
      k = this.fromField(value) / box.height
    }
    if (Number.isFinite(k) && k > 0) {
      svgCanvas.scaleSelectionBy(k, { anchor: this.scaleAnchor })
    }
    this.scheduleScaleFields()
  }

  /**
   * Chooses the point of the selection that stays in place when the Scale
   * tool's fields are changed.
   * @param {string} anchor - n, ne, e, se, s, sw, w, nw or c
   * @param {boolean} [focus] - Moves the focus to its button
   * @returns {void}
   */
  setScaleAnchor (anchor, focus = false) {
    this.scaleAnchor = anchor
    $id('scale_anchor').querySelectorAll('button').forEach((button) => {
      const checked = button.dataset.anchor === anchor
      button.setAttribute('aria-checked', String(checked))
      button.tabIndex = checked ? 0 : -1
      if (checked && focus) { button.focus() }
    })
  }

  /**
   * Arrow keys move the anchor within its three by three grid.
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  keyScaleAnchor (e) {
    const order = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }
    const move = moves[e.key]
    if (!move) { return }
    e.preventDefault()
    const i = order.indexOf(this.scaleAnchor)
    const row = Math.min(2, Math.max(0, Math.floor(i / 3) + move[0]))
    const col = Math.min(2, Math.max(0, (i % 3) + move[1]))
    this.setScaleAnchor(order[row * 3 + col], true)
  }

  /**
   * Opens or closes the alignment menu of a multi-selection.
   * @param {boolean} open
   * @param {PlainObject} [options]
   * @param {boolean} [options.focus] - Moves the focus into the menu when it
   *   opens, back to its button when it closes
   * @returns {void}
   */
  setAlignMenu (open, { focus = false } = {}) {
    const popup = $id('tool_align_popup')
    const trigger = $id('tool_align_menu')
    if (!popup || popup.hidden === !open) { return }
    popup.hidden = !open
    trigger.pressed = open
    trigger.setAttribute('aria-expanded', String(open))
    if (focus) {
      if (open) {
        $id('tool_align_left').focus()
      } else {
        trigger.focus()
      }
    }
  }

  /**
   * Makes the alignment menu work with the keyboard: its button and its
   * buttons take the focus, Enter and Space press them, Escape closes the
   * menu; a click outside closes it too.
   * @param {PlainObject} i18next
   * @returns {void}
   */
  initAlignMenu (i18next) {
    const menu = $id('align_menu')
    const trigger = $id('tool_align_menu')
    const popup = $id('tool_align_popup')
    const press = (button) => (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') { return }
      e.preventDefault()
      button.click()
    }
    ;[trigger, ...popup.querySelectorAll('se-button')].forEach((button) => {
      button.tabIndex = 0
      button.setAttribute('role', 'button')
      button.setAttribute('aria-label', i18next.t(controlTitle(button)))
      button.addEventListener('keydown', press(button))
    })
    trigger.setAttribute('aria-haspopup', 'true')
    trigger.setAttribute('aria-expanded', 'false')
    trigger.setAttribute('aria-controls', 'tool_align_popup')
    popup.setAttribute('aria-label', i18next.t('tools.align_menu'))
    trigger.addEventListener('click', () => {
      this.setAlignMenu(popup.hidden, { focus: document.activeElement === trigger })
    })
    document.addEventListener('pointerdown', (e) => {
      if (!popup.hidden && !e.composedPath().includes(menu)) { this.setAlignMenu(false) }
    }, true)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || popup.hidden) { return }
      // The first Escape closes the menu, before the editor's own uses.
      e.stopPropagation()
      e.preventDefault()
      this.setAlignMenu(false, { focus: e.composedPath().includes(menu) })
    }, true)
  }

  /**
   * Spacing typed for Distribute, in the drawing's units.
   * @returns {number|null} Null when the field is empty or not a number:
   *   Distribute then spaces the objects evenly.
   */
  alignSpacing () {
    const raw = String($id('tool_align_spacing')?.value ?? '').trim().replace(',', '.')
    if (raw === '') { return null }
    const n = Number(raw)
    return Number.isFinite(n) ? this.fromField(n) : null
  }

  /**
   * Shows the values the selected texts share, or "Mixed".
   * @param {Element[]} texts
   * @returns {void}
   */
  showCommonTextValues (texts) {
    TEXT_FIELDS.forEach(([id, attr, fallback]) => {
      const value = commonValueOf(texts, (text) => styledAttribute(this.editor.svgCanvas, text, attr) ?? fallback)
      if (value === undefined) {
        $id(id).mixed = true
      } else {
        $id(id).value = value ?? ''
      }
    })
    const family = commonValueOf(texts, (text) => styledAttribute(this.editor.svgCanvas, text, 'font-family'))
    if (family === undefined) {
      $id('tool_font_family').mixed = true
    } else {
      $id('tool_font_family').value = family
    }
    const adjust = commonValueOf(texts, (text) => text.getAttribute('lengthAdjust') ?? '')
    if (adjust === undefined) {
      $id('tool_length_adjust').mixed = true
    } else {
      $id('tool_length_adjust').value = adjust
    }
    $id('tool_bold').pressed = this.editor.svgCanvas.getBold()
    $id('tool_italic').pressed = this.editor.svgCanvas.getItalic()
    ;['underline', 'line-through', 'overline'].forEach((value) => {
      $id(`tool_text_decoration_${value.replace('-', '')}`).pressed =
        this.editor.svgCanvas.hasTextDecoration(value)
    })
  }

  /**
   * Moves a multi-selection, or a path, polyline, polygon of a file, group
   * or imported file alone, by its X or Y field, which describe its box without the stroke;
   * another element alone keeps the field's own meaning (its x or y).
   * @param {Event} e
   * @returns {void}
   */
  changeSelectionPosition (e) {
    const alone = this.editor.selectedElement
    if (!this.multiselected && !POSITIONED_BY_BOX.has(geometryKind(alone))) {
      this.attrChanger(e)
      return
    }
    const axis = e.target.id === 'selected_x' ? 'x' : 'y'
    // The value shown, sent back unchanged, must not move the selection by
    // its rounding.
    if (e.target.value === this.shownPosition?.[axis]) { return }
    const value = this.fromField(e.target.value)
    const moved = axis === 'x'
      ? this.editor.svgCanvas.moveSelectionTo(value, null)
      : this.editor.svgCanvas.moveSelectionTo(null, value)
    if (!moved) { this.updateContextPanel() }
  }

  /**
   * Scales the selection from the top left corner of its box by its W or H
   * field, keeping the proportions when the lock is on or for a text.
   * @param {Event} e
   * @returns {void}
   */
  changeSelectionSize (e) {
    const axis = e.target.id === 'selected_w' ? 'w' : 'h'
    if (e.target.value === this.shownSize?.[axis]) { return }
    const value = this.fromField(e.target.value)
    const keepRatio = this.ratioForced || Boolean(this.keepRatio)
    const resized = axis === 'w'
      ? this.editor.svgCanvas.resizeSelectionTo(value, null, { keepRatio })
      : this.editor.svgCanvas.resizeSelectionTo(null, value, { keepRatio })
    if (!resized) { this.updateContextPanel() }
  }

  /**
   * Turns the proportion lock of the W and H fields on or off.
   * @returns {void}
   */
  clickRatioLock () {
    if (this.ratioForced) { return }
    this.keepRatio = !this.keepRatio
    $id('tool_ratio_lock').pressed = this.keepRatio
  }

  /**
   * Applies a change typed in a field showing "Mixed" to each selected
   * element's own value of an attribute.
   * @param {(value: number) => number} relative - From the field's change event
   * @param {string} attr
   * @param {Element[]} elements
   * @param {number|null} fallback - Value of an element without the attribute;
   *   null leaves such an element unchanged
   * @returns {void}
   */
  changeEachAttribute (relative, attr, elements, fallback) {
    this.editor.svgCanvas.changeSelectedAttributeEach(attr, (elem) => {
      const current = Number.parseFloat(styledAttribute(this.editor.svgCanvas, elem, attr) ?? fallback)
      return Number.isFinite(current) ? relative(current) : undefined
    }, elements)
  }

  /**
   * @type {module}
   */
  changeRotationAngle (e) {
    const { relative, wasMixed } = e.detail || {}
    if (this.multiselected && (relative || wasMixed)) {
      // The elements' angles differ: each element gets the value, or the
      // expression applied to its own angle, about its own center.
      const value = Number(e.target.value)
      this.editor.svgCanvas.rotateEachSelectedElement(relative || (() => value))
      return
    }
    this.editor.svgCanvas.setRotationAngle(e.target.value)
    if (Number.parseInt(e.target.value) === 0) {
      $id('tool_reorient').classList.add('disabled')
    } else {
      $id('tool_reorient').classList.remove('disabled')
    }
  }

  /**
   * @param {PlainObject} e
   * @returns {void}
   */
  changeBlur (e) {
    this.editor.svgCanvas.setBlur(e.target.value / 10, true)
  }

  /**
   *
   * @returns {void}
   */
  clickGroup () {
    // group
    if (this.editor.multiselected) {
      this.editor.svgCanvas.groupSelectedElements()
      // ungroup
    } else if (this.editor.selectedElement) {
      // A bound group: asked first (V6)
      ungroupSelected(this.editor)
    }
  }

  /**
   *
   * @returns {void}
   */
  clickClone () {
    // Repeats the offset of the last duplicate once its copy has been moved (M7)
    this.editor.svgCanvas.duplicateSelectedElements()
  }

  /**
   * @param {PlainObject} evt
   * @returns {void}
   */
  clickAlignEle (evt) {
    this.editor.svgCanvas.alignSelectedElements(evt.detail.value, 'page')
  }

  /**
   * @param {string} pos indicate the alignment relative to top, bottom, middle etc..
   * @returns {void}
   */
  clickAlign (pos) {
    // One object, which the Align menu of the canvas layout takes since lot
    // S1: on the page, as Alt and a letter do; it cannot be distributed.
    if (this.editor.svgCanvas.getSelectedElements().filter(Boolean).length === 1) {
      if (!pos.startsWith('distrib')) this.editor.svgCanvas.alignSelectedElements(pos, 'page')
      return
    }
    let value = $id('tool_align_relative').value
    if (value === '') {
      value = 'selected'
    }
    // A spacing typed in its field replaces the even distribution.
    const spacing = pos.startsWith('distrib') ? this.alignSpacing() : null
    if (spacing === null) {
      this.editor.svgCanvas.alignSelectedElements(pos, value)
    } else {
      this.editor.svgCanvas.alignSelectedElements(pos, value, { spacing })
    }
  }

  /**
   *
   * @type {module}
   */
  attrChanger (e) {
    const attr = e.target.getAttribute('data-attr')
    let val = e.target.value
    // The identifier: the references of the drawing follow it, a taken one
    // is refused, a bound one asked first (V6)
    if (attr === 'id' && this.selectedElement) {
      const elem = this.selectedElement
      renameId(this.editor, elem, val).then((renamed) => {
        if (!renamed && e.target.isConnected) e.target.value = elem.id
      })
      return true
    }
    const valid = isValidUnit(attr, val, this.selectedElement)

    if (!valid) {
      e.target.value = styledAttribute(this.editor.svgCanvas, this.selectedElement, attr)
      this.editor.toast(this.editor.i18next.t('notification.invalidAttrValGiven'), { type: 'error' })
      return false
    }

    if (attr !== 'id' && attr !== 'class') {
      if (isNaN(val)) {
        val = this.editor.svgCanvas.convertToNum(attr, val)
      } else if (this.editor.configObj.curConfig.baseUnit !== 'px') {
        // Convert unitless value to one with given unit

        const unitData = getTypeMap()

        if (
          this.editor.selectedElement[attr] ||
          this.editor.svgCanvas.getMode() === 'pathedit' ||
          attr === 'x' ||
          attr === 'y'
        ) {
          val *= unitData[this.editor.configObj.curConfig.baseUnit]
        }
      }
    }

    this.editor.svgCanvas.changeSelectedAttribute(attr, val)
    return true
  }

  /**
   *
   * @returns {void}
   */
  convertToPath () {
    if (this.editor.selectedElement) {
      this.editor.svgCanvas.convertToPath()
    } else if (this.multiselected) {
      this.editor.svgCanvas.convertSelectedToPaths()
    }
  }

  /**
   *
   * @returns {void}
   */
  reorientPath () {
    if (this.editor.selectedElement) {
      this.path.reorient()
    }
  }

  /**
   * Flip selected element(s) horizontally.
   * @returns {void}
   */
  clickFlipHorizontal () {
    if (this.editor.selectedElement || this.multiselected) {
      this.editor.svgCanvas.flipSelectedElements(-1, 1)
    }
  }

  /**
   * Flip selected element(s) vertically.
   * @returns {void}
   */
  clickFlipVertical () {
    if (this.editor.selectedElement || this.multiselected) {
      this.editor.svgCanvas.flipSelectedElements(1, -1)
    }
  }

  /**
   *
   * @returns {void} Resolves to `undefined`
   */
  async makeHyperlink () {
    if (this.editor.selectedElement || this.multiselected) {
      const button = this.multiselected ? $id('tool_make_link_multi') : $id('tool_make_link')
      const url = await askText(this.editor, {
        label: this.editor.i18next.t('notification.enterNewLinkURL'),
        value: 'https://',
        anchor: button,
        inputType: 'url'
      })
      if (url && url !== 'https://') {
        this.editor.svgCanvas.makeHyperlink(url)
      }
    }
  }

  /**
   *
   * @returns {void}
   */
  linkControlPoints () {
    $id('tool_node_link').pressed = !$id('tool_node_link').pressed
    const linked = !!$id('tool_node_link').pressed
    this.path.linkControlPoints(linked)
  }

  /**
   *
   * @returns {void}
   */
  clonePathNode () {
    if (this.path.getNodePoint()) {
      this.path.clonePathNode()
    }
  }

  /**
   *
   * @returns {void}
   */
  deletePathNode () {
    if (this.path.getNodePoint()) {
      this.path.deletePathNode()
    }
  }

  /**
   *
   * @returns {void}
   */
  addSubPath () {
    const button = $id('tool_add_subpath')
    const sp = !button.classList.contains('pressed')
    button.pressed = sp
    // button.toggleClass('push_button_pressed tool_button');
    this.path.addSubPath(sp)
  }

  /**
   *
   * @returns {void}
   */
  opencloseSubPath () {
    this.path.opencloseSubPath()
  }

  /**
   * Delete is a contextual tool that only appears in the ribbon if
   * an element has been selected.
   * @returns {void}
   */
  deleteSelected () {
    if (this.editor.selectedElement || this.editor.multiselected) {
      this.editor.svgCanvas.deleteSelectedElements()
    }
  }

  /**
   *
   * @returns {void}
   */
  moveToTopSelected () {
    if (this.editor.selectedElement || this.editor.multiselected) {
      this.editor.svgCanvas.moveToTopSelectedElement()
    }
  }

  /**
   *
   * @returns {void}
   */
  moveToBottomSelected () {
    if (this.editor.selectedElement || this.editor.multiselected) {
      this.editor.svgCanvas.moveToBottomSelectedElement()
    }
  }

  /**
   * Checks if there are currently selected text elements to avoid firing of bold,italic when no text selected
   * @returns {boolean}
   */
  get anyTextSelected () {
    const selected = this.editor.svgCanvas.getSelectedElements()
    return selected.filter(el => el.tagName === 'text').length > 0
  }

  /**
   *
   * @returns {false}
   */
  clickBold () {
    if (this.anyTextSelected) {
      this.editor.svgCanvas.setBold(!this.editor.svgCanvas.getBold())
      this.updateContextPanel()
      return false
    }
  }

  /**
   *
   * @returns {false}
   */
  clickItalic () {
    if (this.anyTextSelected) {
      this.editor.svgCanvas.setItalic(!this.editor.svgCanvas.getItalic())
      this.updateContextPanel()
      return false
    }
  }

  /**
   * Handles the click on the text decoration buttons
   *
   * @param value The text decoration value
   * @returns {boolean} false
   */
  clickTextDecoration (value) {
    if (this.editor.svgCanvas.hasTextDecoration(value)) {
      this.editor.svgCanvas.removeTextDecoration(value)
    } else {
      this.editor.svgCanvas.addTextDecoration(value)
    }
    this.updateContextPanel()
    return false
  }

  /**
   * Sets the text anchor value
   *
   * @returns {false}
   */
  clickTextAnchor (evt) {
    this.editor.svgCanvas.setTextAnchor(evt.detail.value)
    return false
  }

  /**
   * @type {module}
   */
  changeLetterSpacing (e) {
    if (e.detail?.relative) {
      this.changeEachAttribute(e.detail.relative, 'letter-spacing', this.selectedTexts(), 0)
      return
    }
    this.editor.svgCanvas.setLetterSpacing(e.target.value)
  }

  /**
   * @type {module}
   */
  changeWordSpacing (e) {
    if (e.detail?.relative) {
      this.changeEachAttribute(e.detail.relative, 'word-spacing', this.selectedTexts(), 0)
      return
    }
    this.editor.svgCanvas.setWordSpacing(e.target.value)
  }

  /**
   * @type {module}
   */
  changeTextLength (e) {
    if (e.detail?.relative) {
      this.changeEachAttribute(e.detail.relative, 'textLength', this.selectedTexts(), 0)
      return
    }
    this.editor.svgCanvas.setTextLength(e.target.value)
  }

  /**
   * @type {module}
   */
  changeLengthAdjust (evt) {
    this.editor.svgCanvas.setLengthAdjust(evt.detail.value)
  }

  /**
   * Set a selected image's URL.
   * @function module:SVGthis.setImageURL
   * @param {string} url
   * @returns {void}
   */
  setImageURL (url) {
    const { editor } = this
    if (!url) {
      url = editor.defaultImageURL
    }
    editor.svgCanvas.setImageURL(url)
    $id('image_url').value = url

    if (url.startsWith('data:')) {
      // data URI found
      this.hideTool('image_url')
    } else {
      // regular URL
      const promised = editor.svgCanvas.embedImage(url)
      // eslint-disable-next-line promise/catch-or-return
      promised
        // eslint-disable-next-line promise/always-return
        .then(
          () => {
            // switch into "select" mode if we've clicked on an element
            editor.svgCanvas.setMode('select')
            editor.svgCanvas.selectOnly(
              editor.svgCanvas.getSelectedElements(),
              true
            )
          },
          error => {
            console.error('error =', error)
            seAlert(editor.i18next.t('tools.no_embed'))
            editor.svgCanvas.deleteSelectedElements()
          }
        )
      this.displayTool('image_url')
    }
  }

  /**
   *
   */
  updateTitle (title) {
    if (title) this.editor.title = title
    const titleElement = $qa('#title_panel > p')[0]
    if (titleElement) titleElement.textContent = this.editor.title
    // The name of the document in the top bar of the canvas layout.
    this.editor.layout?.titleChanged(this.editor.title)
  }

  /**
   * @param {boolean} editmode
   * @param {module:svgcanvas.SvgCanvas#event:selected} elems
   * @returns {void}
   */
  togglePathEditMode (editMode, elems) {
    if (editMode) {
      this.displayTool('path_node_panel')
    } else {
      this.hideTool('path_node_panel')
    }
    if (editMode) {
      // Change select icon
      $id('tool_path').pressed = false
      $id('tool_select').pressed = true
      $id('tool_select').setAttribute('src', 'select_node.svg')
      this.editor.multiselected = false
      if (elems.length) {
        this.editor.selectedElement = elems[0]
      }
    } else {
      setTimeout(() => {
        $id('tool_select').setAttribute('src', 'select.svg')
      }, 1000)
    }
  }

  /**
   * @type {module}
   */
  init () {
    // add Top panel
    const template = document.createElement('template')
    const { i18next } = this.editor
    template.innerHTML = topPanelHTML
    // Each control in its zone of the layout (lot V3).
    if (this.editor.layout) this.editor.layout.attach(template.content.cloneNode(true), 'top')
    else this.editor.$svgEditor.append(template.content.cloneNode(true))
    // svg editor source dialoag added to DOM
    const newSeEditorDialog = document.createElement(
      'se-svg-source-editor-dialog'
    )
    newSeEditorDialog.setAttribute('id', 'se-svg-editor-dialog')
    this.editor.$container.append(newSeEditorDialog)
    this.updateTitle()
    newSeEditorDialog.init(i18next)
    $id('tool_link_url').setAttribute('title', i18next.t('tools.set_link_url'))
    // The hidden field that receives the typed text of a text object.
    $id('text').setAttribute('aria-label', i18next.t('properties.text_contents'))
    // register action to top panel buttons
    $click($id('tool_source'), this.showSourceEditor.bind(this))
    $click($id('tool_wireframe'), this.clickWireframe.bind(this))
    $click($id('tool_undo'), this.clickUndo.bind(this))
    $click($id('tool_redo'), this.clickRedo.bind(this))
    $click($id('tool_clone'), this.clickClone.bind(this))
    $click($id('tool_clone_multi'), this.clickClone.bind(this))
    $click($id('tool_delete'), this.deleteSelected.bind(this))
    $click($id('tool_delete_multi'), this.deleteSelected.bind(this))
    $click($id('tool_move_top'), this.moveToTopSelected.bind(this))
    $click($id('tool_move_bottom'), this.moveToBottomSelected.bind(this))
    $click($id('tool_move_top_multi'), this.moveToTopSelected.bind(this))
    $click($id('tool_move_bottom_multi'), this.moveToBottomSelected.bind(this))
    $click($id('tool_topath'), this.convertToPath.bind(this))
    $click($id('tool_topath_multi'), this.convertToPath.bind(this))
    $click($id('tool_ratio_lock'), this.clickRatioLock.bind(this))
    // The Scale tool's panel (M9)
    ;['scale_factor', 'scale_w', 'scale_h'].forEach((id) =>
      $id(id).addEventListener('change', this.changeScaleField.bind(this))
    )
    const anchors = $id('scale_anchor')
    anchors.setAttribute('aria-label', i18next.t('tools.scale_anchor'))
    anchors.title = i18next.t('tools.scale_anchor')
    anchors.querySelectorAll('button').forEach((button) => {
      const label = i18next.t(`tools.anchor_${button.dataset.anchor}`)
      button.setAttribute('aria-label', label)
      button.title = label
      button.addEventListener('click', () => this.setScaleAnchor(button.dataset.anchor))
    })
    anchors.addEventListener('keydown', this.keyScaleAnchor.bind(this))
    this.setScaleAnchor('nw')
    ;['selected_x', 'selected_y'].forEach(id =>
      $id(id).addEventListener('change', this.changeSelectionPosition.bind(this))
    )
    ;['selected_w', 'selected_h'].forEach(id =>
      $id(id).addEventListener('change', this.changeSelectionSize.bind(this))
    )
    $click($id('tool_make_link'), this.makeHyperlink.bind(this))
    $click($id('tool_make_link_multi'), this.makeHyperlink.bind(this))
    $click($id('tool_reorient'), this.reorientPath.bind(this))
    $click($id('tool_flip_h'), this.clickFlipHorizontal.bind(this))
    $click($id('tool_flip_v'), this.clickFlipVertical.bind(this))
    $click($id('tool_flip_h_multi'), this.clickFlipHorizontal.bind(this))
    $click($id('tool_flip_v_multi'), this.clickFlipVertical.bind(this))
    $click($id('tool_group_elements'), this.clickGroup.bind(this))
    $id('tool_position').addEventListener('change', evt =>
      this.clickAlignEle.bind(this)(evt)
    )
    this.initAlignMenu(i18next)
    $click($id('tool_align_left'), () => this.clickAlign.bind(this)('left'))
    $click($id('tool_align_right'), () => this.clickAlign.bind(this)('right'))
    $click($id('tool_align_center'), () => this.clickAlign.bind(this)('center'))
    $click($id('tool_align_top'), () => this.clickAlign.bind(this)('top'))
    $click($id('tool_align_bottom'), () => this.clickAlign.bind(this)('bottom'))
    $click($id('tool_align_middle'), () => this.clickAlign.bind(this)('middle'))
    $click($id('tool_align_distrib_horiz'), () =>
      this.clickAlign.bind(this)('distrib_horiz')
    )
    $click($id('tool_align_distrib_verti'), () =>
      this.clickAlign.bind(this)('distrib_verti')
    )
    $click($id('tool_node_clone'), this.clonePathNode.bind(this))
    $click($id('tool_node_delete'), this.deletePathNode.bind(this))
    $click($id('tool_openclose_path'), this.opencloseSubPath.bind(this))
    $click($id('tool_add_subpath'), this.addSubPath.bind(this))
    $click($id('tool_node_link'), this.linkControlPoints.bind(this))
    $id('angle').addEventListener('change', this.changeRotationAngle.bind(this))
    $id('blur').addEventListener('change', this.changeBlur.bind(this))
    $id('rect_rx').addEventListener('change', this.changeRectRadius.bind(this))
    $id('font_size').addEventListener('change', this.changeFontSize.bind(this))
    $click($id('tool_ungroup'), this.clickGroup.bind(this))
    $click($id('tool_bold'), this.clickBold.bind(this))
    $click($id('tool_italic'), this.clickItalic.bind(this))
    $click($id('tool_text_decoration_underline'), () =>
      this.clickTextDecoration.bind(this)('underline')
    )
    $click($id('tool_text_decoration_linethrough'), () =>
      this.clickTextDecoration.bind(this)('line-through')
    )
    $click($id('tool_text_decoration_overline'), () =>
      this.clickTextDecoration.bind(this)('overline')
    )
    $id('tool_text_anchor').addEventListener('change', evt =>
      this.clickTextAnchor.bind(this)(evt)
    )
    $id('tool_letter_spacing').addEventListener(
      'change',
      this.changeLetterSpacing.bind(this)
    )
    $id('tool_word_spacing').addEventListener(
      'change',
      this.changeWordSpacing.bind(this)
    )
    $id('tool_line_height').addEventListener('change', (e) => {
      this.editor.svgCanvas.setLineHeight(e.target.value)
    })
    $click($id('tool_text_auto_width'), () => {
      this.editor.svgCanvas.setTextWidth(null)
      this.updateContextPanel()
    })
    $id('tool_text_length').addEventListener(
      'change',
      this.changeTextLength.bind(this)
    )
    $id('tool_length_adjust').addEventListener('change', evt =>
      this.changeLengthAdjust.bind(this)(evt)
    )
    $click($id('tool_unlink_use'), this.clickGroup.bind(this))
    $id('image_url').addEventListener('change', evt => {
      this.setImageURL(evt.currentTarget.value)
    })

    // all top panel attributes
    ;[
      'elem_id',
      'elem_class',
      'circle_cx',
      'circle_cy',
      'circle_r',
      'ellipse_cx',
      'ellipse_cy',
      'ellipse_rx',
      'ellipse_ry',
      'rect_width',
      'rect_height',
      'line_x1',
      'line_x2',
      'line_y1',
      'line_y2',
      'image_width',
      'image_height',
      'path_node_x',
      'path_node_y'
    ].forEach(attrId =>
      $id(attrId).addEventListener('change', this.attrChanger.bind(this))
    )
  }
}

export default TopPanel
