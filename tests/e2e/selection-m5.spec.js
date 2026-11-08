import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// M5: visual feedback of the selection. Hover outline, live dimension label,
// oriented cursors and rotation from the corners, small objects.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a"/>
    <rect id="rr" x="400" y="300" width="80" height="40" fill="#a63" transform="rotate(30 440 320)"/>
    <g id="grp"><rect id="ga" x="100" y="300" width="40" height="40"/><rect id="gb" x="160" y="300" width="40" height="40"/></g>
    <rect id="tiny" x="300" y="300" width="10" height="10"/>
    <line id="hl" x1="100" y1="420" x2="300" y2="420" stroke="#000" stroke-width="2"/>
    <rect id="t1" x="500" y="100" width="10" height="10"/>
    <rect id="t2" x="515" y="100" width="6" height="8"/>
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

async function select (page, ids) {
  await page.evaluate((ids) => {
    window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
  }, ids)
}

async function center (page, selector) {
  const box = await page.locator(selector).boundingBox()
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// Screen point of a point of the drawing.
const toScreen = (page, x, y) => page.evaluate(({ x, y }) => {
  const m = document.querySelector('#svgcontent g.layer').getScreenCTM()
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}, { x, y })

const hover = (page) => page.evaluate(() => {
  const outline = document.getElementById('selectorHover')
  return {
    shown: outline.getAttribute('display') !== 'none',
    d: outline.getAttribute('d'),
    transform: outline.getAttribute('transform') || ''
  }
})

// The frame the selector of an element draws.
const frameOf = (page, id) => page.evaluate((id) => {
  const selector = window.svgEditor.svgCanvas.selectorManager.requestSelector(document.getElementById(id))
  return { d: selector.selectorRect.getAttribute('d'), transform: selector.selectorGroup.getAttribute('transform') || '' }
}, id)

const label = (page) => page.evaluate(() => {
  const g = document.getElementById('selectorDimension')
  const box = g.getBoundingClientRect()
  return {
    shown: g.getAttribute('display') !== 'none',
    text: g.textContent.replace(/\u2002/g, ' '),
    box: { x: box.x, y: box.y, width: box.width, height: box.height }
  }
})

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const angleOf = (page, id) => page.evaluate((id) =>
  window.svgEditor.svgCanvas.getRotationAngle(document.getElementById(id)), id)

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const elementAt = (page, point) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point)

// Angle of the arrow drawn in a grip's cursor.
const cursorAngle = (page, id) => page.evaluate((id) => {
  const style = decodeURIComponent(document.getElementById(id).getAttribute('style'))
  return Number(style.match(/rotate\((-?[\d.]+) 12 12\)/)[1])
}, id)

const shownGrips = (page) => page.evaluate(() => ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw']
  .filter((dir) => document.getElementById(`selectorGripHit_resize_${dir}`).getAttribute('display') !== 'none'))

// Drags from `from` along a circle about `pivot`, by `deg` degrees.
async function dragAround (page, from, pivot, deg, { modifiers = [], during } = {}) {
  const radius = Math.hypot(from.x - pivot.x, from.y - pivot.y)
  const start = Math.atan2(from.y - pivot.y, from.x - pivot.x)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const a = start + (deg * Math.PI / 180) * i / steps
    await page.mouse.move(pivot.x + radius * Math.cos(a), pivot.y + radius * Math.sin(a))
  }
  const result = during ? await during() : undefined
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
  return result
}

// Drags from `from` by (dx, dy), returning what `during` reads before the
// mouse is released.
async function dragBy (page, from, dx, dy, { during, escape = false } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2)
  await page.mouse.move(from.x + dx, from.y + dy)
  const result = during ? await during() : undefined
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  return result
}

const round2 = (value) => String(Math.round(Number(value) * 100) / 100)

