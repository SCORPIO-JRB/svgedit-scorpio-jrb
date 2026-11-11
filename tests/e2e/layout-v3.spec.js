import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, chooseTool } from './helpers.js'

// Lot V3: the canvas layout. A top bar of 40 px, the canvas under it with the
// tools and the view group floating over it, and a right panel with the
// Properties, Layers and Code tabs, hidden by Ctrl+\. No alert() nor prompt().

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
  <g class="layer"><title>Fond</title>
    <rect id="cadre" x="10" y="10" width="600" height="440" fill="#eee"/>
  </g>
  <g class="layer"><title>Equipements</title>
    <rect id="r1" x="100" y="100" width="80" height="60" fill="#3a6"/>
    <g id="pompe"><circle id="c1" cx="300" cy="200" r="20" fill="#36a"/><path id="p1" d="M290 190l20 10-20 10z"/></g>
    <text id="t1" x="100" y="300" font-size="20">Echangeur</text>
  </g>
</svg>`

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  // prompt(), alert() and confirm() of the browser must never be called.
  await page.addInitScript(() => {
    window.__native = []
    for (const name of ['alert', 'prompt', 'confirm']) {
      window[name] = (...args) => { window.__native.push([name, ...args]); return null }
    }
  })
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
})

test.afterEach(async ({ page }) => {
  expect(errors).toEqual([])
  expect(await page.evaluate(() => window.__native)).toEqual([])
})

const load = (page, svg = DRAWING) => page.evaluate((svg) => {
  window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
  window.svgEditor.svgCanvas.setSvgString(svg)
  window.svgEditor.svgCanvas.setZoom(1)
  window.svgEditor.updateCanvas(true)
  window.svgEditor.layersPanel.populateLayers()
  window.svgEditor.svgCanvas.clearSelection()
  window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
}, svg)

const select = (page, ids) => page.evaluate((ids) => {
  window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true)
}, ids)

const selected = (page) => page.evaluate(() =>
  window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))

const undoSize = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

const frame = () => new Promise((resolve) => setTimeout(resolve, 50))

test.describe('Shell (V3)', () => {
  test('one top bar of 40 px from 768 to 2 560 px, with no field of the objects', async ({ page }) => {
    await load(page)
    await select(page, ['r1'])
    for (const width of [768, 1024, 1280, 1440, 2560]) {
      await page.setViewportSize({ width, height: 800 })
      await frame()
      const bar = await page.locator('#se-topbar').boundingBox()
      expect(bar.height).toBe(40)
      // Every control of the bar is on its line.
      const lines = await page.evaluate(() => new Set([...document.querySelectorAll('#se-topbar button, #se-topbar se-menu, #se-topbar se-button')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => el.getBoundingClientRect().bottom <= 40)).size)
      expect(lines).toBe(1)
    }
    // The fields of the selection are in the inspector, not in the bar.
    expect(await page.locator('#se-topbar #selected_x, #se-topbar #elem_id, #se-topbar input').count()).toBe(0)
    await expect(page.locator('#se-panel #selected_x')).toBeVisible()
  })

  test('the canvas covers the editor but for the bar and the panel; 95 % with the panel hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await frame()
    const share = () => page.evaluate(() => {
      const stage = document.getElementById('se-stage').getBoundingClientRect()
      return stage.width * stage.height / (window.innerWidth * window.innerHeight)
    })
    const open = await share()
    const width = await page.evaluate(() => window.svgEditor.layout.panelWidth)
    // The top bar and the panel only: (1 440 − panel) × (900 − 40).
    expect(open).toBeCloseTo((1440 - width) * 860 / (1440 * 900), 2)
    await page.keyboard.press('Control+Backslash')
    await expect(page.locator('#se-panel')).toBeHidden()
    expect(await share()).toBeGreaterThanOrEqual(0.95)
    await page.keyboard.press('Control+Backslash')
    await expect(page.locator('#se-panel')).toBeVisible()
  })

  test('the view group hides and shows the panel, whose width goes from 240 to 420 px and is kept', async ({ page }) => {
    const toggle = page.locator('#se-panel-toggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect(page.locator('#se-panel')).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(page.locator('#se-panel')).toBeVisible()
    const handle = page.locator('.se-panel-resize')
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + 3, box.y + 200)
    await page.mouse.down()
    await page.mouse.move(box.x - 400, box.y + 200, { steps: 4 })
    await page.mouse.up()
    expect(await page.evaluate(() => document.getElementById('se-panel').getBoundingClientRect().width)).toBe(420)
    const wide = await handle.boundingBox()
    await page.mouse.move(wide.x + 3, wide.y + 200)
    await page.mouse.down()
    await page.mouse.move(wide.x + 300, wide.y + 200, { steps: 4 })
    await page.mouse.up()
    expect(await page.evaluate(() => document.getElementById('se-panel').getBoundingClientRect().width)).toBe(240)
    expect(await page.evaluate(() => window.svgEditor.configObj.pref('panel_width'))).toBe('240')
    // The keyboard too.
    await handle.focus()
    await page.keyboard.press('ArrowLeft')
    expect(await page.evaluate(() => window.svgEditor.layout.panelWidth)).toBe(248)
  })

  test('below 1 280 px the panel is a drawer over the canvas; below 1 024 px Export goes to the document menu', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await frame()
    await expect(page.locator('#se-panel')).toBeHidden()
    const stage = await page.locator('#se-stage').boundingBox()
    await page.keyboard.press('Control+Backslash')
    await expect(page.locator('#se-panel')).toBeVisible()
    // Over the canvas: the canvas keeps its width.
    expect((await page.locator('#se-stage').boundingBox()).width).toBe(stage.width)
    await expect(page.locator('#se-export')).toBeVisible()
    await page.setViewportSize({ width: 900, height: 700 })
    await frame()
    await expect(page.locator('#se-export')).toBeHidden()
    await page.locator('#main_button').click()
    await expect(page.locator('#tool_export')).toBeVisible()
    await page.keyboard.press('Escape')
    // The insert tools fold into More ▾.
    expect(await page.evaluate(() => document.getElementById('tool_image').parentElement.id)).toBe('tools_more')
    await page.setViewportSize({ width: 1440, height: 900 })
    await frame()
    expect(await page.evaluate(() => document.getElementById('tool_image').parentElement.dataset.place)).toBe('insert')
  })

  test('the document name and the save state are in the bar; undo and redo in the zoom menu', async ({ page }) => {
    await expect(page.locator('#main_button')).toHaveAttribute('label', /untitled|Untitled/)
    await expect(page.locator('#se-save-state')).toHaveText('')
    await load(page)
    await select(page, ['r1'])
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#se-save-state')).toHaveText('Unsaved changes')
    // As in the mockups: the buttons stay in the bar, out of sight, for
    // their shortcuts.
    await expect(page.locator('#se-topbar #tool_undo')).toBeHidden()
    await page.locator('#se-zoom-button').click()
    await expect(page.locator('#se-zoom-menu [data-command="tool_undo"]')).toHaveAttribute('aria-disabled', 'false')
    await page.keyboard.press('Escape')
    await page.evaluate(() => { window.svgEditor.showSaveWarning = false })
    await expect(page.locator('#se-save-state')).toHaveText('Saved')
  })
})

test.describe('Zoom menu (V3)', () => {
  test('every entry shows the shortcut of the platform, and that shortcut works', async ({ page }) => {
    await load(page)
    await select(page, ['r1'])
    await page.locator('#se-zoom-button').click()
    const menu = page.locator('#se-zoom-menu')
    await expect(menu).toBeVisible()
    const hints = await menu.evaluate((el) => Object.fromEntries([...el.querySelectorAll('[data-command]')]
      .filter((item) => item.dataset.command)
      .map((item) => [item.dataset.command, item.querySelector('kbd').textContent])))
    expect(hints).toMatchObject({
      zoom_in: expect.stringMatching(/^Ctrl\+[=+]$/),
      zoom_out: 'Ctrl+-',
      zoom_fit_content: 'Shift+1',
      zoom_fit_selection: 'Shift+2',
      zoom_fit_canvas: 'Shift+3',
      zoom_100: 'Shift+0',
      toggle_rulers: 'Shift+R',
      tool_undo: 'Ctrl+Z',
      tool_redo: 'Ctrl+Shift+Z'
    })
    await page.keyboard.press('Escape')
    const zoom = () => page.evaluate(() => window.svgEditor.svgCanvas.getZoom())
    await page.keyboard.press('Control+=')
    expect(await zoom()).toBe(2)
    await page.keyboard.press('Control+-')
    expect(await zoom()).toBe(1)
    await page.keyboard.press('Shift+2')
    expect(await zoom()).toBeGreaterThan(2)
    await page.keyboard.press('Shift+0')
    expect(await zoom()).toBe(1)
    await expect(page.locator('#se-zoom-button')).toContainText('100')
    // Hidden at first, as in the mockups.
    const rulers = () => page.evaluate(() => getComputedStyle(document.getElementById('ruler_x')).display)
    expect(await rulers()).toBe('none')
    await page.keyboard.press('Shift+R')
    expect(await rulers()).not.toBe('none')
    await page.keyboard.press('Shift+R')
    expect(await rulers()).toBe('none')
  })

  test('the view group holds the preview, the panel and the zoom; the view buttons are entries of the menu, those of the extensions too', async ({ page }) => {
    const shown = await page.evaluate(() => [...document.querySelectorAll('#se-viewgroup button, #se-viewgroup se-button')]
      .filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.id))
    // Preview ▷ joins them in V6 (plan v2, 4.1 and 4.6)
    expect(shown).toEqual(['se-preview-button', 'se-panel-toggle', 'se-zoom-button'])
    await page.locator('#se-zoom-button').click()
    // The source gives way to the Code tab: no entry, its shortcut stays.
    await expect(page.locator('#se-zoom-menu [data-mirror="tool_source"]')).toHaveCount(0)
    // The layer view of ext-layer_view, no longer loaded by default (lot
    // S1): loaded, its button is pressed by its entry.
    const entry = page.locator('#se-zoom-menu [data-mirror="tool_layerView"]')
    await expect(entry).toHaveCount(0)
    await visitAndApproveStorage(page, { query: '?extensions=ext-layer_view' })
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    await page.locator('#se-zoom-button').click()
    await expect(entry).toBeVisible()
    await expect(entry).toHaveAttribute('aria-checked', 'false')
    await expect(entry.locator('kbd')).toHaveText('Ctrl+Shift+L')
    await entry.click()
    expect(await page.evaluate(() => document.getElementById('tool_layerView').pressed)).toBe(true)
    await page.locator('#se-zoom-button').click()
    await expect(entry).toHaveAttribute('aria-checked', 'true')
  })

  test('the steps zoom, an entry that does not apply is greyed with its shortcut, undo and redo follow the history', async ({ page }) => {
    await load(page)
    await page.locator('#se-zoom-button').click()
    const item = (command) => page.locator(`#se-zoom-menu [data-command="${command}"]`)
    await expect(item('zoom_fit_selection')).toHaveAttribute('aria-disabled', 'true')
    await expect(item('zoom_fit_selection').locator('kbd')).toHaveText('Shift+2')
    await expect(item('tool_undo')).toHaveAttribute('aria-disabled', 'true')
    await expect(item('tool_redo')).toHaveAttribute('aria-disabled', 'true')
    await page.locator('#se-zoom-menu [data-zoom="200"]').click()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getZoom())).toBe(2)
    await select(page, ['r1'])
    await page.keyboard.press('ArrowRight')
    await page.locator('#se-zoom-button').click()
    await expect(item('tool_undo')).toHaveAttribute('aria-disabled', 'false')
    await item('tool_undo').click()
    expect(await page.evaluate(() => document.getElementById('r1').getAttribute('x'))).toBe('100')
    await page.locator('#se-zoom-button').click()
    await expect(item('tool_redo')).toHaveAttribute('aria-disabled', 'false')
    // The grid, as a check box.
    await item('view_grid').click()
    expect(await page.evaluate(() => window.svgEditor.grid.visible)).toBe(true)
  })
})

