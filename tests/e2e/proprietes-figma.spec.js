import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// Lot Propriétés: the Properties tab after the panel of Figma. Position
// (alignment, X and Y, rotation with a turn of 90° and the flips),
// Dimensions (W and H, the lock at their right), Appearance (eye and blend
// mode on the title line, opacity and corner radius), Fill and Stroke
// (libraries and + on the title line, eye and − after the paint; the
// position, the weight and the settings of the stroke).

const NS = 'http://www.w3.org/2000/svg'
const DRAWING = `<svg xmlns="${NS}" width="640" height="480">
  <g class="layer"><title>Layer 1</title>
    <path id="t1" d="M200,100 L320,300 L80,300 Z" fill="#DCDCDF" stroke="#000000"/>
    <line id="l1" x1="400" y1="400" x2="500" y2="450" stroke="#000000"/>
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
const value = (page, id) => page.locator(`#${id}`).evaluate((el) => String(el.value))

async function typeField (page, id, text) {
  const input = page.locator(`#${id}`).locator('#input')
  await input.click()
  await input.press('Control+a')
  await input.pressSequentially(String(text))
  await input.press('Enter')
}

/** The controls shown in a section, by id or by class. */
const shown = (page, section) => page.evaluate((section) => {
  const root = document.querySelector(`[data-section="${section}"]`)
  return [...root.querySelectorAll('[id], .se-section-tool, [data-command]')]
    .filter((el) => el.getClientRects().length > 0 && !el.classList.contains('se-section-title'))
    .map((el) => el.id || el.dataset.command || [...el.classList].find((name) => /^se-(paint-(styles|add|eye|remove)|more-toggle|blend)$/.test(name)))
}, section)

