import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, canonical } from './helpers.js'

// M2: common frame of a multi-selection and collective resize.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" data-tag="P-101" se:nonce="1"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a" class="pump"/>
    <text id="t1" x="100" y="300" font-size="20">Pompe</text>
    <rect id="rr" x="400" y="300" width="80" height="40" fill="#a63" transform="rotate(30 440 320)"/>
    <circle id="c1" cx="300" cy="400" r="20" fill="#963"/>
    <g id="grp"><rect id="g1" x="450" y="80" width="40" height="40"/></g>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    // These tests measure the gesture itself, to the unit: no snapping to
    // the neighbours (lot V2), which has its own tests (snap-v2).
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

async function select (page, ids) {
  await page.evaluate((ids) => {
    window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// Drags a grip by (dx, dy) screen pixels, optionally pressing Escape before
// releasing it.
async function dragGrip (page, dir, dx, dy, { modifiers = [], escape = false } = {}) {
  const from = await center(page, `#selectorGrip_resize_${dir}`)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
}

const num = (page, id, names) => page.evaluate(({ id, names }) => {
  const el = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, Number(el.getAttribute(name))]))
}, { id, names })

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const layerMarkup = (page) => page.evaluate(() =>
  document.querySelector('#svgcontent g.layer').outerHTML)

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const round = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))

test.describe('Common frame (M2)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a multi-selection shows one frame with eight grips and its rotation grip', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await expect(page.locator('#selectorMultiFrame')).toBeVisible()
    for (const dir of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
      await expect(page.locator(`#selectorGrip_resize_${dir}`)).toBeVisible()
    }
    // The rotation grip came with M3.
    await expect(page.locator('#selectorGrip_rotate')).toBeVisible()
    // The frame surrounds both elements.
    const frame = await page.locator('#selectorMultiFrame').boundingBox()
    const r1 = await page.locator('#r1').boundingBox()
    const r2 = await page.locator('#r2').boundingBox()
    expect(frame.x).toBeLessThanOrEqual(r1.x)
    expect(frame.x + frame.width).toBeGreaterThanOrEqual(r2.x + r2.width)
  })

  test('a single element keeps its own frame and its rotation grip', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await select(page, ['r1'])
    await expect(page.locator('#selectorMultiFrame')).toBeHidden()
    await expect(page.locator('#selectorGrip_rotate')).toBeVisible()
  })
})

