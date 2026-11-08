import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

const layerNames = async (page) => {
  return page.$$eval('#layerlist tbody tr.layer td.layername', (nodes) =>
    nodes.map((n) => n.textContent.trim())
  )
}

// The name is asked in place since V3, no longer by prompt().
const answer = async (page, text) => {
  const field = page.locator('se-popover.se-ask input')
  await expect(field).toBeFocused()
  await field.fill(text)
  await field.press('Enter')
}

const toggleVisibilityFor = async (page, name) => {
  const row = page.locator('#layerlist tbody tr.layer', {
    has: page.locator('td.layername', { hasText: name })
  })
  await row.locator('td.layervis').click()
}

// The table of layers of the classic layout; the Layers tab of the canvas
// layout has its own tests (layout-v3.spec.js).
test.describe('Layers panel', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page, { query: '?layout=classic' })
    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.waitFor({ state: 'visible' })
    await panelHandle.click()
    await page.waitForSelector('#layer_new', { state: 'visible' })
  })

  test('creates, renames, toggles and deletes layers', async ({ page }) => {
    const initialNames = await layerNames(page)
    expect(initialNames.length).toBeGreaterThan(0)

    await page.click('#layer_new')
    await answer(page, 'Layer 2')
    await expect.poll(() => layerNames(page)).toContain('Layer 2')

    await page.locator('#layerlist td.layername', { hasText: 'Layer 2' }).click()
    await page.click('#layer_rename')
    await answer(page, 'Renamed Layer')
    await expect.poll(() => layerNames(page)).toContain('Renamed Layer')

    await toggleVisibilityFor(page, 'Renamed Layer')
    const visibilityClass = await page.$eval(
      '#layerlist tbody tr.layer td.layername:has-text("Renamed Layer")',
      (node) => node.parentElement?.querySelector('td.layervis')?.className || ''
    )
    expect(visibilityClass).toContain('layerinvis')

    const panelHandle = page.locator('div#sidepanel_handle').first()
    await panelHandle.click()
    await panelHandle.click()

    await page.locator('#layerlist td.layername', { hasText: 'Renamed Layer' }).click()
    await page.click('#layer_delete')
    await expect.poll(() => layerNames(page)).not.toContain('Renamed Layer')
  })
})
