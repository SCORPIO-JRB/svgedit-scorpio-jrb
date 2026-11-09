import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// S2 of the simplification audit (docs/audit-simplification.md): objects
// styled by a class, and X Y W H of a polygon of a file. Both layouts.
// - The panels show the value as drawn, given by the rule, and name the
//   rule next to the field.
// - A change goes to the rule: the drawing changes, no attribute is added,
//   the editor warns of the objects the rule styles. Refused, nothing is
//   left; accepted, one step undoes it.
// - The text styles of V4 follow the same way.
// - A polygon without `shape` moves and resizes by X, Y, W and H.

const SIMPLIFICATION = path.join(process.cwd(), 'tests/fixtures/simplification')
const SCORPIO = path.join(process.cwd(), 'tests/fixtures/import/scorpio')
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8')

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

const dialog = (page) => page.locator('se-elix-alert-dialog')
const answer = async (page, label) => {
  await dialog(page).locator('[part~="choice-button"]', { hasText: label }).click()
  await expect(dialog(page)).toHaveCount(0)
}

const sheet = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgContent().querySelector('style').textContent)
const field = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id)
  return el.shadowRoot?.querySelector('input')?.value ?? String(el.value)
}, id)
// The colour of a paint field, in both layouts
const paint = (page, id) => page.evaluate((id) => document.getElementById(id).paintBox?.paint?.solidColor?.toUpperCase() ?? null, id)
// The rules named in the title of the section of a field (canvas layout)
const note = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id)?.closest('[data-section]')?.querySelector('.se-section-title .se-rule-note')
  if (!el?.isConnected) return null
  const box = el.getBoundingClientRect()
  return { text: el.textContent, shown: box.width > 0 && box.height > 0, title: el.title }
}, id)
const drawn = (page, id, name) => page.evaluate(({ id, name }) => getComputedStyle(document.getElementById(id)).getPropertyValue(name), { id, name })
const attribute = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id).getAttribute(name), { id, name })
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

