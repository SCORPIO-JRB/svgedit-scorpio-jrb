import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, setSvgSource, screenPoint, chooseTool } from './helpers.js'

// Lot Chemins: the operations on the points of a path, as Vecta has them
// (vecta.io/help/basic-shape-operations): move points (Shift or Ctrl+click,
// drag, arrows), extend or join paths with the pen, add a point with
// Alt+click, delete points with Delete.

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

const load = async (page, body) => {
  await setSvgSource(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <g class="layer"><title>Layer 1</title>${body}</g></svg>`)
}

/** Nodes of a path, rounded, Z as such; null when it is gone. */
const nodes = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id)
  if (!el) return null
  const list = el.pathSegList
  const out = []
  for (let i = 0; i < list.numberOfItems; i++) {
    const s = list.getItem(i)
    out.push(s.pathSegType === 1 ? 'Z' : [Math.round(s.x), Math.round(s.y)])
  }
  return out
}, id)

const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
const selectedNodes = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getPathObj().selected_pts)
const paths = (page) => page.evaluate(() => [...document.querySelectorAll('#svgcontent g.layer > path')].map((p) => p.id))

/** Clicks a point of the drawing, with modifier keys held. */
const clickAt = async (page, x, y, modifiers = []) => {
  const p = await screenPoint(page, x, y)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(p.x, p.y)
  for (const key of modifiers.reverse()) await page.keyboard.up(key)
}

const dragFrom = async (page, from, to, modifiers = []) => {
  const a = await screenPoint(page, ...from)
  const b = await screenPoint(page, ...to)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2)
  await page.mouse.move(b.x, b.y)
  await page.mouse.up()
  for (const key of modifiers.reverse()) await page.keyboard.up(key)
}

const editNodes = async (page, id) => {
  await page.evaluate((id) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(id)], true), id)
  await page.keyboard.press('Enter')
  expect(await mode(page)).toBe('pathedit')
}

const undo = (page) => page.keyboard.press('Control+z')

const OPEN = '<path id="p1" d="M100,100 L200,100 L200,200 L100,200" fill="none" stroke="#000" stroke-width="2"/>'

test.describe('Moving path points', () => {
  test('Shift or Ctrl+click adds a point to the selection, and a drag moves them all', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await clickAt(page, 200, 100)
    await clickAt(page, 200, 200, ['Control'])
    expect(await selectedNodes(page)).toEqual([1, 2])
    await clickAt(page, 100, 200, ['Shift'])
    expect(await selectedNodes(page)).toEqual([1, 2, 3])
    // Ctrl+click again takes it out.
    await clickAt(page, 100, 200, ['Control'])
    expect(await selectedNodes(page)).toEqual([1, 2])
    // The selected points are filled with the blue of the selection; the
    // pointer leaves the last one clicked, which it would colour as hovered.
    await page.mouse.move(5, 5)
    const readFills = () => page.evaluate(() => [0, 1, 2, 3].map((i) =>
      getComputedStyle(document.getElementById(`pathpointgrip_${i}`)).fill))
    await expect.poll(async () => { const f = await readFills(); return f[0] === f[3] }).toBe(true)
    const fills = await readFills()
    expect(fills[1]).toBe(fills[2])
    expect(fills[0]).not.toBe(fills[1])

    await dragFrom(page, [200, 200], [230, 240])
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [230, 140], [230, 240], [100, 200]])
    await undo(page)
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 100], [200, 200], [100, 200]])
  })

  test('the arrows move the selected points, in one undo step', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await clickAt(page, 200, 100)
    await clickAt(page, 200, 200, ['Control'])
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    // One grid step each, ten with Shift.
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [220, 200], [220, 300], [100, 200]])
    expect(await mode(page)).toBe('pathedit')
    await undo(page)
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 100], [200, 200], [100, 200]])
  })

  test('a rubber band with Ctrl adds to the points already selected', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await clickAt(page, 100, 100)
    await dragFrom(page, [180, 180], [220, 220], ['Control'])
    expect(await selectedNodes(page)).toEqual([0, 2])
  })
})

test.describe('Deleting path points', () => {
  test('Delete removes the selected points, Backspace as well', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await clickAt(page, 200, 100)
    await clickAt(page, 200, 200, ['Shift'])
    await page.keyboard.press('Delete')
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [100, 200]])
    expect(await mode(page)).toBe('pathedit')
    await undo(page)
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 100], [200, 200], [100, 200]])
  })

  test('in a closed path, the path stays closed', async ({ page }) => {
    await load(page, '<path id="p1" d="M100,100 L200,100 L200,200 L100,200 Z" fill="#ccc" stroke="#000"/>')
    await editNodes(page, 'p1')
    await clickAt(page, 200, 100)
    await page.keyboard.press('Backspace')
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 200], [100, 200], [100, 100], 'Z'])
  })

  test('with ten points or more, the selected ones and only them', async ({ page }) => {
    const pts = Array.from({ length: 12 }, (_, i) => `${100 + i * 30},${i % 2 ? 100 : 150}`)
    await load(page, `<path id="p1" d="M${pts.join(' L')}" fill="none" stroke="#000"/>`)
    await editNodes(page, 'p1')
    // Nodes 2, 9 and 10: sorted as text, 10 came before 2.
    await clickAt(page, 160, 150)
    await clickAt(page, 370, 100, ['Control'])
    await clickAt(page, 400, 150, ['Control'])
    expect(await selectedNodes(page)).toEqual([2, 9, 10])
    await page.keyboard.press('Delete')
    const left = (await nodes(page, 'p1')).map(([x]) => x)
    expect(left).toEqual([100, 130, 190, 220, 250, 280, 310, 340, 430])
  })
})

test.describe('Adding path points', () => {
  test('Alt+click on the outline adds a point there, the shape unchanged', async ({ page }) => {
    await load(page, '<path id="p1" d="M100,300 C100,100 300,100 300,300" fill="none" stroke="#000" stroke-width="2"/>')
    const length = () => page.evaluate(() => document.getElementById('p1').getTotalLength())
    const before = await length()
    await editNodes(page, 'p1')
    // The top of the curve.
    await clickAt(page, 200, 150, ['Alt'])
    const after = await nodes(page, 'p1')
    expect(after).toEqual([[100, 300], [200, 150], [300, 300]])
    expect(Math.abs(await length() - before)).toBeLessThan(0.5)
    // The new point is the one selected.
    expect(await selectedNodes(page)).toEqual([1])
    await undo(page)
    expect(await nodes(page, 'p1')).toEqual([[100, 300], [300, 300]])
  })

  test('Alt+click on a selected path edits its points and adds one', async ({ page }) => {
    await load(page, OPEN)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('p1')], true))
    // Not in the middle of the edge: the grip of the selection box is there.
    await clickAt(page, 130, 100, ['Alt'])
    expect(await mode(page)).toBe('pathedit')
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [130, 100], [200, 100], [200, 200], [100, 200]])
  })

  test('Alt+drag adds a point and moves it, in one undo step', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await dragFrom(page, [200, 150], [250, 150], ['Alt'])
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 100], [250, 150], [200, 200], [100, 200]])
    await undo(page)
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 100], [200, 200], [100, 200]])
  })

  test('Alt+click away from the outline adds nothing', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await clickAt(page, 150, 150, ['Alt'])
    expect(await nodes(page, 'p1')).toEqual([[100, 100], [200, 100], [200, 200], [100, 200]])
  })
})

test.describe('Extending or joining paths', () => {
  const LINES = '<path id="a" d="M100,100 L200,100" fill="none" stroke="#000" stroke-width="2"/>' +
    '<path id="b" d="M300,100 L400,100" fill="none" stroke="#f00" stroke-width="4"/>'

  test('the pen shows the end of an open path under it', async ({ page }) => {
    await load(page, LINES)
    await chooseTool(page, 'tool_path')
    const p = await screenPoint(page, 201, 101)
    await page.mouse.move(p.x, p.y)
    const hint = page.locator('#path_end_hint')
    await expect(hint).toBeVisible()
    const far = await screenPoint(page, 150, 200)
    await page.mouse.move(far.x, far.y)
    await expect(hint).toBeHidden()
  })

  test('drawing from the end of a path extends it, in one undo step', async ({ page }) => {
    await load(page, LINES)
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 100)
    await clickAt(page, 200, 200)
    await clickAt(page, 150, 250)
    // A click on the last point ends the drawing.
    await clickAt(page, 150, 250)
    expect(await nodes(page, 'a')).toEqual([[100, 100], [200, 100], [200, 200], [150, 250]])
    expect(await paths(page)).toEqual(['a', 'b'])
    expect(await mode(page)).toBe('pathedit')
    await page.keyboard.press('Escape')
    await undo(page)
    expect(await nodes(page, 'a')).toEqual([[100, 100], [200, 100]])
    expect(await paths(page)).toEqual(['a', 'b'])
  })

  test('drawing from the start of a path comes before it, the path keeping its direction', async ({ page }) => {
    await load(page, LINES)
    await chooseTool(page, 'tool_path')
    await clickAt(page, 100, 100)
    await clickAt(page, 100, 200)
    await clickAt(page, 100, 200)
    expect(await nodes(page, 'a')).toEqual([[100, 200], [100, 100], [200, 100]])
  })

  test('ending on the end of another path joins the two', async ({ page }) => {
    await load(page, LINES)
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 100)
    await clickAt(page, 250, 150)
    await clickAt(page, 300, 100)
    expect(await nodes(page, 'a')).toEqual([[100, 100], [200, 100], [250, 150], [300, 100], [400, 100]])
    // The first path keeps its style; the second is gone.
    expect(await paths(page)).toEqual(['a'])
    expect(await page.evaluate(() => document.getElementById('a').getAttribute('stroke'))).toBe('#000')
    await page.keyboard.press('Escape')
    await undo(page)
    expect(await paths(page)).toEqual(['a', 'b'])
    expect(await nodes(page, 'b')).toEqual([[300, 100], [400, 100]])
    expect(await nodes(page, 'a')).toEqual([[100, 100], [200, 100]])
  })

  test('a new drawing ending on the end of a path joins it', async ({ page }) => {
    await load(page, LINES)
    await chooseTool(page, 'tool_path')
    await clickAt(page, 250, 250)
    await clickAt(page, 400, 100)
    // b keeps its direction: the drawing comes after it, run backwards.
    expect(await nodes(page, 'b')).toEqual([[300, 100], [400, 100], [250, 250]])
    expect(await paths(page)).toEqual(['a', 'b'])
  })

  test('ending on the other end of the same path closes it', async ({ page }) => {
    await load(page, '<path id="a" d="M100,100 L200,100 L200,200" fill="none" stroke="#000"/>')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 200)
    await clickAt(page, 100, 200)
    await clickAt(page, 100, 100)
    expect(await nodes(page, 'a')).toEqual([[100, 100], [200, 100], [200, 200], [100, 200], [100, 100], 'Z'])
  })

  test('a closed path is not extended', async ({ page }) => {
    await load(page, '<path id="c" d="M100,100 L200,100 L200,200 Z" fill="none" stroke="#000"/>')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 200, 200)
    await clickAt(page, 300, 300)
    await clickAt(page, 300, 300)
    expect((await paths(page)).length).toBe(2)
    expect(await nodes(page, 'c')).toEqual([[100, 100], [200, 100], [200, 200], [100, 100], 'Z'])
  })

  for (const [what, attribute] of [['locked', 'se:locked="true"'], ['connector', 'se:connector="r1 r2"']]) {
    test(`a ${what} path is not extended`, async ({ page }) => {
      await setSvgSource(page, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480">
        <g class="layer"><title>Layer 1</title>
        <path id="a" ${attribute} d="M100,100 L200,100" fill="none" stroke="#000"/></g></svg>`)
      await chooseTool(page, 'tool_path')
      await clickAt(page, 200, 100)
      await clickAt(page, 300, 200)
      await clickAt(page, 300, 200)
      expect(await nodes(page, 'a')).toEqual([[100, 100], [200, 100]])
      expect((await paths(page)).length).toBe(2)
    })
  }
})