test.describe('Collective resize (M2)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the opposite corner stays in place and relative positions scale', async ({ page }) => {
    // Frame from (100, 100) to (320, 160): doubling it.
    await select(page, ['r1', 'r2'])
    const before = await layerMarkup(page)
    await dragGrip(page, 'se', 220, 60)
    expect(await num(page, 'r1', ['x', 'y', 'width', 'height'])).toEqual({ x: 100, y: 100, width: 160, height: 120 })
    expect(await num(page, 'r2', ['x', 'y', 'width', 'height'])).toEqual({ x: 380, y: 100, width: 160, height: 120 })
    expect(await attr(page, 'r1', 'transform')).toBeNull()

    // One undo step, and undo then redo give the same SVG.
    expect(await undoSize(page)).toBe(1)
    const after = await layerMarkup(page)
    await page.keyboard.press('Control+z')
    expect(await layerMarkup(page)).toBe(before)
    await page.keyboard.press('Control+y')
    expect(await layerMarkup(page)).toBe(after)
  })

  test('Shift keeps the proportions of the whole selection', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await dragGrip(page, 'se', 110, 200, { modifiers: ['Shift'] })
    expect(await num(page, 'r2', ['x', 'y', 'width', 'height'])).toEqual({ x: 310, y: 100, width: 120, height: 90 })
  })

  test('Alt resizes from the center of the frame', async ({ page }) => {
    // Center x = 210; factor (220 + 2 * 55) / 220 = 1.5.
    await select(page, ['r1', 'r2'])
    await dragGrip(page, 'e', 55, 0, { modifiers: ['Alt'] })
    expect(await num(page, 'r1', ['x', 'width'])).toEqual({ x: 45, width: 120 })
    expect(await num(page, 'r2', ['x', 'width'])).toEqual({ x: 255, width: 120 })
  })

  test('crossing the opposite side flips the selection', async ({ page }) => {
    // Factor (220 - 330) / 220 = -0.5 about x = 100.
    await select(page, ['r1', 'r2'])
    await dragGrip(page, 'e', -330, 0)
    expect(await num(page, 'r1', ['x', 'width'])).toEqual({ x: 60, width: 40 })
    expect(await num(page, 'r2', ['x', 'width'])).toEqual({ x: -10, width: 40 })
  })

  test('Escape puts everything back, without history', async ({ page }) => {
    await select(page, ['r1', 'r2', 't1', 'rr'])
    const before = await layerMarkup(page)
    await dragGrip(page, 'se', 120, 80, { escape: true })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
    await expect(page.locator('#selectorMultiFrame')).toBeVisible()
  })

  test('a click on a grip without moving changes nothing', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    const before = await layerMarkup(page)
    await dragGrip(page, 'se', 0, 0)
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
  })

  test('business attributes survive', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await dragGrip(page, 'se', 100, 50)
    expect(await attr(page, 'r1', 'data-tag')).toBe('P-101')
    expect(await page.evaluate(() =>
      document.getElementById('r1').getAttributeNS('http://svg-edit.googlecode.com', 'nonce'))).toBe('1')
    expect(await attr(page, 'r2', 'class')).toBe('pump')
  })

  test('no preview attribute is left in the drawing', async ({ page }) => {
    await select(page, ['r1', 't1', 'c1'])
    await dragGrip(page, 'se', 60, 60)
    expect(await page.locator('#svgcontent [vector-effect]').count()).toBe(0)
  })
})