for (const layout of ['canvas', 'classic']) {
  test.describe(`Objects styled by a class (${layout} layout)`, () => {
    test.beforeEach(async ({ page }) => {
      await visitAndApproveStorage(page, layout === 'classic' ? { query: '?layout=classic' } : {})
    })

    test('the fill shows the value of the rule, named next to the field', async ({ page }) => {
      await loadDrawing(page, read(SIMPLIFICATION, 'styles-classe.svg'))
      await select(page, ['fond'])
      expect(await paint(page, 'fill_color')).toBe('160F23')
      // The inspector of the canvas layout names the rule; the classic
      // layout has no place for it.
      expect(await note(page, 'fill_color')).toEqual(layout === 'canvas'
        ? { text: '.fond', shown: true, title: 'Values of the rule .fond' }
        : null)
      // An object no rule styles has no note.
      await select(page, ['libelle-pompe'])
      expect(await note(page, 'fill_color')).toBe(null)
    })

    test('a change, confirmed, rewrites the rule: the drawing changes, no attribute is added; one step undoes it', async ({ page }) => {
      await loadDrawing(page, read(SIMPLIFICATION, 'styles-classe.svg'))
      const before = await sheet(page)
      await select(page, ['fond'])
      await page.evaluate(() => window.svgEditor.svgCanvas.setColor('fill', '#00ff00'))
      await expect(dialog(page)).toContainText('This colour comes from the rule .fond, which applies to 1 object. Change the rule?')
      // The drawing shows the change while the warning asks.
      expect(await drawn(page, 'fond', 'fill')).toBe('rgb(0, 255, 0)')
      await answer(page, 'Change the rule')
      expect(await sheet(page)).toBe(before.replace('.fond { fill: #160F23; }', '.fond { fill: #00ff00; }'))
      expect(await attribute(page, 'fond', 'fill')).toBe(null)
      expect(await paint(page, 'fill_color')).toBe('00FF00')
      expect(await steps(page)).toBe(1)
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await sheet(page)).toBe(before)
      expect(await drawn(page, 'fond', 'fill')).toBe('rgb(22, 15, 35)')
    })

    test('a change refused leaves nothing: the sheet, no step to undo or redo, the selection kept', async ({ page }) => {
      await loadDrawing(page, read(SIMPLIFICATION, 'styles-classe.svg'))
      const before = await sheet(page)
      await select(page, ['titre'])
      await page.evaluate(() => window.svgEditor.svgCanvas.setFontSize(48))
      await expect(dialog(page)).toContainText('This size comes from the rule .titre-page')
      await answer(page, 'Cancel')
      expect(await sheet(page)).toBe(before)
      expect(await attribute(page, 'titre', 'font-size')).toBe(null)
      expect(await page.evaluate(() => {
        const c = window.svgEditor.svgCanvas
        return { undo: c.undoMgr.getUndoStackSize(), redo: c.undoMgr.getRedoStackSize(), selected: c.getSelectedElements().filter(Boolean).map((el) => el.id) }
      })).toEqual({ undo: 0, redo: 0, selected: ['titre'] })
      expect(await field(page, 'font_size')).toBe('34')
    })

    test('the font of a text styled by two classes: each value from its rule', async ({ page }) => {
      await loadDrawing(page, read(SIMPLIFICATION, 'styles-classe.svg'))
      await select(page, ['titre'])
      expect(await field(page, 'font_size')).toBe('34')
      if (layout === 'canvas') {
        expect(await note(page, 'font_size')).toEqual({ text: '.titre, .titre-page', shown: true, title: 'Values of the rules .titre, .titre-page' })
      }
      await page.evaluate(() => window.svgEditor.svgCanvas.setFontSize(48))
      await answer(page, 'Change the rule')
      // Accepted for the selection: the family of .titre asks once more,
      // a second size does not.
      await page.evaluate(() => window.svgEditor.svgCanvas.setFontFamily('Courier New'))
      await expect(dialog(page)).toContainText('This font comes from the rule .titre')
      await answer(page, 'Change the rule')
      await page.evaluate(() => window.svgEditor.svgCanvas.setFontSize(40))
      await nextFrame(page)
      await expect(dialog(page)).toHaveCount(0)
      const css = await sheet(page)
      expect(css).toContain('.titre { font-family: Courier New; font-weight: 500; fill: #CEB8FF; }')
      expect(css).toContain('.titre-page { font-size: 40px; }')
      expect(await drawn(page, 'titre', 'font-size')).toBe('40px')
      expect(await attribute(page, 'titre', 'font-size')).toBe(null)
      expect(await attribute(page, 'titre', 'font-family')).toBe(null)
    })

    test('a value inherited from a group is written on the object, without asking', async ({ page }) => {
      await loadDrawing(page, read(SIMPLIFICATION, 'styles-classe.svg'))
      await select(page, ['libelle-pompe'])
      await page.evaluate(() => window.svgEditor.svgCanvas.setColor('fill', '#00ff00'))
      await nextFrame(page)
      await expect(dialog(page)).toHaveCount(0)
      expect(await attribute(page, 'libelle-pompe', 'fill')).toBe('#00ff00')
      expect(await drawn(page, 'libelle-pompe', 'fill')).toBe('rgb(0, 255, 0)')
    })
  })
}

