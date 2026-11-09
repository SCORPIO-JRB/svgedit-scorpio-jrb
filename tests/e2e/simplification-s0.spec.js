import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// S0 of the simplification audit (docs/audit-simplification.md): the net laid
// before lots S1 to S3 take tools out of the interface.
// - The inventory records what the editor offers today: the commands of the
//   registry and their shortcuts, the toolbar, the document, zoom and "…"
//   menus, the controls of the Text section. S1 and S3 update it on purpose
//   (S0_UPDATE=1 rewrites it); nothing else may change it. S1 did so.
//   The canvas layout only: simplification-s1.spec.js checks that the
//   classic layout stays as it was.
// - Every family of element these lots touch (square, circle, polygons, star,
//   shape of the library, freehand path, blur, rare text settings) still
//   opens, moves, resizes, rotates, groups, undoes and saves as before.
// - The behaviour S2 corrected (objects styled by a class, X Y W H of a
//   polygon) was recorded before it; S2 turned these tests round.

const DIR = path.join(process.cwd(), 'tests/fixtures/simplification')
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8')
const INVENTORY_FILE = path.join(DIR, 'inventaire.json')

async function loadDrawing (page, svg) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, svg)
}

const nextFrame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))

async function select (page, ids) {
  await page.evaluate((ids) => {
    const c = window.svgEditor.svgCanvas
    c.clearSelection()
    c.addToSelection(ids.map((id) => document.getElementById(id)), true)
  }, ids)
  await nextFrame(page)
}

/** What the editor offers, read in the page. Lists are sorted: extensions load in any order. */
const readInventory = () => {
  const sorted = (list) => [...new Set(list)].sort()
  const shown = (el) => getComputedStyle(el).display !== 'none'
  const commands = Object.fromEntries(window.svgEditor.commands.list()
    .map((command) => [command.id, sorted(command.shortcuts.map((shortcut) => shortcut.toLowerCase()))])
    .sort(([a], [b]) => a.localeCompare(b)))
  const toolbar = Object.fromEntries([...document.querySelectorAll('#tools_left se-button, #tools_left se-explorerbutton, #tools_left se-flyingbutton')]
    .filter(shown)
    .map((tool) => [tool.id, tool.parentElement.closest('se-flyingbutton')?.id ?? tool.getAttribute('data-group') ?? ''])
    .sort(([a], [b]) => a.localeCompare(b)))
  const documentMenu = sorted([...document.querySelectorAll('#main_button se-menu-item')].filter(shown).map((item) => item.id))
  const zoomMenu = sorted([...document.querySelectorAll('[data-command]')]
    .filter((item) => item.closest('se-popover, #se-view-group, .se-view-group'))
    .map((item) => item.getAttribute('data-command') || item.textContent.trim()))
  // The menu is closed: an entry counts when no panel inside it is hidden.
  const shownInMenu = (item) => {
    for (let node = item; node && node.id !== 'se-actions-menu'; node = node.parentElement) {
      if (!shown(node)) return false
    }
    return true
  }
  const actionsMenu = sorted([...document.querySelectorAll('#se-actions-menu se-button, #se-actions-menu se-list')]
    .filter(shownInMenu).map((item) => item.id))
  return { commands, toolbar, documentMenu, zoomMenu, actionsMenu }
}

/**
 * The controls of the Text section, in their order, for the selected text:
 * those shown, then those folded under "More options" (lot S1).
 */
const readTextSection = () => {
  const shown = () => [...document.querySelectorAll('[data-section="text"] :is(se-input, se-spin-input, se-select, se-list, se-button)')]
    .filter((control) => {
      const box = control.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && getComputedStyle(control).visibility !== 'hidden'
    })
    .map((control) => control.id)
  const before = shown()
  const toggle = document.querySelector('[data-section="text"] .se-more-toggle')
  if (!toggle) return { shown: before, more: [] }
  toggle.click()
  const more = shown().filter((id) => !before.includes(id))
  toggle.click()
  return { shown: before, more }
}

