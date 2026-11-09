import {
  ZOOM_MIN, ZOOM_MAX, ZOOM_STEPS, clampZoom, nextZoomStep, zoomAround, placeSurface, ViewController
} from '../../src/editor/view.js'

// Lot V2: the controller of the borderless view.

describe('view: zoom (V2)', () => {
  it('goes from 1 % to 6 400 %, by steps that double above 100 %', () => {
    expect([ZOOM_MIN, ZOOM_MAX]).toEqual([0.01, 64])
    expect(ZOOM_STEPS.slice(ZOOM_STEPS.indexOf(1))).toEqual([1, 2, 4, 8, 16, 32, 64])
    expect(clampZoom(1000)).toBe(64)
    expect(clampZoom(0)).toBe(0.01)
    expect(nextZoomStep(1, 1)).toBe(2)
    expect(nextZoomStep(1.5, 1)).toBe(2)
    expect(nextZoomStep(64, 1)).toBe(64)
    expect(nextZoomStep(64, -1)).toBe(32)
    expect(nextZoomStep(0.01, -1)).toBe(0.01)
  })

  it('keeps the point under the anchor where it is', () => {
    const camera = { zoom: 2, x: 100, y: 50 }
    const anchor = { x: 300, y: 250 }
    const after = zoomAround(camera, 8, anchor)
    // The point of the drawing under the anchor, before and after.
    const before = { x: (anchor.x - camera.x) / camera.zoom, y: (anchor.y - camera.y) / camera.zoom }
    expect(after.x + before.x * after.zoom).toBeCloseTo(anchor.x, 9)
    expect(after.y + before.y * after.zoom).toBeCloseTo(anchor.y, 9)
  })
})

describe('view: the surface (V2)', () => {
  it('only scrolls while the view stays in the middle of the surface', () => {
    const slack = 1000
    const offset = { x: 1200, y: 1100 }
    const near = placeSurface({ zoom: 1, x: 150, y: 80 }, offset, slack)
    expect(near).toEqual({ scrollX: 1050, scrollY: 1020, offset, moved: false })
  })

  it('places the surface again under the view when the view would leave it', () => {
    const slack = 1000
    const far = placeSurface({ zoom: 1, x: -900, y: 80 }, { x: 1200, y: 1100 }, slack)
    expect(far).toEqual({ scrollX: 1000, scrollY: 1000, offset: { x: 100, y: 1080 }, moved: true })
    // Whatever the distance: the origin may be 6 400 000 pixels away.
    const veryFar = placeSurface({ zoom: 64, x: -6.4e6, y: -6.4e6 }, null, slack)
    expect(veryFar.offset).toEqual({ x: 1000 - 6.4e6, y: 1000 - 6.4e6 })
  })
})

/**
 * A view of 800 × 600 pixels at (10, 20), over a canvas that records what
 * it is asked.
 * @returns {object}
 */
const fakeEditor = () => {
  const workarea = document.createElement('div')
  const surface = document.createElement('div')
  surface.id = 'svgcanvas'
  workarea.append(surface)
  // Kept out of the document: several fake views coexist in this file.
  let scroll = { left: 0, top: 0 }
  Object.defineProperties(workarea, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    clientLeft: { value: 1 },
    clientTop: { value: 1 },
    scrollLeft: { get: () => scroll.left, set: (v) => { scroll = { ...scroll, left: Math.round(v) } } },
    scrollTop: { get: () => scroll.top, set: (v) => { scroll = { ...scroll, top: Math.round(v) } } }
  })
  workarea.getBoundingClientRect = () => ({ left: 9, top: 19, width: 802, height: 602 })
  const updates = []
  let zoom = 1
  const svgCanvas = {
    contentW: 640,
    contentH: 480,
    getZoom: () => zoom,
    setZoom: (z) => { zoom = z },
    updateCanvas: (w, h, offset) => updates.push({ w, h, offset }),
    getSvgContent: () => null,
    setRootSctm: () => {}
  }
  return { workarea, svgCanvas, updates, $container: document.createElement('div') }
}

