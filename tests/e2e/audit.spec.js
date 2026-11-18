import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, screenPoint, chooseTool } from './helpers.js'

// Bugs found by the audit of the code (November 2026), in the editor: each
// test first showed the bug, then its correction.
const NS = 'http://www.w3.org/2000/svg'
const drawing = (content, defs = '') =>
  `<svg xmlns="${NS}" width="640" height="480">${defs}<g class="layer"><title>Layer 1</title>${content}</g></svg>`

async function load (page, svg, zoom = 1) {
  await page.evaluate(({ svg, zoom }) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    const canvas = window.svgEditor.svgCanvas
    canvas.setSvgString(svg)
    canvas.setZoom(zoom)
    window.svgEditor.updateCanvas()
    canvas.clearSelection()
    canvas.undoMgr.resetUndoStack()
  }, { svg, zoom })
}

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const attr = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id)?.getAttribute(name), { id, name })
const clickAt = async (page, x, y) => {
  const point = await screenPoint(page, x, y)
  await page.mouse.click(point.x, point.y)
}

test.describe('audit corrections: files', () => {
  // Without the File System Access API, the editor opens a plain file
  // input, which a test can fill.
  const pickFile = async (page, file) => {
    const chooser = page.waitForEvent('filechooser')
    await page.evaluate(() => document.getElementById('tool_open').click())
    await (await chooser).setFiles(file)
  }

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { delete window.showOpenFilePicker })
    await visitAndApproveStorage(page)
    await load(page, drawing('<rect id="r1" x="10" y="10" width="50" height="50"/>'))
  })

  test('opening a file that is not a drawing leaves the current one in place', async ({ page }) => {
    // The picker also offers images: one used to cost the drawing
    await pickFile(page, {
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03])
    })

    await expect(page.getByText('Error: Unable to load SVG data')).toBeVisible()
    expect(await page.evaluate(() => Boolean(document.getElementById('r1')))).toBe(true)
  })

  test('opening a drawing still replaces the current one', async ({ page }) => {
    await pickFile(page, {
      name: 'plan.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(drawing('<circle id="opened" cx="100" cy="100" r="40"/>'))
    })

    await page.waitForFunction(() => Boolean(document.getElementById('opened')))
    expect(await page.evaluate(() => Boolean(document.getElementById('r1')))).toBe(false)
  })
})

