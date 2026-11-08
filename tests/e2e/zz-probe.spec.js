import { test } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Temporary probe: values behind the Firefox failures, printed for both browsers.

const log = (name, value) => console.log(`PROBE ${name} ${JSON.stringify(value)}`)

async function load (page, svg) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => console.log(`PROBE pageerror ${err.message}`))
  await visitAndApproveStorage(page)
})

test('rotated rect, scaleSelectedElements', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60"/>
    <rect id="rr" x="400" y="300" width="80" height="40" fill="#a63" transform="rotate(30 440 320)"/></g></svg>`)
  log('rr loaded', await page.evaluate(() => {
    const el = document.getElementById('rr')
    const t = el.transform.baseVal
    return { html: el.outerHTML, n: t.numberOfItems, items: [...Array(t.numberOfItems)].map((_, i) => ({ type: t.getItem(i).type, angle: t.getItem(i).angle })), angle: window.svgEditor.svgCanvas.getRotationAngle(el), bbox: (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBBox()) }
  }))
  log('rr scaled', await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    c.selectOnly([document.getElementById('rr'), document.getElementById('r1')], true)
    c.scaleSelectedElements(2, 1, 0, 0)
    return document.getElementById('rr').outerHTML
  }))
  log('rr direct', await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    c.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title><rect id="q" x="400" y="300" width="80" height="40" transform="rotate(30 440 320)"/></g></svg>`)
    const el = document.getElementById('q')
    const root = c.getSvgRoot()
    const m = root.createSVGMatrix()
    m.a = 1.2; m.d = 1.2
    const t = root.createSVGTransform()
    t.setMatrix(m)
    el.transform.baseVal.insertItemBefore(t, 0)
    const mid = el.getAttribute('transform')
    let err = null
    try { c.recalculateDimensions(el) } catch (e) { err = String(e) }
    return { mid, after: el.outerHTML, err }
  }))
})

test('svgcontent box and click positions', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
    <ellipse id="e1" cx="200" cy="200" rx="50" ry="30" fill="#a63"/></g></svg>`)
  log('svgcontent', await page.evaluate(() => {
    const c = document.getElementById('svgcontent')
    const r = c.getBoundingClientRect()
    const m = c.getScreenCTM()
    return { rect: { x: r.x, y: r.y, w: r.width, h: r.height }, ctm: [m.a, m.d, m.e, m.f], attrs: ['x', 'y', 'width', 'height', 'viewBox', 'overflow'].map((a) => c.getAttribute(a)) }
  }))
  log('svgcontent locator', await page.locator('#svgcontent').boundingBox())
  log('svgroot locator', await page.locator('#svgroot').boundingBox())
})

test('opened rotated group, rotateSelectedElements', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
    <g id="g" transform="rotate(15 300 200)"><rect id="a" x="200" y="150" width="60" height="40"/><rect id="b" x="320" y="220" width="40" height="40"/></g>
    <rect id="r1" x="100" y="100" width="80" height="60"/></g></svg>`)
  log('group rotate', await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    const content = document.getElementById('svgcontent')
    const center = (id) => {
      const el = document.getElementById(id)
      const m = content.getScreenCTM().inverse().multiply(el.getScreenCTM())
      const b = el.getBBox()
      const x = b.x + b.width / 2
      const y = b.y + b.height / 2
      return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f, m: [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => +v.toFixed(3)) }
    }
    const before = center('a')
    c.setContext(document.getElementById('g'))
    c.selectOnly([document.getElementById('a'), document.getElementById('b')], true)
    c.rotateSelectedElements(40, { cx: 250, cy: 250 })
    return { before, after: center('a'), a: document.getElementById('a').outerHTML, g: document.getElementById('g').getAttribute('transform') }
  }))
  log('r1 scale rotate', await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    c.leaveContext()
    c.selectOnly([document.getElementById('r1')], true)
    c.scaleSelectedElements(2, 2, 100, 50)
    const s = document.getElementById('r1').outerHTML
    c.rotateSelectedElements(30, { cx: 300, cy: 200 })
    return { scaled: s, rotated: document.getElementById('r1').outerHTML }
  }))
})

