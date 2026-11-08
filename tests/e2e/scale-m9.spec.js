import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// M9: the Scale tool (K), its panel, Tidy up and the imposed spacing.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480">
  <defs><symbol id="sym" viewBox="0 0 20 20"><rect width="20" height="20" stroke="#000" stroke-width="1"/></symbol></defs>
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2" data-tag="P-101" se:nonce="1"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a" stroke="#000" stroke-width="4" stroke-dasharray="6,2"/>
    <text id="t1" x="100" y="300" font-size="20" stroke="#000" stroke-width="1">Pompe</text>
    <g id="grp" stroke="#000" stroke-width="2"><rect id="g1" x="450" y="80" width="40" height="40" fill="#ccc"/></g>
    <use id="u1" xlink:href="#sym" x="450" y="300" width="40" height="40" stroke-width="3"/>
    <rect id="rr" x="400" y="380" width="80" height="40" fill="#a63" stroke="#000" stroke-width="2" transform="rotate(30 440 400)"/>
  </g>
</svg>`

const ROUGH = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="a" x="100" y="100" width="40" height="40"/>
    <rect id="b" x="163" y="104" width="40" height="40"/>
    <rect id="c" x="101" y="161" width="40" height="40"/>
    <rect id="d" x="160" y="160" width="40" height="40"/>
    <rect id="e" x="300" y="300" width="20" height="20"/>
    <rect id="f" x="330" y="300" width="40" height="20"/>
    <rect id="g" x="420" y="300" width="20" height="20"/>
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

// Waits for the fields filled once the next frame is drawn.
async function settle (page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))
  await page.waitForFunction(() => !window.svgEditor.topPanel.selectionFieldsPending &&
    !window.svgEditor.topPanel.scaleFieldsPending)
}

async function select (page, ids) {
  await page.evaluate((ids) => {
    window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
  await settle(page)
}

async function scaleTool (page) {
  await page.locator('body').press('k')
  await expect.poll(() => page.evaluate(() => window.svgEditor.svgCanvas.isScaleTool())).toBe(true)
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragGrip (page, dir, dx, dy, { modifiers = [], escape = false, during } = {}) {
  const from = await center(page, `#selectorGrip_resize_${dir}`)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
  const seen = during ? await during() : undefined
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
  await settle(page)
  return seen
}

async function typeField (page, id, text) {
  const input = page.locator(`#${id}`).locator('#input')
  await input.click()
  await input.press('Control+a')
  await input.pressSequentially(String(text))
  await input.press('Enter')
  await settle(page)
}

const field = (page, id) => page.locator(`#${id}`).evaluate((el) => el.value)

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const num = async (page, id, name) => Number(await attr(page, id, name))

const nums = (page, id, names) => page.evaluate(({ id, names }) => {
  const el = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, Number(el.getAttribute(name))]))
}, { id, names })

const layerMarkup = (page) => page.evaluate(() =>
  document.querySelector('#svgcontent g.layer').outerHTML)

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const shown = (page, id) => page.locator(`#${id}`).evaluate((el) => {
  let node = el
  while (node && node.id !== 'tools_top') {
    if (getComputedStyle(node).display === 'none') { return false }
    node = node.parentElement
  }
  return true
})

// Screen box of an element, its stroke excluded.
const screenBox = (page, id) => page.evaluate((id) => {
  const { x, y, width, height } = document.getElementById(id).getBoundingClientRect()
  return { x, y, width, height }
}, id)

const errors = []