test.describe('Rules by element type (M2)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a text gets a new font size, never a scale matrix', async ({ page }) => {
    await select(page, ['t1', 'r1'])
    // Width only: the smaller factor is 1, the size does not change.
    await dragGrip(page, 'e', 120, 0)
    expect(await attr(page, 't1', 'transform')).toBeNull()
    expect(await num(page, 't1', ['font-size'])).toEqual({ 'font-size': 20 })
    // Both directions with Shift: the size follows.
    await dragGrip(page, 'se', 60, 0, { modifiers: ['Shift'] })
    expect(await attr(page, 't1', 'transform')).toBeNull()
    expect(Number(await attr(page, 't1', 'font-size'))).toBeGreaterThan(20)
  })

  test('the preview of a text is its result', async ({ page }) => {
    await select(page, ['t1', 'r1'])
    const from = await center(page, '#selectorGrip_resize_se')
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 150, from.y + 20, { steps: 4 })
    const preview = await page.locator('#t1').boundingBox()
    await page.mouse.up()
    const result = await page.locator('#t1').boundingBox()
    expect(Math.abs(preview.x - result.x)).toBeLessThan(1)
    expect(Math.abs(preview.width - result.width)).toBeLessThan(1)
    expect(Math.abs(preview.height - result.height)).toBeLessThan(1)
  })

  test('a single text resized by its corner grip gets a box of fixed size, its font stays', async ({ page }) => {
    // As in Figma (lot Texte et masquage): the Scale tool scales a text.
    await select(page, ['t1'])
    const box = await page.locator('#t1').boundingBox()
    await dragGrip(page, 'se', box.width, box.height)
    expect(await attr(page, 't1', 'transform')).toBeNull()
    expect(await attr(page, 't1', 'font-size')).toBe('20')
    expect(Number(await attr(page, 't1', 'se:width'))).toBeGreaterThan(box.width * 1.8)
    expect(Number(await attr(page, 't1', 'se:height'))).toBeGreaterThan(box.height * 1.8)
    await page.keyboard.press('Control+z')
    expect(await num(page, 't1', ['x', 'y', 'font-size'])).toEqual({ x: 100, y: 300, 'font-size': 20 })
    expect(await attr(page, 't1', 'se:height')).toBeNull()
  })

  test('a rotated rectangle is scaled along its own axes, without shear', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([
      document.getElementById('rr'), document.getElementById('r1')], true))
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(2, 1, 0, 0))
    expect(await attr(page, 'rr', 'transform')).toMatch(/^rotate\(30[ ,]/)
    expect(round(await num(page, 'rr', ['width', 'height']))).toEqual(round({
      width: 80 * Math.sqrt(3.25), height: 40 * Math.sqrt(1.75)
    }))
  })

  test('a circle stays a circle', async ({ page }) => {
    await select(page, ['c1', 'r1'])
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(3, 1.5, 0, 0))
    expect(round(await num(page, 'c1', ['cx', 'cy', 'r']))).toEqual({ cx: 900, cy: 600, r: 30 })
  })

  test('a group keeps a matrix, as when it is resized alone', async ({ page }) => {
    await select(page, ['grp', 'r1'])
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(2, 2, 0, 0))
    expect(canonical(await attr(page, 'grp', 'transform'))).toBe('matrix(2 0 0 2 0 0)')
    expect(await num(page, 'g1', ['x', 'width'])).toEqual({ x: 450, width: 40 })
  })

  test('an element gets the same SVG alone or with another one', async ({ page }) => {
    const scaled = async (ids) => {
      await loadDrawing(page)
      await select(page, ids)
      await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(1.7, 0.6, 30, 40))
      return page.evaluate(() => ['r1', 'rr', 't1', 'c1'].map((id) => document.getElementById(id).outerHTML))
    }
    const alone = []
    for (const id of ['r1', 'rr', 't1', 'c1']) {
      const all = await scaled([id])
      alone.push(all[['r1', 'rr', 't1', 'c1'].indexOf(id)])
    }
    const together = await scaled(['r1', 'rr', 't1', 'c1', 'r2'])
    expect(together).toEqual(alone)
  })

  test('centers follow the transformation', async ({ page }) => {
    const centers = () => page.evaluate(() => ['r1', 'rr', 'c1', 'grp', 't1'].map((id) => {
      const el = document.getElementById(id)
      const b = el.getBBox()
      const m = el.getCTM()
      const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m)
      const content = document.querySelector('#svgcontent g.layer').getCTM().inverse()
      const q = p.matrixTransform(content)
      return [q.x, q.y]
    }))
    await select(page, ['r1', 'rr', 'c1', 'grp', 't1'])
    const before = await centers()
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(2, 1.5, 50, 60))
    const after = await centers()
    // 0.01 unit; a text's box also depends on the font's metrics at the new
    // size, which are not exactly proportional.
    const tolerance = [0.01, 0.01, 0.01, 0.01, 0.5]
    before.forEach(([x, y], i) => {
      expect(Math.abs(after[i][0] - (50 + 2 * (x - 50)))).toBeLessThan(tolerance[i])
      expect(Math.abs(after[i][1] - (60 + 1.5 * (y - 60)))).toBeLessThan(tolerance[i])
    })
  })
})

const TYPES = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <defs>
    <symbol id="sym"><rect width="20" height="20"/></symbol>
    <clipPath id="clip"><rect x="0" y="0" width="30" height="30"/></clipPath>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3"><path d="M0,0 L6,3 L0,6z"/></marker>
  </defs>
  <g class="layer"><title>Layer 1</title>
    <path id="p1" d="M 10 10 C 40 0 60 40 90 20 A 20 10 30 0 1 120 40 Q 130 60 100 70 Z" fill="#999"/>
    <polyline id="pl" points="200,10 230,40 260,10" fill="none" stroke="#000" marker-end="url(#arrow)"/>
    <use id="u1" xlink:href="#sym" x="300" y="10"/>
    <image id="im" x="10" y="100" width="40" height="30" href="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"/>
    <foreignObject id="fo" x="100" y="100" width="60" height="40"><div xmlns="http://www.w3.org/1999/xhtml">Texte</div></foreignObject>
    <rect id="cl" x="200" y="100" width="60" height="60" clip-path="url(#clip)"/>
    <g id="n1" transform="rotate(10 400 300)">
      <g id="n2" transform="rotate(-25 420 310)">
        <g id="n3" transform="rotate(40 430 320)">
          <rect id="leaf1" x="400" y="290" width="50" height="30" fill="#36a"/>
          <ellipse id="leaf2" cx="470" cy="330" rx="20" ry="10" fill="#a63"/>
        </g>
      </g>
    </g>
  </g>
