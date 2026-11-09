import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

/**
 * What the tests of 8 November with five real files found around the import
 * (lot 6): the gradients of a file changed when it was opened again or
 * ungrouped, X and Y of an import showed "null", ungrouping an import took
 * two undo steps, and each opening added identifiers to an import.
 */

const NS = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'

// Gradients that the conversion to bounding box units drew differently: one
// shared by two shapes, one taking its units and stops from another (href),
// a slanted one on a shape that is not square, a radial one.
const GRADIENTS = '<defs>' +
  '<linearGradient id="shared" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="300" y2="0"><stop offset="0" stop-color="#f60"/><stop offset="1" stop-color="#03c"/></linearGradient>' +
  '<linearGradient id="base" gradientUnits="userSpaceOnUse" x1="40" y1="0" x2="240" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fc0"/></linearGradient>' +
  '<linearGradient id="inherits" x1="40" y1="120" x2="240" y2="200" xlink:href="#base"/>' +
  '<linearGradient id="slanted" gradientUnits="userSpaceOnUse" x1="40" y1="260" x2="120" y2="340" gradientTransform="rotate(10 40 260)"><stop offset="0" stop-color="#36a"/><stop offset="1" stop-color="#f6a"/></linearGradient>' +
  '<radialGradient id="round" gradientUnits="userSpaceOnUse" cx="480" cy="300" r="70"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>' +
  '</defs>'
const SHAPES = '<rect id="s1" x="20" y="20" width="120" height="70" fill="url(#shared)"/>' +
  '<rect id="s2" x="180" y="20" width="120" height="70" fill="url(#shared)"/>' +
  '<rect id="i1" x="40" y="120" width="200" height="80" fill="url(#inherits)"/>' +
  '<rect id="sl" x="40" y="260" width="240" height="60" fill="url(#slanted)"/>' +
  '<ellipse id="ro" cx="480" cy="300" rx="120" ry="40" fill="url(#round)"/>'
const DRAWING = `<svg xmlns="${NS}" xmlns:xlink="${XLINK}" width="640" height="480">${GRADIENTS}` +
  `<g class="layer"><title>Layer 1</title>${SHAPES}</g></svg>`

const openDrawing = (page, markup) => page.evaluate((markup) => {
  window.svgEditor.setConfig({ gridSnapping: false })
  window.svgEditor.svgCanvas.setSvgString(markup)
  window.svgEditor.svgCanvas.setZoom(1)
  window.svgEditor.updateCanvas()
  window.svgEditor.svgCanvas.clearSelection()
  window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
}, markup)

const saved = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

/**
 * The number of pixels that differ between two SVG texts drawn at 640 x 480
 * by the browser, as an image (as a viewer of the saved file sees them).
 */
const differingPixels = (page, a, b) => page.evaluate(async ({ a, b }) => {
  const pixels = (text) => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, 640, 480)
      context.drawImage(img, 0, 0, 640, 480)
      resolve(context.getImageData(0, 0, 640, 480).data)
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text)
  })
  const [pa, pb] = await Promise.all([pixels(a), pixels(b)])
  let differ = 0
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2])) > 24) differ++
  }
  return differ
}, { a, b })

// Pixels that may differ when the same drawing is written another way (edges
// smoothed differently by a browser); the defects gave tens of thousands.
const SAME = 60

/** The drawing as it should look: the given shape under a transform. */
const withTransform = (markup, id, transform) => markup.replace(`id="${id}"`, `id="${id}" transform="${transform}"`)

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe('Gradients in user units (lot 6)', () => {
  test.beforeEach(async ({ page }) => {
    await openDrawing(page, DRAWING)
  })

  test('an opened drawing looks as the file, saved and opened again', async ({ page }) => {
    const first = await saved(page)
    expect(await differingPixels(page, DRAWING, first)).toBeLessThan(SAME)
    await openDrawing(page, first)
    expect(await saved(page)).toBe(first)
  })

  test('a gradient follows its shape when it moves, scales or flips, in one undo step each', async ({ page }) => {
    const gestures = [
      ['move', () => window.svgEditor.svgCanvas.moveSelectedElements(30, 20), 'translate(30 20)'],
      ['scale', () => window.svgEditor.svgCanvas.scaleSelectedElements(1.5, 0.5, 40, 260), 'matrix(1.5 0 0 0.5 -20 130)'],
      ['flip', () => window.svgEditor.svgCanvas.flipSelectedElements(-1, 1), 'matrix(-1 0 0 1 320 0)']
    ]
    for (const [name, gesture, transform] of gestures) {
      await openDrawing(page, DRAWING)
      await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('sl')], true))
      await page.evaluate(gesture)
      expect(await undoSize(page), name).toBe(1)
      // The slanted gradient stays where it was on the shape
      expect(await differingPixels(page, withTransform(DRAWING, 'sl', transform), await saved(page)), name).toBeLessThan(SAME)
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await differingPixels(page, DRAWING, await saved(page)), name).toBeLessThan(SAME)
    }
  })

  test('a gradient shared with another shape, or made from another, is copied: the others keep theirs', async ({ page }) => {
    await page.evaluate(() => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById('s1')], true)
      canvas.moveSelectedElements(0, 100)
      canvas.selectOnly([document.getElementById('i1')], true)
      canvas.moveSelectedElements(300, 0)
    })
    const state = await page.evaluate(() => ({
      s1: document.getElementById('s1').getAttribute('fill'),
      s2: document.getElementById('s2').getAttribute('fill'),
      shared: document.getElementById('shared').getAttribute('gradientTransform'),
      base: document.getElementById('base').getAttribute('gradientTransform'),
      inherits: document.getElementById('inherits').getAttribute('gradientTransform')
    }))
    expect(state.s1).not.toBe('url(#shared)')
    expect(state.s2).toBe('url(#shared)')
    expect(state.shared).toBeNull()
    // #base may be the gradient of other shapes: #inherits takes the move
    expect(state.base).toBeNull()
    expect(state.inherits).toBe('translate(300 0)')
    const expected = withTransform(withTransform(DRAWING, 's1', 'translate(0 100)'), 'i1', 'translate(300 0)')
    expect(await differingPixels(page, expected, await saved(page))).toBeLessThan(SAME)
  })
})

