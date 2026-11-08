import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, canonical } from './helpers.js'

// M4: panel of a multi-selection. X, Y, W and H of the whole selection,
// "Mixed" values, expressions typed in the fields, commands of a single
// element, W and H of a path, a group or a text alone.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
    <ellipse id="e1" cx="300" cy="200" rx="50" ry="30" fill="#a63" stroke="#000" stroke-width="4" opacity="0.5"/>
    <rect id="r2" x="100" y="250" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
    <rect id="rr" x="400" y="300" width="80" height="40" fill="#36a" transform="rotate(30 440 320)"/>
    <path id="p1" d="M 300 300 L 380 320 L 340 400 Z" fill="#999" stroke="#000" stroke-width="4"/>
    <g id="grp"><rect id="ga" x="450" y="80" width="40" height="40"/><rect id="gb" x="500" y="80" width="40" height="40"/></g>
    <text id="t1" x="60" y="420" font-size="20" font-family="Serif">Un</text>
    <text id="t2" x="160" y="420" font-size="30" font-family="Serif">Deux</text>
  </g>
</svg>`

async function loadDrawing (page, svg = DRAWING) {
  await page.evaluate((svg) => {
    // These tests measure the gesture itself, to the unit: no snapping to
    // the neighbours (lot V2), which has its own tests (snap-v2).
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

// Waits for the fields of a multi-selection, filled once the next frame is
// drawn and the browser is idle.
async function settle (page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))
  await page.waitForFunction(() => !window.svgEditor.topPanel.selectionFieldsPending)
}

async function select (page, ids) {
  await page.evaluate((ids) => {
    window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
  await settle(page)
}

// Types a text in a field, key by key, then Enter.
async function typeField (page, id, text) {
  const input = page.locator(`#${id}`).locator('#input')
  await input.click()
  await input.press('Control+a')
  await input.pressSequentially(String(text))
  await input.press('Enter')
  await settle(page)
}

// Value of a field, or "Mixed".
const field = (page, id) => page.locator(`#${id}`).evaluate((el) => (el.mixed ? 'Mixed' : el.value))

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const numAttr = async (page, id, name) => Number(await attr(page, id, name))

const angleOf = (page, id) => page.evaluate((id) =>
  window.svgEditor.svgCanvas.getRotationAngle(document.getElementById(id)), id)

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const shown = (page, id) => page.locator(`#${id}`).evaluate((el) => {
  let node = el
  while (node && node.id !== 'tools_top') {
    if (getComputedStyle(node).display === 'none') { return false }
    node = node.parentElement
  }
  return true
})

