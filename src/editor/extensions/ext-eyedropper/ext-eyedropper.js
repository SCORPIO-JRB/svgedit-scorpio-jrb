/**
 * @file ext-eyedropper.js
 *
 * @license MIT
 *
 * @copyright 2010 Jeff Schiller
 * @copyright 2021 OptimistikSAS
 *
 */

const name = 'eyedropper'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    await loadExtensionTranslation(svgEditor)
    const { ChangeElementCommand, BatchCommand } = svgCanvas.history
    // svgdoc = S.svgroot.parentNode.ownerDocument,
    const addToHistory = (cmd) => { svgCanvas.undoMgr.addCommandToHistory(cmd) }
    const currentStyle = {}
    const { $id, $click } = svgCanvas

    // Helper to show what style is currectly picked
    const helperCursor = document.createElement('div')
    helperCursor.style.width = '14px'
    helperCursor.style.height = '14px'
    helperCursor.style.position = 'absolute'
    svgEditor.workarea.appendChild(helperCursor)

    const styleHelper = () => {
      const mode = svgCanvas.getMode()

      if (mode === name) {
        helperCursor.style.display = 'block'

        const strokeWidthNum = Number(currentStyle.strokeWidth)
        const borderStyle = currentStyle.strokeDashArray === 'none' || !currentStyle.strokeDashArray ? 'solid' : 'dotted'

        helperCursor.style.background = currentStyle.fillPaint ?? 'transparent'
        helperCursor.style.opacity = currentStyle.opacity ?? 1
        helperCursor.style.border = (strokeWidthNum > 0 && currentStyle.strokePaint) ? `2px ${borderStyle} ${currentStyle.strokePaint}` : 'none'
      }
    }

    const resetCurrentStyle = () => {
      const keys = Object.keys(currentStyle)

      keys.forEach(key => delete currentStyle[key])
    }

    const cancelHandler = () => {
      if (Object.keys(currentStyle).length > 0) {
        resetCurrentStyle()
        styleHelper()
      } else {
        svgEditor.leftPanel.clickSelect()
      }
    }

    // The properties the eyedropper takes
    const PROPERTIES = [
      'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'opacity',
      'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray'
    ]

    // On an object styled by a class (lot S4), the value as drawn: a rule or
    // the `style` attribute wins over the attribute.
    const read = (elem, attr) => svgCanvas.getStyledValue?.(elem, attr)?.value ?? elem.getAttribute(attr)

    /**
     *
     * @param {module:svgcanvas.SvgCanvas#event:ext_selectedChanged|module:svgcanvas.SvgCanvas#event:ext_elementChanged} opts
     * @returns {void}
     */
    const getStyle = (opts) => {
      let elem = null
      if (!opts.multiselected && opts.elems[0] &&
        !['svg', 'g', 'use'].includes(opts.elems[0].nodeName)
      ) {
        elem = opts.elems[0]
        // grab the current style
        currentStyle.fillPaint = read(elem, 'fill') || 'black'
        currentStyle.fillOpacity = read(elem, 'fill-opacity') || 1.0
        currentStyle.strokePaint = read(elem, 'stroke')
        currentStyle.strokeOpacity = read(elem, 'stroke-opacity') || 1.0
        currentStyle.strokeWidth = read(elem, 'stroke-width')
        currentStyle.strokeDashArray = read(elem, 'stroke-dasharray')
        currentStyle.strokeLinecap = read(elem, 'stroke-linecap')
        currentStyle.strokeLinejoin = read(elem, 'stroke-linejoin')
        currentStyle.opacity = read(elem, 'opacity') || 1.0
        // What it shows for a property it does not set, for a target that
        // gets the property from a rule (lot S4)
        currentStyle.shown = Object.fromEntries(PROPERTIES.map((attr) => [attr, svgCanvas.getShownValue?.(elem, attr) ?? null]))
      }
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        // Add the button and its handler(s)
        const title = `${name}:buttons.0.title`
        // const key = `${name}:buttons.0.key`
        const key = 'ctrl+I'
        const buttonTemplate = `
        <se-button id="tool_eyedropper" data-group="more" data-rank="20" title="${title}" src="eye_dropper.svg" shortcut=${key}></se-button>
        `
        svgCanvas.insertChildAtIndex($id('tools_left'), buttonTemplate, 12)
        $click($id('tool_eyedropper'), () => {
          if (this.leftPanel.updateLeftPanel('tool_eyedropper')) {
            svgCanvas.setMode(name)
          }
        })

        // enables helper, resets currently picked style if no element selected
        document.addEventListener('modeChange', e => {
          if (svgCanvas.getMode() === name) {
            styleHelper()
          } else {
            helperCursor.style.display = 'none'
          }
          if (svgCanvas.getSelectedElements().length === 0) {
            resetCurrentStyle()
          }
        })

        // Positions helper
        svgEditor.workarea.addEventListener('mousemove', (e) => {
          const x = e.clientX
          const y = e.clientY

          if (svgCanvas.getMode() === name) {
            helperCursor.style.top = y + 'px'
            helperCursor.style.left = x + 12 + 'px'
            styleHelper()
          }
        })

        svgEditor.workarea.addEventListener('mouseleave', e => {
          helperCursor.style.display = 'none'
        })

        // Listens to Esc to reset currently picked style / set Select mode
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape' && svgCanvas.getMode() === name) {
            cancelHandler()
          }
        })
      },
      // if we have selected an element, grab its paint and enable the eye dropper button
      selectedChanged: getStyle,
      mouseDown (opts) {
        const mode = svgCanvas.getMode()
        if (mode === name) {
          const e = opts.event
          const { target } = e
          if (!['svg', 'g', 'use'].includes(target.nodeName)) {
            const changes = {}

            // If some style is picked - applies it to the target, if no style - picks it from the target
            if (Object.keys(currentStyle).length > 0) {
              // A property the target gets from a rule or its `style`
              // attribute changes there, as by a field of the panel, and
              // the editor asks before keeping a rule changed (lot S4).
              const styled = new BatchCommand('Change attributes')
              const record = (cmd) => styled.addSubCommand(cmd)
              const where = function (elem, attrname, newvalue) {
                // The value the source showed, for one it did not set
                const value = newvalue || currentStyle.shown?.[attrname]
                if (!value || !svgCanvas.changeStyledProperty) return true
                if (!newvalue && svgCanvas.getShownValue(elem, attrname) === value) return true
                return svgCanvas.changeStyledProperty(attrname, value, [elem], record).length > 0
              }
              const change = function (elem, attrname, newvalue) {
                if (!where(elem, attrname, newvalue) || !newvalue) return
                changes[attrname] = elem.getAttribute(attrname)
                elem.setAttribute(attrname, newvalue)
              }

              change(target, 'fill', currentStyle.fillPaint)
              change(target, 'fill-opacity', currentStyle.fillOpacity)
              change(target, 'stroke', currentStyle.strokePaint)
              change(target, 'stroke-opacity', currentStyle.strokeOpacity)
              change(target, 'stroke-width', currentStyle.strokeWidth)
              change(target, 'opacity', currentStyle.opacity)
              change(target, 'stroke-linecap', currentStyle.strokeLinecap)
              change(target, 'stroke-linejoin', currentStyle.strokeLinejoin)

              if (currentStyle.strokeDashArray) {
                change(target, 'stroke-dasharray', currentStyle.strokeDashArray)
              } else if (where(target, 'stroke-dasharray', null) && target.hasAttribute('stroke-dasharray')) {
                // Removed as one undo step with the rest (it was not undone)
                changes['stroke-dasharray'] = target.getAttribute('stroke-dasharray')
                target.removeAttribute('stroke-dasharray')
              }

              if (styled.isEmpty()) {
                addToHistory(new ChangeElementCommand(target, changes))
              } else {
                if (Object.keys(changes).length) styled.addSubCommand(new ChangeElementCommand(target, changes))
                addToHistory(styled)
                svgCanvas.call('changed', [target])
              }
            } else {
              getStyle({ elems: [target] })
            }
          }
        }
      }
    }
  }
}
