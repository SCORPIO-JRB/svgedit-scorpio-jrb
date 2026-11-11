import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot V7 « GTB et structure » (plan v2): the full tree of the Layers tab
// (2.6, 4.5), the library drawer, GTB symbols with ports, orthogonal
// connectors, and the templates (2.11).

const NS = 'http://www.w3.org/2000/svg'

const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Fond</title><rect id="cadre" x="10" y="10" width="620" height="460" fill="#eee"/></g>
  <g class="layer"><title>Equipements</title>
    <rect id="r1" x="200" y="150" width="120" height="80" fill="#B6B0A7"><title>Pompe P1</title></rect>
    <g id="pompe" transform="translate(50,0)"><circle id="c1" cx="100" cy="100" r="20" fill="#08f"/><rect id="p1" x="60" y="300" width="20" height="20"/></g>
    <rect id="r2" x="400" y="300" width="60" height="60" fill="#3a6"/>
  </g>
</svg>`

async function load (page, svg = DRAWING) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

const select = (page, ...ids) => page.evaluate((ids) =>
  window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ids)
const selected = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const attr = (page, id, name) => page.evaluate(([id, name]) => document.getElementById(id)?.getAttribute(name) ?? null, [id, name])
const exact = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
const row = (page, text) => page.locator('#se-tree .se-tree-row')
  .filter({ has: page.locator('.se-tree-name', { hasText: exact(text) }) })
const rows = (page) => page.evaluate(() => [...document.querySelectorAll('#se-tree .se-tree-row')]
  .sort((a, b) => a.offsetTop - b.offsetTop)
  .map((el) => `${'  '.repeat(Number(el.getAttribute('aria-level')) - 1)}${el.querySelector('.se-tree-name, .se-tree-rename')?.textContent ?? ''}`))
const box = (page, id) => page.evaluate((id) => {
  const r = document.getElementById(id).getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
}, id)

test.describe('Full tree (V7)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page)
    await page.locator('#se-tab-layers').click()
  })

  test('a row shows the title, else the id; an object is renamed in place, its id kept', async ({ page }) => {
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  r2', '  pompe', '  Pompe P1', 'Fond', '  cadre'])
    // The search still finds an object by its id.
    await page.locator('#se-tree-search').fill('r1')
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  Pompe P1'])
    await page.locator('#se-tree-search').fill('')
    await row(page, 'r2').locator('.se-tree-name').dblclick()
    const field = page.locator('#se-tree .se-tree-rename')
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('placeholder', 'r2')
    await field.fill('Vanne V2')
    await field.press('Enter')
    expect(await page.evaluate(() => document.querySelector('#r2 > title')?.textContent)).toBe('Vanne V2')
    expect(await attr(page, 'r2', 'id')).toBe('r2')
    expect(await steps(page)).toBe(1)
    await expect.poll(() => rows(page)).toContain('  Vanne V2')
    // F2 renames the focused row; an empty name removes the title.
    await row(page, 'Vanne V2').locator('.se-tree-name').dblclick()
    await page.locator('#se-tree .se-tree-rename').fill('')
    await page.locator('#se-tree .se-tree-rename').press('Enter')
    expect(await page.evaluate(() => document.querySelector('#r2 > title'))).toBe(null)
    await page.keyboard.press('Control+z')
    expect(await page.evaluate(() => document.querySelector('#r2 > title')?.textContent)).toBe('Vanne V2')
  })

  test('the lock: one undo step, never selected from the canvas or the tree, the pointer goes through', async ({ page }) => {
    const r1 = row(page, 'Pompe P1')
    await r1.hover()
    await r1.locator('.se-tree-lock').click()
    expect(await attr(page, 'r1', 'se:locked')).toBe('true')
    expect(await steps(page)).toBe(1)
    await expect(row(page, 'Pompe P1')).toHaveClass(/se-tree-locked/)
    // The tree does not select it, and says why.
    await row(page, 'Pompe P1').locator('.se-tree-name').click()
    expect(await selected(page)).toEqual([])
    await expect(page.locator('se-toast, .se-toast').filter({ hasText: /verrouill|Locked/i }).first()).toBeVisible()
    // The canvas neither: a click on it starts a rubber band on the page.
    const b = await box(page, 'r1')
    await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2)
    expect(await selected(page)).toEqual([])
    // Select all leaves it out.
    await page.evaluate(() => window.svgEditor.svgCanvas.selectAllInCurrentLayer())
    expect((await selected(page)).sort()).toEqual(['pompe', 'r2'])
    // The save keeps the lock, in the editor namespace.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toContain('se:locked="true"')
    await page.keyboard.press('Control+z')
    expect(await attr(page, 'r1', 'se:locked')).toBe(null)
  })

  test('Ctrl+Shift+L locks the selection, Ctrl+Shift+H hides it; "unlock all" and "show all" bring them back', async ({ page }) => {
    await select(page, 'r2')
    await page.keyboard.press('Control+Shift+L')
    expect(await attr(page, 'r2', 'se:locked')).toBe('true')
    expect(await selected(page)).toEqual([])
    await select(page, 'cadre')
    await page.keyboard.press('Control+Shift+H')
    expect(await attr(page, 'cadre', 'display')).toBe('none')
    // A hidden object stays selected, as in Figma (lot Texte et masquage).
    expect(await selected(page)).toEqual(['cadre'])
    await page.evaluate(() => window.svgEditor.commands.execute('unlock_all'))
    await page.evaluate(() => window.svgEditor.commands.execute('show_all'))
    expect(await attr(page, 'r2', 'se:locked')).toBe(null)
    expect(await attr(page, 'cadre', 'display')).toBe(null)
    expect(await steps(page)).toBe(4)
  })

  test('nothing is drawn into a locked layer: the editor says why', async ({ page }) => {
    const layer = page.locator('#se-tree .se-tree-row[data-kind="layer"]', { hasText: 'Equipements' })
    await layer.hover()
    await layer.locator('.se-tree-lock').click()
    const before = await page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('rect'))
    const b = await box(page, 'cadre')
    await page.mouse.move(b.x + 40, b.y + 40)
    await page.mouse.down()
    await page.mouse.move(b.x + 120, b.y + 100, { steps: 4 })
    await page.mouse.up()
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent rect').length)).toBe(before)
    await expect(page.locator('se-toast, .se-toast').filter({ hasText: /Equipements/ }).first()).toBeVisible()
    // Its objects cannot be selected either.
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('select'))
    await page.evaluate(() => window.svgEditor.svgCanvas.addToSelection([document.getElementById('r2')]))
    expect(await selected(page)).toEqual([])
  })

  test('a drag moves an object into a group, keeping its place on the page, in one undo step', async ({ page }) => {
    await row(page, 'pompe').locator('.se-tree-toggle').click()
    const before = await box(page, 'r2')
    // Onto the middle of the group row: into the group, on top.
    await row(page, 'r2').dragTo(row(page, 'pompe'), { targetPosition: { x: 60, y: 14 } })
    expect(await page.evaluate(() => document.getElementById('r2').parentNode.id)).toBe('pompe')
    expect(await page.evaluate(() => document.getElementById('pompe').lastElementChild.id)).toBe('r2')
    expect(await attr(page, 'r2', 'transform')).toBe('translate(-50,0)')
    expect(await box(page, 'r2')).toEqual(before)
    expect(await steps(page)).toBe(1)
    expect(await selected(page)).toEqual(['r2'])
    await page.keyboard.press('Control+z')
    expect(await page.evaluate(() => document.getElementById('r2').parentNode.querySelector(':scope > title')?.textContent)).toBe('Equipements')
    expect(await attr(page, 'r2', 'transform')).toBe(null)
  })

  test('a drag above or below a row changes the order, and the selection goes along', async ({ page }) => {
    // Above r2: on top of the layer.
    await row(page, 'Pompe P1').dragTo(row(page, 'r2'), { targetPosition: { x: 60, y: 3 } })
    expect(await page.evaluate(() => [...document.querySelectorAll('#r1, #r2, #pompe')].map((el) => el.id))).toEqual(['pompe', 'r2', 'r1'])
    await page.keyboard.press('Control+z')
    // A selection of two objects, dropped below cadre: into the Fond layer, under it.
    await select(page, 'r1', 'r2')
    await row(page, 'r2').dragTo(row(page, 'cadre'), { targetPosition: { x: 60, y: 25 } })
    expect(await page.evaluate(() => [...document.getElementById('cadre').parentNode.children]
      .filter((el) => el.localName !== 'title').map((el) => el.id))).toEqual(['r1', 'r2', 'cadre'])
    expect(await steps(page)).toBe(1)
  })

  test('the insertion line is indented to its depth; Alt+click on an arrow opens everything', async ({ page }) => {
    await page.evaluate(() => {
      const g = document.getElementById('pompe')
      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      inner.id = 'inner'
      inner.append(document.getElementById('p1'))
      g.append(inner)
      window.svgEditor.layout.layerTree.rebuild()
    })
    await row(page, 'pompe').locator('.se-tree-toggle').click({ modifiers: ['Alt'] })
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  r2', '  pompe', '    inner', '      p1', '    c1', '  Pompe P1', 'Fond', '  cadre'])
    await row(page, 'pompe').locator('.se-tree-toggle').click({ modifiers: ['Alt'] })
    await expect.poll(() => rows(page)).toEqual(['Equipements', '  r2', '  pompe', '  Pompe P1', 'Fond', '  cadre'])
    // While dragging r2 over c1, the line starts at the depth of c1.
    await row(page, 'pompe').locator('.se-tree-toggle').click()
    const indent = await page.evaluate(() => {
      const from = [...document.querySelectorAll('#se-tree .se-tree-row')].find((el) => el.textContent.includes('r2'))
      const to = [...document.querySelectorAll('#se-tree .se-tree-row')].find((el) => el.querySelector('.se-tree-name').textContent === 'c1')
      const data = new DataTransfer()
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }))
      const r = to.getBoundingClientRect()
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data, clientX: r.x + 40, clientY: r.y + 4 }))
      const result = [to.className, to.style.getPropertyValue('--se-drop-indent')]
      from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }))
      return result
    })
    expect(indent[0]).toContain('se-tree-drop-before')
    expect(indent[1]).toBe('32px')
  })

  test('the current layer in the inspector: opacity and blend mode, one undo step each', async ({ page }) => {
    await page.locator('#se-tab-properties').click()
    await expect(page.locator('[data-section="layer"]')).toBeVisible()
    await expect(page.locator('#se-layer-name')).toHaveValue('Equipements')
    await page.locator('#se-layer-opacity').fill('50')
    await page.locator('#se-layer-opacity').press('Enter')
    const group = () => page.evaluate(() => {
      const g = window.svgEditor.svgCanvas.getCurrentDrawing().getCurrentLayer()
      return [g.getAttribute('opacity'), g.getAttribute('style')]
    })
    expect((await group())[0]).toBe('0.5')
    await page.locator('#se-layer-blend').selectOption('multiply')
    expect((await group())[1]).toContain('mix-blend-mode:multiply')
    expect(await steps(page)).toBe(2)
    // Out of the fields, whose own Ctrl+Z undoes the typing
    await page.locator('#se-tab-properties').focus()
    await page.keyboard.press('Control+z')
    expect((await group())[1] ?? '').not.toContain('mix-blend-mode')
    // A selection hides the section.
    await select(page, 'r2')
    await expect(page.locator('[data-section="layer"]')).toBeHidden()
  })

  test('the last layer cannot be deleted: its entry says why', async ({ page }) => {
    await load(page, `<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>Seul</title><rect id="a" width="10" height="10"/></g></svg>`)
    await page.locator('#se-layer-button').click()
    const item = page.locator('#se-layer-menu [data-action="delete"]')
    await expect(item).toHaveAttribute('aria-disabled', 'true')
    await expect(item).toHaveAttribute('aria-description', /au moins un calque|at least one layer/)
  })
})

const PAGE = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Equipements</title><rect id="fond" x="0" y="0" width="640" height="480" fill="#160F23"/></g>
</svg>`