test.describe('Hover outline (M5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the element under the pointer gets the outline of the frame a click draws', async ({ page }) => {
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    const point = await center(page, '#r1')
    await page.mouse.move(point.x, point.y)
    const outline = await hover(page)
    expect(outline.shown).toBe(true)
    // The outline is not part of the drawing.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(before)

    await page.mouse.down()
    await page.mouse.up()
    expect(await frameOf(page, 'r1')).toEqual({ d: outline.d, transform: outline.transform })
    // Selected: the frame replaces the outline.
    expect((await hover(page)).shown).toBe(false)
  })

  test('a rotated element: the outline turns like its frame', async ({ page }) => {
    const point = await center(page, '#rr')
    await page.mouse.move(point.x, point.y)
    const outline = await hover(page)
    expect(outline.transform).toMatch(/^rotate\(30,/)
    await select(page, ['rr'])
    expect(await frameOf(page, 'rr')).toEqual({ d: outline.d, transform: outline.transform })
  })

  test('a closed group is outlined as a whole, a child of an opened group alone', async ({ page }) => {
    const point = await center(page, '#ga')
    await page.mouse.move(point.x, point.y)
    const outline = await hover(page)
    expect(outline.d).toBe((await frameOf(page, 'grp')).d)

    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.clearSelection()
      c.setContext(document.getElementById('grp'))
    })
    await page.mouse.move(point.x + 1, point.y)
    const inside = await hover(page)
    expect(inside.shown).toBe(true)
    expect(inside.d).toBe((await frameOf(page, 'ga')).d)
  })

  test('no outline over the selection, the empty canvas, during a drag, outside the canvas or in another tool', async ({ page }) => {
    await select(page, ['r1'])
    const r1 = await center(page, '#r1')
    const r2 = await center(page, '#r2')
    await page.mouse.move(r1.x, r1.y)
    expect((await hover(page)).shown).toBe(false)
    await page.mouse.move(r2.x, r2.y)
    expect((await hover(page)).shown).toBe(true)

    const empty = await toScreen(page, 60, 60)
    await page.mouse.move(empty.x, empty.y)
    expect((await hover(page)).shown).toBe(false)

    // A drag of r1 over r2: no outline while the button is down.
    await page.mouse.move(r1.x, r1.y)
    await page.mouse.down()
    await page.mouse.move(r1.x + 40, r1.y)
    await page.mouse.move(r2.x, r2.y)
    expect((await hover(page)).shown).toBe(false)
    await page.keyboard.press('Escape')
    await page.mouse.up()

    await page.mouse.move(r2.x, r2.y + 1)
    expect((await hover(page)).shown).toBe(true)
    await page.mouse.move(2, 2)
    expect((await hover(page)).shown).toBe(false)

    await page.mouse.move(r2.x, r2.y)
    expect((await hover(page)).shown).toBe(true)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('rect'))
    expect((await hover(page)).shown).toBe(false)
    await page.mouse.move(r2.x + 1, r2.y)
    expect((await hover(page)).shown).toBe(false)
  })

  test('a change of the drawing or of the zoom drops the outline', async ({ page }) => {
    const r2 = await center(page, '#r2')
    await page.mouse.move(r2.x, r2.y)
    expect((await hover(page)).shown).toBe(true)
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.setZoom(2)
      window.svgEditor.updateCanvas()
    })
    expect((await hover(page)).shown).toBe(false)

    await loadDrawing(page)
    await page.mouse.move(r2.x, r2.y + 1)
    expect((await hover(page)).shown).toBe(true)
    await page.evaluate(() => {
      const r = document.getElementById('r2')
      window.svgEditor.svgCanvas.call('changed', [r])
    })
    expect((await hover(page)).shown).toBe(false)
  })
})

