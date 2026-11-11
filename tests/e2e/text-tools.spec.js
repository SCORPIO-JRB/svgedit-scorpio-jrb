import { test, expect } from './fixtures.js'
import { setSvgSource, visitAndApproveStorage, clickControl } from './helpers.js'

test.describe('Text tools', () => {
  test.beforeEach(async ({ page }) => {
    await visitAndApproveStorage(page)
  })

  test('creates and styles text', async ({ page }) => {
    await setSvgSource(page, `<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
      <g class="layer">
        <title>Layer 1</title>
        <text id="svg_1" x="200" y="200">AB</text>
      </g>
    </svg>`)

    const firstText = page.locator('#svg_1')
    await expect(firstText).toBeVisible()

    await firstText.click()
    await clickControl(page, 'tool_clone')
    await expect(page.locator('#svg_2')).toBeVisible()

    await firstText.click()
    await clickControl(page, 'tool_bold')
    await clickControl(page, 'tool_italic')
    await expect(firstText).toHaveAttribute('font-weight', 'bold')
    await expect(firstText).toHaveAttribute('font-style', 'italic')
  })
})
