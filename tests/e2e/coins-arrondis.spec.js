import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, screenPoint } from './helpers.js'

// Lot Coins: rounded corners as in Illustrator. A disc inside each corner of
// a rectangle, a polygon, the rounded corners of a path, or the corners of the
// selected nodes, that a drag rounds; Alt+drag rounds one corner only. The
// Rectangle tool draws with the last radius, which the arrows change during
// the drawing.

const NS = 'http://www.w3.org/2000/svg'
const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

const load = (page, body) => page.evaluate((svg) => {
  window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
  window.svgEditor.svgCanvas.setSvgString(svg)
  window.svgEditor.svgCanvas.setZoom(1)
  window.svgEditor.updateCanvas()
  window.svgEditor.svgCanvas.clearSelection()
  window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
}, `<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>Layer 1</title>${body}</g></svg>`)

const select = (page, ...ids) => page.evaluate((ids) =>
  window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ids)
const attr = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id)?.getAttribute(name) ?? null, { id, name })
const tag = (page, id) => page.evaluate((id) => document.getElementById(id)?.tagName ?? null, id)
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const arcs = (page, id) => page.evaluate((id) => (document.getElementById(id)?.getAttribute('d').match(/A/g) || []).length, id)

/** The handles of the corners on the screen, by corner. */
const handles = async (page) => {
  // They are drawn once the current task has finished.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))
  return page.evaluate(() => {
    const group = document.getElementById('selectorCornerGrips')
    if (!group || group.getAttribute('display') === 'none') return {}
    const out = {}
    group.querySelectorAll('.se-corner').forEach((g) => {
      if (g.getAttribute('display') === 'none') return
      const r = g.querySelector('.se-corner-hit').getBoundingClientRect()
      out[g.getAttribute('data-corner')] = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    return out
  })
}

/** Drags from a point of the screen by a vector, keys held. */
const drag = async (page, from, dx, dy, modifiers = []) => {
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2)
  await page.mouse.move(from.x + dx, from.y + dy)
  const label = await page.evaluate(() => {
    const l = document.getElementById('selectorDimension')
    return l && l.getAttribute('display') !== 'none' ? l.textContent : null
  })
  await page.mouse.up()
  for (const key of [...modifiers].reverse()) await page.keyboard.up(key)
  return label
}

const undoName = async (page) => {
  await page.locator('#se-zoom-button').click()
  await expect(page.locator('#se-zoom-menu')).toHaveAttribute('open', '')
  const text = await page.locator('#se-zoom-menu [data-command="tool_undo"] span').textContent()
  await page.keyboard.press('Escape')
  return text
}

test.describe('Rounded corners (lot Coins)', () => {
  test('a rectangle shows a handle in each corner; a drag rounds the four', async ({ page }) => {
    await load(page, '<rect id="r1" x="100" y="100" width="200" height="120" fill="#fc0"/>')
    await select(page, 'r1')
    const h = await handles(page)
    expect(Object.keys(h).sort()).toEqual(['ne', 'nw', 'se', 'sw'])
    // Inside the rectangle, near each corner.
    const nw = await screenPoint(page, 100, 100)
    expect(h.nw.x).toBeGreaterThan(nw.x + 8)
    expect(h.nw.y).toBeGreaterThan(nw.y + 8)

    const label = await drag(page, h.nw, 20, 20)
    expect(label).toBe('R 20')
    expect(await attr(page, 'r1', 'rx')).toBe('20')
    expect(await attr(page, 'r1', 'ry')).toBe('20')
    expect(await steps(page)).toBe(1)
    // The handle follows the arc: its centre.
    const after = await handles(page)
    const centre = await screenPoint(page, 120, 120)
    expect(Math.abs(after.nw.x - centre.x)).toBeLessThan(1.5)
    expect(Math.abs(after.nw.y - centre.y)).toBeLessThan(1.5)

    await page.keyboard.press('Control+z')
    expect(await attr(page, 'r1', 'rx')).toBeNull()
    await page.keyboard.press('Control+y')
    expect(await attr(page, 'r1', 'rx')).toBe('20')
  })

  test('the radius stops at half the smaller side; Escape puts it back', async ({ page }) => {
    await load(page, '<rect id="r1" x="100" y="100" width="200" height="120" rx="8" fill="#fc0"/>')
    await select(page, 'r1')
    let h = await handles(page)
    // Released over the panels, out of the canvas: the drag ends all the same.
    expect(await drag(page, h.se, -250, -250)).toBe('R 60')
    expect(await attr(page, 'r1', 'rx')).toBe('60')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.cornerActions.isDragging())).toBe(false)

    // At their largest, the handles of the right corners meet at the same
    // point: a move to the right makes either smaller.
    h = await handles(page)
    await page.mouse.move(h.ne.x, h.ne.y)
    await page.mouse.down()
    await page.mouse.move(h.ne.x + 30, h.ne.y)
    expect(await attr(page, 'r1', 'rx')).not.toBe('60')
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await attr(page, 'r1', 'rx')).toBe('60')
    expect(await steps(page)).toBe(1)
  })

  test('no handle on a small rectangle, a multiple selection or another shape', async ({ page }) => {
    await load(page, `<rect id="small" x="20" y="20" width="30" height="30"/>
      <rect id="r1" x="100" y="100" width="200" height="120"/>
      <ellipse id="e1" cx="450" cy="300" rx="80" ry="50"/>`)
    await select(page, 'small')
    expect(await handles(page)).toEqual({})
    await select(page, 'r1', 'e1')
    expect(await handles(page)).toEqual({})
    await select(page, 'e1')
    expect(await handles(page)).toEqual({})
    await select(page, 'r1')
    expect(Object.keys(await handles(page))).toHaveLength(4)
  })

  test('Alt+drag rounds one corner: the rectangle becomes a path, in one step', async ({ page }) => {
    await load(page, '<rect id="r1" x="100" y="100" width="200" height="120" rx="10" fill="#9cf"/>')
    await select(page, 'r1')
    const h = await handles(page)
    expect(await drag(page, h.ne, -25, 25, ['Alt'])).toBe('R 35')
    expect(await tag(page, 'r1')).toBe('path')
    expect(await attr(page, 'r1', 'fill')).toBe('#9cf')
    const d = await attr(page, 'r1', 'd')
    expect(d).toContain('A35,35 0 0 1 300,135')
    expect((d.match(/A10,10/g) || []).length).toBe(3)
    expect(await steps(page)).toBe(1)
    expect(await undoName(page)).toBe('Undo: Round the corners')

    // The path shows the handles of its rounded corners; a drag gives them
    // all the same radius.
    const onPath = await handles(page)
    expect(Object.keys(onPath)).toHaveLength(4)
    await drag(page, Object.values(onPath)[3], 30, 30)
    expect((await attr(page, 'r1', 'd')).match(/A(\d+),/g).map((a) => a)).toEqual(['A40,', 'A40,', 'A40,', 'A40,'])

    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    expect(await tag(page, 'r1')).toBe('rect')
    expect(await attr(page, 'r1', 'rx')).toBe('10')
  })

  test('a polygon rounds all its corners and becomes a path', async ({ page }) => {
    await load(page, '<polygon id="p1" points="200,80 320,160 280,300 120,300 80,160" fill="#cfc"/>')
    await select(page, 'p1')
    const h = await handles(page)
    expect(Object.keys(h)).toHaveLength(5)
    await drag(page, Object.values(h)[0], 0, 25)
    expect(await tag(page, 'p1')).toBe('path')
    expect(await arcs(page, 'p1')).toBe(5)
    expect(await steps(page)).toBe(1)
    await page.keyboard.press('Control+z')
    expect(await tag(page, 'p1')).toBe('polygon')
  })

  test('in node editing, the selected corner gets a handle that rounds it', async ({ page }) => {
    await load(page, '<path id="q1" d="M100,100 L300,100 L300,250 L100,250 L100,100 Z" fill="#fcf"/>')
    await page.evaluate(() => window.svgEditor.svgCanvas.pathActions.toEditMode(document.getElementById('q1')))
    // Node 1 is (300, 100).
    const node = await screenPoint(page, 300, 100)
    await page.mouse.click(node.x, node.y)
    const h = await handles(page)
    expect(Object.keys(h)).toEqual(['0:0'])
    await drag(page, h['0:0'], -20, 20)
    expect(await attr(page, 'q1', 'd')).toBe('M100,100 L280,100 A20,20 0 0 1 300,120 L300,250 L100,250 L100,100 Z')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('pathedit')
    // The corner stays selected, by the two ends of its arc.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getPathObj().selected_pts)).toEqual([1, 2])
    expect(Object.keys(await handles(page))).toEqual(['0:0'])
    expect(await steps(page)).toBe(1)

    // Back to a sharp corner.
    const again = await handles(page)
    await drag(page, again['0:0'], 40, -40)
    expect(await attr(page, 'q1', 'd')).toBe('M100,100 L300,100 L300,250 L100,250 L100,100 Z')
  })

  test('the Rectangle tool draws with the last radius; the arrows change it', async ({ page }) => {
    await load(page, '')
    const draw = async (x1, y1, x2, y2, keys = []) => {
      await page.keyboard.press('r')
      const a = await screenPoint(page, x1, y1)
      const b = await screenPoint(page, x2, y2)
      await page.mouse.move(a.x, a.y)
      await page.mouse.down()
      await page.mouse.move(b.x, b.y, { steps: 4 })
      for (const key of keys) await page.keyboard.press(key)
      await page.mouse.up()
      // The new rectangle is selected once it has faded in.
      await page.waitForFunction(() => {
        const rects = document.querySelectorAll('#svgcontent g.layer > rect')
        return window.svgEditor.svgCanvas.getSelectedElements()[0] === rects[rects.length - 1]
      })
      return page.evaluate(() => {
        const rects = document.querySelectorAll('#svgcontent g.layer > rect')
        return rects[rects.length - 1]?.getAttribute('rx') ?? null
      })
    }
    expect(await draw(100, 100, 300, 200, ['ArrowUp', 'ArrowUp', 'Shift+ArrowUp'])).toBe('12')
    expect(await draw(100, 250, 300, 330)).toBe('12')
    // No larger than the rectangle takes.
    expect(await draw(350, 250, 370, 270)).toBe('10')
    expect(await draw(400, 100, 500, 200, ['ArrowRight'])).toBe('50')
    expect(await draw(400, 300, 500, 400, ['ArrowLeft'])).toBeNull()
    expect(await draw(100, 400, 200, 450)).toBeNull()
  })

  test('the radius field gives the next rectangles their radius', async ({ page }) => {
    await load(page, '<rect id="r1" x="100" y="100" width="200" height="120"/>')
    await select(page, 'r1')
    await page.evaluate(() => window.svgEditor.svgCanvas.setRectRadius(7))
    expect(await attr(page, 'r1', 'rx')).toBe('7')
    await page.keyboard.press('r')
    const a = await screenPoint(page, 350, 300)
    const b = await screenPoint(page, 450, 400)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 4 })
    await page.mouse.up()
    expect(await page.evaluate(() => [...document.querySelectorAll('#svgcontent g.layer > rect')].map((r) => r.getAttribute('rx')))).toEqual(['7', '7'])
  })
})
