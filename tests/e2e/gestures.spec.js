import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Characterisation of the canvas gestures driven with the real mouse and
// keyboard. These behaviours must survive the canvas redesign; a test that has
// to change documents an intended behaviour change.

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

async function loadDrawing (page, { snapping = true } = {}) {
  await page.evaluate(({ svg, snapping }) => {
    window.svgEditor.setConfig({ gridSnapping: snapping })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
  }, { svg: DRAWING, snapping })
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  if (!box) throw new Error(`No bounding box for ${selector}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function drag (page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
}

const attrs = (page, id, names) => page.evaluate(({ id, names }) => {
  const el = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, el.getAttribute(name)]))
}, { id, names })

const selectedIds = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())

test.describe('Canvas gestures with the real mouse', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('dragging an element moves it by the dragged distance', async ({ page }) => {
    const start = await center(page, '#r1')
    await drag(page, start, { x: start.x + 50, y: start.y + 30 })
    expect(await attrs(page, 'r1', ['x', 'y'])).toEqual({ x: '150', y: '130' })
    expect(await selectedIds(page)).toEqual(['r1'])
  })

  test('undo and redo restore and reapply a drag', async ({ page }) => {
    const start = await center(page, '#r1')
    await drag(page, start, { x: start.x + 50, y: start.y + 30 })
    await page.keyboard.press('Control+z')
    expect(await attrs(page, 'r1', ['x', 'y'])).toEqual({ x: '100', y: '100' })
    await page.keyboard.press('Control+y')
    expect(await attrs(page, 'r1', ['x', 'y'])).toEqual({ x: '150', y: '130' })
  })

  test('the south-east grip resizes the selected element', async ({ page }) => {
    await page.mouse.click(...Object.values(await center(page, '#r1')))
    const grip = await center(page, '#selectorGrip_resize_se')
    await drag(page, grip, { x: grip.x + 40, y: grip.y + 20 })
    const { width, height } = await attrs(page, 'r1', ['width', 'height'])
    expect(Number(width)).toBeGreaterThan(100)
    expect(Number(height)).toBeGreaterThan(70)
  })

  test('the rotation grip rotates the selected element', async ({ page }) => {
    await page.mouse.click(...Object.values(await center(page, '#r1')))
    const grip = await center(page, '#selectorGrip_rotate')
    const pivot = await center(page, '#r1')
    await drag(page, grip, { x: pivot.x + 120, y: pivot.y })
    const { transform } = await attrs(page, 'r1', ['transform'])
    expect(transform).toMatch(/rotate\(/)
  })

  test('a rubber band selects the elements it touches', async ({ page }) => {
    const r1 = await page.locator('#r1').boundingBox()
    const r2 = await page.locator('#r2').boundingBox()
    // From empty space above-left of r1 to the middle of r2.
    await drag(page, { x: r1.x - 20, y: r1.y - 20 }, { x: r2.x + r2.width / 2, y: r2.y + r2.height / 2 })
    expect(await selectedIds(page)).toEqual(['r1', 'r2'])
  })

  test('shift+click adds an element to the selection', async ({ page }) => {
    await page.mouse.click(...Object.values(await center(page, '#r1')))
    await page.keyboard.down('Shift')
    await page.mouse.click(...Object.values(await center(page, '#r2')))
    await page.keyboard.up('Shift')
    expect(await selectedIds(page)).toEqual(['r1', 'r2'])
  })

  test('arrow keys nudge the selection by one unit at 100 % zoom', async ({ page }) => {
    await loadDrawing(page, { snapping: false })
    await page.mouse.click(...Object.values(await center(page, '#r1')))
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    expect(await attrs(page, 'r1', ['x', 'y'])).toEqual({ x: '101', y: '101' })
  })

  test('delete removes the selection', async ({ page }) => {
    await page.mouse.click(...Object.values(await center(page, '#r2')))
    await page.keyboard.press('Delete')
    expect(await page.locator('#svgcontent #r2').count()).toBe(0)
  })

  test('double-click enters a group, then a click selects a child', async ({ page }) => {
    const child = await center(page, '#g1')
    await page.mouse.click(child.x, child.y)
    expect(await selectedIds(page)).toEqual(['grp'])
    await page.mouse.dblclick(child.x, child.y)
    await page.mouse.click(child.x, child.y)
    expect(await selectedIds(page)).toEqual(['g1'])
  })

  test('space+drag pans the view', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.setZoom(4)
      window.svgEditor.updateCanvas()
    })
    const before = await page.evaluate(() => {
      const area = document.getElementById('workarea')
      return { left: area.scrollLeft, top: area.scrollTop }
    })
    const area = await page.locator('#workarea').boundingBox()
    const from = { x: area.x + area.width / 2, y: area.y + area.height / 2 }
    await page.keyboard.down('Space')
    await drag(page, from, { x: from.x - 120, y: from.y - 80 })
    await page.keyboard.up('Space')
    const after = await page.evaluate(() => {
      const area = document.getElementById('workarea')
      return { left: area.scrollLeft, top: area.scrollTop }
    })
    expect(after.left).toBeGreaterThan(before.left)
    expect(after.top).toBeGreaterThan(before.top)
  })
})
