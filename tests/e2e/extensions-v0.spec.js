import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, screenPoint, chooseTool, clickControl } from './helpers.js'

// V0: the contract of the extensions the editor loads by default. Lots V1 to
// V4 rebuild the shell around the canvas: each extension must still load,
// find the place it puts its buttons in, receive the events it listens to,
// and do what its button says.

// What each extension listens to, besides its callback.
const HOOKS = {
  connector: ['mouseDown', 'mouseMove', 'mouseUp', 'selectedChanged', 'elementChanged', 'IDsUpdated', 'toolButtonStateUpdate'],
  eyedropper: ['selectedChanged', 'mouseDown'],
  grid: ['zoomChanged'],
  markers: ['selectedChanged', 'elementChanged'],
  panning: ['mouseDown', 'mouseUp'],
  shapes: ['mouseDown', 'mouseMove', 'mouseUp'],
  polystar: ['mouseDown', 'mouseMove', 'mouseUp', 'selectedChanged'],
  storage: [],
  opensave: [],
  layer_view: ['layersChanged', 'layerVisChanged']
}

// The buttons and menu items each extension adds.
const BUTTONS = {
  connector: ['tool_connect'],
  eyedropper: ['tool_eyedropper'],
  grid: ['view_grid'],
  markers: ['marker_panel'],
  panning: ['ext-panning'],
  shapes: ['tool_shapelib'],
  polystar: ['tool_star', 'tool_polygon', 'star_panel', 'polygon_panel'],
  storage: [],
  opensave: ['tool_clear', 'tool_open', 'tool_import', 'tool_save', 'tool_save_as'],
  layer_view: ['tool_layerView']
}

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#c00" stroke="#000" stroke-width="2"/>
    <rect id="r2" x="300" y="100" width="80" height="60" fill="#00c"/>
    <line id="l1" x1="100" y1="300" x2="300" y2="320" stroke="#000" stroke-width="3"/>
  </g>
  <g class="layer"><title>Layer 2</title>
    <rect id="r3" x="450" y="300" width="60" height="60" fill="#0a0"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.layersPanel.populateLayers()
    window.svgEditor.svgCanvas.setCurrentLayer('Layer 1')
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

async function settle (page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))
}

async function drag (page, from, to) {
  const a = await screenPoint(page, from.x, from.y)
  const b = await screenPoint(page, to.x, to.y)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.up()
  await settle(page)
}

async function clickAt (page, x, y) {
  const at = await screenPoint(page, x, y)
  await page.mouse.click(at.x, at.y)
  await settle(page)
}

const mode = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getMode())
const visible = (page, id) => page.locator(`#${id}`).isVisible()

const errors = []

// The canvas layout no longer loads ext-shapes and ext-layer_view by default
// (lot S1): the contract holds for them when the extensions option loads
// them, as here. What each layout loads by default is checked at the end.
const RETIRED = ['shapes', 'layer_view']
const ALL = '?extensions=ext-shapes,ext-layer_view'

