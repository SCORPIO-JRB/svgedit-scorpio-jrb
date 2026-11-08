import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// U1 Q1 and Q2: keyboard shortcuts and zoom gestures.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6"/>
    <rect id="r2" x="300" y="200" width="80" height="60" fill="#36a"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
  }, DRAWING)
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragBy (page, selector, dx, dy) {
  const start = await center(page, selector)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 6 })
  await page.mouse.up()
}

const position = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id)
  return { x: el.getAttribute('x'), y: el.getAttribute('y') }
}, id)

const zoom = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getZoom())

test.describe('Keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Ctrl+Shift+Z redoes instead of undoing again', async ({ page }) => {
    await dragBy(page, '#r1', 40, 0)
    await page.keyboard.press('Control+z')
    expect(await position(page, 'r1')).toEqual({ x: '100', y: '100' })
    await page.keyboard.press('Control+Shift+z')
    expect(await position(page, 'r1')).toEqual({ x: '140', y: '100' })
  })

  test('Shift+D does not clone the selection', async ({ page }) => {
    await page.mouse.click(...Object.values(await center(page, '#r1')))
    await page.keyboard.press('Shift+d')
    expect(await page.locator('#svgcontent rect').count()).toBe(2)
  })

  test('Ctrl+Shift+arrows rotate the selection by 15 degrees', async ({ page }) => {
    await page.mouse.click(...Object.values(await center(page, '#r1')))
    await page.keyboard.press('Control+Shift+ArrowRight')
    const angle = await page.evaluate(() =>
      window.svgEditor.svgCanvas.getRotationAngle(document.getElementById('r1')))
    expect(Math.round(angle)).toBe(15)
  })

  test('Z, V and H select the zoom, selection and hand tools', async ({ page }) => {
    await page.keyboard.press('z')
    await expect(page.locator('#tool_zoom')).toHaveAttribute('pressed', /./)
    await page.keyboard.press('v')
    await expect(page.locator('#tool_select')).toHaveAttribute('pressed', /./)
    await page.keyboard.press('h')
    await expect(page.locator('#ext-panning')).toHaveAttribute('pressed', /./)
  })
})

test.describe('Zoom gestures', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Ctrl+wheel zooms in around the cursor', async ({ page }) => {
    const anchor = await center(page, '#r2')
    await page.mouse.move(anchor.x, anchor.y)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -300)
    await page.keyboard.up('Control')
    await expect.poll(() => zoom(page)).toBeGreaterThan(1.2)
    // The point that was under the cursor is still under it.
    const after = await center(page, '#r2')
    expect(Math.abs(after.x - anchor.x)).toBeLessThan(3)
    expect(Math.abs(after.y - anchor.y)).toBeLessThan(3)
  })

  test('Shift+wheel no longer zooms', async ({ page }) => {
    const anchor = await center(page, '#r2')
    await page.mouse.move(anchor.x, anchor.y)
    await page.keyboard.down('Shift')
    await page.mouse.wheel(0, -300)
    await page.keyboard.up('Shift')
    await page.waitForTimeout(200)
    expect(await zoom(page)).toBe(1)
  })

  test('zoom keys step the zoom and Shift+0 returns to 100 %', async ({ page }) => {
    await page.keyboard.press('Control+=')
    expect(await zoom(page)).toBe(2)
    await page.keyboard.press('Control+-')
    await page.keyboard.press('Control+-')
    expect(await zoom(page)).toBe(0.5)
    await page.keyboard.press('Shift+0')
    expect(await zoom(page)).toBe(1)
  })

  test('zoom stays within 1 % and 6 400 %', async ({ page }) => {
    // 6 400 % since V2 (it was 1 000 %).
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Control+ArrowUp')
    }
    expect(await zoom(page)).toBe(64)
  })
})

test.describe('macOS', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  test('Cmd+Z undoes and Cmd+Shift+Z redoes', async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
    await dragBy(page, '#r1', 40, 0)
    await page.keyboard.press('Meta+z')
    expect(await position(page, 'r1')).toEqual({ x: '100', y: '100' })
    await page.keyboard.press('Meta+Shift+z')
    expect(await position(page, 'r1')).toEqual({ x: '140', y: '100' })
  })
})
