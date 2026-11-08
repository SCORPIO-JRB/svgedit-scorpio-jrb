import { AxeBuilder } from '@axe-core/playwright'
import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

// V1: the design system applied to the current layout. Both themes reach
// WCAG AA, the theme changes without reloading and never touches the
// document, fonts and icons come with the editor.

const errors = []

test.beforeEach(async ({ page }) => {
  errors.length = 0
  page.on('pageerror', (err) => errors.push(err.message))
})

test.afterEach(() => {
  expect(errors).toEqual([])
})

const ready = async (page) => {
  await visitAndApproveStorage(page)
  await page.waitForFunction(() => window.svgEditor.extensionsAdded)
}

const theme = (page) => page.evaluate(() => window.svgEditor.$container.dataset.seTheme)
const background = (page, selector) => page.evaluate((selector) =>
  getComputedStyle(document.querySelector(selector)).backgroundColor, selector)

// Rules left to later lots, each for a reason. None since V2: the
// borderless view removed the scroll region #workarea
// (scrollable-region-focusable).
const LATER = []

for (const scheme of ['dark', 'light']) {
  test(`WCAG AA in the ${scheme} theme, contrast included`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await ready(page)
    expect(await theme(page)).toBe(scheme)
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = violations
      .filter((v) => ['serious', 'critical'].includes(v.impact) && !LATER.includes(v.id))
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' > ')).join(', ')}`)
    expect(serious).toEqual([])
    expect(violations.find((v) => v.id === 'color-contrast')).toBeUndefined()
  })
}

test('the theme follows the system live, until the user chooses one', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await ready(page)
  expect(await theme(page)).toBe('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => theme(page)).toBe('light')
  await page.evaluate(() => window.svgEditor.setTheme('dark'))
  expect(await theme(page)).toBe('dark')
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await theme(page)).toBe('dark')
  // A host page sets it with the other options, after the start too.
  await page.evaluate(() => window.svgEditor.setConfig({ theme: 'light' }))
  expect(await theme(page)).toBe('light')
})

test('the preferences change the theme without reloading, and leave the document as it was', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await ready(page)
  await page.evaluate(() => {
    window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
      <g class="layer"><title>Layer 1</title><rect id="r" x="10" y="10" width="80" height="40" fill="#123456"/></g></svg>`)
    window.__marker = 'same page'
  })
  const before = await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())
  const darkTop = await background(page, '#tools_top')

  await page.evaluate(() => window.svgEditor.mainMenu.showPreferences())
  const prefs = page.locator('#se-edit-prefs')
  await expect(prefs.locator('#theme_select')).toHaveValue('system')
  await prefs.locator('#theme_select').selectOption('light')
  await prefs.locator('#tool_prefs_save').click()

  expect(await theme(page)).toBe('light')
  expect(await page.evaluate(() => window.svgEditor.configObj.pref('theme'))).toBe('light')
  expect(await page.evaluate(() => window.__marker)).toBe('same page')
  expect(await background(page, '#tools_top')).not.toBe(darkTop)
  expect(await background(page, '#tools_top')).toBe('rgb(255, 255, 255)')
  expect(await page.evaluate(() => window.svgEditor.svgCanvas.getSvgString())).toBe(before)
})

test('fonts and icons come with the editor: no request leaves it', async ({ page }) => {
  const requests = []
  page.on('request', (request) => requests.push(request.url()))
  await ready(page)
  await page.evaluate(() => document.fonts.ready)
  const origin = new URL(page.url()).origin
  const outside = requests.filter((url) => !url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:') && url !== 'about:blank')
  expect(outside).toEqual([])
  const fonts = await page.evaluate(() => ({
    family: getComputedStyle(document.querySelector('.svg_editor')).fontFamily,
    ui: document.fonts.check('12px "Roboto Flex"'),
    display: document.fonts.check('600 14px "Space Grotesk"')
  }))
  expect(fonts.family.startsWith('"Roboto Flex"')).toBe(true)
  expect(fonts.ui).toBe(true)
  expect(fonts.display).toBe(true)
  expect(requests.some((url) => url.includes('/fonts/roboto-flex-latin-wght-normal.woff2'))).toBe(true)
})

test('icons take the colour of their control: the active tool is in the accent colour', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await ready(page)
  const icon = await page.evaluate(() => {
    const button = document.getElementById('tool_select')
    const div = button.shadowRoot.querySelector('div')
    const glyph = button.shadowRoot.querySelector('se-icon').shadowRoot.querySelector('span')
    const accent = getComputedStyle(document.querySelector('.se-editor')).getPropertyValue('--se-accent').trim()
    return {
      pressed: div.classList.contains('pressed'),
      mask: getComputedStyle(glyph).maskImage || getComputedStyle(glyph).webkitMaskImage,
      accent
    }
  })
  expect(icon.pressed).toBe(true)
  expect(icon.accent).toBe('#6aabf1')
  expect(icon.mask).toContain('select.svg')
  // After the colour transition of the button.
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('tool_select')
    .shadowRoot.querySelector('se-icon').shadowRoot.querySelector('span')).backgroundColor)).toBe('rgb(106, 171, 241)')
})

for (const scheme of ['dark', 'light']) {
  test(`the drawing does not inherit the interface in the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await ready(page)
    const drawn = await page.evaluate(() => {
      window.svgEditor.svgCanvas.setSvgString(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <g class="layer"><title>Layer 1</title>
          <text id="t" x="10" y="40" font-size="20">Synoptique 123</text>
          <rect id="c" x="10" y="60" width="40" height="40" fill="currentColor"/>
        </g></svg>`)
      const text = getComputedStyle(document.getElementById('t'))
      return {
        font: text.fontFamily,
        numeric: text.fontVariantNumeric,
        fill: getComputedStyle(document.getElementById('c')).fill
      }
    })
    expect(drawn).toEqual({ font: 'Verdana, Helvetica, Arial', numeric: 'normal', fill: 'rgb(0, 0, 0)' })
  })
}
