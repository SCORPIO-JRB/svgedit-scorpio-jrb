import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, screenPoint, chooseTool } from './helpers.js'

// Lot Plume: the pen on a path, as in Illustrator. Chosen with a path or a
// shape selected, it shows its nodes; a click deletes a node (a minus by the
// pen), adds one on a side (a plus), goes on from an end, or starts a new path
// elsewhere; Alt bends a side, with two handles. A shape becomes a path at its
// first change, in the same undo step.

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

const TRIANGLE = '<path id="t" d="M200,100 L320,300 L80,300 Z" fill="#fff" stroke="#000"/>'
const RECT = '<rect id="r" x="100" y="100" width="200" height="120" fill="#fff" stroke="#000"/>'

const select = (page, id) => page.evaluate((id) =>
  window.svgEditor.svgCanvas.selectOnly([document.getElementById(id)], true), id)
const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
const tag = (page, id) => page.evaluate((id) => document.getElementById(id)?.tagName ?? null, id)
const d = (page, id) => page.evaluate((id) => document.getElementById(id)?.getAttribute('d') ?? null, id)
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const pressedTool = (page) => page.evaluate(() =>
  ['tool_select', 'tool_path'].filter((id) => document.getElementById(id)?.pressed))
const cursor = (page) => page.evaluate(() => document.getElementById('svgcanvas').dataset.pen ?? null)
const segTypes = (page, id) => page.evaluate((id) =>
  (document.getElementById(id).getAttribute('d').match(/[MLCQAZ]/gi) || []).join('').toUpperCase(), id)

/** The nodes of a path, as the grips of node editing show them. */
const nodeCount = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#pathpointgrip_container .se-node')]
    .filter((g) => g.getAttribute('display') !== 'none').length)

const moveTo = async (page, x, y) => {
  const p = await screenPoint(page, x, y)
  await page.mouse.move(p.x - 1, p.y)
  await page.mouse.move(p.x, p.y)
}
const clickAt = async (page, x, y) => {
  const p = await screenPoint(page, x, y)
  await page.mouse.click(p.x, p.y)
}
/** Drags from a point of the drawing by a vector of the screen, keys held. */
const dragAt = async (page, x, y, dx, dy, modifiers = [], { release = true } = {}) => {
  const p = await screenPoint(page, x, y)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.mouse.move(p.x + dx / 2, p.y + dy / 2)
  await page.mouse.move(p.x + dx, p.y + dy)
  if (!release) return
  await page.mouse.up()
  for (const key of [...modifiers].reverse()) await page.keyboard.up(key)
}

const undoName = async (page) => {
  await page.locator('#se-zoom-button').click()
  await expect(page.locator('#se-zoom-menu')).toHaveAttribute('open', '')
  const text = await page.locator('#se-zoom-menu [data-command="tool_undo"] span').textContent()
  await page.keyboard.press('Escape')
  // The zoom button keeps the focus, and its keys: Ctrl+Z goes to the drawing.
  await page.evaluate(() => document.activeElement?.blur?.())
  return text
}

