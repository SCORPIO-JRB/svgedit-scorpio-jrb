import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Feedback on the text panel and the eye of Appearance, after Figma:
// - the grips of a text follow its Resizing: the sides give the width, the
//   top and the bottom the height, the corners both; the font stays;
// - hiding the selection keeps it selected, and the same eye (or
//   Ctrl+Shift+H) shows it again.

const NS = 'http://www.w3.org/2000/svg'
const SE = 'http://svg-edit.googlecode.com'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <text id="t1" x="100" y="200" font-size="20" font-family="sans-serif">Vanne trois voies circuit</text>
    <rect id="r1" x="400" y="100" width="100" height="80" fill="#ff0000"/>
    <g id="g1"><rect id="r2" x="400" y="300" width="60" height="60" fill="#0000ff"/></g>
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

const select = (page, ...ids) => page.evaluate((ids) =>
  window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ids)
const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))
const attr = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id)?.getAttribute(name) ?? null, { id, name })
const seNum = (page, id, name) => page.evaluate(({ id, name, SE }) => Number(document.getElementById(id).getAttributeNS(SE, name) || 0), { id, name, SE })
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
const resizing = (page) => page.evaluate(() => document.querySelector('#se-text-resizing [aria-checked="true"]')?.dataset.value ?? null)
const frame = (page) => page.evaluate(() => {
  const b = window.svgEditor.svgCanvas.getSelectionBox([document.getElementById('t1')])
  return { top: Math.round(b.y), bottom: Math.round(b.y + b.height), left: Math.round(b.x), right: Math.round(b.x + b.width) }
})
const center = (page, selector) => page.locator(selector).evaluate((el) => {
  const b = el.getBoundingClientRect()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
})

async function dragGrip (page, dir, dx, dy, { modifiers = [], escape = false } = {}) {
  const from = await center(page, `#selectorGrip_resize_${dir}`)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
}