test.describe('Symbols and ports (V7)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page, PAGE)
  })

  test('a symbol is a <symbol> in the defs, each use an instance; one undo step; its ports follow it', async ({ page }) => {
    const result = await page.evaluate(() => {
      const ed = window.svgEditor
      const a = ed.symbols.insert('gtb-pompe', { x: 100, y: 100 })
      const b = ed.symbols.insert('gtb-pompe', { x: 300, y: 100 })
      const symbol = ed.svgCanvas.findSymbol('gtb-pompe')
      return {
        symbols: document.querySelectorAll('#svgcontent defs symbol').length,
        href: a.getAttribute('href'),
        box: [a.getAttribute('x'), a.getAttribute('y'), a.getAttribute('width'), a.getAttribute('height')],
        attrs: [a.getAttribute('fill'), a.getAttribute('stroke'), a.getAttribute('class')],
        version: symbol.getAttribute('se:version'),
        ports: symbol.getAttribute('se:ports'),
        instances: ed.svgCanvas.instancesOf(symbol).map((u) => u.id),
        selected: ed.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id),
        bId: b.id,
        portsA: ed.svgCanvas.portsOf(a).map((p) => `${p.id} ${p.x},${p.y} ${p.dir} ${p.kind}`)
      }
    })
    expect(result.symbols).toBe(1)
    expect(result.href).toBe('#gtb-pompe')
    expect(result.box).toEqual(['80', '80', '40', '40'])
    // The body of the symbol takes the colours of its instance (D4).
    expect(result.attrs).toEqual(['#160F23', '#625A6E', 'equipement pompe'])
    expect(result.version).toBe('1')
    expect(result.ports).toBe('in 0 20 left in; out 40 20 right out; power 20 0 up power')
    expect(result.instances).toHaveLength(2)
    expect(result.selected).toEqual([result.bId])
    expect(result.portsA).toEqual(['in 80,100 left in', 'out 120,100 right out', 'power 100,80 up power'])
    expect(await steps(page)).toBe(2)
    // Turned a quarter, the ports turn with it.
    const turned = await page.evaluate(() => {
      const use = document.querySelector('#svgcontent use')
      use.setAttribute('transform', 'rotate(90 100 100)')
      return window.svgEditor.svgCanvas.portsOf(use).map((p) => `${p.id} ${Math.round(p.x)},${Math.round(p.y)} ${p.dir}`)
    })
    expect(turned).toEqual(['in 100,80 up', 'out 100,120 down', 'power 120,100 right'])
    // Any other object has the middle of its sides.
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.portsOf(document.getElementById('fond')).map((p) => p.id)))
      .toEqual(['n', 'e', 's', 'w'])
  })

  test('the inspector names the symbol and its ports; a newer version of the library updates every instance in one step', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.symbols.insert('gtb-vanne-2v', { x: 100, y: 100 })
      window.svgEditor.symbols.insert('gtb-vanne-2v', { x: 200, y: 100 })
    })
    await expect(page.locator('.se-symbol-panel')).toBeVisible()
    await expect(page.locator('.se-symbol-version')).toHaveText(/1/)
    await expect(page.locator('.se-symbol-ports')).toContainText('signal')
    await expect(page.locator('#se-symbol-update')).toBeHidden()
    // The library moves on: version 2, another drawing.
    await page.evaluate(() => {
      const def = window.svgEditor.symbols.definition('gtb-vanne-2v')
      def.version = 2
      def.body = '<rect x="0" y="10" width="40" height="20"/>'
      window.svgEditor.symbolPanel.refresh()
    })
    await expect(page.locator('#se-symbol-update')).toBeVisible()
    await expect(page.locator('#se-symbol-update')).toContainText('2')
    const before = await steps(page)
    await page.locator('#se-symbol-update').click()
    const symbol = () => page.evaluate(() => {
      const s = window.svgEditor.svgCanvas.findSymbol('gtb-vanne-2v')
      return [s.getAttribute('se:version'), [...s.children].map((el) => el.localName).join(' ')]
    })
    expect(await symbol()).toEqual(['2', 'title rect'])
    expect(await steps(page)).toBe(before + 1)
    await expect(page.locator('#se-symbol-update')).toBeHidden()
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect((await symbol())[0]).toBe('1')
    expect((await symbol())[1]).toContain('path')
  })

  test('the tree shows an instance by the name of its symbol', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.symbols.insert('gtb-chaudiere', { x: 100, y: 100 }))
    await page.locator('#se-tab-layers').click()
    const type = await page.locator('#se-tree .se-tree-row[data-kind="object"]').first().locator('.se-tree-type').textContent()
    const name = await page.evaluate(() => window.svgEditor.symbols.label('symbols.boiler'))
    expect(type).toBe(name)
  })
})