test.describe('Live dimension label (M5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a move shows X and Y of the selection, centred under it, then disappears', async ({ page }) => {
    await select(page, ['r2'])
    const from = await center(page, '#r2')
    const during = await dragBy(page, from, 20, 10, {
      during: async () => ({
        label: await label(page),
        frame: await page.locator('#selectorGroup0 path').boundingBox()
      })
    })
    expect(during.label.shown).toBe(true)
    expect(during.label.text).toBe('X 260 Y 110')
    expect(during.label.box.y).toBeGreaterThan(during.frame.y + during.frame.height)
    expect(Math.abs((during.label.box.x + during.label.box.width / 2) - (during.frame.x + during.frame.width / 2))).toBeLessThan(1)
    expect((await label(page)).shown).toBe(false)
    expect(await attr(page, 'r2', 'x')).toBe('260')
  })

  test('a resize shows the width and height the element gets', async ({ page }) => {
    await select(page, ['r2'])
    const grip = await center(page, '#selectorGripHit_resize_se')
    const text = await dragBy(page, grip, 20, 10, { during: async () => (await label(page)).text })
    expect(text).toBe(`${round2(await attr(page, 'r2', 'width'))} × ${round2(await attr(page, 'r2', 'height'))}`)
    expect(text).toBe('100 × 70')
  })

  test('a rotation shows the angle the element gets', async ({ page }) => {
    await select(page, ['r2'])
    const grip = await center(page, '#selectorGrip_rotate')
    const pivot = await center(page, '#r2')
    const text = await dragAround(page, grip, pivot, 50, { during: async () => (await label(page)).text })
    const angle = await angleOf(page, 'r2')
    expect(angle).toBeGreaterThan(45)
    expect(text).toBe(`${Math.round(angle * 10) / 10}°`)
  })

  test('a multi-selection shows the size of the whole, stroke excluded, and the angle of its frame', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    const grip = await center(page, '#selectorGripHit_resize_se')
    const text = await dragBy(page, grip, 44, 12, { during: async () => (await label(page)).text })
    const box = await page.evaluate(() => {
      const [a, b] = ['r1', 'r2'].map((id) => document.getElementById(id))
      const n = (el, name) => Number(el.getAttribute(name))
      return {
        width: n(b, 'x') + n(b, 'width') - n(a, 'x'),
        height: Math.max(n(a, 'y') + n(a, 'height'), n(b, 'y') + n(b, 'height')) - Math.min(n(a, 'y'), n(b, 'y'))
      }
    })
    expect(text).toBe(`${round2(box.width)} × ${round2(box.height)}`)

    const handle = await center(page, '#selectorGrip_rotate')
    const pivot = await center(page, '#selectorMultiFrame')
    const angleText = await dragAround(page, handle, pivot, 30, { during: async () => (await label(page)).text })
    const field = await page.evaluate(() => window.svgEditor.svgCanvas.getSelectionAngle())
    expect(angleText).toBe(`${Math.round(field * 10) / 10}°`)
  })

  test('the label uses the unit of the document', async ({ page }) => {
    // As the preferences dialog does.
    await page.evaluate(() => {
      const editor = window.svgEditor
      editor.configObj.curConfig.baseUnit = 'mm'
      editor.svgCanvas.setConfig(editor.configObj.curConfig)
    })
    await select(page, ['r2'])
    const from = await center(page, '#r2')
    const text = await dragBy(page, from, 20, 10, { during: async () => (await label(page)).text })
    const mm = (px) => round2(px * 25.4 / 96)
    expect(text).toBe(`X ${mm(260)} Y ${mm(110)} mm`)
  })

  test('Escape hides the label with the rest of the gesture', async ({ page }) => {
    await select(page, ['r2'])
    const grip = await center(page, '#selectorGripHit_resize_se')
    const shown = await dragBy(page, grip, 20, 10, { escape: true, during: async () => (await label(page)).shown })
    expect(shown).toBe(true)
    expect((await label(page)).shown).toBe(false)
    expect(await attr(page, 'r2', 'width')).toBe('80')
  })
})

test.describe('Exact preview of a circle (M5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <g class="layer"><title>Layer 1</title><circle id="c1" cx="200" cy="200" r="40" fill="#3a6"/></g></svg>`)
  })

  test('resized with free proportions, a circle shows the circle it becomes, not an ellipse', async ({ page }) => {
    await select(page, ['c1'])
    const grip = await center(page, '#selectorGripHit_resize_e')
    const during = await dragBy(page, grip, 40, 0, {
      during: async () => ({ box: await page.locator('#c1').boundingBox(), text: (await label(page)).text })
    })
    expect(Math.abs(during.box.width - during.box.height)).toBeLessThan(0.01)
    expect(during.text).toBe('80 × 80')
    const after = await page.locator('#c1').boundingBox()
    for (const key of ['x', 'y', 'width', 'height']) {
      expect(Math.abs(after[key] - during.box[key])).toBeLessThan(0.01)
    }
    expect([await attr(page, 'c1', 'cx'), await attr(page, 'c1', 'r')]).toEqual(['220', '40'])
  })
})

