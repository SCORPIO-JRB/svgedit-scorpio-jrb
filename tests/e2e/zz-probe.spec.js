import { test } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Temporary probe: undo steps of a rotation from a corner zone (M5), Firefox.
const log = (name, value) => console.log(`PROBE ${name} ${JSON.stringify(value)}`)

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a"/>
  </g>
</svg>`

const stack = (page) => page.evaluate(() => {
  const u = window.svgEditor.svgCanvas.undoMgr
  return u.undoStack.slice(0, u.undoStackPointer).map((c) => ({ text: c.text, subs: (c.stack || []).map((s) => `${s.text}:${s.elem?.id}:${JSON.stringify(s.oldValues || {})}`) }))
})

test('rotation from a zone, undo steps', async ({ page }) => {
  page.on('pageerror', (err) => console.log(`PROBE pageerror ${err.message}`))
  await visitAndApproveStorage(page)
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
  await page.evaluate(() => {
    window.__events = []
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointercancel', 'dragstart']) {
      document.addEventListener(type, (e) => window.__events.push(`${type}:${e.target.id || e.target.tagName}:${e.button}:${e.detail}`), true)
    }
  })
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r2')], true))
  const box = await page.locator('#r2').boundingBox()
  const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const from = { x: box.x + box.width + 13, y: box.y - 13 }
  log('at', await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, from))
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 1, from.y + 1)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  log('after cancel', { stack: await stack(page), mode: await page.evaluate(() => window.svgEditor.svgCanvas.getMode()), events: await page.evaluate(() => window.__events.splice(0)) })
  const radius = Math.hypot(from.x - pivot.x, from.y - pivot.y)
  const start = Math.atan2(from.y - pivot.y, from.x - pivot.x)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  log('after down', { stack: await stack(page), mode: await page.evaluate(() => window.svgEditor.svgCanvas.getMode()) })
  for (let i = 1; i <= 8; i++) {
    const a = start + (40 * Math.PI / 180) * i / 8
    await page.mouse.move(pivot.x + radius * Math.cos(a), pivot.y + radius * Math.sin(a))
  }
  await page.mouse.up()
  log('after drag', { stack: await stack(page), r2: await page.evaluate(() => document.getElementById('r2').outerHTML), events: await page.evaluate(() => window.__events.splice(0)) })
})