test.describe('Library drawer (V7)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page, PAGE)
  })

  test('opens from the toolbar, shows symbols by category, closes with Escape', async ({ page }) => {
    const button = page.locator('#tool_library')
    await button.click()
    await expect(page.locator('#se-library')).toBeVisible()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#se-library-search')).toBeFocused()
    expect(await page.locator('.se-library-item[data-kind="symbol"]').count()).toBe(18)
    expect(await page.locator('.se-library-section h3').count()).toBe(4)
    await page.keyboard.press('Escape')
    await expect(page.locator('#se-library')).toBeHidden()
    expect(await page.evaluate(() => {
      const active = document.activeElement
      return active?.id === 'tool_library' || active?.shadowRoot?.activeElement != null || active?.closest?.('#tool_library') != null
    })).toBe(true)
  })

  test('a symbol dragged onto the canvas lands where it is dropped, one undo step, selected; the drawer closes', async ({ page }) => {
    await page.locator('#tool_library').click()
    const area = page.locator('#workarea')
    const box = await area.boundingBox()
    const drop = { x: box.width - 300, y: 300 }
    await page.locator('.se-library-item[data-key="gtb-vanne-3v"]').dragTo(area, { targetPosition: drop })
    const point = await page.evaluate(([x, y]) => window.svgEditor.view.screenToDoc(x, y), [box.x + drop.x, box.y + drop.y])
    const use = await page.evaluate(() => {
      const u = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)[0]
      return { tag: u?.localName, x: Number(u?.getAttribute('x')), y: Number(u?.getAttribute('y')) }
    })
    expect(use.tag).toBe('use')
    expect(Math.abs(use.x + 20 - point.x)).toBeLessThan(1.5)
    expect(Math.abs(use.y + 20 - point.y)).toBeLessThan(1.5)
    expect(await steps(page)).toBe(1)
    await expect(page.locator('#se-library')).toBeHidden()
  })

  test('the search looks into symbols and shapes, accents aside; a click puts a shape in the middle of the view', async ({ page }) => {
    await page.locator('#tool_library').click()
    await page.locator('#se-library-search').fill('echangeur')
    await expect(page.locator('.se-library-item[data-key="gtb-echangeur"]')).toBeVisible()
    await page.locator('#se-library-search').fill('heart')
    await expect(page.locator('.se-library-item[data-kind="shape"]').first()).toBeVisible()
    await expect(page.locator('.se-library-tabs')).toBeHidden()
    await page.locator('#se-library-search').fill('')
    await page.locator('#se-library-tab-shapes').click()
    await page.locator('.se-library-item[data-key="basic/heart"]').click()
    const shape = await page.evaluate(() => {
      const el = window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean)[0]
      const b = el.getBBox()
      const c = window.svgEditor.view.center
      return { tag: el.localName, w: Math.round(b.width), cx: Math.round(b.x + b.width / 2 - c.x), cy: Math.round(b.y + b.height / 2 - c.y), opacity: el.getAttribute('opacity') }
    })
    expect(shape.tag).toBe('path')
    expect(shape.w).toBeLessThanOrEqual(80)
    expect(Math.abs(shape.cx)).toBeLessThan(41)
    // Opaque, as the style says: not the half opacity of a shape being drawn
    expect(shape.opacity === null || shape.opacity === '1').toBe(true)
    expect(await steps(page)).toBe(1)
  })

  test('images: those of the document, and a file of the computer', async ({ page }) => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC'
    await page.locator('#tool_library').click()
    await page.locator('#se-library-tab-images').click()
    await expect(page.locator('.se-library-empty')).toBeVisible()
    await page.locator('#se-library-file').setInputFiles({
      name: 'point.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png.split(',')[1], 'base64')
    })
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('#svgcontent image').length)).toBe(1)
    await page.locator('#tool_library').click()
    await page.locator('#se-library-tab-images').click()
    await expect(page.locator('.se-library-item[data-kind="image"]')).toHaveCount(1)
    await page.locator('.se-library-item[data-kind="image"]').click()
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('#svgcontent image').length)).toBe(2)
  })
})

