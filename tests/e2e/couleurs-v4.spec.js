import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// The colour window of the canvas layout (se-color-field, plan v2, 4.7):
// solid colours and gradients, formats, eyedropper, colours of the document,
// libraries, and the field of the inspector.

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <rect id="r1" x="100" y="100" width="200" height="120" fill="#B6B0A7" stroke="#28211A" stroke-width="2"/>
    <circle id="c1" cx="460" cy="300" r="50" fill="#4CC38A"/>
    <rect id="r2" x="100" y="300" width="100" height="60" fill="#160F23"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false, objectSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.svgCanvas.setZoom(1)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

const select = (page, ...ids) => page.evaluate((ids) =>
  window.svgEditor.svgCanvas.selectOnly(ids.map((id) => document.getElementById(id)), true), ids)
const attr = (page, id, name) => page.evaluate(({ id, name }) => document.getElementById(id)?.getAttribute(name) ?? null, { id, name })
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
const swatchOf = (page, type = 'fill') => page.locator(`#${type}_color`).locator('#block')
const fieldOf = (page, type = 'fill') => page.locator(`#${type}_color`).locator('#value-field')
const alphaOf = (page, type = 'fill') => page.locator(`#${type}_color`).locator('#alpha-field')
const picker = (page) => page.locator('#se-paint')

async function openFill (page) {
  await swatchOf(page).click()
  await expect(picker(page)).toBeVisible()
}

/** Drags the pointer across a control of the window, from a fraction to another. */
async function drag (page, selector, from, to) {
  const box = await page.locator(selector).boundingBox()
  const at = ([x, y]) => [box.x + box.width * x, box.y + box.height * y]
  await page.mouse.move(...at(from))
  await page.mouse.down()
  await page.mouse.move(...at([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]), { steps: 3 })
  await page.mouse.move(...at(to), { steps: 3 })
  return async () => page.mouse.up()
}