test.beforeEach(async ({ page }, testInfo) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  if (testInfo.titlePath.some((title) => title.startsWith('Default extensions'))) return
  await visitAndApproveStorage(page, { query: ALL })
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
  await loadDrawing(page)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe('Extensions loaded by default (V0)', () => {
  test('each one is loaded, with the events it listens to', async ({ page }) => {
    const loaded = await page.evaluate(() => Object.fromEntries(
      Object.entries(window.svgEditor.svgCanvas.getExtensions()).map(([name, ext]) =>
        [name, Object.keys(ext).filter((key) => typeof ext[key] === 'function' && key !== 'callback').sort()])))
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(HOOKS).sort())
    for (const [name, hooks] of Object.entries(HOOKS)) {
      expect(loaded[name], name).toEqual(expect.arrayContaining(hooks))
    }
  })

  test('each one finds the place it puts its buttons in', async ({ page }) => {
    const missing = await page.evaluate((buttons) => Object.entries(buttons)
      .flatMap(([name, ids]) => ids.filter((id) => !document.getElementById(id)).map((id) => `${name}: ${id}`)), BUTTONS)
    expect(missing).toEqual([])
  })

  test('the editor still sends every event an extension listens to', async ({ page }) => {
    // Each hook counts its calls, then does what it did.
    await page.evaluate((hooks) => {
      window.__hookCalls = {}
      const exts = window.svgEditor.svgCanvas.getExtensions()
      for (const [name, list] of Object.entries(hooks)) {
        for (const hook of list) {
          const original = exts[name][hook]
          window.__hookCalls[`${name}.${hook}`] = 0
          exts[name][hook] = function (...args) {
            window.__hookCalls[`${name}.${hook}`]++
            return original.apply(this, args)
          }
        }
      }
    }, HOOKS)

    // A selection, a change of colour, a drag, a zoom, a copy pasted with new
    // identifiers, a click on a layer and on its eye.
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r1')], true))
    await settle(page)
    await page.evaluate(() => window.svgEditor.svgCanvas.changeSelectedAttribute('fill', '#0a0'))
    await settle(page)
    await drag(page, { x: 140, y: 130 }, { x: 160, y: 140 })
    // A drag in the select mode ends without mouseUp for the extensions, as in
    // SVG-Edit before the rework: a rectangle drawn on an empty place sends it.
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('rect'))
    await drag(page, { x: 450, y: 50 }, { x: 500, y: 90 })
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r1')], true))
    await page.evaluate(() => window.svgEditor.zoomImage(2))
    await settle(page)
    await page.evaluate(() => {
      window.svgEditor.copySelected()
      window.svgEditor.pasteInCenter()
    })
    await settle(page)
    await page.locator('#layerlist tr.layer td.layername').filter({ hasText: 'Layer 2' }).dispatchEvent('mouseup')
    // The layers panel may be folded: the events are sent as a click would.
    await page.locator('#layerlist tr.layer').filter({ hasText: 'Layer 2' }).locator('td.layervis').dispatchEvent('click')
    await settle(page)

    const calls = await page.evaluate(() => window.__hookCalls)
    const silent = Object.entries(calls).filter(([, n]) => n === 0).map(([hook]) => hook)
    expect(silent).toEqual([])
  })
})

