import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage, clickControl, chooseTool, screenPoint } from './helpers.js'

// S1 of the simplification audit (docs/audit-simplification.md): what the
// canvas layout no longer offers. Only the interface: the net of S0
// (simplification-s0.spec.js) checks that every family of element still
// opens, transforms and saves as before.
// - Out of sight: square, circle and the freehand shapes; the shapes button
//   of ext-shapes and the layer view of ext-layer_view, no longer loaded by
//   default; Reorient path; Align to the page, which the Align menu takes
//   over for one object; Document properties, whose choice of images moves
//   to the Document section; the home page of SVG-Edit; the letters D, C, G,
//   A, Shift+O and Shift+P.
// - Shown only when the object has a value: line-through, overline, word
//   spacing, text length and its adjustment, blur. Folded under "More
//   options": joins, caps, letter spacing.
// - The classic layout, reference of the user test of V4, does not change:
//   what it offers is compared with a record made on master
//   (S1_CLASSIC_UPDATE=1 against a build of master rewrites it, see the
//   audit, section 7). Only its registry lost, in S3, the four commands
//   that repeated delete, move_front and move_back; their buttons stay.

const DIR = path.join(process.cwd(), 'tests/fixtures/simplification')
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8')
const CLASSIC_FILE = path.join(DIR, 'classique.json')
// Merged in S3 into delete, move_front and move_back, which had the same
// shortcuts and ran first: the buttons show them and do the same.
const MERGED_IN_S3 = ['tool_delete', 'tool_delete_multi', 'tool_move_bottom', 'tool_move_top']

async function loadDrawing (page, svg = read('familles.svg')) {
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
    if (ids.length) c.addToSelection(ids.map((id) => document.getElementById(id)), true)
    document.activeElement?.blur?.()
  }, ids)
  await nextFrame(page)
}

/** Whether controls take room on the screen, by id. */
const shownControls = (page, ids) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
  const el = document.getElementById(id)
  const box = el?.getBoundingClientRect()
  return [id, Boolean(box && box.width > 0 && box.height > 0)]
})), ids)

const svgOf = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
const count = (page, selector) => page.evaluate((selector) => document.querySelectorAll(selector).length, selector)
const selectedIds = (page) => page.evaluate(() => window.svgEditor.svgCanvas.getSelectedElements().filter(Boolean).map((el) => el.id))
const extensions = (page) => page.evaluate(() => Object.keys(window.svgEditor.svgCanvas.getExtensions()).sort())
const commandsOf = (page, shortcut) => page.evaluate((shortcut) => window.svgEditor.commands.find(shortcut).map((command) => command.id).sort(), shortcut)
/** Whether an object is in a group of its own, not only in its layer. */
const grouped = (page, id) => page.evaluate((id) => {
  const parent = document.getElementById(id).parentNode
  return parent.tagName === 'g' && !parent.classList.contains('layer')
}, id)