test.describe('Toolbar (V3)', () => {
  test('the tools are in their groups and menus, in the declared order, extensions included', async ({ page }) => {
    const order = await page.evaluate(() => [...document.querySelectorAll('#tools_left [data-place]')]
      .map((place) => `${place.dataset.place}: ${[...place.children].map((el) => el.id).filter(Boolean).join(' ')}`))
    expect(order).toEqual([
      'select: tool_select tool_scale ext-panning',
      // The frame tool of lot V5 comes after Text.
      'create: tool_text tool_frame tools_shapes tools_paths',
      // Square, circle and the freehand shapes left it in lot S1, and so
      // did the shapes button, which the Library drawer replaces.
      'shapes: tool_rect tool_ellipse tool_line tool_star tool_polygon',
      'paths: tool_path tool_fhpath',
      'insert: tool_image tool_connect tool_library',
      'more: tool_zoom tool_eyedropper'
    ])
    await expect(page.locator('#tools_left')).toHaveAttribute('role', 'toolbar')
  })

  test('the order is the same at every load', async ({ page }) => {
    const read = () => page.evaluate(() => [...document.querySelectorAll('#tools_left se-button, #tools_left se-flyingbutton, #tools_left se-explorerbutton')]
      .map((el) => el.id).join(' '))
    const first = await read()
    for (let i = 0; i < 4; i++) {
      await page.reload()
      await page.waitForFunction(() => window.svgEditor?.extensionsAdded)
      expect(await read()).toBe(first)
    }
  })

  test('a group shows the last tool chosen in it; More ▾ keeps its icon', async ({ page }) => {
    await chooseTool(page, 'tool_ellipse')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('ellipse')
    const icon = (id) => page.locator(`#${id}`).evaluate((el) => el.shadowRoot.querySelector('se-icon').getAttribute('src'))
    expect(await icon('tools_shapes')).toMatch(/ellipse\.svg$/)
    await chooseTool(page, 'tool_zoom')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('zoom')
    expect(await icon('tools_more')).toMatch(/more_horiz\.svg$/)
    // A named tool in the open menu: its label and its shortcut.
    await page.locator('#tools_shapes .handle').click()
    await expect(page.locator('#tool_rect')).toHaveAttribute('labelled', '')
    await expect(page.locator('#tool_rect')).toBeVisible()
  })

  test('the arrows go from one tool to the next, Enter chooses it', async ({ page }) => {
    await page.locator('#se-layer-button').focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    // Select, then Scale.
    expect(await page.evaluate(() => document.activeElement.id)).toBe('tool_scale')
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.isScaleTool())).toBe(true)
    await page.keyboard.press('End')
    expect(await page.evaluate(() => document.activeElement.id)).toBe('tools_more')
    await page.keyboard.press('ArrowDown')
    expect(await page.evaluate(() => document.activeElement.id)).toBe('tool_zoom')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.activeElement.id)).toBe('tools_more')
  })

  test('the current layer is chosen in the bar', async ({ page }) => {
    await load(page)
    await expect(page.locator('#se-layer-button')).toContainText('Equipements')
    await page.locator('#se-layer-button').click()
    await page.locator('#se-layer-menu [data-layer="Fond"]').click()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayerName())).toBe('Fond')
    await expect(page.locator('#se-layer-button')).toContainText('Fond')
  })
})