test.describe('Drawing with the pen', () => {
  /** The drawing in progress, its nodes rounded; null when there is none. */
  const drawing = (page) => page.evaluate(() => {
    const el = window.svgEditor.svgCanvas.getDrawnPath()
    if (!el) return null
    const list = el.pathSegList
    const out = []
    for (let i = 0; i < list.numberOfItems; i++) {
      const s = list.getItem(i)
      out.push([s.pathSegType === 4 || s.pathSegType === 2 ? 'L' : 'C', Math.round(s.x), Math.round(s.y)])
    }
    return out
  })
  const historySize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

  test('Ctrl+Z takes back the last point, Ctrl+Y puts it back, the history untouched', async ({ page }) => {
    await load(page, OPEN)
    const before = await historySize(page)
    await chooseTool(page, 'tool_path')
    await clickAt(page, 300, 300)
    await clickAt(page, 400, 300)
    await clickAt(page, 400, 400)
    await undo(page)
    expect(await drawing(page)).toEqual([['L', 300, 300], ['L', 400, 300]])
    await page.keyboard.press('Control+y')
    expect(await drawing(page)).toEqual([['L', 300, 300], ['L', 400, 300], ['L', 400, 400]])
    await undo(page)
    await undo(page)
    // Back to its first point, then the drawing is given up.
    expect(await drawing(page)).toEqual([['L', 300, 300]])
    await undo(page)
    expect(await drawing(page)).toBeNull()
    expect(await mode(page)).toBe('path')
    expect(await historySize(page)).toBe(before)
    expect(await paths(page)).toEqual(['p1'])
    // The pen draws again at once.
    await clickAt(page, 300, 300)
    await clickAt(page, 350, 350)
    expect(await drawing(page)).toEqual([['L', 300, 300], ['L', 350, 350]])
  })

  test('Ctrl+Z works while drawing an empty document, and only then reaches the history', async ({ page }) => {
    await load(page, '')
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.resetUndoStack())
    await chooseTool(page, 'tool_path')
    await clickAt(page, 100, 100)
    await clickAt(page, 200, 100)
    await undo(page)
    expect(await drawing(page)).toEqual([['L', 100, 100]])
    await undo(page)
    expect(await drawing(page)).toBeNull()
    expect(await paths(page)).toEqual([])
  })

  test('the history menu while drawing gives the drawing up, without error', async ({ page }) => {
    await load(page, '')
    await chooseTool(page, 'tool_rect')
    await dragFrom(page, [50, 50], [120, 120])
    await expect.poll(() => historySize(page)).toBeGreaterThan(0)
    await chooseTool(page, 'tool_path')
    await clickAt(page, 300, 300)
    await clickAt(page, 400, 300)
    await page.evaluate(() => window.svgEditor.topPanel.goToHistory(0))
    expect(await drawing(page)).toBeNull()
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent g.layer > :not(title)').length)).toBe(0)
  })

  test('the pen chosen right after drawing a shape leaves the shape alone', async ({ page }) => {
    await load(page, '')
    await chooseTool(page, 'tool_rect')
    await dragFrom(page, [50, 50], [120, 120])
    // Before the end of its fade in: the shape went to node editing, and
    // threw, being no path.
    await chooseTool(page, 'tool_path')
    await page.waitForTimeout(400)
    expect(await mode(page)).toBe('path')
    await clickAt(page, 300, 300)
    await clickAt(page, 400, 300)
    expect(await drawing(page)).toEqual([['L', 300, 300], ['L', 400, 300]])
  })

  test('a slight move during a click leaves the segment straight, Shift kept', async ({ page }) => {
    await load(page, '')
    await chooseTool(page, 'tool_path')
    await clickAt(page, 100, 300)
    // Shift, the pointer a little off the horizontal, and shaking 3 px
    // while the button is down.
    const a = await screenPoint(page, 250, 308)
    await page.keyboard.down('Shift')
    await page.mouse.move(a.x, a.y, { steps: 3 })
    const line = await page.evaluate(() => document.getElementById('path_stretch_line').getAttribute('d'))
    expect(line).toMatch(/^M ?100 300 L ?250\.?\d* 300$/)
    await page.mouse.down()
    await page.mouse.move(a.x + 2, a.y + 2, { steps: 2 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    // Without Shift, a shake is not a curve either.
    const b = await screenPoint(page, 250, 400)
    await page.mouse.move(b.x, b.y)
    await page.mouse.down()
    await page.mouse.move(b.x - 2, b.y + 1, { steps: 2 })
    await page.mouse.up()
    expect(await drawing(page)).toEqual([['L', 100, 300], ['L', 250, 300], ['L', 250, 400]])
    // A real drag still pulls the handles of a curve.
    await dragFrom(page, [400, 400], [450, 450])
    expect((await drawing(page))[3][0]).toBe('C')
  })
})

test.describe('Look of the nodes', () => {
  test('no segment is outlined, and a click on the stroke keeps editing the nodes', async ({ page }) => {
    await load(page, OPEN)
    await editNodes(page, 'p1')
    await clickAt(page, 200, 100)
    expect(await selectedNodes(page)).toEqual([1])
    expect(await page.evaluate(() => [...document.querySelectorAll('[id^=segline_]')]
      .filter((l) => l.getAttribute('display') !== 'none').length)).toBe(0)
    // The selected node is the only one filled, and drawn as a node.
    const look = await page.evaluate(() => [0, 1].map((i) => {
      const grip = document.getElementById(`pathpointgrip_${i}`)
      return { fill: getComputedStyle(grip).fill, node: grip.classList.contains('se-node') }
    }))
    expect(look[0].node && look[1].node).toBe(true)
    expect(look[0].fill).not.toBe(look[1].fill)
    // On the stroke, between two nodes: still editing, nothing selected.
    await clickAt(page, 200, 150)
    expect(await mode(page)).toBe('pathedit')
    expect(await selectedNodes(page)).toEqual([])
    // Beside it, the editing ends.
    await clickAt(page, 400, 400)
    expect(await mode(page)).toBe('select')
  })
})