test.describe('What each button does (V0)', () => {
  test('connector: the tool draws a connector between two shapes', async ({ page }) => {
    await page.locator('#tool_connect').click()
    expect(await mode(page)).toBe('connector')
    await drag(page, { x: 140, y: 130 }, { x: 340, y: 130 })
    const connector = await page.evaluate(() => {
      const el = document.querySelector('#svgcontent [id^="conn_"]')
      return el && { tag: el.tagName, ends: el.getAttributeNS('http://svg-edit.googlecode.com', 'connector') }
    })
    expect(connector).toEqual({ tag: 'polyline', ends: 'r1 r2' })
  })

  test('eyedropper: the clicked shape takes the style of the selection', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('r2')], true))
    await settle(page)
    // In More ▾ since V3.
    await chooseTool(page, 'tool_eyedropper')
    expect(await mode(page)).toBe('eyedropper')
    await clickAt(page, 140, 130)
    expect(await page.evaluate(() => document.getElementById('r1').getAttribute('fill'))).toBe('#00c')
  })

  test('grid: the button shows and hides the grid', async ({ page }) => {
    // Since V2 the interaction layer draws the grid (#se-grid, over the
    // whole view) and the button drives it; #canvasGrid is gone.
    const shown = () => page.evaluate(() => document.getElementById('se-grid').getAttribute('display'))
    // In the canvas layout, through its entry of the zoom menu.
    await clickControl(page, 'view_grid')
    expect(await shown()).toBe('inline')
    expect(await page.locator('#view_grid').evaluate((button) => button.pressed)).toBe(true)
    await clickControl(page, 'view_grid')
    expect(await shown()).toBe('none')
  })

  test('markers: a line shows the marker panel', async ({ page }) => {
    expect(await visible(page, 'marker_panel')).toBe(false)
    await page.evaluate(() => window.svgEditor.svgCanvas.selectOnly([document.getElementById('l1')], true))
    await settle(page)
    expect(await visible(page, 'marker_panel')).toBe(true)
  })

  test('panning: the button turns on the hand', async ({ page }) => {
    await page.locator('#ext-panning').click()
    expect(await mode(page)).toBe('ext-panning')
  })

  test('shapes: the button opens the library, a drag draws the chosen shape', async ({ page }) => {
    const paths = () => page.evaluate(() => document.querySelectorAll('#svgcontent path').length)
    const before = await paths()
    await page.locator('#tool_shapelib').click()
    expect(await mode(page)).toBe('shapelib')
    // Before a shape is chosen, a drag draws nothing (it used to fail five
    // times with a scale of Infinity).
    await drag(page, { x: 450, y: 50 }, { x: 520, y: 110 })
    expect(await paths()).toBe(before)
    // The first shape of the library, as a click on it in the open menu.
    await page.locator('#tool_shapelib se-button').first().dispatchEvent('click')
    await drag(page, { x: 450, y: 50 }, { x: 520, y: 110 })
    expect(await paths()).toBe(before + 1)
  })

  test('polystar: the star and polygon tools draw with their panels', async ({ page }) => {
    // Both tools share a flyout: their buttons get the click it passes on.
    await page.locator('#tool_star').dispatchEvent('click')
    expect(await mode(page)).toBe('star')
    expect(await visible(page, 'star_panel')).toBe(true)
    await drag(page, { x: 480, y: 80 }, { x: 520, y: 120 })
    await page.locator('#tool_polygon').dispatchEvent('click')
    expect(await mode(page)).toBe('polygon')
    expect(await visible(page, 'polygon_panel')).toBe(true)
    await drag(page, { x: 560, y: 80 }, { x: 600, y: 120 })
    const drawn = await page.evaluate(() => [...document.querySelectorAll('#svgcontent polygon')]
      .map((el) => el.getAttribute('shape')))
    expect(drawn).toEqual(['star', 'regularPoly'])
  })

  test('opensave: the file commands are in the main menu', async ({ page }) => {
    for (const id of BUTTONS.opensave) {
      expect(await page.evaluate((id) => document.getElementById(id).closest('#main_button') !== null, id), id).toBe(true)
    }
  })

  test('storage: the storage dialog is in place', async ({ page }) => {
    expect(await page.locator('se-storage-dialog').count()).toBe(1)
  })

  test('layer_view: the button shows the current layer alone, then every layer', async ({ page }) => {
    const shown = () => page.evaluate(() => {
      const drawing = window.svgEditor.svgCanvas.getCurrentDrawing()
      return ['Layer 1', 'Layer 2'].map((name) => drawing.getLayerVisibility(name))
    })
    expect(await shown()).toEqual([true, true])
    await clickControl(page, 'tool_layerView')
    expect(await shown()).toEqual([true, false])
    await clickControl(page, 'tool_layerView')
    expect(await shown()).toEqual([true, true])
  })
})

test.describe('Default extensions of each layout (S1)', () => {
  const loaded = (page) => page.evaluate(() => Object.keys(window.svgEditor.svgCanvas.getExtensions()).sort())

  test('the canvas layout loads every extension but ext-shapes and ext-layer_view', async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    expect(await loaded(page)).toEqual(Object.keys(HOOKS).filter((name) => !RETIRED.includes(name)).sort())
    expect(await page.evaluate(() => ['tool_shapelib', 'tool_layerView'].filter((id) => document.getElementById(id)))).toEqual([])
  })

  test('the classic layout loads them all, as before', async ({ page }) => {
    await visitAndApproveStorage(page, { query: '?layout=classic' })
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    expect(await loaded(page)).toEqual(Object.keys(HOOKS).sort())
  })
})