// Box of elements, stroke excluded, measured by the browser.
const boxOf = (page, ids) => page.evaluate((ids) => {
  const content = document.getElementById('svgcontent')
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  ids.forEach((id) => {
    const el = document.getElementById(id)
    const m = content.getScreenCTM().inverse().multiply(el.getScreenCTM())
    const b = el.getBBox()
    ;[[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].forEach(([x, y]) => {
      const px = m.a * x + m.c * y + m.e
      const py = m.b * x + m.d * y + m.f
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    })
  })
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}, ids)

const round2 = (value) => String(Math.round(value * 100) / 100)

test.describe('X, Y, W and H of a multi-selection (M4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the fields show the box of the whole selection, stroke excluded', async ({ page }) => {
    await select(page, ['r1', 'e1'])
    for (const id of ['selected_x', 'selected_y', 'selected_w', 'selected_h', 'tool_ratio_lock']) {
      expect(await shown(page, id)).toBe(true)
    }
    expect(await field(page, 'selected_x')).toBe('100')
    expect(await field(page, 'selected_y')).toBe('100')
    expect(await field(page, 'selected_w')).toBe('250')
    expect(await field(page, 'selected_h')).toBe('130')
    // A rotated element counts by its turned box.
    await select(page, ['r1', 'rr'])
    const box = await boxOf(page, ['r1', 'rr'])
    expect(await field(page, 'selected_w')).toBe(round2(box.width))
    expect(await field(page, 'selected_h')).toBe(round2(box.height))
  })

  test('X and Y move the whole selection, as one undo step', async ({ page }) => {
    await select(page, ['r1', 'e1'])
    await typeField(page, 'selected_x', '50')
    expect(await attr(page, 'r1', 'x')).toBe('50')
    expect(await attr(page, 'e1', 'cx')).toBe('250')
    expect(await undoSize(page)).toBe(1)
    await typeField(page, 'selected_y', '+10')
    expect(await attr(page, 'r1', 'y')).toBe('110')
    expect(await attr(page, 'e1', 'cy')).toBe('210')
    expect(await field(page, 'selected_y')).toBe('110')
    expect(await undoSize(page)).toBe(2)
  })

  test('W and H scale the selection from the top left corner of its box', async ({ page }) => {
    await select(page, ['r1', 'e1'])
    await typeField(page, 'selected_w', '500')
    // Twice as wide, stroke unchanged: rectangle and ellipse are rewritten.
    expect(await attr(page, 'r1', 'x')).toBe('100')
    expect(await attr(page, 'r1', 'width')).toBe('160')
    expect(await attr(page, 'r1', 'height')).toBe('60')
    expect(await attr(page, 'e1', 'cx')).toBe('500')
    expect(await attr(page, 'e1', 'rx')).toBe('100')
    expect(await attr(page, 'r1', 'stroke-width')).toBe('2')
    expect(await field(page, 'selected_w')).toBe('500')
    expect(await field(page, 'selected_h')).toBe('130')
    expect(await undoSize(page)).toBe(1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page, 'r1', 'width')).toBe('80')
    expect(await attr(page, 'e1', 'cx')).toBe('300')
  })

  test('the lock keeps the proportions; an expression applies to the shown value', async ({ page }) => {
    await select(page, ['r1', 'e1'])
    await page.locator('#tool_ratio_lock').click()
    expect(await page.locator('#tool_ratio_lock').evaluate((el) => el.pressed)).toBe(true)
    await typeField(page, 'selected_h', '*2')
    expect(await field(page, 'selected_w')).toBe('500')
    expect(await field(page, 'selected_h')).toBe('260')
    expect(await attr(page, 'r1', 'height')).toBe('120')
    // Unlocked, the width alone changes.
    await page.locator('#tool_ratio_lock').click()
    await typeField(page, 'selected_w', '/2')
    expect(await field(page, 'selected_w')).toBe('250')
    expect(await field(page, 'selected_h')).toBe('260')
  })

  test('a text in the selection is never stretched: its font size takes the smaller factor', async ({ page }) => {
    await select(page, ['t1', 't2'])
    // The width alone: the texts move apart, their font sizes stay.
    await typeField(page, 'selected_w', '*2')
    expect(await numAttr(page, 't1', 'font-size')).toBe(20)
    expect(await numAttr(page, 't2', 'font-size')).toBe(30)
    expect(await numAttr(page, 't2', 'x')).toBeGreaterThan(160)
    expect(await attr(page, 't1', 'transform')).toBeNull()
    // With the lock, both sides: the font sizes double.
    await page.locator('#tool_ratio_lock').click()
    await typeField(page, 'selected_w', '*2')
    expect(await numAttr(page, 't1', 'font-size')).toBeCloseTo(40, 4)
    expect(await numAttr(page, 't2', 'font-size')).toBeCloseTo(60, 4)
    expect(await attr(page, 't2', 'transform')).toBeNull()
  })

  test('the shown value, sent back unchanged, moves nothing', async ({ page }) => {
    await select(page, ['r1', 'rr'])
    const markup = await page.evaluate(() => document.querySelector('#svgcontent g.layer').outerHTML)
    // A rounded value, as the field shows it.
    await page.locator('#selected_y').evaluate((el) => el.dispatchEvent(new CustomEvent('change')))
    await page.locator('#selected_w').evaluate((el) => el.dispatchEvent(new CustomEvent('change')))
    await settle(page)
    expect(await page.evaluate(() => document.querySelector('#svgcontent g.layer').outerHTML)).toBe(markup)
    expect(await undoSize(page)).toBe(0)
  })

  test('the fields and the live label use the unit of the document', async ({ page }) => {
    await page.evaluate(() => {
      const editor = window.svgEditor
      editor.configObj.curConfig.baseUnit = 'mm'
      editor.svgCanvas.setConfig(editor.configObj.curConfig)
    })
    await select(page, ['r1', 'e1'])
    const mm = (px) => round2(px * 25.4 / 96)
    expect(await field(page, 'selected_x')).toBe(mm(100))
    expect(await field(page, 'selected_w')).toBe(mm(250))
    await typeField(page, 'selected_x', '10')
    expect(await numAttr(page, 'r1', 'x')).toBeCloseTo(10 * 96 / 25.4, 4)
  })
})