test.describe('Scale tool (M9)', () => {
  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('pageerror', (err) => errors.push(err.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('K turns the tool on, V and the other tools turn it off', async ({ page }) => {
    await scaleTool(page)
    expect(await page.locator('#tool_scale').evaluate((el) => el.pressed)).toBe(true)
    await select(page, ['r1'])
    // Selecting keeps the tool on.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.isScaleTool())).toBe(true)
    expect(await shown(page, 'scale_factor')).toBe(true)
    await page.locator('body').press('v')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.isScaleTool())).toBe(false)
    expect(await shown(page, 'scale_factor')).toBe(false)
    await scaleTool(page)
    await page.locator('body').press('r')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.isScaleTool())).toBe(false)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('rect')
  })

  test('a grip scales an element alone with its proportions and its stroke', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['r1'])
    await dragGrip(page, 'se', 80, 20)
    const r = await nums(page, 'r1', ['x', 'y', 'width', 'height', 'stroke-width'])
    const k = r.width / 80
    expect(k).toBeGreaterThan(1.3)
    expect(r.x).toBeCloseTo(100, 6)
    expect(r.y).toBeCloseTo(100, 6)
    expect(r.height).toBeCloseTo(60 * k, 6)
    expect(r['stroke-width']).toBeCloseTo(2 * k, 6)
    expect(await attr(page, 'r1', 'transform')).toBeNull()
    expect(await attr(page, 'r1', 'data-tag')).toBe('P-101')
    expect(await undoSize(page)).toBe(1)
  })

  test('a side grip keeps the middle of the opposite side in place', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['r1'])
    await dragGrip(page, 'e', 40, 0)
    const r = await nums(page, 'r1', ['x', 'y', 'width', 'height'])
    expect(r.x).toBeCloseTo(100, 6)
    expect(r.y + r.height / 2).toBeCloseTo(130, 6)
    expect(r.width / r.height).toBeCloseTo(80 / 60, 6)
  })

  test('a multi-selection scales as one object, strokes and dashes included, in one undo step', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['r1', 'r2'])
    const before = await layerMarkup(page)
    // The preview is the result: boxes during the drag and after it match.
    const during = await dragGrip(page, 'se', 110, 30, {
      during: async () => ({ r1: await screenBox(page, 'r1'), r2: await screenBox(page, 'r2') })
    })
    const r1 = await nums(page, 'r1', ['x', 'y', 'width', 'height', 'stroke-width'])
    const r2 = await nums(page, 'r2', ['x', 'y', 'width', 'height', 'stroke-width'])
    const k = r1.width / 80
    expect(k).toBeGreaterThan(1.2)
    expect(r2.width / 80).toBeCloseTo(k, 6)
    expect(r1['stroke-width']).toBeCloseTo(2 * k, 6)
    expect(r2['stroke-width']).toBeCloseTo(4 * k, 6)
    const dashes = (await attr(page, 'r2', 'stroke-dasharray')).split(',').map(Number)
    expect(dashes[0]).toBeCloseTo(6 * k, 6)
    expect(dashes[1]).toBeCloseTo(2 * k, 6)
    // The relative positions scale too.
    expect(r2.x - r1.x).toBeCloseTo(140 * k, 6)
    for (const id of ['r1', 'r2']) {
      const after = await screenBox(page, id)
      for (const key of ['x', 'y', 'width', 'height']) {
        expect(Math.abs(after[key] - during[id][key])).toBeLessThan(0.5)
      }
    }
    expect(await undoSize(page)).toBe(1)
    const after = await layerMarkup(page)
    await page.keyboard.press('Control+z')
    expect(await layerMarkup(page)).toBe(before)
    await page.keyboard.press('Control+y')
    expect(await layerMarkup(page)).toBe(after)
  })

  test('Alt scales from the center, Escape cancels without history', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['r1'])
    await dragGrip(page, 'se', 30, 30, { modifiers: ['Alt'] })
    const r = await nums(page, 'r1', ['x', 'y', 'width', 'height'])
    expect(r.x + r.width / 2).toBeCloseTo(140, 6)
    expect(r.y + r.height / 2).toBeCloseTo(130, 6)
    await select(page, ['r2'])
    const before = await layerMarkup(page)
    const size = await undoSize(page)
    await dragGrip(page, 'se', 60, 60, { escape: true })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(size)
  })

  test('a text gets a new font size and stroke, a group and a use keep their matrix', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['t1', 'grp', 'u1'])
    await dragGrip(page, 'se', 60, 60)
    const fontSize = await num(page, 't1', 'font-size')
    const k = fontSize / 20
    expect(k).toBeGreaterThan(1.1)
    expect(await attr(page, 't1', 'transform')).toBeNull()
    expect(await num(page, 't1', 'stroke-width')).toBeCloseTo(k, 6)
    // A group keeps a matrix, which scales the strokes of its children.
    expect(await attr(page, 'grp', 'transform')).toMatch(/matrix/)
    expect(await attr(page, 'grp', 'stroke-width')).toBe('2')
    expect(await attr(page, 'u1', 'stroke-width')).toBe('3')
    // On screen, every stroke is k times wider: the group's rectangle is k
    // times larger with the same stroke width attribute under a k matrix.
    const g1 = await page.evaluate(() => document.getElementById('g1').getScreenCTM().a)
    expect(g1).toBeCloseTo(k, 4)
  })

  test('a rotated element alone scales along its own axes, angle kept', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['rr'])
    await dragGrip(page, 'se', 40, 40)
    const r = await nums(page, 'rr', ['width', 'height', 'stroke-width'])
    const k = r.width / 80
    expect(k).toBeGreaterThan(1.1)
    expect(r.height).toBeCloseTo(40 * k, 6)
    expect(r['stroke-width']).toBeCloseTo(2 * k, 6)
    expect(await page.evaluate(() =>
      window.svgEditor.svgCanvas.getRotationAngle(document.getElementById('rr')))).toBeCloseTo(30, 6)
  })
})

