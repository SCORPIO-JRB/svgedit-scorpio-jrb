import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

/**
 * An imported file follows the pointer when it is moved or resized, as the
 * same drawing ungrouped does (9 November: a floor plan of 2 246 by 838,
 * imported, moved and resized "slightly wrong", and right once ungrouped).
 */

const NS = 'http://www.w3.org/2000/svg'
// As a floor plan exported by Illustrator: a view box only, a stylesheet,
// polygons, texts placed by their transform; the outline is stroked 5 wide
// from 2.5, so the drawing does not fill its view box exactly.
const PLAN = `<svg xmlns="${NS}" viewBox="0 0 2246.39 837.7"><defs><style>` +
  '.wall{fill:none;stroke:#333;stroke-width:5px}.room{fill:rgba(0,0,0,.1);stroke:#333;stroke-miterlimit:10}' +
  '.label{font-family:Arial;font-size:30px;fill:#333}</style></defs>' +
  '<g id="Calque_1-2"><polygon class="wall" points="356.24 2.5 2.5 2.5 2.5 835.2 392.24 835.2 392.24 752.24 2243.89 752.24 2243.89 2.5 356.24 2.5"/>' +
  '<rect class="room" x="1183.72" y="29.5" width="171.39" height="183.13"/>' +
  '<rect class="room" x="957.41" y="29.5" width="214.83" height="133.83"/>' +
  '<polygon class="room" points="374.37 29.5 23.37 29.5 23.37 243.93 268.72 243.93 295.72 270.93 374.37 270.93 374.37 29.5"/>' +
  '<rect class="room" x="609.02" y="227.24" width="208.96" height="138.25"/>' +
  '<polygon class="room" points="828.28 153.72 943.33 153.72 943.33 172.46 1172.24 172.46 1172.24 221.76 1874.76 221.76 1874.76 29.5 2225.37 29.5 2225.37 734.11 793.87 734.11 793.87 380.24 828.28 380.24 828.28 153.72"/>' +
  '<text class="label" transform="translate(1223.83 129.87)"><tspan x="0" y="0">C</tspan><tspan x="17.04" y="0">uisine</tspan></text>' +
  '<g><polyline class="room" points="431.38 160.98 431.38 130.46 417.29 130.46 417.29 29.5 502.99 29.5 502.99 128.11 488.9 128.11 488.9 160.98"/>' +
  '<text class="label" transform="translate(436.54 93.42)"><tspan x="0" y="0">Asc.</tspan></text></g>' +
  '<circle class="room" cx="733.64" cy="98.21" r="7.39"/></g></svg>'

/** Drops a file on the work area, as the user does, and waits for the import. */
const importPlan = async (page) => {
  await page.evaluate((text) => {
    const data = new DataTransfer()
    data.items.add(new File([text], 'plan.svg', { type: 'image/svg+xml' }))
    document.getElementById('workarea').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
  }, PLAN)
  await page.waitForFunction(() => document.querySelector('#svgcontent g.layer use'))
}

/**
 * The box of the selected object on the screen, from its geometry, and the
 * box of its selection frame: getBoundingClientRect() of a <use> is wrong
 * under Firefox.
 */
const boxes = (page) => page.evaluate(() => {
  const onScreen = (elem) => {
    const box = elem.getBBox()
    const matrix = elem.getScreenCTM()
    const points = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix))
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
  const elem = window.svgEditor.svgCanvas.getSelectedElements()[0]
  return { drawn: onScreen(elem), frame: onScreen(document.getElementById('selectedBox0')) }
})

/** A point of the screen where the selected object takes the pointer. */
const pointOn = (page) => page.evaluate(() => {
  const elem = window.svgEditor.svgCanvas.getSelectedElements()[0]
  const view = document.getElementById('workarea').getBoundingClientRect()
  const box = elem.getBBox()
  const matrix = elem.getScreenCTM()
  for (let fy = 0.1; fy < 0.9; fy += 0.02) {
    for (let fx = 0.05; fx < 0.95; fx += 0.01) {
      const { x, y } = new DOMPoint(box.x + box.width * fx, box.y + box.height * fy).matrixTransform(matrix)
      if (x < view.left + 120 || y < view.top + 120 || x > view.right - 120 || y > view.bottom - 120) continue
      const hit = document.elementFromPoint(x, y)
      if (hit === elem || elem.contains(hit)) return { x, y }
    }
  }
  return null
})