test.describe('An import, ungrouped and opened again (lot 6)', () => {
  // As Inkscape or Illustrator write it: a version, objects without
  // identifiers, a transform on a group. The background fills the page, so
  // that centering the import on the page does not move it.
  const FILE = `<svg xmlns="${NS}" xmlns:xlink="${XLINK}" version="1.1" viewBox="0 0 640 480">${GRADIENTS}` +
    `<g class="layer"><title>Layer 1</title><rect width="640" height="480" fill="#eee"/>${SHAPES}` +
    '<g transform="translate(320 360)"><rect width="200" height="80" fill="url(#base)"/></g></g></svg>'

  const importFile = async (page, name, text) => {
    await page.evaluate(({ name, text }) => {
      const data = new DataTransfer()
      data.items.add(new File([text], name, { type: 'image/svg+xml' }))
      document.getElementById('workarea').dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }))
    }, { name, text })
    await page.waitForFunction(() => document.querySelector('#svgcontent g.layer use'))
    return page.evaluate(() => document.querySelector('#svgcontent g.layer use').id)
  }

  test.beforeEach(async ({ page }) => {
    await openDrawing(page, `<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>Layer 1</title></g></svg>`)
  })

  test('X, Y, W and H of an import show its box, and move and size it', async ({ page }) => {
    const id = await importFile(page, 'machine.svg', FILE)
    await page.waitForFunction(() => !window.svgEditor.topPanel.selectionFieldsPending)
    const fields = () => page.evaluate(() => ['selected_x', 'selected_y', 'selected_w', 'selected_h'].map((field) => document.getElementById(field).value))
    const box = () => page.evaluate((id) => {
      const b = window.svgEditor.svgCanvas.getSelectionBox([document.getElementById(id)])
      return [b.x, b.y, b.width, b.height].map((n) => String(Math.round(n * 100) / 100))
    }, id)
    expect(await fields()).toEqual(await box())

    for (const [field, value] of [['selected_x', '10'], ['selected_y', '20'], ['selected_w', '300']]) {
      await page.evaluate(({ field, value }) => {
        const input = document.getElementById(field)
        input.value = value
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }, { field, value })
    }
    const [x, y, w] = await box()
    expect([x, y, w]).toEqual(['10', '20', '300'])
    expect(await fields()).toEqual(await box())
  })

  test('ungrouping an import keeps its look, in one undo step', async ({ page }) => {
    const id = await importFile(page, 'machine.svg', FILE)
    const imported = await saved(page)
    expect(await differingPixels(page, FILE.replace('viewBox="0 0 640 480"', 'width="640" height="480"'), imported)).toBeLessThan(SAME)
    const steps = await undoSize(page)

    await page.evaluate((id) => {
      const canvas = window.svgEditor.svgCanvas
      canvas.selectOnly([document.getElementById(id)], true)
      canvas.ungroupSelectedElement()
    }, id)
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent use, #svgcontent symbol').length)).toBe(0)
    expect(await differingPixels(page, imported, await saved(page))).toBeLessThan(SAME)
    expect(await undoSize(page)).toBe(steps + 1)

    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await saved(page)).toBe(imported)
  })

  test('a drawing saved with an import opens again unchanged', async ({ page }) => {
    await importFile(page, 'machine.svg', FILE)
    const first = await saved(page)
    await openDrawing(page, first)
    expect(await saved(page)).toBe(first)
    // Neither the version of the file nor identifiers added to its objects
    // (Firefox keeps the gradients of an import in the <defs> of the drawing)
    expect(first).not.toContain('version=')
    const ids = await page.evaluate(() => [...document.querySelectorAll('#svgcontent symbol [id]')].map((elem) => elem.id))
    expect(ids.filter((id) => !['base', 'i1', 'inherits', 'ro', 'round', 's1', 's2', 'shared', 'sl', 'slanted'].includes(id))).toEqual([])
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent symbol rect:not([id]), #svgcontent symbol g:not([id])').length)).toBe(4)
  })
})