test.describe('audit corrections: gestures', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('a click on a resize grip, without a move, writes nothing in the drawing', async ({ page }) => {
    await load(page, drawing(
      '<rect id="r1" x="100" y="100" width="120" height="60" fill="#3a6"/>' +
      '<rect id="r2" x="300" y="100" width="120" height="60" fill="#3a6" transform="rotate(30 360 130)"/>'
    ))
    for (const id of ['r1', 'r2']) {
      const before = await attr(page, id, 'transform')
      await page.evaluate((id) => window.svgEditor.svgCanvas.selectOnly([document.getElementById(id)], true), id)
      const grip = await page.locator('#selectorGrip_resize_se').boundingBox()
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
      await page.mouse.down()
      await page.mouse.up()

      // The press adds three transforms for the gesture: they must not stay
      expect(await attr(page, id, 'transform')).toBe(before)
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).not.toContain('matrix(1 0 0 1 0 0)')
      expect(await undoSize(page)).toBe(0)
    }
  })

  // The commands of the paths that clicks of the pen leave: "ML", "MLLLz"...
  const penPaths = async (page, clicks) => {
    await load(page, drawing(''))
    await chooseTool(page, 'tool_path')
    for (const [x, y] of clicks) await clickAt(page, x, y)
    return page.evaluate(() => [...document.querySelectorAll('#svgcontent g.layer > path')]
      .map((path) => path.getAttribute('d').match(/[a-z]/gi).join('')))
  }
  const A = [300, 100]
  const B = [400, 200]
  const C = [300, 300]

  test('the pen: a click on the last point of two ends the path, open', async ({ page }) => {
    // It closed the path onto its start: a line drawn twice
    expect(await penPaths(page, [A, B, B])).toEqual(['ML'])
  })

  test('the pen: a click on the first point of two ends the path, open', async ({ page }) => {
    expect(await penPaths(page, [A, B, A])).toEqual(['ML'])
  })

  test('the pen: a click on a point other than the first ends the path, open', async ({ page }) => {
    // A click on the second point closed the path
    expect(await penPaths(page, [A, B, C, B])).toEqual(['MLL'])
    expect(await penPaths(page, [A, B, C, C])).toEqual(['MLL'])
  })

  test('the pen: a click on the first point still closes a path of three points', async ({ page }) => {
    expect(await penPaths(page, [A, B, C, A])).toEqual(['MLLLz'])
  })

  test('a drag released outside the canvas ends there', async ({ page }) => {
    await load(page, drawing('<rect id="r1" x="200" y="200" width="80" height="60" fill="#3a6"/>'))
    const start = await screenPoint(page, 240, 230)
    const panel = await page.locator('.se-inspector').boundingBox()
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 60, start.y, { steps: 6 })
    await page.mouse.move(panel.x + panel.width / 2, start.y, { steps: 10 })
    await page.mouse.up()

    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getStarted())).toBe(false)
    expect(await undoSize(page)).toBe(1)
    const released = await attr(page, 'r1', 'x')
    expect(Number(released)).toBeGreaterThan(200)

    // Back over the canvas, button up: the object used to follow the pointer
    await page.mouse.move(start.x - 100, start.y + 80, { steps: 10 })
    expect(await attr(page, 'r1', 'x')).toBe(released)
    expect(await attr(page, 'r1', 'transform')).toBeNull()
    expect(await undoSize(page)).toBe(1)
  })
})

