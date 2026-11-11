import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot Texte, after the panel of Figma: Typography after Appearance (font,
// style and size, line height and letter spacing, alignments, settings);
// the Resizing of a text and its W and H; the window "Stroke settings", its
// Basic tab without the width profile.

const NS = 'http://www.w3.org/2000/svg'
const SE = 'http://svg-edit.googlecode.com'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <text id="t1" x="100" y="100" font-size="20" font-family="sans-serif">Vanne trois voies circuit</text>
    <text id="t2" x="100" y="300" font-size="20" font-family="sans-serif" font-weight="bold">Départ</text>
    <path id="p1" d="M400,100 L520,300 L280,300 Z" fill="#cccccc" stroke="#000000" stroke-width="8"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
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
const seAttr = (page, id, name) => page.evaluate(({ id, name, SE }) => document.getElementById(id).getAttributeNS(SE, name), { id, name, SE })
const steps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())
const undo = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
const lineYs = (page, id) => page.evaluate((id) => [...document.getElementById(id).querySelectorAll('tspan')].map((tspan) => Number(tspan.getAttribute('y'))), id)
const box = (page, id) => page.evaluate((id) => {
  const b = window.svgEditor.svgCanvas.getSelectionBox([document.getElementById(id)])
  return { y: Math.round(b.y * 10) / 10, height: Math.round(b.height * 10) / 10, width: Math.round(b.width * 10) / 10 }
}, id)
const checked = (page, selector) => page.evaluate((selector) =>
  [...document.querySelectorAll(`${selector} [aria-checked="true"]`)].map((el) => el.dataset.value), selector)

/** Types a value in a field of the panel (se-spin-input), then Enter. */
async function typeField (page, id, value) {
  await page.locator(`#${id}`).evaluate((el) => (el.$input?.shadowRoot?.getElementById('input') ?? el).focus())
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(String(value))
  await page.keyboard.press('Enter')
}

