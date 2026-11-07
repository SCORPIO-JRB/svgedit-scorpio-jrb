import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// M6: advanced selection. Ctrl+click takes the deepest object under the
// pointer, Enter and Shift+Enter go to the children and to the parent, the
// context menu selects the objects with the same symbol, fill or stroke.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <defs>
    <symbol id="pump" viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#888"/></symbol>
    <symbol id="valve" viewBox="0 0 20 20"><rect width="20" height="20" fill="#888"/></symbol>
  </defs>
  <g class="layer"><title>Layer 1</title>
    <rect id="top" x="20" y="20" width="60" height="60" fill="#c00"/>
    <g id="outer">
      <rect id="o1" x="100" y="100" width="60" height="60" fill="#c00"/>
      <g id="inner" transform="translate(10 0)">
        <rect id="i1" x="200" y="100" width="60" height="60" fill="#0c0" stroke="#000" stroke-width="2"/>
        <text id="it" x="300" y="140" font-size="24" font-family="Serif">Txt</text>
      </g>
    </g>
    <g id="rot" transform="rotate(30 450 140)">
      <rect id="ra" x="420" y="100" width="60" height="40" fill="#00c"/>
      <rect id="rb" x="420" y="150" width="60" height="30" fill="#00c"/>
    </g>
    <use id="u1" xlink:href="#pump" x="100" y="300" width="20" height="20"/>
    <use id="u2" xlink:href="#pump" x="160" y="300" width="20" height="20"/>
    <use id="u3" xlink:href="#valve" x="220" y="300" width="20" height="20"/>
    <circle id="c1" cx="320" cy="310" r="15" fill="red" stroke="#000"/>
    <ellipse id="e1" cx="400" cy="310" rx="20" ry="10" fill="#ff0000" stroke="blue"/>
    <path id="p1" d="M 460 300 L 540 340" fill="none" stroke="#000"/>
  </g>