test.describe('Scale panel (M9)', () => {
  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('pageerror', (err) => errors.push(err.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('replaces the W and H fields while the tool is on', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    expect(await shown(page, 'selected_w')).toBe(true)
    expect(await shown(page, 'scale_factor')).toBe(false)
    await scaleTool(page)
    await settle(page)
    expect(await shown(page, 'scale_factor')).toBe(true)
    expect(await shown(page, 'selected_w')).toBe(false)
    expect(await field(page, 'scale_factor')).toBe('1')
    expect(await field(page, 'scale_w')).toBe('220')
    expect(await field(page, 'scale_h')).toBe('60')
  })

  test('the factor counts from the size at selection, about the top left corner', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['r1', 'r2'])
    await typeField(page, 'scale_factor', '2')
    expect(await nums(page, 'r1', ['x', 'y', 'width', 'stroke-width'])).toEqual({ x: 100, y: 100, width: 160, 'stroke-width': 4 })
    expect(await nums(page, 'r2', ['x', 'width', 'stroke-width'])).toEqual({ x: 380, width: 160, 'stroke-width': 8 })
    expect(await field(page, 'scale_factor')).toBe('2')
    expect(await field(page, 'scale_w')).toBe('440')
    // 1 brings the selection back to its size when it was taken.
    await typeField(page, 'scale_factor', '1')
    expect(await nums(page, 'r2', ['x', 'width', 'stroke-width'])).toEqual({ x: 240, width: 80, 'stroke-width': 4 })
    expect(await undoSize(page)).toBe(2)
  })

  test('W scales about the chosen anchor, and the arrow keys move the anchor', async ({ page }) => {
    await scaleTool(page)
    await select(page, ['r1'])
    await page.locator('#scale_anchor button[data-anchor="c"]').click()
    await expect(page.locator('#scale_anchor button[data-anchor="c"]')).toHaveAttribute('aria-checked', 'true')
    await typeField(page, 'scale_w', '160')
    expect(await nums(page, 'r1', ['x', 'y', 'width', 'height', 'stroke-width']))
      .toEqual({ x: 60, y: 70, width: 160, height: 120, 'stroke-width': 4 })
    await page.locator('#scale_anchor button[data-anchor="c"]').focus()
    await page.keyboard.press('ArrowUp')
    await expect(page.locator('#scale_anchor button[data-anchor="n"]')).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#scale_anchor button[data-anchor="n"]')).toBeFocused()
    await typeField(page, 'scale_h', '60')
    expect(await nums(page, 'r1', ['x', 'y', 'width', 'height'])).toEqual({ x: 100, y: 70, width: 80, height: 60 })
  })
})

