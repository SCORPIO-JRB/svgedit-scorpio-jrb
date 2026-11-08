/**
 * The view of the drawing (plan v2, section 4.3, lot V2).
 *
 * One controller for every way of moving or zooming the drawing: the wheel,
 * a pinch, Space+drag, the middle button, the zoom field and menu, the zoom
 * tool, the overview and the keyboard. The rulers, the grid and the overview
 * follow it.
 *
 * Borderless view, the default: the drawing has no edge. The camera is a
 * zoom and the position, in the view, of the origin of the drawing; nothing
 * bounds it, so an object 100 000 units away is reached without touching the
 * file. The canvas (#svgcanvas and #svgroot) is a surface a little larger than
 * the view, which the controller scrolls: a pan only scrolls it while the
 * view stays well inside; when the view would come near its edge, the surface
 * is centred under the view again and the drawing moved on it by the same
 * amount, in one redraw. There is no scroll bar, the view never ends.
 *
 * Scroll view, option `view: 'scroll'`: the canvas of SVG-Edit, three times
 * the drawing, with scroll bars. Kept until the end of V3.
 */

export const VIEW_MODES = ['borderless', 'scroll']
export const ZOOM_MIN = 0.01
export const ZOOM_MAX = 64
// The steps of the keyboard and of the zoom buttons, from 1 % to 6 400 %.
export const ZOOM_STEPS = [0.01, 0.02, 0.03, 0.06, 0.12, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]

/**
 * @param {number} zoom
 * @returns {number} The zoom within the bounds of the view
 */
export const clampZoom = (zoom) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

/**
 * @param {number} zoom
 * @param {1|-1} direction
 * @returns {number} The next step of the zoom, up or down
 */
export const nextZoomStep = (zoom, direction) => {
  const next = direction > 0
    ? ZOOM_STEPS.find((step) => step > zoom * 1.001)
    : [...ZOOM_STEPS].reverse().find((step) => step < zoom * 0.999)
  return next ?? (direction > 0 ? ZOOM_MAX : ZOOM_MIN)
}

/**
 * @typedef {object} Camera
 * @property {number} zoom
 * @property {number} x Position of the origin of the drawing in the view, in pixels
 * @property {number} y
 */

/**
 * The camera after a zoom that keeps the point of the drawing under an
 * anchor where it is.
 * @param {Camera} camera
 * @param {number} zoom
 * @param {{x: number, y: number}} anchor In the view, in pixels
 * @returns {Camera}
 */
export const zoomAround = (camera, zoom, anchor) => {
  const px = (anchor.x - camera.x) / camera.zoom
  const py = (anchor.y - camera.y) / camera.zoom
  return { zoom, x: anchor.x - px * zoom, y: anchor.y - py * zoom }
}

/**
 * Where the surface is scrolled for a camera, and where the drawing is on
 * the surface. The drawing stays where it is while the scroll stays in the
 * middle half of its range; otherwise the surface is centred again.
 * @param {Camera} camera
 * @param {{x: number, y: number}|null} offset Where the origin of the drawing is on the surface now; null to centre the surface
 * @param {number} slack How much the surface exceeds the view on each side
 * @returns {{scrollX: number, scrollY: number, offset: {x: number, y: number}, moved: boolean}}
 */
export const placeSurface = (camera, offset, slack) => {
  if (offset) {
    const scrollX = Math.round(offset.x - camera.x)
    const scrollY = Math.round(offset.y - camera.y)
    const low = slack / 4
    const high = slack * 7 / 4
    if (scrollX >= low && scrollX <= high && scrollY >= low && scrollY <= high) {
      return { scrollX, scrollY, offset, moved: false }
    }
  }
  return {
    scrollX: slack,
    scrollY: slack,
    offset: { x: slack + camera.x, y: slack + camera.y },
    moved: true
  }
}

export class ViewController {
  /**
   * @param {object} editor The editor: its workarea, svgCanvas and $container
   * @param {object} [options]
   * @param {"borderless"|"scroll"} [options.mode="borderless"]
   */
  constructor (editor, { mode = 'borderless' } = {}) {
    this.editor = editor
    this.mode = VIEW_MODES.includes(mode) ? mode : 'borderless'
    /** @type {Camera|null} What the view shows */
    this.camera = null
    /** @type {Camera|null} What was asked; differs from camera by less than a pixel */
    this.target = null
    this.offset = null
    this.slack = 0
    this.size = null
    this.frame = null
    if (this.borderless) editor.workarea.classList.add('se-view-borderless')
    // A side panel that opens changes the view, not the window: the middle
    // of the view stays where it is, and the rulers follow.
    if (this.borderless && typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(() => {
        const { width, height } = this.viewport
        if (this.size && (width !== this.size.width || height !== this.size.height)) editor.updateCanvas()
      })
      this.resizeObserver.observe(editor.workarea)
    }
  }

