import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// M3: rotation of a multi-selection about the center of its common frame.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:se="http://svg-edit.googlecode.com" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" data-tag="P-101" se:nonce="1"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a" class="pump"/>
    <rect id="rr" x="400" y="300" width="80" height="40" fill="#a63" transform="rotate(30 440 320)"/>
    <rect id="far" x="600" y="460" width="10" height="10"/>
  </g>
</svg>`

// Every element type, to compare a collective rotation with the commands
// that turn and move one element.
const TYPES = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6" stroke="#000" stroke-width="2"/>
    <rect id="r2" x="240" y="100" width="80" height="60" fill="#36a" transform="rotate(20 280 130)"/>
    <ellipse id="e1" cx="420" cy="300" rx="50" ry="30" fill="#a63"/>
    <circle id="c1" cx="150" cy="350" r="30"/>
    <path id="p1" d="M 300 300 L 380 320 Q 360 380 340 400 A 20 30 0 0 1 300 300 Z" fill="#999"/>
    <text id="t1" x="60" y="60" font-size="20">Synoptique<tspan x="60" dy="20">ligne</tspan></text>
    <g id="grp" transform="translate(10 0)"><rect x="450" y="80" width="40" height="40"/><rect x="500" y="80" width="40" height="40"/></g>
    <g id="grot" transform="rotate(15 520 220)"><rect x="480" y="200" width="80" height="40"/></g>
    <line id="l1" x1="50" y1="450" x2="300" y2="430" stroke="#000"/>
    <polyline id="pl" points="10,10 40,30 70,10" fill="none" stroke="#000" marker-end="url(#arrow)"/>
    <use id="u1" xlink:href="#sym" x="20" y="20" transform="translate(5 5) scale(2)"/>
    <text id="tm" x="300" y="60" font-size="20" transform="matrix(-1 0 0 1 700 0)">miroir</text>
    <image id="im" x="500" y="400" width="40" height="30" href="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"/>
    <foreignObject id="fo" x="20" y="380" width="60" height="40"><div xmlns="http://www.w3.org/1999/xhtml">GTB</div></foreignObject>
    <rect id="far" x="600" y="460" width="10" height="10"/>
  </g>
  <defs>
    <symbol id="sym"><rect width="10" height="10"/></symbol>
    <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2"><path d="M0,0 L4,2 L0,4 z"/></marker>
  </defs>
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

// Drags the rotation grip of the common frame by `deg` degrees about the
// frame's center, optionally pressing Escape before releasing it.
async function dragRotation (page, deg, { modifiers = [], escape = false, beforeUp } = {}) {
  const frame = await center(page, '#selectorMultiFrame')
  const grip = await center(page, '#selectorGrip_rotate')
  const radius = Math.hypot(grip.x - frame.x, grip.y - frame.y)
  const start = Math.atan2(grip.y - frame.y, grip.x - frame.x)
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  const steps = 6
  for (let i = 1; i <= steps; i++) {
    const a = start + (deg * Math.PI / 180) * i / steps
    await page.mouse.move(frame.x + radius * Math.cos(a), frame.y + radius * Math.sin(a))
  }
  if (beforeUp) await beforeUp()
  if (escape) await page.keyboard.press('Escape')
  await page.mouse.up()
  for (const key of modifiers) await page.keyboard.up(key)
}

const attr = (page, id, name) => page.evaluate(({ id, name }) =>
  document.getElementById(id).getAttribute(name), { id, name })

const angleOf = (page, id) => page.evaluate((id) =>
  window.svgEditor.svgCanvas.getRotationAngle(document.getElementById(id)), id)

const layerMarkup = (page) => page.evaluate(() =>
  document.querySelector('#svgcontent g.layer').outerHTML)

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const angleField = (page) => page.locator('#angle').evaluate((el) => el.value)

// Types a value in the angle field, key by key. The field applies the value
// on Enter (since M4; it applied the first key at once before).
async function typeAngle (page, value) {
  const input = page.locator('#angle').locator('#input')
  await input.click()
  await input.press('Control+a')
  await input.pressSequentially(String(value))
  await input.press('Enter')
}

// Sets the angle field at once, as its arrows do.
const setAngleField = (page, value) => page.locator('#angle').evaluate((el, value) => {
  const input = el.shadowRoot.querySelector('elix-number-spin-box')
  input.value = String(value)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}, value)

// Visual center of an element in the drawing's coordinates. For a path, its
// first point: Chromium measures the box of an arc only approximately (in
// single precision, on an approximation by curves), up to 0.015 unit off.
const visualCenter = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id)
  const content = document.getElementById('svgcontent')
  const m = content.getScreenCTM().inverse().multiply(el.getScreenCTM())
  let x
  let y
  if (el.tagName === 'path') {
    ;[x, y] = el.getAttribute('d').match(/-?[\d.]+(?:e[-+]?\d+)?/gi).slice(0, 2).map(Number)
  } else {
    const box = el.getBBox()
    x = box.x + box.width / 2
    y = box.y + box.height / 2
  }
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}, id)

const rotatePoint = (p, deg, c) => {
  const r = deg * Math.PI / 180
  return {
    x: c.x + Math.cos(r) * (p.x - c.x) - Math.sin(r) * (p.y - c.y),
    y: c.y + Math.sin(r) * (p.x - c.x) + Math.cos(r) * (p.y - c.y)
  }
}

test.describe('Rotation handle of the common frame (M3)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the frame of a multi-selection has a rotation grip above its top side', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await expect(page.locator('#selectorGrip_rotate')).toBeVisible()
    const frame = await page.locator('#selectorMultiFrame').boundingBox()
    const grip = await center(page, '#selectorGrip_rotate')
    expect(Math.abs(grip.x - (frame.x + frame.width / 2))).toBeLessThan(1)
    expect(grip.y).toBeLessThan(frame.y)
  })

  test('dragging it turns the selection about the center of the frame, as one undo step', async ({ page }) => {
    // Frame from (100, 100) to (320, 160): center (210, 130).
    await select(page, ['r1', 'r2'])
    const before = await layerMarkup(page)
    await dragRotation(page, 90)
    expect(await attr(page, 'r1', 'transform')).toBe('rotate(90 210 60)')
    expect(await attr(page, 'r2', 'transform')).toBe('rotate(90 210 200)')
    expect(await attr(page, 'r1', 'x')).toBe('170')
    expect(await attr(page, 'r1', 'y')).toBe('30')
    // Business attributes stay.
    expect(await attr(page, 'r1', 'data-tag')).toBe('P-101')
    expect(await attr(page, 'r2', 'class')).toBe('pump')

    // After the gesture the frame is back on the axes.
    expect(await attr(page, 'selectorMultiFrame', 'transform')).toBeNull()
    expect(await page.evaluate(() =>
      window.svgEditor.svgCanvas.selectorManager.selectorGripsGroup.getAttribute('transform'))).toBeNull()

    expect(await undoSize(page)).toBe(1)
    const after = await layerMarkup(page)
    await page.keyboard.press('Control+z')
    expect(await layerMarkup(page)).toBe(before)
    await page.keyboard.press('Control+y')
    expect(await layerMarkup(page)).toBe(after)
  })

  test('the frame and its grips turn during the gesture, and the preview is the result', async ({ page }) => {
    await select(page, ['r1', 'r2', 'rr'])
    let during
    await dragRotation(page, 40, {
      beforeUp: async () => {
        // Pointer positions are whole pixels: the angle is 40 degrees to a
        // fraction of a degree.
        const transform = await attr(page, 'selectorMultiFrame', 'transform')
        expect(Math.abs(Number(/^rotate\(([-\d.]+)/.exec(transform)[1]) - 40)).toBeLessThan(0.5)
        during = await page.evaluate(() => ['r1', 'r2', 'rr'].map((id) => {
          const box = document.getElementById(id).getBoundingClientRect()
          return [box.x, box.y, box.width, box.height]
        }))
      }
    })
    const after = await page.evaluate(() => ['r1', 'r2', 'rr'].map((id) => {
      const box = document.getElementById(id).getBoundingClientRect()
      return [box.x, box.y, box.width, box.height]
    }))
    during.flat().forEach((value, i) => expect(Math.abs(value - after.flat()[i])).toBeLessThan(0.5))
  })

  test('Shift turns by steps of 15 degrees', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await dragRotation(page, 41, { modifiers: ['Shift'] })
    expect(await angleOf(page, 'r1')).toBe(45)
    expect(await angleOf(page, 'r2')).toBe(45)
  })

  test('Escape before releasing puts everything back, without history', async ({ page }) => {
    await select(page, ['r1', 'r2', 'rr'])
    const before = await layerMarkup(page)
    await dragRotation(page, 60, { escape: true })
    expect(await layerMarkup(page)).toBe(before)
    expect(await undoSize(page)).toBe(0)
    expect(await attr(page, 'selectorMultiFrame', 'transform')).toBeNull()
    await expect(page.locator('#selectorMultiFrame')).toBeVisible()
  })

  test('a single element still turns about its own center', async ({ page }) => {
    await select(page, ['r1'])
    const grip = await center(page, '#selectorGrip_rotate')
    const c = await center(page, '#r1')
    await page.mouse.move(grip.x, grip.y)
    await page.mouse.down()
    await page.mouse.move(c.x + 60, c.y, { steps: 6 })
    await page.mouse.up()
    expect(await attr(page, 'r1', 'transform')).toBe('rotate(90 140 130)')
  })
})

test.describe('Rules of a collective rotation (M3)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('each element gets the SVG of a rotation then a move of that element alone', async ({ page }) => {
    await loadDrawing(page, TYPES)
    const ids = ['r1', 'r2', 'e1', 'c1', 'p1', 't1', 'grp', 'grot', 'l1', 'pl', 'u1', 'tm', 'im', 'fo']
    for (const deg of [30, -75, 180]) {
      const result = await page.evaluate(({ svg, ids, deg }) => {
        const c = window.svgEditor.svgCanvas
        const load = () => { c.setSvgString(svg); c.setZoom(1); window.svgEditor.updateCanvas(); c.clearSelection() }
        const pivot = { x: 333, y: 222 }
        const diffs = []
        for (const id of ids) {
          load()
          const el = () => document.getElementById(id)
          const box = el().getBBox()
          const list = el().transform.baseVal
          let m = null
          for (let i = 0; i < list.numberOfItems; i++) {
            m = m ? m.multiply(list.getItem(i).matrix) : list.getItem(i).matrix
          }
          const x0 = box.x + box.width / 2
          const y0 = box.y + box.height / 2
          const x = m ? m.a * x0 + m.c * y0 + m.e : x0
          const y = m ? m.b * x0 + m.d * y0 + m.f : y0
          const r = deg * Math.PI / 180
          const tx = pivot.x + Math.cos(r) * (x - pivot.x) - Math.sin(r) * (y - pivot.y) - x
          const ty = pivot.y + Math.sin(r) * (x - pivot.x) + Math.cos(r) * (y - pivot.y) - y
          const angle = c.getRotationAngle(el())
          c.selectOnly([el()], true)
          c.setRotationAngle(angle + deg)
          c.moveSelectedElements(tx, ty)
          const expected = el().outerHTML
          load()
          c.selectOnly([el(), document.getElementById('far')], true)
          c.rotateSelectedElements(deg, { cx: pivot.x, cy: pivot.y })
          if (el().outerHTML !== expected) { diffs.push(`${id}: ${el().outerHTML} instead of ${expected}`) }
        }
        return diffs
      }, { svg: TYPES, ids, deg })
      expect(result, `rotation by ${deg}`).toEqual([])
    }
  })

  test('after a scale by 2 then a rotation by 30 degrees, every center follows the matrix', async ({ page }) => {
    await loadDrawing(page, TYPES)
    const ids = ['r1', 'r2', 'e1', 'c1', 'p1', 'grp', 'grot', 'l1', 'im']
    const before = {}
    for (const id of ids) before[id] = await visualCenter(page, id)
    await page.evaluate((ids) => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly(ids.map((id) => document.getElementById(id)), true)
      c.scaleSelectedElements(2, 2, 100, 50)
      c.rotateSelectedElements(30, { cx: 300, cy: 200 })
    }, ids)
    for (const id of ids) {
      const scaled = { x: 100 + 2 * (before[id].x - 100), y: 50 + 2 * (before[id].y - 50) }
      const expected = rotatePoint(scaled, 30, { x: 300, y: 200 })
      const actual = await visualCenter(page, id)
      expect(Math.abs(actual.x - expected.x), id).toBeLessThan(0.01)
      expect(Math.abs(actual.y - expected.y), id).toBeLessThan(0.01)
    }
    expect(await undoSize(page)).toBe(2)
  })

  test('elements of an opened rotated group turn about the frame on screen', async ({ page }) => {
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <g class="layer"><title>Layer 1</title>
        <g id="g" transform="rotate(15 300 200)">
          <rect id="a" x="200" y="150" width="60" height="40"/>
          <rect id="b" x="320" y="220" width="40" height="40"/>
        </g>
      </g></svg>`)
    const before = { a: await visualCenter(page, 'a'), b: await visualCenter(page, 'b') }
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.setContext(document.getElementById('g'))
      c.selectOnly([document.getElementById('a'), document.getElementById('b')], true)
      c.rotateSelectedElements(40, { cx: 250, cy: 250 })
    })
    for (const id of ['a', 'b']) {
      const expected = rotatePoint(before[id], 40, { x: 250, y: 250 })
      const actual = await visualCenter(page, id)
      expect(Math.abs(actual.x - expected.x), id).toBeLessThan(0.01)
      expect(Math.abs(actual.y - expected.y), id).toBeLessThan(0.01)
      // Still a rectangle with a rotation, in its group's coordinates.
      expect(await attr(page, id, 'transform')).toMatch(/^rotate\(40[ ,]/)
    }
  })

  test('a parent with a non-uniform scale keeps the matrix, at the right place', async ({ page }) => {
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
      <g class="layer"><title>Layer 1</title>
        <g id="g" transform="scale(2 1)">
          <rect id="a" x="50" y="150" width="30" height="40"/>
          <rect id="b" x="150" y="220" width="20" height="40"/>
        </g>
      </g></svg>`)
    const before = { a: await visualCenter(page, 'a'), b: await visualCenter(page, 'b') }
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.setContext(document.getElementById('g'))
      c.selectOnly([document.getElementById('a'), document.getElementById('b')], true)
      c.rotateSelectedElements(30, { cx: 250, cy: 250 })
    })
    for (const id of ['a', 'b']) {
      const expected = rotatePoint(before[id], 30, { x: 250, y: 250 })
      const actual = await visualCenter(page, id)
      expect(Math.abs(actual.x - expected.x), id).toBeLessThan(0.01)
      expect(Math.abs(actual.y - expected.y), id).toBeLessThan(0.01)
    }
  })
})

test.describe('Angle field and shortcuts of a multi-selection (M3)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('the angle field shows the shared angle and turns the whole selection', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await expect(page.locator('#angle')).toBeVisible()
    expect(await angleField(page)).toBe('0')
    await setAngleField(page, 90)
    expect(await attr(page, 'r1', 'transform')).toBe('rotate(90 210 60)')
    expect(await attr(page, 'r2', 'transform')).toBe('rotate(90 210 200)')
    expect(await angleField(page)).toBe('90')
    expect(await undoSize(page)).toBe(1)
    // The same value again changes nothing.
    await setAngleField(page, 90)
    expect(await undoSize(page)).toBe(1)
    // Typed key by key, to 0: both elements are straight again, at their
    // first place.
    await typeAngle(page, 0)
    expect(await attr(page, 'r1', 'transform')).toBeNull()
    expect(await attr(page, 'r1', 'x')).toBe('100')
    expect(await attr(page, 'r2', 'x')).toBe('240')
  })

  test('with different angles, the field shows the rotations applied to the selection', async ({ page }) => {
    await select(page, ['r1', 'rr'])
    // Different angles: the field shows "Mixed" (M4), and is empty.
    expect(await angleField(page)).toBe('')
    expect(await page.locator('#angle').evaluate((el) => el.mixed)).toBe(true)
    // The shortcuts turn the whole selection: the field shows the rotation
    // applied to it.
    await page.locator('#svgcanvas').hover({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+ArrowRight')
    expect(await angleOf(page, 'r1')).toBe(1)
    expect(await angleOf(page, 'rr')).toBe(31)
    expect(await angleField(page)).toBe('1')
    // Typed then, the field turns the frame to the new value, not by it.
    await typeAngle(page, 25)
    expect(await angleOf(page, 'r1')).toBe(25)
    expect(await angleOf(page, 'rr')).toBe(55)
    expect(await angleField(page)).toBe('25')
    // The shortcuts add up in the same angle (once the field has lost the
    // focus, which keeps the arrows otherwise).
    await page.locator('#angle').locator('#input').blur()
    await page.keyboard.press('Control+ArrowRight')
    expect(await angleField(page)).toBe('26')
    // After an undo (which clears the selection), the angles differ from
    // those recorded: "Mixed" again.
    await page.keyboard.press('Control+z')
    await select(page, ['r1', 'rr'])
    expect(await angleOf(page, 'r1')).toBe(25)
    expect(await angleField(page)).toBe('')
    expect(await page.locator('#angle').evaluate((el) => el.mixed)).toBe(true)
  })

  test('Ctrl+arrows turn a multi-selection by 1 degree, with Shift by 15', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await page.locator('#svgcanvas').hover({ position: { x: 5, y: 5 } })
    await page.keyboard.press('Control+ArrowRight')
    expect(await angleOf(page, 'r1')).toBe(1)
    expect(await angleOf(page, 'r2')).toBe(1)
    await page.keyboard.press('Control+Shift+ArrowLeft')
    expect(await angleOf(page, 'r1')).toBe(-14)
    expect(await angleOf(page, 'r2')).toBe(-14)
    expect(await undoSize(page)).toBe(2)
  })

  test('setRotationAngle turns a multi-selection, not only its first element', async ({ page }) => {
    await select(page, ['r1', 'r2'])
    await page.evaluate(() => window.svgEditor.svgCanvas.setRotationAngle(90))
    expect(await attr(page, 'r1', 'transform')).toBe('rotate(90 210 60)')
    expect(await attr(page, 'r2', 'transform')).toBe('rotate(90 210 200)')
  })
})