test.describe('Colour window (V4 couleurs)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
    await select(page, 'r1')
  })

  test('opens from the swatch of the inspector, beside the panel, and closes with Escape', async ({ page }) => {
    await openFill(page)
    const [win, panel] = await Promise.all([picker(page).boundingBox(), page.locator('#se-panel').boundingBox()])
    expect(win.x + win.width).toBeLessThanOrEqual(panel.x)
    await expect(page.locator('#se-paint-title')).toHaveText('Fill')
    await expect(page.locator('#se-paint .se-paint-channels input')).toHaveValue('B6B0A7')
    await expect(page.locator('#se-paint-opacity')).toHaveValue('100')
    await page.keyboard.press('Escape')
    await expect(picker(page)).toBeHidden()
    // The focus goes back to the swatch, which opens it again.
    await page.keyboard.press('Enter')
    await expect(picker(page)).toBeVisible()
  })

  test('previews a drag on the drawing outside the history, then applies it as one step', async ({ page }) => {
    await openFill(page)
    const before = await steps(page)
    const release = await drag(page, '#se-paint-area', [0.2, 0.2], [0.9, 0.1])
    const previewed = await attr(page, 'r1', 'fill')
    expect(previewed).not.toBe('#B6B0A7')
    expect(await steps(page)).toBe(before)
    await release()
    expect(await steps(page)).toBe(before + 1)
    const applied = await attr(page, 'r1', 'fill')
    expect(applied).toMatch(/^#[0-9a-f]{6}$/)
    await undo(page)
    expect(await attr(page, 'r1', 'fill')).toBe('#B6B0A7')
  })

  test('the hue and the opacity move with the arrows, one step per key', async ({ page }) => {
    await openFill(page)
    const hue = page.locator('#se-paint-hue')
    await hue.focus()
    const start = Number(await hue.getAttribute('aria-valuenow'))
    await page.keyboard.press('Shift+ArrowRight')
    await expect(hue).toHaveAttribute('aria-valuenow', String(start + 10))
    const alpha = page.locator('#se-paint-alpha')
    await alpha.focus()
    const before = await steps(page)
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(alpha).toHaveAttribute('aria-valuenow', '90')
    expect(await steps(page)).toBe(before + 1)
    expect(await attr(page, 'r1', 'fill-opacity')).toBe('0.9')
    // The arrows act on the window, not on the selected object.
    expect(await attr(page, 'r1', 'x')).toBe('100')
  })

  test('shows and reads the colour in hexadecimal, RGB and HSL; the opacity goes in the same step', async ({ page }) => {
    await openFill(page)
    await page.selectOption('#se-paint-format', 'rgb')
    const channels = page.locator('#se-paint .se-paint-channels input')
    await expect(channels).toHaveCount(3)
    await expect(channels.nth(0)).toHaveValue('182')
    for (const [i, value] of [[0, '240'], [1, '138'], [2, '98']]) {
      await channels.nth(i).fill(value)
      await channels.nth(i).press('Enter')
    }
    expect(await attr(page, 'r1', 'fill')).toBe('#f08a62')
    await page.selectOption('#se-paint-format', 'hsl')
    await expect(channels.nth(0)).toHaveValue('17')
    await expect(channels.nth(1)).toHaveValue('83')
    await expect(channels.nth(2)).toHaveValue('66')
    const before = await steps(page)
    await page.locator('#se-paint-opacity').fill('50')
    await page.locator('#se-paint-opacity').press('Enter')
    expect(await attr(page, 'r1', 'fill-opacity')).toBe('0.5')
    expect(await steps(page)).toBe(before + 1)
    await undo(page)
    expect(await attr(page, 'r1', 'fill-opacity')).not.toBe('0.5')
    expect(await attr(page, 'r1', 'fill')).toBe('#f08a62')
    // The format is kept for the next time.
    await page.keyboard.press('Escape')
    await openFill(page)
    await expect(page.locator('#se-paint-format')).toHaveValue('hsl')
  })

  test('offers the colours of the document, then the recent ones', async ({ page }) => {
    await openFill(page)
    const swatches = page.locator('#se-paint-swatches [data-color]')
    await expect(swatches).toHaveCount(4)
    await page.locator('#se-paint-swatches [data-color="4cc38a"]').click()
    expect(await attr(page, 'r1', 'fill')).toBe('#4cc38a')
    await page.selectOption('#se-paint-source', 'recent')
    await expect(page.locator('#se-paint-swatches [data-color]').first()).toHaveAttribute('data-color', '4cc38a')
  })

  test('makes a gradient: style, angle, stops added and removed, one step each', async ({ page }) => {
    await openFill(page)
    const before = await steps(page)
    await page.click('#se-paint [data-mode="gradient"]')
    const fill = await attr(page, 'r1', 'fill')
    expect(fill).toMatch(/^url\(#.+\)$/)
    expect(await steps(page)).toBe(before + 1)
    const gradient = () => page.evaluate(() => {
      const id = document.getElementById('r1').getAttribute('fill').match(/#([^)]+)/)[1]
      const grad = document.getElementById(id)
      return {
        tag: grad.localName,
        line: ['x1', 'y1', 'x2', 'y2'].map((a) => grad.getAttribute(a)),
        stops: [...grad.querySelectorAll('stop')].map((s) => [s.getAttribute('offset'), s.getAttribute('stop-color'), s.getAttribute('stop-opacity')])
      }
    })
    expect(await gradient()).toEqual({
      tag: 'linearGradient',
      line: ['0', '0.5', '1', '0.5'],
      stops: [['0', '#b6b0a7', null], ['1', '#b6b0a7', '0']]
    })
    await page.locator('#se-paint-angle').fill('180')
    await page.locator('#se-paint-angle').press('Enter')
    expect((await gradient()).line).toEqual(['0.5', '0', '0.5', '1'])
    // A press on the bar adds a stop there, with the colour of the gradient.
    const bar = await page.locator('#se-paint-bar').boundingBox()
    await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2)
    expect((await gradient()).stops).toHaveLength(3)
    expect((await gradient()).stops[1]).toEqual(['0.5', '#b6b0a7', '0.5'])
    // The colour picked goes to the stop chosen.
    await page.locator('#se-paint .se-paint-channels input').fill('F08A62')
    await page.locator('#se-paint .se-paint-channels input').press('Enter')
    expect((await gradient()).stops[1][1]).toBe('#f08a62')
    // Delete removes the stop chosen.
    await page.locator('#se-paint-bar .se-paint-handle[aria-current="true"]').focus()
    await page.keyboard.press('Delete')
    expect((await gradient()).stops).toHaveLength(2)
    await page.selectOption('#se-paint-style', 'radialGradient')
    expect((await gradient()).tag).toBe('radialGradient')
    // Back to solid, then each step undone in turn.
    await page.click('#se-paint [data-mode="solid"]')
    expect(await attr(page, 'r1', 'fill')).toMatch(/^#[0-9a-f]{6}$/)
    const count = (await steps(page)) - before
    for (let i = 0; i < count; i++) await undo(page)
    expect(await attr(page, 'r1', 'fill')).toBe('#B6B0A7')
    // The gradients the steps made go with them.
    expect(await page.evaluate(() => document.querySelectorAll('#svgcontent linearGradient, #svgcontent radialGradient').length)).toBe(0)
  })

  test('a drag of a stop is previewed, then applied once', async ({ page }) => {
    await openFill(page)
    await page.click('#se-paint [data-mode="gradient"]')
    const before = await steps(page)
    const handle = await page.locator('#se-paint-bar .se-paint-handle').first().boundingBox()
    const bar = await page.locator('#se-paint-bar').boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(bar.x + bar.width * 0.3, bar.y + bar.height / 2, { steps: 4 })
    expect(await steps(page)).toBe(before)
    await page.mouse.up()
    expect(await steps(page)).toBe(before + 1)
    const offsets = await page.evaluate(() => {
      const id = document.getElementById('r1').getAttribute('fill').match(/#([^)]+)/)[1]
      return [...document.getElementById(id).querySelectorAll('stop')].map((s) => Number(s.getAttribute('offset')))
    })
    expect(offsets[0]).toBeGreaterThan(0.2)
    expect(offsets[0]).toBeLessThan(0.4)
    // No preview gradient is left in the document.
    expect(await page.evaluate(() => document.querySelectorAll('[id^="se_paint_preview"]').length)).toBe(0)
  })

  test('libraries: Scorp-io synoptics, search, list', async ({ page }) => {
    await openFill(page)
    await page.click('#se-paint-tab-libraries')
    await expect(page.locator('#se-paint-library')).toHaveValue('0')
    await expect(page.locator('#se-paint-library option').first()).toHaveText('Scorp-io synoptics')
    await page.fill('#se-paint-search', 'hot')
    const found = page.locator('#se-paint-groups [data-color]')
    await expect(found).toHaveCount(2)
    await expect(found.first()).toHaveAttribute('aria-label', 'Hot, supply · #F08A62')
    await found.first().click()
    expect(await attr(page, 'r1', 'fill')).toBe('#f08a62')
    await page.fill('#se-paint-search', '')
    await page.click('#se-paint-view')
    await expect(page.locator('#se-paint-groups .se-swatch-row').first()).toContainText('Background')
    await page.selectOption('#se-paint-library', '1')
    await page.fill('#se-paint-search', 'nuit 70')
    await expect(found).toHaveCount(1)
    await expect(found.first()).toHaveAttribute('data-color', '#160F23')
  })

  test('the field of the inspector: the colour and its opacity typed in', async ({ page }) => {
    await fieldOf(page).click()
    await expect(picker(page)).toBeHidden()
    await fieldOf(page).fill('F08A62')
    await fieldOf(page).press('Enter')
    expect(await attr(page, 'r1', 'fill')).toBe('#f08a62')
    await alphaOf(page).fill('40')
    await alphaOf(page).press('Enter')
    expect(await attr(page, 'r1', 'fill-opacity')).toBe('0.4')
    // A typo gives the colour back; a name is a colour.
    await fieldOf(page).fill('zz')
    await fieldOf(page).press('Enter')
    await expect(fieldOf(page)).toHaveValue('F08A62')
    await fieldOf(page).fill('red')
    await fieldOf(page).press('Enter')
    expect(await attr(page, 'r1', 'fill')).toBe('#ff0000')
    expect(await attr(page, 'r1', 'fill-opacity')).toBe('0.4')
  })

  test('a colour written by its name or in rgb() shows in hexadecimal', async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById('r2').setAttribute('fill', 'rebeccapurple')
      document.getElementById('c1').setAttribute('fill', 'rgb(240, 138, 98)')
    })
    await select(page, 'r2')
    await expect(fieldOf(page)).toHaveValue('663399')
    await select(page, 'c1')
    await expect(fieldOf(page)).toHaveValue('F08A62')
  })

  test('− removes the fill, + gives one back', async ({ page }) => {
    const toggle = page.locator('.se-paint-toggle[data-paint="fill"]')
    await expect(toggle).toHaveAttribute('aria-label', 'Remove the fill')
    await toggle.click()
    expect(await attr(page, 'r1', 'fill')).toBe('none')
    await expect(toggle).toHaveAttribute('aria-label', 'Add a fill')
    await toggle.click()
    expect(await attr(page, 'r1', 'fill')).toBe('#ff0000')
    await undo(page)
    expect(await attr(page, 'r1', 'fill')).toBe('none')
  })

  test('a multi-selection shows Mixed and takes the colour chosen in one step', async ({ page }) => {
    await select(page, 'r1', 'c1')
    await expect(fieldOf(page)).toHaveAttribute('placeholder', 'Mixed')
    await openFill(page)
    const before = await steps(page)
    await page.locator('#se-paint-swatches [data-color="160f23"]').click()
    expect(await attr(page, 'r1', 'fill')).toBe('#160f23')
    expect(await attr(page, 'c1', 'fill')).toBe('#160f23')
    expect(await steps(page)).toBe(before + 1)
  })

  test('opens from the contextual bar, without covering it', async ({ page }) => {
    const twin = page.locator('#se-context-bar [data-entry="paint:fill"]')
    await expect(twin).toBeVisible()
    await twin.click()
    await expect(picker(page)).toBeVisible()
    const [win, bar] = await Promise.all([picker(page).boundingBox(), page.locator('#se-context-bar').boundingBox()])
    const overlaps = win.x < bar.x + bar.width && bar.x < win.x + win.width && win.y < bar.y + bar.height && bar.y < win.y + win.height
    expect(overlaps).toBe(false)
    await page.locator('#se-paint-swatches [data-color="4cc38a"]').click()
    expect(await attr(page, 'r1', 'fill')).toBe('#4cc38a')
    await expect(fieldOf(page)).toHaveValue('4CC38A')
  })

  test('the eyedropper takes the colour of an object of the drawing, without selecting it', async ({ page }) => {
    await page.evaluate(() => { delete window.EyeDropper })
    await openFill(page)
    await page.click('#se-paint-eyedropper')
    await expect(page.locator('#se-paint-hint')).toBeVisible()
    const circle = await page.locator('#c1').boundingBox()
    await page.mouse.click(circle.x + circle.width / 2, circle.y + circle.height / 2)
    expect(await attr(page, 'r1', 'fill')).toBe('#4cc38a')
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))).toEqual(['r1'])
    await expect(picker(page)).toBeVisible()
    await expect(page.locator('#se-paint-hint')).toBeHidden()
  })
})

