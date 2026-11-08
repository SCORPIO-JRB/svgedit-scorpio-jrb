import { test, expect } from './fixtures.js'
import { visitAndApproveStorage } from './helpers.js'

test.describe('Tool selection', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('rectangle tool toggles pressed state', async ({ page }) => {
    // The Shapes menu of the toolbar (V3), the rectangle group before.
    const group = await page.evaluate(() => window.svgEditor.layout?.canvas ? '#tools_shapes' : '#tools_rect')
    const rectTool = page.locator(group)
    await expect(rectTool).not.toHaveAttribute('pressed', /./)
    await rectTool.click()
    await expect(rectTool).toHaveAttribute('pressed', /./)
  })
})
