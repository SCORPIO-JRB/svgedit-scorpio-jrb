import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// V2: the grid of the interaction layer, the snapping and its guides, the
// measures with Alt, and the alignment shortcuts (decision D6).

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="a" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="6"/>
    <rect id="b" x="300" y="300" width="40" height="40" fill="#36a"/>
  </g>
</svg>`

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: true, showGrid: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas(true)
    window.svgEditor.svgCanvas.clearSelection()
  }, DRAWING)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

const box = async (page, id) => page.locator(`#${id}`).boundingBox()
const center = async (page, id) => {
  const b = await box(page, id)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const attrs = (page, id, names) => page.evaluate(({ id, names }) => {
  const el = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, el.getAttribute(name)]))
}, { id, names })
const guidesShown = (page) => page.evaluate(() => {
  const group = document.getElementById('selectorGuides')
  return Boolean(group) && group.getAttribute('display') !== 'none' && Boolean(group.querySelector('path').getAttribute('d'))
})
const source = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())

test('a drag aligns two objects without typing, with the same SVG as a typed value', async ({ page }) => {
  // b's left edge, 300, dragged to 3 units from a's left edge, 100.
  const from = await center(page, 'b')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 120, from.y, { steps: 4 })
  await page.mouse.move(from.x - 197, from.y - 150, { steps: 4 })
  expect(await guidesShown(page)).toBe(true)
  await page.mouse.up()
  expect(await guidesShown(page)).toBe(false)
  // Stroke excluded: the edge of the geometry, as the X field says.
  expect(await attrs(page, 'b', ['x', 'y', 'transform'])).toEqual({ x: '100', y: '150', transform: null })
  const dragged = await source(page)

  // The same move typed in the fields of the panel.
  await page.evaluate((svg) => {
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.updateCanvas(true)
  }, DRAWING)
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('b')], true))
  for (const [field, value] of [['#selected_x', '100'], ['#selected_y', '150']]) {
    const input = page.locator(field).locator('#input')
    await input.click()
    await input.press('Control+a')
    await input.pressSequentially(value)
    await input.press('Enter')
  }
  expect(await attrs(page, 'b', ['x', 'y'])).toEqual({ x: '100', y: '150' })
  expect(await source(page)).toBe(dragged)
})

test('Ctrl held suspends the snapping', async ({ page }) => {
  const from = await center(page, 'b')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.keyboard.down('Control')
  await page.mouse.move(from.x - 197, from.y - 150, { steps: 6 })
  expect(await guidesShown(page)).toBe(false)
  await page.mouse.up()
  await page.keyboard.up('Control')
  expect(await attrs(page, 'b', ['x', 'y'])).toEqual({ x: '103', y: '150' })
})

test('the snapping to objects can be turned off, the grid snaps alone', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.setConfig({ objectSnapping: false, gridSnapping: true, snappingStep: 25 }))
  const from = await center(page, 'b')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x - 197, from.y - 147, { steps: 6 })
  await page.mouse.up()
  // 103 and 153: the nearest lines of the grid are 100 and 150.
  expect(await attrs(page, 'b', ['x', 'y'])).toEqual({ x: '100', y: '150' })
})

test('a resize snaps its edge to a neighbour and its width to a width', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('b')], true))
  const grip = await center(page, 'selectorGrip_resize_e')
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  // Width 40 + 37 = 77: 3 from the width of a, 80.
  await page.mouse.move(grip.x + 37, grip.y, { steps: 5 })
  await page.mouse.up()
  expect(await attrs(page, 'b', ['x', 'width'])).toEqual({ x: '300', width: '80' })
})

test('the grid is drawn over the whole view, outside the document, and the button shows it', async ({ page }) => {
  const before = await source(page)
  await page.locator('#view_grid').click()
  const grid = await page.evaluate(() => {
    const group = document.getElementById('se-grid')
    const area = document.getElementById('workarea').getBoundingClientRect()
    const shown = group.getBoundingClientRect()
    return {
      display: group.getAttribute('display'),
      inDocument: Boolean(document.querySelector('#svgcontent #se-grid')),
      coversView: shown.left <= area.left && shown.top <= area.top && shown.right >= area.right && shown.bottom >= area.bottom,
      aboveDrawing: document.getElementById('svgcontent').nextElementSibling === group
    }
  })
  expect(grid).toEqual({ display: 'inline', inDocument: false, coversView: true, aboveDrawing: true })
  expect(await source(page)).toBe(before)
})

test('the minor lines go under 8 pixels, the major ones stay readable', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.setConfig({ showGrid: true, snappingStep: 10, gridSubdivisions: 5 }))
  const at = (zoom) => page.evaluate((zoom) => {
    window.svgEditor.zoomAt(zoom)
    const minor = document.querySelector('#se-grid rect[fill="url(#se-grid-minor)"]')
    const major = document.getElementById('se-grid-major')
    return { minor: minor.getAttribute('display') !== 'none', major: Number(major.getAttribute('width')) }
  }, zoom)
  expect(await at(1)).toEqual({ minor: true, major: 50 })
  // 10 units at 50 %: 5 pixels, too close.
  expect(await at(0.5)).toEqual({ minor: false, major: 25 })
  // At 1 %, the major lines space out by 5 until they are 8 pixels apart.
  const far = await at(0.01)
  expect(far.minor).toBe(false)
  expect(far.major).toBeGreaterThanOrEqual(8)
})

