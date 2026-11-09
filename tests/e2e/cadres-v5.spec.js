import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot V5 (plan v2, 4.3, D7): frames to export, one SVG per supervision
// screen; the origin of the viewBox of an opened file.

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="100" height="80" fill="#4CC38A"/>
    <rect id="r2" x="2500" y="100" width="100" height="80" fill="#160F23"/>
  </g>
</svg>`

async function loadDrawing (page, svg = DRAWING) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

const frames = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getFrames()
  .map(({ name, x, y, width, height }) => ({ name, x, y, width, height })))
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const selectedFrame = (page) => page.evaluate(() => window.svgEditor.frames.selected?.getAttribute('name') ?? null)
/** Screen point of a drawing point. */
const screenOf = (page, x, y) => page.evaluate(({ x, y }) => {
  const canvas = window.svgEditor.svgCanvas
  const box = document.getElementById('svgroot').getBoundingClientRect()
  const offset = canvas.getOffset()
  const zoom = canvas.getZoom()
  return { x: box.x + offset.x + x * zoom, y: box.y + offset.y + y * zoom }
}, { x, y })

async function drawFrame (page, from, to) {
  await page.locator('#tool_frame').click()
  const a = await screenOf(page, ...from)
  const b = await screenOf(page, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 })
  await page.mouse.move(b.x, b.y, { steps: 3 })
  await page.mouse.up()
}

test.describe('Export frames (V5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the frame tool draws a frame, in one undo step, then selects it', async ({ page }) => {
    await expect(page.locator('#tool_frame')).toBeVisible()
    await drawFrame(page, [50, 40], [450, 340])
    expect(await frames(page)).toEqual([{ name: 'Frame 1', x: 50, y: 40, width: 400, height: 300 }])
    expect(await steps(page)).toBe(1)
    expect(await selectedFrame(page)).toBe('Frame 1')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    // Drawn in the interaction layer, never in the drawing.
    await expect(page.locator('#se-frames .se-frame-label')).toHaveText('Frame 1')
    await expect(page.locator('#se-frames .se-frame-handle')).toHaveCount(8)
    expect(await page.locator('#svgcontent rect').count()).toBe(2)
    // The inspector shows the frame.
    await expect(page.locator('#se-frame-name')).toHaveValue('Frame 1')
    await expect(page.locator('#se-frame-width')).toHaveValue('400')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await frames(page)).toEqual([])
  })

  test('a click with the tool gives a 1920 × 1080 frame', async ({ page }) => {
    await page.locator('#tool_frame').click()
    const a = await screenOf(page, 20, 30)
    await page.mouse.click(a.x, a.y)
    expect(await frames(page)).toEqual([{ name: 'Frame 1', x: 20, y: 30, width: 1920, height: 1080 }])
  })

  test('the name moves the frame, a handle resizes it, each in one step', async ({ page }) => {
    await drawFrame(page, [50, 40], [450, 340])
    const label = await page.locator('#se-frames .se-frame-hit').boundingBox()
    await page.mouse.move(label.x + 6, label.y + 6)
    await page.mouse.down()
    await page.mouse.move(label.x + 56, label.y + 26, { steps: 4 })
    await page.mouse.move(label.x + 106, label.y + 46, { steps: 4 })
    await page.mouse.up()
    expect(await frames(page)).toEqual([{ name: 'Frame 1', x: 150, y: 80, width: 400, height: 300 }])
    expect(await steps(page)).toBe(2)
    // The press on the name did not select or move an object.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).length)).toBe(0)

    const handle = await page.locator('#se-frames .se-frame-handle[data-dir="se"]').boundingBox()
    await page.mouse.move(handle.x + 4, handle.y + 4)
    await page.mouse.down()
    await page.mouse.move(handle.x + 54, handle.y + 24, { steps: 4 })
    await page.mouse.up()
    expect(await frames(page)).toEqual([{ name: 'Frame 1', x: 150, y: 80, width: 450, height: 320 }])
    expect(await steps(page)).toBe(3)
    await page.keyboard.press('ControlOrMeta+z')
    expect((await frames(page))[0]).toMatchObject({ width: 400, height: 300 })
  })

  test('the inspector names the frame, gives its format, position and size', async ({ page }) => {
    await drawFrame(page, [50, 40], [450, 340])
    await page.locator('#se-frame-name').fill('Chaufferie')
    await page.locator('#se-frame-name').press('Enter')
    await page.locator('#se-frame-format').selectOption('hd')
    await page.locator('#se-frame-x').fill('0')
    await page.locator('#se-frame-x').press('Enter')
    await page.locator('#se-frame-y').fill('0')
    await page.locator('#se-frame-y').press('Enter')
    expect(await frames(page)).toEqual([{ name: 'Chaufferie', x: 0, y: 0, width: 1920, height: 1080 }])
    await expect(page.locator('#se-frames .se-frame-label')).toHaveText('Chaufferie')
    // An invalid size is given back.
    await page.locator('#se-frame-width').fill('-5')
    await page.locator('#se-frame-width').press('Enter')
    await expect(page.locator('#se-frame-width')).toHaveValue('1920')
    // The list of the frames, without selection.
    await page.keyboard.press('Escape')
    await page.locator('#svgroot').click({ position: { x: 5, y: 5 } })
    expect(await selectedFrame(page)).toBeNull()
    await expect(page.locator('.se-frame-row')).toHaveCount(1)
    await expect(page.locator('.se-frame-row')).toContainText('Chaufferie')
    await page.locator('.se-frame-row').click()
    expect(await selectedFrame(page)).toBe('Chaufferie')
  })

  test('Delete removes the selected frame, the arrows move it, Escape lets it go', async ({ page }) => {
    await drawFrame(page, [50, 40], [450, 340])
    await page.locator('#svgroot').hover({ position: { x: 5, y: 5 } })
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    expect((await frames(page))[0]).toMatchObject({ x: 53, y: 50 })
    // The nudges in a row are one step.
    expect(await steps(page)).toBe(2)
    await page.keyboard.press('Escape')
    expect(await selectedFrame(page)).toBeNull()
    await page.locator('#se-frames .se-frame-hit').click()
    await page.keyboard.press('Delete')
    expect(await frames(page)).toEqual([])
    // The object under the frame was not deleted.
    expect(await page.locator('#r1').count()).toBe(1)
    await page.keyboard.press('ControlOrMeta+z')
    expect(await frames(page)).toHaveLength(1)
  })

  test('the save keeps the frames; an opened file keeps them', async ({ page }) => {
    await drawFrame(page, [0, 0], [500, 300])
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toMatch(/<metadata>\s*<se:frame name="Frame 1" x="0" y="0" width="500" height="300"\s*\/>\s*<\/metadata>/)
    await loadDrawing(page, saved)
    expect(await frames(page)).toEqual([{ name: 'Frame 1', x: 0, y: 0, width: 500, height: 300 }])
    await expect(page.locator('#se-frames .se-frame')).toHaveCount(1)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(saved)
  })

  test('Export ▾ gives one SVG per frame: its viewBox, without what lies outside', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.addFrame({ name: 'Frame 1', x: 0, y: 0, width: 1000, height: 600 })
      window.svgEditor.svgCanvas.addFrame({ name: 'Écran 2', x: 2400, y: 0, width: 1000, height: 600 })
    })
    // The host takes the files.
    await page.evaluate(() => {
      window.__exported = []
      window.svgEditor.$container.addEventListener('se-export-svg', (e) => {
        e.preventDefault()
        window.__exported.push(...e.detail.files)
      })
    })
    await page.locator('#se-export').click()
    const items = page.locator('#se-export-menu [data-export]')
    await expect(items).toHaveText(['“Frame 1” as SVG', '“Écran 2” as SVG', 'All frames as SVG (2)'])
    await items.nth(2).click()
    const files = await page.evaluate(() => window.__exported.map(({ name, svg }) => {
      const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
      return {
        name,
        viewBox: root.getAttribute('viewBox'),
        ids: [...root.querySelectorAll('rect')].map((el) => el.id),
        frames: svg.includes('se:frame')
      }
    }))
    expect(files).toEqual([
      { name: 'Frame 1.svg', viewBox: '0 0 1000 600', ids: ['r1'], frames: false },
      { name: 'Écran 2.svg', viewBox: '2400 0 1000 600', ids: ['r2'], frames: false }
    ])
    // The document keeps both its objects and its frames.
    expect(await page.locator('#svgcontent rect').count()).toBe(2)
    expect(await frames(page)).toHaveLength(2)
  })

  test('without frames, Export ▾ gives the content and a margin', async ({ page }) => {
    await page.evaluate(() => {
      window.__exported = []
      window.svgEditor.$container.addEventListener('se-export-svg', (e) => {
        e.preventDefault()
        window.__exported.push(...e.detail.files)
      })
    })
    await page.locator('#se-export').click()
    await page.locator('#se-export-menu [data-export]').click()
    const viewBox = await page.evaluate(() => new DOMParser()
      .parseFromString(window.__exported[0].svg, 'image/svg+xml').documentElement.getAttribute('viewBox'))
    expect(viewBox).toBe('80 80 2540 120')
  })

  test('an object dragged near a frame snaps to its edge', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.setConfig({ objectSnapping: true })
      window.svgEditor.svgCanvas.addFrame({ name: 'Écran', x: 300, y: 300, width: 200, height: 100 })
    })
    const from = await screenOf(page, 150, 140)
    const to = await screenOf(page, 150 + 197, 140)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y, { steps: 3 })
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await page.mouse.up()
    // r1 (100 wide, at 100) moved by 197: its left edge, 297, snaps to the frame at 300.
    expect(await page.locator('#r1').getAttribute('x')).toBe('300')
  })

  test('a file whose viewBox starts away from 0, 0 is saved as it was', async ({ page }) => {
    const file = `<svg xmlns="${NS}" viewBox="100 50 800 600"><g class="layer"><title>Layer 1</title>` +
      '<rect id="o1" x="150" y="80" width="40" height="30" fill="#160F23"/></g></svg>'
    await loadDrawing(page, file)
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toContain('viewBox="100 50 800 600"')
    expect(saved).toContain('x="150" y="80"')
    // The page is drawn where the file starts.
    const page0 = await page.evaluate(() => {
      // The rect of the page: under Firefox, the box of its <svg>, which lets
      // its content overflow, takes in the grid.
      const bg = document.querySelector('#canvasBackground > rect').getBoundingClientRect()
      const rect = document.getElementById('o1').getBoundingClientRect()
      return { dx: Math.round(rect.x - bg.x), dy: Math.round(rect.y - bg.y) }
    })
    expect(page0).toEqual({ dx: 50, dy: 30 })
  })

  test('the frame sections pass axe (AA) in both themes', async ({ page }) => {
    await drawFrame(page, [50, 40], [450, 340])
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => window.svgEditor.setConfig({ theme }), theme)
      for (const state of ['frame', 'list']) {
        if (state === 'list') {
          await page.keyboard.press('Escape')
          await expect(page.locator('.se-frame-row')).toHaveCount(1)
        } else {
          await page.locator('#se-frames .se-frame-hit').click()
          await expect(page.locator('#se-frame-name')).toBeVisible()
        }
        const results = await new AxeBuilder({ page })
          .include('#se-tabpanel-properties')
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze()
        expect(results.violations.map((v) => `${theme}/${state}: ${v.id}`)).toEqual([])
      }
    }
  })
})
