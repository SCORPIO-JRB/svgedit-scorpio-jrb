import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, revealControl } from './helpers.js'

// M1: flip of a multi-selection, Alt+drag as one undo step, Escape cancels
// the gesture in progress.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a"/>
    <rect id="r3" x="420" y="300" width="80" height="60" fill="#a63"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    // Start each test with an empty history (loading adds one step).
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function click (page, selector) {
  const point = await center(page, selector)
  await page.mouse.click(point.x, point.y)
}

async function select (page, ids) {
  await page.evaluate((ids) => {
    const canvas = window.svgEditor.svgCanvas
    canvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
}

// Presses the mouse, moves, presses Escape with the button still down, then
// releases it.
async function dragAndEscape (page, from, to, modifiers = []) {
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 6 })
  for (const key of modifiers) await page.keyboard.up(key)
  await page.keyboard.press('Escape')
  await page.mouse.move(to.x + 15, to.y + 15, { steps: 3 })
  await page.mouse.up()
}

const attrs = (page, id, names) => page.evaluate(({ id, names }) => {
  const el = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, Number(el.getAttribute(name))]))
}, { id, names })

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const selectedIds = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())

const layerMarkup = (page) => page.evaluate(() =>
  document.querySelector('#svgcontent g.layer').outerHTML)

test.describe('Flip of a multi-selection (M1)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Shift+H mirrors the selection around its common centre', async ({ page }) => {
    // Common box from x = 100 to x = 320: the axis is x = 210.
    await select(page, ['r1', 'r2'])
    await page.keyboard.press('Shift+H')
    expect((await attrs(page, 'r1', ['x'])).x).toBe(240)
    expect((await attrs(page, 'r2', ['x'])).x).toBe(100)
    await page.keyboard.press('Control+z')
    expect((await attrs(page, 'r1', ['x'])).x).toBe(100)
    expect((await attrs(page, 'r2', ['x'])).x).toBe(240)
  })

  test('Shift+V mirrors the selection vertically', async ({ page }) => {
    // Common box from y = 100 to y = 360: the axis is y = 230.
    await select(page, ['r1', 'r3'])
    await page.keyboard.press('Shift+V')
    expect((await attrs(page, 'r1', ['y'])).y).toBe(300)
    expect((await attrs(page, 'r3', ['y'])).y).toBe(100)
  })

  test('the flip buttons are shown for a multi-selection', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await revealControl(page, 'tool_flip_h_multi')
    await expect(page.locator('#tool_flip_h_multi')).toBeVisible()
    await page.locator('#tool_flip_h_multi').click()
    expect((await attrs(page, 'r1', ['x'])).x).toBe(240)
  })

  test('Shift+H flips a single element around its own centre', async ({ page }) => {
    await click(page, '#r1')
    await page.keyboard.press('Shift+H')
    expect(await attrs(page, 'r1', ['x', 'y', 'width'])).toEqual({ x: 100, y: 100, width: 80 })
    expect(await undoSize(page)).toBe(1)
  })
})

test.describe('Alt+drag (M1)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('one undo removes the copy and leaves the original in place', async ({ page }) => {
    const before = await layerMarkup(page)
    const start = await center(page, '#r1')
    await page.keyboard.down('Alt')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    expect(await page.locator('#svgcontent rect').count()).toBe(4)
    expect(await undoSize(page)).toBe(1)
    await page.keyboard.press('Control+z')
    expect(await page.locator('#svgcontent rect').count()).toBe(3)
    expect(await layerMarkup(page)).toBe(before)
    await page.keyboard.press('Control+y')
    expect(await page.locator('#svgcontent rect').count()).toBe(4)
  })
})

test.describe('Escape cancels the gesture (M1)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('during a move', async ({ page }) => {
    await click(page, '#r1')
    // State at the start of the drag (selecting may drop a runtime style).
    const before = await layerMarkup(page)
    const start = await center(page, '#r1')
    await dragAndEscape(page, start, { x: start.x + 70, y: start.y + 50 })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
    expect(await selectedIds(page)).toEqual(['r1'])
  })

  test('during the move of a multi-selection', async ({ page }) => {
    const before = await layerMarkup(page)
    await select(page, ['r1', 'r2'])
    const start = await center(page, '#r2')
    await dragAndEscape(page, start, { x: start.x + 70, y: start.y + 50 })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
    expect(await selectedIds(page)).toEqual(['r1', 'r2'])
  })

  test('during an Alt+drag duplicate', async ({ page }) => {
    await click(page, '#r1')
    // State at the start of the drag (selecting may drop a runtime style).
    const before = await layerMarkup(page)
    const start = await center(page, '#r1')
    await dragAndEscape(page, start, { x: start.x + 70, y: start.y + 50 }, ['Alt'])
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
    expect(await selectedIds(page)).toEqual(['r1'])
  })

  test('during a resize', async ({ page }) => {
    await click(page, '#r1')
    // State at the start of the drag (selecting may drop a runtime style).
    const before = await layerMarkup(page)
    const grip = await center(page, '#selectorGrip_resize_se')
    await dragAndEscape(page, grip, { x: grip.x + 60, y: grip.y + 40 })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
  })

  test('during a rotation', async ({ page }) => {
    await click(page, '#r1')
    // State at the start of the drag (selecting may drop a runtime style).
    const before = await layerMarkup(page)
    const grip = await center(page, '#selectorGrip_rotate')
    const pivot = await center(page, '#r1')
    await dragAndEscape(page, grip, { x: pivot.x + 70, y: pivot.y - 20 })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
    const angle = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getRotationAngle(document.getElementById('r1')))
    expect(angle).toBe(0)
  })

  test('during a rubber band: the selection returns to its start', async ({ page }) => {
    await click(page, '#r3')
    const r1 = await page.locator('#r1').boundingBox()
    const r2 = await page.locator('#r2').boundingBox()
    // Shift+drag keeps r3 selected and would add r1 and r2.
    await dragAndEscape(page, { x: r1.x - 20, y: r1.y - 20 }, { x: r2.x + 10, y: r2.y + 10 }, ['Shift'])
    expect(await selectedIds(page)).toEqual(['r3'])
    await expect(page.locator('#selectorRubberBand')).toBeHidden()
  })

  test('after the gesture, Escape still clears the selection', async ({ page }) => {
    await click(page, '#r1')
    const start = await center(page, '#r1')
    await dragAndEscape(page, start, { x: start.x + 70, y: start.y + 50 })
    await page.keyboard.press('Escape')
    expect(await selectedIds(page)).toEqual([])
  })
})
