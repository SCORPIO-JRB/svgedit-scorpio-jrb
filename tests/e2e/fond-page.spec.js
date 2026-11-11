import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, chooseTool, screenPoint } from './helpers.js'

// Lot Fond, after the Page section of Figma: the Document section gives the
// page a background, in the file; without a selection, Fill and Stroke only
// show with a drawing tool, where they give the paint of the next shape.

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="120" width="200" height="100" fill="#ff0000"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

const sections = (page) => page.evaluate(() => [...document.querySelectorAll('#tools_top > .se-section')]
  .filter((section) => !section.hidden).map((section) => section.dataset.section))
const background = (page) => page.evaluate(() => {
  const rect = window.svgEditor.svgCanvas.getPageBackground()
  return rect && ['x', 'y', 'width', 'height', 'fill', 'fill-opacity'].map((name) => rect.getAttribute(name))
})
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
const layers = (page) => page.evaluate(() => [...document.querySelectorAll('#svgcontent > g')].map((g) => g.querySelector('title').textContent))
const hexField = (page) => page.locator('#se-doc-background').locator('input').first()

test.describe('The background of the page, as in Figma (lot Fond)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('without a selection, the panel is that of the page: no Fill or Stroke but with a drawing tool', async ({ page }) => {
    expect(await sections(page)).not.toContain('fill')
    expect(await sections(page)).not.toContain('stroke')
    expect(await sections(page)).toContain('document')
    await expect(page.locator('#se-doc-background')).toBeVisible()
    // The rectangle tool: the paint of the next shape.
    await chooseTool(page, 'tool_rect')
    await expect.poll(() => sections(page)).toContain('fill')
    expect(await sections(page)).toContain('stroke')
    await chooseTool(page, 'tool_select')
    await expect.poll(() => sections(page)).not.toContain('fill')
    // A selection shows them.
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r1')], true))
    await expect.poll(() => sections(page)).toContain('fill')
  })

  test('+ gives the page a background, in a locked layer under the others; its colour is typed; − removes it', async ({ page }) => {
    const toggle = page.locator('#se-doc-background-toggle')
    await expect(toggle).toHaveAttribute('aria-label', 'Add a background')
    await toggle.click()
    expect(await background(page)).toEqual(['0', '0', '640', '480', '#ffffff', null])
    expect(await layers(page)).toEqual(['Background', 'Layer 1'])
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayerName())).toBe('Layer 1')
    await expect(toggle).toHaveAttribute('aria-label', 'Remove the background')
    expect(await steps(page)).toBe(1)

    await hexField(page).fill('160F23')
    await hexField(page).press('Enter')
    expect((await background(page))[4]).toBe('#160f23')
    expect(await steps(page)).toBe(2)
    await expect(hexField(page)).toHaveValue('160F23')
    // The file has it.
    const svg = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(svg).toMatch(/<g class="layer" se:locked="true">\s*<title>Background<\/title>\s*<rect id="[^"]+" data-se-background="true" x="0" y="0" width="640" height="480" fill="#160f23"\/>/)

    await toggle.click()
    expect(await background(page)).toBeNull()
    expect(await layers(page)).toEqual(['Layer 1'])
    await undo(page)
    expect((await background(page))[4]).toBe('#160f23')
  })

  test('a click on the page selects nothing; the size of the page and Fit to content keep it the size of the page', async ({ page }) => {
    await page.locator('#se-doc-background-toggle').click()
    const empty = await screenPoint(page, 500, 400)
    await page.mouse.click(empty.x, empty.y)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).length)).toBe(0)

    await page.locator('#se-doc-width').fill('800')
    await page.locator('#se-doc-width').press('Enter')
    expect((await background(page)).slice(0, 4)).toEqual(['0', '0', '800', '480'])
    await undo(page)
    expect((await background(page)).slice(0, 4)).toEqual(['0', '0', '640', '480'])

    await page.locator('#se-doc-fit').click()
    expect((await background(page)).slice(0, 4)).toEqual(['0', '0', '200', '100'])
    expect(await page.evaluate(() => ['x', 'y'].map((name) => document.getElementById('r1').getAttribute(name)))).toEqual(['0', '0'])
  })

  test('the colour window is named Background, takes solid colours, and a drag is one step', async ({ page }) => {
    await page.locator('#se-doc-background-toggle').click()
    const before = await steps(page)
    await page.locator('#se-doc-background').evaluate((el) => el.openPicker())
    await expect(page.locator('#se-paint-title')).toHaveText('Background')
    await expect(page.locator('#se-paint .se-paint-segments')).toBeHidden()
    const area = await page.locator('#se-paint-area').boundingBox()
    await page.mouse.move(area.x + area.width * 0.7, area.y + area.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(area.x + area.width * 0.8, area.y + area.height * 0.2, { steps: 4 })
    // Shown while it moves, outside the history.
    expect((await background(page))[4]).not.toBe('#ffffff')
    expect(await steps(page)).toBe(before)
    await page.mouse.up()
    expect(await steps(page)).toBe(before + 1)
    await page.keyboard.press('Escape')
    // The fill window still offers gradients.
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r1')], true))
    await page.locator('.se-inspector #fill_color').evaluate((el) => el.openPicker())
    await expect(page.locator('#se-paint .se-paint-segments')).toBeVisible()
  })

  test('the template Synoptic shows its background in the field', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.templates.apply('synoptic'))
    await expect(hexField(page)).toHaveValue('160F23')
    await expect(page.locator('#se-doc-background-toggle')).toHaveAttribute('aria-label', 'Remove the background')
  })
})
