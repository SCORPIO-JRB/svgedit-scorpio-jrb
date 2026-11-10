import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, chooseTool, screenPoint } from './helpers.js'

// S4 of the simplification audit (docs/audit-simplification.md): "Copy /
// Paste properties" and the eyedropper on objects styled by a class, in both
// layouts, as the fields of the panel since S2.
// - They take the values as drawn, those of the rules.
// - They change a value where the target gets it: its rule, after the
//   warning of S2. Refused, nothing is left; accepted, one step undoes it.
// - A property the source does not set gives the value the source shows: a
//   pipe pasted from a stopped one is drawn like it.
// - On a drawing without rules, nothing changes.

const SIMPLIFICATION = path.join(process.cwd(), 'tests/fixtures/simplification')
const SCORPIO = path.join(process.cwd(), 'tests/fixtures/import/scorpio')
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8')

// The drawing of S2, with an object styled by its attributes
const STYLED = read(SIMPLIFICATION, 'styles-classe.svg').replace('  </g>\n</svg>',
  '    <rect id="libre" x="400" y="280" width="60" height="40" fill="#123456" stroke="#000000" stroke-width="2"/>\n  </g>\n</svg>')

async function loadDrawing (page, svg) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
    sessionStorage.removeItem('svgedit_properties')
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

// A click in the middle of an object, as a user does
async function clickOn (page, id) {
  const box = await page.evaluate((id) => {
    const { x, y, width, height } = document.getElementById(id).getBBox()
    return { x: x + width / 2, y: y + height / 2 }
  }, id)
  const at = await screenPoint(page, box.x, box.y)
  await page.mouse.click(at.x, at.y)
  await nextFrame(page)
}

const copy = async (page) => {
  await page.keyboard.press('Control+Alt+c')
  await nextFrame(page)
}
const paste = async (page) => {
  await page.keyboard.press('Control+Alt+v')
  await nextFrame(page)
}

const dialog = (page) => page.locator('se-elix-alert-dialog')
const answer = async (page, label) => {
  await dialog(page).locator('[part~="choice-button"]', { hasText: label }).click()
  await expect(dialog(page)).toHaveCount(0)
}

const sheet = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgContent().querySelector('style').textContent)
const drawn = (page, id, name) => page.evaluate(({ id, name }) => getComputedStyle(document.getElementById(id)).getPropertyValue(name), { id, name })
const attributes = (page, id, names) => page.evaluate(({ id, names }) => {
  const elem = document.getElementById(id)
  return Object.fromEntries(names.map((name) => [name, elem.getAttribute(name)]))
}, { id, names })
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const redoSteps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getRedoStackSize())

for (const layout of ['canvas', 'classic']) {
  test.describe(`Copy, paste properties and eyedropper on objects styled by a class (${layout} layout)`, () => {
    let errors

    test.beforeEach(async ({ page }) => {
      errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await visitAndApproveStorage(page, layout === 'classic' ? { query: '?layout=classic' } : {})
      await loadDrawing(page, STYLED)
    })

    test.afterEach(() => {
      expect(errors).toEqual([])
    })

    test('copied from an object styled by a class, the properties are those of its rules', async ({ page }) => {
      const before = await sheet(page)
      await clickOn(page, 'pompe')
      await copy(page)
      await clickOn(page, 'libre')
      await paste(page)
      await expect(dialog(page)).toHaveCount(0)
      // The fill of .equipement.en-marche; the pump has no stroke.
      expect(await attributes(page, 'libre', ['fill', 'stroke', 'stroke-width'])).toEqual({ fill: '#5BD08A', stroke: null, 'stroke-width': null })
      expect(await drawn(page, 'libre', 'fill')).toBe('rgb(91, 208, 138)')
      expect(await sheet(page)).toBe(before)
      expect(await steps(page)).toBe(1)
    })

    test('pasted onto an object styled by a class, a property changes its rule, after the warning; one step undoes it', async ({ page }) => {
      const before = await sheet(page)
      await clickOn(page, 'libre')
      await copy(page)
      await clickOn(page, 'pompe')
      await paste(page)
      await expect(dialog(page)).toContainText('This colour comes from the rule .equipement.en-marche, which applies to 1 object. Change the rule?')
      await answer(page, 'Change the rule')
      expect(await sheet(page)).toBe(before.replace('.equipement.en-marche { fill: #5BD08A; }', '.equipement.en-marche { fill: #123456; }'))
      expect(await drawn(page, 'pompe', 'fill')).toBe('rgb(18, 52, 86)')
      // No rule gives the stroke of the pump: it takes the attributes.
      expect(await attributes(page, 'pompe', ['fill', 'stroke', 'stroke-width'])).toEqual({ fill: null, stroke: '#000000', 'stroke-width': '2' })
      expect(await steps(page)).toBe(1)
      await page.keyboard.press('Control+z')
      await nextFrame(page)
      expect(await sheet(page)).toBe(before)
      expect(await attributes(page, 'pompe', ['fill', 'stroke', 'stroke-width'])).toEqual({ fill: null, stroke: null, 'stroke-width': null })
    })

    test('refused, the paste leaves nothing', async ({ page }) => {
      const before = await sheet(page)
      await clickOn(page, 'libre')
      await copy(page)
      await clickOn(page, 'pompe')
      await paste(page)
      await answer(page, 'Cancel')
      expect(await sheet(page)).toBe(before)
      expect(await attributes(page, 'pompe', ['fill', 'stroke', 'stroke-width'])).toEqual({ fill: null, stroke: null, 'stroke-width': null })
      expect(await steps(page)).toBe(0)
      expect(await redoSteps(page)).toBe(0)
      expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((elem) => elem.id))).toEqual(['pompe'])
    })

    test('the eyedropper takes the values of the rules, and gives a value to a rule after the warning', async ({ page }) => {
      // Taken from the pump, styled by a class
      await select(page, ['pompe'])
      await chooseTool(page, 'tool_eyedropper')
      await clickOn(page, 'libre')
      expect(await attributes(page, 'libre', ['fill'])).toEqual({ fill: '#5BD08A' })
      await expect(dialog(page)).toHaveCount(0)

      // Given to the pump
      await page.keyboard.press('Escape')
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      const before = await sheet(page)
      await select(page, ['libre'])
      await clickOn(page, 'pompe')
      await expect(dialog(page)).toContainText('This colour comes from the rule .equipement.en-marche, which applies to 1 object. Change the rule?')
      await answer(page, 'Change the rule')
      expect(await drawn(page, 'pompe', 'fill')).toBe('rgb(18, 52, 86)')
      expect(await attributes(page, 'pompe', ['fill', 'stroke', 'stroke-width'])).toEqual({ fill: null, stroke: '#000000', 'stroke-width': '2' })
      expect(await sheet(page)).toBe(before.replace('.equipement.en-marche { fill: #5BD08A; }', '.equipement.en-marche { fill: #123456; }'))
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      expect(await sheet(page)).toBe(before)
      expect(await attributes(page, 'pompe', ['stroke'])).toEqual({ stroke: null })
    })
  })
}

