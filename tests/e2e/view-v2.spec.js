import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// V2: the borderless view. One controller moves and zooms the drawing; the
// view has no edge and no scroll bar, the wheel scrolls it, Ctrl+wheel zooms
// it from 1 % to 6 400 % around the pointer, and none of this touches the
// file.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6"/>
    <rect id="r2" x="300" y="200" width="40" height="40" fill="#36a"/>
  </g>
</svg>`

const FAR = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="near" x="10" y="10" width="20" height="20" fill="#3a6"/>
    <rect id="far" x="100000" y="100000" width="80" height="60" fill="#a63"/>
  </g>
</svg>`

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

const load = (page, svg, { zoom = 1 } = {}) => page.evaluate(({ svg, zoom }) => {
  window.svgEditor.setConfig({ gridSnapping: false })
  window.svgEditor.svgCanvas.setSvgString(svg)
  window.svgEditor.svgCanvas.setZoom(zoom)
  window.svgEditor.updateCanvas(true)
  window.svgEditor.svgCanvas.clearSelection()
}, { svg, zoom })

const source = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
const camera = (page) => page.evaluate(() => ({ ...window.svgEditor.view.camera }))
const box = async (page, selector) => {
  const b = await page.locator(selector).boundingBox()
  return { x: b.x, y: b.y, width: b.width, height: b.height }
}
// Where a point of the drawing is on the screen, by the view: Firefox
// measures the boxes of SVG shapes a little larger than their geometry.
const onScreen = (page, x, y) => page.evaluate(({ x, y }) => window.svgEditor.view.docToScreen(x, y), { x, y })
const viewArea = (page) => page.evaluate(() => {
  const area = document.getElementById('workarea')
  const rect = area.getBoundingClientRect()
  return { x: rect.left + area.clientLeft, y: rect.top + area.clientTop, width: area.clientWidth, height: area.clientHeight }
})

test('the view has no scroll bar and the page starts in the middle', async ({ page }) => {
  await load(page, DRAWING)
  const area = await viewArea(page)
  const layout = await page.evaluate(() => {
    const area = document.getElementById('workarea')
    return {
      mode: window.svgEditor.view.mode,
      overflow: getComputedStyle(area).overflow,
      bars: area.offsetWidth - area.clientWidth - 2 * area.clientLeft
    }
  })
  expect(layout).toEqual({ mode: 'borderless', overflow: 'hidden', bars: 0 })
  // The middle of the page (320, 240) in the middle of the view, and the
  // drawing where the view says.
  const middle = await onScreen(page, 320, 240)
  expect(Math.abs(middle.x - (area.x + area.width / 2))).toBeLessThan(1)
  expect(Math.abs(middle.y - (area.y + area.height / 2))).toBeLessThan(1)
  const r1 = await box(page, '#r1')
  const corner = await onScreen(page, 100, 100)
  expect(Math.abs(r1.x - corner.x)).toBeLessThan(1)
  expect(Math.abs(r1.y - corner.y)).toBeLessThan(1)
})

test('the wheel scrolls the view, Shift+wheel sideways, and the file does not change', async ({ page }) => {
  await load(page, DRAWING)
  const before = await source(page)
  const start = await box(page, '#r1')
  const area = await viewArea(page)
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
  await page.mouse.wheel(0, 120)
  await expect.poll(async () => (await box(page, '#r1')).y).toBeCloseTo(start.y - 120, 0)
  await page.mouse.wheel(80, 0)
  await expect.poll(async () => (await box(page, '#r1')).x).toBeCloseTo(start.x - 80, 0)
  expect(await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())).toBe(1)
  expect(await source(page)).toBe(before)
})

test('Ctrl+wheel zooms around the pointer, from 1 % to 6 400 %', async ({ page }) => {
  await load(page, DRAWING)
  const r1 = await box(page, '#r1')
  // The top left corner of r1 stays under the pointer.
  const pointer = { x: r1.x, y: r1.y }
  await page.mouse.move(pointer.x, pointer.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
  const zoom = await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())
  expect(zoom).toBeGreaterThan(1)
  const after = await box(page, '#r1')
  expect(Math.abs(after.x - pointer.x)).toBeLessThan(1)
  expect(Math.abs(after.y - pointer.y)).toBeLessThan(1)
  // The view and the drawing agree: the corner is still under the pointer.
  const corner = await onScreen(page, 100, 100)
  expect(Math.abs(corner.x - pointer.x)).toBeLessThan(1)
  expect(Math.abs(after.width - 80 * zoom)).toBeLessThanOrEqual(zoom + 0.5)

  const bounds = await page.evaluate(() => {
    const editor = window.svgEditor
    editor.zoomAt(1000)
    const high = editor.svgCanvas.getZoom()
    editor.zoomAt(0.0001)
    const low = editor.svgCanvas.getZoom()
    return { high, low }
  })
  expect(bounds).toEqual({ high: 64, low: 0.01 })
})

test('the zoom steps go up to 6 400 % and come back', async ({ page }) => {
  await load(page, DRAWING)
  const steps = await page.evaluate(() => {
    const editor = window.svgEditor
    const up = []
    for (let i = 0; i < 8; i++) { editor.zoomStep(1); up.push(editor.svgCanvas.getZoom()) }
    editor.zoomStep(-1)
    // The zoom menu of the view group shows it (V3).
    const field = document.querySelector('#se-zoom-button .se-zoom-value')?.textContent ?? document.getElementById('zoom').value
    return { up, back: editor.svgCanvas.getZoom(), field: field.replace(/[^\d.]/g, '') }
  })
  expect(steps.up).toEqual([2, 4, 8, 16, 32, 64, 64, 64])
  expect(steps.back).toBe(32)
  expect(Number(steps.field)).toBe(3200)
})

