import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, screenPoint } from './helpers.js'

// Corrections after the selection rework. Question 10: converting a shape to
// a path wrote fill-opacity="null" and other "null" attributes, and took the
// style of the last clicked shape when the shape was not clicked. Shapes
// drawn after a click got the same "null" attributes. The path also lost the
// attributes outside a short list (fill-rule, mask, class…) and the title.

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
<ellipse id="e1" cx="200" cy="200" rx="50" ry="30" fill="#a63" stroke="#00f" stroke-width="3"/>
<rect id="r1" x="350" y="150" width="80" height="60" fill="#3a6" opacity="0.5"/>
<g id="g1" fill="#c0c" stroke="#090"><polygon id="p1" points="100,350 160,350 130,400"/></g>
<text id="t1" x="400" y="400" font-family="Arial">Synoptique</text>
</g></svg>`

// Attributes and a title the conversion used to lose.
const DRAWING_FULL = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>
<defs><mask id="m1"><rect x="0" y="0" width="640" height="480" fill="#fff"/></mask></defs>
<polygon id="star" points="150,20 209,200 55,90 245,90 91,200" fill="#3a6" fill-rule="evenodd" stroke="#00f" stroke-width="4" stroke-dasharray="10 5" stroke-dashoffset="3" stroke-miterlimit="2" mask="url(#m1)" class="vanne" data-tag="V12"><title>Vanne V12</title></polygon>
<g id="g2" stroke="#000" stroke-width="5" fill-opacity="0.3"><rect id="r2" x="350" y="300" width="80" height="60" fill="#c00" stroke-width="1" fill-opacity="1"/></g>
</g></svg>`

// Values at their default that a group, a style sheet or a <use> overrides.
const DRAWING_DEFAULTS = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="640" height="480"><style>.epais { stroke-width: 6px }</style><g class="layer"><title>Layer 1</title>
<g id="g2" stroke="#000" stroke-width="5"><rect id="r2" x="350" y="300" width="80" height="60" fill="#c00" stroke-width="1"/></g>
<g id="g3" class="epais" stroke="#000"><rect id="r3" x="350" y="50" width="80" height="60" fill="#c00" stroke-width="1"/></g>
<rect id="r4" x="50" y="300" width="80" height="60" fill="#c00" stroke="#000" stroke-width="1" opacity="1"/>
<rect id="r5" x="200" y="300" width="80" height="60" fill="#c00" rx="0" ry="10"/>
<rect id="r6" x="50" y="50" width="80" height="60" fill="#c00" stroke="#00f" stroke-width="1"/>
<g id="g4" stroke-width="5"><use id="u1" xlink:href="#r6" x="150" y="0"/></g>
</g></svg>`

async function loadDrawing (page, drawing = DRAWING) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, drawing)
}

async function settle (page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))
  await page.waitForFunction(() => !window.svgEditor.topPanel.selectionFieldsPending)
}

async function clickCenter (page, id) {
  const box = await page.locator(`#${id}`).boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await settle(page)
}

// The attributes of an element but its geometry, as name → value. The
// pointer-events style the editor sets on every element of a layer, and does
// not save, is left out.
const style = (page, id) => page.evaluate((id) => {
  const geometry = new Set(['id', 'd', 'x', 'y', 'width', 'height', 'cx', 'cy', 'rx', 'ry', 'points'])
  return Object.fromEntries([...document.getElementById(id).attributes]
    .filter((a) => !geometry.has(a.name) && !(a.name === 'style' && /^pointer-events: ?inherit;?$/.test(a.value)))
    .map((a) => [a.name, a.value]))
}, id)

const nullAttributes = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#svgcontent *')].flatMap((el) =>
    [...el.attributes].filter((a) => a.value === 'null' || a.value === 'undefined').map((a) => `${el.id || el.tagName} ${a.name}`)))

