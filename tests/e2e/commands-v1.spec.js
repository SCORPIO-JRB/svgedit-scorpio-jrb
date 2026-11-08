import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// V1: one registry of commands. Every shortcut shown to the user (tooltip,
// menu, context menu) is generated from the registry, and every shortcut of
// the registry runs its command.

// Playwright key names for the canonical keys of shortcuts.js. Digits and
// brackets are pressed by physical key, as the editor reads them with Shift.
const KEYS = {
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  delete: 'Delete',
  backspace: 'Backspace',
  escape: 'Escape',
  enter: 'Enter',
  tab: 'Tab',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  ']': 'BracketRight',
  '[': 'BracketLeft',
  '=': 'Equal',
  '-': 'Minus',
  '\\': 'Backslash',
  ' ': 'Space'
}

const toPlaywright = (canonical) => {
  const parts = canonical.endsWith('++')
    ? [...canonical.slice(0, -2).split('+').filter(Boolean), '+']
    : canonical.split('+')
  const key = parts.pop()
  const modifiers = parts.map((m) => ({ alt: 'Alt', ctrl: 'Control', mod: 'Control', shift: 'Shift' })[m])
  let name = KEYS[key] ?? (/^\d$/.test(key) ? `Digit${key}` : key)
  // "+" without Shift comes from the numeric keypad, with Shift from "=".
  if (key === '+') name = modifiers.includes('Shift') ? 'Equal' : 'NumpadAdd'
  return [...modifiers, name].join('+')
}

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

