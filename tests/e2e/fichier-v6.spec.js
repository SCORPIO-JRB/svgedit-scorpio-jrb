import { test, expect } from './fixtures.js'
import { AxeBuilder } from '@axe-core/playwright'
import fs from 'node:fs'
import path from 'node:path'
import { visitAndApproveStorage, screenPoint } from './helpers.js'

// Lot V6 « Fichier » (plan v2): the corrections of section 7, the CSS
// animations kept still while editing, the preview (4.6), the identity and
// the binding of an object (G3).

const NS = 'http://www.w3.org/2000/svg'
const CORRECTIONS = ['rawValues', 'styleProperties', 'attributes', 'gradientUnits', 'layerOrder', 'emptyValues', 'nestedSvg', 'stableSave']

const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <g id="ligne" data-tag="L-01" scorp_id="7"><rect id="a" x="40" y="40" width="80" height="60" fill="#c00"/></g>
    <use id="u" href="#ligne" x="200"/>
    <circle id="voyant" class="alarme" cx="300" cy="300" r="30" fill="#08f" style="animation: blink 1s infinite; transform-origin: 300px 300px"/>
    <rect id="free" x="450" y="300" width="40" height="40" fill="#3a6"/>
    <style>@keyframes blink { from { opacity: 1 } to { opacity: 0.1 } } #ligne { stroke: blue }</style>
  </g>
