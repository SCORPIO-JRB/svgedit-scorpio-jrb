import rulersTemplate from './templates/rulersTemplate.html'
import SvgCanvas from '@svgedit/svgcanvas'

const { $id, getTypeMap } = SvgCanvas

/**
 *
 */
class Rulers {
  /**
   * @type {Module}
  */
  constructor (editor) {
    // Make [1,2,5] array
    this.rulerIntervals = []
    for (let i = 0.1; i < 1e5; i *= 10) {
      this.rulerIntervals.push(i)
      this.rulerIntervals.push(2 * i)
      this.rulerIntervals.push(5 * i)
    }
    this.svgCanvas = editor.svgCanvas
    this.editor = editor
    // add rulers component to the DOM
    const template = document.createElement('template')
    template.innerHTML = rulersTemplate
    // Each control in its zone of the layout (lot V3).
    if (this.editor.layout) this.editor.layout.attach(template.content.cloneNode(true), 'rulers')
    else this.editor.$svgEditor.append(template.content.cloneNode(true))
    const { $id } = SvgCanvas
    this.rulerX = $id('ruler_x')
    this.rulerY = $id('ruler_y')
    this.rulerCorner = $id('ruler_corner')
    // The rulers are drawn in a canvas: they are redrawn with the new theme.
    editor.$container?.addEventListener('se-themechange', () => {
      if (editor.configObj.curConfig.showRulers) this.updateRulers()
    })
  }

  display (on) {
    if (on) {
      this.rulerX.style.removeProperty('display')
      this.rulerY.style.removeProperty('display')
      this.rulerCorner.style.removeProperty('display')
    } else {
      this.rulerX.style.display = 'none'
      this.rulerY.style.display = 'none'
      this.rulerCorner.style.display = 'none'
    }
  }

  /**
   *
   * @param {HTMLDivElement} [scanvas]
   * @param {Float} [zoom]
   * @returns {void}
   */
  updateRulers (scanvas, zoom) {
    if (!zoom) { zoom = this.svgCanvas.getZoom() }
    if (!scanvas) { scanvas = document.getElementById('svgcanvas') }

    let d; let i
    const limit = 30000
    const contentElem = this.svgCanvas.getSvgContent()
    // The rulers measure the view, from the origin of the drawing in it;
    // before its first layout, the canvas.
    const view = this.editor.view?.camera ? this.editor.view : null
    const units = getTypeMap()
    const unit = units[this.editor.configObj.curConfig.baseUnit] // 1 = 1px

    // draw x ruler then y ruler
    for (d = 0; d < 2; d++) {
      const isX = (d === 0)
      const dim = isX ? 'x' : 'y'
      const lentype = isX ? 'width' : 'height'
      const contentDim = view ? view.camera[dim] : Number(contentElem.getAttribute(dim))
      const $hcanvOrig = $id('ruler_' + dim).querySelector('canvas')

      // Bit of a hack to fully clear the canvas in Safari & IE9
      const $hcanv = $hcanvOrig.cloneNode(true)
      $hcanvOrig.replaceWith($hcanv)

      const hcanv = $hcanv

      // Set the canvas size to the width of the container
      let rulerLen
      if (view) {
        rulerLen = view.viewport[lentype]
      } else if (lentype === 'width') {
        rulerLen = parseFloat(getComputedStyle(scanvas, null).width.replace('px', ''))
      } else if (lentype === 'height') {
        rulerLen = parseFloat(getComputedStyle(scanvas, null).height.replace('px', ''))
      }
      const totalLen = rulerLen
      hcanv.parentNode.style[lentype] = totalLen + 'px'
      let ctx = hcanv.getContext('2d')
      let ctxArr; let num; let ctxArrNum

      // Remove any existing canvasses
      const elements = Array.prototype.filter.call($hcanv.parentNode.children, function (child) {
        return child !== $hcanv
      })
      Array.from(elements).forEach(function (element) {
        element.remove()
      })

      // Create multiple canvases when necessary (due to browser limits)
      if (rulerLen >= limit) {
        ctxArrNum = Number.parseInt(rulerLen / limit) + 1
        ctxArr = []
        ctxArr[0] = ctx
        let copy
        for (i = 1; i < ctxArrNum; i++) {
          hcanv[lentype] = limit
          copy = hcanv.cloneNode(true)
          hcanv.parentNode.append(copy)
          ctxArr[i] = copy.getContext('2d')
        }

        copy[lentype] = rulerLen % limit

        // set copy width to last
        rulerLen = limit
      }

      hcanv[lentype] = rulerLen
      // Resizing a canvas resets its context: the colours of the theme are
      // set afterwards, on every canvas of the ruler.
      const style = getComputedStyle($id('ruler_' + dim))
      const paint = (context) => {
        context.font = `9px ${style.fontFamily}`
        context.fillStyle = style.color
        context.strokeStyle = style.getPropertyValue('--se-ruler-tick').trim() || style.color
      }
      ;(ctxArr ?? [ctx]).forEach(paint)

      const uMulti = unit * zoom

      // Calculate the main number interval
      const rawM = 50 / uMulti
      let multi = 1
      for (i = 0; i < this.rulerIntervals.length; i++) {
        num = this.rulerIntervals[i]
        multi = num
        if (rawM <= num) {
          break
        }
      }

      const bigInt = multi * uMulti

      let rulerD = ((contentDim / uMulti) % multi) * uMulti
      let labelPos = rulerD - bigInt
      // draw big intervals
      let ctxNum = 0
      while (rulerD < totalLen) {
        labelPos += bigInt
        // const realD = rulerD - contentDim; // Currently unused

        const curD = Math.round(rulerD) + 0.5
        if (isX) {
          ctx.moveTo(curD, 15)
          ctx.lineTo(curD, 0)
        } else {
          ctx.moveTo(15, curD)
          ctx.lineTo(0, curD)
        }

        num = (labelPos - contentDim) / uMulti
        let label
        if (multi >= 1) {
          label = Math.round(num)
        } else {
          const decs = String(multi).split('.')[1].length
          label = num.toFixed(decs)
        }

        // Change 1000s to Ks
        if (label !== 0 && label !== 1000 && label % 1000 === 0) {
          label = (label / 1000) + 'K'
        }

        if (isX) {
          ctx.fillText(label, rulerD + 2, 8)
        } else {
          // draw label vertically
          const str = String(label).split('')
          for (i = 0; i < str.length; i++) {
            ctx.fillText(str[i], 1, (rulerD + 9) + i * 9)
          }
        }

        const part = bigInt / 10
        // draw the small intervals
        for (i = 1; i < 10; i++) {
          let subD = Math.round(rulerD + part * i) + 0.5
          if (ctxArr && subD > rulerLen) {
            ctxNum++
            ctx.stroke()
            if (ctxNum >= ctxArrNum) {
              i = 10
              rulerD = totalLen
              continue
            }
            ctx = ctxArr[ctxNum]
            rulerD -= limit
            subD = Math.round(rulerD + part * i) + 0.5
          }

          // odd lines are slighly longer
          const lineNum = (i % 2) ? 12 : 10
          if (isX) {
            ctx.moveTo(subD, 15)
            ctx.lineTo(subD, lineNum)
          } else {
            ctx.moveTo(15, subD)
            ctx.lineTo(lineNum, subD)
          }
        }
        rulerD += bigInt
      }
      ctx.stroke()
    }
  }
}

export default Rulers