test.describe('"Mixed" values and expressions (M4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('different stroke widths show "Mixed"; +2 and *2 change each one, as one undo step', async ({ page }) => {
    await select(page, ['r1', 'e1'])
    expect(await field(page, 'stroke_width')).toBe('Mixed')
    await typeField(page, 'stroke_width', '+2')
    expect(await attr(page, 'r1', 'stroke-width')).toBe('4')
    expect(await attr(page, 'e1', 'stroke-width')).toBe('6')
    expect(await field(page, 'stroke_width')).toBe('Mixed')
    expect(await undoSize(page)).toBe(1)
    await typeField(page, 'stroke_width', 'mixed*2')
    expect(await attr(page, 'r1', 'stroke-width')).toBe('8')
    expect(await attr(page, 'e1', 'stroke-width')).toBe('12')
    // A number gives every element the same value.
    await typeField(page, 'stroke_width', '3')
    expect(await attr(page, 'r1', 'stroke-width')).toBe('3')
    expect(await attr(page, 'e1', 'stroke-width')).toBe('3')
    expect(await field(page, 'stroke_width')).toBe('3')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attr(page, 'r1', 'stroke-width')).toBe('4')
    expect(await attr(page, 'e1', 'stroke-width')).toBe('6')
  })

  test('shared values are shown; the arrows of a "Mixed" field step each value', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    expect(await field(page, 'stroke_width')).toBe('2')
    expect(await field(page, 'opacity')).toBe('100')
    expect(await page.locator('#fill_color').evaluate((el) => el.classList.contains('mixed'))).toBe(false)
    await select(page, ['r1', 'e1'])
    expect(await field(page, 'opacity')).toBe('Mixed')
    expect(await page.locator('#fill_color').evaluate((el) => el.classList.contains('mixed'))).toBe(true)
    expect(await page.locator('#stroke_color').evaluate((el) => el.classList.contains('mixed'))).toBe(false)
    const input = page.locator('#opacity').locator('#input')
    await input.click()
    await input.press('ArrowDown')
    await settle(page)
    // The step of the opacity field is 5 (percent).
    expect(await attr(page, 'r1', 'opacity')).toBe('0.95')
    expect(await attr(page, 'e1', 'opacity')).toBe('0.45')
    expect(await field(page, 'opacity')).toBe('Mixed')
  })

  test('different dash styles and font sizes show "Mixed"; *2 doubles each font size', async ({ page }) => {
    await page.evaluate(() => document.getElementById('r1').setAttribute('stroke-dasharray', '5,5'))
    await select(page, ['r1', 'r2'])
    expect(await page.locator('#stroke_style').evaluate((el) => el.mixed)).toBe(true)
    await select(page, ['t1', 't2'])
    expect(await shown(page, 'font_size')).toBe(true)
    expect(await field(page, 'font_size')).toBe('Mixed')
    expect(await page.locator('#tool_font_family').evaluate((el) => el.value)).toBe('Serif')
    await typeField(page, 'font_size', '*2')
    expect(await attr(page, 't1', 'font-size')).toBe('40')
    expect(await attr(page, 't2', 'font-size')).toBe('60')
  })

  test('different angles show "Mixed": a value or an expression turns each element about its own center', async ({ page }) => {
    await select(page, ['r1', 'rr'])
    expect(await field(page, 'angle')).toBe('Mixed')
    await typeField(page, 'angle', '+10')
    expect(await angleOf(page, 'r1')).toBe(10)
    expect(await angleOf(page, 'rr')).toBe(40)
    // Each element stays in place: its center does not move.
    expect(canonical(await attr(page, 'r1', 'transform'))).toBe('rotate(10 140 130)')
    expect(await undoSize(page)).toBe(1)
    expect(await field(page, 'angle')).toBe('Mixed')
    await typeField(page, 'angle', '0')
    expect(await angleOf(page, 'r1')).toBe(0)
    expect(await angleOf(page, 'rr')).toBe(0)
    // Firefox computes the turn back in single precision: 399.99998.
    expect(Number(await attr(page, 'rr', 'x'))).toBeCloseTo(400, 4)
    expect(await field(page, 'angle')).toBe('0')
    // Now shared, the angle turns the whole selection about its center (M3).
    await typeField(page, 'angle', '90')
    expect(await angleOf(page, 'r1')).toBe(90)
    expect(Number(await attr(page, 'r1', 'x'))).not.toBe(100)
  })

  test('the first key typed is not applied before Enter', async ({ page }) => {
    await select(page, ['r1'])
    const input = page.locator('#rect_width').locator('#input')
    await input.click()
    await input.press('Control+a')
    await input.pressSequentially('12')
    await settle(page)
    expect(await attr(page, 'r1', 'width')).toBe('80')
    expect(await undoSize(page)).toBe(0)
    await input.press('Enter')
    await settle(page)
    expect(await attr(page, 'r1', 'width')).toBe('12')
    expect(await undoSize(page)).toBe(1)
  })
})