test.describe('Inspector (V3)', () => {
  const sections = (page) => page.evaluate(() => [...document.querySelectorAll('#tools_top > .se-section')]
    .filter((section) => !section.hidden).map((section) => section.dataset.section))

  test('the sections at their place; a section where nothing applies is hidden', async ({ page }) => {
    await load(page)
    // With the frames to export of lot V5, and the current layer of lot V7.
    // Appearance, Fill and Stroke only with a drawing tool since lot Fond.
    expect(await sections(page)).toEqual(['layer', 'document', 'frames'])
    await expect(page.locator('#se-tabpanel-properties .se-inspector-type')).toHaveText('Document')
    await select(page, ['r1'])
    // Effects only for an object that has a blur, since lot S1.
    // Position and Dimensions since lot Propriétés.
    expect(await sections(page)).toEqual(['geometry', 'size', 'appearance', 'fill', 'stroke', 'identity'])
    await expect(page.locator('#se-actions-button')).toBeVisible()
    await expect(page.locator('#se-tabpanel-properties .se-inspector-type')).toHaveText('Rectangle')
    await expect(page.locator('#se-tabpanel-properties .se-inspector-id')).toHaveText('#r1')
    await select(page, ['t1'])
    // Typography after Appearance, as in Figma (lot Texte).
    expect(await sections(page)).toEqual(['geometry', 'size', 'appearance', 'text', 'fill', 'stroke', 'identity'])
    await select(page, ['r1', 't1'])
    await expect(page.locator('#se-tabpanel-properties .se-inspector-type')).toHaveText('2 objects')
    // The polystar panel shows with its tool.
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await page.locator('#tool_star').dispatchEvent('click')
    expect(await sections(page)).toContain('size')
  })

  test('the verbs are in the "…" menu, with their name and shortcut; a verb closes it', async ({ page }) => {
    await load(page)
    await expect(page.locator('#se-actions-button')).toBeHidden()
    await select(page, ['r1'])
    await page.locator('#se-actions-button').click()
    await expect(page.locator('#se-actions-button')).toHaveAttribute('aria-expanded', 'true')
    const clone = page.locator('#tool_clone')
    await expect(clone).toBeVisible()
    // Ctrl+D since lot S1, which took D away.
    expect(await clone.evaluate((el) => [el.hasAttribute('labelled'), el.shadowRoot.querySelector('.kbd').textContent])).toEqual([true, 'Ctrl+D'])
    await clone.click()
    await expect(page.locator('#se-actions-menu')).toBeHidden()
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)).toBe(3)
  })

  test('the fields are grey boxes with their label inside, two per row, without arrows', async ({ page }) => {
    await load(page)
    await select(page, ['r1'])
    const box = (id) => page.locator(`#${id}`).evaluate((el) => {
      const r = el.getBoundingClientRect()
      const label = el.shadowRoot.querySelector('[part="label"]').getBoundingClientRect()
      const up = el.shadowRoot.querySelector('elix-number-spin-box').shadowRoot.querySelector('#upButton')
      return { top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), inside: label.left >= r.left && label.right <= r.right, arrows: getComputedStyle(up).display }
    })
    const x = await box('selected_x')
    const y = await box('selected_y')
    expect(x.top).toBe(y.top)
    expect(Math.abs(x.width - y.width)).toBeLessThanOrEqual(1)
    expect(x.height).toBe(28)
    expect(x.inside).toBe(true)
    expect(x.arrows).toBe('none')
    // Fill: the colour in hexadecimal and its opacity.
    const paint = await page.locator('#fill_color').evaluate((el) => [
      el.shadowRoot.querySelector('#value').textContent, el.shadowRoot.querySelector('#alpha').textContent.replace(/\s/g, ' ')
    ])
    expect(paint[0]).toMatch(/^(3A6|33AA66)$/)
    expect(paint[1]).toBe('100 %')
  })

  test('typing 90 in the angle field makes one undo step', async ({ page }) => {
    await load(page)
    await select(page, ['r1'])
    const field = page.locator('#angle #input')
    await field.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('90')
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getRotationAngle(document.getElementById('r1')))).toBe(90)
    expect(await undoSize(page)).toBe(1)
  })

  test('without selection the document: size and snapping', async ({ page }) => {
    await load(page)
    await page.locator('#se-doc-width').fill('800')
    await page.locator('#se-doc-width').press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getResolution().w)).toBe(800)
    await page.locator('#se-doc-grid').check()
    expect(await page.evaluate(() => window.svgEditor.grid.visible)).toBe(true)
    await page.locator('#se-doc-objectsnap').check()
    expect(await page.evaluate(() => window.svgEditor.configObj.curConfig.objectSnapping)).toBe(true)
  })
})