test('an object 100 000 units away is reached without changing the file', async ({ page }) => {
  await load(page, FAR)
  const before = await source(page)
  const area = await viewArea(page)
  const inView = async (selector) => {
    const b = await box(page, selector)
    return b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height
  }
  expect(await inView('#far')).toBe(false)
  // Through the view, the way the overview and the zoom menu go there.
  await page.evaluate(() => window.svgEditor.view.centerOn(100040, 100030))
  expect(await inView('#far')).toBe(true)
  const far = await box(page, '#far')
  expect(Math.abs(far.x + far.width / 2 - (area.x + area.width / 2))).toBeLessThan(1)
  // And with the wheel, step by step, the surface placed again on the way.
  await page.evaluate(() => window.svgEditor.view.centerOn(99040, 100030))
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
  for (let i = 0; i < 10; i++) await page.mouse.wheel(100, 0)
  await expect.poll(async () => (await box(page, '#far')).x).toBeCloseTo(far.x, 0)
  // The pointer of the canvas follows: a click there selects it.
  const now = await box(page, '#far')
  await page.mouse.click(now.x + now.width / 2, now.y + now.height / 2)
  expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))).toEqual(['far'])
  expect(await source(page)).toBe(before)
})

for (const zoom of [0.25, 1, 16]) {
  test(`at ${zoom * 100} %, a drag moves by the dragged distance and the grips follow the object`, async ({ page }) => {
    await load(page, DRAWING, { zoom })
    await page.evaluate(() => window.svgEditor.view.centerOn(140, 130))
    const r1 = await box(page, '#r1')
    expect(Math.abs(r1.width - 80 * zoom)).toBeLessThanOrEqual(zoom + 0.5)
    const from = await onScreen(page, 140, 130)
    await page.mouse.click(from.x, from.y)
    // The grip on the corner of the object, at every zoom.
    const grip = await box(page, '#selectorGrip_resize_se')
    const corner = await onScreen(page, 180, 160)
    expect(Math.abs(grip.x + grip.width / 2 - corner.x)).toBeLessThan(1.5)
    expect(Math.abs(grip.y + grip.height / 2 - corner.y)).toBeLessThan(1.5)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y + 20, { steps: 5 })
    await page.mouse.up()
    const moved = await page.evaluate(() => {
      const el = document.getElementById('r1')
      return { x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')) }
    })
    expect(moved.x).toBeCloseTo(100 + 40 / zoom, 1)
    expect(moved.y).toBeCloseTo(100 + 20 / zoom, 1)
  })
}

test('Space+drag and the middle button move the view by the dragged distance', async ({ page }) => {
  await load(page, DRAWING, { zoom: 4 })
  const area = await viewArea(page)
  const from = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
  const start = await camera(page)
  await page.keyboard.down('Space')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 120, from.y - 80, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  const afterSpace = await camera(page)
  expect(afterSpace.x - start.x).toBeCloseTo(-120, 0)
  expect(afterSpace.y - start.y).toBeCloseTo(-80, 0)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 4 })
  await page.mouse.up({ button: 'middle' })
  const afterMiddle = await camera(page)
  expect(afterMiddle.x - afterSpace.x).toBeCloseTo(60, 0)
  expect(afterMiddle.y - afterSpace.y).toBeCloseTo(30, 0)
})

test('the rulers measure the view and follow it', async ({ page }) => {
  await load(page, DRAWING)
  const read = () => page.evaluate(() => {
    const area = document.getElementById('workarea')
    const canvas = document.querySelector('#ruler_x canvas')
    return { width: canvas.width, view: area.clientWidth, scroll: document.getElementById('ruler_x').scrollLeft, data: canvas.toDataURL() }
  })
  const before = await read()
  expect(before.width).toBe(before.view)
  expect(before.scroll).toBe(0)
  await page.evaluate(() => window.svgEditor.view.panBy(37, 0))
  await expect.poll(async () => (await read()).data).not.toBe(before.data)
})

test('fitting the zoom to a tiny object stays within 6 400 %', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <g class="layer"><title>Layer 1</title><rect id="tiny" x="10" y="10" width="0.5" height="0.5"/></g></svg>`)
  await page.evaluate(() => {
    window.svgEditor.svgCanvas.selectOnly([document.getElementById('tiny')])
    window.svgEditor.zoomChanged(window, 'selection')
  })
  expect(await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())).toBe(64)
  const tiny = await box(page, '#tiny')
  const area = await viewArea(page)
  expect(Math.abs(tiny.x + tiny.width / 2 - (area.x + area.width / 2))).toBeLessThan(1)
})

test('the scroll view stays available with the option view: "scroll"', async ({ page }) => {
  await page.goto('/index.html?view=scroll')
  await page.waitForFunction(() => window.svgEditor?.extensionsAdded)
  const layout = await page.evaluate(() => ({
    mode: window.svgEditor.view.mode,
    overflow: getComputedStyle(document.getElementById('workarea')).overflow
  }))
  expect(layout.mode).toBe('scroll')
  expect(layout.overflow).not.toBe('hidden')
})