test.describe('Simplification, canvas layout (S1)', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    await loadDrawing(page)
  })

  test('the Shapes menu holds rectangle, ellipse, line, star and polygon; the tools taken out stay in the page, hidden, without shortcut', async ({ page }) => {
    const places = await page.evaluate(() => [...document.querySelectorAll('#tools_left [data-place]')]
      .map((place) => `${place.dataset.place}: ${[...place.children].map((el) => el.id).filter(Boolean).join(' ')}`))
    expect(places).toContain('shapes: tool_rect tool_ellipse tool_line tool_star tool_polygon')
    expect(places).toContain('insert: tool_image tool_connect tool_library')
    const retired = await page.evaluate(() => ['tool_square', 'tool_fhrect', 'tool_circle', 'tool_fhellipse', 'tool_reorient',
      'tool_position', 'tool_docprops', 'tool_editor_homepage'].map((id) => {
      const el = document.getElementById(id)
      return [id, el?.parentElement?.id, el?.getBoundingClientRect().width, el?.hasAttribute('shortcut')]
    }))
    expect(retired).toEqual(retired.map(([id]) => [id, 'se-retired', 0, false]))
    // Rectangle with Shift still draws a square: the mode of the canvas stays.
    await chooseTool(page, 'tool_rect')
    const from = await screenPoint(page, 500, 400)
    const to = await screenPoint(page, 560, 430)
    await page.mouse.move(from.x, from.y)
    await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    const drawn = await page.evaluate(() => [...document.querySelectorAll('#svgcontent rect')]
      .filter((el) => !['carre', 'rectangle', 'flou-fond'].includes(el.id))
      .map((el) => ({ square: el.getAttribute('width') === el.getAttribute('height'), width: Number(el.getAttribute('width')) })))
    expect(drawn).toEqual([{ square: true, width: expect.any(Number) }])
    expect(drawn[0].width).toBeGreaterThan(20)
  })

  test('ext-shapes and ext-layer_view are not loaded; the Shapes tab of the drawer shows the shapes, named, and inserts one', async ({ page }) => {
    const loaded = await extensions(page)
    expect(loaded).not.toContain('shapes')
    expect(loaded).not.toContain('layer_view')
    expect(await count(page, '#tool_shapelib, #tool_layerView')).toBe(0)
    // Ctrl+Shift+L is the lock alone.
    expect(await commandsOf(page, 'ctrl+shift+l')).toEqual(['lock_selection'])

    await page.locator('#tool_library').click()
    await page.locator('#se-library-tab-shapes').click()
    await expect(page.locator('#se-library .se-library-item[data-kind="shape"]').first()).toBeVisible()
    const titles = await page.evaluate(() => [...document.querySelectorAll('#se-library .se-library-section h3')].map((h) => h.textContent))
    // The names of ext-shapes, not their keys.
    expect(titles).toContain('Basic')
    expect(titles).toContain('Arrows')
    expect(titles).not.toContain('basic')
    const before = await count(page, '#svgcontent path')
    await page.locator('#se-library .se-library-item[data-kind="shape"]').first().click()
    expect(await count(page, '#svgcontent path')).toBe(before + 1)
  })

  test('"…" menu: Clone shows Ctrl+D and duplicates; D, C, A, Shift+O and Shift+P do nothing; Ctrl+D, Ctrl+A and Tab do', async ({ page }) => {
    await select(page, ['rectangle'])
    await page.locator('#se-actions-button').click()
    const clone = page.locator('#tool_clone')
    await expect(clone).toBeVisible()
    expect(await clone.evaluate((el) => el.shadowRoot.querySelector('.kbd').textContent)).toBe('Ctrl+D')
    await clone.click()
    expect(await count(page, '#svgcontent rect')).toBe(4)

    const rects = await count(page, '#svgcontent rect')
    await select(page, ['rectangle'])
    for (const key of ['d', 'c', 'Shift+O', 'Shift+P']) {
      await page.keyboard.press(key)
      await nextFrame(page)
      expect(await count(page, '#svgcontent rect'), key).toBe(rects)
      expect(await selectedIds(page), key).toEqual(['rectangle'])
    }
    await page.keyboard.press('Control+d')
    expect(await count(page, '#svgcontent rect')).toBe(rects + 1)

    await select(page, [])
    await page.keyboard.press('a')
    await nextFrame(page)
    expect(await selectedIds(page)).toEqual([])
    await page.keyboard.press('Control+a')
    await nextFrame(page)
    expect((await selectedIds(page)).length).toBeGreaterThan(10)

    await select(page, ['carre'])
    await page.keyboard.press('Tab')
    await nextFrame(page)
    expect(await selectedIds(page)).not.toEqual(['carre'])
  })

  test('Group shows Ctrl+G, in the "…" menu and the contextual bar; it groups, as Ctrl+G does, and G does nothing', async ({ page }) => {
    await select(page, ['rectangle', 'ellipse'])
    await page.keyboard.press('g')
    await nextFrame(page)
    expect(await grouped(page, 'rectangle')).toBe(false)
    expect(await page.locator('#tool_group_elements').evaluate((el) => el.shadowRoot.querySelector('.kbd').textContent)).toBe('Ctrl+G')
    await page.waitForFunction(() => !document.getElementById('se-context-bar').hidden)
    expect(await page.evaluate(() => document.querySelector('#se-context-bar [data-entry="text:tool_group_elements"]').seTooltip.shortcut))
      .toBe('Ctrl+G')
    await clickControl(page, 'tool_group_elements')
    expect(await grouped(page, 'rectangle')).toBe(true)
    await page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.undo())
    await select(page, ['rectangle', 'ellipse'])
    await page.keyboard.press('Control+g')
    expect(await grouped(page, 'rectangle')).toBe(true)
  })

  test('Align opens for one object and aligns it on the page; with several, the distribution and the reference come back', async ({ page }) => {
    const before = await svgOf(page)
    await select(page, ['rectangle'])
    await page.locator('#se-actions-button').click()
    await expect(page.locator('#tool_position')).toBeHidden()
    await page.locator('#tool_align_menu').click()
    await expect(page.locator('#tool_align_popup')).toBeVisible()
    await expect(page.locator('#tool_align_popup .se-align-page')).toBeVisible()
    expect(await shownControls(page, ['tool_align_left', 'tool_align_distrib_horiz', 'tool_align_relative']))
      .toEqual({ tool_align_left: true, tool_align_distrib_horiz: false, tool_align_relative: false })
    await page.locator('#tool_align_left').click()
    expect(await page.evaluate(() => document.getElementById('rectangle').getAttribute('x'))).toBe('0')
    // The menu stays open for the next alignment.
    await expect(page.locator('#tool_align_popup')).toBeVisible()
    await page.locator('#tool_align_bottom').click()
    expect(await page.evaluate(() => document.getElementById('rectangle').getAttribute('y'))).toBe('430')
    await page.keyboard.press('Escape')
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.undoMgr.undo()
      window.svgEditor.svgCanvas.undoMgr.undo()
    })
    expect(await svgOf(page)).toBe(before)

    await select(page, ['rectangle', 'ellipse'])
    await clickControl(page, 'tool_align_menu')
    await expect(page.locator('#tool_align_popup .se-align-page')).toBeHidden()
    expect(await shownControls(page, ['tool_align_distrib_horiz', 'tool_align_relative']))
      .toEqual({ tool_align_distrib_horiz: true, tool_align_relative: true })
    await page.locator('#tool_align_top').click()
    expect(await page.evaluate(() => ['rectangle', 'ellipse'].map((id) => Math.round(document.getElementById(id).getBBox().y))))
      .toEqual([40, 40])
  })

  test('a path has no Reorient in its "…" menu, even rotated', async ({ page }) => {
    await select(page, ['fleche'])
    await page.evaluate(() => window.svgEditor.svgCanvas.setRotationAngle(30))
    await page.locator('#se-actions-button').click()
    const verbs = await page.evaluate(() => [...document.querySelectorAll('#se-actions-menu se-button')]
      .filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.id))
    expect(verbs).not.toContain('tool_reorient')
    // The flips are beside the angle, in Position (lot Propriétés).
    expect(verbs).not.toContain('tool_flip_h')
    await expect(page.locator('[data-section="geometry"] #tool_flip_h')).toBeVisible()
  })

  test('the document menu has no document properties nor home page; Shift+D opens nothing; the Document section chooses the images and fits to the content', async ({ page }) => {
    const items = await page.evaluate(() => [...document.querySelectorAll('#main_button se-menu-item')].map((el) => el.id))
    expect(items).toContain('tool_editor_prefs')
    expect(items).not.toContain('tool_docprops')
    expect(items).not.toContain('tool_editor_homepage')

    await select(page, [])
    await page.keyboard.press('Shift+D')
    await nextFrame(page)
    expect(await page.locator('#se-img-prop').getAttribute('dialog')).not.toBe('open')

    const section = page.locator('[data-section="document"]')
    await expect(section).toBeVisible()
    expect(await section.locator('[data-target="tool_docprops"]').count()).toBe(0)
    const images = page.locator('#se-doc-images')
    await expect(images).toHaveValue('embed')
    await images.selectOption('ref')
    expect(await page.evaluate(() => [window.svgEditor.configObj.pref('img_save'), document.getElementById('se-img-prop').getAttribute('save')]))
      .toEqual(['ref', 'ref'])

    await page.locator('#se-doc-fit').click()
    const size = await page.evaluate(() => window.svgEditor.svgCanvas.getResolution())
    expect([size.w, size.h]).not.toEqual([640, 480])
    await expect(page.locator('#se-doc-width')).toHaveValue(String(Math.round(size.w * 100) / 100))
  })
})

