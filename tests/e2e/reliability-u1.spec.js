import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// U1 Q9 and Q10: reliability fixes and commands applied to the whole selection.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a"/>
    <rect id="r3" x="150" y="130" width="80" height="60" fill="#a63"/>
    <rect id="r4" x="420" y="300" width="80" height="60" fill="#999"/>
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

async function select (page, ids) {
  await page.evaluate((ids) => {
    const canvas = window.svgEditor.svgCanvas
    canvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
}

const stackOrder = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#svgcontent g.layer > rect')].map((el) => el.id))

test.describe('Commands on the whole selection', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Ctrl+D duplicates every selected element', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await page.keyboard.press('Control+d')
    expect(await page.locator('#svgcontent rect').count()).toBe(6)
  })

  test('Ctrl+G groups and Ctrl+Shift+G ungroups', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await page.keyboard.press('Control+g')
    expect(await page.locator('#svgcontent g.layer > g').count()).toBe(1)
    await page.keyboard.press('Control+Shift+g')
    expect(await page.locator('#svgcontent g.layer > g').count()).toBe(0)
    expect(await page.locator('#svgcontent rect').count()).toBe(4)
  })

  test('bring to front moves the whole selection and keeps its order', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await page.keyboard.press('Control+Shift+BracketRight')
    expect(await stackOrder(page)).toEqual(['r3', 'r4', 'r1', 'r2'])
    await page.keyboard.press('Control+z')
    expect(await stackOrder(page)).toEqual(['r1', 'r2', 'r3', 'r4'])
  })

  test('send to back works with the layout-independent shortcut', async ({ page }) => {
    await select(page, ['r3', 'r4'])
    await page.keyboard.press('Control+End')
    expect(await stackOrder(page)).toEqual(['r3', 'r4', 'r1', 'r2'])
  })

  test('one step down moves the selection past its next sibling', async ({ page }) => {
    await select(page, ['r2', 'r3'])
    await page.keyboard.press('Control+PageDown')
    expect(await stackOrder(page)).toEqual(['r2', 'r3', 'r1', 'r4'])
  })
})

test.describe('Reliability', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('dropping a file that is not an image closes the loading dialog and explains why', async ({ page }) => {
    await page.evaluate(() => {
      const data = new DataTransfer()
      data.items.add(new File(['hello'], 'notes.txt', { type: 'text/plain' }))
      document.getElementById('workarea').dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: data
      }))
    })
    await expect(page.locator('se-prompt-dialog')).toHaveAttribute('close', 'true')
    await expect(page.locator('body')).toContainText('notes.txt')
  })

  test('a dropped bitmap is one undoable step', async ({ page }) => {
    const before = await page.locator('#svgcontent image').count()
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 20
      canvas.height = 10
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      const data = new DataTransfer()
      data.items.add(new File([blob], 'tile.png', { type: 'image/png' }))
      document.getElementById('workarea').dispatchEvent(new DragEvent('drop', {
        bubbles: true, cancelable: true, dataTransfer: data
      }))
    })
    await expect(page.locator('#svgcontent image')).toHaveCount(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await expect(page.locator('#svgcontent image')).toHaveCount(before)
  })
})