test.describe('Grips of a text and the eye of Appearance, as in Figma', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the bottom grip gives a text a fixed height, the top one too; the font stays', async ({ page }) => {
    await select(page, 't1')
    await expect.poll(() => resizing(page)).toBe('auto-width')
    const start = await frame(page)
    await dragGrip(page, 's', 0, 60)
    await expect.poll(() => resizing(page)).toBe('fixed')
    expect(await attr(page, 't1', 'font-size')).toBe('20')
    expect(await attr(page, 't1', 'transform')).toBeNull()
    // The box of a text as wide as its lines keeps that width.
    expect(await seNum(page, 't1', 'width')).toBeCloseTo(start.right - start.left, -1)
    const afterBottom = await frame(page)
    expect(afterBottom.top).toBe(start.top)
    expect(afterBottom.bottom - start.bottom).toBeGreaterThan(55)
    expect(await steps(page)).toBe(1)

    // The top grip: the top follows the pointer, the bottom stays.
    await dragGrip(page, 'n', 0, -40)
    const afterTop = await frame(page)
    expect(afterTop.bottom).toBe(afterBottom.bottom)
    expect(afterBottom.top - afterTop.top).toBeGreaterThan(35)
    expect(Number(await attr(page, 't1', 'y'))).toBeLessThan(165)
    expect(await steps(page)).toBe(2)

    await undo(page)
    await undo(page)
    expect(await attr(page, 't1', 'y')).toBe('200')
    expect(await page.evaluate((SE) => document.getElementById('t1').hasAttributeNS(SE, 'height'), SE)).toBe(false)
    expect(await page.evaluate((SE) => document.getElementById('t1').hasAttributeNS(SE, 'width'), SE)).toBe(false)
  })

  test('a side grip gives the width, a corner the whole box; Shift keeps its proportions, Escape cancels', async ({ page }) => {
    await select(page, 't1')
    await dragGrip(page, 'e', -120, 0)
    await expect.poll(() => resizing(page)).toBe('auto-height')
    expect(await page.locator('#t1 tspan').count()).toBeGreaterThan(1)

    const before = await frame(page)
    await dragGrip(page, 'se', 40, 30)
    await expect.poll(() => resizing(page)).toBe('fixed')
    expect(await attr(page, 't1', 'font-size')).toBe('20')
    const corner = await frame(page)
    expect(corner.left).toBe(before.left)
    expect(corner.top).toBe(before.top)
    expect(corner.right - before.right).toBeGreaterThan(35)
    expect(corner.bottom - before.bottom).toBeGreaterThan(25)

    const width = await seNum(page, 't1', 'width')
    const height = await seNum(page, 't1', 'height')
    await dragGrip(page, 'se', 60, 0, { modifiers: ['Shift'] })
    const ratio = (await seNum(page, 't1', 'width')) / (await seNum(page, 't1', 'height'))
    expect(ratio).toBeCloseTo(width / height, 2)

    const count = await steps(page)
    const markup = await page.locator('#t1').evaluate((el) => el.outerHTML)
    await dragGrip(page, 's', 0, 80, { escape: true })
    expect(await page.locator('#t1').evaluate((el) => el.outerHTML)).toBe(markup)
    expect(await steps(page)).toBe(count)
  })

  test('the top grip takes the pointer, not the line of the rotation handle', async ({ page }) => {
    await select(page, 'r1')
    const point = await center(page, '#selectorGrip_resize_n')
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point)
    expect(hit).toBe('selectorGripHit_resize_n')
    await dragGrip(page, 'n', 0, -20)
    expect(await attr(page, 'r1', 'height')).toBe('100')
    expect(await attr(page, 'r1', 'y')).toBe('80')
  })

  test('the eye of Appearance hides the selection and shows it again; it stays selected', async ({ page }) => {
    await select(page, 'r1')
    const eye = page.locator('[data-section="appearance"] [data-command="hide_selection"]')
    await expect(eye).toHaveAttribute('aria-pressed', 'false')
    await eye.click()
    expect(await attr(page, 'r1', 'display')).toBe('none')
    expect(await selected(page)).toEqual(['r1'])
    await expect(eye).toHaveAttribute('aria-pressed', 'true')
    await expect(eye).toHaveAttribute('aria-label', 'Show')
    await expect(eye.locator('se-icon')).toHaveAttribute('src', /eye_off\.svg$/)
    await eye.click()
    expect(await attr(page, 'r1', 'display')).toBeNull()
    await expect(eye).toHaveAttribute('aria-label', 'Hide')

    // Ctrl+Shift+H does the same, one step each time.
    await page.keyboard.press('Control+Shift+H')
    expect(await attr(page, 'r1', 'display')).toBe('none')
    await page.keyboard.press('Control+Shift+H')
    expect(await attr(page, 'r1', 'display')).toBeNull()
    expect(await steps(page)).toBe(4)
    // Ctrl+Z hides it again and selects it, its eye showing « Show ».
    await page.keyboard.press('ControlOrMeta+z')
    expect(await attr(page, 'r1', 'display')).toBe('none')
    expect(await selected(page)).toEqual(['r1'])
    await expect(eye).toHaveAttribute('aria-label', 'Show')
  })

  test('the bar of a group says Show once it is hidden; the Layers tab hides without deselecting', async ({ page }) => {
    await select(page, 'g1')
    const entry = page.locator('#se-context-bar [data-entry="command:hide_selection"]')
    await expect(entry).toHaveText('Hide')
    await entry.click()
    expect(await attr(page, 'g1', 'display')).toBe('none')
    await expect(entry).toHaveText('Show')
    await entry.click()
    expect(await attr(page, 'g1', 'display')).toBeNull()

    // The eye of the tree: the object stays selected.
    await select(page, 'r1')
    await page.evaluate(() => window.svgEditor.svgCanvas.setElementsVisible([document.getElementById('r1')], false))
    expect(await selected(page)).toEqual(['r1'])
    expect(await page.evaluate(() => window.svgEditor.commands.isEnabled('show_all'))).toBe(true)
    await page.evaluate(() => window.svgEditor.commands.execute('show_all'))
    expect(await attr(page, 'r1', 'display')).toBeNull()
  })
})