test.describe('Rare and folded settings (S1)', () => {
  const RARE = ['tool_text_decoration_linethrough', 'tool_text_decoration_overline', 'tool_word_spacing', 'tool_text_length', 'tool_length_adjust']
  const only = (...ids) => Object.fromEntries(RARE.map((id) => [id, ids.includes(id)]))

  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    await loadDrawing(page)
  })

  test('a text shows a rare setting when it has a value for it', async ({ page }) => {
    const cases = {
      'texte-simple': only(),
      'texte-barre': only('tool_text_decoration_linethrough'),
      'texte-surligne': only('tool_text_decoration_overline'),
      'texte-espace': only('tool_word_spacing'),
      'texte-longueur': only('tool_text_length', 'tool_length_adjust')
    }
    // They are in the settings of the text (lot Texte), open.
    const openSettings = async () => {
      if (!await page.evaluate(() => document.getElementById('se-settings-text').opened)) {
        await page.locator('.se-more-toggle[data-more="text"]').click()
      }
    }
    for (const [id, expected] of Object.entries(cases)) {
      await select(page, [id])
      await openSettings()
      expect(await shownControls(page, RARE), id).toEqual(expected)
    }
    // Several texts: the settings one of them has.
    await select(page, ['texte-simple', 'texte-surligne'])
    await openSettings()
    expect(await shownControls(page, RARE)).toEqual(only('tool_text_decoration_overline'))
    // The value removed, the setting stays for this selection, to give it back.
    await select(page, ['texte-barre'])
    await openSettings()
    await page.locator('#tool_text_decoration_linethrough').click()
    expect(await page.evaluate(() => document.getElementById('texte-barre').getAttribute('text-decoration') ?? '')).not.toContain('line-through')
    expect(await shownControls(page, RARE)).toEqual(only('tool_text_decoration_linethrough'))
    await page.locator('#tool_text_decoration_linethrough').click()
    expect(await page.evaluate(() => document.getElementById('texte-barre').getAttribute('text-decoration'))).toContain('line-through')
  })

  test('the Effects section shows for an object with a blur only, and its value can be changed', async ({ page }) => {
    const effects = page.locator('[data-section="effects"]')
    await select(page, ['carre'])
    await expect(effects).toBeHidden()
    await select(page, ['flou-fond'])
    await expect(effects).toBeVisible()
    await expect(page.locator('#blur')).toBeVisible()
  })

  test('joins and caps are in the settings of the stroke, word spacing in those of the text; the icon marks a value that is not the usual one', async ({ page }) => {
    await select(page, ['trace-libre'])
    // The icon of the settings at the end of the row of the stroke (lot
    // Propriétés) opens the window "Stroke settings" (lot Texte).
    const stroke = page.locator('.se-more-toggle[data-more="stroke"]')
    const joins = page.locator('#se-settings-stroke .se-choices[data-for="stroke_linejoin"]')
    const caps = page.locator('#se-settings-stroke .se-choices[data-for="stroke_linecap"]')
    expect(await shownControls(page, ['stroke_width'])).toEqual({ stroke_width: true })
    await expect(joins).toBeHidden()
    await expect(stroke).toHaveAttribute('aria-expanded', 'false')
    expect(await stroke.evaluate((el) => el.classList.contains('se-more-set'))).toBe(false)
    await stroke.click()
    await expect(stroke).toHaveAttribute('aria-expanded', 'true')
    await expect(joins).toBeVisible()
    await expect(caps).toBeVisible()
    // The window stays last; the dashes and the markers of the extension are in it.
    expect(await page.evaluate(() => {
      const body = document.querySelector('[data-section="stroke"] > .se-section-body')
      return body.lastElementChild.classList.contains('se-more') &&
        Boolean(document.querySelector('#se-more-stroke #stroke_style')) &&
        Boolean(document.querySelector('#se-more-stroke #marker_panel'))
    })).toBe(true)
    await stroke.click()
    await expect(stroke).toHaveAttribute('aria-expanded', 'false')

    await page.evaluate(() => document.getElementById('trace-libre').setAttribute('stroke-linejoin', 'round'))
    await select(page, ['carre'])
    await select(page, ['trace-libre'])
    expect(await stroke.evaluate((el) => el.classList.contains('se-more-set'))).toBe(true)

    // The letter spacing is on the panel, as in Figma; word spacing in the settings.
    await select(page, ['texte-espace'])
    const text = page.locator('.se-more-toggle[data-more="text"]')
    expect(await shownControls(page, ['tool_letter_spacing', 'tool_word_spacing'])).toEqual({ tool_letter_spacing: true, tool_word_spacing: false })
    expect(await text.evaluate((el) => el.classList.contains('se-more-set'))).toBe(true)
    await text.click()
    expect(await shownControls(page, ['tool_word_spacing'])).toEqual({ tool_word_spacing: true })
    await select(page, ['texte-simple'])
    expect(await text.evaluate((el) => el.classList.contains('se-more-set'))).toBe(false)
  })
})