test.describe('audit corrections: panels', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('an arrow chosen once in the inspector is one change and one undo step', async ({ page }) => {
    // The inspector moves the list of the arrows into its panel: connected a
    // second time, the list added its listeners again and said every choice twice
    await load(page, drawing('<line id="l1" x1="100" y1="100" x2="300" y2="200" stroke="#000" stroke-width="2" fill="none"/>'))
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('l1')], true))
    await page.waitForFunction(() => Boolean(document.querySelector('.se-inspector #end_marker_list_opts')))

    const changes = await page.evaluate(() => {
      const list = document.getElementById('end_marker_list_opts')
      const values = [...list.querySelectorAll('se-list-item')].map((item) => item.getAttribute('value'))
      let changes = 0
      list.addEventListener('change', () => { changes++ })
      // What the list of choices sends when one is picked
      list.$dropdown.dispatchEvent(new CustomEvent('selectedindexchange', { detail: { selectedItem: values[1] } }))
      return changes
    })

    expect(changes).toBe(1)
    expect(await attr(page, 'l1', 'marker-end')).toMatch(/^url\(#/)
    expect(await undoSize(page)).toBe(1)
  })

  const SHAPES = drawing(
    '<rect id="n" x="60" y="60" width="80" height="60" fill="none" stroke="#000" stroke-width="4"/>' +
    '<rect id="r" x="200" y="200" width="80" height="60" fill="#33aa66" stroke="#000" stroke-width="2"/>' +
    '<rect id="q" x="400" y="260" width="80" height="60" fill="#3366aa" stroke="#000" stroke-width="2"/>'
  )
  const selection = (page) => page.evaluate(() =>
    window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))

  test('the "+" of the fill follows a selection extended by a Shift+click', async ({ page }) => {
    // The paints of several objects are read after the selection changed:
    // the "+" kept showing for the object without fill selected first, and
    // a click on it removed the fill of the other one.
    await load(page, SHAPES)
    const add = page.locator('.se-paint-add[data-paint="fill"]')
    await clickAt(page, 60, 90)
    expect(await selection(page)).toEqual(['n'])
    await expect(add).toBeVisible()

    await page.keyboard.down('Shift')
    await clickAt(page, 240, 230)
    await page.keyboard.up('Shift')
    expect((await selection(page)).sort()).toEqual(['n', 'r'])

    await expect(add).toBeHidden()
    expect(await attr(page, 'r', 'fill')).toBe('#33aa66')
  })

  test('a colour typed without Enter does not go to the object clicked next', async ({ page }) => {
    await load(page, SHAPES)
    await clickAt(page, 240, 230)
    expect(await selection(page)).toEqual(['r'])
    const field = page.locator('.se-inspector #fill_color #value-field')
    await field.click()
    await field.fill('FF0000')
    // A click on the canvas leaves the focus in the field
    await clickAt(page, 440, 290)
    expect(await selection(page)).toEqual(['q'])
    // The focus goes elsewhere: the field says what was typed
    await page.locator('.se-inspector #stroke_color #value-field').click()

    expect(await attr(page, 'q', 'fill')).toBe('#3366aa')
    expect(await attr(page, 'r', 'fill')).toBe('#33aa66')
    await expect(field).toHaveValue('3366AA')
    expect(await undoSize(page)).toBe(0)
  })

  test('a colour typed and confirmed still goes to the selection', async ({ page }) => {
    await load(page, SHAPES)
    await clickAt(page, 240, 230)
    const field = page.locator('.se-inspector #fill_color #value-field')
    await field.click()
    await field.fill('FF0000')
    await field.press('Enter')
    expect(await attr(page, 'r', 'fill')).toBe('#ff0000')

    // Typed after the selection changed, it is for the new selection
    await clickAt(page, 440, 290)
    await field.click()
    await field.fill('00FF00')
    await page.locator('.se-inspector #stroke_color #value-field').click()
    expect(await attr(page, 'q', 'fill')).toBe('#00ff00')
    expect(await attr(page, 'r', 'fill')).toBe('#ff0000')
  })

  test('the alignment panel lent to the context bar aligns', async ({ page }) => {
    // A press in the panel closed it, as a press outside its menu: the click
    // never reached the button
    await load(page, SHAPES)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly(['r', 'q'].map((id) => document.getElementById(id))))
    await page.locator('#se-context-bar [data-entry="align"]').click()
    await expect(page.locator('#se-ctx-align #tool_align_popup')).toBeVisible()
    await page.locator('#se-ctx-align #tool_align_top').click()

    expect(await attr(page, 'q', 'y')).toBe('200')
    expect(await attr(page, 'r', 'y')).toBe('200')
    expect(await undoSize(page)).toBe(1)
  })
})

test.describe('audit: the PDF export', () => {
  // Written before the libraries that the export never calls left the
  // bundle: the page has the size of the drawing and shows its picture.
  test('the export gives one page of the size of the drawing, with its picture', async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page, drawing('<rect id="r1" x="10" y="10" width="50" height="50" fill="#f00"/>'))

    const pdf = await page.evaluate(async () => {
      const { output } = await window.svgEditor.svgCanvas.exportPDF('plan.pdf', 'dataurlstring')
      const text = atob(output.slice(output.indexOf(',') + 1))
      // The picture is the first image: three bytes a pixel, not compressed
      const image = text.indexOf('/Subtype /Image')
      const pixels = text.indexOf('stream\n', image) + 'stream\n'.length
      return {
        head: text.slice(0, 5),
        pages: text.match(/\/Type \/Page\b/g).length,
        box: /\/MediaBox \[([^\]]*)\]/.exec(text)[1],
        size: /\/Width (\d+)\n\/Height (\d+)/.exec(text.slice(image)).slice(1).map(Number),
        inside: [0, 1, 2].map((i) => text.charCodeAt(pixels + (30 * 640 + 30) * 3 + i))
      }
    })

    expect(pdf).toEqual({
      head: '%PDF-',
      pages: 1,
      box: '0 0 640. 480.',
      size: [640, 480],
      inside: [255, 0, 0]
    })
  })
})
