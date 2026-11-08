import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// U1 Q6-Q8: gesture, selection and grip behaviours.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a"/>
    <rect id="r3" x="420" y="300" width="80" height="60" fill="#a63"/>
    <g id="grp">
      <rect id="g1" x="100" y="300" width="60" height="40" fill="#999"/>
      <rect id="g2" x="200" y="300" width="60" height="40" fill="#666"/>
    </g>
  </g>
</svg>`

async function loadDrawing (page, zoom = 1) {
  await page.evaluate(({ svg, zoom }) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(zoom)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
  }, { svg: DRAWING, zoom })
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag (page, from, to, modifiers = []) {
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
}

async function click (page, selector, modifiers = []) {
  for (const key of modifiers) await page.keyboard.down(key)
  const point = await center(page, selector)
  await page.mouse.click(point.x, point.y)
  for (const key of modifiers) await page.keyboard.up(key)
}

const attrs = (page, id, names) => page.evaluate(({ id, names }) => {
  const el = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, Number(el.getAttribute(name))]))
}, { id, names })

const selectedIds = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())

test.describe('Gestures (U1)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Alt+drag duplicates the dragged element and leaves the original in place', async ({ page }) => {
    const start = await center(page, '#r1')
    await drag(page, start, { x: start.x + 60, y: start.y + 40 }, ['Alt'])
    expect(await page.locator('#svgcontent rect').count()).toBe(6)
    expect(await attrs(page, 'r1', ['x', 'y'])).toEqual({ x: 100, y: 100 })
    const [copy] = await selectedIds(page)
    expect(copy).not.toBe('r1')
    expect(await attrs(page, copy, ['x', 'y'])).toEqual({ x: 160, y: 140 })
  })

  test('Alt+click without dragging does not duplicate', async ({ page }) => {
    await click(page, '#r1')
    await click(page, '#r2', ['Alt'])
    expect(await page.locator('#svgcontent rect').count()).toBe(5)
  })

  test('Alt resizes from the center', async ({ page }) => {
    await click(page, '#r1')
    const grip = await center(page, '#selectorGrip_resize_e')
    await drag(page, grip, { x: grip.x + 20, y: grip.y }, ['Alt'])
    const { x, width } = await attrs(page, 'r1', ['x', 'width'])
    expect(Math.round(width)).toBe(120)
    expect(Math.round(x)).toBe(80)
  })

  test('Shift keeps the proportions while resizing', async ({ page }) => {
    await click(page, '#r1')
    const grip = await center(page, '#selectorGrip_resize_se')
    await drag(page, grip, { x: grip.x + 40, y: grip.y + 5 }, ['Shift'])
    const { width, height } = await attrs(page, 'r1', ['width', 'height'])
    expect(width / height).toBeCloseTo(80 / 60, 1)
  })

  test('Shift snaps the rotation to 15 degree steps', async ({ page }) => {
    await click(page, '#r1')
    const grip = await center(page, '#selectorGrip_rotate')
    const pivot = await center(page, '#r1')
    await drag(page, grip, { x: pivot.x + 70, y: pivot.y - 40 }, ['Shift'])
    const angle = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getRotationAngle(document.getElementById('r1')))
    expect(Math.round(angle) % 15).toBe(0)
    expect(Math.round(angle)).not.toBe(0)
  })

  test('a grip can be grabbed a few pixels away from its square', async ({ page }) => {
    await click(page, '#r1')
    const grip = await center(page, '#selectorGrip_resize_se')
    await drag(page, { x: grip.x + 6, y: grip.y + 6 }, { x: grip.x + 46, y: grip.y + 26 })
    const { width } = await attrs(page, 'r1', ['width'])
    expect(width).toBeGreaterThan(100)
  })

  test('Shift+rubber band adds to the selection', async ({ page }) => {
    await click(page, '#r3')
    const r1 = await page.locator('#r1').boundingBox()
    const r2 = await page.locator('#r2').boundingBox()
    await drag(page, { x: r1.x - 20, y: r1.y - 20 }, { x: r2.x + 10, y: r2.y + 10 }, ['Shift'])
    expect(await selectedIds(page)).toEqual(['r1', 'r2', 'r3'])
  })

  test('Shift+click removes a selected element', async ({ page }) => {
    await click(page, '#r1')
    await click(page, '#r2', ['Shift'])
    await click(page, '#r1', ['Shift'])
    expect(await selectedIds(page)).toEqual(['r2'])
  })

  test('a click on a member of a multi-selection keeps only that member', async ({ page }) => {
    await click(page, '#r1')
    await click(page, '#r2', ['Shift'])
    await click(page, '#r2')
    expect(await selectedIds(page)).toEqual(['r2'])
  })

  test('Escape leaves the open group, then clears the selection', async ({ page }) => {
    const child = await center(page, '#g1')
    await page.mouse.dblclick(child.x, child.y)
    await page.mouse.click(child.x, child.y)
    expect(await selectedIds(page)).toEqual(['g1'])
    await page.keyboard.press('Escape')
    expect(await selectedIds(page)).toEqual(['grp'])
    await page.keyboard.press('Escape')
    expect(await selectedIds(page)).toEqual([])
  })
})

test.describe('Zoom-independent gestures (U1)', () => {
  test('arrow keys move by one document unit at 200 % zoom', async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, 2)
    await click(page, '#r1')
    await page.keyboard.press('ArrowRight')
    expect(await attrs(page, 'r1', ['x'])).toEqual({ x: 101 })
  })

  test('the drag threshold is measured in screen pixels', async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, 2)
    await click(page, '#r1')
    const start = await center(page, '#r1')
    // 2 screen pixels at 200 % are 1 unit: below the 3-pixel threshold
    // (the old threshold was 4 document units, i.e. 8 pixels at 200 %).
    await drag(page, start, { x: start.x + 2, y: start.y })
    expect(await attrs(page, 'r1', ['x'])).toEqual({ x: 100 })
    // 10 screen pixels at 200 % are 5 units.
    await drag(page, start, { x: start.x + 10, y: start.y })
    expect(await attrs(page, 'r1', ['x'])).toEqual({ x: 105 })
  })
})