test.describe('Properties after Figma (lot Propriétés)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await loadDrawing(page)
    await select(page, 't1')
  })

  test('a path shows Position, Dimensions, Appearance, Fill and Stroke as in Figma', async ({ page }) => {
    const sections = await page.evaluate(() => [...document.querySelectorAll('#tools_top > .se-section')]
      .filter((section) => !section.hidden).map((section) => section.dataset.section))
    expect(sections).toEqual(['geometry', 'size', 'appearance', 'fill', 'stroke', 'identity'])
    await expect(page.locator('#se-section-geometry')).toHaveText('Position')
    await expect(page.locator('#se-section-size')).toHaveText('Dimensions')
    expect(await shown(page, 'geometry')).toEqual(['align_left', 'align_center', 'align_right', 'align_top', 'align_middle',
      'align_bottom', 'selected_x', 'selected_y', 'angle', 'tool_rotate_90', 'tool_flip_h', 'tool_flip_v'])
    expect(await shown(page, 'size')).toEqual(['selected_w', 'selected_h', 'tool_ratio_lock'])
    expect(await shown(page, 'appearance')).toEqual(['hide_selection', 'se-blend', 'se-blend-mode', 'opacity', 'rect_rx'])
    expect(await shown(page, 'fill')).toEqual(['se-paint-styles', 'fill_color', 'se-paint-eye', 'se-paint-remove'])
    expect(await shown(page, 'stroke')).toEqual(['se-paint-styles', 'stroke_color', 'se-paint-eye', 'se-paint-remove',
      'stroke_align', 'stroke_width', 'se-more-toggle'])
    // A line has no corner.
    await select(page, 'l1')
    await expect(page.locator('#rect_rx')).toBeHidden()
    await expect(page.locator('#stroke_align')).toBeDisabled()
  })

  test('↻ turns by 90° at each click, one step each; the flips sit beside it', async ({ page }) => {
    const before = await steps(page)
    await page.locator('#tool_rotate_90').click()
    expect(await value(page, 'angle')).toBe('90')
    await page.locator('#tool_rotate_90').click()
    expect(await value(page, 'angle')).toBe('180')
    expect(await steps(page)).toBe(before + 2)
    await page.locator('#tool_flip_h').click()
    expect(await steps(page)).toBe(before + 3)
  })

  test('the row of alignment aligns one object on the page', async ({ page }) => {
    await page.locator('.se-align-row [data-command="align_left"]').click()
    expect(await page.evaluate(() => Math.round(document.getElementById('t1').getBBox().x))).toBe(0)
  })

  test('the corner radius rounds every corner of the path, in one step', async ({ page }) => {
    const before = await steps(page)
    await typeField(page, 'rect_rx', 10)
    expect(await attr(page, 't1', 'd')).toMatch(/A10,10/)
    expect(await steps(page)).toBe(before + 1)
    expect(await value(page, 'rect_rx')).toBe('10')
    await undo(page)
    expect(await attr(page, 't1', 'd')).not.toMatch(/A/)
  })

  test('the drop gives a blend mode; the eye of Appearance hides the object', async ({ page }) => {
    await page.locator('#se-blend-mode').selectOption('multiply')
    expect(await attr(page, 't1', 'style')).toContain('mix-blend-mode:multiply')
    await expect(page.locator('.se-blend')).toHaveClass(/se-set/)
    await page.locator('[data-section="appearance"] [data-command="hide_selection"]').click()
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('t1')).display)).toBe('none')
  })

  test('the eye hides the fill and keeps it; the field shows it dimmed', async ({ page }) => {
    const eye = page.locator('.se-paint-eye[data-paint="fill"]')
    await expect(eye).toHaveAttribute('aria-label', 'Hide the fill')
    await eye.click()
    expect(await attr(page, 't1', 'fill')).toBe('none')
    expect(await attr(page, 't1', 'data-se-fill-hidden')).toBe('#DCDCDF')
    await expect(eye).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#fill_color').locator('#value-field')).toHaveValue('DCDCDF')
    await expect(page.locator('[data-section="fill"] .se-paint-row')).toHaveClass(/se-paint-hidden/)
    await eye.click()
    expect(await attr(page, 't1', 'fill')).toBe('#DCDCDF')
    await undo(page)
    expect(await attr(page, 't1', 'fill')).toBe('none')
  })

  test('the stroke goes inside or outside, its weight kept; the settings hold dashes, joins, caps and arrows', async ({ page }) => {
    await page.locator('#stroke_align').selectOption('inside')
    expect(await attr(page, 't1', 'stroke-width')).toBe('2')
    expect(await attr(page, 't1', 'clip-path')).toBe('url(#se_stroke_t1)')
    expect(await value(page, 'stroke_width')).toBe('1')
    await typeField(page, 'stroke_width', 3)
    expect(await attr(page, 't1', 'stroke-width')).toBe('6')
    await page.locator('#stroke_align').selectOption('outside')
    expect(await attr(page, 't1', 'stroke-width')).toBe('6')
    expect(await attr(page, 't1', 'paint-order')).toBe('stroke')
    expect(await attr(page, 't1', 'clip-path')).toBe(null)
    // Saved as drawn: the clip or the mask is in the file.
    await page.locator('#stroke_align').selectOption('inside')
    const saved = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
    expect(saved).toContain('<clipPath id="se_stroke_t1"')
    await page.locator('#stroke_align').selectOption('center')
    expect(await attr(page, 't1', 'stroke-width')).toBe('3')

    const settings = page.locator('.se-more-toggle[data-more="stroke"]')
    await expect(page.locator('#stroke_style')).toBeHidden()
    await settings.click()
    for (const id of ['stroke_style', 'stroke_miter_angle', 'start_marker_list_opts', 'end_marker_list_opts']) {
      await expect(page.locator(`#${id}`)).toBeVisible()
    }
    // The joins and the caps: rows of buttons, as in Figma (lot Texte).
    for (const id of ['stroke_linejoin', 'stroke_linecap']) {
      await expect(page.locator(`.se-choices[data-for="${id}"]`)).toBeVisible()
    }
  })

  test('− removes the stroke and its rows; + on the title line gives it back', async ({ page }) => {
    await page.locator('.se-paint-remove[data-paint="stroke"]').click()
    expect(await attr(page, 't1', 'stroke')).toBe('none')
    await expect(page.locator('#stroke_width')).toBeHidden()
    await page.locator('.se-paint-add[data-paint="stroke"]').click()
    expect(await attr(page, 't1', 'stroke')).toBe('#000000')
    await expect(page.locator('#stroke_width')).toBeVisible()
  })
})