describe('ViewController (V2)', () => {
  it('starts with the page in the middle, without scroll bar', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor)
    expect(view.borderless).toBe(true)
    expect(editor.workarea.classList.contains('se-view-borderless')).toBe(true)
    view.layout({ center: true })
    expect(view.camera).toEqual({ zoom: 1, x: 80, y: 60 })
    // The surface exceeds the view by 800 pixels on each side.
    expect(editor.updates.at(-1)).toEqual({ w: 2400, h: 2200, offset: { x: 880, y: 860 } })
    expect(view.screenToDoc(10 + 80, 20 + 60)).toEqual({ x: 0, y: 0 })
    expect(view.docToScreen(640, 480)).toEqual({ x: 10 + 80 + 640, y: 20 + 60 + 480 })
    expect(view.center).toEqual({ x: 320, y: 240 })
  })

  it('pans by scrolling only, then places the surface again', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor)
    view.layout({ center: true })
    const redraws = editor.updates.length
    view.panBy(-150, 40)
    expect(editor.updates.length).toBe(redraws)
    expect(view.camera).toEqual({ zoom: 1, x: -70, y: 100 })
    // 1 500 more pixels: the scroll has 600 pixels of room each way, the
    // surface is placed again twice.
    for (let i = 0; i < 10; i++) view.panBy(-150, 0)
    expect(editor.updates.length).toBe(redraws + 2)
    expect(view.camera).toEqual({ zoom: 1, x: -1570, y: 100 })
    expect(view.screenToDoc(10, 20)).toEqual({ x: 1570, y: -100 })
  })

  it('keeps fractions of a pixel for the next moves', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor)
    view.layout({ center: true })
    for (let i = 0; i < 10; i++) view.panBy(0.3, 0)
    expect(view.target.x).toBeCloseTo(83, 9)
    expect(view.camera.x).toBe(83)
  })

  it('zooms around the pointer and within the bounds', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor)
    view.layout({ center: true })
    const pointer = view.docToScreen(100, 100)
    expect(view.zoomAt(4, pointer.x, pointer.y)).toBe(true)
    expect(editor.svgCanvas.getZoom()).toBe(4)
    const after = view.screenToDoc(pointer.x, pointer.y)
    expect(after.x).toBeCloseTo(100, 9)
    expect(after.y).toBeCloseTo(100, 9)
    view.zoomAt(500)
    expect(editor.svgCanvas.getZoom()).toBe(64)
    expect(view.zoomAt(64)).toBe(false)
  })

  it('reaches a point 100 000 units away', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor)
    view.layout({ center: true })
    view.centerOn(100000, 100000)
    expect(view.center.x).toBeCloseTo(100000, 6)
    expect(view.center.y).toBeCloseTo(100000, 6)
    view.zoomAt(64)
    expect(view.center.x).toBeCloseTo(100000, 6)
  })

  it('keeps the middle of the view when the zoom or the view changes', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor)
    view.layout({ center: true })
    view.centerOn(200, 150)
    editor.svgCanvas.setZoom(3)
    view.layout()
    expect(view.center.x).toBeCloseTo(200, 9)
    expect(view.center.y).toBeCloseTo(150, 9)
    // newCtr: a point of the drawing times the zoom, as Editor.updateCanvas gets it.
    view.layout({ newCtr: { x: 30 * 3, y: 40 * 3 } })
    expect(view.center.x).toBeCloseTo(30, 9)
    expect(view.center.y).toBeCloseTo(40, 9)
  })

  it('is borderless whatever is asked: the scroll view left in lot S3', () => {
    const editor = fakeEditor()
    const view = new ViewController(editor, { mode: 'scroll' })
    expect(view.mode).toBe('borderless')
    expect(view.borderless).toBe(true)
    expect(editor.workarea.classList.contains('se-view-borderless')).toBe(true)
  })
})