test.describe('Layers tab (V3)', () => {
  test.beforeEach(async ({ page }) => {
    await load(page)
    await page.locator('#se-tab-layers').click()
  })

  const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#se-tree .se-tree-row')]
    .sort((a, b) => a.offsetTop - b.offsetTop)
    .map((row) => `${'  '.repeat(Number(row.getAttribute('aria-level')) - 1)}${row.querySelector('.se-tree-name, .se-tree-rename')?.textContent ?? ''}`))

  test('the tree of the layers and their objects, top first, groups closed', async ({ page }) => {
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  t1', '  pompe', '  r1', 'Fond', '  cadre'])
    await page.locator('#se-tree .se-tree-row', { hasText: 'pompe' }).locator('.se-tree-toggle').click()
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  t1', '  pompe', '    p1', '    c1', '  r1', 'Fond', '  cadre'])
    await expect(page.locator('#se-tree')).toHaveAttribute('role', 'tree')
  })

  test('a click selects in the canvas, the canvas selects in the tree', async ({ page }) => {
    await page.locator('#se-tree .se-tree-row', { hasText: 'r1' }).click()
    expect(await selected(page)).toEqual(['r1'])
    await page.locator('#se-tree .se-tree-row', { hasText: 't1' }).click({ modifiers: ['Shift'] })
    expect((await selected(page)).sort()).toEqual(['r1', 't1'])
    // From the canvas: an object in a closed group opens it.
    await select(page, ['c1'])
    await expect(page.locator('#se-tree .se-tree-row[aria-selected="true"]', { hasText: 'c1' })).toBeVisible()
    // An object of another layer: that layer becomes current.
    await page.locator('#se-tree .se-tree-row', { hasText: 'cadre' }).click()
    expect(await selected(page)).toEqual(['cadre'])
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayerName())).toBe('Fond')
  })

  test('the eye hides an object in one undo step, and a layer', async ({ page }) => {
    const row = page.locator('#se-tree .se-tree-row', { hasText: 'r1' })
    await row.hover()
    await row.locator('.se-tree-eye').click()
    expect(await page.evaluate(() => document.getElementById('r1').getAttribute('display'))).toBe('none')
    expect(await undoSize(page)).toBe(1)
    await page.keyboard.press('Control+z')
    expect(await page.evaluate(() => document.getElementById('r1').getAttribute('display'))).toBe(null)
    const layer = page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Fond' })
    await layer.hover()
    await layer.locator('.se-tree-eye').click()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getLayerVisibility('Fond'))).toBe(false)
  })

  test('a layer is renamed in place, and moved by a drag', async ({ page }) => {
    await page.locator('#se-tree .se-tree-row[data-kind="layer"] .se-tree-name', { hasText: 'Fond' }).dblclick()
    const field = page.locator('#se-tree .se-tree-rename')
    await expect(field).toBeFocused()
    await field.fill('Arriere-plan')
    await field.press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().hasLayer('Arriere-plan'))).toBe(true)
    // Dragged above Equipements: it is drawn on top.
    await page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Arriere-plan' })
      .dragTo(page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Equipements' }), { targetPosition: { x: 40, y: 4 } })
    expect(await page.evaluate(() => {
      const drawing = window.svgEditor.svgCanvas.getCurrentDrawing()
      return [drawing.getLayerName(0), drawing.getLayerName(1)]
    })).toEqual(['Equipements', 'Arriere-plan'])
  })

  test('the search keeps what matches, with its layer and group; the keyboard moves and selects', async ({ page }) => {
    await page.locator('#se-tree-search').fill('c1')
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  pompe', '    c1'])
    await page.locator('#se-tree-search').fill('')
    await page.locator('#se-tree').focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    expect(await selected(page)).toEqual(['t1'])
  })

  test('5 000 objects: the tree scrolls and follows the selection in under 50 ms', async ({ page }) => {
    await page.evaluate(() => {
      const rects = Array.from({ length: 5000 }, (_, i) =>
        `<rect id="o${i}" x="${(i % 100) * 6}" y="${Math.floor(i / 100) * 9}" width="5" height="8"/>`).join('')
      window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>Layer 1</title>${rects}</g></svg>`)
      window.svgEditor.updateCanvas(true)
      window.svgEditor.layersPanel.populateLayers()
    })
    await frame()
    // Only the rows in view are drawn.
    expect(await page.locator('#se-tree .se-tree-row').count()).toBeLessThan(80)
    const ms = await page.evaluate(async () => {
      const target = document.getElementById('o4917')
      const row = () => [...document.querySelectorAll('#se-tree .se-tree-row')].find((el) => el.querySelector('.se-tree-name').textContent === 'o4917')
      const start = performance.now()
      window.svgEditor.svgCanvas.selectOnly([target], true)
      while (row()?.getAttribute('aria-selected') !== 'true' && performance.now() - start < 500) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      }
      return { ms: performance.now() - start, selected: row()?.getAttribute('aria-selected') }
    })
    expect(ms.selected).toBe('true')
    expect(ms.ms).toBeLessThan(50)
  })
})

test.describe('Layer menu (V3)', () => {
  test('a loaded document gives its layer to the menu, which holds the layer commands', async ({ page }) => {
    // Loaded as a host does (loadFromString, ?url=): the menu follows.
    await page.evaluate((svg) => window.svgEditor.loadSvgString(svg), DRAWING)
    await expect(page.locator('#se-layer-button')).toContainText('Equipements')
    await page.locator('#se-layer-button').click()
    const action = (name) => page.locator(`#se-layer-menu [data-action="${name}"]`)
    for (const name of ['new', 'dupe', 'rename', 'delete', 'up', 'down', 'show']) await expect(action(name)).toBeVisible()
    // Equipements is on top: it cannot go up.
    await expect(action('up')).toHaveAttribute('aria-disabled', 'true')
    await action('down').click()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getLayerName(0))).toBe('Equipements')
    await page.locator('#se-layer-button').click()
    await action('dupe').click()
    const field = page.locator('se-popover.se-ask input')
    await expect(field).toBeFocused()
    await field.press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().getNumLayers())).toBe(3)
  })

  test('the Layers tab shows the search and the tree, with its help, as in the mockups', async ({ page }) => {
    await load(page)
    await page.locator('#se-tab-layers').click()
    await expect(page.locator('#layerbuttons')).toBeHidden()
    await expect(page.locator('#selLayerNames')).toBeHidden()
    await expect(page.locator('#se-tree-search')).toBeVisible()
    await expect(page.locator('.se-tree-help')).toBeVisible()
  })
})