test.describe('Oriented cursors and rotation from the corners (M5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('resize cursors follow the angle of the element, to the degree', async ({ page }) => {
    await select(page, ['rr'])
    expect(await cursorAngle(page, 'selectorGripHit_resize_e')).toBe(30)
    expect(await cursorAngle(page, 'selectorGripHit_resize_n')).toBe(120)
    expect(await cursorAngle(page, 'selectorGripZone_rotate_ne')).toBe(30)
    expect(await attr(page, 'selectorGripHit_resize_e', 'style')).toMatch(/-resize$/)
    await select(page, ['r2'])
    expect(await cursorAngle(page, 'selectorGripHit_resize_e')).toBe(0)
    expect(await cursorAngle(page, 'selectorGripHit_resize_se')).toBe(45)
  })

  test('a rotation zone lies outside each corner, the resize grip at the corner, the element inside', async ({ page }) => {
    await select(page, ['r2'])
    const box = await page.locator('#r2').boundingBox()
    const corners = {
      nw: [box.x, box.y, -1, -1],
      ne: [box.x + box.width, box.y, 1, -1],
      se: [box.x + box.width, box.y + box.height, 1, 1],
      sw: [box.x, box.y + box.height, -1, 1]
    }
    for (const [dir, [x, y, sx, sy]] of Object.entries(corners)) {
      expect(await elementAt(page, { x: x + sx * 13, y: y + sy * 13 })).toBe(`selectorGripZone_rotate_${dir}`)
      expect(await elementAt(page, { x: x + sx * 2, y: y + sy * 2 })).toBe(`selectorGripHit_resize_${dir}`)
      expect(await elementAt(page, { x: x - sx * 12, y: y - sy * 12 })).toBe('r2')
    }
  })

  test('from a zone, a single element turns by the angle the pointer turns, without a jump', async ({ page }) => {
    await select(page, ['r2'])
    const box = await page.locator('#r2').boundingBox()
    const pivot = await center(page, '#r2')
    const from = { x: box.x + box.width + 13, y: box.y - 13 }
    expect(await elementAt(page, from)).toBe('selectorGripZone_rotate_ne')

    // A first small move: the element barely turns.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 1, from.y + 1)
    expect(Math.abs(await angleOf(page, 'r2'))).toBeLessThan(2)
    await page.keyboard.press('Escape')
    await page.mouse.up()
    expect(await angleOf(page, 'r2')).toBe(0)

    const before = await undoSize(page)
    const text = await dragAround(page, from, pivot, 40, { during: async () => (await label(page)).text })
    // Firefox gives mouse events whole pixels: about 30 pixels from the
    // pivot, the angle the pointer turns is known within half a degree.
    expect(Math.abs(await angleOf(page, 'r2') - 40)).toBeLessThan(1)
    expect(text).toMatch(/^(39|40)(\.\d)?°$/)
    expect(await undoSize(page)).toBe(before + 1)

    // With Shift, by steps of 15 degrees.
    const box2 = await page.locator('#selectorGripZone_rotate_sw').boundingBox()
    const corner = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }
    await dragAround(page, corner, pivot, 23, { modifiers: ['Shift'] })
    expect((await angleOf(page, 'r2')) % 15).toBeCloseTo(0, 6)
  })

  test('from a zone, a multi-selection turns about its frame, and its cursors come back to the axes', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    const frame = await page.locator('#selectorMultiFrame').boundingBox()
    const pivot = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
    const from = { x: frame.x - 10, y: frame.y + frame.height + 10 }
    expect(await elementAt(page, from)).toBe('selectorGripZone_rotate_sw')
    const before = await undoSize(page)
    await dragAround(page, from, pivot, 40)
    expect(Math.abs(await angleOf(page, 'r1') - 40)).toBeLessThan(0.5)
    expect(Math.abs(await angleOf(page, 'r2') - 40)).toBeLessThan(0.5)
    expect(await undoSize(page)).toBe(before + 1)
    expect(await cursorAngle(page, 'selectorGripHit_resize_e')).toBe(0)
  })
})

test.describe('Small objects (M5)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('below 24 pixels on screen, the side grips hide and a drag inside moves the element', async ({ page }) => {
    await select(page, ['tiny'])
    expect(await shownGrips(page)).toEqual(['nw', 'ne', 'se', 'sw'])
    const from = await center(page, '#tiny')
    expect(await elementAt(page, from)).toBe('tiny')
    await dragBy(page, from, 30, 0)
    expect(await attr(page, 'tiny', 'x')).toBe('330')
    expect(await attr(page, 'tiny', 'width')).toBe('10')
  })

  test('its corner grips, moved outward, still resize it', async ({ page }) => {
    await select(page, ['tiny'])
    const box = await page.locator('#tiny').boundingBox()
    const from = { x: box.x + box.width + 4, y: box.y + box.height + 4 }
    expect(await elementAt(page, from)).toBe('selectorGripHit_resize_se')
    await dragBy(page, from, 20, 20)
    expect(Number(await attr(page, 'tiny', 'width'))).toBeGreaterThan(25)
  })

  test('a thin line keeps the grips at its ends; zooming in brings the side grips back', async ({ page }) => {
    await select(page, ['hl'])
    expect(await shownGrips(page)).toEqual(['e', 'w', 'nw', 'ne', 'se', 'sw'])

    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.setZoom(4)
      window.svgEditor.updateCanvas()
      c.clearSelection()
      c.selectOnly([document.getElementById('tiny')], true)
    })
    expect(await shownGrips(page)).toEqual(['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw'])
  })

  test('the common frame of a small multi-selection behaves the same', async ({ page }) => {
    await select(page, ['t1', 't2'])
    expect(await shownGrips(page)).toEqual(['nw', 'ne', 'se', 'sw'])
    const from = await toScreen(page, 505, 105)
    expect(await elementAt(page, from)).toBe('t1')
    await dragBy(page, from, 0, 30)
    expect(await attr(page, 't1', 'y')).toBe('130')
    expect(await attr(page, 't2', 'y')).toBe('130')
  })
})