  get borderless () {
    return this.mode === 'borderless'
  }

  get workarea () {
    return this.editor.workarea
  }

  get canvas () {
    return this.editor.svgCanvas
  }

  get surface () {
    return this.workarea.querySelector('#svgcanvas')
  }

  /**
   * @returns {{width: number, height: number}} The view, without its border
   */
  get viewport () {
    return { width: this.workarea.clientWidth, height: this.workarea.clientHeight }
  }

  /**
   * @returns {{left: number, top: number}} The top left corner of the view, in client coordinates
   */
  get origin () {
    const rect = this.workarea.getBoundingClientRect()
    return { left: rect.left + this.workarea.clientLeft, top: rect.top + this.workarea.clientTop }
  }

  /**
   * Places the drawing after a change of zoom, of document size or of view
   * size: what `Editor.updateCanvas` does in the borderless view.
   * @param {object} [options]
   * @param {boolean} [options.center] The page in the middle of the view, or at its top left corner when it is wider
   * @param {{x: number, y: number}} [options.newCtr] The point of the drawing, times the zoom, to put in the middle of the view
   * @returns {void}
   */
  layout ({ center = false, newCtr } = {}) {
    const zoom = this.canvas.getZoom()
    const { width, height } = this.viewport
    const { contentW, contentH } = this.canvas
    let camera
    if (center || !this.target) {
      camera = contentW * zoom > width
        ? { zoom, x: 10, y: 10 }
        : { zoom, x: (width - contentW * zoom) / 2, y: (height - contentH * zoom) / 2 }
    } else if (newCtr) {
      camera = { zoom, x: width / 2 - newCtr.x, y: height / 2 - newCtr.y }
    } else {
      // The point of the drawing in the middle of the view stays there,
      // whether the zoom or the view changed.
      const before = this.size ?? { width, height }
      const px = (before.width / 2 - this.target.x) / this.target.zoom
      const py = (before.height / 2 - this.target.y) / this.target.zoom
      camera = { zoom, x: width / 2 - px * zoom, y: height / 2 - py * zoom }
    }
    // The drawing laid out on whole pixels, whatever the width of the view
    // (odd in the canvas layout of V3): its lines stay crisp and a pointer
    // meets it where a gesture expects it.
    camera.x = Math.round(camera.x)
    camera.y = Math.round(camera.y)
    this.apply(camera, { redraw: true })
  }

  /**
   * Shows the drawing through a camera.
   * @param {Camera} camera
   * @param {object} [options]
   * @param {boolean} [options.redraw] Places the drawing on the surface again even if the view stays inside it
   * @returns {void}
   */
  apply (camera, { redraw = false } = {}) {
    const { width, height } = this.viewport
    const slack = Math.ceil(Math.max(width, height, 512))
    const resized = !this.size || this.size.width !== width || this.size.height !== height || slack !== this.slack
    const zoomed = !this.camera || this.camera.zoom !== camera.zoom
    const place = placeSurface(camera, redraw || resized || zoomed ? null : this.offset, slack)
    if (place.moved) {
      const surfaceW = width + 2 * slack
      const surfaceH = height + 2 * slack
      const { surface } = this
      surface.style.width = `${surfaceW}px`
      surface.style.height = `${surfaceH}px`
      this.canvas.updateCanvas(surfaceW, surfaceH, place.offset)
      this.offset = place.offset
      // In the same frame as the drawing.
      this.editor.grid?.update()
      this.editor.frames?.update()
    }
    this.slack = slack
    this.size = { width, height }
    this.target = { ...camera }
    this.workarea.scrollLeft = place.scrollX
    this.workarea.scrollTop = place.scrollY
    // What is shown: the scroll is in whole pixels.
    this.camera = {
      zoom: camera.zoom,
      x: this.offset.x - this.workarea.scrollLeft,
      y: this.offset.y - this.workarea.scrollTop
    }
    this.changed()
  }