test('the grid keeps the zoom within its budget of 100 ms', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.setConfig({ showGrid: true }))
  const worst = await page.evaluate(async () => {
    const editor = window.svgEditor
    let max = 0
    for (const zoom of [2, 0.5, 8, 0.1, 32, 1]) {
      const start = performance.now()
      editor.zoomAt(zoom)
      document.getElementById('se-grid').getBoundingClientRect()
      max = Math.max(max, performance.now() - start)
    }
    return max
  })
  expect(worst).toBeLessThan(100)
})

test('the preferences show the grid apart from the snapping, with its subdivisions and colour', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.mainMenu.showPreferences())
  const prefs = page.locator('#se-edit-prefs')
  await prefs.locator('#show_grid').check()
  await prefs.locator('#grid_snapping_on').uncheck()
  await prefs.locator('#grid_subdivisions').fill('4')
  await prefs.locator('#grid_color').fill('#00a0ff')
  await prefs.locator('#object_snapping').uncheck()
  await prefs.locator('#tool_prefs_save').click()
  const config = await page.evaluate(() => {
    const { showGrid, gridSnapping, gridSubdivisions, gridColor, objectSnapping } = window.svgEditor.configObj.curConfig
    return { showGrid, gridSnapping, gridSubdivisions, gridColor, objectSnapping, canvas: window.svgEditor.svgCanvas.getCurConfig().objectSnapping }
  })
  expect(config).toEqual({ showGrid: true, gridSnapping: false, gridSubdivisions: 4, gridColor: '#00a0ff', objectSnapping: false, canvas: false })
  expect(await page.evaluate(() => document.getElementById('se-grid').getAttribute('display'))).toBe('inline')
  expect(await page.locator('#view_grid').evaluate((button) => button.pressed)).toBe(true)
})

test('Alt over an object shows the distances from the selection, stroke excluded', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('a')], true))
  const over = await center(page, 'b')
  await page.mouse.move(over.x, over.y)
  await page.keyboard.down('Alt')
  await expect.poll(() => guidesShown(page)).toBe(true)
  const labels = await page.evaluate(() => [...document.querySelectorAll('#selectorGuides text')]
    .filter((text) => text.parentNode.getAttribute('display') !== 'none').map((text) => text.textContent).sort())
  // From a (100…180, 100…160) to b (300…340): 120 across, 140 down.
  expect(labels).toEqual(['120', '140'])
  await page.keyboard.up('Alt')
  await expect.poll(() => guidesShown(page)).toBe(false)
})

test('Alt and a letter align and distribute the selection (D6)', async ({ page }) => {
  await page.evaluate(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>
      <rect id="p" x="10" y="10" width="20" height="20"/>
      <rect id="q" x="100" y="50" width="40" height="20"/>
      <rect id="r" x="300" y="200" width="10" height="60"/></g></svg>`
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.updateCanvas(true)
    window.svgEditor.svgCanvas.selectOnly(['p', 'q', 'r'].map((id) => document.getElementById(id)), true)
  })
  await page.locator('body').focus()
  const xs = () => page.evaluate(() => ['p', 'q', 'r'].map((id) => Number(document.getElementById(id).getAttribute('x'))))
  await page.keyboard.press('Alt+a')
  expect(await xs()).toEqual([10, 10, 10])
  await page.keyboard.press('Alt+r')
  // Right edges on the rightmost one: q, 10 + 40.
  expect(await xs()).toEqual([30, 10, 40])
  // A single object goes to the page.
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('q')], true))
  await page.locator('body').focus()
  await page.keyboard.press('Alt+h')
  expect(await xs()).toEqual([30, 300, 40])
  await page.keyboard.press('Alt+w')
  expect(await page.evaluate(() => document.getElementById('q').getAttribute('y'))).toBe('0')
  // Distribution: three objects, evenly.
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly(['p', 'q', 'r'].map((id) => document.getElementById(id)), true))
  await page.locator('body').focus()
  await page.keyboard.press('Alt+Shift+h')
  const after = await xs()
  // p (30…50) and q (300…340) are the ends; r (10 wide) goes between them,
  // at the same spacing on both sides.
  const order = [[after[0], 20], [after[2], 10], [after[1], 40]].sort((u, v) => u[0] - v[0])
  const gaps = [order[1][0] - (order[0][0] + order[0][1]), order[2][0] - (order[1][0] + order[1][1])]
  expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(0.01)
  // The hints of the buttons say so.
  const hint = await page.evaluate(() => window.svgEditor.commands.hint('align_right'))
  expect(hint).toMatch(/R$/)
})

test('a rectangle being drawn snaps its corners to the objects', async ({ page }) => {
  await page.evaluate(() => window.svgEditor.svgCanvas.setMode('rect'))
  const a = await box(page, 'a')
  const b = await box(page, 'b')
  // a's top left corner (stroke excluded: 3 pixels in) and b's, a little off.
  await page.mouse.move(a.x + 3 + 4, a.y + 3 - 2)
  await page.mouse.down()
  await page.mouse.move(b.x - 3, b.y + 2, { steps: 5 })
  expect(await guidesShown(page)).toBe(true)
  await page.mouse.up()
  const drawn = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('#svgcontent rect')].filter((r) => !['a', 'b'].includes(r.id))
    return rects.map((r) => ['x', 'y', 'width', 'height'].map((n) => r.getAttribute(n)))
  })
  expect(drawn).toEqual([['100', '100', '200', '200']])
})