test.describe('A pipe of SCorp-io takes the look of another (S4)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, read(SCORPIO, 'synoptique-chaufferie.svg'))
  })

  test('pasted from a stopped pipe, a running one is drawn like it; the file differs by its rules alone', async ({ page }) => {
    const stopped = 'tuyau-depart-chaudiere-2'
    const running = 'tuyau-depart-chaudiere-1'
    const opened = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    const counts = await page.evaluate(() => ({
      depart: document.querySelectorAll('#svgcontent .tuyau.en-marche.chaud.depart').length,
      running: document.querySelectorAll('#svgcontent .tuyau.en-marche').length
    }))
    await select(page, [stopped])
    await copy(page)
    await select(page, [running])
    await paste(page)
    // The stopped pipe sets no dashes: the running one takes "none".
    await expect(dialog(page)).toContainText(`These values come from the rules .tuyau.en-marche.chaud.depart (${counts.depart} objects), .tuyau.en-marche (${counts.running} objects). Change these rules?`)
    await answer(page, 'Change the rules')
    for (const name of ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'fill']) {
      expect(await drawn(page, running, name), name).toBe(await drawn(page, stopped, name))
    }
    expect(await steps(page)).toBe(1)
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toBe(opened
      .replace('.tuyau.en-marche { stroke-width: 3; stroke-dasharray: 14 5;', '.tuyau.en-marche { stroke-width: 1.5; stroke-dasharray: none;')
      .replace('.tuyau.en-marche.chaud.depart { stroke: #F08A62; }', '.tuyau.en-marche.chaud.depart { stroke: #4F465F; }'))
  })

  test('with the eyedropper, a running pipe takes the look of a stopped one, dashes included', async ({ page }) => {
    const stopped = 'tuyau-depart-chaudiere-2'
    // A straight pipe, which a click in its middle reaches
    const running = 'tuyau-retour-constant'
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.setZoom(0.5)
      window.svgEditor.updateCanvas()
    })
    await select(page, [stopped])
    await chooseTool(page, 'tool_eyedropper')
    await clickOn(page, running)
    await expect(dialog(page)).toContainText(/These values come from the rules \.tuyau\.en-marche\.chaud\.retour \(\d+ objects\), \.tuyau\.en-marche \(\d+ objects\)\. Change these rules\?/)
    await answer(page, 'Change the rules')
    for (const name of ['stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap']) {
      expect(await drawn(page, running, name), name).toBe(await drawn(page, stopped, name))
    }
    expect(await attributes(page, running, ['stroke', 'stroke-width', 'stroke-dasharray'])).toEqual({ stroke: null, 'stroke-width': null, 'stroke-dasharray': null })
    expect(await steps(page)).toBe(1)
  })
})

test.describe('The eyedropper on a drawing without rules (S4)', () => {
  test('gives the style as before, and one undo puts back the dashes it removed', async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page, `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
      <g class="layer"><title>Layer 1</title>
        <rect id="a" x="20" y="20" width="60" height="40" fill="#c00" stroke="#00f" stroke-width="3"/>
        <rect id="b" x="140" y="20" width="60" height="40" fill="#0c0" stroke="#000" stroke-dasharray="5,5"/>
      </g>
    </svg>`)
    await select(page, ['a'])
    await chooseTool(page, 'tool_eyedropper')
    await clickOn(page, 'b')
    expect(await attributes(page, 'b', ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'fill-opacity', 'opacity']))
      .toEqual({ fill: '#c00', stroke: '#00f', 'stroke-width': '3', 'stroke-dasharray': null, 'fill-opacity': '1', opacity: '1' })
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    expect(await attributes(page, 'b', ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'fill-opacity', 'opacity']))
      .toEqual({ fill: '#0c0', stroke: '#000', 'stroke-width': null, 'stroke-dasharray': '5,5', 'fill-opacity': null, opacity: null })
  })
})