test.describe('The panel of a text and the settings of the stroke, as in Figma (lot Texte)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
  })

  test('Typography comes after Appearance: font, style and size, spacings, alignments', async ({ page }) => {
    await select(page, 't1')
    const sections = await page.evaluate(() => [...document.querySelectorAll('#tools_top > .se-section')]
      .filter((section) => !section.hidden).map((section) => section.dataset.section))
    expect(sections.indexOf('text')).toBe(sections.indexOf('appearance') + 1)
    expect(sections.indexOf('text')).toBeLessThan(sections.indexOf('fill'))
    await expect(page.locator('#se-section-text')).toHaveText('Typography')
    for (const id of ['tool_font_family', 'tool_font_style', 'font_size', 'tool_line_height', 'tool_letter_spacing']) {
      await expect(page.locator(`#${id}`)).toBeVisible()
    }
    // The font read from the file, whatever its case.
    await expect(page.locator('#tool_font_family')).toHaveJSProperty('value', 'Sans-serif')
    await expect(page.locator('#tool_font_style')).toHaveValue('400')
    expect(await checked(page, '.se-choices[data-for="tool_text_anchor"]')).toEqual(['start'])
    // Bold and italic leave the panel for the Style list; the contextual bar
    // and the shortcuts keep them.
    await expect(page.locator('#tool_bold')).toBeHidden()
    await expect(page.locator('#se-context-bar [data-entry="verb:tool_bold"]')).toBeVisible()
  })

  test('the Style list writes the weight and the italic in one step; several texts show "Mixed"', async ({ page }) => {
    await select(page, 't1')
    const before = await steps(page)
    await page.locator('#tool_font_style').selectOption('600 italic')
    expect([await attr(page, 't1', 'font-weight'), await attr(page, 't1', 'font-style')]).toEqual(['600', 'italic'])
    expect(await steps(page)).toBe(before + 1)
    await page.locator('#tool_font_style').selectOption('700')
    expect([await attr(page, 't1', 'font-weight'), await attr(page, 't1', 'font-style')]).toEqual(['bold', 'normal'])
    await select(page, 't1', 't2')
    await expect(page.locator('#tool_font_style')).toHaveValue('700')
    await page.locator('#tool_font_style').selectOption('400')
    await select(page, 't1', 't2')
    await expect(page.locator('#tool_font_style')).toHaveValue('400')
    await page.evaluate(() => document.getElementById('t2').setAttribute('font-weight', '300'))
    await select(page, 't1', 't2')
    await expect(page.locator('#tool_font_style')).toHaveValue('')
  })

  test('the size has its menu of sizes; the alignment buttons place the lines', async ({ page }) => {
    await select(page, 't1')
    await page.locator('.se-font-sizes-button').click()
    await page.locator('#se-font-sizes [data-size="32"]').click()
    expect(await attr(page, 't1', 'font-size')).toBe('32')
    await page.locator('.se-choices[data-for="tool_text_anchor"] [data-value="middle"]').click()
    expect(await attr(page, 't1', 'text-anchor')).toBe('middle')
    expect(await checked(page, '.se-choices[data-for="tool_text_anchor"]')).toEqual(['middle'])
  })

  test('Resizing: auto width, auto height and W, fixed size and H; the box keeps its place', async ({ page }) => {
    await select(page, 't1')
    const resizing = '#se-text-resizing'
    await expect(page.locator(resizing)).toBeVisible()
    expect(await checked(page, resizing)).toEqual(['auto-width'])
    // The vertical alignment applies to a box of fixed size only.
    await expect(page.locator('#tool_text_valign [data-value="middle"]')).toBeDisabled()

    await page.locator(`${resizing} [data-value="auto-height"]`).click()
    expect(Number(await seAttr(page, 't1', 'width'))).toBeGreaterThan(100)
    expect(await checked(page, resizing)).toEqual(['auto-height'])
    // W: a width, the lines break in it; the font keeps its size.
    await typeField(page, 'selected_w', '120')
    expect(await seAttr(page, 't1', 'width')).toBe('120')
    expect((await lineYs(page, 't1')).length).toBe(2)
    expect(await attr(page, 't1', 'font-size')).toBe('20')

    // H: a fixed size.
    const top = (await box(page, 't1')).y
    await typeField(page, 'selected_h', '150')
    expect(await seAttr(page, 't1', 'height')).toBe('150')
    expect(await checked(page, resizing)).toEqual(['fixed'])
    expect(await box(page, 't1')).toEqual({ y: top, height: 150, width: 120 })

    // The lines in the middle, then at the bottom: the box stays.
    const atTop = await lineYs(page, 't1')
    await page.locator('#tool_text_valign [data-value="middle"]').click()
    expect(await seAttr(page, 't1', 'valign')).toBe('middle')
    const inMiddle = await lineYs(page, 't1')
    expect(inMiddle[0]).toBeGreaterThan(atTop[0])
    await page.locator('#tool_text_valign [data-value="bottom"]').click()
    expect((await lineYs(page, 't1'))[0]).toBeGreaterThan(inMiddle[0])
    expect(await box(page, 't1')).toEqual({ y: top, height: 150, width: 120 })
    expect(await checked(page, '#tool_text_valign')).toEqual(['bottom'])

    // Lines typed: the box stays, the lines move up from its bottom.
    await page.evaluate(() => window.svgEditor.svgCanvas.changeSelectedAttribute('#text', 'Un\nDeux\nTrois\nQuatre'))
    expect(await box(page, 't1')).toEqual({ y: top, height: 150, width: 120 })

    // Saved and opened again: the same.
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toMatch(/se:height="150"/)
    expect(saved).toMatch(/se:valign="bottom"/)

    // Auto width takes the box away, in one step that undo gives back.
    await page.locator(`${resizing} [data-value="auto-width"]`).click()
    expect([await seAttr(page, 't1', 'width'), await seAttr(page, 't1', 'height'), await seAttr(page, 't1', 'valign')]).toEqual([null, null, null])
    await undo(page)
    expect([await seAttr(page, 't1', 'width'), await seAttr(page, 't1', 'height'), await seAttr(page, 't1', 'valign')]).toEqual(['120', '150', 'bottom'])
  })

  test('the settings of the text: the decorations', async ({ page }) => {
    await select(page, 't1')
    const toggle = page.locator('.se-more-toggle[data-more="text"]')
    await expect(page.locator('#tool_text_decoration_underline')).toBeHidden()
    await toggle.click()
    await expect(page.locator('#se-settings-text')).toBeVisible()
    await expect(page.locator('#se-settings-text-title')).toHaveText('Type settings')
    await page.locator('#tool_text_decoration_underline').click()
    expect(await attr(page, 't1', 'text-decoration')).toBe('underline')
    // Escape closes the window first; the text stays selected.
    await page.keyboard.press('Escape')
    await expect(page.locator('#se-settings-text')).toBeHidden()
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))).toEqual(['t1'])
    expect(await toggle.evaluate((el) => el.classList.contains('se-more-set'))).toBe(true)
  })

  test('Stroke settings: a window at the left of the panel; join, miter angle, caps, one step each', async ({ page }) => {
    await select(page, 'p1')
    // The captions of Figma above the position and the weight.
    await expect(page.locator('.se-stroke-row .se-caption')).toHaveText(['Position', 'Weight'])
    const toggle = page.locator('.se-more-toggle[data-more="stroke"]')
    await toggle.click()
    const settings = page.locator('#se-settings-stroke')
    await expect(settings).toBeVisible()
    await expect(page.locator('#se-settings-stroke-title')).toHaveText('Stroke settings')
    const [win, panel] = await page.evaluate(() => [document.getElementById('se-settings-stroke'), document.getElementById('se-tabpanel-properties')]
      .map((el) => el.getBoundingClientRect().toJSON()))
    expect(win.right).toBeLessThanOrEqual(panel.left)
    // The rows of the Basic tab, without the width profile.
    expect(await settings.locator('.se-settings-row:visible .se-settings-label').allTextContents())
      .toEqual(['Style', 'Join', 'Miter angle', 'Caps', 'Arrows'])
    await expect(page.locator('#stroke_miter_angle')).toHaveJSProperty('value', '28.96')

    const before = await steps(page)
    await settings.locator('.se-choices[data-for="stroke_linejoin"] [data-value="round"]').click()
    expect(await attr(page, 'p1', 'stroke-linejoin')).toBe('round')
    // The miter angle shows for a miter join only.
    await expect(page.locator('#stroke_miter_angle')).toBeHidden()
    await settings.locator('.se-choices[data-for="stroke_linejoin"] [data-value="miter"]').click()
    await typeField(page, 'stroke_miter_angle', '60')
    expect(await attr(page, 'p1', 'stroke-miterlimit')).toBe('2')
    await settings.locator('.se-choices[data-for="stroke_linecap"] [data-value="round"]').click()
    expect(await attr(page, 'p1', 'stroke-linecap')).toBe('round')
    expect(await steps(page)).toBe(before + 4)
    await page.locator('#stroke_style').evaluate((el) => {
      el.value = '5,5'
      el.dispatchEvent(new CustomEvent('change', { detail: { value: '5,5' } }))
    })
    expect(await attr(page, 'p1', 'stroke-dasharray')).toBe('5,5')

    // The close button, and the icon marks values that are not the usual ones.
    await settings.locator('.se-settings-close').click()
    await expect(settings).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(await toggle.evaluate((el) => el.classList.contains('se-more-set'))).toBe(true)
  })
})