</svg>`

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

// Screen point of the centre of an element.
const centerOf = (page, id) => page.evaluate((id) => {
  const box = document.getElementById(id).getBoundingClientRect()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}, id)

async function clickOn (page, id, modifiers = []) {
  const point = await centerOf(page, id)
  await page.mouse.move(point.x, point.y)
  for (const key of modifiers) { await page.keyboard.down(key) }
  await page.mouse.down()
  await page.mouse.up()
  for (const key of modifiers) { await page.keyboard.up(key) }
}

const deepClick = (page, id, modifiers = []) => clickOn(page, id, ['Control', ...modifiers])

const selection = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())

const context = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getCurrentGroup()?.id ?? null)

const breadcrumb = (page) => page.evaluate(() => {
  const panel = document.getElementById('cur_context_panel')
  return panel.style.display === 'none' ? '' : panel.textContent
})

const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const svgString = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())

// Presses a key with the focus on the page, as the shortcuts expect.
async function press (page, key) {
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.keyboard.press(key)
}

const hover = (page) => page.evaluate(() => {
  const outline = document.getElementById('selectorHover')
  return {
    shown: outline.getAttribute('display') !== 'none',
    d: outline.getAttribute('d'),
    transform: outline.getAttribute('transform') || ''
  }
})

// The outline the hover would draw around an element.
const hoverOf = (page, id) => page.evaluate((id) => {
  const mgr = window.svgEditor.svgCanvas.selectorManager
  mgr.showHover(document.getElementById(id))
  const outline = document.getElementById('selectorHover')
  const result = { d: outline.getAttribute('d'), transform: outline.getAttribute('transform') || '' }
  mgr.hideHover()
  return result
}, id)

async function contextMenu (page, id) {
  const point = await centerOf(page, id)
  await page.mouse.click(point.x, point.y, { button: 'right' })
}

const menuItem = (page, action) => page.locator('#se-cmenu_canvas').locator(`a[href="#${action}"]`)

const menuItemEnabled = (page, action) => menuItem(page, action).evaluate((a) =>
  !a.parentElement.classList.contains('disabled'))

test.describe('Deep selection with Ctrl+click (M6)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a plain click takes the group, Ctrl+click the object inside, at any depth', async ({ page }) => {
    await clickOn(page, 'i1')
    expect(await selection(page)).toEqual(['outer'])
    expect(await context(page)).toBe(null)

    await deepClick(page, 'i1')
    expect(await selection(page)).toEqual(['i1'])
    expect(await context(page)).toBe('inner')
    expect(await breadcrumb(page)).toBe('Layer 1 > outer > inner')
    // Nothing was written in the document.
    expect(await undoSize(page)).toBe(0)

    // The group stays open: a plain click takes the other object of the group.
    await clickOn(page, 'it')
    expect(await selection(page)).toEqual(['it'])
    expect(await context(page)).toBe('inner')
  })

  test('Ctrl+click reaches the objects an open group dims, and closes it', async ({ page }) => {
    await deepClick(page, 'i1')
    expect(await context(page)).toBe('inner')
    // o1 is outside the open group: it ignores a plain click.
    await deepClick(page, 'o1')
    expect(await selection(page)).toEqual(['o1'])
    expect(await context(page)).toBe('outer')
    await deepClick(page, 'top')
    expect(await selection(page)).toEqual(['top'])
    expect(await context(page)).toBe(null)
    expect(await breadcrumb(page)).toBe('')
  })

  test('Shift+Ctrl+click adds an object of the same group, and starts again in another one', async ({ page }) => {
    await deepClick(page, 'i1')
    await deepClick(page, 'it', ['Shift'])
    expect(await selection(page)).toEqual(['i1', 'it'])
    // A second Shift+Ctrl+click takes it out, like Shift+click.
    await deepClick(page, 'it', ['Shift'])
    expect(await selection(page)).toEqual(['i1'])
    await deepClick(page, 'it', ['Shift'])
    await deepClick(page, 'o1', ['Shift'])
    expect(await selection(page)).toEqual(['o1'])
    expect(await context(page)).toBe('outer')
  })

  test('Ctrl+drag moves the object inside the group alone, in one undo step', async ({ page }) => {
    const before = await svgString(page)
    const point = await centerOf(page, 'i1')
    await page.mouse.move(point.x, point.y)
    await page.keyboard.down('Control')
    await page.mouse.down()
    await page.mouse.move(point.x + 15, point.y + 10, { steps: 3 })
    await page.mouse.move(point.x + 30, point.y + 20, { steps: 3 })
    await page.mouse.up()
    await page.keyboard.up('Control')
    expect(await selection(page)).toEqual(['i1'])
    expect(await attr(page, 'i1', 'x')).toBe('230')
    expect(await attr(page, 'i1', 'y')).toBe('120')
    expect(await attr(page, 'o1', 'x')).toBe('100')
    expect(await undoSize(page)).toBe(1)
    await press(page, 'Control+z')
    await press(page, 'Escape')
    await press(page, 'Escape')
    await press(page, 'Escape')
    expect(await context(page)).toBe(null)
    expect(await svgString(page)).toBe(before)
  })

  test('a rotated group opens as on a double click: its rotation goes to its objects, one undo step', async ({ page }) => {
    await deepClick(page, 'ra')
    expect(await selection(page)).toEqual(['ra'])
    expect(await context(page)).toBe('rot')
    expect(await attr(page, 'rot', 'transform')).toBe(null)
    expect(await attr(page, 'ra', 'transform')).toContain('rotate(30')
    expect(await undoSize(page)).toBe(1)
    // The output, as a double click on the group writes it (below).
    const viaCtrlClick = await svgString(page)
    await press(page, 'Control+z')
    expect(await attr(page, 'rot', 'transform')).toBe('rotate(30 450 140)')
    expect(await attr(page, 'ra', 'transform')).toBe(null)
    await loadDrawing(page)
    const point = await centerOf(page, 'ra')
    await page.mouse.dblclick(point.x, point.y)
    expect(await context(page)).toBe('rot')
    expect(await svgString(page)).toBe(viaCtrlClick)
  })

  test('opening and closing groups leaves the document as it was', async ({ page }) => {
    const before = await svgString(page)
    await deepClick(page, 'i1')
    // The objects outside the open group are dimmed and ignore the pointer.
    expect(await attr(page, 'top', 'opacity')).toBe('0.33')
    expect(await page.evaluate(() => document.getElementById('top').style.pointerEvents)).toBe('none')
    await press(page, 'Escape')
    await press(page, 'Escape')
    await press(page, 'Escape')
    expect(await context(page)).toBe(null)
    expect(await attr(page, 'top', 'opacity')).toBe(null)
    expect(await svgString(page)).toBe(before)
  })

  test('with Ctrl held, the hover outlines the object a Ctrl+click would take', async ({ page }) => {
    const point = await centerOf(page, 'i1')
    await page.mouse.move(point.x - 2, point.y)
    await page.mouse.move(point.x, point.y)
    expect(await hover(page)).toEqual({ shown: true, ...(await hoverOf(page, 'outer')) })
    // Pressing or releasing the key is enough, without moving the pointer.
    await page.keyboard.down('Control')
    expect(await hover(page)).toEqual({ shown: true, ...(await hoverOf(page, 'i1')) })
    await page.mouse.move(point.x + 2, point.y)
    expect(await hover(page)).toEqual({ shown: true, ...(await hoverOf(page, 'i1')) })
    await page.keyboard.up('Control')
    expect(await hover(page)).toEqual({ shown: true, ...(await hoverOf(page, 'outer')) })
  })
})

test.describe('Enter and Shift+Enter (M6)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Enter selects the objects of the group, Shift+Enter the group that holds them', async ({ page }) => {
    await clickOn(page, 'o1')
    expect(await selection(page)).toEqual(['outer'])
    await press(page, 'Enter')
    expect(await selection(page)).toEqual(['inner', 'o1'])
    expect(await context(page)).toBe('outer')
    // Two objects: Enter does nothing.
    await press(page, 'Enter')
    expect(await selection(page)).toEqual(['inner', 'o1'])
    await clickOn(page, 'i1')
    expect(await selection(page)).toEqual(['inner'])
    await press(page, 'Enter')
    expect(await selection(page)).toEqual(['i1', 'it'])
    expect(await context(page)).toBe('inner')

    await press(page, 'Shift+Enter')
    expect(await selection(page)).toEqual(['inner'])
    expect(await context(page)).toBe('outer')
    await press(page, 'Shift+Enter')
    expect(await selection(page)).toEqual(['outer'])
    expect(await context(page)).toBe(null)
    // At the top: nothing more.
    await press(page, 'Shift+Enter')
    expect(await selection(page)).toEqual(['outer'])
    expect(await undoSize(page)).toBe(0)
  })

  test('Escape in an open group goes up one level, as Shift+Enter', async ({ page }) => {
    await deepClick(page, 'i1')
    await press(page, 'Escape')
    expect(await selection(page)).toEqual(['inner'])
    expect(await context(page)).toBe('outer')
    await press(page, 'Escape')
    expect(await selection(page)).toEqual(['outer'])
    expect(await context(page)).toBe(null)
    await press(page, 'Escape')
    expect(await selection(page)).toEqual([])
  })

  test('Enter on a path edits its nodes, on a text its characters', async ({ page }) => {
    await clickOn(page, 'p1')
    await press(page, 'Enter')
    expect(await mode(page)).toBe('pathedit')
    await press(page, 'Escape')
    expect(await mode(page)).toBe('select')
    await deepClick(page, 'it')
    await press(page, 'Enter')
    expect(await mode(page)).toBe('textedit')
    expect(await attr(page, 'it', 'x')).toBe('300')
  })

  test('Enter typed in a field of the panel is not a selection shortcut', async ({ page }) => {
    await clickOn(page, 'o1')
    const input = page.locator('#selected_x').locator('#input')
    await input.click()
    await input.press('Enter')
    expect(await selection(page)).toEqual(['outer'])
    expect(await context(page)).toBe(null)
  })
})

test.describe('Objects that look the same (M6)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('same symbol selects the uses of the same symbol', async ({ page }) => {
    await contextMenu(page, 'u1')
    expect(await menuItemEnabled(page, 'select_same_symbol')).toBe(true)
    expect(await menuItemEnabled(page, 'select_same_fill')).toBe(false)
    await menuItem(page, 'select_same_symbol').click()
    expect(await selection(page)).toEqual(['u1', 'u2'])
    await expect(page.locator('#se-cmenu_canvas').locator('#cmenu_canvas')).toBeHidden()
  })

  test('same fill compares the colour however it is written, same stroke the stroke', async ({ page }) => {
    await contextMenu(page, 'c1')
    expect(await menuItemEnabled(page, 'select_same_symbol')).toBe(false)
    await menuItem(page, 'select_same_fill').click()
    // red and #ff0000 are the same colour; #c00 is not.
    expect(await selection(page)).toEqual(['c1', 'e1'])
    // Both are selected now: their strokes, black and blue, both count.
    await contextMenu(page, 'c1')
    await menuItem(page, 'select_same_stroke').click()
    expect(await selection(page)).toEqual(['c1', 'e1', 'p1'])
    // A click on one of them keeps it alone, even right after a right click.
    await clickOn(page, 'c1')
    expect(await selection(page)).toEqual(['c1'])
    await contextMenu(page, 'c1')
    await menuItem(page, 'select_same_stroke').click()
    expect(await selection(page)).toEqual(['c1', 'p1'])
  })

  test('the search stays in the open group, and nothing is written in the document', async ({ page }) => {
    await deepClick(page, 'o1')
    expect(await context(page)).toBe('outer')
    await contextMenu(page, 'o1')
    await menuItem(page, 'select_same_fill').click()
    // top has the same fill, but it is outside the open group.
    expect(await selection(page)).toEqual(['o1'])
    expect(await undoSize(page)).toBe(0)
  })

  test('a selection of several objects gathers the objects like each of them', async ({ page }) => {
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('u3'), document.getElementById('u1')])
      canvas.selectSimilar('symbol')
    })
    expect(await selection(page)).toEqual(['u1', 'u2', 'u3'])
  })
})