</svg>`

async function loadDrawing (page, svg = DRAWING) {
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
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const saved = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
const dialog = (page) => page.locator('se-elix-alert-dialog')

/** The SVG files of the repository that the corpus tests read. */
const corpus = () => {
  const files = []
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name)
      if (fs.statSync(file).isDirectory()) walk(file)
      else if (name.endsWith('.svg')) files.push(file)
    }
  }
  walk(path.join(process.cwd(), 'tests/fixtures'))
  walk(path.join(process.cwd(), 'archive/examples'))
  return files.map((file) => [path.relative(process.cwd(), file), fs.readFileSync(file, 'utf8')])
}

test.describe('File (V6)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('a file SVG-Edit saved before V6 is saved again byte for byte', async ({ page }) => {
    const files = corpus()
    expect(files.length).toBeGreaterThan(15)
    const results = await page.evaluate(({ files, corrections }) => {
      const c = window.svgEditor.svgCanvas
      const off = Object.fromEntries(corrections.map((name) => [name, false]))
      return files.map(([name, svg]) => {
        // What the editor wrote before the corrections...
        c.setConfig({ fidelity: off })
        if (c.setSvgString(svg) === false) return [name, 'refused']
        const before = c.getSvgString()
        // ...opened and saved with them gives the same text. Two differences
        // are not of the file: a blank line (an empty <defs> left one, at
        // the first save only), and the pointer-events the editor let into a
        // style with other properties, its own state, which it no longer saves.
        c.setConfig({ fidelity: {} })
        c.setSvgString(before)
        const after = c.getSvgString()
        const plain = (text) => text.replace(/\n\s*\n/g, '\n').replace(/;pointer-events:inherit(?=")/g, '')
        return [name, plain(after) === plain(before) ? 'same' : 'changed']
      })
    }, { files, corrections: CORRECTIONS })
    const changed = results.filter(([, status]) => status === 'changed')
    expect(changed).toEqual([])
  })

  test('the drawing keeps the CSS animations still, the file keeps them', async ({ page }) => {
    const voyant = page.locator('#voyant')
    expect(await voyant.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
    expect(await saved(page)).toContain('style="animation: blink 1s infinite; transform-origin: 300px 300px"')
  })

  test('a click on an object keeps its style', async ({ page }) => {
    const at = await screenPoint(page, 300, 300)
    await page.mouse.click(at.x, at.y)
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements()[0]?.id)).toBe('voyant')
    expect(await page.locator('#voyant').getAttribute('style')).toContain('animation: blink 1s infinite')
    expect(await saved(page)).toContain('style="animation: blink 1s infinite; transform-origin: 300px 300px"')
  })

  test.describe('Preview (4.6)', () => {
    test('shows the saved file, alone, and goes back with Escape', async ({ page }) => {
      await select(page, 'free')
      const before = await saved(page)
      const requests = []
      page.on('request', (request) => {
        if (!/^(blob|data):/.test(request.url())) requests.push(request.url())
      })
      await page.locator('#se-preview-button').click()
      const preview = page.locator('#se-preview')
      await expect(preview).toBeVisible()
      await expect(page.locator('#se-preview-close')).toBeFocused()
      // Nothing of the editor shows above it
      const covered = await page.evaluate(() => {
        const box = document.getElementById('se-preview').getBoundingClientRect()
        return document.elementFromPoint(box.width / 2, box.height / 2)?.closest('#se-preview') !== null &&
          box.width === window.innerWidth && box.height === window.innerHeight
      })
      expect(covered).toBe(true)
      // The image is the text of the save, byte for byte
      const shown = await page.evaluate(async () => {
        const image = document.getElementById('se-preview-image')
        await image.decode()
        return (await fetch(image.src)).text()
      })
      expect(shown).toBe(before)
      // No key reaches the editor: Delete deletes nothing
      await page.keyboard.press('Delete')
      await page.keyboard.press('Escape')
      await expect(preview).toHaveCount(0)
      expect(await page.locator('#free').count()).toBe(1)
      expect(await saved(page)).toBe(before)
      expect(await steps(page)).toBe(0)
      expect(requests).toEqual([])
    })

    test('loads nothing from the network, and plays the animations', async ({ page }) => {
      await loadDrawing(page, `<svg xmlns="${NS}" width="200" height="200"><g class="layer"><title>L</title>
        <image href="https://example.invalid/pompe.png" width="20" height="20"/>
        <rect id="r" width="50" height="50" fill="#c00"><animate attributeName="opacity" from="1" to="0" dur="1s" repeatCount="indefinite"/></rect>
      </g></svg>`)
      const requests = []
      page.on('request', (request) => {
        if (!/^(blob|data):/.test(request.url())) requests.push(request.url())
      })
      await page.locator('#se-preview-button').click()
      const shown = await page.evaluate(async () => {
        const image = document.getElementById('se-preview-image')
        await image.decode().catch(() => {})
        return (await fetch(image.src)).text()
      })
      // The editor pauses the animation; the file it shows does not
      expect(shown).toContain('<animate')
      expect(shown).not.toContain('requiredExtensions')
      await page.waitForTimeout(300)
      expect(requests).toEqual([])
      await page.locator('#se-preview-close').click()
      await expect(page.locator('#se-preview')).toHaveCount(0)
    })

    test('opens in under 500 ms at 2 000 objects', async ({ page }) => {
      await page.evaluate(() => {
        const shapes = []
        for (let i = 0; i < 2000; i++) {
          shapes.push(`<rect id="r${i}" x="${(i % 50) * 12}" y="${Math.floor(i / 50) * 12}" width="10" height="10" fill="#36a"/>`)
        }
        window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><g class="layer"><title>L</title>${shapes.join('')}</g></svg>`)
      })
      const ms = await page.evaluate(async () => {
        const start = performance.now()
        await window.svgEditor.preview.open()
        const ms = performance.now() - start
        window.svgEditor.preview.close()
        return ms
      })
      expect(ms).toBeLessThan(500)
    })

    test('passes axe (AA) in both themes', async ({ page }) => {
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => window.svgEditor.setConfig({ theme }), theme)
        await page.locator('#se-preview-button').click()
        await expect(page.locator('#se-preview')).toBeVisible()
        const results = await new AxeBuilder({ page }).include('#se-preview').withTags(['wcag2a', 'wcag2aa']).analyze()
        expect(results.violations.map((v) => `${theme}: ${v.id}`)).toEqual([])
        await page.keyboard.press('Escape')
      }
    })
  })

  test.describe('Identity and binding (G3)', () => {
    test('shows the binding and the data of the object', async ({ page }) => {
      await select(page, 'ligne')
      await expect(page.locator('#se-section-identity')).toHaveText('Identity and binding')
      await expect(page.locator('#se-binding-value')).toHaveText('scorp_id 7 · named by 2 elements')
      await expect(page.locator('#se-binding [data-name]')).toHaveCount(1)
      await expect(page.locator('#se-binding [data-name="data-tag"]')).toHaveValue('L-01')

      await select(page, 'free')
      await expect(page.locator('#se-binding-value')).toHaveText('No known binding')
      await expect(page.locator('#se-binding [data-name]')).toHaveCount(0)

      await page.evaluate(() => window.svgEditor.svgCanvas.clearSelection())
      await expect(page.locator('#se-binding')).toBeHidden()
    })

    test('adds, changes and removes data, one undo step each', async ({ page }) => {
      await select(page, 'free')
      await page.locator('#se-binding-add').click()
      await expect(page.locator('#se-binding-new-name')).toBeFocused()
      await page.keyboard.type('tag')
      await page.locator('#se-binding-new-value').fill('P-101')
      await page.locator('#se-binding-new-value').press('Enter')
      await expect(page.locator('#free')).toHaveAttribute('data-tag', 'P-101')
      const value = page.locator('#se-binding [data-name="data-tag"]')
      await value.fill('P-102')
      await value.press('Enter')
      await expect(page.locator('#free')).toHaveAttribute('data-tag', 'P-102')
      await page.locator('#se-binding [data-remove="data-tag"]').click()
      await expect(page.locator('#free')).not.toHaveAttribute('data-tag', /.*/)
      expect(await steps(page)).toBe(3)
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      await expect(page.locator('#free')).toHaveAttribute('data-tag', 'P-102')

      // A name that is not one of data is refused (the undo of the canvas
      // leaves the selection empty)
      await select(page, 'free')
      await page.locator('#se-binding-add').click()
      await page.locator('#se-binding-new-name').fill('onclick')
      await page.locator('#se-binding-new-value').fill('x')
      await page.locator('#se-binding-new-value').press('Enter')
      expect(await page.locator('#free').getAttribute('onclick')).toBeNull()
      expect(await steps(page)).toBe(2)
    })

    test('renaming a bound identifier asks, and its references follow', async ({ page }) => {
      await select(page, 'ligne')
      const field = page.locator('#elem_id')
      await field.locator('input').fill('ligne-2')
      await field.locator('input').press('Enter')
      await expect(dialog(page)).toHaveCount(1)
      await expect(dialog(page)).toContainText('"ligne" is bound')
      // Cancelled: nothing changes, the field shows the identifier again
      await page.keyboard.press('Escape')
      await expect(dialog(page)).toHaveCount(0)
      expect(await page.locator('#ligne').count()).toBe(1)
      expect(await steps(page)).toBe(0)

      await field.locator('input').fill('ligne-2')
      await field.locator('input').press('Enter')
      await dialog(page).locator('[part~="choice-button"]').first().click()
      await expect(page.locator('#ligne-2')).toHaveCount(1)
      await expect(page.locator('#u')).toHaveAttribute('href', '#ligne-2')
      expect(await page.evaluate(() => document.querySelector('#svgcontent style').textContent)).toContain('#ligne-2 {')
      expect(await steps(page)).toBe(1)
      await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
      await expect(page.locator('#u')).toHaveAttribute('href', '#ligne')
    })

    test('a taken identifier is refused', async ({ page }) => {
      await select(page, 'free')
      const input = page.locator('#elem_id input')
      await input.fill('voyant')
      await input.press('Enter')
      await expect(page.locator('#free')).toHaveCount(1)
      await expect(input).toHaveValue('free')
      expect(await page.locator('[id="voyant"]').count()).toBe(1)
      // An identifier nothing binds is renamed without a question
      await input.fill('reservoir')
      await input.press('Enter')
      await expect(page.locator('#reservoir')).toHaveCount(1)
      await expect(dialog(page)).toHaveCount(0)
    })

    test('the buttons of a question are legible', async ({ page }) => {
      await page.evaluate(() => { window.seConfirm('?', ['Go', 'Cancel']) })
      await expect(dialog(page)).toHaveCount(1)
      const inner = await dialog(page).locator('[part~="choice-button"]').first().evaluate((button) => {
        const native = button.shadowRoot.querySelector('[part~="inner"]')
        return getComputedStyle(native).backgroundColor
      })
      expect(inner).toBe('rgba(0, 0, 0, 0)')
      await page.keyboard.press('Escape')
    })

    test('the section passes axe (AA) in both themes', async ({ page }) => {
      await select(page, 'ligne')
      for (const theme of ['dark', 'light']) {
        await page.evaluate((theme) => window.svgEditor.setConfig({ theme }), theme)
        await expect(page.locator('#se-binding')).toBeVisible()
        const results = await new AxeBuilder({ page }).include('[data-section="identity"]').withTags(['wcag2a', 'wcag2aa']).analyze()
        expect(results.violations.map((v) => `${theme}: ${v.id}`)).toEqual([])
      }
    })
  })
})