test.describe('Extensions taken out of the defaults (S1)', () => {
  test('the extensions option still loads them, with their button; Ctrl+Shift+L is then shared again', async ({ page }) => {
    await visitAndApproveStorage(page, { query: '?extensions=ext-shapes,ext-layer_view' })
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    const loaded = await extensions(page)
    expect(loaded).toEqual(expect.arrayContaining(['shapes', 'layer_view']))
    expect(await page.evaluate(() => document.getElementById('tool_shapelib').closest('[data-place]').dataset.place)).toBe('insert')
    expect(await commandsOf(page, 'ctrl+shift+l')).toEqual(['lock_selection', 'tool_layerView'])
  })
})

/**
 * What the classic layout offers: the commands and their shortcuts, the
 * tools of its left bar, the document menu, the extensions, and the controls
 * of its top bar for some selections.
 */
const readClassic = () => {
  const sorted = (list) => [...new Set(list)].sort()
  const commands = Object.fromEntries(window.svgEditor.commands.list()
    .map((command) => [command.id, sorted(command.shortcuts.map((shortcut) => shortcut.toLowerCase()))])
    .sort(([a], [b]) => a.localeCompare(b)))
  const tools = Object.fromEntries([...document.querySelectorAll('#tools_left se-button, #tools_left se-explorerbutton, #tools_left se-flyingbutton')]
    .map((tool) => [tool.id, tool.parentElement.closest('se-flyingbutton')?.id ?? ''])
    .sort(([a], [b]) => a.localeCompare(b)))
  const documentMenu = sorted([...document.querySelectorAll('#main_button se-menu-item')].map((item) => item.id))
  const extensions = Object.keys(window.svgEditor.svgCanvas.getExtensions()).sort()
  return { commands, tools, documentMenu, extensions }
}

