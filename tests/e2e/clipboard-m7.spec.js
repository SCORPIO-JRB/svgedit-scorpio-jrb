import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// M7: the system clipboard (copy writes SVG text, paste reads SVG from
// outside through the import filter), paste in place, copy and paste of
// properties, Mod+D that repeats the offset of a moved copy.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="50" y="50" width="80" height="60" fill="#c00" stroke="#000" stroke-width="3"/>
    <circle id="c1" cx="300" cy="200" r="30" fill="#00c" stroke="#0f0" stroke-width="7" stroke-dasharray="5,5"/>
    <text id="t1" x="100" y="300" font-family="serif" font-size="20" fill="#333">Hi</text>
  </g>
</svg>`

const EXTERNAL = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">' +
  '<style>.a{fill:#0a0}</style>' +
  '<rect class="a" x="10" y="10" width="30" height="20" onclick="alert(1)"/>' +
  '<script>alert(2)</script></svg>'

async function loadDrawing (page, svg = DRAWING) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

const centerOf = (page, id) => page.evaluate((id) => {
  const box = document.getElementById(id).getBoundingClientRect()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}, id)

async function clickOn (page, id) {
  const point = await centerOf(page, id)
  await page.mouse.click(point.x, point.y)
}

async function dragBy (page, id, dx, dy, modifier) {
  const point = await centerOf(page, id)
  await page.mouse.move(point.x, point.y)
  if (modifier) await page.keyboard.down(modifier)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 6 })
  await page.mouse.up()
  if (modifier) await page.keyboard.up(modifier)
}

const rects = (page) => page.evaluate(() => [...document.querySelectorAll('#svgcontent rect')]
  .map((rect) => [rect.id, Number(rect.getAttribute('x')), Number(rect.getAttribute('y'))]))
const selectedIds = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()
  .filter(Boolean).map((elem) => elem.id))
const systemText = (page) => page.evaluate(() => navigator.clipboard.readText())
const writeSystem = (page, text) => page.evaluate((text) => navigator.clipboard.writeText(text), text)
const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

test.describe('System clipboard (M7)', () => {
  let errors

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('Mod+C writes the selection as SVG text; Mod+V pastes the editor copy as before', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+c')
    const text = await systemText(page)
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(text).toContain('<rect id="r1" x="50" y="50" width="80" height="60" fill="#c00" stroke="#000" stroke-width="3"/>')
    // The view box frames the rectangle, stroke included.
    expect(text).toContain('viewBox="48.5 48.5 83 63"')
    await page.keyboard.press('Control+v')
    const pasted = (await rects(page)).find(([id]) => id !== 'r1')
    expect(pasted[0]).toBe('svg_1')
    expect(await page.evaluate(() => document.getElementById('svg_1').getAttribute('fill'))).toBe('#c00')
    expect(await selectedIds(page)).toEqual(['svg_1'])
  })

  test('Mod+Shift+V pastes in place', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+c')
    await page.keyboard.press('Control+Shift+v')
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 50, 50]])
  })

  test('Mod+X removes the selection and puts it on the system clipboard', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+x')
    expect(await rects(page)).toEqual([])
    expect(await systemText(page)).toContain('id="r1"')
    await page.keyboard.press('Control+Shift+v')
    expect(await rects(page)).toEqual([['svg_1', 50, 50]])
  })

  test('SVG from another application is pasted as editable objects, through the import filter', async ({ page }) => {
    await writeSystem(page, EXTERNAL)
    await clickOn(page, 'r1')
    const before = await undoSize(page)
    await page.keyboard.press('Control+Shift+v')
    const pasted = await page.evaluate(() => {
      const [elem] = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)
      return { id: elem.id, html: elem.outerHTML, scripts: document.querySelectorAll('#svgcontent script').length }
    })
    expect(pasted.id).toMatch(/^svg_\d+$/)
    // The class style became an attribute, the event handler and the
    // script are gone, the coordinates are kept.
    expect(pasted.html).toBe(`<rect class="a" x="10" y="10" width="30" height="20" fill="#0a0" id="${pasted.id}"></rect>`)
    expect(pasted.scripts).toBe(0)
    expect(await undoSize(page)).toBe(before + 1)
    await page.keyboard.press('Control+z')
    expect(await page.evaluate((id) => document.getElementById(id), pasted.id)).toBe(null)
  })

  test('Mod+V puts SVG from outside in the middle of the view', async ({ page }) => {
    await writeSystem(page, EXTERNAL)
    await page.keyboard.press('Control+v')
    const box = await page.evaluate(() => {
      const [elem] = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)
      return { x: Number(elem.getAttribute('x')), y: Number(elem.getAttribute('y')) }
    })
    const center = await page.evaluate(() => window.svgEditor.getViewCenter())
    expect(Math.abs(box.x + 15 - center.x)).toBeLessThan(1)
    expect(Math.abs(box.y + 10 - center.y)).toBeLessThan(1)
  })

  test('text that is not SVG leaves the editor copy to paste', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+c')
    await writeSystem(page, 'hello')
    await page.keyboard.press('Control+Shift+v')
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 50, 50]])
  })

  test('the context menu copies to the system clipboard, and the keyboard works right after it', async ({ page }) => {
    await page.locator('#c1').click({ button: 'right' })
    await page.locator('#cmenu_canvas a[href="#copy"]').click()
    expect(await systemText(page)).toContain('id="c1"')
    // Before, the clicked item kept the focus and shortcuts were ignored.
    await page.keyboard.press('Control+Shift+v')
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent circle').length)).toBe(2)
  })

  test('the context menu pastes SVG from outside in place', async ({ page }) => {
    await writeSystem(page, EXTERNAL)
    await page.locator('#svgroot').click({ position: { x: 900, y: 700 }, button: 'right' })
    const item = page.locator('#cmenu_canvas a[href="#paste_in_place"]')
    await expect(item.locator('..')).not.toHaveClass(/disabled/)
    await item.click()
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('#svgcontent rect[fill="#0a0"]').length)).toBe(1)
    expect(await page.evaluate(() => document.querySelector('#svgcontent rect[fill="#0a0"]').getAttribute('x'))).toBe('10')
  })

  test('copying in a field copies its text, not the objects', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+c')
    const before = await systemText(page)
    const field = page.locator('#elem_id')
    await field.click()
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Control+c')
    const text = await systemText(page)
    expect(text).not.toBe(before)
    expect(text).toBe('r1')
    await page.keyboard.press('Control+v')
    expect(await rects(page)).toHaveLength(1)
  })
})

test.describe('Mod+D repeats the offset (M7)', () => {
  let errors

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('duplicate, move the copy, then Mod+D makes a regular series', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+d')
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 70, 70]])
    await dragBy(page, 'svg_1', 40, -20)
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 110, 50]])
    await page.keyboard.press('Control+d')
    await page.keyboard.press('Control+d')
    expect(await rects(page)).toEqual([
      ['r1', 50, 50], ['svg_1', 110, 50], ['svg_2', 170, 50], ['svg_3', 230, 50]
    ])
    // One undo step per copy.
    await page.keyboard.press('Control+z')
    expect(await rects(page)).toHaveLength(3)
  })

  test('an unmoved copy keeps the offset of 20, as before', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+d')
    await page.keyboard.press('Control+d')
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 70, 70], ['svg_2', 90, 90]])
  })

  test('Mod+D after an Alt+drag repeats the drag', async ({ page }) => {
    await clickOn(page, 'r1')
    await dragBy(page, 'r1', 100, 0, 'Alt')
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 150, 50]])
    await page.keyboard.press('Control+d')
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 150, 50], ['svg_2', 250, 50]])
  })

  test('the D key and button follow the same rule', async ({ page }) => {
    await clickOn(page, 'r1')
    await page.locator('#tool_clone').click()
    await dragBy(page, 'svg_1', 0, 30)
    await page.locator('#tool_clone').click()
    expect(await rects(page)).toEqual([['r1', 50, 50], ['svg_1', 70, 100], ['svg_2', 90, 150]])
  })
})

test.describe('Copy and paste properties (M7)', () => {
  let errors

  test.beforeEach(async ({ page }) => {
    errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  const attrs = (page, id, names) => page.evaluate(([id, names]) => {
    const elem = document.getElementById(id)
    return Object.fromEntries(names.map((name) => [name, elem.getAttribute(name)]))
  }, [id, names])

  test('Mod+Alt+C then Mod+Alt+V gives fill and stroke, and keeps a font', async ({ page }) => {
    await clickOn(page, 'c1')
    await page.keyboard.press('Control+Alt+c')
    await clickOn(page, 'r1')
    await page.keyboard.press('Control+Alt+v')
    expect(await attrs(page, 'r1', ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'x'])).toEqual({
      fill: '#00c', stroke: '#0f0', 'stroke-width': '7', 'stroke-dasharray': '5,5', x: '50'
    })
    await clickOn(page, 't1')
    await page.keyboard.press('Control+Alt+v')
    expect(await attrs(page, 't1', ['fill', 'font-family', 'font-size'])).toEqual({
      fill: '#00c', 'font-family': 'serif', 'font-size': '20'
    })
    await page.keyboard.press('Control+z')
    expect(await attrs(page, 't1', ['fill', 'stroke'])).toEqual({ fill: '#333', stroke: null })
  })

  test('the context menu offers both, greyed when they cannot apply', async ({ page }) => {
    const item = (action) => page.locator(`#cmenu_canvas a[href="#${action}"]`)
    await page.locator('#r1').click({ button: 'right' })
    await expect(item('copy_properties').locator('..')).not.toHaveClass(/disabled/)
    await expect(item('paste_properties').locator('..')).toHaveClass(/disabled/)
    await expect(item('copy_properties')).toContainText('Copy Properties')
    await item('copy_properties').click()
    await page.locator('#c1').click({ button: 'right' })
    await expect(item('paste_properties').locator('..')).not.toHaveClass(/disabled/)
    await item('paste_properties').click()
    expect(await attrs(page, 'c1', ['fill', 'stroke', 'stroke-dasharray'])).toEqual({
      fill: '#c00', stroke: '#000', 'stroke-dasharray': null
    })
  })
})
