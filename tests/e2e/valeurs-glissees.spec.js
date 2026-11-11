import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot Valeurs glissées, after the fields of Figma: the icon or the letter of
// a numeric field of the panel, dragged sideways, changes its value, 1 a
// pixel, 10 with Shift. The drawing follows; the drag is one undo step;
// Escape gives the value back; a click goes to the field.

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="120" height="80" fill="#cccccc" stroke="#000000" opacity="0.5"/>
    <rect id="r2" x="300" y="100" width="60" height="40" fill="#cccccc" stroke="#000000" opacity="0.8"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

const select = (page, ...ids) => page.evaluate((ids) =>
  window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ids)
const attr = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id)?.getAttribute(name) ?? null, { id, name })
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((elem) => elem.id))

/** The icon or the letter of a field, or the label before a plain input. */
const handleOf = (page, id) => page.evaluate((id) => {
  const field = document.getElementById(id)
  const handle = field.shadowRoot
    ? [...field.shadowRoot.querySelectorAll('.se-scrub-handle')].find((el) => el.getClientRects().length)
    : field.previousElementSibling
  const box = handle.getBoundingClientRect()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, cursor: getComputedStyle(handle).cursor }
}, id)

/** Drags the handle of a field by dx pixels, one pixel at a time. */
async function scrub (page, id, dx, { shift = false, escape = false } = {}) {
  const { x, y } = await handleOf(page, id)
  await page.mouse.move(x, y)
  await page.mouse.down()
  if (shift) await page.keyboard.down('Shift')
  for (let i = 1; i <= Math.abs(dx); i++) await page.mouse.move(x + Math.sign(dx) * i, y)
  if (shift) await page.keyboard.up('Shift')
  // The last move is applied at the next frame.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
}

test.describe('Values dragged on the icon of their field (lot Valeurs glissées)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
    await select(page, 'r1')
  })

  test('the letter shows ↔ and the name of the field, without a native title', async ({ page }) => {
    const { x, y, cursor } = await handleOf(page, 'rect_width')
    expect(cursor).toBe('ew-resize')
    await page.mouse.move(x, y)
    const tooltip = page.locator('se-tooltip')
    await expect(tooltip).toHaveAttribute('open', '')
    await expect(tooltip).toContainText('Change rectangle width')
    expect(await page.evaluate(() => {
      const field = document.getElementById('rect_width')
      return [field.hasAttribute('title'), field.shadowRoot.querySelectorAll('[title]').length]
    })).toEqual([false, 0])
  })

  test('dragging changes the value as the pointer goes, in one undo step', async ({ page }) => {
    const before = await steps(page)
    await scrub(page, 'rect_width', 30)
    expect(await attr(page, 'r1', 'width')).toBe('150')
    await expect(page.locator('#rect_width')).toHaveJSProperty('value', '150')
    expect(await steps(page)).toBe(before + 1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page, 'r1', 'width')).toBe('120')
  })

  test('Shift goes 10 times as fast; the bounds of the field hold', async ({ page }) => {
    await scrub(page, 'rect_height', -5, { shift: true })
    expect(await attr(page, 'r1', 'height')).toBe('30')
    await scrub(page, 'opacity', 80)
    expect(await attr(page, 'r1', 'opacity')).toBe('1')
  })

  test('Escape gives the value back, the object still selected, no step added', async ({ page }) => {
    const before = await steps(page)
    await scrub(page, 'rect_width', 25, { escape: true })
    expect(await attr(page, 'r1', 'width')).toBe('120')
    expect(await steps(page)).toBe(before)
    expect(await selected(page)).toEqual(['r1'])
    await expect(page.locator('#rect_width')).toHaveJSProperty('value', '120')
  })

  test('a click on the letter goes to the field, to type a value', async ({ page }) => {
    const { x, y } = await handleOf(page, 'rect_width')
    await page.mouse.click(x, y)
    expect(await page.evaluate(() => document.getElementById('rect_width').$input.shadowRoot.activeElement?.id)).toBe('input')
  })

  test('a field showing "Mixed" changes each value by the same amount', async ({ page }) => {
    await select(page, 'r1', 'r2')
    await expect(page.locator('#opacity')).toHaveJSProperty('mixed', true)
    await scrub(page, 'opacity', 10)
    expect([await attr(page, 'r1', 'opacity'), await attr(page, 'r2', 'opacity')]).toEqual(['0.6', '0.9'])
    await expect(page.locator('#opacity')).toHaveJSProperty('mixed', true)
  })

  test('the letters of plain fields drag too: the width of the page', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    const before = await steps(page)
    await scrub(page, 'se-doc-width', 20)
    await expect(page.locator('#se-doc-width')).toHaveValue('660')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getResolution().w)).toBe(660)
    expect(await steps(page)).toBe(before + 1)
    // The click that ends the drag leaves the field alone.
    expect(await page.evaluate(() => document.activeElement?.id)).not.toBe('se-doc-width')
  })
})
