import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// S3 of the simplification audit (docs/audit-simplification.md): code and
// files taken out, without a change of what the editor does.
// - French and English only. Any other language, asked by the URL or kept
//   in the preferences of a browser, gives English, extensions included.
// - The shapes of SVG-Edit keep the categories basic, arrow, flowchart and
//   electronics, the same in the drawer and in the button of ext-shapes.
// - ext-helloworld and ext-overview_window, never loaded, are gone; asking
//   for them leaves the editor working.
// - The scroll view is gone: view-v2.spec.js checks that the option gives
//   the borderless view.
// - Delete, Ctrl+Shift+] and Ctrl+Shift+[ belong to delete, move_front and
//   move_back alone; the buttons that repeated them show them and do the
//   same, in both layouts.

const nextFrame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))))

const ready = (page) => page.waitForFunction(() => window.svgEditor?.extensionsAdded, null, { timeout: 20000 })

const strings = (page) => page.evaluate(() => {
  const { i18next, configObj } = window.svgEditor
  return {
    language: i18next.language,
    pref: configObj.pref('lang'),
    cancel: i18next.t('common.cancel'),
    grid: i18next.t('grid:buttons.0.title'),
    connector: i18next.t('connector:langListTitle')
  }
})

const DRAWING = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <g class="layer"><title>Layer 1</title>
    <rect id="a" x="20" y="20" width="60" height="40" fill="#c00"/>
    <rect id="b" x="100" y="20" width="60" height="40" fill="#0c0"/>
    <rect id="c" x="180" y="20" width="60" height="40" fill="#00c"/>
  </g>