test.describe('Command registry (V1)', () => {
  test('every shortcut of the registry runs its command', async ({ page }) => {
    const bindings = await page.evaluate(() => window.svgEditor.commands.list()
      .flatMap((command) => command.shortcuts.map((shortcut) => ({ id: command.id, shortcut }))))
    expect(bindings.length).toBeGreaterThan(60)

    // Each command in turn is the only one enabled, and only counts its runs.
    // Tab must not take the focus out of the page (Firefox gives it to the
    // browser), or the next shortcuts would not reach the editor; this
    // listener runs after the editor's.
    await page.evaluate(() => {
      document.addEventListener('keydown', (e) => { if (e.key === 'Tab') e.preventDefault() })
      window.__runs = {}
      window.__only = null
      for (const command of window.svgEditor.commands.list()) {
        command.when = () => window.__only === command.id
        command.run = () => { window.__runs[command.id] = (window.__runs[command.id] ?? 0) + 1 }
      }
    })
    const silent = []
    for (const { id, shortcut } of bindings) {
      await page.evaluate((id) => {
        window.__only = id
        window.__runs = {}
        document.activeElement?.blur?.()
      }, id)
      await page.keyboard.press(toPlaywright(shortcut))
      const runs = await page.evaluate(() => window.__runs)
      if (runs[id] !== 1 || Object.keys(runs).length !== 1) silent.push(`${id}: ${shortcut} -> ${JSON.stringify(runs)}`)
    }
    expect(silent).toEqual([])
  })

  test('every shortcut shown by a button or a menu entry is one of its command', async ({ page }) => {
    const wrong = await page.evaluate(() => {
      const { commands } = window.svgEditor
      const problems = []
      for (const el of document.querySelectorAll('[shortcut]')) {
        if (el.hasAttribute('shortcut-hint-only')) continue
        const id = el.id || el.dataset.commandId
        const command = commands.get(id)
        if (!command || !command.shortcuts.length) {
          problems.push(`${id}: no command`)
          continue
        }
        const hint = commands.hint(id)
        const shown = el.tagName === 'SE-MENU-ITEM'
          ? el.shadowRoot.querySelector('.shortcut').textContent
          : el.seTooltip?.shortcut ?? ''
        if (!shown.includes(hint)) problems.push(`${id}: shows "${shown}", runs ${hint}`)
      }
      return problems
    })
    expect(wrong).toEqual([])
  })

  test('the context menu shows the shortcut of each command it runs', async ({ page }) => {
    const box = await page.locator('#workarea').boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    const shown = await page.evaluate(() => {
      const menu = document.getElementById('se-cmenu_canvas').shadowRoot
      return Object.fromEntries([...menu.querySelectorAll('a[href^="#"]')].map((a) =>
        [a.getAttribute('href').slice(1), a.querySelector('.shortcut')?.textContent ?? '']))
    })
    expect(shown).toMatchObject({
      cut: 'Ctrl+X',
      copy: 'Ctrl+C',
      paste: 'Ctrl+V',
      paste_in_place: 'Ctrl+Shift+V',
      copy_properties: 'Ctrl+Alt+C',
      paste_properties: 'Ctrl+Alt+V',
      delete: 'Delete',
      group: 'Ctrl+G',
      ungroup: 'Ctrl+Shift+G',
      move_front: 'Ctrl+Shift+]',
      move_up: 'Ctrl+]',
      move_down: 'Ctrl+[',
      move_back: 'Ctrl+Shift+['
    })
    expect(shown.select_same_fill).toBe('')
  })

  test('Delete and Backspace delete the selection; the eyedropper shows Ctrl+I', async ({ page }) => {
    await page.evaluate(() => {
      window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
        <g class="layer"><title>Layer 1</title>
          <rect id="a" x="10" y="10" width="50" height="50"/><rect id="b" x="100" y="10" width="50" height="50"/>
        </g></svg>`)
      window.svgEditor.updateCanvas()
    })
    for (const [id, key] of [['a', 'Delete'], ['b', 'Backspace']]) {
      await page.evaluate((id) => {
        window.svgEditor.svgCanvas.selectOnly([document.getElementById(id)], true)
        document.activeElement?.blur?.()
      }, id)
      await page.keyboard.press(key)
      expect(await page.evaluate((id) => document.getElementById(id), id)).toBeNull()
    }
    const tooltip = await page.evaluate(() => document.getElementById('tool_eyedropper').seTooltip)
    expect(tooltip.shortcut).toBe('Ctrl+I')
  })

  test('the layer view shortcut, given as a translation key, now works', async ({ page }) => {
    const command = await page.evaluate(() => window.svgEditor.commands.get('tool_layerView')?.shortcuts)
    expect(command).toEqual(['mod+shift+l'])
  })
})

test.describe('Tooltips (V1)', () => {
  test('a tooltip shows the name and the shortcut after a pause, then at once on the next button', async ({ page }) => {
    const tooltip = page.locator('se-tooltip')
    await expect(tooltip).not.toHaveAttribute('open', '')
    const started = Date.now()
    await page.locator('#tool_select').hover()
    await expect(tooltip).toHaveAttribute('open', '')
    // Not before the pause of 500 ms.
    expect(Date.now() - started).toBeGreaterThanOrEqual(450)
    const read = () => page.evaluate(() => {
      const root = document.querySelector('se-tooltip').shadowRoot
      return [root.getElementById('label').textContent, root.getElementById('shortcut').textContent]
    })
    expect(await read()).toEqual(['Select Tool', 'V'])
    // The next button: at once, without a second pause.
    const moved = Date.now()
    // The next tool of the bar (the zoom tool is in More ▾ since V3).
    await page.locator('#tool_text').hover()
    await expect(tooltip).toHaveAttribute('open', '')
    expect(await read()).toEqual(['Text Tool', 'T'])
    expect(Date.now() - moved).toBeLessThan(450)
    // Pressing a button hides it.
    await page.mouse.down()
    await expect(tooltip).not.toHaveAttribute('open', '')
    await page.mouse.up()
  })

  test('a button has a role, an accessible name with its shortcut, and no native title', async ({ page }) => {
    const control = await page.evaluate(() => {
      const div = document.getElementById('tool_undo').shadowRoot.querySelector('div')
      return {
        role: div.getAttribute('role'),
        name: div.getAttribute('aria-label'),
        keys: div.getAttribute('aria-keyshortcuts'),
        disabled: div.getAttribute('aria-disabled'),
        title: div.getAttribute('title')
      }
    })
    expect(control).toEqual({ role: 'button', name: 'Undo (Ctrl+Z)', keys: 'Control+Z', disabled: 'true', title: null })
  })
})