</svg>`

test.describe('Other element types (M2)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.evaluate((svg) => {
      // These tests measure the gesture itself, to the unit: no snapping to
      // the neighbours (lot V2), which has its own tests (snap-v2).
      window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
      window.svgEditor.svgCanvas.setSvgString(svg)
      window.svgEditor.svgCanvas.setZoom(1)
      window.svgEditor.updateCanvas()
      window.svgEditor.svgCanvas.clearSelection()
    }, TYPES)
  })

  test('each type takes the scale with the rules of a single element', async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await select(page, ['p1', 'pl', 'u1', 'im', 'fo', 'cl'])
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(2, 1.5, 0, 0))
    expect(errors).toEqual([])
    // Paths and polylines: points rewritten, arcs and curves included.
    expect(await attr(page, 'p1', 'transform')).toBeNull()
    expect(await attr(page, 'pl', 'points')).toBe('400,15 460,60 520,15')
    // use keeps a matrix.
    expect(canonical(await attr(page, 'u1', 'transform'))).toBe('matrix(2 0 0 1.5 0 0)')
    // Boxes: geometry rewritten.
    expect(await num(page, 'im', ['x', 'y', 'width', 'height'])).toEqual({ x: 20, y: 150, width: 80, height: 45 })
    expect(await num(page, 'fo', ['x', 'y', 'width', 'height'])).toEqual({ x: 200, y: 150, width: 120, height: 60 })
    // A clipped rectangle is rewritten as when it is resized alone; its
    // clipPath does not follow the scale (existing behaviour, see the M2 doc).
    expect(await num(page, 'cl', ['x', 'y', 'width', 'height'])).toEqual({ x: 400, y: 150, width: 120, height: 90 })
    // The stroke width and the marker stay.
    expect(await attr(page, 'pl', 'marker-end')).toBe('url(#arrow)')
    expect(await attr(page, 'pl', 'stroke-width')).toBeNull()
  })

  test('the path keeps its shape: its box scales exactly', async ({ page }) => {
    const before = await page.evaluate(() => {
      const b = document.getElementById('p1').getBBox()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    })
    await select(page, ['p1', 'pl'])
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(2, 1.5, 0, 0))
    const after = await page.evaluate(() => {
      const b = document.getElementById('p1').getBBox()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    })
    expect(after.x).toBeCloseTo(before.x * 2, 1)
    expect(after.y).toBeCloseTo(before.y * 1.5, 1)
    expect(after.width).toBeCloseTo(before.width * 2, 1)
    expect(after.height).toBeCloseTo(before.height * 1.5, 1)
  })

  test('nested rotated groups: scale, then ungroup, render the same', async ({ page }) => {
    const leaves = () => page.evaluate(() => ['leaf1', 'leaf2'].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect()
      return [r.x, r.y, r.width, r.height]
    }))
    await select(page, ['n1', 'cl'])
    await page.evaluate(() => window.svgEditor.svgCanvas.scaleSelectedElements(1.5, 1.5, 0, 0))
    const scaled = await leaves()
    await select(page, ['n1'])
    await page.keyboard.press('Control+Shift+g')
    expect(await page.locator('#n1').count()).toBe(0)
    const ungrouped = await leaves()
    scaled.forEach((box, i) => box.forEach((value, k) => {
      expect(Math.abs(ungrouped[i][k] - value)).toBeLessThan(0.5)
    }))
  })
})