test.describe('Orthogonal connectors (V7)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page, PAGE)
    await page.evaluate(() => {
      const ed = window.svgEditor
      ed.symbols.insert('gtb-pompe', { x: 120, y: 120 }).id = 'pompe'
      ed.symbols.insert('gtb-vanne-2v', { x: 400, y: 300 }).id = 'vanne'
      ed.svgCanvas.clearSelection()
      ed.svgCanvas.undoMgr.resetUndoStack()
    })
  })

  const screen = (page, x, y) => page.evaluate(([x, y]) => window.svgEditor.view.docToScreen(x, y), [x, y])
  const connector = (page) => page.evaluate(() => {
    const conn = window.svgEditor.svgCanvas.orthogonalConnectors()[0]
    if (!conn) return null
    const se = (name) => conn.getAttributeNS('http://svg-edit.googlecode.com', name)
    return {
      id: conn.id,
      points: conn.getAttribute('points'),
      ends: se('connector'),
      ports: [se('start-port'), se('end-port')],
      route: se('route'),
      fluid: se('fluid'),
      stroke: conn.getAttribute('stroke'),
      width: conn.getAttribute('stroke-width'),
      marker: conn.getAttribute('marker-end'),
      className: conn.getAttribute('class')
    }
  })
  const draw = async (page, from, to) => {
    await page.locator('#tool_connect').click()
    const a = await screen(page, ...from)
    const b = await screen(page, ...to)
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 })
    await page.mouse.move(b.x + 3, b.y - 2, { steps: 4 })
    await page.mouse.up()
  }
  const isOrthogonal = (points) => {
    const p = points.split(' ').map((pair) => pair.split(',').map(Number))
    return p.every((q, i) => i === 0 || q[0] === p[i - 1][0] || q[1] === p[i - 1][1])
  }

  test('the tool joins two ports at right angles, the ports catching the pointer; one undo step', async ({ page }) => {
    // The port of the valve is a magnet: the pointer stops a few pixels away.
    await draw(page, [140, 120], [380, 300])
    const conn = await connector(page)
    expect(conn.ends).toBe('pompe vanne')
    expect(conn.ports).toEqual(['out', 'in'])
    expect(conn.route).toBe('auto')
    expect(isOrthogonal(conn.points)).toBe(true)
    expect(conn.points.startsWith('140,120 ')).toBe(true)
    expect(conn.points.endsWith(' 380,300')).toBe(true)
    expect(await steps(page)).toBe(1)
    expect(await selected(page)).toEqual([conn.id])
    // Under the equipments, as the pipes of a synoptic
    expect(await page.evaluate((id) => {
      const layer = document.getElementById(id).parentNode
      return [...layer.children].filter((el) => el.localName !== 'title').map((el) => el.id)
    }, conn.id)).toEqual([conn.id, 'fond', 'pompe', 'vanne'])
    // The save keeps what joins it, in the editor namespace.
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toContain('se:connector="pompe vanne"')
    expect(saved).toContain('se:start-port="out"')
  })

  test('two clicks draw it too; the ports show on hover', async ({ page }) => {
    const v = await screen(page, 400, 300)
    await page.mouse.move(v.x, v.y)
    await expect.poll(() => page.locator('#se-connector-overlay .se-port').count()).toBe(3)
    await page.locator('#tool_connect').click()
    const a = await screen(page, 140, 120)
    const b = await screen(page, 400, 280)
    await page.mouse.click(a.x, a.y)
    await page.mouse.move(b.x, b.y, { steps: 5 })
    await page.mouse.click(b.x, b.y)
    const conn = await connector(page)
    expect(conn.ports).toEqual(['out', 'signal'])
    expect(isOrthogonal(conn.points)).toBe(true)
  })

  test('the route follows a moved equipment, during the drag and after; undo and redo bring it back', async ({ page }) => {
    await draw(page, [140, 120], [380, 300])
    const before = (await connector(page)).points
    await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
    await page.locator('#tool_select').click()
    const v = await screen(page, 400, 300)
    await page.mouse.click(v.x, v.y)
    await page.mouse.move(v.x, v.y)
    await page.mouse.down()
    await page.mouse.move(v.x + 40, v.y + 60, { steps: 6 })
    await expect.poll(async () => (await connector(page)).points).not.toBe(before)
    await page.mouse.up()
    const after = (await connector(page)).points
    expect(after.endsWith(' 420,360')).toBe(true)
    expect(isOrthogonal(after)).toBe(true)
    await page.keyboard.press('Control+z')
    expect((await connector(page)).points).toBe(before)
    await page.keyboard.press('Control+Shift+z')
    expect((await connector(page)).points).toBe(after)
  })

  test('an elbow dragged shapes the route in one step; the shape stays when an equipment moves', async ({ page }) => {
    await draw(page, [140, 120], [380, 300])
    const handle = page.locator('#se-connector-overlay .se-elbow').first()
    await expect(handle).toBeVisible()
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 30, { steps: 5 })
    await page.mouse.up()
    const shaped = await connector(page)
    expect(shaped.route).toBe('manual')
    expect(shaped.points).toBe('140,120 200,120 200,300 380,300')
    expect(await steps(page)).toBe(2)
    // The valve goes down: the vertical segment keeps its place.
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([document.getElementById('vanne')], true)
      c.moveSelectedElements(0, 40)
    })
    expect((await connector(page)).points).toBe('140,120 200,120 200,340 380,340')
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    expect((await connector(page)).route).toBe('auto')
    // The palette gives the automatic route back.
    await page.keyboard.press('Control+Shift+z')
    await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      c.selectOnly([c.orthogonalConnectors()[0]], true)
      window.svgEditor.commands.execute('connector_route_auto')
    })
    expect((await connector(page)).route).toBe('auto')
  })

  test('a fluid gives colour, width, arrow and class in one step; the next connector takes it', async ({ page }) => {
    await draw(page, [140, 120], [380, 300])
    await page.locator('#se-tab-properties').click()
    await expect(page.locator('#se-connector-fluid')).toBeVisible()
    await page.locator('#se-connector-fluid').selectOption('chaud-depart')
    const hot = await connector(page)
    expect([hot.fluid, hot.stroke, hot.width, hot.className]).toEqual(['chaud-depart', '#F08A62', '3', 'tuyau chaud depart'])
    expect(hot.marker).toMatch(/^url\(#se-arrow-F08A62\)$/)
    expect(await page.evaluate(() => document.querySelector('#svgcontent marker#se-arrow-F08A62 path').getAttribute('fill'))).toBe('#F08A62')
    expect(await steps(page)).toBe(2)
    await page.locator('#se-connector-arrow').uncheck()
    expect((await connector(page)).marker).toBe(null)
    await page.locator('#se-tab-properties').focus()
    await page.keyboard.press('Control+z')
    expect((await connector(page)).marker).not.toBe(null)
    expect(await page.evaluate(() => window.svgEditor.connectors.fluidId)).toBe('chaud-depart')
  })

  test('between two plain objects, the connector stays the straight one of the extension', async ({ page }) => {
    await load(page, `<svg xmlns="${NS}" width="640" height="480"><g class="layer"><title>L</title>
      <rect id="a" x="50" y="50" width="80" height="60"/><rect id="b" x="300" y="200" width="80" height="60"/></g></svg>`)
    const a = await screen(page, 90, 80)
    const b = await screen(page, 340, 230)
    await page.locator('#tool_connect').click()
    await page.mouse.move(a.x, a.y)
    await page.mouse.down()
    await page.mouse.move(b.x, b.y, { steps: 6 })
    await page.mouse.up()
    const line = await page.evaluate(() => {
      const el = document.querySelector('#svgcontent polyline')
      return { ends: el?.getAttributeNS('http://svg-edit.googlecode.com', 'connector'), route: el?.getAttributeNS('http://svg-edit.googlecode.com', 'route'), n: el?.points.numberOfItems }
    })
    expect(line).toEqual({ ends: 'a b', route: null, n: 3 })
  })

  test('copied with its equipments, a connector joins the copies', async ({ page }) => {
    await page.evaluate(() => {
      const ed = window.svgEditor
      const c = ed.svgCanvas
      c.addConnector({ start: document.getElementById('pompe'), startPort: 'out', end: document.getElementById('vanne'), endPort: 'in', fluid: ed.connectors.fluid('froid-depart') })
      c.selectOnly([document.getElementById('pompe'), document.getElementById('vanne'), c.orthogonalConnectors()[0]], true)
      c.copySelectedElements()
      c.pasteElements('in_place')
    })
    const ends = await page.evaluate(() => window.svgEditor.svgCanvas.orthogonalConnectors()
      .map((conn) => conn.getAttributeNS('http://svg-edit.googlecode.com', 'connector')))
    expect(ends).toHaveLength(2)
    expect(ends[0]).toBe('pompe vanne')
    expect(ends[1]).not.toBe('pompe vanne')
    expect(ends[1].split(' ').every((id) => id && id !== 'pompe' && id !== 'vanne')).toBe(true)
  })
})