test.describe('Commands of a multi-selection, W and H of an element alone (M4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('order buttons bring the selection to the front or the back', async ({ page }) => {
    await select(page, ['r1', 'e1'])
    expect(await shown(page, 'tool_move_top_multi')).toBe(true)
    await page.locator('#tool_move_top_multi').click()
    const order = () => page.evaluate(() => [...document.querySelector('#svgcontent g.layer').children]
      .filter((el) => el.id).map((el) => el.id))
    expect((await order()).slice(-2)).toEqual(['r1', 'e1'])
    await page.locator('#tool_move_bottom_multi').click()
    expect((await order()).slice(0, 2)).toEqual(['r1', 'e1'])
  })

  test('the shapes are converted to paths in one step, each with its own style', async ({ page }) => {
    await select(page, ['r1', 'e1', 't1'])
    expect(await shown(page, 'tool_topath_multi')).toBe(true)
    await page.locator('#tool_topath_multi').click()
    await settle(page)
    const tags = await page.evaluate(() => ['r1', 'e1', 't1'].map((id) => document.getElementById(id).tagName))
    expect(tags).toEqual(['path', 'path', 'text'])
    expect(await attr(page, 'r1', 'fill')).toBe('#3a6')
    expect(await attr(page, 'e1', 'fill')).toBe('#a63')
    expect(await attr(page, 'e1', 'stroke-width')).toBe('4')
    expect(await undoSize(page)).toBe(1)
    const selected = await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())
    expect(selected).toEqual(['e1', 'r1', 't1'])
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => ['r1', 'e1'].map((id) => document.getElementById(id).tagName))).toEqual(['rect', 'ellipse'])
  })

  test('a path alone gets W and H: changing W scales it from the top left corner', async ({ page }) => {
    await select(page, ['p1'])
    expect(await shown(page, 'selected_w')).toBe(true)
    expect(await field(page, 'selected_w')).toBe('80')
    expect(await field(page, 'selected_h')).toBe('100')
    // X and Y describe the box without the stroke, as for a multi-selection
    // (decision of 8 November: they used to include the stroke, 298).
    expect(await field(page, 'selected_x')).toBe('300')
    await typeField(page, 'selected_w', '160')
    expect(canonical(await attr(page, 'p1', 'd'))).toBe(canonical('M300,300 L460,320 L380,400 L300,300 z'))
    expect(await field(page, 'selected_x')).toBe('300')
    expect(await undoSize(page)).toBe(1)
    // Typing X moves the box without the stroke to that value.
    await typeField(page, 'selected_x', '320')
    expect(canonical(await attr(page, 'p1', 'd'))).toBe(canonical('M320,300 L480,320 L400,400 L320,300 z'))
    expect(await field(page, 'selected_x')).toBe('320')
    expect(await undoSize(page)).toBe(2)
  })

  test('a group alone gets W and H', async ({ page }) => {
    await select(page, ['grp'])
    expect(await field(page, 'selected_w')).toBe('90')
    await typeField(page, 'selected_h', '80')
    const box = await boxOf(page, ['grp'])
    expect(round2(box.height)).toBe('80')
    expect(round2(box.width)).toBe('90')
  })

  test('a text alone always keeps its proportions', async ({ page }) => {
    await select(page, ['t1'])
    const lock = page.locator('#tool_ratio_lock')
    expect(await lock.evaluate((el) => el.pressed)).toBe(true)
    expect(await lock.evaluate((el) => el.disabled)).toBe(true)
    const width = Number(await field(page, 'selected_w'))
    await typeField(page, 'selected_w', round2(width * 1.5))
    // The field shows the width rounded to two decimals.
    expect(await numAttr(page, 't1', 'font-size')).toBeCloseTo(30, 1)
    // Another element alone gets the lock back as it was.
    await select(page, ['p1'])
    expect(await lock.evaluate((el) => el.disabled)).toBe(false)
    expect(await lock.evaluate((el) => el.pressed)).toBe(false)
  })

  test('the live label shows the X and Y of the fields', async ({ page }) => {
    await select(page, ['r1', 'rr'])
    const x = Number(await field(page, 'selected_x'))
    const y = Number(await field(page, 'selected_y'))
    const box = await page.locator('#r1').boundingBox()
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 5, from.y + 2, { steps: 2 })
    await page.mouse.move(from.x + 10, from.y + 5, { steps: 2 })
    const text = await page.evaluate(() => document.getElementById('selectorDimension').textContent.replace(/\u2002/g, ' '))
    await page.mouse.up()
    await settle(page)
    expect(text).toBe(`X ${round2(x + 10)} Y ${round2(y + 5)}`)
    expect(await field(page, 'selected_x')).toBe(round2(x + 10))
    expect(await field(page, 'selected_y')).toBe(round2(y + 5))
  })
})
