import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot V4, contextual editing: geometric hover and rubber band (4.3).

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <ellipse id="el" cx="200" cy="150" rx="80" ry="30" fill="#3a6" transform="rotate(30 200 150)"/>
    <line id="ln" x1="400" y1="60" x2="560" y2="220" stroke="#000" stroke-width="2"/>
    <text id="tx" x="80" y="320" font-size="20" font-family="sans-serif"><tspan x="80" y="320">Première ligne</tspan><tspan x="80" y="350">Deuxième</tspan></text>
    <g id="grp"><rect id="ga" x="400" y="320" width="40" height="40" fill="#36a"/><rect id="gb" x="460" y="320" width="40" height="40" fill="#36a"/></g>
    <path id="ring" d="M300,300 h80 v80 h-80 Z M320,320 v40 h40 v-40 Z" fill="#a63" fill-rule="evenodd"/>
  </g>
</svg>`

async function loadDrawing (page, svg = DRAWING) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

// Screen point of a point of the drawing.
const toScreen = (page, x, y) => page.evaluate(({ x, y }) => {
  const m = document.querySelector('#svgcontent g.layer').getScreenCTM()
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}, { x, y })

const moveTo = async (page, x, y) => {
  const point = await toScreen(page, x, y)
  await page.mouse.move(point.x, point.y)
}

const hover = (page) => page.evaluate(() => {
  const outline = document.getElementById('selectorHover')
  return {
    shown: outline.getAttribute('display') !== 'none',
    target: window.svgEditor.svgCanvas.selectorManager.hoverTarget?.id ?? null,
    d: outline.getAttribute('d'),
    transform: outline.getAttribute('transform') || ''
  }
})

const selection = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id).sort())

/** A rubber band from one point of the drawing to another. */
async function band (page, from, to) {
  await moveTo(page, ...from)
  await page.mouse.down()
  await moveTo(page, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2)
  await moveTo(page, ...to)
  await page.mouse.up()
}

test.describe('Geometric hover (V4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a turned ellipse is outlined by its own outline, in its matrix, and not from the corner of its box', async ({ page }) => {
    const before = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    await moveTo(page, 200, 150)
    const outline = await hover(page)
    expect(outline).toMatchObject({ shown: true, target: 'el' })
    expect(outline.d).toBe('M120,150A80,30 0 1 0 280,150A80,30 0 1 0 120,150Z')
    expect(outline.transform).toMatch(/^matrix\(/)
    // The outline follows the ellipse on the screen.
    const ends = await page.evaluate(() => {
      const outline = document.getElementById('selectorHover')
      const ellipse = document.getElementById('el')
      const a = outline.getBoundingClientRect()
      const b = ellipse.getBoundingClientRect()
      return [a.x - b.x, a.y - b.y, a.width - b.width, a.height - b.height].map((n) => Math.abs(n) < 1.5)
    })
    expect(ends).toEqual([true, true, true, true])
    // 1.5 px on the screen, whatever the zoom
    expect(await page.evaluate(() => {
      const outline = document.getElementById('selectorHover')
      return [outline.getAttribute('stroke-width'), outline.getAttribute('vector-effect'), outline.getAttribute('fill')]
    })).toEqual(['1.5', 'non-scaling-stroke', 'none'])
    // Nothing written in the drawing
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(before)

    // The upper right corner of the box, outside the ellipse: no outline.
    await moveTo(page, 262, 110)
    expect((await hover(page)).shown).toBe(false)
  })

  test('a text is underlined line by line', async ({ page }) => {
    const box = await page.evaluate(() => {
      const b = document.getElementById('tx').getBBox()
      return { x: b.x, y: b.y, width: b.width, height: b.height }
    })
    await moveTo(page, box.x + 10, box.y + 8)
    const outline = await hover(page)
    expect(outline).toMatchObject({ shown: true, target: 'tx' })
    const lines = outline.d.match(/M[^M]+/g)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^M80,320H\d/)
    expect(lines[1]).toMatch(/^M80,350H\d/)
  })

  test('a closed group keeps the frame of its selection', async ({ page }) => {
    await moveTo(page, 420, 340)
    const outline = await hover(page)
    expect(outline).toMatchObject({ shown: true, target: 'grp' })
    const frame = await page.evaluate(() => {
      const selector = window.svgEditor.svgCanvas.selectorManager.requestSelector(document.getElementById('grp'))
      return selector.selectorRect.getAttribute('d')
    })
    expect(outline.d).toBe(frame)
  })

  test('the hole of a path is not the path, the band of the path is', async ({ page }) => {
    await moveTo(page, 340, 340)
    expect((await hover(page)).shown).toBe(false)
    await moveTo(page, 310, 340)
    const d = await page.evaluate(() => document.getElementById('ring').getAttribute('d'))
    expect(await hover(page)).toMatchObject({ shown: true, target: 'ring', d })
  })

  test('with Ctrl, the outline shows the child a Ctrl+click takes', async ({ page }) => {
    await moveTo(page, 470, 340)
    expect((await hover(page)).target).toBe('grp')
    await page.keyboard.down('Control')
    await moveTo(page, 471, 340)
    expect(await hover(page)).toMatchObject({ shown: true, target: 'gb', d: 'M460,320H500V360H460Z' })
    await page.keyboard.up('Control')
  })
})

test.describe('Geometric rubber band (V4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a band over the corner of the box of a turned ellipse does not take it; over the ellipse, it does', async ({ page }) => {
    // The box of the ellipse goes from about (129, 102) to (271, 198); its
    // upper right corner is empty.
    await band(page, [250, 80], [290, 115])
    expect(await selection(page)).toEqual([])
    await band(page, [220, 80], [290, 150])
    expect(await selection(page)).toEqual(['el'])
  })

  test('a line is taken only when the band meets it', async ({ page }) => {
    // A band in the lower left corner of the box of the diagonal line
    await band(page, [395, 160], [440, 225])
    expect(await selection(page)).toEqual([])
    await band(page, [395, 160], [520, 225])
    expect(await selection(page)).toEqual(['ln'])
  })

  test('a band inside the hole of a path does not take it, a band inside its fill does', async ({ page }) => {
    await band(page, [325, 325], [355, 355])
    expect(await selection(page)).toEqual([])
    await band(page, [302, 302], [315, 315])
    expect(await selection(page)).toEqual(['ring'])
  })

  test('a group is taken when the band meets one of its children, not the gap between them', async ({ page }) => {
    await band(page, [445, 300], [455, 380])
    expect(await selection(page)).toEqual([])
    await band(page, [445, 300], [465, 380])
    expect(await selection(page)).toEqual(['grp'])
  })
})