test.describe('The pen on a path', () => {
  test('chosen with a path selected, it edits its nodes and stays the tool', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    expect(await mode(page)).toBe('pathedit')
    expect(await nodeCount(page)).toBe(3)
    expect(await pressedTool(page)).toEqual(['tool_path'])
    // No node selected: a click works on the node or side under the pen.
    expect(await page.locator('#pathpointgrip_container .se-node-selected').count()).toBe(0)
  })

  test('the cursor says what a click does: minus on a node, plus on a side, the bend with Alt', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    await moveTo(page, 200, 100)
    expect(await cursor(page)).toBe('remove')
    await moveTo(page, 260, 200)
    expect(await cursor(page)).toBe('add')
    // Alt pressed and released with the pointer still.
    await page.keyboard.down('Alt')
    await expect.poll(() => cursor(page)).toBe('bend')
    await page.keyboard.up('Alt')
    await expect.poll(() => cursor(page)).toBe('add')
    await moveTo(page, 500, 400)
    expect(await cursor(page)).toBe('draw')
    // The workarea shows the pen's cursor.
    const style = await page.evaluate(() => getComputedStyle(document.querySelector('#svgcontent')).cursor)
    expect(style).toContain('data:image/svg+xml')
  })

  test('a click on a side adds a node, the shape unchanged; on a node, deletes it', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 300)
    expect(await nodeCount(page)).toBe(4)
    expect(await d(page, 't')).toBe('M200,100 L320,300 L200,300 L80,300 L200,100 Z')
    expect(await undoName(page)).toBe('Undo: Add a point')
    await clickAt(page, 200, 100)
    expect(await nodeCount(page)).toBe(3)
    expect(await undoName(page)).toBe('Undo: Delete points')
    expect(await steps(page)).toBe(2)
    expect(await mode(page)).toBe('pathedit')
    // An undo keeps the pen, on the same path.
    await page.keyboard.press('Control+z')
    expect(await mode(page)).toBe('pathedit')
    expect(await nodeCount(page)).toBe(4)
    expect(await pressedTool(page)).toEqual(['tool_path'])
  })

  test('Alt and a drag bend a side through the pointer, in one undo step', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    await dragAt(page, 200, 300, 0, 60, ['Alt'])
    expect(await segTypes(page, 't')).toBe('MLCLZ')
    // The curve goes through the point the pointer took it to.
    const gap = await page.evaluate(() => {
      const path = document.getElementById('t')
      const len = path.getTotalLength()
      let best = Infinity
      for (let i = 0; i <= 400; i++) {
        const q = path.getPointAtLength((len * i) / 400)
        best = Math.min(best, Math.hypot(q.x - 200, q.y - 360))
      }
      return best
    })
    expect(gap).toBeLessThan(1.5)
    // Its two handles show.
    const handles = await page.evaluate(() => [...document.querySelectorAll('#pathpointgrip_container .se-node-handle')]
      .filter((g) => g.getAttribute('display') !== 'none').length)
    expect(handles).toBe(2)
    expect(await steps(page)).toBe(1)
    expect(await undoName(page)).toBe('Undo: Bend the side')
    await page.keyboard.press('Control+z')
    expect(await segTypes(page, 't')).toBe('MLLLZ')
  })

  test('Alt and a click make a side a curve, its course kept, with its two handles', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    await moveTo(page, 200, 300)
    await page.keyboard.down('Alt')
    await clickAt(page, 200, 300)
    await page.keyboard.up('Alt')
    expect(await d(page, 't')).toBe('M200,100 L320,300 C240,300 160,300 80,300 L200,100 Z')
    const handles = await page.evaluate(() => [...document.querySelectorAll('#pathpointgrip_container .se-node-handle')]
      .filter((g) => g.getAttribute('display') !== 'none').length)
    expect(handles).toBe(2)
    expect(await steps(page)).toBe(1)
    expect(await undoName(page)).toBe('Undo: Bend the side')
    // A side already curved: nothing more.
    await page.keyboard.down('Alt')
    await clickAt(page, 200, 300)
    await page.keyboard.up('Alt')
    expect(await steps(page)).toBe(1)
  })

  test('Escape during the bend puts the side back', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    const before = await d(page, 't')
    await dragAt(page, 200, 300, 0, 60, ['Alt'], { release: false })
    await page.keyboard.press('Escape')
    await page.mouse.up()
    await page.keyboard.up('Alt')
    expect(await d(page, 't')).toBe(before)
    expect(await steps(page)).toBe(0)
  })

  test('a click elsewhere starts a new path; Escape leaves the nodes, the pen kept', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 500, 100)
    expect(await mode(page)).toBe('path')
    await clickAt(page, 560, 200)
    await clickAt(page, 560, 200)
    await page.waitForTimeout(300)
    const paths = await page.evaluate(() => document.querySelectorAll('#svgcontent path').length)
    expect(paths).toBe(2)
    // The new path is edited with the pen; Escape leaves it, the pen stays.
    expect(await mode(page)).toBe('pathedit')
    await page.keyboard.press('Escape')
    expect(await mode(page)).toBe('path')
    expect(await pressedTool(page)).toEqual(['tool_path'])
  })

  test('a click on the end of an open path goes on from it', async ({ page }) => {
    await load(page, '<path id="o" d="M100,100 L200,100 L250,150" fill="none" stroke="#000"/>')
    await select(page, 'o')
    await chooseTool(page, 'tool_path')
    await moveTo(page, 250, 150)
    expect(await cursor(page)).toBe('draw')
    await clickAt(page, 250, 150)
    await clickAt(page, 250, 250)
    await clickAt(page, 250, 250)
    expect(await d(page, 'o')).toBe('M100,100 L200,100 L250,150 L250,250')
    expect(await undoName(page)).toBe('Undo: Extend the path')
  })

  test('deleting the nodes of a path down to none removes it, the pen kept', async ({ page }) => {
    await load(page, TRIANGLE)
    await select(page, 't')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 100)
    await clickAt(page, 320, 300)
    expect(await tag(page, 't')).toBeNull()
    expect(await mode(page)).toBe('path')
    expect(await pressedTool(page)).toEqual(['tool_path'])
    await page.keyboard.press('Control+z')
    expect(await tag(page, 't')).toBe('path')
  })
})