const readTopBar = () => [...document.querySelectorAll('#tools_top :is(se-button, se-input, se-spin-input, se-select, se-list)')]
  .filter((control) => {
    const box = control.getBoundingClientRect()
    return box.width > 0 && box.height > 0
  })
  .map((control) => control.id).filter(Boolean).sort()

test.describe('Classic layout (S1)', () => {
  test('it offers what it offered on master', async ({ page }) => {
    await visitAndApproveStorage(page, { query: '?layout=classic' })
    await page.waitForFunction(() => window.svgEditor.extensionsAdded)
    await loadDrawing(page)
    const record = await page.evaluate(readClassic)
    record.topBar = {}
    for (const ids of [['rectangle'], ['texte-simple'], ['texte-barre'], ['flou-fond'], ['fleche'], ['rectangle', 'ellipse'], []]) {
      await select(page, ids)
      record.topBar[ids.join('+') || 'none'] = await page.evaluate(readTopBar)
    }
    if (process.env.S1_CLASSIC_UPDATE === '1') {
      // A record of master, which still has the commands S3 merged.
      fs.writeFileSync(CLASSIC_FILE, JSON.stringify(record, null, 2) + '\n')
      return
    }
    const onMaster = JSON.parse(fs.readFileSync(CLASSIC_FILE, 'utf8'))
    for (const id of MERGED_IN_S3) {
      expect(onMaster.commands).toHaveProperty(id)
      delete onMaster.commands[id]
    }
    expect(record).toEqual(onMaster)
  })
})