const tagOf = (page, id) => page.evaluate((id) => document.getElementById(id).tagName, id)

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
  await loadDrawing(page)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe('Convert to path keeps the style of the shape (question 10)', () => {
  test('a clicked shape becomes a path with its style and no "null" attribute', async ({ page }) => {
    await clickCenter(page, 'e1')
    await page.locator('#tool_topath').click()
    await settle(page)
    expect(await tagOf(page, 'e1')).toBe('path')
    expect(await style(page, 'e1')).toEqual({ fill: '#a63', stroke: '#00f', 'stroke-width': '3' })
    expect(await nullAttributes(page)).toEqual([])
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await tagOf(page, 'e1')).toBe('ellipse')
  })

  test('a shape selected without a click keeps its own style, not the last clicked one', async ({ page }) => {
    await clickCenter(page, 'e1')
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('r1')], true)
      canvas.convertToPath()
    })
    expect(await tagOf(page, 'r1')).toBe('path')
    expect(await style(page, 'r1')).toEqual({ fill: '#3a6', opacity: '0.5' })
    expect(await nullAttributes(page)).toEqual([])
  })

  test('a shape in a group still takes the fill and stroke of its group', async ({ page }) => {
    const before = await page.evaluate(() => {
      const { fill, stroke } = getComputedStyle(document.getElementById('p1'))
      return { fill, stroke }
    })
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('p1')], true)
      canvas.convertToPath()
    })
    expect(await tagOf(page, 'p1')).toBe('path')
    expect(await page.evaluate(() => document.getElementById('p1').parentNode.id)).toBe('g1')
    expect(await style(page, 'p1')).toEqual({})
    const after = await page.evaluate(() => {
      const { fill, stroke } = getComputedStyle(document.getElementById('p1'))
      return { fill, stroke }
    })
    expect(after).toEqual(before)
  })

  test('the shapes of a multi-selection keep their own style and opacity', async ({ page }) => {
    await clickCenter(page, 'e1')
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly(['e1', 'r1'].map((id) => document.getElementById(id)), true))
    await settle(page)
    await page.locator('#tool_topath_multi').click()
    await settle(page)
    expect(await style(page, 'e1')).toEqual({ fill: '#a63', stroke: '#00f', 'stroke-width': '3' })
    expect(await style(page, 'r1')).toEqual({ fill: '#3a6', opacity: '0.5' })
    expect(await nullAttributes(page)).toEqual([])
  })
})

test.describe('A shape drawn after a click leaves out the style the clicked shape does not have (question 10)', () => {
  // Drawn on an empty part of the page, from (550, 200) to (620, 250).
  const drawRect = async (page) => {
    await page.keyboard.press('r')
    const from = await screenPoint(page, 550, 200)
    const to = await screenPoint(page, 620, 250)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 5 })
    await page.mouse.up()
    await settle(page)
  }

  test('a rectangle drawn after a click on a shape takes its style without "null"', async ({ page }) => {
    await clickCenter(page, 'e1')
    await drawRect(page)
    const drawn = await page.evaluate(() => {
      const rect = [...document.querySelectorAll('#svgcontent rect')].find((el) => el.id !== 'r1')
      return rect && { fill: rect.getAttribute('fill'), stroke: rect.getAttribute('stroke'), width: rect.getAttribute('stroke-width') }
    })
    expect(drawn).toEqual({ fill: '#a63', stroke: '#00f', width: '3' })
    expect(await nullAttributes(page)).toEqual([])
  })

  test('a rectangle drawn in a group, after a click on a shape without fill, still takes the fill of the group', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.setContext(document.getElementById('g1')))
    await clickCenter(page, 'p1')
    await drawRect(page)
    const drawn = await page.evaluate(() => {
      const rect = document.querySelector('#g1 rect')
      return rect && { fill: rect.getAttribute('fill'), stroke: rect.getAttribute('stroke'), computed: getComputedStyle(rect).fill }
    })
    expect(drawn).toEqual({ fill: null, stroke: null, computed: 'rgb(204, 0, 204)' })
    expect(await nullAttributes(page)).toEqual([])
  })

  test('a text written after a click on a text without a size has no size either', async ({ page }) => {
    await clickCenter(page, 't1')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurText('font_family'))).toBe('Arial')
    await page.keyboard.press('t')
    const at = await screenPoint(page, 500, 300)
    await page.mouse.click(at.x, at.y)
    await page.keyboard.type('Nouveau')
    await page.keyboard.press('Escape')
    await settle(page)
    const written = await page.evaluate(() => {
      const text = [...document.querySelectorAll('#svgcontent text')].find((el) => el.id !== 't1')
      return text && {
        family: text.getAttribute('font-family'),
        size: text.getAttribute('font-size'),
        sameSize: getComputedStyle(text).fontSize === getComputedStyle(document.getElementById('t1')).fontSize
      }
    })
    expect(written).toEqual({ family: 'Arial', size: null, sameSize: true })
    expect(await nullAttributes(page)).toEqual([])
  })
})