</svg>`

async function loadDrawing (page) {
  await page.evaluate((svg) => {
    window.svgEditor.setConfig({ gridSnapping: false })
    window.svgEditor.svgCanvas.setSvgString(svg)
    window.svgEditor.updateCanvas()
    window.svgEditor.svgCanvas.clearSelection()
    window.svgEditor.svgCanvas.undoMgr.resetUndoStack()
  }, DRAWING)
}

async function select (page, ids) {
  await page.evaluate((ids) => {
    const c = window.svgEditor.svgCanvas
    c.clearSelection()
    c.addToSelection(ids.map((id) => document.getElementById(id)), true)
  }, ids)
  await nextFrame(page)
}

const order = (page) => page.evaluate(() => [...window.svgEditor.svgCanvas.getSvgContent().querySelectorAll('rect')].map((r) => r.id).join(''))
const undoSteps = (page) => page.evaluate(() => window.svgEditor.svgCanvas.undoMgr.getUndoStackSize())

test.describe('Simplification (S3)', () => {
  test('French and English only: the preferences offer them, French translates the editor and its extensions', async ({ page }) => {
    await visitAndApproveStorage(page)
    const options = await page.evaluate(() => [...document.getElementById('se-edit-prefs').shadowRoot.querySelectorAll('#lang_select option')].map((o) => o.value))
    expect(options).toEqual(['en', 'fr'])
    await page.goto('/index.html?lang=fr')
    await ready(page)
    expect(await strings(page)).toEqual({
      language: 'fr',
      pref: 'fr',
      cancel: 'Annuler',
      grid: 'Afficher/Cacher Grille',
      connector: 'Connecter deux objets'
    })
  })

  test('a language taken out gives English, extensions included, from the URL or from the preferences', async ({ page }) => {
    const english = { language: 'en', pref: 'en', cancel: 'Cancel', grid: 'Show/Hide Grid', connector: 'Connect two objects' }
    await page.goto('/index.html?lang=de')
    await ready(page)
    expect(await strings(page)).toEqual(english)
    // A browser where German was chosen before S3
    await page.goto('/index.html')
    await page.evaluate(() => localStorage.setItem('svg-edit-lang', 'de'))
    await page.reload()
    await ready(page)
    expect(await strings(page)).toEqual(english)
  })

  test('the shapes keep four categories, the same in the drawer and in the button of ext-shapes', async ({ page }) => {
    await visitAndApproveStorage(page)
    await page.locator('#tool_library').click()
    await page.locator('#se-library-tab-shapes').click()
    await expect(page.locator('#se-library .se-library-item[data-kind="shape"]').first()).toBeVisible()
    expect(await page.locator('#se-library .se-library-section h3').allTextContents()).toEqual(['Basic', 'Arrows', 'Flowchart', 'Electronics'])
    await expect(page.locator('#se-library .se-library-item[data-key="basic/heart"]')).toHaveCount(1)

    // The classic layout loads ext-shapes, whose button reads the same list.
    await visitAndApproveStorage(page, { query: '?layout=classic' })
    await page.waitForFunction(() => document.getElementById('tool_shapelib')?.shadowRoot.querySelectorAll('.menu-item').length > 0)
    const menu = await page.evaluate(() => [...document.getElementById('tool_shapelib').shadowRoot.querySelectorAll('.menu-item')].map((item) => item.dataset.menu))
    expect(menu).toEqual(['basic', 'arrow', 'flowchart', 'electronics'])
  })

  test('the extensions never loaded are gone; asking for them leaves the editor working', async ({ page }) => {
    const failed = []
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('Extension failed to load')) failed.push(message.text())
    })
    await page.goto('/index.html?extensions=ext-helloworld,ext-overview_window')
    await ready(page)
    const loaded = await page.evaluate(() => Object.keys(window.svgEditor.svgCanvas.getExtensions()))
    expect(loaded).not.toContain('helloworld')
    expect(loaded).not.toContain('overview_window')
    expect(loaded).toEqual(expect.arrayContaining(['connector', 'grid', 'polystar', 'storage']))
    expect(failed).toHaveLength(2)
    // The editor still draws.
    await page.evaluate(() => window.svgEditor.svgCanvas.setMode('rect'))
    expect(await page.evaluate(() => window.svgEditor.svgCanvas.getMode())).toBe('rect')
  })

  test('Delete, Ctrl+Shift+] and Ctrl+Shift+[ have one command each and act on one or several objects', async ({ page }) => {
    await visitAndApproveStorage(page)
    const owners = await page.evaluate(() => {
      const byShortcut = {}
      for (const command of window.svgEditor.commands.list()) {
        for (const shortcut of command.shortcuts) (byShortcut[shortcut.toLowerCase()] ??= []).push(command.id)
      }
      return Object.fromEntries(['delete', 'backspace', 'mod+shift+]', 'mod+shift+['].map((key) => [key, byShortcut[key]]))
    })
    expect(owners).toEqual({ delete: ['delete'], backspace: ['delete'], 'mod+shift+]': ['move_front'], 'mod+shift+[': ['move_back'] })

    await loadDrawing(page)
    await page.locator('#workarea').hover()
    await select(page, ['a'])
    await page.keyboard.press('Control+Shift+BracketRight')
    expect(await order(page)).toBe('bca')
    await page.keyboard.press('Control+Shift+BracketLeft')
    expect(await order(page)).toBe('abc')
    await select(page, ['b', 'c'])
    await page.keyboard.press('Control+Shift+BracketLeft')
    expect(await order(page)).toBe('bca')
    await page.keyboard.press('Delete')
    expect(await order(page)).toBe('a')
    expect(await undoSteps(page)).toBe(4)
    await select(page, ['a'])
    await page.keyboard.press('Backspace')
    expect(await order(page)).toBe('')
  })

  test('the buttons that repeated them keep their icon, show the shortcut and do the same (classic layout)', async ({ page }) => {
    await visitAndApproveStorage(page, { query: '?layout=classic' })
    await ready(page)
    const buttons = await page.evaluate(() => ['tool_delete', 'tool_delete_multi', 'tool_move_top', 'tool_move_bottom'].map((id) => {
      const el = document.getElementById(id)
      return {
        id,
        src: el.getAttribute('src'),
        icon: el.shadowRoot.querySelector('se-icon, img')?.getAttribute('src')?.split('/').pop() ?? null,
        shortcut: el.getAttribute('shortcut'),
        hintOnly: el.hasAttribute('shortcut-hint-only'),
        shown: el.seTooltip?.shortcut ?? null
      }
    }))
    for (const button of buttons) {
      expect(button.src, button.id).toMatch(/^(delete|move_top|move_bottom)\.svg$/)
      expect(button.icon, button.id).toBe(button.src)
      expect(button.hintOnly, button.id).toBe(true)
      expect(button.shown, button.id).toBeTruthy()
    }
    await loadDrawing(page)
    await select(page, ['a'])
    await page.locator('#tool_move_top').click()
    expect(await order(page)).toBe('bca')
    await page.locator('#tool_move_bottom').click()
    expect(await order(page)).toBe('abc')
    await page.locator('#tool_delete').click()
    expect(await order(page)).toBe('bc')
    await select(page, ['b', 'c'])
    await page.locator('#tool_delete_multi').click()
    expect(await order(page)).toBe('')
  })
})
