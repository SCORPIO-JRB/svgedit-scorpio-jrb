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
    expect(await selected(page)).toEqual([])
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