test.describe('Simplification net (S0)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
  })

  test('the registry, the toolbar and the menus are those of the inventory', async ({ page }) => {
    // The "…" menu is read with a rectangle selected, the Text section with
    // a text that has none of the rare settings (lot S1).
    await loadDrawing(page, read('familles.svg'))
    await select(page, ['rectangle'])
    const inventory = await page.evaluate(readInventory)
    await select(page, ['texte-simple'])
    inventory.textSection = await page.evaluate(readTextSection)
    if (process.env.S0_UPDATE === '1') {
      fs.writeFileSync(INVENTORY_FILE, JSON.stringify(inventory, null, 2) + '\n')
    }
    expect(inventory).toEqual(JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8')))
  })

  test('a shortcut shared by two commands is one of those known', async ({ page }) => {
    const shared = await page.evaluate(() => {
      const byShortcut = {}
      for (const command of window.svgEditor.commands.list()) {
        for (const shortcut of command.shortcuts) (byShortcut[shortcut.toLowerCase()] ??= []).push(command.id)
      }
      return Object.fromEntries(Object.entries(byShortcut)
        .filter(([, ids]) => ids.length > 1)
        .map(([shortcut, ids]) => [shortcut, ids.sort()])
        .sort(([a], [b]) => a.localeCompare(b)))
    })
    expect(shared).toEqual({
      // The same action registered twice: merged in S3.
      backspace: ['delete', 'tool_delete', 'tool_delete_multi'],
      delete: ['delete', 'tool_delete', 'tool_delete_multi'],
      'mod+shift+[': ['move_back', 'tool_move_bottom'],
      'mod+shift+]': ['move_front', 'tool_move_top']
      // Ctrl+Shift+L is the lock alone since S1, which took the layer view
      // out of the default extensions of the canvas layout.
    })
  })

  test('Ctrl+Shift+L locks the selection and leaves the layers as they are', async ({ page }) => {
    await loadDrawing(page, read('familles.svg'))
    await select(page, ['carre'])
    await page.evaluate(() => document.activeElement?.blur?.())
    await page.keyboard.press('Control+Shift+L')
    await nextFrame(page)
    const state = await page.evaluate(() => ({
      locked: document.getElementById('carre').getAttributeNS('http://svg-edit.googlecode.com', 'locked'),
      hidden: [...document.querySelectorAll('#svgcontent > g.layer')].filter((layer) => getComputedStyle(layer).display === 'none').length
    }))
    expect(state).toEqual({ locked: 'true', hidden: 0 })
  })

  // What each family keeps through the edits, besides its id.
  const FAMILIES = {
    carre: { tag: 'rect' },
    cercle: { tag: 'circle' },
    rectangle: { tag: 'rect' },
    ellipse: { tag: 'ellipse' },
    'pompe-corps': { tag: 'polygon' },
    etoile: { tag: 'polygon', keeps: { shape: 'star', point: '5' } },
    hexagone: { tag: 'polygon', keeps: { shape: 'regularPoly', sides: '6' } },
    fleche: { tag: 'path' },
    'trace-libre': { tag: 'path' },
    'flou-fond': { tag: 'rect', keeps: { filter: 'url(#flou)' } },
    'texte-barre': { tag: 'text', keeps: { 'text-decoration': 'line-through' } },
    'texte-surligne': { tag: 'text', keeps: { 'text-decoration': 'overline' } },
    'texte-espace': { tag: 'text', keeps: { 'word-spacing': '6', 'letter-spacing': '1' } },
    'texte-longueur': { tag: 'text', keeps: { textLength: '120', lengthAdjust: 'spacingAndGlyphs' } }
  }

  for (const [id, { tag, keeps = {} }] of Object.entries(FAMILIES)) {
    test(`${id}: opened, moved, resized, rotated, grouped, undone, saved and opened again`, async ({ page }) => {
      await loadDrawing(page, read('familles.svg'))
      const before = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
      const shown = await page.evaluate((id) => {
        const el = document.getElementById(id)
        const box = el.getBBox()
        return { tag: el.tagName, drawn: box.width > 0 && box.height > 0 }
      }, id)
      expect(shown).toEqual({ tag, drawn: true })

      await select(page, [id])
      await page.evaluate(() => window.svgEditor.svgCanvas.moveSelectedElements(15, 10))
      await nextFrame(page)
      const width = () => page.evaluate((id) => document.getElementById(id).getBoundingClientRect().width, id)
      const widthBefore = await width()
      const grip = await page.locator('#selectorGrip_resize_se').boundingBox()
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
      await page.mouse.down()
      await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2 + 12, { steps: 4 })
      await page.mouse.up()
      await nextFrame(page)
      expect(await width()).toBeGreaterThan(widthBefore + 5)
      await select(page, [id])
      await page.evaluate(() => {
        const c = window.svgEditor.svgCanvas
        c.setRotationAngle(30)
        c.groupSelectedElements()
        c.ungroupSelectedElement()
      })
      await nextFrame(page)

      const edited = await page.evaluate(({ id, keeps }) => {
        const c = window.svgEditor.svgCanvas
        const el = document.getElementById(id)
        const kept = Object.fromEntries(Object.keys(keeps).map((name) => [name, el?.getAttribute(name)]))
        const saved = c.getSvgString()
        const steps = c.undoMgr.getUndoStackSize()
        while (c.undoMgr.getUndoStackSize()) c.undoMgr.undo()
        return { tag: el?.tagName, kept, saved, steps, undone: c.getSvgString() }
      }, { id, keeps })
      expect(edited.tag).toBe(tag)
      expect(edited.kept).toEqual(keeps)
      // Move, resize, rotate, group, ungroup.
      expect(edited.steps).toBe(5)
      expect(edited.saved).not.toBe(before)
      expect(edited.undone).toBe(before)

      // Opened again, the edited drawing is saved as the same text.
      await loadDrawing(page, edited.saved)
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(edited.saved)
    })
  }

  test.describe('What S2 corrected', () => {
    const field = (page, id) => page.evaluate((id) => {
      const el = document.getElementById(id)
      return el.shadowRoot?.querySelector('input')?.value ?? String(el.value)
    }, id)
    const visible = (page, id) => page.evaluate((id) => {
      const el = document.getElementById(id)
      if (!el) return false
      const box = el.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }, id)
    // The warning of S2, accepted: the rule changes (simplification-s2.spec.js)
    const accept = async (page) => {
      const dialog = page.locator('se-elix-alert-dialog')
      await dialog.locator('[part~="choice-button"]').first().click()
      await expect(dialog).toHaveCount(0)
    }

    test('the fill of an object styled by a class: shown as drawn, changed in its rule', async ({ page }) => {
      await loadDrawing(page, read('styles-classe.svg'))
      await select(page, ['fond'])
      // Before S2: "000000", and the attribute written out of sight.
      expect((await field(page, 'fill_color')).toUpperCase()).toBe('160F23')
      await page.evaluate(() => window.svgEditor.svgCanvas.setColor('fill', '#00ff00'))
      await accept(page)
      const after = await page.evaluate(() => {
        const el = document.getElementById('fond')
        return { attribute: el.getAttribute('fill'), drawn: getComputedStyle(el).fill }
      })
      expect(after).toEqual({ attribute: null, drawn: 'rgb(0, 255, 0)' })
    })

    test('the font of a text styled by its classes: size shown, changed in its rules', async ({ page }) => {
      await loadDrawing(page, read('styles-classe.svg'))
      await select(page, ['titre'])
      // Before S2: "null", and the attributes written out of sight.
      expect(await field(page, 'font_size')).toBe('34')
      await page.evaluate(() => window.svgEditor.svgCanvas.setFontSize(48))
      await accept(page)
      await page.evaluate(() => window.svgEditor.svgCanvas.setFontFamily('Courier New'))
      await accept(page)
      const after = await page.evaluate(() => {
        const el = document.getElementById('titre')
        const style = getComputedStyle(el)
        return { size: el.getAttribute('font-size'), family: el.getAttribute('font-family'), drawnSize: style.fontSize, drawnFamily: style.fontFamily }
      })
      expect(after).toEqual({ size: null, family: null, drawnSize: '48px', drawnFamily: '"Courier New"' })
    })

    test('a value inherited from a group: written on the object, it shows', async ({ page }) => {
      // S2 kept this: an attribute wins over an inherited value.
      await loadDrawing(page, read('styles-classe.svg'))
      await select(page, ['libelle-pompe'])
      const drawn = await page.evaluate(() => {
        window.svgEditor.svgCanvas.setColor('fill', '#00ff00')
        return getComputedStyle(document.getElementById('libelle-pompe')).fill
      })
      expect(drawn).toBe('rgb(0, 255, 0)')
    })

    test('a polygon of a file has X, Y, W, H; a polygon of the extension has its panel', async ({ page }) => {
      await loadDrawing(page, read('familles.svg'))
      await select(page, ['pompe-corps'])
      // Before S2: the angle alone. Now the box, as for a polyline.
      expect(await visible(page, 'selected_x')).toBe(true)
      expect(await visible(page, 'selected_w')).toBe(true)
      expect(await visible(page, 'angle')).toBe(true)
      await select(page, ['etoile'])
      expect(await visible(page, 'star_panel')).toBe(true)
    })
  })
})