test.describe('Objects styled by a class, on the synoptic', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, read(SCORPIO, 'synoptique-chaufferie.svg'))
  })

  test('task 4 of the user test of V4: width 3 and colour #F08A62 of a pipe, asked once', async ({ page }) => {
    const pipe = await page.evaluate(() => {
      const pipes = [...document.querySelectorAll('#svgcontent .tuyau.arret')]
      return { id: pipes[0].id, count: pipes.length }
    })
    expect(pipe.count).toBeGreaterThan(1)
    const opened = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    await select(page, [pipe.id])
    expect(await field(page, 'stroke_width')).toBe('1.5')
    expect((await note(page, 'stroke_width')).text).toBe('.tuyau.arret, .tuyau')
    // By the field, as a user types it.
    await page.evaluate(() => {
      const width = document.getElementById('stroke_width')
      width.value = 3
      width.dispatchEvent(new CustomEvent('change'))
    })
    await expect(dialog(page)).toContainText(`This width comes from the rule .tuyau.arret, which applies to ${pipe.count} objects.`)
    await answer(page, 'Change the rule')
    await page.evaluate(() => window.svgEditor.svgCanvas.setColor('stroke', '#F08A62'))
    await nextFrame(page)
    await expect(dialog(page)).toHaveCount(0)
    expect(await drawn(page, pipe.id, 'stroke-width')).toBe('3px')
    expect(await drawn(page, pipe.id, 'stroke')).toBe('rgb(240, 138, 98)')
    expect(await sheet(page)).toContain('.tuyau.arret { stroke: #F08A62; stroke-width: 3; }')
    expect(await page.evaluate((id) => {
      const el = document.getElementById(id)
      return [el.getAttribute('stroke'), el.getAttribute('stroke-width')]
    }, pipe.id)).toEqual([null, null])
    // Two steps; undone, the sheet is the file's.
    expect(await steps(page)).toBe(2)
    // Saved, the file differs by the rule alone.
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toBe(opened.replace('.tuyau.arret { stroke: #4F465F; stroke-width: 1.5; }', '.tuyau.arret { stroke: #F08A62; stroke-width: 3; }'))
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.undoMgr.undo()
      window.svgEditor.svgCanvas.undoMgr.undo()
    })
    expect(await sheet(page)).toContain('.tuyau.arret { stroke: #4F465F; stroke-width: 1.5; }')
  })

  test('a text style of V4 changes the rules of a styled text, asked once for all', async ({ page }) => {
    const title = await page.evaluate(() => document.querySelector('#svgcontent text.titre.titre-page').id)
    await select(page, [title])
    await page.evaluate(() => window.svgEditor.textStyles.apply('section_title'))
    await expect(dialog(page)).toContainText(/These values come from the rules \.titre \(\d+ objects\), \.titre-page \(1 object\)\. Change these rules\?/)
    await answer(page, 'Change the rules')
    expect(await drawn(page, title, 'font-size')).toBe('19px')
    expect(await page.evaluate((id) => ['font-family', 'font-size', 'font-weight', 'fill']
      .filter((name) => document.getElementById(id).hasAttribute(name)), title)).toEqual([])
    expect(await steps(page)).toBe(1)
  })
})

test.describe('A polygon of a file', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('moves and resizes by X, Y, W, H; a polygon of the tool keeps its panel', async ({ page }) => {
    await loadDrawing(page, read(SCORPIO, 'repr-pompe.svg'))
    await select(page, ['svg_511'])
    const box = () => page.evaluate(() => {
      const { x, y, width, height } = document.getElementById('svg_511').getBBox()
      return [x, y, width, height].map((n) => Math.round(n * 100) / 100)
    })
    const set = (id, value) => page.evaluate(({ id, value }) => {
      const input = document.getElementById(id)
      input.value = value
      input.dispatchEvent(new CustomEvent('change'))
    }, { id, value })
    const [x, y, width, height] = await box()
    expect(Number(await field(page, 'selected_x'))).toBeCloseTo(x, 1)
    expect(Number(await field(page, 'selected_w'))).toBeCloseTo(width, 1)
    await set('selected_x', 10)
    await set('selected_y', 20)
    await set('selected_w', width * 2)
    expect(await box()).toEqual([10, 20, Math.round(width * 200) / 100, Math.round(height * 100) / 100])
    // The polygon keeps its points, moved and scaled: no transform.
    expect(await attribute(page, 'svg_511', 'transform')).toBe(null)
    expect(y).not.toBe(20)

    await loadDrawing(page, read(SIMPLIFICATION, 'familles.svg'))
    await select(page, ['etoile'])
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('star_panel')).display)).not.toBe('none')
  })
})