test.describe('Ports as magnets (V7)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page, PAGE)
    await page.evaluate(() => {
      const ed = window.svgEditor
      ed.setConfig({ objectSnapping: true })
      ed.symbols.insert('gtb-pompe', { x: 200, y: 200 }).id = 'pompe'
      ed.symbols.insert('gtb-sonde-temperature', { x: 100, y: 100 }).id = 'sonde'
      ed.svgCanvas.clearSelection()
      ed.svgCanvas.undoMgr.resetUndoStack()
    })
  })

  test('a probe dragged near the power port of a pump lands on it', async ({ page }) => {
    // The probe port (bottom middle) at (100, 120); the power port of the pump at (200, 180).
    const from = await page.evaluate(() => window.svgEditor.view.docToScreen(100, 100))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    // 97 + 4: within the reach of the port, not on it
    await page.mouse.move(from.x + 50, from.y + 30, { steps: 4 })
    await page.mouse.move(from.x + 97, from.y + 64, { steps: 4 })
    await page.mouse.up()
    const port = await page.evaluate(() => window.svgEditor.svgCanvas.portsOf(document.getElementById('sonde'))[0])
    expect([Math.round(port.x), Math.round(port.y)]).toEqual([200, 180])
  })
})

test.describe('Templates (V7)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await load(page, PAGE)
  })

  test('the document menu opens the templates; the synoptic one gives the page, its frame and its layers', async ({ page }) => {
    await page.locator('#main_button').click()
    await expect(page.locator('#tool_template')).toBeVisible()
    // Right after "New document"
    expect(await page.evaluate(() => document.getElementById('tool_template').previousElementSibling?.id)).toBe('tool_clear')
    await page.locator('#tool_template').click()
    await expect(page.locator('#se-templates')).toBeVisible()
    await expect(page.locator('.se-template-card')).toHaveCount(3)
    await page.locator('.se-template-card[data-template="synoptic"]').click()
    const doc = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      const drawing = c.getCurrentDrawing()
      const layers = drawing.all_layers.map((layer) => [layer.getName(), c.isLockedSelf(layer.getGroup())])
      return {
        size: c.getResolution(),
        frames: c.getFrames().map((f) => [f.x, f.y, f.width, f.height]),
        layers,
        current: drawing.getCurrentLayerName(),
        snap: window.svgEditor.configObj.curConfig.gridSnapping,
        steps: c.undoMgr.getUndoStackSize()
      }
    })
    expect(doc.size).toEqual({ w: 1920, h: 1080, zoom: expect.any(Number) })
    expect(doc.frames).toEqual([[0, 0, 1920, 1080]])
    expect(doc.layers.map(([, locked]) => locked)).toEqual([true, false, false, false])
    expect(doc.layers).toHaveLength(4)
    expect(doc.current).toBe(doc.layers[2][0])
    expect(doc.snap).toBe(true)
    expect(doc.steps).toBe(0)
  })

  test('the technical diagram: A3 landscape, grid shown and snapping; a symbol and its ports fall on the grid', async ({ page }) => {
    await page.evaluate(() => window.svgEditor.templates.apply('technical'))
    const result = await page.evaluate(() => {
      const ed = window.svgEditor
      const use = ed.symbols.insert('gtb-vanne-3v', { x: 123, y: 87 })
      return {
        size: [ed.svgCanvas.getResolution().w, ed.svgCanvas.getResolution().h],
        grid: ed.grid.visible,
        snap: ed.configObj.curConfig.gridSnapping,
        ports: ed.svgCanvas.portsOf(use).map((p) => [p.x % 10, p.y % 10])
      }
    })
    expect(result.size).toEqual([1587, 1123])
    expect(result.grid).toBe(true)
    expect(result.snap).toBe(true)
    for (const [x, y] of result.ports) {
      expect(x).toBe(0)
      expect(y).toBe(0)
    }
  })
})