test.describe('Tidy up and imposed spacing (M9)', () => {
  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('pageerror', (err) => errors.push(err.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page, ROUGH)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  test('Tidy up puts a rough grid into a regular one, in one undo step', async ({ page }) => {
    await select(page, ['a', 'b', 'c', 'd'])
    await expect(page.locator('#tool_tidy_up')).toBeVisible()
    const before = await layerMarkup(page)
    await page.locator('#tool_tidy_up').click()
    const at = async (id) => [await num(page, id, 'x'), await num(page, id, 'y')]
    const [a, b, c, d] = [await at('a'), await at('b'), await at('c'), await at('d')]
    expect(a).toEqual([100, 100])
    expect(b[1]).toBe(a[1])
    expect(c[0]).toBe(a[0])
    expect(d).toEqual([b[0], c[1]])
    expect(await undoSize(page)).toBe(1)
    await page.keyboard.press('Control+z')
    expect(await layerMarkup(page)).toBe(before)
  })

  test('a spacing typed in its field drives Tidy up and Distribute', async ({ page }) => {
    await select(page, ['e', 'f', 'g'])
    const spacing = page.locator('#tool_align_spacing').locator('input')
    await spacing.fill('15')
    await page.locator('#tool_tidy_up').click()
    expect([await num(page, 'e', 'x'), await num(page, 'f', 'x'), await num(page, 'g', 'x')]).toEqual([300, 335, 390])
    await spacing.fill('5')
    await page.locator('#tool_align_distrib_horiz').click()
    expect([await num(page, 'e', 'x'), await num(page, 'f', 'x'), await num(page, 'g', 'x')]).toEqual([300, 325, 370])
    // Empty: an even distribution between the outer objects, as before.
    await spacing.fill('')
    await page.locator('#tool_align_distrib_horiz').click()
    expect([await num(page, 'e', 'x'), await num(page, 'f', 'x'), await num(page, 'g', 'x')]).toEqual([300, 325, 370])
  })
})

test.describe('Ungroup keeps stroke widths and inherited properties (M9)', () => {
  const GROUPED = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <g id="G" transform="scale(2)" fill="#f00" stroke="#000" stroke-width="4" font-size="12">
      <rect id="a" x="10" y="10" width="20" height="10"/>
      <rect id="b" x="40" y="10" width="20" height="10" fill="#00f" stroke-width="1"/>
      <text id="t" x="10" y="50">T</text>
    </g>
    <g id="M" transform="matrix(2 0 0 2 10 10)"><rect id="m" x="100" y="100" width="20" height="10" stroke="#000" stroke-width="2"/></g>
  </g>
</svg>`

  test.beforeEach(async ({ page }) => {
    errors.length = 0
    page.on('pageerror', (err) => errors.push(err.message))
    await visitAndApproveStorage(page)
    await loadDrawing(page, GROUPED)
  })

  test.afterEach(() => {
    expect(errors).toEqual([])
  })

  // The layer with the attributes of each element in alphabetical order:
  // undoing an ungroup puts the group's transform back after its other
  // attributes, as before M9.
  const canonical = (page) => page.evaluate(() => {
    const walk = (el) => `<${el.tagName} ${[...el.attributes].map((a) => `${a.name}="${a.value}"`).sort().join(' ')}>` +
      [...el.children].map(walk).join('') + (el.children.length ? '' : el.textContent) + `</${el.tagName}>`
    return walk(document.querySelector('#svgcontent g.layer'))
  })

  test('the children keep their widths and get the colors, width and font of the group', async ({ page }) => {
    const before = await canonical(page)
    await select(page, ['G'])
    await page.evaluate(() => window.svgEditor.svgCanvas.ungroupSelectedElement())
    expect(await page.evaluate(() => document.getElementById('G'))).toBeNull()
    // The geometry takes the scale, the stroke width does not.
    expect(await nums(page, 'a', ['width', 'stroke-width'])).toEqual({ width: 40, 'stroke-width': 4 })
    expect(await attr(page, 'a', 'fill')).toBe('#f00')
    expect(await attr(page, 'a', 'stroke')).toBe('#000')
    // Own values stay.
    expect(await attr(page, 'b', 'fill')).toBe('#00f')
    expect(await attr(page, 'b', 'stroke-width')).toBe('1')
    expect(await attr(page, 'b', 'stroke')).toBe('#000')
    expect(await attr(page, 't', 'font-size')).toBe('12')
    // One undo step gives the group back exactly.
    expect(await undoSize(page)).toBe(1)
    await page.keyboard.press('Control+z')
    expect(await canonical(page)).toBe(before)
  })

  test('a group with a matrix keeps the stroke widths of its children', async ({ page }) => {
    await select(page, ['M'])
    await page.evaluate(() => window.svgEditor.svgCanvas.ungroupSelectedElement())
    expect(await nums(page, 'm', ['width', 'stroke-width'])).toEqual({ width: 40, 'stroke-width': 2 })
  })
})