test.describe('Code tab (V3)', () => {
  test.beforeEach(async ({ page }) => {
    await load(page)
    await page.locator('#se-tab-code').click()
  })

  const text = (page) => page.locator('#se-code-text')
  // The tab puts one attribute per line: only the spaces differ from what the
  // export writes.
  const spaces = (value) => value.replace(/\s+/g, ' ')
  const shows = async (page, source) => {
    await expect.poll(async () => spaces(await text(page).inputValue())).toBe(spaces(source))
  }

  test('the code of the selection is the one the export writes; of the document without selection', async ({ page }) => {
    await shows(page, await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString()))
    await select(page, ['r1'])
    await shows(page, await page.evaluate(() => window.svgEditor.svgCanvas.svgToString(document.getElementById('r1'), 0)))
    await expect(page.locator('#se-tabpanel-code .se-inspector-id')).toHaveText('#r1')
    // One attribute per line, x and y on one, and in colour.
    expect(await text(page).inputValue()).toContain('\n  x="100" y="100"\n  width="80"')
    await expect(page.locator('.se-code-highlight .se-code-attr').first()).toHaveText('id')
    await expect(page.locator('.se-code-highlight .se-code-value').first()).toHaveText('"r1"')
  })

  test('an edit applies with Ctrl+Enter through the import filter, in one undo step', async ({ page }) => {
    await select(page, ['r1'])
    await text(page).fill('<rect id="r1" x="120" y="100" width="80" height="60" fill="#c00" onclick="alert(1)"/>')
    await text(page).press('Control+Enter')
    const r1 = await page.evaluate(() => {
      const el = document.getElementById('r1')
      return { x: el.getAttribute('x'), fill: el.getAttribute('fill'), onclick: el.getAttribute('onclick') }
    })
    expect(r1).toEqual({ x: '120', fill: '#c00', onclick: null })
    expect(await selected(page)).toEqual(['r1'])
    expect(await undoSize(page)).toBe(1)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await page.evaluate(() => document.getElementById('r1').getAttribute('x'))).toBe('100')
  })

  // The field is transparent over its coloured twin: an opaque selection hid
  // the selected code.
  test('selected code stays readable, in both themes', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'reads ::selection through getComputedStyle')
    const alpha = () => text(page).evaluate((el) => {
      const parts = getComputedStyle(el, '::selection').backgroundColor.match(/[\d.]+/g).map(Number)
      return parts.length === 4 ? parts[3] : 1
    })
    for (const theme of ['dark', 'light']) {
      await page.evaluate((theme) => { document.querySelector('.se-editor').dataset.seTheme = theme }, theme)
      const value = await alpha()
      expect(value, theme).toBeGreaterThan(0)
      expect(value, theme).toBeLessThan(0.5)
    }
    // Code is not prose: no writing suggestions of the browser over it (the
    // rewrite button of Edge on a selection).
    await expect(text(page)).toHaveAttribute('writingsuggestions', 'false')
  })

  test('a syntax error is shown with its line, and nothing is applied', async ({ page }) => {
    await select(page, ['r1'])
    await text(page).fill('<rect id="r1"\n  x="120"\n  y=100 />')
    await page.locator('#se-code-apply').click()
    await expect(page.locator('#se-code-status')).toContainText('line 3')
    expect(await page.evaluate(() => document.getElementById('r1').getAttribute('x'))).toBe('100')
    expect(await undoSize(page)).toBe(0)
    // Escape gives back the code of the drawing.
    await text(page).press('Escape')
    await shows(page, await page.evaluate(() => window.svgEditor.svgCanvas.svgToString(document.getElementById('r1'), 0)))
  })
})