test.describe('Reference synoptic (V7)', () => {
  test('a heating plant made end to end: symbols, networks by fluid, values, frame; the export holds them and renders', async ({ page }) => {
    const { buildReference, describeExport } = await import('./gtb-reference.js')
    await visitAndApproveStorage(page)
    const { saved, exported } = await page.evaluate(buildReference)
    const out = await page.evaluate(describeExport, exported)
    expect(out.parseError).toBe(false)
    expect(out.viewBox).toBe('0 0 1920 1080')
    expect(out.size).toEqual(['1920', '1080'])
    // Six kinds of equipment, thirteen instances, each with its id and title
    expect(out.symbols).toBe(6)
    expect(out.uses).toHaveLength(13)
    expect(out.uses.every(([id, title]) => id && !id.startsWith('svg_') && title.length > 0)).toBe(true)
    // Fourteen networks, by fluid, with the classes of the synoptics
    expect(out.pipes).toHaveLength(14)
    expect(new Set(out.pipes)).toEqual(new Set(['tuyau chaud depart', 'tuyau chaud retour']))
    // The values, each with its stable id and its point
    expect(out.points).toEqual([
      ['etat-chaudiere-1', 'CHAUF.CH1.ETAT'], ['etat-chaudiere-2', 'CHAUF.CH2.ETAT'],
      ['t-depart-c1', 'CHAUF.C1.T_DEPART'], ['energie-c1', 'CHAUF.C1.ENERGIE'],
      ['t-depart-c2', 'CHAUF.C2.T_DEPART'], ['energie-c2', 'CHAUF.C2.ENERGIE']
    ])
    expect(out.frames).toBe(0)
    expect(out.scripts).toBe(0)
    // Every network at right angles, its ends on the ports of its equipments
    const check = await page.evaluate(() => {
      const c = window.svgEditor.svgCanvas
      return c.orthogonalConnectors().map((conn) => {
        const pts = conn.getAttribute('points').split(' ').map((p) => p.split(',').map(Number))
        const right = pts.every((p, i) => i === 0 || p[0] === pts[i - 1][0] || p[1] === pts[i - 1][1])
        const { start, end, startPort, endPort } = c.connectorEnds(conn)
        const a = c.portOf(start, startPort)
        const b = c.portOf(end, endPort)
        const first = pts[0]
        const last = pts[pts.length - 1]
        return right && first[0] === a.x && first[1] === a.y && last[0] === b.x && last[1] === b.y
      })
    })
    expect(check).toHaveLength(14)
    expect(check.every(Boolean)).toBe(true)
    // The saved file opens again as it is: same text
    const again = await page.evaluate((svg) => {
      const c = window.svgEditor.svgCanvas
      c.setSvgString(svg)
      return c.getSvgString()
    }, saved)
    expect(again).toBe(saved)
    // The export renders in an image (no script, no network): its symbols draw.
    const rendered = await page.evaluate((svg) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 192
        canvas.height = 108
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, 192, 108)
        const data = ctx.getImageData(0, 0, 192, 108).data
        let colours = 0
        const seen = new Set()
        for (let i = 0; i < data.length; i += 4) {
          const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`
          if (!seen.has(key)) { seen.add(key); colours++ }
        }
        resolve({ ok: true, colours })
      }
      img.onerror = () => resolve({ ok: false })
      img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    }), exported)
    expect(rendered.ok).toBe(true)
    expect(rendered.colours).toBeGreaterThan(5)
  })
})
