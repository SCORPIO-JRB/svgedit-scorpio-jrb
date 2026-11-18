import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Bugs found by the audit of the code (November 2026), in the editor: each
// test first showed the bug, then its correction.
const NS = 'http://www.w3.org/2000/svg'
const drawing = (content, defs = '') =>
  `<svg xmlns="${NS}" width="640" height="480">${defs}<g class="layer"><title>Layer 1</title>${content}</g></svg>`

async function load (page, svg, zoom = 1) {
  await page.evaluate(({ svg, zoom }) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    const canvas = window.svgEditor.svgCanvas
    canvas.setSvgString(svg)
    canvas.setZoom(zoom)
    window.svgEditor.updateCanvas()
    canvas.clearSelection()
    canvas.undoMgr.resetUndoStack()
  }, { svg, zoom })
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