test.describe('Convert to path keeps everything the shape has but its geometry (question 10)', () => {
  test.beforeEach(async ({ page }) => {
    await loadDrawing(page, DRAWING_FULL)
  })

  test('fill-rule, mask, dash offset, class, data and the title are kept, and undo gives the shape back', async ({ page }) => {
    const before = await style(page, 'star')
    expect(before['fill-rule']).toBe('evenodd')
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('star')], true))
    await settle(page)
    await page.locator('#tool_topath').click()
    await settle(page)
    expect(await tagOf(page, 'star')).toBe('path')
    expect(await style(page, 'star')).toEqual(before)
    const kept = await page.evaluate(() => {
      const path = document.getElementById('star')
      // The centre of the star is a hole with evenodd, and filled with nonzero.
      return {
        hole: !path.isPointInFill(new DOMPoint(150, 125)),
        title: [...path.children].map((child) => `${child.localName} ${child.textContent}`),
        saved: window.svgEditor.svgCanvas.getSvgString()
      }
    })
    expect(kept.hole).toBe(true)
    expect(kept.title).toEqual(['title Vanne V12'])
    expect(kept.saved).toMatch(/<path [^>]*fill-rule="evenodd"[^>]*>\s*<title>Vanne V12<\/title>\s*<\/path>/)
    expect(await nullAttributes(page)).toEqual([])
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await tagOf(page, 'star')).toBe('polygon')
    expect(await style(page, 'star')).toEqual(before)
    expect(await page.evaluate(() => document.getElementById('star').children.length)).toBe(1)
  })

  test('an attribute at its default value is kept, so the group does not override it in the drawing', async ({ page }) => {
    const computed = () => page.evaluate(() => {
      const { strokeWidth, fillOpacity } = getComputedStyle(document.getElementById('r2'))
      return { strokeWidth, fillOpacity }
    })
    const before = await computed()
    expect(before).toEqual({ strokeWidth: '1px', fillOpacity: '1' })
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('r2')], true)
      canvas.convertToPath()
    })
    expect(await tagOf(page, 'r2')).toBe('path')
    expect(await style(page, 'r2')).toEqual({ fill: '#c00', 'stroke-width': '1', 'fill-opacity': '1' })
    expect(await computed()).toEqual(before)
  })
})

test.describe('Saving leaves out a default value only where it changes nothing (question 10)', () => {
  test.beforeEach(async ({ page }) => {
    await loadDrawing(page, DRAWING_DEFAULTS)
  })

  // The tag of an element in the saved text.
  const tagIn = (saved, id) => saved.match(new RegExp(`<[a-z]+ [^>]*\\bid="${id}"[^>]*>`))?.[0] ?? ''
  const widths = (page) => page.evaluate(() => Object.fromEntries(['r2', 'r3', 'r4'].map((id) =>
    [id, getComputedStyle(document.getElementById(id)).strokeWidth])))

  test('a default a group, a style sheet or a <use> overrides is saved, and saving changes nothing in the drawing', async ({ page }) => {
    const before = await widths(page)
    expect(before).toEqual({ r2: '1px', r3: '1px', r4: '1px' })
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(tagIn(saved, 'r2')).toContain('stroke-width="1"')
    expect(tagIn(saved, 'r3')).toContain('stroke-width="1"')
    expect(tagIn(saved, 'r6')).toContain('stroke-width="1"')
    expect(tagIn(saved, 'r5')).toContain('rx="0"')
    // Nothing overrides these: they are left out, as before.
    expect(tagIn(saved, 'r4')).not.toContain('stroke-width')
    expect(tagIn(saved, 'r4')).not.toContain('opacity')
    // The drawing keeps them all.
    expect(await page.evaluate(() => ['r2', 'r4'].map((id) => document.getElementById(id).getAttribute('stroke-width')))).toEqual(['1', '1'])
    expect(await page.evaluate(() => document.getElementById('r4').getAttribute('opacity'))).toBe('1')
    expect(await widths(page)).toEqual(before)
    // Reopened, the file looks the same.
    await loadDrawing(page, saved)
    expect(await widths(page)).toEqual(before)
    expect(await page.evaluate(() => document.getElementById('r5').getAttribute('rx'))).toBe('0')
  })

  test('a shape drawn with a stroke width of 1 in a group with a wider stroke keeps its width', async ({ page }) => {
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.setContext(document.getElementById('g2'))
      canvas.clearSelection()
      canvas.setStrokeWidth(1)
    })
    await page.keyboard.press('r')
    const box = await page.locator('#svgcontent').boundingBox()
    await page.mouse.move(box.x + 450, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x + 520, box.y + 250, { steps: 5 })
    await page.mouse.up()
    await settle(page)
    const drawn = await page.evaluate(() => {
      const rect = document.querySelector('#g2 rect:not(#r2)')
      return rect && { width: rect.getAttribute('stroke-width'), computed: getComputedStyle(rect).strokeWidth, id: rect.id }
    })
    expect(drawn).toMatchObject({ width: '1', computed: '1px' })
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(tagIn(saved, drawn.id)).toContain('stroke-width="1"')
  })
  test('a group pasted with a child at a stroke width of 1 keeps it', async ({ page }) => {
    const pasted = await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('g2')], true)
      canvas.copySelectedElements()
      canvas.pasteElements('in_place')
      const group = canvas.getSelectedElements().filter(Boolean)[0]
      const rect = group?.querySelector('rect')
      return rect && { group: group.id !== 'g2', width: rect.getAttribute('stroke-width'), computed: getComputedStyle(rect).strokeWidth }
    })
    expect(pasted).toEqual({ group: true, width: '1', computed: '1px' })
  })
})