const grip = (page, dir) => page.evaluate((dir) => {
  const box = document.getElementById(`selectorGrip_resize_${dir}`).getBoundingClientRect()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}, dir)

/**
 * Drags from a point by dx, dy in steps; after each step, how far each edge
 * of the drawn box is from where the pointer puts it, and how far the frame
 * is from the drawn box (it is drawn one pixel outside).
 * @returns {Promise<number>} The largest distance, in pixels of the screen
 */
const drag = async (page, from, dx, dy, edges) => {
  const start = await boxes(page)
  const expected = (t) => start.drawn.map((value, i) => value + (edges[i] ? (i % 2 ? dy : dx) * t : 0))
  const OUTSIDE = [-1, -1, 1, 1]
  const offFrame = (now) => now.frame.map((value, i) => Math.abs(value - now.drawn[i] - OUTSIDE[i]))
  let worst = 0
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(from.x + dx * step / 10, from.y + dy * step / 10)
    // Past the 3 pixels a move waits for
    if (Math.hypot(dx, dy) * step / 10 < 4) continue
    const now = await boxes(page)
    const want = expected(step / 10)
    worst = Math.max(worst, ...now.drawn.map((value, i) => Math.abs(value - want[i])), ...offFrame(now))
  }
  await page.mouse.up()
  const end = await boxes(page)
  const want = expected(1)
  return Math.max(worst, ...end.drawn.map((value, i) => Math.abs(value - want[i])), ...offFrame(end))
}

// left, top, right, bottom
const MOVE = [1, 1, 1, 1]
const GRIPS = { se: [0, 0, 1, 1], nw: [1, 1, 0, 0], e: [0, 0, 1, 0], s: [0, 0, 0, 1] }

test.describe('Moving and resizing an import', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 1000 })
    await visitAndApproveStorage(page)
    // Nothing snaps: the object must follow the pointer exactly.
    await page.evaluate(() => window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false }))
  })

  for (const ungrouped of [false, true]) {
    test(`a large ${ungrouped ? 'drawing, ungrouped then grouped,' : 'import'} follows the pointer`, async ({ page }) => {
      await importPlan(page)
      if (ungrouped) {
        await page.evaluate(() => {
          const canvas = window.svgEditor.svgCanvas
          canvas.selectOnly([document.querySelector('#svgcontent g.layer use')])
          canvas.ungroupSelectedElement()
          canvas.groupSelectedElements()
        })
      }
      await page.evaluate(() => window.svgEditor.zoomChanged(window, 'selection'))
      // A click on it, as the user does, shows its grips
      const inside = await pointOn(page)
      await page.mouse.click(inside.x, inside.y)

      const facts = await page.evaluate(() => {
        const elem = window.svgEditor.svgCanvas.getSelectedElements()[0]
        const box = elem.getBBox()
        const rect = elem.getBoundingClientRect()
        return { tag: elem.tagName, zoom: window.svgEditor.svgCanvas.getZoom(), bbox: [box.x, box.y, box.width, box.height], rect: [rect.x, rect.y, rect.width, rect.height], transform: elem.getAttribute('transform') }
      })
      const errors = { start: await boxes(page) }
      errors.move = await drag(page, await pointOn(page), 60, 25, MOVE)
      for (const [dir, edges] of Object.entries(GRIPS)) {
        const from = await grip(page, dir)
        errors[dir] = await drag(page, from, edges[0] || edges[2] ? -40 : 0, edges[1] || edges[3] ? -30 : 0, edges)
      }
      errors.moveAfter = await drag(page, await pointOn(page), -50, 40, MOVE)
      console.log(JSON.stringify({ ungrouped, facts, errors }))
      for (const name of ['move', ...Object.keys(GRIPS), 'moveAfter']) {
        expect(errors[name], name).toBeLessThan(0.75)
      }
    })
  }
})
