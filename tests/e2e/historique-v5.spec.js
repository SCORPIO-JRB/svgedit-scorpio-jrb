import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot V5, S4: the history is grouped and named. Undo and Redo name their
// step, the History menu goes back to any step, the objects of the step undone
// are selected again, nudges and typing are one step each.

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="100" height="80" fill="#4CC38A"/>
    <rect id="r2" x="300" y="100" width="100" height="80" fill="#160F23"/>
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
const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))

async function openZoomMenu (page) {
  await page.locator('#se-zoom-button').click()
  await expect(page.locator('#se-zoom-menu')).toHaveAttribute('open', '')
}

test.describe('History (V5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Undo and Redo name their step', async ({ page }) => {
    await openZoomMenu(page)
    const undo = page.locator('#se-zoom-menu [data-command="tool_undo"]')
    const redo = page.locator('#se-zoom-menu [data-command="tool_redo"]')
    await expect(undo.locator('span')).toHaveText('Undo')
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Escape')

    await select(page, 'r1', 'r2')
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(10, 0))
    await openZoomMenu(page)
    await expect(undo.locator('span')).toHaveText('Undo: Move 2 objects')
    await expect(redo.locator('span')).toHaveText('Redo')
    await undo.click()
    expect(await attr(page, 'r1', 'x')).toBe('100')
    await openZoomMenu(page)
    await expect(redo.locator('span')).toHaveText('Redo: Move 2 objects')
    await page.keyboard.press('Escape')
  })

  test('the arrows pressed in a row are one step', async ({ page }) => {
    await select(page, 'r1')
    await page.locator('#svgroot').hover({ position: { x: 5, y: 5 } })
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    expect(await attr(page, 'r1', 'x')).toBe('104')
    expect(await steps(page)).toBe(1)
    await page.keyboard.press('ControlOrMeta+z')
    expect(await attr(page, 'r1', 'x')).toBe('100')
  })

  test('undo selects again the objects of the step', async ({ page }) => {
    await select(page, 'r1', 'r2')
    await page.keyboard.press('Delete')
    expect(await attr(page, 'r1', 'x')).toBeNull()
    expect(await selected(page)).toEqual([])
    await page.keyboard.press('ControlOrMeta+z')
    expect((await selected(page)).sort()).toEqual(['r1', 'r2'])
    // Redo deletes them again: nothing left to select.
    await page.keyboard.press('ControlOrMeta+Shift+z')
    expect(await attr(page, 'r1', 'x')).toBeNull()
    expect(await selected(page)).toEqual([])
  })

  test('the History menu goes back to any step', async ({ page }) => {
    await select(page, 'r1')
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(10, 0))
    await page.evaluate(() => window.svgEditor.svgCanvas.changeSelectedAttribute('stroke-width', 4))
    await select(page, 'r2')
    await page.keyboard.press('Delete')
    expect(await steps(page)).toBe(3)

    await openZoomMenu(page)
    await page.locator('#se-zoom-menu [data-command="show_history"]').click()
    const menu = page.locator('#se-history-menu')
    await expect(menu).toHaveAttribute('open', '')
    const entries = menu.locator('[data-index]')
    await expect(entries).toHaveText(['Delete an object', 'Change the stroke width', 'Move an object', 'Document opened'])
    await expect(menu.locator('[aria-checked="true"]')).toHaveText('Delete an object')

    // Back to the opening: everything is undone.
    await menu.locator('[data-index="0"]').click()
    expect(await steps(page)).toBe(0)
    expect(await attr(page, 'r1', 'x')).toBe('100')
    expect(await attr(page, 'r2', 'x')).toBe('300')

    // The steps undone are dimmed; choosing one redoes up to it.
    await openZoomMenu(page)
    await page.locator('#se-zoom-menu [data-command="show_history"]').click()
    await expect(menu.locator('.se-history-future')).toHaveCount(3)
    await menu.locator('[data-index="2"]').click()
    expect(await steps(page)).toBe(2)
    expect(await attr(page, 'r1', 'x')).toBe('110')
    expect(await attr(page, 'r1', 'stroke-width')).toBe('4')
    expect(await attr(page, 'r2', 'x')).toBe('300')
    // The object of the last step redone is selected.
    expect(await selected(page)).toEqual(['r1'])
  })

  test('the menus show a check on the current step and on the options on', async ({ page }) => {
    const mark = (locator) => locator.evaluate((el) => getComputedStyle(el, '::before').content)
    await select(page, 'r1')
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(10, 0))
    await openZoomMenu(page)
    // An option on, in the zoom menu (it had no check since V3).
    const on = page.locator('#se-zoom-menu [role="menuitemcheckbox"][aria-checked="true"]').first()
    await expect(on).toHaveCount(1)
    expect(await mark(on)).toBe('"✓"')
    const off = page.locator('#se-zoom-menu [role="menuitemcheckbox"][aria-checked="false"]:not([hidden])').first()
    expect(await mark(off)).toBe('""')

    await page.locator('#se-zoom-menu [data-command="show_history"]').click()
    const menu = page.locator('#se-history-menu')
    await expect(menu).toHaveAttribute('open', '')
    expect(await mark(menu.locator('[data-index="1"]'))).toBe('"✓"')
    expect(await mark(menu.locator('[data-index="0"]'))).toBe('""')
  })

  test('the History menu works with the keyboard', async ({ page }) => {
    await select(page, 'r1')
    await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(10, 0))
    await page.locator('#se-zoom-button').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#se-zoom-menu')).toHaveAttribute('open', '')
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    const menu = page.locator('#se-history-menu')
    await expect(menu).toHaveAttribute('open', '')
    await expect(menu.locator('[data-index="1"]')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    expect(await steps(page)).toBe(0)
    expect(await attr(page, 'r1', 'x')).toBe('100')
  })

  test('a text typed then undone goes in one step', async ({ page }) => {
    await page.locator('#tool_text').click()
    const root = await page.locator('#svgcontent').boundingBox()
    await page.mouse.click(root.x + 200, root.y + 300)
    await page.keyboard.type('Pompe 12')
    const text = await page.evaluate(() => [...document.querySelectorAll('#svgcontent text')].map((el) => el.textContent))
    expect(text).toEqual(['Pompe 12'])
    // Escape ends the editing, the text selected.
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    // The creation is recorded at the end of the fade in, with the typing.
    await page.waitForTimeout(400)
    expect(await steps(page)).toBe(1)
    await openZoomMenu(page)
    await expect(page.locator('#se-zoom-menu [data-command="tool_undo"] span')).toHaveText('Undo: Create a text')
    await page.keyboard.press('Escape')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await page.locator('#svgcontent text').count()).toBe(0)
  })

  test('typing in an existing text is one step, undone back to the old text', async ({ page }) => {
    await page.evaluate(() => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>' +
        '<text id="t1" x="100" y="100" font-size="24">Pompe</text></g></svg>'
      window.svgEditor.svgCanvas.setSvgString(svg)
      window.svgEditor.updateCanvas()
      window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
    })
    await page.locator('#t1').dblclick()
    await page.keyboard.press('End')
    await page.keyboard.type(' 7')
    await page.keyboard.press('Escape')
    expect(await page.locator('#t1').textContent()).toBe('Pompe 7')
    expect(await steps(page)).toBe(1)
    await page.keyboard.press('ControlOrMeta+z')
    expect(await page.locator('#t1').textContent()).toBe('Pompe')
    expect(await steps(page)).toBe(0)
  })

  test('Undo while a text is edited undoes the typing, not the field', async ({ page }) => {
    await page.evaluate(() => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>' +
        '<text id="t1" x="100" y="100" font-size="24">Pompe</text></g></svg>'
      window.svgEditor.svgCanvas.setSvgString(svg)
      window.svgEditor.updateCanvas()
      window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
    })
    await page.locator('#t1').dblclick()
    await page.keyboard.press('End')
    await page.keyboard.type('AB')
    await page.keyboard.press('ControlOrMeta+z')
    expect(await page.locator('#t1').textContent()).toBe('Pompe')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('select')
    await page.keyboard.press('ControlOrMeta+Shift+z')
    expect(await page.locator('#t1').textContent()).toBe('PompeAB')
  })
})
