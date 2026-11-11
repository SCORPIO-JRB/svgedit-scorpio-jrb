import { expect } from '@playwright/test'

/**
 * Opens the editor with an empty storage.
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {string} [options.query] Such as "?layout=classic"
 */
export async function visitAndApproveStorage (page, { query = '' } = {}) {
  await page.goto('about:blank')
  await page.context().clearCookies()
  await page.goto(`/index.html${query}`)
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await dismissStorageDialog(page)
  await page.waitForSelector('#svgroot', { timeout: 20000 })
  await selectEnglishAndSnap(page)
  await dismissStorageDialog(page)
}

export async function selectEnglishAndSnap (page) {
  await page.waitForFunction(() => window.svgEditor && window.svgEditor.setConfig, null, { timeout: 20000 })
  await page.evaluate(() => {
    window.svgEditor.setConfig({
      lang: 'en',
      gridSnapping: true
    })
  })
}

export async function openMainMenu (page) {
  await page.locator('#main_button').click()
}

export async function setSvgSource (page, svgMarkup) {
  await dismissStorageDialog(page)
  // In the canvas layout the source button is out of sight (the Code tab
  // takes its place; Ctrl+U still opens the source): a click on the button
  // works in both layouts.
  await page.evaluate(() => document.getElementById('tool_source').click())
  const textarea = page.locator('#svg_source_textarea')
  await expect(textarea).toBeVisible()
  await textarea.fill(svgMarkup)
  await page.locator('#tool_source_save').click()
}

export async function dismissStorageDialog (page) {
  const storageDialog = page.locator('se-storage-dialog')
  if (!(await storageDialog.count())) {
    try {
      await storageDialog.waitFor({ state: 'attached', timeout: 3000 })
    } catch {
      return
    }
  }

  const isOpen = await storageDialog.getAttribute('dialog')
  if (isOpen !== 'open') return

  const okButton = storageDialog.locator('button#storage_ok')
  if (await okButton.count()) {
    await okButton.click({ force: true })
  } else {
    await page.evaluate(() => {
      const dialog = document.querySelector('se-storage-dialog')
      dialog?.setAttribute('dialog', 'close')
    })
  }

  await page.waitForFunction(
    () => document.querySelector('se-storage-dialog')?.getAttribute('dialog') !== 'open',
    null,
    { timeout: 5000 }
  ).catch(() => {})
}

export async function clickCanvas (page, point) {
  const canvas = page.locator('#svgroot')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Could not determine canvas bounds')
  }
  await page.mouse.click(box.x + point.x, box.y + point.y)
}

export async function dragOnCanvas (page, start, end) {
  const canvas = page.locator('#svgroot')
  const box = await canvas.boundingBox()
  if (!box) {
    throw new Error('Could not determine canvas bounds')
  }
  const startX = box.x + start.x
  const startY = box.y + start.y
  const endX = box.x + end.x
  const endY = box.y + end.y

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY)
  await page.mouse.up()
}

/**
 * Canonical form of a transform list or of path data, to compare what the
 * browsers write. Firefox serializes the values it computes with commas and
 * spaces ("rotate(90, 210, 60)", "M 300 300 L 460 320 Z"); Chromium, or
 * SVG-Edit's own writer, with spaces only or commas only ("rotate(90 210 60)",
 * "M300,300 L460,320 z"). They mean the same.
 * @param {string|null} value
 * @returns {string|null}
 */
export const canonical = (value) => {
  if (value === null || value === undefined) { return value }
  const tokens = String(value).match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|[a-z]+|[()]/gi) || []
  return tokens.map((t) => (t === 'z' ? 'Z' : t)).join(' ')
    .replace(/ \( /g, '(').replace(/ \)/g, ')')
}

/**
 * Matrix from the drawing's coordinates to the screen. The first layer has no
 * transform and sits in the drawing's coordinates. The drawing's own <svg>
 * cannot be used: Firefox leaves its x and y out of its getScreenCTM, and
 * gives it a screen box that is neither its viewport nor its content.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<number[]>} a, b, c, d, e, f
 */
export const drawingToScreen = (page) => page.evaluate(() => {
  const m = document.querySelector('#svgcontent > g.layer').getScreenCTM()
  return [m.a, m.b, m.c, m.d, m.e, m.f]
})

/**
 * Screen point of a point of the drawing.
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 * @param {number} y
 * @returns {Promise<{x: number, y: number}>}
 */
export const screenPoint = async (page, x, y) => {
  const [a, b, c, d, e, f] = await drawingToScreen(page)
  return { x: a * x + c * y + e, y: b * x + d * y + f }
}

/**
 * Chooses a tool as a user does: a tool that is in a menu of the toolbar
 * (Shapes ▾, Paths ▾, More ▾ in the canvas layout of V3) is chosen from that
 * menu, opened first.
 * @param {import('@playwright/test').Page} page
 * @param {string} id The id of the tool button
 */
export async function chooseTool (page, id) {
  const tool = page.locator(`#${id}`)
  if (!(await tool.isVisible())) {
    const group = page.locator(`se-flyingbutton:has(> #${id})`)
    if (await group.count()) {
      if (await group.evaluate((el) => el.hasAttribute('menu-only'))) {
        await group.click()
      } else {
        await group.locator('.handle').click()
      }
    }
  }
  await tool.click()
}

/**
 * Clicks a control wherever the layout puts it: in sight, in the "…" menu of
 * the inspector (verbs on the selection), or in the zoom menu (view options,
 * undo and redo) of the canvas layout.
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function clickControl (page, id) {
  const control = page.locator(`#${id}`)
  if (await control.isVisible()) {
    await control.click()
    return
  }
  if (await control.evaluate((el) => Boolean(el.closest('#se-actions-menu')))) {
    await page.locator('#se-actions-button').click()
    await control.click()
    return
  }
  // Bold and italic (lot Texte): out of the inspector, in the contextual bar.
  if (await control.evaluate((el) => Boolean(el.closest('.se-offstage')))) {
    await page.locator(`#se-context-bar [data-entry="verb:${id}"]`).click()
    return
  }
  // A setting of a window of settings (stroke, text): its icon opens it.
  const settings = await control.evaluate((el) => el.closest('se-popover.se-settings')?.dataset.more ?? null)
  if (settings) {
    await page.locator(`.se-more-toggle[data-more="${settings}"]`).click()
    await control.click()
    return
  }
  // The view buttons and the history: entries of the zoom menu, which makes
  // them when it opens.
  if (await control.evaluate((el) => Boolean(el.closest('#editor_panel, #history_panel')))) {
    await page.locator('#se-zoom-button').click()
    await page.locator(`#se-zoom-menu [data-command="${id}"], #se-zoom-menu [data-mirror="${id}"]`).first().click()
    return
  }
  await control.click()
}

/**
 * Opens the "…" menu of the inspector when a control of the selection is in
 * it (canvas layout).
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function revealControl (page, id) {
  const control = page.locator(`#${id}`)
  if (await control.isVisible()) return
  if (await control.evaluate((el) => Boolean(el.closest('#se-actions-menu')))) {
    await page.locator('#se-actions-button').click()
  }
}