  /**
   * Moves the drawing in the view.
   * @param {number} dx In pixels, to the right
   * @param {number} dy In pixels, down
   * @returns {void}
   */
  panBy (dx, dy) {
    if (!dx && !dy) return
    if (!this.borderless) {
      this.workarea.scrollLeft -= dx
      this.workarea.scrollTop -= dy
      return
    }
    if (!this.target) this.layout()
    this.apply({ ...this.target, x: this.target.x + dx, y: this.target.y + dy })
  }

  /**
   * Zooms, keeping the point of the drawing under the anchor where it is.
   * The zoom set on the canvas must already be the new one in the scroll view
   * (see Editor.zoomAt).
   * @param {number} level
   * @param {number} [clientX] The anchor, in client coordinates; the middle of the view by default
   * @param {number} [clientY]
   * @returns {boolean} Whether the zoom changed
   */
  zoomAt (level, clientX, clientY) {
    const zoom = clampZoom(level)
    if (!this.target) this.layout()
    if (!Number.isFinite(zoom) || Math.abs(zoom - this.target.zoom) < 1e-9) return false
    const { width, height } = this.viewport
    const { left, top } = this.origin
    const anchor = clientX == null
      ? { x: width / 2, y: height / 2 }
      : { x: clientX - left, y: clientY - top }
    this.canvas.setZoom(zoom)
    this.apply(zoomAround(this.target, zoom, anchor))
    return true
  }

  /**
   * Puts a point of the drawing in the middle of the view.
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  centerOn (x, y) {
    if (!this.borderless) {
      const zoom = this.canvas.getZoom()
      this.editor.updateCanvas(false, { x: x * zoom, y: y * zoom })
      return
    }
    if (!this.target) this.layout()
    const { width, height } = this.viewport
    const { zoom } = this.target
    this.apply({ zoom, x: width / 2 - x * zoom, y: height / 2 - y * zoom })
  }

  /**
   * @param {number} clientX
   * @param {number} clientY
   * @returns {{x: number, y: number}} The point of the drawing under a point of the screen
   */
  screenToDoc (clientX, clientY) {
    if (this.borderless && this.camera) {
      const { left, top } = this.origin
      const { zoom, x, y } = this.camera
      return { x: (clientX - left - x) / zoom, y: (clientY - top - y) / zoom }
    }
    const ctm = this.canvas.getSvgContent()?.querySelector('g')?.getScreenCTM?.()
    if (!ctm) return { x: 0, y: 0 }
    const inverse = ctm.inverse()
    return {
      x: inverse.a * clientX + inverse.c * clientY + inverse.e,
      y: inverse.b * clientX + inverse.d * clientY + inverse.f
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {{x: number, y: number}} Where a point of the drawing is on the screen
   */
  docToScreen (x, y) {
    if (this.borderless && this.camera) {
      const { left, top } = this.origin
      const { zoom } = this.camera
      return { x: left + this.camera.x + x * zoom, y: top + this.camera.y + y * zoom }
    }
    const ctm = this.canvas.getSvgContent()?.querySelector('g')?.getScreenCTM?.()
    if (!ctm) return { x: 0, y: 0 }
    return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f }
  }

  /**
   * @returns {{x: number, y: number, width: number, height: number}} The part of the drawing in the view
   */
  visibleRect () {
    const { left, top } = this.origin
    const { width, height } = this.viewport
    const a = this.screenToDoc(left, top)
    const b = this.screenToDoc(left + width, top + height)
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }
  }

  /**
   * @returns {{x: number, y: number}} The point of the drawing in the middle of the view
   */
  get center () {
    const { x, y, width, height } = this.visibleRect()
    return { x: x + width / 2, y: y + height / 2 }
  }

  /**
   * After every change: the pointer of the canvas, then, once per frame, the
   * rulers, and the listeners of `se-viewchange`.
   * @returns {void}
   */
  changed () {
    const ctm = this.canvas.getSvgContent()?.querySelector('g')?.getScreenCTM?.()
    if (ctm) this.canvas.setRootSctm(ctm.inverse())
    if (this.frame) return
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0)
    this.frame = schedule(() => {
      this.frame = null
      if (this.editor.configObj?.curConfig.showRulers) this.editor.rulers?.updateRulers()
      this.editor.$container?.dispatchEvent(new CustomEvent('se-viewchange', { detail: { camera: this.camera } }))
    })
  }
}
