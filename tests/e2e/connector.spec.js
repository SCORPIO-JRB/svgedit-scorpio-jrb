import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Connector extension: a line joined to two objects that follows them.
// Before the fix, drawing one failed half-way and left in the drawing a line
// with no "se:connector" attribute, on which every later click failed.

const SE_NS = 'http://svg-edit.googlecode.com'

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="50" y="50" width="80" height="60" fill="#c00"/>
    <rect id="r2" x="300" y="200" width="80" height="60" fill="#00c"/>
    <rect id="r3" x="420" y="50" width="80" height="60" fill="#0c0"/>
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

const centerOf = (page, id) => page.evaluate((id) => {
  const box = document.getElementById(id).getBoundingClientRect()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}, id)

async function clickOn (page, id) {
  const point = await centerOf(page, id)
  await page.mouse.click(point.x, point.y)
}

async function dragBetween (page, from, to) {
  const a = await centerOf(page, from)
  const b = await centerOf(page, to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
}

// The lines of the drawing: id, joined objects, points.
const lines = (page) => page.evaluate((ns) => Array.from(
  document.querySelectorAll('#svgcontent polyline, #svgcontent line')
).map((line) => ({
  id: line.id,
  connector: line.getAttributeNS(ns, 'connector'),
  points: line.getAttribute('points')
})), SE_NS)

// The end points of a connector, rounded.
const ends = (page, id) => page.evaluate((id) => {
  const { points } = document.getElementById(id)
  const first = points.getItem(0)
  const last = points.getItem(points.numberOfItems - 1)
  return [first.x, first.y, last.x, last.y].map(Math.round)
}, id)

test.describe('Connector extension', () => {
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

  test('draws a connector by dragging, then a click selects an object', async ({ page }) => {
    await page.click('#tool_connect')
    await dragBetween(page, 'r1', 'r2')
    const [line] = await lines(page)
    expect(line.connector).toBe('r1 r2')
    // On the edge of each rectangle, not at their centres.
    expect(await ends(page, line.id)).toEqual([130, 104, 300, 206])
    await page.click('#tool_select')
    await clickOn(page, 'r3')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()[0]?.id)).toBe('r3')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toContain('se:connector="r1 r2"')
  })

  test('draws a connector by two clicks', async ({ page }) => {
    await page.click('#tool_connect')
    await clickOn(page, 'r1')
    const target = await centerOf(page, 'r3')
    await page.mouse.move(target.x, target.y, { steps: 5 })
    await page.mouse.click(target.x, target.y)
    expect((await lines(page)).map((line) => line.connector)).toEqual(['r1 r3'])
    await page.click('#tool_select')
    await clickOn(page, 'r2')
  })

  test('follows a moved object, and goes back with it on undo', async ({ page }) => {
    await page.click('#tool_connect')
    await dragBetween(page, 'r1', 'r2')
    const [{ id }] = await lines(page)
    const before = await ends(page, id)
    await page.click('#tool_select')
    await clickOn(page, 'r2')
    const start = await centerOf(page, 'r2')
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60, start.y + 40, { steps: 6 })
    await page.mouse.up()
    expect(await page.evaluate(() => document.getElementById('r2').getAttribute('x'))).toBe('360')
    expect((await ends(page, id)).slice(2)).toEqual([360, 245])
    await page.keyboard.press('Control+z')
    expect(await page.evaluate(() => document.getElementById('r2').getAttribute('x'))).toBe('300')
    expect(await ends(page, id)).toEqual(before)
  })

  test('deleting a joined object keeps the connector for an undo', async ({ page }) => {
    await page.click('#tool_connect')
    await dragBetween(page, 'r1', 'r3')
    await page.click('#tool_select')
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('r3')])
      canvas.deleteSelectedElements()
    })
    await clickOn(page, 'r1')
    expect((await lines(page)).map((line) => line.connector)).toEqual(['r1 r3'])
    await page.keyboard.press('Control+z')
    expect(await page.evaluate(() => Boolean(document.getElementById('r3')))).toBe(true)
    await clickOn(page, 'r3')
  })

  test('an object named conn_… is not taken for a connector', async ({ page }) => {
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <g class="layer"><title>Layer 1</title>
        <rect id="r1" x="50" y="50" width="80" height="60" fill="#c00"/>
        <line id="conn_a" x1="200" y1="300" x2="400" y2="350" stroke="#000" stroke-width="4"/>
      </g>
    </svg>`)
    await clickOn(page, 'r1')
    await page.evaluate(() => window.svgEditor.svgCanvas.selectAllInCurrentLayer())
    await page.evaluate(() => window.svgEditor.svgCanvas.groupSelectedElements())
    // Grouped with the rectangle, kept as it was.
    expect(await page.evaluate(() => document.getElementById('conn_a').parentNode.tagName)).toBe('g')
    expect(await page.evaluate(() => document.getElementById('conn_a').getAttribute('x2'))).toBe('400')
  })

  test('opens a drawing whose connector lost an object', async ({ page }) => {
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="${SE_NS}" width="640" height="480">
      <g class="layer"><title>Layer 1</title>
        <rect id="r1" x="50" y="50" width="80" height="60" fill="#c00"/>
        <polyline id="conn_9" se:connector="r1 gone" points="130,80 200,150 300,230" stroke="#000" fill="none"/>
      </g>
    </svg>`)
    await clickOn(page, 'r1')
    expect((await lines(page))[0]).toEqual({ id: 'conn_9', connector: 'r1 gone', points: '130,80 200,150 300,230' })
  })
})