test.describe('No window of the browser (V3)', () => {
  test('a new layer, a renamed layer and a link are asked in place', async ({ page }) => {
    await load(page)
    await page.locator('#se-tab-layers').click()
    // The layer commands are in the layer menu of the toolbar.
    await page.locator('#se-layer-button').click()
    await page.locator('#se-layer-menu [data-action="new"]').click()
    const field = page.locator('se-popover.se-ask input')
    await expect(field).toBeFocused()
    await field.fill('Mesures')
    await field.press('Enter')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getCurrentDrawing().hasLayer('Mesures'))).toBe(true)
    // Renamed in its row of the tree.
    await page.locator('#se-layer-button').click()
    await page.locator('#se-layer-menu [data-action="rename"]').click()
    await expect(page.locator('#se-tree .se-tree-rename')).toBeFocused()
    await page.keyboard.press('Escape')
    // A link (its button shows for a linked object only, as before V3).
    await page.locator('#se-tab-properties').click()
    await select(page, ['r1'])
    await page.evaluate(() => { window.svgEditor.topPanel.makeHyperlink() })
    await expect(field).toBeFocused()
    await field.fill('https://scorp-io.example/synoptique')
    await field.press('Enter')
    expect(await page.evaluate(() => document.getElementById('r1').parentElement.localName)).toBe('a')
  })
})