test.describe('Colour window, WCAG AA (V4 couleurs)', () => {
  for (const scheme of ['dark', 'light']) {
    for (const tab of ['custom', 'libraries']) {
      test(`the ${tab} tab in the ${scheme} theme, gradient included`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await visitAndApproveStorage(page)
        await loadDrawing(page)
        await select(page, 'r1')
        await openFill(page)
        if (tab === 'custom') await page.click('#se-paint [data-mode="gradient"]')
        else await page.click('#se-paint-tab-libraries')
        const { violations } = await new AxeBuilder({ page }).include('#se-paint').withTags(['wcag2a', 'wcag2aa']).analyze()
        const serious = violations
          .filter((v) => ['serious', 'critical'].includes(v.impact))
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' > ')).join(', ')}`)
        expect(serious).toEqual([])
      })
    }
  }
})

test.describe('Classic layout (V4 couleurs)', () => {
  test('keeps the jGraduate dialog, without the new window', async ({ page }) => {
    await visitAndApproveStorage(page, { query: '?layout=classic' })
    await loadDrawing(page)
    await select(page, 'r1')
    await expect(page.locator('#se-paint')).toHaveCount(0)
    await page.locator('#fill_color').locator('#picker').click()
    await expect(page.locator('#fill_color').locator('#color_picker')).toBeVisible()
    await expect(page.locator('#fill_color').locator('.jGraduate_tabs')).toBeVisible()
  })
})