test.describe('The pen on a shape', () => {
  test('chosen with a rectangle selected, it shows its nodes, the rectangle unchanged', async ({ page }) => {
    await load(page, RECT)
    await select(page, 'r')
    await chooseTool(page, 'tool_path')
    expect(await mode(page)).toBe('path')
    expect(await page.locator('#pen_shape_nodes .se-node').count()).toBe(4)
    expect(await tag(page, 'r')).toBe('rect')
    await moveTo(page, 100, 100)
    expect(await cursor(page)).toBe('remove')
    await moveTo(page, 200, 220)
    expect(await cursor(page)).toBe('add')
    // A click elsewhere draws a new path, the rectangle left as it is.
    await clickAt(page, 500, 400)
    expect(await page.locator('#pen_shape_nodes').count()).toBe(0)
    expect(await tag(page, 'r')).toBe('rect')
  })

  test('Alt and a drag bend a side of the rectangle: a path, in one undo step', async ({ page }) => {
    await load(page, RECT)
    await select(page, 'r')
    await chooseTool(page, 'tool_path')
    await dragAt(page, 200, 220, 0, 50, ['Alt'])
    expect(await tag(page, 'r')).toBe('path')
    expect(await segTypes(page, 'r')).toBe('MLLCLZ')
    expect(await mode(page)).toBe('pathedit')
    expect(await steps(page)).toBe(1)
    expect(await undoName(page)).toBe('Undo: Bend the side')
    // Undone, the rectangle is back, its nodes shown by the pen.
    await page.keyboard.press('Control+z')
    expect(await tag(page, 'r')).toBe('rect')
    expect(await page.locator('#pen_shape_nodes .se-node').count()).toBe(4)
    await page.keyboard.press('Control+y')
    expect(await tag(page, 'r')).toBe('path')
  })

  test('a click on a corner of an ellipse or a side of a polygon makes a path', async ({ page }) => {
    await load(page, '<polygon id="p" points="200,80 320,300 80,300" fill="#cfc" stroke="#060"/>')
    await select(page, 'p')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 300)
    expect(await tag(page, 'p')).toBe('path')
    expect(await nodeCount(page)).toBe(4)
    expect(await steps(page)).toBe(1)
    expect(await undoName(page)).toBe('Undo: Add a point')

    await load(page, '<ellipse id="e" cx="200" cy="200" rx="100" ry="60" fill="#fcf" stroke="#606"/>')
    await select(page, 'e')
    await chooseTool(page, 'tool_select')
    await select(page, 'e')
    await chooseTool(page, 'tool_path')
    expect(await page.locator('#pen_shape_nodes .se-node').count()).toBe(4)
    await clickAt(page, 300, 200)
    expect(await tag(page, 'e')).toBe('path')
    expect(await nodeCount(page)).toBe(3)
    expect(await undoName(page)).toBe('Undo: Delete points')
  })
})