test('same-look pumps, boxes', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <defs><symbol id="pump" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#39f" stroke="#000"/></symbol></defs>
  <g class="layer"><title>Layer 1</title>
    <use id="u1" xlink:href="#pump" x="40" y="40" width="40" height="40"/>
    <g id="G" transform="translate(150 20) scale(2)" fill="#f00" opacity="0.5"><use id="u2" xlink:href="#pump" x="10" y="10" width="20" height="20"/></g>
    <g id="R" transform="rotate(90 400 100)"><use id="u3" xlink:href="#pump" x="380" y="80" width="40" height="40"/></g>
  </g></svg>`)
  log('pumps', await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    c.selectOnly([document.getElementById('u1')], true)
    c.selectSimilar('symbol')
    return c.getSelectedElements().filter(Boolean).map((el) => {
      const r = el.getBoundingClientRect()
      const s = c.selectorManager.requestSelector(el).selectorRect
      const sr = s.getBoundingClientRect()
      const b = el.getBBox()
      return { id: el.id, gbcr: [r.x, r.y, r.width, r.height].map(Math.round), sel: [sr.x, sr.y, sr.width, sr.height].map(Math.round), bbox: [b.x, b.y, b.width, b.height], d: s.getAttribute('d') }
    })
  }))
})

test('clip scale', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <defs><clipPath id="cp"><circle cx="140" cy="130" r="30"/></clipPath></defs>
  <g class="layer"><title>Layer 1</title><rect id="a" x="100" y="100" width="80" height="60" fill="#3a6" clip-path="url(#cp)"/></g></svg>`)
  log('clip', await page.evaluate(() => {
    const c = window.svgEditor.svgCanvas
    c.selectOnly([document.getElementById('a')], true)
    c.moveSelectedElements(20, 10)
    const moved = [document.getElementById('a').outerHTML, document.getElementById('cp').outerHTML]
    c.scaleSelectedElements(2, 2, 120, 110)
    const r = document.getElementById('a').getBoundingClientRect()
    return { moved, scaled: [document.getElementById('a').outerHTML, document.getElementById('cp').outerHTML], gbcr: [r.x, r.y, r.width, r.height] }
  }))
})

test('scale tool on rotated rect', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
    <rect id="rr" x="400" y="380" width="80" height="40" fill="#a63" stroke="#000" stroke-width="2" transform="rotate(30 440 400)"/></g></svg>`)
  await page.locator('body').press('k')
  await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('rr')], true))
  await page.waitForTimeout(300)
  const grip = await page.locator('#selectorGrip_resize_se').boundingBox()
  log('grip', { grip, tool: await page.evaluate(() => window.svgEditor.svgCanvas.isScaleTool()) })
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 40, grip.y + grip.height / 2 + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  log('rr after scale tool', await page.evaluate(() => document.getElementById('rr').outerHTML))
})

test('draw after click', async ({ page }) => {
  await load(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
    <ellipse id="e1" cx="200" cy="200" rx="50" ry="30" fill="#a63" stroke="#00f" stroke-width="3"/></g></svg>`)
  const e = await page.locator('#e1').boundingBox()
  await page.mouse.click(e.x + e.width / 2, e.y + e.height / 2)
  await page.waitForTimeout(200)
  await page.keyboard.press('r')
  log('mode after r', await page.evaluate(() => ({ mode: window.svgEditor.svgCanvas.getMode(), active: document.activeElement?.tagName + '#' + document.activeElement?.id })))
  const box = await page.locator('#svgcontent').boundingBox()
  log('svgcontent box', box)
  const at = { x: box.x + 450, y: box.y + 50 }
  log('element at', await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el && (el.tagName + '#' + el.id) }, at))
  await page.mouse.move(at.x, at.y)
  await page.mouse.down()
  await page.mouse.move(box.x + 520, box.y + 100, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  log('rects', await page.evaluate(() => [...document.querySelectorAll('#svgcontent rect')].map((r) => r.outerHTML)))
})
